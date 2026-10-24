import { ipcMain } from 'electron'

import { LABEL, database } from './captures'
import { cardWords, gate } from './haligtree'
import { dayKey, dayjs } from './dates'

/**
 * The Feed: about twenty of your own things a day, picked once and kept for
 * the day, so a reload shows the same posts and tomorrow brings a new set.
 * Gems, quotes, questions you hold with their newest clue, and old Journal
 * days, the ones longest since you last saw them first. Never private, never
 * a #bit, nothing at all in Safe mode.
 */
export type FeedPost = {
  type: 'capture' | 'nugget' | 'article' | 'question' | 'day'
  id: string
  kind: string
  title: string
  text: string
  who: string | null
  made: string
  /** When you last saw it: opened, shown as a hint, or in an earlier day's Feed. Null for never. */
  seen: string | null
  gloss: { body: string; at: string } | null
  clue: string | null
}
export type Feed = { day: string; posts: FeedPost[]; safe: boolean }

const SIZE = 20
type Row = { type: FeedPost['type']; id: string; kind: string; title: string; body: string | null; who: string | null; made: string; visited: string | null }

export function registerFeed(): void {
  const db = database()
  db.exec('create table if not exists feed_days (day text primary key, keys text not null)')

  /** Everything the Feed may show, as rows: private ones and #bits are never read. */
  const pool = (): Row[] => {
    const nuggets = db.prepare(`select case when tier = 'question' then 'question' else 'nugget' end as type, id, kind, coalesce(nullif(title, ''), label('', body)) as title, body, attribution as who, created_at as made, last_visited_at as visited
      from nuggets where tier in ('nugget', 'question') and private = 0 and suspended = 0 and archived_at is null and superseded_by is null and binned_at is null and (tier != 'question' or closed_at is null)`).all() as Row[]
    // A quote still a capture; one already a gem comes as the gem.
    const quotes = db.prepare(`select 'capture' as type, id, kind, ${LABEL} as title, body, attribution as who, captured_at as made, surfaced_at as visited
      from captures where kind = 'quote' and private = 0 and status != 'discarded' and archived_at is null
      and id not in (select capture_id from nuggets where capture_id is not null)`).all() as Row[]
    // A note or a page of yours with a picture in it: the posts you look at, not only read.
    const PICTURED = "(body like '%](%.webp)%' or body like '%](%.png)%' or body like '%](%.jp%g)%' or body like '%\"type\":\"image\"%')"
    const pictured = [
      ...db.prepare(`select 'capture' as type, id, kind, ${LABEL} as title, body, null as who, captured_at as made, surfaced_at as visited
        from captures where kind not in ('quote', 'task') and private = 0 and status != 'discarded' and archived_at is null and ${PICTURED}
        and id not in (select capture_id from nuggets where capture_id is not null)`).all(),
      ...db.prepare(`select 'article' as type, id, kind, coalesce(nullif(title, ''), label('', body)) as title, body, null as who, created_at as made, last_visited_at as visited
        from nuggets where tier = 'article' and private = 0 and archived_at is null and superseded_by is null and binned_at is null and ${PICTURED}`).all()
    ] as Row[]
    // A Journal day at least a week old with something written on it.
    const days = db.prepare("select 'day' as type, day as id, 'day' as kind, day as title, body, null as who, day as made, null as visited from day_pages where day < ? and length(coalesce(body, '')) > 40")
      .all(dayKey(dayjs().subtract(7, 'day'))) as Row[]
    return [...nuggets, ...quotes, ...pictured, ...days].filter((row) => !/(^|\s)#bit\b/i.test(`${row.title} ${row.body ?? ''}`))
  }

  /** When each was last in front of you: an open, a hint, or an earlier day's Feed. */
  const seenOf = (): Map<string, string> => {
    const seen = new Map<string, string>()
    const note = (id: string, at: string | null): void => void (at && at > (seen.get(id) ?? '') && seen.set(id, at))
    for (const row of db.prepare('select id, at from note_opens').all() as { id: string; at: string }[]) note(row.id, row.at)
    for (const row of db.prepare('select nugget_id as id, max(shown_at) as at from hint_events group by nugget_id').all() as { id: string; at: string }[]) note(row.id, row.at)
    for (const row of db.prepare('select day, keys from feed_days where day < ?').all(dayKey()) as { day: string; keys: string }[])
      for (const key of JSON.parse(row.keys) as string[]) note(key.slice(key.indexOf(':') + 1), dayjs(row.day).toISOString())
    return seen
  }

  const words = (row: Row): string => {
    let text = cardWords(row.body ?? '').replace(/(?<=^|\s)#\p{L}[\p{L}\p{N}_/-]*/gmu, '')
    const lines = text.split('\n').map((line) => line.trim()).filter(Boolean)
    // The title is said once: lines it already says go, as Home's cards drop them. A quote keeps its words whole.
    const flat = (said: string): string => said.toLowerCase().replace(/#\p{L}[\p{L}\p{N}_/-]*/gu, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
    const name = flat(row.title)
    if (row.kind !== 'quote' && row.type !== 'day') while (lines.length && name.includes(flat(lines[0]))) lines.shift()
    text = lines.join('\n')
    return text.length > 600 ? `${text.slice(0, 600).replace(/\s+\S*$/, '')}…` : text
  }

  ipcMain.handle('haligtree:feed', (): Feed => {
    const today = dayKey()
    if (gate().blackout) return { day: today, posts: [], safe: true }
    const rows = pool()
    const byKey = new Map(rows.map((row) => [`${row.type}:${row.id}`, row]))
    const seen = seenOf()
    const lastSeen = (row: Row): string | null => [row.visited, seen.get(row.id)].filter(Boolean).sort().at(-1) ?? null
    let keys = (db.prepare('select keys from feed_days where day = ?').get(today) as { keys: string } | undefined)?.keys
    if (!keys) {
      // Each kind longest unseen first, then taken in turns so no one kind fills the day.
      const order = (list: Row[]): Row[] => list.sort((a, b) => (lastSeen(a) ?? a.made).localeCompare(lastSeen(b) ?? b.made))
      const lanes = [
        order(rows.filter((row) => row.type === 'nugget' && row.kind !== 'quote')),
        order(rows.filter((row) => row.kind === 'quote')),
        order(rows.filter((row) => row.type === 'question')),
        order(rows.filter((row) => row.type === 'day')),
        order(rows.filter((row) => (row.type === 'capture' || row.type === 'article') && row.kind !== 'quote'))
      ]
      // Gems and quotes are the most of it: two each a turn, a question, a day and a picture one.
      const share = [2, 2, 1, 1, 1]
      const picked: Row[] = []
      while (picked.length < SIZE && lanes.some((lane) => lane.length))
        lanes.forEach((lane, at) => picked.push(...lane.splice(0, share[at]).slice(0, SIZE - picked.length)))
      keys = JSON.stringify(order(picked).map((row) => `${row.type}:${row.id}`))
      db.prepare('insert or replace into feed_days (day, keys) values (?, ?)').run(today, keys)
    }
    const glossOf = db.prepare('select body, created_at as at from glosses where item_id = ? order by created_at desc limit 1')
    const posts = (JSON.parse(keys) as string[]).flatMap((key): FeedPost[] => {
      const row = byKey.get(key)
      if (!row) return []
      const gloss = (glossOf.get(row.id) as { body: string; at: string } | undefined) ?? null
      return [{
        type: row.type, id: row.id, kind: row.kind, title: row.title, text: words(row), who: row.who?.trim() || null, made: row.made,
        seen: lastSeen(row), gloss: row.type === 'question' ? null : gloss, clue: row.type === 'question' ? (gloss?.body ?? null) : null
      }]
    })
    return { day: today, posts, safe: false }
  })
}
