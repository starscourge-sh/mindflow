// Right-click knows what is under it. In a note: a PDF link ("The Law Book,
// p. 2"), a web link, a link to another note and picked words each open the
// block menu with their own lines first, the block's "Turn into" folded under
// them; a plain line keeps the menu it had. The PDF preview is never drawn
// over a menu. Every line checked by running it. Screenshots light and dark.
//   npx electron-vite build --outDir out-ctxmenu
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-ctxmenu/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox node qa/context-menu.mjs
import { mkdirSync } from 'fs'
import { PDFDocument, StandardFonts } from 'pdf-lib'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
import { copiedText } from './pasteboard.mjs'
process.env.QA_ARGS ??= '--sandbox'

const SHOTS = process.env.QA_SHOTS ?? '/private/tmp/claude-501/-Users-starscourge-Documents-forge-mindflow/703b99ba-c755-40e3-a385-896560d19061/scratchpad/context-menu-shots'
mkdirSync(SHOTS, { recursive: true })
const ED = '.note-pane .tiptap.ProseMirror.haligtree-editor:not(.is-line)'
const MENU = '.tiptap-block-menu'
const { check, done } = checks()
const c = await sandbox({ width: 1300, height: 900 })
const { h, v, send, close, electron } = c
const wait = (ms) => h.waitForTimeout(ms)

const makePdf = async () => {
  const pdf = await PDFDocument.create()
  pdf.setTitle('The Law Book')
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  for (let n = 1; n <= 3; n++) pdf.addPage([400, 560]).drawText(`Page ${n} of the law book`, { x: 40, y: 500, size: 18, font })
  return Array.from(await pdf.save())
}
const json = () => h.$eval(ED, (el) => el.editor.getJSON())
const text = async () => JSON.stringify(await json())
const opened = () => electron.evaluate(() => globalThis.opened ?? [])
const clipboard = () => copiedText(electron)
/** The menu's group headings, top to bottom, and its first clicked group. */
const groups = () => h.evaluate((menu) => [...document.querySelectorAll(`${menu} .tiptap-slash-menu-group`)].map((one) => one.textContent), MENU)
const rows = () => h.evaluate((menu) => [...document.querySelectorAll(`${menu} [data-clicked]`)].map((one) => one.dataset.clicked), MENU)
const menuUp = () => h.locator(MENU).first().isVisible().catch(() => false)
const escape = async () => { await h.keyboard.press('Escape'); await wait(300) }
// At its middle; tried again when the line is drawn afresh under it (the note reloading after "Open" and back).
const rightClick = async (selector, tries = 3) => {
  try {
    const one = h.locator(selector).first()
    await one.scrollIntoViewIfNeeded({ timeout: 5000 })
    const box = await one.boundingBox()
    await h.mouse.click(box.x + box.width / 2, box.y + box.height / 2, { button: 'right' })
  } catch (error) {
    if (tries <= 1) throw error
    await wait(400)
    return rightClick(selector, tries - 1)
  }
  await wait(500)
}
const pick = async (data) => { await h.locator(`${MENU} [data-clicked="${data}"]`).first().click(); await wait(600) }

