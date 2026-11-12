// In a test run a window says 'show' and 'hide' as the app shows and hides it, never as the Mac reports what can be
// seen. On 12 Nov the Mac's screen locked for 43 minutes (the screen saver after an hour idle): Electron sends 'show'
// only when macOS calls a window visible, so no 'show' came, whatever waited for one waited for good (a sticky made
// again as glass kept its old window beside the new one), and three checks failed on every build until the unlock.
// The test-mode block in src/main/index.ts now says both itself and drops the Mac's own word.
// This check proves the rule with the screen open or locked: one 'show' for each showing, one 'hide' for each hiding,
// the main window's "shown" noted, a 'show' or 'hide' from outside the app's own calls dropped, and one window for
// each sticky after its material changes (the place that waited on 'show').
//   QA_ARGS=--sandbox QA_DATA=<a copy of the seeded sandbox> QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/show-by-the-app.mjs
import { sandbox } from './sandbox-lib.mjs'
import { checks } from './harness.mjs'
process.env.QA_ARGS ??= '--sandbox'
process.env.HALIGTREE_QA_VIRTUAL ??= '1'

const { check, done } = checks()
const c = await sandbox({ width: 1280, height: 800 })
const { electron, h, v } = c
const wait = (ms) => h.waitForTimeout(ms)
/** Every window's own count of 'show' and 'hide' from now on, by what it is (its address's question part). */
const watch = () => electron.evaluate(({ BrowserWindow, app }) => {
  const seen = (globalThis.qaSaid ??= {})
  const one = (win) => {
    const key = () => `${win.id}:${win.webContents.getURL().replace(/^[^?]*/, '').slice(0, 70)}`
    const mine = (seen[win.id] = { key: key(), show: 0, hide: 0 })
    win.on('show', () => ((mine.key = key()), mine.show++))
    win.on('hide', () => ((mine.key = key()), mine.hide++))
  }
  BrowserWindow.getAllWindows().filter((win) => !win.isDestroyed()).forEach(one)
  app.on('browser-window-created', (_, win) => one(win))
})
const said = () => electron.evaluate(() => Object.values(globalThis.qaSaid ?? {}))
const stickyWins = () => electron.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().filter((win) => !win.isDestroyed() && win.webContents.getURL().includes('view=sticky')).map((win) => ({ id: win.id, url: win.webContents.getURL().replace(/^[^?]*/, '').slice(0, 70), visible: win.isVisible() })))
/** Waited for, never slept through: up to ten seconds. */
const until = async (test) => { let now = await test(); for (let i = 0; i < 40 && !now; i++) (await wait(250), (now = await test())); return now }

try {
  await v('settings:set', { sounds: false })
  // The main window was shown by the app as the run began: noted, whatever the Mac's screen is doing.
  const times = await until(async () => { const t = await electron.evaluate(() => globalThis.haligtreeHomeTimes); return t?.shown != null ? t : null })
  check('the main window\'s "shown" is noted', !!times, JSON.stringify(await electron.evaluate(() => globalThis.haligtreeHomeTimes)))
  const first = await until(async () => { const now = await stickyWins(); return now.length >= 2 && now.every((one) => one.visible) ? now : null })
  check('the example book\'s stickies are up (a goal\'s card and Today)', !!first, JSON.stringify(await stickyWins()))
  await watch()

  // Hidden and shown again by the app's own switch: one 'hide' each, then one 'show' each.
  await v('settings:set', { stickiesShown: false })
  await until(async () => (await stickyWins()).every((one) => !one.visible))
  await wait(600)
  const hidden = (await said()).filter((one) => one.key.includes('view=sticky'))
  check('“Show sticky notes” off: each sticky says hide once, and show not at all', hidden.length >= 2 && hidden.every((one) => one.hide === 1 && one.show === 0), JSON.stringify(hidden))
  await v('settings:set', { stickiesShown: true })
  await until(async () => (await stickyWins()).every((one) => one.visible))
  await wait(600)
  const back = (await said()).filter((one) => one.key.includes('view=sticky'))
  check('...on again: each says show once', back.length >= 2 && back.every((one) => one.hide === 1 && one.show === 1), JSON.stringify(back))

  // What the Mac might say on its own (a window covered, the screen locked or unlocked) changes nothing.
  const dropped = await electron.evaluate(({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows().find((one) => !one.isDestroyed() && one.webContents.getURL().includes('view=sticky'))
    const before = { ...globalThis.qaSaid[win.id] }
    const heard = [win.emit('hide'), win.emit('show'), win.emit('show')]
    return { before, after: { ...globalThis.qaSaid[win.id] }, heard }
  })
  check('a show or hide that is not the app\'s own is dropped', dropped.after.show === dropped.before.show && dropped.after.hide === dropped.before.hide && dropped.heard.every((one) => one === false), JSON.stringify(dropped))

  // The place that waited on 'show': a sticky made again in another material keeps one window, the new one.
  const glassWas = (await v('settings')).stickiesGlass === true
  const before = await stickyWins()
  await v('settings:set', { stickiesGlass: !glassWas, stickiesFrosted: !glassWas })
  const after = await until(async () => { const now = await stickyWins(); return now.length === before.length && now.every((one) => one.visible && !before.some((old) => old.id === one.id)) ? now : null })
  check('made again in the other material: one window for each sticky, every one new', !!after, JSON.stringify({ before, now: await stickyWins() }))
  await wait(1500)
  const settled = await stickyWins()
  check('...and still one each a moment later', settled.length === before.length, JSON.stringify(settled))
  const made = (await said()).filter((one) => settled.some((win) => win.id === Number(one.key.split(':')[0])))
  check('each new window said show once', made.length === settled.length && made.every((one) => one.show === 1 && one.hide === 0), JSON.stringify(made))
  await v('settings:set', { stickiesGlass: glassWas, stickiesFrosted: glassWas })
  await until(async () => (await stickyWins()).length === before.length)
} catch (error) {
  check('ran to the end', false, error.message.split('\n')[0])
} finally {
  console.log(c.errors.length ? 'errors: ' + c.errors.slice(0, 3).join(' | ') : 'no page errors')
  await c.close()
  done()
}
