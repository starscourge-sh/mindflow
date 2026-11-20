// Writing's row in the sidebar unfolds to its pages: the first four in Writing's own order, then "See all"; a page
// further down, once open, stands among the four in its place and lit; a row opens its page beside Writing's list;
// the fold is remembered; a Writing with no pages has no fold.
//   QA_ARGS=--sandbox QA_DATA=<a copy of the seeded sandbox> QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/writing-pages.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const { check, done } = checks()
const c = await sandbox({ width: 1400, height: 900 })
const { h, v, go } = c
const wait = (ms) => h.waitForTimeout(ms)
const FOLD = '[data-folders-fold="article"]'
const rows = () => h.evaluate(() => [...document.querySelectorAll('[data-side-thing][data-type="article"]')].filter((one) => !one.closest('[data-side-folders-section]')).map((one) => ({ id: one.dataset.sideThing, lit: one.getAttribute('aria-current') === 'page' })))
// Writing's own list, as drawn on its page: the order the sidebar should follow.
const listed = () => h.evaluate(() => [...document.querySelectorAll('[data-pane] [data-row][data-id]')].map((one) => one.dataset.id))
const unfold = async (on) => { if ((await h.getAttribute(FOLD, 'aria-expanded')) !== String(on)) { await h.hover('[data-side-row][aria-label="Writing"]'); await h.click(FOLD); await wait(400) } }
try {
  await v('settings:set', { sounds: false, hintRate: 0 })
  await h.evaluate(() => localStorage.setItem('view:article', JSON.stringify({ sort: 'newest', group: 'date', filter: {}, density: 'list' })))
  await h.reload(); await wait(2000)
  await go('articles'); await wait(800)
  const order = (await listed()).filter((id, n, all) => all.indexOf(id) === n)
  await unfold(true)
  const first = await rows()
  const more = await h.locator('[data-writing-all]').count()
  check('unfolded, Writing shows its first 4 pages and "See all"', first.length === 4 && more === 1, `${first.length} rows, ${more} See all`)
  check('in Writing\'s own order', first.map((one) => one.id).join() === order.slice(0, 4).join(), `${first.map((one) => one.id).join()} vs ${order.slice(0, 4).join()}`)
  // The ninth page, opened from the list: the first three, then it, lit.
  const ninth = order[8]
  await h.click(`[data-pane] [data-row][data-id="${ninth}"]`); await wait(1200)
  const after = await rows()
  check('a page past the first 4, open, shows as the 4th after the first 3, lit', after.map((one) => one.id).join() === [...order.slice(0, 3), ninth].join() && after[3]?.lit && after.filter((one) => one.lit).length === 1, JSON.stringify(after))
  check('one light in the sidebar', (await h.locator('[data-side-row][aria-current="page"]').count()) === 1)
  // Frames (SHOTS=<folder>): the unfold, then light and dark beside a folder's tree in Folders.
  if (process.env.SHOTS) {
    const side = h.locator('aside')
    await unfold(false)
    await h.hover('[data-side-row][aria-label="Writing"]'); await h.click(FOLD)
    for (let n = 0; n < 6; n++) { await side.screenshot({ path: `${process.env.SHOTS}/unfold-${n}.png` }); await wait(50) }
    const tree = h.locator('[data-side-folders-section] [data-folder-fold][aria-expanded="false"]').first()
    if (await tree.count()) { await h.hover('[data-side-folders-section] [data-side-folder]'); await tree.click(); await wait(500) }
    await c.both(`${process.env.SHOTS}/beside`, side)
  }
  // A row opens its page beside Writing's list.
  await h.click(`[data-side-thing="${order[1]}"]`); await wait(1200)
  check('a row opens its page beside Writing\'s list', (await h.locator(`[data-open="${order[1]}"]`).count()) > 0 && (await h.locator(`[data-pane] [data-row][data-id="${order[0]}"]`).count()) > 0)
  // "See all" is Writing itself, no page open; then a chosen sort is followed: A to Z.
  await h.click('[data-writing-all]'); await wait(800)
  check('"See all" opens Writing\'s list', (await h.locator('[data-pane] [data-row][data-id]').count()) > 4)
  await h.evaluate(() => localStorage.setItem('view:article', JSON.stringify({ sort: 'name', group: 'none', filter: {}, density: 'list' })))
  await h.reload(); await wait(2000)
  await go('articles'); await wait(800)
  const named = (await listed()).filter((id, n, all) => all.indexOf(id) === n)
  const now = await rows()
  const lit = named.indexOf(now.find((one) => one.lit)?.id)
  const want = lit < 4 ? named.slice(0, 4) : [...named.slice(0, 3), named[lit]]
  check('a chosen sort (A to Z) is followed, the open page among the 4', now.map((one) => one.id).join() === want.join(), `${now.map((one) => one.id).join()} vs ${want.join()}`)
  // Folded, and still folded after a reload.
  await unfold(false)
  await h.reload(); await wait(2000)
  check('folded, it stays folded', (await h.getAttribute(FOLD, 'aria-expanded')) === 'false' && (await rows()).length === 0)
  // No pages: no fold.
  await v('bin:put-many', (await v('items', 'article')).map((one) => one.id))
  await wait(1500)
  check('a Writing with no pages has no fold', (await h.locator(FOLD).count()) === 0, `${(await v('items', 'article')).length} pages left, ${(await v('groups', 'article'))?.length} groups`)
} catch (error) {
  check('the run finished', false, error.message.split('\n')[0])
} finally {
  await c.close?.()
}
done()
