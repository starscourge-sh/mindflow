// How fast a heavy PDF shows a page after a jump: a 300-page book, every page
// a large picture of its own, opened in the reader and jumped to page 290 by
// the page field. Prints, from the Enter that jumps:
//   first: the main page's first pixels (a picture on its canvas),
//   sharp: the main page drawn at the screen's full density,
//   rail:  every Pages thumbnail in the rail's view drawn,
//   thumbs: how many thumbnails were started in all (each one is worker time).
// Run more than once (RUNS=3) to see the spread. Fails past the targets
// (first under 300ms, sharp under 1s) only when QA_STRICT=1.
//   npx electron-vite build --outDir out-pdfjump
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-pdfjump/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox node qa/pdf-jump-speed.mjs
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import os from 'os'
import zlib from 'node:zlib'
import { PDFDocument, StandardFonts } from 'pdf-lib'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const PAGES = 300
const TO = 290
const CACHE = process.env.QA_HEAVY_PDF ?? `${os.tmpdir()}/haligtree-heavy-${PAGES}.pdf`

/** A picture of its own for each page, 1600 by 1200: decoding it is real work, as a DK book's photographs are. */
const picture = (seed) => {
  const W = 1600, H = 1200
  const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0 })
  const crc = (buf) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0 }
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const body = Buffer.concat([Buffer.from(type), data]); const sum = Buffer.alloc(4); sum.writeUInt32BE(crc(body)); return Buffer.concat([len, body, sum]) }
  const head = Buffer.alloc(13); head.writeUInt32BE(W, 0); head.writeUInt32BE(H, 4); head[8] = 8; head[9] = 2
  const raw = Buffer.alloc((W * 3 + 1) * H)
  let state = seed * 2654435761 >>> 0
  for (let y = 0; y < H; y++) {
    const row = y * (W * 3 + 1)
    for (let x = 0; x < W; x++) {
      // A speck of grain now and then, so no two rows pack down alike.
      state = (state * 1103515245 + 12345) >>> 0
      const noise = (x + y * 3) & 63 ? 0 : state >>> 29
      const at = row + 1 + x * 3
      raw[at] = (x / 7 + seed * 13 + noise) & 255
      raw[at + 1] = (y / 5 + seed * 29 + noise) & 255
      raw[at + 2] = ((x + y) / 9 + seed * 7) & 255
    }
  }
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', head), chunk('IDAT', zlib.deflateSync(raw, { level: 1 })), chunk('IEND', Buffer.alloc(0))])
}
const makePdf = async () => {
  if (existsSync(CACHE)) return readFileSync(CACHE)
  const pdf = await PDFDocument.create()
  pdf.setTitle('The Heavy Book')
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  for (let n = 1; n <= PAGES; n++) {
    const page = pdf.addPage([612, 792])
    page.drawImage(await pdf.embedPng(picture(n)), { x: 0, y: 0, width: 612, height: 792 })
    page.drawText(`Page ${n} of the heavy book`, { x: 60, y: 740, size: 22, font })
    for (let line = 0; line < 30; line++) page.drawText(`Line ${line} of page ${n}, words to lay out as the text layer.`, { x: 60, y: 700 - line * 20, size: 11, font })
  }
  const bytes = Buffer.from(await pdf.save())
  writeFileSync(CACHE, bytes)
  return bytes
}

const { check, done } = checks()
const bytes = await makePdf()
console.log(`heavy pdf: ${PAGES} pages, ${(bytes.length / 1e6).toFixed(0)} MB; load average ${os.loadavg().map((n) => n.toFixed(2)).join(' ')}`)
const c = await sandbox({ width: 1400, height: 900 })
const { h, v, close } = c
const wait = (ms) => h.waitForTimeout(ms)
const ED = '[data-open] .tiptap'

