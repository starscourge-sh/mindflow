// The main window opens large, like Spotify's: the first time it fills the
// usable part of the screen (under the menu bar, beside the Dock), not full
// screen. Resized and put away, it comes back that size; started again, it
// opens where it was left. A place on a screen that is gone is not used.
//
//   npx electron-vite build --outDir out-x
//   QA_DATA=$(mktemp -d) QA_ENTRY=out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/main-window-open.mjs   (no sandbox)
import { writeFileSync } from 'fs'
import { join } from 'path'
import { open, checks } from './harness.mjs'

process.env.HALIGTREE_QA_VIRTUAL ??= '1'
const { check, done } = checks()
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const home = (electron) => electron.evaluate(({ BrowserWindow, screen }) => {
  const win = BrowserWindow.getAllWindows().find((one) => one.webContents.getURL().includes('view=home'))
  return win ? { b: win.getBounds(), full: win.isFullScreen(), visible: win.isVisible(), work: screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea } : null
})
const until = async (electron, test) => { for (let i = 0; i < 60; i++) { const now = await home(electron); if (now && test(now)) return now; await wait(250) } return home(electron) }

let qa = await open()
let mine = null
try {
  const first = await until(qa.electron, (one) => one.visible)
  check('first open: it fills the usable part of the screen', first && first.b.x === first.work.x && first.b.y === first.work.y && first.b.width === first.work.width && first.b.height === first.work.height, JSON.stringify(first))
  check('first open: not full screen', first && !first.full)
  // Made smaller and moved, as a person would, then put away with ⌘W and opened again.
  mine = { x: first.work.x + 60, y: first.work.y + 40, width: 900, height: 700 }
  await qa.electron.evaluate(({ BrowserWindow }, b) => BrowserWindow.getAllWindows().find((one) => one.webContents.getURL().includes('view=home')).setBounds(b), mine)
  await wait(900)
  await qa.electron.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((one) => one.webContents.getURL().includes('view=home')).close())
  await wait(400)
  await qa.electron.evaluate(({ app }) => app.emit('activate'))
  const back = await until(qa.electron, (one) => one.visible)
  check('put away and opened again: the size and place it was left at', back && back.b.width === 900 && back.b.height === 700 && back.b.x === mine.x && back.b.y === mine.y, JSON.stringify(back?.b))
} finally {
  try { await qa.close() } catch {}
  try { qa.electron.process().kill('SIGKILL') } catch {}
}
await wait(800)

// Started again over the same data: where it was left.
qa = await open()
try {
  const again = await until(qa.electron, (one) => one.visible)
  check('started again: it opens where it was left', again && mine && again.b.width === 900 && again.b.height === 700 && again.b.x === mine.x && again.b.y === mine.y, JSON.stringify(again?.b))
} finally {
  try { await qa.close() } catch {}
  try { qa.electron.process().kill('SIGKILL') } catch {}
}
await wait(800)

// A place on a screen that is no longer there: it fills the screen in view instead.
writeFileSync(join(process.env.QA_DATA, 'main-window.json'), JSON.stringify({ x: 40000, y: 40000, width: 900, height: 700 }))
qa = await open()
try {
  const lost = await until(qa.electron, (one) => one.visible)
  check('a place off every screen is not used: it fills the screen in view', lost && lost.b.x === lost.work.x && lost.b.width === lost.work.width, JSON.stringify(lost?.b))
} finally {
  try { await qa.close() } catch {}
  try { qa.electron.process().kill('SIGKILL') } catch {}
}
done()
