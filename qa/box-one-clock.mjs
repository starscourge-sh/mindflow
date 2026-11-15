// Quick capture changing size by a key, on one clock: a second line turning the pill into the box, lines written until
// it grows, and ⌃⇧F out and back. Every frame read: the window's frame (main), the card and each round control (the
// page), the frost's shapes as main last applied them. Checked, for each change:
// - the window keeps its frame (main never glides it while the page lays itself out after it);
// - the card goes from its old height to its new one in a single frame, never through heights between;
// - the round controls are at their new place in the frame the card changes, never gliding after it;
// - landed, the frost is under the card and every control.
// premium-pass before QC2: main glided the window 240 ms, the card following it frame by frame, the controls on a
// 260 ms clock of their own.
//   QA_DATA=<copy> QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox node qa/box-one-clock.mjs
// QA_SHOTS=dir: every frame of each change with the frost's shapes in red and the card in green, a sheet per change.
// QA_LOOK=dark|light (default dark).
import { mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'
import { CALM_HOUR, sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'
process.env.HALIGTREE_QA_VIRTUAL ??= '1'

const shots = process.env.QA_SHOTS
const c = await sandbox({ width: 1100, height: 760, at: CALM_HOUR })
const { page, v, electron } = c
const results = []
const check = (name, ok, detail = '') => (results.push(!!ok), console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`))
const wait = (ms) => page.waitForTimeout(ms)
const EDITOR = '.tiptap.ProseMirror.haligtree-editor'

try {
  await v('settings:set', { hintRate: 0, rotCount: 0, sounds: false, boxOneLine: true, boxGlance: false })
  await c.look(process.env.QA_LOOK === 'light' ? 'light' : 'dark')
  await electron.evaluate(({ ipcMain, BrowserWindow }) => {
    globalThis.__glass = []
    globalThis.__frames = []
    const find = () => BrowserWindow.getAllWindows().find((w) => !/view=/.test(w.webContents.getURL()))
    ipcMain.on('glass:shapes', (event, _dark, shapes) => find()?.webContents === event.sender && globalThis.__glass.push([Date.now(), shapes]))
    let last = ''
    setInterval(() => {
      const win = find()
      if (!win) return
      const b = BrowserWindow.prototype.getBounds.call(win)
      const said = `${b.x},${b.y},${b.width},${b.height}`
      if (said !== last) (last = said), globalThis.__frames.push([Date.now(), b])
    }, 4)
  })
  await page.evaluate(() => window.api.showPrompt())
  await wait(1200)
  await page.click(EDITOR)
  await page.keyboard.press('Meta+a')
  await page.keyboard.press('Backspace')
  await wait(400)
  check('opens as the one-line pill', await page.evaluate(() => !!document.querySelector('.app-container[data-pill]')))

  const watch = () => page.evaluate(() => {
    window.__seen = []
    const r = (el) => { const b = el.getBoundingClientRect(); return [b.left, b.top, b.width, b.height].map((n) => Math.round(n * 10) / 10) }
    const tick = () => {
      const card = document.querySelector('.app-container')
      window.__seen.push({ t: Date.now(), card: r(card), vw: innerWidth, vh: innerHeight, pill: !!document.querySelector('.app-container[data-pill]'), controls: [...document.querySelectorAll('.mf-top [data-aside] > *, .mf-top .mf-pill button')].filter((one) => one.offsetWidth > 0).map(r) })
      window.__watching = requestAnimationFrame(tick)
    }
    tick()
  })
  const seen = () => page.evaluate(() => (cancelAnimationFrame(window.__watching), window.__seen))
  const mainLog = () => electron.evaluate(() => ({ glass: globalThis.__glass, frames: globalThis.__frames }))
  const same = (s, r, by = 1) => Math.abs(s[0] - r[0]) <= by && Math.abs(s[1] - r[1]) <= by && Math.abs(s[2] - r[2]) <= by && Math.abs(s[3] - r[3]) <= by

  /** One change by a key, every frame read until well after it lands. */
  const change = async (name, act, settle = 900) => {
    const log0 = await mainLog()
    if (shots) await electron.evaluate(({ BrowserWindow }) => {
      globalThis.__film = []
      BrowserWindow.getAllWindows().find((w) => !/view=/.test(w.webContents.getURL())).webContents.beginFrameSubscription(false, (image) => globalThis.__film.push([Date.now(), image.toPNG().toString('base64'), image.getSize()]))
    })
    await watch()
    const before = await page.evaluate(() => Date.now())
    await act()
    await wait(settle)
    const frames = await seen()
    const log = await mainLog()
    const film = shots ? await electron.evaluate(({ BrowserWindow }) => (BrowserWindow.getAllWindows().find((w) => !/view=/.test(w.webContents.getURL())).webContents.endFrameSubscription(), globalThis.__film)) : []
    const moves = log.frames.slice(log0.frames.length)
    const glass = log.glass.slice(log0.glass.length)
    const glassBefore = log0.glass.at(-1) ?? null
    const heights = frames.map((f) => f.card[3])
    const from = heights[0]
    const to = heights.at(-1)
    // The frames the card's height changed in; a glide changes it in frames one after another.
    const steps = heights.flatMap((h, i) => (i > 0 && Math.abs(h - heights[i - 1]) > 1 ? [i] : []))
    const glides = steps.filter((i, k) => k > 0 && steps[k - 1] === i - 1)
    const ctrlAt = (f) => JSON.stringify(f.controls.map((one) => one.slice(0, 2).map(Math.round)))
    const ctrlSteps = frames.flatMap((f, i) => (i > 0 && ctrlAt(f) !== ctrlAt(frames[i - 1]) ? [i] : []))
    const apart = ctrlSteps.filter((i) => !steps.includes(i))
    const end = frames.at(-1)
    const frostEnd = ([...glass].reverse()[0] ?? glassBefore)?.[1] ?? []
    const covered = [end.card, ...end.controls].every((r) => frostEnd.some((s) => same(s, r)))
    console.log(`  ${name}: card ${from} to ${to} high, ${frames.length} frames, heights ${steps.map((i) => heights[i]).join(' ')}, window frame changed ${moves.length} times`)
    check(`${name}: the window keeps its frame`, moves.length === 0, moves.map(([t, b]) => `${t - before} ms: ${b.width}x${b.height}`).slice(0, 4).join(', '))
    check(`${name}: the card's height changes in single frames, never gliding`, Math.abs(to - from) > 1 && !glides.length, `${steps.length} changes, ${glides.length} in a row with the one before`)
    check(`${name}: the round controls move only in a frame the card changes`, !apart.length, `${apart.length} frames apart from the card's (${ctrlSteps.join(',')} against ${steps.join(',')})`)
    check(`${name}: landed, the frost under the card and every control`, covered, `${frostEnd.length} shapes for ${1 + end.controls.length} surfaces`)
    if (shots && film.length) {
      mkdirSync(shots, { recursive: true })
      const frostAt = (t) => [...glass].reverse().find(([at]) => at <= t)?.[1] ?? glassBefore?.[1] ?? []
      const cells = film.filter(([t]) => t >= before - 40 && t <= before + 500).map(([t, png, size], i) => {
        const file = `${name}-${String(i).padStart(2, '0')}.png`
        writeFileSync(join(shots, file), Buffer.from(png, 'base64'))
        const near = frames.reduce((a, f) => (Math.abs(f.t - t) < Math.abs(a.t - t) ? f : a), frames[0])
        const k = size.width / near.vw
        const rects = frostAt(t).map((s) => `<rect x="${s[0] * k}" y="${s[1] * k}" width="${s[2] * k}" height="${s[3] * k}" rx="${s[4] * k}" fill="none" stroke="red" stroke-width="2"/>`).join('')
        const card = `<rect x="${near.card[0] * k}" y="${near.card[1] * k}" width="${near.card[2] * k}" height="${near.card[3] * k}" fill="none" stroke="lime" stroke-width="1.5" stroke-dasharray="6 4"/>`
        return `<figure><div style="position:relative"><img src="${file}" width="${size.width / 2}"><svg viewBox="0 0 ${size.width} ${size.height}" style="position:absolute;inset:0;width:100%;height:100%">${rects}${card}</svg></div><figcaption>${t - before} ms</figcaption></figure>`
      })
      writeFileSync(join(shots, `${name}.html`), `<!doctype html><body style="margin:0;background:#888;font:12px system-ui;display:grid;grid-template-columns:repeat(4,1fr);gap:6px;padding:6px">${cells.join('')}</body>`)
    }
  }

  const type = (text) => page.keyboard.type(text, { delay: 20 })
  await type('A first line')
  await wait(500)
  await change('second-line', async () => { await page.keyboard.press('Shift+Enter'); await type('two') })
  // Lines written until the box grows past its first height.
  await change('lines', async () => { for (const n of ['three', 'four', 'five', 'six', 'seven', 'eight']) (await page.keyboard.press('Enter'), await type(n)) }, 1200)
  await change('expand', () => page.keyboard.press('Control+Shift+F'))
  await change('expand-back', () => page.keyboard.press('Control+Shift+F'))
  await change('back-to-pill', async () => { await page.keyboard.press('Meta+a'); await page.keyboard.press('Backspace'); await type('one line') }, 1200)
  const errors = c.errors.filter((one) => !/Autofill|DevTools/.test(one))
  check('no page errors', !errors.length, errors.slice(0, 2).join(' / '))
} finally {
  await c.close()
}
const passed = results.filter(Boolean).length
console.log(`\n${passed}/${results.length} passed`)
process.exit(passed === results.length ? 0 : 1)
