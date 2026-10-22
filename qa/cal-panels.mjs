// The Calendar page's panels, on sandbox data:
//   1. the event editor and the task page sit inside the right panel, in
//      place of Upcoming, as Notion Calendar has it; closing brings Upcoming back;
//   2. with the app's sidebar open, the right panel folds away once the week's
//      columns would be too narrow for a block's whole time (below about 1650
//      wide), and "Plan" brings it back; narrower, an hour puts its time on two lines;
//   3. at 1200, 1400, 1600 and 1900 wide an hour-long event in the week
//      says its whole time, "06:30 – 07:30" (kept clear of the sandbox's own events).
//
//   npx electron-vite build --outDir out-cal-panels
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-cal-panels/main/index.js HALIGTREE_QA_AWAY=1 node qa/cal-panels.mjs
import { sandbox } from './sandbox-lib.mjs'

const c = await sandbox({ width: 1600, height: 900 })
const { h, v, go, size } = c
const results = []
const check = (name, ok, detail = '') => (results.push(!!ok), console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`))
const wait = (ms) => h.waitForTimeout(ms)
const at = (hour, minute) => { const d = new Date(); d.setHours(hour, minute, 0, 0); return d.toISOString() }
const R = '[data-cal-right]'
const S = '[data-day-side]'
const right = () => h.locator(R).count()
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
  if (await h.locator('[data-cal-side]').count() === 0) { await h.locator('[data-cal-side-toggle]').click(); await wait(500) }
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

  // 1: the editor in the right panel.
  await size(1900, 900); await wait(700)
  await h.locator('[data-cal-new-event]').click(); await wait(700)
  const inside = await h.evaluate(([r, s]) => { const side = document.querySelector(s); return !!side && !!side.closest(r) && getComputedStyle(side).position !== 'fixed' }, [R, S])
  check('"New event" opens the editor inside the right panel, not over the page', inside)
  check('…in place of Upcoming', !(await h.locator(R).innerText()).includes('Upcoming'))
  if (process.env.SHOTS) await h.screenshot({ path: `${process.env.SHOTS}/cal-panels-editor.png` })
  await h.keyboard.press('Escape'); await wait(600)
  check('Esc brings Upcoming back', (await h.locator(R).innerText().catch(() => '')).includes('Upcoming') && await h.locator(S).count() === 0)
  // An event opened in full.
  const block = h.locator('[data-cal-event]', { hasText: 'Panels standup' }).first()
  await block.dblclick(); await wait(900)
  const opened = await h.evaluate(([r, s]) => { const side = document.querySelector(`${s}[data-day-side="event"]`); return !!side && !!side.closest(r) }, [R, S])
  check('a double-click opens the event in the right panel', opened)
  if (process.env.SHOTS) await h.screenshot({ path: `${process.env.SHOTS}/cal-panels-event.png` })
  await h.locator(`${S} [data-day-side-close]`).click(); await wait(600)
  check('"Close" brings Upcoming back', (await h.locator(R).innerText().catch(() => '')).includes('Upcoming'))
  // Folded away at 1200, the editor still has its place: the panel opens for it, and folds again after.
  await size(1200, 900); await wait(700)
  await h.locator('[data-cal-new-event]').click(); await wait(700)
  check('1200 wide: the editor opens the right panel for itself', await h.evaluate(([r, s]) => !!document.querySelector(s)?.closest(r), [R, S]))
  await h.keyboard.press('Escape'); await wait(600)
  check('1200 wide: closed, the panel folds away again', await right() === 0)
  // The month: the editor beside the grid, never over it.
  await h.keyboard.press('m'); await wait(600)
  await h.locator('[data-cal-new-event]').click(); await wait(700)
  const beside = await h.evaluate(([r, s]) => {
    const side = document.querySelector(s)?.getBoundingClientRect()
    const grid = document.querySelector('[data-month-plan]')?.getBoundingClientRect()
    return !!side && !!grid && grid.right <= side.left + 1 && !!document.querySelector(s).closest(r)
  }, [R, S])
  check('in a month, the editor sits beside the days, not over them', beside)
  await h.keyboard.press('Escape'); await wait(500)
  await h.keyboard.press('w'); await wait(400)
  check('no page errors', !c.errors.length, c.errors.join(' | '))
} finally {
  await c.close()
}
console.log(`${results.filter(Boolean).length}/${results.length} passed`)
process.exit(results.every(Boolean) ? 0 : 1)
