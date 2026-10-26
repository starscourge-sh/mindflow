// "Recent" in the sidebar, under Pinned: the last notes you opened, five at most, not the one open now nor one
// already pinned; it folds as Pinned does, and a click opens one.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 [SHOTS=<dir>] node qa/sidebar-recent.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const { check, done } = checks()
const c = await sandbox({ width: 1500, height: 1000 })
const { h, v } = c
const wait = (ms) => h.waitForTimeout(ms)
const rows = () => h.evaluate(() => [...document.querySelectorAll('[data-side-recent-row]')].map((one) => one.getAttribute('data-side-recent-row')))
try {
  await v('settings:set', { sounds: false, hintRate: 0 })
  await c.go('inbox'); await wait(1500)
  const list = h.locator('[data-capture-row], [data-row]')
  for (let i = 1; i < 8; i++) { await list.nth(i).click(); await wait(500) }
  await wait(800)
  const open = await h.evaluate(() => document.querySelector('[data-open]')?.getAttribute('data-open'))
  const shown = await rows()
  check('"Recent" sits in the sidebar with the last notes opened', shown.length >= 3, JSON.stringify(shown))
  check('five at most', shown.length <= 5, String(shown.length))
  check('not the one open now', !shown.includes(open), JSON.stringify({ open, shown }))
  if (process.env.SHOTS) await h.screenshot({ path: `${process.env.SHOTS}/sidebar-recent.png`, clip: { x: 0, y: 0, width: 420, height: 1000 } })
  await h.locator('[data-side-recent-row]').first().click(); await wait(800)
  check('a click opens it', (await h.locator(`[data-open="${shown[0]}"]`).count()) === 1, shown[0])
  check('no page errors', !c.errors?.some((one) => /PAGEERROR/.test(one)), (c.errors ?? []).slice(0, 2).join(' | '))
} catch (error) {
  check('the run finished', false, error.message.split('\n')[0])
} finally {
  await c.close?.()
}
done()
