// The read bar's "Mark for a card" swatch says what it is: a little card over the
// dashed underline it leaves, a tip with its key, the hand, and the same box
// as the colour swatches beside it.
//
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 QA_SHOTS=dir node qa/later-swatch.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
import { lookupServer, openProbePdf, pickInPdf } from './probe-pdf-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'
const server = await lookupServer()
const { check, done } = checks()
const c = await sandbox({ width: 1300, height: 900 })
const { h, v } = c
const shots = process.env.QA_SHOTS ?? '/tmp'
const wait = (ms) => h.waitForTimeout(ms)

try {
  await v('settings:set', { sounds: false, hintRate: 0 })
  await openProbePdf(c)
  await pickInPdf(h, 2, 7); await wait(500)
  const later = h.locator('.pdf-keep-bar .pdf-swatch-button:has(.is-later)')
  check('the bar shows the "Mark for a card" swatch', (await later.count()) === 1, '')
  const tip = await later.getAttribute('title')
  check('its tip says what it does and its key', tip === 'Mark for a card: mark words to turn into cards later, all at once  6', tip)
  await later.hover(); await wait(200)
  check('it shows the hand', (await later.evaluate((one) => getComputedStyle(one).cursor)) === 'pointer', '')
  const glyph = await later.evaluate((one) => ({ rect: !!one.querySelector('svg rect'), dashed: one.querySelector('svg path')?.getAttribute('stroke-dasharray') ?? '' }))
  check('drawn as a little card over a dashed underline', glyph.rect && !!glyph.dashed, JSON.stringify(glyph))
  const boxes = await h.evaluate(() => [...document.querySelectorAll('.pdf-keep-bar .pdf-swatch-button')].map((one) => { const r = one.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height), mid: Math.round(r.top + r.height / 2) } }))
  check('it sits in the row as the colour swatches do: the same box, the same middle', boxes.length === 6 && boxes.every((one) => one.w === boxes[0].w && one.h === boxes[0].h && one.mid === boxes[0].mid), JSON.stringify(boxes))
  const bar = await h.evaluate(() => { const r = document.querySelector('.pdf-keep-bar').getBoundingClientRect(); return { x: r.left - 12, y: r.top - 12, width: r.width + 24, height: r.height + 24 } })
  await h.screenshot({ path: `${shots}/later-swatch-light.png`, clip: bar })
  await c.look('dark'); await wait(500)
  await pickInPdf(h, 2, 7); await wait(400)
  await h.locator('.pdf-keep-bar .pdf-swatch-button:has(.is-later)').hover(); await wait(200)
  await h.screenshot({ path: `${shots}/later-swatch-dark.png`, clip: bar })
  await c.look('light'); await wait(300)
  // The key does what the tip says: 6 marks the words for a card later.
  await pickInPdf(h, 2, 7); await wait(400)
  await h.keyboard.press('6'); await wait(800)
  const marks = await h.evaluate(() => document.querySelectorAll('.pdf-reader .pdf-mark.is-later').length)
  check('6 marks the picked words "Mark for a card"', marks > 0, String(marks))
  // The right-click's swatch row says the same.
  await pickInPdf(h, 9, 17); await wait(300)
  const at = await h.evaluate(() => { const r = getSelection().getRangeAt(0).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 } })
  await h.mouse.click(at.x, at.y, { button: 'right' }); await wait(500)
  const menuTip = await h.evaluate(() => document.querySelector('[role="menuitemradio"] .is-later')?.closest('[role="menuitemradio"]')?.getAttribute('title') ?? '')
  check('the right-click swatch row gives it the same tip', menuTip.startsWith('Mark for a card: mark words to turn into cards later, all at once'), menuTip)
  await h.keyboard.press('Escape')
} catch (error) {
  check('the run finished', false, error.message.split('\n')[0])
} finally {
  await c.close()
  await server.close()
}
done()
