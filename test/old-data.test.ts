// Run with: node --test test/old-data.test.ts
// The first launch after the rename copies the old data folder (mindflow) in
// as the new one (haligtree): whole, renamed, links tidied, the old folder
// left byte for byte as it was, and only once.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync, utimesSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join, relative } from 'node:path'
import { MOVED, findOld, moveOldIn, notSetUp, untoldMove } from '../src/main/old-data.ts'

const PIC = 'a'.repeat(64) + '.png'

/** An old database left open mid-session: saves still in its -wal, not folded into the file. */
function oldDb(file: string, notes: number, tag: string): DatabaseSync {
  const db = new DatabaseSync(file)
  db.exec('pragma journal_mode = wal; pragma wal_autocheckpoint = 0')
  db.exec('create table captures (id text primary key, body text, n integer); create table settings (key text primary key, value text); create table tasks (id text primary key)')
  const add = db.prepare('insert into captures values (?, ?, ?)')
  for (let i = 0; i < notes; i++) add.run(`${tag}-${i}`, JSON.stringify({ type: 'image', attrs: { src: `mindflow://asset/${PIC}` } }), i)
  db.prepare('insert into settings values (?, ?)').run('welcomed', '"2026-10-01"')
  return db
}

/** A made-up old folder: My book, a second book, the sandbox, a day's backup, pictures, caches, locks. */
function oldFolder(appData: string, name = 'old-copy'): { root: string; open: DatabaseSync[] } {
  const root = join(appData, name)
  mkdirSync(join(root, 'assets'), { recursive: true })
  mkdirSync(join(root, 'books/b-abc123'), { recursive: true })
  mkdirSync(join(root, 'sandbox/assets'), { recursive: true })
  mkdirSync(join(root, 'backups/database'), { recursive: true })
  const open = [oldDb(join(root, 'mindflow.db'), 30, 'my'), oldDb(join(root, 'books/b-abc123/mindflow.db'), 5, 'book'), oldDb(join(root, 'sandbox/mindflow.db'), 3, 'sb')]
  oldDb(join(root, 'backups/database/mindflow-2026-10-01.db'), 2, 'bk').close()
  writeFileSync(join(root, 'assets', PIC), 'picture bytes')
  writeFileSync(join(root, 'stickies.json'), JSON.stringify([{ body: `mindflow://asset/${PIC}` }]))
  writeFileSync(join(root, 'books.json'), JSON.stringify({ last: 'b-abc123', books: [{ id: 'b-abc123', name: 'Study', createdAt: '2026-10-01' }], backupFolder: join(homedir(), 'Library/Mobile Documents/com~apple~CloudDocs/mindflow') }))
  for (const cache of ['Cache', 'Code Cache', 'GPUCache', 'scenery-cache', 'sandbox/GPUCache', 'books/b-abc123/Code Cache']) {
    mkdirSync(join(root, cache), { recursive: true })
    writeFileSync(join(root, cache, 'data_0'), 'cache')
  }
  mkdirSync(join(root, 'Local Storage/leveldb'), { recursive: true })
  writeFileSync(join(root, 'Local Storage/leveldb/000003.log'), 'the box draft')
  symlinkSync('host-999999', join(root, 'SingletonLock'))
  writeFileSync(join(root, 'DevToolsActivePort'), '1')
  return { root, open }
}

/** Every file and link in a folder with its bytes and times, for "left as it was". */
function hashFolder(root: string): string {
  const hash = createHash('sha256')
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const path = join(dir, entry.name)
      hash.update(relative(root, path))
      if (entry.isDirectory()) walk(path)
      else if (entry.isSymbolicLink()) hash.update('link')
      else hash.update(readFileSync(path)).update(String(statSync(path).mtimeMs))
    }
  }
  walk(root)
  return hash.digest('hex')
}

const count = (file: string): number => {
  const db = new DatabaseSync(file, { readOnly: true })
  try {
    return (db.prepare('select count(*) as n from captures').get() as { n: number }).n
  } finally {
    db.close()
  }
}
const all = (file: string, sql: string): unknown[] => {
  const db = new DatabaseSync(file, { readOnly: true })
  try {
    return db.prepare(sql).all()
  } finally {
    db.close()
  }
}

const env = (appData: string, old: string): Record<string, string> => ({ HALIGTREE_USER_DATA: join(appData, 'new'), HALIGTREE_OLD_DATA: old })

