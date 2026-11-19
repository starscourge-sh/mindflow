// A long note is safe: looked at, typed in, scrolled, closed in a hurry or
// open twice, what is stored is what was written and nothing else. Run on a
// COPY of a book (QA_DATA), never the book itself, on its largest note:
//
//   PART=leave,type QA_DATA=<copy> QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/long-note-safe.mjs
//
// The stored note is read straight from the copy's database file, and every
// change is made with real keys, presses and the wheel: the save is never
// called from here. PART is one or more of, in this order:
//
//   midscroll  the app is closed while the note is still being wheeled
//              through: the stored note is byte for byte what it was, and it
//              opens again whole.
//   leave      opened, looked at and left: byte for byte what it was.
//   two        open in the main window and in a window of its own: a letter
//              typed in each arrives in the other, both are stored, nothing
//              else changes, neither window stops answering.
//   type       one letter at the very top, one in a paragraph in the middle
//              (MID=0.5, the share of the way down), one at the very end;
//              once they are stored the app is closed at once and opened
//              again: the stored note is the old one plus those three
//              letters, block for block.
//   typefast   the same, closed straight after the last letter with no wait
//              for the save: says which letters were kept.
//
// The very top is reached as a person reaches it (`toTop`): a long note opens
// where it was last left (after `midscroll`, screens down, where one long list
// can fill the screen), so the wheel takes it up and a press on the first
// letter of its first line puts the caret there. FRAMES=<folder> keeps the
// window at each step of that, FRAMES_BOTH=1 in light and in dark.
import { DatabaseSync } from 'node:sqlite'
import { existsSync, readFileSync } from 'fs'
import { loadavg } from 'os'
import { join } from 'path'
import { sandbox } from './sandbox-lib.mjs'
import { checks } from './harness.mjs'
import { lineOnShow } from './line-on-show.mjs'

const { check, done } = checks()
const ED = '.tiptap.ProseMirror.haligtree-editor:not(.is-line):not(.is-plain)'
const root = process.env.QA_DATA
if (!root) throw new Error('QA_DATA must be a copy of a book')
const parts = (process.env.PART ?? 'leave').split(',').map((one) => one.trim())
const MID = Number(process.env.MID ?? 0.5)
const shelf = existsSync(join(root, 'books.json')) ? JSON.parse(readFileSync(join(root, 'books.json'), 'utf8')) : null
const file = shelf?.last && shelf.last !== 'default' ? join(root, 'books', shelf.last, 'haligtree.db') : join(root, 'haligtree.db')
const ask = (run) => {
  const read = (readOnly) => { const db = new DatabaseSync(file, { readOnly }); try { return run(db) } finally { db.close() } }
  // Read only; a database left mid-write by a kill may need its log played back first, which a reader may not do.
  try { return read(true) } catch { return read(false) }
}
const id = ask((db) => db.prepare("select id from captures where status = 'open' and kind = 'note' and body is not null order by length(body) desc limit 1").get()).id
const stored = () => ask((db) => db.prepare('select * from captures where id = ?').get(id))
const wait = (ms) => new Promise((next) => setTimeout(next, ms))
const load = () => `load ${loadavg()[0].toFixed(1)}`
const original = stored()
const blocksAtStart = JSON.parse(original.body).content.length
console.log(`note ${id.slice(0, 8)}: ${original.body.length} characters stored, ${blocksAtStart} blocks; parts ${parts.join(', ')}  (${load()})`)

