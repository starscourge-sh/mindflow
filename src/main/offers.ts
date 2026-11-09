import { onlyInTitles } from './title-names'
import { app, ipcMain } from 'electron'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { LABEL, changed, database, whenChanged } from './captures'
import { tagsIn, withoutTags } from './tag-words'
import { understand } from './understand'
import { readFileSync } from 'node:fs'
import { RootIndex, alreadyWrote, cluesFor, linksIn, peopleIn, whichFolder, type Lemmas, type RootNote } from './roots'

/**
 * What a note is quietly offered, from your own book, on this Mac (roots.ts):
 * another note it names (a link), one it nearly repeats, the folder it reads
 * like, and the people and organisations it names (People, Sources). Also the
 * notes for a question or an event. Each note's roots (and its meaning, for a
 * tie-break) are read by the Mac once and kept until it changes; the book's
 * index is made again only when something changed, never while typing.
 */

type Row = { key: string; title: string; text: string; stamp: string; group: string | null; list: string | null }
type Kept = { stamp: string; lemmas: Lemmas; meaning: Float32Array | null }
const kept = new Map<string, Kept>()

/** The roots read so far, kept beside the book, so a launch never reads its notes again (only what changed). */
const keptFile = (): string => join(app.getPath('userData'), 'offer-roots.json')
let loaded = false
function loadKept(): void {
  if (loaded) return
  loaded = true
  try {
    for (const [key, one] of Object.entries(JSON.parse(readFileSync(keptFile(), 'utf8')) as Record<string, { stamp: string; lemmas: Lemmas }>))
      kept.set(key, { stamp: one.stamp, lemmas: one.lemmas, meaning: null })
  } catch {
    // None yet: read now.
  }
}
function saveKept(): void {
  const out: Record<string, { stamp: string; lemmas: Lemmas }> = {}
  for (const [key, one] of kept) out[key] = { stamp: one.stamp, lemmas: one.lemmas }
  void writeFile(keptFile(), JSON.stringify(out)).catch(() => undefined)
}
let built: { at: number; index: RootIndex; rows: Row[] } | null = null
let stale = true
let building: Promise<{ index: RootIndex; rows: Row[] }> | null = null

const vectorOf = (one: unknown): Float32Array | null => (typeof one === 'string' ? new Float32Array(Buffer.from(one, 'base64').buffer.slice(0)) : null)

/** The roots of some texts, read by the Mac (a few milliseconds each). */
async function readAll(texts: string[]): Promise<{ lemmas: Lemmas }[]> {
  const read = await Promise.all(texts.map((text) => understand('read', { text: text.slice(0, 4000) }, 'background')))
  return texts.map((_, i) => ({ lemmas: (read[i].roots as Lemmas | undefined) ?? {} }))
}

/** Meaning fingerprints, only ever for the few notes a tie-break compares (they are slow to make), kept. */
async function meanings(texts: string[]): Promise<(Float32Array | null)[]> {
  if (!texts.length) return []
  const meant = await understand('embed', { texts: texts.map((text) => text.slice(0, 1000)) }, 'background')
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
  return database().prepare(
    `select id as key, label(title, body, named) as title, words(id, body) as text, coalesce(edited_at, captured_at) as stamp, null as "group", null as list
       from captures where status not in ('discarded', 'promoted') and private = 0
     union all
     select tier || ':' || id, coalesce(nullif(nullif(trim(title), 'Untitled'), ''), label('', body)), words(id, body), coalesce(updated_at, created_at), group_id, tier
       from nuggets where tier in ('nugget', 'article', 'question') and private = 0 and binned_at is null and archived_at is null`
  ).all() as Row[]
}

async function index(): Promise<{ index: RootIndex; rows: Row[] }> {
  if (built && !stale) return built
  building ??= (async () => {
    stale = false
    const all = rows()
    loadKept()
    const fresh = all.filter((row) => kept.get(row.key)?.stamp !== row.stamp)
    // Roots only, a hundred notes a request: 5,000 notes are read once, in the background, then kept on disk.
    for (let at = 0; at < fresh.length; at += 100) {
      const batch = fresh.slice(at, at + 100)
      const said = await understand('roots', { texts: batch.map((row) => `${row.title}\n${row.text}`) }, 'background')
      const read = (said.roots as Lemmas[] | undefined) ?? []
      batch.forEach((row, i) => kept.set(row.key, { stamp: row.stamp, meaning: kept.get(row.key)?.meaning ?? null, lemmas: read[i] ?? {} }))
    }
    if (fresh.length) saveKept()
    const notes: RootNote[] = all.map((row) => ({ key: row.key, title: row.title ?? '', text: row.text ?? '', lemmas: kept.get(row.key)?.lemmas }))
    built = { at: Date.now(), index: new RootIndex(notes), rows: all }
    return built
  })().finally(() => (building = null))
  return building
}

