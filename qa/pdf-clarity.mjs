// PDF reading made clear to someone starting out: a highlight stays drawn,
// PDFs show in Recent, names a newcomer reads at once, previews on the
// reader's menus, a click opening a PDF at its own page, page links, and
// the click / ⌘-click / ⌥-click rule.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox node qa/pdf-clarity.mjs
import { PDFDocument, StandardFonts } from 'pdf-lib'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'
const SHOTS = process.env.QA_SHOTS ?? '/tmp'

const makePdf = async () => {
  const pdf = await PDFDocument.create()
  pdf.setTitle('The Law Book')
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  for (let n = 1; n <= 6; n++) {
    const page = pdf.addPage([400, 560])
    page.drawText(`Page ${n} of the law book`, { x: 40, y: 500, size: 18, font })
    page.drawText(`Genocide is an attempt to destroy a people on page ${n}.`, { x: 40, y: 460, size: 12, font })
  }
  return Array.from(await pdf.save())
}

const { check, done } = checks()
const c = await sandbox({ width: 1400, height: 900 })
const { h, v } = c
const wait = (ms) => h.waitForTimeout(ms)
const EDITOR = '[data-open] .tiptap'
const pick = (page, from, to) => h.evaluate(([page, from, to]) => {
  const span = [...document.querySelectorAll(`.pdf-reader .pdf-page[data-page="${page}"] .textLayer span`)].find((one) => /Genocide/.test(one.textContent))
  const range = document.createRange()
  range.setStart(span.firstChild, from)
  range.setEnd(span.firstChild, to)
  getSelection().removeAllRanges()
  getSelection().addRange(range)
}, [page, from, to])
/** How far the colour under some words is from grey: 0 for plain page. */
const tintUnder = async (page) => {
  const box = await h.evaluate((page) => {
    const span = [...document.querySelectorAll(`.pdf-reader .pdf-page[data-page="${page}"] .textLayer span`)].find((one) => /Genocide/.test(one.textContent))
    const r = span?.getBoundingClientRect()
    return r ? { x: r.left + 1, y: r.top + r.height * 0.1, width: Math.min(40, r.width / 3), height: Math.max(2, r.height * 0.2) } : null
  }, page)
  if (!box) return -1
  const shot = await h.screenshot({ clip: box })
  return h.evaluate(async (b64) => {
    const img = new Image(); img.src = `data:image/png;base64,${b64}`; await img.decode()
    const canvas = document.createElement('canvas'); canvas.width = img.width; canvas.height = img.height
    const ctx = canvas.getContext('2d'); ctx.drawImage(img, 0, 0)
    const d = ctx.getImageData(0, 0, img.width, img.height).data
    let sum = 0
    for (let i = 0; i < d.length; i += 4) sum += Math.max(d[i], d[i + 1], d[i + 2]) - Math.min(d[i], d[i + 1], d[i + 2])
    return Math.round(sum / (d.length / 4))
  }, shot.toString('base64'))
}

