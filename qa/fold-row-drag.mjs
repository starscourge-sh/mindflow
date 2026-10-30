// Dragging a sidebar row that folds (Journal, Writing, Gems) keeps its own icon the whole way: the row moving under
// the pointer used to flip it between its icon and its chevron.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/fold-row-drag.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'
const { check, done } = checks()
const c = await sandbox({ width: 1200, height: 900 })
const { h, v } = c
try {
  await v('settings:set', { sounds: false, hintRate: 0 })
  await c.go('inbox')
  const row = h.locator('aside[data-chrome] [data-side-row][aria-label="Journal"]').first()
  const box = await row.boundingBox()
  await h.evaluate(() => {
    window.__flips = []
    const tick = () => {
      const row = document.querySelector('aside[data-chrome] [data-side-row][aria-label="Journal"]')
      const icon = row?.querySelector(':scope > span')
      if (document.documentElement.hasAttribute('data-dragging') && icon) window.__flips.push(Number(getComputedStyle(icon).opacity))
      if (window.__flips.length < 400) requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })
  await h.mouse.move(box.x + 40, box.y + box.height / 2)
  await h.mouse.down()
  for (let i = 1; i <= 30; i++) { await h.mouse.move(box.x + 40, box.y + box.height / 2 + i * 6); await h.waitForTimeout(25) }
  for (let i = 30; i >= 0; i--) { await h.mouse.move(box.x + 40, box.y + box.height / 2 + i * 6); await h.waitForTimeout(25) }
  const flips = await h.evaluate(() => window.__flips)
  await h.keyboard.press('Escape'); await h.mouse.up()
  check('the drag was watched', flips.length > 5, String(flips.length))
  check('its icon stays shown every frame of the drag', flips.every((one) => one > 0.95), `lowest ${Math.min(...flips)}`)
} catch (error) {
  check('the run finished', false, error.message.split('\n')[0])
} finally {
  await c.close()
}
done()
