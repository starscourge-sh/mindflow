// Practices, end to end on sandbox data: made from the Practices page, quick
// capture's kinds and ⌘K; the clock moved to its time, the offer in the
// bubble and in quick capture with N, S and ↵; the pill's bar at 0, 5, the
// target and twice it (a moved clock), the auto-pause, the log line, "What
// stuck?" making a gem, the honest average, and the move after 5 skips.
//
//   npx electron-vite build --outDir out-practices
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-practices/main/index.js MINDFLOW_QA_AWAY=1 SHOT=<dir> node qa/practices.mjs
import { mkdirSync } from 'fs'
import { sandbox, shiftClock } from './sandbox-lib.mjs'

const SHOT = process.env.SHOT ?? 'scratchpad/practices'
mkdirSync(SHOT, { recursive: true })
const results = []
const check = (name, ok, detail = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`) }
const wait = (ms) => new Promise((done) => setTimeout(done, ms))
const MIN = 60_000
const DAY = 86_400_000

const c = await sandbox({ width: 1200, height: 860 })
const { electron, h, page, v, go } = c
// One clock for the main process, moved to any moment: `at` from the real now.
const realNow = Date.now()
let mainOffset = 0
const mainTo = async (at) => {
  mainOffset = at - Date.now()
  await electron.evaluate((_, [code, by]) => new Function(`(${code})(${by})`)(), [shiftClock.toString(), mainOffset])
}
// A window's clock: the main process's, and `extra` on top (the pill's moved clock).
const windowBy = (win, extra) => win.evaluate(([code, by]) => new Function(`(${code})(${by})`)(), [shiftClock.toString(), mainOffset + extra])
const today = (hh, mm, plusDays = 0) => { const d = new Date(realNow + plusDays * DAY); d.setHours(hh, mm, 0, 0); return d.getTime() }
const idle = (seconds) => electron.evaluate(({ ipcMain }, s) => { ipcMain.removeHandler('idle:seconds'); ipcMain.handle('idle:seconds', () => s) }, seconds)
const pillWindow = async () => {
  for (let i = 0; i < 60; i++) {
    const found = electron.windows().find((one) => one.url().includes('view=focus'))
    if (found) return found
    await wait(200)
  }
  throw new Error('no pill')
}
const shot = (win, name) => win.screenshot({ path: `${SHOT}/${name}.png` }).catch(() => {})

try {
  await idle(0)
  await v('settings:set', { sounds: true, motion: true, countIn: false, focusShows: 'bubble', quietStart: '00:00', quietEnd: '00:00' })

  // --- 1. Made from the Practices page, reached from Tasks.
  await go('today')
  await shot(h, '0-today')
  await h.click('[data-task-lists] button[aria-label="Practices"]')
  await h.waitForTimeout(900)
  check('1. Tasks has a way to Practices', (await h.$('[data-page="practices"]')) !== null)
  await h.click('[data-new-practice]')
  await h.waitForTimeout(400)
  await h.fill('[data-practice-name]', 'Design patterns')
  await h.click('[data-practice-form] button[aria-label="A tag"]')
  await h.fill('[data-practice-form] input[placeholder="design-patterns"]', 'design-patterns')
  await shot(h, '1-form')
  await h.click('[data-practice-save]')
  await h.waitForTimeout(900)
  let list = await v('practices:list')
  const dp = list.find((one) => one.name === 'Design patterns')
  check('1. a practice made: every day at 21:00, 30 min, opens #design-patterns', !!dp && dp.at === '21:00' && dp.targetMin === 30 && dp.days.length === 7 && dp.loadKind === 'tag' && dp.load === 'design-patterns', JSON.stringify(dp))
  check('1. its card says when and what it opens', /Every day at/.test(await h.textContent(`[data-practice-row="${dp?.id}"]`)) && /Opens #design-patterns/.test(await h.textContent(`[data-practice-row="${dp?.id}"]`)))
  await shot(h, '1-page')

  // From quick capture's kinds: ⌘9 is Practice, the words its name, a #tag what it opens.
  await page.evaluate(() => window.api.showPrompt())
  await page.waitForTimeout(900)
  await page.click('.tiptap')
  await page.keyboard.press('Meta+9')
  await page.keyboard.type('Spanish #spanish')
  await page.waitForTimeout(300)
  await page.keyboard.press('Meta+Enter')
  await page.waitForTimeout(1200)
  list = await v('practices:list')
  const es = list.find((one) => one.name === 'Spanish')
  check('1. quick capture’s kind “Practice” makes one', !!es && es.loadKind === 'tag' && es.load === 'spanish', JSON.stringify(es))
  check('1. and no note was kept for it', !(await h.evaluate(() => window.api.captures.find('Spanish'))).some((one) => /^Spanish #spanish/.test(one.label)))
  if (es) await v('practices:bin', es.id)
  // ⌘K in the main window has New practice and Start practice.
  await h.bringToFront()
  await h.keyboard.press('Meta+k')
  await h.waitForTimeout(500)
  await h.keyboard.type('practice')
  await h.waitForTimeout(600)
  await shot(h, '1-cmdk')
  const rows = await h.$$eval('[cmdk-item], [role=option], [data-search-row], li, button', (all) => all.map((one) => one.textContent.trim()).filter((one) => /practice/i.test(one)))
  check('1. ⌘K: “New practice…” and “Start practice: Design patterns”', rows.some((one) => one.includes('New practice')) && rows.some((one) => one.includes('Start practice: Design patterns')), rows.slice(0, 6).join(' | '))
  await h.keyboard.press('Escape')
  await h.waitForTimeout(300)

  // --- 2. The clock moved to its time: offered in the bubble and in quick capture.
  check('2. nothing offered before its time', (await (async () => { await mainTo(today(20, 50)); return v('practices:check') })()) === null)
  await mainTo(today(21, 0) + 20_000)
  const offer = await v('practices:check')
  check('2. at 21:00 it is offered', offer?.id === dp.id, JSON.stringify(offer))
  const pill = await pillWindow()
  pill.on('pageerror', (error) => c.errors.push('PILL PAGEERROR ' + error.message))
  await pill.waitForSelector('[data-practice-offer]', { timeout: 6000 }).catch(() => {})
  const line = await pill.textContent('[data-practice-offer-line]').catch(() => '')
  check('2. one gentle card in the bubble: “21:00 Design patterns, 5 minutes?”', /^(21:00|9:00 PM) Design patterns, 5 minutes\?$/.test(line.trim()), line)
  const keys = await pill.$$eval('[data-practice-offer] kbd', (all) => all.map((one) => one.textContent.trim()))
  check('2. with its keys: ↵ start, N not tonight, S in 30 min', keys.join() === '↵,N,S', keys.join())
  check('2. it did not start anything by itself', (await v('focus:now')) === null)
  await shot(pill, '2-offer-bubble')
  await page.evaluate(() => window.api.showPrompt())
  await page.waitForTimeout(1200)
  check('2. and the same card in quick capture', (await page.$('[data-box-practice] [data-practice-offer]')) !== null)
  await shot(page, '2-offer-box')

  // N in the bubble: gone until tomorrow; Undo brings it back.
  await pill.click('[data-practice-offer-line]')
  await pill.keyboard.press('n')
  await wait(800)
  check('3. N: not tonight, gone', (await v('practices:offer')) === null)
  await v('practices:unanswer', dp.id)
  check('3. its Undo offers it again', (await v('practices:offer'))?.id === dp.id)
  // S in quick capture: asked again in 30 minutes.
  await page.evaluate(() => window.api.showPrompt())
  await page.waitForTimeout(900)
  await page.focus('[data-box-practice] [data-practice-offer]')
  await page.keyboard.press('s')
  await wait(800)
  check('3. S: put off, not offered now', (await v('practices:offer')) === null)
  await mainTo(today(21, 36))
  const again = await v('practices:check')
  check('3. offered again 30 minutes later', again?.id === dp.id && again.later === true)
  // Never during a session, never in quiet hours.
  const other = await v('focus:start', 25 * MIN, 'Something else')
  check('3. never while a session runs', (await v('practices:offer')) === null)
  await v('session:cancel', other)
  await v('settings:set', { quietStart: '21:00', quietEnd: '23:00' })
  check('3. never in quiet hours', (await v('practices:offer')) === null)
  await v('settings:set', { quietStart: '00:00', quietEnd: '00:00' })
  await v('practices:check')
  await pill.waitForSelector('[data-practice-offer]', { timeout: 6000 }).catch(() => {})
  // ↵ in the bubble starts it, and the main window opens on what it loads.
  // A gem on the tag first, so the desk has it.
  await page.evaluate(() => window.api.captures.create({ kind: 'note', body: 'Observer keeps the subject ignorant of who listens #design-patterns' }))
  await v('nugget:from', 'Observer keeps the subject ignorant of who listens #design-patterns', {})
  await pill.click('[data-practice-offer-line]')
  await pill.keyboard.press('Enter')
  await wait(1500)
  const focus = await v('focus:now')
  check('4. ↵ starts it: a practice session, open-ended, nothing planned', focus?.practiceId === dp.id && focus.plannedMs === null && focus.practiceTarget === 30, JSON.stringify(focus))
  await h.waitForSelector('[data-practice-desk]', { timeout: 5000 }).catch(() => {})
  const desk = await h.textContent('[data-practice-desk]').catch(() => '')
  check('4. it opens loaded: the gems on #design-patterns', /Observer keeps the subject/.test(desk), desk.slice(0, 160))
  await shot(h, '4-desk')

  // --- 5. The bar, with the pill's clock moved: 0, 5, the target, twice it.
  await pill.waitForSelector('[data-practice-bar]', { timeout: 5000 }).catch(() => {})
  await windowBy(pill, 0)
  await pill.waitForTimeout(700)
  const bar = async () => pill.$eval('[data-island] [data-practice-bar]', (one) => ({ stage: one.dataset.practiceBar, first: Number(one.dataset.practiceFirst), bonus: Number(one.dataset.practiceBonus), notch: Number(one.dataset.practiceNotch), tick: !!one.querySelector('[data-practice-tick]'), notchMark: !!one.querySelector('[data-practice-notch-mark]'), glow: getComputedStyle(one.querySelector('[data-practice-gold]').parentElement).boxShadow })).catch(() => null)
  const at0 = await bar()
  check('5. at 0: gold just starting, the notch at 5 of 30, no tick', at0?.stage === 'start' && at0.first < 0.02 && Math.abs(at0.notch - 5 / 30) < 0.001 && at0.notchMark && !at0.tick, JSON.stringify(at0))
  await shot(pill, '5-bar-0')
  await windowBy(pill, 5 * MIN + 2000)
  await pill.waitForTimeout(1200)
  const at5 = await bar()
  check('5. at 5: gold to the notch, a quiet tick', at5?.stage === 'min' && Math.abs(at5.first - 5 / 30) < 0.001 && at5.tick, JSON.stringify(at5))
  check('5. no prompt and no sound at 5', (await pill.$('[data-practice-still]')) === null && !(await pill.evaluate(() => [...(window.vigilHeard ?? [])].slice(-3).some((one) => /nudge|alarm|done/.test(one)))))
  await shot(pill, '5-bar-5')
  await windowBy(pill, 30 * MIN + 2000)
  await pill.waitForTimeout(1200)
  const at30 = await bar()
  check('5. at the target: full, the calmer fill after the gold, a soft glow', at30?.stage === 'met' && at30.first + at30.bonus > 0.999 && at30.bonus > 0.8 && at30.glow !== 'none', JSON.stringify(at30))
  check('5. no prompt at the target either', (await pill.$('[data-practice-still]')) === null)
  await pill.hover('[data-island] button >> nth=0')
  await pill.waitForTimeout(800)
  check('5. open, it says so in words too: “Target reached”', /Target reached/.test(await pill.textContent('[data-island]')))
  await shot(pill, '5-bar-30')
  await pill.mouse.move(1, 1)
  await windowBy(pill, 60 * MIN + 2000)
  await pill.waitForTimeout(1500)
  check('5. at twice the target: one gentle ask, “Still going?”', (await pill.$('[data-practice-still]')) !== null && (await pill.$eval('[data-island]', (one) => one.dataset.island)) === 'open')
  await shot(pill, '5-bar-60-still')
  await pill.click('[data-practice-still-yes]')
  await pill.waitForTimeout(600)
  await windowBy(pill, 62 * MIN)
  await pill.waitForTimeout(1200)
  check('5. asked once only', (await pill.$('[data-practice-still]')) === null)

  // --- 6. Nobody at the Mac: it pauses from when they left, and goes on once back.
  await windowBy(pill, 0)
  await idle(240)
  await pill.waitForTimeout(6500)
  const held = await v('focus:now')
  check('6. idle a few minutes: paused, from when you left (never before it began)', !!held?.pausedAt && Date.parse(held.pausedAt) >= Date.parse(held.startedAt) && Date.parse(held.pausedAt) <= Date.now() + mainOffset - 1000, `${held?.startedAt} → ${held?.pausedAt}`)
  await idle(0)
  await pill.waitForTimeout(6500)
  check('6. back at the Mac: running again', !(await v('focus:now'))?.pausedAt)

  // --- 7. Stopped at 14 minutes (the clock moved on): the log line, then What stuck? makes a gem.
  const back = await v('focus:now')
  await mainTo(Date.parse(back.startedAt) + back.pausedMs + 14 * MIN + 20_000)
  await windowBy(pill, 0)
  await pill.hover('[data-island] button >> nth=0')
  await pill.waitForTimeout(700)
  await pill.click('[data-island-panel] button:has-text("Stop")')
  await pill.waitForTimeout(1200)
  const log = await v('session-log', focus.id)
  check('7. a log line written: “practice:: design patterns, 14 min”', log.some((one) => one.text === 'practice:: design patterns, 14 min'), log.map((one) => one.text).join(' | '))
  check('7. no “End early?” asked: every minute counts', (await pill.$('[data-stop-ask]')) === null)
  const ended = await pill.$eval('[data-practice-ended]', (one) => ({ stage: one.dataset.practiceEnded, text: one.textContent })).catch(() => null)
  check('7. it ends complete, the tick kept', ended?.stage === 'complete' && /14 min/.test(ended.text), JSON.stringify(ended))
  await shot(pill, '7-what-stuck')
  await pill.fill('[data-what-stuck-field]', 'Strategy swaps the algorithm, not the object')
  await pill.press('[data-what-stuck-field]', 'Enter')
  await pill.waitForTimeout(900)
  const loaded = await v('practices:load', dp.id)
  check('7. “What stuck?” answered: a gem on #design-patterns', loaded.gems.some((one) => one.title.startsWith('Strategy swaps the algorithm')), loaded.gems.map((one) => one.title).join(' | '))
  check('7. and last time’s note for the next session', loaded.lastNote === 'Strategy swaps the algorithm, not the object')
  await shot(pill, '7-kept')

  // --- 8. The honest record: three more sessions over the last weeks, real minutes.
  for (const [ago, minutes] of [[20, 25], [15, 24], [9, 25]]) {
    await mainTo(today(21, 2, -ago))
    const id = await v('practices:start', dp.id)
    await mainTo(today(21, 2, -ago) + minutes * MIN)
    await v('practices:end', id)
  }
  await mainTo(today(21, 40))
  list = await v('practices:list')
  const honest = list.find((one) => one.id === dp.id)?.honest
  check('8. after a few weeks: planned 30, averaging 22', honest?.planned === 30 && honest?.average === 22, JSON.stringify(honest))
  await go('practices')
  await h.waitForTimeout(800)
  check('8. said on the practice', /planned 30, averaging 22/.test(await h.textContent(`[data-practice-row="${dp.id}"]`)))
  await shot(h, '8-honest')
  await go('stats')
  await h.waitForTimeout(1200)
  check('8. and in Stats', /Design patterns: planned 30, averaging 22/.test(await h.textContent(`[data-stats-practice="${dp.id}"]`).catch(() => '')))

  // --- 9. Declined 5 times at 21:00: a time you are usually about is suggested, and moved to with a click.
  for (let day = 1; day <= 6; day++) {
    // Writing in the mornings at 7, all week.
    await mainTo(today(7, 10, day))
    for (let n = 0; n < 8; n++) await page.evaluate((k) => window.api.captures.create({ kind: 'note', body: `Morning line ${k}` }), `${day}.${n}`)
  }
  for (let day = 1; day <= 5; day++) {
    await mainTo(today(21, 1, day))
    const one = await v('practices:check')
    if (one?.id === dp.id) await v('practices:answer', dp.id, 'skip')
  }
  await mainTo(today(21, 1, 6))
  const sixth = await v('practices:check')
  check('9. after 5 skips the offer suggests a better time', sixth?.suggest?.to === '07:00' && sixth.suggest.part === 'Mornings', JSON.stringify(sixth?.suggest))
  await pill.waitForSelector('[data-practice-suggest]', { timeout: 6000 }).catch(() => {})
  const said = await pill.textContent('[data-practice-suggest]').catch(() => '')
  check('9. “You keep skipping 9pm. Mornings at 7 seem to work for you. Move it?”', /You keep skipping (21:00|9pm)\. Mornings at 7 seem to work for you\. Move it\?/.test(said), said)
  await shot(pill, '9-move-it')
  await pill.click('[data-practice-move]')
  await pill.waitForTimeout(800)
  check('9. Move it: now at 07:00', (await v('practices:list')).find((one) => one.id === dp.id)?.at === '07:00')

  // --- 10. The Bin: removed with Undo, and listed in the Bin.
  await mainTo(Date.now())
  await v('practices:bin', dp.id)
  check('10. a practice removed goes to the Bin', (await v('bin:list')).some((one) => one.type === 'practice' && one.id === dp.id))
  await v('bin:restore', 'practice', dp.id)
  check('10. and back out of it', (await v('practices:list')).some((one) => one.id === dp.id))

  // Paper and dark at both sizes: the page has no clipped or squeezed rows.
  for (const [w, hh] of [[900, 700], [1600, 1000]]) {
    await c.size(w, hh)
    await go('practices')
    await h.waitForTimeout(700)
    const over = await h.evaluate(() => [...document.querySelectorAll('[data-page="practices"] *')].filter((one) => one.scrollWidth > one.clientWidth + 1 && getComputedStyle(one).overflowX === 'visible' && one.clientWidth > 0).length)
    check(`11. Practices at ${w}x${hh}: nothing spills out`, over === 0, String(over))
    await shot(h, `11-${w}`)
  }
  await c.theme('dark')
  await go('practices')
  await h.waitForTimeout(700)
  await shot(h, '11-dark')
  await windowBy(pill, 0)
  await v('practices:start', dp.id)
  await h.evaluate(() => window.api.showFocus(true))
  await pill.waitForTimeout(2500)
  await pill.hover('[data-island] button >> nth=0').catch(() => {})
  await pill.waitForTimeout(800)
  await shot(pill, '11-dark-pill')
  await c.theme('paper')
  check('no page errors', !c.errors.length, c.errors.slice(0, 3).join(' | '))
} catch (error) {
  console.log('ERROR', error.stack)
  results.push(false)
} finally {
  await c.close()
}
const failed = results.filter((one) => !one).length
console.log(failed ? `${failed} FAILED of ${results.length}` : `all ${results.length} passed`)
process.exit(failed ? 1 : 0)
