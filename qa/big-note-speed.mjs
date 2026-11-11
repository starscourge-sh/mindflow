// How fast notes open, scroll and take typing on a real book, largest notes
// first. Run on a COPY of a book (QA_DATA), never the book itself:
//
//   cp -cR <book> <copy> && npx electron-vite build --outDir out-x
//   QA_DATA=<copy> QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/big-note-speed.mjs
//
// For the five largest notes and five ordinary ones it prints, with the load
// average beside each line: the time from the ask to the note's first words
// on the page, to the window being free again, the longest frozen stretch,
// the slowest frame while wheeling from top to bottom, the jump to the end,
// a key typed at the top, middle and end, and select all. Then the checks:
// first words within 150 ms, no frozen stretch over 100 ms after them, a
// key under 16 ms of work.
// BIG=n and SMALL=n change how many notes; ONLY=id runs one; OPEN_ONLY=1
// times the opens alone; PROF=1 prints where an open's time went.
import { DatabaseSync } from 'node:sqlite'
import { existsSync, readFileSync } from 'fs'
import { SourceMap } from 'node:module'
import { loadavg } from 'os'
import { join } from 'path'
import { sandbox } from './sandbox-lib.mjs'
import { checks } from './harness.mjs'

const { check, done } = checks()
const load = () => `load ${loadavg()[0].toFixed(1)}`
const ED = '.tiptap.ProseMirror.haligtree-editor:not(.is-line)'
const FIRST_MS = Number(process.env.FIRST_MS ?? 150)
const BLOCK_MS = Number(process.env.BLOCK_MS ?? 100)
const KEY_MS = Number(process.env.KEY_MS ?? 16)

// The notes to open, read from the copy while the app is shut.
const root = process.env.QA_DATA
if (!root) throw new Error('QA_DATA must be a copy of a book')
const shelf = existsSync(join(root, 'books.json')) ? JSON.parse(readFileSync(join(root, 'books.json'), 'utf8')) : null
const file = shelf?.last && shelf.last !== 'default' ? join(root, 'books', shelf.last, 'haligtree.db') : join(root, 'haligtree.db')
const db = new DatabaseSync(file, { readOnly: true })
const BIG = Number(process.env.BIG ?? 5), SMALL = Number(process.env.SMALL ?? 5)
const all = [
  ...db.prepare("select id, 'capture' as type, length(body) as size from captures where status = 'open' and kind = 'note' and body is not null").all(),
  ...db.prepare("select id, 'nugget' as type, length(body) as size from nuggets where body is not null").all()
].sort((a, b) => b.size - a.size)
db.close()
const ordinary = all.filter((one) => one.size > 1500 && one.size < 6000)
const notes = process.env.ONLY ? all.filter((one) => one.id.startsWith(process.env.ONLY)) : [...all.slice(0, BIG), ...ordinary.slice(0, SMALL)]

const c = await sandbox({ width: 1300, height: 900, seeded: false })
const { h, send } = c
const rows = []

/** A CPU profile of what `run` does in the window, its costliest functions printed. */
async function profiled(run) {
  if (!process.env.PROF) return run()
  const cdp = await c.electron.context().newCDPSession(h)
  await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 200 }); await cdp.send('Profiler.start')
  const out = await run()
  const { profile } = await cdp.send('Profiler.stop')
  const byId = new Map(profile.nodes.map((node) => [node.id, node]))
  const parent = new Map()
  for (const node of profile.nodes) for (const child of node.children ?? []) parent.set(child, node.id)
  const where = (node) => `${node.callFrame.functionName || '(anon)'} ${node.callFrame.url.split('/').pop()}:${node.callFrame.lineNumber + 1}:${node.callFrame.columnNumber}`
  const self = new Map(), total = new Map()
  profile.samples.forEach((id, at) => {
    const us = profile.timeDeltas[at] ?? 0
    self.set(where(byId.get(id)), (self.get(where(byId.get(id))) ?? 0) + us)
    const seen = new Set()
    for (let up = id; up; up = parent.get(up)) { const key = where(byId.get(up)); if (!seen.has(key)) (seen.add(key), total.set(key, (total.get(key) ?? 0) + us)) }
  })
  const top = (map, n) => [...map].filter(([k]) => !/^\((idle|program|root)\)/.test(k)).sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, us]) => `  ${(us / 1000).toFixed(1).padStart(7)}ms  ${k}`).join('\n')
  console.log(`--- self\n${top(self, 25)}\n--- inclusive\n${top(total, 70)}`)
  return out
}

/**
 * Where the window is stuck, when a note has not shown within STUCK seconds
 * (10): its script paused a dozen times through the debugger, each stack
 * printed with the source file and line (from the build's source maps), most
 * seen first. A hang that never ends still says what it is.
 */
