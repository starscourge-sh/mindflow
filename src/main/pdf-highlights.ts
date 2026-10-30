import { ipcMain } from 'electron'
import { randomUUID } from 'crypto'
import type { DatabaseSync } from 'node:sqlite'
import { database } from './captures'

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
    union all select body, created_at from nuggets where binned_at is null and tier != 'card' and body like '%"attachment"%' and body like '%.pdf%'`).all() as { body: string; at: string }[]
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
 * Words kept from a PDF: where they are (the page, and where on the page's
 * text they start and end, which no zoom changes) and the words themselves,
 * so a mark can still be found if the offsets ever drift. Each one names the
 * gem it made.
 */
export function registerPdfHighlights(): void {
  const db = database()
  db.exec('create table if not exists pdf_highlights (id text primary key, src text not null, page integer not null, quote text not null, start integer not null, end integer not null, gem_id text, created_at text not null)')
  ipcMain.handle('haligtree:pdf:highlights', (_event, src: unknown) =>
    db.prepare('select id, page, quote, start, end, gem_id as gemId from pdf_highlights where src = ? order by page, start').all(String(src)))
  ipcMain.handle('haligtree:pdf:highlight', (_event, src: unknown, mark: unknown) => {
    const { id: given, page, quote, start, end, gemId } = (mark ?? {}) as { id?: string; page?: number; quote?: string; start?: number; end?: number; gemId?: string }
    if (!src || !quote || !Number.isInteger(page) || !Number.isInteger(start) || !Number.isInteger(end)) return null
    const id = typeof given === 'string' && given ? given : randomUUID()
    db.prepare('insert into pdf_highlights (id, src, page, quote, start, end, gem_id, created_at) values (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(id, String(src), page!, quote, start!, end!, gemId ?? null, new Date().toISOString())
    return id
  })
  ipcMain.handle('haligtree:pdf:unhighlight', (_event, id: unknown) => db.prepare('delete from pdf_highlights where id = ?').run(String(id)).changes > 0)
  // The title read out of a PDF as it opens, kept so search finds it by that.
  db.exec(TITLES)
  ipcMain.handle('haligtree:pdf:title', (_event, src: unknown, title: unknown) => {
    if (typeof src !== 'string' || typeof title !== 'string' || !title.trim()) return false
    if ((db.prepare('select title from pdf_titles where src = ?').get(src) as { title: string } | undefined)?.title === title.trim()) return false
    db.prepare('insert or replace into pdf_titles (src, title) values (?, ?)').run(src, title.trim())
    return true
  })
}
