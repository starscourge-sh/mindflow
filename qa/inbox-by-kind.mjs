// The Inbox opens grouped by kind to start (notes, tasks, quotes, words); other capture lists by date.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/inbox-by-kind.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'
const { check, done } = checks()
const c = await sandbox({ width: 1200, height: 900 })
const { h, v } = c
try {
  await v('settings:set', { sounds: false, hintRate: 0 })
  await h.evaluate(() => { for (const key of Object.keys(localStorage)) if (key.includes('captures:')) localStorage.removeItem(key) })
  await h.locator('aside').getByText('Inbox', { exact: true }).first().click(); await h.waitForTimeout(2000)
  const heads = await h.evaluate(() => [...document.querySelectorAll('[data-pane] h2, [data-pane] h3, [data-pane] [data-group-head], [data-pane] [data-island-head]')].map((one) => one.textContent.trim()).filter(Boolean).slice(0, 6))
  check('the Inbox is grouped by kind to start', heads.some((one) => /^Note/.test(one)) && !heads.some((one) => /^(Today|This week)/.test(one)), JSON.stringify(heads))
} catch (error) {
  check('the run finished', false, error.message.split('\n')[0])
} finally {
  await c.close?.()
}
done()
