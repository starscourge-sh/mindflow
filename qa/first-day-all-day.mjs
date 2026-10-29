// A task with no day given one without a time (T, M or W on a row, a quick move in a date picker, a board card's date, the Calendar's New task box)
// is all day, as the notice says (“Moved to today”), not a made-up 09:00 drawn in the calendar's hours and alerted then. A time given keeps it timed.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-aud/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox node qa/first-day-all-day.mjs [shots folder]
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
try {
  await v('settings:set', { sounds: false, hintRate: 0, motion: false })
  // 1. The save every surface uses, with a day and no time.
  const one = await v('task:add', 'buy milk')
  check('starts with no day', !(await v('task', one.id)).dueAt)
  const nine = new Date(); nine.setDate(nine.getDate() + 2); nine.setHours(9, 0, 0, 0)
  await v('task:save', one.id, { due: nine.toISOString() })
  let task = await v('task', one.id)
  check('given a day with no time, it is all day', !!task.allDay, `allDay=${task.allDay}`)
  // 2. A time said keeps it timed; a timed task moved keeps its time.
  const two = await v('task:add', 'call the bank')
  await v('task:save', two.id, { due: nine.toISOString(), allDay: 0 })
  check('given a day and a time, it is timed', !(await v('task', two.id)).allDay)
  nine.setDate(nine.getDate() + 1)
  await v('task:save', two.id, { due: nine.toISOString() })
  check('a timed task moved stays timed', !(await v('task', two.id)).allDay)
  // 3. As a person does it: M on an undated row in Upcoming's “No date”.
  const three = await v('task:add', 'return the books')
  await go('upcoming'); await wait(1200)
  const row = h.locator(`[data-id="${three.id}"]`).first()
  if (await row.count()) {
    // The highlight starts on row one: ↓ until it is on a task with no day, then M.
    const before = await v('tasks')
    const undated = new Set(before.filter((one) => !one.dueAt && one.status === 'open').map((one) => one.id))
    await h.evaluate(() => document.activeElement?.blur?.())
    const lit = () => h.evaluate(() => document.querySelector('[data-task-row][data-cursor]')?.getAttribute('data-id'))
    for (let i = 0; i < 60 && !undated.has(await lit()); i++) await h.keyboard.press('j')
    await h.keyboard.press('m'); await wait(900)
    const moved = (await v('tasks')).find((one) => undated.has(one.id) && one.dueAt)
    const said = await h.evaluate(() => [...document.querySelectorAll('[role=status]')].map((one) => one.innerText).join(' | '))
    check('M on an undated row: tomorrow, all day', !!moved && !!moved.allDay, `${moved?.title} ${moved?.dueAt} allDay=${moved?.allDay}`)
    check('and the notice says no time', /Moved to tomorrow/.test(said) && !/\d\d:\d\d/.test(said), said)
    if (SHOTS) await h.screenshot({ path: join(SHOTS, 'first-day-all-day.png') })
  } else console.log('SKIP  no row for an undated task on Upcoming')
  check('no page errors', errors.length === 0, errors.join(' | '))
} finally {
  await close()
}
done()
