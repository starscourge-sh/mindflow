// The keys Vigil takes from anywhere stay clear of the Mac's own: none is one
// macOS keeps (full screen, emoji, Spotlight, screenshots, Force Quit, Lock
// Screen), Start focus is ⌃⌥⌘S rather than ⌃⌥⌘F (one slip from ⌃⌘F, full
// screen), and a note's find bar leaves ⌃⌘F to the menu.
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-x/main/index.js MINDFLOW_QA_AWAY=1 node qa/keys-anywhere.mjs
import { sandbox } from './sandbox-lib.mjs'
const results = []
const check = (name, ok, detail = '') => { results.push(!!ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`) }
const c = await sandbox({ width: 1300, height: 900 })
const { h, electron } = c
const wait = (ms) => h.waitForTimeout(ms)
// The Mac's own, in Electron's words: what no app should take from anywhere.
const MAC = ['Control+Command+F', 'Control+Command+Q', 'Control+Command+Space', 'Command+Space', 'Alt+Command+Space', 'Shift+Command+3', 'Shift+Command+4', 'Shift+Command+5', 'Shift+Command+6', 'Alt+Command+Escape', 'Command+Tab', 'Control+Space', 'Control+Alt+Space', 'Control+Up', 'Control+Down', 'Control+Left', 'Control+Right', 'Alt+Command+D', 'Command+H', 'Alt+Command+H', 'Command+M', 'Command+Q', 'Command+W', 'Alt+Command+F5', 'Control+Command+N']
const OURS = ['Command+.', 'Shift+Command+.', 'Alt+Command+S', 'Control+Alt+Command+N', 'Control+Alt+Command+T', 'Control+Alt+Command+=', 'Control+Alt+Command+S']
try {
  const held = await electron.evaluate(({ globalShortcut }, [mac, ours]) => ({
    mac: mac.filter((one) => globalShortcut.isRegistered(one)),
    ours: ours.filter((one) => !globalShortcut.isRegistered(one))
  }), [MAC, OURS])
  check('no key the Mac keeps is taken from anywhere', held.mac.length === 0, held.mac.join(', ') || `${MAC.length} checked`)
  check('every key of ours is taken, Start focus on ⌃⌥⌘S', held.ours.length === 0, held.ours.join(', ') || OURS.join(', '))
  check('⌃⌥⌘F is no longer taken', !(await electron.evaluate(({ globalShortcut }) => globalShortcut.isRegistered('Control+Alt+Command+F'))))
  const sheet = await h.evaluate(() => document.body.innerText.includes('⌃⌥⌘F'))
  check('nothing on screen still says ⌃⌥⌘F', !sheet)

  // A note open, the caret in it: ⌃⌘F goes past the find bar to the menu's full screen.
  // The window is made not to go full screen, so the probe never moves to a Space of its own.
  await electron.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().forEach((one) => one.setFullScreenable(false)))
  await c.go('articles'); await wait(800)
  await h.locator('[data-row][data-id]').first().click(); await wait(1200)
  await h.locator('.ProseMirror').first().click(); await wait(300)
  const findOpen = () => h.evaluate(() => !!document.querySelector('.tiptap-find-bar:not([inert])'))
  await h.evaluate(() => { window.__held = null; window.addEventListener('keydown', (event) => setTimeout(() => (window.__held = event.defaultPrevented)), { once: true }) })
  await h.keyboard.press('Control+Meta+f'); await wait(400)
  check('⌃⌘F in a note: the find bar stays shut', !(await findOpen()))
  check('⌃⌘F in a note: the key is left for the menu (not held back)', (await h.evaluate(() => window.__held)) === false)
  await h.keyboard.press('Meta+f'); await wait(400)
  check('⌘F in a note still opens the find bar', await findOpen())
  await h.keyboard.press('Escape')
} finally { await c.close() }
const failed = results.filter((ok) => !ok).length
console.log(`\n${results.length - failed}/${results.length} passed`)
process.exit(failed ? 1 : 0)
