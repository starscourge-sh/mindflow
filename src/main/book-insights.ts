import type { DatabaseSync } from 'node:sqlite'
import { LABEL } from './book-words'
import { cardWords, plain } from './card-words'
import { tagsIn } from './tag-words'
import { mentionsIn } from './links-in'
import { LEARN_TAG } from './name'
import { dayKey, dayjs } from './dates'
import { pickPassages, type Level, type Passage, type Picked, type Signal } from './insight-pick'
import { forInsights, isDecision } from './insight-checks'

/**
 * The Feed's one pool, read from the book (no Electron in it): every note, gem, page, question, capture, Journal day
 * and PDF or web highlight a person may be shown, as passages. The day's posts (book-feed.ts) and the insights
 * (insights.ts) both pick from it (insight-pick.ts), so there is one way things come back. It reads every note, so it
 * is asked of the reading thread (reader.ts), never on main.
 */
export type InsightAsk = { day: string; turn: number; level: Level; rested: string[] }
/** A passage with what a post shows of it: its kind, its words as stored, who said it, when last opened, its weight, and whether an importer brought it. */
export type Kept = Passage & { kind: string; body: string | null; who: string | null; visited: string | null; weight: number; archive: boolean; decision?: boolean }

const textOf = (body: string | null): string => {
  try { return plain(JSON.parse(body ?? '')) } catch { return cardWords(body ?? '') }
}
/** A Journal day comes back once it is this many days old. */
const DAY_AFTER = 7

/** A highlight's PDF or page, by name. */
export const highlightName = (src: string): string => decodeURIComponent(src.split('/').at(-1) ?? '').replace(/\.pdf$/i, '') || 'A highlight'
/** The link that opens a highlight's PDF at its page, or its web page, with the mark shown. */
export const highlightHref = (one: { id: string; src: string; page: number }): string =>
  /\.pdf$/i.test(one.src) ? `${one.src}#page=${one.page}&mark=${one.id}` : `haligtree://article?href=${encodeURIComponent(one.src)}&mark=${one.id}`

/** An edit counts once the note was changed an hour or more after it was made (not the save that made it). */
const EDITED_AFTER = 3_600_000

