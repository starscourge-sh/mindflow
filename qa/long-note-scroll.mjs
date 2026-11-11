// A long note scrolls and jumps like a short one. Run on a COPY of a book
// (QA_DATA), never the book itself, on its largest note:
//
//   QA_DATA=<copy> QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 PART=fling node qa/long-note-scroll.mjs
//
// PART=fling  real wheel events with momentum (a finger's push, then the glide dying away), at several speeds,
//             down and back up, then a run of pushes one on another from the top toward the bottom and back.
//             Each frame of each fling is read: how long it took, where the first block that starts on the screen
//             is, whether a drawn block of the note is under each of six points down the screen, how many blocks
//             on it are not drawn (left out by the browser as far away, or a stand-in). Checked: no long frame;
//             the words only ever move the way the fingers went; no frame with an undrawn place; it comes to rest
//             once; the first visible line does not move as blocks are drawn; the scrollbar's thumb does not jump.
// PART=jumps  ⌘↓ and ⌘↑, find's next and previous into far matches, a link to a far heading, the contents rail,
//             the thumb dragged far, Page Down held: each lands in one step and stays.
// PART=caret  a click and typing in a far block, ⌘Z bringing the view back to them, a selection carried over
//             five screens by ⇧-click, ⌘A, and what each would copy; leaving mid-fling and coming back.
// SMOOTH=off  turns "Smooth scrolling" off in Settings first. ONLY_SPEED=12000 flings at one speed.
import { DatabaseSync } from 'node:sqlite'
import { existsSync, mkdirSync, readFileSync } from 'fs'
import { loadavg } from 'os'
import { join } from 'path'
import { sandbox } from './sandbox-lib.mjs'
import { checks } from './harness.mjs'

const { check, done } = checks()
const ED = '.tiptap.ProseMirror.haligtree-editor:not(.is-line)'
const root = process.env.QA_DATA
if (!root) throw new Error('QA_DATA must be a copy of a book')
const PART = process.env.PART ?? 'fling'
const SHOTS = process.env.SHOTS ?? null
const shelf = existsSync(join(root, 'books.json')) ? JSON.parse(readFileSync(join(root, 'books.json'), 'utf8')) : null
const file = shelf?.last && shelf.last !== 'default' ? join(root, 'books', shelf.last, 'haligtree.db') : join(root, 'haligtree.db')
const db = new DatabaseSync(file, { readOnly: true })
const note = db.prepare("select id, body from captures where status = 'open' and kind = 'note' and body is not null order by length(body) desc limit 1").get()
db.close()
const original = JSON.parse(note.body)
const wordsOf = (block) => (block.content ?? []).map((part) => part.text ?? '').join('').trim()
const named = new Map()
for (const block of original.content) if (block.type === 'heading') named.set(wordsOf(block).toLowerCase(), (named.get(wordsOf(block).toLowerCase()) ?? 0) + 1)
const headingAt = original.content.findLastIndex((block, at) => at > original.content.length / 2 && block.type === 'heading' && wordsOf(block).length > 5 && named.get(wordsOf(block).toLowerCase()) === 1)
const headingText = headingAt < 0 ? null : wordsOf(original.content[headingAt])
const load = () => `load ${loadavg()[0].toFixed(1)}`
console.log(`note ${note.id.slice(0, 8)}: ${original.content.length} blocks, part ${PART}, smooth scrolling ${process.env.SMOOTH === 'off' ? 'off' : 'on'}  (${load()})`)

const c = await sandbox({ width: 1300, height: 900, seeded: false })
const { h, send, electron } = c
const opened = (count) => h.waitForFunction(([sel, count]) => {
  const ed = [...document.querySelectorAll(sel)].filter((one) => one.editor).sort((a, b) => b.editor.state.doc.childCount - a.editor.state.doc.childCount)[0]
  return !!ed && ed.isConnected && ed.editor.state.doc.childCount >= count && ed.textContent.trim().length > 0
}, [ED, count], { timeout: 120000 })

