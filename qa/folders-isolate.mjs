// A note in a folder lives there alone: Writing's and Gems' top level is their folders, then the loose notes, in every
// order; a folder's notes show only once it is opened; the sort menu has no "Folders first" and no Grouping.
//
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-fi/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox node qa/folders-isolate.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'

const { check, done } = checks()
const s = await sandbox({ width: 1300, height: 860 })
const { h, v, go, close, errors } = s
const shots = process.env.QA_SHOTS
const look = () => h.evaluate(() => {
  // Folders are a grid of folders over the loose notes now (folder-grid.tsx): each tile an F, then the rows.
  const rows = [...document.querySelectorAll('[role="main"] [data-folder-tile], [role="main"] [data-group-row], [role="main"] [data-row]')]
  return { order: rows.map((one) => (one.hasAttribute('data-group-row') || one.hasAttribute('data-folder-tile') ? 'F' : 'n')).join(''), ids: rows.filter((one) => !one.hasAttribute('data-group-row')).map((one) => one.getAttribute('data-row')), marks: document.querySelectorAll('[role="main"] [data-row-folder]').length }
})
try {
  await v('settings:set', { hintRate: 0 })
  for (const [page, list] of [['articles', 'article'], ['nuggets', 'nugget']]) {
    const inFolders = new Set((await v('groups', list)).flatMap((one) => one.members))
    for (const sort of ['newest', 'name', 'manual']) {
      await h.evaluate(([key, sort]) => { const was = JSON.parse(localStorage.getItem(key) ?? '{}'); localStorage.setItem(key, JSON.stringify({ ...was, sort, group: 'kind' })) }, [`view:${list}`, sort])
      await go(page === 'articles' ? 'nuggets' : 'articles')
      await go(page)
      await h.waitForTimeout(900)
      const seen = await look()
      const leaked = seen.ids.filter((id) => inFolders.has(id))
      check(`${page}, ${sort}: folders first, then loose notes, none from inside a folder`, /^F+n*$/.test(seen.order) && !leaked.length && !seen.marks, JSON.stringify({ order: seen.order, leaked: leaked.length, marks: seen.marks }))
    }
    if (shots) await h.screenshot({ path: `${shots}/${page}-isolated.png` })
    // Opened, a folder shows what it holds.
    const shelf = (await v('groups', list)).filter((one) => !one.parent && one.members.length)
    const target = shelf[0]
    // Opened (a click on its folder), it shows what it holds: its own notes as rows.
    await h.locator(`[role="main"] [data-folder-tile="${target.id}"] button`).first().click()
    await h.waitForTimeout(900)
    const open = await look()
    const notes = open.order.replace(/F/g, '').length
    check(`${page}: ${target.name} opened shows its ${target.members.length} notes`, notes === target.members.length, open.order)
    await go(page)
    await h.waitForTimeout(600)
    if (shots) await h.screenshot({ path: `${shots}/${page}-folder-open.png` })
    await h.locator('[data-display]').first().click().catch(() => {})
    await h.waitForTimeout(400)
    const menu = await h.evaluate(() => document.body.innerText)
    check(`${page}: no "Folders first" and no Grouping in Display`, !/Folders first/.test(menu) && !/\bGrouping\b/.test(menu))
    await h.keyboard.press('Escape')
  }
  check('no page errors', errors.length === 0, errors.join(' | '))
} finally {
  await close()
}
done()
