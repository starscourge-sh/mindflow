// Calendar events beside tasks, driven on sandbox data: a slot dragged across
// is an event, its words made into one; a block stretched and moved, each
// undone with ⌘Z; a "last Friday of the month" series lands on the right days
// and "This one" changes one time while "All of them" changes every one;
// hiding a calendar hides its events, and the Tasks layer hides tasks; a
// reminder is scheduled from the database and shown as a notification (the
// Notification stubbed); the second time zone's column reads the right
// offset; "Notes for this" makes a note linked both ways; the words "lunch
// with Sam fri 1-2pm @Cafe" are read; ⌫, right-click, ⌘Z and the Bin.
//
//   npx electron-vite build --outDir out-events
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-events/main/index.js HALIGTREE_QA_AWAY=1 SHOTS=dir node qa/events.mjs
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const pad = (n) => String(n).padStart(2, '0')
const key = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const hm = (iso) => { const d = new Date(iso); return `${pad(d.getHours())}:${pad(d.getMinutes())}` }
// Your Mac's calendar, stood in: one event today on "Family".
const today = new Date(); today.setHours(0, 0, 0, 0)
const macStart = new Date(today); macStart.setHours(7, 0, 0, 0)
process.env.HALIGTREE_QA_CALENDAR = JSON.stringify([{ title: 'Mac breakfast', start: macStart.toISOString(), end: new Date(macStart.getTime() + 3600000).toISOString(), allDay: false, calendar: 'Family', color: '#2a9d8f' }])

