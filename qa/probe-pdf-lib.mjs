// A three-page PDF dropped into a note and opened in the reader, with the
// dictionary and Wikipedia as small servers here (honoured only in a probe).
// Shared by the probes that read in a PDF: look-up-marked, later-swatch,
// look-up-known, study-cards.
import { createServer } from 'node:http'
import { PDFDocument, StandardFonts } from 'pdf-lib'

/** The lookups server: `quiet` and `harbour` are known to both; `hits` counts each ask; `close()` takes it off line. */
export async function lookupServer() {
  const hits = { dict: 0, wiki: 0 }
  const server = createServer((req, res) => {
    res.setHeader('content-type', 'application/json')
    if (req.url.startsWith('/dict/')) hits.dict++
    if (req.url.startsWith('/wiki/')) hits.wiki++
    if (req.url.startsWith('/dict/quiet')) return res.end(JSON.stringify([{ word: 'quiet', meanings: [{ partOfSpeech: 'adjective', definitions: [{ definition: 'Making little or no noise.' }] }] }]))
    if (req.url.startsWith('/wiki/quiet')) return res.end(JSON.stringify({ type: 'standard', title: 'Quiet', description: 'Absence of noise', extract: 'Quiet is the lack of noise or disturbance.', content_urls: { desktop: { page: 'https://en.wikipedia.org/wiki/Quiet' } } }))
    res.statusCode = 404
    res.end('{}')
  })
  await new Promise((done) => server.listen(0, '127.0.0.1', done))
  process.env.HALIGTREE_QA_DICT = `http://127.0.0.1:${server.address().port}/dict/`
  process.env.HALIGTREE_QA_WIKI = `http://127.0.0.1:${server.address().port}/wiki/`
  return { hits, close: () => new Promise((done) => (server.closeAllConnections?.(), server.close(done))) }
}

const makePdf = async () => {
  const pdf = await PDFDocument.create()
  pdf.setTitle('The Probe Book')
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  for (let n = 1; n <= 3; n++) {
    const page = pdf.addPage([400, 560])
    page.drawText(`Page ${n} of the probe book`, { x: 40, y: 500, size: 18, font })
    page.drawText(`A quiet sentence worth keeping on page ${n}.`, { x: 40, y: 460, size: 12, font })
  }
  return Array.from(await pdf.save())
}

const EDITOR = '[data-open] .tiptap'

/** A note holding the PDF, opened in the reader. Returns the note's id. */
export async function openProbePdf(c) {
  const { h, v } = c
  const wait = (ms) => h.waitForTimeout(ms)
  const id = await v('article:new')
  await v('item:save', id, { title: 'With a PDF', body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'A quiet harbour where the boats sleep.' }] }, { type: 'paragraph' }] } })
  await c.send('article', id); await wait(1400)
  const bytes = await makePdf()
  await h.evaluate(([sel, bytes]) => {
    const ed = document.querySelector(sel).editor
    ed.commands.setTextSelection(ed.state.doc.content.size - 1)
    const file = new File([new Uint8Array(bytes)], 'probe-book.pdf', { type: 'application/pdf' })
    const data = new DataTransfer()
    data.items.add(file)
    const box = ed.view.dom.getBoundingClientRect()
    ed.view.dom.dispatchEvent(new DragEvent('drop', { dataTransfer: data, bubbles: true, cancelable: true, clientX: box.left + 20, clientY: box.bottom - 10 }))
  }, [EDITOR, bytes])
  await h.waitForSelector('.tiptap-attachment.is-pdf .pdf-page[data-page="1"] .textLayer span', { timeout: 15000 }).catch(() => {})
  await wait(800)
  await h.click('.is-pdf button[aria-label="Open probe-book.pdf"]')
  await h.waitForSelector('.pdf-reader .pdf-page[data-page="1"] .textLayer span', { timeout: 15000 }).catch(() => {})
  await wait(800)
  return id
}

/** Picks letters `from` to `to` of the reader's "quiet sentence" line on a page; says where they are on screen. */
export const pickInPdf = (h, from, to, page = 1) => h.evaluate(([from, to, page]) => {
  const span = [...document.querySelectorAll(`.pdf-reader .pdf-page[data-page="${page}"] .textLayer span`)].find((one) => /quiet sentence/.test(one.textContent))
  span.scrollIntoView({ block: 'center' })
  const range = document.createRange()
  range.setStart(span.firstChild, from)
  range.setEnd(span.firstChild, to)
  getSelection().removeAllRanges()
  getSelection().addRange(range)
  const r = range.getBoundingClientRect()
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
}, [from, to, page])

/** The words the Look Up mark covers now, or '' when there is none. */
export const markedWords = (h) => h.evaluate(() => {
  const mark = CSS.highlights.get('look-up')
  return mark ? [...mark].map((range) => range.toString()).join(' | ') : ''
})
