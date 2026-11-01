// Trackpad taps are for stepping a value (a scrub, a slider, a dial, a dragged row) only: quick capture's round
// controls (the camera, its two choices, the ×) give none when opened, hovered or picked.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/no-button-taps.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'
process.env.HALIGTREE_QA_FAKE_SCREEN = '1'

const { check, done } = checks()
const c = await sandbox({ width: 1200, height: 820 })
const { page, v } = c
const taps = () => c.electron.evaluate(() => globalThis.haligtreeTaps())
const centre = (sel) => page.$eval(sel, (one) => { const r = one.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 } })
try {
  await v('settings:set', { sounds: false, hintRate: 0, rotCount: 0, haptics: true })
  await page.evaluate(() => window.api.showPrompt())
  await page.waitForTimeout(900)
  const before = await taps()
  await page.click('[data-shot-button] button[aria-label="Take a screenshot"]')
  await page.waitForTimeout(500)
  for (const which of ['screen', 'area', 'screen']) {
    const at = await centre(`[data-shot="${which}"]`)
    await page.mouse.move(at.x, at.y, { steps: 4 })
    await page.waitForTimeout(150)
  }
  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)
  await page.click('[data-shot-button] button[aria-label="Take a screenshot"]')
  await page.waitForTimeout(500)
  await page.click('[data-shot="screen"]')
  await page.waitForTimeout(800)
  const after = await taps()
  check('opening, hovering and picking the camera\'s choices gives no trackpad tap', after === before, `${before} -> ${after}`)
} catch (error) {
  check('the run finished', false, error.message.split('\n')[0])
} finally {
  await c.close?.()
}
done()
