// A test window is never put on the screen, not even for a moment (14 Nov: a welcome probe asked for the whole
// screen; the window was set there and parked after, and in between the user's tiling window manager, AeroSpace,
// took it into their workspace and kept it in a tile for two minutes). Each window asked onto the screen
// (setBounds, setPosition, center) is watched through its own 'move' events, which come while the window is where
// it was set: none may be on the screen. The window watched is the check's own and never shown, so a build that
// still did it is caught without anything showing.
//   QA_DATA=<copy of the seeded sandbox> QA_ARGS=--sandbox QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/never-on-screen.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'
const { check, done } = checks()
const c = await sandbox({ width: 1100, height: 760 })
const { electron } = c
try {
  const seen = await electron.evaluate(({ BrowserWindow, screen }) => {
    const area = screen.getPrimaryDisplay().bounds
    // A window of the check's own, never shown: asked what the app's windows are asked, it is watched even on a build
    // that would put it on the screen, where neither the person nor their window manager can see a hidden window.
    const win = new BrowserWindow({ show: false, width: 400, height: 300 })
    const at = []
    const note = () => at.push(win.getPosition())
    win.on('move', note)
    win.setBounds({ x: area.x + 40, y: area.y + 40, width: 900, height: 700 })
    win.setBounds({ x: area.x + 200, y: area.y + 120 })
    win.setPosition(area.x + 60, area.y + 60)
    win.center()
    win.off('move', note)
    // On the screen: further in than the parked sliver at its right edge.
    const on = at.filter(([x, y]) => x < area.x + area.width - 40 && x > area.x - 900 && y > area.y - 700 && y < area.y + area.height)
    const out = { moves: at.length, on: on.length, first: on[0] ?? null, size: win.getSize(), parked: win.getPosition()[0] === area.x + area.width - 6 }
    win.destroy()
    return [out]
  })
  check('its size is still taken', seen[0].size[0] === 900 && seen[0].size[1] === 700, JSON.stringify(seen[0].size))
  check('no window asked onto the screen is put there, not for a moment', seen.every((one) => one.on === 0), JSON.stringify(seen))
  check('each is parked at the end, at the screen\'s right edge', seen.every((one) => one.parked), JSON.stringify(seen))
} catch (error) {
  check('the run finished', false, String(error?.message ?? error).split('\n')[0])
} finally {
  await c.close()
}
done()
