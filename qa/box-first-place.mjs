// The first open of quick capture after a fresh start, filmed every frame (about 16ms): the card comes on screen
// centred in its final place in its first frame and never moves after, for the one-line pill and the full box.
// Runs with the box's window really on screen (HALIGTREE_QA_ONSCREEN) and waiting for ⌘. as a person's does
// (HALIGTREE_QA_COLD). Each frame the page draws gives the card's place on the screen (window.screenX plus the
// card's place in the window); main records the native window's frame as ⌘. is pressed and each move and resize after.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox node qa/box-first-place.mjs
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { checks } from './harness.mjs'
process.env.QA_ARGS ??= '--sandbox'
const { CALM_HOUR, sandbox } = await import('./sandbox-lib.mjs')
const { check, done } = checks()
const box = async (c) => {
  for (let i = 0; i < 100; i++) {
    const page = c.electron.windows().find((w) => /index\.html/.test(w.url()) && !/view=/.test(w.url()))
    if (page) return page
    await new Promise((r) => setTimeout(r, 200))
  }
  throw new Error('no quick capture window')
}

const shapes = (process.env.QA_SHAPES ?? 'pill,box').split(',')
for (const [shape, oneLine] of [['pill', true], ['box', false]].filter(([one]) => shapes.includes(one))) {
  // A first run sets the shape, kept for the next start.
  const data = mkdtempSync(join(tmpdir(), 'haligtree-qa-'))
  process.env.QA_DATA = data
  delete process.env.HALIGTREE_QA_ONSCREEN
  delete process.env.HALIGTREE_QA_COLD
  let c = await sandbox({ width: 1100, height: 760, at: CALM_HOUR })
  await c.v('settings:set', { hintRate: 0, rotCount: 0, sounds: false, boxOneLine: oneLine })
  await new Promise((r) => setTimeout(r, 1500))
  await c.close()
  // The second start: the box's window on screen for real, shown only when asked.
  process.env.HALIGTREE_QA_ONSCREEN = '1'
  process.env.HALIGTREE_QA_COLD = '1'
  c = await sandbox({ width: 1100, height: 760, at: CALM_HOUR })
  try {
    const page = await box(c)
    await page.waitForLoadState('domcontentloaded')
    await new Promise((r) => setTimeout(r, 2500))
    const visible = await c.electron.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().filter((w) => !/view=/.test(w.webContents.getURL())).map((w) => w.isVisible()))
    console.log(`  ${shape}: the box's window shown before the open: ${JSON.stringify(visible)}`)
    await page.evaluate(() => {
      window.__frames = []
      const tick = () => {
        const card = document.querySelector('.app-container')
        if (document.visibilityState === 'visible' && card) {
          const r = card.getBoundingClientRect()
          window.__frames.push({ t: Math.round(performance.timeOrigin + performance.now()), x: Math.round(window.screenX + r.left), y: Math.round(window.screenY + r.top), w: Math.round(r.width), h: Math.round(r.height), sx: window.screenX, iw: window.innerWidth, rl: Math.round(r.left), pill: !!document.querySelector('.app-container[data-pill]') })
        }
        requestAnimationFrame(tick)
      }
      tick()
    })
    // Main's own record of the native window: its real frame (not the card's) as ⌘. is pressed, as it shows, and at
    // every move or resize after. Any change of frame from the press on can be drawn a frame late, the page's last
    // picture at the old size and place: the card seen off to the left, then jumping (the user's report).
    const before = await c.electron.evaluate(({ BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows().find((w) => !/view=/.test(w.webContents.getURL()) && /index\.html/.test(w.webContents.getURL()))
      globalThis.__native = []
      const real = () => BrowserWindow.prototype.getBounds.call(win)
      globalThis.__t0 = Date.now()
      for (const name of ['show', 'move', 'resize']) win.on(name, () => globalThis.__native.push({ t: Date.now() - globalThis.__t0, name, ...real() }))
      return real()
    })
    const t0 = Date.now()
    await c.h.evaluate(() => window.api.showPrompt())
    await new Promise((r) => setTimeout(r, 1500))
    const frames = (await page.evaluate(() => window.__frames)).filter((one) => one.t >= t0)
    const native = await c.electron.evaluate(() => globalThis.__native)
    const [after, middle] = await c.electron.evaluate(({ BrowserWindow, screen }) => { const real = BrowserWindow.prototype.getBounds.call(BrowserWindow.getAllWindows().find((w) => !/view=/.test(w.webContents.getURL()) && /index\.html/.test(w.webContents.getURL()))); const { workArea } = screen.getDisplayMatching(real); return [real, workArea.x + workArea.width / 2] })
    const box4 = (one) => `${one.x},${one.y} ${one.width}x${one.height}`
    console.log(`  ${shape}: native window as ⌘. is pressed ${box4(before)}; then ${native.map((one) => `${one.t}ms ${one.name} ${box4(one)}`).join(' | ') || 'nothing'}; after ${box4(after)}`)
    const changed = native.filter((one) => one.name !== 'show')
    check(`${shape}: the native window is already its final size and place when ⌘. is pressed, and never moves or resizes after`, changed.length === 0 && box4(before) === box4(after), changed.map((one) => `${one.t}ms ${one.name} ${box4(one)}`).join(', '))
    const seen = frames.filter((one, i) => i === 0 || JSON.stringify({ ...one, t: 0 }) !== JSON.stringify({ ...frames[i - 1], t: 0 }))
    console.log(`  ${shape}: ${frames.length} frames; each change: ${seen.map((one) => `${one.t - t0}ms card ${one.x},${one.y} ${one.w}x${one.h} (window x ${one.sx} w ${one.iw}, card at ${one.rl} in it${one.pill ? ', pill' : ''})`).join(' | ')}`)
    const last = frames.at(-1)
    const centre = (one) => one.x + one.w / 2
    const moved = frames.filter((one) => Math.abs(centre(one) - centre(last)) > 1 || Math.abs(one.y - last.y) > 1)
    check(`${shape}: the card's first frame is where it ends, centred on the screen, and it never moves (${frames.length} frames)`, frames.length > 20 && moved.length === 0 && Math.abs(centre(frames[0]) - middle) <= 1, `first centre ${frames[0] && centre(frames[0])}, screen centre ${middle}; ${moved.slice(0, 4).map((one) => `${one.t - t0}ms centre ${centre(one)},${one.y} not ${centre(last)},${last.y}`).join(', ')}`)
  } catch (error) {
    check(`${shape}: ran`, false, error.stack)
  } finally {
    await c.close()
    rmSync(data, { recursive: true, force: true })
  }
}
done()
