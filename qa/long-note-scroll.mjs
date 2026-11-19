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
//             the thumb dragged far, Page Down held: each lands in one step and stays, with no frame over 100 ms
//             (what each cost is printed: script, styles, layout). JUMPS=keys,rail,link,find,thumb,page,contents
//             runs only those. "contents" puts a contents block at the note's top and presses a far entry in it:
//             it writes, so it runs only with WRITES=1 (on a copy kept for writing).
// PART=caret  a click and typing in a far block, ⌘Z bringing the view back to them, a selection carried over
//             five screens by ⇧-click, ⌘A, and what each would copy; a hard fling away from a caret just placed;
//             leaving mid-fling and coming back. ONLY=click runs its first step alone (the click and the word,
//             a word of its own each run, taken out again after), for running it many times over. TRACE=1 writes
//             down what happens to the selection round that click: each event, each time the browser's selection
//             is set and by whom, each change ProseMirror makes.
// PART=far    a caret placed by a click in the first screen, then the wheel pushed hard, push on push, from the top
//             of the note to its very end and back: the window answers throughout, no frame comes more than 100 ms
//             after the last, and the words never move against the wheel. WAY=down or WAY=up runs one way,
//             PUSHES=<n> is the most pushes a way may take (260).
// PART=sizes  the page's height against the truth. Only the blocks near the screen are on the page, the rest stand
//             as space guessed from their words until each has been drawn once: every block is drawn in turn and
//             measured, and the page as it opened must be within 6% of that; ⌘↓ must end on the note's last
//             block with nothing left to scroll; and the note left and opened again must be as tall, to the
//             pixel near enough, as it was left (the heights drawn are kept beside the book).
// SMOOTH=off  turns "Smooth scrolling" off in Settings first. ONLY_SPEED=12000 flings at one speed.
import { DatabaseSync } from 'node:sqlite'
import { existsSync, mkdirSync, readFileSync } from 'fs'
import { loadavg } from 'os'
import { join } from 'path'
import { sandbox } from './sandbox-lib.mjs'
import { checks } from './harness.mjs'

const { check, done } = checks()
const ED = '.tiptap.ProseMirror.haligtree-editor:not(.is-line):not(.is-plain)'
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
const isOpen = ([sel, count]) => {
  const ed = [...document.querySelectorAll(sel)].filter((one) => one.editor).sort((a, b) => b.editor.state.doc.childCount - a.editor.state.doc.childCount)[0]
  return !!ed && ed.isConnected && ed.editor.state.doc.childCount >= count && ed.textContent.trim().length > 0
}
// OPEN_WAIT=<seconds> is how long a note is given to open (120). One that does not says where the window is stuck.
const opened = (count) => h.waitForFunction(isOpen, [ED, count], { timeout: Number(process.env.OPEN_WAIT ?? 120) * 1000 }).catch(async (error) => {
  console.log(await whereStuck(count))
  throw error
})
/** A note that did not open: whether the window answers, what is on the page, and what its script is doing (as qa/where-stuck.mjs reads it). */
const whereStuck = async (count) => {
  const lines = []
  const answers = () => Promise.race([h.evaluate(() => 1).then(() => true, () => false), new Promise((next) => setTimeout(() => next(false), 3000))])
  lines.push(`NOT OPEN: the window ${(await answers()) ? 'answers' : 'does NOT answer'}  (load ${loadavg()[0].toFixed(1)})`)
  const page = await Promise.race([h.evaluate(([sel, count]) => {
    const all = [...document.querySelectorAll(sel)].filter((one) => one.editor)
    return { page: location.search, editors: all.map((ed) => ({ blocks: ed.editor.state.doc.childCount, wanted: count, connected: ed.isConnected, elements: ed.childElementCount, off: ed.querySelectorAll(':scope > [data-off]').length, letters: ed.isConnected ? ed.textContent.length : -1 })), every: document.querySelectorAll('.tiptap.ProseMirror').length, keys: (document.activeElement?.className ?? '').toString().slice(0, 60), frames: window.__freezeNotes?.() ?? null }
  }, [ED, count]).catch((error) => String(error)), new Promise((next) => setTimeout(() => next('(no answer in 5 s)'), 5000))])
  lines.push(`on the page: ${JSON.stringify(page)}`)
  const cdp = await electron.context().newCDPSession(h)
  await cdp.send('Debugger.enable')
  const seen = new Map()
  let idle = 0
  for (let round = 0; round < 8; round++) {
    const hit = await new Promise((next) => {
      const timer = setTimeout(() => next(null), 2000)
      cdp.once('Debugger.paused', (params) => (clearTimeout(timer), next(params)))
      cdp.send('Debugger.pause').catch(() => next(null))
    })
    if (!hit) { idle++; continue }
    for (const line of new Set(hit.callFrames.slice(0, 20).map((one) => `${one.functionName || '(anon)'} ${(one.url ?? '').split('/').pop()}:${one.location.lineNumber + 1}:${one.location.columnNumber}`))) seen.set(line, (seen.get(line) ?? 0) + 1)
    await cdp.send('Debugger.resume').catch(() => {})
    await new Promise((next) => setTimeout(next, 250))
  }
  lines.push(`${idle} of 8 pauses found no script running (idle, or held in layout or paint)`)
  for (const [line, n] of [...seen].sort((a, b) => b[1] - a[1]).slice(0, 25)) lines.push(`  ${String(n).padStart(2)}  ${line}`)
  await cdp.detach().catch(() => {})
  return lines.join('\n')
}

