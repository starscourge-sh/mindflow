// Every page in the sidebar has its preview on hover, Feed included (it had none).
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/sidebar-peeks.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const { check, done } = checks()
const c = await sandbox({ width: 1400, height: 1000 })
const { h } = c
try {
  await h.evaluate(() => window.api.haligtree('settings:set', { sounds: false, hintRate: 0 }))
  await h.waitForTimeout(1500)
  const missing = []
  for (const name of ['Inbox', 'Home', 'Journal', 'Writing', 'Gems', 'Review', 'Tasks', 'Calendar', 'Feed', 'Goals', 'Queue', 'Sources', 'Stats', 'Map', 'Bin']) {
    const row = h.locator('aside').getByText(name, { exact: true }).first()
    if (!(await row.count())) continue
    await row.scrollIntoViewIfNeeded().catch(() => {})
    await h.waitForTimeout(200)
    const b = await row.boundingBox()
    if (!b) continue
    await h.mouse.move(b.x + 5, b.y + b.height / 2, { steps: 4 })
    await h.waitForTimeout(1400)
    if (!(await h.locator('[data-slot="tooltip-content"] [data-peek-card]').count())) missing.push(name)
    if (name === 'Feed' && process.env.SHOTS) await h.screenshot({ path: `${process.env.SHOTS}/feed-peek.png` })
    await h.mouse.move(1300, 900, { steps: 3 })
    await h.waitForTimeout(500)
  }
  check('every sidebar page shows its preview on hover', missing.length === 0, missing.join(', '))
} catch (error) {
  check('the run finished', false, error.message.split('\n')[0])
} finally {
  await c.close?.()
}
done()
