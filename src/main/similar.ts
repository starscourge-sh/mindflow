import { ipcMain } from 'electron'
import { database } from './captures'
import { similar, type Doc } from './likeness'

/** Notes like the one open, for its side panel (likeness.ts). */
export function registerSimilar(): void {
  const db = database()
  ipcMain.handle('haligtree:like-notes', (_event, id: unknown) => {
    const docs = db.prepare(
      `select 'capture' as type, id, label(title, body, named) as title, kind, words(id, body) as text from captures where status != 'discarded' and private = 0
       union all
       select tier, id, coalesce(nullif(title, ''), label('', body)), kind, words(id, body) from nuggets where tier != 'card' and private = 0 and binned_at is null`
    ).all() as Doc[]
    return similar(docs, String(id))
  })
}
