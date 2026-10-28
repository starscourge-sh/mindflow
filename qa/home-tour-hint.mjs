// Home's line offers "Show me around": gone through the tour to its end, the line folds away for good;
// skipped, it stays.
//   npx electron-vite build --outDir out-th
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-th/main/index.js HALIGTREE_QA_AWAY=1 node qa/home-tour-hint.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const { check, done } = checks()
const c = await sandbox({ width: 1280, height: 860 })
const { h, go, v } = c
const LINE = 'What is coming back to you today.'
const lineUp = async () => (await h.getByText(LINE, { exact: false }).count()) > 0
try {
  await v('settings:set', { sounds: false })
  await go('home')
  let up = false
  for (let i = 0; i < 30 && !up; i++) (up = await lineUp()) || (await h.waitForTimeout(200))
  check('Home shows its line with "Show me around"', up)
  // Skipped: the line stays.
  await h.getByRole('button', { name: 'Show me around' }).click()
  await h.waitForSelector('[aria-label="Where things are"]')
  await h.keyboard.press('Escape')
  await h.waitForTimeout(800)
  check('skipped, the line stays', await lineUp())
  // Through to the end: it folds away.
  await h.getByRole('button', { name: 'Show me around' }).click()
  await h.waitForSelector('[aria-label="Where things are"]')
  for (let i = 0; i < 10 && (await h.$('[aria-label="Where things are"]')); i++) (await h.locator('[aria-label="Where things are"] button', { hasText: /^(Next|Done)/ }).click(), await h.waitForTimeout(350))
  check('the tour ended', !(await h.$('[aria-label="Where things are"]')))
  await h.waitForTimeout(2600)
  check('gone through, the line folds away', !(await lineUp()))
  await go('inbox')
  await go('home')
  await h.waitForTimeout(800)
  check('and stays away', !(await lineUp()))
  check('no page errors', !c.errors.some((one) => one.includes('PAGEERROR')), c.errors.join(' | '))
} catch (error) {
  check('ran', false, error.stack)
} finally {
  await c.close()
}
done()
