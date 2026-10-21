// The Calendar page laid out as a Mac calendar, driven on sandbox data at
// 10:30: a title with the week's number under it, Today, the ‹ › pair, Day |
// Week | Month, search and "+ New event"; the zone over the hours, today's
// date in a pill, now in a red pill; soft filled events with their time under
// the name, tasks as outlines; "My calendars" as coloured ticks; the small
// month and "Upcoming · Next 7 days"; and a click on an event opening a small
// card beside it (pencil, bin with Undo, close; when, place, reminder, notes)
// that flips to stay on screen, with Esc, double-click and ⌫. Then the
// Notion Calendar and Todoist parts: blocks with a coloured left edge, a
// called-off event and a done task struck through in a dashed outline, an
// all-day lane with a three-day event across its days that folds, the
// right-click swatches, "Block on calendar", Cut, Copy, Duplicate and Delete,
// ⌘C ⌘V and ⌘D on the grid, a task's tick that marks it done, the dragged
// block lifted over a dashed outline, "October 2026 ⌄" and ., ‹ Today ›, the
// Plan toggle, the eye on a calendar, the next event's countdown and the
// useful shortcuts. Screenshots in paper, light and dark at 1600 and 1200 wide.
//
//   npx electron-vite build --outDir out-calref
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-calref/main/index.js MINDFLOW_QA_AWAY=1 SHOTS=dir node qa/cal-daymark.mjs
import { sandbox } from './sandbox-lib.mjs'

