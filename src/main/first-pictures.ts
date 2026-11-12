import type { DatabaseSync } from 'node:sqlite'

/** A stored picture's address: the first one in a body is its thumbnail. */
const PICTURE = /haligtree:\/\/assets\/[a-f0-9]{64}\.(?:png|jpe?g|gif|webp|avif|bmp|heic|svg)/
/** A stored video: a note with no picture shows its first frame instead. */
const VIDEO = /haligtree:\/\/assets\/[a-f0-9]{64}\.(?:mp4|m4v|mov|webm)/

/**
 * The first stored picture in each note, for the pictures in lists, worked out once per wording. Every note that
 * holds a stored file is read for it, a long one's 4 MB among them, and lists ask again after every change: so it
 * is asked of the reading thread (reader-jobs.ts `thumbs`), where it held main 12 to 14 ms after each save of a
 * long note. No Electron in it.
 */
export function firstPictures(db: DatabaseSync): () => Record<string, string> {
  const firsts = new Map<string, { body: string; value: string }>()
  return () => {
    const rows = db.prepare(`select id, body from captures where body like '%haligtree://assets/%' union all select id, body from nuggets where body like '%haligtree://assets/%'`).all() as { id: string; body: string }[]
    return Object.fromEntries(rows.map((row) => {
      const was = firsts.get(row.id)
      const value = was?.body === row.body ? was.value : (PICTURE.exec(row.body)?.[0] ?? VIDEO.exec(row.body)?.[0] ?? '')
      if (was?.body !== row.body) firsts.set(row.id, { body: row.body, value })
      return [row.id, value]
    }).filter(([, src]) => src))
  }
}
