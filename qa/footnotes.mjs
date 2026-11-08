// Footnotes walked as a person writes them: "/" "Footnote", the note typed,
// Esc back, a second typed as [^] before the first (both renumber), a rest on
// a mark for its card, a click to its note and the way back, a mark deleted
// and ⌘Z, Obsidian Markdown pasted, exported and read back, three themes.
// Frames under QA_SHOTS, to be read by eye.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox node qa/footnotes.mjs
import { mkdirSync } from 'node:fs'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const { check, done } = checks()
const c = await sandbox({ width: 1100, height: 800 })
const { h, v } = c
const shots = process.env.QA_SHOTS
if (shots) mkdirSync(shots, { recursive: true })
const wait = (ms) => h.waitForTimeout(ms)
const sel = '[data-open] .tiptap'
const shot = async (name) => shots && h.screenshot({ path: `${shots}/fn-${name}.png` })
const film = async (name, count = 8) => { for (let i = 0; i < count; i++) { await shot(`${name}-${String(i).padStart(2, '0')}`); await wait(50) } }
const p = (text) => ({ type: 'paragraph', content: text ? [{ type: 'text', text }] : [] })
const ed = (fn, arg) => h.evaluate(([sel, fn, arg]) => new Function('editor', 'arg', `return (${fn})(editor, arg)`)(document.querySelector(sel).editor, arg), [sel, fn.toString(), arg])
const type = (text) => h.keyboard.type(text, { delay: 12 })
// What the note holds: each mark's number and name, each note's name and words, and where the caret is.
const state = () => ed((editor) => {
  const marks = []; const notes = []; let caret = null
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name === 'footnoteReference') marks.push({ n: node.attrs.n, id: node.attrs.id, pos })
    if (node.type.name === 'footnote') notes.push({ id: node.attrs.id, text: node.textContent })
  })
  const { $head } = editor.state.selection
  for (let d = $head.depth; d > 0; d--) if ($head.node(d).type.name === 'footnote') caret = { inNote: $head.node(d).attrs.id }
  return { marks, notes, caret: caret ?? { at: editor.state.selection.from }, last: editor.state.doc.lastChild.type.name }
})
const paste = (text) => h.evaluate(([sel, text]) => {
  const data = new DataTransfer()
  data.setData('text/plain', text)
  document.querySelector(sel).dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }))
}, [sel, text])
const fresh = async (content) => {
  await ed((editor, content) => editor.chain().setContent({ type: 'doc', content }).run(), content)
  await wait(150)
}