/** What the page is asked through: the note's editor, its scroller, and a reader of each frame. */
const install = () => h.evaluate((sel) => {
  const ed = () => [...document.querySelectorAll(sel)].filter((one) => one.editor).sort((a, b) => b.editor.state.doc.childCount - a.editor.state.doc.childCount)[0]
  const boxOf = (e) => { let box = e.parentElement; while (box && !/auto|scroll/.test(getComputedStyle(box).overflowY)) box = box.parentElement; return box }
  const blockAt = (e, x, y) => document.elementsFromPoint(x, y).find((one) => one.parentElement === e) ?? null
  // Drawn: not a stand-in, and not left out by the browser as far from the screen. A block the browser has left
  // out answers for itself at a point (its insides are not there to be found); a drawn one answers with a part of
  // its own (a card, a cell, a list item) or with a letter of its words. A block with no words at all (a rule, a
  // picture) cannot be told, and counts as drawn.
  const drawn = (block, x, y) => {
    if (block.hasAttribute('data-far')) return false
    if (!block.textContent.trim()) return true
    const rect = block.getBoundingClientRect()
    x ??= rect.left + Math.min(60, rect.width / 2)
    y ??= Math.max(rect.top + Math.min(8, rect.height / 2), 0)
    const part = document.elementFromPoint(x, y)
    if (part && part !== block && block.contains(part)) return true
    const at = document.caretRangeFromPoint(x, y)
    return !!at && at.startContainer !== block && block.contains(at.startContainer)
  }
  const indexOf = (e, block) => Array.prototype.indexOf.call(e.children, block)
  // Where the letter `off` letters into block `i` is, by its top.
  const topOf = (e, i, off) => {
    const block = e.children[i]
    if (!block) return null
    const walk = document.createTreeWalker(block, NodeFilter.SHOW_TEXT)
    let left = off
    for (let node = walk.nextNode(); node; node = walk.nextNode()) {
      if (left < node.length) {
        const range = document.createRange()
        range.setStart(node, left)
        range.setEnd(node, Math.min(node.length, left + 1))
        const rect = range.getClientRects()[0]
        return rect ? rect.top : null
      }
      left -= node.length
    }
    return null
  }
  // The first line of words on the screen: which block, how many letters in, and where its top is.
  const lineAt = (e, x, y) => {
    const range = document.caretRangeFromPoint(x, y)
    if (!range || range.startContainer.nodeType !== 3) return null
    let block = range.startContainer
    while (block && block.parentElement !== e) block = block.parentElement
    if (!block) return null
    const walk = document.createTreeWalker(block, NodeFilter.SHOW_TEXT)
    let off = 0
    for (let node = walk.nextNode(); node && node !== range.startContainer; node = walk.nextNode()) off += node.length
    off += range.startOffset
    const i = indexOf(e, block)
    const top = topOf(e, i, off)
    return top === null ? null : { i, off, top, far: block.hasAttribute('data-far') }
  }
  let frames = []
  let swaps = []
  let marks = {}
  let on = false
  let open = null
  let line = null
  const channel = new MessageChannel()
  channel.port1.onmessage = () => { if (open) { open[2] = performance.now() - open[0]; open = null } }
  const tick = (now) => {
    if (!on) return
    const e = ed()
    const box = e && boxOf(e)
    if (!e || !box) return void requestAnimationFrame(tick)
    const view = box.getBoundingClientRect()
    const x = e.getBoundingClientRect().left + Math.min(240, e.clientWidth / 2)
    let words = 0
    let holes = 0
    const span = e.getBoundingClientRect()
    // The block at the top of the screen: looked for a little further down when the very top is the air between two.
    let first = blockAt(e, x, view.top + 3) ?? blockAt(e, x, view.top + 14) ?? blockAt(e, x, view.top + 28) ?? blockAt(e, x, view.top + 48)
    for (const share of [0.03, 0.17, 0.36, 0.55, 0.74, 0.95]) {
      const y = view.top + view.height * share
      const block = blockAt(e, x, y)
      // A place inside the note with no drawn block under it: empty space where its words belong (the air between two blocks is looked past).
      if (!block) { if (span.top < y && span.bottom > y && !blockAt(e, x, y - 14) && !blockAt(e, x, y + 14)) holes++; continue }
      first ??= block
      if (!drawn(block, x, y)) { holes++; continue }
      if (block.textContent.trim().length || block.querySelector('img, table, iframe, svg, canvas, video') || block.getBoundingClientRect().height > 60) words++
    }
    // The first block that starts on the screen, and every stand-in on the screen.
    let anchor = first
    if (anchor && anchor.getBoundingClientRect().top < view.top - 0.5 && anchor.nextElementSibling) anchor = anchor.nextElementSibling
    let far = 0
    for (let block = first; block; block = block.nextElementSibling) {
      const rect = block.getBoundingClientRect()
      if (rect.top >= view.bottom) break
      if (rect.height && rect.bottom > view.top + 2 && !drawn(block, x, Math.min(view.bottom - 2, Math.max(view.top + 2, rect.top + Math.min(8, rect.height / 2))))) far++
    }
    // The first line of words, held from the frame before: where the same letter is now that its block is real.
    if (line && line.far) {
      const block = e.children[line.i]
      if (block && !block.hasAttribute('data-far')) {
        const top = topOf(e, line.i, line.off)
        if (top !== null) swaps.push([now, top - line.top, line.i])
      }
    }
    line = lineAt(e, x, view.top + 8)
    const last = frames[frames.length - 1]
    const frame = [now, last ? now - last[0] : 0, 0, box.scrollTop, box.scrollHeight, anchor ? indexOf(e, anchor) : -1, anchor ? anchor.getBoundingClientRect().top : 0, words, far, box.clientHeight, holes]
    frames.push(frame)
    open = frame
    channel.port2.postMessage(0)
    requestAnimationFrame(tick)
  }
  window.__ln = {
    ed,
    box: () => boxOf(ed()),
    start: () => { frames = []; swaps = []; marks = {}; line = null; on = true; requestAnimationFrame(tick) },
    mark: (name) => { marks[name] = performance.now() },
    stop: () => { on = false; return { frames, swaps, marks } },
    state: () => {
      const e = ed()
      const box = boxOf(e)
      const view = box.getBoundingClientRect()
      const x = e.getBoundingClientRect().left + Math.min(240, e.clientWidth / 2)
      const first = blockAt(e, x, view.top + 30) ?? blockAt(e, x, view.top + 80)
      let far = 0
      for (let block = first; block; block = block.nextElementSibling) {
        const rect = block.getBoundingClientRect()
        if (rect.top >= view.bottom) break
        if (rect.height && rect.bottom > view.top + 2 && !drawn(block, x, Math.min(view.bottom - 2, Math.max(view.top + 2, rect.top + Math.min(8, rect.height / 2))))) far++
      }
      const shells = e.querySelectorAll(':scope > [data-far]').length
      return { top: Math.round(box.scrollTop), tall: box.scrollHeight, height: box.clientHeight, first: first ? indexOf(e, first) : -1, firstTop: first ? Math.round(first.getBoundingClientRect().top - view.top) : 0, far, blocks: e.childElementCount, shells, smooth: getComputedStyle(box).scrollBehavior, caret: e.editor.state.selection.$head.index(0), x: Math.round(view.left + view.width / 2), y: Math.round(view.top + view.height / 2), right: Math.round(view.right), boxTop: Math.round(view.top), boxBottom: Math.round(view.bottom) }
    },
  }
}, ED)
const state = () => h.evaluate(() => window.__ln.state())
const frame = () => h.evaluate(() => new Promise((next) => requestAnimationFrame(() => requestAnimationFrame(next))))
const answers = () => Promise.race([h.evaluate(() => 1).then(() => true, () => false), new Promise((next) => setTimeout(() => next(false), 2000))])

