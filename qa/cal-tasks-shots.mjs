// Calendar and Tasks for the eye: week, the event panel open, and the Tasks list,
// in light and dark, at 1440 x 900, 760 x 900 and a short 760 x 500 window.
//
//   QA_ARGS=--sandbox QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 SHOTS=dir node qa/cal-tasks-shots.mjs
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const shots = process.env.SHOTS
const c = await sandbox({ width: 1440, height: 900, at: '11:30' })
const { h, v, go, size, look } = c
const at = (by, hour, minute = 0) => { const d = c.now(); d.setHours(hour, minute, 0, 0); d.setDate(d.getDate() + by); return d }
let failed = false
try {
  await v('settings:set', { hintRate: 0, homeCalendar: true })
  const timed = [['Call the bank', 0, 9, 15], ['Read chapter 4', 0, 13, 60], ['Gym', 1, 7, 30], ['Draft essay intro', -1, 15, 45]]
  for (const [title, by, hour, est] of timed) await v('task:save', (await v('task:add', title)).id, { due: at(by, hour).toISOString(), allDay: 0, estimate: est })
  await v('task:save', (await v('task:add', 'Return library books')).id, { due: at(-3, 10).toISOString(), allDay: 1 })
  for (const title of ['Plan the trip', 'Sort photos', 'Email Sam back']) await v('task:add', title)
  const names = ['Team sync', 'Lunch with Sam', 'Dentist', 'Lecture: Organic Chemistry II, room 4.12', 'Run', 'Book club']
  for (let n = 0; n < 24; n++) {
    const start = at((n % 7) - 3, 8 + ((n * 3) % 9))
    await v('event:add', { title: names[n % names.length], start: start.toISOString(), end: new Date(start.getTime() + 3600000).toISOString(), calendarId: 'personal' })
  }
  await v('event:add', { title: 'Conference', start: at(0, 0).toISOString(), end: at(2, 0).toISOString(), allDay: true, calendarId: 'personal' })
  for (const [w, hh] of [[1440, 900], [760, 900], [760, 500]]) {
    await size(w, hh); await h.waitForTimeout(500)
    const label = `${w}x${hh}`
    await go('calendar'); await h.waitForTimeout(900)
    await h.keyboard.press('Escape'); await h.keyboard.press('w'); await h.waitForTimeout(600)
    for (const name of ['light', 'dark']) { await look(name); await h.waitForTimeout(300); await h.screenshot({ path: `${shots}/cal-${label}-week-${name}.png` }) }
    await look('light')
    await h.locator('[data-cal-new-event]').click(); await h.waitForTimeout(700)
    for (const name of ['light', 'dark']) { await look(name); await h.waitForTimeout(300); await h.screenshot({ path: `${shots}/cal-${label}-new-${name}.png` }) }
    await look('light')
    await h.keyboard.press('Escape'); await h.waitForTimeout(500)
    await go('today'); await h.waitForTimeout(900)
    for (const name of ['light', 'dark']) { await look(name); await h.waitForTimeout(300); await h.screenshot({ path: `${shots}/tasks-${label}-${name}.png` }) }
    await look('light')
  }
} catch (error) {
  failed = true
  console.log('FAIL  threw', error.message.split('\n')[0])
} finally {
  console.log(failed ? 'shots incomplete' : `shots in ${shots}`)
  await c.close()
  process.exit(failed ? 1 : 0)
}
