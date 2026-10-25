// The Journal's painting is there in its first frame: opening the Day page in a
// window just started (as a book switch starts one, nothing decoded yet) never
// shows the plain colour or the blurred copy where the picture will be, and
// never fades the picture up from them. Every frame is sampled in the window.
// The same for the Feed's pictures and a person's face: never an empty box or
// their initials, then the picture.
// Also: the photo viewer cannot be scrolled sideways by a trackpad's sideways swipe.
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=$PWD/out-p/main/index.js HALIGTREE_QA_AWAY=1 node qa/scenery-first-paint.mjs [shots]
import { mkdirSync } from 'fs'
import { join } from 'path'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

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
/** In the window: each frame, every Feed picture, Reading card and face on show, and whether its picture is drawn. */
const faces = () => {
  const samples = []
  window.__faces = samples
  const take = () => {
    const out = []
    for (const img of document.querySelectorAll('[data-feed-picture] img, [data-reading-picture] img, [data-avatar] img, [data-avatar="initials"]')) {
      const r = img.getBoundingClientRect()
      if (!img.checkVisibility({ visibilityProperty: true, opacityProperty: true }) || r.bottom < 0 || r.top > innerHeight) continue
      const where = img.closest('[data-feed-picture]') ? 'feed' : img.closest('[data-reading-picture]') ? 'reading' : 'face'
      out.push({ where, state: img.tagName !== 'IMG' ? 'initials' : img.complete && img.naturalWidth > 0 && r.height > 2 ? 'picture' : 'empty' })
    }
    samples.push(out)
  }
  const frame = () => (take(), requestAnimationFrame(frame))
  requestAnimationFrame(frame)
}
/** Frames where a picture belongs (one the page ends up drawing) and it is not there yet. */
const readFaces = async (label, where) => {
  await h.waitForTimeout(2500)
  const samples = await h.evaluate(() => window.__faces ?? [])
  const shown = samples.filter((one) => one.some((part) => part.where === where))
  const last = shown[shown.length - 1] ?? []
  const pictured = last.filter((part) => part.where === where && part.state === 'picture').length
  const bad = shown.filter((one) => one.filter((part) => part.where === where && part.state === 'picture').length < pictured)
  if (SHOTS) await h.screenshot({ path: join(SHOTS, `faces-${label}.png`) })
  check(`${label}: every ${where} picture is there in the first frame shown`, shown.length > 10 && pictured > 0 && bad.length === 0, `${shown.length} frames shown, ${pictured} pictures, ${bad.length} frames missing one: ${JSON.stringify(bad[0] ?? [])}`)
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

  // Feed pictures, and a person's face (a Feed author given a photo), in a window just opened.
  await go('feed')
  await h.waitForTimeout(1500)
  const who = (await h.locator('[data-feed-author]').first().textContent())?.trim()
  await h.evaluate((name) => {
    const canvas = Object.assign(document.createElement('canvas'), { width: 256, height: 256 })
    const pen = canvas.getContext('2d')
    pen.fillStyle = '#c0603a'
    pen.fillRect(0, 0, 256, 256)
    pen.fillStyle = '#2a4d6e'
    pen.beginPath(), pen.arc(128, 110, 60, 0, Math.PI * 2), pen.fill()
    return window.api.haligtree('people:set', name, canvas.toDataURL('image/jpeg', 0.9))
  }, who)
  await h.context().addInitScript(faces)
  await h.reload()
  await h.waitForTimeout(1200)
  await go('feed')
  await readFaces('feed-fresh', 'feed')
  await h.reload()
  await h.waitForTimeout(1200)
  await h.evaluate((name) => window.dispatchEvent(new CustomEvent('haligtree:source', { detail: `attribution:${name}` })), who)
  await readFaces('person-fresh', 'face')

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
