// The reader's page layouts, as Preview's: "Continuous scroll", "Single page"
// (a page the window's height, the scroll resting on whole pages) and "Two
// pages" (a spread, the cover alone on the right), from the bar's "Page layout"
// menu, kept per book. "Dark pages": the page in the theme's dark with its text
// light and its picture kept true (a red square stays red).
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox SHOT=/tmp/layout node qa/pdf-layout.mjs
import { deflateSync } from 'zlib'
import { PDFDocument, StandardFonts } from 'pdf-lib'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'
const SHOT = process.env.SHOT ?? '/tmp/pdf-layout'
const { check, done } = checks()

// A 4 x 4 red PNG, made by hand.
const png = () => {
  const crc = (buf) => { let c = ~0; for (const b of buf) { c ^= b; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1)) } return ~c >>> 0 }
  const chunk = (type, data) => { const t = Buffer.from(type); const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const c = Buffer.alloc(4); c.writeUInt32BE(crc(Buffer.concat([t, data]))); return Buffer.concat([len, t, data, c]) }
  const head = Buffer.alloc(13); head.writeUInt32BE(4, 0); head.writeUInt32BE(4, 4); head[8] = 8; head[9] = 2
  const rows = Buffer.concat(Array.from({ length: 4 }, () => Buffer.from([0, 220, 30, 30, 220, 30, 30, 220, 30, 30, 220, 30, 30])))
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', head), chunk('IDAT', deflateSync(rows)), chunk('IEND', Buffer.alloc(0))])
}
const makePdf = async () => {
  const pdf = await PDFDocument.create()
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  const red = await pdf.embedPng(png())
  for (let n = 1; n <= 8; n++) {
    const page = pdf.addPage([300, 400])
    page.drawText(`Page ${n}`, { x: 30, y: 340, size: 28, font })
    page.drawImage(red, { x: 100, y: 100, width: 100, height: 100 })
  }
  return [...(await pdf.save())]
}

