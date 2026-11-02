// Flex Carousel rows (React Bits): Continue reading's covers on Home and at
// the top of Media's PDF shelf ("p. 134 of 336", a click opens the book at that
// page), and Media's "Recent pictures" over the grid ("01 / 12", a click opens
// the picture's note as a tile does). Each keeps its room from the first paint
// (nothing below moves as it loads), fetches only the pictures near the view,
// stops at its ends when short, takes ← → ↵ from the keyboard, and with Motion
// off is a still row drawing only what is in view. 0, 1, 3, 12 and 5,000
// pictures; phone width. Frames with QA_SHOTS.
//
//   npx electron-vite build --outDir out-r
//   QA_ARGS=--sandbox QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-r/main/index.js HALIGTREE_QA_AWAY=1 node qa/flex-rows.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const { check, done } = checks()
const c = await sandbox({ width: 1300, height: 900 })
const { h, go, v } = c
const wait = (ms) => h.waitForTimeout(ms)
const shots = process.env.QA_SHOTS
const shot = (name) => shots && h.screenshot({ path: `${shots}/${name}.png` })

const PDF = (word) => {
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 420] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    null, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>']
  const stream = `BT /F1 30 Tf 40 300 Td (${word}) Tj ET`
  objects[3] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`
  let out = '%PDF-1.4\n'
  const at = []
  objects.forEach((body, i) => (at.push(out.length), (out += `${i + 1} 0 obj\n${body}\nendobj\n`)))
  const xref = out.length
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${at.map((n) => `${String(n).padStart(10, '0')} 00000 n \n`).join('')}`
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return [...Buffer.from(out)]
}
const para = (text) => ({ type: 'paragraph', content: [{ type: 'text', text }] })
const make = (body) => h.evaluate((b) => window.api.captures.create({ kind: 'note', body: b }), { type: 'doc', content: body })
/** A picture of one colour with its number on it. */
const picture = (n) => h.evaluate(async (n) => {
  const canvas = document.createElement('canvas'); canvas.width = 400; canvas.height = 300
  const pen = canvas.getContext('2d'); pen.fillStyle = `hsl(${(n * 47) % 360} 55% 55%)`; pen.fillRect(0, 0, 400, 300)
  pen.fillStyle = '#fff'; pen.font = 'bold 120px sans-serif'; pen.fillText(String(n), 60, 200)
  const blob = await new Promise((ok) => canvas.toBlob(ok, 'image/png'))
  return window.api.saveImage('image/png', new Uint8Array(await blob.arrayBuffer()))
}, n)
const row = (where) => h.evaluate((where) => {
  const box = document.querySelector(`${where} [data-picture-row]`)
  if (!box) return null
  const r = box.getBoundingClientRect()
  const car = box.querySelector('[data-flex-carousel]')
  const words = car ? [...car.querySelectorAll('[aria-hidden=true] span')].map((one) => one.textContent) : []
  return { mode: box.dataset.pictureRow, top: Math.round(r.top), height: Math.round(r.height), canvas: !!car?.querySelector('canvas'), fetched: Number(car?.dataset.fetched ?? 0), active: Number(car?.dataset.active ?? -1), words, still: box.querySelectorAll('[data-still-picture]').length }
}, where)
const see = async (where) => (await h.evaluate((where) => document.querySelector(`${where} [data-picture-row]`)?.scrollIntoView({ block: 'center' }), where), await wait(2500))
const below = (sel) => h.evaluate((sel) => Math.round(document.querySelector(sel)?.getBoundingClientRect().top ?? -1), sel)

