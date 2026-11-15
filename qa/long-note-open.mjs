// How the largest note of a book opens when its row is pressed, and how one fling over it goes. Run on a COPY
// of a book (QA_DATA), never the book itself, through the timing queue:
//
//   QA_DATA=<copy> QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/long-note-open.mjs
//
// The note's row in the Inbox is pressed with a real pointer, twice: the first time in this run, and again after
// leaving for the Inbox. For each it prints, from the pointer going down: the note's first words painted (the
// task after the frame that drew them, so the frame's own layout is counted), the editor itself on the page, the
// window free again (the end of the last frozen stretch), and the longest frozen stretch. Then one fling down
// and one up (real wheel events with momentum): each frame's time, and how many sample points down the screen
// showed no drawn block. FIRST_MS (150) is the bar for first words; SHOTS=<folder> keeps a frame every 16 to 50 ms
// through the second open; OPENS=n opens it n times; THEME=dark opens it in the dark look.
import { DatabaseSync } from 'node:sqlite'
import { existsSync, mkdirSync, readFileSync } from 'fs'
import { loadavg } from 'os'
import { join } from 'path'
import { sandbox } from './sandbox-lib.mjs'
import { checks } from './harness.mjs'

const { check, done } = checks()
const SEL = '.tiptap.ProseMirror.haligtree-editor:not(.is-line), [data-first-screen]'
const FIRST_MS = Number(process.env.FIRST_MS ?? 150)
const OPENS = Number(process.env.OPENS ?? 2)
const SHOTS = process.env.SHOTS ?? null
const root = process.env.QA_DATA
if (!root) throw new Error('QA_DATA must be a copy of a book')
const shelf = existsSync(join(root, 'books.json')) ? JSON.parse(readFileSync(join(root, 'books.json'), 'utf8')) : null
const file = shelf?.last && shelf.last !== 'default' ? join(root, 'books', shelf.last, 'haligtree.db') : join(root, 'haligtree.db')
const db = new DatabaseSync(file, { readOnly: true })
const note = process.env.ONLY
  ? db.prepare("select id, body from captures where id like ? and body is not null").get(`${process.env.ONLY}%`)
  : db.prepare("select id, body from captures where status = 'open' and kind = 'note' and body is not null order by length(body) desc limit 1").get()
db.close()
const stored = JSON.parse(note.body)
const wordsOf = (block) => (block.content ?? []).map((part) => part.text ?? '').join('')
const words = wordsOf(stored.content.find((block) => wordsOf(block).trim().length >= 12) ?? stored.content[0]).trim().slice(0, 16)
const load = () => `load ${loadavg()[0].toFixed(1)}`
console.log(`note ${note.id.slice(0, 8)}: ${stored.content.length} blocks, ${note.body.length} characters stored; its first words "${words}"  (${load()})`)

const c = await sandbox({ width: 1300, height: 900, seeded: false })
const { h, send, electron } = c

/** The note's row in the Inbox, scrolled to: where to press, or null. */
const rowOf = () => h.evaluate(async (id) => {
  const frame = () => new Promise((next) => requestAnimationFrame(() => requestAnimationFrame(next)))
  const find = () => document.querySelector(`[data-row][data-id="${id}"]`)
  let box = document.querySelector('[data-row]')?.parentElement ?? null
  while (box && !/auto|scroll/.test(getComputedStyle(box).overflowY)) box = box.parentElement
  for (let i = 0; i < 400 && !find() && box && box.scrollTop + box.clientHeight < box.scrollHeight - 2; i++) { box.scrollBy({ top: box.clientHeight * 0.8, behavior: 'instant' }); await frame() }
  const row = find()
  if (!row) return null
  row.scrollIntoView({ block: 'center', behavior: 'instant' })
  await frame()
  const r = row.getBoundingClientRect()
  // Another row on show, to open first when this note is the one already open beside the list.
  const other = [...document.querySelectorAll('[data-row][data-id]')].find((one) => one !== row && one.getBoundingClientRect().height > 0 && one.getBoundingClientRect().top > 80 && one.getBoundingClientRect().bottom < innerHeight - 20)
  const o = other?.getBoundingClientRect()
  return { x: r.left + r.width / 2, y: r.top + r.height / 2, open: row.hasAttribute('data-open'), other: o ? { x: o.left + o.width / 2, y: o.top + o.height / 2 } : null }
}, note.id)

