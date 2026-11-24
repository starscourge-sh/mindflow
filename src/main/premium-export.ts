import type { DatabaseSync } from 'node:sqlite'
import { tagsIn } from './tag-words.ts'

/**
 * The export you can open in another app: folders as folders, a gem and the
 * note it came from linked both ways, one file for each deck, highlights with
 * their source, and a readme that says what each part is. The pictures stay
 * in assets/, and each note points at them from where it sits.
 */

export type ExportPreview = {
  pages: number
  gems: number
  notes: number
  decks: number
  highlights: number
  files: number
  sample: { path: string; text: string }[]
}

type Folder = { id: string; name: string; parent: string | null }
type Row = {
  id: string
  kind: 'page' | 'gem' | 'note' | 'card'
  title: string
  body: unknown
  folder: string | null
  source: string | null
  deck: string | null
  front: Record<string, unknown>
}

const safe = (name: string): string => name.replace(/[\\/:*?"<>|#^[\]\n\r]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80).trim() || 'Note'

/** A folder's path from the top, "Films/History". A loop in the tree stops. */
function folderPath(id: string | null, folders: Map<string, Folder>): string {
  const names: string[] = []
  const seen = new Set<string>()
  let at = id
  while (at && !seen.has(at)) {
    seen.add(at)
    const folder = folders.get(at)
    if (!folder) break
    names.unshift(safe(folder.name))
    at = folder.parent
  }
  return names.filter(Boolean).join('/')
}

const stemOf = (title: string, id: string, taken: Set<string>): string => {
  const base = safe(title) || id.slice(0, 8)
  let one = base
  for (let n = 2; taken.has(one.toLowerCase()); n++) one = `${base} ${n}`
  taken.add(one.toLowerCase())
  return one
}

const depthOf = (path: string): string => '../'.repeat(path.split('/').length - 1)

/** [[Name]], [[Name#here]] and [[Name|shown]], the name only. */
const linked = (text: string): string[] => [...text.matchAll(/\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|[^\]]*)?\]\]/g)].map((hit) => hit[1].trim()).filter(Boolean)

const callout = (question: string, answer: string): string => {
  const title = question.replace(/\s+/g, ' ').trim() || 'Card'
  const lines = (answer.trim() || ' ').split('\n')
  return [`> [!card]- ${title}`, ...lines.map((line) => `> ${line}`)].join('\n')
}

const readme = (counts: Omit<ExportPreview, 'sample' | 'files'>): string =>
  `# Your book

This folder is a copy of your book, written so you can open it somewhere else.

${counts.pages} pages, ${counts.gems} gems, ${counts.notes} notes, ${counts.decks} decks, ${counts.highlights} sources with highlights.

- Writing holds pages, in the same folders they have in the book. A note or a gem that lives in a folder is in that folder too.
- Gems holds a kept line that is not in a folder, and the note it came from. Each points at the other.
- Notes holds a capture that is not in a folder.
- Decks holds one file for each deck. A card's question is the title of a folded callout, and the answer is inside it.
- Library holds the highlights from a source, with the page they were on.
- assets holds the pictures and files. A note points at them from its own place.

A link [[like this]] is another note in this folder. Notes that point at this one are listed at the end, under Backlinks.

haligtree.json is the whole book as data. The files here are the copy you can read.
`

/**
 * The files of one book. `render` turns a stored body into Markdown. `nameOf`
 * is the file name the links use, and `assets` is the path from that file to
 * the pictures (`assets/` at the top of the export).
 */
