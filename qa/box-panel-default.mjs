// Quick capture opens as the box alone, its side panel (Inbox, Tasks, Review, Saved and Recent) shut to start;
// ⌘\ shows it, and that is remembered. Settings' "Side panel in quick capture" is the same choice: turned off
// there, the box narrows to match.
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
  check('shut to start', (await toggle().getAttribute('aria-pressed')) === 'false')
  check('the window is the box alone', (await width()) === 640, String(await width()))
  const oneLine = await app.evaluate(() => globalThis.haligtreeBoxSize?.().height)
  check('the whole box to start, not the one-line pill', oneLine > 56, `height ${oneLine}`)
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: '\\', metaKey: true, bubbles: true })))
  await wait(900)
  check('⌘\\ shows it', (await toggle().getAttribute('aria-pressed')) === 'true' && (await width()) === 1080, `${await toggle().getAttribute('aria-pressed')} ${await width()} ${JSON.stringify(await app.evaluate(() => globalThis.haligtreeBoxSize?.()))}`)
  await page.reload()
  await wait(1500)
  check('shown is remembered', (await toggle().getAttribute('aria-pressed')) === 'true' && (await width()) === 1080, String(await width()))
  // Settings' switch writes the same choice from another window: the box hears it and narrows.
  const home = app.windows().find((w) => w.url().includes('view=home'))
  await home.evaluate(() => localStorage.setItem('boxPanel', 'closed'))
  await wait(1200)
  check('turned off in Settings, the box narrows', (await toggle().getAttribute('aria-pressed')) === 'false' && (await width()) === 640, String(await width()))
} finally {
  await run.close().catch(() => {})
  try { run.electron.process().kill('SIGKILL') } catch {}
}
const passed = results.filter(Boolean).length
console.log(`\n${passed}/${results.length} passed`)
process.exit(passed === results.length ? 0 : 1)
