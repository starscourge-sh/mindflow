// Quick capture opens with its side panel (Inbox, Tasks, Review, Saved and
// Recent) open to start, the window wide enough for both; ⌘\ hides it, and
// that is remembered.
//
//   npx electron-vite build --outDir out-bp
//   QA_DATA=$(mktemp -d) QA_ENTRY=out-bp/main/index.js HALIGTREE_QA_AWAY=1 node qa/box-panel-default.mjs
const { open } = await import('./harness.mjs')
const results = []
const check = (name, ok, detail = '') => {
  results.push(ok)
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`)
}
const wait = (ms) => new Promise((done) => setTimeout(done, ms))
const run = await open()
const app = run.electron
const page = run.page
const width = () => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((one) => !one.webContents.getURL().includes('view='))?.getBounds().width)
const toggle = () => page.locator('button[aria-label="Hide the side panel"], button[aria-label="Show the side panel"]').first()
try {
  await wait(1500)
  check('open to start', (await toggle().getAttribute('aria-pressed')) === 'true')
  check('the window is wide enough for both', (await width()) === 1080, String(await width()))
  await page.keyboard.press('Meta+Backslash')
  await wait(900)
  check('⌘\\ hides it', (await toggle().getAttribute('aria-pressed')) === 'false' && (await width()) === 640, String(await width()))
  await page.reload()
  await wait(1500)
  check('hidden is remembered', (await toggle().getAttribute('aria-pressed')) === 'false')
} finally {
  await run.close().catch(() => {})
  try { run.electron.process().kill('SIGKILL') } catch {}
}
const passed = results.filter(Boolean).length
console.log(`\n${passed}/${results.length} passed`)
process.exit(passed === results.length ? 0 : 1)