export function layoutBook(
  db: DatabaseSync,
  render: (body: unknown, nameOf: (id: string) => string | undefined, assets: string) => string
): { files: Map<string, string>; preview: ExportPreview } {
  const has = (table: string): boolean => !!db.prepare("select 1 from sqlite_master where type = 'table' and name = ?").get(table)
  const folders = new Map<string, Folder>()
  if (has('note_groups')) {
    for (const row of db.prepare("select id, name, parent_id as parent from note_groups where list = 'folders' and coalesce(folder, 1) = 1").all() as Folder[])
      folders.set(row.id, row)
  }
  const rows: Row[] = []
  if (has('captures')) {
    for (const row of db.prepare("select id, title, body, kind, private, captured_at as at, attribution, medium, fields, folder_id as folder from captures where status != 'discarded'").all() as Record<string, string | number | null>[]) {
      let title = String(row.title ?? '').trim()
      if (!title || title === 'Untitled') {
        try { title = String((db.prepare('select label(?, ?, 0) as n').get(row.title ?? '', row.body ?? '', ) as { n: string }).n ?? '') } catch { title = '' }
      }
      rows.push({
        id: String(row.id), kind: 'note', title: title || 'Note', body: row.body, folder: row.folder ? String(row.folder) : null, source: null, deck: null,
        front: { kind: row.kind, private: row.private ? true : null, captured: row.at, who: row.attribution, where: row.medium }
      })
    }
  }
  if (has('nuggets')) {
    for (const row of db.prepare("select id, tier, title, body, prompt, kind, private, created_at as at, attribution, capture_id as source, folder_id as folder, deck, fields from nuggets where binned_at is null and superseded_by is null and tier not in ('goal', 'deck')").all() as Record<string, string | number | null>[]) {
      const tier = String(row.tier ?? '')
      const kind = tier === 'card' ? 'card' : tier === 'nugget' ? 'gem' : 'page'
      let title = String(row.title ?? '').trim()
      if (kind === 'card') title = String(row.prompt ?? '').trim() || title
      rows.push({
        id: String(row.id), kind, title: title || (kind === 'card' ? 'Card' : 'Page'), body: row.body, folder: row.folder ? String(row.folder) : null,
        source: row.source ? String(row.source) : null, deck: row.deck ? String(row.deck) : null,
        front: { kind: row.kind ?? tier, private: row.private ? true : null, created: row.at, who: row.attribution }
      })
    }
  }
  const taken = new Set<string>()
  const stem = new Map<string, string>()
  for (const row of rows) if (row.kind !== 'card') stem.set(row.id, stemOf(row.title, row.id, taken))
  const nameOf = (id: string): string | undefined => stem.get(id.replace(/^[a-z]+:/, ''))
  const pathOf = (row: Row): string => {
    const place = folderPath(row.folder, folders)
    const home = row.kind === 'gem' ? 'Gems' : row.kind === 'page' ? 'Writing' : 'Notes'
    const dir = place ? `${home}/${place}` : home
    return `${dir}/${stem.get(row.id)}.md`
  }
  const text = new Map<string, string>()
  for (const row of rows) {
    if (row.kind === 'card') continue
    const path = pathOf(row)
    text.set(row.id, render(row.body, nameOf, `${depthOf(path)}assets/`))
  }
  // A gem and the note it was kept from point at each other. Backlinks are the links the notes themselves wrote.
  const pointed = new Map<string, string[]>()
  const addPoint = (id: string, from: string): void => {
    const list = pointed.get(id) ?? []
    if (!list.includes(from)) list.push(from)
    pointed.set(id, list)
  }
  for (const row of rows) {
    if (row.kind === 'card') continue
    for (const name of linked(text.get(row.id) ?? '')) {
      const hit = [...stem.entries()].find(([, one]) => one === name)?.[0]
      if (hit && hit !== row.id) addPoint(hit, stem.get(row.id)!)
    }
  }
  for (const row of rows) {
    if (row.kind !== 'gem' || !row.source || !stem.has(row.source)) continue
    const from = stem.get(row.source)!
    const mine = stem.get(row.id)!
    text.set(row.id, `${text.get(row.id) ?? ''}\n\nKept from [[${from}]].\n`)
    addPoint(row.source, mine)
  }
  const files = new Map<string, string>()
  const counts = { pages: 0, gems: 0, notes: 0, decks: 0, highlights: 0 }
  for (const row of rows) {
    if (row.kind === 'card') continue
    counts[row.kind === 'page' ? 'pages' : row.kind === 'gem' ? 'gems' : 'notes'] += 1
    const mine = stem.get(row.id)!
    const back = (pointed.get(row.id) ?? []).filter((one) => one !== mine)
    const tail = back.length ? `\n\n## Backlinks\n\n${back.map((one) => `- [[${one}]]`).join('\n')}\n` : ''
    const head = Object.entries({ ...row.front, title: row.title }).filter(([, value]) => value !== null && value !== undefined && value !== '')
    const front = head.length ? `---\n${head.map(([key, value]) => `${key}: ${JSON.stringify(value)}`).join('\n')}\n---\n\n` : ''
    files.set(pathOf(row), `${front}# ${row.title}\n\n${(text.get(row.id) ?? '').trim()}\n${tail}`)
  }
  const decks = new Map<string, Row[]>()
  for (const row of rows) {
    if (row.kind !== 'card') continue
    const answer = render(row.body, nameOf, '../assets/')
    const tag = row.deck || tagsIn(`${row.title}\n${answer}`)[0] || 'Cards'
    const list = decks.get(tag) ?? []
    list.push({ ...row, body: answer })
    decks.set(tag, list)
  }
  for (const [tag, cards] of decks) {
    counts.decks += 1
    const name = stemOf(tag, tag, taken)
    const body = cards.map((card) => callout(card.title, String(card.body ?? ''))).join('\n\n')
    files.set(`Decks/${name}.md`, `---\ndeck: ${JSON.stringify(tag)}\ncards: ${cards.length}\n---\n\n# ${tag}\n\n${body}\n`)
  }
  if (has('pdf_highlights')) {
    const marks = db.prepare('select src, page, quote, note, gem_id as gem from pdf_highlights order by src, page').all() as { src: string; page: number; quote: string; note: string | null; gem: string | null }[]
    const bySrc = new Map<string, typeof marks>()
    for (const mark of marks) {
      const list = bySrc.get(mark.src) ?? []
      list.push(mark)
      bySrc.set(mark.src, list)
    }
    for (const [src, list] of bySrc) {
      counts.highlights += 1
      const base = safe(src.split('/').pop()?.replace(/\.pdf$/i, '') || 'Highlights')
      const name = stemOf(base, src, taken)
      const lines = list.map((mark) => {
        const gem = mark.gem && stem.get(mark.gem) ? `\n\nKept as [[${stem.get(mark.gem)}]].` : ''
        const note = mark.note ? `\n\n${mark.note}` : ''
        return `> ${mark.quote.replace(/\n/g, '\n> ')}\n\np. ${mark.page}${note}${gem}`
      }).join('\n\n')
      files.set(`Library/${name}.md`, `# ${base}\n\nFrom ${src}\n\n${lines}\n`)
    }
  }
  const about = readme(counts)
  files.set('README.md', about)
  const sample = [{ path: 'README.md', text: about.slice(0, 700) }]
  for (const [path, body] of files) {
    if (sample.length >= 4 || path === 'README.md') continue
    if (/^(Writing|Decks|Gems|Notes|Library)\//.test(path)) sample.push({ path, text: body.slice(0, 700) })
  }
  return { files, preview: { ...counts, files: files.size, sample } }
}
