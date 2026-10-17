// Run with: node --test test/held.test.ts
// A fresh start's hold, and the carry-over count, on a day given in.
process.env.TZ = 'Europe/London'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
const { rollOver } = await import('../src/main/held.ts')

const fresh = (): DatabaseSync => {
  const db = new DatabaseSync(':memory:')
  db.exec(`create table tasks (id text primary key, status text not null default 'open', due_at text, deadline_at text, get_ready integer,
    recurrence text, rollovers integer not null default 0, rolled_on text, held_at text)`)
  return db
}
const at = (day: string): string => new Date(`${day}T09:00:00`).toISOString()
const held = (db: DatabaseSync, id: string): boolean => !!(db.prepare('select held_at from tasks where id = ?').get(id) as { held_at: string | null }).held_at

test('a held task comes back by itself on its day, not before', () => {
  const db = fresh()
  db.prepare('insert into tasks (id, due_at, held_at) values (?, ?, ?)').run('gas', at('2026-10-18'), at('2026-10-17'))
  rollOver(db, '2026-10-17')
  assert.equal(held(db, 'gas'), true)
  rollOver(db, '2026-10-18')
  assert.equal(held(db, 'gas'), false)
})

test('a late task stays held until opened, and a due-by day brings one back on its get-ready day', () => {
  const db = fresh()
  db.prepare('insert into tasks (id, due_at, held_at) values (?, ?, ?)').run('late', at('2026-10-10'), at('2026-10-17'))
  db.prepare('insert into tasks (id, deadline_at, get_ready, held_at) values (?, ?, ?, ?)').run('essay', at('2026-10-25'), 3, at('2026-10-17'))
  rollOver(db, '2026-10-21')
  assert.equal(held(db, 'essay'), true)
  rollOver(db, '2026-10-22')
  assert.equal(held(db, 'late'), true)
  assert.equal(held(db, 'essay'), false)
})

test('each day left undone past its day is one carry over, counted once; held and routines are not counted', () => {
  const db = fresh()
  db.prepare('insert into tasks (id, due_at) values (?, ?)').run('tax', at('2026-10-15'))
  db.prepare('insert into tasks (id, due_at, recurrence) values (?, ?, ?)').run('stretch', at('2026-10-15'), 'every day')
  db.prepare('insert into tasks (id, due_at, held_at) values (?, ?, ?)').run('away', at('2026-10-15'), at('2026-10-16'))
  rollOver(db, '2026-10-16'); rollOver(db, '2026-10-16'); rollOver(db, '2026-10-17')
  const count = (id: string): number => (db.prepare('select rollovers from tasks where id = ?').get(id) as { rollovers: number }).rollovers
  assert.deepEqual([count('tax'), count('stretch'), count('away')], [2, 0, 0])
})
