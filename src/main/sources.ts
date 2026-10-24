import { ipcMain } from 'electron'

import { LABEL, changed, database } from './captures'
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
/** Others in the book who share a tag or a source with this one, closest first. */
export type SourceNear = { name: string; shared: number }
export type SourceGraph = { nodes: { type: string; id: string; title: string; private?: boolean; kind: string; links: number }[]; edges: [string, string, number?][]; alone: number }

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
      const value = (facts as Record<string, unknown>)[key]
      if (typeof value === 'string') next[key] = value.trim().slice(0, 80)
    }
    db.prepare('insert into source_pages (field, key, name, thoughts, what, born, died, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?) on conflict(field, key) do update set what = excluded.what, born = excluded.born, died = excluded.died, updated_at = excluded.updated_at')
      .run(field, personKey(name), name.trim(), was?.thoughts ?? '', next.what, next.born, next.died, new Date().toISOString())
    changed()
    return true
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
