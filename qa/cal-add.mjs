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
//   open    one way for making and for opening: a click on an event or a task picks it and opens nothing; a double-click,
//           ↵, its menu's "Open" and ⌘K open the same popover on it, tied to it, its name in the line; "Open" there is its
//           page in the side panel; a name typed over is kept with Undo and ⌘Z. In Month, Week and Day, for an event and
//           for a task, then from Upcoming, and from Home's month and the Journal's.
//   rows    the quiet rows under an open thing's line: an event's calendar, place, people, reminder and repeat, a task's
//           day and time and its tags; each one line that opens in place, the width one, the height following, each
//           change kept as it is made with Undo and ⌘Z; at 560 by 400 the rows scroll inside the popover.
//   frames  with FRAMES=dir: a picture every 50ms through the popover growing, Event to Task, adding, and a pinch with its
//           lit block, light and dark; and the popover beside two of the app's own (the small month, an event's card).
//   QA_ARGS=--sandbox QA_DATA=<a copy of the seeded sandbox> QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/cal-add.mjs
import os from 'node:os'
import { mkdirSync } from 'node:fs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'
const parts = (process.env.PART ?? 'month,week,narrow,pinch,home,open,rows').split(',')
const c = await sandbox({ width: Number(process.env.QA_W ?? 1440), height: Number(process.env.QA_H ?? 900), at: '11:30' })
const { h, v, go } = c
let passed = 0
let all = 0
const check = (name, pass, detail = '') => { all++; if (pass) passed++; console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`) }
const wait = (ms) => h.waitForTimeout(ms)
const dir = process.env.FRAMES
if (dir) mkdirSync(dir, { recursive: true })
const dayKeyOf = (by) => { const d = c.now(); d.setDate(d.getDate() + by); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
const cues = () => h.evaluate(() => [...(window.haligtreeCued ?? [])])
/** The cues an action played, by name: the app keeps its last fifty, so the list is emptied first and read whole after. */
const heard = async (run) => { await h.evaluate(() => { if (window.haligtreeCued) window.haligtreeCued.length = 0 }); await run(); await wait(900); return cues() }
const state = () => h.evaluate(() => {
  const box = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height, r: r.right, b: r.bottom } }
  const pop = document.querySelector('[data-cal-add]')
  const draft = document.querySelector('[data-cal-level] [data-cal-draft], [data-month-own] [data-cal-draft]')
  const field = pop?.querySelector('input')
  return {
    pop: pop && { ...box(pop), kind: pop.dataset.calAdd, side: pop.dataset.side, keyed: pop.hasAttribute('data-keyed'), arrow: box(pop.querySelector('[data-slot="popover-arrow"]')), sw: box(pop.querySelector('[role="radiogroup"]')),
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
const shot = async (name) => { if (dir) await h.screenshot({ path: `${dir}/${name}.png` }) }
/** A picture every 50ms while `run` plays out. */
const film = async (name, run, n = 8) => {
  if (!dir) return run()
  const going = run()
  for (let at = 0; at < n; at++) { const t = Date.now(); await h.screenshot({ path: `${dir}/${name}-${String(at * 50).padStart(3, '0')}.png` }); await wait(Math.max(0, 50 - (Date.now() - t))) }
  await going
}
const toMode = async (key) => { await h.keyboard.press('Escape'); await h.mouse.click(700, 30).catch(() => {}); await h.keyboard.press(key); await wait(700) }
const dbl = async (x, y) => { await h.mouse.move(x, y); await h.mouse.dblclick(x, y); await wait(600) }

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
    await h.keyboard.type('A very long title for an event that goes on and on past the width of any day in a month and then some more words after that')
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
    // A short pinch, short of the change: the week is lit while the fingers are on it, and unlit once they have gone.
    let l = await pinch(row.x, row.y, -3, 3)
    await shot('pinch-month-lit')
    check('a pinch over a week in Month lights that week, and only it', l.lit.join() === `week ${row.key}` && /0\.07|\/ 7%|0\.0[5-9]/.test(l.wash) && l.mode === 'month', `${l.lit.join()}; wash ${l.wash}`)
    await wait(900)
    l = await lights()
    check('the pinch come to nothing, the light goes', l.lit.length === 0 && l.mode === 'month', l.lit.join())
    // The whole pinch: the week opens, arrives lit, and the light goes once it has landed.
    await h.evaluate(() => { window.__lights = []; const tick = () => { window.__lights.push({ landed: !!document.querySelector('[data-cal-landed]'), mode: document.querySelector('[data-cal-mode]')?.getAttribute('data-cal-mode') }); if (window.__lights.length < 90) requestAnimationFrame(tick) }; requestAnimationFrame(tick) })
    await film('pinch-month-week', async () => { await pinch(row.x, row.y, -6, 8); await wait(500) }, 9)
    await wait(900)
    const seen = await h.evaluate(() => window.__lights)
    l = await lights()
    check('pinched on, the week opens, arrives lit, and the light is gone once it has landed', l.mode === 'week' && seen.some((one) => one.landed) && !l.landed && l.lit.length === 0, `${seen.filter((one) => one.landed).length} frames lit; landed now ${l.landed}; lit ${l.lit.join()}`)
    // A day in the week.
    const col = await h.evaluate(() => { const el = [...document.querySelectorAll('[data-cal-level] [data-cal-col]')][3]; const r = el.getBoundingClientRect(); const sc = el.closest('[data-cal-scroll]').getBoundingClientRect(); return { key: el.dataset.calCol, x: r.left + r.width / 2, y: sc.top + sc.height / 2 } })
    l = await pinch(col.x, col.y, -3, 3)
    await shot('pinch-week-lit')
    check('a pinch over a day in Week lights that day: its head, its all-day line and its hours', l.lit.sort().join() === [`allday ${col.key}`, `col ${col.key}`, `head ${col.key}`].join() && l.mode === 'week', l.lit.join())
    await wait(900)
    check('and lets it go when the pinch comes to nothing', (await lights()).lit.length === 0)
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
      const picks = await heard(() => h.mouse.click(...at))
      box = await thing(sel, label, false)
      let s = await state()
      check(`${name}: a click on the ${kind} picks it, ringed, and opens nothing`, box.ring === 'solid 2px' && !s.pop && !(await side()) && !picks.includes('open'), `ring ${box.ring}; cues ${picks.join() || 'none'}`)
      const cuesOpen = await heard(() => film(`open-${name}-${kind}`.toLowerCase().replace(/[^a-z-]/g, ''), () => h.mouse.dblclick(...at)))
      box = await thing(sel, label, false)
      s = await state()
      let on = await openOn()
      await shot(`open-${name}-${kind}`.toLowerCase().replace(/[^a-z-]/g, ''))
      check(`${name}: a double-click opens the same popover on the ${kind}, 320 wide, its name in the line with the keys`, s.pop?.kind === kind && !!on?.id && Math.abs(s.pop.w - 320) < 1 && !!s.pop.words?.includes(label) && s.pop.focused, `${s.pop?.w}px; words ${s.pop?.words}; focused ${s.pop?.focused}`)
      check(`${name}: it is beside the ${kind}, never over it, inside the window, with its point, and made one sound`, inside(s) && clear(s, box) && !!s.pop?.arrow && cuesOpen.filter((cue) => cue === 'open').length === 1, `side ${s.pop?.side}; cues ${cuesOpen.join()}; ${JSON.stringify(s.pop && [Math.round(s.pop.x), Math.round(s.pop.y), Math.round(s.pop.r), Math.round(s.pop.b)])} by ${JSON.stringify([Math.round(box.x), Math.round(box.y), Math.round(box.r), Math.round(box.b)])}`)
      check(`${name}: the side panel stays shut, and where the ${kind} is reads under the line`, !(await side()) && (kind === 'event' ? /14:00/ : /16:00/).test(s.pop?.said ?? ''), `${await side()}; ${s.pop?.said}`)
      await shut()
      check(`${name}: Esc closes it and the ${kind} stays picked`, !(await state()).pop && (await thing(sel, label, false))?.ring === 'solid 2px')
      // ↵ on the one picked.
      await h.mouse.click(...at)
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
    for (const [key, name] of [['m', 'Month'], ['w', 'Week'], ['d', 'Day']]) {
      await reach(key)
      await ways(name, 'event', SEL.event, 'Opens here')
      await ways(name, 'task', SEL.task, 'Opened task')
    }
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
      const cut = await h.evaluate(() => { const pop = document.querySelector('[data-cal-add]'); if (!pop) return null; const box = pop.getBoundingClientRect(); const sized = pop.querySelector('[data-cal-add-sized]'); const inner = sized.getBoundingClientRect(); return { out: [...pop.querySelectorAll('input, button, p')].filter((el) => el.offsetParent && !sized.contains(el) && (el.getBoundingClientRect().bottom > box.bottom + 0.5 || el.getBoundingClientRect().right > box.right + 0.5)).length + (inner.bottom > box.bottom + 0.5 || inner.right > box.right + 0.5 ? 1 : 0), scrolls: sized.scrollHeight > sized.clientHeight + 1 } })
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
      await ways(name, 'task', '[data-month-own] [data-plan-task]', 'Opened task', { bar: false })
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
        wide: [...pop.querySelectorAll('*')].filter((el) => el.offsetParent && el.getBoundingClientRect().right > box.right + 0.5).length,
        scrolls: sized ? sized.scrollHeight > sized.clientHeight + 1 : false, mask: sized ? getComputedStyle(sized).maskImage !== 'none' : false
      }
    })
    const theEvent = async () => (await eventsNamed('Opens here'))[0]
    const fits = (r) => r && r.x >= 11.5 && r.y >= 51.5 && r.r <= innerW - 11.5 && r.b <= innerH - 11.5
    let innerW = 1440
    let innerH = 900
    if (await openIn('event', 'Opens here')) {
      let r = await rows()
      await shot('rows-event')
      check('an open event has its quiet rows: calendar, place, people, reminder and repeat, each one line', r?.quiet.join() === 'calendar,remind,repeat' && r.place && r.people, JSON.stringify(r && { quiet: r.quiet, place: r.place, people: r.people }))
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
      check('"Repeat" opens its choices and "Reminder" folds: one row open at a time, the width the same', r?.quiet.join() === 'calendar,remind,repeat:open' && Math.abs(r.w - 320) < 1 && r.wide === 0 && fits(r) && await h.locator('[data-cal-add] [data-repeat-choices] [data-repeat]').count() >= 5, JSON.stringify(r?.quiet))
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
      check('  the keys stay in the popover once the field lets go: another ↵ starts no new event on the page', await h.evaluate(() => !!document.activeElement?.closest('[data-cal-add]')) && !s.draft && !!(await openOn())?.id, `draft ${JSON.stringify(s.draft)}; on ${(await openOn())?.id}`)
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
      check('560 by 400, "Repeat" open: the popover is inside the window at its one width (the window less its margins), its rows scroll inside it under the fading edge, nothing runs past its edge', fits(r) && r.w <= 320.5 && r.scrolls && r.mask && r.wide === 0, JSON.stringify(r && { w: r.w, h: r.h, box: [Math.round(r.x), Math.round(r.y), Math.round(r.r), Math.round(r.b)], scrolls: r.scrolls, mask: r.mask, wide: r.wide }))
      const reached = await h.evaluate(() => { const sized = document.querySelector('[data-cal-add] [data-cal-add-sized]'); sized.scrollTop = sized.scrollHeight; const last = [...sized.querySelectorAll('[data-repeat]')].at(-1); const a = last.getBoundingClientRect(); const b = sized.getBoundingClientRect(); return a.bottom <= b.bottom + 0.5 && a.top >= b.top - 0.5 })
      check('  and its last choice is reached by scrolling inside it', reached)
      await shut()
    } else console.log('NOTE  560 by 400: the event is not drawn by name at this size')
    await c.size(1440, 900)
    await wait(500)
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