// A wheel event as the trackpad sends it (exact pixels), from the main process so their timing is the probe's own.
let sign = -1
const wheelOnce = (x, y, dy) => electron.evaluate(({ BrowserWindow }, [x, y, dy]) => {
  const win = BrowserWindow.getAllWindows().find((one) => one.webContents.getURL().includes('view=home'))
  win.webContents.sendInputEvent({ type: 'mouseWheel', x, y, deltaX: 0, deltaY: dy, hasPreciseScrollingDeltas: true, canScroll: true })
}, [x, y, dy])
/** A push of the fingers and its glide: the speed rises for `rise` ms to `speed` px a second, then dies away. `way` 1 is down. */
const fling = (x, y, speed, way, { rise = 80, fade = 325, hold = 0 } = {}) => electron.evaluate(async ({ BrowserWindow }, [x, y, speed, way, rise, fade, hold, sign]) => {
  const win = BrowserWindow.getAllWindows().find((one) => one.webContents.getURL().includes('view=home'))
  const started = performance.now()
  let last = started
  let sent = 0
  let events = 0
  for (;;) {
    await new Promise((next) => setTimeout(next, 8))
    const now = performance.now()
    const t = now - started
    // `hold`: stopped short while still fast, as when the next push comes before this one has died away.
    if (hold && t > hold) break
    const v = t < rise ? speed * (t / rise) : speed * Math.exp(-(t - rise) / fade)
    if (t >= rise && v < 40) break
    const by = (v * (now - last)) / 1000
    last = now
    if (by < 0.5) continue
    win.webContents.sendInputEvent({ type: 'mouseWheel', x, y, deltaX: 0, deltaY: sign * way * by, hasPreciseScrollingDeltas: true, canScroll: true })
    sent += by
    events++
  }
  return { sent: Math.round(sent), events, ms: Math.round(performance.now() - started) }
}, [x, y, speed, way, rise, fade, hold, sign])

