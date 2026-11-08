// Which card on "What Haligtree can do" stalls the page: each card of the
// tabs asked (QA_TABS, comma separated; default every tab) brought on stage
// alone, its demo left playing for two seconds, then the page nudged a little
// with the wheel, and the worst frame of each printed. Fails on any over 50 ms.
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/powers-card-cost.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'
const { check, done } = checks()
const c = await sandbox({ width: 1400, height: 880 })
const { h, v, go } = c
const wait = (ms) => h.waitForTimeout(ms)
const timed = async (act) => {
  await h.evaluate(() => { window.__frames = []; window.__on = true; let last = performance.now(); const tick = (now) => { window.__frames.push(Math.round(now - last)); last = now; if (window.__on) requestAnimationFrame(tick) }; requestAnimationFrame(tick) })
  await act()
  return h.evaluate(() => { window.__on = false; return Math.max(0, ...window.__frames.slice(1)) })
}
try {
  await v('settings:set', { sounds: false, hintRate: 0 }); await wait(800)
  await go('powers'); await wait(1500)
  const tabs = process.env.QA_TABS?.split(',') ?? await h.locator('[data-sections] [data-section]').evaluateAll((all) => all.map((one) => one.dataset.section))
  for (const tab of tabs) {
    await h.locator(`[data-sections] [data-section="${tab}"]`).click(); await wait(900)
    const ids = await h.locator('[data-power]').evaluateAll((all) => all.map((one) => one.dataset.power))
    for (const id of ids) {
      await h.evaluate((id) => document.querySelector(`[data-power="${id}"]`).scrollIntoView({ block: 'center' }), id)
      await wait(300)
      const playing = await timed(() => wait(2000))
      await h.mouse.move(900, 500)
      const scrolling = await timed(async () => { for (let i = 0; i < 4; i++) { await h.mouse.wheel(0, i % 2 ? -120 : 120); await wait(80) } await wait(200) })
      console.log(`${tab} | ${id} | playing ${playing} ms | scrolling ${scrolling} ms`)
      check(`${tab} / ${id}: no frame over 50 ms`, playing <= 50 && scrolling <= 50, `${playing} / ${scrolling}`)
    }
  }
} finally { await c.close() }
done()
