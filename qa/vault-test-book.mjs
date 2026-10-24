// Trying a vault in a test book of its own: the vault picker offers "A test
// book of its own" first, picking a vault makes a book named after it and
// switches there, and that book's first run asks which of the vault's
// folders to bring in (the vault is not asked for again). The notes land in
// the test book; My book gets none of them. "Into My book" still imports here.
//
//   npx electron-vite build --outDir out-x
//   QA_DATA=$(mktemp -d) QA_ENTRY=out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/vault-test-book.mjs
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { DatabaseSync } from 'node:sqlite'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'

const { check, done } = checks()
const root = process.env.QA_DATA
if (!root || root.includes('Application Support')) throw new Error('needs a QA_DATA of its own')
// A small vault, and an Obsidian that knows it.
const vault = join(mkdtempSync(join(tmpdir(), 'haligtree-vault-')), 'Field notes')
mkdirSync(join(vault, '.obsidian'), { recursive: true })
mkdirSync(join(vault, 'Reading'), { recursive: true })
writeFileSync(join(vault, 'Reading', 'Dune.md'), '# Dune\n\nFear is the mind-killer. #books\n')
writeFileSync(join(vault, 'Reading', 'Hamlet.md'), '# Hamlet\n\nThe rest is silence.\n')
writeFileSync(join(vault, 'Idea.md'), '# An idea\n\nNotes that come back to you.\n')
writeFileSync(join(root, 'obsidian.json'), JSON.stringify({ vaults: { a: { path: vault, ts: Date.now(), open: true } } }))
process.env.HALIGTREE_OBSIDIAN_CONFIG = join(root, 'obsidian.json')

const launch = (args = '') => ((process.env.QA_ARGS = args), sandbox({ seeded: false }))
const stub = (c) => c.electron.evaluate(({ app }) => {
  globalThis.__relaunched = null
  const children = process.mainModule.require('child_process')
  children.spawn = (_command, args) => (globalThis.__relaunched = args ?? [], { unref() {}, on() {}, kill() {} })
  app.relaunch = (options) => void (globalThis.__relaunched = options?.args ?? [])
  app.quit = () => void (globalThis.__quit = true)
  app.exit = () => void (globalThis.__quit = true)
})
const relaunched = async (c) => {
  for (let i = 0; i < 80 && !(await c.electron.evaluate(() => globalThis.__relaunched)); i++) await c.h.waitForTimeout(100)
  return c.electron.evaluate(() => globalThis.__relaunched)
}
const notes = (c) => c.h.evaluate(async () => (await window.api.captures.list()).length + (await window.api.haligtree('items:list').catch(() => [])).length)

let id
{
  const c = await launch()
  try {
    await stub(c)
    await c.h.evaluate(() => void window.api.importFrom('vault'))
    await c.h.waitForSelector('[data-vault-picker]', { timeout: 5000 })
    const chosen = await c.h.locator('[data-vault-picker] [aria-selected="true"], [data-vault-picker] [aria-pressed="true"]').first().innerText().catch(() => '')
    check('the picker offers a test book of its own first', /test book/i.test(chosen), chosen)
    check('and says how to delete it after', /Settings, under “Books”/.test(await c.h.locator('[data-vault-where]').innerText()))
    await c.h.screenshot({ path: join(root, 'picker.png') })
    await c.h.locator('[data-vault="Field notes"]').click()
    const args = await relaunched(c)
    const shelf = JSON.parse(readFileSync(join(root, 'books.json'), 'utf8'))
    const made = shelf.books.find((one) => one.name === 'Field notes (trying it)')
    id = made?.id
    check('a book named after the vault is made', !!made, JSON.stringify(shelf.books.map((one) => one.name)))
    check('and the app switches into it', (args ?? []).includes(`--book=${id}`), JSON.stringify(args))
    const next = JSON.parse(readFileSync(join(root, 'books', id, 'next.json'), 'utf8'))
    check('the vault chosen goes with it', next.import === 'vault' && next.root === vault, JSON.stringify(next))
    check('My book got none of it', (await notes(c)) === 0)
  } finally {
    await c.close()
  }
}
{
  const c = await launch(`--book=${id}`)
  try {
    await c.h.waitForSelector('[data-import-folders]', { timeout: 8000 })
    check('the test book asks which folders to bring in, not for the vault again', await c.h.locator('[data-import-folder]').count() >= 2)
    await c.h.locator('[data-folders-bring]').click()
    await c.h.waitForTimeout(5000)
  } finally {
    await c.close()
  }
  const count = (file) => { const db = new DatabaseSync(file, { readOnly: true }); const n = db.prepare('select (select count(*) from captures) + (select count(*) from nuggets) as n').get().n; db.close(); return n }
  const got = count(join(root, 'books', id, 'haligtree.db'))
  check('the vault’s notes are in the test book', got >= 3, `${got}`)
  check('and none in My book', count(join(root, 'haligtree.db')) === 0)
}
{
  const c = await launch('--book=default')
  try {
    await c.h.evaluate(() => void window.api.importFrom('vault'))
    await c.h.waitForSelector('[data-vault-picker]', { timeout: 5000 })
    await c.h.locator('[data-vault-picker] button', { hasText: 'Into My book' }).click()
    await c.h.locator('[data-vault="Field notes"]').click()
    await c.h.waitForSelector('[data-import-folders]', { timeout: 5000 })
    check('"Into My book" imports here, with no switch', true)
    check('no page errors', c.errors.length === 0, c.errors.join(' | '))
  } finally {
    await c.close()
  }
}
done()