try {
  await v('settings:set', { sounds: false, hintRate: 0, motion: true })
  await h.evaluate(() => window.addEventListener('haligtree:pdf', (e) => (window.__opened = e.detail)))

  // --- 0 books: no row at all.
  await go('home'); await wait(1500)
  check('0 books part way: no covers row on Home', !(await h.evaluate(() => document.querySelector('[data-reading-row]'))))

  // --- 1 book, then 3.
  const books = []
  for (const [i, word] of ['Meditations', 'Walden', 'Middlemarch'].entries()) {
    const src = await h.evaluate((bytes) => window.api.saveFile(`${bytes.name}.pdf`, new Uint8Array(bytes.data)), { name: word, data: [...PDF(word), ...Buffer.from(`% ${i}\n`)] })
    await make([para(`Reading ${word}`), { type: 'attachment', attrs: { src, name: `${word}.pdf`, size: 900 } }])
    books.push(src)
  }
  await v('pdf:read', books[0], 134, 336)
  await go('media'); await go('home'); await wait(1500)
  await see('[data-continue-reading]')
  const one = await row('[data-continue-reading]')
  check('1 book: a covers row on Home, in the WebGL carousel', one?.mode === 'moving' && one.canvas, JSON.stringify(one))
  check('its title and "p. 134 of 336" under the cover', one?.words.includes('Meditations') && one.words.includes('p. 134 of 336'), JSON.stringify(one?.words))
  await shot('home-1-book')
  await v('pdf:read', books[1], 12, 280)
  await v('pdf:read', books[2], 401, 880)
  await go('media'); await wait(300)

  // Stillness: the row's box and what is below it, at first paint and after the covers are in.
  await go('home')
  await h.evaluate(() => document.querySelector('[data-continue-reading]')?.scrollIntoView({ block: 'center', behavior: 'instant' }))
  const firstPaint = await h.evaluate(() => {
    const box = document.querySelector('[data-continue-reading] [data-picture-row]')
    const next = document.querySelector('[data-continue-reading]')?.nextElementSibling
    return box && { h: Math.round(box.getBoundingClientRect().height), next: Math.round(next?.getBoundingClientRect().top ?? -1) }
  })
  const frames = []
  for (let i = 0; i < 40; i++) {
    frames.push(await h.evaluate(() => {
      const box = document.querySelector('[data-continue-reading] [data-picture-row]')
      const next = document.querySelector('[data-continue-reading]')?.nextElementSibling
      return box ? `${Math.round(box.getBoundingClientRect().height)}:${Math.round(next?.getBoundingClientRect().top ?? -1)}` : 'none'
    }))
    if (shots && i % 4 === 0) await h.screenshot({ path: `${shots}/home-load-${String(i).padStart(2, '0')}.png`, clip: { x: 0, y: 0, width: 1300, height: 900 } })
    await wait(50)
  }
  check('nothing moves as the covers load: the row keeps 300px and the section below stays put, 40 frames 50ms apart', new Set(frames).size === 1 && firstPaint?.h === 300, `${JSON.stringify(firstPaint)} ${[...new Set(frames)].join(' | ')}`)
  const three = await row('[data-continue-reading]')
  check('3 books: a short row stops at its ends (one cover each, no copies), the last read in the middle', three?.words.includes('Middlemarch') && three.fetched === 3, JSON.stringify(three))
  await shot('home-3-books')

  // A click on a cover opens it at once.
  await go('home'); await wait(1000)
  await see('[data-continue-reading]')
  await h.evaluate(() => (window.__opened = null))
  const box = await h.evaluate(() => { const r = document.querySelector('[data-continue-reading] [data-flex-carousel]').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 } })
  await h.mouse.move(box.x, box.y); await wait(300)
  check('the hand over a cover', await h.evaluate(() => getComputedStyle(document.querySelector('[data-continue-reading] [data-flex-carousel]')).cursor) === 'pointer')
  await h.mouse.click(box.x, box.y); await wait(400)
  const clicked = await h.evaluate(() => window.__opened)
  // Three fit whole, so they sit centred: the one in the middle is the second, its title under it as the pointer rests there.
  check('a click opens the book under it at its page', clicked?.src === books[1] && clicked.page === 12, JSON.stringify(clicked))
  await h.keyboard.press('Escape'); await wait(600)

  // Keyboard: Tab to it, → turns, ↵ opens at the page. (Opening a book made it the last read, so the order is read from the row.)
  // The test books have one real page: opening one in the reader marks it read, so their places are put back.
  const reset = async () => { await v('pdf:read', books[0], 134, 336); await v('pdf:read', books[1], 12, 280); await v('pdf:read', books[2], 401, 880) }
  const PAGES = { Meditations: 'p. 134 of 336', Walden: 'p. 12 of 280', Middlemarch: 'p. 401 of 880' }
  const SRC = { Meditations: books[0], Walden: books[1], Middlemarch: books[2] }
  await reset()
  await go('media'); await go('home'); await wait(1000)
  await see('[data-continue-reading]')
  await h.focus('[data-continue-reading] [data-flex-carousel]')
  const start = await row('[data-continue-reading]')
  await h.keyboard.press('ArrowRight'); await wait(900)
  const turned = await row('[data-continue-reading]')
  check('→ turns to the next book, its title and page under it', turned?.active === 1 && turned.words[0] !== start.words[0] && turned.words[1] === PAGES[turned.words[0]], JSON.stringify([start?.words, turned?.words]))
  await h.keyboard.press('ArrowRight'); await h.keyboard.press('ArrowRight'); await wait(900)
  const end = await row('[data-continue-reading]')
  check('a short row stops at its end: → past the last stays on the last', end?.active === 2, JSON.stringify({ end, focus: await h.evaluate(() => document.activeElement?.outerHTML.slice(0, 80)) }))
  await h.keyboard.press('ArrowLeft'); await wait(900)
  const before = await row('[data-continue-reading]')
  await h.evaluate(() => (window.__opened = null))
  await h.keyboard.press('Enter'); await wait(400)
  const opened = await h.evaluate(() => window.__opened)
  check('↵ opens the picked book at its page', before?.active === 1 && opened?.src === SRC[before.words[0]] && `p. ${opened.page} of` === PAGES[before.words[0]].replace(/ of \d+$/, ' of'), JSON.stringify({ opened, before: before?.words }))

  // The PDF shelf: the same row at its top.
  await go('media'); await wait(800)
  await h.locator('[data-page=media] [data-media-kinds] button', { hasText: 'PDFs' }).first().click(); await wait(4500)
  const shelf = await row('[data-shelf-continue]')
  check('Media\'s PDF shelf opens on the same covers row', shelf?.canvas && shelf.words.some((w) => /^p\. /.test(w)), JSON.stringify(shelf))
  await shot('media-pdf-shelf')

  // --- Recent pictures: 12.
  for (let n = 1; n <= 12; n++) await make([para(`Picture note ${n}`), { type: 'image', attrs: { src: await picture(n) } }])
  await go('home'); await go('media'); await wait(800)
  await h.locator('[data-page=media] [data-media-kinds] button', { hasText: 'Pictures' }).first().click(); await wait(2500)
  const recent = await row('[data-recent-pictures]')
  check('Media > Pictures: "Recent pictures" row over the grid', recent?.canvas && (await h.evaluate(() => !!document.querySelector('[data-recent-pictures] + * [data-media], [data-recent-pictures] ~ * [data-media]'))), JSON.stringify(recent))
  check('its counter reads "01 / 12" (or the newest\'s place)', recent?.words.some((w) => /^\d\d \/ \d\d+$/.test(w)), JSON.stringify(recent?.words))
  await shot('media-recent-12')
  const pic = await h.evaluate(() => { const r = document.querySelector('[data-recent-pictures] [data-flex-carousel]').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 } })
  const title = (await row('[data-recent-pictures]')).words[0]
  await h.mouse.click(pic.x, pic.y); await wait(1200)
  const left = await h.evaluate(() => !document.querySelector('[data-recent-pictures]'))
  const where = await h.evaluate(() => document.querySelector('.ProseMirror')?.textContent?.slice(0, 40) ?? '')
  check('a click opens the picture\'s note, as a tile does', left && where.includes(title.replace(/^Picture note /, 'Picture note ')), `${title} → ${where}`)

  // --- The Wrapped story: the month's pictures and gems as one flowing row.
  await go('home'); await wait(800)
  await h.evaluate(() => window.dispatchEvent(new CustomEvent('haligtree:wrap', { detail: `month:${new Date().toISOString().slice(0, 7)}` })))
  await wait(2500)
  let flow = null
  for (let i = 0; i < 9 && !flow; i++) {
    flow = await h.evaluate(() => { const box = document.querySelector('[data-wrap-flow] [data-picture-row]'); return box && { h: Math.round(box.getBoundingClientRect().height) } })
    if (!flow) (await h.keyboard.press('ArrowRight'), await wait(1200))
  }
  await wait(3000)
  const wrapRow = await row('[data-wrap-flow]')
  check('Wrapped: one card is the month\'s pictures and gems as a flowing row', wrapRow?.canvas && wrapRow.height === 300 && wrapRow.words.length === 2, JSON.stringify(wrapRow))
  await shot('wrapped-flow')
  await h.keyboard.press('Escape'); await wait(800)

  // --- Motion off: still rows of the same height, only those in view drawn.
  await reset()
  await v('settings:set', { motion: false })
  await go('media'); await wait(1500)
  const still = await row('[data-recent-pictures]')
  check('Motion off: a still row, the same 300px, no WebGL', still?.mode === 'still' && still.height === 300 && !still.canvas, JSON.stringify(still))
  await shot('media-recent-still')
  await go('home'); await wait(1200)
  await see('[data-continue-reading]')
  const homeStill = await row('[data-continue-reading]')
  await shot('home-still')
  console.log('  still row box', await h.evaluate(() => { const el = document.querySelector('[data-continue-reading] [data-picture-row] [role=list]'); return el && { cw: el.clientWidth, sw: el.scrollWidth } }))
  check('Motion off on Home: still covers, the same 300px, all three drawn', homeStill?.mode === 'still' && homeStill.height === 300 && homeStill.still === 3, JSON.stringify(homeStill))
  await h.evaluate(() => (window.__opened = null))
  const firstStill = await h.locator('[data-continue-reading] [data-still-picture="0"]').innerText()
  await h.locator('[data-continue-reading] [data-still-picture="0"]').click(); await wait(400)
  const stillOpened = await h.evaluate(() => window.__opened)
  check('a still cover opens its book at its page too', !!stillOpened && firstStill.includes(`p. ${stillOpened.page} of`), JSON.stringify([firstStill, stillOpened]))
  await h.keyboard.press('Escape'); await wait(600)
  await v('settings:set', { motion: true })

  // --- 5,000 pictures: one note each, the same twelve files.
  const srcs = await h.evaluate(() => [...document.querySelectorAll('img')].length) // warm
  void srcs
  const files = []
  for (let n = 1; n <= 12; n++) files.push(await picture(n))
  await h.evaluate(async (files) => {
    for (let at = 0; at < 4988; at += 100) {
      await Promise.all(Array.from({ length: Math.min(100, 4988 - at) }, (_, k) => window.api.captures.create({ kind: 'note', body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: `Many ${at + k + 1}` }] }, { type: 'image', attrs: { src: files[(at + k) % 12] } }] } })))
    }
  }, files)
  await go('home'); await go('media'); await wait(2000)
  await h.locator('[data-page=media] [data-media-kinds] button', { hasText: 'Pictures' }).first().click(); await wait(3000)
  const many = await row('[data-recent-pictures]')
  check('5,000 pictures: the row is there, its counter out of 5,000', many?.canvas && many.words.some((w) => /^01 \/ 5,\d{3}$/.test(w)), JSON.stringify(many))
  check('and it fetched only those near the view (under 40 of 5,000)', many && many.fetched > 0 && many.fetched < 40, `${many?.fetched}`)
  await shot('media-recent-5000')
  await h.focus('[data-recent-pictures] [data-flex-carousel]')
  for (let i = 0; i < 6; i++) await h.keyboard.press('ArrowLeft')
  await wait(1200)
  const back = await row('[data-recent-pictures]')
  check('turning back past the first goes round to the end (a long row is endless)', back.words.some((w) => /^(4,9|5,0)\d\d \/ 5,\d{3}$/.test(w)), JSON.stringify(back.words))
  await v('settings:set', { motion: false })
  await wait(800)
  const manyStill = await row('[data-recent-pictures]')
  check('5,000 with Motion off: a still row drawing only those in view', manyStill?.mode === 'still' && manyStill.still > 0 && manyStill.still < 30, `${manyStill?.still} drawn`)
  await v('settings:set', { motion: true })

  // --- Phone width.
  await c.size(390, 844)
  await reset()
  await go('media'); await go('home'); await wait(1500)
  await see('[data-continue-reading]')
  const phone = await h.evaluate(() => ({ wide: document.documentElement.scrollWidth, view: innerWidth, row: Math.round(document.querySelector('[data-continue-reading] [data-picture-row]')?.getBoundingClientRect().width ?? 0) }))
  check('phone width: the covers row fits, no sideways scroll', phone.wide <= phone.view + 1 && phone.row > 0 && phone.row <= phone.view, JSON.stringify(phone))
  await shot('home-phone')
} catch (error) {
  check('ran', false, error.stack)
} finally {
  await c.close()
}
done()