/** One press on the row: when the first words were painted, when the editor was, when the window was free. */
async function press(name, filmed) {
  await send('view', 'inbox')
  await h.waitForTimeout(1500)
  const spot = await rowOf()
  if (!spot) throw new Error('The note has no row in the Inbox')
  if (spot.open && spot.other) { await h.mouse.click(spot.other.x, spot.other.y); await h.waitForTimeout(1500) }
  await h.mouse.move(spot.x, spot.y)
  await h.waitForTimeout(400)
  await h.evaluate(([sel, words]) => {
    window.__long = []
    window.__seen?.disconnect()
    window.__seen = new PerformanceObserver((list) => list.getEntries().forEach((e) => window.__long.push([e.startTime, e.duration])))
    window.__seen.observe({ type: 'longtask' })
    const had = new Set([...document.querySelectorAll(sel)].filter((one) => one.getBoundingClientRect().height > 0))
    window.__shown = null
    window.__editor = null
    window.__t0 = null
    // Counted in the task after the frame that draws them: that frame's own styles, layout and paint are in the number.
    const painted = (set) => requestAnimationFrame(() => { const m = new MessageChannel(); m.port1.onmessage = () => set(performance.now() - window.__t0); m.port2.postMessage(0) })
    let saidWords = false
    let saidEditor = false
    window.addEventListener('pointerdown', () => {
      window.__t0 = performance.now()
      const look = () => {
        const now = [...document.querySelectorAll(sel)].filter((one) => !had.has(one) && one.isConnected && one.getBoundingClientRect().height > 0 && one.textContent.includes(words))
        if (now.length && !saidWords) { saidWords = true; painted((ms) => (window.__shown = ms)) }
        if (now.some((one) => one.editor) && !saidEditor) { saidEditor = true; painted((ms) => (window.__editor = ms)) }
        if (!saidEditor) setTimeout(look, 2)
      }
      look()
    }, { capture: true, once: true })
  }, [SEL, words])
  let going = !!filmed
  let shot = 0
  const started = Date.now()
  const taking = filmed ? (async () => {
    mkdirSync(SHOTS, { recursive: true })
    while (going && Date.now() - started < 2500) {
      const at = Date.now()
      await h.screenshot({ path: join(SHOTS, `${name}-${String(++shot).padStart(3, '0')}-${String(at - started).padStart(4, '0')}ms.png`) }).catch(() => {})
    }
  })() : null
  await h.mouse.click(spot.x, spot.y)
  await h.waitForFunction(() => window.__editor !== null, null, { timeout: 45000 })
  await h.waitForFunction(() => { const last = window.__long.at(-1); return performance.now() - Math.max(window.__t0 + window.__editor, last ? last[0] + last[1] : 0) > 600 }, null, { timeout: 120000, polling: 100 })
  going = false
  await taking
  return h.evaluate(() => {
    const long = window.__long.filter(([at, d]) => at + d >= window.__t0)
    const after = long.filter(([at]) => at >= window.__t0 + window.__shown)
    return {
      first: Math.round(window.__shown), editor: Math.round(window.__editor),
      free: Math.round(Math.max(window.__shown, ...long.map(([at, d]) => at + d - window.__t0))),
      longest: Math.round(Math.max(0, ...long.map(([, d]) => d))),
      after: Math.round(Math.max(0, ...after.map(([, d]) => d))),
      frozen: Math.round(long.reduce((sum, [, d]) => sum + d, 0)),
    }
  })
}

