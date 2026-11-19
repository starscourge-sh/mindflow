import { ipcMain } from 'electron'

import { randomUUID } from 'crypto'

import { LABEL, atomically, changed, database } from './captures'
import { renamePerson } from './link-rename'
import { personKey } from './names'
import { voiceOf, type Voice } from './voice'
import { tagsIn, withoutTags } from './tag-words'
import { plural } from './dates'

/**
 * Sources and people as pages. A who (attribution) or a where (medium) stays
 * plain text on each note; every note with the same words there, give or take
 * capitals and accents, is one page. A page can be made before anything is
 * from it, and keeps your own thoughts about the source apart from its words.
 */

export type SourceField = 'attribution' | 'medium'
export type SourceItem = {
  type: string; id: string; kind: string; label: string
  attribution: string | null; medium: string | null
  location: string | null; status: string | null; rating: number | null
  at: string; voice: Voice
}
/** `last` is the newest note from them, `first` the oldest (or when the page was made, with none). */
export type SourceSummary = { field: SourceField; name: string; count: number; quotes: number; first: string; last: string; /** A character's work: they show among Characters, never among People. */ work?: string }
/**
 * The one plain line under a person's name: what they did, and when they lived.
 * On a source (a book, a show) `what` is what kind it is and `born` its year.
 * `via` is where it was found: a podcast, a person, a site. Each may be empty.
 */
export type SourceFacts = { what: string; born: string; died: string; via: string }
/** A page named by its field and name: what a "via" links to, and what "Found through it" lists. */
export type SourceRef = { field: SourceField; name: string }
/**
 * A character: someone who lives in a work, not in the world ("Paul Atreides,
 * in Dune"). Kept on their People page (field 'attribution'), so every note
 * said by them and every old @mention still finds them. `work` is what they
 * are in, `played` who played or voiced them, if anyone; born and died do not
 * apply. `workNote` is the note titled with the work, if one is.
 */
export type Character = { work: string; played: string; workNote: { type: string; id: string } | null; /** Read from the name, never saved: "Gandalf, in J.R.R. Tolkien" kept as a person, the part after ", in " a work (or an author) the book knows. */ from?: 'work' | 'author'; /** The name before ", in ", when `from` is set. */ called?: string }

/** "Gandalf, in J.R.R. Tolkien": the name and what it says they are in; null for any other name. */
export const inWork = (name: string): { called: string; work: string } | null => {
  const hit = /^(.+?),\s+in\s+(.+)$/.exec(name.trim())
  return hit ? { called: hit[1].trim(), work: hit[2].trim() } : null
}
export type SourcePage = { field: SourceField; name: string; thoughts: string; items: SourceItem[]; viaPage: SourceRef | null; found: SourceRef[]
  /** A line or two about them: Wikipedia's (with `bioUrl`, its credit) or your own (no url). `bioAt` is set once filled or written, so it is not asked again. */
  bio: string; bioUrl: string; bioAt: string
  /** What connects to them: the tags their notes carry, and the other side's pages (a person's sources, a source's people), most first. */
  tags: { tag: string; n: number }[]; links: SourceRef[]
  /** Each source's year, by its key, for the line under a quote. */
  years: Record<string, string>
  /** Set when they are a character in a work, not a real person. */
  character: Character | null } & SourceFacts
/** The small card in a note's margin: the source it cites, who wrote it, and the rest of its line. */
export type SourceCard = { field: SourceField; name: string; author: string; what: string; born: string; died: string; via: string; viaPage: SourceRef | null }
/** Beside a page being written: the people it names (their own words, newest first) and word gems sharing its tags. */
export type Margin = {
  people: (SourceFacts & { name: string; thoughts: string; quotes: { type: string; id: string; kind: string; label: string; medium: string | null }[] })[]
  words: { id: string; label: string }[]
}
/** Others in the book who share a tag or a source with this one, closest first. */
export type SourceNear = { name: string; shared: number }
export type SourceGraph = { nodes: { type: string; id: string; title: string; private?: boolean; kind: string; links: number }[]; edges: [string, string, number?][]; alone: number }

