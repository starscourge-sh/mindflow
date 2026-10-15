// Does the welcome's moving backdrop (welcome-shader.tsx) stay calm and
// readable? Walks every chapter in one theme and window size, and for each:
// screenshots it as a person sees it (words shown), then hides the words and
// measures, pixel by pixel, the contrast of every line of text over the
// backdrop right under it, and again from the shown screenshot itself (the
// line's own drawn ink against the page under it): both must be 4.5:1 or
// more. The page under the waves must stay near the theme's own page colour
// (a dead WebGL canvas once painted a white sheet over a dark page). Then:
// one live canvas with a working context (React's development double mount
// once left a dead one), it sits under the words, a lost context takes its
// canvas off the page at once and a fresh one comes back, the waves follow a
// theme change made live, a still frame with Motion off, and nothing drawn
// while the window is hidden.
//
// Run it on a production build and on a development build (React development
// and StrictMode, as `electron-vite dev` runs it), in a dark theme, Paper and Light.
//
//   npx electron-vite build --outDir out-x && QA_DATA=$(mktemp -d) QA_ENTRY=out-x/main/index.js MINDFLOW_QA_AWAY=1 node qa/welcome-backdrop.mjs [shots-dir] [theme] [brutal|soft] [width] [height] [tag]
import { mkdirSync } from 'fs'
import { sandbox } from './sandbox-lib.mjs'

const [SHOTS = '', THEME = 'paper', STYLE = 'soft', W = '1280', H = '800', TAG = ''] = process.argv.slice(2)
if (SHOTS) mkdirSync(SHOTS, { recursive: true })
const c = await sandbox({ width: Number(W), height: Number(H), seeded: false })
const { h } = c
const tag = `${TAG ? `${TAG}-` : ''}${THEME}${STYLE === 'brutal' ? '-brutal' : ''}-${W}x${H}`
const steps = ['Why', 'You', 'Catch', 'Write', 'Remember', 'Make it yours', 'Ready']
let failed = 0
const say = (ok, line) => (console.log(`${ok ? 'ok  ' : 'FAIL'} ${line}`), ok || failed++)

// Every line of words that sits right on the backdrop (not on a card or a button of its own), its colour and box.
const lines = () => h.evaluate(() => {
  const root = document.querySelector('.mf-welcome')
  const painter = document.createElement('canvas').getContext('2d', { willReadFrequently: true })
  const rgb = (css) => (painter.clearRect(0, 0, 1, 1), (painter.fillStyle = css), painter.fillRect(0, 0, 1, 1), [...painter.getImageData(0, 0, 1, 1).data])
  const out = []
  const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  for (let node = walk.nextNode(); node; node = walk.nextNode()) {
    if (!node.textContent.trim()) continue
    const el = node.parentElement
    const css = getComputedStyle(el)
    if (!el.checkVisibility({ opacityProperty: true, visibilityProperty: true }) || Number(css.opacity) < 0.9) continue
    let bare = true
    for (let at = el; at && at !== root; at = at.parentElement) {
      const bg = rgb(getComputedStyle(at).backgroundColor)
      if (bg[3] > 128 || getComputedStyle(at).backgroundImage !== 'none') bare = false
    }
    if (!bare) continue
    const range = document.createRange()
    range.selectNodeContents(node)
    for (const box of range.getClientRects()) {
      if (box.width < 4 || box.height < 4 || box.bottom < 0 || box.top > innerHeight) continue
      out.push({ text: node.textContent.trim().slice(0, 40), color: rgb(css.color), x: box.left, y: box.top, w: box.width, h: box.height })
    }
  }
  return out
})

// The backdrop alone: everything over it hidden for a moment.
const bare = async () => {
  await h.evaluate(() => document.querySelectorAll('.mf-welcome > :not(:first-child)').forEach((el) => (el.style.visibility = 'hidden')))
  await h.waitForTimeout(80)
  const png = await h.screenshot()
  await h.evaluate(() => document.querySelectorAll('.mf-welcome > :not(:first-child)').forEach((el) => (el.style.visibility = '')))
  return png.toString('base64')
}

// A screenshot's pixels, decoded by Electron itself (BGRA).
const decode = async (png) => {
  const { width, height, data } = await c.electron.evaluate(({ nativeImage }, png) => {
    const img = nativeImage.createFromBuffer(Buffer.from(png, 'base64'))
    const { width, height } = img.getSize()
    return { width, height, data: img.toBitmap().toString('base64') }
  }, png)
  return { width, height, px: Buffer.from(data, 'base64'), k: width / (await h.evaluate(() => innerWidth)) }
}
const lin = (v) => ((v /= 255) <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
const lum = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05) }
const at = ({ px, width }, x, y) => { const i = (y * width + x) * 4; return [px[i + 2], px[i + 1], px[i]] }

