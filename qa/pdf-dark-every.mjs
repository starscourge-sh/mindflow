// "Dark pages" on every kind of PDF, as Preview's "Use Dark Appearance for
// PDF": a page that paints its own white ground, a scanned page (one picture
// the size of the page) and a magazine page (a white picture the size of the
// page with an orange drawing in it, words over it) all show a dark ground
// with light words, while the orange drawing stays orange.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox SHOT=/tmp/dark-every node qa/pdf-dark-every.mjs
import { deflateSync } from 'zlib'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'
const SHOT = process.env.SHOT ?? '/tmp/pdf-dark-every'
const { check, done } = checks()

/** A PNG of `w` by `h`, each pixel's colour from `at(x, y)`. */
const png = (w, h, at) => {
  const crc = (buf) => { let c = ~0; for (const b of buf) { c ^= b; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1)) } return ~c >>> 0 }
  const chunk = (type, data) => { const t = Buffer.from(type); const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const c = Buffer.alloc(4); c.writeUInt32BE(crc(Buffer.concat([t, data]))); return Buffer.concat([len, t, data, c]) }
  const head = Buffer.alloc(13); head.writeUInt32BE(w, 0); head.writeUInt32BE(h, 4); head[8] = 8; head[9] = 2
  const rows = Buffer.alloc(h * (1 + w * 3))
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) rows.set(at(x, y), y * (1 + w * 3) + 1 + x * 3)
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', head), chunk('IDAT', deflateSync(rows)), chunk('IEND', Buffer.alloc(0))])
}
const W = 400, H = 560
/** Lines of "print" on a white ground, from 60 to 200 pixels down, as a scanned page has them. */
const scanned = (x, y) => (y >= 60 && y < 200 && x >= 40 && x < 360 && (y - 60) % 16 < 8 ? [20, 20, 20] : [250, 250, 248])
/** A white page-sized picture with an orange disc in it, as a magazine's illustration. */
const magazine = (x, y) => ((x - 200) ** 2 + (y - 300) ** 2 < 80 ** 2 ? [235, 120, 30] : [255, 255, 255])

const makePdf = async () => {
  const pdf = await PDFDocument.create()
  const font = await pdf.embedFont(StandardFonts.TimesRoman)
  const words = (page) => ['THE VENETIAN PATENT STATUTE', 'A quiet sentence worth keeping here.', 'Another line of the same paragraph.', 'And one more line of print to read.']
    .forEach((line, n) => page.drawText(line, { x: 40, y: 500 - n * 26, size: n ? 16 : 20, font, color: rgb(0, 0, 0) }))
  // 1: the page paints its own white ground, then its words.
  const one = pdf.addPage([W, H])
  one.drawRectangle({ x: 0, y: 0, width: W, height: H, color: rgb(1, 1, 1) })
  words(one)
  // 2: a scan, one picture the size of the page.
  const two = pdf.addPage([W, H])
  two.drawImage(await pdf.embedPng(png(W, H, scanned)), { x: 0, y: 0, width: W, height: H })
  // 3: a magazine page: white ground, a page-sized white picture with an orange drawing, words over it.
  const three = pdf.addPage([W, H])
  three.drawRectangle({ x: 0, y: 0, width: W, height: H, color: rgb(1, 1, 1) })
  three.drawImage(await pdf.embedPng(png(W, H, magazine)), { x: 0, y: 0, width: W, height: H })
  words(three)
  return [...(await pdf.save())]
}

const c = await sandbox({ width: 1300, height: 900 })
const { h, v } = c
const wait = (ms) => h.waitForTimeout(ms)
/** Page `n`'s sharp canvas, read over a box (fractions of the page): mean lightness, the lightest 3% and the mean colour. */
const read = (n, box, root = '.pdf-reader') => h.evaluate(([n, [x1, y1, x2, y2], root]) => {
  const canvas = [...document.querySelectorAll(`${root} .pdf-page[data-page="${n}"] canvas`)].at(-1)
  if (!canvas) return null
  const x = Math.round(canvas.width * x1), y = Math.round(canvas.height * y1)
  const data = canvas.getContext('2d').getImageData(x, y, Math.round(canvas.width * x2) - x, Math.round(canvas.height * y2) - y).data
  const lights = []
  const sum = [0, 0, 0]
  for (let i = 0; i < data.length; i += 4) {
    lights.push((0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]) / 255)
    sum[0] += data[i]; sum[1] += data[i + 1]; sum[2] += data[i + 2]
  }
  lights.sort((a, b) => a - b)
  const count = lights.length
  return { mean: +(lights.reduce((a, b) => a + b, 0) / count).toFixed(3), top: +lights[Math.floor(count * 0.97)].toFixed(3), colour: sum.map((one) => Math.round(one / count)) }
}, [n, box, root])
const show = (n, root = '.pdf-reader') => h.evaluate(([n, root]) => document.querySelector(`${root} .pdf-page[data-page="${n}"]`)?.scrollIntoView({ block: 'start' }), [n, root])