/** What the page is asked through: the note's editor, its scroller, and a reader of each frame. */
const install = () => h.evaluate((sel) => {
  const ed = () => [...document.querySelectorAll(sel)].filter((one) => one.editor).sort((a, b) => b.editor.state.doc.childCount - a.editor.state.doc.childCount)[0]
  const boxOf = (e) => { let box = e.parentElement; while (box && !/auto|scroll/.test(getComputedStyle(box).overflowY)) box = box.parentElement; return box }
  const blockAt = (e, x, y) => document.elementsFromPoint(x, y).find((one) => one.parentElement === e) ?? null
  // Drawn: not a stand-in, and not left out by the browser as far from the screen. A block the browser has left
  // out answers for itself at a point (its insides are not there to be found); a drawn one answers with a part of
  // its own (a card, a cell, a list item) or with a letter of its words. A block with no words at all (a rule, a
  // picture) cannot be told, and counts as drawn.
  const drawnAt = (block, x, y) => {
    const part = document.elementFromPoint(x, y)
    if (part && part !== block && block.contains(part)) return true
    const at = document.caretRangeFromPoint(x, y)
    return !!at && at.startContainer !== block && block.contains(at.startContainer)
  }
  const drawn = (block, x, y) => {
    if (block.hasAttribute('data-far')) return false
    if (!block.textContent.trim()) return true
    const rect = block.getBoundingClientRect()
    x ??= rect.left + Math.min(60, rect.width / 2)
    y ??= Math.max(rect.top + Math.min(8, rect.height / 2), 0)
    if (drawnAt(block, x, y)) return true
    // The point may be in its padding, beside a short line, or under something floating over the note: asked again
    // at other places of its own box that are on the screen. A block the browser left out answers for itself at each.
    const low = Math.max(rect.top + 2, 0)
    const high = Math.min(rect.bottom - 2, window.innerHeight - 2)
    for (const share of [0.5, 0.2, 0.8]) for (const across of [0.1, 0.3, 0.6]) if (drawnAt(block, rect.left + rect.width * across, low + (high - low) * share)) return true
    return false
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
      // The foot of what shows of the note: its scroller's, or the top of what floats over that (the dock under an
      // open note, and the fade over the dock). A block under it is not on show, and cannot be asked whether it is
      // drawn: every point of it answers with the dock, and it was counted as a block on the screen not drawn.
      let foot = view.bottom
      for (let i = 0; i < 4; i++) {
        const over = document.elementFromPoint(x, foot - 2)
        const top = over && !box.contains(over) ? over.getBoundingClientRect().top : foot
        if (top >= foot - 2 || top < view.bottom - 200) break
        foot = top
      }
      let far = 0
      let farAt = -1
      for (let block = first; block; block = block.nextElementSibling) {
        const rect = block.getBoundingClientRect()
        if (rect.top >= foot - 12) break
        if (rect.height && rect.bottom > view.top + 2 && !drawn(block, x, Math.min(foot - 2, Math.max(view.top + 2, rect.top + Math.min(8, rect.height / 2))))) { far++; if (farAt < 0) farAt = indexOf(e, block) }
      }
      const shells = e.querySelectorAll(':scope > [data-far]').length
      return { top: Math.round(box.scrollTop), tall: box.scrollHeight, height: box.clientHeight, first: first ? indexOf(e, first) : -1, firstTop: first ? Math.round(first.getBoundingClientRect().top - view.top) : 0, far, farAt, foot: Math.round(foot), blocks: e.childElementCount, shells, smooth: getComputedStyle(box).scrollBehavior, caret: e.editor.state.selection.$head.index(0), x: Math.round(view.left + view.width / 2), y: Math.round(view.top + view.height / 2), right: Math.round(view.right), boxTop: Math.round(view.top), boxBottom: Math.round(view.bottom) }
    },
  }
}, ED)
const state = () => h.evaluate(() => window.__ln.state())
const frame = () => h.evaluate(() => new Promise((next) => requestAnimationFrame(() => requestAnimationFrame(next))))
const answers = () => Promise.race([h.evaluate(() => 1).then(() => true, () => false), new Promise((next) => setTimeout(() => next(false), 2000))])
/** Whether the page answers within `seconds`: a page that spins does not. */
const answersWithin = async (seconds) => { for (const until = Date.now() + seconds * 1000; Date.now() < until; ) if (await answers()) return true; return false }

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

/**
 * A line of words well inside the screen, in any kind of block: where to click, and which block it is in. Never a
 * line that something else stands over: the dock at the foot of an open note (the thought composer, 76px tall in
 * a 455px pane) covers the words under it, past the 60px kept clear here, and a press there is a press on the
 * dock, which takes the keys from the note: the caret stays where it was and what is typed lands nowhere. That
 * was the caret part's first step failing: after ⌘↓ and 1,400px back, the line it chose was under the dock
 * whenever the note's end stood 200px higher. `low` takes the lowest such line instead of the first (LOW=1, to
 * try the foot of the screen on purpose); COVERED=allow takes covered lines too, as it once did. `plain` keeps
 * out of tables, for a ⇧-click: a selection that begins in a table's cell and ends outside it at the very start
 * of a block (a caret left in the empty last paragraph of a note) is cut back to the cell's own words by the
 * tables' own rule (prosemirror-tables, normalizeSelection), in any note, and that was the far ⇧-click picking
 * only the block clicked: it failed when the line found was in one of the note's 212 tables.
 */
const find = (low = false, plain = false) => h.evaluate(([low, covered, plain]) => {
  const e = window.__ln.ed()
  const view = window.__ln.box().getBoundingClientRect()
  let found = null
  for (const block of e.children) {
    const box = block.getBoundingClientRect()
    if (!box.height || box.bottom < view.top + 60) continue
    if (box.top > view.bottom - 60) break
    if (block.hasAttribute('data-far') || block.matches('[contenteditable="false"]')) continue
    const walk = document.createTreeWalker(block, NodeFilter.SHOW_TEXT)
    for (let node = walk.nextNode(); node; node = walk.nextNode()) {
      if (node.data.trim().length < 20 || node.parentElement.closest('[contenteditable="false"], button, pre, summary') || (plain && node.parentElement.closest('td, th'))) continue
      const range = document.createRange()
      range.setStart(node, 2)
      range.setEnd(node, 3)
      const r = range.getClientRects()[0]
      if (!r || r.top <= view.top + 60 || r.bottom >= view.bottom - 60 || r.left <= view.left || r.right >= view.right - 80) continue
      const at = { x: Math.round(r.left + 1), y: Math.round(r.top + r.height / 2), index: Array.prototype.indexOf.call(e.children, block), words: node.data.trim().slice(0, 40) }
      if (!covered && !block.contains(document.elementFromPoint(at.x, at.y))) continue
      if (!low) return at
      found = at
    }
  }
  return found
}, [low, process.env.COVERED === 'allow', plain])
/**
 * Such a line, the note moved on a little at a time until one is on the screen: the screen may hold none (a long
 * code block or a table fills it), or only one that the dock covers.
 */
const seek = async (low = false, plain = false) => {
  let at = await find(low, plain)
  for (let i = 0; i < 6 && !at; i++) {
    await h.evaluate(() => window.__ln.box().scrollBy({ top: 150, behavior: 'instant' }))
    await h.waitForTimeout(450)
    at = await find(low, plain)
  }
  return at
}
/**
 * TRACE=1: what happens to the selection from here on is written down in the page (`window.__tr`), a line each:
 * every pointer, key and focus event, every time the browser's selection is set (and from where in the script),
 * every change ProseMirror makes, with where the browser's selection and ProseMirror's are after each.
 */
