// The session clock, the sandbox's lightsaber, the pill's gleam and smoke,
// and the tag lists' icons, in the sandbox.
//
//   npx electron-vite build --outDir out-sounds
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-sounds/main/index.js SHOT=<dir> node qa/sounds.mjs
//
// Sounds are read back from the page's own list of recordings played
// (window.vigilHeard), so a sound that fires, and one that must not, both show.
import { mkdirSync } from 'fs'
import { sandbox } from './sandbox-lib.mjs'

const SHOT = process.env.SHOT ?? 'scratchpad/tagsound'
mkdirSync(SHOT, { recursive: true })
const results = []
const check = (name, ok, detail = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`) }
const wait = (ms) => new Promise((done) => setTimeout(done, ms))

const c = await sandbox({ width: 1100, height: 1000 })
const { electron, h, v } = c
try {
  // --- Tag lists: one tag with a colour, the rest grey, light and dark.
  const tags = await v('tags')
  const named = tags.slice(0, 3).map((one) => one.tag)
  await v('tag:set', named[0], { color: 'red' })
  await v('tag:set', named[1], { color: 'blue' })
  for (const one of named.slice(2)) await v('tag:set', one, { color: null })
  await h.evaluate(() => localStorage.setItem('sidebar:tags', 'open'))
  for (const theme of ['light', 'dark']) {
    await c.theme(theme)
    await c.go('tags')
    await h.waitForTimeout(1200)
    await h.screenshot({ path: `${SHOT}/tags-${theme}.png` })
    const icons = await h.$$eval('svg.lucide-tag', (all) => all.map((one) => getComputedStyle(one).color))
    check(`tag icons drawn in ${theme}`, icons.length >= 3, `${icons.length} icons, ${[...new Set(icons)].length} colours`)
  }

  // --- The session clock, in the pill's own window.
  const pillWindow = async () => {
    for (let i = 0; i < 50; i++) {
      const found = electron.windows().find((one) => one.url().includes('view=focus'))
      if (found) return found
      await wait(200)
    }
    throw new Error('no pill')
  }
  const heard = (pill) => pill.evaluate(() => [...(window.vigilHeard ?? [])])
  const start = async (goal, ms) => {
    const id = await v('timer:start', goal, ms)
    await h.evaluate(() => window.api.showFocus(true))
    return id
  }
  await v('settings:set', { sounds: true, volume: 1, sessionTick: true, sessionTickVolume: 0.5 })
  // Nobody is away during the run: the gleam's idle check answers "just now".
  await electron.evaluate(({ ipcMain }) => { ipcMain.removeHandler('idle:seconds'); ipcMain.handle('idle:seconds', () => 0) })
  // The pill's window is made with the first session: a warm-up one first, so
  // the timings below count from a pill already listening.
  let id = await start('Warm up', 60000)
  const pill = await pillWindow()
  await pill.waitForLoadState('domcontentloaded')
  await pill.waitForTimeout(2500)
  await v('session:cancel', id)
  await pill.waitForTimeout(800)
  id = await start('Tick test', 16000)
  await pill.waitForTimeout(1800)
  let log = await heard(pill)
  check('ticking starts with the session', log.some((one) => one.startsWith('clock-tick')), log.join(' '))
  await v('session:pause', id)
  await pill.waitForTimeout(1200)
  log = await heard(pill)
  check('pausing stops the ticking', log.at(-1) === 'clock-stop', log.join(' '))
  await v('session:resume', id)
  await pill.waitForTimeout(7000)
  log = await heard(pill)
  check('the last ten seconds tick tense', log.includes('clock-tense'), log.join(' '))
  await pill.waitForTimeout(8000)
  log = await heard(pill)
  check('time up rings the alarm', log.includes('clock-alarm'), log.join(' '))
  await v('session:cancel', id)

  // The tick chosen in Settings is the one a session plays.
  await v('settings:set', { sessionTickSound: 'watch' })
  await pill.waitForTimeout(800)
  let before = (await heard(pill)).length
  id = await start('Pocket watch', 60000)
  await pill.waitForTimeout(1500)
  log = (await heard(pill)).slice(before)
  check('a session plays the tick chosen in Settings', log.includes('clock-tick watch'), log.join(' '))
  await v('session:cancel', id)
  await v('settings:set', { sessionTickSound: 'old' })

  // Ticking off: no tick at all, the last ten seconds included.
  await v('settings:set', { sessionTick: false })
  await pill.waitForTimeout(2500)
  before = (await heard(pill)).length
  id = await start('No tick', 12000)
  await pill.waitForTimeout(1500)
  log = (await heard(pill)).slice(before)
  check('with ticking off, no tick', !log.some((one) => one.startsWith('clock-tick')), log.join(' '))
  await pill.waitForTimeout(2500)
  log = (await heard(pill)).slice(before)
  check('with ticking off, the last ten seconds are silent too', !log.includes('clock-tense') && !log.some((one) => one.startsWith('clock-tick')), log.join(' '))
  await v('session:cancel', id)

  // Sounds off: nothing at all, start to alarm.
  await v('settings:set', { sounds: false, sessionTick: true })
  await pill.waitForTimeout(600)
  before = (await heard(pill)).length
  id = await start('Silent', 11500)
  await pill.waitForTimeout(13000)
  log = (await heard(pill)).slice(before)
  check('with Sounds off, the clock makes no sound', log.length === 0, log.join(' '))
  await v('session:cancel', id)

  // Safe mode: no ticking.
  await v('settings:set', { sounds: true, safeMode: true })
  await pill.waitForTimeout(600)
  before = (await heard(pill)).length
  id = await start('Safe', 30000)
  await pill.waitForTimeout(2000)
  log = (await heard(pill)).slice(before)
  check('in safe mode, no ticking', !log.some((one) => one.startsWith('clock-tick')), log.join(' '))
  await v('session:cancel', id)
  await v('settings:set', { safeMode: false, sessionTick: false })

  // --- The smoke: idle, under the pointer, and past the time; and what it costs.
  const cdp = await pill.context().newCDPSession(pill)
  await cdp.send('Performance.enable')
  const busy = async () => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((one) => [one.name, one.value])).TaskDuration
  // The page's own work only, nothing driving frames from here: busy ms a
  // second, and per frame at 60fps.
  const cost = async () => {
    const t0 = await busy()
    await pill.waitForTimeout(5000)
    const spent = ((await busy()) - t0) * 1000 / 5
    return { perFrame: spent / 60, fps: 60 }
  }
  for (const theme of ['light', 'dark']) {
    await h.evaluate((t) => localStorage.setItem('theme', t), theme)
    id = await start('Write the chapter', 45000)
    await pill.reload()
    await pill.waitForTimeout(2500)
    await pill.screenshot({ path: `${SHOT}/smoke-idle-${theme}.png` })
    if (theme === 'dark') {
      const on = await cost()
      await v('settings:set', { sessionSmoke: false })
      await pill.waitForTimeout(9000)
      const off = await cost()
      await v('settings:set', { sessionSmoke: true })
      // The beam runs its own loop at 30fps: what the smoke adds, per frame of that loop.
      check('the smoke at rest adds under 3ms a 30fps frame', (on.perFrame - off.perFrame) * 2 < 3, `busy ms a second: smoke on ${(on.perFrame * 60).toFixed(0)}, off ${(off.perFrame * 60).toFixed(0)}`)
    }
    // The gleam: within the last minute, one every 15 seconds.
    let shot = 0
    const gleams = () => pill.$eval('[data-gleams]', (one) => Number(one.dataset.gleams))
    const seen = await gleams()
    for (let i = 0; i < 500 && shot < 3; i++) {
      if ((await gleams()) > seen) {
        for (const at of [120, 330, 540]) {
          await pill.waitForTimeout(at === 120 ? 120 : 210)
          await pill.screenshot({ path: `${SHOT}/gleam-${theme}-${shot++}.png` })
        }
      } else await pill.waitForTimeout(40)
    }
    check(`a gleam crosses the pill in ${theme}`, shot === 3)
    await pill.hover('button >> nth=0')
    await pill.waitForTimeout(500)
    await pill.screenshot({ path: `${SHOT}/smoke-hover-${theme}.png` })
    await pill.mouse.move(2, 2)
    for (let i = 0; i < 120 && !(await pill.evaluate(() => document.body.textContent.includes("Time's up"))); i++) await pill.waitForTimeout(500)
    await pill.waitForTimeout(1500)
    await pill.screenshot({ path: `${SHOT}/smoke-over-${theme}.png` })
    await v('session:cancel', id)
    await pill.waitForTimeout(800)
  }

  // --- Writing opened: a page turned; a quick run of them, only the first.
  const writing = await v('items', 'article')
  const said = async () => h.evaluate(() => (window.vigilHeard ?? []).filter((one) => one === 'page-turn').length)
  const pages = await said()
  await c.send('article', writing[0].id)
  await h.waitForTimeout(1200)
  const once = await said()
  check('opening a piece of writing turns a page', once === pages + 1, `${once - pages}`)
  if (writing.length > 2) {
    await c.send('article', writing[1].id)
    await h.waitForTimeout(150)
    await c.send('article', writing[2].id)
    await h.waitForTimeout(1200)
    check('stepping quickly turns no more than one page', (await said()) - once <= 1, `${(await said()) - once}`)
  }
  // --- A gem, an Inbox note and a question opened turn a page too.
  for (const [type, table] of [['nugget', 'nugget'], ['capture', null], ['question', 'question']]) {
    const one = table ? (await v('items', table))[0] : (await h.evaluate(() => window.api.captures.list()))[0]
    if (!one) continue
    await h.waitForTimeout(500)
    const was = await said()
    await c.send(type, one.id)
    await h.waitForTimeout(1200)
    check(`opening a ${type === 'nugget' ? 'gem' : type} turns a page`, (await said()) === was + 1, `${(await said()) - was}`)
  }
  // --- The paper sounds: each read back by name, a moment apart.
  const count = (name) => h.evaluate((n) => (window.vigilHeard ?? []).filter((one) => one === n).length, name)
  // The visible one: a list keeps a copy of some buttons out of sight.
  const press = (label) => h.evaluate((l) => [...document.querySelectorAll('button')].find((one) => (one.getAttribute('aria-label') === l || one.textContent.trim() === l) && one.offsetParent)?.click(), label)
  const fired = async (name, act, wait = 1200) => {
    const was = await count(name)
    await act()
    await h.waitForTimeout(wait)
    return (await count(name)) - was
  }
  await c.send('article', writing[0].id)
  await h.waitForTimeout(1200)
  await h.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur())
  let n = await fired('page-leaf', () => h.keyboard.press('ArrowDown'))
  check('↓ to the next piece of writing turns a lighter page', n === 1, `${n}`)
  n = await fired('page-leaf', async () => { for (let i = 0; i < 3; i++) { await h.keyboard.press(i % 2 ? 'ArrowDown' : 'ArrowUp'); await h.waitForTimeout(60) } })
  check('stepping quickly turns no more than one lighter page', n <= 1, `${n}`)
  const gem = (await v('items', 'nugget'))[0]
  n = await fired('page-turn', () => h.evaluate((id) => window.dispatchEvent(new CustomEvent('vigil:aside', { detail: { type: 'nugget', id } })), gem.id))
  check('a note opened in a new split pane turns a page', n === 1, `${n}`)
  await h.screenshot({ path: `${SHOT}/split-open.png` })
  await h.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur())
  n = await fired('paper-fold', () => h.keyboard.press('Control+w'))
  check('closing a split pane folds paper', n === 1, `${n}`)
  await c.go('articles')
  await h.waitForTimeout(600)
  await h.screenshot({ path: `${SHOT}/before-read.png` })
  n = await fired('paper-slide', async () => { await h.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur()); await h.keyboard.press('Meta+Shift+R') })
  check('read mode opens with a paper slide', n === 1, `${n}`)
  await h.keyboard.press('Escape')
  await h.waitForTimeout(600)
  await c.go('home')
  await h.waitForTimeout(800)
  // Home shows one card at a time (now-slot.tsx): the queue may wait behind “N more”.
  await h.evaluate(() => document.querySelector('[data-now-more][aria-expanded="false"]')?.click())
  await h.waitForTimeout(500)
  n = await fired('paper-slide', () => press('Start reading'))
  check('the reading queue opens with a paper slide', n === 1, `${n}`)
  n = await fired('paper-slide', () => h.keyboard.press('Shift+ArrowRight'))
  check('Done, next slides the next piece in', n === 1, `${n}`)
  await h.keyboard.press('Escape')
  await h.waitForTimeout(600)

  await v('settings:set', { sounds: false })
  await h.waitForTimeout(500)
  n = await fired('paper-slide', async () => { await c.go('articles'); await h.waitForTimeout(600); await h.keyboard.press('Meta+Shift+R') })
  check('with Sounds off, no paper slide', n === 0, `${n}`)
  await h.keyboard.press('Escape')
  await h.waitForTimeout(600)
  const quiet = await said()
  await c.send('article', writing[0].id)
  await h.waitForTimeout(1200)
  check('with Sounds off, no page turns', (await said()) === quiet)
  await v('settings:set', { sounds: true })

  // --- The lightsaber out of the sandbox, and nothing with Sounds off.
  const stub = () => electron.evaluate(({ app }) => {
    const children = process.mainModule.require('child_process')
    children.spawn = () => ({ unref() {}, on() {}, kill() {} })
    app.relaunch = () => undefined
    app.quit = () => undefined
    app.exit = () => undefined
  })
  await stub()
  const leave = async () => {
    const was = (await h.evaluate(() => [...(window.vigilHeard ?? [])])).length
    await h.evaluate(() => [...document.querySelectorAll('[data-sandbox-pill] button')].find((one) => (one.textContent ?? '').includes('notes'))?.click())
    await h.waitForTimeout(2500)
    return (await h.evaluate(() => [...(window.vigilHeard ?? [])])).slice(was)
  }
  await v('settings:set', { sounds: false })
  await h.reload(); await h.waitForTimeout(1500)
  log = await leave()
  check('with Sounds off, leaving makes no sound', log.length === 0, log.join(' '))
  await v('settings:set', { sounds: true })
  await h.reload(); await h.waitForTimeout(1500)
  log = await leave()
  check('leaving the sandbox plays the hum drawn back in', log.includes('saber-off'), log.join(' '))
  check('no page errors', !c.errors.some((one) => one.startsWith('PAGEERROR')), c.errors.filter((one) => one.startsWith('PAGEERROR')).join(' | '))
} finally {
  await c.close()
}

// --- Into the sandbox, from your own Haligtree.
{
  process.env.QA_ARGS = ''
  const d = await sandbox({ seeded: false })
  try {
    await d.v('settings:set', { sounds: true, volume: 1 })
    await d.electron.evaluate(({ app }) => {
      const children = process.mainModule.require('child_process')
      children.spawn = () => ({ unref() {}, on() {}, kill() {} })
      app.relaunch = () => undefined
      app.quit = () => undefined
      app.exit = () => undefined
    })
    await d.h.evaluate(() => window.dispatchEvent(new CustomEvent('vigil:sandbox-enter')))
    await d.h.waitForTimeout(2500)
    const log = await d.h.evaluate(() => [...(window.vigilHeard ?? [])])
    check('entering the sandbox swings the saber', log.includes('saber-on'), log.join(' '))
  } finally {
    await d.close()
  }
}
const failed = results.filter((ok) => !ok).length
console.log(`\n${results.length - failed} of ${results.length} passed`)
process.exit(failed ? 1 : 0)
