// Planning, sessions and What's new: the What's new card and timeline (with
// Show me), pomodoro rounds from the box ("4x25", kept plain by a click), the
// Close the day pass (T, M, W, a line for the day's page, tomorrow's first
// task), task lengths ("~30m") and Today's planned-against-left line, the
// Month page's calendar with its key, and the session pill tucked under the
// notch (MINDFLOW_QA_NOTCH stands one in). Read back through the app's own API
// and the page; SHOTS=dir keeps pictures in light, dark and Brutal.
//
//   npx electron-vite build --outDir out-plan2
//   QA_DATA=$(mktemp -d) QA_ENTRY=out-plan2/main/index.js node qa/plan2.mjs                    (a fresh install)
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-plan2/main/index.js node qa/plan2.mjs  (the sandbox)
import { mkdirSync, mkdtempSync, readFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { _electron } from 'playwright'
import { sandbox } from './sandbox-lib.mjs'

process.env.MINDFLOW_QA_NOTCH ??= '1'
// A stand-in for the Mac's calendar: one event today.
{ const at = new Date(); at.setHours(15, 0, 0, 0); process.env.MINDFLOW_QA_CALENDAR ??= JSON.stringify([{ title: 'Dentist', start: at.toISOString(), end: new Date(at.getTime() + 3600000).toISOString(), allDay: false, calendar: 'Home', color: '#3b82f6' }]) }
process.env.QA_DATA ??= mkdtempSync(join(tmpdir(), 'vigil-plan2-'))
const SANDBOXED = (process.env.QA_ARGS ?? '').includes('--sandbox')
const SHOTS = process.env.SHOTS
if (SHOTS) mkdirSync(SHOTS, { recursive: true })
const early = []
// The newest entry, read from the list itself, so a new entry does not break the check.
const NEWEST = (() => { const m = readFileSync(new URL('../src/renderer/src/lib/whats-new.ts', import.meta.url), 'utf8').match(/\{ id: '([^']+)', release: '[^']+', day: '[^']+', lead: '([^']+)'/); return { id: m[1], lead: m[2] } })()
// A fresh install opens on the welcome: its first look is taken here, then
// the welcome is marked done and the app opened again for everything else.
if (!SANDBOXED) {
  const app = await _electron.launch({ args: [process.env.QA_ENTRY ?? '.'], env: { MINDFLOW_QA_AWAY: '1', ...process.env, MINDFLOW_USER_DATA: process.env.QA_DATA } })
  let home
  for (let i = 0; i < 100 && !home; i++) (home = app.windows().find((one) => one.url().includes('view=home'))) || (await new Promise((done) => setTimeout(done, 200)))
  await home.waitForTimeout(4000)
  early.push(['a fresh install starts up to date: no What\'s new card', (await home.locator('[data-whats-new-card]').count()) === 0])
  early.push(['and the newest entry is counted as seen', (await home.evaluate(() => localStorage.getItem('whats-new:seen'))) === NEWEST.id])
  await home.evaluate(() => window.api.vigil('onboarding:set', { welcomed: new Date(Date.now() - 40 * 86400000).toISOString(), welcoming: false }))
  await home.evaluate(() => localStorage.setItem('whats-new:seen', 'split'))
  await home.waitForTimeout(500)
  // Quit, not killed: a kill can beat the page's storage to the disk, and the next run would read the old "seen".
  await Promise.race([app.close().catch(() => {}), new Promise((done) => setTimeout(done, 6000))])
  try { app.process().kill('SIGKILL') } catch {}
  await new Promise((done) => setTimeout(done, 1500))
}
const c = await sandbox({ width: 1180, height: 860, seeded: SANDBOXED })
const { h, page, v, electron } = c
const results = []
const check = (name, ok, detail = '') => (results.push({ name, ok: !!ok }), console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`))
const wait = (ms = 400) => h.waitForTimeout(ms)
const tag = SANDBOXED ? 'sandbox' : 'fresh'
const shot = async (name, target = h) => SHOTS && target.screenshot({ path: `${SHOTS}/${name}-${tag}.png` })
const day = (n) => { const at = new Date(); at.setDate(at.getDate() + n); return `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, '0')}-${String(at.getDate()).padStart(2, '0')}` }
const text = (selector, target = h) => target.evaluate((s) => [...document.querySelectorAll(s)].map((one) => one.textContent?.trim() ?? ''), selector)
const looks = async (style, theme) => {
  await h.evaluate((s) => (s === 'brutal' ? localStorage.setItem('style', 'brutal') : localStorage.removeItem('style')), style)
  await c.theme(theme)
  await c.size(1180, 860)
}

await v('settings:set', { safeMode: false, hintRate: 0, rotCount: 0, motion: false, sounds: true })

try {
  // --- What's new -------------------------------------------------------------
  for (const [name, ok] of early) check(name, ok)
  // Today's tasks, two with a length, made first so Today has its planned line to point at.
  const made = []
  for (const words of ['write the report ~30m', 'plan the trip ~1h', 'water the plants']) made.push(await v('task:add', words, undefined, true))
  await v('settings:set', { dayEnd: '23:59' })
  if (!SANDBOXED) {
    // An update: welcomed long ago, and last saw an older entry.
    await c.go('home')
    await wait(900)
    const card = await text('[data-whats-new-card] [data-news]')
    check("after an update, Home shows what's new since: three entries", card.length === 3 && card[0].includes(NEWEST.lead), card.map((one) => one.slice(0, 20)).join(' | '))
    await shot('whats-new-card')
    // Home shows one card for the moment and the rest behind "N more for today" (now-slot.tsx); on a Sunday the week's digest leads.
    if (!(await h.locator('[data-whats-new-card]').isVisible())) { await h.locator('[data-now-more]').click(); await wait(500) }
    // The first entry on the card that has somewhere to show.
    await h.locator('[data-whats-new-card] [data-news]').getByRole('button', { name: 'Show me' }).first().click()
    await wait(1500)
    const pointed = await text('[aria-label="Where things are"]')
    check('Show me points at the place, with the tour spotlight', pointed.some((one) => one.trim().length > 0) && (await h.locator('[data-pointed]').count()) >= 1, pointed[0]?.slice(0, 60))
    await h.keyboard.press('Escape')
    await c.go('home')
    await wait(700)
    check("seen once, the card does not come back", (await h.locator('[data-whats-new-card]').count()) === 0)
  }
  // ⌘K: What's new, as built-in pages
  await h.keyboard.press('Meta+k')
  await wait(500)
  await h.keyboard.type("What's new", { delay: 20 })
  await wait(500)
  await h.keyboard.press('Enter')
  await wait(900)
  const first = await text('[data-whats-new] [data-news]')
  check("⌘K opens What's new: a built-in page per release, each entry with a bold lead-in and Show me", (await h.locator('[data-release]').count()) === 3 && first.length >= 10 && (await h.locator('[data-whats-new] [data-news] strong').count()) === first.length && (await h.locator('[data-whats-new] [data-news] button', { hasText: 'Show me' }).count()) === first.length, `${first.length} entries`)
  check('it is read only: nothing on it can be typed into', (await h.locator('[data-whats-new] [contenteditable="true"], [data-whats-new] input, [data-whats-new] textarea').count()) === 0)
  await h.locator('[data-release="groups-and-books"]').click()
  await wait(500)
  check('another release is its own dated page', (await text('[data-release-page] h1'))[0] === 'Groups, books and thoughts on a note' && (await h.locator('[data-whats-new] [data-news]').count()) === 3)
  check("no em dashes in What's new", !(await h.evaluate(() => document.querySelector('[data-whats-new]')?.textContent ?? '')).includes('—'))
  check('its pages are not notes: search does not find them', !(await h.evaluate(() => window.api.vigil('recent', 365).then((all) => all.some((one) => /One Bin for everything|Focus rounds\./.test(one.title))))))
  for (const [style, theme] of [['soft', 'paper'], ['soft', 'github'], ['brutal', 'paper']]) {
    await looks(style, theme)
    await c.go('whatsnew')
    await wait(800)
    await shot(`whats-new-${theme}${style === 'brutal' ? '-brutal' : ''}`)
  }
  await looks('soft', 'paper')
  await c.go('home')
  // The Vigil menu's entry asks the main window the same way.
  await electron.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((one) => one.webContents.getURL().includes('view=home'))?.webContents.executeJavaScript("window.dispatchEvent(new CustomEvent('vigil:whats-new'))"))
  await wait(800)
  check("the Vigil menu's What's new opens it too", (await h.locator('[data-whats-new]').count()) === 1)

  // --- Task lengths -----------------------------------------------------------
  const report = await v('task', made[0].id)
  check('~30m sets a length of 30 minutes and leaves the name clean', report.estimate === 30 && report.title === 'write the report', `${report.title} / ${report.estimate}`)
  check('~1h sets 60', (await v('task', made[1].id)).estimate === 60)
  await v('settings:set', { dayEnd: '23:59' })
  await c.go('today')
  await wait(900)
  const budget = await h.$eval('[data-day-budget]', (one) => one.dataset.said ?? '').catch(() => '')
  check("Today's line: 'planned, … left today'", /1 h 30 min planned, .* left today/.test(budget) || /h( \d+ min)? planned, .*left today/.test(budget), budget)
  check('each task with a length wears a chip', (await text('[data-length-chip]')).filter((one) => one === '~30 min' || one === '~1 h').length === 2)
  await h.keyboard.press('a')
  await h.keyboard.type('call Sam ~45m tomorrow', { delay: 15 })
  await wait(400)
  check('the add line lights ~45m', (await text('mark')).includes('~45m'), (await text('mark')).join(' | '))
  check('and shows its chip', await h.evaluate(() => [...document.querySelectorAll('[data-task-chip="length"]')].length === 1))
  await shot('today-lengths')
  await h.keyboard.press('Escape')

  // --- Close the day ----------------------------------------------------------
  await v('settings:set', { closeDay: true, closeDayAt: '00:00' })
  await h.evaluate(() => (localStorage.removeItem('close-day:done'), localStorage.removeItem('close-day:away')))
  await c.go('home')
  await wait(900)
  check('past its hour, Home offers to close the day', (await h.locator('[data-close-day-offer]').count()) === 1)
  await h.locator('[data-close-day-offer]').getByRole('button', { name: 'Close the day' }).click()
  await wait(900)
  check('the pass opens: done, still open, a line, tomorrow', (await h.locator('[data-close-day] [data-close-done], [data-close-day] [data-close-open], [data-close-day] [data-close-line], [data-close-day] [data-close-frog]').count()) === 4)
  const rows = await h.$$eval('[data-close-task]', (all) => all.map((one) => one.getAttribute('data-close-task')))
  const ours = made.map((one) => one.id).filter((id) => rows.includes(id))
  check("today's open tasks are listed", ours.length === 3, `${ours.length} of 3`)
  const at = (id) => rows.indexOf(id)
  // T on the report, N on the trip, L on the plants.
  for (const [id, key] of [[made[0].id, 't'], [made[1].id, 'n'], [made[2].id, 'd']]) {
    await h.locator(`[data-close-task="${id}"]`).hover()
    await wait(150)
    await h.keyboard.press(key)
    await wait(500)
  }
  void at
  const [r, t, p] = await Promise.all(made.map((one) => v('task', one.id)))
  check('T sends it to tomorrow', r.dueAt?.startsWith?.(day(1)) || new Date(r.dueAt).getDate() === new Date(day(1) + 'T12:00').getDate(), r.dueAt)
  check('N moves it to next week', new Date(t.dueAt).getDate() === new Date(day(7) + 'T12:00').getDate(), t.dueAt)
  check('L lets it go', p.status === 'dropped', p.status)
  await h.getByLabel("One line for today's page").fill('A quiet day, the report nearly there')
  await h.keyboard.press('Enter')
  await wait(700)
  const page1 = await v('notes:day', day(0))
  check("the line lands on today's page", JSON.stringify(page1.body ?? '').includes('A quiet day, the report nearly there'))
  await h.locator('[data-close-frog] [role="radio"]', { hasText: 'write the report' }).click()
  await wait(500)
  const frog = (await v('settings')).frog
  check("tomorrow's first task is kept as the frog", frog?.id === made[0].id && frog?.day === day(1), JSON.stringify(frog))
  await shot('close-day')
  // One more open task, so the dark and Brutal pictures show a row and its keys.
  await v('task:add', 'sort the post', undefined, true)
  await looks('soft', 'github')
  await h.evaluate(() => window.dispatchEvent(new CustomEvent('vigil:close-day')))
  await wait(900)
  await shot('close-day-github')
  await h.keyboard.press('Escape')
  await looks('brutal', 'paper')
  await h.evaluate(() => window.dispatchEvent(new CustomEvent('vigil:close-day')))
  await wait(900)
  await shot('close-day-brutal')
  await h.keyboard.press('Escape')
  await looks('soft', 'github')
  await h.evaluate(() => window.dispatchEvent(new CustomEvent('vigil:close-day')))
  await wait(900)
  check('every row shows its keys on its chips', (await h.locator('[data-close-task] kbd').count()) === 3 * (await h.locator('[data-close-task]').count()))
  await h.keyboard.press('Meta+Enter')
  await wait(600)
  check('⌘↵ closes the day, and the offer goes for today', (await h.locator('[data-close-day]').count()) === 0 && (await h.evaluate(() => localStorage.getItem('close-day:done'))) === day(0))
  await looks('soft', 'paper')
  // The frog on its day: set for today here, as tomorrow cannot be waited for.
  await v('task:save', made[0].id, { due: new Date().toISOString() })
  await v('settings:set', { frog: { id: made[0].id, day: day(0) } })
  await c.go('today')
  await wait(900)
  const firstRow = await h.$$eval('[data-row][data-id]', (all) => all.map((one) => one.textContent ?? ''))
  check('the frog leads Today, marked One big thing', firstRow[0]?.includes('write the report') && (await h.locator('[data-frog]').count()) === 1, firstRow[0]?.slice(0, 40))
  await c.go('day')
  await wait(1500)
  const brief = await text('li', h)
  check("and leads the day's brief", brief.find((one) => one.includes('write the report'))?.includes('First, as you picked'))
  await v('settings:set', { frog: null })

  // --- The Month page's calendar ----------------------------------------------
  await v('notes:day:save', day(0), { body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Written today' }] }] } })
  const ahead = Number(day(3).slice(8)) > Number(day(0).slice(8)) ? day(3) : day(0)
  await v('milestone:set', { day: ahead, title: 'Recital', color: 'blue' })
  await c.go('monthpage')
  await wait(1200)
  check('the month has a key: page, reviews, marked, exam, cards due', (await text('[data-month-legend]'))[0]?.match(/A page written.*Reviews done.*A marked day.*An exam.*Cards due/) !== null)
  check("a day with a page wears its dot", (await h.locator(`[data-grid-day="${day(0)}"] [data-page-dot]`).count()) === 1)
  const ring = await h.$eval(`[data-grid-day="${ahead}"]`, (one) => getComputedStyle(one).outlineStyle)
  check('a marked day is ringed', ring === 'solid', ring)
  if (SANDBOXED) {
    check('days with reviews are tinted', (await h.locator('[data-grid-day][data-reviews]').count()) > 0)
    check('days ahead count the cards due', (await h.locator('[data-grid-day] [data-due-count]').count()) > 0)
    check('an exam wears a flag', (await h.locator('[data-grid-day] [data-mark-flag]').count()) >= 0)
  }
  for (const [style, theme] of [['soft', 'paper'], ['soft', 'github'], ['brutal', 'paper']]) {
    await looks(style, theme)
    await c.go('monthpage')
    await wait(1200)
    await h.locator('[data-month-legend]').scrollIntoViewIfNeeded()
    await shot(`month-${theme}${style === 'brutal' ? '-brutal' : ''}`)
  }
  await looks('soft', 'paper')
  await c.go('monthpage')
  await wait(900)
  await h.locator(`[data-grid-day="${day(0)}"]`).click()
  await wait(1000)
  check("a click on a day opens its page", (await text('[data-today-line]')).length > 0 || (await h.locator('.tiptap', { hasText: 'Written today' }).count()) > 0)

  // --- Pomodoro rounds --------------------------------------------------------
  const EDITOR = '.tiptap.ProseMirror.mindflow-editor:not(.is-line)'
  const box = async (words) => {
    await page.evaluate(() => window.api.showPrompt())
    await page.waitForTimeout(300)
    await c.qa.reset()
    await page.keyboard.type(words, { delay: 15 })
    await page.waitForTimeout(500)
  }
  await box('4x25/5 essay draft')
  check('4x25/5 is lit as rounds', (await page.locator(`${EDITOR} .box-token[data-box-token="rounds"]`).count()) === 1)
  check('and says what it will do', ((await page.evaluate(() => document.querySelector('[data-will-do]')?.textContent ?? '')) || '').includes('4 rounds of 25 min'))
  await page.click(`${EDITOR} .box-token[data-box-token="rounds"]`)
  await page.waitForTimeout(300)
  check('a click keeps it as plain words', (await page.locator(`${EDITOR} .box-token[data-box-token="rounds"]`).count()) === 0)
  await box('4x25 essay draft')
  await page.keyboard.press('Alt+Meta+Enter')
  await page.waitForTimeout(1500)
  let focus = await v('focus:now')
  const rounds = JSON.parse(focus?.rounds ?? 'null')
  check('sent, four rounds start: round 1 of 4, 25 minutes', rounds?.rounds === 4 && rounds?.round === 1 && rounds?.phase === 'work' && focus.plannedMs === 25 * 60000, focus?.rounds)
  // The pill, tucked under the stand-in notch.
  await v('settings:set', { pillSits: 'notch' })
  const pill = await (async () => { for (let i = 0; i < 50; i++) { const found = electron.windows().find((one) => one.url().includes('view=focus')); if (found) return found; await wait(200) } })()
  pill.on('pageerror', (error) => c.errors.push('PILL PAGEERROR ' + error.message))
  await pill.waitForTimeout(1500)
  check('the pill shows a dot a round', (await pill.locator('[data-round-dots]').first().locator('> span').count()) === 4)
  // Test windows are parked out of sight, so where the pill was put is what is read.
  const where = () => electron.evaluate(({ screen }) => {
    const asked = globalThis.pillPlaced?.at
    if (!asked) return { win: null }
    const display = screen.getDisplayMatching(asked)
    return { win: asked, screen: display.bounds, work: display.workArea }
  })
  let at1 = await where()
  check("under the notch, the pill hangs from the very top of the screen", at1.win?.y === at1.screen?.y, JSON.stringify(at1))
  check('as a black band with the time in its wing', (await pill.locator('[data-notch-band]').count()) === 1)
  await shot('pill-notch', pill)
  await pill.hover('[data-island]')
  await pill.waitForTimeout(900)
  check('pointed at, it opens', (await pill.$eval('[data-island]', (one) => one.dataset.island)) === 'open')
  await shot('pill-notch-open', pill)
  await pill.mouse.move(2, 300)
  await pill.waitForTimeout(800)
  // The last seconds of round 1: then the break, with its own sound.
  await pill.evaluate(() => { window.__cues = []; const was = window.AudioContext; void was })
  await v('rounds:next', focus.id, { round: 1, phase: 'work', ms: 2000 })
  await pill.waitForTimeout(4000)
  focus = await v('focus:now')
  const now = JSON.parse(focus?.rounds ?? 'null')
  check('round 1 over, its break starts on its own: 5 minutes', now?.phase === 'break' && now?.round === 1 && focus.plannedMs === 5 * 60000, focus?.rounds)
  check("the pill says Break", (await pill.locator('[data-island][data-break]').count()) === 1)
  await v('settings:set', { pillSits: 'free' })
  await pill.waitForTimeout(900)
  at1 = await where()
  check('Where I put it: back under the menu bar', at1.win?.y === at1.work?.y + 6, JSON.stringify(at1))
  await shot('pill-free', pill)
  await v('session:cancel', focus.id)

  // --- Where you pick up, and the five-second rule ------------------------------
  await v('settings:set', { countIn: true })
  await v('session:start', made[1].id, 'plan the trip', 25 * 60000)
  await h.evaluate(() => window.api.showFocus(true))
  await pill.waitForTimeout(1500)
  check('the five-second rule counts the session in', (await pill.locator('[data-count-in]').count()) === 1)
  await pill.waitForTimeout(5500)
  check('then its clock starts', (await pill.locator('[data-count-in]').count()) === 0 && !(await v('focus:now'))?.pausedAt)
  await v('settings:set', { countIn: false })
  await pill.hover('[data-island]')
  await pill.waitForTimeout(700)
  await pill.getByRole('button', { name: /Stop/ }).click()
  // Stopped before its time, it asks whether to count it.
  await pill.locator('[data-end-early]').click()
  await pill.waitForTimeout(800)
  await pill.keyboard.press('Escape')
  await pill.waitForTimeout(600)
  check('as a session ends, the pill asks where you pick up', (await pill.locator('[data-pickup]').count()) === 1)
  await pill.keyboard.type('the hotel in Lisbon', { delay: 10 })
  await pill.keyboard.press('Enter')
  await pill.waitForTimeout(700)
  check('kept on the task', (await v('task', made[1].id)).pickup === 'the hotel in Lisbon')
  await c.send('task', made[1].id)
  await wait(1200)
  check('and shown at the top when the task next opens', (await text('[data-pickup-note]')).some((one) => one.includes('the hotel in Lisbon')))
  await shot('pickup')

  // --- Eat the frog, from the row menu ----------------------------------------
  await c.go('home')
  await v('settings:set', { frog: null })
  const frogTask = await v('task:add', 'call the bank', undefined, true)
  await c.go('today')
  await wait(900)
  // A long Today is a scrolled list: down until the row is drawn.
  for (let i = 0; i < 20 && !(await h.locator(`[data-row][data-id="${frogTask.id}"]`).count()); i++) {
    await h.mouse.move(800, 600)
    await h.mouse.wheel(0, 600)
    await wait(200)
  }
  if (!(await h.locator(`[data-row][data-id="${frogTask.id}"]`).count())) (console.log('DEBUG no frog row'), await h.screenshot({ path: `${process.env.QA_DATA}/debug.png` }), console.log(process.env.QA_DATA))
  await h.locator(`[data-row][data-id="${frogTask.id}"]`).click({ button: 'right' })
  await wait(400)
  // It sits in the menu's "Date" line.
  await h.getByRole('menuitem', { name: /^Date/ }).first().hover(); await wait(500)
  await h.getByRole('menuitem', { name: 'Do this first today' }).click()
  await wait(800)
  const frog2 = (await v('settings')).frog
  check('a right-click marks the frog for today', frog2?.id === frogTask.id && frog2?.day === day(0))
  for (let i = 0; i < 20; i++) (await h.mouse.wheel(0, -2000), await wait(60))
  await wait(300)
  const lead = await h.$$eval('[data-row][data-id]', (all) => all.map((one) => one.getAttribute('data-id')))
  check('and it leads Today', lead[0] === frogTask.id)

  // --- 1-3-5 --------------------------------------------------------------------
  for (const words of ['draft the talk', 'email Ana', 'book the dentist', 'pay the rent', 'tidy the desk']) await v('task:add', words, undefined, true)
  await h.evaluate(() => { const key = 'view:tasks:today'; const was = JSON.parse(localStorage.getItem(key) ?? '{}'); localStorage.setItem(key, JSON.stringify({ ...was, group: '135' })) })
  await h.reload()
  await wait(1500)
  await c.go('today')
  await wait(1000)
  const heads = await text('h2, h3')
  check('1-3-5 lays Today out as one big, three medium and five small', ['One big thing', 'Three medium', 'Five small'].every((one) => heads.some((head) => head.startsWith(one))), heads.join(' | ').slice(0, 120))
  await shot('today-135')
  await h.evaluate(() => { const key = 'view:tasks:today'; const was = JSON.parse(localStorage.getItem(key) ?? '{}'); localStorage.setItem(key, JSON.stringify({ ...was, group: 'when' })) })
  await v('settings:set', { frog: null })

  // --- The Bin ------------------------------------------------------------------
  const gem = await v('nugget:from', 'A gem to put in the Bin', {})
  await v('bin:put', gem)
  const capId = (await page.evaluate(() => window.api.captures.list()))[0]?.id ?? null
  if (capId) await page.evaluate((id) => window.api.captures.save(id, { status: 'discarded' }), capId)
  await c.go('discarded')
  await wait(1000)
  const kinds = await h.$$eval('[data-bin-row]', (all) => [...new Set(all.map((one) => one.getAttribute('data-bin-row')))])
  check('one Bin holds every kind: a capture, a task and a gem', ['task', 'nugget'].every((one) => kinds.includes(one)) && (!capId || kinds.includes('capture')), kinds.join(', '))
  check('the gem left its list', !(await v('items', 'nugget')).some((one) => one.id === gem))
  await shot('bin')
  await h.locator(`[data-bin-row="nugget"][data-id="${gem}"]`).getByRole('button', { name: 'Restore' }).click()
  await wait(800)
  check('Restore brings the gem back', (await v('items', 'nugget')).some((one) => one.id === gem && !one.archivedAt))
  const hold = h.locator('button', { hasText: 'Hold to empty' })
  const box1 = await hold.boundingBox()
  await h.mouse.move(box1.x + box1.width / 2, box1.y + box1.height / 2)
  await h.mouse.down()
  await wait(2600)
  await h.mouse.up()
  await wait(900)
  check('held, Empty lets everything in the Bin go for good', (await v('bin:list')).length === 0)

  // --- Your Mac's calendar (stood in by MINDFLOW_QA_CALENDAR) ----------------
  await v('settings:set', { macCalendar: true })
  await c.go('day')
  await wait(1500)
  check("the day's events show in the brief", (await text('[data-brief-calendar] [data-mac-event]')).some((one) => one.includes('Dentist')))
  await c.go('week')
  await wait(1200)
  check('and in the week', (await text('[data-mac-event]')).some((one) => one.includes('Dentist')))
  await v('settings:set', { macCalendar: false })

  // --- Weekly digest ------------------------------------------------------------
  const week = await v('digest:week')
  check('the digest counts caught, kept, reviewed and finished', ['caught', 'kept', 'reviewed', 'finished'].every((one) => typeof week[one] === 'number'), JSON.stringify(week))
  await h.clock.setFixedTime(new Date(`${day(0)}T10:00:00`).getTime() + ((7 - new Date().getDay()) % 7) * 86400000)
  await c.go('inbox')
  await c.go('home')
  await wait(1200)
  check('on a Sunday, Home shows the week in four numbers', (await h.locator('[data-weekly-digest] [data-digest]').count()) === 4)
  await shot('digest')

  // --- What Vigil can do and the keys ----------------------------------------
  await c.go('powers')
  await wait(1200)
  const names = await h.evaluate(() => document.body.innerText)
  check('What Vigil can do lists each new power', ['Focus rounds', 'How long a task takes', 'Close the day', 'The month at a glance', 'The bubble in the notch', 'What’s new', 'Eat the frog', '1-3-5', 'Where you pick up', 'The five-second rule', 'Your Mac’s calendar', 'A weekly digest', 'One Bin, with Restore'].every((one) => names.includes(one)))
  await h.keyboard.press('?')
  await wait(500)
  await h.keyboard.type('Move the task to the Bin', { delay: 10 })
  await wait(300)
  check('the shortcut sheet has Close the day’s keys', (await h.evaluate(() => document.body.innerText)).includes('Move the task to the Bin'))
  await h.keyboard.press('Escape')
} catch (error) {
  console.log('ERROR', error.stack)
  results.push({ name: 'ran to the end', ok: false })
} finally {
  const errors = c.errors.filter((one) => !/Autofill|Electron Security|DevTools/.test(one))
  check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '))
  const failed = results.filter((one) => !one.ok)
  console.log(`\n${results.length - failed.length} of ${results.length} passed${failed.length ? `; failed: ${failed.map((one) => one.name).join('; ')}` : ''}`)
  await c.close()
  process.exit(failed.length ? 1 : 0)
}
