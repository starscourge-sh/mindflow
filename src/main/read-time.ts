import { ipcMain } from 'electron'
import { database } from './captures'
import { READING_PACE } from './word-count'

/**
 * How articles in the reader were really read (the user, 19 Nov: "if i scroll down to the bottom of a read is that
 * really a 'read'... no and the time it took it usually a good indicator"). The reader tells main the time it was
 * actively read (its window in front, the article in view, a scroll, key or pointer in the last 60 seconds) and when
 * its end was reached; main keeps both per article. A read is finished only when its end was reached AND its active
 * time reached at least half the time its words take at the app's one reading pace (READING_PACE, 238 a minute, as the reader's "N min read"). Counted from the day this began, never guessed
 * for the reads before it: until then the cards say since when they count.
 */
/** The share of an article's own reading time that must have been spent on it, with its end reached, to call it read. */
export const ENOUGH = 0.5

export type ReadRow = { href: string; title: string; site: string; words: number; activeMs: number; endAt: string | null; lastAt: string }
/** Finished, or left part way: an article's own reading time against the time it was read. */
export const finished = (one: Pick<ReadRow, 'words' | 'activeMs' | 'endAt'>): boolean =>
  !!one.endAt && one.activeMs >= ENOUGH * (one.words / READING_PACE) * 60_000

export function registerReadTime(): void {
  const db = database()
  db.exec('create table if not exists article_reads (href text primary key, words integer not null default 0, active_ms integer not null default 0, end_at text, first_at text not null, last_at text not null)')
  // Since when the reading is counted: set once, the first time this runs on a book.
  db.prepare("insert or ignore into settings (key, value) values ('readsCountedSince', ?)").run(JSON.stringify(new Date().toISOString()))

  // A stretch of active reading, and whether its end was reached: added to the article's own.
  ipcMain.handle('haligtree:read:add', (_event, href: unknown, words: unknown, ms: unknown, end: unknown) => {
    if (typeof href !== 'string' || !href) return false
    const add = Math.max(0, Math.min(10 * 60_000, Math.round(Number(ms) || 0)))
    const now = new Date().toISOString()
    db.prepare(`insert into article_reads (href, words, active_ms, end_at, first_at, last_at) values (?, ?, ?, ?, ?, ?)
      on conflict(href) do update set words = max(words, excluded.words), active_ms = active_ms + excluded.active_ms,
      end_at = coalesce(end_at, excluded.end_at), last_at = excluded.last_at`).run(href, Math.max(0, Math.round(Number(words) || 0)), add, end ? now : null, now, now)
    return true
  })

  // Stats and Wrapped: since when it counts, every read counted (finished or left part way), and what each turned into.
  ipcMain.handle('haligtree:read:stats', (_event, from: unknown) => {
    const since = JSON.parse((db.prepare("select value from settings where key = 'readsCountedSince'").get() as { value: string }).value) as string
    const after = typeof from === 'string' ? from : since
    const rows = (db.prepare(`select r.href, coalesce(nullif(a.title, ''), r.href) as title, coalesce(a.site, '') as site, r.words, r.active_ms as activeMs, r.end_at as endAt, r.last_at as lastAt
      from article_reads r left join web_articles a on a.href = r.href where r.last_at >= ? order by r.last_at desc`).all(after) as ReadRow[])
    // What each became: its highlights, the gems made from them or linking it, and of those the ones Review asks.
    const turned = rows.map((one) => {
      const marks = (db.prepare('select count(*) n from pdf_highlights where src = ?').get(one.href) as { n: number }).n
      const gems = db.prepare(`select id, prompt from nuggets where tier != 'card' and (id in (select gem_id from pdf_highlights where src = ? and gem_id is not null) or body like ?)`)
        .all(one.href, `%${JSON.stringify(one.href).slice(1, -1)}%`) as { id: string; prompt: string | null }[]
      return { href: one.href, title: one.title, highlights: marks, gems: gems.length, cards: gems.filter((gem) => gem.prompt).length }
    })
    return { since, rows: rows.map((one) => ({ ...one, finished: finished(one), minutes: Math.round(one.activeMs / 60_000), needs: Math.ceil(one.words / READING_PACE) })), turned }
  })
}
