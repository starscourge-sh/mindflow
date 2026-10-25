// The Journal's painting is there in its first frame: opening the Day page in a
// window just started (as a book switch starts one, nothing decoded yet) never
// shows the plain colour or the blurred copy where the picture will be, and
// never fades the picture up from them. Every frame is sampled in the window.
// Also: the photo viewer cannot be scrolled sideways by a trackpad's sideways swipe.
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=$PWD/out-p/main/index.js HALIGTREE_QA_AWAY=1 node qa/scenery-first-paint.mjs [shots]
import { mkdirSync } from 'fs'
import { join } from 'path'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'

const SHOTS = process.argv[2] ?? ''
if (SHOTS) mkdirSync(SHOTS, { recursive: true })
const { check, done } = checks()
const c = await sandbox({ width: 1200, height: 800 })
const { h, v, go, errors, close } = c

/** In the window: each frame, what stands where the painting goes, once the page is on show. */
const sampler = () => {
  const samples = []
  window.__scene = samples
  const take = () => {
    const box = document.querySelector('[data-scene="today"]')
    if (!box) return
    const seen = getComputedStyle(box).visibility === 'visible'
    const imgs = [...box.querySelectorAll('img')]
    const full = imgs.find((one) => !one.className.includes('blur-xl'))
    const opacity = full ? Number(getComputedStyle(full).opacity) : 0
    const stand = imgs.some((one) => one.className.includes('blur-xl')) || !!box.style.background
    samples.push({ t: Math.round(performance.now()), seen, state: full && opacity > 0.98 ? 'picture' : full ? `fading ${opacity.toFixed(2)}` : stand ? 'stand-in' : 'empty' })
  }
  const frame = () => (take(), requestAnimationFrame(frame))
  requestAnimationFrame(frame)
}
const read = async (label) => {
  await h.waitForTimeout(2500)
  const samples = await h.evaluate(() => window.__scene ?? [])
  const shown = samples.filter((one) => one.seen)
  const bad = shown.filter((one) => one.state !== 'picture')
  if (SHOTS) await h.screenshot({ path: join(SHOTS, `scene-${label}.png`) })
  check(`${label}: the painting is there in the first frame shown, never a stand-in or a fade`, shown.length > 10 && bad.length === 0, `${shown.length} frames shown, ${bad.length} not the picture: ${[...new Set(bad.map((one) => one.state))].join(', ')}`)
}
try {
  await v('onboarding:set', { welcomed: new Date().toISOString(), newsSeen: true, pageHints: false, hidden: true })
  await v('settings:set', { scenery: true, sceneryToday: true, sceneryFolders: [join(process.cwd(), 'src/renderer/src/assets/scenery')], motion: true, sounds: false })
  await h.context().addInitScript(sampler)
  // A fresh window (nothing decoded), then the Journal.
  await h.reload()
  await h.waitForTimeout(2500)
  await go('day')
  await read('journal-fresh')
  // As after a book switch: a new window opening straight onto the Journal.
  await h.reload()
  await go('day')
  await read('journal-after-switch')

  // The photo viewer: a sideways swipe never moves it or the window under it.
  await go('feed')
  await h.waitForTimeout(1500)
  const picture = h.locator('[data-feed-picture]').first()
  if (await picture.count()) {
    await picture.click()
    await h.waitForTimeout(900)
    await h.mouse.move(600, 400)
    for (let i = 0; i < 6; i++) (await h.mouse.wheel(400, 0)), await h.waitForTimeout(40)
    await h.waitForTimeout(400)
    const moved = await h.evaluate(() => [document.scrollingElement, ...document.querySelectorAll('*')].filter((el) => el && el.scrollLeft > 0).map((el) => `${el.tagName}.${String(el.className).slice(0, 60)} ${el.scrollLeft}`))
    if (SHOTS) await h.screenshot({ path: join(SHOTS, 'viewer-swiped.png') })
    check('photo viewer: a sideways swipe scrolls nothing sideways', moved.length === 0 && (await h.evaluate(() => window.scrollX)) === 0, moved.join(' | '))
    await h.keyboard.press('Escape')
  } else check('photo viewer: a Feed picture to open', false, 'none found')
  check('no page errors', errors.length === 0, errors.join(' | '))
} finally {
  await close()
}
done()