// The words as drawn, words shown: for each line, the page under it (the
// middle colour of the bare backdrop across the line) and the letter's own
// colour (the shown pixel that stands out most from it). The lowest line wins.
const drawn = async (shown, bareShot, boxes) => {
  const a = await decode(shown), b = await decode(bareShot)
  let low = { ratio: 99, text: '' }
  for (const one of boxes) {
    const x0 = Math.max(0, Math.floor(one.x * a.k)), y0 = Math.max(0, Math.floor(one.y * a.k))
    const x1 = Math.min(a.width, Math.ceil((one.x + one.w) * a.k)), y1 = Math.min(a.height, Math.ceil((one.y + one.h) * a.k))
    const under = []
    for (let y = y0; y < y1; y += 2) for (let x = x0; x < x1; x += 2) under.push(at(b, x, y))
    if (!under.length) continue
    under.sort((p, q) => lum(p) - lum(q))
    const mid = under[under.length >> 1]
    let most = 0
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) most = Math.max(most, ratio(at(a, x, y), mid))
    if (most < low.ratio) low = { ratio: most, text: one.text }
  }
  return low
}

// The page under the waves: how far its colours stray from the theme's page
// colour (a distance in 0..255 channel steps, 0 to 441) at the middle pixel
// and at the 98th percentile, and the contrast of that 98th one to the page.
const page = async (bareShot) => {
  const b = await decode(bareShot)
  const paper = await h.evaluate(() => {
    const painter = document.createElement('canvas').getContext('2d', { willReadFrequently: true })
    painter.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--background')
    painter.fillRect(0, 0, 1, 1)
    return [...painter.getImageData(0, 0, 1, 1).data].slice(0, 3)
  })
  const far = []
  for (let y = 0; y < b.height; y += 6) for (let x = 0; x < b.width; x += 6) { const p = at(b, x, y); far.push({ d: Math.hypot(p[0] - paper[0], p[1] - paper[1], p[2] - paper[2]), p }) }
  far.sort((p, q) => p.d - q.d)
  const top = far[Math.floor(far.length * 0.98)]
  return { paper, middle: far[far.length >> 1].d, top: top.d, contrast: ratio(top.p, paper) }
}
const pageOk = (one) => one.middle <= 24 && one.contrast <= 1.6

// The screenshot's pixels, and the lowest contrast of any line over them.
const worst = async (png, boxes) => {
  const { width, height, px, k } = await decode(png)
  let low = { ratio: 99, text: '' }
  for (const one of boxes) {
    const x0 = Math.max(0, Math.floor(one.x * k)), y0 = Math.max(0, Math.floor(one.y * k))
    const x1 = Math.min(width, Math.ceil((one.x + one.w) * k)), y1 = Math.min(height, Math.ceil((one.y + one.h) * k))
    for (let y = y0; y < y1; y += 2) for (let x = x0; x < x1; x += 2) {
      const i = (y * width + x) * 4
      const r = ratio(one.color, [px[i + 2], px[i + 1], px[i]])
      if (r < low.ratio) low = { ratio: r, text: one.text }
    }
  }
  return low
}

