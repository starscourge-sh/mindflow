import type { DatabaseSync } from 'node:sqlite'
import { forgiven, wordsOf } from './near'
import { passes, propertyFilters } from './property-words'
import { RETIRED } from './kinds'
import { NOTE_KEY } from './name'
import { mdWords } from './md-words'
import { LABEL, LIST, like } from './book-words'
import { IN_PICTURE, pictureHolding, type Pictures } from './picture-lines'
import { articlesToFind, mediaToFind, pdfsToFind, worksToFind } from './find-files'

/**
 * Search, as a read of the book and nothing else (no Electron in it): what
 * ⌘K finds, what `@` offers by name, and what a link written by name points
 * at. It runs on the reading thread (reader.ts), on that thread's own
 * connection, so a search through every note's words never holds main; main
 * runs the same code itself only if that thread has stopped.
 *
 * `stamp` is main's count of the changes search can see (captures.ts
 * `bookStamp`): the list of everything is read again only when it moved, so a
 * note being opened, or a setting kept, reads nothing again.
 */

/** Every property name in use on a note or page: what `name:value` in a search can filter on. */
const propertyNames = (db: DatabaseSync): string[] =>
  (db.prepare(`select distinct key from (select j.key from captures, json_each(captures.fields) j where json_valid(captures.fields)
    union select j.key from nuggets, json_each(nuggets.fields) j where json_valid(nuggets.fields)) where key not in ('_kept', '_meaningRead')`).all() as { key: string }[]).map((row) => row.key)
/** A note's properties, read for a filter. */
const fieldsOf = (db: DatabaseSync, type: string, id: string): Record<string, unknown> => {
  try {
    return JSON.parse((db.prepare(`select fields from ${type === 'capture' ? 'captures' : 'nuggets'} where id = ?`).get(id) as { fields: string | null } | undefined)?.fields ?? '{}') ?? {}
  } catch {
    return {}
  }
}

type Found = { type: string; id: string; number: number | null; kind: string; status: string; source: string; attribution: string | null; label: string; capturedAt: string }
type Searchable = Found & { text: string; raw?: string; there?: string[] }
/** `near`: for a row found by close spellings only, the words in it that stood in for those typed (near.ts). */
export type FoundRow = Found & { line?: string; picture?: string; match?: 'name' | 'words' | 'picture' | 'near'; near?: string[] }
/** What a link written by name, or `@`, is offered: notes by name, gems and pages by name, and the PDFs and kept articles of that name. */
export type Named = { captures: Record<string, unknown>[]; items: Record<string, unknown>[]; files: FoundRow[] }