/** One recording read: what each frame cost, which way the words went, what the screen showed, how it came to rest. */
function read({ frames, swaps, marks }, way) {
  const from = marks.start ?? frames[0]?.[0] ?? 0
  const end = marks.end ?? frames[frames.length - 1]?.[0] ?? 0
  const all = frames.filter((one) => one[0] >= from)
  const moving = all.filter((one) => one[0] <= end + 250)
  const gaps = moving.slice(1).map((one) => one[1])
  const works = moving.map((one) => one[2])
  let back = 0
  let worstBack = 0
  let blank = 0
  let moved = []
  for (let k = 1; k < all.length; k++) {
    const [, , , top, tall, i, y, words] = all[k]
    const before = all[k - 1]
    if (!words) blank++
    const same = i === before[5]
    const step = i < 0 || before[5] < 0 ? 0 : same ? y - before[6] : (i - before[5]) * -1000
    // Down: the block that starts the screen goes up it, or a later block takes its place. Up: the other way.
    if (way && all[k][0] <= end + 250 && step * way > 1.5) { back++; worstBack = Math.max(worstBack, Math.abs(same ? step : 999)) }
    moved.push(i >= 0 && before[5] >= 0 && (!same || Math.abs(step) > 0.5) ? 1 : 0)
    void top; void tall
  }
  // The last frame anything moved in: the page is at rest from the next one.
  let lastMove = -1
  for (let k = moved.length - 1; k >= 0; k--) if (moved[k]) { lastMove = k; break }
  const rest = all[Math.min(all.length - 1, lastMove + 2)]?.[0] ?? end
  // Came to rest, then moved again: a still stretch of 120 ms or more after the fingers left, with movement after it.
  let rests = 0
  let still = 0
  for (let k = 0; k < moved.length; k++) {
    if (all[k + 1][0] < end) continue
    if (!moved[k]) still += all[k + 1][1]
    else { if (still >= 120) rests++; still = 0 }
  }
  let lastFar = null
  for (const one of all) if (one[8] > 0) lastFar = one[0]
  const realAfter = lastFar === null || lastFar < rest ? 0 : Math.round(lastFar - rest + 17)
  const after = swaps.filter((one) => one[0] >= end)
  const lineShift = after.reduce((most, one) => Math.max(most, Math.abs(one[1])), 0)
  // The thumb, in pixels down its track.
  const thumb = (one) => (one[3] / Math.max(1, one[4] - one[9])) * one[9]
  const settled = all.filter((one) => one[0] >= rest)
  const thumbJump = settled.length ? Math.max(...settled.map((one) => Math.abs(thumb(one) - thumb(settled[0])))) : 0
  let thumbBack = 0
  for (let k = 1; k < moving.length; k++) if (way && (thumb(moving[k]) - thumb(moving[k - 1])) * way < -1) thumbBack++
  return {
    frames: moving.length,
    worstGap: Math.round(Math.max(0, ...gaps) * 10) / 10,
    over: gaps.filter((ms) => ms > 17.5).length,
    worstWork: Math.round(Math.max(0, ...works) * 10) / 10,
    worksOver: works.filter((ms) => ms > 16).length,
    back, worstBack: Math.round(worstBack), blank, holes: all.reduce((sum, one) => sum + (one[10] ?? 0), 0), points: all.length * 6, rests, realAfter, swaps: after.length, lineShift: Math.round(lineShift * 10) / 10, thumbJump: Math.round(thumbJump * 10) / 10, thumbBack,
    farMost: Math.max(0, ...all.map((one) => one[8])),
    went: all.length ? Math.round(all[all.length - 1][3] - all[0][3]) : 0,
  }
}
const say = (r) => `${r.frames} frames, longest ${r.worstGap} ms apart (${r.over} over 17.5), most work in one ${r.worstWork} ms (${r.worksOver} over 16); went back ${r.back} times${r.back ? ` (by up to ${r.worstBack}px)` : ''}; blank frames ${r.blank}, no drawn block under ${r.holes} of ${r.points} points; undrawn blocks on screen at most ${r.farMost}, all drawn ${r.realAfter} ms after rest; first line moved ${r.lineShift}px over ${r.swaps} swaps; thumb moved ${r.thumbJump}px at rest, back ${r.thumbBack}; scrolled ${r.went}px`

const record = async (run, way, settle = 1300) => {
  await h.evaluate(() => { window.__ln.start(); window.__ln.mark('start') })
  const sent = await run()
  await h.evaluate(() => window.__ln.mark('end'))
  await h.waitForTimeout(settle)
  const got = await h.evaluate(() => window.__ln.stop())
  return { ...read(got, way), sent }
}
let shot = 0
/** Frames kept as pictures while something runs, one every `every` ms, for reading by eye. */
const film = async (name, run, { every = 50, ms = 1500 } = {}) => {
  if (!SHOTS) return run()
  mkdirSync(SHOTS, { recursive: true })
  let going = true
  const taking = (async () => {
    const started = Date.now()
    while (going && Date.now() - started < ms) {
      const at = Date.now()
      await h.screenshot({ path: join(SHOTS, `${name.replace(/[^a-z0-9]+/gi, '-')}-${String(++shot).padStart(3, '0')}-${String(at - started).padStart(4, '0')}ms.png`) }).catch(() => {})
      const left = every - (Date.now() - at)
      if (left > 0) await new Promise((next) => setTimeout(next, left))
    }
  })()
  const out = await run()
  await new Promise((next) => setTimeout(next, 400))
  going = false
  await taking
  return out
}

