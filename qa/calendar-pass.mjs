// The Calendar's look, for the eye: Day, Week, Month and "New event", in light
// and dark, at 1440 and at the narrowest window (560), with 5, 50 or 500
// events (COUNT). Checks that nothing scrolls sideways, that timed tasks show
// their names at their time, that the side panels' lists are islands (icon,
// name, count, fold), that the late count is its own pill, and that the long
// instruction paragraphs are gone.
//
//   npx electron-vite build --outDir out-cal
//   QA_ARGS=--sandbox QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-cal/main/index.js HALIGTREE_QA_AWAY=1 SHOTS=dir COUNT=50 node qa/calendar-pass.mjs
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const shots = process.env.SHOTS
const count = Number(process.env.COUNT ?? 5)
const c = await sandbox({ width: 1440, height: 900, at: '11:30' })
const { h, v, go, size, look } = c
const results = []
const check = (name, ok, detail = '') => (results.push(!!ok), console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`))
const at = (by, hour, minute = 0) => { const d = c.now(); d.setHours(hour, minute, 0, 0); d.setDate(d.getDate() + by); return d }
try {
  await v('settings:set', { hintRate: 0, homeCalendar: true })
  // Timed tasks: a short one (15 min), an hour, one done; a late one; a few with no day.
  const timed = [['Call the bank', 0, 9, 15], ['Read chapter 4', 0, 13, 60], ['Gym', 1, 7, 30], ['Draft essay intro', -1, 15, 45]]
  for (const [title, by, hour, est] of timed) await v('task:save', (await v('task:add', title)).id, { due: at(by, hour).toISOString(), allDay: 0, estimate: est })
  await v('task:save', (await v('task:add', 'Return library books')).id, { due: at(-3, 10).toISOString(), allDay: 1 })
  for (const title of ['Plan the trip', 'Sort photos', 'Email Sam back']) await v('task:add', title)
  // Events spread over the month, a few each day, some long names.
  const names = ['Team sync', 'Lunch with Sam', 'Dentist', 'Lecture: Organic Chemistry II, room 4.12', 'Run', 'Book club']
  for (let n = 0; n < count; n++) {
    // One event per slot until the month is full (30 days x 10 hours), then a second in the same slots: 500 crowds on purpose.
    const by = (n % 30) - 12
    const hour = 8 + ((Math.floor(n / 30) * 3 + n) % 10)
    const start = at(by, hour, Math.floor(n / 300) ? 30 : 0)
    await v('event:add', { title: names[n % names.length], start: start.toISOString(), end: new Date(start.getTime() + 3600000).toISOString(), calendarId: 'personal' })
  }
  await go('calendar'); await h.waitForTimeout(1500)

  const wide = async () => h.evaluate(() => {
    const page = document.querySelector('[data-cal-mode]')?.closest('section') ?? document.body
    return { over: page.scrollWidth - page.clientWidth, doc: document.documentElement.scrollWidth - document.documentElement.clientWidth }
  })
  for (const [w, label] of [[1440, '1440'], [560, '560']]) {
    await size(w, 900); await h.waitForTimeout(600)
    for (const [k, mode] of [['d', 'day'], ['w', 'week'], ['m', 'month']]) {
      await h.keyboard.press('Escape'); await h.keyboard.press(k); await h.waitForTimeout(700)
      const o = await wide()
      check(`${label}: ${mode} has no sideways scroll`, o.over <= 1 && o.doc <= 1, JSON.stringify(o))
      if (mode !== 'month') {
        // Every timed task in view says its name at its time, readable (not cut to nothing).
        const names = await h.$$eval('[data-cal-block]', (els) => els.map((el) => {
          const name = el.querySelector('[data-cal-block-name]')
          const box = name?.getBoundingClientRect()
          return { text: name?.textContent ?? '', width: box?.width ?? 0, height: el.getBoundingClientRect().height }
        }))
        // A crowded hour never becomes a barcode: past a few side by side, "+N" opens the day.
        const thin = await h.$$eval('[data-cal-event], [data-cal-block], [data-cal-capture]', (els) => els.filter((el) => el.getBoundingClientRect().width < 14).length)
        check(`${label}: ${mode} draws no sliver too thin to read`, thin === 0, `${thin} under 14px, ${await h.locator('[data-cal-crowd-more]').count()} "+N"`)
        const covered = await h.$$eval('[data-cal-crowd-more]', (chips) => chips.filter((chip) => {
          const c = chip.getBoundingClientRect()
          return [...chip.parentElement.querySelectorAll('[data-cal-event], [data-cal-block]')].some((el) => { const b = el.getBoundingClientRect(); return c.left < b.right - 1 && c.right > b.left + 1 && c.top < b.bottom - 1 && c.bottom > b.top + 1 })
        }).length)
        check(`${label}: ${mode}: no "+N" lies over a block's name`, covered === 0, `${covered} over`)
        check(`${label}: ${mode}'s timed tasks show their names`, names.length > 0 && names.every((one) => one.text.length > 0 && one.width >= 24 && one.height >= 18), JSON.stringify(names.slice(0, 4)))
      }
      if (shots) for (const name of ['light', 'dark']) { await look(name); await h.waitForTimeout(250); await h.screenshot({ path: `${shots}/cal-${count}-${label}-${mode}-${name}.png` }) }
      await look('light')
    }
  }
  await size(1440, 900); await h.keyboard.press('w'); await h.waitForTimeout(600)
  // At 1440 the header is one line: "New event" sits level with the title, not on a line of its own.
  const [title, add] = await Promise.all(['[data-cal-jump]', '[data-cal-new-event]'].map((sel) => h.locator(sel).boundingBox()))
  check('1440: the header is one line', Math.abs(title.y - add.y) < 24, `${title.y} ${add.y}`)
  // Captures, when shown, are pills with their words at their minute.
  const caps = await h.$$eval('[data-cal-capture]', (els) => els.map((el) => ({ text: el.querySelector('[data-cal-capture-name]')?.textContent ?? '', width: el.getBoundingClientRect().width })))
  check('captures show their words, not a dot', caps.every((one) => one.text.length > 0 && one.width >= 24), JSON.stringify(caps.slice(0, 3)))
  if (!(await h.locator('[data-cal-right]').count())) { await h.locator('[data-cal-side-toggle]').click(); await h.waitForTimeout(600) }
  if (shots) for (const name of ['light', 'dark']) { await look(name); await h.waitForTimeout(250); await h.screenshot({ path: `${shots}/cal-${count}-1440-week-upcoming-${name}.png` }) }
  // Each event once: Upcoming never lists the same name at the same time twice (the seed makes no twins).
  const rows = await h.$$eval('[data-cal-upcoming-day]', (days) => days.flatMap((day) => [...day.querySelectorAll('[data-cal-upcoming-row]')].map((row) => `${day.getAttribute('data-cal-upcoming-day')} ${row.textContent}`)))
  const twins = rows.filter((one, at) => rows.indexOf(one) !== at)
  check('Upcoming lists each event once', twins.length === 0, `${rows.length} rows, twins: ${twins.slice(0, 2).join(' | ')}`)
  // The next meeting's colour is a dot, never a bar down the card's side.
  check('the next meeting card has no side bar', await h.locator('[data-cal-next-up] span[aria-hidden]').evaluateAll((els) => els.every((el) => el.getBoundingClientRect().height <= 10)))
  await look('light')
  // The side panels' lists are islands.
  const heads = await h.$$eval('[data-island-head]', (els) => els.map((el) => el.getAttribute('data-island-head')))
  check('the left panel\'s lists are islands', heads.includes('My calendars') && heads.includes('Unscheduled'), heads.join(', '))
  check('the right panel\'s Upcoming is an island', heads.includes('Upcoming'), heads.join(', '))
  check('no instruction paragraphs left', (await h.locator('text=/Tick one to show|The same tasks as in Tasks|Then the place, people/').count()) === 0)
  check('"Useful shortcuts" is gone from the rail', (await h.locator('[data-cal-shortcuts]').count()) === 0)
  const late = await h.locator('[data-late-all]').first()
  const lateBox = await late.boundingBox().catch(() => null)
  // Quiet but never grey: the page's own ink, the size of the controls, and an orange dot that says late (no box: the
  // user found a boxed pill beside the title wrong, 9 Nov).
  const lateLook = lateBox ? await late.evaluate((el) => ({ size: getComputedStyle(el).fontSize, ink: getComputedStyle(el).color, body: getComputedStyle(document.body).color, dot: !!el.querySelector('.rounded-full') })) : null
  check('"1 late" reads in the page\'s ink with its dot, not grey text', !!lateBox && lateLook.dot && lateLook.ink === lateLook.body && parseFloat(lateLook.size) >= 13, JSON.stringify(lateLook))
  // New event, light and dark, both widths.
  for (const [w, label] of [[1440, '1440'], [560, '560']]) {
    await size(w, 900); await h.waitForTimeout(400)
    await h.locator('[data-cal-new-event]').click(); await h.waitForTimeout(700)
    check(`${label}: "New event" opens its words field`, (await h.locator('[data-new-event-words]').count()) === 1)
    const o = await wide()
    check(`${label}: "New event" has no sideways scroll`, o.over <= 1 && o.doc <= 1, JSON.stringify(o))
    if (shots) for (const name of ['light', 'dark']) { await look(name); await h.waitForTimeout(250); await h.screenshot({ path: `${shots}/cal-${count}-${label}-new-${name}.png` }) }
    await look('light')
    await h.keyboard.press('Escape'); await h.waitForTimeout(400)
  }
  // 1. The right sidebar (Upcoming, and New event or an opened event or task in its place) floats over the days on the
  // shared frost, full height on the right, inset as the app's other floating panels; it slides in and out from the
  // right and the grid never moves.
  await size(1440, 900); await h.keyboard.press('w'); await h.waitForTimeout(600)
  const gridBox = () => h.locator('[data-cal-grid]').boundingBox()
  const toggle = h.locator('[data-cal-side-toggle]')
  if (await h.locator('[data-cal-right]').count()) { await toggle.click(); await h.waitForTimeout(600) }
  const before = await gridBox()
  // Filmed in the page every frame: the sidebar's left edge, its opacity, and the grid's box.
  const film = () => h.evaluate(() => { window.__film = []; const t0 = performance.now(); const tick = () => { const el = document.querySelector('[data-cal-right]'); const g = document.querySelector('[data-cal-grid]')?.getBoundingClientRect(); window.__film.push({ t: Math.round(performance.now() - t0), left: el ? Math.round(el.getBoundingClientRect().left) : null, opacity: el ? getComputedStyle(el).opacity : null, grid: g ? `${g.x},${g.width}` : '' }); if (performance.now() - t0 < 700) requestAnimationFrame(tick) }; requestAnimationFrame(tick) })
  const reel = () => h.evaluate(() => window.__film)
  const slid = (frames, way) => {
    const seen = frames.filter((one) => one.left !== null)
    const lefts = seen.map((one) => one.left)
    const steady = lefts.every((x, n) => n === 0 || (way === 'in' ? x <= lefts[n - 1] : x >= lefts[n - 1]))
    // How long it took: in, until it first rests where it ends; out, until it is gone.
    const ms = seen.length ? (way === 'in' ? seen.find((one) => one.left === lefts.at(-1)).t : seen.at(-1).t) - seen[0].t : 0
    return { ok: seen.length >= 3 && steady && new Set(lefts).size >= 3 && seen.every((one) => one.opacity === '1'), lefts: lefts.filter((x, n) => n === 0 || x !== lefts[n - 1]).slice(0, 8), ms }
  }
  const gridStill = (frames) => frames.every((one) => one.grid === `${before.x},${before.width}`)
  await film(); await toggle.click(); await h.waitForTimeout(750)
  const upIn = await reel()
  check('1: ⊟ slides Upcoming in from the right, never a fade', slid(upIn, 'in').ok, JSON.stringify(slid(upIn, 'in')))
  check('1: the grid keeps its place and width under Upcoming, every frame', gridStill(upIn) && JSON.stringify(await gridBox()) === JSON.stringify(before), `${upIn.length} frames`)
  const sidebar = () => h.locator('[data-cal-right]').evaluate((el) => {
    const css = getComputedStyle(el); const box = el.getBoundingClientRect(); const row = el.parentElement.getBoundingClientRect()
    return { holds: el.getAttribute('data-cal-right-holds'), frost: el.classList.contains('mf-frost'), position: css.position, shadow: css.boxShadow !== 'none', radius: css.borderTopLeftRadius,
      right: Math.round(row.right - box.right), top: Math.round(box.top - row.top), bottom: Math.round(row.bottom - box.bottom), opacity: css.opacity }
  })
  // 0.75rem in from the row's right, top and bottom (a little more at a larger app size, and the row's top line), as the map's and queue's panels.
  const near = (gap) => gap >= 10 && gap <= 17
  const onEdge = (one) => one.frost && one.position === 'absolute' && one.shadow && near(one.right) && near(one.top) && near(one.bottom) && one.opacity === '1'
  const up = await sidebar()
  check('1: Upcoming is a full-height sidebar on the right edge, on the frost', up.holds === 'upcoming' && onEdge(up), JSON.stringify(up))
  // New event: in Upcoming's place, in the same sidebar; the grid under it unmoved.
  await h.locator('[data-cal-new-event]').click(); await h.waitForTimeout(600)
  const ed = await sidebar()
  check('1: "New event" opens in the same sidebar, in Upcoming\'s place', ed.holds === 'editor' && onEdge(ed) && (await h.locator('[data-cal-right]').count()) === 1 && (await h.locator('[data-new-event-words]').count()) === 1, JSON.stringify(ed))
  check('1: no small card by the slot: the sidebar is as tall as the days', await h.locator('[data-day-side]').evaluate((el) => el.getBoundingClientRect().height >= el.parentElement.getBoundingClientRect().height - 32))
  check('1: the dashed "New event" slot stays in the grid', (await h.locator('[data-cal-draft]').count()) === 1)
  check('1: the grid keeps its width with it open', JSON.stringify(await gridBox()) === JSON.stringify(before))
  await h.keyboard.press('Escape'); await h.waitForTimeout(500)
  check('1: Esc closes it, and Upcoming is back', (await h.locator('[data-day-side]').count()) === 0 && (await sidebar()).holds === 'upcoming')
  // Upcoming off: New event slides in alone, and out to the right.
  await film(); await toggle.click(); await h.waitForTimeout(750)
  const upOut = await reel()
  check('1: ⊟ again slides Upcoming out to the right', slid(upOut, 'out').ok && (await h.locator('[data-cal-right]').count()) === 0, JSON.stringify(slid(upOut, 'out')))
  await film(); await h.locator('[data-cal-new-event]').click(); await h.waitForTimeout(750)
  const evIn = await reel()
  check('1: "New event" slides in from the right on the frost', slid(evIn, 'in').ok && onEdge(await sidebar()), JSON.stringify(slid(evIn, 'in')))
  check('1: the grid never moves as it slides in', gridStill(evIn), `${evIn.length} frames`)
  await film(); await h.keyboard.press('Escape'); await h.waitForTimeout(750)
  const evOut = await reel()
  const outSaid = slid(evOut, 'out')
  check('1: Esc slides it out to the right, faster than it came in', outSaid.ok && (await h.locator('[data-day-side]').count()) === 0 && outSaid.ms < slid(evIn, 'in').ms, `out ${JSON.stringify(outSaid)}`)
  check('1: the grid is still where it was', JSON.stringify(await gridBox()) === JSON.stringify(before))
  // N opens it too; ⌘↵ keeps the words and closes it.
  await h.mouse.click(5, 450); await h.keyboard.press('n'); await h.waitForTimeout(600)
  check('1: N opens "New event"', (await h.locator('[data-new-event-words]').count()) === 1)
  await h.keyboard.type('Tea with Ana'); await h.keyboard.press('Meta+Enter'); await h.waitForTimeout(700)
  check('1: ⌘↵ makes it and closes', (await h.locator('[data-day-side]').count()) === 0 && (await h.locator('[data-cal-event]', { hasText: 'Tea with Ana' }).count()) === 1)
  // A drag across an hour: an event in the sidebar; a click away keeps the words.
  const col = h.locator('[data-cal-col]').nth(2); const cb = await col.boundingBox()
  const y0 = Math.max(cb.y, (await gridBox()).y) + 300
  await h.mouse.move(cb.x + cb.width / 2, y0); await h.mouse.down(); await h.mouse.move(cb.x + cb.width / 2, y0 + 50, { steps: 5 }); await h.mouse.up(); await h.waitForTimeout(600)
  check('1: a drag on the grid opens "New event" in the sidebar', (await h.locator('[data-new-event-words]').count()) === 1 && (await sidebar()).holds === 'editor')
  check('1: the grid keeps its width with it open', JSON.stringify(await gridBox()) === JSON.stringify(before))
  await h.keyboard.type('Walk the dog'); await h.locator('[data-cal-subtitle]').click(); await h.waitForTimeout(700)
  check('1: a click away keeps the words and closes it', (await h.locator('[data-cal-event]', { hasText: 'Walk the dog' }).count()) === 1 && (await h.locator('[data-day-side]').count()) === 0, `${await h.locator('[data-day-side]').count()} panels`)
  await h.keyboard.press('Escape'); await h.waitForTimeout(400)
  // A double-click on an hour: an event, not a task.
  await h.mouse.dblclick(cb.x + cb.width / 2, y0 + 120); await h.waitForTimeout(600)
  check('1: a double-click opens "New event"', (await h.locator('[data-new-event-words]').count()) === 1, await h.locator('[data-day-side]').getAttribute('aria-label').catch(() => 'none'))
  await h.keyboard.press('Escape'); await h.waitForTimeout(400)
  // An event opened (a double-click): in the sidebar.
  await h.locator('[data-cal-event]', { hasText: 'Tea with Ana' }).first().dblclick(); await h.waitForTimeout(700)
  check('1: an event opened shows in the sidebar', (await h.locator('[data-day-side]').getAttribute('data-day-side')) === 'event' && onEdge(await sidebar()))
  check('1: the grid keeps its width with an event open', JSON.stringify(await gridBox()) === JSON.stringify(before))
  await h.keyboard.press('Escape'); await h.waitForTimeout(400); await h.keyboard.press('Escape'); await h.waitForTimeout(300)
  await h.locator('[data-cal-new-event]').click(); await h.waitForTimeout(600)
  await h.locator('[data-day-side-close]').click(); await h.waitForTimeout(450)
  check('1: × closes it', (await h.locator('[data-day-side]').count()) === 0)
  // A small, short window in Day view: the form is whole inside the full-height sidebar, nothing to scroll the page for.
  await size(560, 500); await h.keyboard.press('d'); await h.waitForTimeout(600)
  await h.locator('[data-cal-new-event]').click(); await h.waitForTimeout(700)
  const whole = await h.evaluate(() => {
    const p = document.querySelector('[data-day-side]').getBoundingClientRect(); const f = document.querySelector('[data-new-event-words]').getBoundingClientRect()
    return { panel: [Math.round(p.top), Math.round(p.bottom)], field: [Math.round(f.top), Math.round(f.bottom)], window: innerHeight, doc: document.scrollingElement.scrollTop }
  })
  check('1: 560x500 Day: New event is whole in the sidebar, not cut off', whole.panel[1] <= whole.window - 8 && whole.field[0] >= whole.panel[0] && whole.field[1] <= whole.panel[1] && whole.doc === 0 && onEdge(await sidebar()), JSON.stringify(whole))
  await h.keyboard.press('Escape'); await h.waitForTimeout(400)
  await size(1440, 900); await h.keyboard.press('w'); await h.waitForTimeout(500)

  // 2 and 3. The Task tab: one quiet line, and the day being looked at (today), as the Event tab says.
  const todaySaid = await h.evaluate(() => new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' }))
  const tabsSay = async () => {
    const event = await h.locator('[data-new-event-said]').innerText().catch(() => '')
    await h.locator('[data-day-side-kind="task"]').click(); await h.waitForTimeout(300)
    const task = await h.locator('[data-day-side-when]').innerText().catch(() => '')
    return { event, task }
  }
  for (const [way, open] of [
    ['"+ New event" in a week', async () => { await h.keyboard.press('w'); await h.waitForTimeout(400); await h.locator('[data-cal-new-event]').click() }],
    ['"+ New event" after a week on and back', async () => { await h.keyboard.press('ArrowRight'); await h.waitForTimeout(300); await h.keyboard.press('t'); await h.waitForTimeout(400); await h.locator('[data-cal-new-event]').click() }],
    ['"+ New event" in a day', async () => { await h.keyboard.press('d'); await h.waitForTimeout(400); await h.locator('[data-cal-new-event]').click() }],
    ['"+ New event" in a month', async () => { await h.keyboard.press('m'); await h.waitForTimeout(500); await h.locator('[data-cal-new-event]').click() }]
  ]) {
    await open(); await h.waitForTimeout(600)
    const said = await tabsSay()
    check(`3: ${way}: both tabs are for today (${todaySaid})`, said.event.length > 0 && said.task.includes(todaySaid), JSON.stringify(said))
    await h.keyboard.press('Escape'); await h.waitForTimeout(400)
  }
  await h.keyboard.press('w'); await h.waitForTimeout(400)
  // A day clicked (its all-day line): that day, on both tabs.
  const other = await h.locator('[data-cal-allday]').nth(1).getAttribute('data-cal-allday')
  await h.locator('[data-cal-allday]').nth(1).click(); await h.waitForTimeout(600)
  const otherSaid = await h.evaluate((key) => new Date(`${key}T12:00`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' }), other)
  check(`3: a day clicked is that day (${otherSaid})`, (await h.locator('[data-day-side-when]').innerText()).includes(otherSaid))
  check('2: the Task tab has one quiet line, no paragraph', (await h.locator('text=/Then the notes, steps/').count()) === 0 && (await h.locator('[data-day-side-hint]').evaluate((el) => el.getBoundingClientRect().height)) < 24)
  await h.keyboard.press('Escape'); await h.waitForTimeout(400)
  // ⌘K's "New task: …" is for the same day.
  await h.keyboard.press('Meta+k'); await h.waitForTimeout(500); await h.keyboard.type('new task buy stamps'); await h.waitForTimeout(500)
  const dayWord = await h.evaluate(() => new Date().toLocaleDateString('en-GB', { weekday: 'long' }))
  const kHint = await h.locator('text=/unless it names a day/').first().innerText().catch(() => '')
  check('3: ⌘K "New task" is for today too', /today/i.test(kHint) || kHint.includes(dayWord), kHint)
  await h.keyboard.press('Escape'); await h.waitForTimeout(400)

  // 4. Narrow: three days from today that say their names, "+N" beside a name, never on it, and the placeholders whole.
  await size(560, 900); await h.keyboard.press('w'); await h.waitForTimeout(700)
  // Narrow, the late pill waits on the subtitle's line (9 Nov: the bar stays one row), so the words are read after it.
  const narrowSaid = (await h.locator('[data-cal-subtitle]').innerText()).replace(/^\d+ late\s*/, '')
  check('4: 560: the week shows three days, and says so', (await h.locator('[data-cal-mode]').getAttribute('data-cal-days')) === '3' && narrowSaid.startsWith('3 days'), narrowSaid)
  const blocks = await h.$$eval('[data-cal-event], [data-cal-block]', (els) => els.map((el) => el.getBoundingClientRect().width))
  check('4: 560: every block is wide enough for words', blocks.length > 0 && blocks.every((w) => w >= 40), `${blocks.length} blocks, narrowest ${Math.round(Math.min(...blocks))}px`)
  const covered = await h.$$eval('[data-cal-crowd-more]', (chips) => chips.filter((chip) => {
    const c = chip.getBoundingClientRect()
    return [...chip.parentElement.querySelectorAll('[data-cal-event], [data-cal-block]')].some((el) => { const b = el.getBoundingClientRect(); return c.left < b.right - 1 && c.right > b.left + 1 && c.top < b.bottom - 1 && c.bottom > b.top + 1 })
  }).length)
  check('4: 560: no "+N" lies over a block', covered === 0, `${covered} over`)
  await size(1440, 900); await h.waitForTimeout(500)
  check('4: 1440: the whole week again', (await h.locator('[data-cal-mode]').getAttribute('data-cal-days')) === '7')
  await size(560, 900); await h.waitForTimeout(500)
  await h.locator('[data-cal-new-event]').click(); await h.waitForTimeout(700)
  const fitsIn = (sel) => h.locator(sel).evaluate((el) => {
    const css = getComputedStyle(el); const pen = document.createElement('canvas').getContext('2d'); pen.font = `${css.fontSize} ${css.fontFamily}`
    return { text: Math.ceil(pen.measureText(el.placeholder).width), room: el.clientWidth - parseFloat(css.paddingLeft) - parseFloat(css.paddingRight) }
  })
  const evFit = await fitsIn('[data-new-event-words]')
  check('4: 560: the New event placeholder fits whole', evFit.text <= evFit.room, JSON.stringify(evFit))
  await h.locator('[data-day-side-kind="task"]').click(); await h.waitForTimeout(300)
  const taskFit = await fitsIn('[data-day-side-draft] input')
  check('4: 560: the New task placeholder fits whole', taskFit.text <= taskFit.room, JSON.stringify(taskFit))
  await h.keyboard.press('Escape'); await h.waitForTimeout(400)

  // The film for the eye: the panel opening and closing, a frame every 50ms, light and dark, 1440 and 560.
  if (process.env.FILM) for (const [w, label] of [[1440, '1440'], [560, '560']]) {
    await size(w, 900); await h.waitForTimeout(400)
    for (const name of ['light', 'dark']) {
      await look(name); await h.waitForTimeout(1500)
      let n = 0
      const grab = async (ms) => { const end = Date.now() + ms; while (Date.now() < end) { await h.screenshot({ path: `${process.env.FILM}/panel-${label}-${name}-${String(n++).padStart(2, '0')}.png` }); await h.waitForTimeout(50) } }
      await h.locator('[data-cal-new-event]').click(); await grab(450)
      await h.keyboard.press('Escape'); await grab(400)
      // The ⊟ switch: Upcoming slides in, and out again.
      await h.locator('[data-cal-side-toggle]').click(); await grab(450)
      await h.locator('[data-cal-side-toggle]').click(); await grab(400)
    }
    await look('light')
  }
  if (shots) {
    // The siblings, for the eye: Inbox and Tasks at the same size.
    await size(1440, 900)
    for (const id of ['inbox', 'today']) { await go(id); await h.waitForTimeout(900); await h.screenshot({ path: `${shots}/sib-${id}-light.png` }) }
  }
  const errors = c.errors.filter((one) => !/favicon|ResizeObserver/.test(one))
  check('no page errors', errors.length === 0, errors.slice(0, 2).join(' | '))
} catch (error) {
  console.log('FAIL  threw', error.message.split('\n')[0])
  results.push(false)
} finally {
  console.log(`\n${results.filter(Boolean).length}/${results.length} passed`)
  await c.close()
  process.exit(results.every(Boolean) ? 0 : 1)
}