export function bookFinder(db: DatabaseSync, pictures: Pictures): {
  find: (stamp: number, query: unknown, only?: unknown) => FoundRow[]
  search: (query: unknown) => Record<string, unknown>[]
  items: (query: unknown) => Record<string, unknown>[]
  named: (stamp: number, query: unknown, exact?: unknown) => Named
  /** New words were read in a picture: the list is read again. */
  forget: () => void
  /** How many times the whole list was read: a probe checks a note being opened adds none. */
  reads: () => number
} {
  // A journal day: its page and its two answers (journal.ts), found as one, by its day.
  const DAYS = 'select day from day_pages union select day from journal'
  const DAY_WORDS = "(coalesce(words('day:' || d.day, (select body from day_pages p where p.day = d.day)), '') || ' ' || coalesce((select group_concat(answer, ' ') from journal j where j.day = d.day), ''))"
  // An event's words: its name, place, people and notes. The people are kept as a list (["Sam","Ada"]): read out
  // as names after the place ("Cafe Riva with Sam, Ada"), never the list as it is stored, which showed in ⌘K's line.
  const EVENT_PEOPLE = "(select group_concat(value, ', ') from json_each(case when json_valid(people) then people else '[]' end))"
  const EVENT_WORDS = `(title || ' ' || coalesce(place, '') || coalesce(' with ' || ${EVENT_PEOPLE}, '') || ' ' || coalesce(notes, ''))`
  // A gem's, Page's or question's words are its body; a goal's page shows no
  // body, so a goal is found by the "Why it matters" its page does show.
  const SHOWN_WORDS = "(case when tier = 'goal' then coalesce(why, '') else words(id, body) end)"
  // Everything search can find, newest first, each with its words in lower case: read once and
  // kept until the book changes, so a letter typed is a pass over memory, not over the book.
  let everything: { at: number; rows: Searchable[] } | null = null
  let reads = 0
  const searchable = (stamp: number): Searchable[] => {
    if (everything?.at === stamp) return everything.rows
    reads++
    const rows = db.prepare(
      `select * from (
         select 'capture' as type, id, number, kind, status, source, attribution, ${LABEL} as label, captured_at as capturedAt,
           (${LABEL} || ' ' || words(id, body) || char(31) || coalesce(medium, '') || ' ' || coalesce(attribution, '') || ' ' || coalesce(fields, '') || ' ' || coalesce(aliases, '')) as text
           from captures where status not in ('discarded', 'promoted')
         union all
         select tier, id, null, case when tier = 'goal' then (case when goal_at is null then 'someday' when closed_how = 'on ice' then 'iced' else 'dated' end) else kind end, 'open', '', attribution, coalesce(nullif(nullif(trim(title), 'Untitled'), ''), label('', body)), created_at,
           (coalesce(title, '') || ' ' || ${SHOWN_WORDS} || char(31) || coalesce(attribution, '') || ' ' || coalesce(fields, '') || ' ' || coalesce(aliases, '')) from nuggets where tier not in ('card', 'deck') and binned_at is null
         union all
         select 'task', id, number, 'todo', status, '', null, title, created_at, (title || ' ' || coalesce(words('task:' || id, notes), '')) from tasks where status != 'dropped'
         union all
         select 'event', id, null, 'event', 'open', '', null, title, created_at, ${EVENT_WORDS} from events where binned_at is null and series_id is null
         union all
         select 'day', day, null, 'day', 'open', '', null, day, day || 'T12:00:00.000Z', ${DAY_WORDS} from (${DAYS}) d
       ) order by capturedAt desc`
    ).all() as unknown as Searchable[]
    // A note whose words did not change keeps what was made of them last time (its lower case, its words one by
    // one for forgiving a slip): after a save only the saved note is read through again, not the whole book.
    const before = new Map((everything?.rows ?? []).map((one) => [`${one.type}:${one.id}`, one]))
    for (const one of rows) {
      one.raw = String(one.text ?? '')
      const was = before.get(`${one.type}:${one.id}`)
      if (was && was.raw === one.raw) (one.text = was.text), (one.there = was.there)
      else one.text = one.raw.toLowerCase()
    }
    // The PDFs kept in notes, by their titles, and files added to Media, among the rest by when their note was made.
    const pdfs = [...pdfsToFind(db), ...articlesToFind(db), ...mediaToFind(db, pictures.wordsOf), ...worksToFind(db)]
    if (pdfs.length) rows.push(...pdfs), rows.sort((a, b) => (a.capturedAt < b.capturedAt ? 1 : a.capturedAt > b.capturedAt ? -1 : 0))
    everything = { at: stamp, rows }
    return rows
  }

  // Search: every word you type must appear, in any order, in the name or the
  // words; `kind:quote` narrows to one kind. Captures, nuggets and tasks alike,
  // newest first, each saying what it is. Names only: the preview asks for its
  // one note (captures:peek). Nothing typed gives the most recent.
  // `only`: nothing but these types is looked through (a link finding the PDF or article of its name asks for
  // those two, and reads a few dozen names instead of every note's words).
  const find = (stamp: number, query: unknown, only?: unknown): FoundRow[] => {
    const types = Array.isArray(only) && only.length ? new Set(only.map(String)) : null
    const said = String(query ?? '').toLowerCase().split(/\s+/).filter(Boolean)
    // `author:le guin`: a property filter (property-words.ts), its value running to the next filter.
    const { filters, rest: words } = propertyFilters(said, said.some((word) => word.includes(':')) ? propertyNames(db) : [])
    // The kinds that went: kind:excerpt is a quote, kind:bit and kind:book their tags.
    const asked = words.find((word) => word.startsWith('kind:'))?.slice(5)
    const retired = asked ? RETIRED[asked] : undefined
    const kind = retired ? (retired.tag ? undefined : retired.kind) : asked
    const terms = [...words.filter((word) => !word.startsWith('kind:')), ...(retired?.tag ? [`#${retired.tag}`] : []), ...filters.map((one) => one.value).filter(Boolean)].map((word) => word.toLowerCase())
    // A note saved as a gem shows once, as the gem, when the gem is found too.
    const fromNote = db.prepare('select capture_id from nuggets where id = ? and capture_id is not null')
    const once = <T extends { type: string; id: string }>(rows: T[]): T[] => {
      const gems = new Set(rows.filter((one) => one.type === 'nugget').map((one) => (fromNote.get(one.id) as { capture_id: string } | undefined)?.capture_id))
      return rows.filter((one) => one.type !== 'capture' || !gems.has(one.id))
    }
    const rows = searchable(stamp).filter((one) => (!kind || one.kind === kind) && (!types || types.has(one.type)))
    const take = (keep: (one: Searchable) => boolean, n: number): Searchable[] => {
      const out: Searchable[] = []
      for (const one of rows) if (out.length < n && keep(one)) out.push(one)
      return out
    }
    // The line the words were found on, as it reads, with a little either side: so a row says why it
    // came up. None when the name alone holds them, as the name already shows it.
    const lineOf = (one: Searchable, terms: string[]): string | undefined => {
      const raw = one.raw ?? ''
      const name = (one.label ?? '').trim()
      // The words only, never the who, where and properties after them (char 31 marks where they start), nor the
      // name at their head. Looked through where they lie: a long note's words (a million characters) were copied
      // three times and cut line by line for every row a search showed.
      const mark = raw.indexOf('\u001f')
      const end = mark < 0 ? raw.length : mark
      const begin = raw.startsWith(name) ? Math.min(name.length, end) : 0
      const lower = one.text
      // Where each word looked for next stands in the words, at or after a place (-1: nowhere from there on).
      const next = terms.map(() => -2)
      const stands = (which: number, from: number): number => {
        if (next[which] === -1 || next[which] >= from) return next[which]
        const at = lower.indexOf(terms[which], from)
        return (next[which] = at >= 0 && at + terms[which].length <= end ? at : -1)
      }
      if (!terms.some((_, which) => stands(which, begin) >= 0)) return undefined
      // The line holding the most of the words looked for (the earliest of those), not just the first "the":
      // a meeting's line or a long note's sentence is found where it is really said.
      let start = begin, best = -1
      for (let from = begin; from <= end;) {
        const feed = lower.indexOf('\n', from)
        const to = feed < 0 || feed > end ? end : feed
        let score = 0
        for (let which = 0; which < terms.length; which++) {
          const at = stands(which, from)
          if (at >= 0 && at + terms[which].length <= to) score++
        }
        if (score > best) (best = score, (start = from))
        // A line holding them all is the earliest that can: no later line holds more.
        if (score === terms.length || to >= end) break
        from = to + 1
      }
      const at = Math.min(...terms.map((term) => lower.indexOf(term, start)).filter((spot) => spot >= 0))
      const stop = lower.indexOf('\n', at)
      const said = raw.slice(start, stop < 0 || stop > end ? end : stop)
      // Read as words, as every line that shows a note's text is: no "- [ ]", no link's address, no "**".
      const line = mdWords(said.replace(IN_PICTURE, '')).trim()
      if (!line || line === name) return undefined
      // The word found again in the words shown, so the cut keeps it in sight; one only in a link's address shows the line's start.
      const lowLine = line.toLowerCase()
      const shownHits = terms.map((term) => lowLine.indexOf(term)).filter((at) => at >= 0)
      const from = shownHits.length ? Math.min(...shownHits) : 0
      // Up to 40 characters before the word, cut at a space, so the word is always in sight.
      const cut = from > 40 ? line.indexOf(' ', from - 40) + 1 || from - 40 : 0
      const shownLine = line.slice(cut, cut + 160).trim()
      return `${said.startsWith(IN_PICTURE) ? IN_PICTURE : ''}${cut > 0 ? '…' : ''}${shownLine}${cut + 160 < line.length ? '…' : ''}`
    }
    // A line read in a picture says so, and brings the picture to show beside it.
    // `near`: the words a close spelling found, the line they are on shown in place of the words typed.
    const shown = ({ text: _, there: __, raw: ___, ...one }: Searchable, near = terms): Found & { line?: string; picture?: string } => {
      const line = lineOf({ text: _, raw: ___, ...one }, near)
      if (!line?.startsWith(IN_PICTURE)) return { ...one, line }
      return { ...one, line: line.slice(1), picture: pictureHolding(pictures.known(), line.slice(1)) }
    }
    // Newest first within three tiers: the words in its name, then in its own words, then only in a
    // picture's. A note titled with the words used to sit under newer notes that had them in a screenshot,
    // and past the first 60 by date it was not shown at all.
    const all = take((one) => terms.every((term) => one.text.includes(term)), 600)
    const named = (one: Searchable): boolean => terms.every((term) => (one.label ?? '').toLowerCase().includes(term))
    const titled = all.filter(named)
    const rest = all.filter((one) => !named(one)).slice(0, 120).map((one) => shown(one))
    const found = once([
      ...titled.slice(0, 60).map((one) => shown(one)).map((one) => ({ ...one, match: 'name' as const })),
      ...rest.filter((one) => !one.picture).map((one) => ({ ...one, match: 'words' as const })),
      ...rest.filter((one) => one.picture).map((one) => ({ ...one, match: 'picture' as const }))
    ]).slice(0, 60)
    if (filters.length) return found.filter((one) => one.type !== 'task' && one.type !== 'event' && one.type !== 'day' && passes(fieldsOf(db, one.type, one.id), filters))
    // Nothing as typed: spelling forgiven (near.ts), a word a slip of the keys away standing in. Only then, as ⌘K's
    // own line says ("Nothing has … as you typed it"): with one real match, 52 notes holding "fault" and "fast" stood
    // under "faust" (17 Nov 2026). The fewest slips first, then the newest, never the longest notes; each row names
    // the words that stood in. Read over the newest 3000 only, so a slip in a big book never stalls the typing.
    const plain = words.filter((word) => !word.startsWith('kind:'))
    if (found.length || !plain.some((word) => word.length >= 4)) return found
    const close = rows.slice(0, 3000).flatMap((one, at) => {
      const by = forgiven(plain, one.text, (one.there ??= wordsOf(one.text)))
      return by ? [{ one, at, ...by }] : []
    })
    close.sort((a, b) => a.slips - b.slips || a.at - b.at)
    return once(close.slice(0, 60).map(({ one, near }) => ({ ...shown(one, [...near, ...plain.filter((word) => one.text.includes(word))]), match: 'near' as const, near })))
  }

  // What `@` offers: a title containing the text, or a handle starting with it,
  // so `@login`, `@h-3` and the old `@v-3` and `@mf-3` all find things. Newest first, a handful at most.
  const search = (query: unknown): Record<string, unknown>[] =>
    db
      .prepare(
        `select ${LIST} from captures
         where ${LABEL} like ? escape '\\' or ('${NOTE_KEY}-' || number) like ? escape '\\' or ('V-' || number) like ? escape '\\' or ('MF-' || number) like ? escape '\\' or coalesce(aliases, '') like ? escape '\\'
         order by captured_at desc limit 8`
      )
      .all(`%${like(String(query))}%`, `${like(String(query))}%`, `${like(String(query))}%`, `${like(String(query))}%`, `%${like(String(query))}%`) as Record<string, unknown>[]

  // What @ offers besides captures: nuggets and articles by name.
  const items = (query: unknown): Record<string, unknown>[] =>
    db.prepare("select id, tier, coalesce(nullif(nullif(trim(title), 'Untitled'), ''), label('', body)) as name, coalesce(nullif(nullif(trim(title), 'Untitled'), ''), label('', body)) as title, updated_at as updatedAt, goal_at as goalAt, closed_how as closedHow from nuggets where tier not in ('card', 'deck') and (name like ? escape '\\' or coalesce(aliases, '') like ? escape '\\') and superseded_by is null order by updated_at desc limit 6")
      .all(`%${like(String(query))}%`, `%${like(String(query))}%`) as Record<string, unknown>[]

  // A link written by name, or `@` and some letters, asked the three above one after the other, each a wait on
  // main for a note of a hundred links: one ask now. Files only once something is typed; for a link resolved as
  // a note opens (`exact`), only the PDFs' and articles' names are looked through, never every note's words.
  const named = (stamp: number, query: unknown, exact?: unknown): Named => ({
    captures: search(query),
    items: items(query),
    files: String(query ?? '').trim() ? find(stamp, query, exact ? ['pdf', 'web'] : undefined).filter((one) => one.type === 'pdf' || one.type === 'web') : []
  })

  return { find, search, items, named, forget: () => void (everything = null), reads: () => reads }
}
