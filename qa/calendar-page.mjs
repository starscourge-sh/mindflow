// The Calendar page, driven on sandbox data: D, W and M change the view, T
// comes back, ← → step; a block dragged moves and its edge stretches, each
// undone with ⌘Z; a slot clicked adds a task there; an Unscheduled task
// dragged onto the grid gets that time; the red line is at now; the month's
// cells show chips and "+N more" opens the rest; no sideways page scroll.
//
//   npx electron-vite build --outDir out-cal2
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-cal2/main/index.js MINDFLOW_QA_AWAY=1 SHOTS=dir node qa/calendar-page.mjs
import { sandbox } from './sandbox-lib.mjs'
import { checkInks, dragAcross, monthKey, nextMonth, swipe, where } from './month-lib.mjs'

const c = await sandbox({ width: 1300, height: 900 })
const { h, v, go } = c
const results = []
const check = (name, ok, detail = '') => (results.push(!!ok), console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`))
const pad = (n) => String(n).padStart(2, '0')
const key = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const at = (by, hour = 10) => { const d = new Date(); d.setHours(hour, 0, 0, 0); d.setDate(d.getDate() + by); return d }
const find = async (id) => (await v('tasks')).find((one) => one.id === id)
const shots = process.env.SHOTS
try {
  await v('settings:set', { hintRate: 0 })
  const block = (await v('task:add', 'cal2 block')).id
  await v('task:save', block, { due: at(0, 10).toISOString(), allDay: 0, estimate: 60 })
  for (let n = 1; n <= 9; n++) await v('task:save', (await v('task:add', `cal2 busy ${n}`)).id, { due: at(0, 9).toISOString() })
  const loose = (await v('task:add', 'cal2 loose')).id
  await go('calendar'); await h.waitForTimeout(1500)
  const mode = () => h.locator('[data-cal-mode]').getAttribute('data-cal-mode')
  for (const [k, m] of [['d', 'day'], ['m', 'month'], ['w', 'week']]) {
    await h.keyboard.press(k); await h.waitForTimeout(400)
    check(`${k.toUpperCase()} shows ${m}`, (await mode()) === m)
  }
  const title = () => h.locator('[data-cal-title]').innerText()
  const t0 = await h.locator('[data-cal-head]').first().getAttribute('data-cal-head')
  await h.keyboard.press('ArrowRight'); await h.waitForTimeout(400)
  const t1 = await h.locator('[data-cal-head]').first().getAttribute('data-cal-head')
  await h.keyboard.press('t'); await h.waitForTimeout(400)
  const t2 = await h.locator('[data-cal-head]').first().getAttribute('data-cal-head')
  check('→ steps a week and T comes back', t1 !== t0 && t2 === t0, `${t0} ${t1} ${t2} ${await title()}`)

  // The red line at now.
  const line = h.locator(`[data-cal-col="${key(new Date())}"] [data-cal-now]`)
  const top = await line.evaluate((el) => parseFloat(el.style.top))
  const want = ((new Date().getHours() * 60 + new Date().getMinutes()) / 60) * 56
  check('the red line marks now in today\'s column', Math.abs(top - want) < 2, `${top} ~ ${want}`)

  // Move a block an hour down, then ⌘Z.
  const b = h.locator(`[data-cal-block="${block}"]`)
  await b.scrollIntoViewIfNeeded()
  let box = await b.boundingBox()
  await h.mouse.move(box.x + 44, box.y + 10); await h.mouse.down()
  await h.mouse.move(box.x + 44, box.y + 30, { steps: 4 }); await h.mouse.move(box.x + 44, box.y + 10 + 56, { steps: 6 })
  await h.mouse.up(); await h.waitForTimeout(900)
  let t = await find(block)
  check('dragging a block moves it an hour later', new Date(t.dueAt).getHours() === 11 && !t.allDay, t.dueAt)
  await h.keyboard.press('Meta+z'); await h.waitForTimeout(900)
  t = await find(block)
  check('⌘Z puts the move back', new Date(t.dueAt).getHours() === 10, t.dueAt)

  // Esc mid-drag puts it back and the panel stays shut.
  box = await b.boundingBox()
  await h.mouse.move(box.x + 44, box.y + 10); await h.mouse.down()
  await h.mouse.move(box.x + 44, box.y + 10 + 56, { steps: 6 })
  await h.keyboard.press('Escape'); await h.mouse.up(); await h.waitForTimeout(700)
  t = await find(block)
  check('Esc mid-drag leaves the block where it was', new Date(t.dueAt).getHours() === 10 && await h.locator('[data-day-side]').count() === 0, t.dueAt)

  // Stretch its bottom edge by half an hour, then ⌘Z.
  box = await b.boundingBox()
  await h.mouse.move(box.x + 30, box.y + box.height - 2); await h.mouse.down()
  await h.mouse.move(box.x + 30, box.y + box.height + 10, { steps: 3 }); await h.mouse.move(box.x + 30, box.y + box.height + 24, { steps: 4 })
  await h.mouse.up(); await h.waitForTimeout(900)
  t = await find(block)
  check('dragging the edge sets the estimate', t.estimate === 90, String(t.estimate))
  await h.keyboard.press('Meta+z'); await h.waitForTimeout(900)
  check('⌘Z puts the length back', (await find(block)).estimate === 60)

  // Right-click gives the task menu.
  await b.click({ button: 'right' }); await h.waitForTimeout(400)
  check('right-clicking a block gives the task menu', await h.locator('[role="menu"]').count() > 0)
  await h.keyboard.press('Escape'); await h.waitForTimeout(300)

  // Click a slot at 14:00 tomorrow-ish (today's column), type, Enter.
  const col = h.locator(`[data-cal-col="${key(new Date())}"]`)
  await h.locator('[data-cal-scroll]').evaluate((el) => (el.scrollTop = 12 * 56))
  const cb = await col.boundingBox()
  await h.mouse.click(cb.x + 5, cb.y + 14 * 56 + 5); await h.waitForTimeout(400)
  await h.keyboard.type('cal2 slot add'); await h.keyboard.press('Enter'); await h.waitForTimeout(1200)
  const slot = (await v('tasks')).find((one) => one.title.includes('cal2 slot add'))
  check('clicking a slot adds a task at that time', slot && new Date(slot.dueAt).getHours() === 14 && !slot.allDay && slot.estimate === 30, `${slot?.dueAt} ${slot?.estimate}`)
  // The side panel stays open for the next one; Esc puts it away.
  await h.keyboard.press('Escape'); await h.waitForTimeout(400)

  // Drag from Unscheduled onto 16:00.
  const row = await h.locator(`[data-cal-loose="${loose}"]`).boundingBox()
  const cb2 = await col.boundingBox()
  await h.mouse.move(row.x + 20, row.y + 8); await h.mouse.down()
  await h.mouse.move(row.x + 40, row.y + 20, { steps: 3 })
  await h.mouse.move(cb2.x + 20, cb2.y + 16 * 56 + 4, { steps: 10 })
  await h.mouse.up(); await h.waitForTimeout(900)
  t = await find(loose)
  check('an Unscheduled task dragged onto the grid gets that time', t.dueAt && new Date(t.dueAt).getHours() === 16 && !t.allDay, t.dueAt)

  // Side panel hides.
  await h.locator('[data-cal-side-toggle]').click(); await h.waitForTimeout(300)
  check('the side panel can be hidden', await h.locator('[data-cal-side]').count() === 0)
  await h.locator('[data-cal-side-toggle]').click(); await h.waitForTimeout(300)

  // Month chips and +N more.
  await h.keyboard.press('m'); await h.waitForTimeout(800)
  const cell = h.locator(`[data-month-plan] [data-day="${key(new Date())}"]`)
  const shown = Number(await cell.getAttribute('data-shown'))
  check('a month cell fits more than two chips', shown > 2, String(shown))
  await cell.locator('[data-plan-more]').click(); await h.waitForTimeout(500)
  const pop = await h.locator('[data-plan-popover]').innerText().catch(() => '')
  check('"+N more" opens every task that day', [1, 5, 9].every((n) => pop.includes(`cal2 busy ${n}`)))
  await h.keyboard.press('Escape'); await h.mouse.move(5, 5); await h.waitForTimeout(300)

  // Months go sideways: a swipe is a month, the title follows, ← → and T slide there; the Show menu is in the heading.
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
  const named = (k) => { const [y, m] = k.split('-').map(Number); return `${MONTHS[m - 1]} ${y}` }
  const now = monthKey(new Date())
  const calTitle = async () => (await h.locator('[data-cal-title]').innerText()).trim()
  let spot = await where(h)
  check('the month opens on this month, its first week at the top', spot.month === now && spot.snapped, JSON.stringify(spot))
  await swipe(h, 120)
  spot = await where(h)
  check('a sideways swipe moves one month and the title changes', spot.month === nextMonth(now) && spot.snapped && await calTitle() === named(nextMonth(now)), `${JSON.stringify(spot)} ${await calTitle()}`)
  await h.keyboard.press('ArrowLeft'); await h.waitForTimeout(1200)
  spot = await where(h)
  check('← glides back a month', spot.month === now && spot.snapped && await calTitle() === named(now), JSON.stringify(spot))
  await h.locator('[data-cal-next]').click(); await h.waitForTimeout(1200)
  await h.locator('[data-cal-next]').click(); await h.waitForTimeout(1200)
  spot = await where(h)
  check('the → arrow steps a month each time', spot.month === nextMonth(now, 2) && spot.snapped && await calTitle() === named(nextMonth(now, 2)), JSON.stringify(spot))
  await h.keyboard.press('t'); await h.waitForTimeout(1200)
  spot = await where(h)
  check('T comes back to this month', spot.month === now && spot.snapped && await h.locator('[data-cal-today]').isDisabled(), JSON.stringify(spot))
  await swipe(h, 0); await h.mouse.wheel(0, 300); await h.waitForTimeout(800)
  check('a plain wheel does not change the month', (await where(h)).month === now)
  check('the heading has a Show menu, no switches', await h.locator('header [data-month-show]').count() === 1 && await h.locator('header [role="switch"], [data-month-plan] [role="switch"]').count() === 0)
  await h.locator('header [data-month-show]').click(); await h.waitForTimeout(300)
  await h.locator('[data-month-opened-switch]').click(); await h.waitForTimeout(500)
  check('ticking "Days I opened Vigil" on the Calendar marks the days', (await v('settings')).monthOpened === true && await h.locator('[data-month-plan] [data-opened]').count() > 0)
  await h.locator('[data-month-opened-switch]').click(); await h.keyboard.press('Escape'); await h.waitForTimeout(300)
  const later = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 12)
  const chip =await h.locator(`[data-month-plan] [data-day="${key(new Date())}"] [data-plan-task]`).first().innerText()
  await dragAcross(h, chip.trim(), key(later))
  const carried = (await v('tasks')).filter((one) => one.dueAt && key(new Date(one.dueAt)) === key(later))
  check('a chip carried into next month, swiping while held, lands there', carried.length === 1, String(carried.length))
  await h.keyboard.press('Meta+z'); await h.waitForTimeout(900)
  check('⌘Z brings it back', carried[0] && key(new Date((await find(carried[0].id)).dueAt)) === key(new Date()), chip)
  await h.keyboard.press('t'); await h.waitForTimeout(1000)
  for (const theme of ['paper', 'light', 'dark']) {
    await c.theme(theme); await go('calendar'); await h.waitForTimeout(900); await h.keyboard.press('m'); await h.waitForTimeout(700)
    await checkInks(h, check, `Calendar ${theme}`)
    if (shots) await h.screenshot({ path: `${shots}/calendar-month-${theme}.png` })
  }
  await c.theme('light'); await go('calendar'); await h.waitForTimeout(900); await h.keyboard.press('m'); await h.waitForTimeout(500)

  for (const w of [900, 1300, 1900]) {
    await c.size(w, 900); await h.waitForTimeout(500)
    for (const m of ['d', 'w', 'm']) {
      await h.keyboard.press(m); await h.waitForTimeout(400)
      const wide = await h.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
      if (wide > 0) check(`no sideways scroll at ${w} in ${m}`, false, `${wide}px`)
    }
  }
  check('no sideways page scroll at 900, 1300, 1900', true)
  if (shots) {
    await c.size(1300, 900)
    for (const theme of ['light', 'dark']) {
      await c.theme(theme); await go('calendar'); await h.waitForTimeout(900)
      for (const [m, name] of [['d', 'day'], ['w', 'week'], ['m', 'month']]) {
        await h.keyboard.press(m); await h.waitForTimeout(700)
        await h.screenshot({ path: `${shots}/${name}-${theme}.png` })
      }
    }
  }
  check('no page errors', !c.errors.length, c.errors.join(' | '))
} finally {
  await c.close()
}
console.log(`${results.filter(Boolean).length}/${results.length} passed`)
process.exit(results.every(Boolean) ? 0 : 1)
