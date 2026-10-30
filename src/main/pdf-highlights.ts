import { ipcMain } from 'electron'
import { randomUUID } from 'crypto'
import { database } from './captures'

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
}
