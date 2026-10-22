// ⌃⌘C glides quick capture to the middle of its screen (at once with Motion
// off), with or without its side panel, and it comes back there next time.
//
//   npx electron-vite build --outDir out-bc
//   QA_DATA=$(mktemp -d) QA_ENTRY=out-bc/main/index.js HALIGTREE_QA_AWAY=1 HALIGTREE_QA_VIRTUAL=1 node qa/box-centre.mjs
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
const box = (fn, arg) => app.evaluate(({ BrowserWindow, screen }, [fn, arg]) => {
  const win = BrowserWindow.getAllWindows().find((one) => !one.webContents.getURL().includes('view='))
  return new Function('win', 'screen', 'arg', fn)(win, screen, arg)
}, [fn, arg])
const where = () => box(`const b = win.getBounds(), a = screen.getDisplayMatching(b).workArea; return { b, a, dx: Math.abs(b.x + b.width / 2 - (a.x + a.width / 2)) }`)
try {
  await wait(1500)
  for (const panel of [true, false]) {
    if (!panel) { await page.keyboard.press('Meta+Backslash'); await wait(900) }
    const first = await where()
    await box(`win.setBounds({ ...win.getBounds(), x: arg.x + 20, y: arg.y + 20 })`, first.a)
    await wait(200)
    const moved = await where()
    await page.keyboard.press('Control+Meta+c')
    await wait(400)
    const now = await where()
    check(`${panel ? 'with' : 'without'} the side panel: ⌃⌘C centres it across`, moved.dx > 50 && now.dx <= 1, `off by ${moved.dx} before, ${now.dx} after`)
    check(`${panel ? 'with' : 'without'} the side panel: and down, well off the top-left corner`, now.b.y > moved.b.y + 40, `${moved.b.y} → ${now.b.y}`)
  }
  await app.evaluate(({ ipcMain }) => ipcMain.emit('prompt:hide', {}))
  await wait(400)
  await app.evaluate(({ app }) => app.dock?.getMenu()?.items.find((item) => item.label === 'Quick capture')?.click())
  await wait(900)
  check('brought back, it is still in the middle', (await where()).dx <= 1, `off by ${(await where()).dx}`)
} finally {
  await run.close().catch(() => {})
  try { run.electron.process().kill('SIGKILL') } catch {}
}
const passed = results.filter(Boolean).length
console.log(`\n${passed}/${results.length} passed`)
process.exit(passed === results.length ? 0 : 1)