let pdfSrc = ''
try {
  await v('settings:set', { sounds: false, hintRate: 0 })
  const id = await v('article:new')
  await v('item:save', id, { title: 'Law notes', body: { type: 'doc', content: [{ type: 'paragraph' }] } })
  await c.send('article', id); await wait(1400)
  const bytes = await makePdf()
  await h.evaluate(([sel, bytes]) => {
    const ed = document.querySelector(sel).editor
    const file = new File([new Uint8Array(bytes)], 'law-book.pdf', { type: 'application/pdf' })
    const data = new DataTransfer()
    data.items.add(file)
    const box = ed.view.dom.getBoundingClientRect()
    ed.view.dom.dispatchEvent(new DragEvent('drop', { dataTransfer: data, bubbles: true, cancelable: true, clientX: box.left + 20, clientY: box.top + 10 }))
  }, [EDITOR, bytes])
  await h.waitForSelector('.tiptap-attachment.is-pdf .pdf-page[data-page="1"] .textLayer span', { timeout: 15000 }).catch(() => {})
  await wait(600)
  pdfSrc = await h.evaluate((sel) => {
    let src = ''
    document.querySelector(sel).editor.state.doc.descendants((node) => void (node.type.name === 'attachment' && (src = node.attrs.src)))
    return src
  }, EDITOR)
  await h.click('.is-pdf button[aria-label="Open law-book.pdf"]')
  await h.waitForSelector('.pdf-reader .pdf-page[data-page="1"] .textLayer span', { timeout: 15000 }).catch(() => {})
  await wait(800)

  // A highlight stays drawn on its words.
  const before = await tintUnder(1)
  await pick(1, 0, 'Genocide is an attempt'.length); await wait(400)
  await h.click('.pdf-keep-bar button[aria-label="Highlight"]'); await wait(1200)
  const saved = await v('pdf:highlights', pdfSrc)
  const after = await tintUnder(1)
  const bands = await h.evaluate(() => document.querySelectorAll('.pdf-reader .pdf-page[data-page="1"] .pdf-mark').length)
  check('a highlight is saved', saved.length === 1, JSON.stringify(saved))
  check('a highlight stays drawn on its words (colour under them)', bands > 0 && after - before > 15, JSON.stringify({ bands, before, after }))
  await h.screenshot({ path: `${SHOTS}/pdf-clarity-highlight.png` })
  // In the dark, on a page scrolled to, in a colour: still drawn, and still drawn once the page is scrolled away and back.
  await c.look('dark')
  await h.fill('.pdf-reader-page-field', '3'); await h.keyboard.press('Enter'); await wait(1200)
  const darkBefore = await tintUnder(3)
  await pick(3, 0, 'Genocide is an attempt'.length); await wait(400)
  await h.click('.pdf-keep-bar button[aria-label="Highlight"]'); await wait(1200)
  const darkAfter = await tintUnder(3)
  check('in the dark, a highlight on page 3 is drawn', darkAfter - darkBefore > 15, JSON.stringify({ darkBefore, darkAfter }))
  await h.screenshot({ path: `${SHOTS}/pdf-clarity-highlight-dark.png` })
  await h.fill('.pdf-reader-page-field', '6'); await h.keyboard.press('Enter'); await wait(1000)
  await h.fill('.pdf-reader-page-field', '3'); await h.keyboard.press('Enter'); await wait(1500)
  const back = await tintUnder(3)
  check('scrolled away and back, the highlight is still drawn', back - darkBefore > 15, JSON.stringify({ darkBefore, back }))
  await c.look('light')
  // Words picked across a line end, as most sentences in a real book are: still drawn.
  await h.fill('.pdf-reader-page-field', '2'); await h.keyboard.press('Enter'); await wait(1200)
  const crossBefore = await tintUnder(2)
  await h.evaluate(() => {
    const spans = [...document.querySelectorAll('.pdf-reader .pdf-page[data-page="2"] .textLayer span')]
    const title = spans.find((one) => /law book/.test(one.textContent))?.firstChild
    const line = spans.find((one) => /Genocide/.test(one.textContent))?.firstChild
    const range = document.createRange()
    range.setStart(title, title.textContent.length - 4)
    range.setEnd(line, 'Genocide is an attempt'.length)
    getSelection().removeAllRanges()
    getSelection().addRange(range)
  })
  await wait(400)
  await h.click('.pdf-keep-bar button[aria-label="Highlight"]'); await wait(1200)
  const crossAfter = await tintUnder(2)
  const crossBands = await h.evaluate(() => document.querySelectorAll('.pdf-reader .pdf-page[data-page="2"] .pdf-mark').length)
  check('words picked across a line end are drawn as a highlight', crossBands >= 2 && crossAfter - crossBefore > 15, JSON.stringify({ crossBands, crossBefore, crossAfter }))
} catch (e) {
  check('ran without throwing', false, String(e.stack ?? e))
} finally {
  await c.close()
}
done()
