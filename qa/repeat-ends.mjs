// A task page's “Ends” picker under “Repeats” says what it did with Undo, as “Repeats” itself does (it saved silently).
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-aud2/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox node qa/repeat-ends.mjs [shots folder]
import { mkdirSync } from 'fs'
import { join } from 'path'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'

const SHOTS = process.argv[2] ?? ''
if (SHOTS) mkdirSync(SHOTS, { recursive: true })
const { check, done } = checks()
const c = await sandbox({ width: 1500, height: 900 })
const { h, errors, close, go, v } = c
const wait = (ms) => h.waitForTimeout(ms)
const said = () => h.evaluate(() => [...document.querySelectorAll('[role=status]')].map((one) => one.innerText).join(' | '))
try {
  await v('settings:set', { sounds: false, hintRate: 0, motion: false })
  const made = await v('task:add', 'water the plants')
  await go('upcoming'); await wait(1200)
  await h.locator(`[data-task-row][data-id="${made.id}"]`).first().click(); await wait(900)
  const rep = h.locator('input[aria-label="Repeats"]').first()
  await rep.scrollIntoViewIfNeeded(); await rep.click(); await h.keyboard.type('every monday'); await h.keyboard.press('Enter'); await wait(1000)
  const ends = h.locator('[data-repeat-until] button').first()
  check('the page shows the “Ends” picker', (await ends.count()) > 0)
  await ends.scrollIntoViewIfNeeded(); await ends.click(); await wait(500)
  await h.locator('[data-radix-popper-content-wrapper] button:has-text("Today")').last().click(); await wait(900)
  check('an end day is said with Undo', /Repeats until/.test(await said()) && /Undo/.test(await said()), await said())
  check('and kept', !!(await v('task', made.id)).repeatUntil)
  if (SHOTS) await h.screenshot({ path: join(SHOTS, 'repeat-ends.png') })
  await h.keyboard.press('Escape'); await wait(300)
  await h.locator('[role=status] button:has-text("Undo")').last().click(); await wait(800)
  check('Undo takes the end day off', !(await v('task', made.id)).repeatUntil, String((await v('task', made.id)).repeatUntil))
  check('no page errors', errors.length === 0, errors.join(' | '))
} finally {
  await close()
}
done()
