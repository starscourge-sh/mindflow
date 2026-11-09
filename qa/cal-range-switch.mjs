// The Calendar's grid draws the events of the range it shows, however it got
// there. Four events at 11:00, today and the next three days, all in this
// week; then Week first, Day then Week, Week then → then ← back, Month then
// Week, each time counting the events drawn in the grid. The old fault: a
// range switched to kept the last range's events (useLive), so Day then Week
// drew 1 of 4 and Week, →, ← drew 0 of 4.
//
//   npx electron-vite build --outDir out-cr
//   QA_ARGS=--sandbox QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-cr/main/index.js HALIGTREE_QA_AWAY=1 node qa/cal-range-switch.mjs
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const c = await sandbox({ width: 1440, height: 900, at: '09:00' })
const { h, v, go } = c
const results = []
const check = (name, ok, detail = '') => (results.push(!!ok), console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`))
try {
  await v('settings:set', { hintRate: 0 })
  const today = c.now()
  const names = ['Range one', 'Range two', 'Range three', 'Range four']
  for (const [by, title] of names.entries()) {
    const start = new Date(today); start.setDate(start.getDate() + by); start.setHours(11, 0, 0, 0)
    await v('event:add', { title, start: start.toISOString(), end: new Date(start.getTime() + 3600000).toISOString(), calendarId: 'personal' })
  }
  await go('calendar'); await h.waitForTimeout(1200)
  // The grid's events only (not Upcoming's rows), counted once each, of the four seeded.
  const drawn = () => h.$$eval('[data-cal-mode] [data-cal-event]', (els, names) => new Set(els.map((el) => el.getAttribute('aria-label') ?? el.textContent ?? '').map((said) => names.find((name) => said.includes(name))).filter(Boolean)).size, names)
  const press = async (key, wait = 900) => { await h.keyboard.press('Escape'); await h.keyboard.press(key); await h.waitForTimeout(wait) }
  await press('w')
  const inWeek = await h.evaluate(() => Number(document.querySelector('[data-cal-mode]')?.getAttribute('data-cal-days') ?? 0))
  check('Week shows seven days', inWeek === 7, `${inWeek}`)
  // Today's week (Sunday first) holds all four unless today + 3 crosses its end; then fewer, by design.
  const want = await h.evaluate(([at]) => { const d = new Date(at); const end = new Date(d); end.setDate(d.getDate() + (6 - d.getDay())); return Math.min(4, Math.round((end - d) / 864e5) + 1) }, [today.toISOString()])
  // Week opened first.
  check('Week first draws them', (await drawn()) === want, `${await drawn()} of ${want}`)
  // Day, then Week.
  await press('d'); check('Day draws today\'s one', (await drawn()) === 1, `${await drawn()} of 1`)
  await press('w', 2500); check('Day then Week draws them', (await drawn()) === want, `${await drawn()} of ${want}, after 2.5s`)
  // Week, the next week, then back.
  await press('ArrowRight'); check('the next week draws none of them', (await drawn()) === 0, `${await drawn()} of 0`)
  await press('ArrowLeft'); check('back to this week draws them', (await drawn()) === want, `${await drawn()} of ${want}`)
  // Month, then Week.
  await press('m'); await press('w'); check('Month then Week draws them', (await drawn()) === want, `${await drawn()} of ${want}`)
  // And Day then Week once more, with every range read before.
  await press('d'); await press('w'); check('Day then Week again draws them', (await drawn()) === want, `${await drawn()} of ${want}`)
  check('no page errors', c.errors.length === 0, c.errors.slice(0, 3).join(' | '))
} finally {
  await c.close()
}
const failed = results.filter((ok) => !ok).length
console.log(failed ? `${failed} of ${results.length} FAILED` : `all ${results.length} passed`)
process.exit(failed ? 1 : 0)