/** Where two texts part, with a little of each side. */
const parting = (was, now) => {
  let at = 0
  while (at < was.length && at < now.length && was[at] === now[at]) at++
  return `they part at ${at} of ${was.length}: was "${was.slice(Math.max(0, at - 50), at + 70)}" now "${now.slice(Math.max(0, at - 50), at + 70)}"`
}
/** A link card's picture and icon, still on the web, are kept with the notes the first time the card is shown: without those addresses. */
const cardsAside = (text) => JSON.stringify(JSON.parse(text), (key, value) => (key === 'attrs' && value && typeof value === 'object' && ('icon' in value || 'image' in value) ? { ...value, icon: '', image: '', iconSource: '', imageSource: '' } : value))
/** The other columns of the note's row that are not what they were. */
const columns = (was, now) => Object.keys(was).filter((key) => key !== 'body' && String(was[key]) !== String(now[key]))
/** Byte for byte, and if not, what differs. */
const same = (name, was, now) => {
  const other = columns(was, now)
  const said = was.body === now.body
    ? `byte for byte${other.length ? `; other columns changed: ${other.join(', ')}` : ''}`
    : `${cardsAside(was.body) === cardsAside(now.body) ? "ONLY link cards' kept pictures differ" : 'more than link cards differs'}: ${was.body.length} characters before, ${now.body.length} after; ${parting(was.body, now.body)}`
  const ok = check(name, was.body === now.body, said)
  // Not byte for byte: whether the cards' pictures are all of it is said on a line of its own.
  if (!ok) check(`${name}: apart from the pictures and icons of link cards, kept with the notes on first show`, cardsAside(was.body) === cardsAside(now.body), cardsAside(was.body) === cardsAside(now.body) ? 'every other character is the same' : 'other words changed too')
  return ok
}
const textOf = (block) => (block.text ?? '') + (block.content ?? []).map(textOf).join('')
/**
 * The note as a person reads it: the words of every block that has any, in order, and every picture in order, known
 * by its own words (a picture's alt, a missing one's file). A save mends how pictures sit, by design (13 Nov,
 * fbb026b4e and d1bbde252): a picture alone on a line becomes a picture block, a picture kept in the vault is copied
 * into the book under a new address, one line of two pictures becomes two blocks. So blocks may split and picture
 * addresses change; no word and no picture may go, and both sides are read the same way.
 */
const readOf = (body) => {
  const blocks = JSON.parse(body).content ?? []
  const words = []
  const pictures = []
  const walk = (node) => {
    if (node.type === 'image') pictures.push(`picture "${node.attrs?.alt ?? ''}"`)
    else if (node.type === 'imagePlaceholder') pictures.push(`missing picture ${node.attrs?.missing ?? node.attrs?.embed ?? ''}`)
    for (const one of node.content ?? []) walk(one)
  }
  for (const block of blocks) {
    const text = textOf(block)
    if (text.trim()) words.push(text)
    walk(block)
  }
  return { words, pictures, blocks: blocks.length }
}
/** One letter put into `old` to make `text`: that letter, else null. */
const plusOne = (old, text) => {
  if (text.length !== old.length + 1) return null
  let at = 0
  while (at < old.length && old[at] === text[at]) at++
  return text.slice(at + 1) === old.slice(at) ? text[at] : null
}
/**
 * The stored note against the one before, as read: the letters typed (`typed`: block, letter) each in their block, and
 * every other word and every picture as it was. Blocks are matched by their words, not their place, so a picture line
 * the save split in two moves nothing.
 */
function against(was, now, typed) {
  const [a, b] = [readOf(was), readOf(now)]
  const letters = [...typed.values()]
  const kept = []
  const others = []
  for (let i = 0, j = 0; i < a.words.length || j < b.words.length; ) {
    const [x, y] = [a.words[i], b.words[j]]
    if (x !== undefined && x === y) { i++; j++; continue }
    const added = x !== undefined && y !== undefined ? plusOne(x, y) : null
    if (added && letters.includes(added) && !kept.includes(added)) { kept.push(added); i++; j++; continue }
    // A letter typed on an empty line (the note's own empty last line): a block of that one letter.
    if (y !== undefined && y.length === 1 && letters.includes(y) && !kept.includes(y)) { kept.push(y); j++; continue }
    others.push(x === undefined ? `words added: "${y.slice(0, 80)}"` : y === undefined ? `words lost: "${x.slice(0, 80)}"` : `the ${i + 1}th block with words: ${parting(x, y)}`)
    // Past the first difference the two are out of step: one is enough to say.
    break
  }
  const at = a.pictures.findIndex((one, k) => one !== b.pictures[k])
  if (a.pictures.length !== b.pictures.length || at >= 0) others.push(`pictures: ${a.pictures.length} before, ${b.pictures.length} now${at >= 0 ? `; the ${at + 1}th was ${a.pictures[at]}, now ${b.pictures[at] ?? 'none'}` : ''}`)
  const lost = letters.filter((one) => !kept.includes(one))
  return { kept, lost, others, blocks: b.blocks, was: a.blocks, emptyLine: false }
}
/**
 * LOSE=letter or LOSE=picture: the stored note read as a build that lost its first typed letter (the one at the very
 * top) or its first picture would have stored it, to show the checks fail on that.
 */
const LOSE = process.env.LOSE ?? ''
const asLost = (body) => {
  if (!LOSE) return body
  const doc = JSON.parse(body)
  if (LOSE === 'picture') {
    const drop = (node) => { const at = (node.content ?? []).findIndex((one) => one.type === 'image'); if (at >= 0) return void node.content.splice(at, 1), true; return (node.content ?? []).some(drop) }
    drop(doc)
  } else {
    // The top letter went in at the start of the note's first words.
    const first = (node) => (node.type === 'text' && node.text ? node : (node.content ?? []).map(first).find(Boolean))
    const text = first(doc)
    if (text?.text.startsWith('q')) text.text = text.text.slice(1)
  }
  return JSON.stringify(doc)
}

