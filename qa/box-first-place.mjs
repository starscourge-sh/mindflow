// The first open of quick capture after a fresh start, filmed every frame (about 16ms): the card comes on screen
// centred in its final place in its first frame and never moves after, for the one-line pill and the full box.
// Runs with the box's window really on screen (HALIGTREE_QA_ONSCREEN) and waiting for ⌘. as a person's does
// (HALIGTREE_QA_COLD). Each frame the page draws gives the card's place on the screen (window.screenX plus the
// card's place in the window); main records each move and resize of the native window too. Frames of the window by
// its own id (screencapture -l) go to the folder given.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox node qa/box-first-place.mjs [frames-dir]
import { mkdirSync, mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { checks } from './harness.mjs'
process.env.QA_ARGS ??= '--sandbox'
const FRAMES = process.argv[2] ?? mkdtempSync(join(tmpdir(), 'haligtree-first-place-'))
mkdirSync(FRAMES, { recursive: true })
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
    // Main's own record of the native window: every move, resize and show, with its real frame (not the card's).
    const id = await c.electron.evaluate(({ BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows().find((w) => !/view=/.test(w.webContents.getURL()) && /index\.html/.test(w.webContents.getURL()))
      globalThis.__native = []
      const real = () => BrowserWindow.prototype.getBounds.call(win)
      for (const name of ['show', 'move', 'resize']) win.on(name, () => globalThis.__native.push({ t: Date.now(), name, ...real() }))
      return win.getMediaSourceId().split(':')[1]
    })
    // What the screen really showed of the window, frame by frame: a capture of the window by its id, as a screen
    // recorder takes it (desktopCapturer), each video frame scanned for the card's left edge (the first bright column)
    // in the window's own width. The page's own record says where it laid the card out; this says what was on screen.
    await c.h.evaluate(async (source) => {
      window.__video = []
      const stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { mandatory: { chromeMediaSource: 'desktop', chromeMediaSourceId: source, maxFrameRate: 60 } } })
      const video = document.createElement('video')
      video.muted = true
      video.srcObject = stream
      await video.play()
      const canvas = document.createElement('canvas')
      const g = canvas.getContext('2d', { willReadFrequently: true })
      const each = (_now, meta) => {
        const w = video.videoWidth, hh = video.videoHeight
        canvas.width = w
        canvas.height = hh
        g.drawImage(video, 0, 0)
        const data = g.getImageData(0, 0, w, hh).data
        let left = -1, top = -1
        for (let y = 0; y < hh; y += 2) {
          for (let x = 0; x < w; x += 1) {
            const i = (y * w + x) * 4
            if (data[i + 3] > 200 && data[i] + data[i + 1] + data[i + 2] > 450) { if (left < 0 || x < left) left = x; if (top < 0) top = y; break }
          }
        }
        window.__video.push({ t: Math.round(performance.timeOrigin + meta.expectedDisplayTime), w, hh, left, top })
        if (window.__video.length < 400) video.requestVideoFrameCallback(each)
      }
      video.requestVideoFrameCallback(each)
      window.__stopVideo = () => stream.getTracks().forEach((one) => one.stop())
    }, `window:${id}:0`).catch((error) => console.log(`  ${shape}: no capture: ${error.message}`))
    const t0 = Date.now()
    await c.h.evaluate(() => window.api.showPrompt())
    await new Promise((r) => setTimeout(r, 1500))
    const video = await c.h.evaluate(() => (window.__stopVideo?.(), window.__video ?? []))
    const n = video.length
    const frames = (await page.evaluate(() => window.__frames)).filter((one) => one.t >= t0)
    const native = await c.electron.evaluate(() => globalThis.__native)
    console.log(`  ${shape}: native window: ${native.map((one) => `${one.t - t0}ms ${one.name} ${one.x},${one.y} ${one.width}x${one.height}`).join(' | ')}`)
    const seen = frames.filter((one, i) => i === 0 || JSON.stringify({ ...one, t: 0 }) !== JSON.stringify({ ...frames[i - 1], t: 0 }))
    console.log(`  ${shape}: ${frames.length} frames; each change: ${seen.map((one) => `${one.t - t0}ms card ${one.x},${one.y} ${one.w}x${one.h} (window x ${one.sx} w ${one.iw}, card at ${one.rl} in it${one.pill ? ', pill' : ''})`).join(' | ')}`)
    const last = frames.at(-1)
    const centre = (one) => one.x + one.w / 2
    const moved = frames.filter((one) => Math.abs(centre(one) - centre(last)) > 1 || Math.abs(one.y - last.y) > 1)
    check(`${shape}: every frame from the first has the card where it ends, centred (${frames.length} frames)`, frames.length > 20 && moved.length === 0, moved.slice(0, 4).map((one) => `${one.t - t0}ms centre ${centre(one)},${one.y} not ${centre(last)},${last.y}`).join(', '))
    // The card's left edge as a share of the window's width, in each captured frame, against where it ends.
    const lit = video.filter((one) => one.left >= 0)
    const share = (one) => one.left / one.w
    const end = lit.at(-1)
    console.log(`  ${shape}: ${n} captured frames; card's left edge in each change: ${lit.filter((one, i) => i === 0 || one.left !== lit[i - 1].left || one.w !== lit[i - 1].w).map((one) => `${one.t - t0}ms ${one.left}/${one.w} at y ${one.top}`).join(' | ')}`)
    const off = lit.filter((one) => Math.abs(share(one) - share(end)) > 0.01 || one.w !== end.w)
    check(`${shape}: every captured frame on screen has the card where it ends (${lit.length} frames)`, lit.length > 5 && off.length === 0, off.slice(0, 4).map((one) => `${one.t - t0}ms left ${one.left}/${one.w}`).join(', '))
  } catch (error) {
    check(`${shape}: ran`, false, error.stack)
  } finally {
    await c.close()
    rmSync(data, { recursive: true, force: true })
  }
}
done()
