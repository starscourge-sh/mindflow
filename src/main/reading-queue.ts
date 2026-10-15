import { ipcMain } from 'electron'
import { randomUUID } from 'crypto'

import { changed, database } from './captures'
import { SANDBOX } from './sandbox'

/**
 * The reading queue, Spotify's way: an ordered list of what you mean to read
 * next, any note, idea, piece of writing or link. Add to queue puts one at
 * the end, Read next at the front. Read, it leaves the queue for Read, with
 * the day it was finished. Every channel starts `vigil:`.
 */

export type QueueRow = {
  /** The queue's own id for this entry. */
  id: string
  type: 'capture' | 'nugget' | 'article' | 'question' | 'goal'
  itemId: string
  title: string
  kind: string
  private: boolean
  addedAt: string
  doneAt: string | null
  /** A link's address, for one that is only a link. */
  url: string | null
  /** Only a link, with nothing of yours written under it: it opens in the browser. */
  bare: boolean
}

type Node = { type?: string; text?: string; attrs?: Record<string, unknown>; content?: Node[]; marks?: { type?: string; attrs?: Record<string, unknown> }[] }

/** A link's address and whether anything else is written in it. */
function linkOf(kind: string, raw: string | null): { url: string | null; words: number } {
  let body: Node | string | null = null
  try {
    body = raw ? (JSON.parse(raw) as Node | string) : null
  } catch {
    body = raw
  }
  if (typeof body === 'string') {
    const url = /https?:\/\/\S+/.exec(body)?.[0] ?? null
    return { url, words: body.replace(url ?? '', '').trim().length }
  }
  let url: string | null = null
  const text: string[] = []
  const walk = (node: Node | null | undefined): void => {
    if (!node) return
    if (node.type === 'bookmark') return void (url ??= typeof node.attrs?.href === 'string' ? node.attrs.href : null)
    for (const mark of node.marks ?? []) if (mark.type === 'link' && typeof mark.attrs?.href === 'string') url ??= mark.attrs.href
    if (node.text) text.push(node.text)
    node.content?.forEach(walk)
  }
  walk(body)
  const said = text.join(' ')
  url ??= /https?:\/\/\S+/.exec(said)?.[0] ?? null
  return { url: kind === 'link' || url ? url : null, words: said.replace(url ?? '', '').trim().length }
}

