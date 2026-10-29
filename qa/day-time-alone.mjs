// A task typed on a day with only a time in it (the box's own example, “call the dentist 10am #home !!”) is at that time on that day, not today.
// Words with a day of their own keep it.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-aud/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox node qa/day-time-alone.mjs [shots folder]
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
const pad = (n) => String(n).padStart(2, '0')
const key = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const said = () => h.evaluate(() => [...document.querySelectorAll('[role=status]')].map((one) => one.innerText).join(' | '))
const make = async (words, by, named) => {
  const day = c.now(); day.setDate(day.getDate() + by)
  await go('home'); await wait(1200)
  const cell = h.locator(`[data-month-plan] [data-day="${key(day)}"]`)
  await cell.scrollIntoViewIfNeeded(); await cell.hover(); await cell.locator('[data-day-add]').click(); await wait(500)
  await h.keyboard.type(words); await h.keyboard.press('Enter'); await wait(1300)
  return [(await v('tasks')).find((one) => one.title === named), key(day)]
}
try {
  await v('settings:set', { sounds: false, hintRate: 0, homeCalendar: true, motion: false })
  const [one, day] = await make('call the dentist 10am #home !!', 3, 'call the dentist #home')
  check('made, the time and priority out of the name', !!one && one.priority > 0, one?.title)
  check('at 10:00 on the day it was typed on, not today', !!one && key(new Date(one.dueAt)) === day && new Date(one.dueAt).getHours() === 10 && !one.allDay, `${one?.dueAt} allDay=${one?.allDay} want ${day}`)
  check('the notice says that day at 10:00', /Added for .*10:00/.test(await said()) && !/today/.test(await said()), await said())
  if (SHOTS) await h.screenshot({ path: join(SHOTS, 'day-time-alone.png') })
  await h.locator('[data-day-side-close]').click(); await wait(500)
  const [two] = await make('call mum tomorrow 3pm', 4, 'call mum')
  const tomorrow = c.now(); tomorrow.setDate(tomorrow.getDate() + 1)
  check('words with a day of their own keep it', !!two && key(new Date(two.dueAt)) === key(tomorrow) && new Date(two.dueAt).getHours() === 15, two?.dueAt)
  check('no page errors', errors.length === 0, errors.join(' | '))
} finally {
  await close()
}
done()
