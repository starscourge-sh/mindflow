/**
 * ⌘O in quick capture: the box glides a little toward the main window and
 * fades, then the main window opens on the same note and the box goes back
 * to its own place, unseen, for next time.
 *
 *   QA_ENTRY=out-x/main/index.js node qa/box-promote.mjs
 */
import { open } from './harness.mjs'

const h = await open()
const { page, electron } = h
let failed = 0
const check = (name, ok, detail = '') => (ok || failed++, console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`))
const wait = (ms) => page.waitForTimeout(ms)

await h.reset()
await h.type(['A thought to open in the main window'])
await wait(900)
const box = () => electron.evaluate(({ BrowserWindow }) => {
  const one = BrowserWindow.getAllWindows().find((win) => /\.html|^https?:/.test(win.webContents.getURL()) && !/[?&]view=/.test(win.webContents.getURL()))
  return one ? { visible: one.isVisible(), bounds: one.getBounds(), opacity: one.qaOpacity ?? one.getOpacity() } : null
})
const before = await box()
// ⌘O is heard by the main process before the page (before-input-event),
// which a test's key never reaches: send what it sends.
await electron.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((win) => /\.html|^https?:/.test(win.webContents.getURL()) && !/[?&]view=/.test(win.webContents.getURL()))?.webContents.send('box:promote-asked'))
for (let i = 0; i < 6; i++) { await wait(300); if (process.env.DEBUG) console.log('t', (i + 1) * 300, JSON.stringify(await box())) }
const after = await box()
const home = await electron.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().some((win) => win.webContents.getURL().includes('view=home') && win.isVisible()))
check('⌘O opens the main window', home)
const saved = await page.evaluate(async () => JSON.stringify(await window.api.captures.list()).includes('A thought to open'))
check('what was written is saved as a capture first', saved)
check('the box is put away', after && !after.visible, JSON.stringify(after?.visible))
check('the box is back in its own place for next time', after && JSON.stringify(after.bounds) === JSON.stringify(before?.bounds), `${JSON.stringify(before?.bounds)} → ${JSON.stringify(after?.bounds)}`)
check('the box is fully opaque again', after?.opacity === 1, String(after?.opacity))

await h.close()
console.log(failed ? `${failed} failed` : 'all passed')
process.exit(failed ? 1 : 0)
