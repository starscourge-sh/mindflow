// An Obsidian vault's chosen folders brought into Folders (note-imports.ts `fileIntoGroups`), on a COPY of the first
// imports (memory first-imports: Unisa, the AWS notes, the Engineering Codex, the YouTube and Bonfire pages), then
// brought again: once unchanged, once with a note edited, one added and one deleted. Counts must add up and no note
// may come twice. A folder of the vault called "Archive" is offered once to be archived instead.
//
//   QA_VAULT=<a copy of the vault, never the vault itself> QA_ARGS=--sandbox QA_DATA=<sandbox copy> \
//   QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/folder-import.mjs
import { DatabaseSync } from 'node:sqlite'
import { appendFileSync, readdirSync, rmSync, statSync, utimesSync, writeFileSync } from 'fs'
import { loadavg } from 'os'
import { basename, join } from 'path'
import { sandbox } from './sandbox-lib.mjs'
import { checks } from './harness.mjs'
process.env.QA_ARGS ??= '--sandbox'

const { check, done } = checks()
const vault = process.env.QA_VAULT
if (!vault || /Documents\/obsidian/.test(vault)) throw new Error('QA_VAULT must be a copy of the vault, never the vault itself')
const folders = readdirSync(vault, { withFileTypes: true }).filter((one) => one.isDirectory() && !one.name.startsWith('.')).map((one) => ({ id: one.name, name: one.name }))
const notesIn = readdirSync(vault, { recursive: true }).filter((one) => String(one).endsWith('.md') && String(one).includes('/')).length
const c = await sandbox({ width: 1180, height: 800 })
const h = c.h
const bring = async (label) => {
  await h.evaluate(() => { window.__done = null; window.addEventListener('haligtree:import-done', (event) => (window.__done = event.detail), { once: true }) })
  const start = Date.now()
  await c.v('notes-import:run', 'Obsidian', folders, vault)
  const said = await h.waitForFunction(() => window.__done, null, { timeout: 240000 }).then((one) => one.jsonValue())
  console.log(`${label}: ${Date.now() - start} ms (load ${loadavg()[0].toFixed(1)})\n  ${[`${said.made} made`, ...said.notes].join('\n  ')}`)
  return said
}
// Read straight from the copy's database: where each came from and its words.
const pages = async () => { const db = new DatabaseSync(join(process.env.QA_DATA, 'sandbox', 'haligtree.db'), { readOnly: true }); try { return db.prepare("select id, source, body from nuggets where tier = 'article' and source != '' and binned_at is null").all() } finally { db.close() } }
const tree = async () => {
  const all = await c.v('folders')
  const path = (one) => (one.parent ? `${path(all.find((up) => up.id === one.parent))} › ${one.name}` : one.name)
  return all.map((one) => ({ ...one, path: path(one) }))
}
try {
  const first = await bring('first import')
  const source = `Obsidian: ${basename(vault)}`
  const all = await tree()
  check('it lands in Imports › Obsidian: <vault>', all.some((one) => one.path === `Imports › ${source}`), all.slice(0, 4).map((one) => one.path).join(' | '))
  check('the source\'s own folders are inside it', ['Unisa', 'cloud-engineer'].every((name) => all.some((one) => one.path === `Imports › ${source} › ${name}`)))
  const imported = all.filter((one) => one.path.startsWith('Imports'))
  check('only "Imports" is starred, not the vault\'s tree', imported.filter((one) => one.starred).map((one) => one.name).join() === 'Imports', imported.filter((one) => one.starred).map((one) => one.name).join())
  const once = await pages()
  const empty = Number(first.notes.join(' ').match(/(\d+) empty files? (was|were) skipped/)?.[1] ?? 0)
  check('every note in a folder came in once (the empty ones said)', once.length === first.made && first.made + empty === notesIn, `${once.length} pages, ${first.made} made, ${empty} empty, ${notesIn} in the vault's folders`)
  const brought = first.made
  const filed = await c.v('folders:of', 'nuggets')
  check('each is kept in a folder', once.every((one) => filed[one.id]))
  check('the closing notice says where they are', first.notes.some((one) => /kept in .*Imports › Obsidian/.test(one)), first.notes[0])
  // A folder named Archive: offered once.
  const offers = await h.evaluate(() => [...document.querySelectorAll('[role="status"]')].map((one) => one.textContent ?? '').filter((one) => /called “Archive”/.test(one)))
  check('its "Archive" folder is offered to be archived instead', offers.length === 1, offers[0])

  const again = await bring('again, unchanged')
  check('brought again unchanged: nothing new, nothing doubled', again.made === 0 && (await pages()).length === brought)
  check('it says everything is already here', again.notes.some((one) => one.startsWith(`Everything is already here: ${brought.toLocaleString()} notes`)), again.notes.join(' / '))

  // One edited, one added, one deleted in the source.
  const files = readdirSync(join(vault, 'Unisa'), { recursive: true }).filter((one) => String(one).endsWith('.md')).map((one) => join(vault, 'Unisa', String(one))).filter((one) => statSync(one).size > 200)
  appendFileSync(files[0], '\n\nA line added in the source after the first import.\n')
  utimesSync(files[0], new Date(), new Date(Date.now() + 60000))
  writeFileSync(join(vault, 'Unisa', 'A note added later.md'), '# A note added later\n\nNew in the source.\n')
  const gone = files[1]
  rmSync(gone)
  const third = await bring('again, one edited, one added, one deleted')
  const now = await pages()
  check('the added note came in, once', third.made === 1 && now.length === brought + 1, `${third.made} made, ${now.length} pages`)
  check('the edited one was updated in place, said so', third.notes.some((one) => /1 was changed in .* since the last import/.test(one)), third.notes.join(' / '))
  const edited = now.find((one) => one.source.endsWith(basename(files[0])))
  check('its words are the new ones', String(edited?.body ?? '').includes('A line added in the source'))
  check('the deleted one was left alone here', now.some((one) => one.source.endsWith(basename(gone))))
  check('no note is here twice', new Set(now.map((one) => one.source)).size === now.length)
} finally {
  await c.close()
}
done()
