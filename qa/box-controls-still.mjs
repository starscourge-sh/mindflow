// Quick capture's round controls glide between their place beside the pill
// and their row above the box; with Motion off in Settings they are simply in
// their new place (they followed only the Mac's Reduce motion before).
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox node qa/box-controls-still.mjs
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const results = []
const check = (name, ok, detail = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`) }
const c = await sandbox({ width: 1100, height: 760 })
const { page, v } = c
// The pill and the box, swapped the way the box swaps them, and how many controls started a glide.
const flip = () => page.evaluate(async () => {
  const card = document.querySelector('.app-container')
  if (!card) return -1
  const was = card.hasAttribute('data-pill')
  card.toggleAttribute('data-pill', !was)
  await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)))
  const moving = [...document.querySelectorAll('.mf-top button, .mf-top [role="button"]')].filter((one) => one.getAnimations().some((a) => a.playState === 'running')).length
  card.toggleAttribute('data-pill', was)
  await new Promise((done) => setTimeout(done, 400))
  return moving
})
try {
  await page.evaluate(() => window.api.showPrompt())
  await page.waitForTimeout(1500)
  check('the box has round controls to move', (await page.evaluate(() => document.querySelectorAll('.mf-top button').length)) > 0)
  await v('settings:set', { motion: true })
  await page.waitForTimeout(600)
  const moving = await flip()
  check('with Motion on, they glide to their new place', moving > 0, String(moving))
  await v('settings:set', { motion: false })
  await page.waitForTimeout(600)
  check('Motion off reached the box', (await page.evaluate(() => document.documentElement.dataset.motion)) === 'off')
  const still = await flip()
  check('with Motion off, none of them glides', still === 0, String(still))
  check('no errors', c.errors.length === 0, c.errors.join(' | '))
} catch (error) {
  check('ran without throwing', false, String(error?.stack ?? error))
} finally {
  await c.close()
  const passed = results.filter(Boolean).length
  console.log(`\n${passed}/${results.length} passed`)
  process.exit(passed === results.length ? 0 : 1)
}