const traced = () => h.evaluate(() => {
  const e = window.__ln.ed()
  const { view } = e.editor
  const log = (window.__tr = [])
  const blockOf = (node) => { let block = node; while (block && block.parentElement !== e) block = block.parentElement; return block ? Array.prototype.indexOf.call(e.children, block) : -1 }
  const where = () => {
    const s = getSelection()
    const { selection } = view.state
    return `browser ${s.rangeCount ? `${blockOf(s.anchorNode)}:${s.anchorOffset}${s.isCollapsed ? '' : ` to ${blockOf(s.focusNode)}:${s.focusOffset}`}` : 'none'}, ProseMirror ${selection.$anchor.index(0)}${selection.empty ? '' : ` to ${selection.$head.index(0)}`}, keys ${document.activeElement === e ? 'in the note' : (document.activeElement?.nodeName ?? 'nowhere')}, vim ${e.getAttribute('data-vim-mode')}, editable ${view.editable}`
  }
  const who = () => (new Error().stack ?? '').split('\n').slice(3, 11).map((line) => line.trim().replace(/^at /, '').replace(/\(?file:.*\/assets\//, '(').slice(0, 64)).join(' < ')
  const say = (what, stack = false) => log.push(`${performance.now().toFixed(1)} ${what}: ${where()}${stack ? `; by ${who()}` : ''}`)
  for (const name of ['collapse', 'setBaseAndExtent', 'addRange', 'removeAllRanges', 'extend', 'setPosition', 'empty', 'selectAllChildren', 'collapseToStart', 'collapseToEnd']) {
    const real = Selection.prototype[name]
    Selection.prototype[name] = function (...args) { const out = real.apply(this, args); say(`selection.${name}`, true); return out }
  }
  const focus = HTMLElement.prototype.focus
  HTMLElement.prototype.focus = function (...args) { const out = focus.apply(this, args); say(`focus() on ${this === e ? 'the note' : this.nodeName}`, true); return out }
  const tell = (window.__tell = (one) => `${one.nodeName.toLowerCase()}${typeof one.className === 'string' && one.className.trim() ? '.' + one.className.trim().split(/\s+/).slice(0, 4).join('.') : ''}${[...(one.attributes ?? [])].filter((a) => a.name.startsWith('data-') || a.name === 'role' || a.name === 'aria-label' || a.name === 'inert').slice(0, 5).map((a) => `[${a.name}${a.value ? `="${a.value.slice(0, 24)}"` : ''}]`).join('')}`)
  const named = (event) => `${event.type}${event.key ? ` ${event.key}` : ''}${event.inputType ? ` ${event.inputType}` : ''} on ${event.target === e ? 'the note' : e.contains(event.target) ? `block ${blockOf(event.target)}` : event.target?.nodeName ? tell(event.target) : ''}`
  for (const type of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click', 'focusin', 'focusout', 'keydown', 'beforeinput', 'input', 'scroll', 'scrollend']) {
    window.addEventListener(type, (event) => say(`event ${named(event)}`), true)
    if (/down|up|click|input/.test(type)) window.addEventListener(type, (event) => say(`  after its listeners, ${named(event)}${event.defaultPrevented ? ': DEFAULT PREVENTED' : ''}`))
  }
  document.addEventListener('selectionchange', () => say('event selectionchange'), true)
  const idle = window.requestIdleCallback
  window.requestIdleCallback = (run, options) => idle.call(window, (deadline) => { say('an idle callback runs'); run(deadline); say('  the idle callback is done') }, options)
  e.editor.on('transaction', ({ transaction }) => say(`ProseMirror change${transaction.docChanged ? ', words' : ''}${transaction.selectionSet ? ', selection' : ''}${transaction.scrolledIntoView ? ', into view' : ''}${Object.keys(transaction.meta ?? {}).length ? `, meta ${Object.keys(transaction.meta).join(' ')}` : ''}`, true))
})
/** Whether block `index` has any part of it on the screen. */
const showing = (index) => h.evaluate((index) => {
  const block = window.__ln.ed().children[index]
  const view = window.__ln.box().getBoundingClientRect()
  const r = block?.getBoundingClientRect()
  return !!r && r.height > 0 && r.bottom > view.top && r.top < view.bottom
}, index)

try {
  await h.evaluate(() => window.api.haligtree('onboarding:set', { welcomed: new Date().toISOString(), newsSeen: true, welcoming: false, pageHints: false }))
  await h.evaluate((smooth) => window.api.haligtree('settings:set', { sounds: false, hintRate: 0, smoothScroll: smooth }), process.env.SMOOTH !== 'off')
  if (process.env.THEME) await c.look(process.env.THEME)
  // FRESH=1: as on a book this app has never opened the note in: no place kept for it, no heights kept from last time.
  if (process.env.FRESH) await h.evaluate(() => { for (const key of Object.keys(localStorage)) if (key === 'note-places' || key.startsWith('note-heights')) localStorage.removeItem(key) })
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

  if (PART === 'far') {
    // A caret placed by a click in the first screen, as someone reading the note has.
    const spot = await find()
    if (spot) await h.mouse.click(spot.x, spot.y)
    await h.waitForTimeout(500)
    const held = await h.evaluate(() => { const e = window.__ln.ed(); return { caret: e.editor.state.selection.$head.index(0), keys: document.activeElement === e } })
    check('a click in the first screen puts the caret there and gives the note the keys', !!spot && held.keys && Math.abs(held.caret - spot.index) <= 3, spot ? `clicked block ${spot.index} ("${spot.words}"), caret in ${held.caret}, the note has the keys: ${held.keys}` : 'no line of words found to click')
    // As many pushes as it may take: about 7,200px each, and the page is as tall as its blocks truly are
    // (1,240,000px for the 7,017-block note in a 1300px window, which the old count of 120 could never cross).
    const CAP = Number(process.env.PUSHES ?? 260)
    /** Hard pushes of the wheel, each before the last has died away, until the note is at its end (or its top). */
    const travel = async (way) => {
      await h.evaluate(() => { window.__ln.start(); window.__ln.mark('start') })
      const began = Date.now()
      let pushes = 0
      let reached = false
      let stuck = null
      // What the wheel sent in all, to set beside how far the note went: a page that throws part of it away falls short.
      let sent = 0
      for (; pushes < CAP && !reached && !stuck; pushes++) {
        sent += (await fling(first.x, first.y, 40000, way, { hold: 260 })).sent
        if (pushes % 4 !== 3) continue
        if (!(await answersWithin(45))) { stuck = `the window did not answer for 45 s after ${pushes + 1} pushes`; break }
        const at = await h.evaluate(() => { const box = window.__ln.box(); return [box.scrollTop, box.scrollHeight - box.clientHeight] })
        reached = way > 0 ? at[0] >= at[1] - 2 : at[0] <= 2
      }
      if (!stuck) sent += (await fling(first.x, first.y, 12000, way)).sent
      if (!stuck && !(await answersWithin(45))) stuck = 'the window did not answer for 45 s after the last push'
      if (stuck) return { stuck, pushes, ms: Date.now() - began }
      await h.evaluate(() => window.__ln.mark('end'))
      await h.waitForTimeout(900)
      const got = read(await h.evaluate(() => window.__ln.stop()), way)
      const at = await state()
      return { ...got, pushes, reached, ms: Date.now() - began, at, sent }
    }
    // WAY=down or WAY=up runs one way only (up starts from the end, gone to by the scroller itself: the caret stays where it was put).
    for (const [way, name, from, to] of [[1, 'down', 'the top', 'the very end'], [-1, 'up', 'the end', 'the top']]) {
      if (process.env.WAY && process.env.WAY !== name) continue
      if (process.env.WAY === 'up') { await h.evaluate(() => { const box = window.__ln.box(); box.scrollTo({ top: box.scrollHeight, behavior: 'instant' }) }); await h.waitForTimeout(1200) }
      // SHOTS=<folder> keeps a frame every 50 ms of the first three seconds of each way, for reading by eye (not for timing).
      const went = await film(`far-${name}`, () => travel(way), { ms: 3000 })
      if (went.stuck) {
        check(`the wheel from ${from} to ${to}: the window answers throughout`, false, `${went.stuck}, ${Math.round(went.ms / 1000)} s in  (${load()})`)
        throw new Error(`the page spins as the wheel goes ${name}`)
      }
      console.log(`the wheel ${name}, ${went.pushes} pushes in ${Math.round(went.ms / 1000)} s: ${say(went)}  (${load()})`)
      console.log(`the wheel sent ${went.sent}px and the note went ${Math.abs(went.went)}px: ${Math.round((Math.abs(went.went) / Math.max(1, went.sent)) * 100)}% of it; the page is ${went.at.tall}px tall`)
      check(`the wheel from ${from} to ${to}: the window answers throughout and it gets there`, went.reached && Math.abs(went.went) > 100000, `${went.reached ? 'got there' : 'did NOT get there'}: ${went.went}px in ${went.pushes} pushes, ${Math.round(went.ms / 1000)} s; first block on screen ${went.at.first} of ${original.content.length}`)
      check(`the wheel ${name}: no frame more than 100 ms after the last`, went.worstGap <= 100, `longest ${went.worstGap} ms; ${went.over} of ${went.frames} frames over 17.5 ms`)
      check(`the wheel ${name}: the words never move against the wheel`, went.back === 0 && went.thumbBack === 0, `${went.back} frames went back${went.back ? ` (by up to ${went.worstBack}px)` : ''}; the thumb went back in ${went.thumbBack}`)
      check(`the wheel ${name}: every frame shows the note`, went.blank === 0, `${went.blank} blank frames; no drawn block under ${went.holes} of ${went.points} points`)
    }
    const end = await h.evaluate(() => { const e = window.__ln.ed(); return { caret: e.editor.state.selection.$head.index(0), keys: document.activeElement === e } })
    check('after it the caret is where it was put, and the note still has the keys', end.keys && end.caret === held.caret, `caret in block ${end.caret} (was ${held.caret}), the note has the keys: ${end.keys}`)
  }

  if (PART === 'sizes') {
    const size = original.content.length
    // Every block drawn in turn, 400 at a time, and measured from where the next one starts; then hidden again.
    const truth = () => h.evaluate(() => {
      const e = window.__ln.ed()
      const { view } = e.editor
      const all = e.children
      const style = getComputedStyle(e)
      view.domObserver.stop()
      let total = 0
      for (let from = 0; from < all.length; from += 400) {
        const to = Math.min(all.length, from + 401)
        const was = []
        for (let i = from; i < to; i++) { was.push(all[i].hasAttribute('data-off')); all[i].removeAttribute('data-off') }
        total += all[to - 1].offsetTop - all[from].offsetTop
        if (to === all.length) total += all[to - 1].offsetHeight
        for (let i = from; i < to; i++) if (was[i - from]) all[i].setAttribute('data-off', '')
      }
      view.domObserver.start()
      return { total: Math.round(total), page: Math.round(e.offsetHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom)), drawn: e.querySelectorAll(':scope > :not([data-off])').length }
    })
    const page = () => h.evaluate(() => { const e = window.__ln.ed(); const style = getComputedStyle(e); return Math.round(e.offsetHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom)) })
    const opened0 = await page()
    const real = await truth()
    const out = (a, b) => `${((a / b - 1) * 100).toFixed(1)}%`
    console.log(`the page as it opened: ${opened0}px for its blocks; every block drawn and measured: ${real.total}px (${(real.total / size).toFixed(1)}px a block); ${real.drawn} blocks on the page  (${load()})`)
    check('the page is as tall as its blocks truly are, within 6%, from the moment it opens', Math.abs(opened0 - real.total) / real.total <= 0.06, `${opened0}px against ${real.total}px: ${out(opened0, real.total)} out`)
    // To the end: the last block on the screen, nothing left to scroll.
    await h.evaluate(() => window.__ln.ed().editor.commands.focus('start'))
    await h.keyboard.press('Meta+ArrowDown')
    await h.waitForTimeout(900)
    const end = await h.evaluate(() => { const e = window.__ln.ed(); const box = window.__ln.box(); const last = e.lastElementChild.getBoundingClientRect(); const view = box.getBoundingClientRect(); return { left: Math.round(box.scrollHeight - box.clientHeight - box.scrollTop), shows: last.height > 0 && last.bottom > view.top && last.top < view.bottom, caret: e.editor.state.selection.$head.index(0) } })
    const atEnd = await page()
    check('⌘↓ ends on the last block, with nothing left to scroll', end.shows && end.left <= 2 && end.caret >= size - 2, `the last block on screen: ${end.shows}; ${end.left}px left to scroll; caret in block ${end.caret} of ${size}`)
    check('the page is still as tall, within 6%, with the end drawn', Math.abs(atEnd - real.total) / real.total <= 0.06, `${atEnd}px against ${real.total}px: ${out(atEnd, real.total)} out`)
    // Part of the way back up by the wheel, so blocks never drawn are drawn above the screen: the height holds.
    for (let i = 0; i < 3; i++) await fling(first.x, first.y, 12000, -1)
    await h.waitForTimeout(900)
    const left = await page()
    check('the page is still as tall, within 6%, after three pushes of the wheel back up', Math.abs(left - real.total) / real.total <= 0.06, `${left}px against ${real.total}px: ${out(left, real.total)} out`)
    // Left and opened again: as tall as it was left, the drawn heights kept.
    await send('view', 'today')
    await h.waitForTimeout(1500)
    await send('capture', note.id)
    await opened(size - 1)
    await h.waitForTimeout(2500)
    await install()
    const again = await page()
    check('left and opened again, the page is as tall as it was left: the heights drawn are kept', Math.abs(again - left) <= Math.max(40, left * 0.001), `${left}px as it was left, ${again}px opened again (${again - left}px apart)`)
  }

  if (PART === 'jumps') {
    const size = original.content.length
    // JUMPS=keys,rail,contents,link,find,thumb,page runs only those; all of them when not given.
    const only = process.env.JUMPS ? process.env.JUMPS.split(',') : null
    const wants = (name) => !only || only.includes(name)
    // What the page spent on each jump: its script, and the browser's own share (styles, layout).
    const cdp = await electron.context().newCDPSession(h)
    await cdp.send('Performance.enable')
    const spent = async () => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((one) => [one.name, one.value]))
    /** After a jump: the frames in which the screen moved, and what it shows a second on. `run` may give back when the press itself was sent. */
    const jump = async (name, run, want) => {
      await h.evaluate(() => window.__ln.start())
      await h.evaluate(() => window.__ln.mark('start'))
      const was = await spent()
      await film(name, run, { ms: 900 })
      await new Promise((next) => setTimeout(next, 1200))
      // A page that does not answer is spinning: said, waited for up to a minute, and the run ends there if it never does.
      const asked = Date.now()
      let alive = await answers()
      if (!alive) {
        for (let i = 0; i < 28 && !alive; i++) alive = await answers()
        check(`${name}: lands in one step and stays`, false, `the page did not answer for ${alive ? Math.round((Date.now() - asked) / 100) / 10 + ' s after it' : 'a minute after it: it spins'}  (${load()})`)
        check(`${name}: no frame over 100 ms`, false, alive ? `frozen for ${Math.round((Date.now() - asked) / 100) / 10 + 1.2} s or more` : 'the page never answered again')
        if (!alive) throw new Error(`the page spins after ${name}`)
      }
      const got = await h.evaluate(() => window.__ln.stop())
      const cost = await spent()
      const from = got.marks.press ?? got.marks.start
      const all = got.frames.filter((one) => one[0] >= from)
      const moves = []
      for (let k = 1; k < all.length; k++) if (all[k][5] !== all[k - 1][5] || Math.abs(all[k][6] - all[k - 1][6]) > 0.5) moves.push(Math.round(all[k][0] - from))
      const span = moves.length ? moves[moves.length - 1] - moves[0] : 0
      // After it landed (50 ms on from its first move): how far the first block that starts on the screen still went.
      let drift = 0
      for (let k = 1; k < all.length; k++) if (moves.length && all[k][0] - from > moves[0] + 50) drift = Math.max(drift, all[k][5] !== all[k - 1][5] ? 999 : Math.abs(all[k][6] - all[k - 1][6]))
      const now = await state()
      const blank = all.filter((one) => !one[7]).length
      const lastFar = all.findLast((one) => one[8] > 0)
      const real = lastFar && moves.length ? Math.max(0, Math.round(lastFar[0] - from - moves[moves.length - 1] + 17)) : 0
      const longest = Math.round(Math.max(0, ...all.slice(1).map((one) => one[1])))
      const ms = (key) => Math.round((cost[key] - was[key]) * 1000)
      const ok = want(now)
      if (alive) {
        check(`${name}: lands in one step and stays`, ok && span <= 50 && drift <= 1 && blank === 0 && now.far === 0, `${ok ? 'at the right place' : 'NOT at the right place'}; moved in ${moves.length} frames over ${span} ms (first ${moves[0] ?? '-'} ms after), then by at most ${Math.round(drift * 10) / 10}px; blank frames ${blank}; real ${real} ms after landing; first block ${now.first} of ${size}, caret in ${now.caret}, stand-ins on screen ${now.far}  (${load()})`)
        check(`${name}: no frame over 100 ms`, longest <= 100, `longest frame ${longest} ms; script ${ms('ScriptDuration')} ms, styles ${ms('RecalcStyleDuration')} ms (${cost.RecalcStyleCount - was.RecalcStyleCount} times), layout ${ms('LayoutDuration')} ms (${cost.LayoutCount - was.LayoutCount} times)`)
      }
      return now
    }
    const pressed = () => h.evaluate(() => window.__ln.mark('press'))
    if (wants('keys')) {
      await h.evaluate(() => window.__ln.ed().editor.commands.focus('start'))
      await h.waitForTimeout(300)
      await jump('⌘↓', () => h.keyboard.press('Meta+ArrowDown'), (now) => now.caret >= size - 2 && now.first > size - 200)
      await jump('⌘↑', () => h.keyboard.press('Meta+ArrowUp'), (now) => now.caret <= 1 && now.first < 60 && now.top < 5)
    }
    // The contents rail at the note's right edge: a press on a stroke far down it.
    const rail = !wants('rail') ? { count: 0 } : await h.evaluate(() => {
      const items = [...document.querySelectorAll('.tiptap-toc-item')]
      const item = items[Math.floor(items.length * 0.8)]
      return item ? { count: items.length, id: item.id, words: item.title } : { count: 0 }
    })
    if (rail.count) {
      const before = await state()
      // Where the stroke is, and whether it is on show in the rail's own list (a long rail scrolls: a stroke past its edge cannot be pressed).
      const where = (id) => h.evaluate((id) => {
        const r = document.getElementById(id)?.getBoundingClientRect()
        const list = document.querySelector('.tiptap-toc-list')?.getBoundingClientRect()
        return r && r.height && list ? { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2), shown: r.top >= list.top + 2 && r.bottom <= list.bottom - 2, mid: Math.round(list.top + list.height / 2), over: Math.round(list.left + list.width / 2) } : null
      }, id)
      let landedOn = false
      await jump('a press on the contents rail', async () => {
        // A real pointer: over the rail (it opens under the pointer), the wheel turned there until the stroke is on show, then a press on the stroke where it now is.
        let at = await where(rail.id)
        if (at) { await h.mouse.move(at.over, at.mid); await h.waitForTimeout(350); at = await where(rail.id) }
        for (let i = 0; i < 80 && at && !at.shown; i++) {
          await wheelOnce(at.over, at.mid, sign * Math.max(-700, Math.min(700, at.y - at.mid)))
          await h.waitForTimeout(80)
          at = await where(rail.id)
        }
        if (at?.shown) { await h.mouse.move(at.x, at.y); await h.waitForTimeout(150); at = await where(rail.id) }
        landedOn = !!at?.shown
        await pressed()
        if (at?.shown) await h.mouse.click(at.x, at.y)
      }, (now) => landedOn && Math.abs(now.first - before.first) > 300)
      console.log(`   the rail has ${rail.count} strokes; ${landedOn ? 'pressed' : 'could NOT bring on show'} "${rail.words}"`)
      // The pointer off the rail again, so it shuts.
      await h.mouse.move(before.x, before.y)
      await h.waitForTimeout(300)
    } else if (wants('rail')) console.log('(no contents rail on this note: not checked)')
    // A link to a far heading, the note already open.
    if (wants('link') && headingText) {
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
    if (wants('find')) {
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
    }
    if (wants('thumb')) {
    // The thumb dragged: the scroll set a long way off, frame after frame, as a drag of the thumb does.
    const dragged = await record(() => h.evaluate(async () => {
      const box = window.__ln.box()
      const most = box.scrollHeight - box.clientHeight
      // Each step set between frames, as a drag sets it (from the pointer, before the frame is drawn): set inside
      // the frame's own callback, the page hears of the scroll only a frame later, which no drag does.
      for (let i = 1; i <= 24; i++) { box.scrollTo({ top: (most * i) / 26, behavior: 'instant' }); await new Promise((next) => requestAnimationFrame(() => setTimeout(next))) }
      return {}
    }), 1)
    console.log(`the thumb dragged down the note in 24 frames: ${say(dragged)}  (${load()})`)
    check('the thumb dragged far: words on every frame, real ones at rest, no going back', dragged.blank === 0 && dragged.realAfter <= 100 && dragged.back === 0, `blank ${dragged.blank}, real ${dragged.realAfter} ms after rest, back ${dragged.back}, most work in a frame ${dragged.worstWork} ms`)
    check('the thumb dragged far: no frame over 100 ms', dragged.worstGap <= 100, `longest frame ${dragged.worstGap} ms (${dragged.over} over 17.5 ms)`)
    }
    if (wants('page')) {
    // Page Down held.
    await h.evaluate(() => { window.__ln.box().scrollTo({ top: 0, behavior: 'instant' }); window.__ln.ed().editor.commands.focus('start') })
    await h.waitForTimeout(500)
    const paged = await record(async () => { await h.keyboard.down('PageDown'); for (let i = 0; i < 24; i++) { await h.keyboard.down('PageDown'); await new Promise((next) => setTimeout(next, 33)) } await h.keyboard.up('PageDown'); return {} }, 1)
    console.log(`Page Down held for 25 presses: ${say(paged)}  (${load()})`)
    check('Page Down held: words on every frame, never back, real ones at rest', paged.blank === 0 && paged.back === 0 && paged.realAfter <= 100 && paged.went > 2000, `went ${paged.went}px, blank ${paged.blank}, back ${paged.back}, real ${paged.realAfter} ms after rest, most work in a frame ${paged.worstWork} ms`)
    check('Page Down held: no frame over 100 ms', paged.worstGap <= 100, `longest frame ${paged.worstGap} ms (${paged.over} over 17.5 ms)`)
    }
    // A contents block at the note's top, and a press on a far heading in it. It writes to the note: only with WRITES=1.
    if (wants('contents') && headingText && process.env.WRITES) {
      await h.evaluate(() => { window.__ln.box().scrollTo({ top: 0, behavior: 'instant' }); window.__ln.ed().editor.chain().focus('start').insertContents().run() })
      await h.waitForTimeout(1500)
      const entry = () => h.evaluate((words) => {
        const one = [...document.querySelectorAll('.mf-contents-entry')].find((entry) => entry.title === words)
        if (!one) return null
        const r = one.getBoundingClientRect()
        const view = window.__ln.box().getBoundingClientRect()
        return { x: Math.round(r.left + Math.min(40, r.width / 2)), y: Math.round(r.top + r.height / 2), shown: r.height > 0 && r.top > view.top + 60 && r.bottom < view.bottom - 60, count: document.querySelectorAll('.mf-contents-entry').length }
      }, headingText)
      // The note scrolled to the entry (it is far down the block), then a real press on it.
      await h.evaluate((words) => [...document.querySelectorAll('.mf-contents-entry')].find((entry) => entry.title === words)?.scrollIntoView({ block: 'center', behavior: 'instant' }), headingText)
      await h.waitForTimeout(900)
      const at = await entry()
      // The block put in is one more block above the heading.
      const target = headingAt + (await h.evaluate(() => window.__ln.ed().editor.state.doc.childCount)) - size
      if (!at?.shown) check('a press on a heading in a contents block: lands in one step and stays', false, `its entry could not be brought on show (${JSON.stringify(at)})`)
      else {
        await jump('a press on a heading in a contents block', async () => { await h.mouse.move(at.x, at.y); await h.waitForTimeout(150); await pressed(); await h.mouse.click(at.x, at.y) }, (now) => Math.abs(now.caret - target) <= 1 && Math.abs(now.first - target) <= 3 && now.firstTop >= 0 && now.firstTop < 80)
        console.log(`   the block lists ${at.count} headings; pressed "${headingText}" (block ${target})`)
      }
      // The block taken out again.
      await h.evaluate(() => window.__ln.ed().editor.commands.focus())
      await h.keyboard.press('Meta+z')
      await h.waitForTimeout(800)
    } else if (wants('contents') && only) console.log('(a contents block is put in the note for this: run it with WRITES=1 on a copy kept for writing)')
  }

  if (PART === 'caret') caret: {
    const size = original.content.length
    const alone = process.env.ONLY === 'click'
    const word = alone ? `Zq${1000 + (Date.now() % 9000)}x` : 'Zq7x'
    if (process.env.TRACE) await traced()
    // ONLY=shift: the far ⇧-click alone (the caret left at the note's very end, the screen about a third of the
    // way down, then ⇧-click), TIMES times (6) in one launch, each at a slightly different place; with TRACE=1,
    // what happened round each one that did not pick from the click to the caret is printed.
    if (process.env.ONLY === 'shift') {
      for (let n = 0; n < Number(process.env.TIMES ?? 6); n++) {
        await h.evaluate(() => window.__ln.ed().editor.commands.focus('start'))
        await h.keyboard.press('Meta+ArrowDown')
        await h.waitForTimeout(700)
        await h.evaluate((share) => { const box = window.__ln.box(); box.scrollTo({ top: box.scrollHeight * share, behavior: 'instant' }) }, 0.3 + n * 0.013)
        await h.waitForTimeout(900)
        const far = await seek(false, true)
        const was = await h.evaluate(() => { const e = window.__ln.ed(); const s = getSelection(); const { selection } = e.editor.state; let block = s.anchorNode; while (block && block.parentElement !== e) block = block.parentElement; return { caret: selection.$anchor.index(0), browser: s.rangeCount ? (block ? `block ${Array.prototype.indexOf.call(e.children, block)}` : 'outside the note') : 'none', keys: document.activeElement === e } })
        if (process.env.TRACE && far) await h.evaluate(([far, n]) => window.__tr.push(`${performance.now().toFixed(1)} THE SHIFT CLICK ${n}, on block ${far.index} at ${far.x},${far.y}`), [far, n])
        if (far) { await h.keyboard.down('Shift'); await h.mouse.click(far.x, far.y); await h.keyboard.up('Shift') }
        const picked = (await answersWithin(30)) ? await h.evaluate(() => { const { selection, doc } = window.__ln.ed().editor.state; return { from: selection.$from.index(0), to: selection.$to.index(0), blocks: doc.childCount } }) : null
        const ok = !!far && !!picked && Math.abs(picked.from - far.index) <= 2 && picked.to >= picked.blocks - 2
        check(`far ⇧-click ${n + 1}: picked from the place clicked to the caret`, ok, `before it the caret is in block ${was.caret}, the browser's selection ${was.browser}, the keys in the note ${was.keys}; clicked block ${far?.index} ("${far?.words}") at ${far?.x},${far?.y}; picked ${picked ? `blocks ${picked.from} to ${picked.to} of ${picked.blocks}` : 'nothing: the window did not answer'}  (${load()})`)
        if (!ok && process.env.TRACE) console.log('round it:\n  ' + (await h.evaluate((n) => window.__tr.slice(Math.max(0, window.__tr.findIndex((line) => line.includes(`THE SHIFT CLICK ${n},`)) - 10)).filter((line) => !/event scroll|idle callback/.test(line)).slice(0, 40), n)).join('\n  '))
        await h.keyboard.press('ArrowLeft')
        await h.waitForTimeout(300)
      }
      break caret
    }
    // To the end, then a click in a block on the screen and a word typed.
    const before = await h.evaluate(() => window.__ln.ed().editor.state.doc.content.size)
    await h.evaluate(() => window.__ln.ed().editor.commands.focus('start'))
    await h.keyboard.press('Meta+ArrowDown')
    await h.waitForTimeout(900)
    await h.evaluate(() => window.__ln.box().scrollBy({ top: -1400, behavior: 'instant' }))
    await h.waitForTimeout(900)
    const spot = await seek(!!process.env.LOW)
    if (!spot) {
      check('a real paragraph is on screen to click in', false, JSON.stringify(await state()))
      if (alone) break caret
    } else {
      // PUT=815: the line chosen is first put that many px down the window (the note scrolled by the difference),
      // covered or not: 815 is under the dock at the foot of a note in a narrow pane, in a 900px window.
      if (process.env.PUT) {
        await h.evaluate(([y, to]) => window.__ln.box().scrollBy({ top: y - to, behavior: 'instant' }), [spot.y, Number(process.env.PUT)])
        await h.waitForTimeout(700)
        const again = await h.evaluate(([index, words]) => {
          const walk = document.createTreeWalker(window.__ln.ed().children[index], NodeFilter.SHOW_TEXT)
          for (let node = walk.nextNode(); node; node = walk.nextNode()) {
            if (!node.data.trim().startsWith(words)) continue
            const range = document.createRange()
            range.setStart(node, 2)
            range.setEnd(node, 3)
            const r = range.getClientRects()[0]
            return r ? { x: Math.round(r.left + 1), y: Math.round(r.top + r.height / 2) } : null
          }
          return null
        }, [spot.index, spot.words])
        if (again) Object.assign(spot, again)
      }
      if (process.env.TRACE) {
        await h.evaluate((spot) => window.__tr.push(`${performance.now().toFixed(1)} THE CLICK, on block ${spot.index} at ${spot.x},${spot.y}`), spot)
        console.log('under the click, topmost first:\n    ' + (await h.evaluate(([x, y]) => {
          const box = window.__ln.box()
          const view = box.getBoundingClientRect()
          const under = document.elementsFromPoint(x, y).slice(0, 9).map((one) => { const r = one.getBoundingClientRect(); return `${window.__tell(one)}  at ${Math.round(r.left)},${Math.round(r.top)}, ${Math.round(r.width)} by ${Math.round(r.height)}, pointer-events ${getComputedStyle(one).pointerEvents}` })
          return under.join('\n    ') + `\n  the note's scroller: ${Math.round(view.top)} to ${Math.round(view.bottom)} down the window (${innerWidth} by ${innerHeight}); scrolled to ${Math.round(box.scrollTop)} of ${box.scrollHeight - box.clientHeight}`
        }, [spot.x, spot.y])))
      }
      await h.mouse.click(spot.x, spot.y)
      await h.waitForTimeout(250)
      if (await h.evaluate((sel) => document.querySelector(sel + '[data-vim-mode="normal"]') !== null, ED)) await h.keyboard.press('i')
      await h.keyboard.type(`${word} `, { delay: 30 })
      await h.waitForTimeout(400)
      const typed = await h.evaluate(([index, word]) => { const e = window.__ln.ed(); const { doc, selection } = e.editor.state; const at = selection.$head.index(0); return { at, words: doc.child(at).textContent.includes(word), count: doc.childCount, shown: e.children[index]?.textContent.includes(word) } }, [spot.index, word])
      check('a click in a far block and a word typed: the word lands there', typed.words && typed.shown && Math.abs(typed.at - spot.index) <= 4, `clicked block ${spot.index} ("${spot.words}"), caret in ${typed.at}, typed there ${typed.words}, on the page ${typed.shown}  (${load()})`)
      // TRACE=all prints every line from ⌘↓ on; else from a little before the click.
      if (process.env.TRACE) console.log('round the click:\n  ' + (await h.evaluate((all) => window.__tr.slice(all ? 0 : Math.max(0, window.__tr.findIndex((line) => line.includes('THE CLICK')) - 14)), process.env.TRACE === 'all')).join('\n  '))
      if (alone) {
        // What was typed taken out again (the word, or whatever the keys did instead), so the copy of the book
        // is as it was for the next run.
        const same = () => h.evaluate(([word, was]) => { const { doc } = window.__ln.ed().editor.state; return doc.content.size === was && !doc.textContent.includes(word) }, [word, before])
        for (let i = 0; i < 8 && !(await same()); i++) { await h.keyboard.press('Meta+z'); await h.waitForTimeout(300) }
        check('what was typed is taken out again', await same())
        await h.waitForTimeout(1500)
        break caret
      }
      // Away five screens, then ⌘Z: the view comes back to the words taken out.
      await h.evaluate(() => { const box = window.__ln.box(); box.scrollBy({ top: -box.clientHeight * 5, behavior: 'instant' }) })
      await h.waitForTimeout(900)
      const away = await state()
      const gone = !(await showing(typed.at))
      await h.keyboard.press('Meta+z')
      await h.waitForTimeout(1200)
      const back = await state()
      const here = await showing(typed.at)
      const undone = await h.evaluate((word) => !window.__ln.ed().editor.state.doc.textContent.includes(word), word)
      check('⌘Z after scrolling five screens away brings the view back to the words', undone && Math.abs(back.caret - typed.at) <= 2 && here && gone && back.far === 0 && (await answers()), `typed in block ${typed.at}; scrolled to block ${away.first} (the typed block off the screen: ${gone}); after ⌘Z first block ${back.first}, caret ${back.caret}, the typed block on the screen: ${here}, undone ${undone}, undrawn on screen ${back.far}`)
    }
    // A selection begun on one screen, carried five screens down by ⇧-click.
    await h.evaluate(() => { const box = window.__ln.box(); box.scrollTo({ top: box.scrollHeight * 0.3, behavior: 'instant' }) })
    await h.waitForTimeout(1000)
    const one = await seek()
    if (one) await h.mouse.click(one.x, one.y)
    await h.waitForTimeout(300)
    await h.evaluate(() => { const box = window.__ln.box(); box.scrollBy({ top: box.clientHeight * 5, behavior: 'instant' }) })
    await h.waitForTimeout(1000)
    const two = await seek(false, true)
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
    check('a selection carried five screens by ⇧-click is whole, and copies whole', !!carried && carried.from <= one.index + 1 && carried.to >= two.index - 1 && two.index - one.index >= 5 && carried.want > 2000 && carried.text >= carried.want * 0.9 && (await answers()), carried ? `from block ${carried.from} (clicked ${one.index}) to ${carried.to} (⇧-clicked ${two.index}); a copy takes ${carried.text} characters of ${carried.want}` : `no paragraph found to click (${JSON.stringify(one)} ${JSON.stringify(two)})`)
    await h.keyboard.press('Meta+a')
    await h.waitForTimeout(600)
    const all = await copied()
    const shown = await state()
    const answering = await answers()
    check('⌘A then copy gives the whole note, and the screen stays where it was', all.span >= all.whole - 2 && all.text >= all.want * 0.9 && all.text > 500000 && shown.far === 0 && Math.abs(shown.first - (two?.index ?? shown.first)) < 80 && answering, `selection spans ${all.span} of ${all.whole}; a copy takes ${all.text} characters of ${all.want}; first block on screen ${shown.first}; blocks on show not drawn ${shown.far}${shown.far ? ` (the first is block ${shown.farAt}; what shows ends ${shown.foot}px down the window)` : ''}; the window answers ${answering}`)
    // The caret left at the note's very end, the screen a third of the way down, then ⇧-click: picked from the place
    // clicked to the caret, thousands of blocks away and none of them drawn, at once. Then ⌘A, at once too.
    await h.evaluate(() => window.__ln.ed().editor.commands.focus('start'))
    await h.keyboard.press('Meta+ArrowDown')
    await h.waitForTimeout(700)
    await h.evaluate(() => { const box = window.__ln.box(); box.scrollTo({ top: box.scrollHeight * 0.3, behavior: 'instant' }) })
    await h.waitForTimeout(900)
    const far = await seek(false, true)
    const fixed = await h.evaluate(() => window.__ln.ed().editor.state.selection.$anchor.index(0))
    console.log(`(before the ⇧-click the caret is in block ${fixed}; the click is on block ${far?.index})`)
    if (process.env.TRACE && far) await h.evaluate((far) => window.__tr.push(`${performance.now().toFixed(1)} THE SHIFT CLICK, on block ${far.index} at ${far.x},${far.y}`), far)
    let began = Date.now()
    if (far) { await h.keyboard.down('Shift'); await h.mouse.click(far.x, far.y); await h.keyboard.up('Shift') }
    if (process.env.TRACE && far) { await h.waitForTimeout(400); console.log('round the ⇧-click:\n  ' + (await h.evaluate(() => window.__tr.slice(Math.max(0, window.__tr.findIndex((line) => line.includes('THE SHIFT CLICK')) - 8)).filter((line) => !/event scroll/.test(line)).slice(0, 60))).join('\n  ')) }
    const picked = (await answersWithin(30)) ? await h.evaluate(() => { const { selection, doc } = window.__ln.ed().editor.state; return { from: selection.$from.index(0), to: selection.$to.index(0), blocks: doc.childCount } }) : null
    const pickedIn = Date.now() - began
    check('⇧-click with the caret left at the far end picks from the place clicked to the caret, at once', !!far && !!picked && pickedIn < 2000 && Math.abs(picked.from - far.index) <= 1 && picked.to >= picked.blocks - 2, picked ? `clicked block ${far?.index}; picked blocks ${picked.from} to ${picked.to} of ${picked.blocks}; the window answered ${pickedIn} ms after the click  (${load()})` : `the window did not answer for 30 s after the click  (${load()})`)
    began = Date.now()
    await h.keyboard.press('Meta+a')
    const whole = (await answersWithin(30)) ? await h.evaluate(() => { const { selection, doc } = window.__ln.ed().editor.state; return { span: selection.to - selection.from, whole: doc.content.size } }) : null
    const wholeIn = Date.now() - began
    check('⌘A after it picks the whole note, at once', !!whole && wholeIn < 2000 && whole.span >= whole.whole - 2, whole ? `picked ${whole.span} of ${whole.whole}; the window answered ${wholeIn} ms after the keys  (${load()})` : `the window did not answer for 30 s after ⌘A  (${load()})`)
    if (!whole) throw new Error('the page spins after ⌘A')
    // A caret placed by a click, then two hard flings away from it: the blocks it is in leave the page.
    await h.evaluate(() => { const box = window.__ln.box(); box.scrollTo({ top: box.scrollHeight * 0.2, behavior: 'instant' }) })
    await h.waitForTimeout(900)
    const here = await seek()
    if (here) await h.mouse.click(here.x, here.y)
    await h.waitForTimeout(400)
    await h.evaluate(() => { window.__ln.start(); window.__ln.mark('start') })
    await fling(shown.x, shown.y, 40000, 1)
    await fling(shown.x, shown.y, 40000, 1)
    const awake = await answersWithin(60)
    if (!awake) {
      check('two hard flings away from a caret just placed: the page answers, no frame over 100 ms', false, `the page did not answer for a minute after them: it spins  (${load()})`)
      throw new Error('the page spins after a fling away from the caret')
    }
    await h.evaluate(() => window.__ln.mark('end'))
    await h.waitForTimeout(900)
    const flown = read(await h.evaluate(() => window.__ln.stop()), 1)
    const after = await state()
    check('two hard flings away from a caret just placed: the page answers, no frame over 100 ms', !!here && flown.worstGap <= 100 && Math.abs(after.caret - here.index) <= 2 && after.first - here.index > 200, `caret left in block ${here?.index}, the screen went to block ${after.first} (${flown.went}px); longest frame ${flown.worstGap} ms (${flown.over} over 17.5 ms) in ${flown.frames} frames  (${load()})`)
    // A letter typed with the caret left behind: the note comes back to it, and the letter lands there. With Vim
    // on, from whatever mode the steps before left it in (⌘A leaves it picking: "Qz9k" was then four commands,
    // no word was typed and this step failed on any build): Esc for its normal mode, then i to write.
    const vim = await h.evaluate((sel) => document.querySelector(sel)?.getAttribute('data-vim-mode') ?? null, ED)
    if (vim) { await h.keyboard.press('Escape'); await h.keyboard.press('i') }
    console.log(`(Vim is ${vim ? `on, in its "${vim}" mode before the word` : 'off'})`)
    await h.keyboard.type('Qz9k', { delay: 40 })
    await h.waitForTimeout(700)
    if (!(await answersWithin(60))) { check('a word typed with the caret left far behind lands at the caret, and the note comes back to it', false, 'the page did not answer for a minute after it: it spins'); throw new Error('the page spins after typing far from the screen') }
    const came = await state()
    const landed = await h.evaluate((index) => { const { doc, selection } = window.__ln.ed().editor.state; const at = selection.$head.index(0); return { at, words: doc.child(at).textContent.includes('Qz9k'), elsewhere: doc.textContent.split('Qz9k').length - 1 } }, here?.index ?? 0)
    check('a word typed with the caret left far behind lands at the caret, and the note comes back to it', !!here && landed.words && landed.elsewhere === 1 && Math.abs(landed.at - here.index) <= 1 && Math.abs(came.first - here.index) < 60 && came.far === 0, `caret was in block ${here?.index}; the word is in block ${landed.at}: ${landed.words} (${landed.elsewhere} time in the note); the screen is back at block ${came.first}`)
    // The word taken out again, only if it went in.
    if (landed.words) for (let i = 0; i < 4; i++) await h.keyboard.press('Backspace')
    await h.waitForTimeout(500)
    // Left in the middle of a fling, and come back to.
    await h.mouse.click(shown.x, shown.y)
    await h.evaluate(() => { const box = window.__ln.box(); box.scrollTo({ top: box.scrollHeight * 0.45, behavior: 'instant' }) })
    await h.waitForTimeout(900)
    if (!(await answersWithin(60))) { check('left in the middle of a fling and come back to: no spin, the same place', false, 'the page did not answer for a minute after scrolling away from a caret just placed: it spins'); throw new Error('the page spins after scrolling away from the caret') }
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
  check('no page errors', !c.errors.filter((line) => !/ERR_FILE_NOT_FOUND|status of 404|NotSameOrigin/.test(line)).length, c.errors.filter((line) => !/ERR_FILE_NOT_FOUND|status of 404|NotSameOrigin/.test(line)).slice(0, 3).join(' | '))
} finally {
  await c.close()
}
done()
