import { ipcMain } from 'electron'
import { randomUUID } from 'crypto'

import { changed, database } from './captures'
import { dayKey, dayjs } from './dates'

/**
 * Marked days: any day given a purpose, a short name and, if you like, an
 * emoji and a colour ("Exam", "Launch", "Mum's birthday"). Each can point at a
 * note. A tag's exam date is one too, read from the tag itself, so it never
 * has to be marked twice. Every channel starts `haligtree:`, so the preload
 * passes it through without a line of its own.
 */

export type Milestone = {
  id: string
  /** The day, "2026-12-03". */
  day: string
  title: string
  icon: string | null
  color: string | null
  /** A note it points at, as a link holds it: an id, or `nugget:…`. */
  note: string | null
  /** From a tag's exam date: changed on the tag, not here. */
  exam?: string
}

const COLORS = ['gray', 'brown', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink', 'red']
const clean = (text: unknown, most: number): string => String(text ?? '').replace(/\s+/g, ' ').trim().slice(0, most)

/** Every marked day between two days (both kept), nearest first; all of them without. */
export function milestones(from?: string | null, to?: string | null): Milestone[] {
  const db = database()
  const own = db.prepare('select id, day, title, icon, color, note from milestones order by day, created_at').all() as Milestone[]
  // A tag's exam: a marked day of its own, named after the tag.
  const exams = (db.prepare("select tag, color, exam_at from tag_meta where exam_at is not null and exam_at != ''").all() as { tag: string; color: string | null; exam_at: string }[])
    .map((row): Milestone => ({ id: `exam:${row.tag}`, day: dayKey(dayjs(row.exam_at)), title: `#${row.tag} exam`, icon: null, color: row.color, note: `tag:${row.tag}`, exam: row.tag }))
  return [...own, ...exams]
    .filter((one) => /^\d{4}-\d{2}-\d{2}$/.test(one.day) && (!from || one.day >= from) && (!to || one.day <= to))
    .sort((a, b) => a.day.localeCompare(b.day))
}

/** The next few marked days from today, for the menu bar; none when it is switched off there. */
export function nextMilestones(count = 3): Milestone[] {
  const row = database().prepare("select value from settings where key = 'milestonesInMenu'").get() as { value: string } | undefined
  if (row?.value === 'false') return []
  return milestones(dayKey()).slice(0, count)
}

export function registerMilestones(): void {
  const db = database()
  db.exec(`create table if not exists milestones (
    id text primary key, day text not null, title text not null, icon text, color text, note text, created_at text not null
  ); create index if not exists milestones_by_day on milestones(day)`)
  const handle = (channel: string, run: (...args: never[]) => unknown): void =>
    void ipcMain.handle(`haligtree:${channel}`, (_event, ...args) => run(...(args as never[])))

  handle('milestones', (from?: string | null, to?: string | null) => milestones(from, to))
  // Made or changed: gives back its id, and what it was before, for an undo.
  handle('milestone:set', (patch: Partial<Milestone>) => {
    const day = String(patch.day ?? '').slice(0, 10)
    const title = clean(patch.title, 60)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !title) return null
    const icon = clean(patch.icon, 8) || null
    const color = patch.color && COLORS.includes(patch.color) ? patch.color : null
    const note = clean(patch.note, 200) || null
    const was = patch.id ? ((db.prepare('select id, day, title, icon, color, note from milestones where id = ?').get(patch.id) as Milestone | undefined) ?? null) : null
    const id = was?.id ?? (patch.id && /^[\w-]{6,64}$/.test(patch.id) ? patch.id : randomUUID())
    db.prepare(`insert into milestones (id, day, title, icon, color, note, created_at) values (?, ?, ?, ?, ?, ?, ?)
      on conflict (id) do update set day = excluded.day, title = excluded.title, icon = excluded.icon, color = excluded.color, note = excluded.note`)
      .run(id, day, title, icon, color, note, new Date().toISOString())
    changed()
    return { id, was }
  })
  // Taken away; gives back what it was, so Undo can put it back with `milestone:set`.
  handle('milestone:drop', (id: string) => {
    const was = db.prepare('select id, day, title, icon, color, note from milestones where id = ?').get(id) as Milestone | undefined
    if (!was) return null
    db.prepare('delete from milestones where id = ?').run(id)
    changed()
    return was
  })
}
