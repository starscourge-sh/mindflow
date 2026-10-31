// A toast opens what it announces: a card made in the PDF reader opens on a
// click, to the side on ⌥-click, and from its right-click menu; hovering keeps
// it up. A gem kept, the Bin and a link kept in the Inbox open too.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-toast/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox node qa/toast-opens.mjs
import { PDFDocument, StandardFonts } from 'pdf-lib'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const makePdf = async () => {
  const pdf = await PDFDocument.create()
  pdf.setTitle('The Toast Book')
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  for (let n = 1; n <= 3; n++) {
    const page = pdf.addPage([400, 560])
    page.drawText(`Page ${n} of the toast book`, { x: 40, y: 500, size: 18, font })
    page.drawText(`A quiet sentence worth keeping on page ${n}.`, { x: 40, y: 460, size: 12, font })
  }
  return Array.from(await pdf.save())
}

const { check, done } = checks()
const c = await sandbox({ width: 1400, height: 900 })
const { h, v } = c
const wait = (ms) => h.waitForTimeout(ms)
const SHOTS = process.env.QA_SHOTS ?? '/tmp'
const EDITOR = '[data-open] .tiptap'
const TOAST = '[data-toast-made]'
const panes = () => h.evaluate(() => document.querySelectorAll('[data-pane]').length)
/** Back to one pane, as ⌃W closes the one in front. */
const single = async () => { for (let i = 0; i < 4 && (await panes()) > 1; i++) { await h.keyboard.press('Control+w'); await h.waitForTimeout(500) } }
const shown = (words) => h.evaluate((words) => document.body.innerText.includes(words), words)