try {
  await v('settings:set', { sounds: false, hintRate: 0 })
  const id = await v('article:new')
  await v('item:save', id, { title: 'Why Hamlet waits', body: { type: 'doc', content: [p('Start.')] } })
  await c.send('article', id); await wait(1500)

  // 1. "/" "Footnote" after the first sentence: the menu and its card, then the caret in the new note.
  await fresh([p('Hamlet waits because he cannot be sure.'), p('The play turns on it.')])
  await ed((editor) => editor.chain().focus().setTextSelection(1 + 'Hamlet waits because he cannot be sure.'.length).run())
  await type(' /'); await wait(300); await type('footn'); await wait(500)
  const picked = await h.evaluate(() => document.querySelector('.tiptap-slash-menu .is-selected')?.textContent ?? '')
  const peek = await h.evaluate(() => [...document.querySelectorAll('[data-peek-card], .mf-peek-card, [data-beside-peek]')].map((one) => one.textContent).join(' | ') || document.body.innerText.includes('its note at the foot of the page'))
  await shot('slash-menu')
  check('"/" "footn" picks "Footnote", its card beside it', /Footnote/.test(picked) && !!peek, JSON.stringify({ picked, peek: String(peek).slice(0, 120) }))
  await h.keyboard.press('Enter'); await wait(400)
  let s = await state()
  check('Enter makes mark 1, its note at the foot, the caret in the note', s.marks.length === 1 && s.marks[0].n === 1 && s.notes.length === 1 && s.caret.inNote === s.marks[0].id && s.last === 'footnotes', JSON.stringify(s))
  const hug = await ed((editor, at) => editor.state.doc.textBetween(1, at), s.marks[0]?.pos ?? 1)
  check('the mark hugs the word before it, the space the "/" needed gone', hug === 'Hamlet waits because he cannot be sure.', JSON.stringify(hug))
  await type('A ghost could be a devil in disguise.')
  s = await state()
  check('the typed words land in the note', s.notes[0].text === 'A ghost could be a devil in disguise.', JSON.stringify(s.notes))
  await film('typed', 3)

  // 2. Esc goes back to the mark.
  await h.keyboard.press('Escape'); await wait(200)
  s = await state()
  check('Esc in the note puts the caret just after its mark', s.caret.at === s.marks[0].pos + 1, JSON.stringify(s))

  // 3. A second, typed as [^] before the first: numbered 1, the old one 2, the notes in that order.
  await ed((editor) => editor.chain().focus().setTextSelection(1 + 'Hamlet'.length).run()); await wait(250)
  await type('[^]'); await wait(300)
  s = await state()
  check('typing [^] makes a mark, the caret in its new note', s.marks.length === 2 && !!s.caret.inNote, JSON.stringify(s))
  await type('Prince of Denmark.')
  s = await state()
  const shown = await h.evaluate((sel) => [...document.querySelectorAll(`${sel} sup.mf-footnote-ref`)].map((one) => one.textContent), sel)
  check('the new one is 1 and the old one 2, in the line and at the foot', JSON.stringify(shown) === '["1","2"]' && s.marks[0].n === 1 && s.marks[1].n === 2 && s.notes.map((one) => one.text).join('|') === 'Prince of Denmark.|A ghost could be a devil in disguise.' && s.notes[0].id === s.marks[0].id, JSON.stringify({ shown, s }))
  const raw = await ed((editor) => editor.getText())
  check('no [^] left as words in the line', !raw.includes('[^'), raw.slice(0, 120))
  await h.keyboard.press('Escape'); await wait(200)
  await shot('two')

  // 4. A rest on mark 2: one card, "Footnote 2", its words.
  await h.mouse.move(10, 10)
  const box = await h.evaluate((sel) => { const r = document.querySelectorAll(`${sel} sup.mf-footnote-ref`)[1].getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, w: r.width, h: r.height } }, sel)
  await h.mouse.move(box.x - 30, box.y + 2, { steps: 4 })
  await h.mouse.move(box.x, box.y, { steps: 6 })
  await film('hover', 16)
  const card = await h.evaluate(() => [...document.querySelectorAll('[data-note-preview]')].map((one) => one.innerText))
  const floats = await h.evaluate(() => document.querySelectorAll('[data-note-preview], [role="tooltip"]').length)
  const cursor = await h.evaluate((sel) => getComputedStyle(document.querySelectorAll(`${sel} sup.mf-footnote-ref`)[1]).cursor, sel)
  check('a rest on mark 2 shows one card: "Footnote 2" and its words', card.length === 1 && /Footnote 2/.test(card[0]) && /A ghost could be a devil/.test(card[0]) && floats === 1, JSON.stringify({ card, floats }))
  check('a mark shows the hand', cursor === 'pointer', cursor)
  const after = await h.evaluate((sel) => { const r = document.querySelectorAll(`${sel} sup.mf-footnote-ref`)[1].getBoundingClientRect(); return { w: r.width, h: r.height } }, sel)
  check('the mark does not move or grow on hover', Math.abs(after.w - box.w) < 0.5 && Math.abs(after.h - box.h) < 0.5, JSON.stringify({ box, after }))

  // 5. A click on mark 1 goes to its note; the arrow there comes back.
  await h.mouse.click(...await h.evaluate((sel) => { const r = document.querySelectorAll(`${sel} sup.mf-footnote-ref`)[0].getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2] }, sel))
  await film('jump', 8)
  s = await state()
  const cardAfter = await h.evaluate(() => document.querySelectorAll('[data-note-preview]').length)
  check('a click on mark 1 puts the caret at the end of note 1, and the card goes', s.caret.inNote === s.marks[0].id && cardAfter === 0, JSON.stringify({ caret: s.caret, cardAfter }))
  await h.mouse.move(10, 10); await wait(400)
  const back = await h.evaluate((sel) => { const b = document.querySelector(`${sel} li[data-footnote] .mf-footnote-back`); const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, cursor: getComputedStyle(b).cursor, label: b.getAttribute('aria-label') } }, sel)
  await h.mouse.move(back.x, back.y, { steps: 3 }); await wait(150); await shot('back-hover')
  await h.mouse.click(back.x, back.y); await wait(300)
  s = await state()
  check('the arrow by note 1 shows the hand and goes back to just after mark 1', back.cursor === 'pointer' && s.caret.at === s.marks[0].pos + 1, JSON.stringify({ back, caret: s.caret, mark: s.marks[0] }))
  await film('back', 6)

  // 6. Deleting mark 2 takes its note; ⌘Z brings both back.
  await ed((editor) => { let at = 0; editor.state.doc.descendants((node, pos) => { if (node.type.name === 'footnoteReference' && node.attrs.n === 2) at = pos }); editor.chain().focus().setTextSelection(at + 1).run() })
  await h.keyboard.press('Backspace'); await wait(250)
  s = await state()
  check('Backspace on mark 2 removes it and its note', s.marks.length === 1 && s.notes.length === 1 && s.notes[0].text === 'Prince of Denmark.', JSON.stringify(s))
  await shot('deleted')
  await h.keyboard.press('Meta+z'); await wait(300)
  s = await state()
  check('⌘Z brings the mark and its words back, numbered 2', s.marks.length === 2 && s.notes.length === 2 && s.marks[1].n === 2 && s.notes[1].text === 'A ghost could be a devil in disguise.', JSON.stringify(s))
  // Deleting mark 1 renumbers the other to 1.
  await ed((editor) => { let at = 0; editor.state.doc.descendants((node, pos) => { if (node.type.name === 'footnoteReference' && node.attrs.n === 1) at = pos }); editor.chain().focus().setTextSelection(at + 1).run() })
  await h.keyboard.press('Backspace'); await wait(250)
  s = await state()
  const shownNow = await h.evaluate((sel) => [...document.querySelectorAll(`${sel} sup.mf-footnote-ref`)].map((one) => one.textContent), sel)
  check('deleting mark 1 renumbers the ghost one to 1', s.marks.length === 1 && s.marks[0].n === 1 && JSON.stringify(shownNow) === '["1"]' && s.notes[0].text === 'A ghost could be a devil in disguise.', JSON.stringify({ s, shownNow }))
  await h.keyboard.press('Meta+z'); await wait(300)

  // 6b. Right-click on mark 2: its own lines first; "Remove footnote" takes both, ⌘Z brings them back.
  const two = await h.evaluate((sel) => { const r = document.querySelectorAll(`${sel} sup.mf-footnote-ref`)[1].getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2] }, sel)
  await h.mouse.click(two[0], two[1], { button: 'right' }); await wait(500)
  await shot('right-click')
  const rows = await h.evaluate(() => [...document.querySelectorAll('[role="menuitem"]')].map((one) => one.textContent.trim()).filter(Boolean).slice(0, 6))
  const icons = await h.evaluate(() => [...document.querySelectorAll('[role="menuitem"]')].filter((one) => /footnote/i.test(one.textContent)).map((one) => !!one.querySelector('svg')))
  check('right-click on a mark offers "Go to the footnote" and "Remove footnote" first, each with an icon', /Go to the footnote/.test(rows.join('|')) && /Remove footnote/.test(rows.join('|')) && icons.length === 2 && icons.every(Boolean), JSON.stringify({ rows, icons }))
  await h.evaluate(() => [...document.querySelectorAll('[role="menuitem"]')].find((one) => /Remove footnote/.test(one.textContent))?.click()); await wait(400)
  s = await state()
  check('"Remove footnote" takes mark 2 and its note', s.marks.length === 1 && s.notes.length === 1, JSON.stringify(s))
  await h.keyboard.press('Meta+z'); await wait(300)
  s = await state()
  check('⌘Z after "Remove footnote" brings both back', s.marks.length === 2 && s.notes.length === 2, JSON.stringify(s))

  // 7. Export as Markdown, then read back: the same marks and notes.
  const md = await ed((editor) => editor.storage.markdown.manager.serialize(editor.getJSON()))
  console.log('EXPORT', JSON.stringify(md))
  check('Markdown export writes [^1] [^2] in the line and [^n]: lines at the foot', /Hamlet\[\^1\]/.test(md) && /sure\.\[\^2\]/.test(md) && /\[\^1\]: Prince of Denmark\./.test(md) && /\[\^2\]: A ghost could be a devil in disguise\./.test(md), md)
  await fresh([p('')])
  await ed((editor) => editor.commands.focus('start'))
  await paste(md); await wait(400)
  s = await state()
  check('the export pasted back reads as the same two footnotes', s.marks.length === 2 && s.notes.map((one) => one.text).join('|') === 'Prince of Denmark.|A ghost could be a devil in disguise.' && s.last === 'footnotes', JSON.stringify(s))
  const again = await ed((editor) => editor.storage.markdown.manager.serialize(editor.getJSON()))
  check('and exports again word for word', again.trim() === md.trim(), JSON.stringify(again))

  // 8. Obsidian's Markdown pasted: [^label], ^[inline], a two-line note, and a mark with no note stays words.
  await fresh([p('')])
  await ed((editor) => editor.commands.focus('start'))
  await paste('Rome fell slowly[^gibbon] and then all at once^[Hemingway, roughly.]. See also [^nowhere].\n\nA second paragraph[^two].\n\n[^gibbon]: Gibbon, volume 1.\n[^two]: First line.\n\n    Second paragraph of it.\n')
  await wait(400)
  s = await state()
  const words = await ed((editor) => editor.state.doc.firstChild.textContent)
  check('pasted Obsidian Markdown: three footnotes, numbered in order, a mark with no note left as words', s.marks.length === 3 && s.marks.map((one) => one.n).join() === '1,2,3' && s.notes.map((one) => one.text).join('|') === 'Gibbon, volume 1.|Hemingway, roughly.|First line.Second paragraph of it.' && words.includes('[^nowhere]'), JSON.stringify({ s, words }))
  await shot('obsidian-paste')

  // 9. Three themes and the smallest window.
  await fresh([p('Hamlet waits because he cannot be sure.'), p('The play turns on it.')])
  await ed((editor) => editor.chain().focus().setTextSelection(1 + 'Hamlet'.length).insertFootnote().insertContent('Prince of Denmark.').run())
  await ed((editor) => { let at = 0; editor.state.doc.forEach((node, pos) => { if (node.type.name === 'paragraph' && node.textContent.startsWith('Hamlet')) at = pos + node.nodeSize - 1 }); editor.chain().setTextSelection(at).insertFootnote().insertContent('A ghost could be a devil in disguise, Act 2.').run() })
  await h.mouse.move(10, 10); await wait(300)
  s = await state()
  check('two inserted by command in a row: both marks and notes', s.marks.length === 2 && s.notes.map((one) => one.text).join('|') === 'Prince of Denmark.|A ghost could be a devil in disguise, Act 2.', JSON.stringify(s))
  for (const theme of ['paper', 'light', 'dark']) {
    await h.evaluate((n) => { localStorage.setItem('theme', n); window.dispatchEvent(new StorageEvent('storage', { key: 'theme' })) }, theme); await wait(500)
    await shot(`theme-${theme}`)
    const ink = await h.evaluate((sel) => { const li = document.querySelector(`${sel} .mf-footnotes`); const ref = document.querySelector(`${sel} sup.mf-footnote-ref`); return { foot: getComputedStyle(li).color, line: getComputedStyle(li).borderTopColor, ref: getComputedStyle(ref).color } }, sel)
    console.log('THEME', theme, JSON.stringify(ink))
  }
  await h.evaluate(() => { localStorage.setItem('theme', 'paper'); window.dispatchEvent(new StorageEvent('storage', { key: 'theme' })) }); await wait(400)
  await c.size(560, 400); await wait(400)
  await ed((editor) => editor.commands.scrollIntoView())
  await h.evaluate((sel) => document.querySelector(`${sel} .mf-footnotes`).scrollIntoView({ block: 'center' }), sel); await wait(200)
  const narrow = await h.evaluate((sel) => { const f = document.querySelector(`${sel} .mf-footnotes`).getBoundingClientRect(); return { right: f.right, width: window.innerWidth, sideways: document.scrollingElement.scrollWidth > window.innerWidth } }, sel)
  await shot('narrow')
  check('at 560 x 400 the notes fit, no sideways scroll', narrow.right <= narrow.width && !narrow.sideways, JSON.stringify(narrow))
  check('no page errors', !c.errors.some((one) => /PAGEERROR/.test(one)), c.errors.join(' / ').slice(0, 400))
} finally {
  await c.close()
}
done()
