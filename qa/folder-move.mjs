// The one-time move (src/main/folders.ts `moveFolders`): Writing's and Gems' folders become Folders, with a copy of the
// book made first and nothing lost. Run on a COPY of a book (QA_DATA), never the book itself:
//
//   QA_ARGS= QA_DATA=<copy> QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/folder-move.mjs
//
// Read straight from the copy before it opens: every folder, every note in one (directly or through a group inside
// one). After the app has opened it: the backup is there, two folders of one name became one, each of those notes
// has the folder it was in, groups keep their notes, no note was lost or doubled, and the notice counts what moved.
// Then the move is undone, and every note's group and order are as they were.
import { DatabaseSync } from 'node:sqlite'
import { existsSync, readFileSync, readdirSync } from 'fs'
import { loadavg } from 'os'
import { join } from 'path'
import { sandbox } from './sandbox-lib.mjs'
import { checks } from './harness.mjs'

const { check, done } = checks()
const root = process.env.QA_DATA
if (!root || /book-master/.test(root)) throw new Error('QA_DATA must be your own copy of a book, never book-master')
const shelf = existsSync(join(root, 'books.json')) ? JSON.parse(readFileSync(join(root, 'books.json'), 'utf8')) : null
const book = shelf?.last && shelf.last !== 'default' ? join(root, 'books', shelf.last) : root
const file = join(book, 'haligtree.db')
const ask = (run) => { const db = new DatabaseSync(file, { readOnly: true }); try { return run(db) } finally { db.close() } }

const before = ask((db) => {
  const groups = db.prepare('select id, list, name, parent_id as parent, folder from note_groups').all()
  const folders = groups.filter((one) => one.folder && one.list !== 'folders')
  const isFolder = new Set(folders.map((one) => one.id))
  const byId = new Map(groups.map((one) => [one.id, one]))
  const above = (id) => { for (let at = id, n = 0; at && n < 12; at = byId.get(at)?.parent, n++) if (isFolder.has(at)) return at; return null }
  const notes = db.prepare('select id, group_id as "group", group_order as "order" from nuggets').all()
  const filed = notes.filter((one) => one.group && above(one.group))
  return { folders, notes, filed: filed.map((one) => ({ ...one, folder: above(one.group) })), names: new Set(folders.filter((one) => !one.parent || !isFolder.has(one.parent)).map((one) => one.name.toLowerCase())).size }
})
console.log(`before: ${before.folders.length} folders (${before.names} names at the top), ${before.filed.length} notes in them, ${before.notes.length} notes in all`)
if (!before.folders.length) throw new Error('This copy has no Writing or Gems folders to move: take a fresh copy of the book')

const c = await sandbox({ width: 1100, height: 760, seeded: false })
try {
  // The window asked as it opened: its notice counts what moved.
  const notice = await c.h.waitForFunction(() => [...document.querySelectorAll('[data-sonner-toast]')].map((one) => one.textContent ?? '').find((one) => /folders are in Folders now/.test(one)), null, { timeout: 30000 }).then((one) => one.jsonValue()).catch(() => '')
  console.log('notice:', notice, `load ${loadavg()[0].toFixed(1)}`)
  check('the move ran, and the window says what moved', new RegExp(`${before.names} folders holding ${before.filed.length} things`).test(notice), notice)
  check('the notice is said only once', (await c.v('folders:moved')) === null)
  const backups = readdirSync(join(root, 'backups'), { recursive: true }).filter((one) => /haligtree-before-folders-.*\.db$/.test(String(one)))
  check('a copy of the book was made first', backups.length === 1, backups.join(', '))
  const after = ask((db) => ({
    folders: db.prepare("select id, name, parent_id as parent, starred from note_groups where list = 'folders'").all(),
    left: db.prepare("select count(*) as n from note_groups where folder = 1 and list != 'folders'").get().n,
    notes: db.prepare('select id, group_id as "group", folder_id as folder from nuggets').all(),
    nestedGroups: db.prepare("select count(*) as n from note_groups g join note_groups p on p.id = g.parent_id where g.list != 'folders' and p.list = 'folders'").get().n
  }))
  check('Writing and Gems keep no folder', after.left === 0, `${after.left}`)
  check('two folders of one name became one', after.folders.length === before.names, after.folders.map((one) => one.name).join(', '))
  check('the top-level folders are starred', after.folders.filter((one) => !one.parent).every((one) => one.starred === 1))
  check('no note was lost or doubled', after.notes.length === before.notes.length && new Set(after.notes.map((one) => one.id)).size === before.notes.length, `${after.notes.length} of ${before.notes.length}`)
  const name = new Map(before.folders.map((one) => [one.id, one.name.toLowerCase()]))
  const now = new Map(after.folders.map((one) => [one.id, one.name.toLowerCase()]))
  const byNote = new Map(after.notes.map((one) => [one.id, one]))
  const wrong = before.filed.filter((one) => now.get(byNote.get(one.id)?.folder) !== name.get(one.folder))
  check('every note is in the folder it was in', !wrong.length, `${wrong.length} wrong`)
  const groupsKept = before.filed.filter((one) => !before.folders.some((f) => f.id === one.group)).every((one) => byNote.get(one.id)?.group === one.group)
  check('a note in a group keeps its group', groupsKept)
  check('no group sits inside a folder', after.nestedGroups === 0)
  // Undone: every note's group and order as before.
  check('the move undoes', await c.v('folders:unmove'))
  const back = ask((db) => db.prepare('select id, group_id as "group", group_order as "order" from nuggets').all())
  const was = new Map(before.notes.map((one) => [one.id, one]))
  const differ = back.filter((one) => was.get(one.id)?.group !== one.group || was.get(one.id)?.order !== one.order)
  check('undone, every note is in its old folder and place', !differ.length, `${differ.length} differ`)
  check('undone, the old folders are back', ask((db) => db.prepare("select count(*) as n from note_groups where folder = 1 and list != 'folders'").get().n) === before.folders.length)
} finally {
  await c.close()
}
done()
