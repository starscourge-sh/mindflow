// The Calendar page's panels, on sandbox data:
//   1. the right sidebar floats over the days on the shared frost: Upcoming,
//      and the event editor or the task page in its place, the grid never
//      moving; closing brings Upcoming back, or slides the sidebar away;
//   2. with the app's sidebar open, the right panel folds away once the week's
//      columns would be too narrow for a block's whole time (below about 1650
//      wide), and "Plan" brings it back; narrower, an hour puts its time on two lines;
//   3. at 1200, 1400, 1600 and 1900 wide an hour-long event in the week
//      says its whole time, "06:30 – 07:30" (kept clear of the sandbox's own events).
//
//   npx electron-vite build --outDir out-cal-panels
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-cal-panels/main/index.js HALIGTREE_QA_AWAY=1 node qa/cal-panels.mjs
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const c = await sandbox({ width: 1600, height: 900 })
const { h, v, go, size } = c
const results = []
const check = (name, ok, detail = '') => (results.push(!!ok), console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`))
const wait = (ms) => h.waitForTimeout(ms)
const at = (hour, minute) => { const d = new Date(); d.setHours(hour, minute, 0, 0); return d.toISOString() }
const R = '[data-cal-right]'
const S = '[data-day-side]'
// The sidebar while it holds Upcoming (it holds the editor too, in Upcoming's place).
const right = () => h.locator(`${R}[data-cal-right-holds="upcoming"]`).count()
// Whether the event's block shows its whole time, read from what is drawn.
const said = () => h.evaluate(() => {
  const block = [...document.querySelectorAll('[data-cal-event]')].find((one) => one.textContent.includes('Panels standup'))
  if (!block) return { found: false }
  const time = (block.innerText.match(/\d\d:\d\d(?: –\s*\d\d:\d\d)?/) ?? [''])[0]
  const col = block.closest('[data-cal-col]')?.getBoundingClientRect().width ?? 0
  const words = block.firstElementChild
  const clipped = words.scrollHeight > block.clientHeight + 1 || [...block.querySelectorAll('span')].some((one) => one.textContent.includes(':') && one.scrollWidth > one.clientWidth + 1)
  return { found: true, time: time.replace(/\s+/g, ' '), col: Math.round(col), own: Math.round(block.getBoundingClientRect().width), clipped, fill: `${words.scrollHeight}/${block.clientHeight}` }
})
try {
  await v('settings:set', { hintRate: 0 })
  await v('onboarding:set', { pageHints: false })
  await v('event:add', { title: 'Panels standup', start: at(6, 30), end: at(7, 30), calendarId: 'personal' })
  await go('calendar'); await wait(1200)
  if (await h.locator('[data-cal-mode="week"]').count() === 0) { await h.keyboard.press('w'); await wait(500) }
  if (await h.locator('[data-cal-side]').count() === 0) { await h.locator('[data-cal-left-toggle]').click(); await wait(500) }
  await h.locator('[data-cal-scroll]').evaluate((el) => (el.scrollTop = 5 * 56))

  // 2 and 3: the widths.
  for (const w of [1900, 1600, 1400, 1200]) {
    await size(w, 900); await wait(700)
    const s = await said()
    if (process.env.SHOTS) await h.locator('[data-cal-event]', { hasText: 'Panels standup' }).first().locator('xpath=ancestor::*[@data-cal-col]').screenshot({ path: `${process.env.SHOTS}/cal-panels-${w}.png` })
    const wantRight = w >= 1700
    const wantLeft = true
    check(`${w} wide: the right panel is ${wantRight ? 'there' : 'folded away'}, the left ${wantLeft ? 'there' : 'folded away'}`, (await right() > 0) === wantRight && (await h.locator('[data-cal-side]').count() > 0) === wantLeft)
    check(`${w} wide: the event says its whole time${s.col < 112 ? ', on two lines' : ''}`, s.found && /\d\d:\d\d – \d\d:\d\d/.test(s.time) && !s.clipped, JSON.stringify(s))
  }
  // "Plan" brings the right panel back at 1200, and folds it again.
  const plan = h.locator('[data-cal-side-toggle]')
  await plan.click(); await wait(500)
  check('1200 wide: "Plan" brings the right panel back', await right() > 0)
  await plan.click(); await wait(500)
  check('1200 wide: "Plan" again folds it away', await right() === 0)
  // On again, so the wider window below has its panels.
  await plan.click(); await wait(500)

  // 1: the editor opens in the floating sidebar, in Upcoming's place; the days keep their width.
  const grid = () => h.locator('[data-cal-grid], [data-month-plan]').first().boundingBox().then((one) => JSON.stringify(one))
  const floats = () => h.evaluate(([r, s]) => { const side = document.querySelector(s); return !!side && side.matches(r) && getComputedStyle(side).position === 'absolute' && side.classList.contains('mf-frost') }, [R, S])
  await size(1900, 900); await wait(700)
  let was = await grid()
  await h.locator('[data-cal-new-event]').click(); await wait(700)
  check('"New event" floats over the days on the frost, in the right sidebar', await floats())
  check('…in Upcoming\'s place', (await h.locator(R).count()) === 1 && !(await h.locator(R).innerText()).includes('Upcoming'))
  check('…and the days keep their place and width', (await grid()) === was)
  if (process.env.SHOTS) await h.screenshot({ path: `${process.env.SHOTS}/cal-panels-editor.png` })
  await h.keyboard.press('Escape'); await wait(600)
  check('Esc closes it, and Upcoming is back', await h.locator(S).count() === 0 && (await h.locator(R).innerText().catch(() => '')).includes('Upcoming'))
  // An event opened in full.
  const block = h.locator('[data-cal-event]', { hasText: 'Panels standup' }).first()
  await block.dblclick(); await wait(900)
  check('a double-click opens the event in the floating panel', await h.locator(`${S}[data-day-side="event"]`).count() === 1 && await floats())
  if (process.env.SHOTS) await h.screenshot({ path: `${process.env.SHOTS}/cal-panels-event.png` })
  await h.locator(`${S} [data-day-side-close]`).click(); await wait(600)
  check('"Close" closes it', await h.locator(S).count() === 0)
  // At 1200, with the right panel folded away, the editor floats all the same and nothing opens for it.
  await size(1200, 900); await wait(700)
  was = await grid()
  await h.locator('[data-cal-new-event]').click(); await wait(700)
  check('1200 wide: the editor floats in the sidebar, the days unmoved', await floats() && await right() === 0 && (await grid()) === was)
  await h.keyboard.press('Escape'); await wait(600)
  check('1200 wide: closed, the sidebar slides away (Upcoming was folded)', await h.locator(R).count() === 0)
  await h.locator('[data-cal-new-event]').click(); await wait(700)
  await h.keyboard.press('Escape'); await wait(600)
  // The month: the editor over the days' right edge, the month never squeezed.
  await h.keyboard.press('m'); await wait(600)
  was = await grid()
  await h.locator('[data-cal-new-event]').click(); await wait(700)
  check('in a month, the editor floats over the days, which keep their width', await floats() && (await grid()) === was)
  await h.keyboard.press('Escape'); await wait(500)
  await h.keyboard.press('w'); await wait(400)
  check('no page errors', !c.errors.length, c.errors.join(' | '))
} finally {
  await c.close()
}
console.log(`${results.filter(Boolean).length}/${results.length} passed`)
process.exit(results.every(Boolean) ? 0 : 1)