export function bookInsights(db: DatabaseSync) {
  /**
   * What the person did with each note, by id (insight-pick.ts `matteredOf` weighs them): a heart in the Feed
   * (feed_reacts), a reply or thought on it (glosses), its last open (note_opens keeps only the latest), its words
   * edited later (nuggets.updated_at; captures keep no edit time), and a line of it highlighted in a PDF it was kept
   * from (pdf_highlights.gem_id). Never Review's grading (review_log) and never the app showing it (hints, the Feed).
   */
  const signalsOf = (rows: { id: string; made: string; edited?: string | null }[]): ((id: string) => Signal[]) => {
    const all = new Map<string, Signal[]>()
    const add = (id: string, kind: Signal['kind'], at: string | null | undefined): void => void (at && all.set(id, [...(all.get(id) ?? []), { kind, at }]))
    const read = (sql: string): { id: string; at: string }[] => { try { return db.prepare(sql).all() as { id: string; at: string }[] } catch { return [] } }
    for (const one of read("select substr(key, instr(key, ':') + 1) as id, day as at from feed_reacts where reaction = 'like'")) add(one.id, 'like', one.at)
    for (const one of read("select item_id as id, created_at as at from glosses where author = 'user'")) add(one.id, 'reply', one.at)
    for (const one of read('select id, at from note_opens')) add(one.id, 'open', one.at)
    for (const one of read('select gem_id as id, created_at as at from pdf_highlights where gem_id is not null')) add(one.id, 'edit', one.at)
    for (const row of rows) if (row.edited && new Date(row.edited).getTime() - new Date(row.made).getTime() >= EDITED_AFTER) add(row.id, 'edit', row.edited)
    return (id) => all.get(id) ?? []
  }

  const pool = (): Kept[] => {
    type Row = { type: Passage['type']; id: string; kind: string; title: string; body: string | null; made: string; who: string | null; visited: string | null; weight: number | null; archive: number; edited?: string | null; fields: string | null }
    const days = (db.prepare(`select 'day' as type, day as id, 'day' as kind, day as title, body, day as made, null as who, null as visited, 0 as archive, null as fields,
        (select count(*) from feed_reacts r where r.key = 'day:' || day_pages.day and r.reaction = 'like') as weight
      from day_pages where day < ? and length(coalesce(body, '')) > 40`).all(dayKey(dayjs().subtract(DAY_AFTER, 'day'))) as Row[])
      // A day keeps no weight of its own: each like in the Feed is a step up, as a note's heart is.
      .map((day) => ({ ...day, weight: Math.min(4, 1.5 ** (day.weight ?? 0)) }))
    const rows = [
      ...db.prepare(`select case when tier = 'question' then 'question' when tier = 'article' then 'article' else 'nugget' end as type, id, kind, coalesce(nullif(nullif(trim(title), 'Untitled'), ''), label('', body)) as title, body, created_at as made,
          attribution as who, last_visited_at as visited, surfacing_weight as weight, (coalesce(source, '') != '') as archive, updated_at as edited, fields
        from nuggets where tier in ('nugget', 'question', 'article') and private = 0 and suspended = 0 and binned_at is null and superseded_by is null and archived_at is null and (tier != 'question' or closed_at is null)`).all(),
      // A capture already kept as a gem comes as the gem.
      ...db.prepare(`select 'capture' as type, id, kind, ${LABEL} as title, body, captured_at as made, attribution as who, surfaced_at as visited, surfacing_weight as weight, (imported_at is not null) as archive, fields from captures
        where kind != 'task' and private = 0 and status != 'discarded' and archived_at is null and id not in (select capture_id from nuggets where capture_id is not null)`).all(),
      ...days
    ] as Row[]
    const signals = signalsOf(rows)
    const out: Kept[] = []
    for (const row of rows) {
      const text = textOf(row.body).replace(/(?<=^|\s)#\p{L}[\p{L}\p{N}_/-]*/gmu, '').replace(/[ \t]+/g, ' ').replace(/\n{2,}/g, '\n').trim()
      // Read from the words as written (a stored body is JSON: its "\n#tag" is no tag until read).
      const tags = tagsIn(`${row.title} ${textOf(row.body)}`)
      // #bits never come up, nor the app's own lessons (#learn-haligtree): they are not yours.
      if (tags.includes('bit') || tags.includes(LEARN_TAG)) continue
      // Its name as the card shows it, its #tags taken out ("Primavera #renaissance" reads "Primavera").
      const title = row.type === 'day' ? row.title : row.title.replace(/(?<=^|\s)#\p{L}[\p{L}\p{N}_/-]*/gu, '').replace(/\s+/g, ' ').trim() || row.title
      let fields: Record<string, unknown> | null = null
      try { fields = row.fields ? JSON.parse(row.fields) as Record<string, unknown> : null } catch { /* None to read. */ }
      out.push({
        type: row.type, id: row.id, kind: row.kind, title, text, body: row.body, made: row.made, who: row.who, visited: row.visited, weight: row.weight ?? 1, archive: !!row.archive, tags, signals: signals(row.id),
        ...(isDecision(row.kind, fields) ? { decision: true } : {}),
        links: [...mentionsIn(row.body).keys()].map((link) => (link.includes(':') ? link.slice(link.indexOf(':') + 1) : link))
      })
    }
    // Highlights in PDFs and web pages not kept as a gem (a kept one comes as its gem, above).
    let reading = new Map<string, { page: number; at: string }>()
    try { reading = new Map((db.prepare('select src, page, read_at as at from pdf_reading').all() as { src: string; page: number; at: string }[]).map((one) => [one.src, one])) } catch { /* Before PDF reading was kept: none. */ }
    try {
      for (const one of db.prepare('select * from pdf_highlights where gem_id is null').all() as { id: string; src: string; page: number; quote: string; note: string | null; created_at: string; surfacing_weight?: number | null }[]) {
        const text = [one.quote, one.note].filter(Boolean).join('\n')
        // Its page come back to a day or more after it was marked: a re-read (pdf_reading keeps only the page each PDF was
        // last left at, so the reading that marked it, still on that page, does not count).
        const read = reading.get(one.src)
        const reread: Signal[] = read && read.page === one.page && new Date(read.at).getTime() - new Date(one.created_at).getTime() >= 86_400_000 ? [{ kind: 'open', at: read.at }] : []
        out.push({ type: 'highlight', id: one.id, kind: 'highlight', title: highlightName(one.src), text, body: text, made: one.created_at, who: null, visited: null, weight: one.surfacing_weight ?? 1, archive: false, tags: [], links: [], href: highlightHref(one), signals: [...signals(one.id), ...reread] })
      }
    } catch {
      // A book from before highlights: none.
    }
    // Links count both ways: a note linked to from another has that one as a neighbour too.
    const back = new Map<string, string[]>()
    for (const one of out) for (const to of one.links) back.set(to, [...(back.get(to) ?? []), one.id])
    // Linked from another note: it mattered enough to point to, dated by when the linking note was last written.
    const writtenAt = new Map(rows.map((row) => [row.id, row.edited && row.edited > row.made ? row.edited : row.made]))
    for (const one of out) for (const from of back.get(one.id) ?? []) if (from !== one.id) one.signals = [...(one.signals ?? []), { kind: 'link', at: writtenAt.get(from) ?? one.made }]
    for (const one of out) one.links = [...new Set([...one.links, ...(back.get(one.id) ?? [])])]
    return out
  }
  // A decision is never Connected or Reframed: its call is the person's own, and comes back as itself, as a "Check back"
  // post on its date (feed.ts) with the words it was decided in.
  const pick = ({ day, turn, level, rested }: InsightAsk): Picked | null => pickPassages(forInsights(pool(), level), level, day, turn, new Set(rested))
  return { pool, pick }
}
