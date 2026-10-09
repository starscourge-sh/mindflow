import { app, BrowserWindow, ipcMain } from 'electron'
import { randomUUID } from 'crypto'
import { DatabaseSync } from 'node:sqlite'
import { z } from 'zod'
import Papa from 'papaparse'
import { join, posix } from 'path'
import { hostname } from 'os'

import { backUp, checkMarkdown, writeMarkdown } from './backup'
import { markdown } from './vigil'
import { celebrateAfter } from './celebrate'
import { RETIRED, tagged, withTag } from './kinds'
import { chunks, createdOf, firstLine, guessKind, isBit, kindOf, propertiesOf, titleOfMarkdown, unstamp, withoutNotionId } from './import'

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
  /** When you last changed its words; null while they are as caught. */
  editedAt: string | null
  /** Who said it: "George Orwell", "Kayla". Null means the words are yours. */
  attribution: string | null
  /** The machine it was captured on, and how long writing it took. */
  device: string | null
  elapsedMs: number | null
  /** The weather when it was caught, "12°C, light rain", when that setting is on. */
  weather: string | null
  /** Where you met it: "YouTube", "book", "meeting". Free text. */
  medium: string | null
  /** When it took an exit; null while open. */
  closedAt: string | null
  /** Put out of sight, not deleted; null while in view. */
  archivedAt: string | null
  /** When it came in by an import; its age is counted from thirty days after. */
  importedAt: string | null
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
  /** The body this one was made from: the words land only if they are still what is stored. */
  base?: unknown
  plainTags?: string[]
}

/**
 * What a save did. `was` is the status before it, for an undo to put back
 * exactly; `refused` is an exit asked of a capture that is no longer open;
 * `conflict` means the words were changed elsewhere since `base`, so none
 * were written, and `body` is what is stored now.
 */
export interface SaveResult {
  was?: string
  refused?: boolean
  conflict?: boolean
  body?: unknown
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
 * seven; a bit and a book are tags now (#bit, #book), an excerpt a long quote.
 */
const KINDS = ['note', 'todo', 'quote', 'word', 'link', 'decision', 'experiment'] as const
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
  fetched: z.boolean().optional(),
  base: z.unknown().optional(),
  /** Tags the box was told to keep as plain text: "#bit" that does not make it private, "#book" that is not a book. */
  plainTags: z.array(z.string()).optional()
})

/**
 * The words stored now, when they are no longer the `base` a save was made
 * from: another window, a merge or a renamed tag wrote them since. Null when
 * the save may land. Compared as parsed JSON, so spacing never counts.
 */
export function movedOn(table: 'captures' | 'nuggets', id: string, base: unknown): { body: unknown } | null {
  const row = db.prepare(`select body from ${table} where id = ?`).get(id) as { body: string | null } | undefined
  if (!row) return null
  let now: unknown
  try {
    now = JSON.parse(row.body ?? 'null')
  } catch {
    now = row.body
  }
  return JSON.stringify(now ?? null) === JSON.stringify(base ?? null) ? null : { body: now }
}

/**
 * Several writes as one: all of them land, or none do. A failure part way
 * rolls back, rather than leaving the file in a write that never ends, where
 * every later change waits uncommitted and is gone on quit.
 */
export function atomically<T>(run: () => T): T {
  db.exec('begin')
  try {
    const result = run()
    db.exec('commit')
    return result
  } catch (error) {
    db.exec('rollback')
    throw error
  }
}

/** One setting as stored, or `fallback` when it is not there or no longer reads. */
export function setting<T>(key: string, fallback: T): T {
  try {
    const row = db.prepare('select value from settings where key = ?').get(key) as { value: string } | undefined
    return row ? (JSON.parse(row.value) as T) : fallback
  } catch {
    return fallback
  }
}

/** Text matched literally by `like … escape '\\'`: its own % and _ escaped. */
export const like = (text: string): string => text.replace(/[\\%_]/g, '\\$&')

