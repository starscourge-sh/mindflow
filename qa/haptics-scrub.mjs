// Trackpad scrolling and taps on the PDF reader's page number, and the taps
// swept to the places like it: two fingers (a wheel, up and down or sideways)
// over the number step the page and the page behind never takes the wheel; ⇧
// steps ten; each step asks main for one light tap ('align'), the first and
// last page a firm one ('level'); scrolling the pages taps as each page comes
// into place; a Settings slider taps each step. Main only logs taps here
// (HALIGTREE_QA_AWAY): none is played.
//   npx electron-vite build --outDir out-haptics
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-haptics/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox node qa/haptics-scrub.mjs
import { PDFDocument, StandardFonts } from 'pdf-lib'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const { check, done } = checks()
const c = await sandbox({ width: 1400, height: 900 })
const { h, v, electron, close } = c
const wait = (ms) => h.waitForTimeout(ms)
const ED = '[data-open] .tiptap'
const FIELD = '.pdf-reader [data-scrub-field]'
const kinds = () => electron.evaluate(() => globalThis.haligtreeTapKinds?.() ?? null)
const page = () => h.evaluate((sel) => Number(document.querySelector(sel)?.value), FIELD)
/** The taps asked for while `act` ran. */
const tapsOf = async (act) => {
  const before = (await kinds()).length
  await act()
  await wait(200)
  return (await kinds()).slice(before)
}

const makePdf = async () => {
  const pdf = await PDFDocument.create()
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  for (let n = 1; n <= 40; n++) pdf.addPage([612, 792]).drawText(`Page ${n}`, { x: 60, y: 720, size: 22, font })
  return Array.from(await pdf.save())
}

