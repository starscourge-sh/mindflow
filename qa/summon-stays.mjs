// Quick capture comes up where you are, the way Raycast's notes do: summoned
// over another app, on any Space or AeroSpace workspace, it takes the keys
// without making Haligtree the active app, so the Mac never switches to the
// Space (or AeroSpace to the workspace) where the main window was left, and
// the main window is neither shown nor brought forward. Checked with the main
// window put away, open behind other apps, and in full screen, from the key
// (and the Dock menu, the same path) and from the main window's own button.
//
// Off screen: the test windows are parked (HALIGTREE_QA_AWAY), and the checks
// read what the code asked for (bringing Haligtree forward, showing or focusing
// the main window), plus, where AeroSpace runs, which windows it has filed.
// The cause, for the record: AeroSpace leaves a buttonless window alone only
// for a menu bar app. Since Haligtree got its Dock icon, AeroSpace filed the box
// under a workspace, and each time it came back put the screen back to the
// workspace it was last closed on. So the box is up as a menu bar app's.
//
//   npx electron-vite build --outDir out-qc
//   QA_DATA=$(mktemp -d) QA_ENTRY=out-qc/main/index.js HALIGTREE_QA_AWAY=1 node qa/summon-stays.mjs
import { execFileSync } from 'child_process'
import { mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

process.env.QA_DATA ??= mkdtempSync(join(tmpdir(), 'haligtree-summon-'))
const { open } = await import('./harness.mjs')

const results = []
const check = (name, ok, detail = '') => {
  results.push(ok)
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`)
}
const wait = (ms) => new Promise((done) => setTimeout(done, ms))

/** This run's windows as AeroSpace lists them, or null where it is not running. */
const aerospaceWindows = () => {
  try {
    const pid = String(run.electron.process().pid)
    return execFileSync('aerospace', ['list-windows', '--all', '--format', '%{window-id}|%{app-pid}|%{workspace}|%{window-layout}'], { timeout: 2000 }).toString().split('\n').filter((line) => line.split('|')[1] === pid)
  } catch {
    return null
  }
}

const run = await open()
const app = run.electron
try {
  // Past the welcome, so the main window is an ordinary one.
  const home = await (async () => {
    for (let i = 0; i < 100; i++) {
      const found = app.windows().find((w) => w.url().includes('view=home'))
      if (found) return found
      await wait(200)
    }
    throw new Error('no main window')
  })()
  await home.waitForLoadState('domcontentloaded')
  await home.evaluate(() => window.api.haligtree('onboarding:set', { welcomed: new Date().toISOString(), newsSeen: true, welcoming: false, pageHints: false }))

  // Everything that would bring Haligtree forward or the main window with it,
  // written down as it is asked for. The test run's own stand-ins (no window
  // is ever really focused here) are wrapped, so a call is seen all the same.
  await app.evaluate(({ app, BrowserWindow, ipcMain }) => {
    const log = (globalThis.qaSummonLog = [])
    const name = (win) => (win.webContents.getURL().includes('view=home') ? 'home' : win.webContents.getURL().includes('view=') ? 'other' : 'box')
    const appFocus = app.focus
    app.focus = (...args) => (log.push(`app.focus(${JSON.stringify(args[0] ?? {})})`), appFocus.apply(app, args))
    const appShow = app.show
    app.show = (...args) => (log.push('app.show'), appShow.apply(app, args))
    if (app.dock) {
      const dockShow = app.dock.show
      app.dock.show = (...args) => (log.push('dock.show'), dockShow.apply(app.dock, args))
    }
    const proto = BrowserWindow.prototype
    for (const method of ['show', 'focus', 'moveTop', 'restore', 'showInactive']) {
      const real = proto[method]
      proto[method] = function (...args) {
        if (!this.isDestroyed()) log.push(`${name(this)}.${method}`)
        return real.apply(this, args)
      }
    }
    const policy = app.setActivationPolicy
    app.setActivationPolicy = (...args) => (log.push(`policy ${args[0]}`), policy.apply(app, args))
    app.on('did-become-active', () => log.push('did-become-active'))
    app.on('activate', () => log.push('activate'))
    const homeWin = BrowserWindow.getAllWindows().find((win) => win.webContents.getURL().includes('view=home'))
    for (const event of ['show', 'focus', 'restore'])
      homeWin.on(event, () => log.push(`home event ${event}`))
    // Which messages the box's page sends on the way up, for a cause if one fails.
    const emit = ipcMain.emit
    ipcMain.emit = function (channel, ...args) {
      if (typeof channel === 'string') log.push(`ipc ${channel}`)
      return emit.call(this, channel, ...args)
    }
  })

  const box = () => app.evaluate(({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows().find((one) => !one.webContents.getURL().includes('view='))
    return win ? { visible: win.isVisible(), focused: win.isFocused() } : null
  })
  const homeVisible = () => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((win) => win.webContents.getURL().includes('view=home'))?.isVisible())
  // Put away the way Escape does.
  const putBoxAway = () => app.evaluate(({ ipcMain }) => ipcMain.emit('prompt:hide', {}))
  const inDock = () => app.evaluate(({ app }) => app.dock?.isVisible())
  const clearLog = () => app.evaluate(() => void (globalThis.qaSummonLog.length = 0))
  const readLog = () => app.evaluate(() => [...globalThis.qaSummonLog])

  // The key: the Dock menu's "Quick capture" runs the same summon the key does.
  const byKey = () => app.evaluate(({ app }) => app.dock?.getMenu()?.items.find((item) => item.label === 'Quick capture')?.click())
  // The main window's own button (and ⌘K's "in quick capture").
  const byButton = () => home.evaluate(() => window.api.showPrompt())

  /**
   * One summon: what was asked for along the way. The box is told to report
   * the focus as its own, since nothing is really focused off screen.
   */
  const summon = async (label, how, homeShouldBe) => {
    await putBoxAway()
    await wait(300)
    const before = await homeVisible()
    await clearLog()
    await how()
    await wait(1200)
    const log = await readLog()
    const after = await homeVisible()
    const shown = await box()
    const bad = log.filter((line) => /^(app\.focus|app\.show|dock\.show|did-become-active|activate$|home\.(show|focus|moveTop|restore|showInactive)|home event)/.test(line))
    const asked = log.filter((line) => line.startsWith('box.'))
    check(`${label}: Haligtree is not brought forward and the main window is left alone`, bad.length === 0, bad.join(', ') || 'nothing')
    check(`${label}: the main window is as it was (${homeShouldBe ? 'open' : 'put away'})`, after === before && after === homeShouldBe, `before ${before}, after ${after}`)
    check(`${label}: the box comes up and is given the keys`, shown?.visible === true && asked.includes('box.focus'), `${JSON.stringify(shown)}; ${asked.join(', ')}`)
    // AeroSpace files every window of an app with a Dock icon under a
    // workspace, and brings that workspace back when the window returns: the
    // box is up as a menu bar app's, set before it shows, so it never is.
    const stepped = log.indexOf('policy accessory')
    // What AeroSpace itself sees, where it runs: the box is no window of its
    // to file (the main window, when open, is the only one it lists).
    const filed = aerospaceWindows()
    if (filed) check(`${label}: AeroSpace does not file the box under a workspace`, filed.length === (homeShouldBe ? 1 : 0), filed.join(' ; ') || 'none')
    check(`${label}: Haligtree steps out of the Dock before the box shows`, stepped >= 0 && stepped < log.indexOf('box.show'), log.filter((line) => line.startsWith('policy') || line === 'box.show').join(', '))
    await clearLog()
    await putBoxAway()
    await wait(300)
    const back = await readLog()
    check(`${label}: put away, Haligtree is back in the Dock and nothing of it is brought forward`,
      back.includes('policy regular') && (await inDock()) === true && !back.some((line) => /^(app\.focus|did-become-active|home\.(show|focus|moveTop))/.test(line)), back.filter((line) => !line.startsWith('ipc')).join(', '))
    return log
  }

  // A test run opens the box on its own at the start, as a plain window:
  // put away first, so each summon below is a real one.
  await putBoxAway()
  // 1. The main window put away (the red dot).
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((win) => win.webContents.getURL().includes('view=home'))?.close())
  await wait(600)
  await summon('main window put away, by the key', byKey, false)

  // 2. The main window open, but behind another app (nothing of Haligtree's has the keys).
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((win) => win.webContents.getURL().includes('view=home'))?.showInactive())
  await wait(600)
  await summon('main window open behind another app, by the key', byKey, true)
  await summon('main window open, by its own button', byButton, true)

  // 3. The main window in full screen. Not really put there (that would take
  // over this screen): it says it is, which is all the summon could read.
  await app.evaluate(({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows().find((one) => one.webContents.getURL().includes('view=home'))
    win.isFullScreen = () => true
  })
  await summon('main window in full screen, by the key', byKey, true)

  // 4. Put away again by the key, having come from another app: nothing of
  // Haligtree's is handed the keys on the way out.
  await app.evaluate(({ app }) => app.dock?.getMenu()?.items.find((item) => item.label === 'Quick capture')?.click())
  await wait(600)
  await clearLog()
  await app.evaluate(({ BrowserWindow }) => {
    // Off screen nothing is ever focused: the box says it has the keys, as it would.
    const win = BrowserWindow.getAllWindows().find((one) => !one.webContents.getURL().includes('view='))
    win.isFocused = () => true
  })
  await app.evaluate(({ ipcMain }) => ipcMain.emit('prompt:show', {}))
  await wait(600)
  const away = await readLog()
  const awayBad = away.filter((line) => /^(app\.focus|did-become-active|home\.(show|focus|moveTop|restore)|home event)/.test(line))
  check('put away by the key: the main window is not brought forward', awayBad.length === 0, awayBad.join(', ') || 'nothing')
  check('put away by the key: the box goes, and Haligtree is back in the Dock', (await box())?.visible === false && away.includes('policy regular') && (await inDock()) === true, away.filter((line) => line.startsWith('policy')).join(', '))
} finally {
  await run.close().catch(() => {})
  try { run.electron.process().kill('SIGKILL') } catch {}
}

const passed = results.filter(Boolean).length
console.log(`\n${passed}/${results.length} passed`)
process.exit(passed === results.length ? 0 : 1)
