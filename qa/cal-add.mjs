// Adding to the Calendar (12 Nov): a double-click on a day (Month) or a time (Week, Day) puts a draft there and a popover
// grows out of it, tied to it by a point; "Event | Task" at its top never moves and the width is one for both; ↵ makes
// it, Esc takes the draft away (with words, a notice whose Undo brings them back), a click elsewhere makes it when
// there are words. The header's button, N, ↵ on a picked day and a right-click open the same popover. A day under the
// pointer in Month takes a faint fill, a click picks a day, the "+" is gone, and Upcoming is an island in the left
// panel, never a box over the days. Driven with a real pointer and keys. It runs in parts, each under a minute and a half
// (PART=month,week,narrow by default):
//   month   every line above in Month, at 1440 wide: the lights, the draft, the popover's place, edges, point, width,
//           switch and height, the words read back, ↵, Esc, a click elsewhere, Undo, ⌘Z, N, the button, ↵ on a picked
//           day, right-click, the last column and the last row, a day with 12 things, a long title, one sound each.
//   week    Week and Day: a double-click at a time, a press dragged across the hours, a click that picks, N, right-click
//           "New task here", the all-day lane, and Upcoming's place.
//   narrow  560 by 400 and 1000 wide: the popover inside the window, never over its draft.
//   home    Home's month and the Journal's month (today's page) add the same way: the fill, a click that picks, a
//           double-click that starts a task in the same popover (never the tall side panel), ↵, Undo, right-click.
//   pinch   the light under a pinch: the week (in a month) or the day (in a week) the fingers are opening is lit while they
//           are on it, unlit when the pinch comes to nothing, and the level it becomes arrives lit and lets the light go.
//   open    one way for making and for opening: a ⇧-click on an event or a task picks it and opens nothing; a click,
//           ↵, its menu's "Open" and ⌘K open the same popover on it, tied to it, its name in the line; "Open" there is its
//           page in the side panel; a name typed over is kept with Undo and ⌘Z. In Month, Week and Day, for an event and
//           for a task, then from Upcoming, and from Home's month and the Journal's. OPEN=month|week|day|rest runs
//           one of its four stretches alone.
//   rows    the quiet rows under an open thing's line: an event's calendar, place, people, reminder and repeat, a task's
//           day and time and its tags; each one line that opens in place, the width one, the height following, each
//           change kept as it is made with Undo and ⌘Z; at 560 by 400 the rows scroll inside the popover.
//   put     what is pressed stays put: at every frame of a row opening and closing, and of Event to Task and back, the
//           control pressed keeps its place to the pixel and the popover its top, and no other control lights under the
//           still pointer. In Week at 14:00 and in its last row, in Day at 23:00, in Month's last week, on Home's month
//           and at 560 by 400 (PUT=week|late|month|home|narrow runs one stretch).
//   one     one floating thing: with the new one's popover up, a click on a crowded hour's “+N more”, on a capture's chip
//           and on a task's tick (each stops its press) leaves one floating thing or none, never two.
//   leave   the popover leaves the way it came, by its clip, with its draft kept until it has left: by a press elsewhere,
//           Esc, ↵, “Open”; at once with Motion off and with Reduce motion.
//   spring  the popover's height on the app's spring: its box read every frame through Event to Task and back, a row
//           opening and a row closing (six or more in-between heights each, one way), and one height by a key, with
//           Motion off and with Reduce motion. With FRAMES=dir, every frame the page drew through each, in the look LOOK names.
//   unhappy the paths that go wrong, on a thing that is open: an empty name (it says why not and keeps the old one), one of
//           your Mac's events (read only: no "Open", no rows, a line that cannot be typed in), a repeating event's "which
//           times" (asked from the line and from a row; Esc there leaves the popover up), and Esc with a name typed and
//           not kept (a notice says so, and its Undo brings the popover back with the words); then the worst realistic
//           words (a long name with a word that cannot break, a long place, three people) and a task with no day.
//   quiet   one floating thing at a time: with the popover open, no tooltip comes up beside or over it (the thing's own
//           name, the place field, "Open", another thing on the page); closed, the thing's tip is back.
//   last    the last three of ask 18: "every week 9am" (and as a task, "every week" with no time) typed on a later day's
//           draft starts on that day, never from today; ↵ on a row turns its chevron at once, as its choices are there at
//           once (a click still turns it); the tag field's hint sits under the field in the row's own flow, whole.
//   follow  the draft follows the words: "tue 1pm" typed moves it there on the spring, its popover beside it at every
//           frame; a day in another month turns the grid, no day brings it back; Motion off, at once; a task's line says
//           its day; in Week a time moves it down its day and another week's day turns the week.
//   span    a press dragged across Month's days: the bar drawn day by day into the next week's row (a tick each), Esc
//           puts it back, drawn backwards and let go the popover is at the bar's end reading the days; ↵ makes it; the
//           event's bar in Month and Week's all-day lane; its end and start dragged, its middle carried in the one card
//           ("Move to …", the days lit), Esc, Undo and ⌘Z; its end held past the grid's bottom edge, no wheel, scrolls
//           the weeks to a day that was out of view. With FRAMES=dir, the bar drawn across a week's end, filmed.
//   frames  with FRAMES=dir: a picture every 50ms through the popover growing, Event to Task, adding, and a pinch with its
//           lit block, light and dark; and the popover beside two of the app's own (the small month, an event's card).
//   QA_ARGS=--sandbox QA_DATA=<a copy of the seeded sandbox> QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/cal-add.mjs
import os from 'node:os'
import { mkdirSync, writeFileSync } from 'node:fs'
import { sandbox } from './sandbox-lib.mjs'
import { castFrames } from './cast-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'
const parts = (process.env.PART ?? 'month,week,narrow,pinch,home,open,rows,put,one,leave,spring,unhappy,quiet,last,follow,span').split(',')
// Your Mac's calendar, stood in for the unhappy part: one event tomorrow morning on "Family", read only.
if (parts.includes('unhappy')) {
  const at = new Date(); at.setDate(at.getDate() + 1); at.setHours(7, 0, 0, 0)
  process.env.HALIGTREE_QA_CALENDAR = JSON.stringify([{ title: 'Mac breakfast', start: at.toISOString(), end: new Date(at.getTime() + 3600000).toISOString(), allDay: false, calendar: 'Family', color: '#2a9d8f' }])
}
const c = await sandbox({ width: Number(process.env.QA_W ?? 1440), height: Number(process.env.QA_H ?? 900), at: '11:30' })
const { h, v, go } = c
let passed = 0
let all = 0
const check = (name, pass, detail = '') => { all++; if (pass) passed++; console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`) }
const wait = (ms) => h.waitForTimeout(ms)
const dir = process.env.FRAMES
// SHOTS=dir: the still pictures only, with no film beside them (a film slows the page: the rows part counts a spring's steps only without one).
const stills = process.env.SHOTS ?? dir
if (stills) mkdirSync(stills, { recursive: true })
const dayKeyOf = (by) => { const d = c.now(); d.setDate(d.getDate() + by); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
const cues = () => h.evaluate(() => [...(window.haligtreeCued ?? [])])
/** The cues an action played, by name: the app keeps its last fifty, so the list is emptied first and read whole after. */
const heard = async (run) => { await h.evaluate(() => { if (window.haligtreeCued) window.haligtreeCued.length = 0 }); await run(); await wait(900); return cues() }
const state = () => h.evaluate(() => {
  const box = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height, r: r.right, b: r.bottom } }
  const pop = document.querySelector('[data-cal-add]')
  const draft = document.querySelector('[data-cal-level] [data-cal-draft], [data-month-own] [data-cal-draft]')
  const field = pop?.querySelector('textarea, input')
  return {
    pop: pop && { ...box(pop), kind: pop.dataset.calAdd, side: pop.closest('[data-cal-hold]')?.dataset.side, keyed: !!pop.closest('[data-cal-hold]')?.hasAttribute('data-keyed'), arrow: box((pop.closest('[data-cal-hold]') ?? pop).querySelector('[data-slot="popover-arrow"]')), sw: box(pop.querySelector('[role="radiogroup"]')),
      focused: document.activeElement === field, words: field?.value ?? null, said: pop.querySelector('[data-new-event-said], [data-day-side-when]')?.textContent ?? '', opaque: getComputedStyle(pop).backgroundColor },
    draft: draft && { ...box(draft), kind: draft.dataset.calDraft, name: draft.querySelector('[data-cal-draft-name]')?.textContent, day: draft.closest('[data-day]')?.dataset.day ?? draft.closest('[data-cal-col]')?.dataset.calCol ?? draft.style.gridColumn },
    win: { w: innerWidth, h: innerHeight },
    toast: [...document.querySelectorAll('[role="status"]')].map((el) => el.textContent).join(' | '),
    mode: document.querySelector('[data-cal-mode]')?.getAttribute('data-cal-mode')
  }
})
const cell = (key) => h.evaluate((key) => { const el = document.querySelector(`[data-cal-level] [data-day="${key}"]`); if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height, r: r.right, b: r.bottom, bg: getComputedStyle(el).backgroundColor, mark: getComputedStyle(el.querySelector('[data-day-number]')).boxShadow } }, key)
/** The empty corner of a month's day: inside its padding, under and beside its things. */
const corner = (box) => [box.r - 4, box.b - 4]
const eventsNamed = async (title) => (await v('events', new Date(c.now().getTime() - 40 * 864e5).toISOString(), new Date(c.now().getTime() + 80 * 864e5).toISOString())).filter((one) => one.title === title)
const tasksNamed = async (title) => (await v('tasks')).filter((one) => one.title.startsWith(title))
const inside = (s) => s.pop && s.pop.x >= 11.5 && s.pop.y >= 51.5 && s.pop.r <= s.win.w - 11.5 && s.pop.b <= s.win.h - 11.5
const apart = (s) => s.pop && s.draft && (s.pop.x >= s.draft.r - 0.5 || s.pop.r <= s.draft.x + 0.5 || s.pop.y >= s.draft.b - 0.5 || s.pop.b <= s.draft.y + 0.5)
const shot = async (name) => { if (stills) await h.screenshot({ path: `${stills}/${name}.png` }) }
/** A picture every 50ms while `run` plays out. */
const film = async (name, run, n = 8) => {
  if (!dir) return run()
  const going = run()
  for (let at = 0; at < n; at++) { const t = Date.now(); await h.screenshot({ path: `${dir}/${name}-${String(at * 50).padStart(3, '0')}.png` }); await wait(Math.max(0, 50 - (Date.now() - t))) }
  await going
}
/** The frames the page itself drew while `run` plays out, kept as pictures in FRAMES (qa/cast-lib.mjs). */
const cast = (name, run, ms = 450) => (dir ? castFrames(h, dir, name, run, ms) : run())
const toMode = async (key) => { await h.keyboard.press('Escape'); await h.mouse.click(700, 30).catch(() => {}); await h.keyboard.press(key); await wait(700) }
const dbl = async (x, y) => { await h.mouse.move(x, y); await h.mouse.dblclick(x, y); await wait(600) }
const shiftClick = async (x, y) => { await h.keyboard.down('Shift'); await h.mouse.click(x, y); await h.keyboard.up('Shift') }

try {
  await v('settings:set', { hintRate: 0 })
  await go('calendar')
  await wait(800)
  // LOOK=dark: the whole run in the dark look (for pictures of a part other than `frames`, which takes both itself).
  if (process.env.LOOK) { await c.look(process.env.LOOK); await wait(400) }

  if (parts.includes('month')) {
    await toMode('m')
    const a = dayKeyOf(1)
    const b = dayKeyOf(2)
    check('Month is showing', (await state()).mode === 'month')
    check('no "+" waits on a day', await h.evaluate(() => document.querySelectorAll('[data-day-add]').length === 0))
    // The lights.
    const rest = await cell(a)
    await h.mouse.move(rest.x + rest.w / 2, rest.y + rest.h / 2)
    await wait(300)
    const lit = await cell(a)
    check('a day under the pointer takes a faint fill', lit.bg !== rest.bg, `${rest.bg} to ${lit.bg}`)
    const picks = await heard(() => h.mouse.click(...corner(rest)))
    const picked = await cell(a)
    check('a click picks the day, with the small month\'s mark, and opens nothing', picked.mark !== 'none' && !(await state()).pop && (await h.evaluate((key) => !!document.querySelector(`[data-cal-mini-day="${key}"].bg-accent`), a)), `mark ${picked.mark.slice(0, 40)}; cues ${picks.join() || 'none'}`)
    // A double-click: the draft in place, the popover out of it.
    const opened = await heard(() => film('month-open', () => dbl(...corner(rest))))
    let s = await state()
    await shot('month-event')
    check('a double-click puts a draft on that day', s.draft?.kind === 'event' && s.draft.day === a, JSON.stringify(s.draft))
    check('a popover opens, 320 wide, on the floating material', s.pop?.kind === 'event' && Math.abs(s.pop.w - 320) < 1, `${s.pop?.w}px, ${s.pop?.opaque}`)
    check('it keeps 12px from every edge and stays under the title bar', inside(s), JSON.stringify(s.pop && [s.pop.x, s.pop.y, s.pop.r, s.pop.b]))
    check('it sits beside its draft, never over it', apart(s), `side ${s.pop?.side}`)
    check('a point ties it to the draft', !!s.pop?.arrow && s.pop.arrow.w > 0 && s.draft && s.pop.arrow.y + s.pop.arrow.h / 2 > s.draft.y - 8 && s.pop.arrow.y + s.pop.arrow.h / 2 < s.draft.b + 8, JSON.stringify(s.pop?.arrow))
    check('the line to type in has the keys', s.pop?.focused)
    check('the day stays lit while it is open', (await cell(a)).bg !== rest.bg && (await cell(a)).bg !== lit.bg, (await cell(a)).bg)
    check('opening made one sound', opened.filter((one) => one === 'open').length === 1 && opened.length <= 1, opened.join())
    // The words, read back; the draft says them too.
    await h.keyboard.type('Lunch with Sam fri 1pm')
    await wait(250)
    s = await state()
    check('the words are read back as they are typed', /Lunch with Sam/.test(s.pop.said) && /Fri/.test(s.pop.said) && /13:00|1:00/.test(s.pop.said), s.pop.said)
    check('the draft on the grid says the name', s.draft?.name === 'Lunch with Sam', s.draft?.name)
    // Event to Task: one width, the switch still, the height on a spring, the draft's mark changed, the words kept.
    const before = s
    await h.evaluate(() => { window.__h = []; const el = document.querySelector('[data-cal-add-sized]'); const t0 = performance.now(); const tick = () => { window.__h.push(el.getBoundingClientRect().height); if (performance.now() - t0 < 2500) requestAnimationFrame(tick); else window.__hDone = true }; window.__hDone = false; requestAnimationFrame(tick) })
    await film('month-to-task', async () => { await h.click('[data-cal-add] [data-day-side-kind="task"]'); await wait(450) })
    s = await state()
    // The whole change is on the record before it is read, however busy the machine is.
    await h.waitForFunction(() => window.__hDone)
    const heights = await h.evaluate(() => window.__h.map((n) => Math.round(n)))
    const steps = new Set(heights).size
    check('Task is the same width, and the switch has not moved', s.pop?.kind === 'task' && Math.abs(s.pop.w - before.pop.w) < 0.5 && Math.abs(s.pop.sw.x - before.pop.sw.x) < 0.5 && Math.abs(s.pop.sw.y - before.pop.sw.y) < 0.5, `${before.pop.w} to ${s.pop?.w}; switch ${before.pop.sw.x},${before.pop.sw.y} to ${s.pop?.sw.x},${s.pop?.sw.y}`)
    check('the height changes over several frames, one way', steps >= 4 && heights.every((n, at) => at === 0 || (heights[0] > heights.at(-1) ? n <= heights[at - 1] + 1 : n >= heights[at - 1] - 1)), `${heights[0]} to ${heights.at(-1)} in ${steps} steps: ${[...new Set(heights)].join(' ')}`)
    check('the words stay, and the draft is a task\'s mark', s.pop?.words === 'Lunch with Sam fri 1pm' && s.draft?.kind === 'task' && s.pop.focused, `${s.pop?.words}; ${s.draft?.kind}`)
    await shot('month-task')
    await h.click('[data-cal-add] [data-day-side-kind="event"]')
    await wait(450)
    // ↵ makes it.
    const added = await heard(() => film('month-add', async () => { await h.keyboard.press('Enter'); await wait(500) }))
    s = await state()
    check('↵ makes the event, and the popover and draft go', !s.pop && !s.draft && (await eventsNamed('Lunch with Sam')).length === 1, `${(await eventsNamed('Lunch with Sam')).length} made`)
    check('a notice says so, with Undo', /Added for/.test(s.toast) && /Undo/.test(s.toast), s.toast.slice(0, 80))
    check('adding made one sound', added.length === 1, added.join())
    await h.keyboard.press('Meta+z')
    await wait(500)
    check('⌘Z takes it back', (await eventsNamed('Lunch with Sam')).length === 0)
    // The same journey for a task made by the switch: a double-click, "Task", the words, ↵, the notice, ⌘Z.
    await dbl(...corner(await cell(a)))
    await h.click('[data-cal-add] [data-day-side-kind="task"]')
    await wait(450)
    await h.keyboard.type('Pay rent')
    const switched = await heard(async () => { await h.keyboard.press('Enter'); await wait(600) })
    s = await state()
    const rent = await tasksNamed('Pay rent')
    check('a double-click turned to Task, then ↵: the task is made for that day, with a notice, Undo and one sound', !s.pop && !s.draft && rent.length === 1 && !!rent[0].dueAt && /Added for/.test(s.toast) && /Undo/.test(s.toast) && switched.length === 1, `${rent.length} made; due ${rent[0]?.dueAt}; cues ${switched.join()}`)
    await h.keyboard.press('Meta+z')
    await wait(600)
    check('⌘Z takes that task back too', (await tasksNamed('Pay rent')).length === 0, `${(await tasksNamed('Pay rent')).length} left`)
    await h.keyboard.press('Meta+a')
    await h.keyboard.press('Backspace')
    await h.keyboard.press('Escape')
    await wait(300)
    // Esc.
    const other = await cell(b)
    await dbl(...corner(other))
    // ↵ with nothing typed: nothing is made, a notice says why, and the popover stays to be written in.
    const refused = await heard(async () => { await h.keyboard.press('Enter'); await wait(400) })
    s = await state()
    check('↵ with nothing typed makes nothing and says why, with the refusal sound, the popover still open', !!s.pop && !!s.draft && s.pop.focused && /Nothing to add yet/.test(s.toast) && refused.join() === 'nope', `${s.toast.slice(0, 70)}; cues ${refused.join()}`)
    await h.keyboard.press('Escape')
    await wait(350)
    s = await state()
    check('Esc with nothing typed takes the draft away, and says nothing', !s.pop && !s.draft && !/Not added/.test(s.toast), s.toast.slice(0, 60))
    await dbl(...corner(other))
    await h.keyboard.type('Call mum')
    await h.keyboard.press('Escape')
    await wait(350)
    s = await state()
    check('Esc with words takes it away with a notice that has Undo', !s.pop && !s.draft && /Not added/.test(s.toast) && /Call mum/.test(s.toast) && /Undo/.test(s.toast), s.toast.slice(0, 80))
    await h.locator('[role="status"] button', { hasText: 'Undo' }).first().click()
    await wait(450)
    s = await state()
    check('Undo brings the draft and its words back', s.pop?.words === 'Call mum' && s.draft?.day === b && s.pop.focused, `${s.pop?.words}`)
    // A click elsewhere: made when there are words.
    await h.mouse.click(...corner(await cell(a)))
    await wait(600)
    s = await state()
    check('a click elsewhere with words makes it, with a notice and Undo', !s.pop && !s.draft && (await eventsNamed('Call mum')).length === 1 && /Added for/.test(s.toast) && /Undo/.test(s.toast), `${(await eventsNamed('Call mum')).length} made; ${s.toast.slice(0, 60)}`)
    await h.keyboard.press('Meta+z')
    await wait(400)
    await dbl(...corner(other))
    await h.mouse.click(...corner(await cell(a)))
    await wait(400)
    s = await state()
    check('a click elsewhere with nothing typed takes the draft away', !s.pop && !s.draft && (await eventsNamed('')).length === 0)
    // ⌘↵ makes it too (the key the side panel kept for it), and the popover goes.
    await dbl(...corner(other))
    await h.keyboard.type('Cmd enter one')
    await h.keyboard.press('Meta+Enter')
    await wait(800)
    s = await state()
    check('⌘↵ makes it too, and the popover goes', !s.pop && !s.draft && (await eventsNamed('Cmd enter one')).length === 1 && /Added for/.test(s.toast), `${(await eventsNamed('Cmd enter one')).length} made; ${s.toast.slice(0, 50)}`)
    await h.keyboard.press('Meta+z')
    await wait(500)
    // A notice's Undo pressed while the popover holds words is the notice's own act, never a click away that makes the draft.
    await dbl(...corner(other))
    await h.keyboard.type('First one')
    await h.keyboard.press('Enter')
    await wait(500)
    await dbl(...corner(await cell(a)))
    await h.keyboard.type('Second one')
    const undo = h.locator('[role="status"] button', { hasText: 'Undo' }).first()
    if (!(await undo.count())) console.log('NOTE  the notice had gone before its Undo could be pressed with the popover open: not checked this run')
    else {
      await undo.click({ timeout: 3000 }).catch(() => {})
      await wait(700)
      s = await state()
      check('Undo on a notice, pressed while the popover holds words, takes back what the notice was about and leaves the popover as it was', (await eventsNamed('First one')).length === 0 && (await eventsNamed('Second one')).length === 0 && s.pop?.words === 'Second one', `${(await eventsNamed('First one')).length} of the first left, ${(await eventsNamed('Second one')).length} of the second made; popover holds ${s.pop?.words}`)
    }
    if ((await state()).pop) { await h.keyboard.press('Meta+a'); await h.keyboard.press('Backspace'); await h.keyboard.press('Escape'); await wait(300) }
    for (const left of [...(await eventsNamed('First one')), ...(await eventsNamed('Second one'))]) await v('event:drop', left.key)
    await wait(300)
    // The other ways in.
    await h.mouse.click(...corner(other))
    await wait(200)
    const keyed = await heard(() => h.keyboard.press('n'))
    s = await state()
    check('N opens it on the picked day, simply there (no travel)', s.pop?.kind === 'event' && s.draft?.day === b && s.pop.keyed && s.pop.focused, `day ${s.draft?.day}; keyed ${s.pop?.keyed}; cues ${keyed.join()}`)
    await h.keyboard.press('Escape')
    await wait(300)
    await h.keyboard.press('Enter')
    await wait(400)
    s = await state()
    check('↵ on a picked day opens it', s.pop?.kind === 'event' && s.draft?.day === b)
    await h.keyboard.press('Escape')
    await wait(300)
    await h.click('[data-cal-new-event]')
    await wait(450)
    s = await state()
    check('the header\'s "New event" opens it on the picked day', s.pop?.kind === 'event' && s.draft?.day === b && inside(s) && apart(s), `day ${s.draft?.day}`)
    await h.keyboard.press('Escape')
    await wait(300)
    await h.keyboard.press('Escape')
    await wait(200)
    await h.click('[data-cal-new-event]')
    await wait(450)
    s = await state()
    check('with no day picked, it is on today', s.draft?.day === dayKeyOf(0), `day ${s.draft?.day}`)
    await h.keyboard.press('Escape')
    await wait(300)
    // Right-click.
    await h.mouse.click(...corner(await cell(a)), { button: 'right' })
    await wait(400)
    const lines = await h.evaluate(() => [...document.querySelectorAll('[role="menu"] [role="menuitem"]')].map((el) => ({ text: el.textContent.trim(), icon: !!el.querySelector('svg') })))
    check('a right-click on a day offers "New event here" and "New task here", each with its icon', lines.length === 2 && lines[0].text === 'New event here' && lines[1].text === 'New task here' && lines.every((one) => one.icon), JSON.stringify(lines))
    await h.locator('[role="menu"] [role="menuitem"]', { hasText: 'New task here' }).click()
    await wait(600)
    s = await state()
    check('"New task here" opens the popover on Task, the line holding the keys', s.pop?.kind === 'task' && s.draft?.kind === 'task' && s.draft.day === a && s.pop.focused, `${s.pop?.kind}; focused ${s.pop?.focused}`)
    await h.keyboard.type('Buy milk')
    const taskAdded = await heard(async () => { await h.keyboard.press('Enter'); await wait(600) })
    s = await state()
    const milk = await tasksNamed('Buy milk')
    check('↵ makes the task on that day, with a notice and Undo, and one sound', !s.pop && milk.length === 1 && (milk[0].dueAt ?? '').length > 0 && /Added for/.test(s.toast) && /Undo/.test(s.toast) && taskAdded.length === 1, `${milk.length} made; due ${milk[0]?.dueAt}; cues ${taskAdded.join()}`)
    await h.keyboard.press('Meta+z')
    await wait(600)
    s = await state()
    check('⌘Z takes the task back, and its words come back to the line', (await tasksNamed('Buy milk')).length === 0 && s.pop?.words === 'Buy milk', `${(await tasksNamed('Buy milk')).length} left; ${s.pop?.words}`)
    await h.keyboard.press('Meta+a')
    await h.keyboard.press('Backspace')
    await h.keyboard.press('Escape')
    await wait(300)
    // The last column and the last row: it turns to the other side, and stays inside.
    const edges = await h.evaluate(() => { const run = document.querySelector('[data-cal-level] [data-month-run], [data-cal-level] [data-month-plan]') ?? document.querySelector('[data-cal-level]'); const frame = run.getBoundingClientRect(); const weeks = [...document.querySelectorAll('[data-cal-level] [data-month-week]')].filter((el) => { const r = el.getBoundingClientRect(); return r.top >= frame.top - 1 && r.bottom <= frame.bottom + 1 }); const pick = (el) => { const r = el.getBoundingClientRect(); return { key: el.dataset.day, r: r.right, b: r.bottom } }; return { lastCol: pick(weeks[1].querySelectorAll('[data-day]')[6]), lastRow: pick(weeks.at(-1).querySelectorAll('[data-day]')[3]), corner: pick(weeks.at(-1).querySelectorAll('[data-day]')[6]) } })
    for (const [name, at] of Object.entries(edges)) {
      await dbl(at.r - 4, at.b - 4)
      s = await state()
      await shot(`month-${name}`)
      check(`${name}: the popover is inside the window, beside its draft`, s.draft?.day === at.key && inside(s) && apart(s), `side ${s.pop?.side}; ${JSON.stringify(s.pop && [Math.round(s.pop.x), Math.round(s.pop.y), Math.round(s.pop.r), Math.round(s.pop.b)])}`)
      if (name !== 'lastRow') check(`${name}: it turned to the left of its draft`, s.pop?.side === 'left' && s.pop.r <= s.draft.x + 0.5, `side ${s.pop?.side}`)
      await h.keyboard.press('Escape')
      await wait(300)
    }
    // A day with 12 things, and a long title.
    const busy = dayKeyOf(3)
    for (let n = 0; n < 12; n++) await v('event:add', { title: `Busy ${n}`, start: new Date(`${busy}T${String(8 + n).padStart(2, '0')}:00:00`).toISOString(), end: new Date(`${busy}T${String(8 + n).padStart(2, '0')}:30:00`).toISOString(), calendarId: 'personal', allDay: false })
    await wait(700)
    await dbl(...corner(await cell(busy)))
    // (No when in these words: "in a month" here was read as a day a month on, and its draft rightly went there.)
    await h.keyboard.type('A very long title for an event that goes on and on past the width of any day in the grid and then some more words after that')
    await wait(300)
    s = await state()
    await shot('month-busy-long')
    const long = await h.evaluate(() => { const pop = document.querySelector('[data-cal-add]'); const form = pop.querySelector('form'); const edge = pop.getBoundingClientRect(); const draft = document.querySelector('[data-cal-level] [data-cal-draft]'); const cellBox = draft?.closest('[data-day]')?.getBoundingClientRect(); const d = draft?.getBoundingClientRect(); return { popWide: form.scrollWidth <= form.clientWidth + 1 && [...form.querySelectorAll('*')].every((el) => { const r = el.getBoundingClientRect(); return !r.width || (r.right <= edge.right + 0.5 && r.left >= edge.left - 0.5) }), draftIn: !!d && !!cellBox && d.right <= cellBox.right + 0.5 && d.left >= cellBox.left - 0.5 } })
    check('a day with 12 things still shows the draft, first in the day', s.draft?.day === busy && s.draft.h > 10, JSON.stringify(s.draft))
    check('a long title stays inside the popover and inside its day', long.popWide && long.draftIn && Math.abs(s.pop.w - 320) < 1 && inside(s), JSON.stringify(long))
    await h.keyboard.press('Meta+a')
    await h.keyboard.press('Backspace')
    await h.keyboard.press('Escape')
    await wait(300)
  }

  if (parts.includes('week')) {
    for (const [key, name] of [['w', 'Week'], ['d', 'Day']]) {
      await toMode(key)
      const day = await h.evaluate(() => { const cols = [...document.querySelectorAll('[data-cal-level] [data-cal-col]')]; const el = cols[Math.min(cols.length - 1, 2)]; const r = el.getBoundingClientRect(); const sc = el.closest('[data-cal-scroll]').getBoundingClientRect(); return { key: el.dataset.calCol, x: r.left + r.width / 2, top: r.top, view: sc.top, viewB: sc.bottom } })
      // A spot in sight with nothing on it: looked for down the column, a hand's width from its right edge.
      const freeSpot = () => h.evaluate(({ key, view, viewB }) => { const el = document.querySelector(`[data-cal-level] [data-cal-col="${key}"]`); const r = el.getBoundingClientRect(); for (let y = view + 60; y < viewB - 140; y += 14) { const x = r.right - 28; if ([0, 30, 60, 90, 110].every((dy) => document.elementFromPoint(x, y + dy) === el)) return { x, y, top: r.top } } return null }, day)
      // The hours start on the small hours, where nothing is planned (a set-up; every act after it is the pointer's or a key's).
      const night = () => h.evaluate(() => { document.querySelector('[data-cal-level] [data-cal-scroll]').scrollTop = 56 * 1.5 })
      await night()
      await wait(150)
      let free = await freeSpot()
      check(`${name}: an empty hour is in sight`, !!free)
      if (!free) continue
      await h.mouse.click(free.x, free.y)
      await wait(300)
      let s = await state()
      check(`${name}: a click picks the day and opens nothing`, !s.pop && !s.draft && await h.evaluate((key) => getComputedStyle(document.querySelector(`[data-cal-level] [data-cal-head="${key}"] > span:last-child`)).boxShadow !== 'none', day.key))
      const opened = await heard(() => film(`${name.toLowerCase()}-open`, () => dbl(free.x, free.y)))
      s = await state()
      await shot(`${name.toLowerCase()}-event`)
      let minute = Math.floor(((free.y - free.top) / 56) * 2) * 30
      check(`${name}: a double-click at a time puts an hour's draft there`, s.draft?.kind === 'event' && s.draft.day === day.key && Math.abs(s.draft.y - (free.top + (minute / 60) * 56 + 1)) < 1.5 && Math.abs(s.draft.h - 54) < 1.5, `draft at ${Math.round(s.draft?.y)}, ${Math.round(s.draft?.h)} tall; minute ${minute}`)
      check(`${name}: the popover is beside it, inside the window, with its point and one sound`, s.pop?.kind === 'event' && inside(s) && apart(s) && !!s.pop.arrow && s.pop.focused && opened.length === 1 && Math.abs(s.pop.w - 320) < 1, `side ${s.pop?.side}; cues ${opened.join()}`)
      await h.keyboard.type('Standup')
      await h.keyboard.press('Enter')
      await wait(600)
      const made = await eventsNamed('Standup')
      const from = made[0] && new Date(made[0].start)
      check(`${name}: ↵ makes it at that time, an hour long`, made.length === 1 && from.getHours() * 60 + from.getMinutes() === minute && new Date(made[0].end) - from === 3600000, `${made.length} made, ${from?.toTimeString().slice(0, 5)}`)
      await h.keyboard.press('Meta+z')
      await wait(500)
      check(`${name}: ⌘Z takes it back`, (await eventsNamed('Standup')).length === 0)
      // A press dragged across the hours.
      await h.mouse.move(free.x, free.y)
      await h.mouse.down()
      await h.mouse.move(free.x, free.y + 40, { steps: 4 })
      await h.mouse.move(free.x, free.y + 112, { steps: 6 })
      await h.mouse.up()
      await wait(450)
      s = await state()
      check(`${name}: a press dragged across two hours draws a draft that long, with its popover`, s.draft?.kind === 'event' && Math.abs(s.draft.h - 110) < 16 && s.pop?.kind === 'event' && apart(s) && inside(s), `${Math.round(s.draft?.h)} tall`)
      await h.keyboard.press('Escape')
      await wait(300)
      // N, and right-click for a task.
      await h.keyboard.press('n')
      await wait(400)
      s = await state()
      check(`${name}: N opens it on the picked day, in sight`, s.pop?.kind === 'event' && s.draft?.day === day.key && s.pop.keyed && inside(s) && s.draft.y >= day.view - 1 && s.draft.b <= day.viewB + 1, `day ${s.draft?.day}; draft ${Math.round(s.draft?.y)} to ${Math.round(s.draft?.b)} in ${Math.round(day.view)} to ${Math.round(day.viewB)}`)
      await h.keyboard.press('Escape')
      await wait(300)
      // ↵ on the picked day, and the header's button: the same popover, on the same day.
      await h.keyboard.press('Enter')
      await wait(500)
      s = await state()
      check(`${name}: ↵ on the picked day opens it`, s.pop?.kind === 'event' && s.draft?.day === day.key && s.pop.focused, `day ${s.draft?.day}`)
      await h.keyboard.press('Escape')
      await wait(300)
      await h.click('[data-cal-new-event]')
      await wait(600)
      s = await state()
      check(`${name}: the header's "New event" opens it on the picked day`, s.pop?.kind === 'event' && s.draft?.day === day.key && inside(s) && apart(s) && s.pop.focused, `day ${s.draft?.day}`)
      await h.keyboard.press('Escape')
      await wait(300)
      // N may have scrolled the hours to bring its draft into sight: an empty hour is looked for again.
      await night()
      await wait(150)
      free = await freeSpot()
      minute = Math.floor(((free.y - free.top) / 56) * 2) * 30
      await h.mouse.move(free.x, free.y)
      await h.mouse.click(free.x, free.y, { button: 'right' })
      await wait(400)
      const offered = await h.evaluate(([x, y]) => ({ lines: [...document.querySelectorAll('[role="menu"] [role="menuitem"]')].map((el) => el.textContent.trim()), under: document.elementFromPoint(x, y)?.outerHTML.slice(0, 120) }), [free.x, free.y])
      check(`${name}: a right-click on an empty hour offers "New event here" and "New task here"`, offered.lines.join() === 'New event here,New task here', JSON.stringify(offered))
      if (!offered.lines.includes('New task here')) { await h.keyboard.press('Escape'); continue }
      await h.locator('[role="menu"] [role="menuitem"]', { hasText: 'New task here' }).click()
      await wait(600)
      s = await state()
      await shot(`${name.toLowerCase()}-task`)
      check(`${name}: right-click, "New task here": a task's draft at that time, the line holding the keys`, s.pop?.kind === 'task' && s.draft?.kind === 'task' && Math.abs(s.draft.y - (free.top + (minute / 60) * 56 + 1)) < 1.5 && s.pop.focused, `${s.pop?.kind}; draft at ${Math.round(s.draft?.y)}; focused ${s.pop?.focused}`)
      await h.keyboard.type(`Water plants ${name}`)
      await h.keyboard.press('Enter')
      await wait(700)
      const task = (await tasksNamed(`Water plants ${name}`))[0]
      const due = task?.dueAt && new Date(task.dueAt)
      check(`${name}: ↵ makes the task at that time`, !!due && due.getHours() * 60 + due.getMinutes() === minute && !task.allDay, `${due?.toTimeString().slice(0, 5)}`)
      await h.keyboard.press('Meta+z')
      await wait(500)
      await h.keyboard.press('Meta+a')
      await h.keyboard.press('Backspace')
      await h.keyboard.press('Escape')
      await wait(300)
      // The all-day lane: an empty part of it, on any day shown (a day whose lane is full of its own things has none).
      const lane = await h.evaluate(() => { for (const el of document.querySelectorAll('[data-cal-level] [data-cal-allday]')) { const r = el.getBoundingClientRect(); for (const [x, y] of [[r.right - 6, r.bottom - 5], [r.left + r.width / 2, r.bottom - 5], [r.right - 6, r.top + 6]]) if (document.elementFromPoint(x, y) === el) return { x, y } } return null })
      if (!lane) console.log(`NOTE  ${name}: every all-day lane shown is full of its own things, so there is no empty part to double-click`)
      else {
        await dbl(lane.x, lane.y)
        s = await state()
        check(`${name}: a double-click in the all-day lane starts an all-day event there`, s.draft?.kind === 'event' && s.pop?.kind === 'event' && /all day/i.test(s.pop.said) && inside(s) && apart(s), s.pop?.said)
        await h.keyboard.press('Escape')
        await wait(300)
      }
    }
    // Upcoming: an island in the left panel, and nothing floating over the days.
    const up = await h.evaluate(() => ({ inLeft: !!document.querySelector('[data-cal-side] [data-cal-upcoming]'), anywhere: document.querySelectorAll('[data-cal-upcoming]').length, floating: !!document.querySelector('[data-cal-right]'), toggle: !!document.querySelector('[data-cal-side-toggle]') }))
    check('Upcoming is an island in the left panel (or absent with nothing coming), never a box over the days', !up.floating && !up.toggle && up.anywhere === (up.inLeft ? 1 : 0), JSON.stringify(up))
  }

  if (parts.includes('narrow')) {
    for (const [w, hh] of [[560, 400], [1000, 700]]) {
      await c.size(w, hh)
      await wait(500)
      for (const [key, name] of [['m', 'Month'], ['w', 'Week']]) {
        await toMode(key)
        const at = await h.evaluate((month) => {
          if (month) { const cells = [...document.querySelectorAll('[data-cal-level] [data-day]')].filter((el) => { const r = el.getBoundingClientRect(); const f = el.closest('[data-cal-level]').getBoundingClientRect(); return r.top >= f.top && r.bottom <= f.bottom }); const el = cells[Math.floor(cells.length / 2) + 2]; const r = el.getBoundingClientRect(); return { x: r.right - 4, y: r.bottom - 4 } }
          const cols = [...document.querySelectorAll('[data-cal-level] [data-cal-col]')]; const el = cols.at(-1); el.closest('[data-cal-scroll]').scrollTop = 56 * 1.5; const r = el.getBoundingClientRect(); const sc = el.closest('[data-cal-scroll]').getBoundingClientRect()
          for (let y = sc.top + 12; y < sc.bottom - 40; y += 10) if ([0, 20].every((dy) => document.elementFromPoint(r.right - 28, y + dy) === el)) return { x: r.right - 28, y }
          return null
        }, key === 'm')
        if (!at) { check(`${w} by ${hh}, ${name}: an empty place is in sight`, false); continue }
        await dbl(at.x, at.y)
        const s = await state()
        await shot(`narrow-${w}-${name.toLowerCase()}`)
        const cut = await h.evaluate(() => { const pop = document.querySelector('[data-cal-add]'); const sized = pop?.querySelector('[data-cal-add-sized]'); return !sized || sized.scrollHeight > sized.clientHeight + 1 })
        check(`${w} by ${hh}, ${name}: nothing in it is cut off`, !cut)
        check(`${w} by ${hh}, ${name}: the popover is whole inside the window`, !!s.pop && s.pop.x >= 11.5 && s.pop.r <= s.win.w - 11.5 && s.pop.b <= s.win.h - 11.5 && s.pop.y >= 51.5 && s.pop.focused, JSON.stringify(s.pop && [Math.round(s.pop.x), Math.round(s.pop.y), Math.round(s.pop.r), Math.round(s.pop.b), s.pop.side]))
        check(`${w} by ${hh}, ${name}: never over what it is about`, s.draft ? apart(s) : true, `side ${s.pop?.side}`)
        await h.keyboard.press('Escape')
        await wait(300)
      }
    }
  }

  // The fingers on a trackpad, as the page gets them on a Mac: wheel steps with ctrlKey, a frame apart (as qa/cal-snap.mjs sends them).
  // It answers with what is lit in the very moment the last step is sent: read a round trip later, on a busy machine the
  // light of a short pinch (which goes a quarter of a second after the fingers stop) had already gone.
  const pinch = (x, y, dy, n) => h.evaluate(([x, y, dy, n]) => new Promise((res) => { let i = 0; const read = () => ({ lit: [...document.querySelectorAll('[data-cal-lit]')].map((el) => el.dataset.monthWeek ? `week ${el.dataset.monthWeek}` : el.dataset.calCol ? `col ${el.dataset.calCol}` : el.dataset.calHead ? `head ${el.dataset.calHead}` : `allday ${el.dataset.calAllday}`), wash: (() => { const el = document.querySelector('[data-month-week][data-cal-lit], [data-cal-col][data-cal-lit]'); return el ? getComputedStyle(el, '::after').backgroundColor : '' })(), landed: !!document.querySelector('[data-cal-landed]'), mode: document.querySelector('[data-cal-mode]')?.getAttribute('data-cal-mode') }); const send = () => { (document.elementFromPoint(x, y) ?? document.body).dispatchEvent(new WheelEvent('wheel', { deltaY: dy, ctrlKey: true, clientX: x, clientY: y, bubbles: true, cancelable: true })); if (++i < n) setTimeout(send, 14); else res(read()) }; send() }), [x, y, dy, n])
  const lights = () => h.evaluate(() => ({ lit: [...document.querySelectorAll('[data-cal-lit]')].map((el) => el.dataset.monthWeek ? `week ${el.dataset.monthWeek}` : el.dataset.calCol ? `col ${el.dataset.calCol}` : el.dataset.calHead ? `head ${el.dataset.calHead}` : `allday ${el.dataset.calAllday}`), wash: (() => { const el = document.querySelector('[data-month-week][data-cal-lit], [data-cal-col][data-cal-lit]'); return el ? getComputedStyle(el, '::after').backgroundColor : '' })(), landed: !!document.querySelector('[data-cal-landed]'), mode: document.querySelector('[data-cal-mode]')?.getAttribute('data-cal-mode') }))
  const weekRow = () => h.evaluate(() => { const frame = document.querySelector('[data-cal-level]').getBoundingClientRect(); const rows = [...document.querySelectorAll('[data-cal-level] [data-month-week]')].filter((el) => { const r = el.getBoundingClientRect(); return r.top >= frame.top && r.bottom <= frame.bottom }); const el = rows[2]; const r = el.getBoundingClientRect(); return { key: el.dataset.monthWeek, x: r.left + r.width / 2, y: r.top + r.height / 2 } })

  if (parts.includes('pinch')) {
    await toMode('m')
    const row = await weekRow()
    // Nothing is lit while a pinch opens a block, at any frame: the block grows into the next level from under the fingers (the
    // user, 13 Nov: the light read as "the flash right before zooming in"). A short pinch, short of the change, first.
    let l = await pinch(row.x, row.y, -3, 3)
    await shot('pinch-month-lit')
    check('a pinch over a week in Month lights nothing, and the view stays on Month', l.lit.length === 0 && l.mode === 'month', `${l.lit.join()}; wash ${l.wash}`)
    await wait(900)
    l = await lights()
    check('the pinch come to nothing, nothing is lit and the view is still Month', l.lit.length === 0 && l.mode === 'month', l.lit.join())
    // The whole pinch: the week opens, and no frame of it shows a light on a block or on the level arriving.
    await h.evaluate(() => { window.__lights = []; const tick = () => { window.__lights.push({ landed: !!document.querySelector('[data-cal-landed], [data-cal-lit]'), mode: document.querySelector('[data-cal-mode]')?.getAttribute('data-cal-mode') }); if (window.__lights.length < 90) requestAnimationFrame(tick) }; requestAnimationFrame(tick) })
    await film('pinch-month-week', async () => { await pinch(row.x, row.y, -6, 8); await wait(500) }, 9)
    await wait(900)
    const seen = await h.evaluate(() => window.__lights)
    l = await lights()
    check('pinched on, the week opens, and not one frame of it shows a light', l.mode === 'week' && seen.length > 20 && !seen.some((one) => one.landed) && !l.landed && l.lit.length === 0, `${seen.filter((one) => one.landed).length} of ${seen.length} frames lit; landed now ${l.landed}; lit ${l.lit.join()}`)
    // A day in the week.
    const col = await h.evaluate(() => { const el = [...document.querySelectorAll('[data-cal-level] [data-cal-col]')][3]; const r = el.getBoundingClientRect(); const sc = el.closest('[data-cal-scroll]').getBoundingClientRect(); return { key: el.dataset.calCol, x: r.left + r.width / 2, y: sc.top + sc.height / 2 } })
    l = await pinch(col.x, col.y, -3, 3)
    await shot('pinch-week-lit')
    check('a pinch over a day in Week lights nothing: not its head, its all-day line or its hours', l.lit.length === 0 && l.mode === 'week', l.lit.join())
    await wait(900)
    check('and nothing is lit when the pinch comes to nothing', (await lights()).lit.length === 0)
    await pinch(col.x, col.y, -6, 8)
    await wait(1300)
    l = await lights()
    check('pinched on, the day opens, and no light is left behind', l.mode === 'day' && !l.landed && l.lit.length === 0, JSON.stringify(l))
    // Motion off: nothing is played, and nothing stays lit.
    await toMode('m')
    await h.evaluate(() => document.documentElement.setAttribute('data-motion', 'off'))
    const still = await weekRow()
    await pinch(still.x, still.y, -6, 8)
    await wait(500)
    l = await lights()
    check('with Motion off the week is simply there, with no light left', l.mode === 'week' && !l.landed && l.lit.length === 0, JSON.stringify(l))
    await h.evaluate(() => document.documentElement.removeAttribute('data-motion'))
  }

  if (parts.includes('home')) {
    await c.size(1440, 900)
    await v('settings:set', { hintRate: 0, homeCalendar: true })
    for (const [view, name] of [['home', 'Home'], ['day', 'the Journal']]) {
      await go(view)
      await wait(1600)
      const key = dayKeyOf(4)
      const sel = `[data-month-own] [data-day="${key}"]`
      const there = await h.locator(sel).count()
      check(`${name}'s month is on the page`, there === 1, `${there} of ${sel}`)
      if (!there) continue
      await h.locator(sel).scrollIntoViewIfNeeded()
      await wait(500)
      const box = () => h.evaluate((sel) => { const el = document.querySelector(sel); const r = el.getBoundingClientRect(); return { r: r.right, b: r.bottom, bg: getComputedStyle(el).backgroundColor, mark: getComputedStyle(el.querySelector('[data-day-number]')).boxShadow } }, sel)
      const rest = await box()
      check(`${name}'s month: no "+" waits on a day`, await h.evaluate(() => document.querySelectorAll('[data-day-add]').length === 0))
      await h.mouse.move(rest.r - 5, rest.b - 5)
      await wait(300)
      check(`${name}'s month: a day under the pointer takes the faint fill`, (await box()).bg !== rest.bg, `${rest.bg} to ${(await box()).bg}`)
      await h.mouse.click(rest.r - 5, rest.b - 5)
      await wait(400)
      let s = await state()
      check(`${name}'s month: a click picks the day and opens nothing`, (await box()).mark !== 'none' && !s.pop && await h.evaluate(() => !document.querySelector('[data-day-side]')), `mark ${(await box()).mark.slice(0, 30)}`)
      const opened = await heard(() => dbl(rest.r - 5, rest.b - 5))
      s = await state()
      await shot(`${view}-month-task`)
      check(`${name}'s month: a double-click starts a task there, in the same popover, never the side panel`, s.pop?.kind === 'task' && s.draft?.kind === 'task' && s.draft.day === key && Math.abs(s.pop.w - 320) < 1 && s.pop.focused && await h.evaluate(() => !document.querySelector('[data-day-side]')), JSON.stringify({ kind: s.pop?.kind, day: s.draft?.day, w: s.pop?.w }))
      check(`${name}'s month: it is inside the window, beside its draft, with its point, and opening made one sound`, inside(s) && apart(s) && !!s.pop?.arrow && opened.length === 1, `side ${s.pop?.side}; ${JSON.stringify(s.pop && [Math.round(s.pop.x), Math.round(s.pop.y), Math.round(s.pop.r), Math.round(s.pop.b)])}; cues ${opened.join()}`)
      await h.keyboard.type(`${name} month task`)
      await h.keyboard.press('Enter')
      await wait(800)
      s = await state()
      const made = (await tasksNamed(`${name} month task`))[0]
      check(`${name}'s month: ↵ makes the task on that day, the popover goes, and a notice says so with Undo`, !s.pop && !s.draft && !!made?.dueAt && dayKeyOf(4) === `${new Date(made.dueAt).getFullYear()}-${String(new Date(made.dueAt).getMonth() + 1).padStart(2, '0')}-${String(new Date(made.dueAt).getDate()).padStart(2, '0')}` && /Added for/.test(s.toast) && /Undo/.test(s.toast), `${made?.dueAt}; ${s.toast.slice(0, 60)}`)
      await h.keyboard.press('Meta+z')
      await wait(700)
      s = await state()
      check(`${name}'s month: ⌘Z takes it back and the words come back to the line`, (await tasksNamed(`${name} month task`)).length === 0 && s.pop?.words === `${name} month task`, `${(await tasksNamed(`${name} month task`)).length} left; ${s.pop?.words}`)
      await h.keyboard.press('Meta+a')
      await h.keyboard.press('Backspace')
      await h.keyboard.press('Escape')
      await wait(300)
      await h.mouse.click(rest.r - 5, rest.b - 5, { button: 'right' })
      await wait(400)
      const lines = await h.evaluate(() => [...document.querySelectorAll('[role="menu"] [role="menuitem"]')].map((el) => el.textContent.trim()))
      check(`${name}'s month: a right-click offers the Calendar's two lines`, lines.join() === 'New event here,New task here', lines.join())
      if (lines.includes('New event here')) {
        await h.locator('[role="menu"] [role="menuitem"]', { hasText: 'New event here' }).click()
        await wait(600)
        s = await state()
        check(`${name}'s month: "New event here" opens the popover on Event, the line holding the keys`, s.pop?.kind === 'event' && s.draft?.kind === 'event' && s.pop.focused, `${s.pop?.kind}; focused ${s.pop?.focused}`)
        await h.keyboard.press('Escape')
        await wait(300)
      } else await h.keyboard.press('Escape')
    }
  }

  const SEL = {
    event: '[data-cal-level] [data-cal-event], [data-cal-level] [data-cal-event-chip]',
    task: '[data-cal-level] [data-cal-block], [data-cal-level] [data-plan-task], [data-cal-level] [data-cal-untimed]'
  }
  /** The thing on the page, by its name: where it is, and whether it wears the ring of the one picked. */
  const thing = (sel, label, scroll = true) => h.evaluate(([sel, label, scroll]) => {
    const el = [...document.querySelectorAll(sel)].find((one) => one.textContent.includes(label))
    if (!el) return null
    if (scroll) el.scrollIntoView({ block: 'center' })
    const r = el.getBoundingClientRect()
    const style = getComputedStyle(el)
    return { x: r.left, y: r.top, w: r.width, h: r.height, r: r.right, b: r.bottom, ring: `${style.outlineStyle} ${style.outlineWidth}` }
  }, [sel, label, scroll])
  const side = () => h.evaluate(() => document.querySelector('[data-day-side]')?.getAttribute('data-day-side') ?? null)
  const openOn = () => h.evaluate(() => { const pop = document.querySelector('[data-cal-add]'); return pop ? { id: pop.getAttribute('data-cal-open'), page: !!pop.querySelector('[data-cal-open-page]') } : null })
  const clear = (s, box) => s.pop && box && (s.pop.x >= box.r - 0.5 || s.pop.r <= box.x + 0.5 || s.pop.y >= box.b - 0.5 || s.pop.b <= box.y + 0.5)
  const shut = async () => { await h.keyboard.press('Escape'); await wait(450) }
  let thingsDay = null
  /** An event and a task for a coming day, made once, the way a person makes them: what the open and rows parts are about. */
  const things = async () => {
    await c.size(1440, 900)
    await go('calendar')
    await wait(700)
    await toMode('m')
    if ((await eventsNamed('Opens here')).length) return
    // On the first of the coming days with nothing on it, so the month has room to name both.
    const free = await h.evaluate((keys) => keys.find((key) => { const el = document.querySelector(`[data-cal-level] [data-day="${key}"]`); return el && !el.querySelector('[data-plan-task], [data-cal-event-chip], [data-plan-more], [data-plan-more-events], [data-mark-flag]') }) ?? keys[0], [1, 2, 3, 4, 5, 6, 7, 8, 9].map(dayKeyOf))
    console.log(`NOTE  the event and the task are made on ${free}`)
    thingsDay = free
    for (const [kind, words] of [['event', 'Opens here 2pm'], ['task', 'Opened task 4pm']]) {
      await dbl(...corner(await cell(free)))
      if (kind === 'task') { await h.click('[data-cal-add] [data-day-side-kind="task"]'); await wait(300) }
      await h.keyboard.type(words, { delay: 8 })
      await h.keyboard.press('Enter')
      await wait(900)
    }
  }
  /** A view, turned to the day the things are on: from today, forward a week or a day at a time until one of them is drawn. */
  const reach = async (key, sel = SEL.event, label = 'Opens here') => {
    await toMode(key)
    await h.keyboard.press('t')
    await wait(600)
    for (let n = 0; key !== 'm' && n < 12 && !(await thing(sel, label)); n++) { await h.keyboard.press('ArrowRight'); await wait(700) }
  }
  /** The popover opened on a thing in the week, by a double-click clear of a task's tick. */
  const openIn = async (kind, label) => {
    await reach('w', SEL[kind], label)
    if (!(await thing(SEL[kind], label))) return false
    await wait(300)
    const now = await thing(SEL[kind], label, false)
    await h.mouse.dblclick(now.x + Math.max(16, Math.min(now.w * 0.6, now.w - 8)), now.y + Math.min(now.h / 2, 10))
    await wait(700)
    return true
  }

  if (parts.includes('open')) {
    await things()
    {
      // A time alone in a new event's words is on the day its draft is on, as a task's is: never today's.
      const made = (await eventsNamed('Opens here'))[0]
      const on = made && new Date(made.start)
      const key = on && `${on.getFullYear()}-${String(on.getMonth() + 1).padStart(2, '0')}-${String(on.getDate()).padStart(2, '0')}`
      if (thingsDay) check('"Opens here 2pm" written on a coming day\'s draft is made on that day at 14:00, not today', key === thingsDay && on.getHours() === 14, `${made?.start} for ${thingsDay}`)
    }
    /** Every way of opening one thing, where it is drawn: `sel` finds it, `label` is its name. */
    const ways = async (name, kind, sel, label, { menu = true, bar = true } = {}) => {
      let box = await thing(sel, label)
      check(`${name}: the ${kind} is on the page`, !!box, sel.slice(0, 50))
      if (!box) return
      await wait(300)
      box = await thing(sel, label, false)
      // Clear of a task's tick at its left and of a block's lower edge, which stretches it.
      const at = [box.x + Math.max(24, Math.min(box.w * 0.6, box.w - 8)), box.y + Math.min(box.h / 2, 10)]
      const picks = await heard(() => shiftClick(...at))
      box = await thing(sel, label, false)
      let s = await state()
      check(`${name}: a ⇧-click on the ${kind} picks it, ringed, and opens nothing`, box.ring === 'solid 2px' && !s.pop && !(await side()) && !picks.includes('open'), `ring ${box.ring}; cues ${picks.join() || 'none'}`)
      const cuesOpen = await heard(() => film(`open-${name}-${kind}`.toLowerCase().replace(/[^a-z-]/g, ''), () => h.mouse.click(...at)))
      box = await thing(sel, label, false)
      s = await state()
      let on = await openOn()
      await shot(`open-${name}-${kind}`.toLowerCase().replace(/[^a-z-]/g, ''))
      check(`${name}: a click opens the same popover on the ${kind}, 320 wide, its name in the line with the keys`, s.pop?.kind === kind && !!on?.id && Math.abs(s.pop.w - 320) < 1 && !!s.pop.words?.includes(label) && s.pop.focused, `${s.pop?.w}px; words ${s.pop?.words}; focused ${s.pop?.focused}`)
      check(`${name}: it is beside the ${kind}, never over it, inside the window, with its point, and made one sound`, inside(s) && clear(s, box) && !!s.pop?.arrow && cuesOpen.filter((cue) => cue === 'open').length === 1, `side ${s.pop?.side}; cues ${cuesOpen.join()}; ${JSON.stringify(s.pop && [Math.round(s.pop.x), Math.round(s.pop.y), Math.round(s.pop.r), Math.round(s.pop.b)])} by ${JSON.stringify([Math.round(box.x), Math.round(box.y), Math.round(box.r), Math.round(box.b)])}`)
      check(`${name}: the side panel stays shut, and where the ${kind} is reads under the line`, !(await side()) && (kind === 'event' ? /14:00/ : /16:00/).test(s.pop?.said ?? ''), `${await side()}; ${s.pop?.said}`)
      await shut()
      check(`${name}: Esc closes it and the ${kind} stays picked`, !(await state()).pop && (await thing(sel, label, false))?.ring === 'solid 2px')
      // ↵ on the one picked.
      await shiftClick(...at)
      await wait(250)
      await h.keyboard.press('Enter')
      await wait(650)
      s = await state()
      on = await openOn()
      check(`${name}: ↵ on the picked ${kind} opens it`, s.pop?.kind === kind && !!on?.id && !(await side()), `${s.pop?.kind}; ${on?.id}`)
      await shut()
      if (menu) {
        await h.mouse.click(...at, { button: 'right' })
        await wait(500)
        const line = h.locator('[role="menu"] [role="menuitem"]', { hasText: /^Open/ }).first()
        const there = await line.count()
        if (there) await line.click()
        else await h.keyboard.press('Escape')
        await wait(700)
        s = await state()
        on = await openOn()
        check(`${name}: right-click, "Open" opens the ${kind}`, !!there && s.pop?.kind === kind && !!on?.id && !(await side()), `${there} line; ${s.pop?.kind}`)
        await shut()
      }
      if (bar) {
        await h.mouse.click(...at)
        await wait(250)
        await h.keyboard.press('Meta+k')
        await wait(500)
        await h.keyboard.type('open', { delay: 15 })
        await wait(700)
        const first = await h.locator('[data-search-at]').first().innerText().catch(() => '')
        if (/open/i.test(first) && first.includes(label.slice(0, 8))) await h.keyboard.press('Enter')
        else await h.keyboard.press('Escape')
        await wait(900)
        s = await state()
        on = await openOn()
        check(`${name}: ⌘K, "Open" opens the ${kind}`, s.pop?.kind === kind && !!on?.id && !(await side()), `first row: ${first.replace(/\s+/g, ' ').slice(0, 70)}`)
        await shut()
      }
      // "Open" in the popover: its whole page, in the side panel.
      await h.mouse.dblclick(...at)
      await wait(650)
      const page = h.locator('[data-cal-add] [data-cal-open-page]')
      const pages = await heard(async () => { if (await page.count()) await page.click() })
      s = await state()
      check(`${name}: "Open" in the popover goes to the ${kind}'s page in the side panel, and the popover goes`, (await side()) === kind && !s.pop, `${await side()}; cues ${pages.join()}`)
      await h.keyboard.press('Escape')
      await wait(500)
      if (await side()) { await h.keyboard.press('Escape'); await wait(500) }
      check(`${name}: Esc closes the page`, !(await side()))
    }
    // OPEN=month,week,day,rest: the part in shorter runs, each well under a minute and a half (all four by default).
    const only = (process.env.OPEN ?? 'month,week,day,rest').split(',')
    for (const [key, name] of [['m', 'Month'], ['w', 'Week'], ['d', 'Day']]) {
      if (!only.includes(name.toLowerCase())) continue
      await reach(key)
      await ways(name, 'event', SEL.event, 'Opens here')
      await ways(name, 'task', SEL.task, 'Opened task')
    }
    if (only.includes('rest')) {
    // A change is kept as it is made, said with Undo, and ⌘Z takes it back.
    await reach('w')
    for (const [kind, label, next] of [['event', 'Opens here', 'Opens renamed'], ['task', 'Opened task', 'Opened anew']]) {
      const box = await thing(SEL[kind], label)
      if (!box) { check(`a name typed over the ${kind}: it is on the page`, false); continue }
      await wait(300)
      const now = await thing(SEL[kind], label, false)
      await h.mouse.dblclick(now.x + Math.max(24, now.w * 0.6), now.y + Math.min(now.h / 2, 10))
      await wait(650)
      await h.keyboard.press('Meta+a')
      await h.keyboard.type(next, { delay: 8 })
      await h.keyboard.press('Enter')
      await wait(900)
      let s = await state()
      const named = async (title) => kind === 'event' ? (await eventsNamed(title)).length : (await tasksNamed(title)).length
      check(`a name typed over the ${kind}, then ↵: it is renamed, the popover goes, and a notice offers Undo`, !s.pop && (await named(next)) === 1 && (await named(label)) === 0 && /Renamed/.test(s.toast) && /Undo/.test(s.toast), `${await named(next)} named anew; ${s.toast.slice(0, 60)}`)
      await h.keyboard.press('Meta+z')
      await wait(800)
      check(`  and ⌘Z gives the ${kind} its name back`, (await named(label)) === 1 && (await named(next)) === 0, `${await named(label)} with the old name`)
    }
    // Words that hold a time move it, as a new one's words place it.
    {
      const box = await thing(SEL.event, 'Opens here')
      await wait(300)
      const now = box && await thing(SEL.event, 'Opens here', false)
      if (now) {
        await h.mouse.dblclick(now.x + Math.max(24, now.w * 0.6), now.y + Math.min(now.h / 2, 10))
        await wait(650)
        await h.keyboard.type(' 9am', { delay: 8 })
        await wait(300)
        const said = (await state()).pop?.said
        await h.keyboard.press('Enter')
        await wait(900)
        const moved = (await eventsNamed('Opens here'))[0]
        const s = await state()
        check('"9am" typed after an event\'s name reads back as its new time, and ↵ moves it there, said with Undo', /\b0?9:00/.test(said ?? '') && new Date(moved?.start).getHours() === 9 && /Moved to/.test(s.toast) && /Undo/.test(s.toast), `${said}; ${moved?.start}; ${s.toast.slice(0, 50)}`)
        await h.keyboard.press('Meta+z')
        await wait(800)
        check('  and ⌘Z puts it back at 14:00', new Date((await eventsNamed('Opens here'))[0]?.start).getHours() === 14)
      } else check('"9am" typed after an event\'s name: it is on the page', false)
    }
    // Upcoming, in the left panel: a row opens the same popover, tied to the row.
    for (const [kind, label] of [['event', 'Opens here'], ['task', 'Opened task']]) {
      const row = await thing('[data-cal-upcoming-row]', label)
      if (!row) { check(`Upcoming: the ${kind}'s row is there`, false); continue }
      await wait(300)
      const at = await thing('[data-cal-upcoming-row]', label, false)
      const cuesRow = await heard(() => h.mouse.click(at.x + at.w / 2, at.y + at.h / 2))
      const s = await state()
      const on = await openOn()
      check(`Upcoming: a click on the ${kind}'s row opens the same popover, tied to the row, with one sound, and no side panel`, s.pop?.kind === kind && !!on?.id && clear(s, await thing('[data-cal-upcoming-row]', label, false)) && inside(s) && cuesRow.filter((cue) => cue === 'open').length === 1 && !(await side()), `side ${s.pop?.side}; cues ${cuesRow.join()}`)
      await shut()
    }
    // 560 by 400: the popover on a thing is whole, inside the window, and never over it.
    await c.size(560, 400)
    await wait(700)
    await reach('w')
    for (const [kind, label] of [['event', 'Opens here'], ['task', 'Opened task']]) {
      const box = await thing(SEL[kind], label)
      if (!box) { console.log(`NOTE  560 by 400: the ${kind} is not drawn by name at this size`); continue }
      await wait(300)
      const now = await thing(SEL[kind], label, false)
      await h.mouse.dblclick(now.x + Math.max(16, now.w * 0.6), now.y + Math.min(now.h / 2, 10))
      await wait(700)
      const s = await state()
      // What it holds under its top row scrolls inside it when the window is this short; nothing else may run past its edges.
      const cut = await h.evaluate(() => { const pop = document.querySelector('[data-cal-add]'); if (!pop) return null; const box = pop.getBoundingClientRect(); const sized = pop.querySelector('[data-cal-add-sized]'); const inner = sized.getBoundingClientRect(); return { out: [...pop.querySelectorAll('textarea, input, button, p')].filter((el) => el.offsetParent && !sized.contains(el) && (el.getBoundingClientRect().bottom > box.bottom + 0.5 || el.getBoundingClientRect().right > box.right + 0.5)).length + (inner.bottom > box.bottom + 0.5 || inner.right > box.right + 0.5 ? 1 : 0), scrolls: sized.scrollHeight > sized.clientHeight + 1 } })
      await shot(`open-560-${kind}`)
      check(`560 by 400: the popover on the ${kind} is inside the window, never over it, with nothing cut (what does not fit scrolls inside it)`, inside(s) && clear(s, await thing(SEL[kind], label, false)) && cut?.out === 0, `side ${s.pop?.side}; ${cut?.out} cut; scrolls ${cut?.scrolls}; ${JSON.stringify(s.pop && [Math.round(s.pop.x), Math.round(s.pop.y), Math.round(s.pop.r), Math.round(s.pop.b)])}`)
      await shut()
    }
    await c.size(1440, 900)
    await wait(500)
    // Home's month and the Journal's: a task's line is picked by a click and opens the same way.
    await v('settings:set', { hintRate: 0, homeCalendar: true })
    for (const [view, name] of [['home', 'Home\'s month'], ['day', 'the Journal\'s month']]) {
      await go(view)
      await wait(1600)
      const there = await h.locator('[data-month-own]').count()
      if (!there) { check(`${name} is on the page`, false); continue }
      await ways(name, 'task', '[data-month-own] [data-plan-task]', 'Opened task')
    }
    }
  }

  if (parts.includes('rows')) {
    await things()
    /** The popover's box, the rows it holds, and whether anything in it runs past its own edges. */
    const rows = () => h.evaluate(() => {
      const pop = document.querySelector('[data-cal-add]')
      if (!pop) return null
      const box = pop.getBoundingClientRect()
      const sized = pop.querySelector('[data-cal-add-sized]')
      return {
        w: box.width, h: box.height, x: box.left, y: box.top, r: box.right, b: box.bottom,
        quiet: [...pop.querySelectorAll('[data-quiet-row]')].map((el) => `${el.dataset.quietRow}${el.dataset.open !== undefined ? ':open' : ''}`),
        said: Object.fromEntries([...pop.querySelectorAll('[data-quiet-row]')].map((el) => [el.dataset.quietRow, el.querySelector('[data-quiet-said]')?.textContent ?? ''])),
        place: !!pop.querySelector('[data-event-rows] input[aria-label="Place"], [data-event-rows] input[placeholder="Place"]'), people: !!pop.querySelector('[data-event-rows] [data-event-people]'),
        day: !!pop.querySelector('[data-task-rows] button, [data-task-rows] [data-date-picker]'), tags: !!pop.querySelector('[data-task-rows] [data-task-tags] input'),
        wide: [...pop.querySelectorAll('*')].filter((el) => el.offsetParent && !el.closest('[data-slot="popover-arrow"]') && !el.querySelector(':scope > [data-slot="popover-arrow"]') && el.getBoundingClientRect().right > box.right + 0.5).length,
        past: [...pop.querySelectorAll('*')].filter((el) => el.offsetParent && !el.closest('[data-slot="popover-arrow"]') && !el.querySelector(':scope > [data-slot="popover-arrow"]') && el.getBoundingClientRect().right > box.right + 0.5).slice(0, 3).map((el) => `${el.tagName.toLowerCase()}${[...el.attributes].filter((a) => a.name.startsWith('data-')).map((a) => `[${a.name}]`).join('')} ${Math.round((el.getBoundingClientRect().right - box.right) * 10) / 10}px`),
        scrolls: sized ? sized.scrollHeight > sized.clientHeight + 1 : false, mask: sized ? getComputedStyle(sized).maskImage !== 'none' : false
      }
    })
    /** The islands at or in `sel`: whether each has its heading, how many rows it holds, and its look (class, corner, fill, edge). */
    const islandOf = (sel) => h.evaluate((sel) => {
      const el = document.querySelector(sel)
      if (!el) return null
      const all = el.closest('.mf-island') ? [el.closest('.mf-island')] : [...el.querySelectorAll('.mf-island')]
      return all.map((box) => { const st = getComputedStyle(box); return { headed: !!box.parentElement?.querySelector(':scope > div > h2')?.textContent.trim(), rows: box.children.length, look: [box.className, st.borderRadius, st.backgroundColor, st.borderColor, st.borderWidth].join(' | ') } })
    }, sel)
    const islands = {}
    const theEvent = async () => (await eventsNamed('Opens here'))[0]
    const fits = (r) => r && r.x >= 11.5 && r.y >= 51.5 && r.r <= innerW - 11.5 && r.b <= innerH - 11.5
    let innerW = 1440
    let innerH = 900
    if (await openIn('event', 'Opens here')) {
      let r = await rows()
      await shot('rows-event')
      check('an open event has its quiet rows: calendar, place, people, reminder and repeat, each one line', r?.quiet.join() === 'calendar,remind,repeat' && r.place && r.people, JSON.stringify(r && { quiet: r.quiet, place: r.place, people: r.people }))
      // Display's anatomy: every row's name on one left edge, and every row's value (the fields of Calendar, Reminder and
      // Repeat, the place, the people) on one edge of its own to the right of them.
      const edges = await h.evaluate(() => { const pop = document.querySelector('[data-cal-add]'); const left = (el) => el ? Math.round(el.getBoundingClientRect().left * 10) / 10 : null; return { names: [...pop.querySelectorAll('[data-quiet-row] > button > :first-child, [data-event-rows] .mf-island > :not([data-quiet-row]) > :first-child')].map(left), values: [...pop.querySelectorAll('[data-quiet-row] > button > :last-child, [data-event-rows] input[placeholder="Place"], [data-event-people] > :first-child')].map(left) } })
      const spread = (all) => Math.max(...all) - Math.min(...all)
      check('the rows\' names start on one left edge, and their values (each in its field) on one edge to their right (within 1px)', edges.names.length === 5 && edges.values.length === 5 && spread(edges.names) <= 1 && spread(edges.values) <= 1 && edges.values[0] > edges.names[0] + 40, JSON.stringify(edges))
      islands.event = await islandOf('[data-cal-add] [data-event-rows]')
      const shutHeight = r?.h
      // The reminder: a line that opens its choices in place; the width is one, the height follows.
      // Every height the popover is drawn at for a second and a half from here. (With pictures being taken the page draws
      // few frames, so the steps are counted only on a run without them.)
      await h.evaluate(() => { window.__h = []; const pop = document.querySelector('[data-cal-add]'); const t0 = performance.now(); const tick = () => { window.__h.push(Math.round(pop.getBoundingClientRect().height)); if (performance.now() - t0 < 1500) requestAnimationFrame(tick) }; requestAnimationFrame(tick) })
      await film('rows-remind-open', async () => { await h.click('[data-cal-add] [data-quiet-row="remind"] > button'); await wait(1000) }, 8)
      r = await rows()
      const heights = await h.evaluate(() => [...new Set(window.__h)])
      check(`"Reminder" opens its choices in place: the width stays 320, the height grows${dir ? '' : ' through steps'}, and it stays inside the window`, r?.quiet.includes('remind:open') && Math.abs(r.w - 320) < 1 && r.h > shutHeight + 20 && (!!dir || heights.length > 3) && fits(r) && r.wide === 0, `${shutHeight} to ${r?.h}px through ${heights.length} heights; ${r?.w}px wide; ${r?.wide} past its edge`)
      await shot('rows-remind')
      const before = (await theEvent())?.remind
      await h.click('[data-cal-add] [data-remind="30"]')
      await wait(900)
      let s = await state()
      r = await rows()
      check('a reminder picked is kept at once, said with Undo, and its line says it', (await theEvent())?.remind === 30 && /Reminds you/.test(s.toast) && /Undo/.test(s.toast) && /30 minutes/.test(r?.said.remind ?? '') && !!s.pop, `${(await theEvent())?.remind}; ${s.toast.slice(0, 50)}; ${r?.said.remind}`)
      await h.keyboard.press('Meta+z')
      await wait(900)
      check('  and ⌘Z takes it back', (await theEvent())?.remind === before, `${(await theEvent())?.remind} was ${before}`)
      // One row open at a time: Repeat opens, Reminder folds.
      await h.click('[data-cal-add] [data-quiet-row="repeat"] > button')
      await wait(700)
      r = await rows()
      check('"Repeat" opens its choices and "Reminder" stays as it is (each row opens and closes itself alone, so a row pressed under an open one does not move), the width the same', r?.quiet.join() === 'calendar,remind:open,repeat:open' && Math.abs(r.w - 320) < 1 && r.wide === 0 && fits(r) && await h.locator('[data-cal-add] [data-repeat-choices] [data-repeat]').count() >= 5, JSON.stringify(r?.quiet))
      await h.click('[data-cal-add] [data-quiet-row="repeat"] > button')
      await wait(500)
      // The place: the field its page has, written in where it is.
      const place = h.locator('[data-cal-add] [data-event-rows] input[placeholder="Place"], [data-cal-add] [data-event-rows] input[aria-label="Place"]').first()
      await place.click()
      await h.keyboard.type('Cafe on the corner', { delay: 8 })
      await h.keyboard.press('Enter')
      await wait(900)
      s = await state()
      check('a place typed in its row is kept, said with Undo, and read back under the line', (await theEvent())?.place === 'Cafe on the corner' && /At Cafe on the corner/.test(s.toast) && /Undo/.test(s.toast) && /Cafe on the corner/.test(s.pop?.said ?? ''), `${(await theEvent())?.place}; ${s.toast.slice(0, 50)}; ${s.pop?.said}`)
      // The field let go of the keys: they stay in the popover, so another ↵ starts nothing on the page under it.
      await h.keyboard.press('Enter')
      await wait(500)
      s = await state()
      check('  the keys stay in the popover once the field lets go: another ↵ starts no new event on the page', await h.evaluate(() => !!document.activeElement?.closest('[data-cal-hold]')) && !s.draft && !!(await openOn())?.id, `draft ${JSON.stringify(s.draft)}; on ${(await openOn())?.id}`)
      await h.keyboard.press('Meta+z')
      await wait(900)
      check('  and ⌘Z takes the place away again', !(await theEvent())?.place, `${(await theEvent())?.place}`)
      // The calendar: its chips under its line; another one picked moves it there.
      await h.click('[data-cal-add] [data-quiet-row="calendar"] > button')
      await wait(600)
      const was = (await theEvent())?.calendarId
      const other = h.locator('[data-cal-add] [data-quiet-row="calendar"] [data-new-event-calendar][aria-checked="false"]').first()
      if (await other.count()) {
        await other.click()
        await wait(900)
        s = await state()
        check('another calendar picked in its row moves the event there at once, said with Undo', (await theEvent())?.calendarId !== was && /On .* now/.test(s.toast) && /Undo/.test(s.toast), `${was} to ${(await theEvent())?.calendarId}; ${s.toast.slice(0, 50)}`)
        await h.keyboard.press('Meta+z')
        await wait(900)
        check('  and ⌘Z puts it back on its calendar', (await theEvent())?.calendarId === was)
      } else console.log('NOTE  one calendar only: nothing to move the event to')
      await shut()
    } else check('the event is on the week to open', false)
    if (await openIn('task', 'Opened task')) {
      const r = await rows()
      await shot('rows-task')
      check('an open task has its rows: its day and time, and its tags', r?.day && r.tags && Math.abs(r.w - 320) < 1 && r.wide === 0, JSON.stringify(r && { day: r.day, tags: r.tags, w: r.w, wide: r.wide }))
      islands.task = await islandOf('[data-cal-add] [data-task-rows]')
      await h.locator('[data-cal-add] [data-task-rows] [data-task-tags] input').click()
      await h.keyboard.type('errand', { delay: 8 })
      await h.keyboard.press('Enter')
      await wait(900)
      const s = await state()
      const tagged = (await tasksNamed('Opened task'))[0]
      check('a tag typed in its row is kept on the task, said with Undo', /#errand\b/.test(tagged?.title ?? '') && /Tagged #errand/.test(s.toast) && /Undo/.test(s.toast), `${tagged?.title}; ${s.toast.slice(0, 50)}`)
      await h.keyboard.press('Escape')
      await wait(300)
      await h.mouse.click(700, 30).catch(() => {})
      await h.keyboard.press('Meta+z')
      await wait(900)
      check('  and ⌘Z takes the tag off', !/#errand\b/.test((await tasksNamed('Opened task'))[0]?.title ?? ''), (await tasksNamed('Opened task'))[0]?.title)
      await shut()
    } else check('the task is on the week to open', false)
    // 560 by 400: the rows scroll inside the popover, under the app's fading edge, and nothing is cut by the window.
    await c.size(560, 400)
    innerW = 560
    innerH = 400
    await wait(700)
    if (await openIn('event', 'Opens here')) {
      await h.click('[data-cal-add] [data-quiet-row="repeat"] > button')
      await wait(800)
      const r = await rows()
      await shot('rows-560')
      check('560 by 400, "Repeat" open: the popover is inside the window at its one width (the window less its margins), its rows scroll inside it under the fading edge, nothing runs past its edge', fits(r) && r.w <= 320.5 && r.scrolls && r.mask && r.wide === 0, JSON.stringify(r && { w: r.w, h: r.h, box: [Math.round(r.x), Math.round(r.y), Math.round(r.r), Math.round(r.b)], scrolls: r.scrolls, mask: r.mask, wide: r.wide, past: r.past, side: await h.evaluate(() => document.querySelector('[data-cal-hold]')?.dataset.side ?? null) }))
      const reached = await h.evaluate(() => { const sized = document.querySelector('[data-cal-add] [data-cal-add-sized]'); sized.scrollTop = sized.scrollHeight; const last = [...sized.querySelectorAll('[data-repeat]')].at(-1); const a = last.getBoundingClientRect(); const b = sized.getBoundingClientRect(); return a.bottom <= b.bottom + 0.5 && a.top >= b.top - 0.5 })
      check('  and its last choice is reached by scrolling inside it', reached)
      await shut()
    } else console.log('NOTE  560 by 400: the event is not drawn by name at this size')
    await c.size(1440, 900)
    await wait(500)
    // The north star (the user, 23 Nov: "the islanding popovers should be your northstar, because your calendar popovers
    // look dry"): the event's and the task's rows sit in islands drawn as the Inbox's Sort and View popover draws its own.
    await go('inbox')
    await h.locator('[data-display]').first().click().catch(() => {})
    await wait(700)
    const star = await islandOf('[data-slot="popover-content"] [role="menu"][aria-label="Sort by"]')
    await h.keyboard.press('Escape')
    await go('calendar')
    await wait(800)
    check('the open event\'s and task\'s rows sit in headed islands, the same island (class, corner, fill, edge) as the Sort and View popover\'s', !!star && ['event', 'task'].every((one) => islands[one]?.every((box) => box.headed && box.rows > 1 && box.look === star[0].look)), JSON.stringify({ star: star?.[0], ...islands }))
  }

  if (parts.includes('put')) {
    await things()
    /**
     * A press on `sel` (a row's line, a side of the switch), the pointer left where it pressed, and at every frame for
     * `ms`: where that control's own place is (its row's box or the switch's: the line itself gives 2% under a press, by
     * design), where the popover's top is, how tall the popover is, and which of the popover's controls the pointer lights.
     */
    const press = async (sel, ms = 650, filmed = null) => {
      const at = await h.evaluate((sel) => { const el = document.querySelector(sel); if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.left + Math.min(r.width / 2, 110), y: r.top + r.height / 2 } }, sel)
      if (!at) return null
      // Once the popover is where it will stay: a page still scrolling its day into view carries the popover with it.
      await h.waitForFunction(() => new Promise((done) => { const top = () => document.querySelector('[data-cal-add]')?.getBoundingClientRect().top; const first = top(); setTimeout(() => done(first !== undefined && top() === first), 250) }), null, { timeout: 5000 }).catch(() => {})
      const now = await h.evaluate((sel) => { const r = document.querySelector(sel).getBoundingClientRect(); return { x: r.left + Math.min(r.width / 2, 110), y: r.top + r.height / 2 } }, sel)
      await h.mouse.move(now.x, now.y)
      await wait(300)
      await h.evaluate(([sel, ms]) => {
        const pop = document.querySelector('[data-cal-add]')
        const el = document.querySelector(sel)
        const place = el.closest('[data-quiet-row], [role="radiogroup"]') ?? el
        const name = (one) => one.parentElement?.hasAttribute('data-quiet-row') ? `row ${one.parentElement.dataset.quietRow}` : (one.textContent || one.getAttribute('aria-label') || one.getAttribute('placeholder') || one.tagName).trim().slice(0, 18)
        window.__p = { me: name(el), frames: [] }
        window.__pDone = false
        const t0 = performance.now()
        // How far the lowest thing drawn in the popover stops short of the popover's bottom edge: words, marks and
        // fields, each cut by every box over it that clips (a row's fold, the popover's own scroller) and by the top
        // of what is leaving.
        const short = (box) => {
          let low = 0
          for (const one of pop.querySelectorAll('[data-cal-add-sized] *')) {
            if (!(one instanceof SVGElement || one.tagName === 'INPUT' || [...one.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()))) continue
            const r = one.getBoundingClientRect()
            if (!r.width || !r.height) continue
            let [top, bottom] = [r.top, r.bottom]
            for (let up = one.parentElement; up && up !== pop; up = up.parentElement) {
              if (getComputedStyle(up).overflowY !== 'visible') { const b = up.getBoundingClientRect(); bottom = Math.min(bottom, b.bottom); top = Math.max(top, b.top) }
              if (up.hasAttribute('data-cal-leaving')) top = Math.max(top, up.getBoundingClientRect().top + parseFloat(/inset\(([\d.]+)px/.exec(up.style.clipPath)?.[1] ?? '0'))
            }
            if (bottom > top) low = Math.max(low, bottom)
          }
          return Math.round((box.bottom - low) * 10) / 10
        }
        const tick = () => {
          const r = place.getBoundingClientRect()
          const box = pop.getBoundingClientRect()
          const all = [...pop.querySelectorAll('button, input, label, [role="radio"], [role="checkbox"]')].filter((one) => one.matches(':hover'))
          const lit = all.filter((one) => !all.some((other) => other !== one && one.contains(other))).map(name)
          window.__p.frames.push([Math.round(performance.now() - t0), Math.round(r.left * 10) / 10, Math.round(r.top * 10) / 10, Math.round(box.top * 10) / 10, Math.round(box.height), lit.join('|'), short(box)])
          if (performance.now() - t0 < ms) after(); else window.__pDone = true
        }
        // Read once each frame has been drawn (a task after the frame's own turn): read at the frame's start, the page
        // is caught between a change and what the app does about it before drawing (the box fitted to a new face, what
        // is leaving put under it), a state nobody sees.
        const after = () => requestAnimationFrame(() => setTimeout(tick, 0))
        after()
      }, [sel, ms])
      const act = async () => { await h.mouse.down(); await h.mouse.up() }
      if (filmed && dir) await cast(filmed, act, 380)
      else await act()
      await h.waitForFunction(() => window.__pDone)
      return h.evaluate(() => window.__p)
    }
    /** What a press showed: the control's place and the popover's top the same at every frame, and nothing lit but the control pressed. */
    const judge = (where, what, p) => {
      if (!p) return check(`${where}: ${what} is there to press`, false)
      const span = (i) => { const all = p.frames.map((f) => f[i]); return Math.round((Math.max(...all) - Math.min(...all)) * 10) / 10 }
      const others = [...new Set(p.frames.flatMap((f) => f[5].split('|')).filter((n) => n && n !== p.me))]
      const tall = [...new Set(p.frames.map((f) => f[4]))]
      check(`${where}: ${what}: the control pressed stays under the pointer to the pixel at every frame, and the popover's top with it`, span(1) <= 0.5 && span(2) <= 0.5 && span(3) <= 0.5, `${p.frames.length} frames; its place moved ${span(1)}px across and ${span(2)}px down, the top ${span(3)}px; the popover ${tall[0]} to ${tall.at(-1)}px tall in ${tall.length} heights${span(3) > 0.5 ? `; tops ${p.frames.filter((f, i) => i === 0 || f[3] !== p.frames[i - 1][3]).slice(0, 12).map((f) => `${f[3]}@${f[0]}ms`).join(' ')}` : ''}`)
      check(`${where}: ${what}: no other control lights under the still pointer`, others.length === 0 && p.frames.some((f) => f[5] === p.me), others.length ? `lit besides “${p.me}”: ${others.join(', ')}` : `only “${p.me}”`)
      // Nothing bare: at no frame is there more empty surface under the lowest drawn thing than there is once it has settled.
      // (What it holds has a gap of its own under its last words, before the change and after: only more than the larger of the two is bare.)
      const rest = Math.max(p.frames[0][6], p.frames.at(-1)[6])
      const most = Math.max(...p.frames.map((f) => f[6]))
      check(`${where}: ${what}: nothing bare under the last thing drawn at any frame (more than the 12px of a row's own padding)`, most - rest <= 12, `${Math.round((most - rest) * 10) / 10}px more surface under the last words than at rest, at the most (its last words stop ${p.frames[0][6]}px short of the bottom edge before, ${p.frames.at(-1)[6]}px after)`)
    }
    /** Every row of the open popover that opens in place, opened and closed by the pointer. */
    const toggles = async (where, filmAs = null) => {
      const rows = await h.evaluate(() => [...document.querySelectorAll('[data-cal-add] [data-quiet-row]')].map((el) => el.dataset.quietRow))
      if (!rows.length) return check(`${where}: the popover has rows that open in place`, false)
      for (const row of rows) {
        const film = filmAs && row === 'remind' ? filmAs : null
        judge(where, `“${row}” opening`, await press(`[data-cal-add] [data-quiet-row="${row}"] > button`, film ? 1100 : 650, film && `${film}-row-open`))
        judge(where, `“${row}” closing`, await press(`[data-cal-add] [data-quiet-row="${row}"] > button`, film ? 1100 : 650, film && `${film}-row-close`))
      }
      // A row pressed under one that is open: the open one stays as it is, so the row pressed does not go up under the pointer.
      if (rows.length > 1) {
        await h.click(`[data-cal-add] [data-quiet-row="${rows[0]}"] > button`)
        await wait(600)
        judge(where, `“${rows.at(-1)}” opening under “${rows[0]}” open`, await press(`[data-cal-add] [data-quiet-row="${rows.at(-1)}"] > button`))
        judge(where, `“${rows.at(-1)}” closing under “${rows[0]}” open`, await press(`[data-cal-add] [data-quiet-row="${rows.at(-1)}"] > button`))
        await h.click(`[data-cal-add] [data-quiet-row="${rows[0]}"] > button`)
        await wait(600)
      }
    }
    /** A new one's switch: Event to Task and back. */
    const turns = async (where, filmAs = null) => {
      // To the other kind and back, whichever it opened as (a month on Home starts a task, the Calendar an event).
      const first = (await state()).pop?.kind === 'task' ? 'event' : 'task'
      for (const to of [first, first === 'task' ? 'event' : 'task']) judge(where, to === 'task' ? 'Event to Task' : 'Task to Event', await press(`[data-cal-add] [data-day-side-kind="${to}"]`, filmAs ? 1100 : 650, filmAs && `${filmAs}-to-${to}`))
    }
    /** The popover on an event, in the view `key` is the key of, by a double-click on it. */
    const onEvent = async (key, label) => {
      await reach(key, SEL.event, label)
      if (!(await thing(SEL.event, label))) return false
      await wait(300)
      const now = await thing(SEL.event, label, false)
      await h.mouse.dblclick(now.x + Math.max(16, Math.min(now.w * 0.6, now.w - 8)), now.y + Math.min(now.h / 2, 10))
      await wait(700)
      return !!(await state()).pop
    }
    const only = (process.env.PUT ?? 'week,late,month,home,narrow').split(',')
    // An event at 23:00, the day's last hour, on the day the others are on.
    if (!(await eventsNamed('Late one')).length) {
      await toMode('m')
      await dbl(...corner(await cell(thingsDay ?? dayKeyOf(1))))
      await h.keyboard.type('Late one 11pm', { delay: 8 })
      await h.keyboard.press('Enter')
      await wait(900)
    }
    if (only.includes('week')) {
      // The case that moved: an event at 14:00 in a window 900 tall. Then a new one a little above it.
      if (await onEvent('w', 'Opens here')) { await toggles('Week, an event at 14:00', 'put'); await shut() } else check('Week: the event at 14:00 opens', false)
      const by = await thing(SEL.event, 'Opens here', false)
      if (by) { await dbl(by.x + by.w / 2, by.y - 60); if ((await state()).pop) await turns('Week, a new one near 13:00', 'put'); await shut() }
    }
    if (only.includes('late')) {
      if (await onEvent('w', 'Late one')) { await toggles('Week, its last row (23:00)'); await shut() } else check('Week: the event at 23:00 opens', false)
      const by = await thing(SEL.event, 'Late one', false)
      if (by) { await dbl(by.x + by.w / 2, by.y - 30); if ((await state()).pop) await turns('Week, a new one in its last hours'); await shut() }
      if (await onEvent('d', 'Late one')) { await toggles('Day, an event at 23:00'); await shut() } else check('Day: the event at 23:00 opens', false)
    }
    if (only.includes('month')) {
      // Month's last week on screen: a free day in its last row, an event made on it, then a new one beside it. The
      // Calendar's month is a run of weeks that scrolls, so its last row on screen is the lowest drawn whole inside its
      // scroller (the week under it is cut off by the scroller, and a hint at the window's foot is over it). Each
      // double-click goes to a point of the day's own empty part that nothing is over.
      await toMode('m')
      const spotIn = (day) => h.evaluate((day) => { const el = document.querySelector(`[data-cal-level] [data-day="${day}"]`); if (!el) return null; const r = el.getBoundingClientRect(); for (const fy of [0.6, 0.75, 0.45, 0.9]) for (const fx of [0.5, 0.25, 0.75]) { const [x, y] = [r.left + r.width * fx, r.top + r.height * fy]; const under = document.elementFromPoint(x, y); if (under?.closest('[data-day]') === el && !under.closest('button, a, [role="button"], [data-cal-draft]')) return [x, y] } return null }, day)
      const lows = await h.evaluate(() => { const days = [...document.querySelectorAll('[data-cal-level] [data-day]')].filter((el) => { const r = el.getBoundingClientRect(); const box = (el.closest('[data-month-scroll]') ?? document.documentElement).getBoundingClientRect(); return r.width > 40 && r.height > 40 && r.top >= Math.max(0, box.top) - 1 && r.bottom <= Math.min(innerHeight, box.bottom) + 1 }); const months = {}; for (const el of days) months[el.dataset.day.slice(0, 7)] = (months[el.dataset.day.slice(0, 7)] ?? 0) + 1; const month = Object.keys(months).sort((a, b) => months[b] - months[a])[0]; const own = days.filter((el) => el.dataset.day.startsWith(month) && !el.querySelector('[data-plan-task], [data-cal-event-chip], [data-plan-more], [data-plan-more-events]')); const lowest = Math.max(...own.map((el) => el.getBoundingClientRect().top)); const last = own.filter((el) => el.getBoundingClientRect().top >= lowest - 2); return [...last.slice(2), ...last.slice(0, 2)].map((el) => el.dataset.day) })
      let low = null
      for (const day of lows) if (await spotIn(day)) { low = day; break }
      if (!low) check('Month: its last week on screen has a free day with room to double-click', false, JSON.stringify(lows))
      else {
        const lowAt = async () => (await spotIn(low)) ?? [0, 0]
        if (!(await eventsNamed('Low one')).length) {
          await dbl(...(await lowAt()))
          if ((await state()).pop) { await h.keyboard.type('Low one 3pm', { delay: 8 }); await h.keyboard.press('Enter'); await wait(900) }
          else check('Month: a double-click on a day of its last week starts a new one', false, JSON.stringify({ low, at: await lowAt(), under: await h.evaluate(([x, y]) => { const el = document.elementFromPoint(x, y); return el ? `${el.tagName.toLowerCase()}${[...el.attributes].filter((a) => a.name.startsWith('data-')).slice(0, 3).map((a) => `[${a.name}]`).join('')}` : null }, await lowAt()) }))
        }
        const chip = await thing(SEL.event, 'Low one', false)
        if (chip) { await h.mouse.dblclick(chip.x + chip.w / 2, chip.y + chip.h / 2); await wait(700); await toggles('Month, its last week'); await shut() } else check('Month: the event in its last week is drawn', false)
        await dbl(...(await lowAt()))
        if ((await state()).pop) await turns('Month, a new one in its last week')
        await shut()
      }
    }
    if (only.includes('home')) {
      await v('settings:set', { hintRate: 0, homeCalendar: true })
      await go('home')
      await wait(1600)
      const there = await h.evaluate(() => { const days = [...document.querySelectorAll('[data-month-own] [data-day]')]; const el = days.slice(-7)[2] ?? days.at(-1); if (!el) return false; el.scrollIntoView({ block: 'center', behavior: 'instant' }); return true })
      if (!there) check('Home\'s month is on the page', false)
      else {
        await wait(1200)
        const at = await h.evaluate(() => { const days = [...document.querySelectorAll('[data-month-own] [data-day]')]; const r = (days.slice(-7)[2] ?? days.at(-1)).getBoundingClientRect(); return { x: r.right - 4, y: r.bottom - 4 } })
        await dbl(at.x, at.y)
        if (await h.locator('[data-cal-add] [data-day-side-kind="event"]').count()) await turns('Home\'s month, a new one in its last week', 'home')
        else check('Home\'s month: a new one\'s popover has the switch', false, JSON.stringify((await state()).pop?.kind ?? null))
        await shut()
      }
      await go('calendar')
      await wait(700)
    }
    if (only.includes('narrow')) {
      await c.size(560, 400)
      await wait(700)
      if (await onEvent('w', 'Opens here')) { await toggles('560 by 400, an event'); await shut() } else console.log('NOTE  560 by 400: the event is not drawn by name at this size')
      await toMode('m')
      const some = await cell(thingsDay ?? dayKeyOf(1))
      if (some) { await dbl(...corner(some)); if ((await state()).pop) await turns('560 by 400, a new one'); await shut() }
      await c.size(1440, 900)
      await wait(500)
    }
  }

  if (parts.includes('one')) {
    await things()
    /** What floats now: popovers, menus and dialogs, as qa/one-floating-thing.mjs counts them. */
    const up = () => h.evaluate(() => [...new Set(document.querySelectorAll('[data-slot="popover-content"], [role="menu"], [role="dialog"]'))].filter((one) => one.getClientRects().length && one.getAttribute('data-state') !== 'closed').length)
    // A crowded hour, for its “+N more”: six events at 09:00 on the day the others are on.
    if (!(await eventsNamed('Crowd 6')).length) {
      await toMode('m')
      for (let n = 1; n <= 6; n++) { await dbl(...corner(await cell(thingsDay ?? dayKeyOf(1)))); await h.keyboard.type(`Crowd ${n} 9am`, { delay: 5 }); await h.keyboard.press('Enter'); await wait(800) }
    }
    // Each of the three stops its press where it is (a button: it takes the focus, and the popover closes because focus
    // leaves it). With the new one's popover up, a real click on each leaves one floating thing or none, never two.
    for (const [name, sel, where] of [['“+N more” of a crowded hour', '[data-cal-crowd-more]', 'things'], ['a capture\'s chip', '[data-cal-capture]', 'today'], ['a task\'s tick', '[data-cal-tick]', 'things']]) {
      if (where === 'things') await reach('w')
      else { await toMode('w'); await h.keyboard.press('t'); await wait(700) }
      const find = () => h.evaluate((sel) => { const all = [...document.querySelectorAll(`[data-cal-level] ${sel}`)].filter((one) => one.getClientRects().length && !one.disabled).map((el) => { const r = el.getBoundingClientRect(); const [x, y] = [r.left + r.width / 2, r.top + r.height / 2]; return { x, y, clear: y > 0 && y < innerHeight && !!document.elementFromPoint(x, y)?.closest(sel) } }); return all.find((one) => one.clear) ?? all[0] ?? null }, sel)
      if (!(await find())) { console.log(`NOTE  one: ${name} is not on this week of the example book`); continue }
      await h.evaluate((sel) => [...document.querySelectorAll(`[data-cal-level] ${sel}`)].find((one) => one.getClientRects().length && !one.disabled)?.scrollIntoView({ block: 'center' }), sel)
      await wait(400)
      if (sel === '[data-cal-crowd-more]') { const col = await h.evaluate(() => { const cols = [...document.querySelectorAll('[data-cal-level] [data-cal-col]')].filter((el) => el.getClientRects().length); const r = cols.at(-1)?.getBoundingClientRect(); const view = document.querySelector('[data-cal-scroll]')?.getBoundingClientRect(); return r && view ? { x: r.left + r.width / 2, y: view.top + view.height * 0.7 } : null }); if (col) await dbl(col.x, col.y); if (!(await up())) { await h.locator('[data-cal-new-event]').first().click(); await wait(300) } }
      else await h.locator('[data-cal-new-event]').first().click()
      await wait(700)
      const before = await up()
      const at = await find()
      if (!at?.clear) { console.log(`NOTE  one: ${name} is under the popover here, so it cannot be pressed`); await h.keyboard.press('Escape'); await wait(400); continue }
      await h.mouse.click(at.x, at.y)
      await wait(800)
      const after = await up()
      check(`with the new one's popover up, a click on ${name} leaves one floating thing or none, never two`, before === 1 && after <= 1, `${before} up before the click, ${after} after`)
      for (let n = 0; n < 3 && (await up()); n++) { await h.keyboard.press('Escape'); await wait(350) }
      if (sel === '[data-cal-tick]') { await h.keyboard.press('Meta+z'); await wait(600) }
      await go('calendar')
      await wait(500)
    }
  }

  if (parts.includes('leave')) {
    await things()
    /** The popover, its box's state, the card's own animation and the draft, at every frame for `ms` while `run` lets it go. */
    const going = async (run, ms = 450, filmed = null) => {
      await h.evaluate((ms) => {
        window.__l = []
        window.__lDone = false
        const t0 = performance.now()
        const tick = () => {
          const card = document.querySelector('[data-cal-add]')
          window.__l.push([Math.round(performance.now() - t0), card ? 1 : 0, card?.closest('[data-cal-hold]')?.dataset.state ?? (card ? 'no box' : ''), card?.getAnimations().map((a) => a.animationName).join('+') ?? '', document.querySelector('[data-cal-draft]') ? 1 : 0])
          if (performance.now() - t0 < ms) requestAnimationFrame(tick); else window.__lDone = true
        }
        requestAnimationFrame(tick)
      }, ms)
      if (filmed && dir) await cast(filmed, run, 300)
      else await run()
      await h.waitForFunction(() => window.__lDone)
      const t = await h.evaluate(() => window.__l)
      const closed = t.filter((f) => f[1] && f[2] === 'closed')
      return { frames: closed.length, out: closed.length ? closed.at(-1)[0] - closed[0][0] : 0, clip: closed.some((f) => f[3].includes('mf-pop-out')), draft: closed.length > 0 && closed.every((f) => f[4] === 1), gone: !t.at(-1)[1], draftGone: !t.at(-1)[4] }
    }
    const said = (r) => `${r.frames} frames leaving over ${r.out}ms${r.clip ? ', by its clip' : ', no clip played'}; the draft ${r.draft ? 'there at every one' : 'not kept'}; then ${r.gone ? 'gone' : 'still up'}`
    const byClip = (r) => r.clip && r.out >= 50 && r.out <= 170 && r.gone
    const fresh = async () => { await toMode('m'); await dbl(...corner(await cell(dayKeyOf(3)))); return !!(await state()).pop }
    // A new one: a press elsewhere, Esc, and ↵ with words. Its draft stays until it has left.
    if (await fresh()) { const r = await going(() => h.mouse.click(700, 30), dir ? 900 : 450, 'leave-press'); check('a press elsewhere: the new one\'s popover leaves by its clip, as it came, its draft kept until it has left', byClip(r) && r.draft && r.draftGone, said(r)) } else check('a new one opens on a day', false)
    if (await fresh()) { const r = await going(() => h.keyboard.press('Escape'), dir ? 900 : 450, 'leave-esc'); check('Esc: it leaves the same way, its draft kept until it has left', byClip(r) && r.draft && r.draftGone, said(r)) }
    if (await fresh()) {
      await h.keyboard.type('Leaves by its clip', { delay: 8 })
      const r = await going(() => h.keyboard.press('Enter'), 700)
      check('↵ with words: made, and the popover leaves the same way', byClip(r) && (await eventsNamed('Leaves by its clip')).length === 1, `${said(r)}; ${(await eventsNamed('Leaves by its clip')).length} made`)
      await h.keyboard.press('Meta+z')
      await wait(700)
    }
    // Let go and opened again at once (a press elsewhere, then “New event” while the first is still leaving): the new one is up.
    if (await fresh()) {
      await h.mouse.click(700, 30)
      await h.locator('[data-cal-new-event]').first().click()
      await wait(700)
      check('let go and opened again at once, while the first is still leaving: the new one is up', !!(await state()).pop && !!(await state()).draft, JSON.stringify({ pop: !!(await state()).pop, draft: !!(await state()).draft }))
      await h.keyboard.press('Escape')
      await wait(500)
    }
    // One that is open: Esc, a press elsewhere, “Open”, and a name kept with ↵.
    for (const [how, run] of [['Esc', () => h.keyboard.press('Escape')], ['a press elsewhere', () => h.mouse.click(700, 30)], ['“Open”', () => h.click('[data-cal-add] [data-cal-open-page]')]]) {
      if (!(await openIn('event', 'Opens here'))) { check(`the event opens, to be let go by ${how}`, false); continue }
      const r = await going(run)
      check(`an open event let go by ${how}: its popover leaves by its clip`, byClip(r), said(r))
      await h.keyboard.press('Escape')
      await wait(500)
    }
    // Nothing plays with Motion off or Reduce motion: it is gone at once.
    for (const [name, on, off] of [['Motion off', () => h.evaluate(() => document.documentElement.setAttribute('data-motion', 'off')), () => h.evaluate(() => document.documentElement.removeAttribute('data-motion'))], ['Reduce motion', () => h.emulateMedia({ reducedMotion: 'reduce' }), () => h.emulateMedia({ reducedMotion: null })]]) {
      await on()
      await wait(300)
      if (await fresh()) { const r = await going(() => h.mouse.click(700, 30)); check(`${name}: a press elsewhere takes the popover and its draft away at once`, r.frames <= 1 && !r.clip && r.gone && r.draftGone, said(r)) }
      await off()
      await wait(300)
    }
  }

  if (parts.includes('spring')) {
    await things()
    /**
     * The popover's sized box, read at every frame for `ms` from now while `run` plays out: when, how tall it is drawn,
     * how tall the whole popover is, the height the box is held at (its own style; empty when nothing holds it), and
     * where the popover's top is.
     */
    const trace = async (run, ms = 1300) => {
      await h.evaluate((ms) => {
        const box = document.querySelector('[data-cal-add-sized]')
        const pop = document.querySelector('[data-cal-add]')
        window.__t = []
        window.__tDone = false
        const t0 = performance.now()
        const tick = () => { window.__t.push([Math.round(performance.now() - t0), Math.round(box.getBoundingClientRect().height * 10) / 10, Math.round(pop.getBoundingClientRect().height * 10) / 10, box.style.height, Math.round(pop.getBoundingClientRect().top * 10) / 10]); if (performance.now() - t0 < ms) requestAnimationFrame(tick); else window.__tDone = true }
        requestAnimationFrame(tick)
      }, ms)
      await run()
      await h.waitForFunction(() => window.__tDone)
      return h.evaluate(() => window.__t)
    }
    /** What a trace shows: where the box began and ended, every height it was drawn at on the way, and whether it went one way (a spring may pass its end by a few px and come back). */
    const astray = []
    /** Of the traces read since `from`: how many frames had the popover placed somewhere off its path, and where. */
    const tied = (from = 0) => { const seen = astray.slice(from); const off = seen.filter((one) => one.off); return { ok: seen.length > 0 && !off.length, said: `${seen.reduce((n, one) => n + one.off, 0)} of ${seen.reduce((n, one) => n + one.frames, 0)} frames off its path in ${seen.length} changes${off.length ? `: ${off.map((one) => `top at ${one.at.join(' ')}px on a path of ${one.path}`).join('; ')}` : ` (its top ${[...new Set(seen.map((one) => one.path))].slice(0, 3).join(', ')})`}` } }
    const read = (t) => {
      const tall = t.map((one) => one[1])
      const [from, to] = [tall[0], tall.at(-1)]
      const seen = [...new Set(tall.map((n) => Math.round(n)))]
      const between = seen.filter((n) => n !== Math.round(from) && n !== Math.round(to))
      const up = to > from
      const oneWay = tall.every((n, at) => at === 0 || (up ? n >= tall[at - 1] - 6 : n <= tall[at - 1] + 6))
      const moving = t.filter((one, at) => at > 0 && one[1] !== t[at - 1][1])
      const took = moving.length ? moving.at(-1)[0] - moving[0][0] : 0
      // Tied where it is: its top goes from where it began to where it ended (12px past either for the spring's last
      // give), and is never anywhere else, not for one frame.
      const tops = t.map((one) => one[4])
      const [low, high] = [Math.min(tops[0], tops.at(-1)) - 12, Math.max(tops[0], tops.at(-1)) + 12]
      const off = tops.filter((n) => n < low || n > high)
      astray.push({ frames: t.length, off: off.length, at: [...new Set(off.map((n) => Math.round(n)))], path: `${Math.round(tops[0])} to ${Math.round(tops.at(-1))}px` })
      return { from, to, between: between.length, oneWay, took, held: t[0][3] || 'nothing', frames: t.length, said: `${from} to ${to}px, ${between.length} in-between heights over ${took}ms of ${t.length} frames (${seen.join(' ')}); held at ${t[0][3] || 'nothing'} before, ${t.at(-1)[3] || 'nothing'} after` }
    }
    // With pictures being kept the page draws fewer frames, so a filmed run only says what it saw; the count is judged on a run without pictures.
    const sprung = (name, t) => { const r = read(t); if (dir) console.log(`NOTE  ${name}, filmed: ${r.said}`); else check(`${name}: the height moves on the spring, six or more in-between heights, one way`, r.from !== r.to && r.between >= 6 && r.oneWay, r.said); return r }
    const atOnce = (name, t) => { const r = read(t); check(`${name}: the height is simply the new one, with no height in between`, r.from !== r.to && r.between === 0, r.said); return r }
    console.log(`NOTE  spring: the Motion setting is ${JSON.stringify((await v('settings'))?.motion)}; data-motion ${await h.evaluate(() => document.documentElement.dataset.motion ?? 'unset')}; Reduce motion ${await h.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)}`)
    // A new one: Event to Task and back.
    await toMode('m')
    await dbl(...corner(await cell(dayKeyOf(2))))
    await wait(500)
    sprung('Event to Task', await trace(() => cast('spring-to-task', () => h.click('[data-cal-add] [data-day-side-kind="task"]'))))
    sprung('Task to Event', await trace(() => cast('spring-to-event', () => h.click('[data-cal-add] [data-day-side-kind="event"]'))))
    await shut()
    // A thing that exists: a row opening, then closing.
    if (await openIn('event', 'Opens here')) {
      sprung('a row opening ("Reminder")', await trace(() => cast('spring-row-open', () => h.click('[data-cal-add] [data-quiet-row="remind"] > button'))))
      sprung('a row closing', await trace(() => cast('spring-row-close', () => h.click('[data-cal-add] [data-quiet-row="remind"] > button'))))
      // Reached by a key, nothing moves: ↵ on the row opens and closes it at once.
      await h.locator('[data-cal-add] [data-quiet-row="remind"] > button').focus()
      atOnce('by a key (↵ on the row), opening', await trace(() => h.keyboard.press('Enter'), 900))
      atOnce('by a key, closing', await trace(() => h.keyboard.press('Enter'), 900))
      // Motion off (the app's setting, as the page wears it) and Reduce motion (the Mac's): at once.
      await h.evaluate(() => document.documentElement.setAttribute('data-motion', 'off'))
      atOnce('Motion off, a row opening', await trace(() => h.click('[data-cal-add] [data-quiet-row="remind"] > button'), 900))
      atOnce('Motion off, a row closing', await trace(() => h.click('[data-cal-add] [data-quiet-row="remind"] > button'), 900))
      await h.evaluate(() => document.documentElement.removeAttribute('data-motion'))
      await h.emulateMedia({ reducedMotion: 'reduce' })
      await wait(300)
      atOnce('Reduce motion, a row opening', await trace(() => h.click('[data-cal-add] [data-quiet-row="remind"] > button'), 900))
      atOnce('Reduce motion, a row closing', await trace(() => h.click('[data-cal-add] [data-quiet-row="remind"] > button'), 900))
      await h.emulateMedia({ reducedMotion: null })
      await wait(300)
      // And with motion back, it springs again.
      sprung('motion back on, a row opening', await trace(() => h.click('[data-cal-add] [data-quiet-row="repeat"] > button')))
      await h.click('[data-cal-add] [data-quiet-row="repeat"] > button')
      await wait(600)
      // Opened and closed four more times: the spring's last pixels are where a frame could be placed by the popover's
      // other end (it is moved up to fit the window here, 14:00 in a window 900 tall).
      for (let n = 0; n < 8; n++) read(await trace(() => h.click('[data-cal-add] [data-quiet-row="remind"] > button'), 700))
      const whole = tied()
      check('through every change the popover stays tied where it is: never placed elsewhere, not for one frame', whole.ok, whole.said)
      // The same with the interface a size up (Settings, "Interface size": the page's root size, as the app sets it), where
      // the popover's top row is no longer a whole number of pixels tall.
      const before = astray.length
      const root = await h.evaluate(() => { const was = document.documentElement.style.fontSize; document.documentElement.style.fontSize = `${parseFloat(getComputedStyle(document.documentElement).fontSize) * 1.1}px`; return was })
      await wait(900)
      for (let n = 0; n < 6; n++) read(await trace(() => h.click('[data-cal-add] [data-quiet-row="remind"] > button'), 700))
      const bigger = tied(before)
      const sized = await h.evaluate(() => { const pop = document.querySelector('[data-cal-add]'); return { root: getComputedStyle(document.documentElement).fontSize, pop: pop.getBoundingClientRect().height, head: pop.firstElementChild.getBoundingClientRect().height } })
      check('the same with the interface a size up (110%): never placed elsewhere for a frame', bigger.ok, `${bigger.said}; ${JSON.stringify(sized)}`)
      await h.evaluate((was) => { document.documentElement.style.fontSize = was }, root)
      await wait(600)
      await shut()
    } else check('the event is on the week to open', false)
  }

  if (parts.includes('unhappy')) {
    await things()
    const titleOf = async (kind, id) => kind === 'event' ? (await eventsNamed('Opens here')).find((one) => one.key === id)?.title : (await v('tasks')).find((one) => one.id === id)?.title
    // 1. An empty name: it says why not, stays open, and the name is as it was.
    for (const [kind, label, why] of [['event', 'Opens here', /An event needs a name/], ['task', 'Opened task', /A task needs a name/]]) {
      if (!(await openIn(kind, label))) { check(`an empty name: the ${kind} is on the week to open`, false); continue }
      const id = (await openOn())?.id
      await h.keyboard.press('Meta+a')
      await h.keyboard.press('Backspace')
      await h.keyboard.press('Enter')
      await wait(700)
      let s = await state()
      await shot(`unhappy-empty-${kind}`)
      check(`an empty name on the ${kind}, then ↵: it says why not, the popover stays, and the name is as it was`, why.test(s.toast) && !!s.pop && (await openOn())?.id === id && ((await titleOf(kind, id)) ?? '').startsWith(label), `${s.toast.slice(0, 60)}; ${await titleOf(kind, id)}`)
      // A click away with the line empty keeps nothing and says nothing more.
      await h.mouse.click(700, 30)
      await wait(600)
      s = await state()
      check(`  and a click away with the line empty closes it, the ${kind}'s name still as it was`, !s.pop && ((await titleOf(kind, id)) ?? '').startsWith(label), `${await titleOf(kind, id)}`)
    }
    // 2. Esc with a name typed and not kept: a notice says so, and its Undo brings the popover back with the words.
    for (const [kind, label] of [['event', 'Opens here'], ['task', 'Opened task']]) {
      if (!(await openIn(kind, label))) { check(`Esc with a name typed: the ${kind} is on the week to open`, false); continue }
      const id = (await openOn())?.id
      await h.keyboard.type(' not kept', { delay: 8 })
      await film(`unhappy-esc-${kind}`, async () => { await h.keyboard.press('Escape'); await wait(500) }, 8)
      await wait(300)
      let s = await state()
      await shot(`unhappy-esc-${kind}`)
      check(`Esc on the ${kind} with a name typed and not kept: it closes, the name is as it was, and a notice says so with Undo`, !s.pop && ((await titleOf(kind, id)) ?? '').startsWith(label) && !/not kept/.test((await titleOf(kind, id)) ?? '') && /Not kept: .*not kept/.test(s.toast) && /Undo/.test(s.toast), `${s.toast.slice(0, 70)}; ${await titleOf(kind, id)}`)
      await h.keyboard.press('Meta+z')
      await wait(800)
      s = await state()
      check(`  and ⌘Z brings the popover back on the ${kind} with the words in its line`, s.pop?.kind === kind && (await openOn())?.id === id && s.pop.words === `${label} not kept` && s.pop.focused, `${s.pop?.words}; on ${(await openOn())?.id}`)
      // Esc again with the same words says so again; with the line as the name is, it says nothing.
      await h.keyboard.press('Meta+a')
      await h.keyboard.type(label, { delay: 8 })
      await h.keyboard.press('Escape')
      await wait(700)
      s = await state()
      check(`  and Esc with the line as the ${kind} is named closes it and says nothing`, !s.pop && !/Not kept/.test(s.toast), s.toast.slice(0, 60))
    }
    // 3. One of your Mac's events: read only.
    await v('settings:set', { hintRate: 0, macCalendar: true })
    await wait(900)
    await reach('w', '[data-cal-level] [data-cal-event][data-readonly]', 'Mac breakfast')
    const mac = await thing('[data-cal-level] [data-cal-event][data-readonly]', 'Mac breakfast')
    if (mac) {
      await wait(300)
      const now = await thing('[data-cal-level] [data-cal-event][data-readonly]', 'Mac breakfast', false)
      const at = [now.x + Math.max(16, now.w * 0.6), now.y + Math.min(now.h / 2, 10)]
      await shiftClick(...at)
      await wait(500)
      let s = await state()
      check('a ⇧-click on one of your Mac\'s events picks it, ringed, and opens nothing', (await thing('[data-cal-level] [data-cal-event][data-readonly]', 'Mac breakfast', false))?.ring === 'solid 2px' && !s.pop && !(await side()))
      await h.mouse.click(...at)
      await wait(700)
      s = await state()
      const ro = await h.evaluate(() => { const pop = document.querySelector('[data-cal-add]'); if (!pop) return null; const field = pop.querySelector('textarea, input'); return { open: !!pop.getAttribute('data-cal-open'), page: !!pop.querySelector('[data-cal-open-page]'), rows: !!pop.querySelector('[data-event-rows]'), readOnly: !!field?.readOnly, keep: !!pop.querySelector('[data-new-event-add]'), said: pop.textContent } })
      await shot('unhappy-mac')
      check('a click opens the same popover on it, read only: its name in a line that cannot be typed in, no "Open", no rows, no ↵ to keep, and it says whose it is', !!ro?.open && !ro.page && !ro.rows && ro.readOnly && !ro.keep && s.pop?.words === 'Mac breakfast' && /Family/.test(ro.said) && /change it in Calendar/.test(ro.said) && inside(s) && clear(s, await thing('[data-cal-level] [data-cal-event][data-readonly]', 'Mac breakfast', false)), JSON.stringify(ro && { open: ro.open, page: ro.page, rows: ro.rows, readOnly: ro.readOnly, keep: ro.keep }) + ` ${s.pop?.words}`)
      await h.keyboard.type('xyz', { delay: 8 })
      await h.keyboard.press('Enter')
      await wait(600)
      s = await state()
      check('  typing in it changes nothing, ↵ closes it, and no notice is raised', !s.pop && !/Renamed|Not kept|needs a name/.test(s.toast), s.toast.slice(0, 60))
      await h.mouse.click(...at, { button: 'right' })
      await wait(500)
      const lines = await h.evaluate(() => [...document.querySelectorAll('[role="menu"] [role="menuitem"]')].map((el) => el.textContent.trim()))
      check('  its right-click menu offers "Open" and says it is read only', lines.some((one) => /^Open/.test(one)) && lines.some((one) => /read only/.test(one)), lines.join(' | '))
      await h.keyboard.press('Escape')
      await wait(400)
      // Opened, then ⌘K, as a person looking something up does (the user, 22 Nov): the card goes, never over the search.
      await h.mouse.click(...at)
      await wait(600)
      await h.keyboard.press('Meta+k')
      await wait(700)
      check('  ⌘K over an opened event puts its card away: nothing floats over the search', !(await h.evaluate(() => { const pop = document.querySelector('[data-cal-add]'); return !!pop && pop.getBoundingClientRect().width > 0 })))
      await h.keyboard.press('Escape')
      await wait(500)
    } else check('one of your Mac\'s events is on the week', false)
    // 4. A repeating event: a change asks which times, from the line and from a row; Esc in the ask leaves the popover up.
    await toMode('m')
    // The month's "Nothing planned" line says so only when nothing is drawn on its days: not over events or bars (22 Nov).
    const emptySaid = await h.evaluate(() => ({ said: !!document.querySelector('[data-month-empty]'), drawn: document.querySelectorAll('[data-cal-level] [data-cal-event], [data-cal-level] [data-cal-event-chip], [data-cal-level] [data-plan-task], [data-month-bars] > *').length }))
    check('  the month says "Nothing planned" only when nothing is on its days', emptySaid.said === (emptySaid.drawn === 0), JSON.stringify(emptySaid))
    const free = await h.evaluate((keys) => keys.find((key) => { const el = document.querySelector(`[data-cal-level] [data-day="${key}"]`); return el && !el.querySelector('[data-plan-task], [data-cal-event-chip], [data-plan-more], [data-plan-more-events], [data-mark-flag]') }) ?? keys[0], [2, 3, 4, 5, 6, 7, 8, 9].map(dayKeyOf))
    await dbl(...corner(await cell(free)))
    await h.keyboard.type('Weekly standup every week 9am', { delay: 8 })
    await h.keyboard.press('Enter')
    await wait(1000)
    const standups = async () => (await v('events', new Date(c.now().getTime() - 2 * 864e5).toISOString(), new Date(c.now().getTime() + 40 * 864e5).toISOString())).filter((one) => /standup/i.test(one.title))
    check('a repeating event is made from its words', (await standups()).length >= 3 && (await standups()).every((one) => new Date(one.start).getHours() === 9), `${(await standups()).length} times`)
    if (await openIn('event', 'Weekly standup')) {
      const first = (await openOn())?.id
      await h.keyboard.type(' 10am', { delay: 8 })
      await h.keyboard.press('Enter')
      await wait(700)
      let asked = await h.locator('[data-scope-ask] [data-scope]').count()
      await shot('unhappy-which-times')
      check('a time typed after a repeating event\'s name, then ↵: it asks which times (this one, this and following, all)', asked === 3, `${asked} choices`)
      // Esc there: asked no more, nothing changed, the popover still up with its words.
      await h.keyboard.press('Escape')
      await wait(600)
      let s = await state()
      check('  Esc in the ask changes nothing and leaves the popover up with its words', await h.locator('[data-scope-ask]').count() === 0 && !!s.pop && s.pop.words === 'Weekly standup 10am' && (await standups()).every((one) => new Date(one.start).getHours() === 9), `${s.pop?.words}; ${(await standups()).filter((one) => new Date(one.start).getHours() !== 9).length} moved`)
      await h.locator('[data-cal-add] :is(textarea, input)').first().focus()
      await h.keyboard.press('Enter')
      await wait(700)
      await h.locator('[data-scope-ask] [data-scope="one"]').click().catch(() => {})
      await wait(1000)
      s = await state()
      let all = await standups()
      check('  "This one" moves only that time to 10:00, said with Undo', all.filter((one) => new Date(one.start).getHours() === 10).length === 1 && all.filter((one) => new Date(one.start).getHours() === 9).length >= 2 && /Undo/.test(s.toast), `${all.filter((one) => new Date(one.start).getHours() === 10).length} at 10; ${s.toast.slice(0, 60)}`)
      await h.keyboard.press('Escape')
      await wait(300)
      await h.mouse.click(700, 30).catch(() => {})
      await h.keyboard.press('Meta+z')
      await wait(900)
      check('  and ⌘Z puts that time back at 09:00', (await standups()).every((one) => new Date(one.start).getHours() === 9), `${(await standups()).filter((one) => new Date(one.start).getHours() !== 9).length} still moved`)
      // From a row: the reminder, for all of them.
      if (await openIn('event', 'Weekly standup')) {
        await h.click('[data-cal-add] [data-quiet-row="remind"] > button')
        await wait(700)
        await h.click('[data-cal-add] [data-remind="30"]')
        await wait(700)
        asked = await h.locator('[data-scope-ask] [data-scope]').count()
        check('a reminder picked in a repeating event\'s row asks which times too', asked >= 2, `${asked} choices`)
        await h.locator('[data-scope-ask] [data-scope="all"]').click().catch(() => {})
        await wait(1000)
        s = await state()
        all = await standups()
        check('  "All of them" sets it on every time, said with Undo, the popover still up', all.length >= 3 && all.every((one) => one.remind === 30) && /Undo/.test(s.toast) && !!s.pop, `${all.filter((one) => one.remind === 30).length} of ${all.length}; ${s.toast.slice(0, 50)}`)
        await h.keyboard.press('Meta+z')
        await wait(900)
        check('  and ⌘Z takes it off every time', (await standups()).every((one) => one.remind !== 30), `${(await standups()).filter((one) => one.remind === 30).length} left`)
        await shut()
      } else check('the repeating event opens a second time', false)
      void first
    } else check('the repeating event is on the week to open', false)
    // 5. The worst realistic words (break-ui): a long name holding a word that cannot break, a long place, three people.
    await toMode('m')
    const roomy = await h.evaluate((keys) => keys.find((key) => { const el = document.querySelector(`[data-cal-level] [data-day="${key}"]`); return el && !el.querySelector('[data-plan-task], [data-cal-event-chip], [data-plan-more], [data-plan-more-events], [data-mark-flag]') }) ?? keys[0], [3, 4, 5, 6, 7, 8, 9, 10].map(dayKeyOf))
    await dbl(...corner(await cell(roomy)))
    await h.keyboard.type('Wiśniewska-Kowalczyk and bartholomew.fitzgerald@northwindindustriesholdings.example.com quarterly offsite 3pm', { delay: 1 })
    await h.keyboard.press('Enter')
    await wait(1000)
    // Its place and its people, written in the popover's own rows.
    if (await openIn('event', 'Wiśniewska-Kowalczyk and')) {
      await h.locator('[data-cal-add] [data-event-rows] input[placeholder="Place"]').click()
      await h.keyboard.type('Northwind Industries Holdings Conference Centre, Building 12, Floor 3, Room 3.14159', { delay: 1 })
      await h.keyboard.press('Enter')
      await wait(800)
      for (const who of ['Jo', 'Bartholomew Fitzgerald', 'Aleksandra Wiśniewska-Kowalczyk']) {
        await h.locator('[data-cal-add] [data-event-people] input').click()
        await h.keyboard.type(who, { delay: 1 })
        await h.keyboard.press('Enter')
        await wait(700)
      }
      await shut()
    }
    for (const [w, hh] of [[1440, 900], [560, 400]]) {
      await c.size(w, hh)
      await wait(600)
      if (!(await openIn('event', 'Wiśniewska-Kowalczyk and'))) { console.log(`NOTE  ${w} by ${hh}: the long event is not drawn by name at this size`); continue }
      const s = await state()
      const worst = await h.evaluate(() => {
        const pop = document.querySelector('[data-cal-add]')
        const box = pop.getBoundingClientRect()
        const sized = pop.querySelector('[data-cal-add-sized]')
        // (Its point is outside its box by design, on whichever side its thing is.)
        const over = [...pop.querySelectorAll('*')].filter((el) => el.offsetParent && !el.closest('[data-slot="popover-arrow"]') && !el.querySelector(':scope > [data-slot="popover-arrow"]') && el.getBoundingClientRect().right > box.right + 0.5)
        const past = over.length
        const what = over.slice(0, 3).map((el) => `${el.tagName.toLowerCase()}${[...el.attributes].filter((a) => a.name.startsWith('data-')).map((a) => `[${a.name}]`).join('')} ${Math.round((el.getBoundingClientRect().right - box.right) * 10) / 10}px`)
        const said = pop.querySelector('[data-new-event-said]')
        return { w: box.width, side: pop.closest('[data-cal-hold]')?.dataset.side ?? null, past, what, saidCut: said ? said.scrollWidth > said.clientWidth + 1 : null, scrolls: sized.scrollHeight > sized.clientHeight + 1, sideways: sized.scrollWidth > sized.clientWidth + 1, place: (pop.querySelector('[data-event-rows] input[placeholder="Place"]')?.value ?? '').length, people: pop.querySelectorAll('[data-event-people] span.rounded-full').length, nameWhole: (() => { const name = pop.querySelector('[data-new-event-words]'); return !!name && name.scrollHeight <= name.clientHeight + 1 && name.scrollWidth <= name.clientWidth + 1 && name.clientHeight > 30 })() }
      })
      await shot(`unhappy-worst-${w}`)
      check(`${w} by ${hh}, a long name with an unbreakable word, a long place and three people: the popover keeps its width, inside the window, nothing past its edge, the name and the reading wrapped not cut, and no sideways scroll`, Math.abs(worst.w - Math.min(320, w - 24)) < 1 && inside(s) && worst.past === 0 && worst.saidCut === false && worst.nameWhole && !worst.sideways && worst.place > 60 && worst.people === 3, JSON.stringify(worst))
      await shut()
    }
    await c.size(1440, 900)
    await wait(500)
    // 6. A task with no day (a row of Unscheduled): the same popover tied to the row, saying so.
    await reach('w')
    const loose = h.locator('[data-cal-loose]').first()
    if (await loose.count()) {
      await loose.scrollIntoViewIfNeeded()
      const row = await loose.boundingBox()
      const cuesLoose = await heard(() => h.mouse.click(row.x + row.width / 2, row.y + row.height / 2))
      const s = await state()
      await shot('unhappy-no-day')
      check('a click on an Unscheduled row opens the same popover tied to the row, with one sound and no side panel, saying it has no day yet', s.pop?.kind === 'task' && !!(await openOn())?.id && /No day yet/.test(s.pop.said) && inside(s) && clear(s, await h.evaluate(() => { const r = document.querySelector('[data-cal-loose]').getBoundingClientRect(); return { x: r.left, y: r.top, r: r.right, b: r.bottom } })) && cuesLoose.filter((cue) => cue === 'open').length === 1 && !(await side()), `${s.pop?.said}; side ${s.pop?.side}; cues ${cuesLoose.join()}`)
      await shut()
    } else console.log('NOTE  no Unscheduled row to open')
  }

  if (parts.includes('quiet')) {
    await things()
    await toMode('m')
    // An event whose name the month has to cut short: a chip that is cut always has a tip to give its name whole.
    if (!(await eventsNamed('Quiet as a long name the month has to cut short')).length) {
      const spare = await h.evaluate((keys) => keys.find((key) => { const el = document.querySelector(`[data-cal-level] [data-day="${key}"]`); return el && !el.querySelector('[data-plan-task], [data-cal-event-chip], [data-plan-more], [data-plan-more-events], [data-mark-flag]') }) ?? keys[0], [4, 5, 6, 7, 8, 9, 10, 11].map(dayKeyOf))
      await dbl(...corner(await cell(spare)))
      await h.keyboard.type('Quiet as a long name the month has to cut short 5pm', { delay: 4 })
      await h.keyboard.press('Enter')
      await wait(1000)
    }
    const tips = () => h.evaluate(() => [...document.querySelectorAll('[data-slot="tooltip-content"]')].filter((el) => el.getAttribute('data-state') !== 'closed').map((el) => el.textContent).join(' | '))
    const rest = async () => { await h.mouse.move(700, 30); await wait(900) }
    const chip = async () => thing(SEL.event, 'Quiet as a long name', false)
    let box = await thing(SEL.event, 'Quiet as a long name')
    await wait(300)
    box = await chip()
    if (box) {
      const at = [box.x + Math.min(box.w * 0.6, box.w - 8), box.y + box.h / 2]
      await rest()
      await h.mouse.move(...at, { steps: 4 })
      await wait(1600)
      const before = await tips()
      check('closed, the event\'s chip shows its tip under the pointer', /Quiet as a long name/.test(before), before || 'no tip')
      await rest()
      await h.mouse.dblclick(...at)
      await wait(900)
      check('the popover opens on it', !!(await openOn())?.id)
      // The thing's own tip, with the pointer resting on it.
      await h.mouse.move(at[0] + 2, at[1], { steps: 3 })
      await wait(1600)
      let now = await tips()
      await shot('quiet-own-tip')
      check('with the popover open, the chip\'s own tip does not come up beside it', now === '', now || 'no tip')
      // The place field, "Open", a row, and another thing on the page.
      for (const [name, sel] of [['the place field', '[data-cal-add] [data-event-rows] input[placeholder="Place"]'], ['"Open"', '[data-cal-add] [data-cal-open-page]'], ['the "Reminder" row', '[data-cal-add] [data-quiet-row="remind"] > button']]) {
        await rest()
        const el = h.locator(sel).first()
        if (!(await el.count())) { check(`with the popover open, ${name} is there to point at`, false); continue }
        await el.hover()
        await wait(1600)
        now = await tips()
        check(`with the popover open, no tip comes up over it from ${name}`, now === '', now || 'no tip')
      }
      const other = await thing(SEL.task, 'Opened task', false)
      if (other) {
        await rest()
        await h.mouse.move(other.x + other.w / 2, other.y + other.h / 2, { steps: 4 })
        await wait(1600)
        now = await tips()
        check('with the popover open, another thing on the page shows no tip either', now === '', now || 'no tip')
      }
      await shut()
      await rest()
      await h.mouse.move(...at, { steps: 4 })
      await wait(1600)
      const after = await tips()
      check('closed again, the chip\'s tip is back', /Quiet as a long name/.test(after), after || 'no tip')
      await rest()
    } else check('the event is on the month', false)
  }

  if (parts.includes('last')) {
    await things()
    const later = dayKeyOf(2)
    const keyOf = (iso) => { const d = new Date(iso); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
    const at = (iso) => iso ? `${keyOf(iso)} ${String(new Date(iso).getHours()).padStart(2, '0')}:${String(new Date(iso).getMinutes()).padStart(2, '0')}` : 'none'
    // 1. A repeat that names no day, typed on a later day's draft, starts on that day: never from today.
    await toMode('m')
    await dbl(...corner(await cell(later)))
    await h.keyboard.type('Standup every week 9am', { delay: 8 })
    await wait(300)
    const weekly = (await state()).pop?.said ?? ''
    await shot('last-weekly-said')
    await h.keyboard.press('Enter')
    await wait(900)
    const times = (await eventsNamed('Standup')).map((one) => one.start).sort()
    console.log(`NOTE  read back before it was made: ${weekly}`)
    const gap = times.length > 1 ? Math.round((new Date(times[1]) - new Date(times[0])) / 36e5) : 0
    check(`"Standup every week 9am" typed on a later day's draft (${later}) starts on that day at 9:00, then every week`, times.length > 1 && at(times[0]) === `${later} 09:00` && gap >= 167 && gap <= 169, `first ${at(times[0])}, then ${at(times[1])}; ${times.length} times shown`)
    // Read back before it is made: that day, and its repeat with the day's name as it is written (it read "weekly on sunday").
    const laterDay = new Date(`${later}T12:00`)
    const dayName = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][laterDay.getDay()]
    const short = `${laterDay.getDate()} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][laterDay.getMonth()]}`
    check(`  and read back before it is made as ${short}, "weekly on ${dayName}" with the day's capital`, weekly.includes(short) && weekly.includes(`weekly on ${dayName}`), weekly)
    await h.keyboard.press('Meta+z')
    await wait(700)
    for (const [words, name, time] of [['Water the plants every week 9am', 'Water the plants', '09:00'], ['Call home every week', 'Call home', null]]) {
      await dbl(...corner(await cell(later)))
      await h.click('[data-cal-add] [data-day-side-kind="task"]')
      await wait(400)
      await h.keyboard.type(words, { delay: 8 })
      await h.keyboard.press('Enter')
      await wait(900)
      const made = (await tasksNamed(name))[0]
      check(`  and as a task, "${words}" on that day's draft is due on that day${time ? ` at ${time}` : ''}`, !!made?.dueAt && keyOf(made.dueAt) === later && (!time || at(made.dueAt).endsWith(time)), `${made ? `due ${at(made.dueAt)}${made.allDay ? ' (all day)' : ''}; repeats ${made.recurrence ?? made.repeat ?? '?'}` : 'not made'}`)
      await h.keyboard.press('Meta+z')
      await wait(700)
    }
    // 2. A row's chevron by a key: simply turned, as what it opens is simply there; by a click it turns as its choices come.
    if (await openIn('event', 'Opens here')) {
      const row = '[data-cal-add] [data-quiet-row="remind"]'
      const chevron = () => h.evaluate((row) => { const svg = document.querySelector(`${row} > button svg:last-of-type`); const body = document.querySelector(`${row} [data-quiet-body]`); return { rotate: getComputedStyle(svg).rotate, moving: svg.getAnimations().length, open: document.querySelector(row).hasAttribute('data-open'), body: body ? Math.round(body.getBoundingClientRect().height) : 0 } }, row)
      await h.locator(`${row} > button`).focus()
      await h.keyboard.press('Enter')
      const keyOpen = await chevron()
      await wait(400)
      await h.keyboard.press('Enter')
      const keyShut = await chevron()
      await wait(400)
      check('↵ on a row: its choices are there at once, and its chevron is simply turned with them (no turn playing), both ways', keyOpen.open && keyOpen.body > 20 && keyOpen.moving === 0 && keyOpen.rotate === '90deg' && !keyShut.open && keyShut.moving === 0 && keyShut.rotate !== '90deg', `opening: ${JSON.stringify(keyOpen)}; closing: ${JSON.stringify(keyShut)}`)
      await h.click(`${row} > button`)
      const clickOpen = await chevron()
      await wait(500)
      const clickRest = await chevron()
      await h.click(`${row} > button`)
      await wait(500)
      check('  and a click on it turns the chevron as its choices come, ending turned', clickOpen.open && clickOpen.moving > 0 && clickRest.open && clickRest.rotate === '90deg' && clickRest.moving === 0, `at the click: ${JSON.stringify(clickOpen)}; at rest: ${JSON.stringify(clickRest)}`)
      // With FRAMES=dir: the page's own frames through ↵ opening and closing the row, and a click opening it.
      if (dir) {
        await h.locator(`${row} > button`).focus()
        await cast('last-chevron-key-open', () => h.keyboard.press('Enter'), 300)
        await cast('last-chevron-key-shut', () => h.keyboard.press('Enter'), 300)
        await cast('last-chevron-click-open', () => h.click(`${row} > button`), 400)
        await h.click(`${row} > button`)
        await wait(400)
      }
      await shut()
    } else check('the event is on the week to open', false)
    // The same in the Calendar's other fold with a chevron: the all-day lane's, by ↵ (folded and opened again, as it was).
    await toMode('w')
    const lane = () => h.evaluate(() => { const svg = document.querySelector('[data-cal-allday-fold] svg'); return svg ? { moving: svg.getAnimations().length, rotate: getComputedStyle(svg).rotate, folded: document.querySelector('[data-cal-allday-lane]')?.hasAttribute('data-folded') } : null })
    if (await h.locator('[data-cal-allday-fold]').count()) {
      await h.locator('[data-cal-allday-fold]').focus()
      await h.keyboard.press('Enter')
      const one = await lane()
      await wait(400)
      await h.keyboard.press('Enter')
      const two = await lane()
      await wait(400)
      check('  and ↵ on the all-day lane\'s fold: the lane folds and opens at once, its chevron simply turned with it, both ways', !!one && !!two && one.folded !== two.folded && one.moving === 0 && two.moving === 0, `${JSON.stringify(one)}; ${JSON.stringify(two)}`)
      await h.keyboard.press('Escape')
    } else check('the all-day lane\'s fold is on the week', false)
    // 3. The tag field's hint: in the row's own flow under the field, on its words' edge, whole inside the popover.
    if (await openIn('task', 'Opened task')) {
      await h.locator('[data-cal-add] [data-task-rows] [data-task-tags] input').click()
      await h.keyboard.type('ab!', { delay: 8 })
      await wait(400)
      const hint = await h.evaluate(() => {
        const pop = document.querySelector('[data-cal-add]')
        const el = pop?.querySelector('[data-tag-hint]')
        const sized = pop?.querySelector('[data-cal-add-sized]')
        // The field with its "#", and the row's words (its tags, then the field) whose left edge the row's lines keep.
        const field = pop?.querySelector('[data-task-tags] input')?.parentElement
        const words = field?.parentElement
        if (!el || !sized || !field || !words) return { here: !!el }
        const [a, b, f, w] = [el.getBoundingClientRect(), sized.getBoundingClientRect(), field.getBoundingClientRect(), words.getBoundingClientRect()]
        return { here: true, text: el.textContent, floats: getComputedStyle(el).position === 'absolute', whole: a.top >= b.top - 0.5 && a.bottom <= b.bottom + 0.5 && a.left >= b.left - 0.5 && a.right <= b.right + 0.5, edge: Math.round((a.left - w.left) * 10) / 10, under: a.top >= f.bottom - 0.5, scrolls: sized.scrollHeight > sized.clientHeight + 1 }
      })
      check('the tag field\'s hint ("ab!" typed) sits under the field in the row\'s own flow, on its words\' edge, whole inside the popover, which does not scroll for it', hint.here && !hint.floats && hint.whole && hint.under && Math.abs(hint.edge) <= 1 && !hint.scrolls, JSON.stringify(hint))
      await shot('last-tag-hint')
      await h.keyboard.press('Escape')
      await wait(300)
      await shut()
    } else check('the task is on the week to open', false)
  }

  // Every frame the page draws for `ms`: where the draft is (or its pieces), where its popover is, and the day it is on,
  // read as the frame will be painted: in a ResizeObserver's answer, which comes after layout, once every frame callback
  // (the popover's own placing among them, in whatever order they run) is done. Read in a frame callback of its own, a
  // popover placed a few callbacks later in the same frame was read a frame behind its draft.
  const track = (ms) => h.evaluate((ms) => {
    window.__f = []
    window.__fDone = false
    const t0 = performance.now()
    const box = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.left, y: r.top, r: r.right, b: r.bottom } }
    // The draft as it is seen: its copy while it flies to its new day (over the page), else the draft in its day.
    const read = () => {
      const d = document.querySelector('[data-cal-level] [data-cal-draft]')
      const seen = document.querySelector('[data-cal-draft-flying]') ?? d
      const cell = d?.closest('[data-day], [data-cal-col]')?.getBoundingClientRect()
      const at = seen?.getBoundingClientRect()
      const whole = !!cell && !!at && at.left >= cell.left - 1 && at.right <= cell.right + 1 && at.top >= cell.top - 1 && at.bottom <= cell.bottom + 1
      window.__f.push({ t: Math.round(performance.now() - t0), d: box(seen), flying: seen !== d, whole, p: box(document.querySelector('[data-cal-add]')), day: d?.closest('[data-day]')?.dataset.day ?? d?.closest('[data-cal-col]')?.dataset.calCol ?? null, title: document.querySelector('[data-cal-title]')?.textContent ?? '' })
    }
    const beat = document.createElement('div')
    beat.style.cssText = 'position:fixed;left:0;top:0;width:1px;height:1px;opacity:0;pointer-events:none'
    document.body.append(beat)
    const after = new ResizeObserver(read)
    after.observe(beat)
    let on = false
    const tick = () => {
      if (performance.now() - t0 < ms) return void ((beat.style.width = (on = !on) ? '2px' : '1px'), requestAnimationFrame(tick))
      after.disconnect()
      beat.remove()
      window.__fDone = true
    }
    requestAnimationFrame(tick)
  }, ms)
  const tracked = async () => { await h.waitForFunction(() => window.__fDone, null, { timeout: 15000 }); return h.evaluate(() => window.__f) }
  const clearOf = (f) => !f.d || !f.p || f.p.x >= f.d.r - 0.5 || f.p.r <= f.d.x + 0.5 || f.p.y >= f.d.b - 0.5 || f.p.b <= f.d.y + 0.5
  const dayName = (key, how = 'short') => new Date(`${key}T12:00:00`).toLocaleDateString('en-GB', { weekday: how })
  const keyOf = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
  const said = (key) => new Date(`${key}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }).replace(',', '')

  // follow: the draft follows the words (ask 18, 14 Nov). Typed into a new one's line, a day ("tue 1pm") moves the draft to
  // it on the spring, over several frames, its popover beside it at every frame, never over it; a day in another month
  // turns the grid to it, and words that say no day bring it back where it was put; with Motion off it is simply there.
  // In Month for an event and a task (whose line then says the day it reads), and in Week (a time, then another week).
  if (parts.includes('follow')) {
    await toMode('m')
    const home = dayKeyOf(1)
    const there = dayKeyOf(3)
    const word = dayName(there).toLowerCase()
    await dbl(...corner(await cell(home)))
    await h.keyboard.type('Lunch with Sam ', { delay: 8 })
    await wait(200)
    await track(1100)
    await cast('follow-month', () => h.keyboard.type(`${word} 1pm`, { delay: 30 }), 600)
    let frames = await tracked()
    await wait(200)
    let s = await state()
    const went = frames.filter((f) => f.day === there && f.d)
    const across = new Set(went.map((f) => `${Math.round(f.d.x)},${Math.round(f.d.y)}`))
    if (stills) writeFileSync(`${stills}/follow-month-track.json`, JSON.stringify(frames))
    const over = frames.filter((f) => !clearOf(f)).slice(0, 3).map((f) => `${f.t}ms draft ${[f.d.x, f.d.y, f.d.r, f.d.b].map(Math.round)} popover ${[f.p.x, f.p.y, f.p.r, f.p.b].map(Math.round)}`)
    check(`follow, Month: "${word} 1pm" typed moves the draft from ${home} to ${there}, and the line reads that day at 13:00`, s.draft?.day === there && new RegExp(dayName(there)).test(s.pop?.said ?? '') && /13:00|1:00/.test(s.pop?.said ?? ''), `${s.draft?.day}; ${s.pop?.said}`)
    check('follow, Month: it travels there over several frames, on the spring', across.size >= 4, `${across.size} places in ${went.length} frames`)
    const cut = went.filter((f) => !f.flying && !f.whole)
    check('follow, Month: it is seen the whole way, flying over the page or whole in its day, never cut off by a day\'s edge', went.length > 0 && went.some((f) => f.flying) && !cut.length, `${went.filter((f) => f.flying).length} frames flying, ${cut.length} cut off`)
    check('follow, Month: at every frame of the move its popover is beside it, never over it, and it ends tied to it', went.length > 0 && frames.every(clearOf) && apart(s) && inside(s), `${frames.filter((f) => !clearOf(f)).length} of ${frames.length} frames overlap${over.length ? `: ${over.join('; ')}` : ''}; side ${s.pop?.side}`)
    await shot('follow-month-moved')
    // A day in another month: the grid turns to it; no day said: back where it was put, the grid with it.
    const far = c.now()
    far.setDate(1)
    far.setMonth(far.getMonth() + 2)
    far.setDate(10)
    const farKey = keyOf(far)
    const month = far.toLocaleDateString('en-GB', { month: 'long' })
    await h.keyboard.press('Meta+a')
    await h.keyboard.type(`Lunch 10 ${far.toLocaleDateString('en-GB', { month: 'short' }).toLowerCase()} 1pm`, { delay: 8 })
    await wait(900)
    s = await state()
    const title = await h.evaluate(() => document.querySelector('[data-cal-title]')?.textContent ?? '')
    const turned = s.draft?.day === farKey && title.includes(month)
    check(`follow, Month: a day in another month (${farKey}) turns the grid to ${month}, the draft on it, its popover beside it`, turned && apart(s) && inside(s), `${s.draft?.day}; title ${title}`)
    await h.keyboard.press('Meta+a')
    await h.keyboard.type('Lunch', { delay: 8 })
    await wait(900)
    s = await state()
    const back = await h.evaluate(() => document.querySelector('[data-cal-title]')?.textContent ?? '')
    check('follow, Month: words that say no day then bring the draft back where it was put, the grid with it', turned && s.draft?.day === home && !back.includes(month) && apart(s), `${s.draft?.day}; title ${back}`)
    // Motion off: simply there.
    await h.evaluate(() => document.documentElement.setAttribute('data-motion', 'off'))
    await track(700)
    await h.keyboard.type(` ${word}`, { delay: 8 })
    frames = await tracked()
    await h.evaluate(() => document.documentElement.removeAttribute('data-motion'))
    const still = new Set(frames.filter((f) => f.day === there && f.d).map((f) => `${Math.round(f.d.x)},${Math.round(f.d.y)}`))
    check('follow, Month: with Motion off it is simply there, in one place from its first frame', (await state()).draft?.day === there && still.size === 1, `${still.size} places`)
    await h.keyboard.press('Escape')
    await wait(400)
    // A task: its line says the day its words read, and its draft is there.
    await dbl(...corner(await cell(home)))
    await h.click('[data-cal-add] [data-day-side-kind="task"]')
    await wait(400)
    await h.keyboard.type(`Call mum ${word}`, { delay: 8 })
    await wait(700)
    s = await state()
    const long = `${dayName(there, 'long')} ${Number(there.slice(8))}`
    const shown = s.draft?.kind === 'task' && s.draft.day === there && (s.pop?.said ?? '').includes(long)
    check(`follow, Month: a task's "Call mum ${word}" moves its draft to ${there}, and its line says "${long}"`, shown, `${s.draft?.day}; ${s.pop?.said}`)
    await h.keyboard.press('Enter')
    await wait(800)
    const mum = await tasksNamed('Call mum')
    check('follow, Month: ↵ makes the task on the day its draft showed', shown && mum.length === 1 && mum[0].dueAt && keyOf(new Date(mum[0].dueAt)) === there, mum[0]?.dueAt)
    await h.keyboard.press('Meta+z')
    await wait(600)
    // Week: a time alone moves it down its day; another week's day turns the week to it.
    await toMode('w')
    const today = dayKeyOf(0)
    const col = await h.evaluate((key) => { const el = document.querySelector(`[data-cal-level] [data-cal-col="${key}"]`); const scroller = el?.closest('[data-cal-scroll]'); if (!el || !scroller) return null; scroller.scrollTop = (el.getBoundingClientRect().height / 24) * 9; const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, top: r.top } }, today)
    if (col) {
      const hour = await h.evaluate(() => { const el = document.querySelector('[data-cal-level] [data-cal-col]'); const scroller = el.closest('[data-cal-scroll]'); return { top: el.getBoundingClientRect().top, hour: el.getBoundingClientRect().height / 24, view: scroller.getBoundingClientRect() } })
      await dbl(col.x, hour.top + 10.25 * hour.hour)
      await h.keyboard.type('Standup ', { delay: 8 })
      await wait(200)
      const was = await state()
      await track(1000)
      await cast('follow-week', () => h.keyboard.type('4pm', { delay: 30 }), 600)
      frames = await tracked()
      await wait(200)
      s = await state()
      const down = new Set(frames.filter((f) => f.d).map((f) => Math.round(f.d.y)))
      check('follow, Week: "4pm" typed moves the block down its day to 16:00, over several frames, its popover beside it at every frame', s.draft?.day === today && was.draft && s.draft.y !== was.draft.y && down.size >= 4 && frames.every(clearOf) && apart(s), `${was.draft?.y} to ${s.draft?.y}; ${down.size} places; ${frames.filter((f) => !clearOf(f)).length} overlap`)
      await h.keyboard.type(` ${word}`, { delay: 8 })
      await wait(900)
      s = await state()
      const shown = await h.evaluate((key) => !!document.querySelector(`[data-cal-level] [data-cal-col="${key}"]`), there)
      check(`follow, Week: "${word}" turns the week to show ${there}, the block there, its popover beside it`, shown && s.draft?.day === there && apart(s) && inside(s), `${s.draft?.day}; shown ${shown}`)
      await shot('follow-week-moved')
      await h.keyboard.press('Escape')
      await wait(400)
    } else check('follow, Week: today\'s column is shown', false)
  }

  // span: a press dragged across days in Month makes one event of several days (ask 18, 14 Nov). The bar is drawn as the
  // pointer moves, into the next week's row and backwards too, a quiet tick per day; Esc puts everything back; letting go
  // opens the popover at the bar's end (its start when there is no room) reading the days. The event is then drawn the
  // same way in Month and across its days in Week's all-day lane; an end dragged changes its days and its middle carried
  // moves it (the card saying where, the days lit), each with Undo and ⌘Z.
  if (parts.includes('span')) {
    await toMode('m')
    const a = dayKeyOf(1)
    const b = dayKeyOf(10)
    const pieces = (sel) => h.evaluate((sel) => [...document.querySelectorAll(`[data-cal-level] ${sel}`)].map((el) => { const r = el.getBoundingClientRect(); return { x: r.left, y: r.top, r: r.right, b: r.bottom, h: r.height } }), sel)
    const ticks = () => h.evaluate(() => (window.haligtreeHeard ?? []).filter((one) => one === 'click:tick').length)
    const press = async (key) => { const [x, y] = corner(await cell(key)); await h.mouse.move(x, y); await h.mouse.down() }
    // A day below the month's fold (a span near the month's end reaches its last row) is scrolled into view first, by
    // the wheel with the button still held, as a hand on a trackpad does: its corner was off the grid, and the pointer
    // let go there was over nothing, so the bar kept its days (19 Nov).
    const inView = (key) => h.evaluate((key) => {
      const el = document.querySelector(`[data-cal-level] [data-day="${key}"]`)
      if (!el) return 0
      let box = { top: 0, bottom: innerHeight }
      for (let up = el.parentElement; up; up = up.parentElement) if (/auto|scroll/.test(getComputedStyle(up).overflowY) && up.scrollHeight > up.clientHeight) { const r = up.getBoundingClientRect(); box = { top: Math.max(box.top, r.top), bottom: Math.min(box.bottom, r.bottom) }; break }
      const r = el.getBoundingClientRect()
      return r.bottom > box.bottom ? r.bottom - box.bottom + 8 : r.top < box.top ? r.top - box.top - 8 : 0
    }, key)
    const toDay = async (key, steps = 14) => {
      for (let tries = 0, by = await inView(key); by && tries < 4; tries++, by = await inView(key)) (await h.mouse.wheel(0, by), await wait(400))
      const [x, y] = corner(await cell(key)); await h.mouse.move(x, y, { steps })
    }
    // Day by day, as a hand drawing across them goes (about ten days a second: ticks closer than 70ms are one, lib/sound.ts
    // `often`): every day between taken in once.
    const walk = async (from, to) => {
      const step = from <= to ? 1 : -1
      for (let at = new Date(`${from}T12:00:00`); step > 0 ? keyOf(at) <= to : keyOf(at) >= to; at = new Date(at.getTime() + step * 864e5)) (await toDay(keyOf(at), 1), await wait(90))
    }
    // Drawn and let go of with Esc.
    await h.evaluate(() => { if (window.haligtreeHeard) window.haligtreeHeard.length = 0 })
    await press(a)
    await walk(a, b)
    await wait(150)
    const drawn = await pieces('[data-cal-draft-bar]')
    const heardTicks = await ticks()
    check(`span: a press dragged from ${a} to ${b} draws one bar, carried into the next week's row`, drawn.length >= 2 && new Set(drawn.map((p) => Math.round(p.y))).size >= 2, `${drawn.length} pieces`)
    check('span: a quiet tick as each day is taken in, nine days, nine ticks', heardTicks === 9, `${heardTicks} ticks`)
    await h.keyboard.press('Escape')
    await wait(150)
    await h.mouse.up()
    await wait(400)
    let s = await state()
    check('span: Esc mid-drag takes the bar away, and letting go then makes nothing', drawn.length >= 2 && (await pieces('[data-cal-draft-bar]')).length === 0 && !s.pop, `${(await pieces('[data-cal-draft-bar]')).length} pieces; popover ${!!s.pop}`)
    // Drawn backwards and let go of: the popover at the bar's end, reading the days.
    await press(b)
    await cast('span-draw', () => walk(b, a), 300)
    await h.mouse.up()
    await wait(700)
    s = await state()
    const bar = await pieces('[data-cal-draft-bar]')
    // The point's middle within 16px of the piece it is tied to, on whichever side of it the popover is.
    const tie = await h.evaluate(() => { const end = document.querySelector('[data-cal-level] [data-cal-draft-end]'); const start = document.querySelector('[data-cal-level] [data-cal-draft-start]'); const arrow = document.querySelector('[data-cal-hold] [data-slot="popover-arrow"]'); if (!arrow) return null; const r = arrow.getBoundingClientRect(); const [cx, cy] = [r.left + r.width / 2, r.top + r.height / 2]; const on = (el) => { const b = el?.getBoundingClientRect(); return !!b && cx > b.left - 16 && cx < b.right + 16 && cy > b.top - 16 && cy < b.bottom + 16 }; return { end: on(end), start: on(start), side: arrow.closest('[data-cal-hold]')?.dataset.side } })
    const words = `${said(a)} – ${said(b)}, all day`
    check(`span: drawn backwards too, and let go of, the popover opens at the bar's end (or its start), reading "${words}"`, bar.length >= 2 && !!s.pop && !!tie && (tie.end || tie.start) && (s.pop.said ?? '').includes(words), `${bar.length} pieces; tied ${JSON.stringify(tie)}; ${s.pop?.said}`)
    check('span: the popover is clear of every piece of the bar, inside the window', !!s.pop && bar.length >= 2 && bar.every((p) => s.pop.x >= p.r - 0.5 || s.pop.r <= p.x + 0.5 || s.pop.y >= p.b - 0.5 || s.pop.b <= p.y + 0.5) && inside(s), `popover ${JSON.stringify(s.pop && [s.pop.x, s.pop.y, s.pop.r, s.pop.b].map(Math.round))}; pieces ${JSON.stringify(bar.map((p) => [p.x, p.y, p.r, p.b].map(Math.round)))}`)
    await shot('span-open')
    await h.keyboard.type('Trip', { delay: 8 })
    await h.keyboard.press('Enter')
    await wait(900)
    let trip = (await eventsNamed('Trip'))[0]
    s = await state()
    const lastDay = (one) => keyOf(new Date(new Date(one.end).getTime() - 60000))
    check(`span: ↵ makes one event from ${a} to ${b}, all day, said with Undo`, !!trip && trip.allDay && keyOf(new Date(trip.start)) === a && lastDay(trip) === b && /Added for/.test(s.toast) && /Undo/.test(s.toast), trip ? `${trip.start} to ${trip.end}; ${s.toast.slice(0, 60)}` : 'none made')
    if (trip) {
      const key = trip.key
      const own = await pieces(`[data-cal-event-chip="${key}"]`)
      check('span: it is drawn the same way in Month: a bar across its weeks, as tall as the draft was', own.length >= 2 && own.every((p) => Math.abs(p.h - bar[0].h) <= 1), `${own.length} pieces, ${own.map((p) => p.h).join()} beside ${bar[0].h}`)
      // Its end, dragged two days on, and back with ⌘Z.
      const c2 = dayKeyOf(12)
      const end = (await pieces(`[data-cal-event-chip="${key}"] [data-cal-bar-end="end"]`))[0]
      const cursor = await h.evaluate((key) => { const el = document.querySelector(`[data-cal-level] [data-cal-event-chip="${key}"] [data-cal-bar-end="end"]`); return el ? getComputedStyle(el).cursor : null }, key)
      if (end) {
        await h.mouse.move(end.x + 3, (end.y + end.b) / 2)
        await h.mouse.down()
        await toDay(c2)
        await wait(150)
        const growing = await pieces(`[data-cal-event-chip="${key}"]`)
        await h.mouse.up()
        await wait(900)
        trip = (await eventsNamed('Trip'))[0]
        s = await state()
        check(`span: its end dragged to ${c2} makes it end there (the bar drawn there as it goes, the pointer saying so), said with Undo`, cursor === 'ew-resize' && growing.length >= 2 && lastDay(trip) === c2 && keyOf(new Date(trip.start)) === a && /Lasts until/.test(s.toast) && /Undo/.test(s.toast), `${cursor}; ${trip.start} to ${trip.end}; ${s.toast.slice(0, 50)}`)
        await h.keyboard.press('Meta+z')
        await wait(800)
        trip = (await eventsNamed('Trip'))[0]
        check('span: ⌘Z puts its end back', !!trip && lastDay(trip) === b, trip?.end ?? 'the event is gone')
      } else check('span: the bar has an end to take', false)
      // Its start, dragged a day back.
      const start = (await pieces(`[data-cal-event-chip="${key}"] [data-cal-bar-end="start"]`))[0]
      if (start) {
        await h.mouse.move(start.x + 3, (start.y + start.b) / 2)
        await h.mouse.down()
        await toDay(dayKeyOf(0))
        await h.mouse.up()
        await wait(900)
        trip = (await eventsNamed('Trip'))[0]
        s = await state()
        check(`span: its start dragged back to ${dayKeyOf(0)} makes it start there, said with Undo`, keyOf(new Date(trip.start)) === dayKeyOf(0) && lastDay(trip) === b && /Starts/.test(s.toast), `${trip.start}; ${s.toast.slice(0, 50)}`)
        await h.keyboard.press('Meta+z')
        await wait(800)
      } else check('span: the bar has a start to take', false)
      // Its middle, carried: the card says where, the days light; Esc puts it back; then let go, moved, with ⌘Z.
      const first = (await pieces(`[data-cal-event-chip="${key}"]`))[0]
      const grab = { x: first.x + Math.min(60, (first.r - first.x) / 2), y: (first.y + first.b) / 2 }
      const grabbed = await h.evaluate(({ x, y }) => document.elementsFromPoint(x, y).map((el) => el.closest('[data-month-plan] [data-day]')).find(Boolean)?.dataset.day, grab)
      const goal = keyOf(new Date(new Date(`${grabbed}T12:00:00`).getTime() + 2 * 864e5))
      const moved = keyOf(new Date(new Date(`${a}T12:00:00`).getTime() + 2 * 864e5))
      // A day it would cover that the pointer is not over, read before and during the carry.
      const after = keyOf(new Date(new Date(`${b}T12:00:00`).getTime() + 2 * 864e5))
      const litKey = goal === after ? moved : after
      await h.mouse.move(5, 5)
      await wait(200)
      const restBg = (await cell(litKey)).bg
      await h.mouse.move(grab.x, grab.y)
      await h.mouse.down()
      await toDay(goal)
      await wait(200)
      const card = await h.evaluate(() => document.querySelector('[data-cal-bar-card]')?.textContent ?? null)
      const lit = (await cell(litKey)).bg
      await shot('span-carry')
      await h.keyboard.press('Escape')
      await wait(150)
      await h.mouse.up()
      await wait(500)
      trip = (await eventsNamed('Trip'))[0]
      check(`span: its middle carried two days on rides in the one card, saying "Move to ${said(moved)}", the days it would cover lit`, (card ?? '').includes(`Move to ${said(moved)}`) && lit !== restBg, `card ${card}; lit ${lit} beside ${restBg}`)
      check('span: Esc mid-carry puts it back where it was', !!card && keyOf(new Date(trip.start)) === a && !(await h.evaluate(() => !!document.querySelector('[data-cal-bar-card]'))), trip.start)
      await h.mouse.move(grab.x, grab.y)
      await h.mouse.down()
      await toDay(goal)
      await h.mouse.up()
      await wait(900)
      trip = (await eventsNamed('Trip'))[0]
      s = await state()
      check(`span: let go, it moves to ${moved}, its days kept, said with Undo`, !!card && keyOf(new Date(trip.start)) === moved && /Moved to/.test(s.toast) && /Undo/.test(s.toast), `${trip.start}; ${s.toast.slice(0, 50)}`)
      await h.keyboard.press('Meta+z')
      await wait(800)
      trip = (await eventsNamed('Trip'))[0]
      check('span: ⌘Z puts it back', !!card && keyOf(new Date(trip.start)) === a, trip.start)
      // Week: in the all-day lane across its days.
      await toMode('w')
      for (let n = 0; n < 2 && !(await h.evaluate((key) => !!document.querySelector(`[data-cal-level] [data-cal-allday-lane] [data-cal-event-chip="${key}"]`), key)); n++) { await h.keyboard.press('ArrowRight'); await wait(500) }
      const lane = await h.evaluate((key) => { const el = document.querySelector(`[data-cal-level] [data-cal-allday-lane] [data-cal-event-chip="${key}"]`); const col = document.querySelector('[data-cal-level] [data-cal-allday]'); return el && col ? { w: el.getBoundingClientRect().width, day: col.getBoundingClientRect().width } : null }, key)
      check('span: in Week it sits in the all-day lane across its days', !!card && !!lane && lane.w > lane.day * 1.5, JSON.stringify(lane))
      await shot('span-week')
      await toMode('m')
      // Its end held past the grid's bottom edge, no wheel: the weeks scroll under the still pointer (lib/edge-scroll.ts)
      // until a day two weeks below the last one in view comes up, and let go on it the bar ends there (19 Nov, LE1).
      for (let tries = 0, by = await inView(b); by && tries < 4; tries++, by = await inView(b)) (await h.mouse.wheel(0, by), await wait(400))
      const tail = (await pieces(`[data-cal-event-chip="${key}"] [data-cal-bar-end="end"]`)).at(-1)
      const far = tail && await h.evaluate((x) => {
        const run = document.querySelector('[data-cal-level] [data-month-scroll]')?.getBoundingClientRect()
        const col = [...document.querySelectorAll('[data-cal-level] [data-month-plan] [data-day]')].map((el) => ({ day: el.dataset.day, r: el.getBoundingClientRect() })).filter((one) => one.r.left <= x && one.r.right >= x && one.r.bottom <= run.bottom + 0.5).sort((p, q) => q.r.top - p.r.top)[0]
        return run && col ? { bottom: run.bottom, last: col.day } : null
      }, tail.x + 3)
      if (far) {
        const goal = keyOf(new Date(new Date(`${far.last}T12:00:00`).getTime() + 14 * 864e5))
        const scrollTop = () => h.evaluate(() => document.querySelector('[data-cal-level] [data-month-scroll]')?.scrollTop ?? 0)
        const top0 = await scrollTop()
        await h.mouse.move(tail.x + 3, (tail.y + tail.b) / 2)
        await h.mouse.down()
        await h.mouse.move(tail.x + 3, far.bottom + 24, { steps: 12 })
        let up = null
        for (const until = Date.now() + 9000; Date.now() < until; await wait(100)) {
          up = await h.evaluate(({ goal, bottom }) => { const r = document.querySelector(`[data-cal-level] [data-month-plan] [data-day="${goal}"]`)?.getBoundingClientRect(); return r && r.bottom < bottom - 4 ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null }, { goal, bottom: far.bottom })
          if (up) break
        }
        const scrolled = (await scrollTop()) - top0
        if (up) await h.mouse.move(up.x, up.y, { steps: 2 })
        await h.mouse.up()
        await wait(900)
        trip = (await eventsNamed('Trip'))[0]
        s = await state()
        check(`span: its end held past the grid's bottom edge (no wheel) scrolls the weeks, and let go on ${goal}, out of view when pressed, it ends there`, !!up && scrolled > 0 && lastDay(trip) === goal && keyOf(new Date(trip.start)) === a && /Lasts until/.test(s.toast), `scrolled ${Math.round(scrolled)}px; ${up ? 'came into view' : 'never came into view'}; ${trip.start} to ${trip.end}; ${s.toast.slice(0, 50)}`)
        await h.keyboard.press('Meta+z')
        await wait(800)
      } else check("span: the bar's end and the grid's bottom edge were found", false)
      // A task carried the same way: past the bottom edge, no wheel, onto a day out of view when it was lifted.
      await toMode('m')
      const chip = await h.evaluate(() => {
        const run = document.querySelector('[data-cal-level] [data-month-scroll]').getBoundingClientRect()
        const today = document.querySelector('[data-cal-level] [data-day] [aria-current]')?.closest('[data-day]')?.dataset.day ?? ''
        const el = [...document.querySelectorAll('[data-cal-level] [data-plan-task]')].find((el) => { const r = el.getBoundingClientRect(); const day = el.closest('[data-day]')?.dataset.day ?? ''; return day >= today && r.top > run.top + 4 && r.bottom < run.bottom - 4 && getComputedStyle(el).cursor !== 'default' })
        if (!el) return null
        const r = el.getBoundingClientRect()
        const col = [...document.querySelectorAll('[data-cal-level] [data-month-plan] [data-day]')].map((one) => ({ day: one.dataset.day, r: one.getBoundingClientRect() })).filter((one) => one.r.left <= r.left + 10 && one.r.right >= r.left + 10 && one.r.bottom <= run.bottom + 0.5).sort((p, q) => q.r.top - p.r.top)[0]
        return { id: el.dataset.planTask, x: r.left + 10, y: (r.top + r.bottom) / 2, bottom: run.bottom, last: col?.day }
      })
      if (chip?.last) {
        const goal = keyOf(new Date(new Date(`${chip.last}T12:00:00`).getTime() + 14 * 864e5))
        await h.mouse.move(chip.x, chip.y)
        await h.mouse.down()
        await h.mouse.move(chip.x, chip.bottom + 24, { steps: 12 })
        let up = null
        for (const until = Date.now() + 9000; Date.now() < until; await wait(100)) {
          up = await h.evaluate(({ goal, bottom }) => { const r = document.querySelector(`[data-cal-level] [data-month-plan] [data-day="${goal}"]`)?.getBoundingClientRect(); return r && r.bottom < bottom - 4 ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null }, { goal, bottom: chip.bottom })
          if (up) break
        }
        if (up) await h.mouse.move(up.x, up.y, { steps: 4 })
        await wait(250)
        await h.mouse.up()
        await wait(900)
        const task = (await v('tasks')).find((one) => one.id === chip.id)
        const due = task?.dueAt ?? task?.due
        check(`span: a task carried past the grid's bottom edge (no wheel) scrolls the weeks, and let go on ${goal}, out of view when lifted, it moves there`, !!up && !!due && keyOf(new Date(due)) === goal, `${up ? 'came into view' : 'never came into view'}; due ${due}`)
        if (due && keyOf(new Date(due)) === goal) (await h.keyboard.press('Meta+z'), await wait(800))
      } else check('span: a task in view to carry was found', false, JSON.stringify(chip))
    } else for (const name of ['drawn the same way in Month', 'its end dragged', '⌘Z puts its end back', 'its start dragged', 'its middle carried in the one card', 'Esc mid-carry', 'let go, it moves', '⌘Z puts it back', 'in Week across its days']) check(`span: ${name}`, false, 'no event was made from days drawn across')
  }

  if (parts.includes('frames') && dir) {
    await toMode('m')
    for (const look of ['light', 'dark']) {
      await c.look(look)
      await wait(400)
      const at = await cell(dayKeyOf(1))
      // The entrance, held at four moments: a picture takes longer than the entrance lasts (150ms), so its own animation is
      // stopped as it starts and stepped by hand, a picture at each step. Then the same again, played and filmed.
      await h.evaluate(() => { const tick = () => { const list = document.querySelector('[data-cal-add]')?.getAnimations() ?? []; if (list.length) list.forEach((one) => one.pause()); else requestAnimationFrame(tick) }; requestAnimationFrame(tick) })
      await dbl(...corner(at))
      for (const t of [0, 50, 100, 150]) {
        const held = await h.evaluate((t) => { const list = document.querySelector('[data-cal-add]')?.getAnimations() ?? []; list.forEach((one) => { one.currentTime = t }); const pop = document.querySelector('[data-cal-add]'); const style = getComputedStyle(pop); return { n: list.length, opacity: style.opacity, scale: new DOMMatrixReadOnly(style.transform).a.toFixed(3), origin: style.transformOrigin } }, t)
        console.log(`NOTE  ${look}: the entrance at ${t}ms: ${JSON.stringify(held)}`)
        await shot(`f-${look}-grow-${String(t).padStart(3, '0')}`)
      }
      await h.evaluate(() => document.querySelector('[data-cal-add]')?.getAnimations().forEach((one) => one.finish()))
      await h.keyboard.press('Escape')
      await wait(300)
      await film(`f-${look}-open`, () => dbl(...corner(at)), 7)
      await h.keyboard.type('Lunch with Sam fri 1pm')
      await wait(200)
      await film(`f-${look}-to-task`, async () => { await h.click('[data-cal-add] [data-day-side-kind="task"]'); await wait(400) }, 8)
      await film(`f-${look}-to-event`, async () => { await h.click('[data-cal-add] [data-day-side-kind="event"]'); await wait(400) }, 8)
      await film(`f-${look}-add`, async () => { await h.keyboard.press('Enter'); await wait(450) }, 8)
      await h.keyboard.press('Meta+z')
      await wait(500)
      // Beside two of the app's own popovers: the small month under the title, and an event's card.
      await dbl(...corner(at))
      await shot(`sib-${look}-add`)
      await h.keyboard.press('Escape')
      await wait(300)
      await h.click('[data-cal-jump]')
      await wait(400)
      await shot(`sib-${look}-jump`)
      await h.keyboard.press('Escape')
      await wait(300)
      const chip = await h.evaluate(() => { const el = document.querySelector('[data-cal-level] [data-cal-event-chip]'); if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 } })
      if (chip) { await h.mouse.dblclick(chip.x, chip.y); await wait(500); await shot(`sib-${look}-opened`); await h.keyboard.press('Escape'); await wait(300) }
      // The pinch with its lit block, held short of the change, then through it.
      const row = await weekRow()
      await pinch(row.x, row.y, -3, 3)
      await shot(`f-${look}-pinch-lit`)
      await wait(900)
      await film(`f-${look}-pinch`, async () => { await pinch(row.x, row.y, -6, 8); await wait(500) }, 9)
      await wait(600)
      await toMode('m')
    }
    await c.look('light')
  }
} catch (error) {
  check('the probe ran to its end', false, String(error?.stack ?? error).slice(0, 600))
}
console.log(c.errors.length ? `page errors: ${c.errors.slice(0, 5).join(' | ')}` : 'no page errors')
console.log(`${passed}/${all} passed  (load ${os.loadavg()[0].toFixed(1)})`)
await c.close()
process.exit(passed === all && !c.errors.length ? 0 : 1)
