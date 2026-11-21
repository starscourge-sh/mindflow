// An everyday writer opens a short piece of Writing (two lines and one thought kept on it) and a long one (200 lines),
// in a wide window and in a narrow one (where the whole pane scrolls). The note's foot keeps to the pane's foot:
// the "Add a thought…" bar's bottom within 24px of the pane's bottom, the thoughts just over it, never riding up under
// two lines of words. A click in the empty room between the words and the foot puts the caret at the note's end, and
// typing a new line there moves neither the bar nor the thoughts. In the long note the foot comes after the last line.
//
//   QA_ARGS=--sandbox QA_DATA=<a copy of the seeded sandbox> QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/foot-at-bottom.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'

const { check, done } = checks()
const c = await sandbox({ width: 1300, height: 860 })
const { h, v, send } = c
const wait = (ms) => h.waitForTimeout(ms)

const BAR = '[data-thought-dock] [data-composer]'
// The note's own editor: a piece of Writing's title is a field written in the same editor (PlainField, .is-plain),
// and a bare '.note-pane .ProseMirror' found the title first ("Two Lines"), so the caret and scroll were read there.
const BOX = '.note-pane .haligtree-editor-wrapper:not(.is-line, .is-plain) > .haligtree-editor-content'
const DOC = `${BOX} > .ProseMirror`
// Its last block of words, never the offer's place ProseMirror draws after it (extensions/offer-slot.ts).
const LAST = `${DOC} > :not(.mf-offer-holder, .ProseMirror-widget, [contenteditable=false])`
/** Where the foot is: the bar, the thoughts, the pane and the note's last line, in px. */
const where = () => h.evaluate(([BAR, DOC, LAST]) => {
  const r = (el) => el && el.getBoundingClientRect()
  const pane = r(document.querySelector('.note-pane[data-open]'))
  const bar = r(document.querySelector(BAR))
  const thoughts = r(document.querySelector('.note-pane [data-page-thoughts]'))
  const last = r([...document.querySelectorAll(LAST)].filter((one) => one.getClientRects().length).at(-1))
  const words = r(document.querySelector(DOC))
  const round = (one) => one && { top: Math.round(one.top), bottom: Math.round(one.bottom), left: Math.round(one.left), width: Math.round(one.width) }
  return { pane: round(pane), bar: round(bar), thoughts: round(thoughts), last: round(last), words: round(words) }
}, [BAR, DOC, LAST])
const lastLine = () => h.evaluate((LAST) => [...document.querySelectorAll(LAST)].at(-1)?.textContent ?? '', LAST)

const short = async (name, id) => {
  await send('article', id); await wait(2000)
  const at = await where()
  check(`${name}, short note: the bar's bottom is within 24px of the pane's bottom`, !!at.bar && !!at.pane && at.pane.bottom - at.bar.bottom <= 24 && at.pane.bottom - at.bar.bottom >= 0, JSON.stringify(at))
  check(`${name}, short note: its thought sits at the foot, over the bar, not under the words`, !!at.thoughts && at.thoughts.top > (at.pane.top + at.pane.bottom) / 2 && at.thoughts.bottom <= at.bar.top, JSON.stringify(at))
  // A click in the empty middle, between the last line and the thoughts: the caret goes to the note's end.
  const y = Math.round((at.last.bottom + at.thoughts.top) / 2)
  await h.mouse.click(at.words.left + Math.round(at.words.width / 2), y); await wait(200)
  await h.keyboard.type(' and on'); await wait(300)
  check(`${name}, short note: a click in the empty middle puts the caret at the end`, (await lastLine()).endsWith(' and on'), await lastLine())
  // A new line typed: nothing at the foot moves.
  await h.keyboard.press('Enter'); await h.keyboard.type('A third line, written after.'); await wait(400)
  const after = await where()
  check(`${name}, short note: typing a line moves neither the bar nor the thoughts`, after.bar.top === at.bar.top && after.thoughts.top === at.thoughts.top, JSON.stringify({ before: [at.bar.top, at.thoughts.top], after: [after.bar.top, after.thoughts.top] }))
}

const long = async (name, id) => {
  await send('article', id); await wait(2500)
  const at = await where()
  check(`${name}, long note: the bar holds to the pane's foot`, !!at.bar && at.pane.bottom - at.bar.bottom <= 24 && at.pane.bottom - at.bar.bottom >= 0, JSON.stringify(at))
  // Scrolled to the end, whichever box scrolls (the editor's own, wide; the whole pane, narrow).
  await h.evaluate(async (BOX) => {
    for (const box of [document.querySelector('.note-pane[data-open]'), document.querySelector(BOX)]) box && box.scrollTo({ top: box.scrollHeight, behavior: 'instant' })
    await new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(ok)))
  }, BOX)
  await wait(300)
  const end = await where()
  check(`${name}, long note: scrolled to the end, the thoughts and the bar come after the last line`, !!end.last && !!end.thoughts && end.last.bottom <= end.thoughts.top && end.thoughts.bottom <= end.bar.top, JSON.stringify(end))
}

try {
  await v('settings:set', { sounds: false, hintRate: 0 })
  const p = (t) => ({ type: 'paragraph', content: [{ type: 'text', text: t }] })
  const make = async (title, lines) => {
    const id = await v('article:new')
    await v('item:save', id, { title, body: { type: 'doc', content: lines.map(p) } })
    await v('gloss', id, 'A thought kept on it, which belongs at the foot.')
    return id
  }
  const two = await make('Two Lines', ['The first line of a short piece.', 'A second, and that is all for now'])
  const many = await make('Two Hundred Lines', Array.from({ length: 200 }, (_, n) => `Line ${n + 1}, read slowly.`))
  const twoNarrow = await make('Two Lines Narrow', ['The first line of a short piece.', 'A second, and that is all for now'])

  await short('wide', two)
  await long('wide', many)
  await c.size(620, 760); await wait(800)
  await short('narrow', twoNarrow)
  await long('narrow', many)
  check('no page errors', !c.errors.some((one) => one.startsWith('PAGEERROR')), c.errors.join(' | '))
} catch (error) {
  check('the run finishes', false, String(error).slice(0, 400))
} finally {
  await c.close()
  done()
}
