// An Obsidian vault's folders come in as nested groups (note-imports.ts):
// Work › Clients › Acme / 2024, three levels deep with the fourth folded into
// the third by its path, Work a group though it holds only a folder, and the
// notes at the top of the vault left loose. The sidebar's tree shows them with
// their counts; the same vault brought in again, with one note more, puts it
// in the group already there and makes none twice.
//
//   npx electron-vite build --outDir out-r
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-r/main/index.js HALIGTREE_QA_AWAY=1 node qa/vault-folders.mjs
import { mkdirSync, mkdtempSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

const vault = mkdtempSync(join(tmpdir(), 'haligtree-vault-'))
mkdirSync(join(vault, '.obsidian'))
mkdirSync(join(vault, 'Work', 'Clients', 'Acme', '2024'), { recursive: true })
writeFileSync(join(vault, 'Work', 'Clients', 'Intro call.md'), '# Intro call\n\nHow we met.\n')
writeFileSync(join(vault, 'Work', 'Clients', 'Acme', '2024', 'Q1 review.md'), '# Q1 review\n\nThe first quarter.\n')
writeFileSync(join(vault, 'Work', 'Clients', 'Acme', '2024', 'Q2 review.md'), '# Q2 review\n\nThe second quarter.\n')
writeFileSync(join(vault, 'Top one.md'), '# Top one\n\nAt the top.\n')
writeFileSync(join(vault, 'Top two.md'), '# Top two\n\nAlso at the top.\n')
process.env.QA_DATA ??= mkdtempSync(join(tmpdir(), 'haligtree-vault-data-'))
process.env.HALIGTREE_QA_VAULT = vault

const { open, checks } = await import('./harness.mjs')
const { check, done } = checks()

/** The app opened on this vault, its import waited for until `ready` says so. */
async function run(ready) {
  const qa = await open()
  let h
  for (let i = 0; i < 100 && !h; i++) {
    h = qa.electron.windows().find((w) => w.url().includes('view=home'))
    if (!h) await qa.page.waitForTimeout(200)
  }
  const groups = () => h.evaluate(() => window.api.haligtree('groups', 'article'))
  for (let i = 0; i < 60; i++) {
    await h.waitForTimeout(1000)
    const pending = await h.evaluate(() => window.api.haligtree('imports:pending')).catch(() => [1])
    if (!pending.length && ready(await groups())) break
  }
  return { qa, h, groups }
}
const byName = (list, name) => list.find((one) => one.name === name)

let qa
try {
  const first = await run((list) => !!byName(list, 'Acme / 2024'))
  qa = first.qa
  const list = await first.groups()
  const work = byName(list, 'Work'), clients = byName(list, 'Clients'), acme = byName(list, 'Acme / 2024')
  check('Work, Clients and "Acme / 2024" are groups, and nothing else', list.length === 3 && !!work && !!clients && !!acme, list.map((one) => one.name).join(', '))
  check('nested: Clients in Work, "Acme / 2024" in Clients', !work?.parent && clients?.parent === work?.id && acme?.parent === clients?.id, JSON.stringify(list.map(({ name, parent }) => ({ name, parent }))))
  check('Work holds no note of its own, Clients one, "Acme / 2024" two', work?.members.length === 0 && clients?.members.length === 1 && acme?.members.length === 2, list.map((one) => `${one.name}:${one.members.length}`).join(', '))
  const loose = (await first.h.evaluate(() => window.api.haligtree('items', 'article'))).filter((one) => one.title.startsWith('Top ') && !one.groupId)
  const grouped = new Set(list.flatMap((one) => one.members))
  check('the notes at the top of the vault stay loose', (await first.h.evaluate(() => window.api.haligtree('items', 'article'))).filter((one) => one.title.startsWith('Top ')).every((one) => !grouped.has(one.id)), loose.map((one) => one.title).join(', '))

  // The sidebar's tree, under Writing: each folder a step in from its parent, with what it holds, its subgroups' too.
  await qa.electron.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().includes('view=home'))?.webContents.send('home:open', 'view', 'articles'))
  await first.h.waitForTimeout(1200)
  const tree = await first.h.evaluate(() => [...document.querySelectorAll('[data-side-folders="article"] [data-side-folder]')].map((one) => ({ text: one.textContent.trim(), indent: parseFloat(getComputedStyle(one).paddingLeft) })))
  // A name and count are each drawn twice (Weighted, Count), one shown.
  const reads = (one, name, n) => !!one && new RegExp(`^(${name})+(${n})+$`).test(one.text)
  check('the sidebar shows Work 3, Clients 3, "Acme / 2024" 2, in that order', reads(tree[0], 'Work', 3) && reads(tree[1], 'Clients', 3) && reads(tree[2], 'Acme / 2024', 2) && tree.length === 3, JSON.stringify(tree))
  check('each a step in from the one above', tree.length === 3 && tree[0].indent < tree[1].indent && tree[1].indent < tree[2].indent, tree.map((one) => one.indent).join(' < '))
  await qa.close().catch(() => undefined)
  qa = null

  // The same vault again, a note more in 2024: into the group already there.
  writeFileSync(join(vault, 'Work', 'Clients', 'Acme', '2024', 'Q3 review.md'), '# Q3 review\n\nThe third quarter.\n')
  const second = await run((list) => byName(list, 'Acme / 2024')?.members.length === 3)
  qa = second.qa
  const again = await second.groups()
  check('brought in again, no group is made twice', again.length === 3 && ['Work', 'Clients', 'Acme / 2024'].every((name) => again.filter((one) => one.name === name).length === 1), again.map((one) => one.name).join(', '))
  check('and the new note joins "Acme / 2024"', byName(again, 'Acme / 2024')?.members.length === 3 && byName(again, 'Clients')?.members.length === 1, again.map((one) => `${one.name}:${one.members.length}`).join(', '))
} catch (error) {
  check('ran to the end', false, error.message.split('\n')[0])
} finally {
  await qa?.close().catch(() => undefined)
}
done()
