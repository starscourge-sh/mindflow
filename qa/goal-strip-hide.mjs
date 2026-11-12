// The goals at the top of Home (once asked for) can be put away where they are: right-click a goal, "Hide goals here"; “Goals on Home” in Settings brings them back.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/goal-strip-hide.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const { check, done } = checks()
const c = await sandbox({ width: 1200, height: 900 })
const { h, go } = c
try {
  // Goals on Home are asked for (off in a new book): the nearest two, for this check.
  await h.evaluate(() => window.api.haligtree('settings:set', { sounds: false, hintRate: 0, goalsOnHome: 'nearest', goalsNearest: 2 }))
  await go('home')
  const row = h.locator('[data-strip-goal]').first()
  await row.waitFor({ timeout: 8000 })
  check('Home shows goals at the top', (await h.locator('[data-strip-goal]').count()) > 0)
  await row.click({ button: 'right' })
  const hide = h.getByRole('menuitem', { name: 'Hide goals here' })
  await hide.waitFor({ timeout: 3000 })
  const items = await h.getByRole('menuitem').allTextContents()
  check('right-click on a goal offers to hide the strip', items.some((one) => one.includes('Hide goals here')), JSON.stringify(items))
  if (process.env.SHOTS) await h.screenshot({ path: `${process.env.SHOTS}/goal-strip-menu.png` })
  await hide.click()
  await h.waitForTimeout(800)
  check('the goals are gone from Home', (await h.locator('[data-strip-goal]').count()) === 0)
  const saved = await h.evaluate(() => window.api.haligtree('settings').catch(() => null))
  check('and it is kept as the setting', saved?.goalsOnHome === 'off', JSON.stringify(saved?.goalsOnHome))
  await h.evaluate(() => window.api.haligtree('settings:set', { goalsOnHome: 'nearest' }))
  await h.waitForTimeout(800)
  check('turned back on, they return', (await h.locator('[data-strip-goal]').count()) > 0)
} catch (error) {
  check('the run finished', false, error.message.split('\n')[0])
} finally {
  await c.close?.()
}
done()
