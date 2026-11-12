import { ipcMain } from 'electron'

import { LABEL, changed, database } from './captures'
import { personKey } from './names'
import { fetchOutside } from './outside'
import { doiIn, isbnIn } from './cite-ids'

/**
 * Works a note cites: a book or an article, found by its DOI (Crossref) or its
 * ISBN (Open Library), or written in by hand. A work is a source page (a
 * "where", field 'medium') named by its title, with its authors, year,
 * publisher and DOI or ISBN beside it. A citation in a note keeps a copy of
 * them, so the note reads the same offline.
 */

export type Work = { title: string; authors: string; year: string; publisher: string; doi: string; isbn: string; url: string; what: string }
export type LookupResult = { work: Work } | { error: 'offline' | 'missing' | 'not-an-id' }
export type Citer = { type: string; id: string; title: string; kind: string }

const AGENT = 'Haligtree (a commonplace book app)'
const EMPTY: Work = { title: '', authors: '', year: '', publisher: '', doi: '', isbn: '', url: '', what: '' }

/**
 * Where the lookups go. A test run never goes out: it asks the probe's own
 * server (HALIGTREE_QA_CITE), or with none is offline.
 */
function base(which: 'crossref' | 'openlibrary'): string | null {
  if (process.env.HALIGTREE_QA_AWAY !== undefined) return process.env.HALIGTREE_QA_CITE ? `${process.env.HALIGTREE_QA_CITE}/${which}` : null
  return which === 'crossref' ? 'https://api.crossref.org' : 'https://openlibrary.org'
}

async function get(url: string): Promise<Response> {
  const init = { signal: AbortSignal.timeout(8000), headers: { 'User-Agent': AGENT, Accept: 'application/json' } }
  return url.startsWith('http://127.0.0.1') ? fetch(url, init) : fetchOutside(url, init)
}

async function byDoi(doi: string): Promise<LookupResult> {
  const at = base('crossref')
  if (!at) return { error: 'offline' }
  try {
    const response = await get(`${at}/works/${encodeURIComponent(doi)}`)
    if (response.status === 404) return { error: 'missing' }
    if (!response.ok) return { error: 'offline' }
    const { message: one } = (await response.json()) as { message: { title?: string[]; author?: { given?: string; family?: string; name?: string }[]; issued?: { 'date-parts'?: number[][] }; publisher?: string; 'container-title'?: string[]; type?: string } }
    const title = one.title?.[0]?.trim()
    if (!title) return { error: 'missing' }
    const authors = (one.author ?? []).map((who) => who.name ?? [who.given, who.family].filter(Boolean).join(' ')).filter(Boolean).join('; ')
    const journal = one['container-title']?.[0]?.trim()
    return { work: { ...EMPTY, title, authors, year: String(one.issued?.['date-parts']?.[0]?.[0] ?? ''), publisher: journal || one.publisher || '', doi, url: `https://doi.org/${doi}`, what: one.type === 'journal-article' ? 'Article' : one.type?.startsWith('book') ? 'Book' : '' } }
  } catch {
    return { error: 'offline' }
  }
}

async function byIsbn(isbn: string): Promise<LookupResult> {
  const at = base('openlibrary')
  if (!at) return { error: 'offline' }
  try {
    const response = await get(`${at}/api/books?bibkeys=ISBN:${isbn}&format=json&jscmd=data`)
    if (!response.ok) return { error: 'offline' }
    const found = ((await response.json()) as Record<string, { title?: string; authors?: { name?: string }[]; publishers?: { name?: string }[]; publish_date?: string; url?: string }>)[`ISBN:${isbn}`]
    if (!found?.title) return { error: 'missing' }
    return { work: { ...EMPTY, title: found.title, authors: (found.authors ?? []).map((who) => who.name ?? '').filter(Boolean).join('; '), year: /\d{4}/.exec(found.publish_date ?? '')?.[0] ?? '', publisher: found.publishers?.[0]?.name ?? '', isbn, url: found.url ?? '', what: 'Book' } }
  } catch {
    return { error: 'offline' }
  }
}