const c = await sandbox({ width: 1600, height: 1000, at: '10:30' })
const { h, v, go } = c
const results = []
const check = (name, ok, detail = '') => (results.push(!!ok), console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${String(detail).slice(0, 300)})` : ''}`))
const shots = process.env.SHOTS
const shot = async (name) => shots && h.screenshot({ path: `${shots}/${name}.png` })
const pad = (n) => String(n).padStart(2, '0')
const key = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const today = c.now(); today.setHours(0, 0, 0, 0)
const monday = new Date(today); monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7))
const at = (day, h0, m0 = 0) => { const d = new Date(monday); d.setDate(d.getDate() + day); d.setHours(h0, m0, 0, 0); return d.toISOString() }
const S = '[data-day-side]'
const P = '[data-cal-pop]'
try {
  await v('settings:set', { hintRate: 0 })
  // Six calendars, in the reference's colours.
  await v('calendar:set', { id: 'work', name: 'Work', color: 'blue' })
  await v('calendar:set', { id: 'uni', name: 'Meetings', color: 'purple' })
  await v('calendar:set', { id: 'personal', name: 'Personal', color: 'orange' })
  const focus = (await v('calendar:set', { name: 'Focus time', color: 'green' })).id
  const social = (await v('calendar:set', { name: 'Social', color: 'pink' })).id
  const reminders = (await v('calendar:set', { name: 'Reminders', color: 'yellow' })).id
  const add = (title, day, a, b, calendarId, more = {}) => v('event:add', { title, start: at(day, ...a), end: at(day, ...b), calendarId, ...more })
  await add('Weekly Planning', 0, [9], [9, 30], 'work')
  await add('Product Sync', 0, [11], [12], 'uni')
  await add('Focus Time', 0, [14], [15], focus)
  await add('Design Review', 1, [9, 30], [10, 30], 'work')
  await add('Client Meeting', 1, [11], [12], 'uni')
  await add('Project Planning', 1, [15], [16], 'work')
  await add('Team Standup', 2, [10], [11], 'uni')
  await add('Research Review', 2, [13], [14], 'work')
  await add('Deep Work', 2, [15], [17], focus, { notes: 'Focus room' })
  await add('Sprint Planning', 3, [9], [10], 'work')
  await add('Quick Catch-up', 3, [11, 30], [12], social)
  await add('Design Handoff', 3, [14], [15], 'work')
  await add('Weekly Check-in with the whole team', 4, [9, 30], [10], 'uni')
  await add('Project Review', 4, [11], [12], 'work')
  await add('Weekly Wrap-up', 4, [14], [15], social)
  await add('Personal Errands', 5, [10], [11], 'personal')
  const plan = await add('Plan Next Week', 6, [16], [17], reminders, { place: 'Home office', remind: 10, notes: 'Review priorities, check upcoming deadlines, and block focus time for the week ahead.' })
  await add('Weekly Planning', 7, [9], [9, 30], 'work')
  await add('Product Sync', 7, [11], [12], 'uni')
  const task = (await v('task:add', 'Send the slides')).id
  await v('task:save', task, { due: at(5, 15), allDay: 0, estimate: 60, priority: 1 })
  const doneTask = (await v('task:add', 'Book the room')).id
  await v('task:save', doneTask, { due: at(1, 13), allDay: 0, estimate: 45 })
  await v('task:done', doneTask).catch(() => {})
  await v('event:add', { title: 'Offsite', start: at(2, 0), end: at(5, 0), allDay: true, calendarId: 'work' })
  const off = await add('Vendor call', 3, [16], [16, 30], 'uni', { cancelled: true })

  await go('calendar'); await h.waitForTimeout(1500)
  await h.keyboard.press('w'); await h.keyboard.press('t'); await h.waitForTimeout(800)
  await h.locator('[data-cal-scroll]').evaluate((el) => (el.scrollTop = 6.6 * 56))
  await h.waitForTimeout(300)

  // 1. The header.
  const sub = await h.locator('[data-cal-subtitle]').innerText()
  check('the title says the month, the week\'s number and days under it', /^Week \d+ · \w+ \d+ – (\w+ )?\d+/.test(sub.trim()) && /\w+ \d{4}/.test(await h.locator('[data-cal-title]').innerText()), sub)
  check('‹ | Today | › as one control, Day | Week | Month, search, Plan and "+ New event" are there', await h.locator('[data-cal-step] [data-cal-today]').count() === 1 && await h.locator('[data-cal-step] [data-cal-prev]').count() === 1 && (await h.locator('[data-cal-side-toggle]').innerText()).includes('Plan') && await h.locator('[data-cal-views] [role="radio"]').count() === 3 && await h.locator('[data-cal-search]').count() === 1 && (await h.locator('[data-cal-new-event]').innerText()).includes('New event'))
  await h.locator('[data-cal-view="day"]').click(); await h.waitForTimeout(400)
  check('Day in the switch shows a day', (await h.locator('[data-cal-mode]').getAttribute('data-cal-mode')) === 'day' && (await h.locator('[data-cal-view="day"]').getAttribute('aria-checked')) === 'true')
  await h.locator('[data-cal-view="week"]').click(); await h.waitForTimeout(400)
  await h.locator('[data-cal-search]').click(); await h.waitForTimeout(600)
  check('the search mark opens ⌘K', await h.locator('[data-search-at], [data-search-scope], input[placeholder]').count() > 0 && await h.evaluate(() => !!document.activeElement?.closest('[role="dialog"]')))
  await h.keyboard.press('Escape'); await h.waitForTimeout(500)
  await h.locator('[data-cal-new-event]').click(); await h.waitForTimeout(700)
  check('"+ New event" opens the panel on Event', await h.locator(`${S}[data-day-side="new"] [data-day-side-kind="event"][aria-checked="true"]`).count() === 1)
  await h.keyboard.press('Escape'); await h.waitForTimeout(500)

  // 2. The grid.
  check('the zone is named over the hours', /^(GMT|UTC|[A-Z]{2,5})/.test((await h.locator('[data-cal-zone-here]').innerText()).trim()), await h.locator('[data-cal-zone-here]').innerText())
  const todayHead = h.locator(`[data-cal-head="${key(today)}"] > span`).nth(1)
  check('today\'s date sits in a filled pill', (await todayHead.evaluate((el) => getComputedStyle(el).backgroundColor)) !== 'rgba(0, 0, 0, 0)')
  check('now is a red pill on the hours, "10:30"', (await h.locator('[data-cal-now-pill]').innerText()).trim() === '10:30', await h.locator('[data-cal-now-pill]').innerText())

  // 3. Event blocks.
  const plain = h.locator(`[data-cal-event="${plan.key}"]`)
  const ink = await plain.evaluate((el) => [getComputedStyle(el).backgroundColor, getComputedStyle(el).color, getComputedStyle(document.body).color])
  check('an event is a soft fill with its own darker words', ink[0] !== ink[2] && ink[1] !== ink[2], ink.join(' | '))
  check('its name, then its time under it', /Plan Next Week\s*\n\s*16:00/.test(await plain.innerText()), await plain.innerText())
  await h.locator(`[data-cal-head="${key(new Date(at(6, 12)))}"]`).click(); await h.waitForTimeout(600)
  check('  "16:00 – 17:00" where the block has room (the day view)', (await plain.innerText()).includes('16:00 – 17:00'), await plain.innerText())
  await h.keyboard.press('w'); await h.waitForTimeout(500)
  const radius = await plain.evaluate((el) => parseFloat(getComputedStyle(el).borderTopLeftRadius))
  check('rounded about 6px', radius >= 5 && radius <= 7, radius)
  const long = h.locator('[data-cal-event]', { hasText: 'Weekly Check-in' }).locator('span.truncate').first()
  check('a long name ends in "…"', await long.evaluate((el) => el.scrollWidth > el.clientWidth && getComputedStyle(el).textOverflow === 'ellipsis'))
  check('a task stays an outline with its tick', (await h.locator(`[data-cal-block="${task}"]`).evaluate((el) => getComputedStyle(el).borderTopWidth)) === '1.5px')

  // 4. My calendars.
  const boxes = h.locator('[data-cal-layers] [role="checkbox"]')
  check('"My calendars" lists each calendar, Tasks too, as ticks', (await h.locator('[data-cal-layers] h2').innerText()) === 'My calendars' && await boxes.count() >= 7 && await h.locator('[data-cal-layer="tasks"] [role="checkbox"]').count() === 1, await boxes.count())
  await h.locator(`[data-cal-layer="${social}"] [role="checkbox"]`).click(); await h.waitForTimeout(700)
  check('unticking Social hides its events', await h.locator('[data-cal-event]', { hasText: 'Quick Catch-up' }).count() === 0)
  await h.locator(`[data-cal-layer="${social}"] [role="checkbox"]`).click(); await h.waitForTimeout(700)
  check('ticking it again shows them', await h.locator('[data-cal-event]', { hasText: 'Quick Catch-up' }).count() === 1)

  // 5. The right panel.
  const mini = h.locator('[data-cal-side] [data-cal-mini]')
  check('the small month tops the left panel, single-letter weekdays, today in a pill', await mini.count() === 1 && (await mini.innerText()).includes('M\nT\nW') && await mini.locator(`[data-cal-mini-day="${key(today)}"] span`).evaluate((el) => getComputedStyle(el).backgroundColor !== 'rgba(0, 0, 0, 0)'))
  // At 1600 with the sidebar open the right panel folds for the week's room: "Plan" brings it back (qa/cal-panels.mjs).
  if (await h.locator('[data-cal-right]').count() === 0) { await h.locator('[data-cal-side-toggle]').click(); await h.waitForTimeout(500) }
  const up = await h.locator('[data-cal-upcoming]').innerText()
  check('"Upcoming · Next 7 days", by day', up.startsWith('Upcoming') && up.includes('Next 7 days') && /Today, \w+ \d+/.test(up) && /Tomorrow, \w+ \d+/.test(up), up.slice(0, 200))
  check('a row says its time and calendar: "09:00 – 09:30 · Work"', up.includes('09:00 – 09:30 · Work'), up)
  const row = h.locator(`[data-cal-upcoming-row]`, { hasText: 'Product Sync' }).first()
  await row.click(); await h.waitForTimeout(600)
  check('a row clicked opens its card', await h.locator(P).count() === 1 && (await h.locator(`${P} [data-cal-pop-title]`).innerText()) === 'Product Sync')
  const rb = await row.boundingBox(); const pb = await h.locator(P).boundingBox()
  check('  beside the row, on its left (no room on its right)', pb.x + pb.width <= rb.x + 1, `${pb.x + pb.width} <= ${rb.x}`)
  await h.keyboard.press('Escape'); await h.waitForTimeout(400)
  check('Esc puts it away', await h.locator(P).count() === 0)
  await h.keyboard.press('t'); await h.waitForTimeout(600)

  check('the next event and its countdown, or "No upcoming meeting"', /^In \d|On now|No upcoming meeting/.test((await h.locator('[data-cal-next-up]').innerText()).trim()), await h.locator('[data-cal-next-up]').innerText())
  check('"Useful shortcuts": Command menu ⌘K, Go to date ., All keyboard shortcuts ?', /Command menu[\s\S]*K[\s\S]*Go to date[\s\S]*\.[\s\S]*All keyboard shortcuts[\s\S]*\?/.test(await h.locator('[data-cal-shortcuts]').innerText()))

  // 6. The card.
  await plain.click(); await h.waitForTimeout(600)
  const card = await h.locator(P).innerText()
  check('a click on an event shows its card, not the panel', await h.locator(P).count() === 1 && await h.locator(S).count() === 0)
  check('  its calendar, its name, when, where, the reminder and notes', card.includes('Reminders') && card.includes('Plan Next Week') && /\w{3}, \w+ \d+ · 16:00 – 17:00/.test(card) && card.includes('Home office') && card.includes('10 minutes before') && card.includes('Review priorities'), card)
  check('  with edit, the bin and close', await h.locator(`${P} [data-cal-pop-edit]`).count() === 1 && await h.locator(`${P} [data-cal-pop-bin]`).count() === 1 && await h.locator(`${P} [data-cal-pop-close]`).count() === 1)
  const bb = await plain.boundingBox(); const cb = await h.locator(P).boundingBox()
  check('  anchored next to the block, on screen', (cb.x >= bb.x + bb.width || cb.x + cb.width <= bb.x) && cb.x >= 0 && cb.y >= 0 && cb.y + cb.height <= 1000 && Math.abs(cb.y - bb.y) < 200, JSON.stringify([bb, cb]))
  for (const theme of ['paper', 'light', 'dark']) {
    if (theme !== 'paper') await c.theme(theme)
    for (const [w, hh] of [[1600, 1000], [1200, 800]]) {
      await c.size(w, hh); await go('calendar'); await h.waitForTimeout(900)
      await h.keyboard.press('w'); await h.keyboard.press('t'); await h.waitForTimeout(600)
      await h.locator('[data-cal-scroll]').evaluate((el) => (el.scrollTop = 6.6 * 56)); await h.waitForTimeout(300)
      await shot(`week-${theme}-${w}`)
      const target = h.locator(`[data-cal-event="${plan.key}"]`)
      await target.scrollIntoViewIfNeeded(); await target.click(); await h.waitForTimeout(700)
      await shot(`card-${theme}-${w}`)
      const inside = await h.locator(P).boundingBox()
      check(`${theme} ${w}: the card stays on screen`, inside && inside.x >= 0 && inside.x + inside.width <= w && inside.y + inside.height <= hh, JSON.stringify(inside))
      await h.keyboard.press('Escape'); await h.waitForTimeout(300)
      if (w === 1600) { await h.keyboard.press('m'); await h.waitForTimeout(800); await shot(`month-${theme}-${w}`); await h.keyboard.press('d'); await h.waitForTimeout(600); await shot(`day-${theme}-${w}`); await h.keyboard.press('w') }
    }
  }
  await c.theme('light'); await c.size(1600, 1000); await go('calendar'); await h.waitForTimeout(900)
  await h.keyboard.press('w'); await h.keyboard.press('t'); await h.waitForTimeout(600)
  const blk = h.locator(`[data-cal-event="${plan.key}"]`)
  await blk.scrollIntoViewIfNeeded()
  // The pencil opens the full panel; a double-click too.
  await blk.click(); await h.waitForTimeout(500)
  await h.locator(`${P} [data-cal-pop-edit]`).click(); await h.waitForTimeout(800)
  check('the pencil opens the full panel', await h.locator(`${S} [data-event-detail="${plan.key}"]`).count() === 1 && await h.locator(P).count() === 0)
  await h.keyboard.press('Escape'); await h.waitForTimeout(500)
  await blk.dblclick(); await h.waitForTimeout(800)
  check('a double-click opens the full panel', await h.locator(`${S} [data-event-detail="${plan.key}"]`).count() === 1 && await h.locator(P).count() === 0)
  await h.keyboard.press('Escape'); await h.waitForTimeout(500)
  // The bin, with Undo.
  await blk.click(); await h.waitForTimeout(500)
  await h.locator(`${P} [data-cal-pop-bin]`).click(); await h.waitForTimeout(900)
  check('the bin takes it to the Bin and shuts the card', !(await v('events', at(0, 0), at(8, 0))).some((one) => one.key === plan.key) && await h.locator(P).count() === 0)
  await h.keyboard.press('Meta+z'); await h.waitForTimeout(900)
  check('⌘Z brings it back', (await v('events', at(0, 0), at(8, 0))).some((one) => one.title === 'Plan Next Week'))
  // ↵ on a focused block opens the card; ⌫ in the card bins it.
  await blk.focus(); await h.keyboard.press('Enter'); await h.waitForTimeout(500)
  check('↵ on a block opens its card', await h.locator(P).count() === 1)
  await h.keyboard.press('Backspace'); await h.waitForTimeout(900)
  check('⌫ in the card bins it', !(await v('events', at(0, 0), at(8, 0))).some((one) => one.title === 'Plan Next Week'))
  await h.keyboard.press('Meta+z'); await h.waitForTimeout(900)
  // A block dragged still moves (no card on a drag), lifted over a dashed outline where it lands.
  const sprint = h.locator('[data-cal-event]', { hasText: 'Sprint Planning' })
  await sprint.scrollIntoViewIfNeeded()
  const sb = await sprint.boundingBox()
  await h.mouse.move(sb.x + 20, sb.y + 10); await h.mouse.down()
  await h.mouse.move(sb.x + 20, sb.y + 30, { steps: 4 }); await h.mouse.move(sb.x + 20, sb.y + 10 + 56, { steps: 6 })
  const ghost = h.locator('[data-cal-ghost]')
  check('a block being dragged lifts over a dashed outline at its slot', await ghost.count() === 1 && (await ghost.evaluate((el) => getComputedStyle(el).outlineStyle)) === 'dashed')
  await shot('drag-light-1600')
  await h.mouse.up(); await h.waitForTimeout(900)
  const moved = (await v('events', at(0, 0), at(8, 0))).find((one) => one.title === 'Sprint Planning')
  check('dragging a block still moves it, with no card', new Date(moved.start).getHours() === 10 && await h.locator(P).count() === 0, moved.start)
  await h.keyboard.press('Meta+z'); await h.waitForTimeout(800)

  // 7. Notion's blocks: a coloured left edge; called off and done struck through in a dashed outline.
  await h.keyboard.press('t'); await h.waitForTimeout(500)
  const edge = await h.locator(`[data-cal-event="${plan.key}"]`).evaluate((el) => [getComputedStyle(el).borderLeftWidth, getComputedStyle(el).borderLeftStyle]).catch(() => [])
  const offOne = h.locator('[data-cal-event]', { hasText: 'Vendor call' })
  check('an event has a 3px coloured left edge', edge[0] === '3px' && edge[1] === 'solid', edge.join(' '))
  check('a called-off event is struck through in a dashed outline', (await offOne.evaluate((el) => [getComputedStyle(el).textDecorationLine, getComputedStyle(el).outlineStyle].join(' '))) === 'line-through dashed')
  await h.locator(`[data-cal-head="${key(new Date(at(3, 12)))}"]`).click(); await h.waitForTimeout(600)
  const line = await offOne.evaluate((el) => { const spans = [...el.querySelectorAll('span')].filter((one) => one.getBoundingClientRect().width > 0 && !one.children.length); return { ok: spans.length >= 2 && Math.abs(spans[0].getBoundingClientRect().top - spans[1].getBoundingClientRect().top) < 6 && spans[1].textContent === '16:00', said: `${el.offsetWidth} ${spans.map((one) => one.textContent).join('|')}` } })
  check('a short one has its name and time on one line', line.ok, line.said)
  await h.keyboard.press('w'); await h.waitForTimeout(500)
  const doneBlock = h.locator(`[data-cal-block="${doneTask}"]`)
  check('a done task stays, struck through, dashed', await doneBlock.count() === 1 && (await doneBlock.evaluate((el) => getComputedStyle(el).borderTopStyle)) === 'dashed' && (await doneBlock.locator('.line-through').count()) === 1)
  // The all-day lane: a three-day event across its days; it folds.
  const offsite = h.locator('[data-cal-event-chip]', { hasText: 'Offsite' })
  const wb = await h.locator(`[data-cal-head="${key(new Date(at(2, 12)))}"]`).boundingBox()
  const ob = await offsite.boundingBox()
  check('a three-day event spans its three days in the all-day lane', await offsite.count() === 1 && ob.width > wb.width * 2.6, `${ob.width} vs ${wb.width}`)
  const lane = h.locator('[data-cal-allday-lane] > div').nth(1)
  const tall = (await lane.boundingBox()).height
  await h.locator('[data-cal-allday-fold]').click(); await h.waitForTimeout(400)
  const low = (await lane.boundingBox()).height
  check('the chevron folds the lane to one line', low <= 36 && tall > low, `${tall} → ${low} ${await h.locator('[data-cal-allday-lane]').getAttribute('data-folded')}`)
  await h.locator('[data-cal-allday-fold]').click(); await h.waitForTimeout(400)
  // A task's tick marks it done, tinted by priority.
  const slides = h.locator(`[data-cal-block="${task}"] [data-cal-tick]`)
  check('a task\'s round tick is tinted by its priority (red for first)', (await slides.evaluate((el) => getComputedStyle(el).borderTopColor)) !== (await h.locator(`[data-cal-block="${doneTask}"] [data-cal-tick]`).evaluate((el) => getComputedStyle(el).borderTopColor)))
  await slides.click(); await h.waitForTimeout(900)
  check('clicking the tick marks it done', (await v('tasks')).find((one) => one.id === task)?.status === 'done')
  await h.keyboard.press('Meta+z'); await h.waitForTimeout(900)
  // Right-click: swatches, Block on calendar, Cut, Copy, Duplicate, Delete.
  const review = h.locator('[data-cal-event]', { hasText: 'Project Review' })
  await review.click({ button: 'right' }); await h.waitForTimeout(400)
  const menu = h.locator('[role="menu"]')
  const said = await menu.innerText()
  check('right-click has the swatches, "Block on calendar", Cut, Copy, Duplicate and a red Delete', await menu.locator('[role="menuitemradio"]').count() === 7 && ['Block on calendar', 'Cut', 'Copy', 'Duplicate', 'Delete'].every((one) => said.includes(one)), said)
  await menu.locator('[role="menuitemradio"][aria-label="green"]').click(); await h.waitForTimeout(900)
  const reviewed = (await v('events', at(0, 0), at(8, 0))).find((one) => one.title === 'Project Review')
  check('a swatch recolours that event alone', reviewed?.ink === 'green' && (await review.getAttribute('style')).includes('green'), reviewed?.ink)
  await h.keyboard.press('Meta+z'); await h.waitForTimeout(900)
  // ⌘D duplicates; ⌘C then ⌘V where the pointer is pastes a copy.
  const count = async (title) => (await v('events', at(0, 0), at(8, 0))).filter((one) => one.title === title).length
  await review.click(); await h.keyboard.press('Escape'); await review.focus()
  await h.keyboard.press('Meta+d'); await h.waitForTimeout(900)
  check('⌘D duplicates the picked event', await count('Project Review') === 2)
  await h.keyboard.press('Meta+z'); await h.waitForTimeout(900)
  await review.focus(); await h.keyboard.press('Meta+c'); await h.waitForTimeout(300)
  const col = await h.locator(`[data-cal-col="${key(new Date(at(0, 12)))}"]`).boundingBox()
  const scrollTop = await h.locator('[data-cal-scroll]').evaluate((el) => el.getBoundingClientRect().top)
  await h.mouse.move(col.x + 10, Math.max(scrollTop + 20, col.y + 16 * 56 + 5)); await h.waitForTimeout(200)
  await h.keyboard.press('Meta+v'); await h.waitForTimeout(900)
  const copies = (await v('events', at(0, 0), at(8, 0))).filter((one) => one.title === 'Project Review')
  check('⌘C then ⌘V pastes a copy where the pointer is, as long as it was', copies.length === 2 && copies.some((one) => key(new Date(one.start)) === key(new Date(at(0, 12)))) && copies.every((one) => new Date(one.end) - new Date(one.start) === 3600000), copies.map((one) => one.start).join(' '))
  await h.keyboard.press('Meta+z'); await h.waitForTimeout(900)
  // The eye on a calendar hides it; the name goes grey.
  await h.locator(`[data-cal-layer="${social}"]`).hover()
  await h.locator(`[data-cal-layer="${social}"] [data-cal-layer-eye]`).click(); await h.waitForTimeout(700)
  check('the eye on a calendar hides it', await h.locator('[data-cal-event]', { hasText: 'Quick Catch-up' }).count() === 0 && (await h.locator(`[data-cal-layer="${social}"] [role="checkbox"]`).getAttribute('aria-checked')) === 'false')
  await shot('hidden-light-1600')
  await h.locator(`[data-cal-layer="${social}"] [data-cal-layer-eye]`).click(); await h.waitForTimeout(700)
  // "October 2026 ⌄" and . go to any date.
  await h.locator('[data-cal-jump]').click(); await h.waitForTimeout(400)
  check('"October 2026 ⌄" opens a small month to go to a date', await h.locator('[data-cal-jump-month] [data-cal-mini]').count() === 1)
  const far = new Date(today); far.setDate(far.getDate() + 21)
  await h.locator('[data-cal-jump-month] [data-cal-mini] button[aria-label="The month after"]').click().catch(() => {})
  await h.locator(`[data-cal-jump-month] [data-cal-mini-day="${key(far)}"]`).click().catch(() => {}); await h.waitForTimeout(500)
  check('  a day picked there goes there', await h.locator(`[data-cal-head="${key(far)}"]`).count() === 1)
  await h.keyboard.press('t'); await h.waitForTimeout(400)
  await h.keyboard.press('.'); await h.waitForTimeout(400)
  check('. opens it too', await h.locator('[data-cal-jump-month]').count() === 1)
  await h.keyboard.press('Escape'); await h.waitForTimeout(300)
  // Plan hides the side panels.
  await h.locator('[data-cal-side-toggle]').click(); await h.waitForTimeout(400)
  // With the right panel folded for room, "Plan" first brings it back, then hides both.
  if (await h.locator('[data-cal-right]').count()) { await h.locator('[data-cal-side-toggle]').click(); await h.waitForTimeout(400) }
  check('Plan hides the side panels', await h.locator('[data-cal-side], [data-cal-right]').count() === 0)
  await h.locator('[data-cal-side-toggle]').click(); await h.waitForTimeout(400)
  // Shots of the new parts in each theme.
  for (const theme of ['paper', 'dark', 'light']) {
    await c.theme(theme); await go('calendar'); await h.waitForTimeout(900)
    await h.keyboard.press('w'); await h.keyboard.press('t'); await h.waitForTimeout(600)
    await h.locator('[data-cal-scroll]').evaluate((el) => (el.scrollTop = 8 * 56)); await h.waitForTimeout(300)
    await h.locator('[data-cal-event]', { hasText: 'Project Review' }).click({ button: 'right' }); await h.waitForTimeout(500)
    await shot(`menu-${theme}-1600`)
    await h.keyboard.press('Escape'); await h.waitForTimeout(300)
    await h.locator('[data-cal-event]', { hasText: 'Project Review' }).dblclick(); await h.waitForTimeout(900)
    await shot(`editor-${theme}-1600`)
    if (theme === 'light') check('the editor says when as "11:00 → 12:00 1 h", the day and the zone', /11:00\s*→\s*12:00\s*1 h/.test(await h.locator('[data-event-when]').innerText()), await h.locator('[data-event-when]').innerText())
    await h.keyboard.press('Escape'); await h.waitForTimeout(400)
  }

  const errors = c.errors.filter((one) => !/ResizeObserver|Autofocus/.test(one))
  check('no errors on the page', errors.length === 0, errors.join(' | '))
} catch (error) {
  console.log('FAIL  the run stopped:', error.message)
  results.push(false)
} finally {
  await c.close()
}
const passed = results.filter(Boolean).length
console.log(`${passed}/${results.length} passed`)
process.exit(passed === results.length ? 0 : 1)
