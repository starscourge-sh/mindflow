import type { DatabaseSync } from 'node:sqlite'
import { LABEL } from './book-words'

/**
 * "The same idea, caught again and again", as a read of the book and nothing
 * else (no Electron in it): it reads every capture's name, so it is asked of
 * the reading thread (reader.ts) and never holds main.
 */

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

export function bookRepeats(db: DatabaseSync) {
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
  return (ids: string[]): Record<string, Repeat> => {
    const all = db.prepare(`select id, number, ${LABEL} as title from captures where status != 'discarded' and archived_at is null and private = 0`).all() as { id: string; number: number; title: string }[]
    const out: Record<string, Repeat> = {}
    for (const id of ids) {
      const mine = all.find((row) => row.id === id)
      if (!mine || mine.title.trim().length < 12) continue
      const own = gramsOf(mine.id, mine.title)
      const like = all.filter((row) => row.id === id || (row.title.trim().length >= 12 && overlap(own, gramsOf(row.id, row.title)) >= 0.5))
      if (like.length < 3) continue
      const article = db.prepare(`select id, coalesce(nullif(nullif(trim(title), 'Untitled'), ''), label('', body)) as title from nuggets where tier = 'article' and body like ? order by created_at desc limit 1`)
        .get(`%"id":"${id}"%`) as { id: string; title: string } | undefined
      out[id] = { n: like.length, ids: like.map(({ id, number, title }) => ({ id, number, title })), article: article ?? null }
    }
    return out
  }
}
