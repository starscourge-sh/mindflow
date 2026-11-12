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
//   pinch   the light under a pinch: the week (in a month) or the day (in a week) the fingers are opening is lit while they
//           are on it, unlit when the pinch comes to nothing, and the level it becomes arrives lit and lets the light go.
//   frames  with FRAMES=dir: a picture every 50ms through the popover growing, Event to Task, adding, and a pinch with its
//           lit block, light and dark; and the popover beside two of the app's own (the small month, an event's card).
//   QA_ARGS=--sandbox QA_DATA=<a copy of the seeded sandbox> QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/cal-add.mjs
import os from 'node:os'
import { mkdirSync } from 'node:fs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'
const parts = (process.env.PART ?? 'month,week,narrow,pinch').split(',')
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
  const draft = document.querySelector('[data-cal-level] [data-cal-draft]')
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
  const pinch = (x, y, dy, n) => h.evaluate(([x, y, dy, n]) => new Promise((res) => { let i = 0; const send = () => { (document.elementFromPoint(x, y) ?? document.body).dispatchEvent(new WheelEvent('wheel', { deltaY: dy, ctrlKey: true, clientX: x, clientY: y, bubbles: true, cancelable: true })); if (++i < n) setTimeout(send, 14); else res() }; send() }), [x, y, dy, n])
  const lights = () => h.evaluate(() => ({ lit: [...document.querySelectorAll('[data-cal-lit]')].map((el) => el.dataset.monthWeek ? `week ${el.dataset.monthWeek}` : el.dataset.calCol ? `col ${el.dataset.calCol}` : el.dataset.calHead ? `head ${el.dataset.calHead}` : `allday ${el.dataset.calAllday}`), wash: (() => { const el = document.querySelector('[data-month-week][data-cal-lit], [data-cal-col][data-cal-lit]'); return el ? getComputedStyle(el, '::after').backgroundColor : '' })(), landed: !!document.querySelector('[data-cal-landed]'), mode: document.querySelector('[data-cal-mode]')?.getAttribute('data-cal-mode') }))
  const weekRow = () => h.evaluate(() => { const frame = document.querySelector('[data-cal-level]').getBoundingClientRect(); const rows = [...document.querySelectorAll('[data-cal-level] [data-month-week]')].filter((el) => { const r = el.getBoundingClientRect(); return r.top >= frame.top && r.bottom <= frame.bottom }); const el = rows[2]; const r = el.getBoundingClientRect(); return { key: el.dataset.monthWeek, x: r.left + r.width / 2, y: r.top + r.height / 2 } })

  if (parts.includes('pinch')) {
    await toMode('m')
    const row = await weekRow()
    // A short pinch, short of the change: the week is lit while the fingers are on it, and unlit once they have gone.
    await pinch(row.x, row.y, -3, 3)
    let l = await lights()
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
    await pinch(col.x, col.y, -3, 3)
    l = await lights()
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
      if (chip) { await h.mouse.click(chip.x, chip.y); await wait(500); await shot(`sib-${look}-card`); await h.keyboard.press('Escape'); await wait(300) }
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
