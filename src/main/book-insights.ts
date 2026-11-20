import type { DatabaseSync } from 'node:sqlite'
import { LABEL } from './book-words'
import { cardWords, plain } from './card-words'
import { tagsIn } from './tag-words'
import { mentionsIn } from './links-in'
import { LEARN_TAG } from './name'
import { pickPassages, type Level, type Passage, type Picked } from './insight-pick'

/**
 * The Feed's insights, read from the book (no Electron in it): every note, gem, page, question, capture and PDF or
 * web highlight a person may be shown, as passages, and the ones for one insight picked (insight-pick.ts). It reads
 * every note, so it is asked of the reading thread (reader.ts), never on main.
 */
export type InsightAsk = { day: string; turn: number; level: Level; rested: string[] }

const textOf = (body: string | null): string => {
  try { return plain(JSON.parse(body ?? '')) } catch { return cardWords(body ?? '') }
}

export function bookInsights(db: DatabaseSync) {
  const pool = (): Passage[] => {
    type Row = { type: Passage['type']; id: string; title: string; body: string | null; made: string }
    const rows = [
      ...db.prepare(`select case when tier = 'question' then 'question' when tier = 'article' then 'article' else 'nugget' end as type, id, coalesce(nullif(nullif(trim(title), 'Untitled'), ''), label('', body)) as title, body, created_at as made
        from nuggets where tier in ('nugget', 'question', 'article') and private = 0 and binned_at is null and superseded_by is null and archived_at is null`).all(),
      // A capture already kept as a gem comes as the gem.
      ...db.prepare(`select 'capture' as type, id, ${LABEL} as title, body, captured_at as made from captures
        where kind != 'task' and private = 0 and status != 'discarded' and archived_at is null and id not in (select capture_id from nuggets where capture_id is not null)`).all()
    ] as Row[]
    const out: Passage[] = []
    for (const row of rows) {
      const text = textOf(row.body).replace(/(?<=^|\s)#\p{L}[\p{L}\p{N}_/-]*/gmu, '').replace(/[ \t]+/g, ' ').replace(/\n{2,}/g, '\n').trim()
      const tags = tagsIn(`${row.title} ${textOf(row.body)}`).filter((tag) => tag !== 'bit' && tag !== LEARN_TAG)
      // #bits never come up, as in the rest of the Feed.
      if (/(^|\s)#bit\b/i.test(`${row.title} ${row.body ?? ''}`)) continue
      out.push({ type: row.type, id: row.id, title: row.title, text, made: row.made, tags, links: [...mentionsIn(row.body).keys()].map((link) => (link.includes(':') ? link.slice(link.indexOf(':') + 1) : link)) })
    }
    // Highlights in PDFs and web pages not kept as a gem (a kept one comes as its gem, above).
    try {
      for (const one of db.prepare('select id, src, page, quote, note, created_at as made from pdf_highlights where gem_id is null').all() as { id: string; src: string; page: number; quote: string; note: string | null; made: string }[]) {
        const pdf = /\.pdf$/i.test(one.src)
        const name = decodeURIComponent(one.src.split('/').at(-1) ?? '').replace(/\.pdf$/i, '')
        const href = pdf ? `${one.src}#page=${one.page}&mark=${one.id}` : `haligtree://article?href=${encodeURIComponent(one.src)}&mark=${one.id}`
        out.push({ type: 'highlight', id: one.id, title: name || 'A highlight', text: [one.quote, one.note].filter(Boolean).join('\n'), made: one.made, tags: [], links: [], href })
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
