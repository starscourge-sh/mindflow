// Tree lines at every depth: a folder whose only child is a folder (Folder 4 > Folder 3 > notes), and folders
// three deep (Deep 1 > Deep 2 > Deep 3 > a note). In the sidebar each folder row has its own branch from a
// trunk, drawn to the row's middle, light and dark, on Writing and off it.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-q/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox node qa/tree-lines.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const { check, done } = checks()
const c = await sandbox({ width: 1300, height: 900 })
const { h } = c
try {
  const ids = []
  for (const title of ['Under three', 'Also under three', 'Deep note', 'Loose']) {
    const id = await c.v('article:new')
    await c.v('item:save', id, { title })
    ids.push(id)
  }
  const [n1, n2, n3, loose] = ids
  const f4 = 'f-four', f3 = 'f-three', d1 = 'f-d1', d2 = 'f-d2', d3 = 'f-d3'
  const names = { [f4]: 'Folder 4', [f3]: 'Folder 3', [d1]: 'Deep 1', [d2]: 'Deep 2', [d3]: 'Deep 3' }
  const top = [`g:${f4}`, `g:${d1}`, loose]
  const shape = { [f4]: [`g:${f3}`], [f3]: [n1, n2], [d1]: [`g:${d2}`], [d2]: [`g:${d3}`], [d3]: [n3] }
  for (const id of [f4, f3, d1, d2, d3]) await c.v('groups:arrange', 'article', { top, groups: shape, make: { id, name: names[id] } })
  await h.waitForTimeout(1500)
  // Each folder row: a branch (a path in the trunk's svg) ending at the row's middle.
  const twigsOf = (ids) => h.evaluate((list) => list.map((id) => {
    const row = document.querySelector(`[data-side-folder="${id}"]`)
    if (!row) return [id, 'no row']
    let box = row.parentElement
    while (box && !box.querySelector(':scope > svg')) box = box.parentElement
    const svg = box?.querySelector(':scope > svg')
    if (!svg) return [id, 'no trunk']
    const r = row.getBoundingClientRect()
    const mid = r.top + r.height / 2 - box.getBoundingClientRect().top
    const ends = [...svg.querySelectorAll('path')].map((p) => Number(/ (-?[\d.]+) H /.exec(p.getAttribute('d'))?.[1])).filter((y) => !Number.isNaN(y))
    return [id, ends.some((y) => Math.abs(y - mid) < 3) ? 'ok' : `none at ${Math.round(mid)} (${ends.map(Math.round).join(',')})`]
  }), ids)
  const twigs = () => twigsOf([f4, f3, d1, d2, d3])
  for (const [id, how] of await twigs()) check(`sidebar: a branch to ${names[id]}`, how === 'ok', how)
  await h.screenshot({ path: `${process.env.QA_DATA}/tree-side.png` })
  // Dark, after a reload, on Writing, and after Writing's folders are folded and opened again.
  await h.evaluate(() => localStorage.setItem('theme', 'dark'))
  await h.reload(); await h.waitForTimeout(2500)
  await h.locator('[data-side-row][aria-label="Writing"]').click()
  await h.waitForTimeout(1200)
  await h.locator('[data-side-row][aria-label="Writing"]').hover()
  await h.locator('[data-folders-fold="article"]').click(); await h.waitForTimeout(400)
  await h.locator('[data-side-row][aria-label="Writing"]').hover()
  await h.locator('[data-folders-fold="article"]').click(); await h.waitForTimeout(1200)
  // Made in the app: an empty folder, then "New folder inside" it, named, the way the user built theirs.
  await c.v('groups:arrange', 'article', { top: [...top, 'g:f-empty'], groups: shape, make: { id: 'f-empty', name: 'Folder 5', folder: true } })
  await h.waitForTimeout(800)
  await h.evaluate(() => window.dispatchEvent(new CustomEvent('haligtree:folder-new', { detail: { list: 'article', parent: 'f-empty' } })))
  await h.waitForTimeout(800)
  await h.keyboard.type('Folder 6'); await h.keyboard.press('Enter'); await h.waitForTimeout(1200)
  const made = await h.evaluate(() => [...document.querySelectorAll('[data-side-folder]')].find((one) => one.textContent.includes('Folder 6'))?.getAttribute('data-side-folder'))
  if (made) names[made] = 'Folder 6 (made inside Folder 5)'
  check('a folder made inside an empty folder shows', !!made)
  for (const [id, how] of made ? await twigsOf([made]) : []) check(`a branch to ${names[id]}`, how === 'ok', how)
  for (const [id, how] of await twigs()) check(`on Writing, dark: a branch to ${names[id]}`, how === 'ok', how)
  await h.screenshot({ path: `${process.env.QA_DATA}/tree-list.png` })
  // The Writing list: each folder has its block, a nested one inside its parent's.
  const blocks = await h.evaluate((pairs) => pairs.map(([id, parent]) => {
    const block = document.querySelector(`[data-group-block="${id}"]`)
    return [id, !block ? 'no block' : parent && !block.parentElement?.closest(`[data-group-block="${parent}"]`) ? 'not inside its parent' : 'ok']
  }), [[f4, null], [f3, f4], [d1, null], [d2, d1], [d3, d2]])
  for (const [id, how] of blocks) check(`Writing list: ${names[id]} drawn in place`, how === 'ok', how)
} catch (error) {
  check('the run finished', false, error.message.split('\n')[0])
} finally {
  await c.close?.()
}
done()