const c = await sandbox({ width: 1300, height: 860 })
const { h, v } = c
const wait = (ms) => h.waitForTimeout(ms)
const pick = async (label) => {
  await h.click('.pdf-reader button[aria-label="View"]'); await wait(300)
  await h.locator('[data-page-layout-menu] [role^="menuitem"]', { hasText: label }).first().click(); await wait(1500)
}
const sheets = () => h.evaluate(() => {
  const view = document.querySelector('.pdf-reader-scroll').getBoundingClientRect()
  return { view: { top: view.top, height: view.height }, pages: [...document.querySelectorAll('.pdf-reader .pdf-page')].slice(0, 4).map((one) => { const r = one.getBoundingClientRect(); return { page: one.dataset.page, x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) } }) }
})
try {
  await v('settings:set', { sounds: false, hintRate: 0 })
  const src = await h.evaluate((bytes) => window.api.saveFile('layout.pdf', new Uint8Array(bytes)), await makePdf())
  const open = async () => {
    await h.evaluate(([src]) => window.dispatchEvent(new CustomEvent('haligtree:pdf', { detail: { src, name: 'layout.pdf', page: 1 } })), [src])
    await h.waitForSelector('.pdf-reader .pdf-page canvas', { timeout: 20000 }); await wait(1500)
  }
  await open()

  await pick('Two pages')
  const two = await sheets()
  const [p1, p2, p3] = two.pages
  check('"Two pages": the cover lies alone on the right, then 2 and 3 side by side', p1 && p2 && p3 && p2.y > p1.y + 10 && Math.abs(p2.y - p3.y) <= 1 && p3.x > p2.x && p1.x > p2.x, JSON.stringify(two.pages))
  // A wide, short window: two pages fitted to the width alone would run off the bottom.
  await c.size(1900, 720); await wait(1200)
  const wide = await sheets()
  check('"Two pages" at Fit in a wide, short window: the whole spread fits the window\'s height', wide.pages[0] && wide.pages[0].h <= wide.view.height + 1, JSON.stringify({ page: wide.pages[0], view: wide.view }))
  await h.screenshot({ path: `${SHOT}-two-wide.png` })
  await c.size(1300, 860); await wait(1000)
  await c.both(`${SHOT}-two`)
  // The sidebar's thumbnails lie as the spread does; the layout has one home, the bar's "View" menu, never a second row in the sidebar.
  if (!(await h.$('.pdf-rail'))) await h.click('.pdf-reader button[aria-label="Sidebar"]')
  await wait(800)
  const rail = await h.evaluate(() => ({ pairs: [...document.querySelectorAll('.pdf-rail [data-thumb-pair]')].slice(0, 3).map((one) => one.dataset.thumbPair), choices: document.querySelectorAll('.pdf-rail [data-rail-layout]').length }))
  check('the thumbnails follow the spread: 1 alone, then 2-3, 4-5', rail.pairs.join() === '1,2-3,4-5', JSON.stringify(rail))
  check('the sidebar has no layout row of its own: one home, the "View" menu', rail.choices === 0, JSON.stringify(rail))

  // Switching layouts from the "View" menu, a frame every 50ms: the page settles into the new layout, never blank.
  await h.click('.pdf-reader button[aria-label="View"]'); await wait(300)
  await h.locator('[data-page-layout-menu] [data-layout-choice="continuous"]').click()
  const switching = []
  for (let i = 0; i < 16; i++) {
    switching.push(await h.evaluate(() => ({ layout: document.querySelector('.pdf-reader')?.dataset.layout, drawn: document.querySelectorAll('.pdf-reader .pdf-page canvas').length })))
    await h.screenshot({ path: `${SHOT}-switch-${String(i).padStart(2, '0')}.png` }); await wait(50)
  }
  check('switching from the View menu: continuous at once, the pages never blank', switching.every((one) => one.layout === 'continuous' && one.drawn > 0), JSON.stringify(switching.slice(0, 4)))

  // The View menu's items lay the pages out too.
  await c.electron.evaluate(({ Menu }) => Menu.getApplicationMenu().items.find((one) => one.label === 'View').submenu.items.find((one) => one.label === 'Two Pages').click())
  await wait(1200)
  check('View › Two Pages lays the pages out as a spread', await h.evaluate(() => document.querySelector('.pdf-reader')?.dataset.layout) === 'spread', '')

  await pick('Single page')
  const one = await sheets()
  check('"Single page": a whole page fills the window\'s height', one.pages[0].h <= one.view.height && one.pages[0].h >= one.view.height - 80, JSON.stringify({ page: one.pages[0], view: one.view }))
  const snap = await h.evaluate(() => getComputedStyle(document.querySelector('.pdf-reader-scroll')).scrollSnapType)
  check('"Single page": the scroll rests on whole pages', /y mandatory/.test(snap), snap)
  await c.both(`${SHOT}-single`)

  // Kept per book: opened again, it is still a single page.
  await h.reload(); await wait(1500); await open()
  check('the layout is kept for this book', await h.evaluate(() => document.querySelector('.pdf-reader')?.dataset.layout) === 'single', '')
  await pick('Continuous scroll')

  // Dark pages: the ground dark, the red square still red.
  await h.click('.pdf-reader button[aria-label="View"]'); await wait(300)
  const looks = await h.evaluate(() => [...document.querySelectorAll('[data-page-layout-menu] [data-look-choice]')].map((one) => one.textContent))
  check('the page look is one choice of three: Paper, White, Dark', looks.join() === 'Paper pages,White pages,Dark pages', JSON.stringify(looks))
  await h.locator('[data-page-layout-menu] [data-dark-pages]').click(); await wait(2500)
  await h.keyboard.press('Escape')
  const look = await h.evaluate(() => {
    const canvas = [...document.querySelectorAll('.pdf-reader .pdf-page[data-page="1"] canvas')].at(-1)
    const ink = canvas.getContext('2d')
    const at = (fx, fy) => [...ink.getImageData(Math.round(canvas.width * fx), Math.round(canvas.height * fy), 1, 1).data].slice(0, 3)
    return { ground: at(0.05, 0.95), square: at(0.5, 0.625), dark: document.querySelector('.pdf-reader').classList.contains('is-dark') }
  })
  check('"Dark pages": the page is dark', look.dark && look.ground.every((one) => one < 60), JSON.stringify(look))
  check('"Dark pages": the picture keeps its own colours (the red square stays red)', look.square[0] > 180 && look.square[1] < 80, JSON.stringify(look))
  await c.both(`${SHOT}-dark`)
  check('page colour has one home, the Pages menu: no second switch on the bar', await h.evaluate(() => !document.querySelector('.pdf-reader button[aria-label="Paper pages"], .pdf-reader button[aria-label="White pages"]')), '')
  await h.click('.pdf-reader button[aria-label="View"]'); await wait(300)
  await h.locator('[data-page-layout-menu] [data-dark-pages]').click(); await wait(500)
} catch (error) {
  check('ran without throwing', false, String(error?.stack ?? error))
}
await c.close()
done()
