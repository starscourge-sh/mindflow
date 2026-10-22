// A sticky dragged by hand follows the pointer exactly: no jumps back, no
// shaking toward an edge, no change of size, held the whole way, and it only
// settles (lines up with an edge, the paper tap) once it is let go.
//
// On a Mac, Electron sends 'moved' at every step of a drag, as 'move'. This
// drives a drag the way the Mac does (will-move, then move + moved each frame)
// on a parked window that keeps its place as its own (HALIGTREE_QA_VIRTUAL),
// with the pointer and the mouse button played by the probe, and samples the
// window's bounds every few milliseconds from main. Motion on and off.
//
//   npx electron-vite build --outDir out-x
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/sticky-drag.mjs
import { sandbox } from './sandbox-lib.mjs'
import { checks } from './harness.mjs'

process.env.HALIGTREE_QA_VIRTUAL ??= '1'
const { check, done } = checks()
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

const c = await sandbox()
const { electron, h, v } = c
try {
  // The pointer and the button are the probe's, never the person's at the Mac.
  await electron.evaluate(({ screen }) => {
    globalThis.qaCursor = null
    globalThis.qaButton = false
    const real = screen.getCursorScreenPoint.bind(screen)
    screen.getCursorScreenPoint = () => globalThis.qaCursor ?? real()
    const cp = process.getBuiltinModule('child_process')
    const exec = cp.execFile
    cp.execFile = function (file, args, ...rest) {
      if (file !== 'osascript' || !String(args).includes('pressedMouseButtons')) return exec.call(this, file, args, ...rest)
      const done = rest.find((one) => typeof one === 'function')
      setTimeout(() => done(null, globalThis.qaButton ? '1\n' : '0\n', ''), 100)
      return { kill() {} }
    }
  })
  const stickyWins = () => electron.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().filter((w) => !w.isDestroyed() && w.webContents.getURL().includes('view=sticky')).map((w) => ({ id: w.id, url: w.webContents.getURL() })))
  await v('settings:set', { stickiesGlass: false, motion: true })
  await wait(2500)
  for (let i = 0; i < 20 && (await stickyWins()).length; i++) {
    for (const one of await stickyWins()) {
      const u = new URL(one.url)
      await h.evaluate(([t, id]) => window.api.stick(t, id, false), [u.searchParams.get('type'), u.searchParams.get('id')])
    }
    await wait(600)
  }
  const id = await h.evaluate(() => window.api.captures.create({ title: 'Drag me', body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'A note to move about' }] }] } }))
  await h.evaluate((id) => window.api.stick('capture', id, true), id)
  let page = null
  for (let i = 0; i < 40 && !page; i++) {
    page = electron.windows().find((p) => p.url().includes('view=sticky') && p.url().includes(`id=${id}`)) ?? null
    if (!page) await wait(250)
  }
  await page.waitForLoadState('domcontentloaded')
  await wait(1200)
  const winId = (await stickyWins()).find((one) => one.url.includes(`id=${id}`)).id
  const info = () => electron.evaluate(({ BrowserWindow, screen }, id) => { const w = BrowserWindow.fromId(id); return { b: w.getBounds(), work: screen.getDisplayMatching(w.getBounds()).workArea } }, winId)
  const taps = () => page.evaluate(() => (window.haligtreeHeard ?? []).filter((one) => one === 'paper-tap').length)
  const isHeld = () => page.evaluate(() => !!document.querySelector('[data-held]'))

  // One drag, as the Mac does it: will-move, then each frame the window and pointer move together with move + moved.
  // Bounds sampled every 4ms all along; `deviations` are samples not where the hand has the window.
  const drag = (path, grip) => electron.evaluate(async ({ BrowserWindow }, [id, path, grip]) => {
    const w = BrowserWindow.fromId(id)
    const samples = []
    let hand = path[0]
    const size = { width: w.getBounds().width, height: w.getBounds().height }
    const sample = () => { const b = w.getBounds(); samples.push({ x: b.x, y: b.y, width: b.width, height: b.height, hx: hand.x, hy: hand.y }) }
    const timer = setInterval(sample, 4)
    globalThis.qaCursor = { x: hand.x + grip.x, y: hand.y + grip.y }
    globalThis.qaButton = true
    w.setPosition(hand.x, hand.y)
    w.emit('will-move', { preventDefault() {} }, { ...w.getBounds() })
    for (const step of path.slice(1)) {
      await new Promise((r) => setTimeout(r, 16))
      sample()
      hand = step
      w.setPosition(step.x, step.y)
      globalThis.qaCursor = { x: step.x + grip.x, y: step.y + grip.y }
      w.emit('move')
      w.emit('moved')
      sample()
    }
    // Held still a while, the button still down.
    await new Promise((r) => setTimeout(r, 700))
    clearInterval(timer)
    sample()
    const deviations = samples.filter((one) => one.x !== one.hx || one.y !== one.hy)
    const resized = samples.filter((one) => one.width !== size.width || one.height !== size.height)
    return { count: samples.length, deviations: deviations.length, worst: deviations.reduce((m, one) => Math.max(m, Math.abs(one.x - one.hx) + Math.abs(one.y - one.hy)), 0), resized: resized.length, end: hand }
  }, [winId, path, grip])
  const release = (away) => electron.evaluate((_, away) => {
    globalThis.qaButton = false
    if (away) globalThis.qaCursor = { x: globalThis.qaCursor.x + 300, y: globalThis.qaCursor.y + 200 }
  }, away)
  const line = (from, to, n) => Array.from({ length: n + 1 }, (_, i) => ({ x: Math.round(from.x + ((to.x - from.x) * i) / n), y: Math.round(from.y + ((to.y - from.y) * i) / n) }))
  const grip = { x: 60, y: 30 }

  for (const motion of [true, false]) {
    const tag = motion ? 'Motion on' : 'Motion off'
    await v('settings:set', { motion })
    await wait(400)
    const { b, work } = await info()
    const start = { x: work.x + 300, y: work.y + 200 }
    await electron.evaluate(({ BrowserWindow }, [id, x, y]) => BrowserWindow.fromId(id).setPosition(x, y), [winId, start.x, start.y])
    await wait(200)
    // Pointed at first: it starts to rise (Motion on), and is picked up mid-rise.
    await page.evaluate(() => window.api.lift())
    await wait(60)
    const taps0 = await taps()
    // Toward the right edge, ending 5 points short of the line it would settle on (8 in, card inset 20).
    const nearEdge = { x: work.x + work.width - 8 - (b.width - 20) - 5, y: start.y + 120 }
    const from = (await info()).b
    const one = await drag(line({ x: from.x, y: from.y }, nearEdge, 50), grip)
    check(`${tag}: the window follows the pointer exactly the whole drag`, one.deviations === 0, `${one.deviations} of ${one.count} samples off, worst ${one.worst}pt`)
    check(`${tag}: its size never changes while dragged`, one.resized === 0, `${one.resized} samples resized`)
    check(`${tag}: held the whole way, no paper tap before it is let go`, (await isHeld()) && (await taps()) === taps0, `held ${await isHeld()}, taps ${(await taps()) - taps0}`)
    // Let go without moving the pointer: the Mac is asked, then it lines up 8 points in from the edge.
    await release(false)
    await wait(motion ? 900 : 500)
    const landed = (await info()).b
    check(`${tag}: let go near the edge, it lines up 8 points in`, landed.x + landed.width - 20 === work.x + work.width - 8, `${work.x + work.width - (landed.x + landed.width - 20)}pt in`)
    check(`${tag}: set down with one paper tap`, !(await isHeld()) && (await taps()) === taps0 + 1, `taps ${(await taps()) - taps0}`)
    // The pointer then leaves: it stays put (never set back where it rose from).
    await electron.evaluate(() => { globalThis.qaCursor = { x: 5, y: 5 } })
    await wait(600)
    const after = (await info()).b
    check(`${tag}: stays where it landed once the pointer leaves`, after.x === landed.x && after.y === landed.y, JSON.stringify([landed.x, landed.y, after.x, after.y]))
    // A second drag to the middle, let go with the pointer moving on: it stays exactly where dropped, at once.
    const mid = { x: work.x + Math.round(work.width / 2) - 150, y: work.y + Math.round(work.height / 2) - 110 }
    const two = await drag(line({ x: after.x, y: after.y }, mid, 30), grip)
    check(`${tag}: a second drag follows exactly too`, two.deviations === 0, `${two.deviations} of ${two.count} off, worst ${two.worst}pt`)
    await release(true)
    await wait(300)
    const dropped = (await info()).b
    check(`${tag}: dropped in the open, it stays exactly there`, dropped.x === mid.x && dropped.y === mid.y && !(await isHeld()), JSON.stringify([dropped.x - mid.x, dropped.y - mid.y]))
    // Picked up and put down without moving: set down again where it was, not left held.
    const before = (await info()).b
    await drag([{ x: before.x, y: before.y }], grip)
    await release(false)
    await wait(600)
    const still = (await info()).b
    check(`${tag}: picked up and put down without moving, it is set down in place`, !(await isHeld()) && still.x === before.x && still.y === before.y, `held ${await isHeld()}`)
    // Pushed against the menu bar: the window stops at the top while the pointer goes on up, the button still down.
    const top = { x: still.x, y: work.y }
    const tapsTop = await taps()
    await drag(line({ x: still.x, y: still.y }, top, 20), grip)
    await electron.evaluate(() => { globalThis.qaCursor = { x: globalThis.qaCursor.x, y: globalThis.qaCursor.y - 40 } })
    await wait(700)
    check(`${tag}: held against the menu bar, the pointer past it, it is still held`, (await isHeld()) && (await taps()) === tapsTop, `held ${await isHeld()}, taps ${(await taps()) - tapsTop}`)
    await release(false)
    await wait(motion ? 900 : 500)
    check(`${tag}: let go there, it is set down with one tap`, !(await isHeld()) && (await taps()) === tapsTop + 1, `held ${await isHeld()}, taps ${(await taps()) - tapsTop}`)
  }
} catch (error) {
  check('ran to the end', false, error.message.split('\n')[0])
} finally {
  console.log(c.errors.length ? 'errors: ' + c.errors.slice(0, 3).join(' | ') : 'no page errors')
  await c.close()
  done()
}