test('copies the old folder in whole, renamed, and leaves it as it was', () => {
  const appData = mkdtempSync(join(tmpdir(), 'haligtree-old-'))
  const { root, open } = oldFolder(appData)
  const before = hashFolder(root)
  const to = join(appData, 'new')
  const moved = moveOldIn(appData, to, env(appData, root), false)
  assert.ok(moved, 'brought in')
  assert.equal(hashFolder(root), before, 'the old folder is byte for byte as it was, even with its databases still open')
  assert.equal(count(join(to, 'haligtree.db')), 30, 'every note of My book, saves in the -wal too')
  assert.equal(count(join(to, 'books/b-abc123/haligtree.db')), 5)
  assert.equal(count(join(to, 'sandbox/haligtree.db')), 3)
  assert.equal(count(join(to, 'backups/database/haligtree-2026-10-01.db')), 2, 'a day backup under its new name')
  assert.ok(!existsSync(join(to, 'mindflow.db')), 'no database under the old name')
  assert.deepEqual(all(join(to, 'haligtree.db'), "select 1 from captures where body like '%mindflow://%'"), [], 'links by the new name')
  assert.equal(all(join(to, 'haligtree.db'), "select 1 from captures where body like '%haligtree://asset/%'").length, 30)
  assert.ok(!readFileSync(join(to, 'stickies.json'), 'utf8').includes('mindflow://'), 'links in text files too')
  const shelf = JSON.parse(readFileSync(join(to, 'books.json'), 'utf8'))
  assert.equal(shelf.last, 'b-abc123')
  assert.ok(shelf.backupFolder.endsWith('com~apple~CloudDocs/haligtree'), 'the iCloud backup folder by its new name')
  assert.equal(readFileSync(join(to, 'assets', PIC), 'utf8'), 'picture bytes', 'pictures whole')
  assert.equal(readFileSync(join(to, 'Local Storage/leveldb/000003.log'), 'utf8'), 'the box draft')
  for (const gone of ['Cache', 'Code Cache', 'GPUCache', 'scenery-cache', 'sandbox/GPUCache', 'books/b-abc123/Code Cache', 'SingletonLock', 'DevToolsActivePort'])
    assert.ok(!existsSync(join(to, gone)), `${gone} left behind`)
  for (const left of readdirSync(appData)) assert.ok(['old-copy', 'new'].includes(left), `nothing half-done left beside it: ${left}`)
  assert.deepEqual(readdirSync(to).filter((name) => /-(wal|shm)$/.test(name)), [], 'no log beside a copy')
  // Said once.
  assert.ok(untoldMove(to))
  assert.equal(untoldMove(to), null)
  // A second launch does nothing, even with no notes added.
  const after = hashFolder(to)
  assert.equal(moveOldIn(appData, to, env(appData, root), false), null)
  assert.equal(hashFolder(to), after)
  for (const db of open) db.close()
  rmSync(appData, { recursive: true })
})

test('a new folder that only showed the welcome is replaced; one with notes never is', () => {
  const appData = mkdtempSync(join(tmpdir(), 'haligtree-old-'))
  const { root, open } = oldFolder(appData)
  const to = join(appData, 'new')
  mkdirSync(to)
  const empty = new DatabaseSync(join(to, 'haligtree.db'))
  empty.exec('create table captures (id text primary key, body text); create table settings (key text primary key, value text)')
  empty.prepare('insert into settings values (?, ?)').run('theme', '"dark"')
  // The one line typed into the welcome is not a book of notes of its own, and comes along.
  empty.prepare('insert into settings values (?, ?)').run('setup', JSON.stringify({ made: { firstId: 'welcome-1' } }))
  empty.prepare('insert into captures values (?, ?)').run('welcome-1', 'my first line')
  empty.close()
  assert.ok(notSetUp(to))
  assert.ok(moveOldIn(appData, to, env(appData, root), false))
  assert.equal(count(join(to, 'haligtree.db')), 31)
  assert.equal((all(join(to, 'haligtree.db'), "select body from captures where id = 'welcome-1'")[0] as { body: string })?.body, 'my first line')
  for (const left of readdirSync(appData)) assert.ok(['old-copy', 'new'].includes(left), `the folder replaced is gone: ${left}`)
  for (const db of open) db.close()

  const mine = mkdtempSync(join(tmpdir(), 'haligtree-old-'))
  const { root: old2, open: open2 } = oldFolder(mine)
  const real = join(mine, 'new')
  mkdirSync(real)
  const db = new DatabaseSync(join(real, 'haligtree.db'))
  db.exec('create table captures (id text primary key, body text)')
  db.prepare('insert into captures values (?, ?)').run('mine', 'my own note')
  db.close()
  const before = hashFolder(real)
  assert.equal(moveOldIn(mine, real, env(mine, old2), false), null)
  assert.equal(hashFolder(real), before, 'a folder with notes of its own is never touched')
  for (const one of open2) one.close()
  rmSync(appData, { recursive: true })
  rmSync(mine, { recursive: true })
})

test('of several old folders, the one saved to most recently; never in a test run without one, nor the sandbox', () => {
  const appData = mkdtempSync(join(tmpdir(), 'haligtree-old-'))
  const a = oldFolder(appData, 'mindflow')
  const b = oldFolder(appData, 'Vigil')
  for (const db of [...a.open, ...b.open]) db.close()
  const old = new Date('2026-09-01')
  for (const file of ['mindflow.db', 'books/b-abc123/mindflow.db']) utimesSync(join(a.root, file), old, old)
  const found = findOld(appData)
  assert.equal(found && found.toLowerCase().endsWith('vigil'), true, String(found))
  assert.equal(moveOldIn(appData, join(appData, 'new'), { HALIGTREE_USER_DATA: join(appData, 'new') }, false), null, 'a test run never looks in Application Support')
  assert.equal(moveOldIn(appData, join(appData, 'new'), { HALIGTREE_QA_AWAY: '1' }, false), null)
  assert.equal(moveOldIn(appData, join(appData, 'new'), env(appData, a.root), true), null, 'never the sandbox')
  assert.equal(moveOldIn(appData, join(appData, 'new'), { HALIGTREE_USER_DATA: join(appData, 'new'), HALIGTREE_OLD_DATA: join(appData, 'mindflow') }, false), null, 'never a real old folder')
  assert.ok(!existsSync(join(appData, 'new')))
  rmSync(appData, { recursive: true })
})
