// Stickies and AeroSpace, and one window per sticky:
// - a sticky moved by a window manager (no drag by hand: AeroSpace hiding it
//   on another workspace, in the screen's corner) is left where it was put,
//   never pulled back on screen (that fought AeroSpace and glitched), and its
//   own place is not changed; parked like that, it is moved to the workspace
//   in view (AeroSpace's calls are played by the probe here, never the Mac's);
// - each sticky has exactly one window, a stray copy is closed;
// - dragged by hand into line with the screen's edge, the trackpad taps once,
//   and again only after leaving the line and coming back (haptic.ts).
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-x/main/index.js MINDFLOW_QA_AWAY=1 node qa/sticky-follow.mjs
import { sandbox } from './sandbox-lib.mjs'
import { checks } from './harness.mjs'

process.env.MINDFLOW_QA_VIRTUAL ??= '1'
process.env.MINDFLOW_QA_FOLLOW ??= '1'
const { check, done } = checks()
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const c = await sandbox()
const { electron, v } = c
try {
  // AeroSpace's answers, and its calls written down instead of run.
  await electron.evaluate(({ screen }) => {
    globalThis.qaCursor = null
    globalThis.qaButton = false
    globalThis.qaAero = []
    const real = screen.getCursorScreenPoint.bind(screen)
    screen.getCursorScreenPoint = () => globalThis.qaCursor ?? real()
    const cp = process.getBuiltinModule('child_process')
    const exec = cp.execFile
    cp.execFile = function (file, args, ...rest) {
      const done = rest.find((one) => typeof one === 'function')
      if (String(file).endsWith('/aerospace')) {
        globalThis.qaAero.push(args.join(' '))
        const out = args[0] === 'list-workspaces' ? '2\n' : args[0] === 'list-windows' ? (globalThis.qaRows ?? '') : ''
        setTimeout(() => done?.(null, out, ''), 5)
        return { kill() {} }
      }
      if (file === 'osascript' && String(args).includes('pressedMouseButtons')) {
        setTimeout(() => done(null, globalThis.qaButton ? '1\n' : '0\n', ''), 50)
        return { kill() {} }
      }
      return exec.call(this, file, args, ...rest)
    }
  })
  await wait(2500)
  const today = () => electron.evaluate(({ BrowserWindow, screen }) => {
    const w = BrowserWindow.getAllWindows().find((one) => !one.isDestroyed() && one.webContents.getURL().includes('view=sticky') && one.webContents.getURL().includes('type=today'))
    return w ? { id: w.id, b: w.getBounds(), media: w.getMediaSourceId().split(':')[1], work: screen.getDisplayMatching(w.getBounds()).workArea, bounds: screen.getDisplayMatching(w.getBounds()).bounds } : null
  })
  const saved = () => electron.evaluate(({ app }) => JSON.parse(process.getBuiltinModule('fs').readFileSync(process.getBuiltinModule('path').join(app.getPath('userData'), 'stickies.json'), 'utf8')).find((one) => one.type === 'today')?.bounds)
  const t = await today()
  const before = await saved()
  await electron.evaluate((_, [pid, media]) => (globalThis.qaRows = `${media}|${pid}|1\n999|${pid}|1\n`), [await electron.evaluate(() => process.pid), t.media])

  // AeroSpace parks it in the screen's bottom right corner, with no drag by hand.
  const corner = { x: t.bounds.x + t.bounds.width - 1, y: t.bounds.y + t.bounds.height - 1 }
  await electron.evaluate(({ BrowserWindow }, [id, p]) => { const w = BrowserWindow.fromId(id); w.setPosition(p.x, p.y); w.emit('move'); w.emit('moved') }, [t.id, corner])
  await wait(1500)
  const after = await today()
  check('moved by a window manager, it is left where it was put, not pulled back', after.b.x === corner.x && after.b.y === corner.y, JSON.stringify([after.b, corner]))
  check('and its own place is not changed', JSON.stringify(await saved()) === JSON.stringify(before), JSON.stringify([await saved(), before]))
  const calls = await electron.evaluate(() => globalThis.qaAero)
  check('parked, it is moved to the workspace in view, only it', calls.includes(`move-node-to-workspace --window-id ${t.media} 2`) && !calls.some((one) => one.includes('--window-id 999')), calls.join(' | '))
  // Moved somewhere still on screen by a manager: left alone, nothing sent.
  await electron.evaluate(() => (globalThis.qaAero = []))
  await electron.evaluate(({ BrowserWindow }, [id, b]) => { const w = BrowserWindow.fromId(id); w.setPosition(b.x + 300, b.y + 200); w.emit('moved') }, [t.id, t.work])
  await wait(1000)
  check('moved within the screen by a manager: left there, nothing sent to AeroSpace', (await today()).b.x === t.work.x + 300 && !(await electron.evaluate(() => globalThis.qaAero.length)))

  // One window per sticky: stuck again and again, made again as glass and back, a stray copy closed.
  for (let i = 0; i < 3; i++) await c.h.evaluate(() => window.api.stick('today', 'today', true))
  await v('settings:set', { stickiesGlass: true }); await wait(1500)
  await v('settings:set', { stickiesGlass: false }); await wait(1500)
  await electron.evaluate(({ BrowserWindow }) => {
    const own = BrowserWindow.getAllWindows().find((one) => one.webContents.getURL().includes('type=today'))
    const stray = new BrowserWindow({ show: false, webPreferences: { preload: own.webContents.session.getPreloads?.()[0] } })
    stray.loadURL(own.webContents.getURL())
  })
  await wait(1500)
  await c.h.evaluate(() => window.api.stick('today', 'today', false)); await wait(800)
  await c.h.evaluate(() => window.api.stick('today', 'today', true)); await wait(2000)
  const count = await electron.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().filter((one) => !one.isDestroyed() && one.webContents.getURL().includes('view=sticky') && one.webContents.getURL().includes('type=today')).length)
  check('each sticky has exactly one window, a stray copy closed', count === 1, `${count} windows for Today`)

  // Dragged by hand toward the right edge: one tap as it comes into line, none while it stays, one more after leaving and coming back.
  const now = await today()
  const taps0 = await electron.evaluate(() => globalThis.vigilTaps())
  const tapsAfter = await electron.evaluate(async ({ BrowserWindow }, [id, work]) => {
    const w = BrowserWindow.fromId(id)
    const b = w.getBounds()
    const lineX = work.x + work.width - 8 - (b.width - 20)
    const path = [lineX - 200, lineX - 120, lineX - 40, lineX - 6, lineX - 3, lineX, lineX - 80, lineX - 160, lineX - 4]
    const counts = []
    globalThis.qaButton = true
    w.setPosition(path[0], work.y + 640)
    w.emit('will-move', { preventDefault() {} }, w.getBounds())
    for (const x of path) {
      w.setPosition(x, work.y + 640)
      globalThis.qaCursor = { x: x + 60, y: work.y + 670 }
      w.emit('moved')
      await new Promise((r) => setTimeout(r, 90))
      counts.push(globalThis.vigilTaps())
    }
    globalThis.qaButton = false
    return counts
  }, [now.id, now.work])
  const added = tapsAfter.map((n) => n - taps0)
  check('dragged into line with the edge: one tap, none while it stays in line, one more coming back', added[2] === 0 && added[3] === 1 && added[5] === 1 && added[7] === 1 && added[8] === 2, JSON.stringify(added))
  check('no errors on the page', !c.errors.length, c.errors.join(' | '))
} finally {
  await c.close()
}
done()
