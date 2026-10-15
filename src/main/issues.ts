import { ipcMain } from 'electron'
import { randomUUID } from 'crypto'

import { LABEL, changed, database } from './captures'
import { dayjs } from './dates'
import { gate, plain } from './vigil'

/**
 * Weeks and months read back like issues of a magazine you wrote without
 * noticing: each numbered from your first capture, the past ones lined up,
 * a month told back to you in a few lines from what you caught. And the
 * idea you keep catching again, which the app says out loud, since
 * repetition means unfinished, not important.
 *
 * Every channel here starts `vigil:`, so the preload passes it through.
 */

const now = (): string => new Date().toISOString()
/** `#tags` in a text, lower-cased, once each: the same rule as the rest of the app. */
import { tagsIn } from './tag-words'
import { cut } from './clip'
const parse = <T>(text: string | null | undefined, fallback: T): T => {
  try {
    return (JSON.parse(text ?? 'null') as T) ?? fallback
  } catch {
    return fallback
  }
}

/** Trigrams of a line, for "the same idea again": enough to notice, no model needed. */
const grams = (text: string): Set<string> => {
  const clean = ` ${text.toLowerCase().replace(/[^a-z0-9 ]/g, '')} `
  return new Set(Array.from({ length: Math.max(0, clean.length - 2) }, (_, index) => clean.slice(index, index + 3)))
}
const overlap = (a: Set<string>, b: Set<string>): number => {
  let shared = 0
  for (const gram of a) if (b.has(gram)) shared++
  return shared / (a.size + b.size - shared || 1)
}

export type Repeat = { n: number; ids: { id: string; number: number; title: string }[]; article: { id: string; title: string } | null }