const near = (a: Float32Array | null | undefined, b: Float32Array | null | undefined): number => {
  if (!a || !b || a.length !== b.length) return 0
  let dot = 0, x = 0, y = 0
  for (let i = 0; i < a.length; i++) (dot += a[i] * b[i]), (x += a[i] * a[i]), (y += b[i] * b[i])
  return dot / (Math.sqrt(x * y) || 1)
}

export type NoteOffers = {
  links: { key: string; title: string; words: string }[]
  same: { key: string; title: string } | null
  folder: { id: string; name: string } | null
  /** People it names: `known` already one of your People (a link to their page), else one to add. */
  people: { name: string; known: boolean }[]
  /** Characters it names: `work` is the work they are in; `known` already one of your Characters, else one to add. */
  characters: { name: string; work: string; known: boolean }[]
}

/** The tags that say a note is about a work: a book, a film, a play or a show. */
const WORK_TAGS = new Set(['book', 'books', 'novel', 'film', 'films', 'movie', 'movies', 'play', 'show', 'series', 'tv', 'anime', 'comic', 'manga', 'game'])

/** The work a note is about, when it is one (tagged #book or #film, or a book's own note): its title, without its tags. */
function workOfNote(key: string, text: string): { work: string; author: string } | null {
  const db = database()
  const row = (key.includes(':')
    ? db.prepare("select coalesce(nullif(nullif(trim(title), 'Untitled'), ''), label('', body)) as title, kind, attribution from nuggets where id = ?").get(key.slice(key.indexOf(':') + 1))
    : db.prepare(`select ${LABEL} as title, kind, attribution from captures where id = ?`).get(key)) as { title: string | null; kind: string | null; attribution: string | null } | undefined
  const about = tagsIn(text).some((tag) => WORK_TAGS.has(tag.toLowerCase())) || WORK_TAGS.has((row?.kind ?? '').toLowerCase())
  const work = withoutTags(row?.title || text.split('\n')[0] || '').replace(/\s+/g, ' ').trim()
  return about && work ? { work, author: row?.attribution ?? '' } : null
}

/** The Mac's own word list (lower case only: everyday words), read once, for telling a name from a word. */
let everyday: Set<string> | null = null
const common = (word: string): boolean => {
  if (!everyday) {
    try {
      everyday = new Set(readFileSync('/usr/share/dict/words', 'utf8').split('\n').filter((one) => one && one === one.toLowerCase()))
    } catch {
      everyday = new Set()
    }
  }
  return everyday.has(word)
}

/** The titles of works in the book: notes' titles longer than a name, and where quotes and gems are from. */
const works = (all: { title?: string | null }[]): string[] => {
  const from = database().prepare("select distinct medium as title from captures where medium is not null and medium != '' union select distinct medium from nuggets where medium is not null and medium != ''").all() as { title: string }[]
  return [...all.map((row) => row.title ?? ''), ...from.map((one) => one.title)].filter((title) => title.split(/\s+/).length >= 3)
}


