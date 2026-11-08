// "What Haligtree can do" sits at the top of Pinned until it is unpinned: a click opens it, its
// menu's "Unpin" takes it off (Undo puts it back), and the page then offers "Pin this page to the sidebar".
//   QA_ARGS=--sandbox QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/powers-pin.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'
const { check, done } = checks()
const c = await sandbox({ width: 1400, height: 880 })
const { h, v } = c
const wait = (ms) => h.waitForTimeout(ms)
try {
  await v('settings:set', { sounds: false, hintRate: 0 }); await wait(800)
  const row = h.locator('[data-powers-pin]')
  await row.scrollIntoViewIfNeeded().catch(() => {})
  check('Pinned starts with "What Haligtree can do"', await row.count() === 1 && /can do/.test(await row.innerText()))
  await row.click(); await wait(900)
  check('a click opens the page', await h.locator('[data-powers-tried]').count() === 1)
  await row.click({ button: 'right' }); await wait(400)
  await h.locator('[role="menuitem"]:has-text("Unpin")').first().click(); await wait(900)
  check('"Unpin" takes it off the sidebar', await row.count() === 0)
  check('and the page offers to pin it again', await h.locator('[data-powers-repin]').count() === 1)
  await h.locator('[data-powers-repin]').click(); await wait(900)
  check('"Pin this page to the sidebar" puts it back', await h.locator('[data-powers-pin]').count() === 1)
  check('no page errors', !c.errors.some((one) => /PAGEERROR/.test(one)), c.errors.join(' / ').slice(0, 300))
} finally { await c.close() }
done()