// A wheel event as the trackpad sends it (exact pixels), from the main process so their timing is the probe's own.
let sign = -1
const wheelOnce = (x, y, dy) => electron.evaluate(({ BrowserWindow }, [x, y, dy]) => {
  const win = BrowserWindow.getAllWindows().find((one) => one.webContents.getURL().includes('view=home'))
  win.webContents.sendInputEvent({ type: 'mouseWheel', x, y, deltaX: 0, deltaY: dy, hasPreciseScrollingDeltas: true, canScroll: true })
}, [x, y, dy])
/** A push of the fingers and its glide: the speed rises for 80 ms to `speed` px a second, then dies away. `way` 1 is down. */
const fling = (x, y, speed, way) => electron.evaluate(async ({ BrowserWindow }, [x, y, speed, way, sign]) => {
  const win = BrowserWindow.getAllWindows().find((one) => one.webContents.getURL().includes('view=home'))
  const started = performance.now()
  let last = started
  for (;;) {
    await new Promise((next) => setTimeout(next, 8))
    const now = performance.now()
    const t = now - started
    const v = t < 80 ? speed * (t / 80) : speed * Math.exp(-(t - 80) / 325)
    if (t >= 80 && v < 40) break
    const by = (v * (now - last)) / 1000
    last = now
    if (by < 0.5) continue
    win.webContents.sendInputEvent({ type: 'mouseWheel', x, y, deltaX: 0, deltaY: sign * way * by, hasPreciseScrollingDeltas: true, canScroll: true })
  }
}, [x, y, speed, way, sign])

