import { app, BrowserWindow, ipcMain } from 'electron'
import { randomUUID } from 'crypto'
import { DatabaseSync } from 'node:sqlite'
import { z } from 'zod'
import Papa from 'papaparse'
import { join } from 'path'
import { hostname } from 'os'

import { backUp, writeMarkdown } from './backup'
import { chunks, createdOf, firstLine, guessKind, kindOf, titleOfMarkdown, unstamp } from './import'

/** What the list shows. The body is only read when one is opened. */
export interface CaptureMeta {
  id: string
  /** Counts up from 1, for the short `MF-30` handle. */
  number: number
  title: string
  /** The title, or the first line when there is none: what lists show. */
  label: string
  kind: string
  status: string
  /** The file an imported capture came from; empty for one typed here. */
  source: string
  /** 1 when it should never surface unasked in quiet hours or safe mode. */
  private: number
  pinnedAt: string | null
  /** When it will pin itself, if a reminder is set. */
  remindAt: string | null
  capturedAt: string
  /** Who said it: "George Orwell", "Kayla". Null means the words are yours. */
  attribution: string | null
  /** The machine it was captured on, and how long writing it took. */
  device: string | null
  elapsedMs: number | null
  /** Where you met it: "YouTube", "book", "meeting". Free text. */
  medium: string | null
  /** When it took an exit; null while open. */
  closedAt: string | null
}

export interface Capture extends CaptureMeta {
  /** A TipTap document. */
  body: unknown
  /** The words as first written, once they have been changed; null until then. */
  original?: unknown
}

/**
 * The fields a save may change. `markdown` is not stored: it is the body as
 * text, written out beside the backups so a capture outlives the app.
 */
export type CapturePatch = Partial<Pick<Capture, 'title' | 'kind' | 'status' | 'body'>> & {
  markdown?: string
  elapsedMs?: number
  /** The capture, nugget or article it was lifted out of, if any. */
  origin?: string
  attribution?: string
  medium?: string
  private?: boolean
  /** Filled in by the app (a link's card), not by you: not an edit to remember. */
  fetched?: boolean
}

/**
 * Every capture, in one SQLite file beside the app's other data.
 *
 * Only this process opens it. The windows ask over IPC, so there is one
 * writer and nothing to keep in step.
 */
let db: DatabaseSync

/** The open database, for the rest of the main process. */
export const database = (): DatabaseSync => db

/**
 * What a window may send to make or change a capture, checked here rather
 * than trusted: `as CapturePatch` is a hope, this is a check. The kinds are
 * the brief's eight.
 */
const KINDS = ['note', 'todo', 'quote', 'word', 'link', 'excerpt', 'decision', 'bit'] as const
const Patch = z.object({
  title: z.string().optional(),
  kind: z.enum(KINDS).optional(),
  status: z.enum(['open', 'promoted', 'resolved', 'discarded']).optional(),
  body: z.unknown().optional(),
  markdown: z.string().optional(),
  /** How long the capture took to write, from the box opening to saving it. */
  elapsedMs: z.number().optional(),
  origin: z.string().optional(),
  attribution: z.string().optional(),
  medium: z.string().optional(),
  private: z.boolean().optional(),
  fetched: z.boolean().optional()
})

/** Text matched literally by `like … escape '\\'`: its own % and _ escaped. */
export const like = (text: string): string => text.replace(/[\\%_]/g, '\\$&')

/**
 * The name a capture is shown by: the first line of what it says, worked out
 * on reading so an edit never leaves a stale name behind. The stored title is
 * only the fallback, for an import or a bookmark whose body is plain text.
 */
export const LABEL = 'label(title, body)'
export const LIST = `id, number, title, ${LABEL} as label, kind, status, source, private, pinned_at as pinnedAt, remind_at as remindAt, captured_at as capturedAt, attribution, medium, exited_at as closedAt, device, elapsed_ms as elapsedMs`

/** Tell every window the list changed, so whichever is showing it reloads. */
export const changed = (): void => {
  for (const win of BrowserWindow.getAllWindows()) win.webContents.send('captures:changed')
}