/** The note's editor in a window: the one with the most blocks. */
const pick = `[...document.querySelectorAll(${JSON.stringify(ED)})].filter((one) => one.editor).sort((a, b) => b.editor.state.doc.childCount - a.editor.state.doc.childCount)[0]`
const page = (target, run, arg) => target.evaluate(([code, body, arg]) => new Function('ed', 'arg', `return (${body})(ed, arg)`)(new Function(`return ${code}`)(), arg), [pick, run.toString(), arg])
const opened = (target, count) => target.waitForFunction(([sel, count]) => {
  const ed = [...document.querySelectorAll(sel)].filter((one) => one.editor).sort((a, b) => b.editor.state.doc.childCount - a.editor.state.doc.childCount)[0]
  return !!ed && ed.isConnected && ed.editor.state.doc.childCount >= count && ed.textContent.trim().length > 0
}, [ED, count], { timeout: 90000 })
/** Whether a window answers within two seconds. */
const answers = (target) => Promise.race([target.evaluate(() => 1).then(() => true, () => false), wait(2000).then(() => false)])
/** Within a time, or null: a window that has stopped answering must not hold the run. */
const within = (ms, promise) => Promise.race([promise.catch(() => null), wait(ms).then(() => null)])
const scrollOf = (ed) => {
  let box = ed.parentElement
  while (box && !/auto|scroll/.test(getComputedStyle(box).overflowY)) box = box.parentElement
  const r = box.getBoundingClientRect()
  return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2), top: box.scrollTop, max: box.scrollHeight - box.clientHeight }
}
const errorsOf = (c) => c.errors.filter((line) => !/ERR_FILE_NOT_FOUND|status of 404/.test(line))

let c = null
async function launch() {
  const started = Date.now()
  c = await sandbox({ width: 1300, height: 900, seeded: false })
  await c.h.evaluate(() => window.api.haligtree('onboarding:set', { welcomed: new Date().toISOString(), newsSeen: true, welcoming: false, pageHints: false }))
  await c.h.evaluate(() => window.api.haligtree('settings:set', { sounds: false, hintRate: 0 }))
  await wait(1200)
  console.log(`(launched in ${Date.now() - started} ms, ${load()})`)
  return c
}
async function openNote(count = blocksAtStart - 1) {
  const started = Date.now()
  await c.send('capture', id)
  await opened(c.h, count)
  console.log(`(the note opened in ${Date.now() - started} ms, ${load()})`)
}
async function quit() {
  const started = Date.now()
  await c.close()
  c = null
  return Date.now() - started
}
/** The caret, as the editor has it: which block, and where in the note. */
const caret = (target) => page(target, (ed) => ({ index: ed.editor.state.selection.$head.index(0), pos: ed.editor.state.selection.head, blocks: ed.editor.state.doc.childCount, focused: ed.editor.isFocused, vim: ed.getAttribute('data-vim-mode') }))
/** One letter from the keys, wherever the caret is (Vim's normal mode is left first). */
async function letter(target, key, vimKey = 'i') {
  const at = await caret(target)
  if (at.vim === 'normal') await target.keyboard.press(vimKey)
  await target.keyboard.type(key, { delay: 30 })
  await wait(150)
  return at
}
/**
 * A press on a line of the note that is really on show (qa/line-on-show.mjs: built, well inside its window, nothing
 * lying over it), so the caret goes into the note by the pointer. Says where it pressed, or null when no press put
 * the caret in.
 */
async function pressIn(target, { min = 3, only } = {}) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const spot = await within(8000, page(target, lineOnShow, { min, only, skip: attempt }))
    if (!spot || spot.none) return void console.log(`(no line to press: ${JSON.stringify(spot?.none ?? 'the window did not answer')})`)
    await target.mouse.click(spot.x, spot.y)
    await wait(250)
    // The caret is in the note when the page's own focus is: the editor's "focused" word waits for the window to be the front one.
    const inNote = await within(5000, page(target, (ed) => ed === document.activeElement || ed.contains(document.activeElement)))
    if (inNote) return spot
    console.log(`(a press at ${spot.x},${spot.y} on block ${spot.index + 1} did not put the caret in the note: ${await stateOf(target)})`)
  }
  return null
}
/**
 * FRAMES=<folder>: the window as it is, kept as <folder>/<part>-<name>.png (FRAMES_BOTH=1: in light and in dark,
 * the theme put back to light after), to read the top of the note by eye after the press and after the letter.
 */
