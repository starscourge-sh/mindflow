import type { DatabaseSync } from 'node:sqlite'

// What a #tag is, as in tag-words.ts (test/tag-words.test.ts keeps the two the same):
// written out here because node's test runner loads this file on its own.
export const TAG_PART_HERE = String.raw`[\p{L}\p{M}\p{N}\p{Extended_Pictographic}\p{Emoji_Modifier}\u200d\ufe0f\u20e3_-]`

/**
 * The kinds that became something else. A bit is a note tagged #bit, kept
 * private; an excerpt is a long quote; a book is a note tagged #book, its
 * status, rating and takeaway kept as they were.
 */
export const RETIRED: Record<string, { kind: string; tag?: string }> = {
  bit: { kind: 'note', tag: 'bit' },
  excerpt: { kind: 'quote' },
  book: { kind: 'note', tag: 'book' }
}

/**
 * Whether stored words (a body as saved, JSON or plain) carry `#tag`. Read
 * the way tags are read everywhere: after a space or at the start of a line.
 */
export const tagged = (stored: string | null | undefined, tag: string): boolean =>
  new RegExp(`(?:^|\\s|"|\\\\n)#${tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?!${TAG_PART_HERE})`, 'iu').test(stored ?? '')

type Block = { type?: string; content?: unknown[] }

/**
 * A body with `#tag` at the end of its first line of words, where a row reads
 * its tags. A document or plain words alike.
 */
export function withTag(body: unknown, tag: string): unknown {
  const mark = `#${tag.replace(/^#/, '')}`
  if (body && typeof body === 'object') {
    const doc = body as { content?: Block[] }
    const content = doc.content ?? []
    const at = content.findIndex((block) => ['paragraph', 'heading'].includes(block.type ?? '') && block.content?.length)
    return at >= 0
      ? { ...doc, content: content.map((block, index) => (index === at ? { ...block, content: [...(block.content ?? []), { type: 'text', text: ` ${mark}` }] } : block)) }
      : { ...doc, content: [{ type: 'paragraph', content: [{ type: 'text', text: mark }] }, ...content] }
  }
  return String(body ?? '').replace(/^([^\n]*)/, (line) => `${line} ${mark}`.trim())
}

/**
 * Every capture and idea of a retired kind moved to what it is now. Its old
 * kind is kept in `kind_was`, so it can be put back with
 * `update captures set kind = kind_was where kind_was is not null` (and the
 * same for nuggets); fields are never touched. Rows of the new kinds are left
 * alone, so running it twice changes nothing. Gives the captures made private.
 */
export function retireKinds(db: DatabaseSync): string[] {
  const hidden: string[] = []
  db.exec('begin')
  try {
    for (const table of ['captures', 'nuggets']) {
      const rows = db.prepare(`select id, kind, title, body from ${table} where kind in ('bit', 'excerpt', 'book')`).all() as { id: string; kind: string; title: string | null; body: string | null }[]
      const move = db.prepare(`update ${table} set kind_was = coalesce(kind_was, kind), kind = ?, body = ?, private = max(private, ?) where id = ?`)
      for (const row of rows) {
        const to = RETIRED[row.kind]
        let body = row.body
        if (to.tag && !tagged(`${row.title ?? ''} ${row.body ?? ''}`, to.tag)) {
          let parsed: unknown
          try { parsed = JSON.parse(row.body ?? 'null') } catch { parsed = row.body }
          body = JSON.stringify(withTag(parsed, to.tag))
        }
        const secret = to.tag === 'bit' ? 1 : 0
        move.run(to.kind, body, secret, row.id)
        if (secret && table === 'captures') hidden.push(row.id)
      }
    }
    db.exec('commit')
  } catch (error) {
    db.exec('rollback')
    throw error
  }
  return hidden
}
