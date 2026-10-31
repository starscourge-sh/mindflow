// "Paper pages" tints every page of a PDF, not only the big ones: the side strip's
// thumbnails, the hover preview and the book's cover take the same paper.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox node qa/pdf-paper-everywhere.mjs
import { PDFDocument, StandardFonts } from 'pdf-lib'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const { check, done } = checks()
const c = await sandbox({ width: 1300, height: 860 })
const { h, v } = c
const wait = (ms) => h.waitForTimeout(ms)
const EDITOR = '[data-open] .tiptap'
const PAPER = 'rgb(244, 236, 219)'
const bg = (sel) => h.evaluate((sel) => { const el = document.querySelector(sel); return el ? getComputedStyle(el).backgroundColor : null }, sel)
try {
  const pdf = await PDFDocument.create()
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  for (let n = 1; n <= 6; n++) pdf.addPage([400, 560]).drawText(`Page ${n}`, { x: 40, y: 480, size: 40, font })
  const bytes = [...(await pdf.save())]
  await v('settings:set', { sounds: false, hintRate: 0 })
  const id = await v('article:new')
  await v('item:save', id, { title: 'Paper', body: { type: 'doc', content: [{ type: 'paragraph' }] } })
  await c.send('article', id); await wait(1400)
  await h.evaluate(([sel, bytes]) => {
    const ed = document.querySelector(sel).editor
    const data = new DataTransfer()
    data.items.add(new File([new Uint8Array(bytes)], 'paper-book.pdf', { type: 'application/pdf' }))
    const box = ed.view.dom.getBoundingClientRect()
    ed.view.dom.dispatchEvent(new DragEvent('drop', { dataTransfer: data, bubbles: true, cancelable: true, clientX: box.left + 20, clientY: box.top + 10 }))
  }, [EDITOR, bytes])
  await h.waitForSelector('.tiptap-attachment.is-pdf .pdf-page canvas', { timeout: 15000 })
  // Paper on, as its switch does it.
  await h.evaluate(() => { localStorage.setItem('pdf-paper', '1'); window.dispatchEvent(new CustomEvent('haligtree:pdf-paper')) })
  await h.click('.tiptap-attachment.is-pdf button[aria-label="Sidebar"]')
  await h.waitForSelector('.tiptap-attachment.is-pdf .pdf-thumb-sheet', { timeout: 8000 })
  await wait(600)
  check('a big page is paper', (await bg('.tiptap-attachment.is-pdf .pdf-page')) === PAPER, await bg('.tiptap-attachment.is-pdf .pdf-page'))
  check('a thumbnail in the side strip is paper', (await bg('.tiptap-attachment.is-pdf .pdf-thumb-sheet')) === PAPER, await bg('.tiptap-attachment.is-pdf .pdf-thumb-sheet'))
  check('the cover on the PDF\'s card is paper', (await bg('.tiptap-pdf-cover')) === PAPER, await bg('.tiptap-pdf-cover'))
  const name = h.locator('.tiptap-attachment-name[data-pdf-peek]').first()
  const box = await name.boundingBox()
  await h.mouse.move(box.x + 4, box.y + box.height / 2)
  await h.waitForSelector('[data-pdf-peek-card]', { timeout: 8000 })
  await wait(400)
  check('the hover preview is paper', (await bg('.pdf-peek-face')) === PAPER, await bg('.pdf-peek-face'))
  await c.both?.(process.env.SHOT ?? '/tmp/pdf-paper')
  // Off again: white, as the PDF itself is.
  await h.mouse.move(5, 5); await wait(300)
  await h.evaluate(() => { localStorage.setItem('pdf-paper', '0'); window.dispatchEvent(new CustomEvent('haligtree:pdf-paper')) })
  await wait(300)
  check('off: the thumbnail is white again', (await bg('.tiptap-attachment.is-pdf .pdf-thumb-sheet')) === 'rgb(255, 255, 255)', await bg('.tiptap-attachment.is-pdf .pdf-thumb-sheet'))
} catch (error) {
  check('the run finished', false, error.message.split('\n')[0])
} finally {
  await c.close?.()
}
done()