export function registerCaptures(): void {
  db = new DatabaseSync(join(app.getPath('userData'), 'mindflow.db'))
  // Worked out once per wording and remembered: every list asks for every
  // name, and reading each body again on every change made a big inbox slow.
  // Capped, since a name is a line in a list, not the whole of a long one.
  const names = new Map<string, string>()
  db.function('label', (title, body) => {
    const key = `${title}\u0000${body}`
    let name = names.get(key)
    if (name === undefined) {
      try {
        // With no words at all, named for what it holds rather than "Untitled".
        const raw = String(body ?? '')
        name = firstLine(JSON.parse(raw || 'null')) || String(title ?? '') ||
          (/"type":"image"/.test(raw) ? 'Picture' : /"type":"excalidraw"/.test(raw) ? 'Drawing' : /"type":"attachment"/.test(raw) ? 'File' : '')
      } catch {
        name = String(title ?? '')
      }
      name = name.slice(0, 300)
      if (names.size > 20000) names.clear()
      names.set(key, name)
    }
    return name
  })
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
         where ${LABEL} like ? escape '\\' or ('MF-' || number) like ?
         order by captured_at desc limit 8`
      )
      .all(`%${like(String(query))}%`, `${query}%`)
  )

  // Search: the words anywhere in the title or the body, newest first, with the
  // body for the preview. Nothing typed gives the most recent.
  // Search: every word you type must appear, in any order, in the name or the
  // words; `kind:quote` narrows to one kind. Captures, nuggets and tasks alike,
  // newest first, each saying what it is.
  ipcMain.handle('captures:find', (_event, query: unknown) => {
    const words = String(query ?? '').toLowerCase().split(/\s+/).filter(Boolean)
    const kind = words.find((word) => word.startsWith('kind:'))?.slice(5)
    // % and _ are a search's own wildcards; typed, they mean themselves.
    const terms = words.filter((word) => !word.startsWith('kind:')).map((word) => `%${like(word)}%`)
    const match = (text: string): string => terms.map(() => `${text} like ? escape '\\'`).join(' and ') || '1'
    const args = (n: number): string[] => [...Array(n)].flatMap(() => terms)
    const rows = db.prepare(
      `select * from (
         select 'capture' as type, id, number, kind, status, source, attribution, ${LABEL} as label, body, captured_at as capturedAt
           from captures where status != 'discarded' and ${match(`(${LABEL} || ' ' || body)`)}
         union all
         select tier, id, null, kind, 'open', '', attribution, title, body, created_at from nuggets where ${match("(title || ' ' || body)")}
         union all
         select 'task', id, number, 'todo', status, '', null, title, coalesce(notes, 'null'), created_at from tasks where ${match("(title || ' ' || coalesce(notes, ''))")}
       ) ${kind ? 'where kind = ?' : ''} order by capturedAt desc limit 60`
    ).all(...args(3), ...(kind ? [kind] : [])) as Record<string, unknown>[]
    return rows.map((row) => {
      try {
        return { ...row, body: JSON.parse(row.body as string) }
      } catch {
        return { ...row, body: row.body }
      }
    })
  })

  ipcMain.handle('captures:get', (_event, id: unknown) => {
    const row = db.prepare(`select ${LIST}, body, original_body as original from captures where id = ?`).get(String(id))
    // Opening it is a use: the first one sets its time to first use.
    db.prepare("update captures set first_used_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') where id = ? and first_used_at is null and julianday('now') - julianday(captured_at) > 1.0 / 1440").run(String(id))
    return row ? { ...row, body: JSON.parse(row.body as string), original: row.original ? JSON.parse(row.original as string) : null } : null
  })

  ipcMain.handle('captures:cards', () =>
    (db.prepare(`select id, kind, body from captures where kind = 'link' or body like '%"bookmark"%'`).all() as { id: string; kind: string; body: string }[])
      .map((row) => ({ ...row, body: JSON.parse(row.body ?? 'null') })))

  ipcMain.handle('captures:create', (_event, raw: unknown) => {
    const patch = Patch.parse(raw)
    const { id, number } = insert(patch, new Date().toISOString())
    // The plan's automatic context: which machine, and how long it took.
    // Who and where, and private, in the same breath: never briefly public.
    db.prepare('update captures set device = ?, elapsed_ms = ?, attribution = ?, medium = ?, private = max(private, ?) where id = ?').run(
      hostname().replace(/\.local$/, ''), patch.elapsedMs ?? null, patch.attribution || null, patch.medium || null, patch.private ? 1 : 0, id)
    // Lifted out of something else: it points back, and inherits the source,
    // never one invented at the point of selection.
    if (patch.origin)
      db.prepare(`update captures set origin_id = ?, attribution = coalesce(
        (select attribution from captures where id = ?), (select attribution from nuggets where id = ?)) where id = ?`).run(patch.origin, patch.origin, patch.origin, id)
    if (patch.markdown !== undefined) void writeMarkdown(number, patch.markdown)
    changed()
    return id
  })

  // Only the fields passed are written. `coalesce` keeps the rest as they were.
  ipcMain.handle('captures:save', (_event, id: unknown, raw: unknown) => {
    const patch = Patch.parse(raw)
    // The words as first written, kept the first time you change them: a
    // capture edited and then promoted still has what you actually caught.
    // Only your edits count; a link's card or a tag added in bulk do not.
    if (patch.body !== undefined && !patch.fetched)
      db.prepare('update captures set original_body = body where id = ? and original_body is null and body is not ?').run(String(id), JSON.stringify(patch.body))
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
    // When an exit was taken, for the lead measures: "did you take an exit
    // this week" needs the day, not only the state.
    if (row && patch.markdown !== undefined) void writeMarkdown(row.number as number, patch.markdown)
    changed()
  })
}

/** One new row, numbered after the last. */
function insert(patch: CapturePatch & { source?: string }, capturedAt: string): { id: string; number: number } {
  const id = randomUUID()
  const { number } = db
    .prepare(
      // A bit starts private: the one kind where a screen share is the risk.
      `insert into captures (id, number, title, kind, body, captured_at, source, private)
       values (?, (select coalesce(max(number), 0) + 1 from captures), ?, ?, ?, ?, ?, ?)
       returning number`
    )
    .get(id, patch.title ?? '', patch.kind ?? 'note', JSON.stringify(patch.body ?? null), capturedAt, patch.source ?? '', patch.kind === 'bit' ? 1 : 0) as { number: number }
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
  for (const raw of chunks(text)) {
    const { text: chunk, at: stamped } = unstamp(raw)
    const body = JSON.stringify(chunk)
    if (seen.get(name, body)) continue
    const { number } = insert(
      { title: titleOfMarkdown(chunk), kind: guessKind(chunk, kind), body: chunk, source: name },
      stamped ?? new Date(at).toISOString()
    )
    // Already Markdown, so the readable copy beside the backups is the chunk itself.
    void writeMarkdown(number, chunk)
    added += 1
  }
  if (added) changed()
  return added
}

/**
 * Bookmarks, as links: the HTML file Raindrop, and every browser, exports.
 * Each keeps its title, its address as the body, the day it was saved, and
 * its site as where it came from. One already imported is skipped.
 */
export function importBookmarks(name: string, html: string): number {
  // Matched on the address anywhere in the body: once a link becomes its card,
  // the body is the card, and a second import must still see it.
  const seen = db.prepare('select 1 from captures where source = ? and body like ?')
  const where = db.prepare('update captures set medium = ? where id = ?')
  let added = 0
  const plain = (text: string): string =>
    text.replace(/&(amp|quot|#39|lt|gt);/g, (_, code: string) => ({ amp: '&', quot: '"', '#39': "'", lt: '<', gt: '>' })[code]!).trim()
  for (const [, url, attrs, raw] of html.matchAll(/<a\s+href="([^"]+)"([^>]*)>([^<]*)<\/a>/gi)) {
    const title = plain(raw)
    if (!/^https?:/.test(url) || seen.get(name, `%${url}%`)) continue
    const saved = /add_date="(\d+)"/i.exec(attrs)?.[1]
    const { id, number } = insert(
      { title: title || url, kind: 'link', body: url, source: name },
      saved ? new Date(Number(saved) * 1000).toISOString() : new Date().toISOString()
    )
    where.run(new URL(url).hostname.replace(/^www\./, ''), id)
    void writeMarkdown(number, `[${title || url}](${url})`)
    added += 1
  }
  if (added) changed()
  return added
}

/** A capture from the command line: plain words, its kind guessed from them. */
export function captureText(text: string): void {
  insert({ title: '', kind: kindOf(text) ?? 'note', body: text }, new Date().toISOString())
  recordOpen('cli')
  changed()
}

/** A CSV file's rows as objects keyed by its header, in lower case. */
const csv = (text: string): Record<string, string>[] =>
  Papa.parse<Record<string, string>>(text.trim(), { header: true, skipEmptyLines: true, transformHeader: (key) => key.trim().toLowerCase() }).data

/** Words from elsewhere, as captures: who said them and where, kept. */
type Found = { text: string; who?: string; where?: string; at?: string }
function bring(name: string, found: Found[]): number {
  const seen = db.prepare('select 1 from captures where source = ? and body = ?')
  const set = db.prepare('update captures set attribution = ?, medium = ? where id = ?')
  let added = 0
  for (const one of found) {
    const text = one.text.trim()
    if (!text || seen.get(name, JSON.stringify(text))) continue
    const at = one.at && !Number.isNaN(Date.parse(one.at)) ? new Date(one.at).toISOString() : new Date().toISOString()
    const kind = text.length > 600 ? 'excerpt' : one.who ? 'quote' : guessKind(text, 'note')
    const { id, number } = insert({ title: '', kind, body: text, source: name }, at)
    set.run(one.who?.trim() || null, one.where?.trim() || null, id)
    void writeMarkdown(number, text)
    added += 1
  }
  if (added) changed()
  return added
}

/**
 * Highlights and notes from other apps. Readwise's CSV, and any CSV with a
 * text, body, note or highlight column; Kindle's My Clippings.txt; a JSON list
 * of { text, author, source, date }. Each highlight is a quote, said by the
 * book's author, met in the book, on the day it was highlighted.
 */
export function importHighlights(name: string, text: string): number {
  if (/\.json$/i.test(name)) {
    const list = z.array(z.record(z.string(), z.unknown())).parse(JSON.parse(text))
    const pick = (row: Record<string, unknown>, ...keys: string[]): string | undefined =>
      keys.map((key) => row[key]).find((value) => typeof value === 'string') as string | undefined
    return bring(name, list.map((row) => ({
      text: pick(row, 'text', 'body', 'content', 'highlight', 'note') ?? '',
      who: pick(row, 'author', 'attribution', 'who'),
      where: pick(row, 'source', 'title', 'book', 'medium'),
      at: pick(row, 'date', 'created', 'createdAt', 'highlighted_at')
    })))
  }
  if (/\.csv$/i.test(name))
    return bring(name, csv(text).map((row) => ({
      text: [row.highlight ?? row.text ?? row.body ?? row.content ?? row.note ?? '', row.highlight && row.note ? `\n\n${row.note}` : ''].join(''),
      who: row['book author'] ?? row.author,
      where: row['book title'] ?? row.title ?? row.source,
      at: row['highlighted at'] ?? row.date ?? row.created
    })))
  // Kindle: entries between lines of equals signs; the title line ends in the
  // author in brackets, the next says when, then the words.
  return bring(name, text.split(/^==========\s*$/m).map((entry) => {
    const [head = '', meta = '', ...rest] = entry.trim().split('\n')
    const author = /\(([^()]*)\)\s*$/.exec(head)?.[1]
    return { text: rest.join('\n'), who: author, where: head.replace(/\s*\([^()]*\)\s*$/, '').replace(/^\uFEFF/, ''), at: /Added on \w+, (.+)$/.exec(meta)?.[1] }
  }))
}

/**
 * Anki's "Notes in Plain Text" export: one card a line, front and back split
 * by a tab. Each becomes a nugget already tested, the front its question.
 */
export function importAnki(text: string): number {
  const seen = db.prepare('select 1 from nuggets where prompt = ?')
  const add = db.prepare("insert into nuggets (id, kind, title, body, prompt, created_at, updated_at) values (?, 'note', ?, ?, ?, ?, ?)")
  let added = 0
  for (const line of text.split('\n')) {
    if (line.startsWith('#') || !line.includes('\t')) continue
    const [front, back] = line.split('\t').map((part) => part.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').trim())
    if (!front || !back || seen.get(front)) continue
    const at = new Date().toISOString()
    add.run(randomUUID(), back.split('\n')[0].slice(0, 160), JSON.stringify(back), front, at, at)
    added += 1
  }
  if (added) changed()
  return added
}

/**
 * A whole note as one capture: what an Obsidian vault is made of, where each
 * file is a page rather than a list of jottings. A note in a `permanent`
 * folder becomes an article instead. Named after its file, dated
 * by its own `created:` line or the file's, and skipped if already imported.
 */
export function importNote(path: string, text: string, modified: Date): boolean {
  const body = text.replace(/^---\n[\s\S]*?\n---\n/, '').trim()
  if (!body) return false
  const title = path.split('/').pop()!.replace(/\.md$/, '')
  const at = createdOf(text) ?? modified.toISOString()
  // A Zettelkasten's permanent notes are finished thinking in your own words:
  // they arrive as articles, not as an inbox to triage.
  if (/(^|\/)permanent\//.test(path)) {
    if (db.prepare("select 1 from nuggets where tier = 'article' and title = ?").get(title)) return false
    db.prepare("insert into nuggets (id, tier, kind, title, body, created_at, updated_at) values (?, 'article', 'note', ?, ?, ?, ?)")
      .run(randomUUID(), title, JSON.stringify(body), new Date(at).toISOString(), modified.toISOString())
    return true
  }
  if (db.prepare('select 1 from captures where source = ? and body = ?').get(path, JSON.stringify(body))) return false
  const { number } = insert({ title, kind: 'note', body, source: path }, new Date(at).toISOString())
  void writeMarkdown(number, body)
  return true
}
