import { app, BrowserWindow, ipcMain } from 'electron'
import { randomUUID } from 'crypto'
import { DatabaseSync } from 'node:sqlite'
import { join } from 'path'

import { backUp, writeMarkdown } from './backup'

/** What the list shows. The body is only read when one is opened. */
export interface CaptureMeta {
  id: string
  /** Counts up from 1, for the short `MF-30` handle. */
  number: number
  title: string
  kind: string
  status: string
  capturedAt: string
}

export interface Capture extends CaptureMeta {
  /** A TipTap document. */
  body: unknown
}

/**
 * The fields a save may change. `markdown` is not stored: it is the body as
 * text, written out beside the backups so a capture outlives the app.
 */
export type CapturePatch = Partial<Pick<Capture, 'title' | 'kind' | 'status' | 'body'>> & {
  markdown?: string
}

/**
 * Every capture, in one SQLite file beside the app's other data.
 *
 * Only this process opens it. The windows ask over IPC, so there is one
 * writer and nothing to keep in step.
 */
let db: DatabaseSync

const LIST = 'id, number, title, kind, status, captured_at as capturedAt'

/** Tell every window the list changed, so whichever is showing it reloads. */
const changed = (): void => {
  for (const win of BrowserWindow.getAllWindows()) win.webContents.send('captures:changed')
}

export function registerCaptures(): void {
  db = new DatabaseSync(join(app.getPath('userData'), 'mindflow.db'))
  db.exec(`
    create table if not exists captures (
      id          text primary key,
      number      integer,
      title       text not null default '',
      kind        text not null,
      status      text not null default 'open',
      body        text,
      captured_at text not null
    );
    create index if not exists captures_by_time on captures(captured_at desc);
  `)
  // A file made before captures had numbers gets the column, and its rows get
  // numbers in the order they were made. Both do nothing once that is done.
  try {
    db.exec('alter table captures add column number integer')
  } catch {
    // Already there.
  }
  db.exec('update captures set number = rowid where number is null')

  // A copy on every start, and a check each hour so a window left open for
  // days still gets one a day.
  const backUpNow = (): void => void backUp(db).catch((error) => console.error('Backup failed:', error))
  backUpNow()
  setInterval(backUpNow, 60 * 60 * 1000)

  ipcMain.handle('captures:list', () =>
    db.prepare(`select ${LIST} from captures order by captured_at desc`).all()
  )

  // What `@` offers: a title containing the text, or a handle starting with it,
  // so `@login` and `@mf-3` both find things. Newest first, a handful at most.
  ipcMain.handle('captures:search', (_event, query: unknown) =>
    db
      .prepare(
        `select ${LIST} from captures
         where title like ? or ('MF-' || number) like ?
         order by captured_at desc limit 8`
      )
      .all(`%${query}%`, `${query}%`)
  )

  ipcMain.handle('captures:get', (_event, id: unknown) => {
    const row = db.prepare(`select ${LIST}, body from captures where id = ?`).get(String(id))
    return row ? { ...row, body: JSON.parse(row.body as string) } : null
  })

  ipcMain.handle('captures:create', (_event, patch: CapturePatch) => {
    const id = randomUUID()
    const { number } = db
      .prepare(
        `insert into captures (id, number, title, kind, body, captured_at)
         values (?, (select coalesce(max(number), 0) + 1 from captures), ?, ?, ?, ?)
         returning number`
      )
      .get(id, patch.title ?? '', patch.kind ?? 'note', JSON.stringify(patch.body ?? null), new Date().toISOString()) as { number: number }
    if (patch.markdown !== undefined) void writeMarkdown(number, patch.markdown)
    changed()
    return id
  })

  // Only the fields passed are written. `coalesce` keeps the rest as they were.
  ipcMain.handle('captures:save', (_event, id: unknown, patch: CapturePatch) => {
    const row = db.prepare(
      `update captures set
         title  = coalesce(?, title),
         kind   = coalesce(?, kind),
         status = coalesce(?, status),
         body   = coalesce(?, body)
       where id = ?
       returning number`
    ).get(
      patch.title ?? null,
      patch.kind ?? null,
      patch.status ?? null,
      patch.body === undefined ? null : JSON.stringify(patch.body),
      String(id)
    )
    if (row && patch.markdown !== undefined) void writeMarkdown(row.number as number, patch.markdown)
    changed()
  })
}
