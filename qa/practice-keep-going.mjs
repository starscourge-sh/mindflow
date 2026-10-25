// "Practise it": "Keep going?" once the 5 minutes are up (never a stop), the
// honest record ("Planned 30 a day, averaging 20 over the last 4 days") on the
// task, and the fixes from walking the whole flow: the line in the task's log,
// a routine with no time offered at 9pm, a routine put off not offered, moving
// to a suggested time moves the task, and the sandbox's own practice.
//
//   npx electron-vite build --outDir out-x
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/practice-keep-going.mjs
import { sandbox, shiftClock } from './sandbox-lib.mjs'
import { checks } from './harness.mjs'
process.env.QA_ARGS ??= '--sandbox'

const MIN = 60_000
const { check, done } = checks()
const s = await sandbox({ width: 1200, height: 860 })
const { h, v, send, electron, errors } = s
const mainBy = (by) => electron.evaluate((_, [code, n]) => new Function(`(${code})(${n})`)(), [shiftClock.toString(), by])
const windowBy = (win, by) => win.evaluate(([code, n]) => new Function(`(${code})(${n})`)(), [shiftClock.toString(), by])
const pillWindow = async () => {
  for (let i = 0; i < 50; i++) {
    const found = electron.windows().find((one) => one.url().includes('view=focus'))
    if (found) return found
    await h.waitForTimeout(200)
  }
  throw new Error('no pill')
}
try {
  for (let i = 0; i < 60 && (await h.evaluate(() => document.body.innerText.includes('Setting out the examples'))); i++) await h.waitForTimeout(500)
  await v('settings:set', { sounds: true, countIn: false, focusShows: 'bubble', quietStart: '00:00', quietEnd: '00:00' })

  // 0. The sandbox has one practice to try: the reading routine, at 9pm, on #reading.
  const all = await v('practices:list')
  const reading = all.find((one) => /read twenty pages/i.test(one.name))
  check('0. the sandbox has a practice set up', !!reading && reading.loadKind === 'tag' && reading.load === 'reading' && reading.targetMin === 30, JSON.stringify(all))
  check('0. a routine with no time of day is offered at 9pm, not midnight', reading?.at === '21:00', reading?.at)

  const made = await v('task:add', 'Spanish every day at 7:30')
  const id = made?.id ?? made
  const on = await v('practices:set', id, { on: true, targetMin: 30 })

  // 1. Made-up past sessions: 20, 30 and 10 minutes, one, two and three days ago.
  for (const [back, minutes] of [[3, 10], [2, 30], [1, 20]]) {
    const at = new Date()
    at.setDate(at.getDate() - back)
    at.setHours(7, 31, 0, 0)
    await mainBy(at.getTime() - Date.now())
    const session = await v('practices:start', on.id)
    await mainBy(at.getTime() + minutes * MIN - Date.now())
    await v('practices:end', session)
  }
  await mainBy(0)
  const sw = await v('practices:of-task', id)
  // Days since the first: 4 (today and the 3 before); today not done yet, so 3 counted: 60 / 3 = 20.
  check('1. the record: planned 30, averaging 20 over 4 days', sw.honest?.planned === 30 && sw.honest.average === 20 && sw.honest.days === 4, JSON.stringify(sw.honest))
  await send('task', id)
  await h.waitForSelector('[data-practice-honest]', { timeout: 6000 }).catch(() => {})
  const said = await h.textContent('[data-practice-honest]').catch(() => '')
  check('1. said on the task in plain words', said === 'Planned 30 a day, averaging 20 over the last 4 days', said)
  const size = await h.$eval('[data-practice-honest]', (one) => parseFloat(getComputedStyle(one).fontSize)).catch(() => 0)
  check('1. large enough to read (13px or more)', size >= 13, String(size))
  const log = await v('session-log:task', id)
  check('1. the log lines are in the task\'s own log', log.filter((one) => /^practice:: spanish, \d+ min$/.test(one.text)).length === 3, JSON.stringify(log.map((one) => one.text)))

  // 2. Keep going: at 5 minutes it asks, never stops; left alone it keeps running; ↵ carries on.
  const first = await v('practices:start', on.id)
  await h.evaluate(() => window.api.showFocus(true))
  const pill = await pillWindow()
  pill.on('pageerror', (error) => errors.push('PILL PAGEERROR ' + error.message))
  await pill.waitForSelector('[data-practice-bar]', { timeout: 6000 }).catch(() => {})
  check('2. no ask before the 5', (await pill.$('[data-practice-five]')) === null)
  await mainBy(7 * MIN)
  await windowBy(pill, 7 * MIN)
  await pill.waitForSelector('[data-practice-five]', { timeout: 4000 }).catch(() => {})
  const ask = await pill.textContent('[data-practice-five]').catch(() => '')
  check('2. at 5 it asks: keep going to the target, or stop', /5 minutes done\. Keep going to 30\?/.test(ask) && /Stop here/.test(ask) && /Keep going/.test(ask), ask)
  check('2. says what happens if left alone', /keeps running/.test(ask), ask)
  const saidH = await pill.evaluate(() => Math.round(document.querySelector('[data-practice-five-said]')?.getBoundingClientRect().height ?? 0))
  check('2. and says it on one line, not squeezed beside the buttons', saidH > 0 && saidH <= 20, `${saidH}px`)
  if (process.env.SHOT) await pill.screenshot({ path: `${process.env.SHOT}/keep-going.png` }).catch(() => {})
  await pill.waitForTimeout(2500)
  check('2. left alone, the session keeps running', (await v('focus:now'))?.id === first)
  await pill.keyboard.press('Enter')
  await pill.waitForTimeout(600)
  check('2. ↵ keeps going: the ask goes, the session runs on', (await pill.$('[data-practice-five]')) === null && (await v('focus:now'))?.id === first)

  // 3. Stop here: ended at the real minutes, and "What stuck?" asks next.
  const second = await v('practices:start', on.id)
  // Starting a practice ends the running one and writes its log line at once, not at the next half-minute look.
  check('3. the practice it ended has its log line at once', (await v('session-log:task', id)).filter((one) => /^practice:: spanish, \d+ min$/.test(one.text)).length === 4)
  await v('practices:check')
  await mainBy(19 * MIN)
  await windowBy(pill, 19 * MIN)
  await pill.waitForSelector('[data-practice-five]', { timeout: 4000 }).catch(() => {})
  check('3. a new session asks again at 5', !!(await pill.$('[data-practice-five]')))
  await pill.keyboard.press('s')
  await pill.waitForSelector('[data-what-stuck-field]', { timeout: 4000 }).catch(() => {})
  check('3. S stops there and asks "What stuck?"', !!(await pill.$('[data-what-stuck-field]')) && (await v('focus:now')) === null)
  const lines = (await v('session-log:task', id)).map((one) => one.text)
  check('3. the real minutes are logged', lines.includes('practice:: spanish, 12 min') && lines.includes('practice:: spanish, 7 min'), JSON.stringify(lines))
  await pill.fill('[data-what-stuck-field]', 'estar is for how something is')
  await pill.keyboard.press('Enter')
  await pill.waitForTimeout(800)
  check('3. what stuck is kept', (await v('practices:of-task', id)).lastNote === 'estar is for how something is')
  void second
  await mainBy(0)
  await windowBy(pill, 0)

  // 4. Put off to a later day: not offered. Moved to a suggested time: the task moves too.
  const later = new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10)
  await v('task:save', reading.taskId ?? (await v('tasks')).find((one) => /read twenty pages/i.test(one.title)).id, { snoozedUntil: later })
  check('4. a routine put off to a later day is not a practice now', !(await v('practices:list')).some((one) => one.id === reading.id))
  await v('practices:move', on.id, '18:00')
  const task = await v('task', id)
  const due = new Date(task.dueAt)
  check('4. moving to a suggested time moves the task', due.getHours() === 18 && due.getMinutes() === 0 && (await v('practices:list')).find((one) => one.id === on.id)?.at === '18:00', task.dueAt)
  check('no page errors', errors.length === 0, errors.join(' | '))
  // 5. Joined to the task: its ended practice sessions count in the task's Sessions, and the log has no second line for them.
  const sessions = await v('sessions', id)
  check('5. the task\'s Sessions list holds its practice sessions, marked', sessions.filter((one) => one.practice === 1).length >= 4, JSON.stringify(sessions.map((one) => one.practice)))
  // 6. Never over the welcome: while it is open no offer is made; after it closes, the same offer as before.
  const before = JSON.stringify(await v('practices:check'))
  await v('onboarding:set', { welcoming: true })
  check('6. no offer while the welcome is open', (await v('practices:check')) === null)
  await v('onboarding:set', { welcoming: false })
  check('6. after it, the offer as before', JSON.stringify(await v('practices:check')) === before, before)
} finally {
  await s.close()
}
done()
