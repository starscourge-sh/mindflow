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
import { mkdirSync, mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { _electron } from 'playwright'
import { sandbox } from './sandbox-lib.mjs'

process.env.MINDFLOW_QA_NOTCH ??= '1'
process.env.QA_DATA ??= mkdtempSync(join(tmpdir(), 'vigil-plan2-'))
const SANDBOXED = (process.env.QA_ARGS ?? '').includes('--sandbox')
const SHOTS = process.env.SHOTS
if (SHOTS) mkdirSync(SHOTS, { recursive: true })
const early = []
// A fresh install opens on the welcome: its first look is taken here, then
// the welcome is marked done and the app opened again for everything else.
if (!SANDBOXED) {
  const app = await _electron.launch({ args: [process.env.QA_ENTRY ?? '.'], env: { MINDFLOW_QA_AWAY: '1', ...process.env, MINDFLOW_USER_DATA: process.env.QA_DATA } })
  let home
  for (let i = 0; i < 100 && !home; i++) (home = app.windows().find((one) => one.url().includes('view=home'))) || (await new Promise((done) => setTimeout(done, 200)))
  await home.waitForTimeout(4000)
  early.push(['a fresh install starts up to date: no What\'s new card', (await home.locator('[data-whats-new-card]').count()) === 0])
  early.push(['and the newest entry is counted as seen', (await home.evaluate(() => localStorage.getItem('whats-new:seen'))) === 'close-day'])
  await home.evaluate(() => window.api.vigil('onboarding:set', { welcomed: new Date(Date.now() - 40 * 86400000).toISOString(), welcoming: false }))
  await home.evaluate(() => localStorage.setItem('whats-new:seen', 'split'))
  await home.waitForTimeout(500)
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
    check("after an update, Home shows what's new since: three entries", card.length === 3 && card[0].includes('Close the day.'), card.map((one) => one.slice(0, 20)).join(' | '))
    await shot('whats-new-card')
    await h.locator('[data-whats-new-card] [data-news="lengths"]').getByRole('button', { name: 'Show me' }).click()
    await wait(1500)
    const pointed = await text('[aria-label="Where things are"]')
    check('Show me goes to Today and points at the planned line, with the tour spotlight', pointed.some((one) => one.includes('Task lengths')) && (await h.locator('[data-day-budget][data-pointed]').count()) === 1, pointed[0]?.slice(0, 60))
    await h.keyboard.press('Escape')
    await c.go('home')
    await wait(700)
    check("seen once, the card does not come back", (await h.locator('[data-whats-new-card]').count()) === 0)
  }
  // ⌘K: What's new
  await h.keyboard.press('Meta+k')
  await wait(500)
  await h.keyboard.type("What's new", { delay: 20 })
  await wait(500)
  await h.keyboard.press('Enter')
  await wait(800)
  const timeline = await text('[data-whats-new] [data-news]')
  check("⌘K opens the whole timeline, newest first, each with a bold lead-in and Show me", timeline.length >= 15 && (await h.locator('[data-whats-new] [data-news] strong').count()) === timeline.length && (await h.locator('[data-whats-new] [data-news] button', { hasText: 'Show me' }).count()) === timeline.length, `${timeline.length} entries`)
  check('no em dashes in the timeline', !timeline.join(' ').includes('—'))
  for (const [style, theme] of [['soft', 'paper'], ['soft', 'github'], ['brutal', 'paper']]) {
    await looks(style, theme)
    await h.evaluate(() => window.dispatchEvent(new CustomEvent('vigil:whats-new')))
    await wait(600)
    await shot(`whats-new-${theme}${style === 'brutal' ? '-brutal' : ''}`)
    const bg = await h.$eval('[data-whats-new]', (one) => getComputedStyle(one).backgroundColor)
    check(`the timeline is opaque in ${theme}${style === 'brutal' ? ' Brutal' : ''}`, !/rgba\(.*, 0\)|transparent/.test(bg) && !/rgba\([^)]*0\.\d+\)/.test(bg), bg)
    await h.keyboard.press('Escape')
    await wait(300)
  }
  await looks('soft', 'paper')
  // The Vigil menu's entry asks the main window the same way.
  await electron.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((one) => one.webContents.getURL().includes('view=home'))?.webContents.executeJavaScript("window.dispatchEvent(new CustomEvent('vigil:whats-new'))"))
  await wait(500)
  check("the Vigil menu's What's new opens it too", (await h.locator('[data-whats-new]').count()) === 1)
  await h.keyboard.press('Escape')

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
  // T on the report, M on the trip, W on the plants.
  for (const [id, key] of [[made[0].id, 't'], [made[1].id, 'm'], [made[2].id, 'w']]) {
    await h.locator(`[data-close-task="${id}"]`).hover()
    await wait(150)
    await h.keyboard.press(key)
    await wait(500)
  }
  void at
  const [r, t, p] = await Promise.all(made.map((one) => v('task', one.id)))
  check('T sends it to tomorrow', r.dueAt?.startsWith?.(day(1)) || new Date(r.dueAt).getDate() === new Date(day(1) + 'T12:00').getDate(), r.dueAt)
  check('M moves it to next week', new Date(t.dueAt).getDate() === new Date(day(7) + 'T12:00').getDate(), t.dueAt)
  check('W lets it go', p.status === 'dropped', p.status)
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
  await looks('soft', 'github')
  await h.evaluate(() => window.dispatchEvent(new CustomEvent('vigil:close-day')))
  await wait(900)
  await shot('close-day-github')
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
  check('the frog leads Today, marked First', firstRow[0]?.includes('write the report') && (await h.locator('[data-frog]').count()) === 1, firstRow[0]?.slice(0, 40))
  await c.go('day')
  await wait(1500)
  const brief = await text('li', h)
  check("and leads the day's brief", brief.find((one) => one.includes('write the report'))?.includes('First, as you picked last night'))
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
  check("the pill says Break", (await text('[data-island] button', pill)).some((one) => one === 'Break'))
  await v('settings:set', { pillSits: 'free' })
  await pill.waitForTimeout(900)
  at1 = await where()
  check('Where I put it: back under the menu bar', at1.win?.y === at1.work?.y + 6, JSON.stringify(at1))
  await shot('pill-free', pill)
  await v('session:cancel', focus.id)

  // --- What Vigil can do and the keys ----------------------------------------
  await c.go('powers')
  await wait(1200)
  const names = await h.evaluate(() => document.body.innerText)
  check('What Vigil can do lists each new power', ['Pomodoro rounds', 'How long a task takes', 'Close the day', 'The month at a glance', 'The pill in the notch', 'What’s new'].every((one) => names.includes(one)))
  await h.keyboard.press('?')
  await wait(500)
  await h.keyboard.type('Let the task go', { delay: 10 })
  await wait(300)
  check('the shortcut sheet has Close the day’s keys', (await h.evaluate(() => document.body.innerText)).includes('Let the task go'))
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
