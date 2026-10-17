// Home's month calendar and the week board, driven on sandbox data: a past,
// today's and a future date each open their own day; a task dragged to
// another day moves, and ⌘Z puts it back; a day's + adds a task for it; a busy
// day's "and N more" shows all on hover; the week number and the month's name
// open their pages. The week board: late tasks in one group, titles on one line.
//
//   npx electron-vite build --outDir out-calendar
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-calendar/main/index.js MINDFLOW_QA_AWAY=1 SHOTS=dir node qa/calendar.mjs
import { sandbox } from './sandbox-lib.mjs'
import { THEMES, checkInks, dragAcross, monthKey, nextMonth, where, wheel } from './month-lib.mjs'

const c = await sandbox({ width: 1300, height: 900 })
const { h, v, go, send } = c
const results = []
const check = (name, ok, detail = '') => (results.push(!!ok), console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`))
const pad = (n) => String(n).padStart(2, '0')
const key = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const at = (by) => { const d = new Date(); d.setHours(9, 0, 0, 0); d.setDate(d.getDate() + by); return d }
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const task = async (text, by, extra = {}) => { const made = await v('task:add', text); await v('task:save', made.id, { due: at(by).toISOString(), ...extra }); return made.id }
try {
  await v('settings:set', { hintRate: 0 })
  // Kept inside this month's grid: a week either side of today always is.
  const moving = await task('cal move me', 2)
  for (let n = 1; n <= 8; n++) await task(`cal busy ${n}`, 4)
  await task('cal late one', -1)
  const dueOnly = (await v('task:add', 'cal deadline only')).id
  await v('task:save', dueOnly, { deadline: at(3).toISOString() })
  await go('home')
  await h.waitForTimeout(1500)
  const M = '[data-month-plan]'

  for (const [name, by] of [['past', -2], ['today', 0], ['future', 3]]) {
    await go('home'); await h.waitForTimeout(600)
    await h.locator(`${M} [data-day="${key(at(by))}"] button[aria-label^="Open"]`).first().click()
    await h.waitForTimeout(1200)
    const title = (await h.locator('[data-page="day"] h1').first().innerText().catch(() => '')).replace(/\s+/g, '')
    const want = `${at(by).getDate()}${MONTHS[at(by).getMonth()]}`
    check(`clicking a ${name} date opens that day`, title.includes(want) && (by === 0) === title.startsWith('Today'), `${title} / ${want}`)
    if (by > 0) {
      check('a future day shows what is planned and an add line', await h.locator('[data-day-ahead]').count() === 1 && await h.locator('[data-day-ahead-add]').count() === 1)
      check('a future day has no "looked back" or time log', !(await h.locator('[data-page="day"]').innerText()).includes('looked back'))
      check('a future day lists its deadline', (await h.locator('[data-day-ahead]').innerText()).includes('cal deadline only'))
      await h.keyboard.press('ArrowRight'); await h.waitForTimeout(800)
      const next = (await h.locator('[data-page="day"] h1').first().innerText()).replace(/\s+/g, '')
      check('→ steps further into the future', next.includes(`${at(4).getDate()}${MONTHS[at(4).getMonth()]}`), next)
      if (process.env.SHOTS) await h.screenshot({ path: `${process.env.SHOTS}/day-ahead-light.png` })
    }
  }

  await go('home'); await h.waitForTimeout(1000)
  check('due tasks show as a deadline', await h.locator(`${M} [data-day="${key(at(3))}"] [data-plan-kind="due"]`).count() === 1)
  check('a past day with an open task shows it late', await h.locator(`${M} [data-day="${key(at(-1))}"][data-late]`).count() === 1)
  // Drag to move, then ⌘Z.
  const chip = h.locator(`${M} [data-plan-task]`, { hasText: 'cal move me' }).first()
  await chip.scrollIntoViewIfNeeded()
  const from = await chip.boundingBox()
  await h.mouse.move(from.x + 10, from.y + 5); await h.mouse.down()
  await h.mouse.move(from.x + 30, from.y + 15, { steps: 4 }); await h.waitForTimeout(300)
  // Measured once lifted: the page may scroll as the drag begins.
  const to = await h.locator(`${M} [data-day="${key(at(5))}"]`).boundingBox()
  await h.mouse.move(to.x + to.width / 2, to.y + 40, { steps: 12 })
  await h.mouse.up(); await h.waitForTimeout(900)
  const moved = (await v('tasks')).find((one) => one.id === moving)
  check('dragging a task onto another day moves it there', moved && moved.dueAt.slice(0, 10) === at(5).toISOString().slice(0, 10), moved?.dueAt)
  await h.keyboard.press('Meta+z'); await h.waitForTimeout(900)
  const back = (await v('tasks')).find((one) => one.id === moving)
  check('⌘Z puts it back', back && new Date(back.dueAt).getDate() === at(2).getDate(), back?.dueAt)

  // Inline add.
  const cell = h.locator(`${M} [data-day="${key(at(6))}"]`)
  await cell.hover(); await cell.locator('[data-day-add]').click()
  await h.keyboard.type('cal added inline'); await h.keyboard.press('Enter'); await h.waitForTimeout(1200)
  const added = (await v('tasks')).find((one) => one.title.includes('cal added inline'))
  check('a day\'s + adds a task for that day', added && new Date(added.dueAt).getDate() === at(6).getDate(), added?.dueAt)

  // The popover.
  await h.locator(`${M} [data-day="${key(at(4))}"] [data-plan-more]`).hover(); await h.waitForTimeout(700)
  const pop = await h.locator('[data-plan-popover]').innerText().catch(() => '')
  check('hovering "and N more" shows every task that day', [1, 2, 3, 4].every((n) => pop.includes(`cal busy ${n}`)), pop.replace(/\n/g, ' | '))
  if (process.env.SHOTS) await h.locator(M).screenshot({ path: `${process.env.SHOTS}/month-popover-light.png` })
  await h.mouse.move(5, 5); await h.waitForTimeout(400)

  // The scroll from month to month, on Home.
  const home = '[data-home-plan]'
  const frame = async () => h.locator(`${M} [data-month-scroll]`).evaluate((el) => el.parentElement.scrollIntoView({ block: 'center' }))
  await h.keyboard.press('Escape'); await go('home'); await h.waitForTimeout(800); await frame(); await h.waitForTimeout(600)
  check('the side panel is shut', await h.locator('[data-day-side]').count() === 0)
  const now = monthKey(new Date())
  let spot = await where(h)
  check('Home opens on this month, its first week at the top', spot.month === now && spot.snapped, JSON.stringify(spot))
  await wheel(h, 120)
  spot = await where(h)
  const title = async () => (await h.locator(`${M} [data-month-name]`).innerText()).trim()
  const named = (key) => { const [y, m] = key.split('-').map(Number); return `${MONTHS[m - 1]} ${y}` }
  check('a wheel scroll moves one month and the title changes', spot.month === nextMonth(now) && spot.snapped && await title() === named(nextMonth(now)), `${JSON.stringify(spot)} ${await title()}`)
  await wheel(h, -120)
  spot = await where(h)
  check('a wheel scroll back comes back a month', spot.month === now && spot.snapped, JSON.stringify(spot))
  // Arrows and "This month" glide there; with Reduce motion they jump.
  await h.locator(`${M} [data-month-next]`).click(); await h.waitForTimeout(40)
  const midway = await where(h)
  await h.waitForTimeout(1200)
  spot = await where(h)
  check('→ glides to the next month', midway.month === nextMonth(now) && !midway.snapped && spot.snapped && spot.month === nextMonth(now) && await title() === named(nextMonth(now)), `${JSON.stringify(midway)} ${JSON.stringify(spot)}`)
  await h.locator(`${M} [data-month-next]`).click(); await h.waitForTimeout(1200)
  await h.locator(`${M} [data-month-this]`).click(); await h.waitForTimeout(1200)
  spot = await where(h)
  check('"This month" comes back', spot.month === now && spot.snapped && await h.locator(`${M} [data-month-this]`).count() === 0, JSON.stringify(spot))
  await h.locator(`${M} [data-month-prev]`).click(); await h.waitForTimeout(1200)
  spot = await where(h)
  check('← goes to the month before', spot.month === nextMonth(now, -1) && spot.snapped, JSON.stringify(spot))
  await h.emulateMedia({ reducedMotion: 'reduce' })
  await h.locator(`${M} [data-month-next]`).click(); await h.waitForTimeout(60)
  spot = await where(h)
  check('with Reduce motion the arrow jumps, no glide', spot.month === now && spot.snapped, JSON.stringify(spot))
  await h.emulateMedia({ reducedMotion: 'no-preference' })
  // Far away and back: months are drawn as you go, and the way back lands exactly.
  for (let n = 0; n < 9; n++) await wheel(h, 120, 700)
  spot = await where(h)
  check('nine scrolls on is nine months on, months drawn as it goes', spot.month === nextMonth(now, 9) && spot.snapped, JSON.stringify(spot))
  await h.locator(`${M} [data-month-this]`).click(); await h.waitForTimeout(1400)
  spot = await where(h)
  check('"This month" from nine months on lands on this month', spot.month === now && spot.snapped, JSON.stringify(spot))
  // The page is not caught: with the calendar half out of view, the wheel scrolls Home.
  const page = h.locator(home).locator('xpath=ancestor::div[contains(@class,"overflow-y-auto")][1]')
  await page.evaluate((el) => { const cal = el.querySelector('[data-month-scroll]').parentElement; el.scrollTop += cal.getBoundingClientRect().top - el.getBoundingClientRect().bottom + 260 })
  await h.waitForTimeout(400)
  const before = await page.evaluate((el) => el.scrollTop)
  const scroller = await h.locator(`${M} [data-month-scroll]`).boundingBox()
  await h.mouse.move(scroller.x + scroller.width / 2, scroller.y + 100); await h.mouse.wheel(0, 200); await h.waitForTimeout(900)
  spot = await where(h)
  check('with the calendar half in view, a wheel over it scrolls Home, not the months', (await page.evaluate((el) => el.scrollTop)) > before + 50 && spot.month === now, `${before} -> ${await page.evaluate((el) => el.scrollTop)} ${spot.month}`)
  // A task carried into next month: held, the calendar scrolled on, set down there.
  await frame(); await h.waitForTimeout(600)
  const later = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 10)
  await dragAcross(h, 'cal move me', key(later))
  const across = (await v('tasks')).find((one) => one.id === moving)
  check('dragging a task into next month, scrolling while held, moves it there', across && key(new Date(across.dueAt)) === key(later), across?.dueAt)
  if (process.env.SHOTS) await h.locator(M).screenshot({ path: `${process.env.SHOTS}/month-after-drag.png` })
  await h.keyboard.press('Meta+z'); await h.waitForTimeout(900)
  check('⌘Z puts it back in this month', key(new Date((await v('tasks')).find((one) => one.id === moving).dueAt)) === key(at(2)))

  // In-month days stronger than the rest, weekends barely tinted, in every theme.
  for (const theme of THEMES) {
    await c.theme(theme); await go('home'); await h.waitForTimeout(800)
    await checkInks(h, check, theme)
    if (process.env.SHOTS && ['paper', 'light', 'dark'].includes(theme)) await h.locator(M).screenshot({ path: `${process.env.SHOTS}/home-month-${theme}.png` })
  }
  await c.theme('light'); await go('home'); await h.waitForTimeout(800)

  // Week number and month title.
  await h.locator(`${M} [data-week-number]`).first().click(); await h.waitForTimeout(1200)
  check('a week number opens the week page', await h.locator('[data-page="weekpage"]').count() === 1)
  await go('home'); await h.waitForTimeout(800)
  await h.locator(`${M} [data-month-name]`).click(); await h.waitForTimeout(1200)
  check('the month name opens the month page', await h.locator('[data-page="monthpage"]').count() === 1)

  // The week board.
  await go('week'); await h.waitForTimeout(1200); await h.keyboard.press('Escape')
  check('the week board puts late tasks under one "Late"', await h.locator('[data-week-group="late"]').count() === 1 && !(await h.locator('[data-task-meta]').allInnerTexts()).some((one) => one.startsWith('Late,')))
  const tall = await h.evaluate(() => [...document.querySelectorAll('[data-task-title]')].filter((one) => one.getBoundingClientRect().height > 24).length)
  check('every card title is on one line', tall === 0, `${tall} wrapped`)
  const meta = await h.evaluate(() => [...document.querySelectorAll('[data-task-meta]')].filter((one) => one.getBoundingClientRect().height > 22).length)
  check('every card\'s when is on one line', meta === 0, `${meta} stacked`)
  const widths = await h.evaluate(() => [...document.querySelectorAll('section[data-day]')].map((one) => Math.round(one.getBoundingClientRect().width)))
  check('a busy day is wider than an empty one', Math.max(...widths) > Math.min(...widths), widths.join(','))
  for (const theme of ['light', 'dark']) {
    await c.theme(theme)
    for (const w of [1900, 1300, 900]) {
      await c.size(w, 900); await go('week'); await h.waitForTimeout(900); await h.keyboard.press('Escape')
      if (process.env.SHOTS) await h.screenshot({ path: `${process.env.SHOTS}/week-${w}-${theme}.png` })
    }
  }
  await c.size(1300, 900); await go('week'); await h.waitForTimeout(800)
  const col = h.locator('section[data-day="3"]'); await col.hover(); await col.locator('[data-week-add]').click()
  await h.keyboard.type('week added inline'); await h.keyboard.press('Enter'); await h.waitForTimeout(1200)
  const wk = (await v('tasks')).find((one) => one.title.includes('week added inline'))
  check('the week board\'s + adds a task for that day', wk && new Date(wk.dueAt).getDate() === at(3).getDate(), wk?.dueAt)
  check('no page errors', !c.errors.length, c.errors.join(' | '))
} finally {
  await c.close()
}
console.log(`${results.filter(Boolean).length}/${results.length} passed`)
process.exit(results.every(Boolean) ? 0 : 1)
