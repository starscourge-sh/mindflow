// A scanned book made searchable (every Mac, Vision): a PDF whose pages are only pictures of words
// opens with one line saying so and "Read the text on these pages"; pressed, its pages are read on
// this Mac with an orb counting them, then the book opens again with its words on it: find finds
// them, they can be picked and highlighted, and the read copy is kept with the book (opened again,
// no line). Details says "Its text was read on this Mac" with "Back to the scan". A book with text
// never shows the line; "Not now" puts it away for that book.
//   QA_ARGS=--sandbox QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/mac-scan.mjs
import { readFileSync } from 'node:fs'
import { PDFDocument, StandardFonts } from 'pdf-lib'
import { sandbox } from './sandbox-lib.mjs'
import { checks } from './harness.mjs'

const { check, done } = checks()
const c = await sandbox({ width: 1200, height: 860 })
const { h, v, send } = c
const wait = (ms) => h.waitForTimeout(ms)
const SHOT = process.env.SHOT
const frames = async (name, ms, every = 50) => {
  if (!SHOT) return wait(ms)
  for (let i = 0; i * every < ms; i++) {
    await h.screenshot({ path: `${SHOT}/${name}-${String(i).padStart(3, '0')}.png` })
    await wait(every)
  }
}
const drop = async (bytes, name) => {
  const article = await v('article:new')
  await v('item:save', article, { title: name, body: { type: 'doc', content: [{ type: 'paragraph' }] } })
  await send('article', article)
  await wait(1400)
  await h.evaluate(([bytes, name]) => {
    const ed = document.querySelector('[data-open] .tiptap').editor
    const data = new DataTransfer()
    data.items.add(new File([new Uint8Array(bytes)], name, { type: 'application/pdf' }))
    const box = ed.view.dom.getBoundingClientRect()
    ed.view.dom.dispatchEvent(new DragEvent('drop', { dataTransfer: data, bubbles: true, cancelable: true, clientX: box.left + 20, clientY: box.top + 10 }))
  }, [bytes, name])
  await h.waitForSelector(`.is-pdf button[aria-label="Open ${name}"]`, { timeout: 15000 }).catch(() => {})
  await h.click(`.is-pdf button[aria-label="Open ${name}"]`)
  await h.waitForSelector('.pdf-reader .pdf-page[data-page="1"] canvas', { timeout: 15000 }).catch(() => {})
  await wait(1500)
}
const line = () => h.evaluate(() => document.querySelector('[data-pdf-scan]')?.textContent ?? null)
try {
  // A book with words: no line.
  const typed = await PDFDocument.create()
  const font = await typed.embedFont(StandardFonts.Helvetica)
  typed.addPage([400, 560]).drawText('The obstacle is the way.', { x: 40, y: 500, size: 16, font })
  await drop(Array.from(await typed.save()), 'typed.pdf')
  check('a book with words in it says nothing about reading them', (await line()) === null)

  // A scanned one.
  await drop(Array.from(readFileSync(new URL('./fixtures/scanned-book.pdf', import.meta.url))), 'scanned-book.pdf')
  const said = await line()
  check('a scanned book says so once, under the bar, with “Read the text on these pages”', /pictures of words/.test(said ?? '') && /Read the text on these pages/.test(said ?? ''), said)
  const empty = await h.evaluate(() => document.querySelectorAll('.pdf-reader .textLayer span').length)
  check('before, its pages have no words to pick', empty === 0, `${empty} spans`)
  if (SHOT) await c.both(`${SHOT}/scan-line`)
  await h.evaluate(() => {
    window.__toasts = []
    new MutationObserver(() => { const said = document.body.innerText.match(/Read \d+ pages?[^\n]*/)?.[0]; if (said && !window.__toasts.includes(said)) window.__toasts.push(said) }).observe(document.body, { childList: true, subtree: true, characterData: true })
  })
  const tall = () => h.evaluate(() => document.querySelector('[data-pdf-scan]')?.getBoundingClientRect().height ?? null)
  const before = await tall()
  await h.click('[data-pdf-scan-read]')
  const during = await tall()
  const orb = await h.evaluate(() => document.querySelector('[data-pdf-scan]')?.textContent ?? '')
  check('pressed, it answers at once with the orb and a Stop, and the line keeps its height', /Reading/.test(orb) && /Stop/.test(orb) && before === during, `${orb} ${before} → ${during}`)
  await frames('scan-reading', 1500)
  // Read: the book opens again with its words.
  await h.waitForSelector('.pdf-reader .pdf-page[data-page="1"] .textLayer span', { timeout: 30000 }).catch(() => {})
  await wait(800)
  const words = await h.evaluate(() => [...document.querySelectorAll('.pdf-reader .pdf-page[data-page="1"] .textLayer span')].map((one) => one.textContent).join(' '))
  check('after reading, the page carries its words where they stand', /judgements are up to us/.test(words), words.slice(0, 160))
  check('the line has gone once it is read', (await line()) === null, await line())
  const toast = await h.evaluate(() => window.__toasts.join(' | '))
  check('a notice says what now works', /Read 2 pages/.test(toast), toast + ' / ' + (await h.evaluate(() => document.querySelector('section[aria-label], [data-sonner-toaster], [role=status]')?.outerHTML.slice(0,300))))
  // Find.
  await h.keyboard.press('Meta+f')
  await wait(300)
  await h.fill('input[aria-label="Find in PDF"]', 'colour of its thoughts')
  await wait(1200)
  const count = await h.evaluate(() => document.querySelector('.tiptap-find-bar-count')?.getAttribute('aria-label'))
  check('find finds words on a scanned page (page 2)', count === '1 of 1', count)
  await h.keyboard.press('Escape')
  // Pick words on page 1 and right-click them: highlight is offered.
  const at = await h.evaluate(() => {
    const span = [...document.querySelectorAll('.pdf-reader .pdf-page[data-page="1"] .textLayer span')].find((one) => /obstacle/.test(one.textContent))
    if (!span) return null
    span.scrollIntoView({ block: 'center' })
    const range = document.createRange()
    range.setStart(span.firstChild, 0)
    range.setEnd(span.firstChild, span.firstChild.textContent.length)
    getSelection().removeAllRanges()
    getSelection().addRange(range)
    const r = range.getBoundingClientRect()
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
  })
  if (at) await h.mouse.click(at.x, at.y, { button: 'right' })
  await wait(500)
  const rows = await h.evaluate(() => [...document.querySelectorAll('[role="menu"] [role="menuitem"]')].map((one) => one.textContent.trim()))
  check('words on a read page can be picked, highlighted and read aloud', !!at && rows.some((one) => /Highlight/i.test(one)) && rows.includes('Read aloud'), JSON.stringify(at) + ' ' + rows.join(' / '))
  await h.keyboard.press('Escape')
  if (SHOT) await c.both(`${SHOT}/scan-read`)
  // Details.
  await h.click('button[aria-label="Details"]')
  await wait(800)
  const detail = await h.evaluate(() => document.querySelector('[data-pdf-scan-detail]')?.textContent ?? null)
  check('Details says “Text read on this Mac”, with “Back to the scan”', /Text read on this Mac/.test(detail ?? '') && /Back to the scan/.test(detail ?? ''), detail)
  if (SHOT) await c.both(`${SHOT}/scan-details`)
  await h.click('button[aria-label="Details"]')
  check('no page errors', !c.errors.length, c.errors.slice(0, 3).join(' | '))
} finally {
  await c.close()
}
done()
