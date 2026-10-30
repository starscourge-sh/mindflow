// While the welcome runs, the main window fills the screen's work area (maximised, not full screen); when it ends it
// goes back to the size it had, even after a quit halfway through.
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
  return { fills: b.width === area.width && b.height === area.height, full: one.isFullScreen(), normal: b }
})

// First run: the welcome opens by itself, the window filling the screen.
let run = await open()
let h = await home(run.electron)
await h.waitForSelector('.mf-welcome', { timeout: 15000 })
await wait(800)
let now = await win(run.electron)
check('the welcome fills the work area, not full screen', now.fills && !now.full, JSON.stringify(now))
// Quit halfway.
await run.electron.close().catch(() => undefined)

// Opened again: the welcome comes back, still filling the screen; skipped, the window is its old size.
run = await open()
h = await home(run.electron)
await h.waitForSelector('.mf-welcome', { timeout: 15000 })
await wait(800)
now = await win(run.electron)
check('after a quit halfway, the welcome fills the work area again', now.fills && !now.full, JSON.stringify(now))
// Skip goes to the last page; "Start without the tour" ends it.
await h.click('button:has-text("Skip the welcome")')
await wait(1500)
await h.click('button:has-text("Start without the tour")')
await h.waitForSelector('.mf-welcome', { state: 'detached', timeout: 15000 }).catch(() => undefined)
await wait(1200)
now = await win(run.electron)
// Back to a window of its own size, not the screen's. (Its exact size is the one it had as the welcome began, which a
// tiling manager such as AeroSpace may already have set; the size written above is only where it starts.)
check('the welcome over, the window is back to its own size', !now.fills && now.normal.width < 1900, JSON.stringify({ now, before }))
await run.electron.close().catch(() => undefined)
done()
