// Does the week fit: each day's meetings (a stand-in calendar) and task
// lengths against the working day, in the week view and in Close the week;
// "Move N tasks on" moving the least pressing to the next weekday with room,
// and one Undo; Today's and the week's one line of events and timed tasks;
// and a calendar macOS refused.
//
//   npx electron-vite build --outDir out-weekfit
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-weekfit/main/index.js MINDFLOW_QA_AWAY=1 SHOTS=<folder> node qa/week-fit.mjs
import { mkdirSync } from 'fs'
import { sandbox } from './sandbox-lib.mjs'

const SHOTS = process.env.SHOTS
if (SHOTS) mkdirSync(SHOTS, { recursive: true })
const pad = (n) => String(n).padStart(2, '0')
const key = (at) => `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`
const on = (day, time) => new Date(`${day}T${time}:00`).toISOString()
// Next week, as Close the week counts it: the Monday after this one.
const now = new Date()
const monday = new Date(now); monday.setHours(0, 0, 0, 0); monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7) + 7)
const plus = (n) => { const at = new Date(monday); at.setDate(at.getDate() + n); return key(at) }
const [TUE, WED, THU] = [plus(1), plus(2), plus(3)]
const TODAY = key(now)
const event = (title, day, from, to, extra = {}) => ({ title, start: on(day, from), end: on(day, to), allDay: false, calendar: 'Work', color: '#2f80ed', ...extra })
const EVENTS = [
  // Next Tuesday: 9 to 12 and 11 to 14:30 overlap, 5h 30m once; a holiday all day counts nothing.
  event('Planning review', TUE, '09:00', '12:00'),
  event('Lab session', TUE, '11:00', '14:30', { color: '#27ae60', calendar: 'College' }),
  { title: 'Founders day', start: on(TUE, '00:00'), end: on(plus(2), '00:00'), allDay: true, calendar: 'Holidays', color: '#eb5757' },
  // Wednesday: 7 hours of meetings, so one hour free.
  event('Workshop', WED, '09:00', '16:00'),
  // Today: two events around the timed tasks, and one all day.
  event('Morning lecture', TODAY, '09:00', '10:00'),
  event('Study group', TODAY, '16:00', '17:00', { color: '#9b51e0', calendar: 'College' }),
  { title: 'Open day', start: on(TODAY, '00:00'), end: on(key(new Date(now.getTime() + 86400000)), '00:00'), allDay: true, calendar: 'Holidays', color: '#eb5757' }
]

let failed = 0
const flat = (one) => one.replace(/\s+/g, '')
const check = (name, ok, detail = '') => {
  if (!ok) failed++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${String(detail).slice(0, 220)})` : ''}`)
}

async function run(calendarEnv, part) {
  process.env.MINDFLOW_QA_CALENDAR = calendarEnv
  const c = await sandbox({ width: 1280, height: 900 })
  const { h, v, go } = c
  const wait = (ms = 400) => h.waitForTimeout(ms)
  const text = (selector) => h.evaluate((s) => [...document.querySelectorAll(s)].map((one) => (one.innerText ?? one.textContent ?? '').replace(/\s+/g, ' ').trim()), selector)
  const shot = async (name) => SHOTS && h.screenshot({ path: `${SHOTS}/${name}.png` })
  await h.keyboard.press('Escape')
  try {
    await part({ c, h, v, go, wait, text, shot })
  } finally {
    console.log('ERRORS', c.errors.filter((one) => !/favicon|ERR_FILE_NOT_FOUND/.test(one)).join(' | ') || 'none')
    await c.close()
  }
}

