// Run with: node --test test/db-open.test.ts
// The database keeps its newest saves in a log beside the file. Every way a
// copy is made (a backup, a restore, a copy of the data folder, a sandbox
// reset) must still carry the save made a moment ago.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import { copyFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { openDatabase } from '../src/main/db-open.ts'

function folder(): { dir: string; file: string; db: DatabaseSync } {
  const dir = mkdtempSync(join(tmpdir(), 'haligtree-db-'))
  const file = join(dir, 'haligtree.db')
  const db = openDatabase(file)
  db.exec('create table captures (id text primary key, body text)')
  return { dir, file, db }
}
const has = (file: string, id: string): boolean => {
  const db = new DatabaseSync(file, { readOnly: true })
  try {
    return !!db.prepare('select 1 from captures where id = ?').get(id)
  } finally {
    db.close()
  }
}

test('opens in WAL mode with synchronous NORMAL', () => {
  const { dir, db } = folder()
  assert.equal((db.prepare('pragma journal_mode').get() as { journal_mode: string }).journal_mode, 'wal')
  assert.equal((db.prepare('pragma synchronous').get() as { synchronous: number }).synchronous, 1)
  db.close()
  rmSync(dir, { recursive: true })
})

test('a save made just now is in the backup, and back after a restore', () => {
  const { dir, file, db } = folder()
  db.prepare('insert into captures values (?, ?)').run('old', 'kept')
  const backup = join(dir, 'backup.db')
  db.prepare('insert into captures values (?, ?)').run('just-now', 'a thought')
  assert.ok(existsSync(`${file}-wal`), 'the save is still in the log')
  // As backup.ts does.
  db.prepare('vacuum into ?').run(backup)
  assert.ok(has(backup, 'just-now'))
  // Something written after the backup, then the restore, as index.ts does it.
  db.prepare('insert into captures values (?, ?)').run('after', 'gone by the restore')
  db.close()
  copyFileSync(backup, file)
  for (const extra of ['-wal', '-shm']) rmSync(`${file}${extra}`, { force: true })
  const back = openDatabase(file)
  assert.ok(back.prepare("select 1 from captures where id = 'just-now'").get())
  assert.ok(!back.prepare("select 1 from captures where id = 'after'").get())
  back.close()
  rmSync(dir, { recursive: true })
})

test("another book's backup (read-only, while it is open) has its newest save", () => {
  const { dir, file, db } = folder()
  db.prepare('insert into captures values (?, ?)').run('just-now', 'a thought')
  const other = new DatabaseSync(file, { readOnly: true })
  other.prepare('vacuum into ?').run(join(dir, 'other.db'))
  other.close()
  assert.ok(has(join(dir, 'other.db'), 'just-now'))
  db.close()
  rmSync(dir, { recursive: true })
})

test('a copy of the whole data folder, made while the app is open, has the newest save', () => {
  const { dir, db } = folder()
  db.prepare('insert into captures values (?, ?)').run('just-now', 'a thought')
  const copy = mkdtempSync(join(tmpdir(), 'haligtree-db-copy-'))
  cpSync(dir, copy, { recursive: true })
  assert.ok(has(join(copy, 'haligtree.db'), 'just-now'))
  db.close()
  rmSync(dir, { recursive: true })
  rmSync(copy, { recursive: true })
})

test('a sandbox reset: the run ending never takes the new run’s saves with it', () => {
  const { dir, file, db: old } = folder()
  old.prepare('insert into captures values (?, ?)').run('old-run', 'before the reset')
  // The new run clears the folder and starts again in it, while the old one is still open.
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(dir)
  const fresh = openDatabase(file)
  fresh.exec('create table captures (id text primary key, body text)')
  fresh.prepare('insert into captures values (?, ?)').run('seed', 'the new sandbox')
  // The old run ends while the new one is open.
  old.close()
  assert.ok(fresh.prepare("select 1 from captures where id = 'seed'").get())
  assert.ok(has(file, 'seed'), 'another connection still finds the new run’s save')
  fresh.close()
  assert.ok(has(file, 'seed'))
  rmSync(dir, { recursive: true })
})

test('a book left alone: its read-only backup leaves at most an empty log, so it is not taken for changed', () => {
  const { dir, file, db } = folder()
  db.prepare('insert into captures values (?, ?)').run('old', 'kept')
  db.close()
  assert.ok(!existsSync(`${file}-wal`), 'closed, the log is folded in and gone')
  const other = new DatabaseSync(file, { readOnly: true })
  other.prepare('vacuum into ?').run(join(dir, 'other.db'))
  other.close()
  assert.ok(!existsSync(`${file}-wal`) || statSync(`${file}-wal`).size === 0)
  rmSync(dir, { recursive: true })
})