export function registerReadingQueue(): void {
  const db = database()
  db.exec(`create table if not exists reading_queue (
    id text primary key, item_type text not null, item_id text not null, position real not null, added_at text not null, done_at text
  ); create index if not exists reading_queue_by_item on reading_queue(item_id)`)
  // The Queue arrived: a sidebar already set up shows it too, once, under Saved.
  if (!db.prepare("select 1 from settings where key = 'queueShownOnce'").get()) {
    const saved = db.prepare("select value from settings where key = 'sidebarShown'").get() as { value: string } | undefined
    let shown: unknown = null
    try { shown = saved && JSON.parse(saved.value) } catch { /* Unreadable: the default, which has it. */ }
    if (Array.isArray(shown) && !shown.includes('queue')) db.prepare("update settings set value = ? where key = 'sidebarShown'").run(JSON.stringify([...shown, 'queue']))
    db.prepare("insert or replace into settings (key, value) values ('queueShownOnce', 'true')").run()
  }
  const handle = (channel: string, run: (...args: never[]) => unknown): void =>
    void ipcMain.handle(`vigil:${channel}`, (_event, ...args) => run(...(args as never[])))
  // A queue that is not a list of notes changes no list of notes: only the queue's own views read again.
  const told = (): void => changed()

  /** What a note is, found by its id alone: a capture, or a nugget of some tier. */
  const typeOf = (id: string): QueueRow['type'] | null => {
    if (db.prepare('select 1 from captures where id = ?').get(id)) return 'capture'
    const row = db.prepare('select tier from nuggets where id = ?').get(id) as { tier: string } | undefined
    return row ? (row.tier as QueueRow['type']) : null
  }

  const read = (): { queue: QueueRow[]; read: QueueRow[] } => {
    const rows = db.prepare(`select q.id, q.item_type as type, q.item_id as itemId, q.added_at as addedAt, q.done_at as doneAt,
        case when c.id is not null then label(c.title, c.body, c.named) else coalesce(nullif(n.title, ''), label('', n.body)) end as title,
        coalesce(c.kind, n.kind) as kind, coalesce(c.private, n.private, 0) as private, coalesce(c.body, n.body) as body
      from reading_queue q
      left join captures c on q.item_type = 'capture' and c.id = q.item_id
      left join nuggets n on q.item_type != 'capture' and n.id = q.item_id
      where (c.id is not null or n.id is not null)
        -- Up next leaves out what went to the Bin or was archived since; it comes back with it. Read keeps its history.
        and (q.done_at is not null or ((c.id is null or (c.status != 'discarded' and c.archived_at is null)) and (n.id is null or (n.binned_at is null and n.archived_at is null))))
      order by case when q.done_at is null then 0 else 1 end, case when q.done_at is null then q.position end, q.done_at desc`).all() as (Omit<QueueRow, 'url' | 'bare' | 'private'> & { private: number; body: string | null })[]
    const shaped = rows.map(({ body, ...row }): QueueRow => {
      const link = row.type === 'capture' ? linkOf(row.kind, body) : { url: null, words: 1 }
      return { ...row, title: row.title || 'Untitled', private: !!row.private, url: link.url, bare: row.kind === 'link' && !!link.url && link.words < 40 }
    })
    return { queue: shaped.filter((row) => !row.doneAt), read: shaped.filter((row) => !!row.doneAt).slice(0, 200) }
  }
  handle('queue', read)

  // In by their ids, at the end (Add to queue) or at the front in the order
  // given (Read next). One already waiting moves rather than coming twice.
  // Gives back how many went in, and the queue as it was, for an undo.
  handle('queue:add', (ids: string[], next = false) => {
    const list = [...new Set((Array.isArray(ids) ? ids : [ids]).map(String))]
    const before = db.prepare('select id, item_type, item_id, position, added_at, done_at from reading_queue where done_at is null').all()
    const bounds = db.prepare('select min(position) as low, max(position) as high from reading_queue where done_at is null').get() as { low: number | null; high: number | null }
    let added = 0
    list.forEach((id, at) => {
      const type = typeOf(id)
      if (!type || type === 'goal') return
      const position = next ? (bounds.low ?? 0) - list.length + at : (bounds.high ?? 0) + 1 + at
      const waiting = db.prepare('select id from reading_queue where item_id = ? and done_at is null').get(id) as { id: string } | undefined
      if (waiting) db.prepare('update reading_queue set position = ? where id = ?').run(position, waiting.id)
      else db.prepare('insert into reading_queue (id, item_type, item_id, position, added_at) values (?, ?, ?, ?, ?)').run(randomUUID(), type, id, position, new Date().toISOString())
      added++
    })
    if (added) told()
    return { added, before }
  })
  // Put back as it was before an add: the undo of Add to queue and Read next.
  handle('queue:put', (rows: { id: string; item_type: string; item_id: string; position: number; added_at: string; done_at: string | null }[]) => {
    db.prepare('delete from reading_queue where done_at is null').run()
    const put = db.prepare('insert or replace into reading_queue (id, item_type, item_id, position, added_at, done_at) values (?, ?, ?, ?, ?, ?)')
    for (const row of rows ?? []) put.run(row.id, row.item_type, row.item_id, row.position, row.added_at, row.done_at ?? null)
    told()
    return true
  })
  // Dragged: before the one it was let go on (going up) or after it (going down).
  handle('queue:move', (id: string, target: string, after: boolean) => {
    const order = (db.prepare('select id from reading_queue where done_at is null order by position').all() as { id: string }[]).map((row) => row.id).filter((one) => one !== id)
    const at = order.indexOf(target)
    if (at < 0) return false
    order.splice(at + (after ? 1 : 0), 0, id)
    const set = db.prepare('update reading_queue set position = ? where id = ?')
    order.forEach((one, index) => set.run(index, one))
    told()
    return true
  })
  // Off the queue: gives back the entry, for an undo.
  handle('queue:remove', (id: string) => {
    const was = db.prepare('select id, item_type, item_id, position, added_at, done_at from reading_queue where id = ?').get(id)
    db.prepare('delete from reading_queue where id = ?').run(id)
    told()
    return was ?? null
  })
  handle('queue:restore', (row: { id: string; item_type: string; item_id: string; position: number; added_at: string; done_at: string | null }) => {
    if (!row?.id) return false
    db.prepare('insert or replace into reading_queue (id, item_type, item_id, position, added_at, done_at) values (?, ?, ?, ?, ?, ?)').run(row.id, row.item_type, row.item_id, row.position, row.added_at, row.done_at ?? null)
    told()
    return true
  })
  // Read: off the queue and into Read, dated. `at` only in the sandbox, which dates its history.
  handle('queue:done', (id: string, at?: string) => {
    db.prepare('update reading_queue set done_at = ? where id = ? and done_at is null').run(SANDBOX && at ? at : new Date().toISOString(), id)
    told()
    return true
  })
  // Not read after all: back on the queue, at the front. `inPlace`, an undo
  // straight after: back where it was in the queue (its place is kept while read).
  handle('queue:undone', (id: string, inPlace = false) => {
    const { low } = db.prepare('select min(position) as low from reading_queue where done_at is null').get() as { low: number | null }
    if (inPlace) db.prepare('update reading_queue set done_at = null where id = ?').run(id)
    else db.prepare('update reading_queue set done_at = null, position = ? where id = ?').run((low ?? 0) - 1, id)
    told()
    return true
  })
  // Read forgotten: the history emptied, the queue left as it is.
  handle('queue:forget', () => {
    db.prepare('delete from reading_queue where done_at is not null').run()
    told()
    return true
  })
}
