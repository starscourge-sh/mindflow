// The focus pill opens whole when it sits against the screen's bottom edge (the user, 17 Nov: put at the bottom
// right, its lower half was cut off by the screen as it opened). Its place is kept as the app's own while the window
// stays parked (HALIGTREE_QA_VIRTUAL): put at the bottom right, pointed at, it rises to show whole inside the work
// area, and shuts back to the place it was put.
//   QA_ARGS=--sandbox QA_DATA=<copy of the seeded sandbox> QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/pill-edge.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'
process.env.HALIGTREE_QA_VIRTUAL ??= '1'
const { check, done } = checks()
const c = await sandbox({ width: 1280, height: 800 })
const { electron, v, errors } = c
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const windowOf = async (part) => {
  for (let i = 0; i < 60; i++) {
    const found = electron.windows().find((one) => one.url().includes(part))
    if (found) return found
    await wait(200)
  }
  throw new Error(`no window ${part}`)
}
const placed = () => electron.evaluate(({ BrowserWindow, screen }) => {
  const win = BrowserWindow.getAllWindows().find((one) => one.webContents.getURL().includes('view=focus'))
  const box = win.getBounds()
  return { box, area: screen.getDisplayMatching(box).workArea }
})
try {
  await v('settings:set', { sounds: false, hintRate: 0, countIn: false, focusShows: 'bubble', pillSits: 'free' })
  // Started as a person starts one: ⌘K, "Start focus…", its first length.
  await c.go('today')
  await c.h.keyboard.press('Meta+k'); await wait(700)
  await c.h.keyboard.type('start focus'); await wait(500)
  await c.h.click('[role=dialog] button:has-text("Start focus…")'); await wait(500)
  await c.h.focus('[role=dialog] input'); await c.h.keyboard.type('25'); await wait(300)
  await c.h.keyboard.press('Enter'); await wait(1500)
  const pill = await windowOf('view=focus')
  await wait(2500)
  // At rest first: it opens for a moment as a session begins.
  for (let i = 0; i < 40 && (await placed()).box.height > 110; i++) await wait(250)
  // Put at the bottom right of its screen, as by hand.
  const home = await electron.evaluate(({ BrowserWindow, screen }) => {
    const win = BrowserWindow.getAllWindows().find((one) => one.webContents.getURL().includes('view=focus'))
    const { workArea } = screen.getDisplayMatching(win.getBounds())
    const box = win.getBounds()
    // By its resting height (70): it may be open for a moment as a session begins.
    const to = { x: workArea.x + workArea.width - box.width - 8, y: workArea.y + workArea.height - 70 - 8 }
    win.setPosition(to.x, to.y)
    return to
  })
  await pill.hover('[data-island]')
  await wait(1200)
  const open = await placed()
  const bottom = open.box.y + open.box.height
  check('opened, it is taller than at rest', open.box.height > 110, JSON.stringify(open.box))
  check('opened at the bottom edge, it shows whole inside the screen', open.box.y >= open.area.y && bottom <= open.area.y + open.area.height, JSON.stringify(open))
  await pill.mouse.move(-40, -40)
  await wait(2500)
  const shut = await placed()
  check('shut, it is back where it was put', shut.box.y === home.y && shut.box.x === home.x, JSON.stringify({ shut: shut.box, home }))
  check('no page errors', !errors.length, errors.slice(0, 3).join(' | '))
} catch (error) {
  check('the probe ran to its end', false, error.message)
} finally {
  await c.close()
  done()
}
