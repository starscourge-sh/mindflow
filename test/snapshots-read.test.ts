import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { test } from 'node:test'
import { listDeleted, listSnapshots, pruneDeleted, snapshotText } from '../src/main/snapshots-read.ts'

test('a daily copy says what it held, and a note in it can be read', () => {
  const dir = mkdtempSync(join(tmpdir(), 'haligtree-snaps-'))
  const file = join(dir, 'haligtree-2026-11-21.db')
  const db = new DatabaseSync(file)
  db.exec("create table captures (id text, title text, body text, status text, captured_at text)")
  db.exec("create table nuggets (id text, title text, body text, tier text, binned_at text, created_at text)")
  db.prepare('insert into captures values (?, ?, ?, ?, ?)').run('n1', 'The ruling', 'The decision stood.', 'inbox', '2026-11-21')
  db.prepare('insert into nuggets values (?, ?, ?, ?, ?, ?)').run('p1', 'A page', 'Longer.', 'article', null, '2026-11-21')
  db.close()
  const [copy] = listSnapshots(dir)
  assert.equal(copy.day, '2026-11-21')
  assert.equal(copy.notes, 1)
  assert.equal(copy.pages, 1)
  assert.match(copy.said, /21 Nov · 1 note, 1 page/)
  const read = snapshotText(file, 'captures', 'n1')
  assert.equal(read?.title, 'The ruling')
  assert.match(read?.text ?? '', /decision stood/)
})

test('a deleted book older than 30 days is cleared, and a newer one stays', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'haligtree-deleted-'))
  mkdirSync(join(dir, 'Old notes 2020-01-01 b-abc12345'))
  writeFileSync(join(dir, 'Old notes 2020-01-01 b-abc12345', 'haligtree.db'), 'old')
  mkdirSync(join(dir, 'Recent notes 2026-11-20 b-def67890'))
  writeFileSync(join(dir, 'Recent notes 2026-11-20 b-def67890', 'haligtree.db'), 'new')
  const before = await listDeleted(dir)
  assert.equal(before.length, 2)
  assert.ok(before.every((one) => one.bytes > 0))
  const gone = await pruneDeleted(dir, 30, new Date('2026-11-24T12:00:00'))
  assert.deepEqual(gone, ['Old notes 2020-01-01 b-abc12345'])
  const after = await listDeleted(dir)
  assert.equal(after.length, 1)
  assert.equal(after[0].name, 'Recent notes')
})
