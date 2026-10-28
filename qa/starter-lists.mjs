// Gems' right-click menu: "Start a list" makes one of the lists commonplace keepers start with
// (Overheard, Scents...), a folder of Gems with its emoji, opens it, and Undo takes it back.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-sl/main/index.js HALIGTREE_QA_AWAY=1 node qa/starter-lists.mjs [shots]
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'
const SHOTS = process.argv[2] ?? ''
const { check, done } = checks()
const c = await sandbox({ width: 1280, height: 860 })
const { h, v } = c
try {
  await v('settings:set', { sounds: false })
  await h.locator('button[aria-label="Gems"][data-side-row]').click({ button: 'right' })
  await h.getByRole('menuitem', { name: 'Start a list' }).hover()
  await h.waitForTimeout(300)
  if (SHOTS) await h.screenshot({ path: `${SHOTS}/starter-menu.png` })
  await h.getByRole('menuitem', { name: /Overheard/ }).click()
  await h.waitForTimeout(900)
  const folder = await h.evaluate(() => [...document.querySelectorAll('nav *, aside *')].some((one) => one.childElementCount === 0 && one.textContent?.trim() === 'Overheard'))
  check('the list is a folder in Gems, in the sidebar', folder)
  check('and it is open', await h.evaluate(() => document.body.innerText.includes('Overheard')))
  if (SHOTS) await h.screenshot({ path: `${SHOTS}/starter-made.png` })
  await h.getByRole('button', { name: /Undo/ }).first().click()
  await h.waitForTimeout(900)
  check('Undo takes it back', !(await h.evaluate(() => [...document.querySelectorAll('nav *, aside *')].some((one) => one.childElementCount === 0 && one.textContent?.trim() === 'Overheard'))))
  check('no page errors', !c.errors.some((one) => one.includes('PAGEERROR')), c.errors.join(' | '))
} catch (error) {
  check('ran', false, error.stack)
} finally {
  await c.close()
}
done()
