// Quick capture kept open (auto-hide off): when you click or switch to something under it or close by, it glides,
// whole and the same size, to the corner of its screen furthest from the pointer. Pointer far away: it stays put.
// The pointer is told to main (screen.getCursorScreenPoint), as a test cannot move the Mac's own.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox node qa/box-step-aside.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'
process.env.HALIGTREE_QA_VIRTUAL ??= '1'
process.env.HALIGTREE_QA_STEPASIDE = '1'
process.env.HALIGTREE_QA_AUTOHIDE = '1'

const { check, done } = checks()
const c = await sandbox({ width: 1100, height: 760 })
const { page, v } = c
const wait = (ms) => page.waitForTimeout(ms)
const box = (fn, arg) => c.electron.evaluate(({ app, BrowserWindow, screen }, [fn, arg]) => {
  const w = BrowserWindow.getAllWindows().find((w) => !w.isDestroyed() && w.webContents.getURL().includes('/index.html'))
  return new Function('w', 'screen', 'BrowserWindow', 'arg', 'app', fn)(w, screen, BrowserWindow, arg, app)
}, [fn, arg])
const at = () => box('return { ...w.getBounds(), area: screen.getDisplayMatching(w.getBounds()).workArea, shown: w.isVisible() }')
// A test run never takes the keys, so leaving is told as the Mac tells it: the pointer somewhere, the box not
// focused, then its blur and the app resigning.
const away = async (px, py) => {
  await box('screen.getCursorScreenPoint = () => arg; w.isFocused = () => false; w.emit("blur"); app.emit("did-resign-active")', { x: Math.round(px), y: Math.round(py) })
  await wait(1100)
}
try {
  await v('settings:set', { hintRate: 0, rotCount: 0, sounds: false, motion: true, boxAutoHide: true, boxPlace: 'last', boxScreen: 'same' })
  await page.evaluate(() => window.api.showPrompt()); await wait(1400)
  // Turned off where the box keeps its own switches: the gear menu's "Close when you click away".
  const boxPage = page
  const line = () => boxPage.getByRole('menuitemcheckbox', { name: /Close when you click away/ })
  await boxPage.getByRole('button', { name: 'Options' }).first().click({ force: true }); await wait(400)
  check('the gear menu has "Close when you click away", ticked to start, with what off does', (await line().getAttribute('aria-checked')) === 'true' && /stays open and steps aside/.test(await line().innerText()), await line().innerText())
  await line().click({ force: true }); await wait(400)
  check('clicked, its tick goes at once', (await line().getAttribute('aria-checked')) === 'false')
  await boxPage.keyboard.press('Escape'); await wait(300)
  await boxPage.getByRole('button', { name: 'Options' }).first().click({ force: true }); await wait(400)
  check('opened again, it is still off', (await line().getAttribute('aria-checked')) === 'false')
  await boxPage.keyboard.press('Escape'); await wait(300)
  let b = await at()
  const mid = { x: Math.round(b.area.x + (b.area.width - b.width) / 2), y: Math.round(b.area.y + (b.area.height - b.height) / 2) }
  await box('w.setPosition(arg.x, arg.y)', mid); await wait(200)
  const size = await at()
  // Pointer just past its bottom right corner: off to the top left.
  await away(mid.x + size.width + 20, mid.y + size.height + 20)
  b = await at()
  check('pointer by its bottom right: it goes to the top left corner, 12px in', b.x === b.area.x + 12 && b.y === b.area.y + 12, JSON.stringify(b))
  check('still open and the same size', b.shown && b.width === size.width && b.height === size.height, JSON.stringify({ b, size }))
  // Pointer on it, near its top left: off to the bottom right.
  await away(b.x + 30, b.y + 30)
  b = await at()
  check('pointer on its top left: it goes to the bottom right corner', b.x === b.area.x + b.area.width - 12 - b.width && b.y === b.area.y + b.area.height - 12 - b.height, JSON.stringify(b))
  // Pointer far from it: it stays.
  const before = b
  await away(b.area.x + 40, b.area.y + 40)
  b = await at()
  check('pointer far away: it stays where it is', b.x === before.x && b.y === before.y, JSON.stringify({ before, b }))
  // Auto-hide on: it puts itself away as before, no glide.
  await v('settings:set', { boxAutoHide: true }); await wait(200)
  await away(b.x + 30, b.y + 30)
  const hid = await at()
  check('with auto-hide on it puts itself away instead', !hid.shown, JSON.stringify(hid))
} catch (error) {
  check('the run finished', false, error.message.split('\n')[0])
} finally {
  await c.close?.()
}
done()