/**
 * The name a capture is shown by: the first line of what it says, worked out
 * on reading so an edit never leaves a stale name behind. The stored title is
 * only the fallback, for an import or a bookmark whose body is plain text.
 */
// `named` is 1 for a note that came with a name of its own (a vault note is
// called by its file name): that name wins over whatever its first line says.
export const LABEL = 'label(title, body, named)'
export const LIST = `id, number, title, ${LABEL} as label, kind, status, source, private, pinned_at as pinnedAt, remind_at as remindAt, captured_at as capturedAt, edited_at as editedAt, attribution, medium, exited_at as closedAt, device, elapsed_ms as elapsedMs, weather, archived_at as archivedAt, imported_at as importedAt`

/** One note whose words or fields were saved: what a change can say it was. */
export interface Change {
  kind: 'capture' | 'item'
  id: string
}

// The list every window asks for after each write, kept between writes: a
// save of one note puts that one row right rather than reading every body
// again for every window. Kept only while nothing else wrote since. Its
// version lets a window that already has this list be told so, rather than
// sent 4 MB it holds already.
let listed: { rows: Record<string, unknown>[]; at: number; version: number } | null = null
let versions = 0
const writes = (): number => (db.prepare('select total_changes() as n').get() as { n: number }).n

// Hidden windows are told once, when they show, rather than reloading every
// list on every autosave while nobody sees them.
const untold = new WeakMap<BrowserWindow, Change[] | null>()

/**
 * Tell every window the list changed, so whichever is showing it reloads.
 * `what` says which note it was, so a list that does not show that kind of
 * thing stays as it is; nothing means anything may have changed.
 */
export const changed = (what?: Change): void => {
  if (listed && what?.kind === 'capture') {
    const at = listed.rows.findIndex((row) => row.id === what.id)
    const row = db.prepare(`select ${LIST} from captures where id = ?`).get(what.id)
    // Typing past a note's first line changes nothing a list shows.
    const same = at >= 0 && JSON.stringify(row) === JSON.stringify(listed.rows[at])
    if (at >= 0 && row) listed = { rows: same ? listed.rows : listed.rows.with(at, row), at: writes(), version: same ? listed.version : ++versions }
    else listed = null
  } else if (what?.kind === 'item') {
    if (listed) listed = { ...listed, at: writes() }
  } else listed = null
  for (const win of BrowserWindow.getAllWindows()) {
    if (win.isVisible()) {
      win.webContents.send('captures:changed', what ? [what] : null)
      continue
    }
    const was = untold.get(win)
    if (was === undefined) {
      const tell = (): void => {
        clearInterval(look)
        win.off('show', tell)
        const told = untold.get(win)
        untold.delete(win)
        if (told !== undefined && !win.isDestroyed()) win.webContents.send('captures:changed', told)
      }
      // 'show' is not always told on macOS (a window shown without taking
      // the focus never hears it), so it is looked for as well.
      const look = setInterval(() => (win.isDestroyed() ? clearInterval(look) : win.isVisible() && tell()), 300)
      win.once('show', tell)
    }
    untold.set(win, was === null || !what ? null : [...(was ?? []), what].slice(-50))
  }
}

