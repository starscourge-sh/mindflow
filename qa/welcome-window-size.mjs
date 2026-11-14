// While the welcome runs, the main window is in the middle of the screen at the welcome's size (never filling it, never
// full screen), even after a quit halfway through; when it ends it grows to the app's own size: the place kept for it.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-e/main/index.js HALIGTREE_QA_AWAY=1 node qa/welcome-window-size.mjs
import { mkdtempSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { checks, open } from './harness.mjs'

const { check, done } = checks()
process.env.HALIGTREE_QA_VIRTUAL ??= '1'
process.env.QA_DATA ??= mkdtempSync(join(tmpdir(), 'haligtree-qa-'))
// The size the window had before: kept where the app keeps it.
const before = { x: 100, y: 100, width: 1000, height: 700 }
writeFileSync(join(process.env.QA_DATA, 'main-window.json'), JSON.stringify(before))
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const home = async (app) => {
  for (let i = 0; i < 100; i++) {
    const h = app.windows().find((w) => w.url().includes('view=home'))
    if (h) return h
    await wait(200)
  }
}
const win = (app) => app.evaluate(({ BrowserWindow, screen }) => {
  const one = BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().includes('view=home'))
  const area = screen.getDisplayMatching(one.getBounds()).workArea
  const b = one.getBounds()
  const middle = Math.abs(b.x + b.width / 2 - (area.x + area.width / 2)) <= 2 && Math.abs(b.y + b.height / 2 - (area.y + area.height / 2)) <= 2
  return { fills: b.width === area.width && b.height === area.height, middle, full: one.isFullScreen(), normal: b }
})

// First run: the welcome opens by itself, in a window in the middle of the screen.
let run = await open()
let h = await home(run.electron)
await h.waitForSelector('.mf-welcome', { timeout: 15000 })
await wait(800)
let now = await win(run.electron)
check('the welcome plays in the middle of the screen, never filling it nor full screen', now.middle && !now.fills && !now.full, JSON.stringify(now))
// Quit halfway.
await run.electron.close().catch(() => undefined)

// Opened again: the welcome comes back, in the middle again; skipped, the window grows to the place kept for it.
run = await open()
h = await home(run.electron)
await h.waitForSelector('.mf-welcome', { timeout: 15000 })
await wait(800)
now = await win(run.electron)
check('after a quit halfway, the welcome plays in the middle again', now.middle && !now.fills && !now.full, JSON.stringify(now))
// Skip goes to the last page; "Start without the tour" ends it.
await h.click('button:has-text("Skip the welcome")')
await wait(1500)
await h.click('button:has-text("Start without the tour")')
await h.waitForSelector('.mf-welcome', { state: 'detached', timeout: 15000 }).catch(() => undefined)
await wait(1500)
now = await win(run.electron)
check('the welcome over, the window grows to the app\'s own place', ['x', 'y', 'width', 'height'].every((k) => Math.abs(now.normal[k] - before[k]) <= 1), JSON.stringify({ now, before }))
await run.electron.close().catch(() => undefined)
done()
