// A task's name on its own page reads a day or time as every other place a task is typed, and a time set in its picker puts it on the calendar's hours.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-tn/main/index.js HALIGTREE_QA_AWAY=1 node qa/task-name-time.mjs [shots folder]
import { mkdirSync } from 'fs'
import { join } from 'path'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
import { openFromMonth, startOnDay } from './month-add-lib.mjs'

const SHOTS = process.argv[2] ?? ''
if (SHOTS) mkdirSync(SHOTS, { recursive: true })
const { check, done } = checks()
const c = await sandbox({ width: 1500, height: 900 })
const { h, errors, close, go, v } = c
// Made as the user made it: a day's + on Home's month, the words, ↵, and the panel turns into the task's page.
const pad = (n) => String(n).padStart(2, '0')
const key = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const make = async (words, by) => {
  const day = new Date(); day.setDate(day.getDate() + by)
  await go('home'); await h.waitForTimeout(1200)
  const cell = h.locator(`[data-month-plan] [data-day="${key(day)}"]`)
  // A double-click on the day starts the task in the popover there (the "+" and its panel are gone, 12 Nov); made, its
  // page is opened from its chip on the day, where the rest of this probe works.
  await startOnDay(h, cell, 'task')
  await h.keyboard.type(words); await h.keyboard.press('Enter'); await h.waitForTimeout(1300)
  const made = (await v('tasks')).find((one) => one.title === words)
  if (made) await openFromMonth(h, made.id, words)
  return made
}
try {
  await v('settings:set', { sounds: false, hintRate: 0, homeCalendar: true })
  // 1. The name typed again on the page, with a time in it.
  const one = await make('dry run with rory', 0)
  const title = h.locator(`[data-open="${one.id}"] textarea`).first()
  await title.click()
  await h.keyboard.press('Meta+a')
  await h.keyboard.type('matus uat + dry run with rory at 1pm')
  await h.keyboard.press('Enter')
  await h.waitForTimeout(800)
  let task = await v('task', one.id)
  const toast = await h.evaluate(() => document.querySelector('[role=status]')?.innerText ?? '')
  check('the name keeps its words and loses the time', task.title === 'matus uat + dry run with rory', task.title)
  check('the time is set, not all day', !!task.dueAt && new Date(task.dueAt).getHours() === 13 && !task.allDay, `${task.dueAt} allDay=${task.allDay}`)
  check('the page shows the name without the time', (await h.locator(`[data-open="${one.id}"] textarea`).first().inputValue()) === 'matus uat + dry run with rory')
  check('a notice says where it went, with Undo', /Moved to today 13:00/.test(toast) && /Undo/.test(toast), toast)
  if (SHOTS) await h.screenshot({ path: join(SHOTS, 'task-name-time.png') })
  await h.locator('[role=status] button:has-text("Undo")').click()
  await h.waitForTimeout(800)
  task = await v('task', one.id)
  check('Undo puts the name and the day back', task.title === 'dry run with rory' && !!task.allDay, `${task.title} ${task.dueAt} ${task.allDay}`)
  check('the page shows the old name again', (await h.locator(`[data-open="${one.id}"] textarea`).first().inputValue()) === 'dry run with rory')
  // 2. Only a name: kept as typed, no notice.
  await title.click()
  await h.keyboard.press('Meta+a')
  await h.keyboard.type('plain new name')
  await h.keyboard.press('Enter')
  await h.waitForTimeout(600)
  check('a name with no time is kept as typed', (await v('task', one.id)).title === 'plain new name')
  // 3. An all-day task given a time in its picker leaves the all-day row.
  await h.locator('[data-day-side-close]').click(); await h.waitForTimeout(500)
  const two = await make('all day thing', 2)
  task = await v('task', two.id)
  check('starts all day', !!task.allDay, String(task.allDay))
  const picker = h.locator(`[data-open="${two.id}"] [data-date-picker]`).first()
  check('an all-day task\'s day shows no made-up time', !/\d:\d\d/.test(await picker.innerText()), await picker.innerText())
  await picker.click()
  await h.waitForTimeout(400)
  const field = h.locator('[data-time-field="Time"]').first()
  check('an all-day task shows no made-up time', (await field.inputValue()) === '', await field.inputValue())
  await field.click()
  await h.keyboard.type('1pm')
  await h.keyboard.press('Enter')
  await h.waitForTimeout(700)
  task = await v('task', two.id)
  const said = await h.evaluate(() => document.querySelector('[role=status]')?.innerText ?? '')
  check('the picker says the move with Undo, as a row\'s date does', /Moved to Saturday 13:00|Moved to .*13:00/.test(said) && /Undo/.test(said), said)
  check('setting a time makes it timed at that hour', !task.allDay && new Date(task.dueAt).getHours() === 13, `${task.dueAt} allDay=${task.allDay}`)
  if (SHOTS) await h.screenshot({ path: join(SHOTS, 'task-picker-time.png') })
  check('no page errors', errors.length === 0, errors.join(' | '))
} finally {
  await close()
}
done()
