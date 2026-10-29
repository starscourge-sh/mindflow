// A task page's “Repeats”, “Estimate” and “Waiting on…” fields say what they did with Undo, as the same choices from a task's menu do (they saved silently).
// “Waiting on…” says the day it gave the task to chase them.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-aud/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox node qa/page-fields-undo.mjs [shots folder]
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
const fill = async (id, placeholder, words) => {
  const field = h.locator(`input[aria-label="${placeholder}"]`).first()
  await field.scrollIntoViewIfNeeded(); await field.click(); await h.keyboard.press('Meta+a'); await h.keyboard.type(words); await h.keyboard.press('Enter'); await wait(900)
}
const undo = async () => { await h.locator('[role=status] button:has-text("Undo")').last().click(); await wait(800) }
try {
  await v('settings:set', { sounds: false, hintRate: 0, motion: false })
  const made = await v('task:add', 'chase the landlord')
  await go('upcoming'); await wait(1200)
  await h.locator(`[data-task-row][data-id="${made.id}"]`).first().click(); await wait(900)
  if (SHOTS) await h.screenshot({ path: join(SHOTS, 'page-open.png') })
  check('the task page is open', (await h.locator(`input[aria-label="Repeats"]`).count()) > 0)
  await fill(made.id, 'Repeats', 'every monday')
  check('“Repeats” is said with Undo', /Repeats every monday/.test(await said()) && /Undo/.test(await said()), await said())
  check('and it repeats', /monday/.test((await v('task', made.id)).recurrence ?? ''))
  await undo()
  check('Undo stops it repeating', !(await v('task', made.id)).recurrence)
  await fill(made.id, 'Waiting on…', 'Sam')
  let task = await v('task', made.id)
  check('“Waiting on…” is said with the day to chase', /Waiting on Sam, to chase/.test(await said()) && /Undo/.test(await said()), await said())
  check('it is waiting, with a day to chase, all day', task.waitingOn === 'Sam' && !!task.dueAt && !!task.allDay, `${task.waitingOn} ${task.dueAt}`)
  if (SHOTS) await h.screenshot({ path: join(SHOTS, 'page-waiting.png') })
  await undo()
  task = await v('task', made.id)
  check('Undo takes the waiting and the day back off', !task.waitingOn && !task.dueAt, `${task.waitingOn} ${task.dueAt}`)
  await fill(made.id, 'Estimate', '45')
  check('“Estimate” is set', (await v('task', made.id)).estimate === 45)
  await h.evaluate(() => document.activeElement?.blur?.())
  await h.keyboard.press('Meta+z'); await wait(800)
  check('⌘Z takes the estimate back, as from the menu', !(await v('task', made.id)).estimate, String((await v('task', made.id)).estimate))
  check('no page errors', errors.length === 0, errors.join(' | '))
} finally {
  await close()
}
done()
