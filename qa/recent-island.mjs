// "Recent" under a note's details: the notes opened most lately, this one left out, each a click away.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 [SHOTS=<dir>] node qa/recent-island.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const { check, done } = checks()
const c = await sandbox({ width: 1700, height: 1000 })
const { h, v } = c
const wait = (ms) => h.waitForTimeout(ms)
try {
  await v('settings:set', { sounds: false, hintRate: 0 })
  await c.go('inbox'); await wait(1500)
  const rows = h.locator('[data-capture-row], [data-row]')
  const titles = []
  for (let i = 0; i < 3; i++) {
    await rows.nth(i).click(); await wait(900)
    titles.push(await rows.nth(i).innerText())
  }
  // Details out, so its islands show.
  if (!(await h.locator('button[aria-label="Details"][aria-pressed="true"]').count())) await h.click('button[aria-label="Details"]').catch(() => {})
  await wait(1500)
  console.log('opened', JSON.stringify(await v('home:recent-opened', 6)), JSON.stringify(await h.evaluate(() => new Date().toISOString())))
  const island = await h.evaluate(() => [...document.querySelectorAll('[data-recent-island] [data-recent-opened]')].map((one) => one.textContent))
  check('"Recent" shows under the details', island.length >= 2, JSON.stringify(island))
  check('the open note is left out', !island.some((one) => titles[2].startsWith(one)), JSON.stringify({ island, open: titles[2] }))
  if (process.env.SHOTS) await h.screenshot({ path: `${process.env.SHOTS}/recent-island.png` })
  const first = await h.locator('[data-recent-island] [data-recent-opened]').first().getAttribute('data-recent-opened')
  await h.evaluate(() => document.querySelector('[data-recent-island] [data-recent-opened]').click()); await wait(900)
  check('a click opens it', (await h.locator(`[data-open="${first}"]`).count()) === 1, first)
  check('no page errors', !c.errors?.some((one) => /PAGEERROR/.test(one)), (c.errors ?? []).slice(0, 2).join(' | '))
} catch (error) {
  check('the run finished', false, error.message.split('\n')[0])
} finally {
  await c.close?.()
}
done()
