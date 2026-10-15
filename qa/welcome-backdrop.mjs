// Does the welcome's moving backdrop (welcome-shader.tsx) stay calm and
// readable? Walks every chapter in one theme and window size, and for each:
// screenshots it, then hides the words and measures, pixel by pixel, the
// contrast of every line of text over the backdrop right under it (must be
// 4.5:1 or more). Then checks the backdrop draws a still frame and stops with
// Motion off, and stops while the window is hidden.
//
//   npx electron-vite build --outDir out-x && QA_DATA=$(mktemp -d) QA_ENTRY=out-x/main/index.js MINDFLOW_QA_AWAY=1 node qa/welcome-backdrop.mjs [shots-dir] [theme] [brutal|soft] [width] [height]
import { mkdirSync } from 'fs'
import { sandbox } from './sandbox-lib.mjs'

const [SHOTS = '', THEME = 'paper', STYLE = 'soft', W = '1280', H = '800'] = process.argv.slice(2)
if (SHOTS) mkdirSync(SHOTS, { recursive: true })
const c = await sandbox({ width: Number(W), height: Number(H), seeded: false })
const { h } = c
const tag = `${THEME}${STYLE === 'brutal' ? '-brutal' : ''}-${W}x${H}`
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

// The screenshot's pixels, decoded by Electron itself (BGRA), and the lowest contrast of any line over them.
const worst = async (png, boxes) => {
  const { width, height, data } = await c.electron.evaluate(({ nativeImage }, png) => {
    const img = nativeImage.createFromBuffer(Buffer.from(png, 'base64'))
    const { width, height } = img.getSize()
    return { width, height, data: img.toBitmap().toString('base64') }
  }, png)
  const px = Buffer.from(data, 'base64')
  const k = width / (await h.evaluate(() => innerWidth))
  const lin = (v) => ((v /= 255) <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
  const lum = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
  const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05) }
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
    if (SHOTS) await h.screenshot({ path: `${SHOTS}/${tag}-${step.replace(/ /g, '-').toLowerCase()}.png` })
    const low = await worst(await bare(), await lines())
    lowest = Math.min(lowest, low.ratio)
    say(low.ratio >= 4.5, `${step.padEnd(13)} lowest text contrast over the backdrop ${low.ratio.toFixed(2)}:1 ("${low.text}")`)
    if (step === 'Ready') break
    const skip = await h.$('footer button:has-text("Skip trying it")')
    if (skip) await skip.click()
    else await h.click('footer button:has-text("Next"), footer button:has-text("Show me")')
    await h.waitForTimeout(700)
  }
  console.log(`  lowest over every chapter: ${lowest.toFixed(2)}:1`)
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
