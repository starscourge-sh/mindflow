// Quick capture reads a line with a day and a clock time as a task, as every other task box does:
// "dentist friday 3pm" goes on Friday at 3pm (it stayed a note with no word why). A question,
// a line from the past and a plain thought stay notes.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-aud2/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox node qa/box-day-time.mjs [shots folder]
import { mkdirSync } from 'fs'
import { join } from 'path'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const SHOTS = process.argv[2] ?? ''
if (SHOTS) mkdirSync(SHOTS, { recursive: true })
const c = await sandbox({ width: 1100, height: 760 })
const { page, v } = c
const results = []
const check = (name, ok, detail = '') => (results.push(!!ok), console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`))
await v('settings:set', { hintRate: 0, rotCount: 0, motion: false, sounds: false })
const captured = async (bit) => (await page.evaluate(() => window.api.captures.list())).some((one) => (one.label ?? '').includes(bit))
const task = async (bit) => (await v('tasks')).find((one) => one.status === 'open' && (one.title ?? '').includes(bit))
const send = async (typed, shot) => {
  await page.evaluate(() => window.api.showPrompt()); await page.waitForTimeout(700)
  await page.keyboard.type(typed, { delay: 12 }); await page.waitForTimeout(900)
  if (shot && SHOTS) await page.screenshot({ path: join(SHOTS, shot) })
  await page.keyboard.press('Meta+Enter'); await page.waitForTimeout(1200)
}
try {
  await send('dentist friday 3pm', 'box-dentist.png')
  const made = await task('dentist')
  check('"dentist friday 3pm" is a task', !!made, JSON.stringify(made?.title))
  check('on a Friday at 3pm, not all day', made && new Date(made.dueAt).getDay() === 5 && new Date(made.dueAt).getHours() === 15 && !made.allDay, `${made?.dueAt} ${made?.allDay}`)
  check('named without the time words', made?.title === 'dentist', made?.title)
  const left = (await page.evaluate(() => window.api.captures.list())).filter((one) => (one.label ?? '').includes('dentist') && one.status === 'open')
  check('and no note left in the Inbox', !left.length, JSON.stringify(left.map((one) => [one.kind, one.status])))
  await send('are we meeting friday 3pm?')
  // One line that asks something is kept as a question in Writing (box-question.mjs), never a task.
  check('a question with a time is kept as a question, not a task', (await v('items', 'question')).some((one) => one.title.startsWith('are we meeting')) && !(await task('are we meeting')))
  await send('a thought about tides')
  check('a plain thought stays a note', (await captured('tides')) && !(await task('tides')))
  await send('the talk was yesterday 3pm')
  check('a time already gone stays a note', (await captured('the talk')) && !(await task('the talk')))
} finally {
  const passed = results.filter(Boolean).length
  console.log(`${passed}/${results.length} passed`)
  console.log(c.errors.length ? 'errors: ' + c.errors.slice(0, 3).join(' | ') : 'no page errors')
  await c.close()
  process.exit(passed === results.length && !c.errors.length ? 0 : 1)
}
