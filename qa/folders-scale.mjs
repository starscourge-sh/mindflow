// Folders at scale: 1,000 folders six levels deep and 5,000 things in them, laid into a COPY of the seeded sandbox
// before it opens, then timed as a person meets them: the sidebar drawn, Writing opened on its folders, the biggest
// folder's page opened, the picker opened and filtered.
//
//   QA_ARGS=--sandbox QA_DATA=<copy> QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/folders-scale.mjs
import { DatabaseSync } from 'node:sqlite'
import { randomUUID } from 'crypto'
import { loadavg } from 'os'
import { join } from 'path'
import { sandbox } from './sandbox-lib.mjs'
import { checks } from './harness.mjs'
process.env.QA_ARGS ??= '--sandbox'

const { check, done } = checks()
const root = process.env.QA_DATA
if (!root) throw new Error('QA_DATA: a copy of the seeded sandbox')
const db = new DatabaseSync(join(root, 'sandbox', 'haligtree.db'))
for (const [table, column] of [['nuggets', 'folder_id text'], ['captures', 'folder_id text'], ['tasks', 'folder_id text'], ['note_groups', 'starred integer not null default 0'], ['note_groups', 'archived_at text']]) {
  try { db.exec(`alter table ${table} add column ${column}`) } catch { /* there */ }
}
const at = new Date().toISOString()
// 10 at the top, each a chain five deep with branches: 1,000 folders, the deepest at level 6.
const made = []
db.exec('begin')
const folder = db.prepare("insert into note_groups (id, list, name, parent_id, folder, starred, created_at) values (?, 'folders', ?, ?, 1, ?, ?)")
const order = db.prepare("insert or replace into note_order (list, id, position) values ('folders', ?, ?)")
const grow = (parent, depth, path) => {
  if (made.length >= 1000) return
  const id = randomUUID()
  const name = depth === 1 ? `Area ${made.length + 1}` : `${path.at(-1)}.${made.length % 7}`
  folder.run(id, name, parent, depth === 1 ? 1 : 0, at)
  order.run('g:' + id, made.length)
  made.push({ id, depth })
  if (depth < 6) for (let i = 0; i < (depth < 3 ? 4 : 2) && made.length < 1000; i++) grow(id, depth + 1, [...path, name])
}
while (made.length < 1000) grow(null, 1, [])
const deepest = made.find((one) => one.depth === 6)
const big = made[1]
const note = db.prepare("insert into nuggets (id, kind, tier, title, body, created_at, updated_at, folder_id) values (?, 'note', ?, ?, 'null', ?, ?, ?)")
for (let i = 0; i < 5000; i++) note.run(randomUUID(), i % 3 ? 'nugget' : 'article', `Scale ${i}`, at, at, i < 2500 ? big.id : made[i % made.length].id)
db.exec('commit')
db.close()
console.log(`laid in: ${made.length} folders (deepest ${Math.max(...made.map((one) => one.depth))}), 5,000 things, 2,500 of them in one folder`)

const c = await sandbox({ width: 1180, height: 800 })
const h = c.h
const time = async (label, run, done) => {
  const start = Date.now()
  await run()
  await h.waitForFunction(done, null, { timeout: 20000 })
  const ms = Date.now() - start
  console.log(`  ${label}: ${ms} ms (load ${loadavg()[0].toFixed(1)})`)
  return ms
}
try {
  const list = await time('every folder read with its counts', () => c.v('folders'), () => true)
  check('the folders read in under a second', list < 1000)
  // Writing's top level: its folders first (folded, not 1,000 rows), then the pages in none.
  const all = await time('Writing opened', () => c.send('view', 'articles'), () => document.querySelectorAll('[data-page="articles"] [data-folder-open]').length > 0)
  check('Writing opens in under a second', all < 1000, `${all}`)
  check('it draws the top level folded, not 1,000 rows', (await h.locator('[data-page="articles"] [data-folder-open]').count()) <= 20, `${await h.locator('[data-page="articles"] [data-folder-open]').count()}`)
  const page = await time('a folder of 2,500 opened', () => c.send('folder', big.id).then(() => h.waitForTimeout(0)), () => document.querySelectorAll('[data-folder-item]').length > 0)
  check('a folder of 2,500 opens in under a second', page < 1500, `${page}`)
  const deep = await time('the deepest folder opened', () => c.send('folder', deepest.id), () => !!document.querySelector('[data-folder-path]') && document.querySelector('[data-folder-path]').textContent.includes('Writing'))
  check('a folder six deep opens, its path drawn', deep < 1500, `${deep}`)
  await c.go('articles')
  const row = h.locator('[data-page="articles"] button[data-row]').first()
  await row.click({ button: 'right' })
  await h.waitForTimeout(250)
  const picker = await time('the picker opened', () => h.getByRole('menuitem', { name: 'Keep in folder…' }).first().click(), () => !!document.querySelector('[data-folder-picker]'))
  check('the picker opens over 1,000 folders in under half a second', picker < 500, `${picker}`)
  check('the picker draws at most 100 rows, the rest said', (await h.locator('[data-folder-pick]').count()) <= 100, `${await h.locator('[data-folder-pick]').count()}`)
  // Typed into the picker's own field: only folders named (or filed under a path) with those words are left.
  const typed = await time('the picker filtered', () => h.keyboard.type('Area 1.'), () => {
    const rows = [...document.querySelectorAll('[data-folder-pick]')]
    return rows.length > 0 && rows.every((one) => one.textContent.toLowerCase().includes('area 1.'))
  })
  check('it filters as you type', typed < 1000, `${typed}`)
  check('the field kept the keys', (await h.evaluate(() => document.activeElement?.closest('[data-folder-picker]') !== null)))
  await h.keyboard.press('Escape')
} finally {
  await c.close()
}
done()
