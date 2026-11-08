// Two Trellis-like touches on the split, keeping the Dia drop: a pane opened by
// dropping a note at the edge grows out of the carried card from where it was
// let go; and while a divider is dragged each page keeps its width (no line
// rewraps frame by frame), laid out once when it is let go. Frames to QA_SHOTS.
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/split-glide.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const { check, done } = checks()
const c = await sandbox({ width: 1400, height: 880 })
const { h, v } = c
const wait = (ms) => h.waitForTimeout(ms)
const shots = process.env.QA_SHOTS
const shot = async (name) => shots && h.screenshot({ path: `${shots}/glide-${name}.png` })
try {
  await v('settings:set', { sounds: false, hintRate: 0 })
  const reading = (await v('items', 'article')).find((one) => one.title === "Michelangelo's Sistine ceiling: a reading note")
  await c.send('article', reading.id); await wait(1800)
  const pin = h.locator('[data-drag-open]').first()
  const area = await h.evaluate(() => { const b = document.querySelector('[data-split-area]').getBoundingClientRect(); return { right: b.right, top: b.top, bottom: b.bottom } })
  const a = await pin.boundingBox()
  await h.mouse.move(a.x + 30, a.y + a.height / 2); await h.mouse.down()
  await h.mouse.move(a.x + 40, a.y + a.height / 2 + 10, { steps: 4 })
  const y = (area.top + area.bottom) / 2
  await h.mouse.move(area.right - 320, y, { steps: 10 }); await h.mouse.move(area.right - 40, y, { steps: 6 })
  for (let i = 0; i <= 6; i++) { await h.mouse.move(area.right - 40 + 4 * i, y, { steps: 3 }); await wait(60) }
  await wait(200)
  const card = await h.evaluate(() => { const r = document.querySelector('[data-split-card]')?.getBoundingClientRect(); return r && { x: r.x, w: r.width } })
  // Every frame until 400ms after the new pane is there (opening it can stall the page first), sampled in the page itself.
  await h.evaluate(() => { window.__glide = []; const t0 = performance.now(); const tick = () => { const last = [...document.querySelectorAll('[data-pane-card]')].at(-1); window.__glide.push({ t: Math.round(performance.now() - t0), w: last ? Math.round(last.getBoundingClientRect().width) : 0, n: document.querySelectorAll('[data-pane-card]').length }); const opened = window.__glide.find((one) => one.n === 2); if (!opened || performance.now() - t0 - opened.t < 400) requestAnimationFrame(tick) }; requestAnimationFrame(tick) })
  await h.mouse.up()
  const frames = []
  for (let i = 0; i < 8; i++) {
    frames.push(await h.evaluate(() => { const cards = [...document.querySelectorAll('[data-pane-card]')]; const last = cards.at(-1); return { panes: cards.length, transform: last ? getComputedStyle(last).transform : null, w: last ? Math.round(last.getBoundingClientRect().width) : 0, x: last ? Math.round(last.getBoundingClientRect().x) : 0 } }))
    if (i === 1) await shot('growing')
    await wait(35)
  }
  console.log('CARD', JSON.stringify(card), 'FRAMES', JSON.stringify(frames))
  const seen = await h.evaluate(() => window.__glide)
  console.log('EVERY FRAME', JSON.stringify(seen))
  const growing = seen.filter((one) => one.n === 2 && one.w > 80 && one.w < 540)
  check('it grows over several frames, not in one jump', growing.length >= 4, `${growing.length} frames between the card's size and the pane's`)
  check('the drop adds a pane', frames.at(-1).panes === 2)
  check('which starts small, where the card was let go', frames.slice(0, 3).some((one) => one.transform !== 'none' && one.w < frames.at(-1).w * 0.8), JSON.stringify(frames.slice(0, 3)))
  check('and settles at its place, untransformed', frames.at(-1).transform === 'none')
  await wait(600); await shot('landed')

  // The divider: the left page keeps its lines while dragged, rewraps once on letting go.
  const lines = () => h.evaluate(() => { const p = document.querySelector('[data-pane-card] .ProseMirror p'); return p ? Math.round(p.getBoundingClientRect().height) : 0 })
  const before = await lines()
  const d = await h.locator('[data-pane-divider]').first().boundingBox()
  await h.mouse.move(d.x + d.width / 2, d.y + d.height / 2); await h.mouse.down()
  await h.mouse.move(d.x - 260, d.y + d.height / 2, { steps: 12 }); await wait(200)
  const during = await lines(); await shot('divider-held')
  await h.mouse.up(); await wait(400)
  const after = await lines(); await shot('divider-let-go')
  check('while the divider moves the page keeps its lines', during === before, `${before} -> ${during}`)
  check('let go, it is laid out once for its new width', after > before, `${before} -> ${after}`)
  check('no page errors', !c.errors.some((one) => /PAGEERROR/.test(one)), c.errors.join(' / ').slice(0, 300))
} finally {
  await c.close()
}
done()
