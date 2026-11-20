// The welcome opened again from the menu over a book already in use (pages in a group), on Catch's "Your turn", with
// Haligtree in front: the quick capture key opens the box and it stays open, on the first press and every press after
// it was put away. It used to open and close at once: stepping out of the Dock (boxUp) while Haligtree was the app in
// front made macOS take Haligtree out of the front, the box lost the keys and auto-close put it away.
// The key is pressed as the global shortcut does it (the same toggle, reached through 'second-instance'), and the
// box's window is heard in the main process for 1.5s after each press. Auto-close is on, as on a new Mac.
// Haligtree is brought in front for this (osascript), its windows still parked out of sight past the screen's edge.
//
//   npx electron-vite build --outDir out-q
//   QA_DATA=$(mktemp -d) QA_ENTRY=out-q/main/index.js HALIGTREE_QA_AWAY=1 HALIGTREE_QA_AUTOHIDE=1 node qa/welcome-box-shortcut.mjs
import { execFileSync } from 'child_process'
import { checks, open } from './harness.mjs'

const { check, done } = checks()
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const run = await open()
const app = run.electron
try {
  let h = null
  for (let i = 0; i < 100 && !h; i++) (h = app.windows().find((w) => w.url().includes('view=home')) ?? null), h || (await wait(200))
  await h.waitForLoadState('domcontentloaded')
  const v = (channel, ...args) => h.evaluate(([c, a]) => window.api.haligtree(c, ...a), [channel, args])
  // A book already in use: pages in a group, welcomed before, the key set to ⌘. by hand.
  const ids = []
  for (const title of ['Old page one', 'Old page two']) { const one = await v('article:new'); await v('item:save', one, { title }); ids.push(one) }
  await v('groups:arrange', 'article', { top: ['g:old'], groups: { old: ids }, make: { id: 'old', name: 'Old group', folder: true } })
  await v('onboarding:set', { welcomed: new Date().toISOString(), newsSeen: true })
  await v('settings:set', { keys: { '⌘.': '⌘.' }, boxAutoHide: true })
  await wait(600)
  check('the key is taken from anywhere', await app.evaluate(({ globalShortcut }) => globalShortcut.isRegistered('Command+.')))

  // The welcome again, as from the menu, on to Catch's Your turn.
  await app.evaluate(({ BrowserWindow }) => { const win = BrowserWindow.getAllWindows().find((one) => one.webContents.getURL().includes('view=home')); win?.setBounds({ x: 40, y: 40, width: 1280, height: 800 }); win?.show() })
  await h.evaluate(() => window.dispatchEvent(new CustomEvent('haligtree:welcome')))
  await h.waitForSelector('.mf-welcome', { timeout: 8000 })
  const chapter = () => h.evaluate(() => document.querySelector('.mf-welcome footer .sr-only')?.textContent ?? '')
  const next = async () => ((await h.$('footer button:has-text("Skip trying it")')) ? h.click('footer button:has-text("Skip trying it")') : h.click('footer button:has-text("Continue"), footer button:has-text("Get started")'))
  for (let i = 0; i < 16 && !(await chapter()).includes('Catch'); i++) (await next(), await wait(700))
  for (let i = 0; i < 8; i++) {
    if (await h.evaluate(() => [...document.querySelectorAll('.mf-welcome [data-reel]')].every((el) => el.dataset.reel === 'done'))) break
    await h.keyboard.press('Escape')
    await wait(400)
  }
  check('on Catch, Your turn waits for the key', await h.waitForSelector('[data-turn="idle"]', { timeout: 8000 }).then(() => true, () => false))

  const boxShown = () => app.evaluate(({ BrowserWindow }) => !!BrowserWindow.getAllWindows().find((one) => !one.webContents.getURL().includes('view='))?.isVisible())
  await h.evaluate(() => window.api.hidePrompt())
  await wait(400)
  check('the box starts put away', !(await boxShown()))

  // Haligtree in front with the main window's keys, as while the welcome runs. A test run's windows never take the keys
  // (HALIGTREE_QA_AWAY): here they may again, still parked out of sight.
  await app.evaluate(({ BrowserWindow }) => { delete BrowserWindow.prototype.focus; delete BrowserWindow.prototype.show })
  const pid = await app.evaluate(() => process.pid)
  try { execFileSync('osascript', ['-e', `tell application "System Events" to set frontmost of (first process whose unix id is ${pid}) to true`]) } catch {}
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((one) => one.webContents.getURL().includes('view=home'))?.focus())
  await wait(600)
  check('Haligtree is in front, the main window has the keys', await app.evaluate(({ BrowserWindow }) => BrowserWindow.getFocusedWindow()?.webContents.getURL().includes('view=home') ?? false))

  // What the box's window did after a press, heard in the main process itself.
  await app.evaluate(({ BrowserWindow }) => {
    const box = BrowserWindow.getAllWindows().find((one) => !one.webContents.getURL().includes('view='))
    globalThis.boxSeen = []
    for (const what of ['show', 'hide', 'focus', 'blur']) box.on(what, () => globalThis.boxSeen.push(what))
  })
  const press = async () => {
    await app.evaluate(() => void (globalThis.boxSeen.length = 0))
    await app.evaluate(({ app: a }) => void a.emit('second-instance', {}, []))
    await wait(1500)
    return { seen: await app.evaluate(() => globalThis.boxSeen.join(' ')), up: await boxShown() }
  }
  for (let n = 1; n <= 4; n++) {
    const now = await press()
    check(`press ${n}: the box opens and stays open for 1.5s`, now.up && !now.seen.includes('hide'), now.seen)
    if (n === 1) {
      const turn = await h.evaluate(() => document.querySelector('[data-turn]')?.dataset.turn)
      check('the welcome says to write something', turn === 'open', turn)
    }
    // The key again, the box in front: it goes, and the main window has the keys back for the next press.
    const away = await press()
    check(`press ${n} again: the box goes away`, !away.up, away.seen)
  }
} finally {
  await run.close().catch(() => {})
  try { run.electron.process().kill('SIGKILL') } catch {}
}
done()
