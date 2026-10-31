// A PDF kept in one note is offered by @ in another, links there under its
// title, opens in the reader when clicked, shows in the note's Links and on
// the Map, and a field that holds a link takes one too.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-small/main/index.js HALIGTREE_QA_AWAY=1 node qa/pdf-link.mjs
import { PDFDocument, StandardFonts } from 'pdf-lib'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const makePdf = async () => {
  const pdf = await PDFDocument.create()
  pdf.setTitle('The Linked Book')
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  pdf.addPage([400, 560]).drawText('Page 1 of the linked book', { x: 40, y: 500, size: 18, font })
  return Array.from(await pdf.save())
}

const { check, done } = checks()
const c = await sandbox({ width: 1400, height: 900 })
const { h, v } = c
const wait = (ms) => h.waitForTimeout(ms)
const EDITOR = '[data-open] .tiptap'
const shots = process.env.QA_SHOTS ?? '/tmp'

try {
  await v('settings:set', { sounds: false, hintRate: 0 })
  // The PDF, dropped into a page of its own.
  const holder = await v('article:new')
  await v('item:save', holder, { title: 'Holds a PDF', body: { type: 'doc', content: [{ type: 'paragraph' }] } })
  await c.send('article', holder); await wait(1400)
  const bytes = await makePdf()
  await h.evaluate(([sel, bytes]) => {
    const ed = document.querySelector(sel).editor
    const data = new DataTransfer()
    data.items.add(new File([new Uint8Array(bytes)], 'linked-book.pdf', { type: 'application/pdf' }))
    const box = ed.view.dom.getBoundingClientRect()
    ed.view.dom.dispatchEvent(new DragEvent('drop', { dataTransfer: data, bubbles: true, cancelable: true, clientX: box.left + 20, clientY: box.top + 10 }))
  }, [EDITOR, bytes])
  await h.waitForSelector('.tiptap-attachment.is-pdf .pdf-page[data-page="1"] .textLayer span', { timeout: 15000 }).catch(() => {})
  await wait(1500)
  const src = await h.evaluate((sel) => {
    let found = ''
    document.querySelector(sel).editor.state.doc.descendants((node) => void (node.type.name === 'attachment' && (found = node.attrs.src)))
    return found
  }, EDITOR)
  check('the PDF is kept in the first note', /^haligtree:\/\/assets\//.test(src), src)

  // Another note: @ offers the PDF, under its own heading, by its title.
  const writer = await v('article:new')
  await v('item:save', writer, { title: 'Reading notes', body: { type: 'doc', content: [{ type: 'paragraph' }] } })
  await c.send('article', writer); await wait(1400)
  await h.click(EDITOR); await h.keyboard.press('Meta+ArrowDown')
  await h.keyboard.type('See @linked', { delay: 40 }); await wait(900)
  const menu = await h.evaluate(() => ({
    groups: [...document.querySelectorAll('.tiptap-slash-menu-group')].map((one) => one.textContent),
    rows: [...document.querySelectorAll('.tiptap-slash-menu .tiptap-note-link-title')].map((one) => one.textContent)
  }))
  check('@ lists the PDF under “PDFs”', menu.groups.includes('PDFs'), JSON.stringify(menu))
  check('the PDF is offered by its title', menu.rows.some((one) => /Linked Book/i.test(one)), JSON.stringify(menu.rows))
  await h.screenshot({ path: `${shots}/pdf-link-menu.png` })
  await h.evaluate(() => [...document.querySelectorAll('.tiptap-slash-menu .tiptap-note-link-title')].find((one) => /Linked Book/i.test(one.textContent))?.closest('button, [role="option"], .tiptap-slash-menu-item')?.click())
  await wait(600)
  const link = await h.evaluate((sel) => {
    let found = null
    document.querySelector(sel).editor.state.doc.descendants((node) => void (node.type.name === 'noteLink' && (found = { id: node.attrs.id, label: node.attrs.label })))
    return found
  }, EDITOR)
  check('picked, it becomes a link to the PDF', link?.id === `pdf:${src}`, JSON.stringify(link))
  check('the link says the PDF’s title', /Linked Book/i.test(link?.label ?? ''), link?.label)
  check('no “cannot be linked” notice', !(await h.evaluate(() => /cannot be linked/.test(document.body.innerText))), '')
  await wait(2500)
  await h.screenshot({ path: `${shots}/pdf-link-note.png` })

  // The note's Links, and the Map, count it.
  const graph = await v('notes:graph', writer)
  check('the note’s links list the PDF', graph.out.some((one) => one.type === 'pdf' && one.id === src), JSON.stringify(graph.out))
  const map = await v('notes:graph:all')
  check('the Map has the PDF as a dot', map.nodes.some((one) => one.type === 'pdf' && one.id === src), JSON.stringify(map.nodes.map((one) => one.type)))
  check('the Map joins the note and the PDF', map.edges.some(([a, b]) => [a, b].includes(src) && [a, b].includes(writer)), JSON.stringify(map.edges))

  // A field that holds a link names it too.
  const named = await v('link:title', `pdf:${src}`)
  check('a link field names the PDF by its title', /Linked Book/i.test(named?.title ?? ''), JSON.stringify(named))

  // Clicked, it opens in the reader.
  await h.click('[data-open] a.tiptap-note-link'); await wait(1500)
  await h.waitForSelector('.pdf-reader .pdf-page[data-page="1"] .textLayer span', { timeout: 15000 }).catch(() => {})
  check('clicked, the link opens the PDF in the reader', /linked book/i.test(await h.evaluate(() => document.querySelector('.pdf-reader')?.textContent ?? '')), '')
  await h.screenshot({ path: `${shots}/pdf-link-reader.png` })
} catch (error) {
  check('ran without throwing', false, String(error?.stack ?? error))
} finally {
  await c.close?.()
  done()
}