// --- With a calendar ---
await run(JSON.stringify(EVENTS), async ({ c, h, v, go, wait, text, shot }) => {
  await v('settings:set', { macCalendar: true, workHours: 8 })
  // The test days cleared of the sandbox's own tasks, so the sums are ours.
  for (const task of await v('tasks')) {
    const day = (task.dueAt ?? task.deadline ?? '') && key(new Date(task.dueAt ?? task.deadline))
    if (task.status === 'open' && [TUE, WED, THU].includes(day)) await v('task:save', task.id, { status: 'dropped' })
  }
  const add = async (title, patch) => { const made = await v('task:add', title); const id = made?.id ?? made; await v('task:save', id, patch); return id }
  const ids = {
    report: await add('Write the lab report', { due: on(TUE, '10:00'), estimate: 120, important: 1 }),
    flash: await add('Make flashcards for the biology unit', { due: on(TUE, '13:00'), estimate: 60, priority: 4 }),
    tidy: await add('Tidy the reading notes', { due: on(TUE, '15:00'), estimate: 60 }),
    email: await add('Email the tutor', { due: on(TUE, '16:00') }),
    // Due that day only: never moved for you.
    essay: await add('Hand in the essay', { deadline: on(TUE, '17:00'), estimate: 60 })
  }
  // Today: two to-dos with a time, around the events.
  const noon = await add('Call the library about the loan', { due: on(TODAY, '12:00') })
  const six = await add('Review the flashcards', { due: on(TODAY, '18:00'), estimate: 30 })
  await wait(800)

  // The week view: Tuesday's load under its date. 5h 30m meetings; tasks 2h + 1h + 1h + 1h = 5h; 10h 30m against 8h.
  await go('week')
  await wait(1200)
  const tue = (await text(`[data-day-load="${TUE}"]`))[0] ?? ''
  check('week: Tuesday says its meetings and tasks (overlap once, all-day left out)', flat(tue).includes('5h30minmeetings·5htasks'), tue)
  check('week: and 2h 30m over, in the warning tint', flat(tue).includes('2h30minover') && (await h.locator(`[data-day-load="${TUE}"][data-over]`).count()) === 1, tue)
  // Today's column: events and timed tasks in one line by time.
  const col = await h.evaluate((day) => {
    const section = [...document.querySelectorAll('[data-day]')].find((one) => one.querySelector(`[data-day-load="${day}"]`)) ?? document.querySelector('[data-day="0"]')
    return [...section.querySelectorAll('[data-week-event], [data-row]')].map((one) => one.hasAttribute('data-week-event') ? 'E ' + one.textContent : 'T ' + (one.querySelector('[data-task-title]')?.textContent ?? ''))
  }, TODAY)
  const want = ['Open day', 'Morning lecture', 'Call the library', 'Study group', 'Review the flashcards']
  const seen = want.map((name) => col.findIndex((one) => one.includes(name)))
  check('week: today mixes events and timed tasks by time', seen.every((at) => at >= 0) && seen.every((at, n) => n === 0 || at > seen[n - 1]), seen + ' ' + col.join(' | '))
  await shot('week-light')
  // Today's budget takes the meetings still to come off the time left.
  await go('today'); await wait(1000)
  const budget = (await text('[data-day-budget]'))[0] ?? ''
  const later = now.getHours() < 16
  check('today list: the budget says the meetings still to come', later ? flat(budget).includes('ofmeetings') : !flat(budget).includes('ofmeetings'), `${later ? 'a meeting at 16:00 ahead' : 'none ahead'}: ${budget}`)

  // Today: one line by the hour, with a now line.
  await go('day')
  await wait(1500)
  const line = await h.evaluate(() => [...document.querySelectorAll('[data-day-timeline] li')].map((one) => one.hasAttribute('data-now-line') ? 'NOW' : (one.hasAttribute('data-line-event') ? 'E ' : 'T ') + one.textContent))
  const order = ['Open day', 'Morning lecture', 'Call the library', 'Study group', 'Review the flashcards'].map((name) => line.findIndex((one) => one.includes(name)))
  check('today: events and timed tasks in one line by time', order.every((at) => at >= 0) && order.every((at, n) => n === 0 || at > order[n - 1]), line.join(' | '))
  check('today: a task has its tick, an event none', (await h.locator('[data-day-timeline] [data-line-task] [data-task-tick]').count()) >= 2 && (await h.locator('[data-day-timeline] [data-line-event] [data-task-tick]').count()) === 0)
  const nowAt = line.indexOf('NOW')
  // Everything that has started (all day, or its time gone by) comes before the line; the rest after.
  const minutes = now.getHours() * 60 + now.getMinutes()
  const started = (one) => { const m = /^[ET] (?:(All day)|(\d{1,2}):(\d{2}))/.exec(one); return !!m && (!!m[1] || Number(m[2]) * 60 + Number(m[3]) <= minutes) }
  const before = line.filter((one) => one !== 'NOW' && started(one)).length
  check('today: the now line sits between what has started and what has not', nowAt === before, `${nowAt} vs ${before}: ${line.join(' | ')}`)
  const listed = await text('[data-task-title]')
  check('today: a timed task is not listed twice on the page', listed.filter((one) => one.includes('Call the library')).length === 1, listed.join(' | '))
  // Ticking in the line: done, then undone.
  await h.locator(`[data-line-task="${noon}"] [data-task-tick]`).click()
  await wait(700)
  check('today: ticking in the line marks the task done', (await v('tasks')).find((one) => one.id === noon)?.status === 'done')
  await h.locator(`[data-line-task="${noon}"] [data-task-tick]`).click()
  await wait(700)
  check('today: and unticked, open again', (await v('tasks')).find((one) => one.id === noon)?.status === 'open')
  await h.evaluate(() => document.querySelector('[data-day-timeline]')?.scrollIntoView({ block: 'center' }))
  await wait(300)
  await shot('today-light')

  // Close the week: does next week fit?
  await h.evaluate(() => window.dispatchEvent(new CustomEvent('vigil:close-week')))
  await wait(900)
  const row = (await text(`[data-fit-day="${TUE}"]`))[0] ?? ''
  check('close: Tuesday over-full, 2h 30m over', (await h.locator(`[data-fit-day="${TUE}"][data-over]`).count()) === 1 && flat(row).includes('2h30minover'), row)
  check('close: the task without a length said, not guessed', flat(row).includes('1taskwithoutalength'), row)
  const wed = (await text(`[data-fit-day="${WED}"]`))[0] ?? ''
  check('close: Wednesday fits (7h meetings, 1h free)', flat(wed).includes('7hmeetings') && flat(wed).includes('1hfree') && (await h.locator(`[data-fit-day="${WED}"][data-over]`).count()) === 0, wed)
  const moves = (await text(`[data-fit-day="${TUE}"] [data-fit-moves]`))[0] ?? ''
  // Least pressing first: Tidy (no priority), Flashcards (low), then the important report; Wednesday has 1h, so Tidy goes there, the rest to Thursday.
  const wedName = new Date(`${WED}T12:00`).toLocaleDateString('en', { weekday: 'long' })
  const thuName = new Date(`${THU}T12:00`).toLocaleDateString('en', { weekday: 'long' })
  check('close: shows which before moving', moves.includes(`“Tidy the reading notes” (1 h) to ${wedName}`) && moves.includes(`“Make flashcards for the biology unit” (1 h) to ${thuName}`) && moves.includes('Write the lab report') && !moves.includes('Hand in the essay'), moves)
  const button = h.locator(`[data-fit-move="${TUE}"]`)
  check('close: the button says how many', (await button.textContent())?.trim() === 'Move 3 tasks on', await button.textContent())
  await h.evaluate(() => document.querySelector('[data-week-fit]')?.scrollIntoView({ block: 'start' }))
  await wait(300)
  await shot('close-week-light')
  const was = Object.fromEntries((await v('tasks')).filter((one) => Object.values(ids).includes(one.id)).map((one) => [one.id, one.dueAt]))
  await button.click()
  await wait(1200)
  const after = Object.fromEntries((await v('tasks')).map((one) => [one.id, one]))
  const dayOf = (id) => after[id].dueAt && key(new Date(after[id].dueAt))
  check('close: Tidy moved to Wednesday, at its own time', dayOf(ids.tidy) === WED && new Date(after[ids.tidy].dueAt).getHours() === 15, after[ids.tidy].dueAt)
  check('close: Flashcards and the report to Thursday', dayOf(ids.flash) === THU && dayOf(ids.report) === THU, `${dayOf(ids.flash)} ${dayOf(ids.report)}`)
  check('close: the rest stay', dayOf(ids.email) === TUE && key(new Date(after[ids.essay].deadline)) === TUE)
  const rowAfter = (await text(`[data-fit-day="${TUE}"]`))[0] ?? ''
  check('close: Tuesday now fits', (await h.locator(`[data-fit-day="${TUE}"][data-over]`).count()) === 0, rowAfter)
  await shot('close-week-moved-light')
  // One Undo puts every task back.
  await h.getByRole('button', { name: /^Undo/ }).first().click()
  await wait(1200)
  const back = Object.fromEntries((await v('tasks')).map((one) => [one.id, one.dueAt]))
  check('close: one Undo puts all three back', Object.entries(was).every(([id, due]) => back[id] === due), JSON.stringify(back).slice(0, 200))
  check('close: Tuesday over-full again', (await h.locator(`[data-fit-day="${TUE}"][data-over]`).count()) === 1)

  // The working day setting: 12 hours and Tuesday fits.
  await v('settings:set', { workHours: 12 })
  await wait(900)
  check('close: a 12 hour working day and Tuesday fits', (await h.locator(`[data-fit-day="${TUE}"][data-over]`).count()) === 0, (await text(`[data-fit-day="${TUE}"]`))[0])
  await v('settings:set', { workHours: 8 })
  await wait(600)
  await h.keyboard.press('Escape')
  await wait(400)

  // Dark.
  await c.theme('dark')
  await go('week'); await wait(1200); await shot('week-dark')
  await go('day'); await wait(1500)
  await h.evaluate(() => document.querySelector('[data-day-timeline]')?.scrollIntoView({ block: 'center' }))
  await wait(300); await shot('today-dark')
  await h.evaluate(() => window.dispatchEvent(new CustomEvent('vigil:close-week')))
  await wait(900)
  await h.evaluate(() => document.querySelector('[data-week-fit]')?.scrollIntoView({ block: 'start' }))
  await wait(300); await shot('close-week-dark')
  await h.keyboard.press('Escape')
  // Settings: the working day, with its sample.
  await go('settings'); await wait(900)
  await h.getByText('What comes back to you', { exact: true }).first().click().catch(() => {}); await wait(900)
  await h.evaluate(() => document.querySelector('[data-setting-title="A working day"]')?.scrollIntoView({ block: 'center' }))
  await wait(500)
  check('settings: the working day row with its sample', (await h.locator('[data-setting-title="A working day"] [data-workday-sample]').count()) === 1)
  await shot('settings-dark')
  await c.theme('paper')
  await go('settings'); await wait(900)
  await h.getByText('What comes back to you', { exact: true }).first().click().catch(() => {}); await wait(900)
  await h.evaluate(() => document.querySelector('[data-setting-title="A working day"]')?.scrollIntoView({ block: 'center' }))
  await wait(500); await shot('settings-light')
})