const maps = new Map()
function sourceOf(url, line, column) {
  const file = url.startsWith('file://') ? decodeURIComponent(new URL(url).pathname) : null
  if (!file || !existsSync(`${file}.map`)) return `${url.split('/').pop()}:${line + 1}:${column}`
  if (!maps.has(file)) maps.set(file, new SourceMap(JSON.parse(readFileSync(`${file}.map`, 'utf8'))))
  const at = maps.get(file).findEntry(line, column)
  return at?.originalSource ? `${at.originalSource.replace(/^.*?\/(src|node_modules)\//, '$1/')}:${at.originalLine + 1}` : `${file.split('/').pop()}:${line + 1}:${column}`
}
async function whereStuck(cdp, rounds = 12) {
  const seen = new Map()
  for (let round = 0; round < rounds; round++) {
    const hit = await new Promise((done) => {
      const timer = setTimeout(() => done(null), 5000)
      cdp.once('Debugger.paused', (params) => (clearTimeout(timer), done(params)))
      cdp.send('Debugger.pause').catch(() => done(null))
    })
    if (!hit) { console.log('  (no script running: held in layout, paint or a native call)'); continue }
    const stack = hit.callFrames.slice(0, 22).map((frame) => `${frame.functionName || '(anon)'} ${sourceOf(frame.url, frame.location.lineNumber, frame.location.columnNumber)}`)
    for (const line of new Set(stack)) seen.set(line, (seen.get(line) ?? 0) + 1)
    if (round < 3) console.log(`  pause ${round + 1}:\n    ${stack.join('\n    ')}`)
    await cdp.send('Debugger.resume').catch(() => {})
    await new Promise((done) => setTimeout(done, 350))
  }
  console.log(`  seen in ${rounds} pauses:\n${[...seen].sort((a, b) => b[1] - a[1]).slice(0, 40).map(([line, n]) => `    ${String(n).padStart(2)}  ${line}`).join('\n')}`)
}
const STUCK = Number(process.env.STUCK ?? 10) * 1000
let debug = null

/** Open one note: from the ask to its first words, and to the window being free for half a second. */
async function openNote(note) {
  await h.evaluate((sel) => {
    window.__long = []
    window.__seen?.disconnect()
    window.__seen = new PerformanceObserver((list) => list.getEntries().forEach((e) => window.__long.push([e.startTime, e.duration])))
    window.__seen.observe({ type: 'longtask' })
    const before = new Set([...document.querySelectorAll(sel)].map((one) => one.editor?.state.doc))
    window.__shown = null
    window.__t0 = performance.now()
    const look = () => {
      const ed = [...document.querySelectorAll(sel)].find((one) => one.isConnected && one.editor && !before.has(one.editor.state.doc) && one.textContent.trim().length > 0 && one.getBoundingClientRect().height > 0)
      // Counted at the frame that paints them.
      if (ed) requestAnimationFrame(() => (window.__shown ??= performance.now() - window.__t0))
      else setTimeout(look, 4)
    }
    look()
  }, ED)
  if (!debug) { debug = await c.electron.context().newCDPSession(h); await debug.send('Debugger.enable') }
  await send(note.type, note.id)
  const shown = () => h.waitForFunction(() => window.__shown !== null, null, { timeout: STUCK }).then(() => true, () => false)
  if (!(await shown())) {
    console.log(`${note.type} ${note.id.slice(0, 8)}: not shown after ${STUCK / 1000} s  [${load()}]`)
    await whereStuck(debug)
    await h.waitForFunction(() => window.__shown !== null, null, { timeout: Number(process.env.GIVE_UP ?? 120) * 1000 })
  }
  await h.waitForFunction(() => {
    const last = window.__long.at(-1)
    return performance.now() - Math.max(window.__t0 + window.__shown, last ? last[0] + last[1] : 0) > 500
  }, null, { timeout: 120000, polling: 100 })
  return h.evaluate(() => {
    const long = window.__long.filter(([at]) => at + 50 >= window.__t0)
    const after = long.filter(([at]) => at >= window.__t0 + window.__shown)
    return {
      first: Math.round(window.__shown),
      free: Math.round(Math.max(window.__shown, ...long.map(([at, d]) => at + d - window.__t0))),
      longest: Math.round(Math.max(0, ...long.map(([, d]) => d))),
      after: Math.round(Math.max(0, ...after.map(([, d]) => d)))
    }
  })
}

/** The note's editor: the largest one on the page. */
const scrollerOf = `(() => { const ed = [...document.querySelectorAll(${JSON.stringify(ED)})].sort((a, b) => b.textContent.length - a.textContent.length)[0]; let box = ed.parentElement; while (box && !/auto|scroll/.test(getComputedStyle(box).overflowY)) box = box.parentElement; return { ed, box } })()`

