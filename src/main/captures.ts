import { app, BrowserWindow, ipcMain } from 'electron'
import { randomUUID } from 'crypto'
import { DatabaseSync } from 'node:sqlite'
import { join } from 'path'

import { backUp, writeMarkdown } from './backup'
import { chunks, createdOf, titleOfMarkdown } from './import'

/** What the list shows. The body is only read when one is opened. */
export interface CaptureMeta {
  id: string
  /** Counts up from 1, for the short `MF-30` handle. */
  number: number
  title: string
  kind: string
  status: string
  /** The file an imported capture came from; empty for one typed here. */
  source: string
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

const LIST = 'id, number, title, kind, status, source, captured_at as capturedAt'

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
  // Where an imported capture came from: the file's name. Empty for one typed here.
  try {
    db.exec("alter table captures add column source text not null default ''")
  } catch {
    // Already there.
  }
  // One row each time a window is shown: the only measure that notices the
  // app has stopped being opened at all.
  db.exec('create table if not exists app_opens (opened_at text not null, surface text not null)')
  // A nugget: a capture worth keeping, copied out of it. The capture stays as
  // it was; promotion never moves or consumes it. The weight is how often hints
  // pick it, raised and lowered by the hint's up and down.
  db.exec(`
    create table if not exists nuggets (
      id               text primary key,
      capture_id       text,
      kind             text not null,
      body             text,
      created_at       text not null,
      last_visited_at  text,
      surfacing_weight real not null default 1
    );
    create table if not exists hint_events (
      nugget_id text not null,
      shown_at  text not null,
      reaction  text
    );
  `)

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

  // Search: the words anywhere in the title or the body, newest first, with the
  // body for the preview. Nothing typed gives the most recent.
  ipcMain.handle('captures:find', (_event, query: unknown) =>
    db
      .prepare(`select ${LIST}, body from captures where title like ? or body like ? order by captured_at desc limit 50`)
      .all(`%${query}%`, `%${query}%`)
      .map((row) => ({ ...row, body: JSON.parse(row.body as string) }))
  )

  ipcMain.handle('captures:get', (_event, id: unknown) => {
    const row = db.prepare(`select ${LIST}, body from captures where id = ?`).get(String(id))
    return row ? { ...row, body: JSON.parse(row.body as string) } : null
  })

  ipcMain.handle('captures:create', (_event, patch: CapturePatch) => {
    const { id, number } = insert(patch, new Date().toISOString())
    if (patch.markdown !== undefined) void writeMarkdown(number, patch.markdown)
    changed()
    return id
  })

  // Three open captures, leaning old: the rot sampler. Random, so it is a
  // sample and never a queue to finish; weighted by age, so the old pile
  // comes up more than what you wrote this morning.
  ipcMain.handle('captures:rot', () =>
    db
      .prepare(
        `select ${LIST}, body from captures where status = 'open'
         order by (julianday('now') - julianday(captured_at) + 1) * (abs(random()) % 1000) desc
         limit 3`
      )
      .all()
      .map((row) => ({ ...row, body: JSON.parse(row.body as string) }))
  )

  // Only the fields passed are written. `coalesce` keeps the rest as they were.
  // Promote: a nugget made from the capture, and the capture marked as having
  // taken that exit. Once: promoting it again from another window adds nothing.
  ipcMain.handle('captures:promote', (_event, id: unknown) => {
    db.prepare(
      `insert into nuggets (id, capture_id, kind, body, created_at)
       select ?, id, kind, body, ? from captures where id = ? and status != 'promoted'`
    ).run(randomUUID(), new Date().toISOString(), String(id))
    db.prepare("update captures set status = 'promoted' where id = ?").run(String(id))
    changed()
  })

  // One hint: a nugget, picked at random but leaning towards the ones not seen
  // for longest and the ones voted up. Logged, so a stop rate can be worked out.
  ipcMain.handle('hints:next', () => {
    const nugget = db
      .prepare(
        `select id, kind, body from nuggets
         order by (julianday('now') - julianday(coalesce(last_visited_at, '2000-01-01')))
                  * surfacing_weight * (abs(random()) % 1000) desc
         limit 1`
      )
      .get()
    if (!nugget) return null
    const now = new Date().toISOString()
    db.prepare('update nuggets set last_visited_at = ? where id = ?').run(now, nugget.id as string)
    const { lastInsertRowid } = db.prepare('insert into hint_events (nugget_id, shown_at) values (?, ?)').run(nugget.id as string, now)
    return { ...nugget, body: JSON.parse(nugget.body as string), event: Number(lastInsertRowid) }
  })

  // Up makes it come back more, down less. Never a schedule, never a grade.
  ipcMain.handle('hints:react', (_event, event: unknown, id: unknown, reaction: unknown) => {
    const up = reaction === 'up'
    db.prepare('update nuggets set surfacing_weight = surfacing_weight * ? where id = ?').run(up ? 1.5 : 1 / 1.5, String(id))
    db.prepare('update hint_events set reaction = ? where rowid = ?').run(up ? 'up' : 'down', Number(event))
  })

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

/** One new row, numbered after the last. */
function insert(patch: CapturePatch & { source?: string }, capturedAt: string): { id: string; number: number } {
  const id = randomUUID()
  const { number } = db
    .prepare(
      `insert into captures (id, number, title, kind, body, captured_at, source)
       values (?, (select coalesce(max(number), 0) + 1 from captures), ?, ?, ?, ?, ?)
       returning number`
    )
    .get(id, patch.title ?? '', patch.kind ?? 'note', JSON.stringify(patch.body ?? null), capturedAt, patch.source ?? '') as { number: number }
  return { id, number }
}

/** A window was shown. */
export function recordOpen(surface: string): void {
  db?.prepare('insert into app_opens (opened_at, surface) values (?, ?)').run(new Date().toISOString(), surface)
}

/**
 * A Markdown file's jottings, as captures. Each is dated when the file says it
 * was made, and remembers the file it came from. A jotting already imported
 * from that file is skipped, so importing the same file twice adds nothing.
 */
export function importMarkdown(name: string, text: string, kind: string): number {
  const at = createdOf(text) ?? new Date().toISOString()
  const seen = db.prepare('select 1 from captures where source = ? and body = ?')
  let added = 0
  for (const chunk of chunks(text)) {
    const body = JSON.stringify(chunk)
    if (seen.get(name, body)) continue
    const link = /^\s*[-*]?\s*\[?https?:\/\/\S+$/.test(chunk)
    const { number } = insert({ title: titleOfMarkdown(chunk), kind: link ? 'link' : kind, body: chunk, source: name }, new Date(at).toISOString())
    // Already Markdown, so the readable copy beside the backups is the chunk itself.
    void writeMarkdown(number, chunk)
    added += 1
  }
  if (added) changed()
  return added
}