export function registerCaptures(): void {
  db = new DatabaseSync(join(app.getPath('userData'), 'mindflow.db'))
  // Worked out once per wording and remembered: every list asks for every
  // name, and reading each body again on every change made a big inbox slow.
  // Capped, since a name is a line in a list, not the whole of a long one.
  // A long note is remembered by its start and its length, not its whole
  // wording: keyed by every word, each autosave of a 1 MB note kept another
  // megabyte. Its name is a first line, so the start decides it, and a name
  // found further in than that is worked out each time instead.
  const names = new Map<string, string>()
  let kept = 0
  const HEAD = 8192
  db.function('label', { varargs: true }, (title, body, named) => {
    if (named && title) return String(title)
    const raw = String(body ?? '')
    const long = raw.length > HEAD
    const key = long ? `${title}\u0000${raw.length}\u0000${raw.slice(0, HEAD)}` : `${title}\u0000${raw}`
    let name = names.get(key)
    if (name === undefined) {
      try {
        // A bare address with a name of its own (an imported bookmark) goes by the name.
        const line = firstLine(JSON.parse(raw || 'null'))
        const bare = !!title && /^https?:\/\/\S+$/.test(line)
        // With no words at all, named for what it holds rather than "Untitled".
        name = (bare ? '' : line) || String(title ?? '') ||
          (/"type":"image"/.test(raw) ? 'Picture' : /"type":"excalidraw"/.test(raw) ? 'Drawing' : /"type":"attachment"/.test(raw) ? 'File' : '')
      } catch {
        name = String(title ?? '')
      }
      name = name.slice(0, 300)
      const near = (at: number): boolean => at >= 0 && at < HEAD / 2
      if (long && !(name && near(raw.indexOf(JSON.stringify(name.split(/\s/)[0].slice(0, 12)).slice(1, -1))))) return name
      if (names.size > 20000 || kept > 8_000_000) (names.clear(), (kept = 0))
      names.set(key, name)
      kept += key.length
    }
    return name
  })
  // What search reads of a note: its words, and the addresses and names its
  // links and cards hold; never the editor's own JSON ("paragraph", "type",
  // "content"), which every note has. Remembered per note until it changes.
  const read = new Map<string, { body: string; words: string }>()
  const SAID = ['href', 'url', 'title', 'description', 'label', 'latex', 'alt', 'caption', 'language']
  type Part = { type?: string; text?: string; attrs?: Record<string, unknown>; marks?: Part[]; content?: Part[] }
  const wordsIn = (node: Part): string => [
    node.text,
    ...[node, ...(node.marks ?? [])].flatMap((one) => SAID.map((key) => one.attrs?.[key]).filter((value) => typeof value === 'string')),
    (node.content ?? []).map(wordsIn).join(node.type === 'paragraph' || node.type === 'heading' ? '' : '\n')
  ].filter(Boolean).join(' ')
  db.function('words', (id, body) => {
    const raw = String(body ?? '')
    const was = read.get(String(id))
    if (was?.body === raw) return was.words
    let words: string
    try {
      const doc = JSON.parse(raw || 'null') as unknown
      words = typeof doc === 'string' ? doc : doc && typeof doc === 'object' ? wordsIn(doc as Part) : ''
    } catch {
      words = raw
    }
    read.set(String(id), { body: raw, words })
    return words
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
  // A vault note's own name, which wins over its first line; and where an
  // article came from, so importing the same vault again finds it by path.
  // When an imported capture came in: its own date is kept and shown, but its
  // age, for rot cards, hints and the weekly nudge, counts from here, so a vault
  // of old notes does not all arrive rotting.
  for (const add of ['alter table captures add column named integer not null default 0', "alter table nuggets add column source text not null default ''", 'alter table captures add column imported_at text', 'alter table captures add column edited_at text']) {
    try {
      db.exec(add)
    } catch {
      // Already there.
    }
  }

  // A copy on every start, and a check each hour so a window left open for
  // days still gets one a day.
  const backUpNow = (): void => void backUp(db).catch((error) => console.error('Backup failed:', error))
  backUpNow()
  setInterval(backUpNow, 60 * 60 * 1000)

  // Null when the window's copy, `held`, is this one still.
  ipcMain.handle('captures:list', (_event, held?: number) => {
    if (!listed || listed.at !== writes()) listed = { rows: db.prepare(`select ${LIST} from captures order by captured_at desc`).all() as Record<string, unknown>[], at: writes(), version: ++versions }
    return listed.version === held ? null : { rows: listed.rows, version: listed.version }
  })

  // What `@` offers: a title containing the text, or a handle starting with it,
  // so `@login` and `@mf-3` both find things. Newest first, a handful at most.
  ipcMain.handle('captures:search', (_event, query: unknown) =>
    db
      .prepare(
        `select ${LIST} from captures
         where ${LABEL} like ? escape '\\' or ('MF-' || number) like ? escape '\\' or coalesce(aliases, '') like ? escape '\\'
         order by captured_at desc limit 8`
      )
      .all(`%${like(String(query))}%`, `${like(String(query))}%`, `%${like(String(query))}%`)
  )

  // Search: the words anywhere in the title or the body, newest first. Names
  // only: the preview asks for its one note (captures:peek), so a keystroke
  // no longer carries sixty whole notes across. Nothing typed gives the most recent.
  // Search: every word you type must appear, in any order, in the name or the
  // words; `kind:quote` narrows to one kind. Captures, nuggets and tasks alike,
  // newest first, each saying what it is.
  ipcMain.handle('captures:find', (_event, query: unknown) => {
    const words = String(query ?? '').toLowerCase().split(/\s+/).filter(Boolean)
    // The kinds that went: kind:excerpt is a quote, kind:bit and kind:book their tags.
    const asked = words.find((word) => word.startsWith('kind:'))?.slice(5)
    const retired = asked ? RETIRED[asked] : undefined
    const kind = retired ? (retired.tag ? undefined : retired.kind) : asked
    // % and _ are a search's own wildcards; typed, they mean themselves.
    const terms = [...words.filter((word) => !word.startsWith('kind:')), ...(retired?.tag ? [`#${retired.tag}`] : [])].map((word) => `%${like(word)}%`)
    const match = (text: string): string => terms.map(() => `${text} like ? escape '\\'`).join(' and ') || '1'
    const args = (n: number): string[] => [...Array(n)].flatMap(() => terms)
    return db.prepare(
      `select * from (
         select 'capture' as type, id, number, kind, status, source, attribution, ${LABEL} as label, captured_at as capturedAt
           from captures where status != 'discarded' and ${match(`(${LABEL} || ' ' || words(id, body) || ' ' || coalesce(medium, '') || ' ' || coalesce(attribution, '') || ' ' || coalesce(fields, '') || ' ' || coalesce(aliases, ''))`)}
         union all
         select tier, id, null, kind, 'open', '', attribution, coalesce(nullif(title, ''), label('', body)), created_at from nuggets where ${match("(title || ' ' || words(id, body) || ' ' || coalesce(attribution, '') || ' ' || coalesce(fields, '') || ' ' || coalesce(aliases, ''))")}
         union all
         select 'task', id, number, 'todo', status, '', null, title, created_at from tasks where ${match("(title || ' ' || coalesce(notes, ''))")}
       ) ${kind ? 'where kind = ?' : ''} order by capturedAt desc limit 60`
    ).all(...args(3), ...(kind ? [kind] : []))
  })

  // What search previews: the start of one note, the first 30 blocks, which
  // fill the pane; a 2 MB note whole took longer to draw than to read.
  ipcMain.handle('captures:peek', (_event, type: unknown, id: unknown) => {
    const row = db.prepare(`select body from ${type === 'capture' ? 'captures' : 'nuggets'} where id = ?`).get(String(id)) as { body: string | null } | undefined
    let body: unknown
    try {
      body = JSON.parse(row?.body ?? 'null')
    } catch {
      body = row?.body ?? null
    }
    if (typeof body === 'string') return body.slice(0, 6000)
    const doc = body as { content?: unknown[] } | null
    return Array.isArray(doc?.content) && doc.content.length > 30 ? { ...doc, content: doc.content.slice(0, 30) } : body
  })

  ipcMain.handle('captures:get', (_event, id: unknown) => {
    const row = db.prepare(`select ${LIST}, body, original_body as original from captures where id = ?`).get(String(id))
    // Opening it is a use: the first one sets its time to first use.
    db.prepare("update captures set first_used_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') where id = ? and first_used_at is null and julianday('now') - julianday(captured_at) > 1.0 / 1440").run(String(id))
    return row ? { ...row, body: JSON.parse(row.body as string), original: row.original ? JSON.parse(row.original as string) : null } : null
  })

  // Each card is looked up once per wording: a site whose picture cannot be
  // kept is not asked again every launch. None at all in safe mode.
  db.exec('create table if not exists card_tries (id text primary key, body text)')
  ipcMain.handle('captures:cards', () => {
    if (setting('safeMode', false)) return []
    const rows = db.prepare(`select id, kind, body from captures where (kind = 'link' or body like '%"bookmark"%')
      and not exists (select 1 from card_tries t where t.id = captures.id and t.body = captures.body)`).all() as { id: string; kind: string; body: string }[]
    const tried = db.prepare('insert or replace into card_tries (id, body) values (?, ?)')
    for (const row of rows) tried.run(row.id, row.body)
    return rows.map((row) => ({ ...row, body: JSON.parse(row.body ?? 'null') }))
  })

  ipcMain.handle('captures:create', (event, raw: unknown) => {
    const patch = Patch.parse(raw)
    const { id, number } = insert(patch, new Date().toISOString())
    // A #bit kept as plain text does not make it private; any tag kept so is remembered, so it does nothing later either.
    const plain = [...new Set((patch.plainTags ?? []).map((tag) => tag.toLowerCase()))]
    if (plain.length) db.prepare('update captures set plain_tags = ?, private = case when ? then 0 else private end where id = ?').run(JSON.stringify(plain), plain.includes('bit') ? 1 : 0, id)
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
    celebrateAfter('captures:create', event.sender, [raw], id)
    return id
  })

  // Only the fields passed are written. `coalesce` keeps the rest as they were.
  ipcMain.handle('captures:save', (event, id: unknown, raw: unknown): SaveResult => {
    const patch = Patch.parse(raw)
    // Two editors on one note, or an editor and a merge: words written since
    // this editor last looked are never written over. It is told what is
    // there now, and folds its own words in.
    const moved = patch.body !== undefined && patch.base !== undefined ? movedOn('captures', String(id), patch.base) : null
    if (moved) {
      patch.body = undefined
      patch.markdown = undefined
    }
    // An exit is taken from the inbox only: a promoted capture resolved, or a
    // resolved one discarded, would leave its undo nothing true to go back to.
    const before = db.prepare('select status, body from captures where id = ?').get(String(id)) as { status: string; body: string | null } | undefined
    const was = before?.status
    const refused = !!patch.status && patch.status !== 'open' && was !== 'open'
    if (refused) patch.status = undefined
    // The words as first written, kept the first time you change them: a
    // capture edited and then promoted still has what you actually caught.
    // Only your edits count; a link's card or a tag added in bulk do not.
    // And when, for the note's "Edited 2h ago".
    if (patch.body !== undefined && !patch.fetched)
      db.prepare("update captures set original_body = coalesce(original_body, body), edited_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') where id = ? and body is not ?").run(String(id), JSON.stringify(patch.body))
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
    // Words saved without their Markdown (a sticky's tick) are turned into it here, so the copy never lags.
    // #bit written in makes it private, once: taken off by hand, it stays off.
    if (row && patch.body !== undefined && tagged(JSON.stringify(patch.body), 'bit') && !tagged(before?.body, 'bit'))
      db.prepare('update captures set private = 1 where id = ?').run(String(id))
    if (row && (patch.markdown !== undefined || patch.body !== undefined)) void writeMarkdown(row.number as number, patch.markdown ?? markdown(patch.body))
    else if (patch.status) checkMarkdown(String(id))
    changed({ kind: 'capture', id: String(id) })
    const result = { was, refused, ...(moved ? { conflict: true, body: moved.body } : {}) }
    if (patch.status) celebrateAfter('captures:save', event.sender, [id, patch], result)
    return result
  })
}

/** One new row, numbered after the last. */
function insert(patch: CapturePatch & { source?: string }, capturedAt: string): { id: string; number: number } {
  const id = randomUUID()
  const { number } = db
    .prepare(
      // Tagged #bit, it starts private: the one place a screen share is the risk.
      `insert into captures (id, number, title, kind, body, captured_at, source, private, imported_at)
       values (?, (select coalesce(max(number), 0) + 1 from captures), ?, ?, ?, ?, ?, ?, ?)
       returning number`
    )
    .get(id, patch.title ?? '', patch.kind ?? 'note', JSON.stringify(patch.body ?? null), capturedAt, patch.source ?? '', tagged(JSON.stringify(patch.body ?? null), 'bit') ? 1 : 0,
      patch.source ? new Date().toISOString() : null) as { number: number }
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
export function importMarkdown(name: string, text: string, jokes = false): number {
  const at = createdOf(text) ?? new Date().toISOString()
  const seen = db.prepare('select 1 from captures where source = ? and body = ?')
  let added = 0
  for (const raw of chunks(text)) {
    const { text: words, at: stamped } = unstamp(raw)
    // A joke (from a file of them, or starting "joke" or "bit") is a note tagged #bit, so private.
    const chunk = (jokes || isBit(titleOfMarkdown(words))) && !tagged(words, 'bit') ? String(withTag(words, 'bit')) : words
    const body = JSON.stringify(chunk)
    if (seen.get(name, body)) continue
    const { number } = insert(
      { title: titleOfMarkdown(chunk), kind: guessKind(chunk, 'note'), body: chunk, source: name },
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
    // An address that does not parse ("http://[bad") is skipped, not the rest of the file.
    const host = URL.canParse(url) ? new URL(url).hostname.replace(/^www\./, '') : null
    if (!host || !/^https?:/.test(url) || seen.get(name, `%${url}%`)) continue
    const saved = /add_date="(\d+)"/i.exec(attrs)?.[1]
    const { id, number } = insert(
      { title: title || url, kind: 'link', body: url, source: name },
      saved ? new Date(Number(saved) * 1000).toISOString() : new Date().toISOString()
    )
    where.run(host, id)
    void writeMarkdown(number, `[${title || url}](${url})`)
    added += 1
  }
  if (added) changed()
  return added
}

/** A capture from the command line: plain words, its kind guessed from them. */
export function captureText(text: string): void {
  insert({ title: '', kind: kindOf(text) ?? 'note', body: isBit(text) && !tagged(text, 'bit') ? withTag(text, 'bit') : text }, new Date().toISOString())
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
    const kind = text.length > 600 || one.who ? 'quote' : guessKind(text, 'note')
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
    // Named by its question, as the deck shows it: the answer stays hidden till asked.
    add.run(randomUUID(), front.split('\n')[0].slice(0, 160), JSON.stringify(back), front, at, at)
    added += 1
  }
  if (added) changed()
  return added
}

/** The vault note at this path, if it came in before: a capture, or an article. */
export function alreadyImported(path: string): Imported | null {
  const row = (db.prepare("select id as link, title from captures where source = ? and named = 1").get(path) ??
    db.prepare("select 'article:' || id as link, title from nuggets where tier = 'article' and source = ?").get(path)) as { link: string; title: string } | undefined
  return row ? { ...row, path } : null
}

/** A vault note once it is here: what links to it are rewritten to point at. */
export type Imported = { link: string; title: string; path: string; private?: boolean }

/**
 * A whole note as one capture: what an Obsidian vault is made of, where each
 * file is a page rather than a list of jottings. A note in a `permanent`
 * folder becomes an article instead. Named after its file, dated by its own
 * `created:` line or the file's, with every property its frontmatter has.
 * A note already imported from the same path is "already here", whatever
 * linking has since done to its words; a file with nothing in it is "empty".
 */
export function importNote(path: string, text: string, modified: Date, hidden = false): Imported | 'empty' | 'already here' {
  const front = /^---\n([\s\S]*?)\n---(?:\n|$)/.exec(text)
  const fields = propertiesOf(front?.[1] ?? '')
  // Private by its name, or because an export from here said so.
  const secret = hidden || fields.private === 'true'
  delete fields.private
  const title = withoutNotionId(path.split('/').pop()!.replace(/\.(md|png|jpe?g|gif|webp|svg|avif|bmp)$/i, ''))
  // The name already heads the page; a first heading saying it again is dropped.
  const body = text.slice(front?.[0].length ?? 0).trim().replace(/^#[ \t]+(.*)(\n|$)/, (line, words: string) =>
    withoutNotionId(words.trim()).toLowerCase() === title.toLowerCase() ? '' : line).trim()
  // A note of properties alone still comes in: they show beside it.
  if (!body && !Object.keys(fields).length) return 'empty'
  const at = createdOf(text) ?? modified.toISOString()
  const kept = Object.keys(fields).length ? JSON.stringify(fields) : null
  // A Zettelkasten's permanent notes are finished thinking in your own words:
  // they arrive as articles, not as an inbox to triage.
  if (/(^|\/)permanent\//.test(path)) {
    if (db.prepare("select 1 from nuggets where tier = 'article' and source = ?").get(path)) return 'already here'
    const id = randomUUID()
    db.prepare("insert into nuggets (id, tier, kind, title, body, created_at, updated_at, source, fields, private) values (?, 'article', 'note', ?, ?, ?, ?, ?, ?, ?)")
      .run(id, title, JSON.stringify(body), new Date(at).toISOString(), modified.toISOString(), path, kept, secret ? 1 : 0)
    return { link: `article:${id}`, title, path, private: secret }
  }
  if (db.prepare('select 1 from captures where source = ? and named = 1').get(path)) return 'already here'
  // A kind of ours, as an export from here writes it, comes back as that kind with its fields.
  const kind = (KINDS as readonly string[]).includes(fields.kind) ? (fields.kind as (typeof KINDS)[number]) : 'note'
  if (kind !== 'note') delete fields.kind
  const own = Object.keys(fields).length ? JSON.stringify(fields) : null
  const { id, number } = insert({ title, kind, body, source: path }, new Date(at).toISOString())
  db.prepare('update captures set named = 1, fields = ?, private = max(private, ?) where id = ?').run(own, secret ? 1 : 0, id)
  void writeMarkdown(number, body)
  return { link: id, title, path, private: secret }
}

/**
 * After a vault is in: its `[[Page]]` links, `![[Page]]` embeds of notes and
 * `[words](Page.md)` links become links to what those pages became here,
 * written `[[@link#Heading|shown]]`, which the editor reads as a note link.
 * A link may name its page by name, by a path from the vault's top or from
 * its own folder (`../c++/c++`), or by the end of a path; failing those, by
 * the name alone. A page that did not come in stays a link by name.
 */
export function linkImported(made: Imported[], byName: Map<string, string>, known: Imported[] = []): number {
  const byPath = new Map([...known, ...made].map((one) => [one.path.replace(/\.md$/i, '').toLowerCase(), one.link]))
  const paths = [...byPath.keys()]
  const find = (from: string, target: string): string | undefined => {
    const page = target.trim().replace(/\\$/, '').replace(/\.md$/i, '').toLowerCase()
    if (!page.includes('/')) return byName.get(page) ?? byName.get(withoutNotionId(page))
    const here = posix.normalize(posix.join(posix.dirname(from.toLowerCase()), page))
    const whole = posix.normalize(page.replace(/^\/+/, ''))
    const name = page.split('/').pop()!
    return byPath.get(here) ?? byPath.get(whole) ?? byPath.get(paths.find((one) => one.endsWith(`/${whole}`)) ?? '') ??
      byName.get(name) ?? byName.get(withoutNotionId(name))
  }
  let linked = 0
  for (const { link, path } of made) {
    const [table, id] = link.startsWith('article:') ? ['nuggets', link.slice(8)] : ['captures', link]
    const row = db.prepare(`select body from ${table} where id = ?`).get(id) as { body: string } | undefined
    const body = row && (JSON.parse(row.body) as unknown)
    if (typeof body !== 'string') continue
    const to = (target: string, heading: string | undefined, shown: string, inTable: boolean): string | null => {
      const found = find(path, target)
      if (!found) return null
      linked += 1
      // The heading goes along, so the link still lands where it pointed.
      // Without brackets of its own ("#Elastic Inference [Deprecated]"), which would end the link early.
      const at = heading && heading.length > 1 ? `#${heading.slice(1).replace(/\\$/, '').replace(/[[\]]/g, '').trim()}` : ''
      // In a table row a bare bar would split the cell, so it is escaped.
      return `[[@${found}${at}${inTable ? '\\|' : '|'}${shown.trim()}]]`
    }
    // A link to a file is written with %20 for its spaces, or sometimes not.
    const decoded = (text: string): string => {
      try {
        return decodeURIComponent(text)
      } catch {
        return text
      }
    }
    const next = body.split('\n').map((line) => {
      // A table row, in a callout or not.
      const inTable = /^\s*(>\s*)*\|/.test(line)
      return line
        // Empty brackets link nowhere: the words either side of them are what was meant.
        .replace(/\[\[\]\]/g, ' ')
        .replace(/!?\[\[([^\]|#]+)(#(?:[^\]|]|\](?!\]))*)?(?:\\?\|([^\]]+))?\]\]/g, (whole, page: string, heading: string | undefined, shown?: string) => {
          const name = withoutNotionId(page.replace(/\\$/, '').split('/').pop()!.trim())
          // A page that did not come in, embedded or not, stays a link to it by its name alone.
          return to(page, heading, shown ?? name, inTable) ?? (page.includes('/') ? `[[${name}${shown ? `${inTable ? '\\|' : '|'}${shown}` : ''}]]` : whole.replace(/^!/, ''))
        })
        .replace(/(?<!!)\[([^\]]*)\]\((?!https?:|mindflow:)([^)]+?\.md)(#[^)]*)?\)/g, (whole, shown: string, page: string, heading?: string) =>
          to(decoded(page), heading && decoded(heading), shown || decoded(page), inTable) ?? whole)
    }).join('\n')
    if (next === body) continue
    // Linking is part of coming in, not an edit: the version the database
    // keeps of the words before it is dropped again.
    const last = (db.prepare('select coalesce(max(id), 0) as n from versions').get() as { n: number }).n
    db.prepare(`update ${table} set body = ? where id = ?`).run(JSON.stringify(next), id)
    db.prepare('delete from versions where item_id = ? and id > ?').run(id, last)
  }
  if (linked) changed()
  return linked
}

/**
 * Imported notes arrive as Markdown, which the editor took seconds to read
 * on every opening of a long one. A window turns each into the editor's own
 * document once, here, and hands it back; opening one then reads it as is.
 */
let importing = false
/** An import is under way: its notes are not ready to convert until their links are in. */
export const setImporting = (on: boolean): void => {
  importing = on
}

export function registerImportConversion(): void {
  ipcMain.handle('vigil:imports:pending', () => importing ? [] : [
    ...db.prepare("select 'captures' as tbl, id from captures where named = 1 and body like '\"%'").all(),
    ...db.prepare("select 'nuggets' as tbl, id from nuggets where tier = 'article' and source != '' and body like '\"%'").all()
  ])
  ipcMain.handle('vigil:imports:body', (_event, tbl: unknown, id: unknown) =>
    (db.prepare(`select body from ${tbl === 'nuggets' ? 'nuggets' : 'captures'} where id = ?`).get(String(id)) as { body: string } | undefined)?.body ?? null)
  // Only over the Markdown it was made from: a note edited meanwhile keeps its edit.
  ipcMain.handle('vigil:imports:converted', (_event, tbl: unknown, id: unknown, markdown: unknown, doc: unknown) => {
    const table = tbl === 'nuggets' ? 'nuggets' : 'captures'
    const last = (db.prepare('select coalesce(max(id), 0) as n from versions').get() as { n: number }).n
    db.prepare(`update ${table} set body = ? where id = ? and body = ?`).run(JSON.stringify(doc), String(id), JSON.stringify(String(markdown)))
    db.prepare('delete from versions where item_id = ? and id > ?').run(String(id), last)
  })
}