const FRAMES = process.env.FRAMES ?? ''
let framePart = ''
async function frame(target, name) {
  if (!FRAMES) return
  const file = join(FRAMES, `${framePart}-${name}`)
  if (process.env.FRAMES_BOTH && target === c.h) await c.both(file, target)
  else await target.screenshot({ path: `${file}.png` }).catch((error) => console.log(`(no frame ${name}: ${error.message.slice(0, 80)})`))
}
/** What a window says of itself when a press did not take: for the failing line. */
const stateOf = (target) => within(5000, target.evaluate(() => JSON.stringify({ windowFocused: document.hasFocus(), shown: document.visibilityState, active: document.activeElement ? `${document.activeElement.tagName}.${String(document.activeElement.className).slice(0, 50)}` : null })))
/**
 * The caret at the very top of the note, put there as a person puts it. A long note opens where it was last left
 * (lib/note-place.ts: after `midscroll`, some screens down), so the note's words on show there are looked at first,
 * then the wheel takes the note up to its top, and a press on the first letter of its first line puts the caret
 * before it. Says where it pressed, or null (with the failing line said) when it could not.
 */
async function toTop(target, part) {
  await frame(target, 'top-0-opened')
  const opened = await within(8000, page(target, (ed) => {
    let box = ed.parentElement
    while (box && !/auto|scroll/.test(getComputedStyle(box).overflowY)) box = box.parentElement
    const view = box.getBoundingClientRect()
    const words = [...ed.children].filter((el) => { const r = el.getBoundingClientRect(); return r.height && r.bottom > view.top && r.top < view.bottom && el.textContent.trim() }).length
    return { top: Math.round(box.scrollTop), words }
  }))
  check(`${part}: opened where it was left (${opened ? opened.top : '?'}px down), the screen shows the note's words`, !!opened && opened.words > 0, opened ? `${opened.words} blocks with words on show` : 'the window did not answer')
  const centre = await page(target, scrollOf)
  await target.mouse.move(centre.x, centre.y)
  let at = centre
  let events = 0
  for (; at && at.top > 0 && events < 300; events++) {
    if ((await within(8000, target.mouse.wheel(0, -Math.min(3000, at.top + 120)).then(() => true))) === null) break
    await wait(80)
    at = await within(8000, page(target, scrollOf))
  }
  if (!check(`${part}: the wheel takes the note up to its very top`, !!at && at.top === 0, at ? `${Math.round(at.top)}px from the top after ${events} wheel events, from ${Math.round(centre.top)}px` : 'the window stopped answering')) return null
  await frame(target, 'top-1-at-top')
  // The first letter of the note's first line, and nothing lying over it: waited for, as a person waits to see it.
  const firstLetter = (ed) => {
    const first = [...ed.children].find((el) => el.pmViewDesc?.node && el.textContent.trim())
    if (!first) return null
    // Its own words only: not what is drawn beside them (a heading's "H2" mark, line numbers), which takes no caret.
    const words = first.pmViewDesc.contentDOM ?? first
    const walk = document.createTreeWalker(words, NodeFilter.SHOW_TEXT, { acceptNode: (node) => (node.textContent.trim() && !node.parentElement.closest('[contenteditable="false"]') ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP) })
    const text = walk.nextNode()
    if (!text) return null
    const range = document.createRange()
    const start = text.textContent.search(/\S/)
    range.setStart(text, start)
    range.setEnd(text, start + 1)
    const r = range.getBoundingClientRect()
    const [x, y] = [Math.round(r.left + Math.min(2, r.width / 3)), Math.round(r.top + r.height / 2)]
    const hit = document.elementFromPoint(x, y)
    return { x, y, clear: !!hit && words.contains(hit), under: hit ? `${hit.tagName}.${String(hit.className).slice(0, 50)}` : 'nothing', index: ed.editor.state.doc.resolve(ed.editor.view.posAtDOM(first, 0)).index(0), words: words.textContent.trim().slice(0, 40) }
  }
  const shown = await target.waitForFunction(([code, body]) => {
    const one = new Function('ed', `return (${body})(ed)`)(new Function(`return ${code}`)())
    return one?.clear ? one : false
  }, [pick, firstLetter.toString()], { timeout: 10000 }).then((handle) => handle.jsonValue(), () => null)
  const spot = shown ?? (await within(8000, page(target, firstLetter)))
  if (!check(`${part}: the first letter of the note's first line is on show, nothing over it`, !!spot?.clear, spot ? `block ${spot.index + 1} "${spot.words}" at ${spot.x},${spot.y}; under the pointer: ${spot.under}` : 'no words in the first line')) return null
  await target.mouse.click(spot.x, spot.y)
  await wait(250)
  await frame(target, 'top-2-pressed')
  const after = await within(5000, page(target, (ed) => ({ keys: ed === document.activeElement || ed.contains(document.activeElement), index: ed.editor.state.selection.$head.index(0), offset: ed.editor.state.selection.$head.parentOffset, empty: ed.editor.state.selection.empty })))
  check(`${part}: a press on the first letter of the first line puts the caret before it`, !!after && after.keys && after.index === spot.index && after.offset === 0 && after.empty, after ? `the note ${after.keys ? 'has' : 'does NOT have'} the keys; caret in block ${after.index + 1} at ${after.offset}` : 'the window did not answer')
  return spot
}

