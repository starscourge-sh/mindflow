// What Vigil can do, Planning and Seeing your year: each card's Try it done
// in the sandbox, and what the card promises read back from the page and the
// app's own API. Then each card's Show me, checked to land and point. Where a
// claim waits on something a run cannot reach (a Sunday evening, macOS's
// calendar permission, the menu bar), the nearest real thing is checked and
// said as CHECKED-PARTLY.
//
//   npx electron-vite build --outDir out-pw-c
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-pw-c/main/index.js MINDFLOW_QA_AWAY=1 node qa/powers-claims-c.mjs
import { mkdirSync } from 'fs'
import { sandbox } from './sandbox-lib.mjs'

// A stand-in for the Mac's calendar (main/mac-calendar.ts reads it in a QA run): one event today at 3pm.
{ const at = new Date(); at.setHours(15, 0, 0, 0); process.env.MINDFLOW_QA_CALENDAR ??= JSON.stringify([{ title: 'Dentist', start: at.toISOString(), end: new Date(at.getTime() + 3600000).toISOString(), allDay: false, calendar: 'Home', color: '#3b82f6' }]) }
const SHOTS = process.env.SHOTS
if (SHOTS) mkdirSync(SHOTS, { recursive: true })
const c = await sandbox({ width: 1180, height: 860 })
const { h, page, v, electron } = c
const verdicts = {}
const check = (id, name, ok, detail = '', partly = false) => {
  const said = ok ? (partly ? 'CHECKED-PARTLY' : 'PASS') : 'FAIL'
  if (!ok) verdicts[id] = 'FAIL'
  else if (partly && verdicts[id] !== 'FAIL') verdicts[id] = 'CHECKED-PARTLY'
  else verdicts[id] ??= 'PASS'
  console.log(`${said.padEnd(14)} ${id}: ${name}${detail ? `  (${String(detail).slice(0, 160)})` : ''}`)
}
const wait = (ms = 400) => h.waitForTimeout(ms)
const day = (n) => { const at = new Date(); at.setDate(at.getDate() + n); return `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, '0')}-${String(at.getDate()).padStart(2, '0')}` }
const text = (selector, target = h) => target.evaluate((s) => [...document.querySelectorAll(s)].map((one) => one.textContent?.trim() ?? ''), selector)
const shot = async (name, target = h) => SHOTS && target.screenshot({ path: `${SHOTS}/${name}.png` })
const EDITOR = '.tiptap.ProseMirror.mindflow-editor:not(.is-line)'
/** Quick capture: opened, emptied, the words typed, then ⌥⌘↵ (saves, and a fresh box for the next). */
const box = async (words, send = true) => {
  await page.evaluate(() => window.api.showPrompt())
  await page.waitForTimeout(300)
  await c.qa.reset()
  await page.keyboard.type(words, { delay: 15 })
  await page.waitForTimeout(500)
  if (send) { await page.keyboard.press('Alt+Meta+Enter'); await page.waitForTimeout(1300) }
}
/** ⌘K in the main window, a command picked by its words. */
const command = async (words) => {
  await h.keyboard.press('Meta+k')
  await h.waitForSelector('[role="dialog"][aria-label="Search"] input', { timeout: 5000 })
  await h.keyboard.type(words, { delay: 25 })
  await h.waitForFunction((w) => (document.querySelector('[role="dialog"][aria-label="Search"] [data-search-at]')?.textContent ?? '').toLowerCase().includes(w.toLowerCase()), words, { timeout: 8000 }).catch(() => {})
  await h.keyboard.press('Enter')
  await wait(1200)
}
/** A task in plain words, as Today's add line and quick capture make one (the same parser, main/task-words.ts). */
const addToday = async (words) => {
  const made = await v('task:add', words, undefined, true)
  await wait(300)
  return v('task', made.id)
}
/** G and a letter, from wherever the window is: nothing typed into first. */
const gKey = async (letter) => {
  await h.keyboard.press('Escape')
  await h.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur())
  await h.keyboard.press('g'); await h.keyboard.press(letter); await wait(1100)
}
const settingsSection = async (section) => {
  await h.evaluate((s) => localStorage.setItem('settings:section', s), section)
  await c.go('settings')
  await wait(900)
}
const settingRow = (title) => h.locator('[data-setting]', { has: h.locator(`text="${title}"`) }).first()
const pill = async () => { for (let i = 0; i < 50; i++) { const found = electron.windows().find((one) => one.url().includes('view=focus')); if (found) return found; await wait(200) } return null }

