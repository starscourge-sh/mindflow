import type { DatabaseSync } from 'node:sqlite'
import { cleanTitle } from './clean-title'
import { AUDIO_ENDS, PICTURE_ENDS, VIDEO_ENDS, type MediaKind } from './media-words'

/**
 * What search finds besides notes: the PDFs kept in them, articles kept from
 * the web, files added to Media and the works a note cites. Each is a read of
 * the book and nothing else (no Electron in it), so the reading thread
 * (reader.ts) lists them as main does.
 */

/** A PDF's own title, as the reader read it out of the file: what search finds it by. */
export const PDF_TITLES = 'create table if not exists pdf_titles (src text primary key, title text not null)'
/** An article kept from the web: its words and pictures, read offline in the reader. */
export const WEB_ARTICLES = 'create table if not exists web_articles (id text primary key, href text unique not null, title text not null, byline text not null, site text not null, published text not null, html text not null, saved_at text not null)'
/** What Media was given with no note: the file is in the store; this says it belongs to the book. */
export const MEDIA_ADDED = 'create table if not exists media_added (src text primary key, name text not null, size integer not null, added_at text not null, binned_at text)'
/** The three made as the book opens, by main, its one writer: the reads below never make a table. */
export const makeFindTables = (db: DatabaseSync): void => db.exec(`${PDF_TITLES}; ${WEB_ARTICLES}; ${MEDIA_ADDED}`)

type Found<T extends string> = { type: T; id: string; number: null; kind: string; status: string; source: string; attribution: string | null; label: string; capturedAt: string; text: string }

export type AddedRow = { src: string; name: string; size: number; at: string }
export const addedRows = (db: DatabaseSync): AddedRow[] => db.prepare('select src, name, size, added_at as at from media_added where binned_at is null').all() as AddedRow[]

const END_OF = /\.([a-z0-9]+)$/
/** What a stored file is by its ending alone, as an added file is known: anything not a picture, PDF, recording or video is a document. */
export const kindByEnd = (src: string): MediaKind => {
  const end = END_OF.exec(src)?.[1] ?? ''
  return end === 'gif' ? 'gif' : end === 'pdf' ? 'pdf' : AUDIO_ENDS.includes(end) ? 'audio' : PICTURE_ENDS.includes(end) ? 'picture' : VIDEO_ENDS.includes(end) ? 'video' : 'document'
}

/** The PDFs added with no note, as search and the shelf take them. */
export const addedPdfs = (db: DatabaseSync): AddedRow[] => addedRows(db).filter((one) => kindByEnd(one.src) === 'pdf')

/**
 * Every PDF kept in a note or gem or added to Media, once each, as search lists it: found by
 * its title (once read) and the name it arrived under, opened in the reader.
 * Its id is the reader's own address for it, `src|name`.
 */
