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

const COVERS = { Meditations: '0.55 0.18 0.16', Walden: '0.16 0.38 0.30', Middlemarch: '0.18 0.24 0.48' }
const PDF = (word) => {
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 420] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    null, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>']
  const stream = `${COVERS[word] ?? '0.4 0.4 0.4'} rg 0 0 300 420 re f 0.95 0.9 0.8 rg 24 24 252 3 re f 1 1 1 rg BT /F1 30 Tf 30 340 Td (${word}) Tj ET BT /F1 12 Tf 30 316 Td (A NOVEL) Tj ET`
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
  const words = car ? [...box.querySelectorAll('[data-flex-carousel-caption] span:not(.mf-caption-out)')].map((one) => one.textContent) : [...box.querySelectorAll('[data-still-picture] span')].map((one) => one.textContent).filter(Boolean)
  return { mode: box.dataset.pictureRow, top: Math.round(r.top), height: Math.round(r.height), canvas: !!car?.querySelector('canvas'), fetched: Number(car?.dataset.fetched ?? 0), active: Number(car?.dataset.active ?? -1), words, still: box.querySelectorAll('[data-still-picture]').length }
}, where)
const see = async (where) => (await h.evaluate((where) => document.querySelector(`${where} [data-picture-row]`)?.scrollIntoView({ block: 'center' }), where), await wait(2500))
/** The lines of the right-click menu now open, then shut it. */
const menuLines = async () => {
  await wait(400)
  const lines = await h.evaluate(() => [...document.querySelectorAll('[role=menu] [role=menuitem]')].map((one) => one.textContent.trim()))
  await h.keyboard.press('Escape'); await wait(300)
  return lines
}
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
  // The test books have one real page: opening one in the reader marks it read, so their places are put back.
  const reset = async () => { await v('pdf:read', books[0], 134, 336); await v('pdf:read', books[1], 12, 280); await v('pdf:read', books[2], 401, 880) }
  await v('pdf:read', books[0], 134, 336)
  await go('media'); await go('home'); await wait(1500)
  await see('[data-continue-reading]')
  const one = await row('[data-continue-reading]')
  // A row that fits whole is still, like Home's other shelves; only more than fit makes it flow.
  check('1 book: a still covers row on Home, no carousel', one?.mode === 'still' && !one.canvas && one.still === 1, JSON.stringify(one))
  check('its title and "p. 134 of 336" under the cover', one?.words.includes('Meditations') && one.words.includes('p. 134 of 336'), JSON.stringify(one?.words))
  const flush = await h.evaluate(() => { const head = document.querySelector('[data-continue-reading] h2, [data-continue-reading] h3'); const card = document.querySelector('[data-continue-reading] [data-still-picture]'); return head && card ? Math.round(card.getBoundingClientRect().left - head.getBoundingClientRect().left) : null })
  check("the cover starts exactly under its heading", flush !== null && Math.abs(flush) <= 2, flush)
  await shot('home-1-book')
  await v('pdf:read', books[1], 12, 280)
  await v('pdf:read', books[2], 401, 880)
  await go('media'); await wait(300)

  // Stillness: the row's box and what is below it, at first paint and after the covers are in.
  await go('home')
  await h.evaluate(() => document.querySelector('[data-continue-reading]')?.scrollIntoView({ block: 'center', behavior: 'instant' }))
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
  check('nothing moves as the covers load: the row keeps 250px and the section below stays put, 40 frames 50ms apart', new Set(frames).size === 1 && frames[0].startsWith('250:'), [...new Set(frames)].join(' | '))
  const three = await row('[data-continue-reading]')
  check('3 books: three still covers, each with its title and page', three?.mode === 'still' && three.still === 3 && ['Middlemarch', 'Walden', 'Meditations'].every((t) => three.words.includes(t)), JSON.stringify(three))
  await shot('home-3-books')

  // A click on a cover opens it at once; right-click is the book's own menu; the hand shows.
  await go('home'); await wait(1000)
  await see('[data-continue-reading]')
  await h.evaluate(() => (window.__opened = null))
  const first = h.locator('[data-continue-reading] [data-still-picture="0"]')
  // Books read within the same moment may sit in either order, so the first cover is read, not assumed.
  const firstTitle = await first.evaluate((el) => [...el.querySelectorAll('span')].map((one) => one.textContent).find(Boolean))
  const AT = { Meditations: [books[0], 134], Walden: [books[1], 12], Middlemarch: [books[2], 401] }
  await first.hover(); await wait(200)
  check('the hand over a cover', await h.evaluate(() => getComputedStyle(document.querySelector('[data-continue-reading] [data-still-picture="0"]')).cursor) === 'pointer')
  await first.click({ button: 'right' })
  const coverMenu = await menuLines()
  check('right-click on a cover: the book\'s own menu (Continue at its page), and no "Show in Finder"', coverMenu.some((l) => l.startsWith(`Continue at p. ${AT[firstTitle]?.[1]}`)) && !coverMenu.some((l) => /Finder/.test(l)), JSON.stringify(coverMenu))
  await first.click(); await wait(400)
  const clicked = await h.evaluate(() => window.__opened)
  check('a click opens the book under it at its page', clicked?.src === AT[firstTitle]?.[0] && clicked.page === AT[firstTitle]?.[1], JSON.stringify(clicked))
  await h.keyboard.press('Escape'); await wait(600)

  // Keyboard: each cover is a button; Tab to one and ↵ opens it at its page.
  await reset()
  await go('media'); await go('home'); await wait(1000)
  await see('[data-continue-reading]')
  await h.focus('[data-continue-reading] [data-still-picture="1"]')
  const picked = await h.evaluate(() => [...(document.activeElement?.querySelectorAll('span') ?? [])].map((one) => one.textContent).find(Boolean))
  await h.evaluate(() => (window.__opened = null))
  await h.keyboard.press('Enter'); await wait(400)
  const opened = await h.evaluate(() => window.__opened)
  const SRC = { Meditations: books[0], Walden: books[1], Middlemarch: books[2] }
  check('↵ on a focused cover opens that book', !!picked && opened?.src === SRC[picked], JSON.stringify({ picked, opened }))

  // The PDF shelf: the same row at its top.
  await go('media'); await wait(800)
  await h.locator('[data-page=media] [data-media-kinds] button', { hasText: 'Books' }).first().click(); await wait(4500)
  const shelf = await row('[data-shelf-continue]')
  await h.locator('[data-library] [data-book]').first().click({ button: 'right' })
  const shelfMenu = await menuLines()
  check('the shelf\'s book card has the same menu', shelfMenu.some((l) => /^Continue at p\./.test(l)) && !shelfMenu.some((l) => /Finder/.test(l)), JSON.stringify(shelfMenu))
  check('Media\'s PDF shelf opens on the same covers row', shelf && (shelf.canvas || shelf.still > 0) && shelf.words.some((w) => /^p\. /.test(w)), JSON.stringify(shelf))
  await shot('media-pdf-shelf')

  // (Media's "Recent pictures" row is gone: Files keeps pictures by month, checked in qa/files-piles.mjs.)
  for (let n = 1; n <= 12; n++) await make([para(`Picture note ${n}`), { type: 'image', attrs: { src: await picture(n) } }])

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

  // --- Dark: every row, and the grain on the Journal banner.
  if (shots) {
    const dark = (on) => h.evaluate((on) => { localStorage.setItem('theme', on ? 'dark' : 'paper'); window.dispatchEvent(new StorageEvent('storage', { key: 'theme' })) }, on)
    await reset()
    await dark(true); await wait(600)
    await go('media'); await go('home'); await wait(1000); await see('[data-continue-reading]')
    await shot('dark-home-continue')
    await go('media'); await wait(800)
    await h.locator('[data-page=media] [data-media-kinds] button', { hasText: 'Pictures' }).first().click(); await wait(2500)
    await shot('dark-media-recent')
    await h.locator('[data-page=media] [data-media-kinds] button', { hasText: 'Books' }).first().click(); await wait(3500)
    await shot('dark-media-pdf-shelf')
    await go('day'); await wait(2500)
    await h.evaluate(() => document.documentElement.toggleAttribute('data-awake', true))
    const banner = await h.evaluate(() => { const r = document.querySelector('[data-scene]')?.getBoundingClientRect(); return r && { x: r.x, y: r.y, width: r.width, height: r.height } })
    if (banner) await h.screenshot({ path: `${shots}/dark-grain-banner.png`, clip: banner })
    await go('home'); await wait(800)
    await h.evaluate(() => window.dispatchEvent(new CustomEvent('haligtree:wrap', { detail: `month:${new Date().toISOString().slice(0, 7)}` }))); await wait(2500)
    for (let i = 0; i < 9 && !(await h.evaluate(() => !!document.querySelector('[data-wrap-flow]'))); i++) (await h.keyboard.press('ArrowRight'), await wait(1200))
    await wait(3000)
    await shot('dark-wrapped-flow')
    await h.keyboard.press('Escape'); await wait(800)
    await dark(false); await wait(600)
  }

  // --- Show all: Continue reading's "Show all" goes to Media.
  await reset()
  await go('media'); await go('home'); await wait(1200); await see('[data-continue-reading]')
  await h.locator('[data-continue-reading] button', { hasText: 'Show all' }).first().click(); await wait(1200)
  const landed = await h.evaluate(() => { const shelf = document.querySelector('[data-page=media] [data-shelf-continue]'); const r = shelf?.getBoundingClientRect(); return { media: !!document.querySelector('[data-page=media]'), pdfs: !!document.querySelector('[data-library]'), inView: !!r && r.top >= 0 && r.top < innerHeight } })
  check('Continue reading\'s "Show all" opens Media on the PDF shelf, its books in progress in view', landed.media && landed.pdfs && landed.inView, JSON.stringify(landed))
  await shot('show-all-media')

  // --- Motion off: still rows of the same height, only those in view drawn.
  await reset()
  await v('settings:set', { motion: false })
  await go('media'); await wait(1500)
  // "Show all" left Media on the PDFs: back to the pictures.
  await h.locator('[data-page=media] [data-media-kinds] button', { hasText: 'Pictures' }).first().click(); await wait(1500)
  const still = await row('[data-recent-pictures]')
  check('Motion off: a still row, the same 250px, no WebGL', still?.mode === 'still' && still.height === 250 && !still.canvas, JSON.stringify(still))
  await shot('media-recent-still')
  await h.locator('[data-recent-pictures] [data-still-picture="0"]').click({ button: 'right' })
  const stillMenu = await menuLines()
  check('Motion off: right-click on a still picture gives its menu too', stillMenu.some((l) => l.startsWith('Open note')) && !stillMenu.some((l) => /Finder/.test(l)), JSON.stringify(stillMenu))
  await go('home'); await wait(1200)
  await see('[data-continue-reading]')
  const homeStill = await row('[data-continue-reading]')
  await shot('home-still')
  console.log('  still row box', await h.evaluate(() => { const el = document.querySelector('[data-continue-reading] [data-picture-row] [role=list]'); return el && { cw: el.clientWidth, sw: el.scrollWidth } }))
  check('Motion off on Home: still covers, the same 250px, all three drawn', homeStill?.mode === 'still' && homeStill.height === 250 && homeStill.still === 3, JSON.stringify(homeStill))
  await h.evaluate(() => (window.__opened = null))
  const firstStill = await h.locator('[data-continue-reading] [data-still-picture="0"]').innerText()
  await h.locator('[data-continue-reading] [data-still-picture="0"]').click(); await wait(400)
  const stillOpened = await h.evaluate(() => window.__opened)
  check('a still cover opens its book at its page too', !!stillOpened && firstStill.includes(`p. ${stillOpened.page} of`), JSON.stringify([firstStill, stillOpened]))
  await h.keyboard.press('Escape'); await wait(600)
  await v('settings:set', { motion: true })

  // --- 5,000 pictures: one note each, each its own file (Media is one tile a file, however many notes hold it).
  const srcs = await h.evaluate(() => [...document.querySelectorAll('img')].length) // warm
  void srcs
  const files = []
  for (let n = 1; n <= 12; n++) files.push(await picture(n))
  await h.evaluate(async (files) => {
    // One small PNG, each copy made its own file by a few bytes after its end.
    const canvas = document.createElement('canvas'); canvas.width = 40; canvas.height = 30
    const pen = canvas.getContext('2d'); pen.fillStyle = '#7a8b5c'; pen.fillRect(0, 0, 40, 30)
    const base = new Uint8Array(await (await new Promise((ok) => canvas.toBlob(ok, 'image/png'))).arrayBuffer())
    const own = (n) => { const bytes = new Uint8Array(base.length + 4); bytes.set(base); new DataView(bytes.buffer).setUint32(base.length, n); return window.api.saveImage('image/png', bytes) }
    for (let at = 0; at < 4988; at += 100) {
      await Promise.all(Array.from({ length: Math.min(100, 4988 - at) }, async (_, k) => window.api.captures.create({ kind: 'note', body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: `Many ${at + k + 1}` }] }, { type: 'image', attrs: { src: await own(at + k + 1) } }] } })))
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
