// A PDF's page area keeps its own colour while a right-click menu is open on
// picked words; Look up's "why" says it is kept and the why is optional; and
// words neither the dictionary nor Wikipedia knows offer "Keep to answer later".
//
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 QA_SHOTS=dir node qa/look-up-honest.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
import { lookupServer, openProbePdf, pickInPdf } from './probe-pdf-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'
const server = await lookupServer()
const { check, done } = checks()
const c = await sandbox({ width: 1300, height: 900 })
const { h, v } = c
const shots = process.env.QA_SHOTS
const wait = (ms) => h.waitForTimeout(ms)
const ground = () => h.evaluate(() => getComputedStyle(document.querySelector('.pdf-reader .pdf-reader-scroll')).backgroundColor)

try {
  await v('settings:set', { sounds: false, hintRate: 0 })
  await openProbePdf(c)
  const before = await ground()
  const at = await pickInPdf(h, 2, 7); await wait(400)
  await h.mouse.click(at.x, at.y, { button: 'right' }); await wait(500)
  const open = await h.evaluate(() => !!document.querySelector('[role="menu"]'))
  const during = await ground()
  if (shots) await h.screenshot({ path: `${shots}/menu-open.png` })
  check('right-click on picked words opens the menu', open, '')
  check('and the page area keeps its colour', during === before, `${before} -> ${during}`)
  const item = await h.evaluate(() => { const one = [...document.querySelectorAll('[role="menuitem"]')].find((el) => /^Look up/.test(el.textContent.trim())); const r = one?.getBoundingClientRect(); return r && { x: r.x + r.width / 2, y: r.y + r.height / 2 } })
  await h.mouse.move(item.x, item.y); await wait(900)
  check('pointing at Look up in the menu shows no preview card', !(await h.evaluate(() => !!document.querySelector('[data-menu-peek]'))), '')
  await h.keyboard.press('Escape'); await wait(300)

  await pickInPdf(h, 2, 7); await wait(300)
  await h.keyboard.press('l'); await wait(1500)
  await h.click('[data-look-keep]'); await wait(900)
  const foot = await h.evaluate(() => ({ text: document.querySelector('.look-up-kept')?.textContent ?? '', hint: document.querySelector('.look-up-why')?.getAttribute('placeholder') ?? '' }))
  if (shots) await h.screenshot({ path: `${shots}/why.png` })
  check('after Keep, the card says it is kept', foot.text.includes('Kept'), foot.text)
  check('and the why is said to be optional', /optional/.test(foot.hint), foot.hint)
  await h.keyboard.press('Escape'); await wait(200)
  await h.keyboard.press('Escape'); await wait(400)

  await pickInPdf(h, 8, 16); await wait(300)
  await h.keyboard.press('l'); await wait(1800)
  const keep = await h.evaluate(() => document.querySelector('[data-look-keep]')?.textContent ?? '')
  if (shots) await h.screenshot({ path: `${shots}/nothing-found.png` })
  check('nothing found: the button says "Keep to answer later"', keep === 'Keep to answer later', keep)
} catch (error) {
  check('the run finished', false, error.message.split('\n')[0])
} finally {
  await c.close()
  await server.close()
  done()
}