/** A rename done (how many notes it changed, and its Undo), or the question to ask first: merge into the one with that name? */
export type RenameResult = { count: number; token?: string; name?: string; merge?: { into: string; said: string } }
type Cell = string | number | null
type RenamePut = { table: string; id: string; col: string; before: Cell; after: Cell }
const renamed = new Map<string, { field: SourceField; keys: string[]; puts: RenamePut[]; pages: Record<string, Cell>[]; people: Record<string, Cell>[] }>()

const FIELDS: SourceField[] = ['attribution', 'medium']
const isField = (field: unknown): field is SourceField => field === 'attribution' || field === 'medium'

export function registerSources(): void {
  const db = database()
  db.exec('create table if not exists source_pages (field text not null, key text not null, name text not null, thoughts text not null default \'\', updated_at text not null, primary key (field, key))')
  const had = new Set((db.prepare('pragma table_info(source_pages)').all() as { name: string }[]).map((one) => one.name))
  for (const column of ['what', 'born', 'died', 'via', 'bio', 'bio_url', 'bio_at', 'bio_redirects', 'work', 'played']) if (!had.has(column)) db.exec(`alter table source_pages add column ${column} text not null default ''`)
  // Lines turned away before a page Wikipedia redirected to counted as theirs ("Napoleon Bonaparte" to "Napoleon") are asked for once more.
  if (!had.has('bio_redirects')) db.exec("update source_pages set bio_at = '' where bio = ''")

  /** Every note that has a who or a where, with what lists need to show it. */
  const everything = (): (SourceItem & { private: number })[] => {
    const rows = [
      ...db.prepare(`select 'capture' as type, id, kind, ${LABEL} as label, attribution, medium, fields, private, captured_at as at from captures
        where status != 'discarded' and kind != 'task' and id not in (select capture_id from nuggets where capture_id is not null) and (coalesce(trim(attribution), '') != '' or coalesce(trim(medium), '') != '')`).all(),
      ...db.prepare(`select case when tier = 'deck' then 'nugget' else tier end as type, id, kind, coalesce(nullif(nullif(trim(title), 'Untitled'), ''), label('', body)) as label, attribution, medium, fields, private, created_at as at, tier = 'deck' as deck from nuggets
        where tier != 'card' and binned_at is null and (coalesce(trim(attribution), '') != '' or coalesce(trim(medium), '') != '')`).all()
    ] as { type: string; id: string; kind: string; label: string; attribution: string | null; medium: string | null; fields: string | null; private: number; at: string; deck?: number }[]
    return rows.map(({ fields, ...row }) => {
      let kept: Record<string, unknown> = {}
      try {
        kept = fields ? JSON.parse(fields) : {}
      } catch {
        // Unreadable fields are no fields.
      }
      const location = typeof kept.location === 'string' ? kept.location : null
      const rating = Number(kept.rating) || null
      const status = typeof kept.status === 'string' ? kept.status : null
      return { ...row, location, rating, status, voice: voiceOf({ ...row, location }) }
    })
  }

  /** The spelling used most for each name: "marcus aurelius" once and "Marcus Aurelius" three times is the latter. */
  const spelt = (names: string[]): string => {
    const counts = new Map<string, number>()
    for (const one of names) counts.set(one.trim(), (counts.get(one.trim()) ?? 0) + 1)
    // On a tie, the spelling with more capitals: a name is usually written with them.
    const caps = (word: string): number => (word.match(/\p{Lu}/gu) ?? []).length
    return [...counts].sort((a, b) => b[1] - a[1] || caps(b[0]) - caps(a[0]))[0][0]
  }

  const pages = (): ({ field: SourceField; key: string; name: string; thoughts: string; bio: string; bioUrl: string; bioAt: string; updated_at: string; work: string; played: string } & SourceFacts)[] =>
    db.prepare('select field, key, name, thoughts, what, born, died, via, bio, bio_url as bioUrl, bio_at as bioAt, updated_at, work, played from source_pages').all() as never

  /** The note titled with a work's name ("Dune #book"), if there is one: a character's page heads with it. */
  const noteTitled = (work: string): { type: string; id: string } | null => {
    const key = personKey(work)
    if (!key) return null
    const rows = [
      ...db.prepare(`select 'capture' as type, id, ${LABEL} as title from captures where status not in ('discarded', 'promoted')`).all(),
      ...db.prepare("select tier as type, id, coalesce(nullif(nullif(trim(title), 'Untitled'), ''), label('', body)) as title from nuggets where tier in ('nugget', 'article') and binned_at is null").all()
    ] as { type: string; id: string; title: string | null }[]
    const hit = rows.find((one) => personKey(withoutTags(one.title ?? '')) === key)
    return hit ? { type: hit.type, id: hit.id } : null
  }
  /**
   * A character's work: the one set on their page, or else, for a name like "Gandalf, in J.R.R. Tolkien" kept as a
   * person, the part after ", in " when the book knows it as a work (a source or a note of that title) or an author.
   */
  const characterOf = (page: { work: string; played: string } | undefined, name = '', items?: SourceItem[], all?: ReturnType<typeof pages>): Character | null => {
    if (page?.work) return { work: page.work, played: page.played, workNote: noteTitled(page.work) }
    const said = inWork(name)
    if (!said) return null
    const key = personKey(said.work)
    const list = items ?? everything()
    const known = all ?? pages()
    const workNote = noteTitled(said.work)
    if (workNote || list.some((one) => personKey(one.medium ?? '') === key) || known.some((one) => one.field === 'medium' && one.key === key))
      return { work: said.work, played: '', workNote, from: 'work', called: said.called }
    if (list.some((one) => personKey(one.attribution ?? '') === key) || known.some((one) => one.field === 'attribution' && one.key === key && !one.work))
      return { work: said.work, played: '', workNote: null, from: 'author', called: said.called }
    return null
  }

  /**
   * The page a "via" names, when one goes by that name: a source first, then a
   * person, whether it has a page of its own or only notes from it.
   */
  const viaPageOf = (via: string, items: (SourceItem & { private: number })[], all: ReturnType<typeof pages>): SourceRef | null => {
    const key = personKey(via)
    if (!key) return null
    for (const field of ['medium', 'attribution'] as const) {
      const page = all.find((one) => one.field === field && one.key === key)
      if (page) return { field, name: page.name }
      const mine = items.filter((one) => personKey(one[field] ?? '') === key)
      if (mine.length) return { field, name: spelt(mine.map((one) => one[field]!)) }
    }
    return null
  }

  ipcMain.handle('haligtree:sources', (): SourceSummary[] => {
    const items = everything()
    const all = pages()
    const out: SourceSummary[] = []
    for (const field of FIELDS) {
      const groups = new Map<string, SourceItem[]>()
      for (const item of items) {
        const value = item[field]?.trim()
        if (!value) continue
        const key = personKey(value)
        groups.set(key, [...(groups.get(key) ?? []), item])
      }
      for (const [key, list] of groups) {
        const times = list.map((one) => one.at).sort()
        const name = spelt(list.map((one) => one[field]!))
        const work = all.find((one) => one.field === field && one.key === key)?.work || (field === 'attribution' && inWork(name) ? characterOf(undefined, name, items, all)?.work : undefined) || undefined
        out.push({ field, name, count: list.length, quotes: list.filter((one) => one.voice === 'theirs').length, first: times[0], last: times.at(-1)!, work })
      }
      for (const page of all) if (page.field === field && !groups.has(page.key)) out.push({ field, name: page.name, count: 0, quotes: 0, first: page.updated_at, last: page.updated_at, work: page.work || undefined })
    }
    return out.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
  })

  ipcMain.handle('haligtree:source', (_event, field: unknown, name: unknown): SourcePage | null => {
    if (!isField(field) || typeof name !== 'string' || !personKey(name)) return null
    const key = personKey(name)
    const items = everything().filter((one) => personKey(one[field] ?? '') === key).sort((a, b) => b.at.localeCompare(a.at))
    const all = pages()
    const page = all.find((one) => one.field === field && one.key === key)
    const via = page?.via ?? ''
    // Every other page found through this one: its "via" names it.
    const found = all.filter((one) => one.via && personKey(one.via) === key && !(one.field === field && one.key === key)).map((one) => ({ field: one.field, name: one.name }))
    // The tags their notes carry, read from each note's words.
    const counts = new Map<string, number>()
    const read = (table: string, ids: string[]): void => {
      if (!ids.length) return
      for (const row of db.prepare(`select title, body from ${table} where id in (${ids.map(() => '?').join(',')})`).all(...ids) as { title: string | null; body: string | null }[])
        for (const tag of tagsIn(`${row.title ?? ''} ${(row.body ?? '').replace(/["{}[\]:,]/g, ' ')}`)) counts.set(tag, (counts.get(tag) ?? 0) + 1)
    }
    read('captures', items.filter((one) => one.type === 'capture').map((one) => one.id))
    read('nuggets', items.filter((one) => one.type !== 'capture').map((one) => one.id))
    const tags = [...counts].filter(([tag]) => tag !== 'bit').map(([tag, n]) => ({ tag, n })).sort((a, b) => b.n - a.n || a.tag.localeCompare(b.tag)).slice(0, 8)
    // The other side: a person's sources, a source's people.
    const other: SourceField = field === 'attribution' ? 'medium' : 'attribution'
    const sides = new Map<string, string[]>()
    for (const one of items) {
      const value = one[other]?.trim()
      if (value) sides.set(personKey(value), [...(sides.get(personKey(value)) ?? []), value])
    }
    const links = [...sides.values()].sort((a, b) => b.length - a.length).slice(0, 8).map((names) => ({ field: other, name: spelt(names) }))
    const years: Record<string, string> = {}
    for (const one of all) if (one.field === 'medium' && one.born) years[one.key] = one.born
    return { field, name: items.length ? spelt(items.map((one) => one[field]!)) : page?.name ?? name.trim(), thoughts: page?.thoughts ?? '', what: page?.what ?? '', born: page?.born ?? '', died: page?.died ?? '', via,
      viaPage: via ? viaPageOf(via, everything(), all) : null, found, items, bio: page?.bio ?? '', bioUrl: page?.bioUrl ?? '', bioAt: page?.bioAt ?? '', tags, links, years,
      character: field === 'attribution' ? characterOf(page, items.length ? spelt(items.map((one) => one[field]!)) : page?.name ?? name.trim(), undefined, all) : null }
  })

  // The card in a note's margin: its source (or, with none, who said it) and that page's line.
  ipcMain.handle('haligtree:source:card', (_event, who: unknown, where: unknown): SourceCard | null => {
    const author = typeof who === 'string' ? who.trim() : ''
    const title = typeof where === 'string' ? where.trim() : ''
    const field: SourceField | null = title ? 'medium' : author ? 'attribution' : null
    if (!field) return null
    const name = field === 'medium' ? title : author
    const all = pages()
    const page = all.find((one) => one.field === field && one.key === personKey(name))
    const via = page?.via ?? ''
    return { field, name, author: field === 'medium' ? author : '', what: page?.what ?? '', born: page?.born ?? '', died: page?.died ?? '', via, viaPage: via ? viaPageOf(via, everything(), all) : null }
  })

  // A page made by hand, or your thoughts on it saved: kept by its name, whether or not anything is from it yet.
  ipcMain.handle('haligtree:source:set', (_event, field: unknown, name: unknown, thoughts: unknown) => {
    if (!isField(field) || typeof name !== 'string' || !personKey(name)) return false
    const was = pages().find((one) => one.field === field && one.key === personKey(name))
    db.prepare('insert into source_pages (field, key, name, thoughts, updated_at) values (?, ?, ?, ?, ?) on conflict(field, key) do update set thoughts = excluded.thoughts, updated_at = excluded.updated_at')
      .run(field, personKey(name), name.trim(), typeof thoughts === 'string' ? thoughts : was?.thoughts ?? '', new Date().toISOString())
    changed()
    return true
  })

  // A line or two about them: Wikipedia's, kept here so it reads offline, or your own words in its place (no url).
  ipcMain.handle('haligtree:source:bio', (_event, field: unknown, name: unknown, bio: unknown, url: unknown) => {
    if (!isField(field) || typeof name !== 'string' || !personKey(name) || typeof bio !== 'string') return false
    const was = pages().find((one) => one.field === field && one.key === personKey(name))
    db.prepare('insert into source_pages (field, key, name, thoughts, bio, bio_url, bio_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?) on conflict(field, key) do update set bio = excluded.bio, bio_url = excluded.bio_url, bio_at = excluded.bio_at')
      .run(field, personKey(name), name.trim(), was?.thoughts ?? '', bio.trim().slice(0, 1200), typeof url === 'string' ? url : '', new Date().toISOString(), new Date().toISOString())
    changed()
    return true
  })

  // A person made a character of a work (and who played them, if anyone), or a real person again (`work` empty).
  // What they did and when they lived stay kept, unshown, so turning back loses nothing.
  ipcMain.handle('haligtree:source:character', (_event, name: unknown, work: unknown, played: unknown) => {
    if (typeof name !== 'string' || !personKey(name) || typeof work !== 'string') return false
    const was = pages().find((one) => one.field === 'attribution' && one.key === personKey(name))
    const next = work.trim().slice(0, 160)
    db.prepare(`insert into source_pages (field, key, name, thoughts, work, played, updated_at) values ('attribution', ?, ?, ?, ?, ?, ?)
      on conflict(field, key) do update set work = excluded.work, played = excluded.played, updated_at = excluded.updated_at`)
      .run(personKey(name), was?.name ?? name.trim(), was?.thoughts ?? '', next, next ? (typeof played === 'string' ? played.trim().slice(0, 80) : was?.played ?? '') : '', new Date().toISOString())
    changed()
    return true
  })

  // Every character in the book with the work they are in: what "@" offers beside People.
  ipcMain.handle('haligtree:characters', (): { name: string; work: string }[] =>
    pages().filter((one) => one.field === 'attribution' && one.work).map((one) => ({ name: one.name, work: one.work })).sort((a, b) => a.name.localeCompare(b.name)))

  // What they did and when they lived, each set on its own; a page is made for it if there is none.
  ipcMain.handle('haligtree:source:facts', (_event, field: unknown, name: unknown, facts: unknown) => {
    if (!isField(field) || typeof name !== 'string' || !personKey(name) || !facts || typeof facts !== 'object') return false
    const was = pages().find((one) => one.field === field && one.key === personKey(name))
    const next = { what: was?.what ?? '', born: was?.born ?? '', died: was?.died ?? '', via: was?.via ?? '' }
    for (const key of ['what', 'born', 'died', 'via'] as const) {
      const value = (facts as Record<string, Cell>)[key]
      if (typeof value === 'string') next[key] = value.trim().slice(0, 80)
    }
    db.prepare('insert into source_pages (field, key, name, thoughts, what, born, died, via, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?) on conflict(field, key) do update set what = excluded.what, born = excluded.born, died = excluded.died, via = excluded.via, updated_at = excluded.updated_at')
      .run(field, personKey(name), name.trim(), was?.thoughts ?? '', next.what, next.born, next.died, next.via, new Date().toISOString())
    changed()
    return true
  })

  // The margin of a page being written: each person it names with their page's
  // line and bio and their own words, and word gems sharing a tag with it.
  // Never a private note or a #bit, and never the page itself.
  ipcMain.handle('haligtree:margin', (_event, id: unknown, names: unknown): Margin => {
    if (typeof id !== 'string' || !Array.isArray(names)) return { people: [], words: [] }
    const shown = (one: { private: number; label: string; id: string }): boolean => !one.private && one.id !== id && !/(^|\s)#bit\b/i.test(one.label)
    const items = everything()
    const all = pages()
    const seen = new Set<string>()
    const people: Margin['people'] = []
    for (const name of names.filter((one): one is string => typeof one === 'string').slice(0, 12)) {
      const key = personKey(name)
      if (!key || seen.has(key)) continue
      seen.add(key)
      const mine = items.filter((one) => personKey(one.attribution ?? '') === key)
      const theirs = mine.filter((one) => one.voice === 'theirs' && shown(one)).sort((a, b) => b.at.localeCompare(a.at))
      const page = all.find((one) => one.field === 'attribution' && one.key === key)
      people.push({ name: mine.length ? spelt(mine.map((one) => one.attribution!)) : page?.name ?? name.trim(), what: page?.what ?? '', born: page?.born ?? '', died: page?.died ?? '', via: page?.via ?? '', thoughts: page?.thoughts ?? '',
        quotes: theirs.map(({ type, id, kind, label, medium }) => ({ type, id, kind, label, medium })) })
    }
    const words = db.prepare(`select n.id, coalesce(nullif(nullif(trim(n.title), 'Untitled'), ''), label('', n.body)) as label from nuggets n
      where n.tier = 'nugget' and n.kind = 'word' and n.binned_at is null and n.archived_at is null and not n.private and n.id != :id
        and exists (select 1 from json_each(note_tags(n.title, n.body)) theirs join nuggets page on page.id = :id join json_each(note_tags(page.title, page.body)) ours on ours.value = theirs.value)
      order by n.created_at desc limit 12`).all({ id }) as { id: string; label: string }[]
    return { people, words: words.filter((one) => shown({ ...one, private: 0 })).slice(0, 4) }
  })

  // Who else shares a tag or a source with this person: a source (medium) shared, or a #tag in both's words.
  ipcMain.handle('haligtree:source:near', (_event, name: unknown): SourceNear[] => {
    if (typeof name !== 'string' || !personKey(name)) return []
    const key = personKey(name)
    // A note's own tags, wherever they are in it: a #tag typed in its first line leaves its name (19dc0daf9), so the
    // name no longer shows them, and two people sharing one were never found "alongside" each other.
    const tagged = new Map((db.prepare(`select id, note_tags('', body) as tags from captures where coalesce(trim(attribution), '') != ''
      union all select id, note_tags(title, body) as tags from nuggets where coalesce(trim(attribution), '') != ''`).all() as { id: string; tags: string }[])
      .map((row) => [row.id, row.tags]))
    const tagsOf = (id: string): string[] => {
      try {
        return (JSON.parse(tagged.get(id) ?? '[]') as string[]).map((tag) => String(tag).replace(/^#/, '').toLowerCase())
      } catch {
        return []
      }
    }
    const people = new Map<string, { names: string[]; marks: Set<string> }>()
    for (const item of everything()) {
      const who = item.attribution?.trim()
      if (!who) continue
      const one = people.get(personKey(who)) ?? { names: [], marks: new Set<string>() }
      one.names.push(who)
      if (item.medium?.trim()) one.marks.add(`where:${personKey(item.medium.split(',')[0])}`)
      for (const tag of tagsOf(item.id)) one.marks.add(`tag:${tag}`)
      people.set(personKey(who), one)
    }
    const mine = people.get(key)?.marks
    if (!mine?.size) return []
    return [...people].filter(([other]) => other !== key)
      .map(([, one]) => ({ name: spelt(one.names), shared: [...one.marks].filter((mark) => mine.has(mark)).length }))
      .filter((one) => one.shared > 0).sort((a, b) => b.shared - a.shared || a.name.localeCompare(b.name)).slice(0, 6)
  })

  // A person or a source renamed (a typo put right), or merged into one that
  // already has the new name. Every place the name lives changes in one go:
  // each note's who or where, its page (what they did, when they lived, the
  // bio), their photo, @mentions in note bodies and practices that load them.
  // Asked first when the new name is someone else's: `merge` says go ahead.
  ipcMain.handle('haligtree:source:rename', (_event, field: unknown, from: unknown, to: unknown, merge: unknown): RenameResult => {
    if (!isField(field) || typeof from !== 'string' || typeof to !== 'string') return { count: 0 }
    const fromKey = personKey(from)
    const toKey = personKey(to)
    if (!fromKey || !toKey || from.trim() === to.trim()) return { count: 0 }
    const items = everything()
    const mine = items.filter((one) => personKey(one[field] ?? '') === fromKey)
    const theirs = items.filter((one) => personKey(one[field] ?? '') === toKey)
    const pageOf = (key: string): Record<string, Cell> | undefined => db.prepare('select * from source_pages where field = ? and key = ?').get(field, key) as never
    const personOf = (key: string): Record<string, Cell> | undefined => db.prepare('select * from people where key = ?').get(key) as never
    const other = toKey !== fromKey && (theirs.length > 0 || !!pageOf(toKey) || (field === 'attribution' && !!personOf(toKey)?.avatar))
    // Merged, the page keeps the spelling it goes by.
    const name = other ? (theirs.length ? spelt(theirs.map((one) => one[field]!)) : String(pageOf(toKey)?.name ?? personOf(toKey)?.name ?? to.trim())) : to.trim()
    if (other && merge !== true) {
      const quotes = mine.filter((one) => one.voice === 'theirs').length
      const rest = mine.length - quotes
      const photo = field === 'attribution' && !!personOf(fromKey)?.avatar && !personOf(toKey)?.avatar
      const parts = [quotes && `${plural(quotes, 'quote')}`, rest && `${rest} ${quotes ? 'other ' : ''}${rest === 1 ? 'note' : 'notes'}`, photo && 'photo'].filter(Boolean) as string[]
      const one = parts.length === 1 && (quotes === 1 || rest === 1 || photo)
      const said = parts.length ? `Their ${parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}` : parts[0]} ${one ? 'comes' : 'come'} along.` : 'Their page comes along.'
      return { count: 0, merge: { into: name, said } }
    }
    const puts: RenamePut[] = []
    const set = (table: string, id: string, col: string, before: Cell, after: Cell): void => {
      db.prepare(`update ${table} set ${col} = ? where id = ?`).run(after, id)
      puts.push({ table, id, col, before, after })
    }
    const keys = [fromKey, toKey]
    const pagesBefore = keys.map(pageOf).filter(Boolean) as Record<string, Cell>[]
    const peopleBefore = field === 'attribution' ? (keys.map(personOf).filter(Boolean) as Record<string, Cell>[]) : []
    const touched = new Set<string>()
    atomically(() => {
      // Every note with the old name, in the Bin and tasks too, so none is left behind to come back under it.
      for (const table of ['captures', 'nuggets'])
        for (const row of db.prepare(`select id, ${field} as was from ${table} where coalesce(trim(${field}), '') != ''`).all() as { id: string; was: string }[])
          if (personKey(row.was) === fromKey && row.was !== name) {
            set(table, row.id, field, row.was, name)
            touched.add(`${table}:${row.id}`)
          }
      // The page: merged, the one kept keeps what it has and takes only what it lacks.
      const was = pageOf(fromKey)
      if (was) {
        const kept = other ? pageOf(toKey) : undefined
        db.prepare('delete from source_pages where field = ? and key in (?, ?)').run(field, fromKey, toKey)
        const pick = (col: string): string => String((kept?.[col] as string) || was[col] || '')
        db.prepare('insert into source_pages (field, key, name, thoughts, what, born, died, via, work, played, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
          .run(field, toKey, name, pick('thoughts'), pick('what'), pick('born'), pick('died'), pick('via'), pick('work'), pick('played'), new Date().toISOString())
      }
      if (field === 'attribution') {
        const face = personOf(fromKey)
        if (face) {
          const kept = other ? personOf(toKey) : undefined
          db.prepare('delete from people where key in (?, ?)').run(fromKey, toKey)
          db.prepare('insert into people (key, name, avatar, updated_at) values (?, ?, ?, ?)').run(toKey, name, (kept?.avatar as string | null) ?? face.avatar ?? null, new Date().toISOString())
        }
        // @mentions in note bodies.
        for (const table of ['captures', 'nuggets']) {
          for (const row of db.prepare(`select id, body from ${table} where body like '%person:%' or body like '%character:%'`).all() as { id: string; body: string }[]) {
            let body: unknown
            try {
              body = JSON.parse(row.body)
            } catch {
              body = row.body
            }
            const out = renamePerson(body, from, name, personKey)
            if (!out.count) continue
            set(table, row.id, 'body', row.body, typeof out.body === 'string' ? out.body : JSON.stringify(out.body))
            touched.add(`${table}:${row.id}`)
          }
        }
      }
      // A practice that loads this person's or source's notes.
      const practices = db.prepare("select 1 from sqlite_master where type = 'table' and name = 'practices'").get()
      if (practices) for (const row of db.prepare("select id, load from practices where load_kind = 'source' and load like ?").all(`${field}:%`) as { id: string; load: string }[])
        if (personKey(row.load.slice(field.length + 1)) === fromKey) set('practices', row.id, 'load', row.load, `${field}:${name}`)
    })
    const token = randomUUID()
    renamed.set(token, { field, keys, puts, pages: pagesBefore, people: peopleBefore })
    for (const old of [...renamed.keys()].slice(0, -20)) renamed.delete(old)
    changed()
    // Counted as the lists show them: a line kept as a gem is one note (its capture is not counted again), and a gem's cards are part of it.
    const counted = [...touched].filter((one) => {
      const [table, id] = [one.slice(0, one.indexOf(':')), one.slice(one.indexOf(':') + 1)]
      return table === 'captures' ? !db.prepare('select 1 from nuggets where capture_id = ?').get(id) : table !== 'nuggets' || !db.prepare("select 1 from nuggets where id = ? and tier = 'card'").get(id)
    })
    return { count: counted.length, token, name }
  })

  // Undo a rename: every place put back as it was, in one go.
  ipcMain.handle('haligtree:source:rename:undo', (_event, token: unknown) => {
    const done = renamed.get(String(token))
    renamed.delete(String(token))
    if (!done) return false
    atomically(() => {
      for (const one of [...done.puts].reverse()) db.prepare(`update ${one.table} set ${one.col} = ? where id = ?`).run(one.before, one.id)
      const back = (table: string, rows: Record<string, Cell>[], where: string, args: string[]): void => {
        db.prepare(`delete from ${table} where ${where}`).run(...args)
        for (const row of rows) db.prepare(`insert into ${table} (${Object.keys(row).join(', ')}) values (${Object.keys(row).map(() => '?').join(', ')})`).run(...Object.values(row))
      }
      back('source_pages', done.pages, 'field = ? and key in (?, ?)', [done.field, ...done.keys])
      if (done.field === 'attribution') back('people', done.people, 'key in (?, ?)', done.keys)
    })
    changed()
    return true
  })

  // A page made by hand and left empty can go again; one with notes from it is there because of them.
  ipcMain.handle('haligtree:source:drop', (_event, field: unknown, name: unknown) => {
    if (!isField(field) || typeof name !== 'string') return false
    db.prepare('delete from source_pages where field = ? and key = ?').run(field, personKey(name))
    changed()
    return true
  })

  // Quotes and sourced-looking gems that have lost their source, or never had one: each is nudged to get one.
  // Every one, so the count said over them is true (it said "200" with 505 waiting); the page shows five at a time.
  ipcMain.handle('haligtree:sources:missing', () => [
    ...db.prepare(`select 'capture' as type, id, kind, ${LABEL} as label, captured_at as at from captures
      where status != 'discarded' and kind = 'quote' and coalesce(trim(attribution), '') = '' and coalesce(trim(medium), '') = '' order by captured_at desc`).all(),
    ...db.prepare(`select tier as type, id, kind, coalesce(nullif(nullif(trim(title), 'Untitled'), ''), label('', body)) as label, created_at as at from nuggets
      where tier = 'nugget' and binned_at is null and kind = 'quote' and coalesce(trim(attribution), '') = '' and coalesce(trim(medium), '') = '' order by created_at desc`).all()
  ] as { type: string; id: string; kind: string; label: string; at: string }[])

  // The source-centred map: each who and where as a dot, joined to every note from it,
  // and a person joined to the book or show they said things in.
  ipcMain.handle('haligtree:sources:graph', (): SourceGraph => {
    const items = everything()
    const nodes = new Map<string, SourceGraph['nodes'][number]>()
    const edges = new Map<string, number>()
    const link = (a: string, b: string): void => {
      const pair = [a, b].sort().join('\n')
      edges.set(pair, (edges.get(pair) ?? 0) + 1)
    }
    for (const item of items) {
      // A shared deck's card is not a node of its own (1,448 paintings would bury your notes): its who joins its deck, its where, directly.
      const card = !!(item as { deck?: number }).deck
      if (!card) nodes.set(item.id, { type: item.type, id: item.id, title: item.label, private: !!item.private, kind: item.kind, links: 0 })
      const ends: string[] = []
      for (const field of FIELDS) {
        const value = item[field]?.trim()
        if (!value) continue
        const id = `${field === 'attribution' ? 'who' : 'where'}:${personKey(value)}`
        if (!nodes.has(id)) nodes.set(id, { type: 'source', id, title: value, kind: field === 'attribution' ? 'person' : 'source', links: 0 })
        if (!card) link(item.id, id)
        ends.push(id)
      }
      if (ends.length === 2) link(ends[0], ends[1])
    }
    for (const pair of edges.keys()) for (const end of pair.split('\n')) nodes.get(end)!.links += 1
    return { nodes: [...nodes.values()], edges: [...edges].map(([pair, n]) => [...(pair.split('\n') as [string, string]), n]), alone: 0 }
  })
}
