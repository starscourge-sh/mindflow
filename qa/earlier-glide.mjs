// "Earlier months" and "Earlier weeks" cards answer the pointer with the app's
// gliding light, like every sibling list: the card never lifts, the light moves to it.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-a/main/index.js HALIGTREE_QA_AWAY=1 node qa/earlier-glide.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const { check, done } = checks()
const c = await sandbox({ width: 1400, height: 900 })
const { h, v, go } = c
const wait = (ms) => h.waitForTimeout(ms)
try {
  await v('settings:set', { sounds: false, hintRate: 0 })
  for (const [view, name] of [['monthpage', 'Earlier months'], ['weekpage', 'Earlier weeks']]) {
    await go(view); await wait(1500)
    const list = h.locator(`section[aria-label="${name}"] ol`).first()
    if (!(await list.count())) { check(`${name}: shown`, false, 'no cards in the sandbox'); continue }
    await list.scrollIntoViewIfNeeded()
    const card = list.locator(':scope > li button').nth(1)
    const before = await card.boundingBox()
    await card.hover(); await wait(500)
    const after = await card.boundingBox()
    check(`${name}: the card stays put under the pointer`, Math.abs(after.y - before.y) < 0.5, `${before.y} -> ${after.y}`)
    const lit = await h.evaluate((name) => {
      const ol = document.querySelector(`section[aria-label="${name}"] ol`)
      const li = ol.querySelector(':scope > li[data-fluid-hover-active]')
      return { lit: !!li, index: li ? [...ol.querySelectorAll(':scope > li')].indexOf(li) : -1 }
    }, name)
    check(`${name}: the gliding light is on the card pointed at`, lit.lit && lit.index === 1, JSON.stringify(lit))
    const cursor = await card.evaluate((el) => getComputedStyle(el).cursor)
    check(`${name}: the card shows the hand`, cursor === 'pointer', cursor)
    await h.screenshot({ path: `${process.env.QA_SHOTS ?? '/tmp'}/earlier-${view}.png` })
  }
} finally {
  await c.close()
}
done()
