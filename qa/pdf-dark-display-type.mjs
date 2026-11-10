// "Dark pages" on a scanned book's chapter opening: big black display type
// ("ISLAND." on The Crime Book's p. 80) is print, so it turns light on the dark
// page, never hollow outlines; a photo page (the portrait on p. 53) stays true.
// Both on the page as read and on its thumbnail. Needs a copy of The Crime Book:
//   BOOK=/path/crime.pdf QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox SHOT=/tmp/dark-type node qa/pdf-dark-display-type.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'
const SHOT = process.env.SHOT ?? '/tmp/pdf-dark-display-type'
const BOOK = process.env.BOOK
const { check, done } = checks()
if (!BOOK) throw new Error('BOOK=/path/to/the-crime-book.pdf')

const c = await sandbox({ width: 1400, height: 900 })
const { h, v } = c
const wait = (ms) => h.waitForTimeout(ms)
try {
  await v('settings:set', { sounds: false, hintRate: 0 })
  await h.evaluate(() => (localStorage.setItem('pdf-rail', 'pages'), localStorage.setItem('pdf-dark', '1')))
  const [book] = (await v('media:add', [{ path: BOOK }])).added
  await h.evaluate((src) => window.dispatchEvent(new CustomEvent('haligtree:pdf', { detail: { src, name: 'crime.pdf', page: 82 } })), book.src)
  await h.waitForSelector('.pdf-reader .pdf-page[data-page="82"] canvas:not([data-pass="rough"])', { timeout: 30000 })
  await wait(2500)
  // How much of the inside of the big letters is light (print turned light) against dark (kept black, a hollow letter).
  const inside = (sel) => h.evaluate((sel) => {
    const canvas = document.querySelector(sel)
    if (!canvas) return null
    const ink = canvas.getContext('2d', { willReadFrequently: true })
    // "ISLAND." sits across the page a little above the middle: sample a band there.
    const y0 = Math.round(canvas.height * 0.36), y1 = Math.round(canvas.height * 0.46)
    const x0 = Math.round(canvas.width * 0.1), x1 = Math.round(canvas.width * 0.9)
    const d = ink.getImageData(x0, y0, x1 - x0, y1 - y0).data
    let light = 0, dark = 0
    for (let i = 0; i < d.length; i += 4 * 7) { const l = (d[i] * 77 + d[i + 1] * 150 + d[i + 2] * 29) >> 8; if (l > 150) light++; else if (l < 60) dark++ }
    return { light, dark, share: Math.round((light / (light + dark)) * 100) }
  }, sel)
  const page = await inside('.pdf-reader .pdf-page[data-page="82"] canvas')
  await h.locator('.pdf-reader .pdf-page[data-page="82"]').screenshot({ path: `${SHOT}-p82.png` })
  // In dark pages the letters are light on a dark ground: most of the band (letters fill it) reads light.
  check('p. 80 "ISLAND.": the big black letters turn light, filled, not outlines', page && page.share > 45, JSON.stringify(page))
  const thumb = await inside('.pdf-reader .pdf-thumb[aria-current="page"] canvas')
  await h.locator('.pdf-reader .pdf-thumb[aria-current="page"]').screenshot({ path: `${SHOT}-p82-thumb.png` }).catch(() => {})
  check('its thumbnail the same', thumb && thumb.share > 45, JSON.stringify(thumb))

  // A photo page stays true: the portrait on p. 53 keeps its many mid tones (a negative would flip them).
  await h.click('.pdf-reader [data-scrub-field]'); await h.keyboard.press('Meta+a'); await h.keyboard.type('53'); await h.keyboard.press('Enter')
  await h.waitForSelector('.pdf-reader .pdf-page[data-page="55"] canvas:not([data-pass="rough"])', { timeout: 30000 })
  await wait(2500)
  await h.locator('.pdf-reader .pdf-page[data-page="55"]').screenshot({ path: `${SHOT}-p55.png` })
  const photo = await h.evaluate(() => {
    const canvas = document.querySelector('.pdf-reader .pdf-page[data-page="55"] canvas')
    const ink = canvas.getContext('2d', { willReadFrequently: true })
    const d = ink.getImageData(0, 0, canvas.width, canvas.height).data
    let warm = 0, seen = 0
    for (let i = 0; i < d.length; i += 4 * 97) { seen++; if (d[i] - d[i + 2] > 25 && d[i] > 90) warm++ }
    return { warm, seen }
  })
  check('p. 53: the photo keeps its true, warm tones', photo.warm > photo.seen * 0.02, JSON.stringify(photo))
  check('the typed "53" landed on the printed page 53, the file\'s 55th', await h.evaluate(() => document.querySelector('.pdf-reader [data-scrub-field]').value) === '53', '')
} finally {
  await c.close()
}
done()
