// The Bin sorts and filters from Display, as every list does:
//   1. newest binned first to start; Oldest binned and A to Z reorder it;
//   2. a kind chip (Task) shows only that kind, and Display counts it;
//   3. with a filter on, "Restore these N" and "Hold to delete N" take only what is shown;
//   4. the chosen sort is kept when the Bin is opened again.
// SHOTS=dir keeps pictures, light and dark, the Bin beside Writing.
//   QA_DATA=$(mktemp -d) QA_ENTRY=out-p/main/index.js HALIGTREE_QA_AWAY=1 [SHOTS=dir] node qa/bin-sort.mjs
import { mkdirSync } from 'fs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const SHOTS = process.env.SHOTS
if (SHOTS) mkdirSync(SHOTS, { recursive: true })
const results = []
const check = (name, ok, detail = '') => (results.push(!!ok), console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`))
const c = await sandbox({ width: 1400, height: 900 })
const { h, v, go } = c
const wait = (ms) => h.waitForTimeout(ms)
const BIN = '[data-page="discarded"]'
const names = () => h.evaluate((bin) => [...document.querySelectorAll(`${bin} [data-bin-row]`)].map((row) => row.querySelector('.private-text')?.textContent?.trim()).filter((one) => one?.startsWith('Sort probe')), BIN)
const sortBy = async (label) => {
  await h.locator(`${BIN} [data-display]`).first().click(); await wait(500)
  await h.getByRole('menuitemradio', { name: label }).first().click(); await wait(400)
  await h.keyboard.press('Escape'); await wait(500)
}

try {
  // Three tasks and a gem, binned one after another: the Bin's own times set the order.
  const ids = []
  for (const title of ['Sort probe Mango', 'Sort probe Apple', 'Sort probe Zebra']) {
    const made = await v('task:add', title)
    await v('task:save', made.id, { status: 'dropped' })
    ids.push(made.id)
    await wait(1100)
  }
  const gem = await v('nugget:from', 'Sort probe Kiwi gem', {})
  await v('bin:put', gem)
  await go('discarded'); await wait(2000)

  const first = await names()
  check('newest binned first to start', first.join(',') === 'Sort probe Kiwi gem,Sort probe Zebra,Sort probe Apple,Sort probe Mango', first.join(' / '))
  check('the Display button is on the Bin', (await h.locator(`${BIN} [data-display]`).count()) === 1)
  if (SHOTS) for (const theme of ['light', 'dark']) {
    await c.theme(theme); await go('discarded'); await wait(1200)
    await h.screenshot({ path: `${SHOTS}/bin-${theme}.png` })
    await h.locator(`${BIN} [data-display]`).first().click(); await wait(600)
    await h.screenshot({ path: `${SHOTS}/bin-display-${theme}.png` })
    await h.keyboard.press('Escape'); await wait(300)
    await go('articles'); await wait(1200)
    await h.screenshot({ path: `${SHOTS}/writing-${theme}.png` })
  }
  if (SHOTS) { await c.theme('light'); await go('discarded'); await wait(1200) }

  await sortBy('Oldest binned')
  const old = await names()
  check('Oldest binned turns it round', old.join(',') === 'Sort probe Mango,Sort probe Apple,Sort probe Zebra,Sort probe Kiwi gem', old.join(' / '))
  await sortBy('A to Z')
  const az = await names()
  check('A to Z', az.join(',') === 'Sort probe Apple,Sort probe Kiwi gem,Sort probe Mango,Sort probe Zebra', az.join(' / '))

  // Kept: away and back, still A to Z.
  await go('articles'); await wait(800); await go('discarded'); await wait(1500)
  check('the sort is kept', (await names()).join(',') === az.join(','))

  // The Task chip: only tasks, and the buttons speak for those.
  const all = await h.locator(`${BIN} [data-bin-row]`).count()
  await h.locator(`${BIN} [data-kind-chips] button[aria-pressed]`, { hasText: /^Task$/ }).first().click(); await wait(700)
  const rows = await h.evaluate((bin) => [...document.querySelectorAll(`${bin} [data-bin-row]`)].map((row) => row.dataset.binRow), BIN)
  check('the Task chip shows only tasks', rows.length === 3 && rows.every((one) => one === 'task'), `${rows.length} of ${all}`)
  const restore = h.locator(`${BIN} button`, { hasText: /^Restore these 3$/ })
  check('"Restore these 3" speaks for what shows', (await restore.count()) === 1)
  check('"Hold to delete 3" in place of "Hold to empty"', (await h.locator(`${BIN} button`, { hasText: /^Hold to delete 3$/ }).count()) === 1 && (await h.locator(`${BIN} button`, { hasText: /^Hold to empty$/ }).count()) === 0)
  if (SHOTS) await h.screenshot({ path: `${SHOTS}/bin-tasks.png` })
  await restore.first().click(); await wait(1500)
  const back = await Promise.all(ids.map((id) => v('task', id)))
  check('Restore these 3 brought back the three tasks', back.every((task) => task?.status === 'open'), back.map((task) => task?.status).join(','))
  const left = await names()
  check('and left the gem in the Bin, shown again once no task is left to filter on', left.join(',') === 'Sort probe Kiwi gem', left.join(' / '))
  check('"Hold to empty" is back', (await h.locator(`${BIN} button`, { hasText: /^Hold to empty$/ }).count()) === 1)
  check('no page errors', !c.errors.length, c.errors.slice(0, 3).join(' | '))
} finally {
  await c.close()
}
const failed = results.filter((ok) => !ok).length
console.log(`\n${results.length - failed}/${results.length} passed`)
process.exit(failed ? 1 : 0)
