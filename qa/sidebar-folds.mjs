// The sidebar's folds: Journal folds its Week, Month and Year as Writing folds its folders, and one
// button at the top folds everything, then unfolds everything, remembered across a reload.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-o/main/index.js HALIGTREE_QA_AWAY=1 node qa/sidebar-folds.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const { check, done } = checks()
const c = await sandbox({ width: 1400, height: 1000 })
const { h } = c
const shown = (at) => h.evaluate((sel) => [...document.querySelectorAll(sel)].filter((one) => one.getBoundingClientRect().height > 2 && !one.closest('[inert]')).length, at)
try {
  await h.waitForTimeout(2000)
  check('Journal\'s scales start open', (await shown('[data-side-scale]')) > 0)
  check('folders start open in the sidebar', (await shown('[data-side-folder]')) > 0)
  check('Journal has a fold of its own', (await h.locator('[data-folders-fold="journal"]').count()) === 1)
  await h.locator('[data-folders-fold="journal"]').click(); await h.waitForTimeout(700)
  check('Journal folds its scales away', (await shown('[data-side-scale]')) === 0)
  await h.locator('[data-folders-fold="journal"]').click(); await h.waitForTimeout(700)
  check('and opens them again', (await shown('[data-side-scale]')) > 0)
  const all = h.locator('[data-side-fold-all]')
  check('a fold-everything button at the top', (await all.getAttribute('data-side-fold-all')) === 'fold')
  await all.click(); await h.waitForTimeout(800)
  check('it folds everything', (await shown('[data-side-scale]')) === 0 && (await shown('[data-side-folder]')) === 0 && (await all.getAttribute('data-side-fold-all')) === 'unfold')
  await h.screenshot({ path: `${process.env.QA_DATA}/folded.png` })
  await h.reload(); await h.waitForTimeout(2500)
  check('folded as left after a reload', (await shown('[data-side-scale]')) === 0 && (await shown('[data-side-folder]')) === 0)
  await h.locator('[data-side-fold-all]').click(); await h.waitForTimeout(800)
  check('then unfolds everything', (await shown('[data-side-scale]')) > 0 && (await shown('[data-side-folder]')) > 0)
  await h.screenshot({ path: `${process.env.QA_DATA}/open.png` })
} catch (error) {
  check('the run finished', false, error.message.split('\n')[0])
} finally {
  await c.close?.()
}
done()
