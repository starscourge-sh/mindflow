// Quick capture puts itself away when you click into another app ("Auto-close
// quick capture", on to start: the box has no traffic lights, so a new user
// would not know how to close it); switched off, it stays up.
//
//   npx electron-vite build --outDir out-bb
//   QA_DATA=$(mktemp -d) QA_ENTRY=out-bb/main/index.js HALIGTREE_QA_AWAY=1 node qa/box-blur.mjs
const { open } = await import('./harness.mjs')
const results = []
const check = (name, ok, detail = '') => {
  results.push(ok)
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`)
}
const wait = (ms) => new Promise((done) => setTimeout(done, ms))
const run = await open()
const app = run.electron
try {
  const page = run.page
  // A test run keeps the box up when clicked away from (HALIGTREE_QA_AWAY); this probe needs it as a person has it,
  // so it turns that back on itself rather than relying on the command line.
  await app.evaluate(() => void (process.env.HALIGTREE_QA_AUTOHIDE = '1'))
  // Where the focus went, as macOS tells it: another app came to the front ('app'), the main window took the keys
  // ('main'), or a window of the box's own did ('child', a picture it opened). Read at once: no wait decides it.
  const shownAfterBlur = async (to = 'app') => {
    await app.evaluate(({ app: a, BrowserWindow }, to) => {
      const win = BrowserWindow.getAllWindows().find((one) => !one.webContents.getURL().includes('view='))
      win.show()
      win.emit('blur')
      if (to === 'app') a.emit('did-resign-active')
      if (to === 'main') a.emit('browser-window-focus', {}, BrowserWindow.getAllWindows().find((one) => one.webContents.getURL().includes('view=home')))
      if (to === 'child') {
        const child = new BrowserWindow({ parent: win, show: false })
        a.emit('browser-window-focus', {}, child)
        child.destroy()
      }
    }, to)
    await wait(50)
    return app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((one) => !one.webContents.getURL().includes('view='))?.isVisible())
  }
  const first = await page.evaluate(() => window.api.haligtree('settings'))
  check('on to start', first.boxAutoHide !== false, String(first.boxAutoHide))
  check('on: clicking into another app puts the box away', (await shownAfterBlur('app')) === false)
  check('on: clicking into the main window puts the box away', (await shownAfterBlur('main')) === false)
  check('on: a window of the box\'s own leaves it up', (await shownAfterBlur('child')) === true)
  await page.evaluate(() => window.api.haligtree('settings:set', { boxAutoHide: false }))
  check('off: clicking away leaves the box up', (await shownAfterBlur()) === true)
} finally {
  await run.close().catch(() => {})
  try { run.electron.process().kill('SIGKILL') } catch {}
}
const passed = results.filter(Boolean).length
console.log(`\n${passed}/${results.length} passed`)
process.exit(passed === results.length ? 0 : 1)
