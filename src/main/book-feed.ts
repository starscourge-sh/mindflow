import type { DatabaseSync } from 'node:sqlite'
import { LABEL } from './book-words'
import { cardWords, plain } from './card-words'
import { tagsIn } from './tag-words'
import { linkedAmong } from './links-in'
import { LEARN_TAG } from './name'
import { dayKey, dayjs } from './dates'
import { findPair, type PairNote } from './feed-pair'
import type { FeedPost, Reaction } from './feed'

/**
 * The Feed as a read of the book and nothing else (no Electron in it): what
 * it may show, when each was last in front of you, the day's set picked and
 * each post as it now reads. It reads every gem, quote and page, and to find
 * a pair every note of the book, so it is asked of the reading thread
 * (reader.ts) and never holds main; main (feed.ts) keeps the day's set,
 * marks restacks shown, and makes the day's poll and quiz, which are
 * Review's and a decision's own. The same code answers on main for the
 * Feed's smaller lists.
 */

/** What the Feed takes beside gems, quotes, questions and days (Settings, or the switches on the Feed itself). */
export type Takes = { pages: boolean; pictures: boolean }
export type Row = { type: FeedPost['type']; id: string; kind: string; title: string; body: string | null; who: string | null; made: string; visited: string | null; weight: number; archive?: number }
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
export const tableOf = (type: string): 'nuggets' | 'captures' | null => (type === 'capture' ? 'captures' : type === 'day' ? null : 'nuggets')

