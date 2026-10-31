import { ipcMain } from 'electron'
import { randomUUID } from 'crypto'
import { readFile, writeFile } from 'fs/promises'
import { join } from 'path'
import { assetsDir } from './pictures'
import { fetchOutside } from './outside'
import type { DatabaseSync } from 'node:sqlite'
import { LABEL, database } from './captures'
import { articlesToFind } from './web-articles'

/** A PDF's own title, as the reader read it out of the file: what search finds it by. */
const TITLES = 'create table if not exists pdf_titles (src text primary key, title text not null)'

type FoundPdf = { type: 'pdf'; id: string; number: null; kind: string; status: string; source: string; attribution: string | null; label: string; capturedAt: string; text: string }

/**
 * Every PDF kept in a note or gem, once each, as search lists it: found by
 * its title (once read) and the name it arrived under, opened in the reader.
 * Its id is the reader's own address for it, `src|name`.
 */
export function pdfsToFind(db: DatabaseSync): FoundPdf[] {
  db.exec(TITLES)
  const titles = new Map((db.prepare('select src, title from pdf_titles').all() as { src: string; title: string }[]).map((one) => [one.src, one.title]))
  const rows = db.prepare(`select body, captured_at as at from captures where status != 'discarded' and body like '%"attachment"%' and body like '%.pdf%'
    union all select body, created_at from nuggets where binned_at is null and tier not in ('card', 'deck') and body like '%"attachment"%' and body like '%.pdf%'`).all() as { body: string; at: string }[]
  const found = new Map<string, FoundPdf>()
  type Node = { type?: string; attrs?: Record<string, unknown>; content?: Node[] }
  const walk = (node: Node | null | undefined, at: string): void => {
    if (!node || typeof node !== 'object') return
    const src = String(node.attrs?.src ?? ''), name = String(node.attrs?.name ?? '')
    const pdf = node.type === 'attachment' && /^(haligtree|mindflow):\/\/assets\//.test(src) && (/\.pdf$/i.test(name) || /\.pdf$/i.test(src))
    // One PDF kept under two names is found by either.
    const known = pdf ? found.get(src) : undefined
    if (known && name) known.text += ` ${name.toLowerCase()}`
    else if (pdf) {
      const title = titles.get(src) ?? (name.replace(/\.pdf$/i, '') || 'PDF')
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
  return [...found.values()]
}

/**
 * What a link to a file points at, `pdf:` and the PDF's address or `web:`
 * and a kept article's link: its title and the reader's id for it, or
 * undefined when it is not one, or no longer kept. Any note can link to them.
 */
export function fileLink(db: DatabaseSync, link: string): { type: 'pdf' | 'web'; id: string; title: string } | undefined {
  const at = link.indexOf(':')
  const type = link.slice(0, at), id = link.slice(at + 1)
  if (type === 'pdf') {
    const found = pdfsToFind(db).find((one) => one.id.startsWith(`${id}|`))
    return found ? { type, id, title: found.label } : undefined
  }
  const article = type === 'web' ? articlesToFind(db).find((one) => one.id === id) : undefined
  return article ? { type: 'web', id, title: article.label } : undefined
}

/**
 * Words kept from a PDF: where they are (the page, and where on the page's
 * text they start and end, which no zoom changes) and the words themselves,
 * so a mark can still be found if the offsets ever drift. Each one names the
 * gem it made.
 */
export function registerPdfHighlights(): void {
  const db = database()
  // One store for every reader: a PDF's marks by page, an article's (src is
  // its link, page 0) by where they sit in its words. The words just before
  // and after each mark find it again if the page's text ever shifts.
  db.exec("create table if not exists pdf_highlights (id text primary key, src text not null, page integer not null, quote text not null, start integer not null, end integer not null, gem_id text, created_at text not null, prefix text not null default '', suffix text not null default '')")
  const columns = (db.prepare('pragma table_info(pdf_highlights)').all() as { name: string }[]).map((one) => one.name)
  for (const name of ['prefix', 'suffix']) if (!columns.includes(name)) db.exec(`alter table pdf_highlights add column ${name} text not null default ''`)
  // A mark's colour (none is the book's own) and a note written on it.
  for (const name of ['color', 'note']) if (!columns.includes(name)) db.exec(`alter table pdf_highlights add column ${name} text`)
  ipcMain.handle('haligtree:pdf:highlights', (_event, src: unknown) =>
    db.prepare('select id, page, quote, start, end, prefix, suffix, gem_id as gemId, color, note from pdf_highlights where src = ? order by page, start').all(String(src)))
  ipcMain.handle('haligtree:pdf:highlight', (_event, src: unknown, mark: unknown) => {
    const { id: given, page, quote, start, end, gemId, prefix, suffix, color } = (mark ?? {}) as { id?: string; page?: number; quote?: string; start?: number; end?: number; gemId?: string; prefix?: string; suffix?: string; color?: string | null }
    if (!src || !quote || !Number.isInteger(page) || !Number.isInteger(start) || !Number.isInteger(end)) return null
    const id = typeof given === 'string' && given ? given : randomUUID()
    db.prepare('insert into pdf_highlights (id, src, page, quote, start, end, gem_id, created_at, prefix, suffix, color) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(id, String(src), page!, quote, start!, end!, gemId ?? null, new Date().toISOString(), String(prefix ?? ''), String(suffix ?? ''), typeof color === 'string' && color ? color : null)
    return id
  })
  // A mark changed after it was made: its colour, the gem it became, its note.
  ipcMain.handle('haligtree:pdf:mark', (_event, id: unknown, change: unknown) => {
    const given = (change ?? {}) as { color?: string | null; gemId?: string | null; note?: string | null }
    const sets = Object.entries({ color: given.color, gem_id: given.gemId, note: given.note }).filter(([, value]) => value !== undefined)
    if (!sets.length) return false
    return db.prepare(`update pdf_highlights set ${sets.map(([name]) => `${name} = ?`).join(', ')} where id = ?`)
      .run(...sets.map(([, value]) => (typeof value === 'string' && value ? value : null)), String(id)).changes > 0
  })
  ipcMain.handle('haligtree:pdf:unhighlight', (_event, id: unknown) => db.prepare('delete from pdf_highlights where id = ?').run(String(id)).changes > 0)
  // Where each PDF was last read: its page, how many it has, and when, so it opens where you left it.
  db.exec('create table if not exists pdf_reading (src text primary key, page integer not null, pages integer not null, read_at text not null)')
  ipcMain.handle('haligtree:pdf:place', (_event, src: unknown) =>
    db.prepare('select page, pages, read_at as readAt from pdf_reading where src = ?').get(String(src)) ?? null)
  ipcMain.handle('haligtree:pdf:read', (_event, src: unknown, page: unknown, pages: unknown) => {
    if (typeof src !== 'string' || !Number.isInteger(page) || !Number.isInteger(pages) || (page as number) < 1) return false
    db.prepare('insert or replace into pdf_reading (src, page, pages, read_at) values (?, ?, ?, ?)').run(src, page as number, pages as number, new Date().toISOString())
    return true
  })
  // What a book's Details list: every note and gem that holds it or links into it, newest first, and when it first came in.
  ipcMain.handle('haligtree:pdf:cited', (_event, src: unknown) => {
    const name = /assets\/([a-f0-9]{64}\.pdf)$/i.exec(String(src))?.[1] ?? (/^https?:/.test(String(src)) ? encodeURIComponent(String(src)) : null)
    if (!name) return []
    const like = `%${name}%`
    return db.prepare(`select 'capture' as type, id, ${LABEL} as title, captured_at as at from captures where status != 'discarded' and body like ?
      union all select tier as type, id, coalesce(nullif(title, ''), label('', body)) as title, created_at as at from nuggets where binned_at is null and superseded_by is null and body like ?
      order by at desc`).all(like, like)
  })
  // A PDF's cover: its first page drawn once by the reader's own renderer and
  // kept beside the file in the book's store (named so no clean-up of unused
  // files ever counts it), so every card shows it at once after that.
  db.exec('create table if not exists pdf_covers (src text primary key, file text not null)')
  // What the cover's drawing read out of the file: its author and how many pages it has.
  const coverColumns = (db.prepare('pragma table_info(pdf_covers)').all() as { name: string }[]).map((one) => one.name)
  if (!coverColumns.includes('author')) db.exec("alter table pdf_covers add column author text not null default ''")
  if (!coverColumns.includes('pages')) db.exec('alter table pdf_covers add column pages integer')
  ipcMain.handle('haligtree:pdf:cover', async (_event, src: unknown) => {
    const row = db.prepare('select c.file, t.title from pdf_covers c left join pdf_titles t on t.src = c.src where c.src = ?').get(String(src)) as { file: string; title: string | null } | undefined
    const image = row ? await readFile(join(assetsDir(), row.file)).catch(() => null) : null
    return image ? { image: `data:image/jpeg;base64,${image.toString('base64')}`, title: row?.title ?? null } : null
  })
  ipcMain.handle('haligtree:pdf:cover:set', async (_event, src: unknown, image: unknown, about: unknown) => {
    const { author, pages } = (about ?? {}) as { author?: string; pages?: number }
    const name = /assets\/([a-f0-9]{64})\.pdf$/i.exec(String(src))?.[1]
    const data = /^data:image\/jpeg;base64,(.+)$/.exec(String(image))?.[1]
    if (!name || !data) return false
    const file = `${name}.cover.jpg`
    await writeFile(join(assetsDir(), file), Buffer.from(data, 'base64'))
    db.prepare('insert or replace into pdf_covers (src, file, author, pages) values (?, ?, ?, ?)').run(String(src), file, String(author ?? ''), Number.isInteger(pages) ? pages! : null)
    return true
  })
  // The library: every PDF kept, once each, with what its card and inspector say: title, author,
  // pages, where you are, when you last read it, how many highlights and how many notes hold it.
  ipcMain.handle('haligtree:pdf:library', () => {
    const reading = new Map((db.prepare('select src, page, pages, read_at as readAt from pdf_reading').all() as { src: string; page: number; pages: number; readAt: string }[]).map((one) => [one.src, one]))
    const marks = new Map((db.prepare('select src, count(*) as n from pdf_highlights group by src').all() as { src: string; n: number }[]).map((one) => [one.src, one.n]))
    const covers = new Map((db.prepare('select src, author, pages from pdf_covers').all() as { src: string; author: string; pages: number | null }[]).map((one) => [one.src, one]))
    return pdfsToFind(db).map((one) => {
      const src = one.id.slice(0, one.id.indexOf('|'))
      const read = reading.get(src)
      const cover = covers.get(src)
      return { src, name: one.id.slice(one.id.indexOf('|') + 1), title: one.label, author: cover?.author ?? '', pages: read?.pages ?? cover?.pages ?? null, page: read?.page ?? null, readAt: read?.readAt ?? null, addedAt: one.capturedAt, highlights: marks.get(src) ?? 0 }
    })
  })
  // Words looked up on Wikipedia: its free summary of the article they name (CC BY-SA, said with its link), asked from here so no page talks to the internet itself.
  // Each answer is kept here by the words asked, so a word looked up again opens at once and offline;
  // one more than 30 days old is shown as kept and asked again behind it.
  db.exec('create table if not exists wiki_answers (term text primary key, answer text not null, at text not null)')
  const askWiki = async (term: string): Promise<unknown> => {
    const answer = await wikiOnline(term)
    if (answer && !('offline' in answer)) db.prepare('insert or replace into wiki_answers (term, answer, at) values (?, ?, ?)').run(term.toLowerCase(), JSON.stringify(answer), new Date().toISOString())
    return answer
  }
  ipcMain.handle('haligtree:wiki', async (_event, raw: unknown) => {
    const term = typeof raw === 'string' ? raw.replace(/\s+/g, ' ').trim() : ''
    if (!term || term.length > 120) return null
    const row = db.prepare('select answer, at from wiki_answers where term = ?').get(term.toLowerCase()) as { answer: string; at: string } | undefined
    if (!row) return askWiki(term)
    if (Date.now() - Date.parse(row.at) > 30 * 86_400_000) void askWiki(term)
    return JSON.parse(row.answer)
  })
  // The title read out of a PDF as it opens, kept so search finds it by that.
  db.exec(TITLES)
  ipcMain.handle('haligtree:pdf:title', (_event, src: unknown, title: unknown) => {
    if (typeof src !== 'string' || typeof title !== 'string' || !title.trim()) return false
    if ((db.prepare('select title from pdf_titles where src = ?').get(src) as { title: string } | undefined)?.title === title.trim()) return false
    db.prepare('insert or replace into pdf_titles (src, title) values (?, ?)').run(src, title.trim())
    return true
  })
}

/** Wikipedia's summary of the article the words name, asked now: found, missing, or offline. */
async function wikiOnline(term: string): Promise<{ missing: true } | { offline: true } | { title: string; description: string; extract: string; picture: string | null; url: string }> {
  const base = (process.env.HALIGTREE_USER_DATA && process.env.HALIGTREE_QA_WIKI) || 'https://en.wikipedia.org/api/rest_v1/page/summary/'
  try {
    const url = `${base}${encodeURIComponent(term.replace(/ /g, '_'))}?redirect=true`
    const response = base.startsWith('http://127.0.0.1') ? await fetch(url, { signal: AbortSignal.timeout(5000) }) : await fetchOutside(url, { signal: AbortSignal.timeout(5000), headers: { 'Api-User-Agent': 'Haligtree (a commonplace book)' } })
    if (response.status === 404) return { missing: true }
    if (!response.ok) return { offline: true }
    const page = (await response.json()) as { type?: string; title?: string; description?: string; extract?: string; thumbnail?: { source?: string }; content_urls?: { desktop?: { page?: string } } }
    if (!page.extract || page.type === 'disambiguation') return { missing: true }
    // The article's lead picture, only when it lives on Wikimedia Commons (freely licensed); an English-only file can be fair use.
    const picture = page.thumbnail?.source && /^https:\/\/upload\.wikimedia\.org\/wikipedia\/commons\//.test(page.thumbnail.source) ? page.thumbnail.source : null
    return { title: page.title ?? term, description: page.description ?? '', extract: page.extract, picture, url: page.content_urls?.desktop?.page ?? `https://en.wikipedia.org/wiki/${encodeURIComponent(term.replace(/ /g, '_'))}` }
  } catch {
    return { offline: true }
  }
}
