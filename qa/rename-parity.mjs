// Every place a task's name is typed reads it the same: a line on tomorrow's list given a time lands at that time tomorrow (it kept "at 4pm" in its name),
// a name given "every monday" repeats, "by friday 5pm" is due by 17:00; and the task page's "Due by" takes a time, said with Undo, as a row's does.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-aud/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox node qa/rename-parity.mjs [shots folder]
import { mkdirSync } from 'fs'
import { join } from 'path'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'

const SHOTS = process.argv[2] ?? ''
if (SHOTS) mkdirSync(SHOTS, { recursive: true })
const { check, done } = checks()
const c = await sandbox({ width: 1500, height: 900, at: '22:00' })
const { h, errors, close, go, v } = c
const wait = (ms) => h.waitForTimeout(ms)
const pad = (n) => String(n).padStart(2, '0')
const key = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const said = () => h.evaluate(() => [...document.querySelectorAll('[role=status]')].map((one) => one.innerText).join(' | '))
const make = async (words, by, named = words) => {
  const day = c.now(); day.setDate(day.getDate() + by)
  await go('home'); await wait(1200)
  const cell = h.locator(`[data-month-plan] [data-day="${key(day)}"]`)
  await cell.scrollIntoViewIfNeeded(); await cell.hover(); await cell.locator('[data-day-add]').click(); await wait(500)
  await h.keyboard.type(words); await h.keyboard.press('Enter'); await wait(1300)
  return (await v('tasks')).find((one) => one.title === named)
}
const rename = async (id, words) => {
  const title = h.locator(`[data-open="${id}"] textarea`).first()
  await title.click(); await h.keyboard.press('Meta+a'); await h.keyboard.type(words); await h.keyboard.press('Enter'); await wait(800)
  return v('task', id)
}
try {
  await v('settings:set', { sounds: false, hintRate: 0, homeCalendar: true, motion: false, closeDayAt: '00:00', closeDay: true })
  // 1. A line on tomorrow's list, given a time afterwards.
  await go('today'); await wait(1200)
  const box = '[data-tomorrow-box]'
  await h.locator(box).scrollIntoViewIfNeeded()
  await h.locator(`${box} [data-tomorrow-new]`).click()
  await h.keyboard.type('Email the draft', { delay: 6 }); await h.keyboard.press('Enter'); await wait(900)
  const made = (await v('tasks')).find((one) => one.title === 'Email the draft')
  await h.locator(`${box} [data-tomorrow-line] .ProseMirror`).first().click()
  await h.keyboard.press('End'); await h.keyboard.type(' at 4pm'); await h.keyboard.press('Escape'); await wait(900)
  let task = await v('task', made.id)
  const now = c.now(); const tomorrow = key(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 12))
  check('a tomorrow line given a time keeps its words', task.title === 'Email the draft', task.title)
  check('and is at that time tomorrow, not all day', key(new Date(task.dueAt)) === tomorrow && new Date(task.dueAt).getHours() === 16 && !task.allDay, `${task.dueAt} allDay=${task.allDay}`)
  if (SHOTS) await h.screenshot({ path: join(SHOTS, 'tomorrow-line.png') })
  await h.evaluate(() => document.activeElement?.blur?.())
  await h.keyboard.press('Meta+z'); await wait(800)
  task = await v('task', made.id)
  check('⌘Z puts it back all day', task.title === 'Email the draft' && !!task.allDay, `${task.title} ${task.dueAt} allDay=${task.allDay}`)
  // 2. A name on the task's page given a repeat, then a timed due-by.
  const one = await make('water plants', 0)
  task = await rename(one.id, 'water plants every monday')
  check('a repeat in the name makes it repeat', task.title === 'water plants' && /monday/i.test(task.recurrence ?? ''), `${task.title} / ${task.recurrence}`)
  check('said with Undo', /[Rr]epeats every monday/.test(await said()) && /Undo/.test(await said()), await said())
  await h.locator('[role=status] button:has-text("Undo")').last().click(); await wait(800)
  task = await v('task', one.id)
  check('Undo takes the repeat off', !task.recurrence && task.title === 'water plants', `${task.title} / ${task.recurrence}`)
  task = await rename(one.id, 'learn welsh someday')
  check('“someday” in the name puts it on Someday, with no day', task.title === 'learn welsh' && task.planFor === 'someday' && !task.dueAt, `${task.title} plan=${task.planFor} due=${task.dueAt}`)
  check('said with Undo', /[Mm]oved to Someday/.test(await said()), await said())
  task = await rename(one.id, 'send the report by friday 5pm')
  check('a timed due-by in the name is due at that hour', task.title === 'send the report' && !!task.deadline && new Date(task.deadline).getHours() === 17 && task.deadlineTimed === 1, `${task.title} ${task.deadline} timed=${task.deadlineTimed}`)
  // 3. The page's "Due by" picker takes a time, said with Undo.
  await h.locator('[data-day-side-close]').click(); await wait(500)
  const two = await make('pay rent by friday', 1, 'pay rent')
  task = await v('task', two.id)
  check('starts due by a day with no time', !!task.deadline && !task.deadlineTimed, `${task.deadline} ${task.deadlineTimed}`)
  await h.locator(`[data-open="${two.id}"] [data-date-picker]`).nth(1).click(); await wait(400)
  const field = h.locator('[data-time-field="Time"]').last()
  check('the "Due by" picker offers a time, empty for a day with none', (await field.count()) === 1 && (await field.inputValue()) === '', String(await field.count()))
  await field.click(); await h.keyboard.type('5pm'); await h.keyboard.press('Enter'); await wait(800)
  task = await v('task', two.id)
  check('a time set there makes it due at that hour', task.deadlineTimed === 1 && new Date(task.deadline).getHours() === 17, `${task.deadline} timed=${task.deadlineTimed}`)
  check('said with Undo, as a row\'s date is', /Due by .*17:00/.test(await said()) && /Undo/.test(await said()), await said())
  if (SHOTS) await h.screenshot({ path: join(SHOTS, 'due-by-time.png') })
  await h.keyboard.press('Escape'); await wait(300)
  await h.locator('[role=status] button:has-text("Undo")').last().click(); await wait(800)
  task = await v('task', two.id)
  check('Undo puts the day with no time back', !task.deadlineTimed, `${task.deadline} timed=${task.deadlineTimed}`)
  check('no page errors', errors.length === 0, errors.join(' | '))
} finally {
  await close()
}
done()
