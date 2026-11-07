// Settings' "Open Markdown files here": a press asks the Mac to open .md files in Haligtree, then the row says so.
// Under HALIGTREE_QA_AWAY main only counts the ask: the Mac's real default is never touched by a test.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox node qa/markdown-default.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'

const { check, done } = checks()
const s = await sandbox({ width: 1300, height: 900 })
const { h, v, go, electron, close } = s
const wait = (ms) => h.waitForTimeout(ms)
try {
  await v('settings:set', { hintRate: 0 })
  await go('settings'); await wait(900)
  await h.locator('input[type=search], [placeholder*="Search"]').first().fill('markdown'); await wait(700)
  const off = h.locator('[data-markdown-default="off"]')
  check('the row offers to make Haligtree the default', (await off.count()) === 1 && /Make Haligtree the default/.test(await off.textContent()))
  await off.click(); await wait(700)
  check('pressed, the Mac is asked once', JSON.stringify(await electron.evaluate(() => globalThis.haligtreeDefaultAsks())) === '["set"]')
  check('and the row says Haligtree opens them', (await h.locator('[data-markdown-default="on"]').count()) === 1)
  if (process.env.QA_SHOTS) await h.screenshot({ path: `${process.env.QA_SHOTS}/markdown-default.png` })
} catch (e) { check('ran', false, e.message.split('\n')[0]) }
await close()
done()