const clean = (work: unknown): Work | null => {
  if (!work || typeof work !== 'object') return null
  const out = { ...EMPTY }
  for (const key of Object.keys(EMPTY) as (keyof Work)[]) {
    const value = (work as Record<string, unknown>)[key]
    if (typeof value === 'string') out[key] = value.trim().slice(0, 400)
  }
  return out.title ? out : null
}

export function registerCite(): void {
  const db = database()
  const had = new Set((db.prepare('pragma table_info(source_pages)').all() as { name: string }[]).map((one) => one.name))
  for (const column of ['authors', 'publisher', 'doi', 'isbn', 'url']) if (!had.has(column)) db.exec(`alter table source_pages add column ${column} text not null default ''`)

  ipcMain.handle('haligtree:cite:lookup', async (_event, text: unknown): Promise<LookupResult> => {
    if (typeof text !== 'string') return { error: 'not-an-id' }
    const doi = doiIn(text)
    if (doi) return byDoi(doi)
    const isbn = isbnIn(text)
    if (isbn) return byIsbn(isbn)
    return { error: 'not-an-id' }
  })

  const works = (): Work[] =>
    (db.prepare("select name as title, authors, born as year, publisher, doi, isbn, url, what from source_pages where field = 'medium' order by updated_at desc").all() as Work[])

  ipcMain.handle('haligtree:works', (): Work[] => works())

  /** A work kept as a source page by its title; its facts set, its thoughts left as they were. */
  ipcMain.handle('haligtree:work:save', (_event, given: unknown): Work | null => {
    const work = clean(given)
    if (!work) return null
    db.prepare(`insert into source_pages (field, key, name, thoughts, what, born, authors, publisher, doi, isbn, url, updated_at) values ('medium', ?, ?, '', ?, ?, ?, ?, ?, ?, ?, ?)
      on conflict(field, key) do update set what = coalesce(nullif(excluded.what, ''), what), born = coalesce(nullif(excluded.born, ''), born), authors = coalesce(nullif(excluded.authors, ''), authors),
      publisher = coalesce(nullif(excluded.publisher, ''), publisher), doi = coalesce(nullif(excluded.doi, ''), doi), isbn = coalesce(nullif(excluded.isbn, ''), isbn), url = coalesce(nullif(excluded.url, ''), url), updated_at = excluded.updated_at`)
      .run(personKey(work.title), work.title, work.what, work.year, work.authors, work.publisher, work.doi, work.isbn, work.url, new Date().toISOString())
    changed()
    return works().find((one) => personKey(one.title) === personKey(work.title)) ?? work
  })

  /** The notes that cite a work, read from the citations in their words. */
  ipcMain.handle('haligtree:work:citers', (_event, title: unknown): Citer[] => {
    if (typeof title !== 'string' || !personKey(title)) return []
    const key = personKey(title)
    const rows = [
      ...db.prepare(`select 'capture' as type, id, kind, ${LABEL} as label, body from captures where status != 'discarded' and body like '%"citation"%'`).all(),
      ...db.prepare(`select tier as type, id, kind, coalesce(nullif(nullif(trim(title), 'Untitled'), ''), label('', body)) as label, body from nuggets where binned_at is null and body like '%"citation"%'`).all()
    ] as { type: string; id: string; kind: string; label: string; body: string }[]
    const cites = (node: unknown): boolean => {
      if (!node || typeof node !== 'object') return false
      const one = node as { type?: string; attrs?: { work?: string }; content?: unknown[] }
      if (one.type === 'citation' && personKey(one.attrs?.work ?? '') === key) return true
      return Array.isArray(one.content) && one.content.some(cites)
    }
    return rows.filter((row) => {
      try {
        return cites(JSON.parse(row.body))
      } catch {
        return false
      }
    }).map(({ type, id, kind, label }) => ({ type, id, kind, title: label || 'Untitled' }))
  })
}