try {
  await v('settings:set', { sounds: false, hintRate: 0 })
  const id = await v('article:new')
  await v('item:save', id, { title: 'Toast book note', body: { type: 'doc', content: [{ type: 'paragraph' }] } })
  await c.send('article', id); await wait(1400)
  const bytes = await makePdf()
  await h.evaluate(([sel, bytes]) => {
    const ed = document.querySelector(sel).editor
    const data = new DataTransfer()
    data.items.add(new File([new Uint8Array(bytes)], 'toast-book.pdf', { type: 'application/pdf' }))
    const box = ed.view.dom.getBoundingClientRect()
    ed.view.dom.dispatchEvent(new DragEvent('drop', { dataTransfer: data, bubbles: true, cancelable: true, clientX: box.left + 20, clientY: box.top + 10 }))
  }, [EDITOR, bytes])
  await h.waitForSelector('.tiptap-attachment.is-pdf .pdf-page[data-page="1"] .textLayer span', { timeout: 15000 }).catch(() => {})
  await wait(600)
  const src = await h.evaluate((sel) => {
    let src = ''
    document.querySelector(sel).editor.state.doc.descendants((node) => void (node.type.name === 'attachment' && (src = node.attrs.src)))
    return src
  }, EDITOR)
  /** The book open in the reader, full size, in the pane in front. */
  const reader = async () => {
    await h.evaluate((src) => window.dispatchEvent(new CustomEvent('haligtree:pdf', { detail: { src, name: 'toast-book.pdf', page: 2 } })), src)
    await h.waitForSelector('.pdf-reader .pdf-page[data-page="2"] .textLayer span', { timeout: 15000 }).catch(() => {})
    await wait(800)
  }
  const pick = (page, words) => h.evaluate(([page, words]) => {
    const span = [...document.querySelectorAll(`.pdf-reader .pdf-page[data-page="${page}"] .textLayer span`)].find((one) => one.textContent.includes(words))
    const at = span.textContent.indexOf(words)
    const range = document.createRange()
    range.setStart(span.firstChild, at)
    range.setEnd(span.firstChild, at + words.length)
    getSelection().removeAllRanges()
    getSelection().addRange(range)
  }, [page, words])
  /** A card made the way a reader makes one: words picked, C, the question, Return. */
  const card = async (question) => {
    await reader()
    await pick(2, 'worth keeping'); await wait(500)
    await h.keyboard.press('c'); await wait(400)
    await h.keyboard.type(question); await h.keyboard.press('Enter')
    await h.waitForSelector(TOAST, { timeout: 4000 }).catch(() => {})
    return (await v('items', 'nugget')).find((one) => one.prompt === question)
  }

  // 1. A click on the toast's words opens the card.
  const one = await card('What is worth keeping, one?')
  const said = await h.evaluate((sel) => ({ text: document.querySelector(sel)?.textContent, made: document.querySelector(sel)?.getAttribute('data-toast-made'), cursor: document.querySelector(sel) && getComputedStyle(document.querySelector(sel)).cursor }), TOAST)
  check('making a card says "Card made" and carries the card', /^Card made/.test(said.text ?? '') && said.made === `nugget:${one?.id}`, JSON.stringify(said))
  check('its words show the hand', said.cursor === 'pointer', said.cursor)
  await c.both(`${SHOTS}/toast-rest`)
  await h.hover(TOAST); await wait(250)
  check('pointed at, its words are underlined', await h.evaluate((sel) => getComputedStyle(document.querySelector(sel)).textDecorationLine.includes('underline'), TOAST), '')
  await c.both(`${SHOTS}/toast-hover`)
  // Hovering holds it past the 3.2 seconds it would have.
  await wait(4500)
  check('hovering keeps the toast up', !!(await h.$(TOAST)), '')
  await h.click(TOAST); await wait(1500)
  check('a click opens the card in the page', !(await h.$('.pdf-reader')) && (await shown('What is worth keeping, one?')) && !(await h.$(TOAST)), '')

  // 2. ⌥-click opens it to the side.
  const before = await panes()
  await card('What is worth keeping, two?')
  await h.click(TOAST, { modifiers: ['Alt'] }); await wait(1500)
  check('⌥-click opens the card to the side', (await panes()) === before + 1 && (await shown('What is worth keeping, two?')) && !!(await h.$('.pdf-reader')), `${before} → ${await panes()}`)

  // 3. Right-click: the row's menu; "Open to the side" from it.
  await single()
  const wide = await panes()
  await card('What is worth keeping, three?')
  await h.click(TOAST, { button: 'right' }); await wait(500)
  // Folded as every row's menu folds them: the other ways to open under "Open in…".
  await h.hover('[role="menuitem"]:has-text("Open in")'); await wait(400)
  const lines = await h.evaluate(() => [...document.querySelectorAll('[role="menuitem"]')].map((one) => one.textContent.trim()))
  check('right-click offers Open, Open to the side, Open in a new window, Copy link', ['Open', 'Open to the side', 'Open in a new window', 'Copy link'].every((want) => lines.some((line) => line.startsWith(want))), JSON.stringify(lines))
  await c.both(`${SHOTS}/toast-menu`)
  await wait(3500)
  check('the toast stays while its menu is open', !!(await h.$(TOAST)), '')
  await h.click('[role="menuitem"]:has-text("Open to the side")'); await wait(1500)
  check('"Open to the side" from the menu opens it beside', (await panes()) === wide + 1 && (await shown('What is worth keeping, three?')) && !(await h.$(TOAST)), `${wide} → ${await panes()}`)

  // 4. Kept as a gem in the reader: the toast opens the gem.
  await single()
  await reader()
  await pick(2, 'quiet sentence'); await wait(500)
  await h.waitForSelector('.pdf-keep-bar button[aria-label="Keep"]', { timeout: 4000 }).catch(() => {})
  await h.click('.pdf-keep-bar button[aria-label="Keep"]')
  await h.waitForSelector(TOAST, { timeout: 4000 }).catch(() => {})
  const gem = await h.evaluate((sel) => ({ text: document.querySelector(sel)?.textContent, made: document.querySelector(sel)?.getAttribute('data-toast-made') }), TOAST)
  check('Keep says "Kept as a gem" and carries the gem', gem.text === 'Kept as a gem' && /^nugget:/.test(gem.made ?? ''), JSON.stringify(gem))
  await h.keyboard.press('Escape'); await wait(200)
  await h.click(TOAST); await wait(1500)
  check('a click opens the gem', !(await h.$('.pdf-reader')) && (await shown('quiet sentence')), '')

  // 5. Moved to the Bin: the toast opens the Bin.
  const capture = await h.evaluate(() => window.api.captures.create({ kind: 'note', body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'A note for the Bin' }] }] } }))
  await c.go('inbox'); await wait(800)
  await h.click(`[data-id="${capture}"]`).catch(() => h.click('text=A note for the Bin'))
  await wait(300)
  await h.keyboard.press('Backspace')
  await h.waitForSelector(TOAST, { timeout: 4000 }).catch(() => {})
  const bin = await h.evaluate((sel) => ({ text: document.querySelector(sel)?.textContent, made: document.querySelector(sel)?.getAttribute('data-toast-made') }), TOAST)
  check('the Bin toast carries the Bin', /^Moved to the Bin/.test(bin.text ?? '') && bin.made === 'view:discarded', JSON.stringify(bin))
  await h.click(TOAST); await wait(1200)
  check('a click opens the Bin, the note in it', (await shown('A note for the Bin')) && !!(await h.$('[data-page="discarded"]')), await h.evaluate(() => [...document.querySelectorAll('[data-page]')].map((one) => one.getAttribute('data-page')).join()))

  // 6. Kept in the Inbox, from a link's "Keep the link": the toast opens the capture.
  const noteId = await v('article:new')
  await v('item:save', noteId, { title: 'With a link', body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'toast site', marks: [{ type: 'link', attrs: { href: 'https://example.com/toast' } }] }] }] } })
  await c.send('article', noteId); await wait(1400)
  await h.click(`${EDITOR} a`, { button: 'right' }); await wait(500)
  await h.click('[data-menu-item="keep-link"], [role="menuitem"]:has-text("Keep the link")').catch(() => {})
  await h.waitForSelector(TOAST, { timeout: 4000 }).catch(() => {})
  const link = await h.evaluate((sel) => ({ text: document.querySelector(sel)?.textContent, made: document.querySelector(sel)?.getAttribute('data-toast-made') }), TOAST)
  check('Keep the link says "Kept in the Inbox" and carries the capture', link.text === 'Kept in the Inbox' && /^capture:/.test(link.made ?? ''), JSON.stringify(link))
  if (link.made) {
    await h.click(TOAST); await wait(1500)
    check('a click opens the kept link in the Inbox', await h.evaluate((id) => [...document.querySelectorAll('[data-open]')].some((one) => one.getAttribute('data-open') === id), link.made.slice('capture:'.length)), await h.evaluate(() => [...document.querySelectorAll('[data-open], [data-page]')].map((one) => one.getAttribute('data-open') ?? one.getAttribute('data-page')).join()))
  }
  console.log('shots:', `${SHOTS}/toast-{rest,hover,menu}-{light,dark}.png`)
} catch (error) {
  check('the probe ran to the end', false, String(error).slice(0, 400))
} finally {
  await c.close()
  done()
}