const c = await sandbox({ width: 1400, height: 950 })
const { h, v, go } = c
const results = []
const check = (name, ok, detail = '') => (results.push(!!ok), console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${String(detail).slice(0, 300)})` : ''}`))
const shots = process.env.SHOTS
const shot = async (name) => shots && h.screenshot({ path: `${shots}/${name}.png` })
const S = '[data-day-side]'
const span = () => { const a = new Date(today); a.setDate(a.getDate() - 40); const b = new Date(today); b.setDate(b.getDate() + 400); return [a.toISOString(), b.toISOString()] }
const all = async () => v('events', ...span())
const byTitle = async (title) => (await all()).filter((one) => one.title === title)
const esc = async () => { await h.keyboard.press('Escape'); await h.waitForTimeout(500) }
// A day this week that is not today, so the sandbox's own tasks for today stay out of the way.
const other = new Date(today); other.setDate(other.getDate() + (today.getDay() === 1 ? 1 : -((today.getDay() + 6) % 7)))
const day = key(other)
try {
  await v('settings:set', { hintRate: 0, macCalendar: true })
  await go('calendar'); await h.waitForTimeout(1500)
  await h.keyboard.press('w'); await h.waitForTimeout(500)
  const col = h.locator(`[data-cal-col="${day}"]`)
  const scroller = h.locator('[data-cal-scroll]')
  await scroller.evaluate((el) => (el.scrollTop = 17 * 56))
  await h.waitForTimeout(300)
  const yAt = async (minute) => { const box = await col.boundingBox(); return box.y + (minute / 60) * 56 }
  const xMid = async () => { const box = await col.boundingBox(); return box.x + box.width / 2 }

  // 1. A slot dragged across is an event, made from its words.
  await h.mouse.move(await xMid(), await yAt(20 * 60 + 5)); await h.mouse.down()
  await h.mouse.move(await xMid(), await yAt(20 * 60 + 30), { steps: 4 }); await h.mouse.move(await xMid(), await yAt(21 * 60 - 5), { steps: 4 })
  await h.mouse.up(); await h.waitForTimeout(800)
  check('dragging across a slot opens the panel on "Event"', await h.locator(`${S}[data-day-side="new"] [data-day-side-kind="event"][aria-checked="true"]`).count() === 1)
  check('the slot is drawn as "New event"', (await col.innerText()).includes('New event'))
  await h.keyboard.type('Team sync')
  await shot('events-new-' + 'light')
  await h.keyboard.press('Enter'); await h.waitForTimeout(1200)
  let made = (await byTitle('Team sync'))[0]
  check('↵ makes the event for the slot dragged', made && hm(made.start) === '20:00' && hm(made.end) === '21:00' && key(new Date(made.start)) === day, made && `${made.start} ${made.end}`)
  check('the panel turns into the event', await h.locator(`${S}[data-day-side="event"] [data-event-detail]`).count() === 1)
  await esc()
  const block = h.locator(`[data-cal-event="${made.key}"]`)
  check('it is drawn as a solid block, not a task outline', await block.count() === 1 && (await block.evaluate((el) => getComputedStyle(el).backgroundColor)) !== (await h.locator('[data-cal-scroll]').evaluate((el) => getComputedStyle(document.body).backgroundColor)))

  // 2. Stretch it half an hour, ⌘Z; move it an hour, ⌘Z.
  let box = await block.boundingBox()
  await h.mouse.move(box.x + 20, box.y + box.height - 2); await h.mouse.down()
  await h.mouse.move(box.x + 20, box.y + box.height + 10, { steps: 3 }); await h.mouse.move(box.x + 20, box.y + box.height + 24, { steps: 4 })
  await h.mouse.up(); await h.waitForTimeout(900)
  made = (await byTitle('Team sync'))[0]
  check('dragging its bottom edge makes it longer', hm(made.end) === '21:30', made.end)
  await h.keyboard.press('Meta+z'); await h.waitForTimeout(900)
  made = (await byTitle('Team sync'))[0]
  check('⌘Z puts its length back', hm(made.end) === '21:00', made.end)
  box = await block.boundingBox()
  await h.mouse.move(box.x + 20, box.y + 10); await h.mouse.down()
  await h.mouse.move(box.x + 20, box.y + 30, { steps: 4 }); await h.mouse.move(box.x + 20, box.y + 10 + 56, { steps: 6 })
  await h.mouse.up(); await h.waitForTimeout(900)
  made = (await byTitle('Team sync'))[0]
  check('dragging it moves it an hour later', hm(made.start) === '21:00' && hm(made.end) === '22:00', `${made.start} ${made.end}`)
  await h.keyboard.press('Meta+z'); await h.waitForTimeout(900)
  made = (await byTitle('Team sync'))[0]
  check('⌘Z puts the move back', hm(made.start) === '20:00', made.start)
  // Esc mid-drag leaves it.
  box = await block.boundingBox()
  await h.mouse.move(box.x + 20, box.y + 10); await h.mouse.down()
  await h.mouse.move(box.x + 20, box.y + 60, { steps: 6 })
  await h.keyboard.press('Escape'); await h.mouse.up(); await h.waitForTimeout(700)
  check('Esc mid-drag leaves it where it was', hm((await byTitle('Team sync'))[0].start) === '20:00')

  // 3. Right-click, ⌫ to the Bin, ⌘Z back.
  await block.click({ button: 'right' }); await h.waitForTimeout(400)
  check('right-clicking an event gives its menu', (await h.locator('[role="menu"]').innerText().catch(() => '')).includes('Notes for this'))
  await esc()
  await block.focus(); await h.keyboard.press('Backspace'); await h.waitForTimeout(900)
  check('⌫ takes it to the Bin', (await byTitle('Team sync')).length === 0 && (await v('bin:list')).some((one) => one.type === 'event' && one.title === 'Team sync'))
  await h.keyboard.press('Meta+z'); await h.waitForTimeout(900)
  check('⌘Z brings it back', (await byTitle('Team sync')).length === 1)

  // 4. The words: "lunch with Sam fri 1-2pm @Cafe".
  const allDay = h.locator(`[data-cal-allday="${day}"]`)
  await allDay.click({ position: { x: 5, y: 5 } }); await h.waitForTimeout(600)
  await h.locator(`${S} [data-day-side-kind="event"]`).click(); await h.waitForTimeout(400)
  await h.locator(`${S} [data-new-event-words]`).fill('lunch with Sam fri 1-2pm @Cafe'); await h.waitForTimeout(300)
  const said = await h.locator(`${S} [data-new-event-said]`).innerText()
  check('the panel says what the words mean before it is made', said.includes('Lunch with Sam') && said.includes('Cafe') && said.includes('Fri') && said.includes('Sam'), said)
  await shot('events-words-light')
  await h.keyboard.press('Enter'); await h.waitForTimeout(1200)
  const lunch = (await byTitle('Lunch with Sam'))[0]
  check('"lunch with Sam fri 1-2pm @Cafe" is lunch on Friday 13:00 to 14:00 at Cafe with Sam',
    lunch && new Date(lunch.start).getDay() === 5 && hm(lunch.start) === '13:00' && hm(lunch.end) === '14:00' && lunch.place === 'Cafe' && lunch.people.join() === 'Sam', JSON.stringify(lunch))
  await esc()

  // 5. A repeating "last Friday of the month": the right days, and This one versus All.
  const lastFriday = (y, m) => { const d = new Date(y, m + 1, 0, 17, 0); while (d.getDay() !== 5) d.setDate(d.getDate() - 1); return d }
  const first = lastFriday(today.getFullYear(), today.getMonth() + 1)
  const series = await v('event:add', { title: 'Pay day drinks', start: first.toISOString(), end: new Date(first.getTime() + 3600000).toISOString(), repeat: { freq: 'monthly', by: 'nth', nth: -1 }, calendarId: 'personal' })
  const times = await byTitle('Pay day drinks')
  const want = Array.from({ length: 6 }, (_, n) => key(lastFriday(first.getFullYear(), first.getMonth() + n)))
  check('"Monthly on the last Friday" falls on the last Friday of each month', want.every((one, n) => key(new Date(times[n]?.start)) === one), times.slice(0, 6).map((one) => key(new Date(one.start))).join(' '))
  check('it is said as "Monthly on the last Friday"', times[0]?.repeatSaid === 'Monthly on the last Friday', times[0]?.repeatSaid)
  // In the month view, the second one opened, renamed with "This one".
  await h.keyboard.press('m'); await h.waitForTimeout(600)
  const second = times[1]
  for (let n = 0; n < 3 && await h.locator(`[data-cal-event-chip="${second.key}"]`).count() === 0; n++) { await h.keyboard.press('ArrowRight'); await h.waitForTimeout(900) }
  const chip = h.locator(`[data-cal-event-chip="${second.key}"]`)
  check('a repeating event shows as a chip with its time on the month', await chip.count() === 1 && (await chip.innerText()).includes('17'), await chip.innerText().catch(() => 'none'))
  await chip.click(); await h.waitForTimeout(700)
  check('a click on the chip shows its card', await h.locator(`[data-cal-pop="${second.key}"]`).count() === 1)
  await chip.dblclick(); await h.waitForTimeout(900)
  const title = h.locator(`${S} [data-event-title]`)
  await title.fill('Pay day drinks, at the pub'); await title.press('Enter'); await h.waitForTimeout(600)
  check('changing a repeating event asks This one, This and following, or All', await h.locator('[data-scope-ask] [data-scope]').count() === 3)
  await shot('events-scope-light')
  await h.locator('[data-scope-ask] [data-scope="one"]').click(); await h.waitForTimeout(900)
  let now = await all()
  check('"This one" renames only that time', now.filter((one) => one.title === 'Pay day drinks, at the pub').length === 1 && now.find((one) => one.title === 'Pay day drinks, at the pub')?.start === second.start && now.filter((one) => one.title === 'Pay day drinks').length >= 5)
  await h.keyboard.press('Meta+z'); await h.waitForTimeout(900)
  check('⌘Z takes "This one" back', (await all()).every((one) => one.title !== 'Pay day drinks, at the pub'))
  await esc()
  await h.locator(`[data-cal-event-chip="${second.key}"]`).dblclick(); await h.waitForTimeout(900)
  await h.locator(`${S} [data-event-title]`).fill('Monthly drinks'); await h.locator(`${S} [data-event-title]`).press('Enter'); await h.waitForTimeout(600)
  await h.locator('[data-scope-ask] [data-scope="all"]').click(); await h.waitForTimeout(900)
  now = await all()
  check('"All of them" renames every time', now.filter((one) => one.series === series.key.split('@')[0]).every((one) => one.title === 'Monthly drinks') && now.filter((one) => one.title === 'Monthly drinks').length >= 6)
  // Deleting one time asks too, and "This one" leaves the rest.
  const third = now.filter((one) => one.title === 'Monthly drinks')[2]
  await v('event:drop', third.key, 'one')
  now = await all()
  check('deleting "This one" leaves the others', !now.some((one) => one.key === third.key) && now.filter((one) => one.title === 'Monthly drinks').length >= 5)
  await esc()

  // 6. Hiding a calendar hides its events; the Tasks layer hides tasks; your Mac's calendar is a read-only layer.
  await h.keyboard.press('w'); await h.keyboard.press('t'); await h.waitForTimeout(800)
  const work = await v('event:add', { title: 'Work review', start: new Date(new Date(today).setHours(11, 0)).toISOString(), end: new Date(new Date(today).setHours(12, 0)).toISOString(), calendarId: 'work' })
  await h.waitForTimeout(800)
  const workBlock = h.locator(`[data-cal-event="${work.key}"]`)
  check('an event on Work shows', await workBlock.count() === 1)
  check('it takes its calendar\'s colour', (await workBlock.getAttribute('style')).includes('orange'))
  await h.locator('[data-cal-layer="work"] [role="checkbox"]').click(); await h.waitForTimeout(800)
  check('unticking Work hides its events', await workBlock.count() === 0)
  await h.locator('[data-cal-layer="work"] [role="checkbox"]').click(); await h.waitForTimeout(800)
  check('ticking it again shows them again', await workBlock.count() === 1)
  const tasksBefore = await h.locator('[data-cal-block], [data-cal-untimed]').count()
  await h.locator('[data-cal-layer="tasks"] [role="checkbox"]').click(); await h.waitForTimeout(800)
  check('unticking Tasks hides the tasks', tasksBefore > 0 && await h.locator('[data-cal-block], [data-cal-untimed]').count() === 0, `${tasksBefore}`)
  await h.locator('[data-cal-layer="tasks"] [role="checkbox"]').click(); await h.waitForTimeout(800)
  check('your Mac\'s calendar shows as a read-only layer of its own', await h.locator('[data-cal-layer="mac:Family"]').count() === 1 && await h.locator('[data-cal-event][data-readonly]').count() >= 1)
  await h.locator('[data-cal-layer="mac:Family"] [role="checkbox"]').click(); await h.waitForTimeout(800)
  check('and hides with its own tick', await h.locator('[data-cal-event][data-readonly]').count() === 0)
  await h.locator('[data-cal-layer="mac:Family"] [role="checkbox"]').click(); await h.waitForTimeout(600)

  // 7. A reminder: scheduled from the database, shown as a Mac notification (stubbed), once.
  await c.electron.evaluate(({ Notification }) => { globalThis.__shown = []; Notification.prototype.show = function () { globalThis.__shown.push({ title: this.title, body: this.body }) } })
  const soon = new Date(Date.now() + 12 * 60000)
  await v('event:add', { title: 'Dentist', start: soon.toISOString(), end: new Date(soon.getTime() + 1800000).toISOString(), remind: 10, place: 'High Street' })
  const next = await v('reminders:next')
  const dentist = next.find((one) => one.title === 'Dentist')
  check('a reminder 10 minutes before is scheduled for its time', dentist && Math.abs(new Date(dentist.at).getTime() - (soon.getTime() - 600000)) < 60000, JSON.stringify(dentist))
  const due = new Date(Date.now() + 9 * 60000)
  await v('event:add', { title: 'Call Ann', start: due.toISOString(), end: new Date(due.getTime() + 1800000).toISOString(), remind: 10 })
  const task = (await v('task:add', 'events probe timed task')).id
  await v('task:save', task, { due: new Date(Date.now() + 4 * 60000).toISOString(), allDay: 0 })
  await v('task:remind:set', task, 5)
  const shownNow = await v('reminders:check')
  const shown = await c.electron.evaluate(() => globalThis.__shown)
  check('a reminder whose time has come is shown as a notification', shown.some((one) => one.title === 'Call Ann' && one.body === 'In 10 minutes'), JSON.stringify(shown))
  check('a timed task\'s "5 min before" is shown too', shown.some((one) => one.title === 'events probe timed task' && one.body.startsWith('In ')), JSON.stringify(shown))
  check('one not due yet waits', !shown.some((one) => one.title === 'Dentist'))
  check('a reminder shown is not shown twice', shownNow >= 2 && await v('reminders:check') === 0)

  // 8. The second time zone.
  await v('settings:set', { secondZone: 'Asia/Kolkata' }); await h.waitForTimeout(1000)
  const ten = await h.locator('[data-cal-zone-hours] [data-zone-hour="10"]').innerText().catch(() => '')
  const tenHere = new Date(today); tenHere.setHours(10, 0, 0, 0)
  const wantTen = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: 'numeric', minute: '2-digit', hourCycle: 'h23' }).format(tenHere).replace(/^0/, '')
  check('the second hour column shows Kolkata\'s time at each hour here', ten.replace(/^0/, '') === wantTen, `${ten} ~ ${wantTen}`)
  check('it is labelled with the zone\'s short name', (await h.locator('[data-cal-zone-name]').innerText()) === 'IST', await h.locator('[data-cal-zone-name]').innerText().catch(() => ''))
  await shot('events-week-light')

  // 9. Meeting notes, linked both ways.
  await workBlock.click(); await h.waitForTimeout(700)
  check('a click on a block shows its card beside it', await h.locator(`[data-cal-pop="${work.key}"]`).count() === 1 && await h.locator(S).count() === 0)
  await h.locator('[data-cal-pop-edit]').click(); await h.waitForTimeout(900)
  await shot('events-panel-light')
  await h.locator(`${S} [data-event-notes-for]`).click(); await h.waitForTimeout(1500)
  const linked = await v('event', work.key)
  const note = linked?.linked[0]
  const dayName = new Date(today).toLocaleDateString('en-GB', { weekday: 'short' })
  check('"Notes for this" makes a note titled with the event and its day', note && note.title.startsWith('Work review · ') && note.title.includes(dayName), note?.title)
  check('the note shows the event as where it came from', await h.locator(`[data-note-event="${work.key}"]`).count() >= 1)
  await shot('events-note-light')
  await h.locator(`[data-note-event="${work.key}"]`).first().click(); await h.waitForTimeout(1500)
  check('clicking it opens the event in the Calendar', await h.locator(`${S} [data-event-detail="${work.key}"]`).count() === 1)
  check('the event lists its note', await h.locator(`${S} [data-event-linked="${note?.id}"]`).count() === 1)
  await esc()
  check('its block shows a note icon', await h.locator(`[data-cal-event="${work.key}"] [data-cal-event-noted]`).count() === 1)

  // 11. ⌘K: events found by name, a picked event told what to do, calendars shown and hidden.
  const palette = async (words) => {
    await h.keyboard.press('Meta+k'); await h.waitForTimeout(500)
    if (words) { await h.keyboard.type(words, { delay: 15 }); await h.waitForTimeout(700) }
  }
  const firstRow = () => h.locator('[data-search-at]').first().innerText().catch(() => '')
  await h.keyboard.press('t'); await h.waitForTimeout(500)
  await palette('Lunch with Sam')
  const found = h.locator('button[data-row]', { hasText: 'Lunch with Sam' }).first()
  check('search finds an event by its name', await found.count() === 1 && (await found.innerText()).includes('Event'), await found.innerText().catch(() => 'none'))
  await shot('events-search-light')
  await found.click(); await h.waitForTimeout(1500)
  check('opening it shows the event on its day, open in the panel', await h.locator(`${S} [data-event-detail="${lunch.key}"]`).count() === 1 && await h.locator(`[data-cal-event="${lunch.key}"]`).count() === 1)
  await palette()
  check('with an event picked, ⌘K is about it', (await h.locator('[data-search-scope]').innerText().catch(() => '')).includes('Lunch with Sam'))
  await h.keyboard.type('move this to Friday 3pm', { delay: 10 }); await h.waitForTimeout(600)
  check('"move this to Friday 3pm" reads as a move of the event', (await firstRow()).startsWith('Move “Lunch with Sam” to'), await firstRow())
  await h.keyboard.press('Enter'); await h.waitForTimeout(1300)
  let moved = (await byTitle('Lunch with Sam'))[0]
  check('the event lands on Friday at 15:00, still an hour long', new Date(moved.start).getDay() === 5 && hm(moved.start) === '15:00' && hm(moved.end) === '16:00', `${moved.start} ${moved.end}`)
  await h.keyboard.press('Meta+z'); await h.waitForTimeout(1200)
  moved = (await byTitle('Lunch with Sam'))[0]
  check('⌘Z puts it back at 13:00', hm(moved.start) === '13:00', moved.start)
  await h.locator(`[data-cal-event="${lunch.key}"]`).click(); await h.waitForTimeout(800)
  await palette('make it 45 minutes'); await h.keyboard.press('Enter'); await h.waitForTimeout(1200)
  moved = (await byTitle('Lunch with Sam'))[0]
  check('"make it 45 minutes" sets how long it lasts', hm(moved.end) === '13:45', moved.end)
  await h.keyboard.press('Meta+z'); await h.waitForTimeout(1000)
  await esc()
  await h.locator('[data-cal-scroll]').click({ position: { x: 2, y: 2 } }).catch(() => {})
  await h.keyboard.press('t'); await h.waitForTimeout(600)
  await palette('Hide Work')
  check('⌘K offers to hide a calendar', (await firstRow()).startsWith('Hide Work'), await firstRow())
  await h.keyboard.press('Enter'); await h.waitForTimeout(900)
  check('and hiding it from ⌘K hides its events', await h.locator(`[data-cal-event="${work.key}"]`).count() === 0)
  await palette('Show Work'); await h.keyboard.press('Enter'); await h.waitForTimeout(900)
  check('showing it again brings them back', await h.locator(`[data-cal-event="${work.key}"]`).count() === 1)

  // 10. Settings › Calendar previews the zone in place.
  await go('settings'); await h.waitForTimeout(900)
  await h.locator('[data-page="settings"] button', { hasText: 'Import and backups' }).first().locator('xpath=..').locator('button', { hasText: 'Calendar' }).first().click().catch((e) => console.log('no section', e.message.slice(0, 80))); await h.waitForTimeout(900)
  check('Settings › Calendar has "Show a second time zone", with both clocks shown', (await h.locator('[data-zone-preview]').innerText().catch(() => '')).includes('Kolkata'))
  await shot('events-settings-light')

  // Dark.
  await c.theme('dark')
  await go('calendar'); await h.waitForTimeout(1500)
  await h.keyboard.press('w'); await h.keyboard.press('t'); await h.waitForTimeout(800)
  await h.locator('[data-cal-scroll]').evaluate((el) => (el.scrollTop = 6 * 56))
  await shot('events-week-dark')
  await h.locator(`[data-cal-event="${work.key}"]`).dblclick(); await h.waitForTimeout(900)
  await shot('events-panel-dark')
  await esc()
  await h.keyboard.press('m'); await h.waitForTimeout(900)
  await shot('events-month-dark')
  await h.keyboard.press('w'); await h.waitForTimeout(500)
  const col2 = h.locator(`[data-cal-col="${key(today)}"]`)
  await h.locator('[data-cal-scroll]').evaluate((el) => (el.scrollTop = 17 * 56))
  const b2 = await col2.boundingBox()
  await h.mouse.move(b2.x + b2.width / 2, b2.y + 19 * 56 + 2); await h.mouse.down(); await h.mouse.move(b2.x + b2.width / 2, b2.y + 20 * 56 - 2, { steps: 6 }); await h.mouse.up(); await h.waitForTimeout(700)
  await h.keyboard.type('lunch with Sam fri 1-2pm @Cafe'); await h.waitForTimeout(300)
  await shot('events-words-dark')
  await esc()
  await go('settings'); await h.waitForTimeout(900)
  await h.locator('[data-page="settings"] button', { hasText: 'Import and backups' }).first().locator('xpath=..').locator('button', { hasText: 'Calendar' }).first().click().catch((e) => console.log('no section', e.message.slice(0, 80))); await h.waitForTimeout(900)
  await shot('events-settings-dark')

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