/** The three letters: top, middle, end. Returns where each went, or what stopped it. */
async function typeThree() {
  const h = c.h
  const typed = new Map()
  // The very top.
  await toTop(h, framePart)
  const top = await letter(h, 'q')
  await frame(h, 'top-3-letter')
  typed.set(top.index, 'q')
  console.log(`(top: caret in block ${top.index + 1} at ${top.pos}, focused ${top.focused}, typed "q")`)
  // The middle: wheeled to, then a press in a paragraph that is really there.
  const centre = await page(h, scrollOf)
  await h.mouse.move(centre.x, centre.y)
  let share = centre.max > 0 ? centre.top / centre.max : 1
  let stuck = false
  const wheeling = Date.now()
  let events = 0
  // As many events as the page is tall: 3,000px each, to the middle of a page that is as tall as its blocks truly are.
  const most = Math.max(240, Math.ceil((centre.max * MID) / 3000) + 40)
  for (; share < MID - 0.02 && events < most && !stuck && Date.now() - wheeling < 45000; ) {
    for (let i = 0; i < 4 && !stuck; i++, events++) stuck = (await within(8000, h.mouse.wheel(0, 3000).then(() => true))) === null
    await wait(100)
    const at = stuck ? null : await within(8000, page(h, scrollOf))
    if (!at) stuck = true
    else share = at.max > 0 ? at.top / at.max : 1
  }
  const wheeled = Date.now() - wheeling
  // And it was the wheel that took it there: a run that found the note already far down, or a scroller with
  // nothing to scroll, passed this with no wheel event sent at all.
  const reached = stuck ? null : await within(8000, page(h, scrollOf))
  check('the wheel itself moved the note there: it started at the top and wheel events were sent', !!reached && events > 0 && centre.max > 0 && centre.top < centre.max * 0.05 && reached.top - centre.top > centre.max * 0.3, `${events} wheel events; the note went from ${Math.round(centre.top)}px to ${reached ? Math.round(reached.top) : 'no answer'}px of ${Math.round(centre.max)}px`)
  // How far the wheel got is the scrolling's business, said here plainly; the letter goes in whatever far block it reached.
  check(`the wheel reaches the middle of the note (${Math.round(MID * 100)}% of the way down) within 45 seconds`, !stuck && share >= MID - 0.02, `${(share * 100).toFixed(0)}% of the way down after ${wheeled} ms (${load()})`)
  if (!check('after the wheel the window still answers', !stuck && (await answers(h)), stuck ? 'a wheel event or a read of the page took over 8 s' : '')) return { typed, stopped: true }
  let spot = null
  for (let i = 0; i < 12 && !spot; i++) {
    await wait(400)
    spot = await pressIn(h, { min: 30, only: '^P$' })
  }
  if (!check('a press lands the caret in a paragraph on show there, a built one', !!spot, spot ? `block ${spot.index + 1}: "${spot.words}"` : `none found on the screen, or no press took: ${await stateOf(h)}`)) return { typed, stopped: true }
  const middle = await letter(h, 'j')
  typed.set(middle.index, 'j')
  console.log(`(middle: pressed in block ${spot.index + 1}, caret in block ${middle.index + 1} at ${middle.pos}, typed "j")`)
  // The very end.
  await h.keyboard.press('Meta+ArrowDown')
  await wait(500)
  const end = await letter(h, 'x', 'a')
  typed.set(end.index, 'x')
  console.log(`(end: caret in block ${end.index + 1} of ${end.blocks} at ${end.pos}, typed "x")`)
  return { typed, at: Date.now() }
}

