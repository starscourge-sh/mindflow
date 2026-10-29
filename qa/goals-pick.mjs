// Several goals picked: the bar and the menu offer what a goal does (on ice, the Bin), never the reading queue or the archive.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-gp/main/index.js HALIGTREE_QA_AWAY=1 node qa/goals-pick.mjs [shots folder]
import { mkdirSync } from 'fs'
import { join } from 'path'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'

const SHOTS = process.argv[2] ?? ''
if (SHOTS) mkdirSync(SHOTS, { recursive: true })
const { check, done } = checks()
const c = await sandbox({ width: 1700, height: 900 })
const { h, errors, close, go, v } = c
const bar = () => h.evaluate(() => [...document.querySelectorAll('[data-page="goals"] button')].map((one) => one.innerText.trim()).filter(Boolean))
const iced = async () => (await v('items', 'goal')).filter((one) => one.closedHow === 'on ice').length
try {
  await v('settings:set', { sounds: false, hintRate: 0 })
  await go('goals')
  const before = await iced()
  await h.keyboard.press('Meta+a')
  await h.waitForTimeout(400)
  const buttons = await bar()
  check('the bar offers “Put on ice” and the Bin', buttons.includes('Put on ice') && buttons.includes('Move to the Bin'), buttons.join(' / '))
  check('no reading queue and no archive for goals', !buttons.some((one) => /queue|Archive/.test(one)), buttons.join(' / '))
  await h.locator('[data-page="goals"] [data-row]').first().click({ button: 'right', force: true, timeout: 5000 })
  await h.waitForTimeout(400)
  const lines = await h.evaluate(() => [...document.querySelectorAll('[role="menu"] [role="menuitem"]')].map((one) => one.innerText.split('\n')[0].trim()))
  if (SHOTS) await h.screenshot({ path: join(SHOTS, 'goals-pick-menu.png') })
  check('the menu says “Put on ice” for all of them, no queue, no archive', lines.some((one) => /^Put on ice: \d+ goals/.test(one)) && !lines.some((one) => /queue|Archive/.test(one)), lines.join(' / '))
  await h.keyboard.press('Escape')
  await h.waitForTimeout(250)
  const picked = (await bar()).length && (await h.evaluate(() => document.querySelectorAll('[data-page="goals"] [data-row][data-chosen], [data-page="goals"] [aria-selected="true"]').length))
  await h.locator('[data-page="goals"] button:has-text("Put on ice")').click()
  await h.waitForTimeout(900)
  const after = await iced()
  const toast = await h.evaluate(() => document.querySelector('[role=status]')?.innerText ?? '')
  check('all of them go on ice, in one notice with Undo', after > before && /On ice: \d+ goals/.test(toast) && /Undo/.test(toast), `${before} → ${after}; “${toast}”; ${picked} picked`)
  await h.locator('[role=status] button:has-text("Undo")').click()
  await h.waitForTimeout(900)
  check('Undo opens them all again', (await iced()) === before, String(await iced()))
  check('no page errors', errors.length === 0, errors.join(' | '))
} finally {
  await close()
}
done()
