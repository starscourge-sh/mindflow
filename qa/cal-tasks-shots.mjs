// Calendar and Tasks for the eye: Day, Week and Month (Day and Week with "New event" open
// too), the late pill's menu, and Tasks' Today, Upcoming and Later, in light and dark, at
// 1440 x 900 and 760 x 900 (WIDTHS=560x500 for the smallest window). Seeds a study plan:
// cards due, a book with a finishing day, and a trip over several days.
//
//   QA_ARGS=--sandbox QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 SHOTS=dir node qa/cal-tasks-shots.mjs
import { PDFDocument } from 'pdf-lib'
import { sandbox, shiftClock } from './sandbox-lib.mjs'
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
  for (const title of ['Plan the trip #travel', 'Sort photos #home', 'Email Sam back', 'Learn Spanish someday #languages', 'Read Dune someday #books']) await v('task:add', title)
  await v('task:save', (await v('task:add', 'Renew the passport')).id, { due: at(-5, 9).toISOString(), allDay: 1, priority: 2 })
  const names = ['Team sync', 'Lunch with Sam', 'Dentist', 'Lecture: Organic Chemistry II, room 4.12', 'Run', 'Book club']
  for (let n = 0; n < 24; n++) {
    const start = at((n % 7) - 3, 8 + ((n * 3) % 9))
    await v('event:add', { title: names[n % names.length], start: start.toISOString(), end: new Date(start.getTime() + 3600000).toISOString(), calendarId: 'personal' })
  }
  await v('event:add', { title: 'Conference', start: at(0, 0).toISOString(), end: at(2, 0).toISOString(), allDay: true, calendarId: 'personal' })
  // The study plan (9 Nov): cards due today and in the days after, and a book read on two days, so its pace says a finishing day.
  const cards = await v('cards:list', Array.from({ length: 30 }, (_, n) => ({ term: `Term ${n + 1}`, meaning: `Meaning ${n + 1}` })))
  for (const [n, id] of cards.entries()) await v('review:grade', id, n < 24 ? 1 : 3, 4000)
  const bytes = Array.from(await (async () => { const pdf = await PDFDocument.create(); pdf.setTitle('Middlemarch'); for (let n = 0; n < 3; n++) pdf.addPage([400, 560]); return pdf.save() })())
  const src = await h.evaluate((bytes) => window.api.saveFile('middlemarch.pdf', new Uint8Array(bytes)), bytes)
  await h.evaluate((src) => window.api.captures.create({ kind: 'note', body: { type: 'doc', content: [{ type: 'attachment', attrs: { src, name: 'middlemarch.pdf', mime: 'application/pdf' } }] } }), src)
  const offset = c.now().getTime() - Date.now()
  const clock = (by) => c.electron.evaluate((_, [code, by]) => new Function(`(${code})(${by})`)(), [shiftClock.toString(), by])
  await clock(offset - 2 * 86_400_000); await v('pdf:read', src, 100, 300); await clock(offset); await v('pdf:read', src, 160, 300)
  // A trip over four days, drawn as one bar in Month.
  await v('event:add', { title: 'Field trip', start: at(1, 0).toISOString(), end: at(5, 0).toISOString(), allDay: true, calendarId: 'personal' })
  const widths = (process.env.WIDTHS ?? '1440x900,760x900').split(',').map((one) => one.split('x').map(Number))
  for (const [w, hh] of widths) {
    await size(w, hh); await h.waitForTimeout(500)
    const label = `${w}x${hh}`
    await go('calendar'); await h.waitForTimeout(900)
    const shoot = async (what) => { for (const name of ['light', 'dark']) { await look(name); await h.waitForTimeout(300); await h.screenshot({ path: `${shots}/cal-${label}-${what}-${name}.png` }) } await look('light') }
    for (const [k, mode] of [['d', 'day'], ['w', 'week'], ['m', 'month']]) {
      await h.keyboard.press('Escape'); await h.keyboard.press(k); await h.waitForTimeout(700)
      await shoot(mode)
      if (mode === 'month') continue
      // With "New event" open in the right sidebar.
      await h.locator('[data-cal-new-event]').click(); await h.waitForTimeout(700)
      await shoot(`${mode}-new`)
      await h.keyboard.press('Escape'); await h.waitForTimeout(500)
    }
    // The late pill's menu.
    if (await h.locator('[data-late-pill]').count()) { await h.locator('[data-late-pill]').click(); await h.waitForTimeout(500); await shoot('late-menu'); await h.keyboard.press('Escape'); await h.waitForTimeout(300) }
    for (const tab of ['today', 'upcoming', 'later']) {
      await go(tab); await h.waitForTimeout(900)
      for (const name of ['light', 'dark']) { await look(name); await h.waitForTimeout(300); await h.screenshot({ path: `${shots}/tasks-${label}-${tab}-${name}.png` }) }
      await look('light')
    }
  }
} catch (error) {
  failed = true
  console.log('FAIL  threw', error.message.split('\n')[0])
} finally {
  console.log(failed ? 'shots incomplete' : `shots in ${shots}`)
  await c.close()
  process.exit(failed ? 1 : 0)
}
