// Quick capture carried by its grabber follows the page's own pointer events (lib/carry-window.ts), not a timer in main:
// pressed and moved through Chromium's real input path, the box moves by exactly what the pointer moved, at most once
// for each move, never while the pointer rests, and stops when the button comes up. Screen points, so the window
// moving under the pointer does not feed back. Also reports the time from the page hearing a move to main moving the
// window (on a loaded machine the tail is the main thread being busy, not the path).
//
//   npx electron-vite build --outDir out-x
//   QA_ARGS=--sandbox QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/carry-pointer.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'
// Each window keeps the place it is given as its own while parked off screen, so the box can be moved.
process.env.HALIGTREE_QA_VIRTUAL ??= '1'
const { check, done } = checks()
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const c = await sandbox()
const { page, electron } = c
try {
  await page.evaluate(() => window.api.showPrompt())
  await wait(3000)
  await electron.evaluate(({ BrowserWindow }) => {
    const box = BrowserWindow.getAllWindows().find((w) => /\/index\.html(\?|$)/.test(w.webContents.getURL()) && !w.webContents.getURL().includes('view='))
    globalThis.qaBox = box
    globalThis.qaMoves = []
    const set = box.setPosition
    box.setPosition = function (...a) { globalThis.qaMoves.push(Date.now()); return set.apply(this, a) }
    box.setPosition(300, 300)
    globalThis.qaMoves.length = 0
  })
  const at = () => electron.evaluate(() => globalThis.qaBox.getBounds())
  const g = await page.evaluate(() => { const r = document.querySelector('[data-grabber]').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 } })
  await page.evaluate(() => { window.qaHeard = []; window.addEventListener('pointermove', () => window.qaHeard.push(Date.now()), true) })
  const from = await at()
  await page.mouse.move(g.x, g.y)
  await page.mouse.down()
  await wait(100)
  const lat = []
  let moves = 0
  for (let i = 1; i <= 40; i++) {
    await electron.evaluate(() => { globalThis.qaMoves.length = 0 })
    await page.evaluate(() => { window.qaHeard.length = 0 })
    await page.mouse.move(g.x + i * 3, g.y + i)
    await wait(40)
    const heard = await page.evaluate(() => window.qaHeard[0])
    const moved = await electron.evaluate(() => globalThis.qaMoves.slice())
    moves = Math.max(moves, moved.length)
    if (heard && moved[0]) lat.push(moved[0] - heard)
  }
  const carried = await at()
  check('carried 120 points right and 40 down, the box moved exactly that', carried.x - from.x === 120 && carried.y - from.y === 40, JSON.stringify({ dx: carried.x - from.x, dy: carried.y - from.y }))
  check('every move heard moved the window', lat.length === 40, `${lat.length} of 40`)
  check('at most one window move for each pointer move', moves <= 1, `${moves}`)
  await electron.evaluate(() => { globalThis.qaMoves.length = 0 })
  await wait(300)
  check('the pointer resting, nothing moves the window', (await electron.evaluate(() => globalThis.qaMoves.length)) === 0)
  await page.mouse.up()
  await wait(100)
  await page.mouse.move(g.x + 300, g.y + 200)
  await wait(150)
  const after = await at()
  check('let go, the box stays where it was put', after.x === carried.x && after.y === carried.y, JSON.stringify({ carried, after }))
  lat.sort((a, b) => a - b)
  console.log(`latency from the page hearing a move to main moving the window: median ${lat[lat.length >> 1]}ms, p90 ${lat[Math.floor(lat.length * 0.9)]}ms, max ${lat[lat.length - 1]}ms`)
} catch (error) {
  check('the run finished', false, error.message.split('\n')[0])
} finally {
  await c.close?.()
}
done()