await v('settings:set', { safeMode: false, hintRate: 0, rotCount: 0, motion: false, dayEnd: '23:59' })

try {
  // --- decision: a Look again date, and on that day it asks if it still holds
  {
    await c.go('kind:decision')
    const rows = await h.locator('[data-row]').count()
    check('decision', 'Decisions list their notes', rows > 0, `${rows} rows`)
    const decisions = (await h.evaluate(() => window.api.captures.list())).filter((one) => one.kind === 'decision' && one.status !== 'discarded')
    const one = decisions[0]
    await c.send('capture', one.id)
    await wait(1200)
    // Its fields are under Details, at the top right.
    if ((await h.getByRole('button', { name: 'Details', pressed: false }).count())) await h.getByRole('button', { name: 'Details' }).first().click()
    await wait(800)
    await shot('decision-open')
    check('decision', 'an open decision has a Look again field', (await h.locator('text=Look again').count()) > 0)
    await v('notes:fields:set', 'captures', one.id, 'state', 'Decided')
    await v('notes:fields:set', 'captures', one.id, 'revisit', new Date().toISOString())
    const back = await v('returning')
    check('decision', 'on its day it comes back', back.some((row) => row.id === one.id), back.map((row) => row.title).join(' | '))
    await c.go('home')
    await wait(1500)
    check('decision', 'Home asks: Still holds or Reopen', (await h.getByRole('button', { name: 'Still holds' }).count()) > 0 && (await h.locator('text=Look again today').count()) > 0)
    await shot('decision-home')
  }

  // --- experiment: a date, then Vigil asks how it went
  {
    await c.go('kind:experiment')
    check('experiment', 'Experiments list their notes', (await h.locator('[data-row]').count()) > 0)
    const one = (await h.evaluate(() => window.api.captures.list())).find((row) => row.kind === 'experiment' && row.status !== 'discarded')
    await c.send('capture', one.id)
    await wait(1200)
    if ((await h.getByRole('button', { name: 'Details', pressed: false }).count())) await h.getByRole('button', { name: 'Details' }).first().click()
    await wait(800)
    const fields = await v('notes:fields', 'captures', one.id)
    await shot('experiment-open')
    check('experiment', 'opened, it shows its date and how it went', (await h.locator('text=/Run until|Until/').count()) > 0, JSON.stringify(fields))
    await v('notes:fields:set', 'captures', one.id, 'status', 'Running')
    await v('notes:fields:set', 'captures', one.id, 'until', new Date(Date.now() - 86400000).toISOString())
    check('experiment', 'past its date it comes back', (await v('returning')).some((row) => row.id === one.id))
    await c.go('home')
    await wait(1500)
    check('experiment', 'Home asks What did you find?', (await h.locator('textarea[placeholder="What did you find?"]').count()) > 0)
  }

  // --- goals: a day, a line that fills, steps logged from quick capture with + and its name
  {
    await gKey('e')
    check('goals', 'G E opens Goals', (await text('header h1'))[0]?.includes('Goals'), (await text('header h1'))[0])
    const goals = (await v('items', 'goal')).filter((one) => !one.closedAt)
    const goal = goals[0]
    check('goals', 'a goal has a day', !!goal?.goalAt, goal?.title)
    await shot('goals')
    await c.go('home')
    await wait(1200)
    check('goals', 'and a line that fills as the day comes closer (Home’s goal strip)', (await h.locator('[role="progressbar"][aria-label$="of the way"]').count()) > 0)
    await c.send('goal', goal.id)
    await wait(1200)
    check('goals', 'opened, its road and its logs', (await h.locator('text=The road').count()) > 0)
    await box(`+${goal.title.slice(0, 8)}`, false)
    // The + picks the goal from a list: the first match, with Tab or Enter.
    await page.keyboard.press('Enter')
    await page.waitForTimeout(400)
    await page.keyboard.type('read 40 pages', { delay: 15 })
    await page.waitForTimeout(400)
    const said = await page.evaluate((s) => document.querySelector(s)?.textContent ?? '', EDITOR)
    await page.keyboard.press('Alt+Meta+Enter')
    await page.waitForTimeout(1500)
    const after = (await v('items', 'goal')).find((one) => one.id === goal.id)
    check('goals', '+ and its name in quick capture logs a step', after.clues === goal.clues + 1, `${goal.clues} -> ${after.clues}, box said "${said}"`)
  }

  // --- matrix: four boxes, drag or 1 to 4
  {
    await gKey('q')
    check('matrix', 'G Q opens the four boxes', (await h.locator('[data-quadrant]').count()) === 4)
    const before = await v('tasks')
    await h.keyboard.press('j'); await wait(200)
    await h.keyboard.press('2'); await wait(600)
    // Out of an urgent box it asks how far to push the date: Enter takes a week.
    await h.keyboard.press('Enter'); await wait(900)
    const after = await v('tasks')
    const moved = after.filter((one) => { const was = before.find((b) => b.id === one.id); return was && (was.important !== one.important || was.dueAt !== one.dueAt) })
    check('matrix', 'a key from 1 to 4 sends the chosen task to that box', moved.length === 1, moved.map((one) => one.title).join(', '))
  }

  // --- routines: "every Monday" and it comes back
  {
    const task = await addToday('water the ferns every Monday')
    check('routines', 'a task ending with every Monday repeats', !!task?.recurrence, `${task?.title} / ${task?.recurrence}`)
    await h.keyboard.press('Escape')
    await gKey('o')
    const rows = await text('[data-row]')
    check('routines', 'G O lists it among Routines', rows.some((one) => one.includes('water the ferns')), rows.join(' | ').slice(0, 150))
    await v('task:save', task.id, { status: 'done' }).catch(() => {})
  }

  // --- lengths: ~30m, and Today's planned against left
  {
    const task = await addToday('draft the Hamlet essay ~30m')
    await c.go('today')
    await wait(900)
    check('lengths', '~30m gives the task 30 minutes, the name kept clean', task?.estimate === 30 && !task.title.includes('~'), `${task?.title} / ${task?.estimate}`)
    const said = await h.$eval('[data-day-budget]', (one) => one.dataset.said ?? '').catch(() => '')
    check('lengths', "Today sets hours planned beside the hours left", /planned, .* left today/.test(said), said)
  }

  // --- focus: open a task, Start a focus session, a small timer floats
  {
    const task = (await v('tasks')).find((one) => one.title === 'draft the Hamlet essay')
    await c.send('task', task.id)
    await wait(1200)
    await h.getByText('Start a focus session', { exact: true }).first().click()
    await wait(600)
    // It asks how long, with a length picked: Start.
    await h.locator('form button[type="submit"]', { hasText: 'Start' }).first().click()
    await wait(1200)
    const now = await v('focus:now')
    check('focus', 'a session starts on the task', now?.taskId === task.id, JSON.stringify(now)?.slice(0, 120))
    const p = await pill()
    check('focus', 'and the session bubble floats', !!p && (await p.locator('[data-island]').count()) > 0)
    // --- pickup: as it ends, where you pick up; shown at the top next time
    if (p) {
      await p.waitForTimeout(1200)
      // Pointed at, the bubble opens to show Stop; the bubble breathes, so a pointer or click that lands mid-animation is tried again.
      const stop = p.getByRole('button', { name: /Stop/ })
      for (let tries = 0; tries < 6 && (await v('focus:now')); tries++) {
        await p.mouse.move(2, 300); await p.waitForTimeout(300)
        await p.hover('[data-island]', { force: true }); await p.waitForTimeout(900)
        if (await stop.isVisible().catch(() => false)) await stop.click({ timeout: 3000, force: true }).catch(() => {})
        await p.waitForTimeout(900)
      }
      // Stopped before its time, it asks whether to count it: "End it now".
      await p.locator('[data-end-early]').click({ timeout: 3000 }).catch(() => {})
      await p.waitForTimeout(600)
      // How did it go comes first: Escape passes it by.
      await p.keyboard.press('Escape')
      await p.locator('[data-pickup]').waitFor({ timeout: 4000 }).catch(() => {})
      check('pickup', 'as a session ends, the bubble asks Where do you pick up next time?', (await p.locator('[data-pickup]').count()) === 1)
      await p.keyboard.type('the ghost scene', { delay: 10 })
      await p.keyboard.press('Enter')
      await p.waitForTimeout(800)
      check('pickup', 'kept on the task', (await v('task', task.id)).pickup === 'the ghost scene')
      await c.send('task', task.id)
      await wait(1200)
      check('pickup', 'and shown at the top when the task next opens', (await text('[data-pickup-note]')).some((one) => one.includes('the ghost scene')))
    } else check('pickup', 'no bubble to end', false)
  }

  // --- countin: Settings, Count in a session; then 5, 4, 3, 2, 1
  {
    // On for a new book now: turned off first, so the switch is seen to turn it on.
    await v('settings:set', { countIn: false })
    await settingsSection('Appearance')
    const row = settingRow('Count in a session')
    check('countin', 'Settings, Appearance has Count in a session', (await row.count()) === 1)
    await row.getByRole('switch').click()
    await wait(500)
    check('countin', 'turned on, it is kept', (await v('settings')).countIn === true)
    const task = (await v('tasks')).find((one) => one.status === 'open')
    await v('session:start', task.id, task.title, 25 * 60000)
    await h.evaluate(() => window.api.showFocus(true))
    const p = await pill()
    await p.waitForTimeout(1200)
    const shown = await p.locator('[data-count-in]').textContent().catch(() => '')
    check('countin', 'a session counts in before its clock starts', (await p.locator('[data-count-in]').count()) === 1, shown)
    await p.waitForTimeout(5500)
    check('countin', 'then the clock starts', (await p.locator('[data-count-in]').count()) === 0)
    await v('settings:set', { countIn: false })
    const now = await v('focus:now')
    if (now) await v('session:cancel', now.id)
  }

  // --- frog: right-click, Eat the frog; leads Today and the day brief
  {
    const task = await addToday('return the library books')
    await h.keyboard.press('Escape')
    await c.go('today')
    await wait(900)
    for (let i = 0; i < 20 && !(await h.locator(`[data-row][data-id="${task.id}"]`).count()); i++) (await h.mouse.move(800, 600), await h.mouse.wheel(0, 600), await wait(200))
    await h.locator(`[data-row][data-id="${task.id}"]`).click({ button: 'right' })
    await wait(400)
    // The power is called Eat the frog; its menu line says what it does.
    const item = h.getByRole('menuitem', { name: /Do this first today|Eat the frog/ })
    check('frog', 'the right-click menu has “Do this first today”', (await item.count()) === 1, (await item.textContent().catch(() => '')))
    await item.click()
    await wait(800)
    const frog = (await v('settings')).frog
    check('frog', 'it is the frog for today', frog?.id === task.id && frog?.day === day(0))
    for (let i = 0; i < 20; i++) (await h.mouse.wheel(0, -2000), await wait(40))
    await wait(300)
    const order = await h.$$eval('[data-row][data-id]', (all) => all.map((one) => one.getAttribute('data-id')))
    check('frog', 'and leads Today', order[0] === task.id)
    await c.go('day')
    await wait(1500)
    // The brief's tasks (each with its tick), not the day's time log above them.
    const brief = await text('li:has([data-task-tick])')
    check('frog', 'and the day brief', (brief.find((one) => one.includes('return the library books')) ?? '').length > 0 && brief.findIndex((one) => one.includes('return the library books')) <= brief.findIndex((one) => /\S/.test(one) && !one.includes('return the library books')) + 1, brief.slice(0, 3).join(' | '))
    await v('settings:set', { frog: null })
  }

  // --- 135: In Today, press F and pick 1-3-5 under grouping
  {
    await c.go('today')
    await wait(800)
    await h.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur())
    await h.keyboard.press('f')
    await wait(600)
    // Grouping is a pick-one under Display: open it, then 1-3-5.
    await h.locator('button', { hasText: /^By date$/ }).last().click()
    await wait(400)
    const opt = h.getByText('1-3-5', { exact: true })
    check('135', 'F opens Display, with 1-3-5 under Grouping', (await opt.count()) > 0)
    await opt.first().click()
    await wait(900)
    await h.keyboard.press('Escape')
    await wait(400)
    const heads = await text('h2, h3')
    check('135', 'Today is laid out as one big, three medium, five small', heads.some((one) => one.startsWith('One big thing')) && heads.some((one) => one.startsWith('Three medium')), heads.join(' | ').slice(0, 120))
    await shot('today-135')
    // Back to by date.
    await v('settings:set', {}).catch(() => {})
    await h.keyboard.press('f'); await wait(500); await h.locator('button', { hasText: /^1-3-5$/ }).last().click(); await wait(300); await h.getByText('By date', { exact: true }).last().click(); await wait(300); await h.keyboard.press('Escape')
  }

  // --- closeday: ⌘K, Close the day; the pass in four parts
  {
    await c.go('home')
    await command('Close the day')
    check('closeday', '⌘K, Close the day opens the pass', (await h.locator('[data-close-day]').count()) === 1)
    check('closeday', 'what got done, each open task Tomorrow, Next week or To the Bin, a line, tomorrow’s first task',
      (await h.locator('[data-close-day] [data-close-done], [data-close-day] [data-close-open], [data-close-day] [data-close-line], [data-close-day] [data-close-frog]').count()) === 4 &&
      (await h.locator('[data-close-task] button', { hasText: 'Next week' }).count()) > 0 && (await h.locator('[data-close-task] button', { hasText: 'To the Bin' }).count()) > 0)
    await shot('close-day')
    await h.keyboard.press('Escape')
    await wait(300)
    await settingsSection('What comes back to you')
    const row = settingRow('Close the day')
    check('closeday', 'Settings picks when it is offered each evening', (await row.count()) === 1 && (await row.locator('input[type="time"], button').count()) > 0)
  }

  // --- later: "someday" waits in Later
  {
    const task = await addToday('learn to sail someday')
    await addToday('renew the passport this year')
    await addToday('book the dentist this month')
    await h.keyboard.press('Escape')
    await gKey('z')
    const heads = await text('h2, h3')
    check('later', 'G Z: This month, This year and Someday', ['This month', 'This year', 'Someday'].every((one) => heads.some((head) => head.startsWith(one))), heads.join(' | '))
    const rows = await h.$$eval('[data-row][data-id], h2, h3', (all) => all.map((one) => /^H[23]$/.test(one.tagName) ? `#${one.textContent}` : one.getAttribute('data-id')))
    const under = rows.slice(0, rows.indexOf(task.id)).reverse().find((one) => one?.startsWith('#'))
    check('later', 'a task ending with someday waits under Someday', under?.startsWith('#Someday'), `${task?.title} under ${under}`)
  }

  // --- pages: Day, Week, Month and Year at the top of a page
  {
    await gKey('p')
    const titles = []
    for (const scale of ['Week', 'Month', 'Year', 'Day']) {
      await h.locator(`[aria-label="${scale}"]`).first().click()
      await wait(1000)
      titles.push(`${scale}:${await h.evaluate(() => new URL(location.href).searchParams.get('view') ?? '')}:${(await h.locator('[data-week-page], [data-month-page], [data-year-page], [data-day-page]').count())}`)
    }
    const tops = await text('header h1')
    check('pages', 'G P opens today’s page, with Day, Week, Month and Year to switch', (await h.locator('[aria-label="Week"]').count()) > 0 && (await h.locator('[aria-label="Year"]').count()) > 0, tops[0])
  }

  // --- year: each month's season, the year as its story
  {
    await c.go('monthpage')
    await wait(1200)
    await h.getByLabel('Season of life').fill('The month of the Hamlet essay')
    await h.getByLabel('Season of life').blur()
    await wait(800)
    await c.go('yearpage')
    await wait(1200)
    const months = await v('periods:year', String(new Date().getFullYear()))
    const named = months.filter((one) => one.season?.trim())
    await shot('year')
    const page1 = await h.evaluate(() => document.querySelector('.\\@container\\/page')?.textContent ?? '')
    check('year', 'named seasons show on the year', named.length > 0 && named.every((one) => page1.includes(one.season.trim().slice(0, 20))), named.map((one) => one.season).join(' | '))
  }

  // --- milestones: right-click a day, or !milestone in quick capture; countdown on Home
  {
    await box('!milestone Exam on 3 Dec')
    const exam = (await v('milestones', null, null)).find((one) => one.title === 'Exam')
    check('milestones', '!milestone Exam on 3 Dec in quick capture marks 3 December', !!exam && exam.day.endsWith('-12-03'), exam?.day)
    await c.go('yearpage')
    await wait(1200)
    check('milestones', 'marked days stand tall on the year', (await h.locator('[data-year-marks]').count()) === 1 && (await h.locator('[data-year-marks]').textContent()).includes('Exam'))
    await c.go('monthpage')
    await wait(1000)
    await h.locator(`[data-grid-day="${day(0)}"]`).click({ button: 'right' })
    await wait(400)
    check('milestones', 'a right-click on a day offers to mark it', (await h.getByRole('menuitem', { name: /Mark (this day|it again)/ }).count()) === 1)
    await h.keyboard.press('Escape')
    await c.go('home')
    await wait(900)
    check('milestones', 'Home counts down to the next one', (await text('[data-next-mark]')).some((one) => /\d+ days? to|tomorrow|today/i.test(one)), (await text('[data-next-mark]'))[0])
    const menu = await electron.evaluate(() => typeof globalThis !== 'undefined')
    check('milestones', 'the menu bar counts down too (setting Marked days is there)', menu && (await (async () => { await settingsSection('What comes back to you'); return settingRow('Marked days').count() })()) === 1, '', true)
  }

  // --- calendar: the Month page shows page, reviews, marked days and exams, cards still to come
  {
    await gKey('m')
    const legend = (await text('[data-month-legend]'))[0] ?? ''
    check('calendar', 'G M: the Month page with its key', /A page written.*Reviews done.*A marked day.*An exam.*Cards due/.test(legend), legend)
    check('calendar', 'days gone show reviews; days ahead the cards due', (await h.locator('[data-grid-day][data-reviews]').count()) > 0 && (await h.locator('[data-grid-day] [data-due-count]').count()) > 0)
    check('calendar', 'and pages written', (await h.locator('[data-grid-day] [data-page-dot]').count()) > 0)
    await h.locator(`[data-grid-day="${day(0)}"]`).click()
    await wait(1000)
    check('calendar', 'a click on a day opens its page', !(await h.locator('[data-month-legend]').count()))
  }

  // --- maccalendar: Settings, Your Mac's calendar; events on Today's brief and the week
  {
    await settingsSection('What comes back to you')
    const row = settingRow('Your Mac’s calendar').or(settingRow("Your Mac's calendar"))
    check('maccalendar', 'Settings has Your Mac’s calendar', (await row.count()) >= 1)
    await v('settings:set', { macCalendar: true })
    await c.go('day')
    await wait(1800)
    const brief = await h.evaluate(() => document.body.textContent ?? '')
    check('maccalendar', 'its events in Today’s brief (a stand-in calendar; macOS asks for the real one)', brief.includes('Dentist'), '', true)
    await c.go('week')
    await wait(1500)
    check('maccalendar', 'and the week', (await h.evaluate(() => document.body.textContent ?? '')).includes('Dentist'), '', true)
    await v('settings:set', { macCalendar: false })
  }

  // --- digest: on Sundays, Home sums up the week
  {
    const week = await v('digest:week')
    check('digest', 'the week counted: caught, kept, reviewed, finished', ['caught', 'kept', 'reviewed', 'finished'].every((key) => typeof week[key] === 'number'), JSON.stringify(week))
    await h.evaluate(() => localStorage.removeItem('weekly-digest:away'))
    await c.go('home')
    await wait(1200)
    const sunday = new Date().getDay() === 0
    const shown = (await h.locator('[data-weekly-digest]').count()) === 1
    check('digest', sunday ? 'today is a Sunday: Home shows it' : 'not a Sunday: Home does not show it', sunday ? shown : !shown, '', !sunday)
    await settingsSection('What comes back to you')
    check('digest', 'Settings can turn it off', (await settingRow('Weekly digest').count()) === 1)
  }

  // --- book: #book gives status, stars and a takeaway
  {
    await box('Frankenstein, Mary Shelley #book')
    const one = (await h.evaluate(() => window.api.captures.list())).find((row) => (row.label ?? '').startsWith('Frankenstein, Mary Shelley'))
    await c.send('capture', one.id)
    await wait(1400)
    if ((await h.getByRole('button', { name: 'Details', pressed: false }).count())) await h.getByRole('button', { name: 'Details' }).first().click()
    await wait(800)
    await shot('book')
    const body = await h.evaluate(() => document.querySelector('.\\@container\\/page')?.textContent ?? '')
    check('book', 'a note tagged #book has a reading status, a rating and a takeaway', /Status/.test(body) && /Rating/.test(body) && /Takeaway/i.test(body), body.match(/(Status|Rating|Takeaway)[^A-Z]{0,30}/g)?.join(' | '))
    await v('notes:fields:set', 'captures', one.id, 'rating', 4)
    check('book', 'and its stars are kept', Number((await v('notes:fields', 'captures', one.id)).rating) === 4)
  }

  // --- wrapped: ⌘K, Your month, wrapped
  {
    await c.go('home')
    await command('Your month, wrapped')
    await wait(2500)
    const said = await h.evaluate(() => document.querySelector('.\\@container\\/page')?.textContent ?? '')
    check('wrapped', '⌘K plays Your month, wrapped, over Stats', (await h.evaluate(() => new URL(location.href).searchParams.get('view'))) !== null && /caught|captured|capture/i.test(said), said.slice(0, 120))
    // The story's slides, from what they are made of: caught, the busiest day, the books finished.
    const recap = await v('recap', 'year')
    check('wrapped', 'it plays what you caught, your busiest day and the books you finished', recap.captures > 0 && !!recap.busiestDay && (recap.books ?? []).some((book) => book.finished), JSON.stringify({ captured: recap.captures, busiest: recap.busiestDay, books: (recap.books ?? []).filter((book) => book.finished).map((book) => book.title) }))
  }

  // --- map: Open the map and click a dot
  {
    await h.keyboard.press('Escape')
    await gKey('x')
    const graph = await v('notes:graph:all')
    check('map', 'G X: every linked note as dots and lines', graph.nodes.length > 0 && graph.edges.length > 0 && (await h.locator('canvas').count()) > 0, `${graph.nodes.length} dots, ${graph.edges.length} lines`)
    const spots = []
    for (let tries = 0; tries < 4 && !spots.length; tries++) {
      if (tries) await wait(1500)
      spots.push(...await h.evaluate(() => {
      const canvas = document.querySelector('canvas')
      if (!canvas) return []
      const { width, height } = canvas
      const data = canvas.getContext('2d').getImageData(0, 0, width, height).data
      const dpr = devicePixelRatio, rect = canvas.getBoundingClientRect(), found = []
      for (let y = 4; y < height - 4; y += 6) for (let x = 4; x < width - 4; x += 6) if (data[(y * width + x) * 4 + 3] > 250) found.push([rect.left + x / dpr, rect.top + y / dpr])
      return found.filter((_, i) => i % Math.max(1, Math.floor(found.length / 40)) === 0)
    }))
    }
    let hit = null
    for (const [x, y] of spots) {
      await h.mouse.move(x, y)
      await h.waitForTimeout(90)
      if (await h.evaluate(() => { const tip = document.querySelector('[data-map-tip]'); return !!tip?.textContent?.trim() && getComputedStyle(tip).visibility !== 'hidden' })) { hit = [x, y]; break }
    }
    // The dots still drift as the map settles: hovered again and clicked where the tip says a dot is.
    // Opened, the note's editor shows (with a small map of its own under it, so a canvas alone says nothing).
    const opened = async () => (await h.locator('.\\@container\\/page .tiptap.ProseMirror').count()) > 0
    for (let tries = 0; hit && tries < 3 && !(await opened()); tries++) {
      await h.mouse.move(hit[0] + 1, hit[1]); await wait(150)
      await h.mouse.click(hit[0], hit[1]); await wait(1300)
    }
    check('map', 'a click on a dot opens its note', !!hit && (await opened()), hit ? 'clicked a dot' : `no dot found in ${spots.length} spots`)
  }

  // --- Show me, for each card: it lands on its page and points at something
  const SHOW = ['decision', 'experiment', 'goals', 'matrix', 'routines', 'focus', 'lengths', 'closeday', 'frog', '135', 'pickup', 'countin', 'later', 'pages', 'year', 'milestones', 'calendar', 'maccalendar', 'digest', 'book', 'wrapped', 'map']
  const NO_POINT = new Set(['year', 'wrapped', 'map'])
  await v('settings:set', { dayEnd: '23:59' })
  for (const id of SHOW) {
    await h.keyboard.press('Escape')
    await c.go('powers')
    await wait(300)
    const card = h.locator(`[data-power="${id}"]`)
    await card.scrollIntoViewIfNeeded()
    await h.evaluate(() => { window.__toasts = []; if (!window.__toastsOn) { window.__toastsOn = true; window.addEventListener('vigil:toast', (event) => window.__toasts.push(event.detail.text)) } })
    await card.getByRole('button', { name: /Show me/ }).click()
    await wait(NO_POINT.has(id) ? 1500 : 3200)
    const pointed = await h.evaluate(() => { const el = document.querySelector('[data-pointed]'); return el ? (el.getAttribute('aria-label') ?? el.textContent ?? '').slice(0, 70) : null })
    const spot = await h.locator('[role="dialog"][aria-label="Where things are"]').count()
    const toast = (await h.evaluate(() => window.__toasts)).join(' | ')
    const view = (await h.evaluate(() => (document.querySelector('.\\@container\\/page h1')?.textContent ?? (document.querySelector('canvas') ? 'map' : '')))).slice(0, 30)
    if (NO_POINT.has(id)) check(id, 'Show me opens its page and says what to do', !!toast, `${view}: ${toast.slice(0, 80)}`)
    else check(id, 'Show me lands and points', spot === 1 && !!pointed, `${pointed ?? 'nothing pointed'}${toast ? ` / toast: ${toast.slice(0, 60)}` : ''}`)
    await shot(`show-${id}`)
    await h.evaluate(() => document.querySelectorAll('[data-pointed]').forEach((one) => one.removeAttribute('data-pointed')))
    await h.keyboard.press('Escape')
    await wait(300)
  }
  console.log('\nerrors:', c.errors.filter((one) => !/ERR_FILE_NOT_FOUND|favicon/.test(one)).join('\n') || 'none')
} catch (error) {
  console.log('STOPPED', error.stack?.slice(0, 600))
  verdicts.__run = 'FAIL'
} finally {
  await c.close()
}
console.log('\n' + Object.entries(verdicts).map(([id, said]) => `${said.padEnd(14)} ${id}`).join('\n'))
process.exit(Object.values(verdicts).includes('FAIL') ? 1 : 0)