/** Waits until every letter typed is in the stored note, or for `ms`. Returns how long it took, or null. */
async function untilStored(base, typed, ms = 30000, since = Date.now()) {
  const started = Date.now()
  let last = base
  while (Date.now() - started < ms) {
    const now = stored().body
    if (now !== last) {
      // Every write of the note as it comes: when, and what it held of the letters.
      console.log(`  (the stored note written ${Date.now() - since} ms after the last key: ${now.length} characters, letters in it: ${against(base, asLost(now), typed).kept.join(' ') || 'none'})`)
      last = now
      const got = against(base, asLost(now), typed)
      if (got.kept.length === typed.size) return Date.now() - started
    }
    await wait(300)
  }
  return null
}

try {
  // --- closed while it is still moving -------------------------------------
  if (parts.includes('midscroll')) {
    const base = stored()
    await launch()
    await openNote()
    await wait(1000)
    const centre = await page(c.h, scrollOf)
    await c.h.mouse.move(centre.x, centre.y)
    // A long run of the wheel, still coming as the app is told to close.
    let stop = false
    const h = c.h
    const run = (async () => { for (let i = 0; i < 2000 && !stop; i++) { await h.mouse.wheel(0, 260).catch(() => (stop = true)); await wait(16) } })()
    await wait(900)
    const one = await within(3000, page(h, scrollOf))
    await wait(200)
    const two = await within(3000, page(h, scrollOf))
    const moving = !!one && !!two && two.top !== one.top
    console.log(`(wheeling: at ${one ? Math.round(one.top) : 'no answer'}, then ${two ? Math.round(two.top) : 'no answer'}, ${load()})`)
    const took = await quit()
    stop = true
    await run
    check('the app was closed while the note was still scrolling', moving, `at ${one ? Math.round(one.top) : '?'} px, then ${two ? Math.round(two.top) : '?'} px, 200 ms apart; closing took ${took} ms`)
    same('closed in the middle of a scroll, the stored note is byte for byte what it was', base, stored())
    await launch()
    await openNote()
    await wait(1500)
    const whole = await within(20000, page(c.h, async (ed, id) => {
      const kept = await window.api.captures.get(id)
      const doc = ed.editor.schema.nodeFromJSON(kept.body)
      const now = ed.editor.state.doc
      const say = (node) => (node ? `${node.type.name} "${node.textContent.slice(0, 30)}"` : 'none')
      const bare = (text) => text.replace(/\s+/g, '')
      // A line that held a picture or a rule among its words (old Obsidian imports) opens split round it, by design,
      // and is stored so only once the note is edited (lib/lift-blocks.ts): in the editor it is its pictures and
      // rules, each as stored, and its words, in order (a list item still starts with a line, an empty one if a
      // picture came first). Anything holding such a line (a list, its item) is the same holder, gone through the
      // same way. Every other block is the stored one exactly.
      let lifted = 0
      const alike = (was, is, where) => {
        let j = 0
        for (let i = 0; i < was.childCount; i++) {
          const one = was.child(i)
          const next = is.maybeChild(j)
          const at = `${where}${where ? ' > ' : 'block '}${i + 1}`
          if (next && one.eq(next)) { j++; continue }
          if (next && next.type === one.type && !one.inlineContent && one.childCount && one.sameMarkup(next)) {
            const inside = alike(one, next, at)
            if (inside !== true) return inside
            j++
            continue
          }
          const held = []
          if (one.inlineContent) one.forEach((part) => void (part.isBlock && held.push(part)))
          if (!held.length) return `${at} stored ${say(one)}, in the editor ${say(next)} (${doc.childCount} blocks stored, ${now.childCount} in the editor)`
          const words = bare(one.textContent)
          let [k, got] = [0, '']
          for (let part = next; part && (k < held.length || got.length < words.length); part = is.maybeChild(++j)) {
            if (k < held.length && part.eq(held[k])) k++
            else if (part.type === one.type && words.startsWith(got + bare(part.textContent))) got += bare(part.textContent)
            else break
          }
          if (k < held.length || got !== words) return `${at} stored ${say(one)}, a line holding ${held.length} pictures or rules, is not in the editor split round them (there: ${say(is.maybeChild(j))})`
          lifted++
        }
        return j === is.childCount || `${where || 'the note'}: the editor has ${is.childCount - j} more, from ${say(is.maybeChild(j))}`
      }
      const same = alike(doc, now, '')
      return same === true ? { lifted, blocks: now.childCount, stored: doc.childCount } : same
    }, id))
    check('opened again, the editor holds the whole stored note, block for block', typeof whole === 'object' && !!whole, typeof whole === 'object' && whole ? `${whole.stored} blocks stored, ${whole.blocks} in the editor: ${whole.lifted} lines that held a picture among their words open split round it, by design (lib/lift-blocks.ts), every other block the stored one` : String(whole))
    check('opened again, the window answers', await answers(c.h))
    same('opened again after that close, the stored note is still byte for byte what it was', base, stored())
    check('no page errors after a close in the middle of a scroll', !errorsOf(c).length, errorsOf(c).slice(0, 3).join(' | '))
  }

  // --- opened, looked at, left ----------------------------------------------
  if (parts.includes('leave')) {
    const base = stored()
    if (!c) await launch()
    await openNote()
    await wait(3000)
    const first = await page(c.h, (ed) => ({ blocks: ed.editor.state.doc.childCount, far: ed.querySelectorAll(':scope > [data-off]').length, cards: ed.querySelectorAll('.tiptap-bookmark, [data-type="bookmark"]').length }))
    console.log(`(open: ${first.blocks} blocks, ${first.far} of them off the page, ${first.cards} link cards built)`)
    same('open and looked at for three seconds, the stored note is byte for byte what it was', base, stored())
    await c.send('view', 'today')
    await wait(3500)
    same('opened and left, the stored note is byte for byte what it was', base, stored())
    check('no page errors opening and leaving', !errorsOf(c).length, errorsOf(c).slice(0, 3).join(' | '))
  }

  // --- in two windows at once ------------------------------------------------
  if (parts.includes('two')) {
    const base = stored()
    if (!c) await launch()
    await openNote()
    await wait(800)
    await c.h.evaluate((one) => window.api.haligtree('notes:window', 'capture', one, null, null), id).catch(() => {})
    let win = null
    for (let i = 0; i < 60 && !win; i++) (win = c.electron.windows().find((one) => /view=note|note\.html/.test(one.url()) && one.url().includes(id))), await wait(250)
    if (check('the note opens in a window of its own, beside the main window', !!win, c.electron.windows().map((one) => one.url().slice(-70)).join(' | '))) {
      const own = []
      win.on('pageerror', (error) => own.push('PAGEERROR ' + error.message))
      const up = await within(90000, opened(win, blocksAtStart - 1).then(() => true))
      check('its own window holds the whole note', up === true, `${load()}`)
      const typed = new Map()
      // A letter at the very top, in the main window.
      framePart = 'two'
      await toTop(c.h, framePart)
      const top = await letter(c.h, 'q')
      await frame(c.h, 'top-3-letter')
      typed.set(top.index, 'q')
      const firstWords = () => within(3000, page(win, (ed) => ed.editor.state.doc.child(0).textContent.slice(0, 12)))
      let there = null
      const sent = Date.now()
      for (let i = 0; i < 80 && !(there ?? '').startsWith('q'); i++) (await wait(250), (there = await firstWords()))
      check('a letter typed at the top in the main window arrives in the other window', (there ?? '').startsWith('q'), `"${there}" after ${Date.now() - sent} ms`)
      // A letter at the very end, in its own window.
      const inOwn = await pressIn(win)
      check('a press puts the caret in the note in its own window', !!inOwn, inOwn ? `block ${inOwn.index + 1}: "${inOwn.words}"` : `no press took: ${await stateOf(win)}`)
      await win.keyboard.press('Meta+ArrowDown')
      await wait(600)
      const end = await letter(win, 'x', 'a')
      typed.set(end.index, 'x')
      console.log(`(own window: caret in block ${end.index + 1} of ${end.blocks}, focused ${end.focused}, typed "x")`)
      check('⌘↓ in its own window takes the caret to the last block of the note', end.index === end.blocks - 1, `block ${end.index + 1} of ${end.blocks}`)
      const lastWords = () => within(3000, page(c.h, (ed, at) => ed.editor.state.doc.maybeChild(at)?.textContent.slice(-12) ?? null, end.index))
      let back = null
      const sentBack = Date.now()
      for (let i = 0; i < 80 && !(back ?? '').endsWith('x'); i++) (await wait(250), (back = await lastWords()))
      check('a letter typed at the end in its own window arrives in the main window', (back ?? '').endsWith('x'), `"${back}" after ${Date.now() - sentBack} ms`)
      const took = await untilStored(base.body, typed)
      const got = against(base.body, stored().body, typed)
      check('both letters are stored', got.kept.length === 2 && !got.lost.length, `kept ${got.kept.join(' ') || 'none'}, lost ${got.lost.join(' ') || 'none'}${took === null ? '; not stored within 30 s' : `; stored ${took} ms after the last check`}`)
      check('and nothing else in the note changed', !got.others.length, got.others.length ? `${got.others.length} other blocks differ: ${got.others.slice(0, 3).join(' || ')}` : `${got.blocks} blocks, ${got.was} before${got.emptyLine ? ' (one new empty last line, the editor\'s own)' : ''}`)
      const [main, other] = [await answers(c.h), await answers(win)]
      check('neither window stops answering', main && other, `main ${main ? 'answers' : 'does NOT answer'}, its own window ${other ? 'answers' : 'does NOT answer'} within 2 s`)
      check('no page errors with the note open twice', !errorsOf(c).length && !own.length, [...errorsOf(c), ...own].slice(0, 3).join(' | '))
    }
  }

  // --- three letters, then closed -------------------------------------------
  for (const part of ['type', 'typefast']) {
    if (!parts.includes(part)) continue
    const base = stored()
    if (!c) await launch()
    await openNote()
    await wait(800)
    framePart = part
    const { typed, stopped, at } = await typeThree()
    if (stopped) continue
    let took = null
    if (part === 'type') {
      // Looked for on the page only here: with no wait, nothing comes between the last key and the close.
      const inEditor = await within(8000, page(c.h, (ed, places) => places.map(([index, key]) => ed.editor.state.doc.maybeChild(index)?.textContent.includes(key) ?? false), [...typed]))
      check('the three letters are in the note on the page', typed.size === 3 && !!inEditor && inEditor.every(Boolean), `blocks ${[...typed.keys()].map((one) => one + 1).join(', ')}: ${JSON.stringify(inEditor)}`)
      took = await untilStored(base.body, typed, 30000, at)
      check('the three letters are stored without anything being asked', took !== null, took === null ? 'not within 30 s of the last key' : `${Date.now() - at} ms after the last key (${load()})`)
    }
    const closing = await quit()
    const kept = stored()
    const got = against(base.body, asLost(kept.body), typed)
    console.log(`(closed ${part === 'type' ? 'once stored' : 'straight after the last key'}, closing took ${closing} ms; stored: kept ${got.kept.join(' ') || 'none'}, lost ${got.lost.join(' ') || 'none'}; other columns changed: ${columns(base, kept).join(', ') || 'none'})`)
    check(part === 'type' ? 'closed at once, the stored note holds all three letters' : 'closed straight after the last key with no wait, the stored note holds all three letters', got.kept.length === 3 && !got.lost.length, `kept ${got.kept.join(' ') || 'none'}, lost ${got.lost.join(' ') || 'none'}`)
    check('and nothing else in the note changed', !got.others.length, got.others.length ? `${got.others.length} other blocks differ: ${got.others.slice(0, 3).join(' || ')}` : `${got.blocks} blocks, ${got.was} before${got.emptyLine ? ' (one new empty last line, the editor\'s own)' : ''}`)
    await launch()
    await openNote(blocksAtStart - 1)
    await wait(1500)
    const again = await within(20000, page(c.h, async (ed, [id, places]) => {
      const row = await window.api.captures.get(id)
      return { whole: ed.editor.schema.nodeFromJSON(row.body).eq(ed.editor.state.doc), letters: places.map(([index, key]) => ed.editor.state.doc.maybeChild(index)?.textContent.includes(key) ?? false) }
    }, [id, [...typed]]))
    check('opened again, the editor holds the whole stored note, block for block', again?.whole === true, JSON.stringify(again))
    await c.send('view', 'today')
    await wait(3000)
    // Left again, the note may only be mended (a picture copied in, a picture line split), never changed as read.
    const later = stored().body
    const [was, now] = [readOf(kept.body), readOf(later)]
    const asRead = (one) => JSON.stringify({ words: one.words, pictures: one.pictures })
    const mended = later !== kept.body && asRead(was) === asRead(now)
    const first = (list, other) => list.findIndex((one, k) => one !== other[k])
    check('opened again and left, nothing more was written but mending', later === kept.body || mended, later === kept.body ? 'byte for byte what was stored at the close' : mended ? `mended only: the same words and pictures (${now.blocks} blocks, ${was.blocks} at the close)` : first(was.words, now.words) >= 0 || was.words.length !== now.words.length ? `words: ${parting(was.words.join('\n'), now.words.join('\n'))}` : `pictures: ${was.pictures.length} then ${now.pictures.length}; the ${first(was.pictures, now.pictures) + 1}th was ${was.pictures[first(was.pictures, now.pictures)]}, now ${now.pictures[first(was.pictures, now.pictures)]}`)
    check(`no page errors (${part})`, !errorsOf(c).length, errorsOf(c).slice(0, 3).join(' | '))
  }
} finally {
  if (c) await c.close()
}
done()
