import type { DatabaseSync } from 'node:sqlite'
import { randomUUID } from 'node:crypto'

/**
 * The one-time conversion to properties (property-words.ts reads them):
 * run on every open, each step touching only rows of the old shape.
 */


// --- the conversion: once on open, and safe to run again -------------------

const parse = (text: string | null): Record<string, unknown> => {
  try {
    const value = JSON.parse(text ?? 'null') as unknown
    return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}
const stringify = (fields: Record<string, unknown>): string | null => (Object.keys(fields).length ? JSON.stringify(fields) : null)

/**
 * Fields hidden by a change of kind (`_kept`) come back as the note's own
 * properties: on any note a property shows whatever its kind. One already set
 * wins; a clashing hidden one stays under `_kept`, so nothing is lost.
 */
export function foldKept(db: DatabaseSync): number {
  let moved = 0
  for (const table of ['captures', 'nuggets']) {
    const rows = db.prepare(`select id, fields from ${table} where fields like '%"_kept"%'`).all() as { id: string; fields: string | null }[]
    const save = db.prepare(`update ${table} set fields = ? where id = ?`)
    for (const row of rows) {
      const fields = parse(row.fields)
      const kept = { ...(fields._kept as Record<string, unknown> | undefined) }
      delete fields._kept
      for (const [key, value] of Object.entries(kept)) if (!(key in fields)) (fields[key] = value, delete kept[key])
      if (Object.keys(kept).length) fields._kept = kept
      save.run(stringify(fields), row.id)
      moved++
    }
  }
  return moved
}

/**
 * Decisions and experiments become Check backs: a date, then a question back
 * to you. The day it comes back is `back`, what it asks `ask`, what you said
 * `answer`. A decision asks whether its call still holds; an experiment asks
 * its main question, or what you found. Every other field stays as a property,
 * and the old kind in `kind_was`. Rows already converted are not touched.
 */
export function toCheckBack(db: DatabaseSync): number {
  let moved = 0
  for (const table of ['captures', 'nuggets']) {
    const rows = db.prepare(`select id, kind, fields from ${table} where kind in ('decision', 'experiment')`).all() as { id: string; kind: string; fields: string | null }[]
    const save = db.prepare(`update ${table} set kind = 'checkback', kind_was = coalesce(kind_was, ?), fields = ? where id = ?`)
    for (const row of rows) {
      const f = parse(row.fields)
      const out: Record<string, unknown> = { ...f }
      if (row.kind === 'decision') {
        if (f.revisit && !out.back) out.back = f.revisit
        delete out.revisit
        if (!out.ask) out.ask = f.call ? `Does “${String(f.call)}” still hold?` : 'Does this still hold?'
        if (f.heldAt && !out.answeredAt) out.answeredAt = f.heldAt
      } else {
        if (f.until && !out.back) out.back = f.until
        delete out.until
        if (!out.ask) out.ask = String(f.question ?? '').trim() || 'What did you find?'
        if (f.question && out.ask === f.question) delete out.question
        if (f.outcome && !out.answer) out.answer = f.outcome
        if (out.answer === f.outcome) delete out.outcome
        // Finished: answered, so it does not come back.
        if (f.status === 'Finished') (out.answeredAt = out.answeredAt ?? new Date().toISOString(), delete out.status)
      }
      save.run(row.kind, stringify(out), row.id)
      moved++
    }
  }
  return moved
}

/**
 * A goal is made from Goals, so there is one Goals list: a goal capture still
 * in the Inbox becomes a goal (as keeping it always did), and every goal
 * capture becomes a note, its old kind kept. The capture itself stays.
 * `make` writes the goal (haligtree.ts knows a goal's colour and day).
 */
export function goalsOut(db: DatabaseSync, make: (capture: { id: string; title: string; body: string | null; private: number }) => void): number {
  const rows = db.prepare("select id, title, body, private, status from captures where kind = 'goal'").all() as { id: string; title: string; body: string | null; private: number; status: string }[]
  for (const row of rows) {
    const made = db.prepare("select 1 from nuggets where capture_id = ? and tier = 'goal'").get(row.id)
    if (row.status === 'open' && !made) make(row)
    db.prepare("update captures set kind = 'note', kind_was = coalesce(kind_was, 'goal'), status = case when status = 'open' then 'promoted' else status end where id = ?").run(row.id)
  }
  // A gem saved from a goal capture long ago is a note too.
  db.prepare("update nuggets set kind = 'note', kind_was = coalesce(kind_was, 'goal') where kind = 'goal'").run()
  return rows.length
}

/** "every mon, wed" for a practice's days; "every day" for all seven. */
export function daysRule(days: number[]): string {
  const names = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']
  const set = [...new Set(days)].filter((day) => day >= 0 && day <= 6).sort()
  if (!set.length || set.length === 7) return 'every day'
  if (set.join() === '1,2,3,4,5') return 'every weekday'
  // Monday first, as the week is said.
  return `every ${[...set.filter((day) => day > 0), ...set.filter((day) => day === 0)].map((day) => names[day]).join(', ')}`
}

/**
 * Every practice becomes a repeating task with "Practise it" on: the task
 * keeps its name and its days and time, the practice row stays as the
 * switch's settings (its material, its minutes, its log, its sessions), now
 * pointing at the task. One already moved is left alone.
 */
export function practicesToTasks(db: DatabaseSync, at = new Date()): number {
  const rows = db.prepare('select id, name, days, at from practices where task_id is null and binned_at is null').all() as { id: string; name: string; days: string; at: string }[]
  for (const row of rows) {
    let days: number[] = []
    try { days = JSON.parse(row.days) as number[] } catch { days = [0, 1, 2, 3, 4, 5, 6] }
    const rule = daysRule(days)
    const [hour, minute] = (/^\d\d:\d\d$/.test(row.at) ? row.at : '21:00').split(':').map(Number)
    // Its next time from today, on one of its days.
    const due = new Date(at)
    due.setHours(hour, minute, 0, 0)
    for (let step = 0; step < 8 && (due.getTime() < at.getTime() - 60_000 || (days.length && days.length < 7 && !days.includes(due.getDay()))); step++) due.setDate(due.getDate() + 1)
    const id = randomUUID()
    const number = ((db.prepare('select max(number) as n from tasks').get() as { n: number | null }).n ?? 0) + 1
    db.prepare("insert into tasks (id, number, title, status, due_at, all_day, recurrence, created_at) values (?, ?, ?, 'open', ?, 0, ?, ?)").run(id, number, row.name, due.toISOString(), rule, at.toISOString())
    db.prepare('update practices set task_id = ? where id = ?').run(id, row.id)
  }
  return rows.length
}
