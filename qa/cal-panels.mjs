// The Calendar page's panels, on sandbox data (brought to the 12 Nov layout: Upcoming is an island in the left
// panel, and a new event is written in a popover beside its draft, so nothing rests over the right of the days):
//   1. nothing floats over the days until an event or a task is opened: then its panel floats on the shared frost, the
//      grid never moving, and closing it leaves the days clear again; "New event" opens the popover beside its draft,
//      the days keeping their place and width;
//   2. Upcoming sits in the left panel at every width, and goes and comes back with it;
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
const P = '[data-cal-add]'
// Anything floating over the right of the days (only an opened event or task does), and Upcoming in the left panel.
const right = () => h.locator(R).count()
const upcoming = () => h.locator('[data-cal-side] [data-cal-upcoming]').count()
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
  // Something coming, so Upcoming has a row whatever the hour is.
  await v('event:add', { title: 'Panels tomorrow', start: new Date(Date.now() + 864e5).toISOString(), end: new Date(Date.now() + 864e5 + 36e5).toISOString(), calendarId: 'personal' })
  await go('calendar'); await wait(1200)
  if (await h.locator('[data-cal-mode="week"]').count() === 0) { await h.keyboard.press('w'); await wait(500) }
  if (await h.locator('[data-cal-side]').count() === 0) { await h.locator('[data-cal-left-toggle]').click(); await wait(500) }
  await h.locator('[data-cal-scroll]').evaluate((el) => (el.scrollTop = 5 * 56))

  // 2 and 3: the widths.
  for (const w of [1900, 1600, 1400, 1200]) {
    await size(w, 900); await wait(700)
    const s = await said()
    if (process.env.SHOTS) await h.locator('[data-cal-event]', { hasText: 'Panels standup' }).first().locator('xpath=ancestor::*[@data-cal-col]').screenshot({ path: `${process.env.SHOTS}/cal-panels-${w}.png` })
    check(`${w} wide: nothing floats over the days, and Upcoming is in the left panel`, (await right()) === 0 && (await h.locator('[data-cal-side]').count()) > 0 && (await upcoming()) === 1 && (await h.locator('[data-cal-side-toggle]').count()) === 0)
    check(`${w} wide: the event says its whole time${s.col < 112 ? ', on two lines' : ''}`, s.found && /\d\d:\d\d – \d\d:\d\d/.test(s.time) && !s.clipped, JSON.stringify(s))
  }
  // The left panel's button takes Upcoming away with the panel, and brings both back.
  const left = h.locator('[data-cal-left-toggle]')
  await left.click(); await wait(500)
  check('1200 wide: the left panel\'s button hides it, and Upcoming with it', (await h.locator('[data-cal-side]').count()) === 0 && (await h.locator('[data-cal-upcoming]').count()) === 0)
  await left.click(); await wait(500)
  check('1200 wide: pressed again, both are back', (await h.locator('[data-cal-side]').count()) === 1 && (await upcoming()) === 1)

  // 1: "New event" is written in a popover beside its draft; the days keep their place and width.
  const grid = () => h.locator('[data-cal-grid], [data-month-plan]').first().boundingBox().then((one) => JSON.stringify(one))
  const floats = () => h.evaluate(([r, s]) => { const side = document.querySelector(s); return !!side && side.matches(r) && getComputedStyle(side).position === 'absolute' && side.classList.contains('mf-frost') }, [R, S])
  const pops = () => h.evaluate((p) => { const pop = document.querySelector(p); // Tied to its draft; in a month too narrow to name its things (dots only) no draft is drawn, and it is tied to the day itself, which is lit and picked.
    const draft = document.querySelector('[data-cal-level] [data-cal-draft]') ?? [...document.querySelectorAll('[data-cal-level] [data-day]')].find((el) => getComputedStyle(el.querySelector('[data-day-number]')).boxShadow !== 'none'); if (!pop || !draft) return false; const [a, b] = [pop.getBoundingClientRect(), draft.getBoundingClientRect()]; const apart = a.left >= b.right - 0.5 || a.right <= b.left + 0.5 || a.top >= b.bottom - 0.5 || a.bottom <= b.top + 0.5; return pop.classList.contains('mf-frost') && apart && a.left >= 11.5 && a.right <= innerWidth - 11.5 && a.bottom <= innerHeight - 11.5 }, P)
  await size(1900, 900); await wait(700)
  let was = await grid()
  await h.locator('[data-cal-new-event]').click(); await wait(700)
  check('"New event" opens a popover on the frost beside its draft, inside the window', await pops())
  check('…with nothing in a sidebar', (await right()) === 0 && (await h.locator(S).count()) === 0)
  check('…and the days keep their place and width', (await grid()) === was)
  if (process.env.SHOTS) await h.screenshot({ path: `${process.env.SHOTS}/cal-panels-editor.png` })
  await h.keyboard.press('Escape'); await wait(600)
  check('Esc closes it, and the days are clear', (await h.locator(`${P}, ${S}, [data-cal-draft]`).count()) === 0)
  // An event opened in full.
  const block = h.locator('[data-cal-event]', { hasText: 'Panels standup' }).first()
  await block.dblclick(); await wait(700)
  check('a double-click opens the popover on the event, and no panel', await h.locator('[data-cal-add][data-cal-open]').count() === 1 && await h.locator(S).count() === 0)
  await h.locator('[data-cal-add][data-cal-open] [data-cal-open-page]').click(); await wait(900)
  check('"Open" there opens the event in the floating panel', await h.locator(`${S}[data-day-side="event"]`).count() === 1 && await floats())
  if (process.env.SHOTS) await h.screenshot({ path: `${process.env.SHOTS}/cal-panels-event.png` })
  await h.locator(`${S} [data-day-side-close]`).click(); await wait(600)
  check('"Close" closes it', await h.locator(S).count() === 0)
  // At 1200 the popover is beside its draft all the same, the days unmoved.
  await size(1200, 900); await wait(700)
  was = await grid()
  await h.locator('[data-cal-new-event]').click(); await wait(700)
  check('1200 wide: the popover is beside its draft, the days unmoved', (await pops()) && (await right()) === 0 && (await grid()) === was)
  await h.keyboard.press('Escape'); await wait(600)
  check('1200 wide: closed, nothing is left over the days', (await h.locator(`${P}, ${R}`).count()) === 0)
  // The month: the popover beside the day, the month never squeezed.
  await h.keyboard.press('m'); await wait(600)
  was = await grid()
  await h.locator('[data-cal-new-event]').click(); await wait(700)
  const monthPop = await h.evaluate((p) => { const pop = document.querySelector(p)?.getBoundingClientRect(); const draft = document.querySelector('[data-cal-level] [data-cal-draft]')?.getBoundingClientRect(); return { pop: pop && [Math.round(pop.left), Math.round(pop.top), Math.round(pop.right), Math.round(pop.bottom)], draft: draft && [Math.round(draft.left), Math.round(draft.top), Math.round(draft.right), Math.round(draft.bottom)], window: [innerWidth, innerHeight] } }, P)
  check('in a month, the popover is beside its day, and the days keep their width', (await pops()) && (await grid()) === was, `${JSON.stringify(monthPop)}; days ${was} then ${await grid()}`)
  await h.keyboard.press('Escape'); await wait(500)
  await h.keyboard.press('w'); await wait(400)
  check('no page errors', !c.errors.length, c.errors.join(' | '))
} finally {
  await c.close()
}
console.log(`${results.filter(Boolean).length}/${results.length} passed`)
process.exit(results.every(Boolean) ? 0 : 1)