/** Frame times while `run` goes: the slowest, and how many ran over 17 ms. */
async function frames(run) {
  await h.evaluate(() => {
    window.__frames = []; window.__framing = true
    let last = performance.now()
    const tick = (now) => { window.__frames.push(now - last); last = now; if (window.__framing) requestAnimationFrame(tick) }
    requestAnimationFrame(tick)
  })
  await run()
  await h.waitForTimeout(250)
  return h.evaluate(() => { window.__framing = false; const f = window.__frames.slice(2); return { worst: Math.round(Math.max(0, ...f)), over: f.filter((ms) => ms > 17.5).length, n: f.length } })
}

/** The work one key causes: from the keydown to the end of the frame that draws it. */
async function typed(where) {
  const spot = await h.evaluate(async ([code, where]) => {
    const { ed, box } = new Function(`return ${code}`)()
    if (box) box.scrollTo({ top: where === 'top' ? 0 : where === 'middle' ? box.scrollHeight / 2 : box.scrollHeight, behavior: 'instant' })
    await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)))
    const frame = (box ?? document.documentElement).getBoundingClientRect()
    const lines = [...ed.querySelectorAll('p, h1, h2, h3')].filter((p) => p.textContent.trim().length > 3 && !p.closest('[contenteditable="false"]'))
    const line = lines.find((p) => { const r = p.getBoundingClientRect(); return r.height && r.top >= Math.max(frame.top, 60) && r.bottom <= Math.min(frame.bottom, innerHeight) - 10 })
    if (!line) return null
    const r = line.getBoundingClientRect()
    window.__keys = []
    window.__onKey ??= (e) => { if (e.key.length !== 1) return; const t = performance.now(); requestAnimationFrame(() => { const m = new MessageChannel(); m.port1.onmessage = () => window.__keys.push(performance.now() - t); m.port2.postMessage(0) }) }
    window.addEventListener('keydown', window.__onKey, true)
    return { x: r.left + Math.min(40, r.width / 2), y: r.top + r.height / 2 }
  }, [scrollerOf, where])
  if (!spot) return null
  await h.mouse.click(spot.x, spot.y)
  await h.waitForTimeout(300)
  if (await h.evaluate((sel) => document.querySelector(sel + '[data-vim-mode="normal"]') !== null, ED)) await h.keyboard.press('i')
  for (const key of 'qwertyuiop') { await h.keyboard.press(key); await h.waitForTimeout(60) }
  await h.waitForTimeout(200)
  const out = await h.evaluate(() => { window.removeEventListener('keydown', window.__onKey, true); const k = window.__keys.slice(1); return { worst: Math.round(Math.max(0, ...k)), median: Math.round([...k].sort((a, b) => a - b)[Math.floor(k.length / 2)] ?? 0) } })
  // Taken back, so the next measure reads the note as it was.
  for (let i = 0; i < 3; i++) await h.keyboard.press('Meta+z')
  return out
}

