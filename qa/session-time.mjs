// A focus session in time: the start and end pill ("14:00 → 14:25") beside
// the large time in the bubble and on the task's page, moved on by ten more
// minutes and by a break; the running session as a striped block in Today's
// line by the hour and in the week, between the events around it, faint once
// done, with "Open the session" and "End it early" on right-click; “Start the
// next round by itself” after a break; and each “When the Mac sleeps” choice,
// with the Mac's sleep stood in by powerMonitor's own events from main.
//
//   npx electron-vite build --outDir out-x
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-x/main/index.js HALIGTREE_QA_AWAY=1 [SHOTS=<dir>] node qa/session-time.mjs
import { mkdirSync } from 'fs'
import { sandbox, shiftClock } from './sandbox-lib.mjs'
import { checks } from './harness.mjs'

const SHOTS = process.env.SHOTS ?? ''
if (SHOTS) mkdirSync(SHOTS, { recursive: true })
const { check, done } = checks()
const wait = (ms) => new Promise((done) => setTimeout(done, ms))

// The day as if it were 14:00: a lecture before, a study group after.
const at = (hh, mm = 0) => { const one = new Date(); one.setHours(hh, mm, 0, 0); return one.toISOString() }
process.env.HALIGTREE_QA_CALENDAR = JSON.stringify([
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
// A time of day as the app says it: the Mac's own clock, 24 hours as "9:05", 12 as "9:05 AM".
const timeIn = (page, ms) => page.evaluate((one) => {
  const at = new Date(one)
  const mm = String(at.getMinutes()).padStart(2, '0')
  return window.api.twelveHour ? `${at.getHours() % 12 || 12}:${mm} ${at.getHours() < 12 ? 'AM' : 'PM'}` : `${at.getHours()}:${mm}`
}, ms)
// The worst contrast of a line of text over either colour of a block's stripes (or its plain fill), WCAG's way.
const contrastOver = (page, block, line) => page.evaluate(([blockSel, lineSel]) => {
  const box = document.querySelector(blockSel)
  const text = box?.querySelector(lineSel)
  if (!box || !text) return 0
  const canvas = Object.assign(document.createElement('canvas'), { width: 1, height: 1 })
  const pen = canvas.getContext('2d', { willReadFrequently: true })
  const probe = document.createElement('span')
  box.append(probe)
  const resolve = (css) => ((probe.style.backgroundColor = css), getComputedStyle(probe).backgroundColor)
  const image = getComputedStyle(box).backgroundImage
  const grounds = image.includes('gradient') ? [...image.matchAll(/color-mix\([^()]*(?:\([^()]*\)[^()]*)*\)|oklab\([^)]*\)|color\([^)]*\)|rgba?\([^)]*\)/g)].map((m) => m[0]) : [getComputedStyle(box).backgroundColor]
  const ink = getComputedStyle(text).color
  const page = getComputedStyle(document.body).backgroundColor
  const rgb = (under, over) => {
    pen.clearRect(0, 0, 1, 1)
    for (const one of [page, under, over].filter(Boolean)) ((pen.fillStyle = resolve(one)), pen.fillRect(0, 0, 1, 1))
    return [...pen.getImageData(0, 0, 1, 1).data].slice(0, 3)
  }
  const lum = ([r, g, b]) => [r, g, b].map((v) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)).reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0)
  const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05) }
  const worst = Math.min(...grounds.map((ground) => ratio(rgb(ground, ink), rgb(ground))))
  probe.remove()
  return Math.round(worst * 100) / 100
}, [block, line])
try {
  if (SHOTS) await c.theme('paper')
  await electron.evaluate(({ ipcMain }) => { ipcMain.removeHandler('idle:seconds'); ipcMain.handle('idle:seconds', () => 0) })
  const fresh = await v('settings')
  check('“Start the next round by itself” is off to start', fresh.autoNextRound === false)
  check('“When the Mac sleeps” is “Finish the session” to start', fresh.sessionSleep === 'finish')
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
  const said = async (from, to) => `${await timeIn(pill, from)} → ${await timeIn(pill, to)}`
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
  check('Today\'s block and the bubble say the time the same way', look?.text.includes(`${await timeIn(h, started)} to `) && first.startsWith(await timeIn(h, started)), `${look?.text} / ${first}`)
  for (const one of ['paper', 'dark']) {
    await c.theme(one)
    await go('day')
    await h.waitForTimeout(1200)
    const name = await contrastOver(h, `[data-line-session="${id}"] [data-session-block]`, '[data-session-name]')
    const time = await contrastOver(h, `[data-line-session="${id}"] [data-session-block]`, '[data-session-when]')
    check(`Today, ${one}: the name and the “from, to” line read at 4.5:1 or more over the stripes`, name >= 4.5 && time >= 4.5, `name ${name}, time ${time}`)
  }
  await c.theme('paper')
  await go('day')
  await h.waitForTimeout(1200)
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
  for (const one of ['paper', 'dark']) {
    await c.theme(one)
    await go('week')
    await h.waitForTimeout(1200)
    const name = await contrastOver(h, `[data-week-session="${id}"]`, '[data-session-name]')
    const time = await contrastOver(h, `[data-week-session="${id}"]`, '[data-session-when]')
    check(`week, ${one}: its words read at 4.5:1 or more over the stripes`, name >= 4.5 && time >= 4.5, `name ${name}, time ${time}`)
  }
  await c.theme('paper')
  await go('week')
  await h.waitForTimeout(1200)
  await chip.hover()
  await h.waitForTimeout(1200)
  const chipTip = await h.evaluate(() => [...document.querySelectorAll('[role=tooltip], [data-slot=tooltip-content]')].map((one) => one.textContent).join(' | '))
  check('week: hovering the session shows Haligtree\'s own tip, not the browser\'s', chipTip.includes('Focus session: Draft the essay') && !(await chip.getAttribute('title')), chipTip)
  await h.mouse.move(5, 5)
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
  if (went) await v('session:abandon', went.id)
  await pill.waitForTimeout(6000)
  // Nobody at the Mac as the break ends (three minutes untouched): it waits and asks instead.
  await electron.evaluate(({ ipcMain }) => { ipcMain.removeHandler('idle:seconds'); ipcMain.handle('idle:seconds', () => 180) })
  const away = await breakOver()
  const asks = await pill.evaluate(() => document.body.innerText).catch(() => '')
  check('on, but nobody at the Mac: the break waits for you', away?.kind === 'break', JSON.stringify(away))
  check("on, but nobody at the Mac: the bubble says “Break's over” and asks with “Go again”", /Break.s over/.test(asks) && /Go again/.test(asks), asks.replace(/\s+/g, ' ').slice(0, 160))
  await electron.evaluate(({ ipcMain }) => { ipcMain.removeHandler('idle:seconds'); ipcMain.handle('idle:seconds', () => 0) })
  if (away) await v('session:cancel', away.id)
  await v('settings:set', { autoNextRound: false })
  await pill.waitForTimeout(1500)

  // 7b. Rounds (“4x25”): a break over goes on to the next round by itself, unless nobody is at the Mac.
  const roundsAt = async () => { const now = await v('focus:now'); return now?.rounds ? JSON.parse(now.rounds) : null }
  const intoBreak = async () => {
    const one = await v('rounds:start', 'Reading', { rounds: 3, workMs: 3000, breakMs: 3000, longMs: 3000 })
    await h.evaluate(() => window.api.showFocus(true))
    for (let i = 0; i < 40 && (await roundsAt())?.phase !== 'break'; i++) await wait(250)
    return one
  }
  const present = await intoBreak()
  for (let i = 0; i < 40 && (await roundsAt())?.phase !== 'work'; i++) await wait(250)
  const on = await roundsAt()
  check('rounds: someone at the Mac, the break goes on to round 2 by itself', on?.round === 2 && on.phase === 'work', JSON.stringify(on))
  await v('session:cancel', present)
  await pill.waitForTimeout(1500)
  const absent = await intoBreak()
  await electron.evaluate(({ ipcMain }) => { ipcMain.removeHandler('idle:seconds'); ipcMain.handle('idle:seconds', () => 180) })
  await wait(6000)
  const heldRounds = await roundsAt()
  const heldText = await pill.evaluate(() => document.body.innerText).catch(() => '')
  check('rounds: nobody at the Mac, the next round waits', heldRounds?.round === 1 && heldRounds.phase === 'break', JSON.stringify(heldRounds))
  check("rounds: the bubble says “Break's over” and asks with “Go again”", /Break.s over/.test(heldText) && !!(await pill.$('[data-rounds-on], [data-rounds-on-chip]')), heldText.replace(/\s+/g, ' ').slice(0, 160))
  await electron.evaluate(({ ipcMain }) => { ipcMain.removeHandler('idle:seconds'); ipcMain.handle('idle:seconds', () => 0) })
  await shot(pill, 'rounds-held')
  await pill.click('[data-rounds-on-chip], [data-rounds-on]').catch(() => {})
  await wait(1200)
  const after2 = await roundsAt()
  check('rounds: “Go again” starts round 2', after2?.round === 2 && after2.phase === 'work', JSON.stringify(after2))
  await v('session:cancel', absent)
  await pill.waitForTimeout(1500)

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
  for (const choice of ['finish', 'nothing', 'finish', 'abandon']) {
    // The first round is the default, never chosen: it finishes, so a night asleep is not hours of focus.
    if (choice !== 'finish' || (await v('settings')).sessionSleep !== 'finish') await v('settings:set', { sessionSleep: choice })
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
      const time = await timeIn(pill, slept)
      const want = choice === 'finish' ? `“Sleep test finish” was counted up to ${time}, when the Mac slept` : `“Sleep test abandon” stopped at ${time}, not counted, when the Mac slept`
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
  check('ran to the end', false, error?.stack ?? error)
} finally {
  await c.close()
}
done()
