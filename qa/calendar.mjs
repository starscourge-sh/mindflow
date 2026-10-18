// Home's month calendar and the week board, driven on sandbox data: a past,
// today's and a future date each open their own day; a task dragged to
// another day moves, and ⌘Z puts it back; a day's + adds a task for it; a busy
// day's "and N more" shows all on hover; the week number and the month's name
// open their pages. The week board: late tasks in one group, titles on one line.
//
//   npx electron-vite build --outDir out-calendar
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-calendar/main/index.js MINDFLOW_QA_AWAY=1 SHOTS=dir node qa/calendar.mjs
import { sandbox } from './sandbox-lib.mjs'
import { THEMES, checkInks, dragAcross, monthKey, nextMonth, swipe, where } from './month-lib.mjs'

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
  await v('settings:set', { hintRate: 0, homeCalendar: true })
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

  // Months go sideways on Home: a swipe or ⇧ and the wheel is one month; up and down are the page's.
  const home = '[data-home-plan]'
  const frame = async () => h.locator(`${M} [data-month-scroll]`).evaluate((el) => el.parentElement.scrollIntoView({ block: 'center' }))
  await h.keyboard.press('Escape'); await go('home'); await h.waitForTimeout(800); await frame(); await h.waitForTimeout(600)
  check('the side panel is shut', await h.locator('[data-day-side]').count() === 0)
  const head = await h.locator(`${M} > div`).first().innerText()
  check('the heading is quiet: title, Today, the arrows and a Show menu, no switches', !/Show the days|Captures/.test(head) && await h.locator(`${M} [data-month-show]`).count() === 1 && await h.locator(`${M} [role="switch"]`).count() === 0, head.replace(/\n/g, ' | '))
  const now = monthKey(new Date())
  let spot = await where(h)
  check('Home opens on this month', spot.month === now && spot.snapped, JSON.stringify(spot))
  const title = async () => (await h.locator(`${M} [data-month-name]`).innerText()).trim()
  const named = (k) => { const [y, m] = k.split('-').map(Number); return `${MONTHS[m - 1]} ${y}` }
  await swipe(h, 120)
  spot = await where(h)
  check('a sideways swipe moves one month and the title changes', spot.month === nextMonth(now) && spot.snapped && await title() === named(nextMonth(now)), `${JSON.stringify(spot)} ${await title()}`)
  await swipe(h, -120)
  spot = await where(h)
  check('a swipe the other way comes back a month', spot.month === now && spot.snapped, JSON.stringify(spot))
  await swipe(h, 120, { shift: true })
  spot = await where(h)
  check('⇧ and the wheel moves a month too', spot.month === nextMonth(now) && spot.snapped, JSON.stringify(spot))
  await swipe(h, 2000)
  spot = await where(h)
  check('a long swipe is still one month', spot.month === nextMonth(now, 2) && spot.snapped, JSON.stringify(spot))
  // A plain wheel scrolls Home, never the months.
  const page = h.locator(home).locator('xpath=ancestor::div[contains(@class,"overflow-y-auto")][1]')
  const before = await page.evaluate((el) => el.scrollTop)
  await swipe(h, 0); await h.mouse.wheel(0, 250); await h.waitForTimeout(900)
  check('a plain wheel over the calendar scrolls Home, not the months', (await page.evaluate((el) => el.scrollTop)) > before + 50 && (await where(h)).month === nextMonth(now, 2), `${before} -> ${await page.evaluate((el) => el.scrollTop)}`)
  await frame(); await h.waitForTimeout(500)
  // Arrows and Today slide there; with Reduce motion they jump.
  await h.locator(`${M} [data-month-this]`).click(); await h.waitForTimeout(900)
  spot = await where(h)
  check('Today comes back to this month, and is greyed there', spot.month === now && spot.snapped && await h.locator(`${M} [data-month-this]`).isDisabled(), JSON.stringify(spot))
  // Each frame of the slide, read as it runs: how many months are in the box, and how far the new one is from its place.
  const watchSlide = () => h.evaluate(() => {
    window.__slide = []
    const t0 = performance.now()
    const tick = () => {
      const M = document.querySelector('[data-month-plan]')
      const grids = [...M.querySelectorAll('[data-month-grid]')]
      const g = grids.find((one) => one.dataset.monthGrid === M.dataset.monthShown)
      window.__slide.push([grids.length, g ? Math.round(g.getBoundingClientRect().left - M.querySelector('[data-month-scroll]').getBoundingClientRect().left) : null])
      if (performance.now() - t0 < 600) requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })
  const slid = async () => (await h.waitForTimeout(800), h.evaluate(() => window.__slide))
  await watchSlide(); await h.locator(`${M} [data-month-next]`).click()
  let frames = await slid()
  spot = await where(h)
  check('→ slides sideways to the next month, coming in from the right', frames.some(([n, x]) => n === 2 && x > 20) && spot.snapped && spot.month === nextMonth(now) && await title() === named(nextMonth(now)), `${JSON.stringify(frames.slice(0, 6))} ${JSON.stringify(spot)}`)
  await watchSlide(); await h.locator(`${M} [data-month-prev]`).click()
  frames = await slid()
  check('← slides in from the left', frames.some(([n, x]) => n === 2 && x < -20) && (await where(h)).month === now, JSON.stringify(frames.slice(0, 6)))
  await h.emulateMedia({ reducedMotion: 'reduce' })
  await watchSlide(); await h.locator(`${M} [data-month-next]`).click()
  frames = await slid()
  spot = await where(h)
  check('with Reduce motion the arrow jumps, no slide', spot.month === nextMonth(now) && spot.snapped && frames.every(([, x]) => x === 0 || x === null), `${JSON.stringify(frames.slice(0, 6))} ${JSON.stringify(spot)}`)
  await h.locator(`${M} [data-month-prev]`).click(); await h.waitForTimeout(300)
  await h.emulateMedia({ reducedMotion: 'no-preference' })
  // The Show menu: the two marks, as checks.
  await h.locator(`${M} [data-month-show]`).click(); await h.waitForTimeout(300)
  const menu0 = await h.locator('[role="menu"]').innerText().catch(() => '')
  check('the Show menu offers the two marks as checks', /Days I opened Vigil/.test(menu0) && /Captures/.test(menu0) && await h.locator('[role="menuitemcheckbox"]').count() === 2, menu0.replace(/\n/g, ' | '))
  await h.locator('[data-month-captures-switch]').click(); await h.waitForTimeout(500)
  check('ticking Captures shows the marks at once and keeps the menu open', (await v('settings')).monthCaptures === true && await h.locator(`${M} [data-captured]`).count() > 0 && await h.locator('[role="menu"]').count() === 1)
  await h.locator('[data-month-captures-switch]').click(); await h.keyboard.press('Escape'); await h.waitForTimeout(400)
  // A task carried into next month: held, a swipe on, set down there.
  await frame(); await h.waitForTimeout(500)
  const later = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 10)
  await dragAcross(h, 'cal move me', key(later))
  const across = (await v('tasks')).find((one) => one.id === moving)
  check('dragging a task into next month, swiping while held, moves it there', across && key(new Date(across.dueAt)) === key(later), across?.dueAt)
  if (process.env.SHOTS) await h.locator(M).screenshot({ path: `${process.env.SHOTS}/month-after-drag.png` })
  await h.keyboard.press('Meta+z'); await h.waitForTimeout(900)
  check('⌘Z puts it back in this month', key(new Date((await v('tasks')).find((one) => one.id === moving).dueAt)) === key(at(2)))
  await h.locator(`${M} [data-month-this]`).click({ force: true }).catch(() => {}); await h.waitForTimeout(700)

  // Marked days are chips like the tasks': one line, a tip, a click opens what they belong to, a right-click their menu, a drag moves them.
  const marked = await v('milestones', null, null)
  const hamlet = marked.find((one) => one.title === 'Hamlet essay due')
  const dune = marked.find((one) => one.title === 'Dune film night')
  const exam = marked.find((one) => one.exam)
  await go('home'); await h.waitForTimeout(900); await frame(); await h.waitForTimeout(500)
  const flag = (one) => h.locator(`${M} [data-mark-flag="${one.id}"]`)
  check('a marked day is a button in its day', await flag(hamlet).evaluate((el) => el.tagName) === 'BUTTON')
  await c.size(900, 900); await go('home'); await h.waitForTimeout(900); await frame(); await h.waitForTimeout(500)
  const oneLine = await h.evaluate(() => ({ flags: [...document.querySelectorAll('[data-month-plan] [data-mark-flag]')].map((el) => [el.textContent, Math.round(el.getBoundingClientRect().height), Math.round(el.closest('[data-day]').getBoundingClientRect().right - el.getBoundingClientRect().right)]), shortened: [...document.querySelectorAll('[data-month-plan] [data-mark-flag] .truncate')].some((el) => el.scrollWidth > el.clientWidth), cut: [...document.querySelectorAll('[data-month-plan] [data-mark-flag] .truncate')].every((el) => getComputedStyle(el).whiteSpace === 'nowrap' && getComputedStyle(el).textOverflow === 'ellipsis') }))
  check('in a narrow day every marked day stays on one line, cut with an ellipsis', oneLine.flags.length >= 2 && oneLine.flags.every(([, ht, room]) => ht <= 22 && room >= 0) && oneLine.shortened && oneLine.cut, JSON.stringify(oneLine))
  if (process.env.SHOTS) await h.locator(M).screenshot({ path: `${process.env.SHOTS}/month-flags-narrow.png` })
  await c.size(1300, 900); await go('home'); await h.waitForTimeout(900); await frame(); await h.waitForTimeout(500)
  await flag(hamlet).hover(); await h.waitForTimeout(900)
  const tip = await h.locator('[role="tooltip"]').first().innerText().catch(() => '')
  check('hovering a marked day gives its tip', tip.includes('Hamlet essay due') && tip.includes('Click to open its note'), tip.replace(/\n/g, ' | '))
  await flag(hamlet).focus()
  check('a marked day takes the focus ring', await flag(hamlet).evaluate((el) => el === document.activeElement && el.matches(':focus-visible, :focus')))
  await flag(hamlet).click({ button: 'right' }); await h.waitForTimeout(400)
  const menu = await h.locator('[role="menu"]').innerText().catch(() => '')
  check('right-clicking a marked day gives its menu', ['Open the note', 'Change Hamlet essay due', 'Unmark', "Open the day's page"].every((line) => menu.includes(line)), menu.replace(/\n/g, ' | '))
  await h.keyboard.press('Escape'); await h.waitForTimeout(300)
  await flag(hamlet).click(); await h.waitForTimeout(1200)
  const landed = await h.locator('[data-page]').first().getAttribute('data-page')
  check('clicking a marked day with a note opens that note', landed !== 'home', `${hamlet.note} -> ${landed}`)
  await go('home'); await h.waitForTimeout(900); await frame(); await h.waitForTimeout(500)
  await flag(exam).click(); await h.waitForTimeout(1200)
  const tagPage = await h.locator('[data-page]').first().getAttribute('data-page')
  check("clicking an exam's flag opens its tag", tagPage !== 'home' && (await h.locator('[data-page]').first().innerText()).includes(exam.exam), tagPage)
  await go('home'); await h.waitForTimeout(900); await frame(); await h.waitForTimeout(500)
  // Dragged two days on, then ⌘Z.
  const two = (d) => { const [y, m, dd] = d.split('-').map(Number); return key(new Date(y, m - 1, dd + 2)) }
  const fb = await flag(dune).boundingBox()
  await h.mouse.move(fb.x + 10, fb.y + 5); await h.mouse.down()
  await h.mouse.move(fb.x + 30, fb.y + 15, { steps: 4 }); await h.waitForTimeout(300)
  const tb = await h.locator(`${M} [data-day="${two(dune.day)}"]`).boundingBox()
  await h.mouse.move(tb.x + tb.width / 2, tb.y + 40, { steps: 12 }); await h.mouse.up(); await h.waitForTimeout(1000)
  const movedMark = (await v('milestones', null, null)).find((one) => one.id === dune.id)
  check('dragging a marked day moves its date', movedMark?.day === two(dune.day), `${dune.day} -> ${movedMark?.day}`)
  await h.keyboard.press('Meta+z'); await h.waitForTimeout(900)
  check('⌘Z puts the marked day back', (await v('milestones', null, null)).find((one) => one.id === dune.id)?.day === dune.day)
  // The dots are clickable: the day's page.
  await v('settings:set', { monthCaptures: true }); await go('home'); await h.waitForTimeout(1200); await frame(); await h.waitForTimeout(500)
  const dots = h.locator(`${M} [data-day="${key(at(-2))}"] [data-day-dots]`)
  check('a day shows its captures dot as a button', await dots.count() === 1)
  await dots.click(); await h.waitForTimeout(1200)
  check("clicking a day's dots opens that day", await h.locator('[data-page="day"]').count() === 1)
  await v('settings:set', { monthCaptures: false })

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
