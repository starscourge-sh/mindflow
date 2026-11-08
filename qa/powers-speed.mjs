// "What Haligtree can do" opens and scrolls without stalls: from the click to
// its first frame, and while scrolling it top to bottom, no frame takes over
// 50 ms and no long task runs over 100 ms. Prints where the time went.
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/powers-speed.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const { check, done } = checks()
const c = await sandbox({ width: 1400, height: 880 })
const { h, v, go } = c
const wait = (ms) => h.waitForTimeout(ms)
try {
  await v('settings:set', { sounds: false, hintRate: 0 }); await wait(800)
  await h.evaluate(() => { window.__long = []; new PerformanceObserver((list) => list.getEntries().forEach((one) => window.__long.push(Math.round(one.duration)))).observe({ type: 'longtask', buffered: false }) })
  const t0 = Date.now()
  await go('powers')
  await h.waitForSelector('[data-powers-tried]', { timeout: 10000 })
  const shown = Date.now() - t0
  await wait(1500)
  const opening = await h.evaluate(() => window.__long.splice(0))
  console.log('OPEN', shown, 'ms; long tasks', JSON.stringify(opening))
  check('it shows within 300 ms of asking', shown < 300, `${shown} ms`)
  check('opening runs no long task over 100 ms', opening.every((one) => one <= 100), JSON.stringify(opening))
  // Scroll it top to bottom with the wheel, timing every frame.
  await h.mouse.move(700, 500)
  await h.evaluate(() => { window.__frames = []; let last = performance.now(); const tick = (now) => { window.__frames.push(Math.round(now - last)); last = now; if (window.__frames.length < 400) requestAnimationFrame(tick) }; requestAnimationFrame(tick) })
  for (let i = 0; i < 40; i++) { await h.mouse.wheel(0, 300); await wait(60) }
  await wait(500)
  const frames = await h.evaluate(() => window.__frames)
  const scrolling = await h.evaluate(() => window.__long.splice(0))
  const slow = frames.filter((one) => one > 50)
  console.log('SCROLL frames', frames.length, 'over 50ms', JSON.stringify(slow), 'long tasks', JSON.stringify(scrolling))
  check('scrolling, no frame over 50 ms', slow.length === 0, JSON.stringify(slow))
  check('scrolling, no long task over 100 ms', scrolling.every((one) => one <= 100), JSON.stringify(scrolling))
  const nodes = await h.evaluate(() => document.querySelectorAll('*').length)
  console.log('DOM nodes', nodes)
} finally {
  await c.close()
}
done()
