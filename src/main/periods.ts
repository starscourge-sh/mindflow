import { ipcMain } from 'electron'

import { LABEL, changed, database } from './captures'

/**
 * Looking back over stretches of time, and the small things that make a note
 * easier to find again: other names for a note, everything made lately, a
 * page a week and a page a month, the questions kept in view while you
 * capture, and decisions that say whether they are settled.
 *
 * Every channel here starts `vigil:`, so the preload passes it through
 * without a line of its own.
 */

const now = (): string => new Date().toISOString()
const table = (name: unknown): 'captures' | 'nuggets' => (name === 'nuggets' ? 'nuggets' : 'captures')
const parse = <T>(text: string | null | undefined, fallback: T): T => {
  try {
    return (JSON.parse(text ?? 'null') as T) ?? fallback
  } catch {
    return fallback
  }
}

/** How many questions can be kept in view at once: Feynman's twelve. */
export const QUESTION_PINS = 12

export function registerPeriods(): void {
  const db = database()
  const column = (name: string, definition: string): void => {
    try {
      db.exec(`alter table ${name} add column ${definition}`)
    } catch {
      // Already there.
    }
  }
  const handle = (channel: string, run: (...args: never[]) => unknown): void =>
    void ipcMain.handle(`vigil:${channel}`, (_event, ...args) => run(...(args as never[])))

  // Other names a note goes by, as a JSON list: the word you think in, not
  // the one you titled it with. Search, ⌘K and links read them.
  column('captures', 'aliases text')
  column('nuggets', 'aliases text')
  // A question kept in view: shown, small, while you capture and tidy, so
  // something new can be matched against what you are trying to work out.
  column('nuggets', 'question_pinned_at text')
  // A page a week and a page a month, the less detail the wider the window:
  // `week:2026-10-05` (its Monday) or `month:2026-10`.
  db.exec('create table if not exists period_pages (period text primary key, fields text, body text, updated_at text not null)')

  // Decisions say Open, Deciding or Decided now. Proposed was open; a
  // reversed one was decided again, and keeps a note that it was reversed.
  // Safe every start: once changed, nothing matches.
  for (const name of ['captures', 'nuggets']) {
    db.exec(`update ${name} set fields = json_set(fields, '$.state', 'Open') where kind = 'decision' and json_valid(fields) and json_extract(fields, '$.state') = 'Proposed'`)
    db.exec(`update ${name} set fields = json_set(fields, '$.state', 'Decided', '$.note', 'reversed') where kind = 'decision' and json_valid(fields) and json_extract(fields, '$.state') = 'Reversed'`)
  }

  // --- other names
  handle('aliases', (name: string, id: string) =>
    parse<string[]>((db.prepare(`select aliases from ${table(name)} where id = ?`).get(id) as { aliases: string | null } | undefined)?.aliases, []))
  // Gives back the list it had, for an undo.
  handle('aliases:set', (name: string, id: string, list: string[]) => {
    const row = db.prepare(`select aliases from ${table(name)} where id = ?`).get(id) as { aliases: string | null } | undefined
    if (!row) return null
    const clean = [...new Set(list.map((one) => String(one).trim()).filter(Boolean))]
    db.prepare(`update ${table(name)} set aliases = ? where id = ?`).run(clean.length ? JSON.stringify(clean) : null, id)
    changed()
    return parse<string[]>(row.aliases, [])
  })

  // --- everything made lately, newest first, every kind of thing
  // `until` is the end of the window (a week's Sunday night), now if not given.
  handle('recent', (days: number, until?: string | null) => {
    const end = until ? new Date(until) : new Date()
    const start = new Date(end)
    start.setDate(start.getDate() - Math.max(1, Math.min(365, Math.round(days) || 7)))
    const range = [start.toISOString(), end.toISOString()]
    return db.prepare(`select * from (
        select 'capture' as type, id, ${LABEL} as title, kind, status, private, captured_at as at from captures
          where archived_at is null and captured_at > ? and captured_at <= ?
        union all
        select tier, id, coalesce(nullif(title, ''), label('', body)), kind, case when closed_at is null then 'open' else 'closed' end, private, created_at from nuggets
          where archived_at is null and superseded_by is null and created_at > ? and created_at <= ?
        union all
        select 'task', id, title, 'todo', status, 0, created_at from tasks where created_at > ? and created_at <= ?
      ) order by at desc limit 400`).all(...range, ...range, ...range)
  })

  // --- a page a week, a page a month
  handle('period', (period: string) => {
    const row = db.prepare('select fields, body from period_pages where period = ?').get(period) as { fields: string | null; body: string | null } | undefined
    return { period, exists: !!row, fields: parse<Record<string, string>>(row?.fields, {}), body: parse<unknown>(row?.body, null) }
  })
  // Only what is passed changes. A page with nothing in it goes again.
  handle('period:save', (period: string, patch: { fields?: Record<string, string | null>; body?: unknown }) => {
    const row = db.prepare('select fields, body from period_pages where period = ?').get(period) as { fields: string | null; body: string | null } | undefined
    const fields = parse<Record<string, string>>(row?.fields, {})
    for (const [key, value] of Object.entries(patch.fields ?? {})) {
      if (value === null || !String(value).trim()) delete fields[key]
      else fields[key] = String(value)
    }
    const body = patch.body !== undefined ? JSON.stringify(patch.body) : row?.body ?? null
    const words = /"text":"[^"]*\S/.test(body ?? '') || /"type":"(image|excalidraw|attachment)"/.test(body ?? '')
    if (!Object.keys(fields).length && !words) db.prepare('delete from period_pages where period = ?').run(period)
    else db.prepare(`insert into period_pages (period, fields, body, updated_at) values (?, ?, ?, ?)
      on conflict (period) do update set fields = excluded.fields, body = excluded.body, updated_at = excluded.updated_at`)
      .run(period, JSON.stringify(fields), body, now())
    changed()
    return true
  })
  // A year as its months: each month's focus and season of life, in order.
  handle('periods:year', (year: string) =>
    (db.prepare("select period, fields from period_pages where period like ? order by period").all(`month:${String(year).slice(0, 4)}-%`) as { period: string; fields: string | null }[])
      .map((row) => ({ month: row.period.slice(6), ...parse<Record<string, string>>(row.fields, {}) })))

  // --- questions kept in view
  handle('questions:pinned', () =>
    db.prepare(`select n.id, n.title, n.question_pinned_at as pinnedAt, (select count(*) from glosses g where g.item_id = n.id) as clues from nuggets n
      where n.tier = 'question' and n.question_pinned_at is not null and n.closed_at is null and n.archived_at is null order by n.question_pinned_at`).all())
  // False when twelve are in view already.
  handle('question:pin', (id: string, on: boolean) => {
    if (on) {
      const { n } = db.prepare("select count(*) n from nuggets where tier = 'question' and question_pinned_at is not null and closed_at is null and archived_at is null").get() as { n: number }
      if (n >= QUESTION_PINS) return false
    }
    db.prepare(`update nuggets set question_pinned_at = ${on ? 'coalesce(question_pinned_at, ?)' : 'null'} where id = ?`).run(...(on ? [now(), id] : [id]))
    changed()
    return true
  })

  // --- where a link leads, for a field that holds one: its name and kind
  handle('link:title', (link: string) => {
    const [type, id] = String(link ?? '').includes(':') ? String(link).split(':') : ['capture', String(link ?? '')]
    if (type === 'day') return { type, id, title: id, kind: 'day' }
    if (type === 'capture') return db.prepare(`select 'capture' as type, id, ${LABEL} as title, kind, private from captures where id = ?`).get(id) ?? null
    if (type === 'task') return db.prepare("select 'task' as type, id, title, 'todo' as kind, 0 as private from tasks where id = ?").get(id) ?? null
    return db.prepare("select tier as type, id, coalesce(nullif(title, ''), label('', body)) as title, kind, private from nuggets where id = ?").get(id) ?? null
  })

  // A capture made by mistake from another one ("Decide from this"), taken
  // back: only one that still points at where it came from.
  handle('capture:unmake', (id: string, origin: string) => {
    db.prepare('delete from captures where id = ? and origin_id = ?').run(id, origin)
    changed()
    return true
  })
}