try {
  await h.evaluate(() => window.api.haligtree('onboarding:set', { welcomed: new Date().toISOString(), newsSeen: true, welcoming: false, pageHints: false }))
  await h.evaluate((smooth) => window.api.haligtree('settings:set', { sounds: false, hintRate: 0, smoothScroll: smooth }), process.env.SMOOTH !== 'off')
  if (process.env.THEME) await c.look(process.env.THEME)
  await h.waitForTimeout(1500)
  await send('capture', note.id)
  await opened(original.content.length - 1)
  await h.waitForTimeout(1500)
  await install()
  const first = await state()
  console.log(`opened: ${first.blocks} elements, ${first.shells} stand-ins, ${first.far} blocks on screen not drawn; the scroller is ${first.tall}px tall, its own glide "${first.smooth}"  (${load()})`)
  // What drawing the page again costs with nothing changed: the least any slice of new blocks can cost.
  const wake = await h.evaluate(() => { const { view } = window.__ln.ed().editor; const times = []; for (let i = 0; i < 5; i++) { const t = performance.now(); view.updateState(view.state); times.push(Math.round((performance.now() - t) * 10) / 10) } return times })
  console.log(`drawing the page again, nothing changed: ${wake.join(', ')} ms`)
  // Which way a wheel event's sign scrolls, found by sending one.
  await wheelOnce(first.x, first.y, -60)
  await h.waitForTimeout(300)
  let probe = await state()
  if (probe.top <= first.top) {
    await wheelOnce(first.x, first.y, 60)
    await h.waitForTimeout(300)
    probe = await state()
    sign = 1
  }
  const wheels = probe.top > first.top
  check('a wheel event from the main process scrolls the note', wheels, `scroll went from ${first.top} to ${probe.top}`)
  await h.evaluate(() => window.__ln.box().scrollTo({ top: 0, behavior: 'instant' }))
  await h.waitForTimeout(800)

  if (PART === 'fling') {
    const rows = []
    for (const speed of process.env.ONLY_SPEED ? [Number(process.env.ONLY_SPEED)] : [3000, 12000, 40000]) {
      const down = await film(`down-${speed}`, () => record(() => fling(first.x, first.y, speed, 1), 1))
      console.log(`fling down at ${speed} px/s: ${say(down)}  (${load()})`)
      const up = await record(() => fling(first.x, first.y, speed, -1), -1)
      console.log(`fling up   at ${speed} px/s: ${say(up)}  (${load()})`)
      rows.push({ name: `down ${speed}`, ...down }, { name: `up ${speed}`, ...up })
    }
    // From the top toward the bottom: ten hard pushes, each before the last has died away, then let go.
    await h.evaluate(() => window.__ln.box().scrollTo({ top: 0, behavior: 'instant' }))
    await h.waitForTimeout(800)
    const long = await film('run-down', () => record(async () => { let sent = 0; for (let i = 0; i < 9; i++) sent += (await fling(first.x, first.y, 40000, 1, { hold: 260 })).sent; return { sent: sent + (await fling(first.x, first.y, 40000, 1)).sent } }, 1), { ms: 4500 })
    console.log(`ten pushes down: ${say(long)}  (${load()})`)
    const back = await record(async () => { let sent = 0; for (let i = 0; i < 9; i++) sent += (await fling(first.x, first.y, 40000, -1, { hold: 260 })).sent; return { sent: sent + (await fling(first.x, first.y, 40000, -1)).sent } }, -1)
    console.log(`ten pushes up:   ${say(back)}  (${load()})`)
    rows.push({ name: 'ten pushes down', ...long }, { name: 'ten pushes up', ...back })
    const worst = (pick) => rows.reduce((most, row) => (pick(row) > pick(most) ? row : most), rows[0])
    const told = (pick, unit = '') => { const row = worst(pick); return `${pick(row)}${unit} on ${row.name}` }
    check('a fling really moves the note', rows.every((row) => Math.abs(row.went) > 200), rows.map((row) => `${row.name}: ${row.went}px`).join('; '))
    check('no frame of a fling does more than 16 ms of work', worst((row) => row.worstWork).worstWork <= 16, told((row) => row.worstWork, ' ms'))
    check('no frame of a fling comes more than 17.5 ms after the last', worst((row) => row.over).over === 0, `${told((row) => row.over, ' late frames')}; longest ${told((row) => row.worstGap, ' ms')}`)
    check('the words only ever move the way the fingers went', worst((row) => row.back).back === 0, told((row) => row.back, ' frames went back'))
    check('no frame of a fling is blank: each shows the note', worst((row) => row.blank).blank === 0, told((row) => row.blank, ' blank frames'))
    check('no frame of a fling has an undrawn place: a drawn block under every point', worst((row) => row.holes).holes === 0, told((row) => row.holes, ' points'))
    check('each fling comes to rest once', worst((row) => row.rests).rests === 0, told((row) => row.rests, ' more rests'))
    check('at rest the blocks on screen are the real ones within 100 ms', worst((row) => row.realAfter).realAfter <= 100, told((row) => row.realAfter, ' ms'))
    check('the first visible line does not move by more than 1 px as they arrive', worst((row) => row.lineShift).lineShift <= 1, told((row) => row.lineShift, ' px'))
    check('the scrollbar thumb does not jump at rest, or go back in a fling', worst((row) => row.thumbJump).thumbJump <= 2 && worst((row) => row.thumbBack).thumbBack === 0, `${told((row) => row.thumbJump, ' px at rest')}; ${told((row) => row.thumbBack, ' frames back')}`)
  }

  if (PART === 'jumps') {
    const size = original.content.length
    /** After a jump: the frames in which the screen moved, and what it shows a second on. */
    const jump = async (name, run, want) => {
      await h.evaluate(() => window.__ln.start())
      await h.evaluate(() => window.__ln.mark('start'))
      await film(name, run, { ms: 900 })
      await h.waitForTimeout(1200)
      const got = await h.evaluate(() => window.__ln.stop())
      const all = got.frames.filter((one) => one[0] >= got.marks.start)
      const moves = []
      for (let k = 1; k < all.length; k++) if (all[k][5] !== all[k - 1][5] || Math.abs(all[k][6] - all[k - 1][6]) > 0.5) moves.push(Math.round(all[k][0] - got.marks.start))
      const span = moves.length ? moves[moves.length - 1] - moves[0] : 0
      const now = await state()
      const blank = all.filter((one) => !one[7]).length
      const lastFar = all.findLast((one) => one[8] > 0)
      const real = lastFar && moves.length ? Math.max(0, Math.round(lastFar[0] - got.marks.start - moves[moves.length - 1] + 17)) : 0
      const ok = want(now)
      check(`${name}: lands in one step and stays`, ok && span <= 50 && blank === 0 && now.far === 0 && (await answers()), `${ok ? 'at the right place' : 'NOT at the right place'}; moved in ${moves.length} frames over ${span} ms (first ${moves[0] ?? '-'} ms after); blank frames ${blank}; real ${real} ms after landing; first block ${now.first} of ${size}, caret in ${now.caret}, stand-ins on screen ${now.far}; longest frame ${Math.round(Math.max(0, ...all.slice(1).map((one) => one[1])))} ms  (${load()})`)
      return now
    }
    await h.evaluate(() => window.__ln.ed().editor.commands.focus('start'))
    await h.waitForTimeout(300)
    await jump('⌘↓', () => h.keyboard.press('Meta+ArrowDown'), (now) => now.caret >= size - 2 && now.first > size - 200)
    await jump('⌘↑', () => h.keyboard.press('Meta+ArrowUp'), (now) => now.caret <= 1 && now.first < 60 && now.top < 5)
    // The contents rail at the note's right edge: a press on a stroke far down it.
    const rail = await h.evaluate(() => {
      const items = [...document.querySelectorAll('.tiptap-toc-item')]
      const item = items[Math.floor(items.length * 0.8)]
      return item ? { count: items.length, id: item.id, words: item.title } : { count: 0 }
    })
    if (rail.count) {
      const before = await state()
      // A real pointer: over the rail (it opens under the pointer), then a press on the stroke where it now is.
      const where = (id) => h.evaluate((id) => { const r = document.getElementById(id)?.getBoundingClientRect(); return r && r.height ? { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) } : null }, id)
      await jump('a press on the contents rail', async () => {
        const at = await where(rail.id)
        if (at) { await h.mouse.move(at.x, at.y); await h.waitForTimeout(350) }
        const now = await where(rail.id)
        if (now) await h.mouse.click(now.x, now.y)
        else await h.evaluate((id) => document.getElementById(id)?.click(), rail.id)
      }, (now) => Math.abs(now.first - before.first) > 300)
      console.log(`   the rail has ${rail.count} strokes; pressed "${rail.words}"`)
    } else console.log('(no contents rail on this note: not checked)')
    // A link to a far heading, the note already open.
    if (headingText) {
      await h.evaluate(() => window.__ln.box().scrollTo({ top: 0, behavior: 'instant' }))
      await h.waitForTimeout(500)
      await jump(`a link to the heading "${headingText}"`, () => send('capture', note.id, headingText), (now) => Math.abs(now.caret - headingAt) <= 1 && Math.abs(now.first - headingAt) <= 3 && now.firstTop >= 0 && now.firstTop < 80)
      // And as the note opens: left, then opened by the link.
      await send('view', 'today')
      await h.waitForTimeout(1500)
      await send('capture', note.id, headingText)
      await opened(size - 1)
      await h.waitForTimeout(2500)
      await install()
      const landed = await state()
      check('a link to a far heading opens the note on it', Math.abs(landed.caret - headingAt) <= 1 && Math.abs(landed.first - headingAt) <= 3 && landed.far === 0, `heading is block ${headingAt}; first block on screen ${landed.first}, ${landed.firstTop}px down; caret in ${landed.caret}; stand-ins on screen ${landed.far}`)
    }
    // Find: a word of the far heading, stepped to from the top.
    await h.evaluate(() => { window.__ln.box().scrollTo({ top: 0, behavior: 'instant' }); window.__ln.ed().editor.commands.focus('start') })
    await h.waitForTimeout(500)
    await h.keyboard.press('Meta+f')
    await h.waitForTimeout(500)
    const term = (headingText ?? 'the').slice(0, 24)
    await h.keyboard.type(term, { delay: 20 })
    await h.waitForTimeout(900)
    const count = await h.evaluate(() => window.__ln.ed().editor.storage.findAndReplace?.results.length ?? -1)
    const inNote = original.content.reduce((sum, block) => sum + (JSON.stringify(block).toLowerCase().split(term.toLowerCase()).length - 1 > 0 ? 1 : 0), 0)
    check('find counts matches through the whole note', count >= 1 && count >= Math.min(inNote, 1), `"${term}": ${count} matches (in at least ${inNote} blocks of the stored note)`)
    await jump('find, the previous match (the last in the note)', () => h.keyboard.press('Shift+Enter'), (now) => now.first > size / 2)
    await jump('find, the next match (round to the first)', () => h.keyboard.press('Enter'), (now) => now.caret >= 0)
    await h.keyboard.press('Escape')
    await h.waitForTimeout(300)
    // The thumb dragged: the scroll set a long way off, frame after frame, as a drag of the thumb does.
    const dragged = await record(() => h.evaluate(async () => {
      const box = window.__ln.box()
      const most = box.scrollHeight - box.clientHeight
      for (let i = 1; i <= 24; i++) { box.scrollTo({ top: (most * i) / 26, behavior: 'instant' }); await new Promise((next) => requestAnimationFrame(next)) }
      return {}
    }), 1)
    console.log(`the thumb dragged down the note in 24 frames: ${say(dragged)}  (${load()})`)
    check('the thumb dragged far: words on every frame, real ones at rest, no going back', dragged.blank === 0 && dragged.realAfter <= 100 && dragged.back === 0, `blank ${dragged.blank}, real ${dragged.realAfter} ms after rest, back ${dragged.back}, most work in a frame ${dragged.worstWork} ms`)
    // Page Down held.
    await h.evaluate(() => { window.__ln.box().scrollTo({ top: 0, behavior: 'instant' }); window.__ln.ed().editor.commands.focus('start') })
    await h.waitForTimeout(500)
    const paged = await record(async () => { await h.keyboard.down('PageDown'); for (let i = 0; i < 24; i++) { await h.keyboard.down('PageDown'); await new Promise((next) => setTimeout(next, 33)) } await h.keyboard.up('PageDown'); return {} }, 1)
    console.log(`Page Down held for 25 presses: ${say(paged)}  (${load()})`)
    check('Page Down held: words on every frame, never back, real ones at rest', paged.blank === 0 && paged.back === 0 && paged.realAfter <= 100 && paged.went > 2000, `went ${paged.went}px, blank ${paged.blank}, back ${paged.back}, real ${paged.realAfter} ms after rest, most work in a frame ${paged.worstWork} ms`)
  }

  if (PART === 'caret') {
    const size = original.content.length
    // To the end, then a click in a block on the screen and a word typed.
    await h.evaluate(() => window.__ln.ed().editor.commands.focus('start'))
    await h.keyboard.press('Meta+ArrowDown')
    await h.waitForTimeout(900)
    await h.evaluate(() => window.__ln.box().scrollBy({ top: -1400, behavior: 'instant' }))
    await h.waitForTimeout(900)
    const spot = await h.evaluate(() => {
      const e = window.__ln.ed()
      const view = window.__ln.box().getBoundingClientRect()
      const line = [...e.querySelectorAll(':scope > p')].find((p) => { const r = p.getBoundingClientRect(); return !p.hasAttribute('data-far') && p.textContent.trim().length > 30 && r.top > view.top + 80 && r.bottom < view.bottom - 80 })
      if (!line) return null
      const r = line.getBoundingClientRect()
      return { x: Math.round(r.left + 60), y: Math.round(r.top + 10), index: Array.prototype.indexOf.call(e.children, line), words: line.textContent.slice(0, 40) }
    })
    if (!spot) check('a real paragraph is on screen to click in', false, JSON.stringify(await state()))
    else {
      await h.mouse.click(spot.x, spot.y)
      await h.waitForTimeout(250)
      if (await h.evaluate((sel) => document.querySelector(sel + '[data-vim-mode="normal"]') !== null, ED)) await h.keyboard.press('i')
      await h.keyboard.type('Zq7x ', { delay: 30 })
      await h.waitForTimeout(400)
      const typed = await h.evaluate((index) => { const e = window.__ln.ed(); const { doc, selection } = e.editor.state; const at = selection.$head.index(0); return { at, words: doc.child(at).textContent.includes('Zq7x'), count: doc.childCount, shown: e.children[index]?.textContent.includes('Zq7x') } }, spot.index)
      check('a click in a far block and a word typed: the word lands there', typed.words && typed.shown && Math.abs(typed.at - spot.index) <= 4, `clicked block ${spot.index} ("${spot.words}"), caret in ${typed.at}, typed there ${typed.words}, on the page ${typed.shown}`)
      // Away five screens, then ⌘Z: the view comes back to the words taken out.
      await h.evaluate(() => { const box = window.__ln.box(); box.scrollBy({ top: -box.clientHeight * 5, behavior: 'instant' }) })
      await h.waitForTimeout(900)
      const away = await state()
      await h.keyboard.press('Meta+z')
      await h.waitForTimeout(1200)
      const back = await state()
      const undone = await h.evaluate(() => !window.__ln.ed().editor.state.doc.textContent.includes('Zq7x'))
      check('⌘Z after scrolling five screens away brings the view back to the words', undone && Math.abs(back.caret - typed.at) <= 2 && Math.abs(back.first - typed.at) < 60 && back.far === 0 && Math.abs(away.first - typed.at) > 60, `typed in block ${typed.at}; scrolled to block ${away.first}; after ⌘Z first block ${back.first}, caret ${back.caret}, undone ${undone}, stand-ins on screen ${back.far}`)
    }
    // A selection begun on one screen, carried five screens down by ⇧-click.
    await h.evaluate(() => { const box = window.__ln.box(); box.scrollTo({ top: box.scrollHeight * 0.3, behavior: 'instant' }) })
    await h.waitForTimeout(1000)
    const find = () => h.evaluate(() => {
      const e = window.__ln.ed()
      const view = window.__ln.box().getBoundingClientRect()
      const line = [...e.querySelectorAll(':scope > p')].find((p) => { const r = p.getBoundingClientRect(); return !p.hasAttribute('data-far') && p.textContent.trim().length > 20 && r.top > view.top + 60 && r.bottom < view.bottom - 60 })
      if (!line) return null
      const r = line.getBoundingClientRect()
      return { x: Math.round(r.left + 30), y: Math.round(r.top + 10), index: Array.prototype.indexOf.call(e.children, line) }
    })
    const one = await find()
    if (one) await h.mouse.click(one.x, one.y)
    await h.waitForTimeout(300)
    await h.evaluate(() => { const box = window.__ln.box(); box.scrollBy({ top: box.clientHeight * 5, behavior: 'instant' }) })
    await h.waitForTimeout(1000)
    const two = await find()
    if (two) { await h.keyboard.down('Shift'); await h.mouse.click(two.x, two.y); await h.keyboard.up('Shift') }
    await h.waitForTimeout(500)
    // What a copy would take, asked of the page with a copy event of its own: the real clipboard is yours, and left alone.
    const copied = () => h.evaluate(() => {
      const e = window.__ln.ed()
      const { state } = e.editor
      const data = new DataTransfer()
      e.dispatchEvent(new ClipboardEvent('copy', { clipboardData: data, bubbles: true, cancelable: true }))
      const { from, to } = state.selection
      return { from: state.selection.$from.index(0), to: state.selection.$to.index(0), text: data.getData('text/plain').length, want: state.doc.textBetween(from, to, '\n\n').length, whole: state.doc.content.size, span: to - from }
    })
    const carried = one && two ? await copied() : null
    check('a selection carried five screens by ⇧-click is whole, and copies whole', !!carried && carried.from <= one.index + 1 && carried.to >= two.index - 1 && two.index - one.index > 20 && carried.want > 2000 && carried.text >= carried.want * 0.9 && (await answers()), carried ? `from block ${carried.from} (clicked ${one.index}) to ${carried.to} (⇧-clicked ${two.index}); a copy takes ${carried.text} characters of ${carried.want}` : `no paragraph found to click (${JSON.stringify(one)} ${JSON.stringify(two)})`)
    await h.keyboard.press('Meta+a')
    await h.waitForTimeout(600)
    const all = await copied()
    const shown = await state()
    check('⌘A then copy gives the whole note, and the screen stays where it was', all.span >= all.whole - 2 && all.text >= all.want * 0.9 && all.text > 500000 && shown.far === 0 && Math.abs(shown.first - (two?.index ?? shown.first)) < 80 && (await answers()), `selection spans ${all.span} of ${all.whole}; a copy takes ${all.text} characters of ${all.want}; first block on screen ${shown.first}`)
    // Left in the middle of a fling, and come back to.
    await h.mouse.click(shown.x, shown.y)
    await h.evaluate(() => { const box = window.__ln.box(); box.scrollTo({ top: box.scrollHeight * 0.45, behavior: 'instant' }) })
    await h.waitForTimeout(900)
    const flung = fling(shown.x, shown.y, 12000, 1)
    await h.waitForTimeout(350)
    const leaving = await state()
    await send('view', 'today')
    await flung
    await h.waitForTimeout(1500)
    await send('capture', note.id)
    await opened(size - 1)
    await h.waitForTimeout(2500)
    await install()
    const returned = await state()
    const alive = await answers()
    check('left in the middle of a fling and come back to: no spin, the same place', alive && Math.abs(returned.first - leaving.first) <= 60 && returned.far === 0, `left at block ${leaving.first} (still moving), came back at block ${returned.first}, ${returned.firstTop}px down; stand-ins on screen ${returned.far}; the window ${alive ? 'answers' : 'does NOT answer'}`)
  }
  check('no page errors', !c.errors.filter((line) => !/ERR_FILE_NOT_FOUND|status of 404/.test(line)).length, c.errors.filter((line) => !/ERR_FILE_NOT_FOUND|status of 404/.test(line)).slice(0, 3).join(' | '))
} finally {
  await c.close()
}
done()