export function registerIssues(): void {
  const db = database()
  const handle = (channel: string, run: (...args: never[]) => unknown): void =>
    void ipcMain.handle(`vigil:${channel}`, (_event, ...args) => run(...(args as never[])))

  // --- a week or a month, and the ones before it

  // The issues before one: each with its page's fields and how much was
  // caught in it, newest first. Nothing before your first capture.
  handle('issues:past', (scale: 'week' | 'month', before: string, count = 3) => {
    const first = (db.prepare('select min(captured_at) as at from captures').get() as { at: string | null }).at
    const out: { key: string; start: string; fields: Record<string, string>; captures: number }[] = []
    // A month asked for by any day in it ("2026-10" or "2026-10-12"); a date that reads as nothing has no past.
    let start = scale === 'week' ? dayjs(before).startOf('week') : dayjs(`${String(before).slice(0, 7)}-01`).startOf('month')
    if (!start.isValid()) return []
    for (let at = 0; at < count; at++) {
      start = start.subtract(1, scale)
      const end = start.add(1, scale)
      if (!first || end.isBefore(first)) break
      const key = scale === 'week' ? `week:${start.format('YYYY-MM-DD')}` : `month:${start.format('YYYY-MM')}`
      const page = db.prepare('select fields from period_pages where period = ?').get(key) as { fields: string | null } | undefined
      const { n } = db.prepare('select count(*) n from captures where captured_at >= ? and captured_at < ?').get(start.toISOString(), end.toISOString()) as { n: number }
      out.push({ key, start: start.format('YYYY-MM-DD'), fields: parse<Record<string, string>>(page?.fields, {}), captures: n })
    }
    return out
  })

  // A month told back from what was caught in it: no model, only counts.
  // Private things are counted but never named.
  handle('issues:month', (month: string) => {
    const start = dayjs(`${month}-01`).startOf('month')
    const end = start.add(1, 'month')
    const [since, until] = [start.toISOString(), end.toISOString()]
    const rows = db.prepare(`select ${LABEL} as title, body, status, private, attribution, captured_at as at from captures where captured_at >= ? and captured_at < ?`)
      .all(since, until) as { title: string; body: string | null; status: string; private: number; attribution: string | null; at: string }[]
    const shown = rows.filter((row) => !row.private)
    const count = <T extends string | number>(values: T[]): Map<T, number> => values.reduce((all, value) => all.set(value, (all.get(value) ?? 0) + 1), new Map<T, number>())
    const top = <T extends string | number>(map: Map<T, number>): [T, number] | null => [...map].sort((a, b) => b[1] - a[1])[0] ?? null
    // One count a day, to the end of the month or to today.
    const days = Array.from({ length: start.daysInMonth() }, () => 0)
    for (const row of rows) days[dayjs(row.at).date() - 1]++
    const weekday = top(count(rows.map((row) => dayjs(row.at).day())))
    const hour = top(count(rows.map((row) => dayjs(row.at).hour())))
    const tagCounts = count(shown.flatMap((row) => tagsIn(`${row.title} ${plain(parse(row.body, null))}`)))
    const sources = [...count(shown.map((row) => row.attribution ?? '').filter(Boolean))].sort((a, b) => b[1] - a[1]).slice(0, 3)
    const made = (tier: string): { title: string }[] =>
      db.prepare(`select coalesce(nullif(title, ''), label('', body)) as title from nuggets where tier = ? and private = 0 and created_at >= ? and created_at < ? order by created_at`).all(tier, since, until) as { title: string }[]
    const kept = (db.prepare("select count(*) n from nuggets where tier = 'nugget' and created_at >= ? and created_at < ?").get(since, until) as { n: number }).n
    const reviewed = db.prepare(`select coalesce(nullif(n.title, ''), label('', n.body)) as title, count(*) n from review_log r join nuggets n on n.id = r.item_id
      where r.reviewed_at >= ? and r.reviewed_at < ? and n.private = 0 group by r.item_id order by n desc limit 1`).get(since, until) as { title: string; n: number } | undefined
    const before = (db.prepare('select count(*) n from captures where captured_at >= ? and captured_at < ?').get(start.subtract(1, 'month').toISOString(), since) as { n: number }).n
    const page = db.prepare('select fields from period_pages where period = ?').get(`month:${month}`) as { fields: string | null } | undefined
    return {
      month,
      captures: rows.length,
      before,
      days,
      weekday: weekday && { day: weekday[0], n: weekday[1] },
      hour: hour && { hour: hour[0], n: hour[1] },
      kept,
      tags: [...tagCounts].sort((a, b) => b[1] - a[1]).map(([name, n]) => ({ name, n })),
      sources: sources.map(([name, n]) => ({ name, n })),
      questions: made('question').map((row) => row.title),
      articles: made('article').map((row) => row.title),
      promoted: rows.filter((row) => row.status === 'promoted').length,
      letGo: rows.filter((row) => row.status === 'discarded').length,
      reviewed: reviewed ?? null,
      fields: parse<Record<string, string>>(page?.fields, {})
    }
  })

  // --- the same idea, caught again and again

  // Each capture's trigrams, kept between asks and made again only when its
  // words change, so a few cards against thousands of captures stays quick.
  const seen = new Map<string, { title: string; grams: Set<string> }>()
  const gramsOf = (id: string, title: string): Set<string> => {
    const had = seen.get(id)
    if (had?.title === title) return had.grams
    const made = grams(title)
    seen.set(id, { title, grams: made })
    return made
  }
  // For each capture asked about: every other not let go that says nearly
  // the same, and an article already written from them, if there is one.
  // Never a private one, either way.
  handle('repeats', (ids: string[]) => {
    const { blackout } = gate()
    if (blackout) return {}
    const all = db.prepare(`select id, number, ${LABEL} as title from captures where status != 'discarded' and archived_at is null and private = 0`).all() as { id: string; number: number; title: string }[]
    const out: Record<string, Repeat> = {}
    for (const id of ids) {
      const mine = all.find((row) => row.id === id)
      if (!mine || mine.title.trim().length < 12) continue
      const own = gramsOf(mine.id, mine.title)
      const like = all.filter((row) => row.id === id || (row.title.trim().length >= 12 && overlap(own, gramsOf(row.id, row.title)) >= 0.5))
      if (like.length < 3) continue
      const article = db.prepare(`select id, coalesce(nullif(title, ''), label('', body)) as title from nuggets where tier = 'article' and body like ? order by created_at desc limit 1`)
        .get(`%"id":"${id}"%`) as { id: string; title: string } | undefined
      out[id] = { n: like.length, ids: like.map(({ id, number, title }) => ({ id, number, title })), article: article ?? null }
    }
    return out
  })

  // An article to finish the thought, its first lines a link to each time
  // it was caught, the way they read in any note: `V-12 the words`.
  handle('repeats:article', (ids: string[]) => {
    const rows = ids.map((id) => db.prepare(`select id, number, ${LABEL} as title from captures where id = ?`).get(id) as { id: string; number: number; title: string } | undefined).filter((row) => !!row)
    const link = (row: { id: string; number: number; title: string }): object => ({ type: 'noteLink', attrs: { id: row.id, label: row.title, key: `V-${row.number}`, heading: '', text: '' } })
    const body = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: `Caught ${rows.length} times:` }] },
        { type: 'bulletList', content: rows.map((row) => ({ type: 'listItem', content: [{ type: 'paragraph', content: [link(row)] }] })) },
        { type: 'paragraph' }
      ]
    }
    const id = randomUUID()
    db.prepare("insert into nuggets (id, tier, kind, title, body, origins, created_at, updated_at) values (?, 'article', 'note', ?, ?, '[]', ?, ?)")
      .run(id, (rows[0] ? cut(rows[0].title, 120) : 'Untitled'), JSON.stringify(body), now(), now())
    changed()
    return id
  })
}
