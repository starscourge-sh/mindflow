import type { DatabaseSync } from 'node:sqlite'
import { KEPT_IN, LABEL } from './book-words'
import { plain } from './card-words'
import { tagsBeside } from './property-tags'
import { tagsIn } from './tag-words'

/**
 * One note's tags, from its name and its words, then any added in Properties
 * (property-tags.ts) that the words do not already say. Read the same way on
 * main and on the reading thread. `fields` is the note's properties as kept,
 * or the JSON they are stored as.
 */
export function noteTags(title: unknown, body: unknown, fields?: unknown): string[] {
  let words = ''
  try {
    words = plain(JSON.parse(String(body ?? 'null')))
  } catch {
    words = String(body ?? '')
  }
  return tagsBeside(tagsIn(`${title ?? ''} ${words}`), fields)
}

/**
 * The tags, as a read of the book and nothing else (no Electron in it): they
 * are worked out from every note's words, so they are asked of the reading
 * thread (reader.ts) and never hold main. Each ask carries the book's stamp
 * (captures.ts `bookStamp`): while it has not moved, the list is not read again.
 */
export function bookTags(db: DatabaseSync) {
  // --- tags, worked out from the words every time so they cannot go stale
  // What a tag holds is one list, whoever asks: the sidebar, the Tags page and
  // the tag's own page count the same things. Out of it: the Bin, the
  // archive, cards, and a note made into tasks that are all in the Bin (it
  // went there with them). Kept but not shown until asked (`later`): a task
  // done, a to-do note dealt with, and a note made into a task, which lives
  // on as that task, as Everything shows them.
  const madeInto = (status: string): string => `exists (select 1 from tasks t where t.status ${status} and (t.origin_capture_id = captures.id or t.id in (select task_id from task_links where item_id = captures.id)))`
  const TAG_CAPTURES = `status != 'discarded' and archived_at is null and not (status = 'resolved' and ${madeInto("= 'dropped'")} and not ${madeInto("!= 'dropped'")})`
  const CAPTURE_LATER = `select status = 'resolved' and (kind = 'todo' or ${madeInto("!= 'dropped'")})`
  let tagsOf = new Map<string, { title: string; body: string; fields: string | null; tags: string[] }>()
  type Tagged = { tag: string; id: string; type: string; title: string; private: boolean; later: boolean; at: string; fromNote?: string }
  // The whole list, kept until the book's stamp moves (captures.ts `bookStamp`): the sidebar, the Tags page and a
  // note's own tags each ask after every change, and all but the first are answered from here.
  let listed: { stamp: number; rows: Tagged[] } | null = null
  const tagged = (stamp: number): Tagged[] => {
    if (listed?.stamp === stamp) return listed.rows
    const rows = [
      ...(db.prepare(`select id, 'capture' as type, ${LABEL} as title, body, fields, private, (${CAPTURE_LATER}) as later, captured_at as at from captures where ${TAG_CAPTURES}`).all() as Record<string, string>[]),
      ...(db.prepare("select id, tier as type, title, body, fields, private, 0 as later, created_at as at, capture_id as fromNote from nuggets where archived_at is null and superseded_by is null and tier not in ('card', 'deck')").all() as Record<string, string>[]),
      // A task in the Bin is out of every tag, as a capture there is. A task has no properties list.
      ...(db.prepare("select id, 'task' as type, title, notes as body, null as fields, 0 as private, status = 'done' as later, created_at as at from tasks where status != 'dropped'").all() as Record<string, string>[])
    ]
    // An alias counts as the tag it stands for, without the words changing.
    const alias = new Map((db.prepare('select tag, alias_of from tag_meta where alias_of is not null').all() as { tag: string; alias_of: string }[]).map((row) => [row.tag, row.alias_of]))
    // Each note's tags kept with the words they came from, per note: an
    // autosave reads one body again, not every body there is.
    const was = tagsOf
    tagsOf = new Map()
    // A note saved as a gem shows once, as the gem, wherever the gem carries the tag too.
    const once = <T extends { tag: string; id: string; type: string; fromNote?: string }>(list: T[]): T[] => {
      const gems = new Set(list.filter((one) => one.fromNote).map((one) => `${one.tag} ${one.fromNote}`))
      return list.filter((one) => one.type !== 'capture' || !gems.has(`${one.tag} ${one.id}`))
    }
    const all = once(rows.flatMap((row) => {
      const key = `${row.type}:${row.id}`
      let kept = was.get(key)
      if (kept?.title !== row.title || kept.body !== row.body || kept.fields !== (row.fields ?? null))
        kept = { title: row.title, body: row.body, fields: row.fields ?? null, tags: noteTags(row.title, row.body, row.fields) }
      tagsOf.set(key, kept)
      return [...new Set(kept.tags.map((tag) => alias.get(tag) ?? tag))].map((tag) => ({ tag, id: row.id, type: row.type, title: row.title, private: !!Number(row.private), later: !!Number(row.later), at: row.at, fromNote: row.fromNote || undefined }))
    }))
    listed = { stamp, rows: all }
    return all
  }
  // `count` is what the tag's page shows at first; `later`, the done ones it keeps under a click.
  const tags = (stamp: number) => {
    // `last`: when it was last written into anything; `recent`: how many carrying it are from the last 30 days, so Tags can say which are growing.
    const counts = new Map<string, { count: number; later: number; last: string; recent: number }>()
    const month = new Date(Date.now() - 30 * 86_400_000).toISOString()
    for (const { tag, later, at } of tagged(stamp)) {
      const one = counts.get(tag) ?? { count: 0, later: 0, last: '', recent: 0 }
      one[later ? 'later' : 'count'] += 1
      if (at && at > one.last) one.last = at
      if (!later && at >= month) one.recent += 1
      counts.set(tag, one)
    }
    const meta = new Map((db.prepare('select tag, color, action, exam_at, priority, lands from tag_meta').all() as { tag: string; color: string | null; action: number; exam_at: string | null; priority: string | null; lands: string | null }[]).map((row) => [row.tag, row]))
    return [...counts].map(([tag, { count, later, last, recent }]) => ({ tag, count, later, last: last || null, recent, color: meta.get(tag)?.color ?? null, action: !!meta.get(tag)?.action, examAt: meta.get(tag)?.exam_at ?? null, priority: meta.get(tag)?.priority ?? null, lands: meta.get(tag)?.lands ?? null })).sort((a, b) => b.count - a.count || b.later - a.later)
  }
  /** One tag's notes and tasks, as its count counts them. */
  const tag = (stamp: number, name: string): Tagged[] => tagged(stamp).filter((row) => row.tag === name)
  // A tag as something to read: the whole of everything carrying it, newest
  // first, each with its other tags. The same things the tag's count counts,
  // tasks too; `later` marks the done ones the page keeps under a click.
  // Which notes carry it comes from the same list the count does, so the two
  // can never differ; a body is read only for a note that carries it, once.
  const readOf = new Map<string, { body: string; parsed: unknown }>()
  const read = (stamp: number, tag: string) => {
    const tagsBy = new Map<string, string[]>()
    // Only what carries it is read from the book: the whole book's words read again on every open took 100 to 300 ms
    // to give back 90 notes on the user's book (15 Nov 2026, "why is this hanging?").
    const ids = { capture: [] as string[], gem: [] as string[], task: [] as string[] }
    for (const one of tagged(stamp)) {
      tagsBy.set(`${one.type}:${one.id}`, [...(tagsBy.get(`${one.type}:${one.id}`) ?? []), one.tag])
      if (one.tag === tag) ids[one.type === 'capture' || one.type === 'task' ? one.type : 'gem'].push(one.id)
    }
    const among = 'and id in (select value from json_each(?)) order by rowid'
    const rows = [
      ...db.prepare(`select id, 'capture' as type, kind, status, '' as title, ${LABEL} as label, body, private, captured_at as at, coalesce(edited_at, captured_at) as changed, ${KEPT_IN} as keptIn, (${CAPTURE_LATER}) as later from captures where ${TAG_CAPTURES} ${among}`).all(JSON.stringify(ids.capture)),
      ...db.prepare(`select id, tier as type, kind, 'open' as status, title, label('', body) as label, body, private, created_at as at, coalesce(updated_at, created_at) as changed, 0 as later, capture_id as fromNote from nuggets where archived_at is null and superseded_by is null and tier not in ('card', 'deck') ${among}`).all(JSON.stringify(ids.gem)),
      ...db.prepare(`select id, 'task' as type, 'task' as kind, status, title, title as label, notes as body, 0 as private, created_at as at, coalesce(completed_at, created_at) as changed, status = 'done' as later from tasks where status != 'dropped' ${among}`).all(JSON.stringify(ids.task))
    ] as Record<string, string>[]
    return rows.flatMap((row) => {
      const key = `${row.type}:${row.id}`
      const tags = tagsBy.get(key)
      if (!tags?.includes(tag)) return []
      let kept = readOf.get(key)
      if (kept?.body !== row.body) kept = { body: row.body, parsed: JSON.parse(row.body ?? 'null') }
      readOf.set(key, kept)
      return [{ ...row, at: row.at, body: kept.parsed, private: !!Number(row.private), later: !!Number(row.later), tags: tags.filter((one) => one !== tag) }]
    }).sort((a, b) => String(b.at).localeCompare(String(a.at)))
  }

  /** One note's own #tags, as its words have them. A tag kept as plain text when it was sent does nothing: not counted here. */
  const ofNote = (table: 'captures' | 'nuggets', id: string): string[] => {
    const row = db.prepare(`select title, body, fields${table === 'captures' ? ', plain_tags as kept' : ''} from ${table} where id = ?`).get(id) as { title: string | null; body: string | null; fields: string | null; kept?: string | null } | undefined
    if (!row) return []
    const parse = (text: string | null | undefined): unknown => { try { return JSON.parse(text ?? 'null') } catch { return text } }
    const kept = (parse(row.kept ?? null) as string[] | null) ?? []
    // A tag kept as plain text when it was sent does nothing. One added in Properties still counts.
    const fromWords = tagsIn(`${row.title ?? ''} ${plain(parse(row.body))}`).filter((tag) => !kept.includes(tag))
    return tagsBeside(fromWords, row.fields)
  }

  return { tags, tag, read, ofNote }
}