/** Each frame while `run` goes and for a second after: its time, the work in it, and what the screen showed. */
async function frames(run) {
  await h.evaluate((sel) => {
    const ed = [...document.querySelectorAll(sel)].filter((one) => one.editor).sort((a, b) => b.editor.state.doc.childCount - a.editor.state.doc.childCount)[0]
    let box = ed.parentElement
    while (box && !/auto|scroll/.test(getComputedStyle(box).overflowY)) box = box.parentElement
    const out = { gaps: [], works: [], empty: 0, standins: 0, points: 0, from: box.scrollTop, to: 0 }
    window.__fl = out
    window.__flOn = true
    let last = 0
    let open = 0
    const channel = new MessageChannel()
    channel.port1.onmessage = () => out.works.push(performance.now() - open)
    const tick = (now) => {
      if (!window.__flOn) return
      if (last) out.gaps.push(now - last)
      last = now
      open = performance.now()
      const view = box.getBoundingClientRect()
      const x = ed.getBoundingClientRect().left + Math.min(240, ed.clientWidth / 2)
      // Six points down the screen: is a drawn block of the note under each? A block the browser has left out as far
      // away answers for itself at a point; a drawn one answers with a part of its own (a card, a cell) or a letter
      // of its words. The air between two blocks is looked past, and a block with no words (a rule, a picture)
      // counts as drawn.
      const blockAt = (y) => document.elementsFromPoint(x, y).find((one) => one.parentElement === ed)
      const span = ed.getBoundingClientRect()
      for (const share of [0.04, 0.2, 0.4, 0.6, 0.8, 0.96]) {
        const y = view.top + view.height * share
        const block = blockAt(y)
        out.points++
        if (!block) { if (span.bottom > y && span.top < y && !blockAt(y - 14) && !blockAt(y + 14)) out.empty++ }
        else if (block.hasAttribute('data-far')) out.standins++
        else if (block.textContent.trim()) {
          const part = document.elementFromPoint(x, y)
          const at = part && part !== block && block.contains(part) ? null : document.caretRangeFromPoint(x, y)
          if (!(part && part !== block && block.contains(part)) && (!at || at.startContainer === block || !block.contains(at.startContainer))) out.empty++
        }
      }
      out.to = box.scrollTop
      channel.port2.postMessage(0)
      requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  }, SEL)
  await run()
  await h.waitForTimeout(1000)
  return h.evaluate(() => {
    window.__flOn = false
    const { gaps, works, empty, standins, points, from, to } = window.__fl
    const g = gaps.slice(2)
    return { n: g.length, worst: Math.round(Math.max(0, ...g) * 10) / 10, over: g.filter((ms) => ms > 17.5).length, work: Math.round(Math.max(0, ...works) * 10) / 10, empty, standins, points, went: Math.round(to - from) }
  })
}
const say = (f) => `${f.n} frames, longest ${f.worst} ms (${f.over} over 17.5 ms), most work in one ${f.work} ms; no drawn block under ${f.empty} of ${f.points} points${f.standins ? `, a stand-in under ${f.standins}` : ''}; went ${f.went}px`

try {
  await h.evaluate(() => window.api.haligtree('onboarding:set', { welcomed: new Date().toISOString(), newsSeen: true, welcoming: false, pageHints: false }))
  await h.evaluate(() => window.api.haligtree('settings:set', { sounds: false, hintRate: 0 }))
  // THEME=dark: the same in the dark look (its frames read by eye in both).
  if (process.env.THEME) await c.look(process.env.THEME)
  await h.waitForTimeout(2500)
  const opens = []
  for (let i = 0; i < OPENS; i++) {
    const name = i === 0 ? 'first press' : i === 1 ? 'second press' : `press ${i + 1}`
    const one = await press(name.replace(' ', '-'), SHOTS && i === 1)
    opens.push(one)
    console.log(`${name}: first words ${one.first} ms after the pointer went down, the editor ${one.editor} ms, window free after ${one.free} ms; longest frozen stretch ${one.longest} ms (${one.after} ms after the words), frozen ${one.frozen} ms in all  (${load()})`)
  }
  check(`a press on the note's row paints its first words within ${FIRST_MS} ms`, opens.every((one) => one.first <= FIRST_MS), opens.map((one) => `${one.first} ms`).join(', '))
  check('no frozen stretch over 100 ms after the first words', opens.every((one) => one.after <= 100), opens.map((one) => `${one.after} ms`).join(', '))
  if (!process.env.OPEN_ONLY) {
    await h.waitForTimeout(1200)
    const at = await h.evaluate((sel) => {
      const ed = [...document.querySelectorAll(sel)].filter((one) => one.editor).sort((a, b) => b.editor.state.doc.childCount - a.editor.state.doc.childCount)[0]
      let box = ed.parentElement
      while (box && !/auto|scroll/.test(getComputedStyle(box).overflowY)) box = box.parentElement
      const r = box.getBoundingClientRect()
      return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2), top: box.scrollTop, tall: box.scrollHeight, blocks: ed.childElementCount }
    }, SEL)
    const top = () => h.evaluate((sel) => { const ed = [...document.querySelectorAll(sel)].filter((one) => one.editor).sort((a, b) => b.editor.state.doc.childCount - a.editor.state.doc.childCount)[0]; let box = ed.parentElement; while (box && !/auto|scroll/.test(getComputedStyle(box).overflowY)) box = box.parentElement; return box.scrollTop }, SEL)
    await wheelOnce(at.x, at.y, -60)
    await h.waitForTimeout(300)
    if ((await top()) <= at.top) sign = 1
    console.log(`the note: ${at.blocks} elements, ${at.tall}px tall`)
    // PROF=1: where the page's time goes during one more fling down, the browser's own share (styles, layout) beside the script's.
    if (process.env.PROF) {
      const cdp = await c.electron.context().newCDPSession(h)
      await cdp.send('Performance.enable')
      const spent = async () => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((one) => [one.name, one.value]))
      const was = await spent()
      await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 200 }); await cdp.send('Profiler.start')
      await fling(at.x, at.y, 12000, 1)
      await h.waitForTimeout(600)
      const { profile } = await cdp.send('Profiler.stop')
      const now = await spent()
      console.log(`--- a fling down, in all: script ${Math.round((now.ScriptDuration - was.ScriptDuration) * 1000)} ms, styles ${Math.round((now.RecalcStyleDuration - was.RecalcStyleDuration) * 1000)} ms (${now.RecalcStyleCount - was.RecalcStyleCount} times), layout ${Math.round((now.LayoutDuration - was.LayoutDuration) * 1000)} ms (${now.LayoutCount - was.LayoutCount} times), tasks ${Math.round((now.TaskDuration - was.TaskDuration) * 1000)} ms`)
      const byId = new Map(profile.nodes.map((node) => [node.id, node]))
      const parent = new Map()
      for (const node of profile.nodes) for (const child of node.children ?? []) parent.set(child, node.id)
      const where = (node) => `${node.callFrame.functionName || '(anon)'} ${node.callFrame.url.split('/').pop()}:${node.callFrame.lineNumber + 1}:${node.callFrame.columnNumber}`
      const self = new Map(), total = new Map()
      profile.samples.forEach((id, i) => {
        const us = profile.timeDeltas[i] ?? 0
        self.set(where(byId.get(id)), (self.get(where(byId.get(id))) ?? 0) + us)
        const seen = new Set()
        for (let up = id; up; up = parent.get(up)) { const key = where(byId.get(up)); if (!seen.has(key)) (seen.add(key), total.set(key, (total.get(key) ?? 0) + us)) }
      })
      const top = (map, n) => [...map].filter(([k]) => !/^\((idle|program|root)\)/.test(k)).sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, us]) => `  ${(us / 1000).toFixed(1).padStart(7)}ms  ${k}`).join('\n')
      console.log(`--- self\n${top(self, 14)}\n--- inclusive\n${top(total, 30)}`)
    }
    // TRACE=<file>: a Chromium trace of every process (main thread, compositor, raster, GPU) through the fling down
    // whose frames are counted, kept in that file, to tell what a late frame was made of.
    const TRACE = process.env.TRACE
    if (TRACE) await electron.evaluate(({ contentTracing }) => contentTracing.startRecording({
      included_categories: ['toplevel', 'devtools.timeline', 'disabled-by-default-devtools.timeline', 'disabled-by-default-devtools.timeline.frame', 'benchmark', 'cc', 'viz', 'gpu', 'v8', 'disabled-by-default-v8.gc', 'blink', 'input', 'latencyInfo'],
      trace_buffer_size_in_kb: 400000,
    }))
    const down = await frames(() => fling(at.x, at.y, 12000, 1))
    if (TRACE) console.log(`trace of the fling down: ${await electron.evaluate(({ contentTracing }, file) => contentTracing.stopRecording(file), TRACE)}`)
    console.log(`fling down at 12000 px/s: ${say(down)}  (${load()})`)
    const up = await frames(() => fling(at.x, at.y, 12000, -1))
    console.log(`fling up   at 12000 px/s: ${say(up)}  (${load()})`)
    check('a fling really moves the note', down.went > 200 && up.went < -200, `${down.went}px, ${up.went}px`)
    check('no frame of the fling comes more than 17.5 ms after the last', down.over + up.over === 0, `${down.over} down, ${up.over} up; longest ${Math.max(down.worst, up.worst)} ms`)
    check('every frame of the fling shows the note: a drawn block under every point', down.empty + up.empty === 0, `${down.empty} down, ${up.empty} up`)
  }
  // A picture a site will not hand to another page, or one that is gone, is the site's answer, not a fault of the page.
  const faults = c.errors.filter((line) => !/ERR_FILE_NOT_FOUND|ERR_BLOCKED_BY_RESPONSE|status of 40\d/.test(line))
  check('no page errors', !faults.length, faults.slice(0, 3).join(' | '))
} finally {
  await c.close()
}
done()
