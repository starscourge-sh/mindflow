// Quick capture stays up when you click into another app, until it is asked
// to put itself away ("Close quick capture when you click away", off to start).
//
//   npx electron-vite build --outDir out-bb
//   QA_DATA=$(mktemp -d) QA_ENTRY=out-bb/main/index.js MINDFLOW_QA_AWAY=1 MINDFLOW_QA_AUTOHIDE=1 node qa/box-blur.mjs
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
  const shownAfterBlur = async () => {
    await app.evaluate(({ BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows().find((one) => !one.webContents.getURL().includes('view='))
      win.show()
      win.emit('blur')
    })
    await wait(800)
    return app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((one) => !one.webContents.getURL().includes('view='))?.isVisible())
  }
  const first = await page.evaluate(() => window.api.vigil('settings'))
  check('off to start', first.boxAutoHide === false, String(first.boxAutoHide))
  check('off: clicking away leaves the box up', (await shownAfterBlur()) === true)
  await page.evaluate(() => window.api.vigil('settings:set', { boxAutoHide: true }))
  check('on: clicking away puts the box away', (await shownAfterBlur()) === false)
} finally {
  await run.close().catch(() => {})
  try { run.electron.process().kill('SIGKILL') } catch {}
}
const passed = results.filter(Boolean).length
console.log(`\n${passed}/${results.length} passed`)
process.exit(passed === results.length ? 0 : 1)
