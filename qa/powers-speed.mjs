// "What Haligtree can do" opens and scrolls without stalls: under 500 ms from
// the click to its first tab showing, and in every tab, scrolled top to bottom
// with the wheel, no frame over 32 ms. Switching tabs (a click, then ↓ in the
// tab list) shows the next one's cards and only those. Prints where the time went.
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
  // For scale: Settings, a page of the same shape, on this machine now.
  const s0 = Date.now()
  await go('settings')
  await h.waitForSelector('[data-sections] [data-section]', { timeout: 10000 })
  console.log('SETTINGS OPEN', Date.now() - s0, 'ms')
  await go('home'); await wait(1200)
  await h.evaluate(() => window.__long.splice(0))
  const t0 = Date.now()
  await go('powers')
  await h.waitForSelector('[data-powers-tab] [data-power]', { timeout: 10000 })
  const shown = Date.now() - t0
  await wait(1500)
  const opening = await h.evaluate(() => window.__long.splice(0))
  console.log('OPEN', shown, 'ms; long tasks', JSON.stringify(opening))
  check('it shows within 500 ms of asking', shown < 500, `${shown} ms`)
  check('it opens on the first tab, Writing', await h.locator('[data-powers-tab="Writing"]').count() === 1)
  const nodes = await h.evaluate(() => document.querySelectorAll('*').length)
  console.log('DOM nodes', nodes)
  const tabs = await h.locator('[data-sections] [data-section]').evaluateAll((all) => all.map((one) => one.dataset.section))
  console.log('TABS', JSON.stringify(tabs))
  let worst = 0
  for (const tab of tabs) {
    const t1 = Date.now()
    await h.locator(`[data-sections] [data-section="${tab}"]`).click()
    await h.waitForSelector(`[data-powers-tab="${tab}"]`, { timeout: 5000 })
    const switched = Date.now() - t1
    await wait(700)
    const cards = await h.locator('[data-power]').count()
    const mine = await h.locator(`[data-powers-tab="${tab}"] [data-power]`).count()
    // Scroll it top to bottom with the wheel, timing every frame.
    await h.mouse.move(900, 500)
    await h.evaluate(() => { window.__frames = []; let last = performance.now(); const tick = (now) => { window.__frames.push(Math.round(now - last)); last = now; if (window.__frames.length < 200) requestAnimationFrame(tick) }; requestAnimationFrame(tick) })
    for (let i = 0; i < 20; i++) { await h.mouse.wheel(0, 300); await wait(60) }
    await wait(400)
    const frames = (await h.evaluate(() => window.__frames)).slice(1)
    const most = Math.max(...frames)
    worst = Math.max(worst, most)
    console.log(`TAB ${tab}: switched ${switched} ms, cards ${cards} (its own ${mine}), worst frame ${most} ms, over 32: ${JSON.stringify(frames.filter((one) => one > 32))}`)
    check(`${tab}: only its own cards are drawn`, cards === mine)
    check(`${tab}: scrolling, no frame over 32 ms`, most <= 32, `${most} ms`)
  }
  console.log('WORST FRAME', worst, 'ms')
  // ↑ ↓ in the tab list move between tabs, as in Settings.
  await h.locator('[data-sections] [data-section="Writing"]').click(); await wait(500)
  await h.keyboard.press('ArrowDown'); await wait(500)
  check('↓ in the tab list opens the next tab', await h.locator('[data-powers-tab="Catching"]').count() === 1)
  await h.keyboard.press('k'); await wait(500)
  check('k goes back up', await h.locator('[data-powers-tab="Writing"]').count() === 1)
  // Back finds the tab before; Forward the one after.
  await h.locator('[data-sections] [data-section="Remembering"]').click(); await wait(600)
  await h.keyboard.press('Meta+BracketLeft'); await wait(800)
  check('⌘[ goes back to the tab before', await h.locator('[data-powers-tab="Writing"]').count() === 1)
  await h.keyboard.press('Meta+BracketRight'); await wait(800)
  check('⌘] comes forward again', await h.locator('[data-powers-tab="Remembering"]').count() === 1)
  // Left and opened again, the page opens on the tab it was left on.
  await go('home'); await wait(800)
  await go('powers'); await wait(1000)
  check('opened again, it is on the tab last open', await h.locator('[data-powers-tab="Remembering"]').count() === 1)
  // The search finds cards in every tab.
  await h.locator('[data-powers-tab]').locator('xpath=ancestor::section[1]').locator('input[placeholder="Search…"]').fill('PDF'); await wait(600)
  const found = await h.locator('[data-power]').count()
  check('a search shows matching cards from every tab', found > 0 && await h.locator('[data-sections] [aria-current="page"]').count() === 0, `${found} cards`)
  check('no page errors', !c.errors.some((one) => /PAGEERROR/.test(one)), c.errors.join(' / ').slice(0, 300))
} finally {
  await c.close()
}
done()
