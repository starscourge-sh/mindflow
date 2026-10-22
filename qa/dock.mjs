// Haligtree as an ordinary app, the way Todoist is one: opened, it shows its main
// window and sits in the Dock; started at login it waits there with no window;
// the red dot puts the main window away without quitting; the Dock icon brings
// it back; quick capture comes up with the main window closed, and does not
// bring the main window with it (Haligtree steps out of the Dock while it is up). The Dock's own menu has its four things.
//
//   npx electron-vite build --outDir out-dk
//   QA_DATA=$(mktemp -d) QA_ENTRY=out-dk/main/index.js node qa/dock.mjs
import { mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

process.env.QA_DATA ??= mkdtempSync(join(tmpdir(), 'haligtree-dock-'))
const { open } = await import('./harness.mjs')

const results = []
const check = (name, ok, detail = '') => {
  results.push(ok)
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`)
}

/** The main window's state, read in the main process. */
const state = (app) => app.evaluate(({ app, BrowserWindow }) => {
  const all = BrowserWindow.getAllWindows()
  const home = all.find((win) => win.webContents.getURL().includes('view=home'))
  const box = all.find((win) => !win.webContents.getURL().includes('view='))
  return {
    home: home ? (home.isVisible() ? 'shown' : 'hidden') : 'none',
    box: box ? (box.isVisible() ? 'shown' : 'hidden') : 'none',
    dock: app.dock ? app.dock.isVisible() : null,
    menu: app.dock?.getMenu()?.items.map((item) => item.label) ?? []
  }
})
const until = async (app, test, ms = 6000) => {
  const end = Date.now() + ms
  let now = await state(app)
  while (!test(now) && Date.now() < end) {
    await new Promise((done) => setTimeout(done, 200))
    now = await state(app)
  }
  return now
}
const launch = async (args) => {
  process.env.QA_ARGS = args
  const run = await open()
  let said = ''
  run.electron.process().stderr?.on('data', (chunk) => (said += chunk))
  // A test run opens quick capture by itself, and Haligtree is out of the Dock
  // while it is up: put away, so the checks see Haligtree as you would.
  await run.electron.evaluate(({ ipcMain }) => ipcMain.emit('prompt:hide', {}))
  return { ...run, said: () => said }
}

// The first start runs the welcome, in the main window, whatever else is true.
// Marked done here, so the starts below are ordinary ones.
{
  const first = await launch('')
  const now = await until(first.electron, (s) => s.home === 'shown')
  check('a brand-new Haligtree opens the main window for the welcome', now.home === 'shown', now.home)
  await first.page.evaluate(() => window.api.haligtree('onboarding:set', { welcomed: new Date().toISOString(), newsSeen: true, welcoming: false, pageHints: false }))
  await first.close()
}

// Opened by you: the main window, and an icon in the Dock.
{
  const run = await launch('')
  const app = run.electron
  let now = await until(app, (s) => s.home === 'shown')
  check('opened normally, the main window shows', now.home === 'shown', now.home)
  check('opened normally, Haligtree is in the Dock', now.dock === true, String(now.dock))
  check('the Dock menu has Quick capture, New note, Today and Show sticky notes',
    ['Quick capture', 'New note', 'Today', 'Show sticky notes'].every((label) => now.menu.includes(label)), now.menu.join(', '))
  const key = await app.evaluate(({ globalShortcut }) => globalShortcut.isRegistered('Command+.'))
  // Your own Haligtree, running beside this test, may hold ⌘. already: then this copy tried for it, and said so.
  check('⌘. is taken for quick capture by default', key || run.said().includes('Could not register Command+.'), key ? 'registered' : 'held by another copy')

  // The red dot: put away, not quit.
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((win) => win.webContents.getURL().includes('view=home'))?.close())
  now = await until(app, (s) => s.home === 'hidden')
  check('closing the main window hides it', now.home === 'hidden', now.home)
  const alive = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length).catch(() => 0)
  check('closing the main window keeps Haligtree running, still in the Dock', alive > 0 && now.dock === true, `${alive} windows, dock ${now.dock}`)

  // The Dock icon clicked.
  await app.evaluate(({ app }) => app.emit('activate', {}, false))
  now = await until(app, (s) => s.home === 'shown')
  check('clicking the Dock icon brings the main window back', now.home === 'shown', now.home)

  // Quick capture, with the main window put away: it comes up alone.
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((win) => win.webContents.getURL().includes('view=home'))?.close())
  await until(app, (s) => s.home === 'hidden')
  await app.evaluate(({ BrowserWindow }) => {
    const box = BrowserWindow.getAllWindows().find((win) => !win.webContents.getURL().includes('view='))
    box?.hide()
  })
  await until(app, (s) => s.box === 'hidden')
  await app.evaluate(({ app }) => app.dock?.getMenu()?.items.find((item) => item.label === 'Quick capture')?.click())
  now = await until(app, (s) => s.box === 'shown')
  check('quick capture opens with the main window closed', now.box === 'shown', now.box)
  await new Promise((done) => setTimeout(done, 600))
  now = await state(app)
  check('quick capture does not bring the main window with it', now.home === 'hidden', now.home)
  // Up, quick capture is a menu bar app's window, so AeroSpace never files it
  // under a workspace (see qa/summon-stays.mjs); put away, Haligtree is back.
  check('with quick capture up, Haligtree steps out of the Dock', now.dock === false, String(now.dock))
  await app.evaluate(({ ipcMain }) => ipcMain.emit('prompt:hide', {}))
  now = await until(app, (s) => s.box === 'hidden' && s.dock === true)
  check('quick capture put away, Haligtree is back in the Dock', now.dock === true, String(now.dock))

  // Today, from the Dock: the main window, on Today.
  await app.evaluate(({ app }) => app.dock?.getMenu()?.items.find((item) => item.label === 'Today')?.click())
  now = await until(app, (s) => s.home === 'shown')
  check('Today in the Dock menu opens the main window', now.home === 'shown', now.home)
  await run.close()
}

// Started at login: in the Dock, no window.
{
  const run = await launch('--at-login')
  const app = run.electron
  await new Promise((done) => setTimeout(done, 3500))
  let now = await state(app)
  check('started at login, the main window stays hidden', now.home !== 'shown', now.home)
  check('started at login, Haligtree is in the Dock', now.dock === true, String(now.dock))
  await app.evaluate(({ app }) => app.emit('activate', {}, false))
  now = await until(app, (s) => s.home === 'shown')
  check('started at login, the Dock icon opens the main window', now.home === 'shown', now.home)
  await run.close()
}

const passed = results.filter(Boolean).length
console.log(`\n${passed}/${results.length} passed`)
process.exit(passed === results.length ? 0 : 1)
