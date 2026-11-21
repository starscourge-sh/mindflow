import type { DatabaseSync } from 'node:sqlite'
import { LABEL } from './book-words'
import { cardWords, plain } from './card-words'
import { tagsIn } from './tag-words'
import { linkedAmong } from './links-in'
import { LEARN_TAG } from './name'
import { dayKey, dayjs } from './dates'
import { findPair, type PairNote } from './feed-pair'
import { bookInsights, highlightHref, highlightName, type Kept } from './book-insights'
import { REST_DAYS, pickPassages } from './insight-pick'
import type { FeedPost, FeedSide, Reaction } from './feed'

/**
 * The Feed as a read of the book and nothing else (no Electron in it): what
 * it may show, when each was last in front of you, the day's set picked and
 * each post as it now reads. What comes back is picked as the insights are
 * (insight-pick.ts, from book-insights.ts's one pool): one way things come
 * back, by shares of new and old leaning on what mattered to you, each resting 14 days once shown. It reads every gem, quote and page, and to find
 * a pair every note of the book, so it is asked of the reading thread
 * (reader.ts) and never holds main; main (feed.ts) keeps the day's set,
 * marks restacks shown, and makes the day's poll and quiz, which are
 * Review's and a decision's own. The same code answers on main for the
 * Feed's smaller lists.
 */

/** Whether the Feed takes your Pages too (Settings, or the switch on the Feed itself). */
export type Takes = { pages: boolean }
export type Row = { type: FeedPost['type']; id: string; kind: string; title: string; body: string | null; who: string | null; made: string; visited: string | null; weight: number; archive?: number | boolean; href?: string }
/** One look at the Feed: the day, the day's kept set if it has one, and else the poll and quiz keys main picked for it. */
export type FeedAsk = { today: string; takes: Takes; kept: string | undefined; asks: string[] }
/** The Feed as read: the day's set (`picked` when it was picked just now, from `pooled` notes), each post in order
 *  with a place kept for each poll and quiz (`asked`), and the one note never linked, set in by main. */
export type FeedRead = { keys: string; picked: boolean; pooled: number; posts: (FeedPost | { asked: string })[]; lone: FeedPost | null }

/** How old a note linked to nothing must be, in months, to come up as one never linked. */
const UNLINKED_AFTER = 3
const SIZE = 24
/** How much less often "Less of this" makes it come up: the same step as a hint's thumbs down. */
export const LESS = 1 / 1.5
/** Times faded, from its weight: each "Less of this" is one step of LESS. */
export const fadedSteps = (weight: number | null | undefined): number => (weight && weight < 0.99 ? Math.max(1, Math.round(Math.log(weight) / Math.log(LESS))) : 0)
/** Times liked, from its weight: each like is one step up. */
export const likedSteps = (weight: number | null | undefined): number => (weight && weight > 1.01 ? Math.max(1, Math.round(Math.log(weight) / Math.log(1.5))) : 0)
export type Table = 'nuggets' | 'captures' | 'pdf_highlights'
export const tableOf = (type: string): Table | null => (type === 'capture' ? 'captures' : type === 'day' ? null : type === 'highlight' ? 'pdf_highlights' : 'nuggets')
/** The note ids a day's key stands for: a pair's two, else the id after its last colon ("poll:captures:id", "lone:nugget:id"). */
export const keyIds = (key: string): string[] => {
  if (!key.startsWith('pair:')) return [key.slice(key.lastIndexOf(':') + 1)]
  try {
    const { a, b } = JSON.parse(key.slice(5)) as { a: string; b: string }
    return [a, b].map((one) => one.slice(one.indexOf(':') + 1))
  } catch {
    return []
  }
}
/** Every note shown in the Feed or used in an insight from this day on, by id: they rest (REST_DAYS). `before` leaves a day out. */
export const shownSince = (db: DatabaseSync, from: string, before?: string): Set<string> => {
  const out = new Set<string>()
  for (const row of db.prepare(`select keys from feed_days where day >= ?${before ? ' and day < ?' : ''}`).all(...(before ? [from, before] : [from])) as { keys: string }[])
    for (const key of JSON.parse(row.keys) as string[]) for (const id of keyIds(key)) out.add(id)
  try {
    for (const row of db.prepare("select sources from feed_insights where day >= ? and state is not 'failed'").all(from) as { sources: string }[])
      for (const one of JSON.parse(row.sources) as { id: string }[]) out.add(one.id)
  } catch {
    // Before the insights' table: none.
  }
  return out
}