try {
  await v('settings:set', { sounds: false, hintRate: 0 })
  const src = await h.evaluate((bytes) => window.api.saveFile('dark-every.pdf', new Uint8Array(bytes)), await makePdf())
  await h.evaluate(() => localStorage.setItem('pdf-dark', '1'))
  await h.evaluate(([src]) => window.dispatchEvent(new CustomEvent('haligtree:pdf', { detail: { src, name: 'dark-every.pdf', page: 1 } })), [src])
  await h.waitForSelector('.pdf-reader .pdf-page canvas', { timeout: 20000 }); await wait(2500)
  check('the reader is in "Dark pages"', await h.evaluate(() => document.querySelector('.pdf-reader')?.classList.contains('is-dark')), '')

  const paper = [0.1, 0.86, 0.9, 0.96]
  const kinds = [
    { n: 1, name: 'a page that paints its own white', print: [0.08, 0.08, 0.9, 0.3] },
    { n: 2, name: 'a scanned page', print: [0.08, 0.1, 0.9, 0.36] },
    { n: 3, name: 'a magazine page (a white picture the size of the page)', print: [0.08, 0.08, 0.9, 0.3], disc: [0.45, 0.5, 0.55, 0.57] },
  ]
  for (const kind of kinds) {
    await show(kind.n); await wait(2500)
    const ground = await read(kind.n, paper)
    const print = await read(kind.n, kind.print)
    check(`${kind.name}: the ground is dark (mean lightness under 0.25)`, ground && ground.mean < 0.25, JSON.stringify(ground))
    check(`${kind.name}: the print is light on it`, print && print.mean < 0.5 && print.top > 0.6, JSON.stringify(print))
    if (kind.disc) {
      const disc = await read(kind.n, kind.disc)
      const [r, g, b] = disc?.colour ?? [0, 0, 0]
      check(`${kind.name}: the orange drawing stays orange`, r > 190 && g > 80 && g < 170 && b < 90, JSON.stringify(disc))
    }
    await c.both(`${SHOT}-page${kind.n}`)
  }
  // Every line of the Pages menu has its icon.
  await h.click('.pdf-reader button[aria-label="Page layout"]'); await wait(400)
  const lines = await h.evaluate(() => [...document.querySelectorAll('[data-page-layout-menu] [role^="menuitem"]')].map((one) => ({ words: one.textContent, icon: !!one.querySelector('svg[data-menu-icon]:not(.lucide-dot)') })))
  check('every line of the Pages menu has its icon', lines.length === 6 && lines.every((one) => one.icon), JSON.stringify(lines))
  await c.both(`${SHOT}-menu`)
  await h.keyboard.press('Escape'); await wait(300)

  // The same PDF in a note follows "Dark pages" too.
  await h.keyboard.press('Escape'); await wait(600)
  const ED = '.note-pane .tiptap.ProseMirror.haligtree-editor:not(.is-line)'
  const BLOCK = `${ED} .tiptap-attachment.is-pdf`
  const id = await h.evaluate(() => window.api.captures.create({ kind: 'note', body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'The law book' }] }] } }))
  await c.send('capture', id)
  await h.locator(ED).waitFor({ timeout: 10000 }); await wait(2000)
  await h.evaluate(([sel, bytes]) => {
    const ed = document.querySelector(sel).editor
    const data = new DataTransfer()
    data.items.add(new File([new Uint8Array(bytes)], 'dark-every.pdf', { type: 'application/pdf' }))
    const box = ed.view.dom.getBoundingClientRect()
    ed.view.dom.dispatchEvent(new DragEvent('drop', { dataTransfer: data, bubbles: true, cancelable: true, clientX: box.left + 20, clientY: box.bottom - 4 }))
  }, [ED, await makePdf()])
  await h.waitForSelector(`${BLOCK} .pdf-page canvas`, { timeout: 15000 }).catch(() => {})
  check('the PDF in the note is in "Dark pages"', await h.evaluate((sel) => document.querySelector(sel)?.classList.contains('is-dark'), BLOCK), '')
  for (const kind of kinds.slice(1)) {
    await show(kind.n, BLOCK); await wait(2500)
    const ground = await read(kind.n, paper, BLOCK)
    const print = await read(kind.n, kind.print, BLOCK)
    check(`in a note, ${kind.name}: dark ground, light print`, ground && ground.mean < 0.25 && print && print.top > 0.6, JSON.stringify({ ground, print }))
  }
  await c.both(`${SHOT}-note`)

  // Paper and White are as they were: the page's own white, the paper tint laid by the page's style.
  await h.evaluate(() => (localStorage.setItem('pdf-dark', '0'), localStorage.setItem('pdf-paper', '0'), window.dispatchEvent(new CustomEvent('haligtree:pdf-dark')), window.dispatchEvent(new CustomEvent('haligtree:pdf-paper'))))
  await show(3, BLOCK); await wait(2500)
  const white = await read(3, paper, BLOCK)
  const disc = await read(3, kinds[2].disc, BLOCK)
  check('"White pages": the magazine page stays white', white && white.mean > 0.95, JSON.stringify(white))
  check('"White pages": the orange drawing stays orange', disc && disc.colour[0] > 190 && disc.colour[2] < 90, JSON.stringify(disc))
  await h.evaluate(() => (localStorage.setItem('pdf-paper', '1'), window.dispatchEvent(new CustomEvent('haligtree:pdf-paper'))))
} catch (error) {
  check('ran without throwing', false, String(error?.stack ?? error))
}
await c.close()
done()
