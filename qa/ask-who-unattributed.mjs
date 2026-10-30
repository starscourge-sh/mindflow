// "Who said it", asked in place from a search result (Tab on a capture), offers
// "Unattributed" as the sheet for a gem's source does: pressed, the capture
// keeps "Unattributed" and the line closes; the hand shows on it.
//
//   npx electron-vite build --outDir out-r
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-r/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox node qa/ask-who-unattributed.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const { check, done } = checks()
const c = await sandbox({ width: 1280, height: 860 })
const { h } = c
const wait = (ms) => h.waitForTimeout(ms)
const shots = process.env.QA_SHOTS
const para = (text) => ({ type: 'paragraph', content: [{ type: 'text', text }] })

try {
  const id = await h.evaluate((doc) => window.api.captures.create({ kind: 'quote', body: doc }), { type: 'doc', content: [para('Zebulon walks the quiet orchard at dusk')] })
  await wait(800)
  await h.keyboard.press('Meta+k')
  await wait(500)
  await h.keyboard.type('Zebulon walks', { delay: 40 })
  await h.waitForFunction(() => /Zebulon/.test(document.querySelector('[role="dialog"][aria-label="Search"] [data-search-at]')?.textContent ?? ''), null, { timeout: 8000 })
  await h.keyboard.press('Tab')
  await wait(400)
  const button = h.locator('[data-ask-who] [data-ask-who-unattributed]')
  check('Tab on the result asks "Who said it?" with "Unattributed" beside it', (await button.count()) === 1 && (await button.textContent())?.trim() === 'Unattributed')
  check('it shows the hand', (await button.evaluate((el) => getComputedStyle(el).cursor).catch(() => '')) === 'pointer')
  for (const theme of ['light', 'dark']) {
    await h.evaluate((d) => document.documentElement.classList.toggle('dark', d), theme === 'dark')
    await wait(250)
    if (shots) await h.screenshot({ path: `${shots}/ask-who-${theme}.png` })
  }
  await h.evaluate(() => document.documentElement.classList.remove('dark'))
  await button.click()
  await wait(600)
  const kept = await h.evaluate((one) => window.api.captures.get(one), id)
  check('pressed: the capture keeps "Unattributed"', kept?.attribution === 'Unattributed', kept?.attribution)
  check('and the line closes', (await h.locator('[data-ask-who]').count()) === 0)
} catch (error) {
  check('ran', false, error.stack)
} finally {
  await c.close()
}
done()
