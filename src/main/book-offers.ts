import type { DatabaseSync } from 'node:sqlite'
import { readFileSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import { sortNamed } from './title-names'
import { tagsKept } from './property-tags'
import { tagsIn, withoutTags } from './tag-words'
import { everyday } from './name-match'
import { LABEL } from './book-words'
import { RootIndex, alreadyWrote, cluesFor, linksIn, peopleIn, tagsNear, whichFolder, type Lemmas, type RootNote } from './roots'

/**
 * What a note is quietly offered, from your own book, on this Mac (roots.ts):
 * another note it names (a link), one it nearly repeats, the folder it reads
 * like, the tags the notes most like it carry, and the people it names
 * (People). Also the notes for a question or an event. Each note's roots (and
 * its meaning, for a tie-break) are read by the Mac once and kept until it changes; the book's
 * index is made again only when something changed, never while typing.
 *
 * A read of the book and nothing else (no Electron in it): it runs on the
 * reading thread (reader.ts), where indexing the book and matching every
 * name against a long note never hold main; main runs the same code itself
 * only if that thread has stopped. What it needs from main it is handed:
 * `understand`, the Mac's reading of some words (understand.ts, which main
 * asks of its helper); `named`, which times a stretch under a name when it
 * does run on main (stalls.ts).
 */

type Answer = Record<string, unknown>
export type OffersNeeds = {
  /** Where the roots read so far are kept, beside the book. */
  keptFile: string
  understand: (op: string, body: Record<string, unknown>) => Promise<Answer>
  named: <T>(name: string, run: () => T) => T
}

type Row = { key: string; title: string; text: string; stamp: string; group: string | null; list: string | null; kind: string | null; fields: string | null }
type Kept = { stamp: string; lemmas: Lemmas; meaning: Float32Array | null }

export type NoteOffers = {
  links: { key: string; title: string; words: string }[]
  same: { key: string; title: string } | null
  folder: { id: string; name: string } | null
  /** People it names: `known` already one of your People (a link to their page), else one to add. */
  people: { name: string; known: boolean }[]
  /** Characters it names: `work` is the work they are in; `known` already one of your Characters, else one to add. */
  characters: { name: string; work: string; known: boolean }[]
  /** Tags the notes most like it carry and it does not: `notes` of the `of` nearest carry each. */
  tags: { tag: string; notes: number; of: number }[]
}
export type About = { key: string; title: string; words: string }

/** The tags that say a note is about a work: a book, a film, a play or a show. */
const WORK_TAGS = new Set(['book', 'books', 'novel', 'film', 'films', 'movie', 'movies', 'play', 'show', 'series', 'tv', 'anime', 'comic', 'manga', 'game'])
/** A note is about a work when it carries a work's tag (#book, #film) or is a work's own note (its kind). */
const aboutAWork = (tags: string[], kind: string | null | undefined): boolean => tags.some((tag) => WORK_TAGS.has(tag.toLowerCase())) || WORK_TAGS.has((kind ?? '').toLowerCase())

const vectorOf = (one: unknown): Float32Array | null => (typeof one === 'string' ? new Float32Array(Buffer.from(one, 'base64').buffer.slice(0)) : null)

const near = (a: Float32Array | null | undefined, b: Float32Array | null | undefined): number => {
  if (!a || !b || a.length !== b.length) return 0
  let dot = 0, x = 0, y = 0
  for (let i = 0; i < a.length; i++) (dot += a[i] * b[i]), (x += a[i] * a[i]), (y += b[i] * b[i])
  return dot / (Math.sqrt(x * y) || 1)
}

/**
 * `need`, in each ask, is main's count of the book's changes when it was asked (offers.ts): an index made at an
 * earlier count is out of date. `gone` says the asker has left the note: asked between the long stretches, so a
 * note left behind is not read to the end.
 */
export function bookOffers(db: DatabaseSync, { keptFile, understand, named }: OffersNeeds): {
  forNote: (need: number, key: string, text: string, linked: string[], gone?: () => boolean) => Promise<NoteOffers | null>
  about: (need: number, text: string, leave?: string) => Promise<About[]>
  /** The index made ahead, so the first offer never waits for the whole book to be read. */
  warm: (need: number) => Promise<void>
} {
  const kept = new Map<string, Kept>()

  /** The roots read so far, kept beside the book, so a launch never reads its notes again (only what changed). */
  let loaded = false
  function loadKept(): void {
    if (loaded) return
    loaded = true
    try {
      for (const [key, one] of Object.entries(JSON.parse(readFileSync(keptFile, 'utf8')) as Record<string, { stamp: string; lemmas: Lemmas }>))
        kept.set(key, { stamp: one.stamp, lemmas: one.lemmas, meaning: null })
    } catch {
      // None yet: read now.
    }
  }
  function saveKept(): void {
    const out: Record<string, { stamp: string; lemmas: Lemmas }> = {}
    for (const [key, one] of kept) out[key] = { stamp: one.stamp, lemmas: one.lemmas }
    void writeFile(keptFile, JSON.stringify(out)).catch(() => undefined)
  }
  /** The index as last made, and which change of the book it was read at (`as`); each note's tags, an alias as the tag it stands for. */
  let built: { at: number; index: RootIndex; rows: Row[]; as: number; tags: Map<string, string[]>; alias: Map<string, string> } | null = null
  let building: Promise<void> | null = null
  /** The latest change any ask has named: the next index is made as of it, once, for every ask waiting. */
  let wanted = 0

  /** The roots of some texts, read by the Mac (a few milliseconds each). */
  async function readAll(texts: string[]): Promise<{ lemmas: Lemmas }[]> {
    const read = await Promise.all(texts.map((text) => understand('read', { text: text.slice(0, 4000) })))
    return texts.map((_, i) => ({ lemmas: (read[i].roots as Lemmas | undefined) ?? {} }))
  }

  /** Meaning fingerprints, only ever for the few notes a tie-break compares (they are slow to make), kept. */
  async function meanings(texts: string[]): Promise<(Float32Array | null)[]> {
    if (!texts.length) return []
    const meant = await understand('embed', { texts: texts.map((text) => text.slice(0, 1000)) })
    return texts.map((_, i) => vectorOf(((meant.vectors as unknown[] | undefined) ?? [])[i]))
  }
  async function meaningFor(book: RootIndex, all: Row[], text: string, lemmas: Lemmas, leave?: string): Promise<(key: string) => number> {
    const top = book.rank(book.vector(text, lemmas), leave).slice(0, 8).map((one) => one.key)
    const missing = top.filter((key) => !kept.get(key)?.meaning)
    const rows = missing.map((key) => all.find((row) => row.key === key)!)
    const [own, ...made] = await meanings([text, ...rows.map((row) => `${row.title}\n${row.text}`)])
    rows.forEach((row, i) => { const one = kept.get(row.key); if (one) one.meaning = made[i] })
    return (key) => near(own, kept.get(key)?.meaning)
  }

  // A capture made into a gem or a page lives on as that: left out, or the gem was told it
  // "already wrote" its own first draft, and "Open it" opened the gem itself.
  function rows(): Row[] {
    return db.prepare(
      `select id as key, label(title, body, named) as title, words(id, body) as text, coalesce(edited_at, captured_at) as stamp, null as "group", null as list, kind, fields
         from captures where status not in ('discarded', 'promoted') and private = 0
       union all
       select tier || ':' || id, coalesce(nullif(nullif(trim(title), 'Untitled'), ''), label('', body)), words(id, body), coalesce(updated_at, created_at), group_id, tier, kind, fields
         from nuggets where tier in ('nugget', 'article', 'question') and private = 0 and binned_at is null and archived_at is null`
    ).all() as Row[]
  }

  async function index(need: number): Promise<NonNullable<typeof built>> {
    // Never answer from a book older than the one the asker sees. An ask that came while an index was being made
    // used to be given that one, begun before the last save: a note written a moment ago was missing from it, so a
    // name it holds was not offered, and nothing asked again until a key was typed. Now the ask waits for the index
    // being made and, when the book has changed since that one began, for one more (only changed notes are read).
    wanted = Math.max(wanted, need)
    while (!built || built.as < need) {
      building ??= make(wanted).finally(() => (building = null))
      await building
    }
    return built
  }

  /** The index made again from the book as it is now; only notes changed since they were last read are read. */
  async function make(as: number): Promise<void> {
    const all = named('offers: every note read', rows)
    loadKept()
    const fresh = all.filter((row) => kept.get(row.key)?.stamp !== row.stamp)
    // Roots only, a hundred notes a request: 5,000 notes are read once, in the background, then kept on disk.
    for (let at = 0; at < fresh.length; at += 100) {
      const batch = fresh.slice(at, at + 100)
      const said = await understand('roots', { texts: batch.map((row) => `${row.title}\n${row.text}`) })
      const read = (said.roots as Lemmas[] | undefined) ?? []
      batch.forEach((row, i) => kept.set(row.key, { stamp: row.stamp, meaning: kept.get(row.key)?.meaning ?? null, lemmas: read[i] ?? {} }))
    }
    if (fresh.length) saveKept()
    const notes: RootNote[] = all.map((row) => ({ key: row.key, title: row.title ?? '', text: row.text ?? '', lemmas: kept.get(row.key)?.lemmas }))
    // Each note's tags as its words carry them, an alias counted as the tag it stands for (book-tags.ts). A #bit
    // note is private, so neither it nor its tags are offered anywhere; private notes are not among the rows at all.
    const alias = new Map((db.prepare('select tag, alias_of from tag_meta where alias_of is not null').all() as { tag: string; alias_of: string }[]).map((row) => [row.tag, row.alias_of]))
    const tags = new Map<string, string[]>()
    named('offers: every note’s tags', () => {
      for (const row of all) {
        const own = [...new Set([...tagsIn(`${row.title ?? ''} ${row.text ?? ''}`), ...tagsKept(row.fields)].map((tag) => alias.get(tag) ?? tag))]
        if (own.length && !own.includes('bit')) tags.set(row.key, own)
      }
    })
    // Named, as each long piece of work below is: on main it runs after a wait, where the handler's own time is no longer counted (stalls.ts).
    built = { at: Date.now(), index: named('offers: the book indexed again', () => new RootIndex(notes)), rows: all, as, tags, alias }
  }

  /** The work a note is about, when it is one (tagged #book or #film, or a book's own note): its title, without its tags. */
  function workOfNote(key: string, text: string): { work: string; author: string } | null {
    const row = (key.includes(':')
      ? db.prepare("select coalesce(nullif(nullif(trim(title), 'Untitled'), ''), label('', body)) as title, kind, attribution from nuggets where id = ?").get(key.slice(key.indexOf(':') + 1))
      : db.prepare(`select ${LABEL} as title, kind, attribution from captures where id = ?`).get(key)) as { title: string | null; kind: string | null; attribution: string | null } | undefined
    const about = aboutAWork(tagsIn(text), row?.kind)
    const work = withoutTags(row?.title || text.split('\n')[0] || '').replace(/\s+/g, ' ').trim()
    return about && work ? { work, author: row?.attribution ?? '' } : null
  }

  /** The Mac's own word list, for telling a name from a word (name-match.ts). */
  const common = everyday

  /**
   * The titles of works in the book, longer than a name: the titles of notes about a work (tagged #book or #film,
   * or a work's own note), and where quotes and gems are from. Any other note's title is only its first line: taken
   * as a work, a one-line note "Ada Lovelace saw that the engine could compose music" made her a character in it.
   */
  const works = (all: Row[], tags: Map<string, string[]>): string[] => {
    const from = db.prepare("select distinct medium as title from captures where medium is not null and medium != '' union select distinct medium from nuggets where medium is not null and medium != ''").all() as { title: string }[]
    const notes = all.filter((row) => aboutAWork(tags.get(row.key) ?? [], row.kind)).map((row) => row.title ?? '')
    return [...notes, ...from.map((one) => one.title)].filter((title) => title.split(/\s+/).length >= 3)
  }

  /** What a note, as it now reads, is offered. `linked`: the notes it already links to. */
  async function forNote(need: number, key: string, text: string, linked: string[], gone: () => boolean = () => false): Promise<NoteOffers | null> {
    const { index: book, rows: all, tags, alias } = await index(need)
    if (gone()) return null
    const [read] = await readAll([text])
    const title = (key: string): string => all.find((row) => row.key === key)?.title || 'Untitled'
    const meant = await meaningFor(book, all, text, read.lemmas, key)
    if (gone()) return null
    const same = named('offers: nearly the same note', () => alreadyWrote(book, text, read.lemmas, key, meant))
    // Its folder: only a loose note in a list that has folders.
    const own = all.find((row) => row.key === key)
    let folder: NoteOffers['folder'] = null
    if (own?.list && !own.group) {
      const groups = db.prepare('select id, name from note_groups where list = ? and folder = 1').all(own.list) as { id: string; name: string }[]
      const members = new Map(groups.map((group) => [group.id, all.filter((row) => row.group === group.id).map((row) => row.key)]))
      const hit = whichFolder(book, key, members)
      if (hit) folder = { id: hit.folder, name: groups.find((group) => group.id === hit.folder)!.name }
    }
    const names = await understand('read', { text: text.slice(0, 4000) })
    if (gone()) return null
    // Characters are kept on People pages with the work they are in (sources.ts): never offered as people.
    const cast = new Map((db.prepare("select name, work from source_pages where field = 'attribution' and work != ''").all() as { name: string; work: string }[]).map((one) => [one.name.toLowerCase(), one]))
    const people = new Set((db.prepare("select distinct attribution as name from captures where attribution is not null and attribution != '' union select distinct attribution from nuggets where attribution is not null and attribution != ''").all() as { name: string }[])
      .map((one) => one.name.toLowerCase()).filter((name) => !cast.has(name)))
    const titles = works(all, tags)
    const about = workOfNote(key, text)
    const found = peopleIn((names.names as { text: string; kind: string }[] | undefined) ?? [], common, (name) => people.has(name.toLowerCase()) || cast.has(name.toLowerCase()))
    const { people: persons, characters } = sortNamed(text, found, { cast, people, titles, about })
    return {
      // A few more than are shown: the page drops any whose words stand only in code or a link (note-offers.tsx).
      links: named('offers: names found in the note', () => linksIn(book, text, read.lemmas, key, new Set(linked), everyday)).slice(0, 8),
      same: same ? { key: same.key, title: title(same.key) } : null,
      folder,
      people: persons,
      characters,
      // The tags it carries as the book counts them, so an alias it has is the tag it stands for.
      tags: named('offers: tags of the nearest notes', () => tagsNear(book, text, read.lemmas, key, (one) => tags.get(one) ?? [], new Set(tagsIn(text).map((tag) => alias.get(tag) ?? tag)), meant))
    }
  }

  /** The notes on what a question or an event is about, best first. */
  async function about(need: number, text: string, leave?: string): Promise<About[]> {
    const { index: book, rows: all } = await index(need)
    const [read] = await readAll([text])
    return cluesFor(book, text, read.lemmas, leave, await meaningFor(book, all, text, read.lemmas, leave)).map((one) => {
      const row = all.find((each) => each.key === one.key)
      return { key: one.key, title: row?.title || 'Untitled', words: (row?.text ?? '').replace(/\s+/g, ' ').trim().slice(0, 280) }
    })
  }

  return { forNote, about, warm: async (need) => void (await index(need)) }
}