export function pdfsToFind(db: DatabaseSync): Found<'pdf'>[] {
  const titles = new Map((db.prepare('select src, title from pdf_titles').all() as { src: string; title: string }[]).map((one) => [one.src, one.title]))
  const rows = db.prepare(`select body, captured_at as at from captures where status != 'discarded' and body like '%"attachment"%' and body like '%.pdf%'
    union all select body, created_at from nuggets where binned_at is null and tier not in ('card', 'deck') and body like '%"attachment"%' and body like '%.pdf%'`).all() as { body: string; at: string }[]
  const found = new Map<string, Found<'pdf'>>()
  type Node = { type?: string; attrs?: Record<string, unknown>; content?: Node[] }
  const walk = (node: Node | null | undefined, at: string): void => {
    if (!node || typeof node !== 'object') return
    const src = String(node.attrs?.src ?? ''), name = String(node.attrs?.name ?? '')
    const pdf = node.type === 'attachment' && /^(haligtree|mindflow):\/\/assets\//.test(src) && (/\.pdf$/i.test(name) || /\.pdf$/i.test(src))
    // One PDF kept under two names is found by either.
    const known = pdf ? found.get(src) : undefined
    if (known && name) known.text += ` ${name.toLowerCase()}`
    else if (pdf) {
      const title = titles.get(src) ?? (cleanTitle(name.replace(/\.pdf$/i, '')) || name.replace(/\.pdf$/i, '') || 'PDF')
      found.set(src, { type: 'pdf', id: `${src}|${name}`, number: null, kind: 'pdf', status: 'open', source: '', attribution: null, label: title, capturedAt: at, text: `${title} ${name}`.toLowerCase() })
    }
    node.content?.forEach((one) => walk(one, at))
  }
  for (const row of rows) {
    try {
      walk(JSON.parse(row.body) as Node, row.at)
    } catch {
      // A body kept as Markdown holds no PDF block.
    }
  }
  // Added to Media with no note: a book on the shelf all the same. Its name there is the name it came under.
  for (const one of addedPdfs(db)) {
    const known = found.get(one.src)
    if (known) {
      known.id = `${one.src}|${one.name}`
      if (one.at > known.capturedAt) known.capturedAt = one.at
      continue
    }
    const title = titles.get(one.src) ?? (cleanTitle(one.name.replace(/\.pdf$/i, '')) || one.name.replace(/\.pdf$/i, '') || 'PDF')
    found.set(one.src, { type: 'pdf', id: `${one.src}|${one.name}`, number: null, kind: 'pdf', status: 'open', source: '', attribution: null, label: title, capturedAt: one.at, text: `${title} ${one.name}`.toLowerCase() })
  }
  return [...found.values()]
}

/** Every kept article, as ⌘K lists it: found by its title, site and byline. */
export function articlesToFind(db: DatabaseSync): Found<'web'>[] {
  const rows = db.prepare('select href, title, byline, site, saved_at as at from web_articles').all() as { href: string; title: string; byline: string; site: string; at: string }[]
  // Its id is the reader's own address for it: the page's link.
  return rows.map((one) => ({ type: 'web', id: one.href, number: null, kind: 'web', status: 'open', source: one.site, attribution: one.site, label: one.title, capturedAt: one.at, text: `${one.title} ${one.site} ${one.byline}`.toLowerCase() }))
}

/**
 * Pictures and recordings added with no note, as search lists them: found by
 * name and, for a picture, by the words the Mac read in it, as any note's are.
 * (An added PDF is found as every PDF is, above.)
 */
export function mediaToFind(db: DatabaseSync, pictureWords: (src: unknown) => string): (Found<'media'> & { raw: string })[] {
  return addedRows(db).filter((one) => kindByEnd(one.src) !== 'pdf').map((one) => {
    const label = one.name.replace(/\.[^.]+$/, '') || one.name
    const raw = `${label}${pictureWords(one.src)}`
    return { type: 'media', id: `${one.src}|${one.name}`, number: null, kind: kindByEnd(one.src) ?? 'picture', status: 'open', source: '', attribution: null, label, capturedAt: one.at, text: `${raw} ${one.name}`.toLowerCase(), raw }
  })
}

/** Works for ⌘K: found by title, author, DOI or ISBN; opened on their own page. */
export function worksToFind(db: DatabaseSync): (Found<'work'> & { raw: string })[] {
  const rows = db.prepare("select name, authors, born, doi, isbn, updated_at from source_pages where field = 'medium' and (authors != '' or doi != '' or isbn != '')").all() as { name: string; authors: string; born: string; doi: string; isbn: string; updated_at: string }[]
  return rows.map((one) => {
    const raw = [one.name, one.authors, one.doi, one.isbn].filter(Boolean).join(' ')
    return { type: 'work', id: one.name, number: null, kind: 'work', status: 'open', source: [one.authors.split(';').map((who) => who.trim()).join(', '), one.born].filter(Boolean).join(', '), attribution: null, label: one.name, capturedAt: one.updated_at, text: raw.toLowerCase(), raw }
  })
}