try {
  await v('settings:set', { sounds: false, hintRate: 0 })
  check('main logs the taps it is asked for', Array.isArray(await kinds()), String(await kinds()))
  const id = await v('article:new')
  await v('item:save', id, { title: 'Taps', body: { type: 'doc', content: [{ type: 'paragraph' }] } })
  await c.send('article', id); await wait(1400)
  const bytes = await makePdf()
  await h.evaluate(([sel, bytes]) => {
    const ed = document.querySelector(sel).editor
    const data = new DataTransfer()
    data.items.add(new File([new Uint8Array(bytes)], 'tap-book.pdf', { type: 'application/pdf' }))
    const box = ed.view.dom.getBoundingClientRect()
    ed.view.dom.dispatchEvent(new DragEvent('drop', { dataTransfer: data, bubbles: true, cancelable: true, clientX: box.left + 20, clientY: box.bottom - 4 }))
  }, [ED, bytes])
  await h.waitForSelector('.is-pdf button[aria-label="Open tap-book.pdf"]', { timeout: 15000 })
  await h.click('.is-pdf button[aria-label="Open tap-book.pdf"]')
  await h.waitForSelector('.pdf-reader .pdf-page[data-page="1"] canvas', { timeout: 15000 })
  await wait(800)

  // Every wheel that reaches the page is recorded: whether something kept it from scrolling what is behind.
  await h.evaluate(() => {
    window.__wheels = []
    document.addEventListener('wheel', (event) => window.__wheels.push(event.defaultPrevented))
  })
  const box = await h.locator(FIELD).boundingBox()
  await h.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await wait(200)

  // 1. Two fingers down over the number, three notches' worth, one at a time: three pages on, a light tap each.
  const from = await page()
  const down = await tapsOf(async () => { for (let i = 0; i < 3; i++) { await h.mouse.wheel(0, 24); await wait(150) } })
  const afterDown = await page()
  check('two fingers down over the number: three pages on', afterDown === from + 3, `${from} -> ${afterDown}`)
  check('a light tap for each page, no more', down.length === 3 && down.every((k) => k === 'align'), JSON.stringify(down))
  const wheels = await h.evaluate(() => window.__wheels)
  check('the page behind never took the wheel', wheels.length > 0 && wheels.every(Boolean), JSON.stringify(wheels))

  // 2. Sideways works too, and back up.
  const side = await tapsOf(async () => { await h.mouse.wheel(24, 0); await wait(150) })
  check('two fingers sideways: a page on', (await page()) === afterDown + 1, String(await page()))
  check('one tap for it', side.length === 1, JSON.stringify(side))
  await h.mouse.wheel(0, -24); await wait(150)
  check('two fingers up: a page back', (await page()) === afterDown, String(await page()))

  // 3. A small movement, under a step, moves nothing; the rest is kept for the next.
  const half = await tapsOf(async () => { await h.mouse.wheel(0, 10); await wait(150) })
  check('under a step: no page, no tap', (await page()) === afterDown && half.length === 0, `${await page()} ${JSON.stringify(half)}`)
  await h.mouse.wheel(0, 14); await wait(150)
  check('the rest makes the step', (await page()) === afterDown + 1, String(await page()))

  // 4. ⇧: ten a step.
  const before10 = await page()
  await h.keyboard.down('Shift'); await h.mouse.wheel(0, 24); await h.keyboard.up('Shift'); await wait(200)
  check('⇧ with two fingers: ten pages', (await page()) === before10 + 10, `${before10} -> ${await page()}`)

  // 5. The last page and the first: a firm tap each.
  const toEnd = await tapsOf(async () => { await h.keyboard.down('Shift'); for (let i = 0; i < 4; i++) { await h.mouse.wheel(0, 24); await wait(150) } await h.keyboard.up('Shift') })
  check('scrolled to the last page', (await page()) === 40, String(await page()))
  check('the last page taps firmly', toEnd.at(-1) === 'level', JSON.stringify(toEnd))
  const past = await tapsOf(async () => { await h.mouse.wheel(0, 24); await wait(150) })
  check('past the last page: nothing more', past.length === 0 && (await page()) === 40, JSON.stringify(past))
  const toStart = await tapsOf(async () => { await h.keyboard.down('Shift'); for (let i = 0; i < 5; i++) { await h.mouse.wheel(0, -24); await wait(150) } await h.keyboard.up('Shift') })
  check('the first page taps firmly', (await page()) === 1 && toStart.at(-1) === 'level', `${await page()} ${JSON.stringify(toStart)}`)

  // 6. Arrow keys on the number tap too.
  await h.click(FIELD); await wait(150)
  const keyed = await tapsOf(async () => { await h.keyboard.press('ArrowUp'); await wait(150); await h.keyboard.press('ArrowUp'); await wait(150) })
  check('↑ ↑ on the number: two light taps', keyed.length === 2 && keyed.every((k) => k === 'align'), JSON.stringify(keyed))
  await h.keyboard.press('Escape'); await wait(200)

  // 7. Reading: scrolling the pages taps as each comes into place, never faster than one each 80ms.
  const pages = await h.locator('.pdf-reader-scroll').boundingBox()
  await h.mouse.move(pages.x + pages.width / 2, pages.y + pages.height / 2)
  const read = await tapsOf(async () => { for (let i = 0; i < 6; i++) { await h.mouse.wheel(0, 500); await wait(160) } })
  check('scrolling the pages: a tap as pages come into place', read.length >= 3, `${await page()} ${JSON.stringify(read)}`)
  const fling = await tapsOf(async () => { await h.mouse.wheel(0, 8000); await wait(30); await h.mouse.wheel(0, 8000) })
  check('a fling over many pages: one tap, not a buzz', fling.length <= 2, `${await page()} ${JSON.stringify(fling)}`)

  // 8. The swept places: a Settings slider steps with a tap each, firm at its end.
  await c.go('settings'); await wait(600)
  const thumb = h.locator('[data-setting-slider] [role="slider"]').first()
  await thumb.focus()
  const slid = await tapsOf(async () => { await h.keyboard.press('ArrowRight'); await wait(150); await h.keyboard.press('ArrowRight'); await wait(150) })
  check('a Settings slider: a tap a step', slid.length === 2, JSON.stringify(slid))
  const ended = await tapsOf(async () => { await h.keyboard.press('End'); await wait(150) })
  check('a Settings slider at its end: a firm tap', ended.at(-1) === 'level', JSON.stringify(ended))
} finally {
  await close()
}
done()
