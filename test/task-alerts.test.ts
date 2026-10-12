// Run with: node --test test/task-alerts.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import { againAlerts, dueAlerts } from '../src/main/task-alerts.ts'

const HOUR = 3600000
const at = Date.parse('2026-10-10T07:00:00Z')
const iso = (ms: number): string => new Date(ms).toISOString()

function tasks(): DatabaseSync {
  const db = new DatabaseSync(':memory:')
  db.exec(`create table tasks (id text, title text, status text, due_at text, all_day integer default 0, deadline_at text, deadline_timed integer default 0, notified_at text, notify text)`)
  const add = db.prepare("insert into tasks (id, title, status, due_at, notify) values (?, ?, ?, ?, 'alerts')")
  add.run('late-night', 'Due at 23:00, in quiet hours', 'open', iso(at - 8 * HOUR))
  add.run('done', 'Done before quiet hours ended', 'done', iso(at - 6 * HOUR))
  add.run('just-now', 'Due ten minutes ago', 'open', iso(at - 10 * 60000))
  add.run('long-ago', 'Due long before quiet hours', 'open', iso(at - 30 * HOUR))
  return db
}
const ids = (db: DatabaseSync, heldSince: number | null): string[] => dueAlerts(db, at, 'quiet', heldSince).map((one) => one.id).sort()

test('without a hold, only the last hour alerts', () => {
  assert.deepEqual(ids(tasks(), null), ['just-now'])
})

test('an alert held by quiet hours is shown when they end, however long they lasted', () => {
  // Quiet hours from 22:00 to 07:00: nine hours held.
  assert.deepEqual(ids(tasks(), at - 9 * HOUR), ['just-now', 'late-night'])
})

test('once shown, a held alert is not shown again, and a done task never is', () => {
  const db = tasks()
  db.prepare("update tasks set notified_at = ? where id = 'late-night'").run(iso(at))
  assert.deepEqual(ids(db, at - 9 * HOUR), ['just-now'])
})

import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

test('every Mac notification follows the Sounds setting', () => {
  const main = join(import.meta.dirname, '../src/main')
  const loud: string[] = []
  for (const name of readdirSync(main).filter((one) => one.endsWith('.ts'))) {
    readFileSync(join(main, name), 'utf8').split('\n').forEach((line, i) => {
      if (/new Notification\(/.test(line) && !/silent: !(settings\(\)\.)?sounds\b/.test(line)) loud.push(`${name}:${i + 1}`)
    })
  }
  assert.deepEqual(loud, [])
})

test('an alert left unanswered is asked once more when its time comes, and never for a done task', () => {
  const db = new DatabaseSync(':memory:')
  db.exec('create table tasks (id text, title text, status text, alert_again_at text, notify text)')
  const add = db.prepare("insert into tasks (id, title, status, alert_again_at, notify) values (?, ?, ?, ?, 'alerts')")
  add.run('due-again', 'Asked again now', 'open', iso(at - 60000))
  add.run('later', 'Snoozed for later', 'open', iso(at + 5 * 60000))
  add.run('answered', 'Seen', 'open', null)
  add.run('finished', 'Done meanwhile', 'done', iso(at - 60000))
  assert.deepEqual(againAlerts(db, at, 'quiet').map((one) => one.id), ['due-again'])
})