try {
  await v('settings:set', { sounds: false, hintRate: 0 })
  const other = await h.evaluate(() => window.api.captures.create({ kind: 'note', body: { type: 'doc', content: [{ type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Torts reading list' }] }] } }))
  const id = await h.evaluate(() => window.api.captures.create({ kind: 'note', body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Cases to read #ctxprobe' }] }] } }))
  await send('capture', id)
  await h.locator(ED).waitFor({ timeout: 10000 })
  await wait(2500)
  const away = h.locator('[data-celebration] button').first()
  if (await away.count()) { await away.click().catch(() => {}); await wait(600) }

  // A PDF dropped in, as Finder drops it, for a real file in the book.
  const bytes = await makePdf()
  await h.evaluate(([sel, bytes]) => {
    const ed = document.querySelector(sel).editor
    const file = new File([new Uint8Array(bytes)], 'law-book.pdf', { type: 'application/pdf' })
    const data = new DataTransfer()
    data.items.add(file)
    const box = ed.view.dom.getBoundingClientRect()
    ed.view.dom.dispatchEvent(new DragEvent('drop', { dataTransfer: data, bubbles: true, cancelable: true, clientX: box.left + 20, clientY: box.bottom - 4 }))
  }, [ED, bytes])
  await h.waitForSelector('.tiptap-attachment.is-pdf', { timeout: 15000 }).catch(() => {})
  await wait(800)
  const src = (await json()).content.find((one) => one.type === 'attachment')?.attrs?.src
  check('a PDF is in the note to link to', !!src, src)

  // The lines to right-click: a link into the PDF, a web link, a note link, plain words.
  await h.$eval(ED, (el, [src, other]) => {
    const e = el.editor
    const link = (words, href) => ({ type: 'text', text: words, marks: [{ type: 'link', attrs: { href } }] })
    e.commands.insertContentAt(1, [
      { type: 'paragraph', content: [{ type: 'text', text: 'See ' }, link('The Law Book, p. 2', `${src}#page=2&name=law-book.pdf`), { type: 'text', text: ' for duty of care.' }] },
      { type: 'paragraph', content: [{ type: 'text', text: 'Also ' }, link('the court site', 'https://example.com/cases'), { type: 'text', text: ' online.' }] },
      { type: 'paragraph', content: [{ type: 'text', text: 'Next: ' }, { type: 'noteLink', attrs: { id: other, label: 'Torts reading list' } }, { type: 'text', text: ' then rest.' }] },
      { type: 'paragraph', content: [{ type: 'text', text: 'Negligence needs a breach of duty.' }] },
    ])
  }, [src, other])
  await wait(600)

  // 1. A plain line: the menu as it was, "Turn into" first, no clicked group.
  await h.locator(`${ED} p`, { hasText: 'Negligence needs' }).first().click({ button: 'right', position: { x: 30, y: 6 } })
  await wait(500)
  const plain = await groups()
  // The block's own lines come first ("Turn into" is now one of them, under "Block").
  check('a plain line keeps its menu: its block lines first, nothing clicked', ['Turn into', 'Block'].includes(plain[0]) && !(await rows()).length, JSON.stringify(plain))
  await escape()

  // 2. The PDF link: its preview comes on hover, a right-click puts it away for good.
  const PDFLINK = `${ED} a[href*=".pdf"]`
  await h.locator(PDFLINK).first().hover()
  await wait(1500)
  const peekBefore = await h.locator('[data-pdf-peek-card]').count()
  await rightClick(PDFLINK)
  const pdfGroups = await groups()
  const pdfRows = await rows()
  check('PDF link: the first group is the PDF, "PDF, page 2"', pdfGroups[0] === 'PDF, page 2', JSON.stringify(pdfGroups))
  check('PDF link: open at page, copy page link, default app, Finder, remove', ['open-page', 'copy-page', 'default-app', 'finder', 'unlink'].every((one) => pdfRows.includes(one)), JSON.stringify(pdfRows))
  // The block's own rows (Turn into among them) fold into one "Block ›" row: the menu is about the link.
  check('PDF link: the block\'s rows are folded into one "Block ›" line under it', (await h.locator(`${MENU} [data-block-sub]`).count()) === 1 && (await h.locator(`${MENU} [data-turn-into-sub]`).count()) === 0)
  const filter = await h.evaluate((menu) => { const box = document.querySelector(`${menu} input`); return { quiet: box?.hasAttribute('data-quiet'), height: box?.getBoundingClientRect().height, focused: document.activeElement === box } }, MENU)
  check('a right-click menu shows no "Filter…" box, yet holds the keys', filter.quiet && filter.height === 0 && filter.focused, JSON.stringify(filter))
  await h.keyboard.type('finder')
  await wait(300)
  const filtered = await rows()
  check('… typing filters it, as a Mac menu does ("finder" leaves Show in Finder)', JSON.stringify(filtered) === '["finder"]' && (await h.locator(`${MENU} input`).first().boundingBox()).height > 0, JSON.stringify(filtered))
  await h.locator(`${MENU} input`).first().fill(''); await wait(200)
  await h.mouse.move(10, 10)
  await wait(400)
  await h.locator(PDFLINK).first().hover().catch(() => {})
  await wait(1200)
  check('no PDF preview is drawn while the menu is open', (await h.locator('[data-pdf-peek-card]').count()) === 0 && (await menuUp()), `peek before the right-click: ${peekBefore}`)
  await h.screenshot({ path: `${SHOTS}/pdf-link-light.png` })
  await pick('copy-page')
  check('"Copy link to this page" copies the page link', (await clipboard()).includes(`${src}#page=2`), await clipboard())
  await rightClick(PDFLINK)
  await pick('finder')
  check('"Show in Finder" shows the file', (await opened()).some((one) => /law-book|\.pdf$/.test(one)), JSON.stringify(await opened()))
  await rightClick(PDFLINK)
  await pick('default-app')
  check('"Open in the default app" opens the file', (await opened()).filter((one) => /\.pdf$/.test(one)).length >= 1, JSON.stringify(await opened()))
  await rightClick(PDFLINK)
  await pick('open-page')
  await h.waitForSelector('.pdf-reader', { timeout: 10000 }).catch(() => {})
  check('"Open at page 2" opens the reader', (await h.locator('.pdf-reader').count()) > 0)
  await h.evaluate(() => history.back())
  await h.keyboard.press('Meta+[')
  await wait(1200)
  await send('capture', id)
  await h.locator(ED).waitFor({ timeout: 10000 })
  await wait(1200)
  await rightClick(PDFLINK)
  await pick('unlink')
  const afterPdf = await text()
  check('PDF link: "Remove link" keeps the words', afterPdf.includes('The Law Book, p. 2') && !afterPdf.includes('#page=2'), '')

  // 3. A web link.
  const WEB = `${ED} a[href^="https://example.com"]`
  await rightClick(WEB)
  const webGroups = await groups()
  const webRows = await rows()
  await h.screenshot({ path: `${SHOTS}/web-link-light.png` })
  check('web link: the first group is the link', webGroups[0] === 'Link', JSON.stringify(webGroups))
  check('web link: browser, read here, copy, edit, remove', ['browser', 'read', 'copy-link', 'edit-link', 'unlink'].every((one) => webRows.includes(one)), JSON.stringify(webRows))
  await pick('copy-link')
  check('"Copy link" copies its address', (await clipboard()) === 'https://example.com/cases', await clipboard())
  await rightClick(WEB)
  await pick('browser')
  check('"Open in the browser" opens it there', (await opened()).includes('https://example.com/cases'), JSON.stringify(await opened()))
  await rightClick(WEB)
  await pick('edit-link')
  check('"Edit link" opens the link box', (await h.locator('[data-link-editor]').count()) > 0)
  await escape()
  await rightClick(WEB)
  await pick('unlink')
  const afterWeb = await text()
  check('web link: "Remove link" keeps the words', afterWeb.includes('the court site') && !afterWeb.includes('example.com'))

  // 4. A link to a note.
  const NOTE = `${ED} a[data-note]`
  await rightClick(NOTE)
  const noteGroups = await groups()
  const noteRows = await rows()
  check('note link: the first group is the note link', noteGroups[0] === 'Link to a note', JSON.stringify(noteGroups))
  check('note link: open, to the side, new window, copy link, edit text, remove', ['open', 'aside', 'apart', 'copy-link', 'edit-text', 'unlink'].every((one) => noteRows.includes(one)), JSON.stringify(noteRows))
  await h.screenshot({ path: `${SHOTS}/note-link-light.png` })
  await pick('copy-link')
  check('"Copy link" copies a link to the note', (await clipboard()).includes(other), await clipboard())
  await rightClick(NOTE)
  await pick('open')
  check('"Open" opens the linked note', await h.locator('.note-pane h1', { hasText: 'Torts reading list' }).first().isVisible().catch(() => false))
  await send('capture', id)
  await h.locator(ED).waitFor({ timeout: 10000 })
  await wait(1200)
  await rightClick(NOTE)
  await pick('unlink')
  const afterNote = await json()
  check('note link: "Remove link" keeps its words', JSON.stringify(afterNote).includes('Torts reading list') && !JSON.stringify(afterNote).includes('"noteLink"'))

  // 5. Picked words.
  await h.$eval(ED, (el) => {
    const e = el.editor
    let at = -1
    e.state.doc.descendants((node, pos) => { if (at < 0 && node.isText && node.text.includes('breach of duty')) at = pos + node.text.indexOf('breach of duty') })
    e.chain().focus().setTextSelection({ from: at, to: at + 'breach of duty'.length }).run()
  })
  await wait(300)
  const word = await h.evaluate(() => {
    const range = window.getSelection().getRangeAt(0).getBoundingClientRect()
    return { x: range.left + range.width / 2, y: range.top + range.height / 2 }
  })
  await h.mouse.click(word.x, word.y, { button: 'right' })
  await wait(500)
  const wordGroups = await groups()
  const wordRows = await rows()
  check('picked words: the first group is the words', wordGroups[0] === 'Picked words', JSON.stringify(wordGroups))
  check('picked words: look up, search, card, highlight, copy, cut', ['look-up', 'search', 'card', 'highlight', 'copy-words', 'cut-words'].every((one) => wordRows.includes(one)), JSON.stringify(wordRows))
  await h.screenshot({ path: `${SHOTS}/words-light.png` })
  await pick('card')
  check('"Make a card from it" writes a card line under it', (await text()).includes('breach of duty :: '))

  // 5b. The other kinds: a tag, a formula, a "[m:ss]", a video, a web link kept.
  const answer = async (typed) => { await wait(500); await h.keyboard.press('Meta+a'); await h.keyboard.type(typed); await h.keyboard.press('Enter'); await wait(600) }
  await h.$eval(ED, (el) => el.editor.commands.insertContentAt(1, [
    { type: 'youtube', attrs: { src: 'https://www.youtube.com/watch?v=aqz-KE-bpKQ' } },
    { type: 'paragraph', content: [{ type: 'text', text: 'Area is ' }, { type: 'inlineMath', attrs: { latex: 'x^2' } }, { type: 'text', text: ' here.' }] },
    { type: 'paragraph', content: [{ type: 'text', text: '[1:30] the lecture on duty' }] },
    { type: 'paragraph', content: [{ type: 'text', text: 'the bar site', marks: [{ type: 'link', attrs: { href: 'https://example.net/bar' } }] }] },
  ]))
  await wait(800)
  await rightClick(`${ED} .tiptap-token[data-token="tag"]`)
  await wait(300)
  const tagGroups = await groups()
  await h.screenshot({ path: `${SHOTS}/tag-light.png` })
  check('tag: the tag group leads, the block folded under "Block ›" (a spelling fix may lead)', tagGroups.includes('#ctxprobe') && (await h.locator(`${MENU} [data-block-sub]`).count()) === 1, JSON.stringify(tagGroups))
  await pick('copy-tag')
  check('tag: "Copy tag" copies it', (await clipboard()) === '#ctxprobe', await clipboard())
  await rightClick(`${ED} .tiptap-token[data-token="tag"]`)
  await pick('open-tag')
  check('tag: "Open #ctxprobe" opens its page', await h.locator('h1', { hasText: 'ctxprobe' }).first().isVisible().catch(() => false))
  await send('capture', id); await h.locator(ED).waitFor({ timeout: 10000 }); await wait(1200)
  const MATH = `${ED} [data-type="inline-math"]`
  await rightClick(MATH)
  await h.screenshot({ path: `${SHOTS}/formula-light.png` })
  check('formula: the first group is the formula', (await groups())[0] === 'Formula', JSON.stringify(await groups()))
  await pick('copy-latex')
  check('formula: "Copy as LaTeX" copies $x^2$', (await clipboard()) === '$x^2$', await clipboard())
  await rightClick(MATH)
  await pick('edit-formula')
  await answer('y^3')
  check('formula: "Edit formula…" changes it', (await text()).includes('y^3'), '')
  await rightClick(`${ED} .mf-time-link[data-seconds]`)
  await h.screenshot({ path: `${SHOTS}/time-light.png` })
  check('time: the first group is the time', (await groups())[0] === 'Time 1:30', JSON.stringify(await groups()))
  check('time: play from it, copy it', JSON.stringify(await rows()) === '["play","copy-time"]', JSON.stringify(await rows()))
  await pick('copy-time')
  check('time: "Copy the time" copies [1:30]', (await clipboard()) === '[1:30]', await clipboard())
  await rightClick(`${ED} [data-youtube-video]`)
  await h.screenshot({ path: `${SHOTS}/video-light.png` })
  check('video: the first group is the video, with its address', (await groups())[0] === 'Video' && (await rows()).includes('copy-link'), JSON.stringify(await groups()))
  await escape()
  await rightClick(`${ED} a[href="https://example.net/bar"]`)
  await pick('keep-link')
  await wait(800)
  const kept = await h.evaluate(async () => (await window.api.captures.cards()).some((one) => one.kind === 'link' && JSON.stringify(one.body ?? '').includes('example.net/bar')))
  check('web link: "Keep the link" keeps it in the Inbox as a link', kept)

  // 6. Dark: the same menu, drawn in the dark theme.
  await h.keyboard.press('Meta+z')
  await wait(300)
  await c.theme('dark')
  await send('capture', id)
  await h.locator(ED).waitFor({ timeout: 10000 })
  await wait(1500)
  await h.$eval(ED, (el, src) => el.editor.commands.insertContentAt(1, { type: 'paragraph', content: [{ type: 'text', text: 'The Law Book, p. 3', marks: [{ type: 'link', attrs: { href: `${src}#page=3&name=law-book.pdf` } }] }] }), src)
  await wait(500)
  await rightClick(`${ED} a[href*="page=3"]`)
  check('dark: the PDF link menu opens with its group first', (await groups())[0] === 'PDF, page 3', JSON.stringify(await groups()))
  await h.screenshot({ path: `${SHOTS}/pdf-link-dark.png` })
  await escape()

  // 7. A locked note (read-only): the link's own lines, nothing that edits, no block lines.
  await h.$eval(ED, (el) => el.editor.setEditable(false))
  await wait(300)
  await rightClick(".note-pane .ProseMirror a[href*=\"page=3\"]")
  const lockedGroups = await groups()
  const lockedRows = await rows()
  check('locked note: a PDF link still gets its own menu, and only that', JSON.stringify(lockedGroups) === '["PDF, page 3"]', JSON.stringify(lockedGroups))
  check('locked note: nothing that edits (no change page, no remove)', lockedRows.includes('open-page') && !lockedRows.includes('change-page') && !lockedRows.includes('unlink'), JSON.stringify(lockedRows))
  await h.screenshot({ path: `${SHOTS}/locked-dark.png` })
  await pick('copy-page')
  check('locked note: "Copy link to this page" works', (await clipboard()).includes('#page=3'), await clipboard())
  await h.$eval(".note-pane .ProseMirror", (el) => el.editor.setEditable(true))
  check('locked note: a right-click never follows the link', (await h.locator('.pdf-reader').count()) === 0)

  // 7b. "Change page…" and "Rename…", through the app's question box.
  await rightClick(`${ED} a[href*="page=3"]`)
  await pick('change-page')
  await answer('5')
  check('"Change page…" points the link at the page typed', (await text()).includes('page=5'), '')
  const gem = await v('article:new')
  await v('item:save', gem, { title: 'Duty of care', body: { type: 'doc', content: [{ type: 'paragraph' }] } })
  await h.$eval(ED, (el, gem) => el.editor.commands.insertContentAt(1, { type: 'paragraph', content: [{ type: 'noteLink', attrs: { id: `article:${gem}`, label: 'Duty of care' } }] }), gem)
  await wait(500)
  await rightClick(`${ED} a[data-note]`)
  await pick('rename')
  await answer('Duty of care, in full')
  check('"Rename…" renames the note the link points at', (await v('item', gem))?.title === 'Duty of care, in full', (await v('item', gem))?.title)

  // 7c. Beside the sidebar's row menu: the same rows, light and dark.
  await h.locator(`${ED} a[data-note]`).first().hover(); await wait(1500)
  const cardBefore = await h.locator("[data-note-preview]").count()
  await rightClick(`${ED} a[data-note]`)
  await h.locator(`${ED} a[data-note]`).first().hover().catch(() => {}); await wait(1200)
  check("no note card is drawn while the menu is open", (await h.locator("[data-note-preview]").count()) === 0, `card before the right-click: ${cardBefore}`)
  const ours = await h.evaluate((menu) => { const row = document.querySelector(`${menu} [data-clicked]`); const s = getComputedStyle(row); const m = getComputedStyle(document.querySelector(menu)); return { row: row.getBoundingClientRect().height, font: s.fontSize, radius: m.borderRadius, bg: m.backgroundColor } }, MENU)
  await h.screenshot({ path: `${SHOTS}/note-link-dark.png` })
  await escape()
  const side = await h.evaluate(() => { const one = [...document.querySelectorAll("a, button, [data-row], div, span")].find((el) => el.textContent.trim() === "Start here" && el.getBoundingClientRect().left < 300 && el.getBoundingClientRect().height > 0); const r = one?.getBoundingClientRect(); return r ? { x: r.left + 20, y: r.top + r.height / 2 } : null })
  if (side) await h.mouse.click(side.x, side.y, { button: "right" })
  await wait(500)
  const theirs = await h.evaluate(() => { const menu = document.querySelector('[role="menu"]'); const row = menu?.querySelector('[role="menuitem"]'); if (!menu || !row) return null; const s = getComputedStyle(row); const m = getComputedStyle(menu); return { row: row.getBoundingClientRect().height, font: s.fontSize, radius: m.borderRadius, bg: m.backgroundColor } })
  await h.screenshot({ path: `${SHOTS}/sidebar-menu-dark.png` })
  await escape()
  check('rows match the sidebar row menu (height, words, corners, fill)', !!theirs && Math.abs(ours.row - theirs.row) <= 1 && ours.font === theirs.font && ours.radius === theirs.radius && ours.bg === theirs.bg, `${JSON.stringify(ours)} vs ${JSON.stringify(theirs)}`)

  // 8. A note with no block handles: Read through, from the Inbox (the newest note first).
  await h.$eval(ED, (el) => el.editor.commands.insertContentAt(1, { type: 'paragraph', content: [{ type: 'text', text: 'the statute', marks: [{ type: 'link', attrs: { href: 'https://example.org/statute' } }] }] }))
  await wait(1200)
  await c.go('inbox'); await wait(800)
  await h.keyboard.press('Meta+Shift+r'); await wait(1500)
  const READ = '.mf-read .ProseMirror a[href="https://example.org/statute"]'
  check('read through: the note with the link is on show', (await h.locator(READ).count()) > 0)
  await rightClick(READ)
  const readGroups = await groups()
  check('read through (no handles): a web link gets its own menu, and only that', JSON.stringify(readGroups) === '["Link"]', JSON.stringify(readGroups))
  await h.screenshot({ path: `${SHOTS}/read-through-dark.png` })
  await pick('copy-link')
  check('read through: "Copy link" copies its address', (await clipboard()) === 'https://example.org/statute', await clipboard())
} catch (error) {
  check('probe ran to the end', false, String(error?.stack ?? error))
} finally {
  await close()
}
done()
