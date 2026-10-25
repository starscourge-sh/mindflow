// Haligtree's own nudge card and a break's arrival: a task due now asks with
// Done, In 10 min and Open, and asks once more if left; the daily review asks
// with Review now and In an hour; a session that ended while away is said by
// the card when the time is kept in the note; a break arrives with sparks, a
// spring and the cup popping in; under the notch a break glows mint.
//
//   npx electron-vite build --outDir out-pill
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-pill/main/index.js HALIGTREE_QA_AWAY=1 HALIGTREE_QA_NOTCH=1 SHOT=<dir> node qa/nudge-card.mjs
import { mkdirSync } from 'fs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const SHOT = process.env.SHOT ?? 'scratchpad/nudge'
mkdirSync(SHOT, { recursive: true })
const results = []
const check = (name, ok, detail = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`) }
const wait = (ms) => new Promise((done) => setTimeout(done, ms))

const c = await sandbox({ width: 1100, height: 900 })
const { electron, h, v } = c
const windowOf = async (part) => {
  for (let i = 0; i < 50; i++) {
    const found = electron.windows().find((one) => one.url().includes(part))
    if (found) return found
    await wait(200)
  }
  return null
}
const idle = (seconds) => electron.evaluate(({ ipcMain }, s) => { ipcMain.removeHandler('idle:seconds'); ipcMain.handle('idle:seconds', () => s) }, seconds)
const hhmm = (ms) => new Date(ms).toTimeString().slice(0, 5)

try {
  await idle(0)
  await v('settings:set', { sounds: true, motion: true, countIn: false, focusShows: 'bubble', notify: 'alerts', quietStart: '00:00', quietEnd: '00:00' })

  // --- A task due now.
  const made = await v('task:add', 'Call the dentist back')
  const id = made?.id ?? made
  await v('task:save', id, { due: new Date(Date.now() - 2 * 60000).toISOString() })
  await v('alerts:check')
  const card = await windowOf('view=nudge')
  check('a task due now brings Haligtree’s own card', !!card)
  // The sandbox has its own task due at 10am, so look only for this probe's tasks.
  const mine = (title) => card.evaluate((t) => [...document.querySelectorAll('[data-nudge="task"]')].some((one) => one.textContent.includes(t)), title)
  card.on('pageerror', (error) => c.errors.push('NUDGE ' + error.message))
  await card.waitForTimeout(900)
  const said = await card.$eval('[data-nudge="task"]', (one) => one.textContent).catch(() => '')
  check('it says “Due now” and the task', said.includes('Due now') && said.includes('Call the dentist'), said)
  check('with Done, In 10 min and Open', ['Done', 'In 10 min', 'Open'].every((one) => said.includes(one)))
  check('and its sound', (await card.evaluate(() => [...(window.haligtreeHeard ?? [])])).includes('cue:hint'))
  for (const theme of ['light', 'dark']) {
    await h.evaluate((t) => localStorage.setItem('theme', t), theme)
    await card.evaluate(() => window.dispatchEvent(new StorageEvent('storage', { key: 'theme' })))
    await card.waitForTimeout(500)
    await card.screenshot({ path: `${SHOT}/task-due-${theme}.png` })
  }
  await card.click('[data-nudge-later]')
  await card.waitForTimeout(700)
  check('“In 10 min” puts the card away', !(await mine('Call the dentist')), await card.evaluate(() => [...document.querySelectorAll('[data-nudge]')].map((one) => one.textContent).join(' | ')))
  // Asked again: “In 10 min” is at least a minute, so wait it out.
  await v('alert:later', id, 0)
  await wait(62000)
  await v('alerts:check')
  await card.waitForTimeout(900)
  const again = await card.$eval('[data-nudge="task"]', (one) => one.textContent).catch(() => '')
  check('left, it asks once more: “Still due”', again.includes('Still due'), again)
  await card.screenshot({ path: `${SHOT}/task-still-due.png` })
  await card.click('[data-nudge-done]')
  await card.waitForTimeout(700)
  check('“Done” finishes the task', (await v('task', id))?.status === 'done')
  await v('alerts:check')
  await card.waitForTimeout(500)
  check('and it is not asked about again', !(await mine('Call the dentist')))

  // --- The daily review.
  await v('settings:set', { reviewReminder: hhmm(Date.now() - 60000) })
  await v('alerts:check')
  await card.waitForTimeout(900)
  const review = await card.$eval('[data-nudge="review"]', (one) => one.textContent).catch(() => '')
  check('the review reminder is a card too, with Review now and In an hour', review.includes('Time to review') && review.includes('Review now') && review.includes('In an hour'), review)
  await card.screenshot({ path: `${SHOT}/review.png` })
  await card.click('[data-nudge-later]')
  await card.waitForTimeout(700)
  check('“In an hour” puts it away', !(await card.$('[data-nudge="review"]')))

  // --- Ended while away, with the time kept in the note: the card says it.
  await v('settings:set', { focusShows: 'note' })
  const tasks = await v('tasks')
  const task = tasks.find((one) => one.status === 'open' && one.title)
  const session = await v('session:start', task.id, 'Read the paper', null)
  await h.evaluate(() => window.api.showFocus(true))
  await wait(2500)
  await idle(50 * 60)
  await wait(33000)
  await idle(0)
  const away = await card.$eval('[data-nudge="away"]', (one) => one.textContent).catch(() => '')
  check('ended while away, with no bubble: the card says so', away.includes('ended') && away.includes('while you were away'), away)
  check('with Go again and Keep going', away.includes('Go again') && away.includes('Keep going'))
  await card.screenshot({ path: `${SHOT}/away-note.png` })
  await v('session:cancel', session).catch(() => {})
  await v('settings:set', { focusShows: 'bubble' })

  // --- A break arriving: sparks, a spring, the cup popping in. The sparks
  // are drawn on the screen's glow layer, so they fly out past the pill; the
  // frame mid-burst is put together here: the pill's picture under the sparks.
  const pill = await windowOf('view=focus')
  const burst = async (name, startBreak) => {
    await startBreak()
    const glow = await windowOf('view=glow')
    let at = null
    for (let i = 0; i < 40 && !at; i++) {
      at = await glow.$eval('[data-sparks]', (one) => ({ x: parseFloat(one.style.left), y: parseFloat(one.style.top) })).catch(() => null)
      if (!at) await wait(15)
    }
    if (!at) return false
    await wait(300)
    await glow.evaluate(() => document.getAnimations().forEach((one) => one.pause()))
    const shot = (await pill.screenshot()).toString('base64')
    const tucked = name.includes('notch')
    await glow.evaluate(([src, x, y, dark]) => {
      document.body.style.background = dark ? '#2b2b2e' : '#eceae4'
      const img = document.createElement('img')
      img.src = `data:image/png;base64,${src}`
      img.dataset.qa = ''
      Object.assign(img.style, { position: 'fixed', left: `${x}px`, top: `${y}px`, width: '340px', zIndex: '-1' })
      document.body.append(img)
    }, [shot, at.x - (tucked ? 31 : 27), at.y - (tucked ? at.y : 29), name.includes('dark') || tucked])
    await glow.waitForTimeout(150)
    await glow.screenshot({ path: `${SHOT}/arrive-${name}.png`, clip: { x: Math.max(0, at.x - 200), y: Math.max(0, at.y - (tucked ? at.y : 110)), width: 520, height: 260 } })
    await glow.evaluate(() => (document.querySelectorAll('[data-qa]').forEach((one) => one.remove()), (document.body.style.background = 'transparent')))
    return true
  }
  const work = async () => {
    const id = await v('session:start', task.id, 'Draft the intro', 25 * 60000)
    await h.evaluate(() => window.api.showFocus(true))
    await pill.waitForTimeout(3000)
    await v('break:start', id, 5 * 60000)
  }
  for (const theme of ['light', 'dark']) {
    await h.evaluate((t) => localStorage.setItem('theme', t), theme)
    await pill.reload()
    await pill.waitForTimeout(1200)
    check(`a break arrives with sparks that leave the pill (${theme})`, await burst(theme, work))
    if (theme === 'light') {
      check('and says something warmer than “Break time”', (await pill.$eval('[data-break-line]', (one) => one.textContent).catch(() => '')) === 'Off the clock for a bit')
      await pill.waitForTimeout(1600)
      const glow = await windowOf('view=glow')
      check('the sparks are gone after, calm', !(await glow.$('[data-sparks]')))
      await pill.hover('[data-island] button >> nth=0')
      await pill.waitForTimeout(800)
      const buttons = await pill.$$eval('[data-island-panel] button', (all) => all.map((one) => one.textContent.trim()).filter(Boolean))
      check('a break offers one clear pair: “+10 min” and “Back to work”', buttons.join('|') === '+10 min|Back to work', buttons.join(' | '))
      await pill.screenshot({ path: `${SHOT}/break-open.png` })
      await pill.mouse.move(1, 1)
    }
    await v('session:cancel', (await v('focus:now')).id)
    await pill.waitForTimeout(1500)
  }

  // --- Under the notch, a break glows mint from its lower edge, and its sparks burst from the notch.
  if (process.env.HALIGTREE_QA_NOTCH) {
    await v('settings:set', { pillSits: 'notch' })
    await pill.waitForTimeout(800)
    check('under the notch, sparks too', await burst('notch', async () => {
      const id = await v('session:start', task.id, 'Draft the intro', 25 * 60000)
      await h.evaluate(() => window.api.showFocus(true))
      await pill.waitForTimeout(3000)
      await v('break:start', id, 5 * 60000)
    }))
    await pill.waitForTimeout(3000)
    check('under the notch, a break has its own glow', !!(await pill.$('[data-notch-break]')))
    await pill.screenshot({ path: `${SHOT}/notch-break.png` })
    await v('session:cancel', (await v('focus:now')).id)
    await v('settings:set', { pillSits: 'free' })
  }

  // --- One alert for one thing: with the screen locked no card can be seen, so only then the Mac's notification.
  await electron.evaluate(({ powerMonitor }) => powerMonitor.emit('lock-screen'))
  const locked = await v('task:add', 'Water the plants')
  await v('task:save', locked.id ?? locked, { due: new Date(Date.now() - 60000).toISOString() })
  await v('alerts:check')
  await card.waitForTimeout(700)
  check('screen locked: no card (the Mac notification goes instead)', !(await mine('Water the plants')))
  await electron.evaluate(({ powerMonitor }) => powerMonitor.emit('unlock-screen'))
  check('no errors', c.errors.length === 0, c.errors.slice(0, 3).join(' / '))
} catch (error) {
  console.log('FAIL  the run stopped:', error.message)
  results.push(false)
} finally {
  console.log(`${results.filter(Boolean).length}/${results.length} passed`)
  await c.close()
  process.exit(results.every(Boolean) ? 0 : 1)
}
