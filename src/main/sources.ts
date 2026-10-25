import { ipcMain } from 'electron'

import { randomUUID } from 'crypto'

import { LABEL, atomically, changed, database } from './captures'
import { renamePerson } from './link-rename'
import { personKey } from './names'
import { voiceOf, type Voice } from './voice'

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
export type SourceSummary = { field: SourceField; name: string; count: number; quotes: number; first: string; last: string }
/** The one plain line under a person's name: what they did, and when they lived. Each may be empty. */
export type SourceFacts = { what: string; born: string; died: string }
export type SourcePage = { field: SourceField; name: string; thoughts: string; items: SourceItem[] } & SourceFacts
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
  for (const column of ['what', 'born', 'died']) if (!had.has(column)) db.exec(`alter table source_pages add column ${column} text not null default ''`)

  /** Every note that has a who or a where, with what lists need to show it. */
  const everything = (): (SourceItem & { private: number })[] => {
    const rows = [
      ...db.prepare(`select 'capture' as type, id, kind, ${LABEL} as label, attribution, medium, fields, private, captured_at as at from captures
        where status != 'discarded' and kind != 'task' and id not in (select capture_id from nuggets where capture_id is not null) and (coalesce(trim(attribution), '') != '' or coalesce(trim(medium), '') != '')`).all(),
      ...db.prepare(`select tier as type, id, kind, coalesce(nullif(title, ''), label('', body)) as label, attribution, medium, fields, private, created_at as at from nuggets
        where tier != 'card' and binned_at is null and (coalesce(trim(attribution), '') != '' or coalesce(trim(medium), '') != '')`).all()
    ] as { type: string; id: string; kind: string; label: string; attribution: string | null; medium: string | null; fields: string | null; private: number; at: string }[]
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

  const pages = (): ({ field: SourceField; key: string; name: string; thoughts: string; updated_at: string } & SourceFacts)[] =>
    db.prepare('select field, key, name, thoughts, what, born, died, updated_at from source_pages').all() as never

  ipcMain.handle('haligtree:sources', (): SourceSummary[] => {
    const items = everything()
    const out: SourceSummary[] = []
    for (const field of FIELDS) {
      const groups = new Map<string, SourceItem[]>()
      for (const item of items) {
        const value = item[field]?.trim()
        if (!value) continue
        const key = personKey(value)
        groups.set(key, [...(groups.get(key) ?? []), item])
      }
      for (const [, list] of groups) {
        const times = list.map((one) => one.at).sort()
        out.push({ field, name: spelt(list.map((one) => one[field]!)), count: list.length, quotes: list.filter((one) => one.voice === 'theirs').length, first: times[0], last: times.at(-1)! })
      }
      for (const page of pages()) if (page.field === field && !groups.has(page.key)) out.push({ field, name: page.name, count: 0, quotes: 0, first: page.updated_at, last: page.updated_at })
    }
    return out.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
  })

  ipcMain.handle('haligtree:source', (_event, field: unknown, name: unknown): SourcePage | null => {
    if (!isField(field) || typeof name !== 'string' || !personKey(name)) return null
    const key = personKey(name)
    const items = everything().filter((one) => personKey(one[field] ?? '') === key).sort((a, b) => b.at.localeCompare(a.at))
    const page = pages().find((one) => one.field === field && one.key === key)
    return { field, name: items.length ? spelt(items.map((one) => one[field]!)) : page?.name ?? name.trim(), thoughts: page?.thoughts ?? '', what: page?.what ?? '', born: page?.born ?? '', died: page?.died ?? '', items }
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

  // What they did and when they lived, each set on its own; a page is made for it if there is none.
  ipcMain.handle('haligtree:source:facts', (_event, field: unknown, name: unknown, facts: unknown) => {
    if (!isField(field) || typeof name !== 'string' || !personKey(name) || !facts || typeof facts !== 'object') return false
    const was = pages().find((one) => one.field === field && one.key === personKey(name))
    const next = { what: was?.what ?? '', born: was?.born ?? '', died: was?.died ?? '' }
    for (const key of ['what', 'born', 'died'] as const) {
      const value = (facts as Record<string, Cell>)[key]
      if (typeof value === 'string') next[key] = value.trim().slice(0, 80)
    }
    db.prepare('insert into source_pages (field, key, name, thoughts, what, born, died, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?) on conflict(field, key) do update set what = excluded.what, born = excluded.born, died = excluded.died, updated_at = excluded.updated_at')
      .run(field, personKey(name), name.trim(), was?.thoughts ?? '', next.what, next.born, next.died, new Date().toISOString())
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
      people.push({ name: mine.length ? spelt(mine.map((one) => one.attribution!)) : page?.name ?? name.trim(), what: page?.what ?? '', born: page?.born ?? '', died: page?.died ?? '', thoughts: page?.thoughts ?? '',
        quotes: theirs.map(({ type, id, kind, label, medium }) => ({ type, id, kind, label, medium })) })
    }
    const words = db.prepare(`select n.id, coalesce(nullif(n.title, ''), label('', n.body)) as label from nuggets n
      where n.tier = 'nugget' and n.kind = 'word' and n.binned_at is null and n.archived_at is null and not n.private and n.id != :id
        and exists (select 1 from json_each(note_tags(n.title, n.body)) theirs join nuggets page on page.id = :id join json_each(note_tags(page.title, page.body)) ours on ours.value = theirs.value)
      order by n.created_at desc limit 12`).all({ id }) as { id: string; label: string }[]
    return { people, words: words.filter((one) => shown({ ...one, private: 0 })).slice(0, 4) }
  })

  // Who else shares a tag or a source with this person: a source (medium) shared, or a #tag in both's words.
  ipcMain.handle('haligtree:source:near', (_event, name: unknown): SourceNear[] => {
    if (typeof name !== 'string' || !personKey(name)) return []
    const key = personKey(name)
    const tagsOf = (label: string): string[] => [...label.matchAll(/(?:^|\s)#([\p{L}\p{N}_-]+)/gu)].map((match) => match[1].toLowerCase())
    const people = new Map<string, { names: string[]; marks: Set<string> }>()
    for (const item of everything()) {
      const who = item.attribution?.trim()
      if (!who) continue
      const one = people.get(personKey(who)) ?? { names: [], marks: new Set<string>() }
      one.names.push(who)
      if (item.medium?.trim()) one.marks.add(`where:${personKey(item.medium.split(',')[0])}`)
      for (const tag of tagsOf(item.label)) one.marks.add(`tag:${tag}`)
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
      const parts = [quotes && `${quotes} ${quotes === 1 ? 'quote' : 'quotes'}`, rest && `${rest} ${quotes ? 'other ' : ''}${rest === 1 ? 'note' : 'notes'}`, photo && 'photo'].filter(Boolean) as string[]
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
        db.prepare('insert into source_pages (field, key, name, thoughts, what, born, died, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?)')
          .run(field, toKey, name, pick('thoughts'), pick('what'), pick('born'), pick('died'), new Date().toISOString())
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
          for (const row of db.prepare(`select id, body from ${table} where body like '%person:%'`).all() as { id: string; body: string }[]) {
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
  ipcMain.handle('haligtree:sources:missing', () => [
    ...db.prepare(`select 'capture' as type, id, kind, ${LABEL} as label, captured_at as at from captures
      where status != 'discarded' and kind = 'quote' and coalesce(trim(attribution), '') = '' and coalesce(trim(medium), '') = '' order by captured_at desc limit 200`).all(),
    ...db.prepare(`select tier as type, id, kind, coalesce(nullif(title, ''), label('', body)) as label, created_at as at from nuggets
      where tier = 'nugget' and binned_at is null and kind = 'quote' and coalesce(trim(attribution), '') = '' and coalesce(trim(medium), '') = '' order by created_at desc limit 200`).all()
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
      nodes.set(item.id, { type: item.type, id: item.id, title: item.label, private: !!item.private, kind: item.kind, links: 0 })
      const ends: string[] = []
      for (const field of FIELDS) {
        const value = item[field]?.trim()
        if (!value) continue
        const id = `${field === 'attribution' ? 'who' : 'where'}:${personKey(value)}`
        if (!nodes.has(id)) nodes.set(id, { type: 'source', id, title: value, kind: field === 'attribution' ? 'person' : 'source', links: 0 })
        link(item.id, id)
        ends.push(id)
      }
      if (ends.length === 2) link(ends[0], ends[1])
    }
    for (const pair of edges.keys()) for (const end of pair.split('\n')) nodes.get(end)!.links += 1
    return { nodes: [...nodes.values()], edges: [...edges].map(([pair, n]) => [...(pair.split('\n') as [string, string]), n]), alone: 0 }
  })
}
