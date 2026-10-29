// An event's name, typed over on its page, is read as the new-event box reads words, as a task's name is:
// "Standup 4pm @Room 2" moves it to 4pm on its own day, keeps its length, sets the place, and says so with Undo.
// It kept "4pm @Room 2" in the name and stayed at 11.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-aud2/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox node qa/event-rename-words.mjs [shots folder]
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
  const day = new Date(); day.setHours(11, 0, 0, 0)
  const made = await v('event:add', { title: 'Standup', start: day.toISOString(), end: new Date(day.getTime() + 1800000).toISOString(), calendarId: 'personal' })
  await go('calendar'); await wait(1500)
  await h.keyboard.press('w'); await wait(600)
  const block = h.locator(`[data-cal-event="${made.key}"]`).first()
  await block.scrollIntoViewIfNeeded(); await block.dblclick(); await wait(1200)
  const name = h.locator(`[data-event-detail] [data-event-title]`).first()
  check('the event is open', (await name.count()) === 1)
  await name.click(); await h.keyboard.press('Meta+a'); await h.keyboard.type('Standup 4pm @Room 2'); await h.keyboard.press('Enter'); await wait(1200)
  const now = await v('event', made.key)
  const start = new Date(now.start)
  check('named without the time and place words', now.title === 'Standup', now.title)
  check('moved to 4pm on its own day', start.getHours() === 16 && start.toDateString() === day.toDateString(), now.start)
  check('kept its half hour', new Date(now.end) - start === 1800000, `${now.start} ${now.end}`)
  check('the name on the page reads “Standup”', (await name.inputValue()) === 'Standup', await name.inputValue())
  check('the place is set', now.place === 'Room 2', now.place)
  check('said with Undo', /Renamed/.test(await said()) && /Undo/.test(await said()), await said())
  if (SHOTS) await h.screenshot({ path: join(SHOTS, 'event-rename.png') })
  await h.locator('[role=status] button:has-text("Undo")').last().click(); await wait(1200)
  const back = await v('event', made.key)
  check('Undo puts the name and the time back', back.title === 'Standup' && new Date(back.start).getHours() === 11, `${back.title} ${back.start}`)
  await name.click(); await h.keyboard.press('Meta+a'); await h.keyboard.type('Standup with the team'); await h.keyboard.press('Enter'); await wait(1000)
  const plain = await v('event', made.key)
  check('a plain new name is kept as typed, the time left alone', plain.title === 'Standup with the team' && new Date(plain.start).getHours() === 11, `${plain.title} ${plain.start}`)
  await name.click(); await h.keyboard.press('Meta+a'); await h.keyboard.type('Lunch with May'); await h.keyboard.press('Enter'); await wait(1000)
  const may = await v('event', made.key)
  check('“Lunch with May” is a name, not a move to May', may.title === 'Lunch with May' && new Date(may.start).getHours() === 11 && !may.allDay, `${may.title} ${may.start}`)
  await name.click(); await h.keyboard.press('Meta+a'); await h.keyboard.type('Standup tomorrow'); await h.keyboard.press('Enter'); await wait(1200)
  const moved = await v('event', made.key)
  const next = new Date(day); next.setDate(next.getDate() + 1)
  check('a day alone moves it to that day at its own hour, still timed', moved.title === 'Standup' && new Date(moved.start).toDateString() === next.toDateString() && new Date(moved.start).getHours() === 11 && !moved.allDay, `${moved.title} ${moved.start} ${moved.allDay}`)
  check('no page errors', errors.length === 0, errors.join(' | '))
} finally {
  await close()
}
done()