/** From the Enter that jumps, the times (ms) the page and the rail's thumbnails were drawn. */
const measure = () => h.evaluate(([to]) => new Promise((resolve) => {
  /** A canvas has a picture on it: its middle is neither empty nor plain white. */
  const inked = (canvas) => {
    if (!canvas || !canvas.width || !canvas.height) return false
    const ink = canvas.getContext('2d', { willReadFrequently: true })
    const [r, g, b, a] = ink.getImageData(canvas.width >> 1, canvas.height >> 1, 1, 1).data
    return a > 0 && !(r > 250 && g > 250 && b > 250)
  }
  const field = document.querySelector('.pdf-reader [data-scrub-field]')
  field.addEventListener('keydown', function start(event) {
    if (event.key !== 'Enter') return
    field.removeEventListener('keydown', start, true)
    const t0 = performance.now()
    const out = { first: 0, sharp: 0, rail: 0, thumbs: 0, before: [...document.querySelectorAll('.pdf-reader .pdf-thumb canvas')].filter((one) => !(one.width === 300 && one.height === 150)).length }
    const tick = () => {
      const now = performance.now() - t0
      const canvas = document.querySelector(`.pdf-reader .pdf-page[data-page="${to}"] canvas`)
      if (!out.first && inked(canvas)) out.first = now
      // Sharp: drawn at the full width times the screen's density.
      const sheet = canvas?.parentElement?.getBoundingClientRect()
      if (!out.sharp && inked(canvas) && sheet && canvas.width >= Math.floor(sheet.width * devicePixelRatio) - 2) out.sharp = now
      const list = document.querySelector('.pdf-reader .pdf-rail-list')?.getBoundingClientRect()
      const near = [...document.querySelectorAll('.pdf-reader .pdf-thumb')].filter((one) => { const r = one.getBoundingClientRect(); return list && r.bottom > list.top + 4 && r.top < list.bottom - 4 })
      if (!out.rail && near.length && near.every((one) => inked(one.querySelector('canvas')))) out.rail = now
      if ((out.first && out.sharp && out.rail) || now > 20000) {
        out.thumbs = [...document.querySelectorAll('.pdf-reader .pdf-thumb canvas')].filter((one) => !(one.width === 300 && one.height === 150)).length
        out.visible = near.map((one) => one.querySelector('.pdf-thumb-number')?.textContent).join(',')
        return resolve(out)
      }
      requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  }, true)
}), [TO])

try {
  await v('settings:set', { sounds: false, hintRate: 0 })
  await h.evaluate(() => localStorage.setItem('pdf-rail', 'pages'))
  const id = await v('article:new')
  await v('item:save', id, { title: 'Heavy', body: { type: 'doc', content: [{ type: 'paragraph' }] } })
  await c.send('article', id); await wait(1400)
  // Handed over in parts: one message of the whole book is more than the bridge carries.
  await h.evaluate(() => { window.__heavy = [] })
  for (let at = 0; at < bytes.length; at += 8e6) await h.evaluate((part) => { window.__heavy.push(Uint8Array.from(atob(part), (ch) => ch.charCodeAt(0))) }, bytes.subarray(at, at + 8e6).toString('base64'))
  await h.evaluate((sel) => {
    const ed = document.querySelector(sel).editor
    const file = new File(window.__heavy, 'heavy-book.pdf', { type: 'application/pdf' })
    delete window.__heavy
    const data = new DataTransfer()
    data.items.add(file)
    const box = ed.view.dom.getBoundingClientRect()
    ed.view.dom.dispatchEvent(new DragEvent('drop', { dataTransfer: data, bubbles: true, cancelable: true, clientX: box.left + 20, clientY: box.bottom - 4 }))
  }, ED)
  await h.waitForSelector('.is-pdf button[aria-label="Open heavy-book.pdf"]', { timeout: 60000 })
  await h.click('.is-pdf button[aria-label="Open heavy-book.pdf"]')
  await h.waitForSelector('.pdf-reader .pdf-page[data-page="1"] canvas', { timeout: 30000 })
  // Settled at page 1: its pages and thumbnails drawn, nothing still queued.
  await wait(4000)
  const runs = Number(process.env.RUNS ?? 1)
  const all = []
  for (let run = 0; run < runs; run++) {
    // Back to page 1 between runs, settled, so each run jumps the same way.
    if (run) {
      await h.click('.pdf-reader [data-scrub-field]'); await h.keyboard.press('Meta+a'); await h.keyboard.type('1'); await h.keyboard.press('Enter'); await wait(4000)
    }
    await h.click('.pdf-reader [data-scrub-field]'); await h.keyboard.press('Meta+a'); await h.keyboard.type(String(TO))
    const timing = measure()
    await wait(100)
    await h.keyboard.press('Enter')
    const out = await timing
    all.push(out)
    console.log(`run ${run + 1}: first pixels ${Math.round(out.first)}ms, sharp ${Math.round(out.sharp)}ms, rail thumbnails ${Math.round(out.rail)}ms (pages ${out.visible}), thumbnails with a canvas: ${out.before} before the jump, ${out.thumbs} after`)
  }
  const mid = (key) => all.map((one) => one[key]).sort((a, b) => a - b)[all.length >> 1]
  console.log(`median: first ${Math.round(mid('first'))}ms, sharp ${Math.round(mid('sharp'))}ms, rail ${Math.round(mid('rail'))}ms; load average ${os.loadavg().map((n) => n.toFixed(2)).join(' ')}`)
  const strict = process.env.QA_STRICT === '1'
  check('the page jumped to shows', all.every((one) => one.first > 0), JSON.stringify(all))
  check('the rail\'s thumbnails in view are drawn', all.every((one) => one.rail > 0), JSON.stringify(all))
  if (strict) {
    check('first pixels under 300ms', mid('first') < 300, `${Math.round(mid('first'))}ms`)
    check('sharp under 1s', mid('sharp') < 1000, `${Math.round(mid('sharp'))}ms`)
  }
} catch (error) {
  check('no crash', false, String(error?.stack ?? error))
} finally {
  await close()
}
done()