try {
  await h.evaluate(() => window.api.haligtree('onboarding:set', { welcomed: new Date().toISOString(), newsSeen: true, welcoming: false, pageHints: false }))
  await h.evaluate(() => window.api.haligtree('settings:set', { sounds: false, hintRate: 0 }))
  await h.waitForTimeout(2500)
  console.log(`notes: ${notes.map((one) => `${one.id.slice(0, 8)} ${Math.round(one.size / 1024)} KB`).join(', ')}  (${load()})`)
  for (const note of notes) {
    const name = `${note.type} ${note.id.slice(0, 8)} ${Math.round(note.size / 1024)} KB`
    // Each opened from another place, twice: the first read, and one that was open before.
    await send('view', 'today'); await h.waitForTimeout(900)
    const cold = await profiled(() => openNote(note))
    const coldLoad = load()
    await send('view', 'today'); await h.waitForTimeout(900)
    const again = await openNote(note)
    // OPEN_ONLY=1: the opens alone, for a quick before and after.
    if (process.env.OPEN_ONLY) {
      const size = await h.evaluate((code) => { const { ed } = new Function(`return ${code}`)(); return { size: ed.editor.state.doc.content.size, blocks: ed.editor.state.doc.childCount } }, scrollerOf)
      rows.push({ name, cold, again, info: size, wheel: { worst: 0 }, jump: { worst: 0 }, keys: {}, selectAll: { worst: 0 } })
      console.log(`${name}  [${coldLoad}]  ${size.size} positions, ${size.blocks} blocks\n   open: first words ${cold.first} ms, free ${cold.free} ms, longest block ${cold.longest} ms (after words ${cold.after}); again: ${again.first} / ${again.free} / ${again.longest} (${again.after})  [${load()}]`)
      continue
    }
    const info = await h.evaluate((code) => { const { ed, box } = new Function(`return ${code}`)(); return { size: ed.editor.state.doc.content.size, blocks: ed.editor.state.doc.childCount, drawn: ed.childElementCount, tall: box?.scrollHeight ?? 0, view: box?.clientHeight ?? 0 } }, scrollerOf)
    const centre = await h.evaluate((code) => { const { box } = new Function(`return ${code}`)(); const r = (box ?? document.body).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 } }, scrollerOf)
    await h.mouse.move(centre.x, centre.y)
    const steps = Math.min(120, Math.max(8, Math.ceil(info.tall / 800)))
    const wheel = await frames(async () => { for (let i = 0; i < steps; i++) { await h.mouse.wheel(0, Math.ceil(info.tall / steps)); await h.waitForTimeout(16) } })
    const jump = await frames(() => h.evaluate((code) => { const { box } = new Function(`return ${code}`)(); box?.scrollTo({ top: 0, behavior: 'instant' }); return new Promise((done) => requestAnimationFrame(() => { box?.scrollTo({ top: box.scrollHeight, behavior: 'instant' }); requestAnimationFrame(done) })) }, scrollerOf))
    const keys = {}
    for (const where of ['top', 'middle', 'end']) keys[where] = await typed(where)
    const selectAll = await frames(async () => { await h.keyboard.press('Meta+a'); await h.waitForTimeout(200); await h.keyboard.press('ArrowLeft') })
    const row = { name, cold, again, info, wheel, jump, keys, selectAll }
    rows.push(row)
    console.log(`${name}  [${coldLoad}]\n   open: first words ${cold.first} ms, free ${cold.free} ms, longest block ${cold.longest} ms (after words ${cold.after}); again: ${again.first} / ${again.free} / ${again.longest} (${again.after})\n   doc ${info.size} positions, ${info.blocks} blocks, ${info.drawn} drawn, ${info.tall}px tall\n   wheel: worst frame ${wheel.worst} ms, ${wheel.over}/${wheel.n} over 17; jump to end: worst ${jump.worst} ms\n   key: top ${JSON.stringify(keys.top)}, middle ${JSON.stringify(keys.middle)}, end ${JSON.stringify(keys.end)}; select all: worst frame ${selectAll.worst} ms  [${load()}]`)
  }
  // Between the two biggest, back and forth.
  if (notes.length > 1 && !process.env.ONLY) {
    const swaps = []
    for (let i = 0; i < 4; i++) swaps.push(await openNote(notes[i % 2]))
    console.log(`switching between the two biggest: first words ${swaps.map((one) => one.first).join(', ')} ms; longest block ${swaps.map((one) => one.longest).join(', ')} ms  [${load()}]`)
    check(`switching between the two biggest notes shows words within ${FIRST_MS} ms`, swaps.every((one) => one.first <= FIRST_MS), swaps.map((one) => one.first).join(', '))
  }
  const worst = (pick) => rows.reduce((best, row) => (pick(row) > pick(best) ? row : best), rows[0])
  const say = (row, pick) => `${pick(row)} ms on ${row.name}`
  const first = (row) => Math.max(row.cold.first, row.again.first), block = (row) => Math.max(row.cold.after, row.again.after), all = (row) => Math.max(row.cold.longest, row.again.longest)
  const key = (row) => Math.max(0, ...Object.values(row.keys).filter(Boolean).map((one) => one.median))
  check(`every note shows its first words within ${FIRST_MS} ms`, first(worst(first)) <= FIRST_MS, say(worst(first), first))
  check(`no open blocks the window over ${BLOCK_MS} ms`, all(worst(all)) <= BLOCK_MS, `${say(worst(all), all)}; after the words ${say(worst(block), block)}`)
  check('wheeling top to bottom, no frame over 34 ms', worst((row) => row.wheel.worst).wheel.worst <= 34, say(worst((row) => row.wheel.worst), (row) => row.wheel.worst))
  check('the jump to the end draws within 100 ms', worst((row) => row.jump.worst).jump.worst <= 100, say(worst((row) => row.jump.worst), (row) => row.jump.worst))
  check(`a key costs under ${KEY_MS} ms`, key(worst(key)) <= KEY_MS, say(worst(key), key))
  check('select all draws within 100 ms', worst((row) => row.selectAll.worst).selectAll.worst <= 100, say(worst((row) => row.selectAll.worst), (row) => row.selectAll.worst))
  check('no page errors', !c.errors.length, c.errors.slice(0, 3).join(' | '))
} finally {
  await c.close()
}
done()