/** What a note, as it now reads, is offered. `linked`: the notes it already links to. */
async function forNote(key: string, text: string, linked: string[]): Promise<NoteOffers> {
  const { index: book, rows: all } = await index()
  const [read] = await readAll([text])
  const title = (key: string): string => all.find((row) => row.key === key)?.title || 'Untitled'
  const same = alreadyWrote(book, text, read.lemmas, key, await meaningFor(book, all, text, read.lemmas, key))
  // Its folder: only a loose note in a list that has folders.
  const own = all.find((row) => row.key === key)
  let folder: NoteOffers['folder'] = null
  if (own?.list && !own.group) {
    const groups = database().prepare('select id, name from note_groups where list = ? and folder = 1').all(own.list) as { id: string; name: string }[]
    const members = new Map(groups.map((group) => [group.id, all.filter((row) => row.group === group.id).map((row) => row.key)]))
    const hit = whichFolder(book, key, members)
    if (hit) folder = { id: hit.folder, name: groups.find((group) => group.id === hit.folder)!.name }
  }
  const names = await understand('read', { text: text.slice(0, 4000) }, 'background')
  const db = database()
  // Characters are kept on People pages with the work they are in (sources.ts): never offered as people.
  const cast = new Map((db.prepare("select name, work from source_pages where field = 'attribution' and work != ''").all() as { name: string; work: string }[]).map((one) => [one.name.toLowerCase(), one]))
  const people = new Set((db.prepare("select distinct attribution as name from captures where attribution is not null and attribution != '' union select distinct attribution from nuggets where attribution is not null and attribution != ''").all() as { name: string }[])
    .map((one) => one.name.toLowerCase()).filter((name) => !cast.has(name)))
  const titles = works(all)
  const about = workOfNote(key, text)
  const found = peopleIn((names.names as { text: string; kind: string }[] | undefined) ?? [], common, (name) => people.has(name.toLowerCase()) || cast.has(name.toLowerCase()))
  // Where each name lives: a character already kept; a person you know; a name met only inside the title of a work
  // ("The Picture of Dorian Gray"), a character in it; anyone a note about a work names, besides its author, a character
  // of that work; anyone else, a person.
  const characters: NoteOffers['characters'] = []
  const persons: NoteOffers['people'] = []
  for (const name of found) {
    const lower = name.toLowerCase()
    const kept = cast.get(lower)
    if (kept) characters.push({ name: kept.name, work: kept.work, known: true })
    else if (people.has(lower)) persons.push({ name, known: true })
    else if (onlyInTitles(text, name, titles)) {
      // The work by its name alone: a note's title carries its tags ("The Picture of Dorian Gray #book").
      const held = titles.find((title) => title.toLowerCase().includes(lower) && text.toLowerCase().includes(title.toLowerCase()))
      characters.push({ name, work: held ? withoutTags(held).replace(/\s+/g, ' ').trim() : about?.work ?? name, known: false })
    }
    else if (about && lower !== about.author.toLowerCase() && !about.work.toLowerCase().includes(lower)) characters.push({ name, work: about.work, known: false })
    else if (!about || lower !== about.author.toLowerCase()) persons.push({ name, known: false })
  }
  return {
    links: linksIn(book, text, read.lemmas, key, new Set(linked)).slice(0, 3),
    same: same ? { key: same.key, title: title(same.key) } : null,
    folder,
    people: persons,
    characters
  }
}

/** The notes on what a question or an event is about, best first. */
async function about(text: string, leave?: string): Promise<{ key: string; title: string; words: string }[]> {
  const { index: book, rows: all } = await index()
  const [read] = await readAll([text])
  return cluesFor(book, text, read.lemmas, leave, await meaningFor(book, all, text, read.lemmas, leave)).map((one) => {
    const row = all.find((each) => each.key === one.key)
    return { key: one.key, title: row?.title || 'Untitled', words: (row?.text ?? '').replace(/\s+/g, ' ').trim().slice(0, 280) }
  })
}
export const notesAbout = about

export function registerOffers(): void {
  // Anything saved: the index is made again the next time it is asked.
  whenChanged(() => void (stale = true))
  ipcMain.handle('haligtree:offers:note', (_event, key: unknown, text: unknown, linked: unknown) => forNote(String(key ?? ''), String(text ?? ''), Array.isArray(linked) ? linked.map(String) : []))
  // Made once the app has settled, so the first offer never waits for the whole book to be read.
  setTimeout(() => void index().catch(() => undefined), 20_000)
  ipcMain.handle('haligtree:offers:about', (_event, text: unknown, leave: unknown) => about(String(text ?? ''), typeof leave === 'string' ? leave : undefined))
  // "Which folder?" taken: the note filed, last in it; the Undo puts it back loose.
  ipcMain.handle('haligtree:offers:file', (_event, id: unknown, group: unknown) => {
    const db = database()
    const last = (db.prepare('select max(group_order) as at from nuggets where group_id = ?').get(String(group ?? '')) as { at: number | null }).at ?? 0
    db.prepare('update nuggets set group_id = ?, group_order = ?, unsorted = 0 where id = ?').run(group ? String(group) : null, group ? last + 1 : null, String(id))
    stale = true
    changed()
    return true
  })
}