// --- Calendar refused, then off ---
await run('denied', async ({ h, v, go, wait, shot }) => {
  await v('settings:set', { macCalendar: true })
  await go('day'); await wait(1500)
  check('denied: Today says so, with the way to allow it', (await h.locator('[data-calendar-note="denied"]').count()) === 1 && (await h.getByRole('button', { name: 'Open Privacy settings' }).count()) >= 1)
  await h.evaluate(() => document.querySelector('[data-calendar-note]')?.scrollIntoView({ block: 'center' }))
  await wait(300); await shot('today-denied-light')
  await go('week'); await wait(1200)
  check('denied: the week says so', (await h.locator('[data-calendar-note="denied"]').count()) === 1)
  check('denied: the week still counts tasks', (await h.locator('[data-day-load]').count()) >= 1)
  await shot('week-denied-light')
  await h.evaluate(() => window.dispatchEvent(new CustomEvent('vigil:close-week')))
  await wait(900)
  check('denied: Close the week says only tasks count', (await h.locator('[data-week-fit] [data-calendar-note="denied"]').count()) === 1 && (await h.locator('[data-fit-day]').count()) === 7)
  await h.keyboard.press('Escape'); await wait(300)
  await v('settings:set', { macCalendar: false })
  await wait(500)
  await h.evaluate(() => window.dispatchEvent(new CustomEvent('vigil:close-week')))
  await wait(900)
  check('off: Close the week offers to use the calendar', (await h.locator('[data-week-fit] [data-calendar-note="off"]').count()) === 1 && (await h.getByRole('button', { name: 'Use my calendar' }).count()) === 1)
  await h.evaluate(() => document.querySelector('[data-week-fit]')?.scrollIntoView({ block: 'start' }))
  await wait(300); await shot('close-week-off-light')
  await h.keyboard.press('Escape')
  await go('day'); await wait(1000)
  check('off: Today says nothing about the calendar', (await h.locator('[data-calendar-note]').count()) === 0)
})

console.log(failed ? `${failed} FAILED` : 'ALL PASS')
process.exit(failed ? 1 : 0)