export function bookFeed(db: DatabaseSync) {
  const insights = bookInsights(db)
  /** Everything the Feed may show (book-insights.ts, the insights' own pool): private ones, #bits and lessons are never read; Pages only once asked for. */
  const pool = (takes: Takes): Kept[] => insights.pool().filter((row) => takes.pages || row.type !== 'article')
  /** One note by its feed key, read on its own: a restack's old note, a liked one, or "Use this". Private and binned ones never. */
  const rowOf = (key: string): Row | undefined => {
    const type = key.slice(0, key.indexOf(':'))
    const id = key.slice(key.indexOf(':') + 1)
    if (type === 'day') return db.prepare("select 'day' as type, day as id, 'day' as kind, day as title, body, null as who, day as made, null as visited, 1 as weight from day_pages where day = ?").get(id) as Row | undefined
    if (type === 'capture') return db.prepare(`select 'capture' as type, id, kind, ${LABEL} as title, body, attribution as who, captured_at as made, surfaced_at as visited, surfacing_weight as weight, (imported_at is not null) as archive from captures where id = ? and private = 0 and status != 'discarded'`).get(id) as Row | undefined
    if (type === 'nugget' || type === 'question' || type === 'article') return db.prepare(`select ? as type, id, kind, coalesce(nullif(nullif(trim(title), 'Untitled'), ''), label('', body)) as title, body, attribution as who, created_at as made, last_visited_at as visited, surfacing_weight as weight from nuggets where id = ? and private = 0 and binned_at is null and superseded_by is null`).get(type, id) as Row | undefined
    if (type === 'highlight') {
      const one = db.prepare('select * from pdf_highlights where id = ?').get(id) as { id: string; src: string; page: number; quote: string; note: string | null; created_at: string; surfacing_weight?: number | null } | undefined
      if (!one) return undefined
      return { type: 'highlight', id: one.id, kind: 'highlight', title: highlightName(one.src), body: [one.quote, one.note].filter(Boolean).join('\n'), who: null, made: one.created_at, visited: null, weight: one.surfacing_weight ?? 1, href: highlightHref(one) }
    }
    return undefined
  }

  /** When each was last in front of you: an open, a hint, or an earlier day's Feed. */
  const seenOf = (): { seen: Map<string, string>; times: Map<string, number> } => {
    const seen = new Map<string, string>()
    const times = new Map<string, number>()
    const count = (id: string, n = 1): void => void times.set(id, (times.get(id) ?? 0) + n)
    for (const row of db.prepare('select nugget_id as id, count(*) as n from hint_events group by nugget_id').all() as { id: string; n: number }[]) count(row.id, row.n)
    const note = (id: string, at: string | null): void => void (at && at > (seen.get(id) ?? '') && seen.set(id, at))
    for (const row of db.prepare('select id, at from note_opens').all() as { id: string; at: string }[]) note(row.id, row.at)
    for (const row of db.prepare('select nugget_id as id, max(shown_at) as at from hint_events group by nugget_id').all() as { id: string; at: string }[]) note(row.id, row.at)
    for (const row of db.prepare('select day, keys from feed_days where day < ?').all(dayKey()) as { day: string; keys: string }[])
      for (const key of JSON.parse(row.keys) as string[]) for (const id of keyIds(key)) {
        note(id, dayjs(row.day).toISOString())
        count(id)
      }
    return { seen, times }
  }


  /** A note's words as the Feed writes them: its #tags taken out (they show under the post). */
  const untagged = (text: string): string => text.replace(/(?<=^|\s)#\p{L}[\p{L}\p{N}_/-]*/gmu, '')

  /**
   * The @ links in a stored body, Markdown's `[[@article:id|Label]]` or the editor's noteLink, so the Feed can show
   * them as links. Each label is given as the post's words write it (`words`, below): a note linked by a name that
   * carries its #tag ("Two-minute rule #work") is written there without the tag, and with the tag left on, its label
   * was never found in the words, so it showed as plain words and opened nothing.
   */
  const linksOf = (raw: string): { to: string; label: string }[] => {
    let value: unknown = raw
    try { value = JSON.parse(raw) } catch { /* Markdown, as it is */ }
    const out: { to: string; label: string }[] = []
    if (typeof value === 'string') for (const one of value.matchAll(/\[\[@([^|\]]+)\|([^\]]+)\]\]/g)) out.push({ to: one[1], label: one[2] })
    const walk = (node: { type?: string; attrs?: { id?: unknown; label?: unknown }; content?: unknown[] }): void => {
      if (node?.type === 'noteLink' && node.attrs?.id && node.attrs.label) out.push({ to: String(node.attrs.id), label: String(node.attrs.label) })
      for (const child of node?.content ?? []) walk(child as typeof node)
    }
    if (value && typeof value === 'object') walk(value as never)
    return out.map((one) => ({ to: one.to, label: untagged(one.label).trim() })).filter((one) => one.label)
  }

  /** Where a quote came from: the first link back into a kept PDF (at its page) or a kept web page, as the readers write it. */
  const hostOf = (href: string | null): string => {
    try { return href ? new URL(href).hostname.replace(/^www\./, '') : '' } catch { return '' }
  }
  const fromOf = (body: string | null): FeedPost['from'] => {
    const raw = body ?? ''
    const href = /(?:haligtree|mindflow):\/\/(?:assets\/[^"#?)\s\\]+\.pdf(?:#[^"\s)\\]*)?|article\?[^"\s)\\]+)/i.exec(raw)?.[0]
    if (!href) return undefined
    // Its words in a Markdown link, or else the PDF's own name.
    const label = new RegExp(`\\[([^\\]]+)\\]\\(${href.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\)`).exec(raw)?.[1]
    const hash = new URLSearchParams(href.includes('#') ? href.slice(href.indexOf('#') + 1) : href.slice(href.indexOf('?') + 1))
    const page = Number(hash.get('page')) || null
    const name = (label ?? hash.get('name') ?? hostOf(hash.get('href'))).replace(/, p\. \d+$/, '').replace(/\.pdf$/i, '').trim()
    return name ? { name, page, href } : undefined
  }

  const words = (row: Row): string => {
    let text = untagged(cardWords(row.body ?? ''))
    const lines = text.split('\n').map((line) => line.trim()).filter(Boolean)
    // The title is said once: lines it already says go, as Home's cards drop them. A quote keeps its words whole.
    const flat = (said: string): string => said.toLowerCase().replace(/#\p{L}[\p{L}\p{N}_/-]*/gu, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
    const name = flat(row.title)
    if (row.kind !== 'quote' && row.type !== 'day') while (lines.length && name.includes(flat(lines[0]))) lines.shift()
    text = lines.join('\n')
    return text.length > 600 ? `${text.slice(0, 600).replace(/\s+\S*$/, '')}…` : text
  }

  const tagsOfRow = (row: { title: string; body: string | null }): string[] => {
    let text = row.body ?? ''
    try { text = plain(JSON.parse(text)) } catch { /* Markdown, as it is */ }
    return tagsIn(`${row.title} ${text}`)
  }

  /**
   * Filing tags: words that sort notes rather than say what they are about, so never an interest.
   * A kind's own name (#quote, #mine) and any tag on notes of most kinds the book has.
   */
  const FILING = new Set(['quote', 'quotes', 'mine', 'note', 'notes', 'gem', 'gems', 'question', 'questions', 'idea', 'ideas', 'page', 'pages', 'link', 'links', 'word', 'words', 'todo', 'inbox'])
  const filingTags = (takes: Takes, rows: Row[] = pool(takes)): Set<string> => {
    const kinds = new Map<string, Set<string>>()
    const all = new Set<string>()
    for (const row of rows) {
      all.add(row.kind)
      for (const tag of tagsOfRow(row)) kinds.set(tag, (kinds.get(tag) ?? new Set()).add(row.kind))
    }
    const out = new Set(FILING)
    if (all.size >= 3) for (const [tag, on] of kinds) if (on.size > all.size / 2) out.add(tag)
    return out
  }

  /** One note by its feed key, for a restack whose old note is not in the day's set (a Page from Reading too). */
  const lookUp = (key: string): Row | undefined => rowOf(key)

  /**
   * One note from these kept three months or more and linked to nothing, by
   * the Map's own reading of links (every note not private, either way), the
   * longest unseen first. Gems, notes and pages only; none when none is left.
   */
  const unlinkedOne = (rows: Row[], lastSeen: (row: Row) => string | null): Row | undefined => {
    const old = dayjs().subtract(UNLINKED_AFTER, 'month').toISOString()
    const candidates = rows.filter((row) => (row.type === 'nugget' || row.type === 'capture' || row.type === 'article') && row.made <= old)
    if (!candidates.length) return undefined
    const linked = linkedAmong([
      ...db.prepare("select id, body from captures where status != 'discarded' and private = 0").all(),
      ...db.prepare("select id, body from nuggets where private = 0 and tier not in ('card', 'deck')").all()
    ] as { id: string; body: string | null }[])
    return candidates.filter((row) => !linked.has(row.id)).sort((a, b) => (lastSeen(a) ?? '').localeCompare(lastSeen(b) ?? '') || a.made.localeCompare(b.made))[0]
  }

  // --- "Two subjects, one thread": two notes with no tag in common that share a rare word, a source, or an hour.
  const textOf = (body: string | null): string => { try { return plain(JSON.parse(body ?? '')) } catch { return body ?? '' } }
  const pairOf = (filing: Set<string>, rows: Row[], seed: number): string | null => {
    const notes: PairNote[] = rows.filter((row) => row.type !== 'day' && row.type !== 'article').map((row) => ({ key: `${row.type}:${row.id}`, id: row.id, title: row.title, text: textOf(row.body), tags: tagsOfRow(row).filter((tag) => tag !== 'bit' && tag !== LEARN_TAG), who: row.who, made: row.made, imported: !!row.archive }))
    // How rare a word is: across every note of the book you could be shown, kept or not.
    const book = [
      ...db.prepare("select title, body from nuggets where private = 0 and binned_at is null and tier not in ('card', 'deck')").all(),
      ...db.prepare(`select ${LABEL} as title, body from captures where private = 0 and status != 'discarded' and id not in (select capture_id from nuggets where capture_id is not null)`).all()
    ].map((one) => `${(one as { title: string }).title} ${textOf((one as { body: string | null }).body)}`)
    const found = findPair(notes, filing, book, seed)
    return found ? `pair:${JSON.stringify({ a: found.a.key, b: found.b.key, why: found.why })}` : null
  }
  /** A pair's post, read now: both notes as they are, each with its tags; gone if either has gone. */
  const paired = (byKey: Map<string, Row>, filing: Set<string>, key: string): FeedPost[] => {
    let saved: { a: string; b: string; why: NonNullable<FeedPost['pair']>['why'] }
    try { saved = JSON.parse(key.slice(5)) } catch { return [] }
    const rows = [saved.a, saved.b].map((one) => byKey.get(one))
    if (rows.some((row) => !row)) return []
    const notes = (rows as Row[]).map((row) => ({ type: row.type, id: row.id, kind: row.kind, title: row.title, text: words(row), who: row.who?.trim() || null, tags: tagsOfRow(row).filter((tag) => !filing.has(tag.toLowerCase()) && tag !== 'bit' && tag !== LEARN_TAG).slice(0, 3) }))
    return [{ type: 'pair', id: `${rows[0]!.id}+${rows[1]!.id}`, kind: 'pair', title: '', text: '', who: null, made: [rows[0]!.made, rows[1]!.made].sort().at(-1)!, seen: null, gloss: null, clue: null, react: null, replies: 0, firstReply: null, seenTimes: 0, faded: 0, liked: 0, tags: [], restack: null, pair: { notes, why: saved.why } }]
  }

  const feed = ({ today, takes, kept, asks }: FeedAsk): FeedRead => {
    const rows = pool(takes)
    const pooled = rows.length
    const byKey = new Map<string, Row>(rows.map((row) => [`${row.type}:${row.id}`, row]))
    const { seen, times } = seenOf()
    const lastSeen = (row: Row): string | null => [row.visited, seen.get(row.id)].filter(Boolean).sort().at(-1) ?? null
    const filing = filingTags(takes, rows)
    let keys = kept
    if (!keys) {
      // A poll and a quiz card or two are part of the twenty, set among the notes rather than at the top: `asks`, picked on main.
      // A note asked as a quiz or a poll is not also shown as itself: once a day, never a quiz and a quote of one gem.
      const askedIds = new Set(asks.map((key) => key.slice(key.lastIndexOf(':') + 1)))
      // Gems you restacked before today come first, once: "You restacked".
      const stacked = (db.prepare('select id from feed_restacks where made_day < ? and (shown_day is null or shown_day = ?) order by made_day').all(today, today) as { id: string }[])
        .map((one) => byKey.get(`nugget:${one.id}`)).filter((one): one is Kept => !!one && !askedIds.has(one.id))
      // Shown in the Feed or used in an insight in the last fortnight, today's insights too: it rests (insight-pick.ts).
      const rested = shownSince(db, dayKey(dayjs(today).subtract(REST_DAYS - 1, 'day')), today)
      // Never twice in a day: what is asked, restacked, or in one of today's insights is not also a post.
      const taken = new Set([...askedIds, ...stacked.map((one) => one.id), ...shownSince(db, today, today)])
      // One "Two subjects, one thread" a day at most, where an honest pair exists, from notes not resting.
      const pair = pairOf(filing, rows.filter((row) => !taken.has(row.id) && !rested.has(row.id)), Number(today.replace(/\D/g, '')) || 0)
      for (const id of pair ? keyIds(pair) : []) taken.add(id)
      const room = Math.max(0, SIZE - asks.length - stacked.length - (pair ? 1 : 0))
      // The day's notes, one pick a turn, as the insights pick: by shares of new and old, what mattered to you (hearts,
      // thoughts, opens, edits, links) drawn more and about a third of the day its own, never one resting.
      const byId = new Map(rows.map((row) => [row.id, row]))
      const never = new Set([...rested, ...taken])
      const voices = new Map<string, number>()
      const picked: Kept[] = []
      for (let turn = 0; picked.length < room && turn < room * 8; turn++) {
        const one = pickPassages(rows, 'resurface', `${today}:feed`, turn, never)?.passages[0]
        if (!one) break
        never.add(one.id)
        const row = byId.get(one.id)!
        // Quotes spread across who said them: no more than two from one person a day.
        const voice = row.kind === 'quote' ? row.who?.trim().toLowerCase() : undefined
        if (voice && (voices.get(voice) ?? 0) >= 2) continue
        if (voice) voices.set(voice, (voices.get(voice) ?? 0) + 1)
        picked.push(row)
      }
      // A line you highlighted comes up at least once a day while any is not resting: a few highlights among hundreds of
      // notes were otherwise left out by the shares on most days (a newcomer's book of imports and 6 highlights, 21 Nov).
      if (!picked.some((row) => row.type === 'highlight')) {
        const mark = pickPassages(rows.filter((row) => row.type === 'highlight'), 'resurface', `${today}:feed:mark`, 0, never)?.passages[0]
        if (mark) picked.splice(Math.min(picked.length, 4), picked.length >= room ? 1 : 0, byId.get(mark.id)!)
      }
      // A small book whose every note has rested: the rest of the day from those shown longest ago, never one twice today.
      if (picked.length < room) picked.push(...rows.filter((row) => rested.has(row.id) && !taken.has(row.id))
        .sort((a, b) => (lastSeen(a) ?? '').localeCompare(lastSeen(b) ?? '') || a.made.localeCompare(b.made)).slice(0, room - picked.length))
      const list = [...stacked, ...picked].map((row) => `${row.type}:${row.id}`)
      asks.forEach((key, at) => list.splice(Math.min(list.length, 3 + at * 5), 0, key))
      if (pair) list.splice(Math.min(list.length, 8), 0, pair)
      // Now and then, one note kept three months or more and never linked, set among the rest: kept with the day, so it rests as the others do.
      const shownIds = new Set(list.flatMap(keyIds))
      const lone = unlinkedOne(rows.filter((row) => !shownIds.has(row.id) && !rested.has(row.id)), lastSeen)
      if (lone) list.push(`lone:${lone.type}:${lone.id}`)
      keys = JSON.stringify(list)
    }
    const changedOf = db.prepare('select new_id as id, at from feed_changed where id = ? and new_id in (select id from nuggets where binned_at is null)')
    const glossOf = db.prepare('select body, created_at as at from glosses where item_id = ? order by created_at desc limit 1')
    const glossSpan = db.prepare('select count(*) as n, min(created_at) as first from glosses where item_id = ?')
    const reacts = new Map((db.prepare('select key, reaction from feed_reacts where day = ?').all(today) as { key: string; reaction: Reaction }[]).map((one) => [one.key, one.reaction]))
    const restackOf = db.prepare('select of_key from feed_restacks where id = ?')
    const quoted = (row: Row): FeedPost['restack'] => {
      if (row.type !== 'nugget') return null
      const of = (restackOf.get(row.id) as { of_key: string } | undefined)?.of_key
      const old = of ? (byKey.get(of) ?? lookUp(of)) : undefined
      return old ? { type: old.type, id: old.id, title: old.title, text: words(old), who: old.who?.trim() || null, kind: old.kind } : null
    }
    // Read now, not from the morning's pool: a "Less of this" a moment ago shows at once.
    const weightOf = (row: Row): number => { const table = tableOf(row.type); return table ? ((db.prepare(`select surfacing_weight as w from ${table} where id = ?`).get(row.id) as { w: number } | undefined)?.w ?? 1) : 1 }
    // One note at most once, for a day kept before that rule (above): the first showing of it stays.
    const shown = new Set<string>()
    const postOf = (row: Row, key: string): FeedPost => {
      const gloss = (glossOf.get(row.id) as { body: string; at: string } | undefined) ?? null
      const span = glossSpan.get(row.id) as { n: number; first: string | null }
      return {
        type: row.type, id: row.id, kind: row.kind, title: row.title, text: words(row), who: row.who?.trim() || null, made: row.made,
        seen: lastSeen(row), gloss: row.type === 'question' ? null : gloss, clue: row.type === 'question' ? (gloss?.body ?? null) : null,
        react: reacts.get(key) ?? null, replies: span.n, firstReply: span.first, seenTimes: times.get(row.id) ?? 0, faded: fadedSteps(weightOf(row)), liked: likedSteps(row.type === 'day' ? row.weight : weightOf(row)), tags: tagsOfRow(row).filter((tag) => tag !== 'bit' && tag !== LEARN_TAG).slice(0, 3), restack: quoted(row),
        links: linksOf(row.body ?? ''),
        from: row.kind === 'quote' ? fromOf(row.body) : row.href ? { name: row.title, page: Number(/[#&]page=(\d+)/.exec(row.href)?.[1]) || null, href: row.href } : undefined,
        archive: !!row.archive,
        changedTo: (changedOf.get(row.id) as { id: string; at: string } | undefined) ?? null
      }
    }
    const all = JSON.parse(keys) as string[]
    const posts = all.filter((key) => {
      if (key.startsWith('lone:')) return false
      if (key.startsWith('pair:')) return keyIds(key).every((id) => !shown.has(id) && !!shown.add(id))
      const id = key.slice(key.lastIndexOf(':') + 1)
      return !shown.has(id) && !!shown.add(id)
    }).flatMap((key): FeedRead['posts'] => {
      // A poll or a quiz is made on main, in the place kept for it here.
      if (key.startsWith('poll:') || key.startsWith('quiz:')) return [{ asked: key }]
      if (key.startsWith('pair:')) return paired(byKey, filing, key)
      const row = byKey.get(key)
      return row ? [postOf(row, key)] : []
    })
    // The day's one note never linked (picked with the day, above): opening it is the way to link it.
    const loneKey = all.find((key) => key.startsWith('lone:'))?.slice(5)
    const lone = loneKey && !shown.has(keyIds(loneKey)[0]) ? byKey.get(loneKey) : undefined
    return { keys, picked: !kept, pooled, posts, lone: lone ? { ...postOf(lone, `${lone.type}:${lone.id}`), unlinked: Math.max(3, dayjs().diff(dayjs(lone.made), 'month')) } : null }
  }

  /** How near the Feed is to full: the notes it can show (not private, not a #bit, not a learn card), and of them the quotes and pictures. */
  const goal = (takes: Takes): { notes: number; quotes: number } => {
    const rows = pool(takes)
    return { notes: rows.length, quotes: rows.filter((row) => row.kind === 'quote' || row.type === 'highlight' || /\]\([^)]*\.(?:webp|png|jpe?g)\)|"type":"image"/i.test(row.body ?? '')).length }
  }

  /** Every source and tag gone quiet a month or more, the quietest first. */
  const quietAll = (): FeedSide['quiet'] => {
    const { seen } = seenOf()
    // What is in today's Feed is heard from today.
    const now = new Date().toISOString()
    const today = new Set(JSON.parse((db.prepare('select keys from feed_days where day = ?').get(dayKey()) as { keys: string } | undefined)?.keys ?? '[]') as string[])
    // Each source and tag by the last time any of its notes was in front of you, or written.
    const last = new Map<string, { kind: 'source' | 'tag'; name: string; last: string; n: number }>()
    const note = (kind: 'source' | 'tag', name: string, at: string): void => {
      const key = `${kind}:${name.toLowerCase()}`
      const one = last.get(key) ?? { kind, name, last: '', n: 0 }
      one.n += 1
      if (at > one.last) one.last = at
      last.set(key, one)
    }
    // Every note of yours that may be shown, not only those the Feed picks from.
    const notes = [
      ...db.prepare("select case when tier = 'question' then 'question' else 'nugget' end as type, id, coalesce(nullif(nullif(trim(title), 'Untitled'), ''), label('', body)) as title, body, attribution as who, created_at as made, last_visited_at as visited from nuggets where private = 0 and archived_at is null and superseded_by is null and binned_at is null and tier in ('nugget', 'question', 'article')").all(),
      ...db.prepare(`select 'capture' as type, id, ${LABEL} as title, body, attribution as who, captured_at as made, surfaced_at as visited from captures where private = 0 and status != 'discarded' and archived_at is null and kind != 'task' and id not in (select capture_id from nuggets where capture_id is not null)`).all()
    ] as Row[]
    for (const row of notes) {
      if (/(^|\s)#bit\b/i.test(`${row.title} ${row.body ?? ''}`)) continue
      const at = today.has(`${row.type}:${row.id}`) || today.has(`article:${row.id}`) ? now : [row.made, row.visited, seen.get(row.id)].filter((one): one is string => !!one).sort().at(-1)!
      if (row.who?.trim()) note('source', row.who.trim(), at)
      for (const tag of tagsOfRow(row)) note('tag', tag, at)
    }
    // Only those with a few notes: one note gone quiet is just a note.
    // And only what has been quiet a month or more: a few days is not a while.
    const month = dayjs().subtract(28, 'day').toISOString()
    return [...last.values()].filter((one) => one.n >= 2 && one.last < month && one.name !== LEARN_TAG).sort((a, b) => a.last.localeCompare(b.last)).map(({ kind, name, last: at }) => ({ kind, name, last: at }))
  }
  /** The Feed's side column: who and what you have not heard from, and this week's tags. Reads every note: asked of the reading thread. */
  const side = (takes: Takes): FeedSide => {
    const filing = filingTags(takes)
    const quiet = quietAll().filter((one) => one.kind !== 'tag' || !filing.has(one.name.toLowerCase())).slice(0, 3)
    const since = dayjs().subtract(7, 'day').toISOString()
    const counts = new Map<string, number>()
    const recent = [
      ...db.prepare("select title, body from nuggets where private = 0 and archived_at is null and superseded_by is null and binned_at is null and tier not in ('card', 'deck') and created_at >= ?").all(since),
      ...db.prepare(`select ${LABEL} as title, body from captures where private = 0 and status != 'discarded' and archived_at is null and captured_at >= ? and id not in (select capture_id from nuggets where capture_id is not null)`).all(since)
    ] as { title: string; body: string | null }[]
    for (const row of recent) for (const tag of tagsOfRow(row)) counts.set(tag, (counts.get(tag) ?? 0) + 1)
    const week = [...counts].filter(([tag]) => tag !== 'bit' && tag !== LEARN_TAG && !filing.has(tag.toLowerCase())).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 5).map(([tag, n]) => ({ tag, n }))
    return { quiet, week }
  }

  return { pool, rowOf, seenOf, words, tagsOfRow, linksOf, filingTags, lookUp, feed, goal, side }
}