try {
  if (STYLE === 'brutal') await h.evaluate(() => localStorage.setItem('style', 'brutal'))
  await c.theme(THEME)
  if (!(await h.$('.mf-welcome'))) await h.evaluate(() => window.dispatchEvent(new CustomEvent('vigil:welcome')))
  await h.waitForSelector('.mf-welcome', { timeout: 8000 })
  const stats = await h.evaluate(() => window.__welcomeBackdrop?.shader)
  console.log(`  ${tag}: the wash at strength ${stats?.strength?.toFixed(3)}, worst contrast by the numbers ${stats?.contrast}`)
  let lowest = 99
  for (const step of steps) {
    // Each chapter at its end, as a reader who waited sees it.
    for (let i = 0; i < 160; i++) {
      const done = await h.evaluate(() => [...document.querySelectorAll('.mf-welcome [data-reel]')].every((el) => el.dataset.reel === 'done'))
      if (done) break
      await h.waitForTimeout(250)
    }
    await h.waitForTimeout(900)
    const boxes = await lines()
    const shown = await h.screenshot(SHOTS ? { path: `${SHOTS}/${tag}-${step.replace(/ /g, '-').toLowerCase()}.png` } : {})
    const bareShot = await bare()
    const low = await worst(bareShot, boxes)
    const ink = await drawn(shown.toString('base64'), bareShot, boxes)
    const under = await page(bareShot)
    lowest = Math.min(lowest, low.ratio, ink.ratio)
    say(low.ratio >= 4.5, `${step.padEnd(13)} lowest text contrast over the backdrop ${low.ratio.toFixed(2)}:1 ("${low.text}")`)
    say(ink.ratio >= 4.5, `${step.padEnd(13)} lowest line as drawn, words shown ${ink.ratio.toFixed(2)}:1 ("${ink.text}")`)
    // The scenery and the waves may tint it; never a sheet that turns the page another colour.
    say(pageOk(under), `${step.padEnd(13)} page under the waves stays near the theme's rgb(${under.paper}): typical stray ${under.middle.toFixed(0)}, most ${under.top.toFixed(0)} (${under.contrast.toFixed(2)}:1)`)
    if (step === 'Ready') break
    const skip = await h.$('footer button:has-text("Skip trying it")')
    if (skip) await skip.click()
    else await h.click('footer button:has-text("Next"), footer button:has-text("Show me")')
    await h.waitForTimeout(700)
  }
  console.log(`  lowest over every chapter: ${lowest.toFixed(2)}:1`)
  // One canvas, alive, drawing, and in the welcome's first layer (the backdrop, under the words).
  const live = () => h.evaluate(() => {
    const all = document.querySelectorAll('[data-welcome-shader]')
    const gl = all[0]?.getContext('webgl2')
    return { count: all.length, lost: gl ? gl.isContextLost() : null, under: !!all[0] && all[0].closest('.mf-welcome > *') === document.querySelector('.mf-welcome').firstElementChild, frames: window.__welcomeBackdrop.shader.frames }
  })
  const alive = await live()
  say(alive.count === 1 && alive.lost === false && alive.under && alive.frames > 0, `one live canvas under the words: ${alive.count} canvas, context lost ${alive.lost}, under ${alive.under}, ${alive.frames} frames`)
  // The GPU takes the context away: its canvas leaves the page at once, and a fresh one comes back.
  await h.evaluate(() => document.querySelector('[data-welcome-shader]').getContext('webgl2').getExtension('WEBGL_lose_context').loseContext())
  await h.waitForTimeout(50)
  const left = await h.evaluate(() => document.querySelectorAll('[data-welcome-shader]').length)
  await h.waitForTimeout(1600)
  const revived = await live()
  say(left === 0 && revived.count === 1 && revived.lost === false && revived.frames > alive.frames, `a lost context: ${left} canvas left on the page, then ${revived.count} fresh one drawing (${revived.frames - alive.frames} frames)`)
  // A theme changed live (no reload): the waves follow it, and the page stays that theme's colour.
  const swap = (name) => h.evaluate((n) => (localStorage.setItem('theme', n), window.dispatchEvent(new StorageEvent('storage', { key: 'theme' }))), name)
  const other = ['paper', 'light'].includes(THEME) ? 'dark' : 'paper'
  await swap(other)
  await h.waitForTimeout(2000)
  const swapped = await page(await bare())
  say(pageOk(swapped), `follows a live change to ${other}: page rgb(${swapped.paper}), typical stray ${swapped.middle.toFixed(0)}, most ${swapped.top.toFixed(0)} (${swapped.contrast.toFixed(2)}:1)`)
  await swap(THEME)
  await h.waitForTimeout(1500)
  const frames = () => h.evaluate(() => window.__welcomeBackdrop.shader.frames)
  // A second of the page's own frames beside the backdrop's: never more than one of its frames per display frame.
  const second = () => h.evaluate(() => new Promise((done) => {
    const from = window.__welcomeBackdrop.shader.frames
    let shown = 0
    const tick = () => (shown++, performance.now() - start < 1000 ? requestAnimationFrame(tick) : done({ drawn: window.__welcomeBackdrop.shader.frames - from, shown }))
    const start = performance.now()
    requestAnimationFrame(tick)
  }))
  let one = await second()
  say(one.drawn > 20 && one.drawn <= one.shown + 1, `moving with Motion on: ${one.drawn} frames drawn in a second, the display showed ${one.shown}`)
  // Motion off: one still frame (the wash still shows), then nothing.
  let a = await frames()
  await h.evaluate(() => (document.documentElement.dataset.motion = 'off'))
  await h.waitForTimeout(300)
  let b = await frames()
  const strength = await h.evaluate(() => window.__welcomeBackdrop.shader.strength)
  one = await second()
  say(b - a >= 1 && one.drawn === 0 && strength > 0, `still with Motion off: ${b - a} frame drawn on the change, then ${one.drawn} in a second`)
  await h.evaluate(() => (document.documentElement.dataset.motion = 'on'))
  await h.waitForTimeout(300)
  // A hidden window: nothing drawn, and it picks up again when shown. (The page is told it is hidden, as macOS tells it when the window is covered or minimised.)
  const hide = (hidden) => h.evaluate((hidden) => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (hidden ? 'hidden' : 'visible') })
    document.dispatchEvent(new Event('visibilitychange'))
  }, hidden)
  await hide(true)
  await h.waitForTimeout(200)
  a = await frames()
  await h.waitForTimeout(1000)
  b = await frames()
  await hide(false)
  await h.waitForTimeout(500)
  const back = (await frames()) - b
  say(b - a === 0 && back > 5, `stops while hidden: ${b - a} frames drawn in a second hidden, ${back} in half a second once shown`)
} finally {
  if (c.errors.length) console.log(c.errors.join('\n'))
  await c.close()
}
process.exit(failed ? 1 : 0)