export function bookFeed(db: DatabaseSync) {
  /** More than half of the book's notes came in by an importer. */
  const mostlyImported = (): boolean => {
    const { imported, total } = db.prepare("select count(*) filter (where imported_at is not null) as imported, count(*) as total from captures where status != 'discarded'").get() as { imported: number; total: number }
    return imported > total / 2
  }
  /** Everything the Feed may show, as rows: private ones and #bits are never read. */
  const pool = (takes: Takes): Row[] => {
    const nuggets = db.prepare(`select case when tier = 'question' then 'question' else 'nugget' end as type, id, kind, coalesce(nullif(nullif(trim(title), 'Untitled'), ''), label('', body)) as title, body, attribution as who, created_at as made, last_visited_at as visited, surfacing_weight as weight, (source != '') as archive
      from nuggets where tier in ('nugget', 'question') and private = 0 and suspended = 0 and archived_at is null and superseded_by is null and binned_at is null and (tier != 'question' or closed_at is null)`).all() as Row[]
    // A quote still a capture; one already a gem comes as the gem.
    const quotes = db.prepare(`select 'capture' as type, id, kind, ${LABEL} as title, body, attribution as who, captured_at as made, surfaced_at as visited, surfacing_weight as weight, (imported_at is not null) as archive
      from captures where kind = 'quote' and private = 0 and status != 'discarded' and archived_at is null
      and id not in (select capture_id from nuggets where capture_id is not null)`).all() as Row[]
    // A note or a page of yours with a picture in it: the posts you look at, not only read.
    const PICTURED = "(body like '%](%.webp)%' or body like '%](%.png)%' or body like '%](%.jp%g)%' or body like '%\"type\":\"image\"%')"
    // Only once asked for (Settings, "Also show notes with pictures"): by default the Feed holds what you chose to keep,
    // gems, quotes, held questions and Journal days, never an Inbox note that happens to have a screenshot in it.
    const loose = takes.pictures
    const pictured = [
      ...(!loose ? [] : db.prepare(`select 'capture' as type, id, kind, ${LABEL} as title, body, null as who, captured_at as made, surfaced_at as visited, surfacing_weight as weight, (imported_at is not null) as archive
        from captures where kind not in ('quote', 'task') and private = 0 and status != 'discarded' and archived_at is null and ${PICTURED}
        and id not in (select capture_id from nuggets where capture_id is not null)`).all()),
      // A book that came mostly from elsewhere: its imported notes come too, from day one, "From the archives".
      ...(loose && mostlyImported() ? db.prepare(`select 'capture' as type, id, kind, ${LABEL} as title, body, null as who, captured_at as made, surfaced_at as visited, surfacing_weight as weight, 1 as archive
        from captures where imported_at is not null and kind not in ('quote', 'task') and private = 0 and status != 'discarded' and archived_at is null and not ${PICTURED}
        and length(coalesce(body, '')) > 40 and id not in (select capture_id from nuggets where capture_id is not null)`).all() : []),
      ...db.prepare(`select 'article' as type, id, kind, coalesce(nullif(nullif(trim(title), 'Untitled'), ''), label('', body)) as title, body, null as who, created_at as made, last_visited_at as visited, surfacing_weight as weight
        from nuggets where tier = 'article' and private = 0 and archived_at is null and superseded_by is null and binned_at is null and ${PICTURED}`).all()
    ] as Row[]
    // A Journal day at least a week old with something written on it.
    // A day liked in the Feed comes back sooner, a step for each like, as a note's heart does (a day page keeps no weight of its own).
    const days = db.prepare("select 'day' as type, day as id, 'day' as kind, day as title, body, null as who, day as made, null as visited, (select count(*) from feed_reacts r where r.key = 'day:' || day_pages.day and r.reaction = 'like') as weight from day_pages where day < ? and length(coalesce(body, '')) > 40")
      .all(dayKey(dayjs().subtract(7, 'day'))) as Row[]
    for (const day of days) day.weight = Math.min(4, 1.5 ** (day.weight ?? 0))
    // Pages only once asked for: a Feed of gems and notes reads best to start, and Reading has the pages.
    const pages = takes.pages
    return [...nuggets, ...quotes, ...pictured, ...days].filter((row) => (pages || row.type !== 'article') && !/(^|\s)#bit\b/i.test(`${row.title} ${row.body ?? ''}`))
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
      for (const key of JSON.parse(row.keys) as string[]) {
        note(key.slice(key.indexOf(':') + 1), dayjs(row.day).toISOString())
        count(key.slice(key.indexOf(':') + 1))
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
  const filingTags = (takes: Takes): Set<string> => {
    const kinds = new Map<string, Set<string>>()
    const all = new Set<string>()
    for (const row of pool(takes)) {
      all.add(row.kind)
      for (const tag of tagsOfRow(row)) kinds.set(tag, (kinds.get(tag) ?? new Set()).add(row.kind))
    }
    const out = new Set(FILING)
    if (all.size >= 3) for (const [tag, on] of kinds) if (on.size > all.size / 2) out.add(tag)
    return out
  }

  /** One note by its feed key, for a restack whose old note is not in the day's set. A Page restacked from Reading may have no picture, so it is read on its own. */
  const lookUp = (takes: Takes, key: string): Row | undefined => pool(takes).find((row) => `${row.type}:${row.id}` === key) ?? (key.startsWith('article:') ? (db.prepare(`select 'article' as type, id, kind, coalesce(nullif(nullif(trim(title), 'Untitled'), ''), label('', body)) as title, body, null as who, created_at as made, last_visited_at as visited, surfacing_weight as weight
    from nuggets where id = ? and tier = 'article' and private = 0 and archived_at is null and binned_at is null`).get(key.slice(8)) as Row | undefined) : undefined)

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
  const pairOf = (takes: Takes, rows: Row[], seed: number): string | null => {
    const notes: PairNote[] = rows.filter((row) => row.type !== 'day' && row.type !== 'article').map((row) => ({ key: `${row.type}:${row.id}`, id: row.id, title: row.title, text: textOf(row.body), tags: tagsOfRow(row).filter((tag) => tag !== 'bit' && tag !== LEARN_TAG), who: row.who, made: row.made, imported: !!row.archive }))
    // How rare a word is: across every note of the book you could be shown, kept or not.
    const book = [
      ...db.prepare("select title, body from nuggets where private = 0 and binned_at is null and tier not in ('card', 'deck')").all(),
      ...db.prepare(`select ${LABEL} as title, body from captures where private = 0 and status != 'discarded' and id not in (select capture_id from nuggets where capture_id is not null)`).all()
    ].map((one) => `${(one as { title: string }).title} ${textOf((one as { body: string | null }).body)}`)
    const found = findPair(notes, filingTags(takes), book, seed)
    return found ? `pair:${JSON.stringify({ a: found.a.key, b: found.b.key, why: found.why })}` : null
  }
  /** A pair's post, read now: both notes as they are, each with its tags; gone if either has gone. */
  const paired = (takes: Takes, key: string): FeedPost[] => {
    let saved: { a: string; b: string; why: NonNullable<FeedPost['pair']>['why'] }
    try { saved = JSON.parse(key.slice(5)) } catch { return [] }
    const rows = [saved.a, saved.b].map((one) => pool(takes).find((row) => `${row.type}:${row.id}` === one))
    if (rows.some((row) => !row)) return []
    const filing = filingTags(takes)
    const notes = (rows as Row[]).map((row) => ({ type: row.type, id: row.id, kind: row.kind, title: row.title, text: words(row), who: row.who?.trim() || null, tags: tagsOfRow(row).filter((tag) => !filing.has(tag.toLowerCase()) && tag !== 'bit' && tag !== LEARN_TAG).slice(0, 3) }))
    return [{ type: 'pair', id: `${rows[0]!.id}+${rows[1]!.id}`, kind: 'pair', title: '', text: '', who: null, made: [rows[0]!.made, rows[1]!.made].sort().at(-1)!, seen: null, gloss: null, clue: null, react: null, replies: 0, firstReply: null, seenTimes: 0, faded: 0, liked: 0, tags: [], restack: null, pair: { notes, why: saved.why } }]
  }

  const feed = ({ today, takes, kept, asks }: FeedAsk): FeedRead => {
    const rows = pool(takes)
    const pooled = rows.length
    const byKey = new Map(rows.map((row) => [`${row.type}:${row.id}`, row]))
    const { seen, times } = seenOf()
    const lastSeen = (row: Row): string | null => [row.visited, seen.get(row.id)].filter(Boolean).sort().at(-1) ?? null
    let keys = kept
    if (!keys) {
      // Each kind longest unseen first, then taken in turns so no one kind fills the day.
      // The hints' rhythm: time since you last saw it, times how often you want it ("Less of this" fades it).
      // One never seen comes before every one seen, however liked: a heart brings a note back sooner, never ahead of
      // ones not yet shown (in a new book, a liked quote seen yesterday outranked gems never shown at all, day after day).
      const NEVER = 10 * 365 * 86_400_000
      const due = (row: Row): number => { const seenAt = lastSeen(row); return seenAt ? (Date.now() - new Date(seenAt).getTime()) * (row.weight ?? 1) : NEVER + (Date.now() - new Date(row.made).getTime()) }
      // Seen in the last fortnight: it rests, whatever its hearts, and comes only once nothing else is left. A heart
      // brings a note back sooner after its rest, never the next day.
      const rested = dayjs().subtract(14, 'day').toISOString()
      const resting = (row: Row): number => ((lastSeen(row) ?? '') >= rested ? 1 : 0)
      const order = (list: Row[]): Row[] => list.sort((a, b) => resting(a) - resting(b) || due(b) - due(a))
      // A list kept in its order, but taken one per voice in turns, each voice at most `most` times.
      const spread = (list: Row[], voice: (row: Row) => string, most: number): Row[] => {
        const voices = new Map<string, Row[]>()
        for (const row of list) voices.set(voice(row), [...(voices.get(voice(row)) ?? []), row])
        const out: Row[] = []
        for (let turn = 0; turn < most; turn++) for (const rows of voices.values()) if (rows[turn]) out.push(rows[turn])
        return out
      }
      const archived = (row: Row): boolean => !!row.archive && row.type === 'capture' && row.kind !== 'quote'
      // A poll and a quiz card or two are part of the twenty, set among the notes rather than at the top: `asks`, picked on main.
      // A note asked as a quiz or a poll is not also shown as itself: once a day, never a quiz and a quote of one gem.
      const askedIds = new Set(asks.map((key) => key.slice(key.lastIndexOf(':') + 1)))
      for (const one of rows.filter((row) => askedIds.has(row.id))) rows.splice(rows.indexOf(one), 1)
      // Gems you restacked before today come first, once: "You restacked".
      const stacked = (db.prepare('select id from feed_restacks where made_day < ? and (shown_day is null or shown_day = ?) order by made_day').all(today, today) as { id: string }[])
        .map((one) => byKey.get(`nugget:${one.id}`)).filter((one): one is Row => !!one && !askedIds.has(one.id))
      for (const one of stacked) rows.splice(rows.indexOf(one), 1)
      const lanes = [
        order(rows.filter((row) => row.type === 'nugget' && row.kind !== 'quote')),
        // Quotes spread across who said them: one each in turn, and no more than two from one person a day. Spread
        // among the ones not seen this week first, then the rest: spread over all of them, each person's quote from
        // yesterday came back every day while there were few people to take turns.
        ...((): Row[][] => {
          const quotes = order(rows.filter((row) => row.kind === 'quote'))
          const week = dayjs().subtract(7, 'day').toISOString()
          const recent = (row: Row): boolean => (lastSeen(row) ?? '') >= week
          const voice = (row: Row): string => row.who?.trim().toLowerCase() || row.id
          const taken = new Map<string, number>()
          return [[...spread(quotes.filter((row) => !recent(row)), voice, 2), ...spread(quotes.filter(recent), voice, 2)]
            .filter((row) => taken.set(voice(row), (taken.get(voice(row)) ?? 0) + 1).get(voice(row))! <= 2)]
        })(),
        order(rows.filter((row) => row.type === 'question')),
        order(rows.filter((row) => row.type === 'day')),
        order(rows.filter((row) => (row.type === 'capture' || row.type === 'article') && row.kind !== 'quote' && !archived(row))),
        // From the archives: the imported notes never seen here first, then the oldest.
        rows.filter(archived).sort((a, b) => (lastSeen(a) ?? '').localeCompare(lastSeen(b) ?? '') || a.made.localeCompare(b.made))
      ]
      // Gems and quotes are the most of it: two each a turn, a question, a day, a picture and an archive one.
      const share = [2, 2, 1, 1, 1, 1]
      // One "Two subjects, one thread" a day at most, where an honest pair exists: its room kept among the day's twenty-odd.
      const pair = pairOf(takes, [...byKey.values()].filter((row) => !askedIds.has(row.id)), Number(today.replace(/\D/g, '')) || 0)
      const room = Math.max(0, SIZE - asks.length - stacked.length - (pair ? 1 : 0))
      const picked: Row[] = []
      while (picked.length < room && lanes.some((lane) => lane.length))
        lanes.forEach((lane, at) => picked.push(...lane.splice(0, share[at]).slice(0, room - picked.length)))
      const list = [...stacked, ...order(picked)].map((row) => `${row.type}:${row.id}`)
      asks.forEach((key, at) => list.splice(Math.min(list.length, 3 + at * 5), 0, key))
      if (pair) list.splice(Math.min(list.length, 8), 0, pair)
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
      const old = of ? (byKey.get(of) ?? lookUp(takes, of)) : undefined
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
        from: row.kind === 'quote' ? fromOf(row.body) : undefined,
        archive: !!row.archive,
        changedTo: (changedOf.get(row.id) as { id: string; at: string } | undefined) ?? null
      }
    }
    const posts = (JSON.parse(keys) as string[]).filter((key) => {
      if (key.startsWith('pair:')) return true
      const id = key.slice(key.lastIndexOf(':') + 1)
      return !shown.has(id) && !!shown.add(id)
    }).flatMap((key): FeedRead['posts'] => {
      // A poll or a quiz is made on main, in the place kept for it here.
      if (key.startsWith('poll:') || key.startsWith('quiz:')) return [{ asked: key }]
      if (key.startsWith('pair:')) return paired(takes, key)
      const row = byKey.get(key)
      return row ? [postOf(row, key)] : []
    })
    // Now and then, one note kept three months or more and never linked, set among the rest: opening it is the way to link it.
    const lone = unlinkedOne([...byKey.values()].filter((row) => !shown.has(row.id)), lastSeen)
    return { keys, picked: !kept, pooled, posts, lone: lone ? { ...postOf(lone, `${lone.type}:${lone.id}`), unlinked: Math.max(3, dayjs().diff(dayjs(lone.made), 'month')) } : null }
  }

  /** How near the Feed is to full: the notes it can show (not private, not a #bit, not a learn card), and of them the quotes and pictures. */
  const goal = (takes: Takes): { notes: number; quotes: number } => {
    const rows = pool(takes).filter((row) => !tagsOfRow(row).includes(LEARN_TAG))
    return { notes: rows.length, quotes: rows.filter((row) => row.kind === 'quote' || /\]\([^)]*\.(?:webp|png|jpe?g)\)|"type":"image"/i.test(row.body ?? '')).length }
  }

  return { pool, seenOf, words, tagsOfRow, linksOf, filingTags, lookUp, feed, goal }
}
