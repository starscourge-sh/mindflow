// A focus session in time: the start and end pill ("14:00 → 14:25") beside
// the large time in the bubble and on the task's page, moved on by ten more
// minutes and by a break; the running session as a striped block in Today's
// line by the hour and in the week, between the events around it, faint once
// done, with "Open the session" and "End it early" on right-click; “Start the
// next round by itself” after a break; and each “When the Mac sleeps” choice,
// with the Mac's sleep stood in by powerMonitor's own events from main.
//
//   npx electron-vite build --outDir out-x
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-x/main/index.js MINDFLOW_QA_AWAY=1 [SHOTS=<dir>] node qa/session-time.mjs
import { mkdirSync } from 'fs'
import { sandbox, shiftClock } from './sandbox-lib.mjs'

const SHOTS = process.env.SHOTS ?? ''
if (SHOTS) mkdirSync(SHOTS, { recursive: true })
const results = []
const check = (name, ok, detail = '') => { results.push(!!ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${String(detail).slice(0, 240)})` : ''}`) }
const wait = (ms) => new Promise((done) => setTimeout(done, ms))

// The day as if it were 14:00: a lecture before, a study group after.
const at = (hh, mm = 0) => { const one = new Date(); one.setHours(hh, mm, 0, 0); return one.toISOString() }
process.env.MINDFLOW_QA_CALENDAR = JSON.stringify([
  { title: 'Morning lecture', start: at(12), end: at(13), allDay: false, calendar: 'College', color: '#2f80ed' },
  { title: 'Study group', start: at(15), end: at(16), allDay: false, calendar: 'College', color: '#9b51e0' }
])
const c = await sandbox({ width: 1280, height: 900, at: '14:00' })
const { electron, h, v, go } = c
const offset = c.now().getTime() - Date.now()
const pillWindow = async () => {
  for (let i = 0; i < 50; i++) {
    const found = electron.windows().find((one) => one.url().includes('view=focus'))
    if (found) return found
    await wait(200)
  }
  throw new Error('no pill')
}
const shot = async (page, name) => SHOTS && page.screenshot({ path: `${SHOTS}/${name}.png` })
try {
  if (SHOTS) await c.theme('paper')
  await electron.evaluate(({ ipcMain }) => { ipcMain.removeHandler('idle:seconds'); ipcMain.handle('idle:seconds', () => 0) })
  const fresh = await v('settings')
  check('“Start the next round by itself” is off to start', fresh.autoNextRound === false)
  check('“When the Mac sleeps” is “Do nothing” to start', fresh.sessionSleep === 'nothing')
  await v('settings:set', { sounds: false, motion: true, countIn: false, focusShows: 'bubble', pillSits: 'free', macCalendar: true })
  const task = (await v('tasks')).find((one) => one.status === 'open' && one.title)
  const begin = async (goal, ms = 25 * 60000) => {
    const id = await v('session:start', task.id, goal, ms)
    await h.evaluate(() => window.api.showFocus(true))
    return id
  }
  const id = await begin('Draft the essay')
  const pill = await pillWindow()
  pill.on('pageerror', (error) => c.errors.push('PILL PAGEERROR ' + error.message))
  await pill.waitForLoadState('domcontentloaded')
  await pill.waitForTimeout(3500)
  const said = (from, to) => pill.evaluate(([a, b]) => {
    const t = (ms) => new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    return `${t(a)} → ${t(b)}`
  }, [from, to])
  const openPill = async () => {
    await pill.hover('[data-island]', { position: { x: 160, y: 10 } })
    await pill.waitForTimeout(900)
  }
  const spanText = () => pill.locator('[data-island-panel] [data-span-pill]').innerText().catch(() => '')
  const started = Date.parse((await v('focus:now')).startedAt)

  // 1. The pill: start and end beside the large time, and ten more minutes moves the end.
  await openPill()
  const first = await spanText()
  check('the open bubble says from when to when', first === await said(started, started + 25 * 60000), first)
  await shot(pill, 'pill-span')
  await v('session:extend', id, 10 * 60000)
  await pill.waitForTimeout(1200)
  const longer = await spanText()
  check('ten more minutes moves its end on', longer === await said(started, started + 35 * 60000), longer)

  // 2. The task's page: the same pill beside the running clock, and in the start form.
  await c.send('task', task.id)
  await h.waitForTimeout(1500)
  const onPage = await h.locator('[data-span-pill]').first().innerText().catch(() => '')
  check('the task page shows it beside the running time', onPage === await said(started, started + 35 * 60000), onPage)

  // 3. Today's line by the hour: a striped block between the lecture and the study group.
  await go('day')
  await h.waitForTimeout(1500)
  const line = await h.evaluate(() => [...document.querySelectorAll('[data-day-timeline] li')].map((one) => one.hasAttribute('data-line-session') ? `S${one.hasAttribute('data-running') ? '+' : '-'} ${one.textContent}` : one.hasAttribute('data-now-line') ? 'NOW' : (one.hasAttribute('data-line-event') ? 'E ' : 'T ') + one.textContent))
  const where = ['Morning lecture', 'S+', 'Study group'].map((name) => line.findIndex((one) => one.includes(name) || one.startsWith(name)))
  check('Today: the running session sits between the events around it', where.every((n) => n >= 0) && where[0] < where[1] && where[1] < where[2], line.join(' | '))
  const block = h.locator(`[data-line-session="${id}"] [data-session-block]`)
  const look = await block.evaluate((one) => ({ stripes: getComputedStyle(one).backgroundImage.includes('repeating-linear-gradient'), text: one.innerText.replace(/\s+/g, ' ') })).catch(() => null)
  check('Today: drawn in stripes while it runs', look?.stripes, JSON.stringify(look))
  check('Today: it says from 14:00 to 14:35', look?.text.includes('14:00 to 14:35'), look?.text)
  await shot(h, 'today-paper')

  // 4. Right-click: Open the session, End it early.
  await block.click({ button: 'right' })
  await h.waitForTimeout(500)
  const menu = await h.locator('[role="menu"]').innerText().catch(() => '')
  check('right-click offers “Open the session” and “End it early”', menu.includes('Open the session') && menu.includes('End it early'), menu.replace(/\s+/g, ' '))
  if (SHOTS) await shot(h, 'today-menu')
  await h.keyboard.press('Escape')
  await h.waitForTimeout(300)

  // 5. The week: today's column has it, between the same two events.
  await go('week')
  await h.waitForTimeout(1500)
  const col = await h.evaluate(() => [...document.querySelector('[data-day="0"]').querySelectorAll('[data-week-event], [data-week-session]')].map((one) => (one.hasAttribute('data-week-session') ? 'S ' : 'E ') + one.textContent))
  const order = ['Morning lecture', 'S ', 'Study group'].map((name) => col.findIndex((one) => one.includes(name) || one.startsWith(name)))
  check('week: the session is on today, between the events around it', order.every((n) => n >= 0) && order[0] < order[1] && order[1] < order[2], col.join(' | '))
  const chip = h.locator(`[data-week-session="${id}"]`)
  check('week: drawn in stripes while it runs', await chip.evaluate((one) => getComputedStyle(one).backgroundImage.includes('repeating-linear-gradient')).catch(() => false))
  await shot(h, 'week-paper')
  await chip.click({ button: 'right' })
  await h.waitForTimeout(500)
  await h.locator('[role="menuitem"]', { hasText: 'End it early' }).click()
  await h.waitForTimeout(1200)
  const ended = (await v('sessions', task.id)).find((one) => one.id === id)
  check('“End it early” ends it, counted', ended?.endedAt && !ended.abandonedAt)
  const after = await chip.evaluate((one) => ({ running: one.hasAttribute('data-running'), stripes: getComputedStyle(one).backgroundImage.includes('repeating') })).catch(() => null)
  check('done, it is a plain faint block', after && !after.running && !after.stripes, JSON.stringify(after))
  await chip.click({ button: 'right' })
  await h.waitForTimeout(400)
  const doneMenu = await h.locator('[role="menu"]').innerText().catch(() => '')
  check('a done one offers only “Open the session”', doneMenu.includes('Open the session') && !doneMenu.includes('End it early'), doneMenu.replace(/\s+/g, ' '))
  await h.keyboard.press('Escape')

  // 6. A break: the pill's span is the break's own.
  const two = await begin('Read chapter two')
  await pill.waitForTimeout(2500)
  await v('break:start', two, 5 * 60000)
  await pill.waitForTimeout(2500)
  const brk = await v('focus:now')
  await openPill()
  const brkSpan = await spanText()
  check('a break says its own from and to', brkSpan === await said(Date.parse(brk.startedAt), Date.parse(brk.startedAt) + 5 * 60000), brkSpan)
  await v('session:cancel', brk.id)
  await pill.waitForTimeout(1500)

  // 7. Start the next round by itself: off, a break over waits; on, the session starts again.
  const breakOver = async () => {
    const one = await begin('Read chapter three')
    await pill.waitForTimeout(2000)
    await v('break:start', one, 3000)
    await pill.waitForTimeout(6000)
    return v('focus:now')
  }
  const waited = await breakOver()
  check('off: a break over waits for you', waited?.kind === 'break', JSON.stringify(waited))
  if (waited) await v('session:cancel', waited.id)
  await pill.waitForTimeout(1500)
  await v('settings:set', { autoNextRound: true })
  const went = await breakOver()
  check('on: the session starts again by itself', went && went.kind !== 'break' && went.taskId === task.id && went.goal === 'Read chapter three', JSON.stringify(went))
  await v('settings:set', { autoNextRound: false })
  if (went) await v('session:abandon', went.id)
  await pill.waitForTimeout(6000)

  // 8. The Mac sleeping, three minutes, for each choice.
  const sleep = async () => {
    const slept = Date.now() + offset
    await electron.evaluate(({ powerMonitor }) => powerMonitor.emit('suspend'))
    await electron.evaluate((_, [code, by]) => new Function(`(${code})(${by})`)(), [shiftClock.toString(), offset + 3 * 60000])
    await electron.evaluate(({ powerMonitor }) => powerMonitor.emit('resume'))
    await electron.evaluate((_, [code, by]) => new Function(`(${code})(${by})`)(), [shiftClock.toString(), offset])
    await pill.waitForTimeout(1500)
    return slept
  }
  for (const choice of ['nothing', 'finish', 'abandon']) {
    await v('settings:set', { sessionSleep: choice })
    const one = await begin(`Sleep test ${choice}`)
    await pill.waitForTimeout(2500)
    const slept = await sleep()
    const row = (await v('sessions', task.id)).find((s) => s.id === one)
    const band = await pill.locator('[data-slept]').evaluate((one) => [...one.querySelectorAll('[data-slept-at], [data-slept-did]')].map((line) => line.textContent).join(' ')).catch(() => '')
    if (choice === 'nothing') {
      check('“Do nothing”: the session runs on', !row.endedAt && (await v('focus:now'))?.id === one)
      check('“Do nothing”: nothing is said', band === '', band)
      await v('session:abandon', one)
      await pill.waitForTimeout(6000)
    } else {
      check(`“${choice === 'finish' ? 'Finish' : 'Abandon'} the session”: ended at the moment it slept`, row.endedAt && Math.abs(Date.parse(row.endedAt) - slept) < 3000, `${row.endedAt} vs ${new Date(slept).toISOString()}`)
      check(`“${choice === 'finish' ? 'Finish' : 'Abandon'} the session”: ${choice === 'finish' ? 'counted' : 'kept, counted nowhere'}`, choice === 'finish' ? !row.abandonedAt : !!row.abandonedAt)
      const time = await pill.evaluate((ms) => new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), slept)
      const want = `The Mac slept at ${time}, ${choice === 'finish' ? 'so the session was finished there' : 'so it was abandoned there, not counted'}`
      check(`the bubble says so: “${want}”`, band.replace(/\s+/g, ' ') === want, band.replace(/\s+/g, ' '))
      await shot(pill, `slept-${choice}`)
      await pill.locator('[data-slept] button[aria-label="Close"]').click().catch(() => {})
      await pill.waitForTimeout(1500)
    }
  }
  await v('settings:set', { sessionSleep: 'nothing' })

  // 9. Dark: the same block and pill in a dark theme, to look at.
  if (SHOTS) {
    const dark = await begin('Draft the essay')
    await c.theme('dark')
    await go('day')
    await h.waitForTimeout(1500)
    await shot(h, 'today-dark')
    await go('week')
    await h.waitForTimeout(1500)
    await shot(h, 'week-dark')
    await openPill()
    await shot(pill, 'pill-span-dark')
    await go('settings')
    await h.waitForTimeout(1200)
    await h.getByPlaceholder('Search…', { exact: true }).last().fill('sleeps').catch(() => {})
    await h.waitForTimeout(600)
    await shot(h, 'settings-dark')
    await c.theme('paper')
    await go('settings')
    await h.waitForTimeout(1200)
    await h.getByPlaceholder('Search…', { exact: true }).last().fill('sleeps').catch(() => {})
    await h.waitForTimeout(600)
    await shot(h, 'settings-paper')
    await v('session:abandon', dark)
  }
  check('no page errors', c.errors.length === 0, c.errors.join(' | '))
} catch (error) {
  console.log('FAIL  the probe threw: ' + (error?.stack ?? error))
  results.push(false)
} finally {
  await c.close()
}
console.log(`${results.filter(Boolean).length}/${results.length} passed`)
process.exit(results.every(Boolean) ? 0 : 1)
