// The arrival's clearings never show as a shape: in light and in dark, while
// the mist lifts, the mist alone (laid over the page's own colour) changes by
// less than a level or two of brightness from any spot to the next, so no
// oval or edge stands out around the first lines. Frames of the mist, its
// contrast raised tenfold, are saved to look at.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-y/main/index.js HALIGTREE_QA_AWAY=1 node qa/welcome-mist-edge.mjs [shots folder] [light|dark]
import { mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'

delete process.env.QA_ARGS
const SHOTS = process.argv[2] ?? ''
const THEME = process.argv[3] ?? 'dark'
if (SHOTS) mkdirSync(SHOTS, { recursive: true })
const { check, done } = checks()
const c = await sandbox({ width: 1440, height: 900, seeded: false })
const { h, errors, close } = c
// The mist over the page's colour, in brightness levels (0 to 255): the steepest change over 40px anywhere, and a picture.
const scan = (picture) => h.evaluate((picture) => {
  const mist = document.querySelector('[data-welcome-mist]')
  if (!mist) return null
  const w = mist.width
  const hh = mist.height
  const data = mist.getContext('2d').getImageData(0, 0, w, hh).data
  const page = getComputedStyle(mist.parentElement).backgroundColor.match(/[\d.]+/g).slice(0, 3).map(Number)
  const base = (page[0] + page[1] + page[2]) / 3
  const level = new Float32Array(w * hh)
  for (let i = 0; i < w * hh; i++) {
    const a = data[i * 4 + 3] / 255
    // Premultiplied away: the colour drawn, laid over the page.
    const tone = (data[i * 4] + data[i * 4 + 1] + data[i * 4 + 2]) / 3
    level[i] = base * (1 - a) + tone * a
  }
  // Averaged over 20px squares (as an eye does; single pixels only show the canvas's rounding), then each square against the ones two along.
  const cell = Math.max(2, Math.round(20 * (w / mist.clientWidth)))
  const cw = Math.floor(w / cell)
  const ch = Math.floor(hh / cell)
  const mean = new Float32Array(cw * ch)
  for (let cy = 0; cy < ch; cy++) for (let cx = 0; cx < cw; cx++) {
    let sum = 0
    for (let y = 0; y < cell; y++) for (let x = 0; x < cell; x++) sum += level[(cy * cell + y) * w + cx * cell + x]
    mean[cy * cw + cx] = sum / (cell * cell)
  }
  let steepest = 0
  for (let cy = 0; cy < ch - 2; cy++) for (let cx = 0; cx < cw - 2; cx++) {
    const here = mean[cy * cw + cx]
    steepest = Math.max(steepest, Math.abs(mean[cy * cw + cx + 2] - here), Math.abs(mean[(cy + 2) * cw + cx] - here))
  }
  let url = ''
  if (picture) {
    const out = document.createElement('canvas')
    out.width = w
    out.height = hh
    const pen = out.getContext('2d')
    const image = pen.createImageData(w, hh)
    for (let i = 0; i < w * hh; i++) {
      const v = Math.max(0, Math.min(255, 128 + (level[i] - base) * 10))
      image.data[i * 4] = image.data[i * 4 + 1] = image.data[i * 4 + 2] = v
      image.data[i * 4 + 3] = 255
    }
    pen.putImageData(image, 0, 0)
    url = out.toDataURL('image/png')
  }
  return { steepest, url, clearing: document.querySelectorAll('[data-mist-clear]').length }
}, picture)
try {
  await c.theme(THEME)
  if (!(await h.$('.mf-welcome'))) await h.evaluate(() => window.dispatchEvent(new CustomEvent('haligtree:welcome')))
  await h.waitForSelector('[data-welcome-mist]', { timeout: 8000 })
  const start = Date.now()
  let worst = 0
  let cleared = 0
  let frame = 0
  while (Date.now() - start < 12000) {
    const now = await scan(!!SHOTS && frame % 3 === 0)
    if (!now) break
    if (now.clearing) worst = Math.max(worst, now.steepest), cleared++
    if (now.url) writeFileSync(join(SHOTS, `mist-${THEME}-${String(frame).padStart(2, '0')}.png`), Buffer.from(now.url.split(',')[1], 'base64'))
    frame++
    await h.waitForTimeout(250)
  }
  check('the lines clear the mist around them', cleared > 3, `${cleared} frames with a clearing`)
  check(`${THEME}: no edge in the mist (under 2 levels over 40px)`, worst < 2, `steepest ${worst.toFixed(2)} levels`)
  check('no page errors', errors.length === 0, errors.join(' | '))
} finally {
  await close()
}
done()
