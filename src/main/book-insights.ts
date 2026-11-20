import type { DatabaseSync } from 'node:sqlite'
import { LABEL } from './book-words'
import { cardWords, plain } from './card-words'
import { tagsIn } from './tag-words'
import { mentionsIn } from './links-in'
import { LEARN_TAG } from './name'
import { dayKey, dayjs } from './dates'
import { pickPassages, type Level, type Passage, type Picked } from './insight-pick'

/**
 * The Feed's one pool, read from the book (no Electron in it): every note, gem, page, question, capture, Journal day
 * and PDF or web highlight a person may be shown, as passages. The day's posts (book-feed.ts) and the insights
 * (insights.ts) both pick from it (insight-pick.ts), so there is one way things come back. It reads every note, so it
 * is asked of the reading thread (reader.ts), never on main.
 */
export type InsightAsk = { day: string; turn: number; level: Level; rested: string[] }
/** A passage with what a post shows of it: its kind, its words as stored, who said it, when last opened, its weight, and whether an importer brought it. */
export type Kept = Passage & { kind: string; body: string | null; who: string | null; visited: string | null; weight: number; archive: boolean }

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

export function bookInsights(db: DatabaseSync) {
  const pool = (): Kept[] => {
    type Row = { type: Passage['type']; id: string; kind: string; title: string; body: string | null; made: string; who: string | null; visited: string | null; weight: number | null; archive: number }
    const days = (db.prepare(`select 'day' as type, day as id, 'day' as kind, day as title, body, day as made, null as who, null as visited, 0 as archive,
        (select count(*) from feed_reacts r where r.key = 'day:' || day_pages.day and r.reaction = 'like') as weight
      from day_pages where day < ? and length(coalesce(body, '')) > 40`).all(dayKey(dayjs().subtract(DAY_AFTER, 'day'))) as Row[])
      // A day keeps no weight of its own: each like in the Feed is a step up, as a note's heart is.
      .map((day) => ({ ...day, weight: Math.min(4, 1.5 ** (day.weight ?? 0)) }))
    const rows = [
      ...db.prepare(`select case when tier = 'question' then 'question' when tier = 'article' then 'article' else 'nugget' end as type, id, kind, coalesce(nullif(nullif(trim(title), 'Untitled'), ''), label('', body)) as title, body, created_at as made,
          attribution as who, last_visited_at as visited, surfacing_weight as weight, (coalesce(source, '') != '') as archive
        from nuggets where tier in ('nugget', 'question', 'article') and private = 0 and suspended = 0 and binned_at is null and superseded_by is null and archived_at is null and (tier != 'question' or closed_at is null)`).all(),
      // A capture already kept as a gem comes as the gem.
      ...db.prepare(`select 'capture' as type, id, kind, ${LABEL} as title, body, captured_at as made, attribution as who, surfaced_at as visited, surfacing_weight as weight, (imported_at is not null) as archive from captures
        where kind != 'task' and private = 0 and status != 'discarded' and archived_at is null and id not in (select capture_id from nuggets where capture_id is not null)`).all(),
      ...days
    ] as Row[]
    const out: Kept[] = []
    for (const row of rows) {
      const text = textOf(row.body).replace(/(?<=^|\s)#\p{L}[\p{L}\p{N}_/-]*/gmu, '').replace(/[ \t]+/g, ' ').replace(/\n{2,}/g, '\n').trim()
      // Read from the words as written (a stored body is JSON: its "\n#tag" is no tag until read).
      const tags = tagsIn(`${row.title} ${textOf(row.body)}`)
      // #bits never come up, nor the app's own lessons (#learn-haligtree): they are not yours.
      if (tags.includes('bit') || tags.includes(LEARN_TAG)) continue
      // Its name as the card shows it, its #tags taken out ("Primavera #renaissance" reads "Primavera").
      const title = row.type === 'day' ? row.title : row.title.replace(/(?<=^|\s)#\p{L}[\p{L}\p{N}_/-]*/gu, '').replace(/\s+/g, ' ').trim() || row.title
      out.push({
        type: row.type, id: row.id, kind: row.kind, title, text, body: row.body, made: row.made, who: row.who, visited: row.visited, weight: row.weight ?? 1, archive: !!row.archive, tags,
        links: [...mentionsIn(row.body).keys()].map((link) => (link.includes(':') ? link.slice(link.indexOf(':') + 1) : link))
      })
    }
    // Highlights in PDFs and web pages not kept as a gem (a kept one comes as its gem, above).
    try {
      for (const one of db.prepare('select * from pdf_highlights where gem_id is null').all() as { id: string; src: string; page: number; quote: string; note: string | null; created_at: string; surfacing_weight?: number | null }[]) {
        const text = [one.quote, one.note].filter(Boolean).join('\n')
        out.push({ type: 'highlight', id: one.id, kind: 'highlight', title: highlightName(one.src), text, body: text, made: one.created_at, who: null, visited: null, weight: one.surfacing_weight ?? 1, archive: false, tags: [], links: [], href: highlightHref(one) })
      }
    } catch {
      // A book from before highlights: none.
    }
    // Links count both ways: a note linked to from another has that one as a neighbour too.
    const back = new Map<string, string[]>()
    for (const one of out) for (const to of one.links) back.set(to, [...(back.get(to) ?? []), one.id])
    for (const one of out) one.links = [...new Set([...one.links, ...(back.get(one.id) ?? [])])]
    return out
  }
  const pick = ({ day, turn, level, rested }: InsightAsk): Picked | null => pickPassages(pool(), level, day, turn, new Set(rested))
  return { pool, pick }
}
