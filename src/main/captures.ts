import { nameIfLong } from './long-names'
import { foldMeeting } from './meeting-doc'
import { QUESTIONS, type Question } from './journal-words'
import { app, BrowserWindow, ipcMain } from 'electron'
import { randomUUID } from 'crypto'
import type { DatabaseSync } from 'node:sqlite'
import { z } from 'zod'
import Papa from 'papaparse'
import { join, posix } from 'path'
import { statSync } from 'fs'
import { hostname } from 'os'
import { registerPictureWords, wordsOfPicture } from './picture-words'

import { backUpWatched, checkMarkdown, writeMarkdown, writeMarkdownNow } from './backup'
import { openDatabase } from './db-open'
import { busy } from './busy'
import { markdown, plain } from './haligtree'
import { tagsIn } from './tag-words'
import { celebrateAfter } from './celebrate'
import { lineCardsSoon, syncLineCards } from './line-cards'
import { keptTagged, readKept, stillBase, wordsOf, type Kept } from './kept-words'
import { named } from './stalls'
import { readValue, takeBodyProperties, type PropType } from './property-words'
import { tagged, withTag } from './kinds'
import { tagsOffName } from './tags-off-name'
import { chunks, createdOf, guessKind, isBit, kindOf, propertiesOf, titleOfMarkdown, unstamp, withoutNotionId } from './import'
import { cut, fittedTitle } from './clip'
import { registerRenames, resolveWaiting, watchName } from './renames'
import { LABEL, LIST, bookFunctions } from './book-words'
import { makeFindTables } from './find-files'
import { ask, endReader, forgetWords, startReader } from './reader'

export { KEPT_IN, LABEL, LIST, like } from './book-words'

/** What the list shows. The body is only read when one is opened. */
export interface CaptureMeta {
  id: string
  /** Counts up from 1, for the short `V-30` handle. */
  number: number
  title: string
  /** The title, or the first line when there is none: what lists show. */
  label: string
  /** The tags on its last line, where a name's tags go (tags-off-name.ts), space-separated: shown with the name's. */
  tagLine?: string
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
  /** The window or page you were in as quick capture came up ("Chapter 3.pdf"), and that page's address. */
  windowTitle?: string | null
  pageUrl?: string | null
  /** Where you met it: "YouTube", "book", "meeting". Free text. */
  medium: string | null
  /** When it took an exit; null while open. */
  closedAt: string | null
  /** Put out of sight, not deleted; null while in view. */
  archivedAt: string | null
  /** When it came in by an import; its age is counted from thirty days after. */
  importedAt: string | null
  /** Hidden until this day ("2026-11-03"); null when in sight. */
  snoozedUntil: string | null
  /** The dated folder it was put away into ("Before 17 September 2026"); null otherwise. */
  folder?: string | null
  /** Taken out of the Inbox into a question: `question:<its name>`, or as a clue in one, `clue:<its name>`; null otherwise. */
  keptIn?: string | null
  /** Its properties (status, rating and the rest its kind asks for), as JSON; null when it has none. */
  fields?: string | null
  /** A Word is a lookup: 'asked' until its answer is written, then 'answered'; null for other kinds. */
  lookup?: 'asked' | 'answered' | null
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
  /**
   * An editor's save: the words as they are kept (the document written out as JSON, as UTF-8 bytes), in place of
   * `body`, and the words they were made from the same way, in place of `base` (kept-words.ts).
   */
  words?: Uint8Array
  wordsBase?: Uint8Array
  /** With `markdown` alone: the copy an editor owes for the save that answered with this number (SaveResult `copy`). */
  copy?: number
  plainTags?: string[]
  /** What you were in as quick capture came up: the app, its window's name, a browser's page and its name. */
  from?: { app: string; title: string; url: string; page: string }
  /**
   * Moved to the Bin, or back out of it, from wherever it is: a capture
   * resolved or saved as a gem can go to the Bin too, and comes back as it was.
   */
  bin?: boolean
}

/**
 * What a save did. `was` is the status before it, for an undo to put back
 * exactly; `refused` is an exit asked of a capture that is no longer open;
 * `conflict` means the words were changed elsewhere since `base`, so none
 * were written, and `body` is what is stored now. `copy` is owed by the
 * editor of a long note, whose words land without their Markdown: it sends
 * that after, with this number, once the note has rested (lib/same-words.ts).
 */
export interface SaveResult {
  was?: string
  refused?: boolean
  conflict?: boolean
  body?: unknown
  copy?: number
}

/**
 * Every capture, in one SQLite file beside the app's other data.
 *
 * Only this process opens it. The windows ask over IPC, so there is one
 * writer and nothing to keep in step: this connection. The reading thread
 * (reader.ts) has one of its own that can only read.
 */
let db: DatabaseSync

/** The open database, for the rest of the main process. */
export const database = (): DatabaseSync => db
/**
 * A capture whose words the book put in whole (two notes joined, haligtree.ts `notes:join`): the Markdown copy an
 * editor still owed for its words before is owed no more, so one sent as that editor goes never lands over the join.
 */
export let owedNoMore: (id: string) => void = () => undefined
/**
 * Shut the database cleanly as this run ends: its log (-wal) folded back into
 * the file and gone, so a copy of the file alone is whole. Safe to call twice.
 */
/** Run as the book shuts, while it can still be written: what must not be lost to a quit (word-log.ts). */
const shutting: (() => void)[] = []
export const onShut = (run: () => void): void => void shutting.push(run)

export function shutDatabase(): void {
  if (!db?.isOpen) return
  for (const run of shutting) {
    try { run() } catch (error) { console.error('A last write did not finish:', error) }
  }
  // The reading thread lets go of the book first: a reader left on it would keep the log beside the file.
  endReader()
  try {
    db.exec('pragma wal_checkpoint(TRUNCATE)')
    db.close()
  } catch (error) {
    console.error('The database did not close cleanly:', error)
  }
}

/**
 * What a window may send to make or change a capture, checked here rather
 * than trusted: `as CapturePatch` is a hope, this is a check. The kinds are
 * six; a bit and a book are tags now (#bit, #book), an excerpt a long quote, a
 * decision and an experiment a Check back, a goal made from Goals.
 */
export const KINDS = ['note', 'todo', 'quote', 'word', 'link', 'checkback'] as const
const makePatch = () => z.object({
  // A title past 500 letters is cut at a word: the words are all in the body.
  title: z.string().transform((title) => fittedTitle(title) ?? title).optional(),
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
  bin: z.boolean().optional(),
  base: z.unknown().optional(),
  words: z.instanceof(Uint8Array).optional(),
  wordsBase: z.instanceof(Uint8Array).optional(),
  copy: z.number().optional(),
  /** Tags the box was told to keep as plain text: "#bit" that does not make it private, "#book" that is not a book. */
  plainTags: z.array(z.string()).optional(),
  /** What you were in as quick capture came up (its "From" chip): the app, its window's name, a browser's page. */
  from: z.object({ app: z.string().max(300), title: z.string().max(300), url: z.string().max(4000), page: z.string().max(300) }).optional()
})
let madePatch: ReturnType<typeof makePatch> | undefined
/** Made the first time a save is checked, not as Haligtree opens (src/main/lazy/zod.ts). */
const Patch = (): ReturnType<typeof makePatch> => (madePatch ??= makePatch())

/**
 * The words stored now, when they are no longer the `base` a save was made
 * from: another window, a merge or a renamed tag wrote them since. Null when
 * the save may land. The slow, exact look (kept-words.ts `stillBase`): a save
 * asks the database first (`body is $base`, compared where the words lie),
 * and comes here only when that says no.
 */
export function movedOn(table: 'captures' | 'nuggets', id: string, base: Kept): { body: unknown } | null {
  const row = db.prepare(`select body from ${table} where id = ?`).get(id) as { body: string | null } | undefined
  return !row || stillBase(row.body, base) ? null : { body: readKept(row.body) }
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

/** One note whose words or fields were saved: what a change can say it was. */
export interface Change {
  kind: 'capture' | 'item'
  id: string
  /**
   * Its words were put in whole by the book itself (two notes joined, haligtree.ts `notes:join`), so an editor showing
   * it opens it again from the book, the way a note opens, rather than patching thousands of blocks into its page.
   */
  whole?: boolean
}

// The list every window asks for after each write, kept between writes: a
// save of one note puts that one row right rather than reading every body
// again for every window. Kept only while nothing else wrote since. Its
// version lets a window that already has this list be told so, rather than
// sent 4 MB it holds already.
let listed: { rows: Record<string, unknown>[]; at: number; version: number } | null = null
let versions = 0
/** The whole list being read on the reading thread, for the book's stamp `at`. */
let reading: { at: number; rows: Promise<Record<string, unknown>[]> } | null = null
// The list as the windows see it: without what is hidden until a later day.
let sighted: { key: string; rows: Record<string, unknown>[]; version: number } | null = null
const writes = (): number => (db.prepare('select total_changes() as n').get() as { n: number }).n
/**
 * How many rows were written that no list and no search reads: a note marked as opened, a setting kept, a window
 * shown. Counted apart, so they leave the book's stamp where it was. Anything not written through `quietly` moves
 * the stamp: the safe way round, a write nobody thought about is always seen.
 */
let unread = 0
export function quietly<T>(write: () => T): T {
  const before = writes()
  try {
    return write()
  } finally {
    unread += writes() - before
  }
}
/**
 * The book's stamp: it moves with every write a list or a search could show, and with nothing else. The list every
 * window asks for, and search's list of everything (book-find.ts), are read again only when it has moved, so
 * opening a note, which writes that it was opened, reads neither again.
 */
export const bookStamp = (): number => writes() - unread

// Hidden windows are told once, when they show, rather than reloading every
// list on every autosave while nobody sees them.
const untold = new WeakMap<BrowserWindow, Change[] | null>()

/**
 * Tell every window the list changed, so whichever is showing it reloads.
 * `what` says which note it was, so a list that does not show that kind of
 * thing stays as it is; nothing means anything may have changed.
 */
/** Told after every change the windows are told of: the menu bar, which is no window, follows it so. */
const afterChange: (() => void)[] = []
export const whenChanged = (tell: () => void): void => void afterChange.push(tell)
/** Told after every change, a note's words included (media.ts writes down the files a note let go of). */
const afterAny: (() => void)[] = []
export const whenAnyChanged = (tell: () => void): void => void afterAny.push(tell)

/**
 * The notes saved since the list was last asked for. Each one's row is put right then (`relisted`), not inside
 * its save: reading the row works its name out of its words again, 16 ms of a long note's save.
 */
const unlisted = new Set<string>()
function relisted(): void {
  for (const id of unlisted) {
    if (!listed) break
    const at = listed.rows.findIndex((row) => row.id === id)
    const row = db.prepare(`select ${LIST} from captures where id = ?`).get(id) as Record<string, unknown> | undefined
    // Typing past a note's first line changes nothing a list shows.
    const same = at >= 0 && JSON.stringify(row) === JSON.stringify(listed.rows[at])
    if (at >= 0 && row) listed = { rows: same ? listed.rows : listed.rows.with(at, row), at: listed.at, version: same ? listed.version : ++versions }
    else listed = null
  }
  unlisted.clear()
}

export const changed = (what?: Change): void => {
  if (listed && what?.kind === 'capture') {
    unlisted.add(what.id)
    listed = { ...listed, at: bookStamp() }
  } else if (what?.kind === 'item') {
    if (listed) listed = { ...listed, at: bookStamp() }
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
  // A note's words change nothing the menu bar shows.
  if (what?.kind !== 'capture') for (const tell of afterChange) tell()
  for (const tell of afterAny) tell()
}

/**
 * A test run's hold on the book (qa/batch.mjs, several probes in one launch): this connection, so the book is put
 * back between two probes through it (its stamp moves, so every list kept by the stamp is read again, and this
 * connection's own triggers keep its tag index true), and `changed`, to tell every window. Only under a test run, as
 * the stand-in clipboard (pasteboard.ts).
 */
if (process.env.HALIGTREE_QA_AWAY) (globalThis as { qaBook?: unknown }).qaBook = { database: () => db, changed }

export function registerCaptures(): void {
  const file = join(app.getPath('userData'), 'haligtree.db')
  db = openDatabase(file)
  // A note's name and its words, as every list and search reads them (book-words.ts).
  const forgetRead = bookFunctions(db, wordsOfPicture)
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
  // Old captures put away together, each run kept (haligtree.ts); the dated folder a run by hand puts them in.
  db.exec('create table if not exists put_away (id text primary key, at text not null)')
  try {
    db.exec('alter table put_away add column folder text')
  } catch {
    // Already there.
  }
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
  for (const add of ['alter table captures add column named integer not null default 0', "alter table nuggets add column source text not null default ''", 'alter table captures add column imported_at text', 'alter table captures add column edited_at text', 'alter table captures add column snoozed_until text']) {
    try {
      db.exec(add)
    } catch {
      // Already there.
    }
  }

  // A copy on every start, and a check each hour so a window left open for
  // days still gets one a day.
  // A failure is remembered there, and said once two in a row have failed.
  const backUpNow = (): void => void busy(() => backUpWatched())
  backUpNow()
  setInterval(backUpNow, 60 * 60 * 1000)

  registerRenames()

  // Null when the window's copy, `held`, is this one still.
  ipcMain.handle('captures:list', async (_event, held?: number) => {
    // Kept and nothing else has written since: only the rows saved since are read again. Otherwise the whole list is,
    // on the reading thread: each row's name is worked out of its words, about half a second of 20,000 notes, which
    // on main held every window. Windows asking at once share the one read.
    if (listed?.at === bookStamp()) relisted()
    else unlisted.clear()
    if (!listed || listed.at !== bookStamp()) {
      const at = bookStamp()
      // A read that failed is not kept: the next ask reads again.
      if (reading?.at !== at) reading = { at, rows: ask('list', [at]).catch((error: unknown) => ((reading = null), Promise.reject(error))) }
      const rows = await reading.rows
      // Kept as read for its stamp (another window's ask may have kept the same read already): anything written while
      // it was read moved the stamp past it, so the next ask reads again.
      if (listed?.at !== at || listed.rows !== rows) listed = { rows, at, version: ++versions }
    }
    // One hidden until a later day is out of the list, unless snoozed ones are
    // asked for; one in the Bin is there as any other. Kept per day, so it comes back on its own.
    const today = new Date().toLocaleDateString('sv')
    const show = (db.prepare("select value from settings where key = 'showSnoozed'").get() as { value: string } | undefined)?.value === 'true'
    const key = `${listed.version} ${today} ${show}`
    if (sighted?.key !== key) sighted = { key, version: ++versions, rows: show ? listed.rows : listed.rows.filter((row) => !row.snoozedUntil || (row.snoozedUntil as string) <= today || row.status === 'discarded') }
    return sighted.version === held ? null : { rows: sighted.rows, version: sighted.version }
  })

  // Search reads the whole book, so it is asked of the reading thread (reader.ts, book-find.ts), never run here:
  // `@` by name, ⌘K by words, and a link written by name, which asks once for all it needs. `asker` names the one
  // search box asking: of its asks, one not yet begun gives way to a newer one.
  makeFindTables(db)
  startReader(db, file)
  // The log of saves (haligtree.db-wal) is folded into the file when the app rests, by name, never inside an
  // answer. Left to SQLite, it is folded at the end of whichever statement comes after a save once the log has
  // grown past 4 MB: every save of a long note (8 to 12 MB a save), 10 to 25 ms inside whatever was asked next.
  // Now: FOLD_REST_MS after the last change told to the windows; or, typing that never rests that long, in a
  // turn of its own after the answer once the log has passed LOG_CAP (four saves of a 4 MB note). SQLite's own
  // fold stays as the backstop, at 64 MB (16,384 pages), for writing that tells the windows nothing until its
  // end (an import): where it folded every 4 MB of such writing, it folds every 64. Nothing is lost if the app
  // dies before a fold: the log is the book, read with the file at the next opening; and a quit folds it
  // (`shutDatabase`).
  const FOLD_REST_MS = 1500
  const LOG_CAP = 32 * 1024 * 1024
  db.exec('pragma wal_autocheckpoint = 16384')
  let folding: NodeJS.Timeout | null = null
  const fold = (): void => {
    folding = null
    if (db.isOpen) named('book: the log folded into the file', () => db.exec('pragma wal_checkpoint(PASSIVE)'))
  }
  whenAnyChanged(() => {
    if (folding) clearTimeout(folding)
    const grown = (statSync(`${file}-wal`, { throwIfNoEntry: false })?.size ?? 0) > LOG_CAP
    folding = setTimeout(fold, grown ? 0 : FOLD_REST_MS)
    folding.unref?.()
  })
  // New words read in a picture: every note's words and search's list are read again.
  registerPictureWords(() => (forgetRead(), forgetWords()))
  ipcMain.handle('captures:search', (_event, query: unknown) => ask('search', [query]))
  ipcMain.handle('captures:find', (event, query: unknown, only: unknown, asker: unknown) => ask('find', [bookStamp(), query, only], typeof asker === 'string' ? `find:${event.sender.id}:${asker}` : undefined))
  ipcMain.handle('captures:named', (_event, query: unknown, exact: unknown) => ask('named', [bookStamp(), query, exact]))

  // What search previews: 30 blocks of one note, which fill the pane (a 2 MB note whole took longer to draw than to
  // read): its start, or, with words searched for that first stand further in, the part they stand in, so a match is
  // shown in the preview and not only said in the list (`words`, lower case).
  ipcMain.handle('captures:peek', (_event, type: unknown, id: unknown, words: unknown) => {
    const row = db.prepare(type === 'day' ? 'select body from day_pages where day = ?' : `select body from ${type === 'capture' ? 'captures' : 'nuggets'} where id = ?`).get(String(id)) as { body: string | null } | undefined
    let body: unknown
    try {
      body = JSON.parse(row?.body ?? 'null')
    } catch {
      body = row?.body ?? null
    }
    const looked = Array.isArray(words) ? words.filter((one): one is string => typeof one === 'string' && !!one) : []
    if (typeof body === 'string') {
      const at = looked.length ? Math.min(...looked.map((one) => body.toLowerCase().indexOf(one)).filter((one) => one >= 0)) : 0
      const from = Number.isFinite(at) && at > 4000 ? body.lastIndexOf('\n', at - 500) + 1 : 0
      return body.slice(from, from + 6000)
    }
    const doc = body as { content?: unknown[] } | null
    const wordsOf = (node: unknown): string => { const one = node as { text?: string; content?: unknown[] } | null; return (one?.text ?? '') + (one?.content ?? []).map(wordsOf).join('') }
    const hit = looked.length && Array.isArray(doc?.content) ? doc.content.findIndex((block) => looked.some((one) => wordsOf(block).toLowerCase().includes(one))) : -1
    const from = hit >= 30 ? hit - 5 : 0
    const shown = Array.isArray(doc?.content) && doc.content.length > 30 ? { ...doc, content: doc.content.slice(from, from + 30) } : body
    if (type !== 'day') return shown
    // A day is found by its two answers as well as its page: both previewed, each under its question.
    const answers = db.prepare("select question, answer from journal where day = ? and coalesce(answer, '') != ''").all(String(id)) as { question: Question; answer: string }[]
    if (!answers.length) return shown
    const text = (words: string): unknown => ({ type: 'text', text: words })
    const asked = answers.flatMap((one) => [
      { type: 'heading', attrs: { level: 3 }, content: [text(QUESTIONS[one.question] ?? one.question)] },
      { type: 'paragraph', content: [text(one.answer)] }
    ])
    const page = (shown as { content?: unknown[] } | null)?.content ?? []
    return { type: 'doc', content: [...page, ...asked] }
  })

  ipcMain.handle('captures:get', (_event, id: unknown) => {
    const row = db.prepare(`select ${LIST}, body, original_body as original from captures where id = ?`).get(String(id))
    // Opening it is a use: the first one sets its time to first use.
    quietly(() => db.prepare("update captures set first_used_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') where id = ? and first_used_at is null and julianday('now') - julianday(captured_at) > 1.0 / 1440").run(String(id)))
    return row ? { ...row, body: JSON.parse(row.body as string), original: row.original ? JSON.parse(row.original as string) : null } : null
  })

  // Each card is looked up once per wording: a site whose picture cannot be
  // kept is not asked again every launch. None at all in safe mode.
  db.exec('create table if not exists card_tries (id text primary key, body text)')
  // Which cards those are is read on the reading thread (reader-jobs.ts `cards`): it looks through every note's
  // words for a bookmark. Main writes down the ones it hands out.
  ipcMain.handle('captures:cards', async () => {
    if (setting('safeMode', false)) return []
    const rows = await ask('cards', [])
    const tried = db.prepare('insert or replace into card_tries (id, body) values (?, ?)')
    // That a card was looked up is in no list or search: the book's stamp stays where it was.
    quietly(() => { for (const row of rows) tried.run(row.id, row.body) })
    return rows.map((row) => ({ ...row, body: JSON.parse(row.body ?? 'null') }))
  })

  ipcMain.handle('captures:create', (event, raw: unknown) => {
    const patch = Patch().parse(raw)
    if (patch.body !== undefined) patch.body = foldMeeting(patch.body)
    // `Author:: Le Guin` on a line of its own: kept as a property, out of the words.
    const taken = patch.body !== undefined && patch.markdown === undefined ? takeBodyProperties(patch.body) : { body: patch.body, found: [] }
    if (taken.found.length) patch.body = taken.body
    const { id, number } = insert(patch, new Date().toISOString())
    if (taken.found.length) {
      const types = new Map((db.prepare('select name, type from properties').all() as { name: string; type: string }[]).map((row) => [row.name.toLowerCase(), row]))
      const fields: Record<string, unknown> = {}
      for (const { name, value } of taken.found) {
        const known = types.get(name.toLowerCase())
        const read = readValue(value, (known?.type as PropType | undefined) ?? null)
        if (!known) db.prepare('insert or ignore into properties (name, type) values (?, ?)').run(name, read.type)
        if (read.value !== '') fields[known?.name ?? name] = read.value
      }
      if (Object.keys(fields).length) db.prepare('update captures set fields = ? where id = ?').run(JSON.stringify(fields), id)
    }
    // A #bit kept as plain text does not make it private; any tag kept so is remembered, so it does nothing later either.
    const plain = [...new Set((patch.plainTags ?? []).map((tag) => tag.toLowerCase()))]
    if (plain.length) db.prepare('update captures set plain_tags = ?, private = case when ? then 0 else private end where id = ?').run(JSON.stringify(plain), plain.includes('bit') ? 1 : 0, id)
    // The plan's automatic context: which machine, and how long it took.
    // Who and where, and private, in the same breath: never briefly public.
    db.prepare('update captures set device = ?, elapsed_ms = ?, attribution = ?, medium = ?, private = max(private, ?) where id = ?').run(
      hostname().replace(/\.local$/, ''), patch.elapsedMs ?? null, patch.attribution || null, patch.medium || null, patch.private ? 1 : 0, id)
    // Lifted out of something else: it points back, and inherits the source,
    // never one invented at the point of selection.
    // Where you were: the app as Send to Haligtree keeps it (said beside it in lists, not an import), and the window and page.
    if (patch.from?.app)
      db.prepare('update captures set source = ?, window_title = ?, page_url = ? where id = ?').run(patch.from.app, patch.from.page || patch.from.title || null, /^https?:\/\//i.test(patch.from.url) ? patch.from.url : null, id)
    if (patch.origin)
      db.prepare(`update captures set origin_id = ?, attribution = coalesce(
        (select attribution from captures where id = ?), (select attribution from nuggets where id = ?)) where id = ?`).run(patch.origin, patch.origin, patch.origin, id)
    if (patch.markdown !== undefined || patch.body !== undefined) void writeMarkdown(number, patch.markdown ?? markdown(patch.body))
    if (patch.body !== undefined) syncLineCards(`capture:${id}`, patch.body, (db.prepare('select private from captures where id = ?').get(id) as { private: number }).private)
    // Made already named: links waiting for that name point at it now.
    if (patch.body !== undefined || patch.title !== undefined || patch.markdown !== undefined) resolveWaiting(id)
    changed()
    celebrateAfter('captures:create', event.sender, [raw], id)
    nameIfLong('capture', id)
    return id
  })

  // Every note's #tags out of its name, once a book (tags-off-name.ts), as the Inbox is first looked at: each still
  // carries them, on its last line, and its row shows them as before. Its words change and nothing else (not when it
  // was changed: no list moves). Kept with the words as they were, so the Inbox's line can say it that day, and Undo
  // puts back each one not written since.
  type Moved = { at: string; rows: { id: string; number: number; was: string; now: string }[] }
  const keepMoved = (run: Moved): void => void db.prepare("insert or replace into settings (key, value) values ('tagsOffNames', ?)").run(JSON.stringify(run))
  const putMoved = (rows: Moved['rows'], back: boolean): Moved['rows'] => {
    const put = db.prepare('update captures set body = ? where id = ? and body = ?')
    return rows.filter((one) => put.run(back ? one.was : one.now, one.id, back ? one.now : one.was).changes)
  }
  const tellMoved = (rows: Moved['rows'], back: boolean): void => {
    for (const one of rows) void writeMarkdown(one.number, markdown(readKept(back ? one.was : one.now)))
    if (rows.length) changed()
  }
  ipcMain.handle('captures:tags-moved', (): { at: string; count: number } | null => {
    let run = setting<Moved | null>('tagsOffNames', null)
    if (!run) {
      const notes = db.prepare("select id, number, body, plain_tags from captures where status != 'discarded' and body like '%#%'").all() as { id: string; number: number; body: string; plain_tags: string | null }[]
      const made: Moved = { at: new Date().toISOString(), rows: notes.flatMap((row) => {
        const now = tagsOffName(readKept(row.body), (readKept(row.plain_tags) as string[] | null) ?? [])
        return now === null ? [] : [{ id: row.id, number: row.number, was: row.body, now: JSON.stringify(now) }]
      }) }
      run = atomically(() => {
        const done = { at: made.at, rows: putMoved(made.rows, false) }
        keepMoved(done)
        return done
      })
      tellMoved(run.rows, false)
    }
    return run.rows.length ? { at: run.at, count: run.rows.length } : null
  })
  ipcMain.handle('captures:tags-moved-undo', (): number => {
    const run = setting<Moved | null>('tagsOffNames', null)
    if (!run?.rows.length) return 0
    const back = atomically(() => {
      const done = putMoved(run.rows, true)
      keepMoved({ at: run.at, rows: [] })
      return done
    })
    tellMoved(back, true)
    return back.length
  })

  // Only the fields passed are written. `coalesce` keeps the rest as they were.
  ipcMain.handle('captures:save', (event, id: unknown, raw: unknown): SaveResult => saveOne(event.sender, id, raw, true))
  // Many at once (the Bin for every picked row, and its Undo): one write for the lot and one change told to the
  // windows, not one per note, which with 95 rows took two seconds of lists reloading. Each keeps its own patch.
  ipcMain.handle('captures:save-many', (event, saves: unknown): SaveResult[] => {
    const list = z.array(z.object({ id: z.string(), patch: z.unknown() })).parse(saves)
    const results = atomically(() => list.map((one) => saveOne(event.sender, one.id, one.patch, false)))
    changed()
    // The Inbox emptied by them is looked at once, after the last.
    const last = list.findLast((one, at) => (one.patch as { status?: string })?.status && !results[at].refused)
    if (last) celebrateAfter('captures:save', event.sender, [last.id, last.patch], results[list.indexOf(last)])
    return results
  })
  /**
   * The Markdown copies owed. A long note's words land without one (making it held the note's window 100 ms a
   * save); its editor sends it after them once the note has rested, or as the note is left (lib/same-words.ts),
   * under the number its save was answered with. Such a copy is only ever written by an editor, so the one on
   * disk is always whole, never a poorer one made here from the stored words (main's own converter writes
   * nothing for a drawing, a graph, a contents block or an embed). While one is owed the note is marked in the
   * book (`copies_owed`), so the mark outlives the app however it ends:
   *   a window that closes, the app quitting or not, hands over what it owes as it goes, with a call that is
   *   answered before it is gone (`captures:save-now`, below), and the copy is on the disk by then;
   *   if the app dies instead (a crash, a kill, the power), or a window is gone without a word, the last whole
   *   copy stays, and the first editor on a page after the next launch writes the owed ones (lib/owed-copies.ts).
   * A quit is never held up for any of this: holding one would call off a log out or a restart of the Mac.
   */
  db.exec('create table if not exists copies_owed (id text primary key)')
  const owed = new Map<string, { number: number; copy: number }>()
  /** Owed since before this run: no editor is on its way with them. */
  const leftOwed = new Set<string>()
  let copies = 0
  const mark = db.prepare('insert or ignore into copies_owed (id) values (?)')
  const unmark = db.prepare('delete from copies_owed where id = ?')
  // The marks are in no list and no search: the book's stamp stays where it was.
  const owe = (id: string, number: number): number => {
    if (!owed.has(id)) quietly(() => mark.run(id))
    leftOwed.delete(id)
    owed.set(id, { number, copy: ++copies })
    return copies
  }
  /** Its copy is on the disk (or it may have none any more): nothing is owed for it. */
  const settled = (id: string): void => {
    if (!owed.delete(id)) return
    leftOwed.delete(id)
    quietly(() => unmark.run(id))
  }
  owedNoMore = settled
  quietly(() => db.exec('delete from copies_owed where id not in (select id from captures)'))
  for (const row of db.prepare('select o.id, c.number from copies_owed o join captures c on c.id = o.id').all() as { id: string; number: number }[]) {
    owed.set(row.id, { number: row.number, copy: ++copies })
    leftOwed.add(row.id)
  }
  ipcMain.handle('haligtree:copies:left', () => [...leftOwed].flatMap((id) => (owed.has(id) ? [{ id, copy: owed.get(id)!.copy }] : [])))
  // A window on its way out (lib/same-words.ts `pageGoing`): its last words, or a copy it still owes, saved and
  // answered before it is gone, the Markdown written before the answer, so neither is cut short by the app ending.
  // Once a quit has been asked for, every copy is written that way, however it arrives.
  let quitting = false
  app.on('before-quit', () => void (quitting = true))
  ipcMain.on('captures:save-now', (event, id: unknown, raw: unknown) => {
    try {
      event.returnValue = saveOne(event.sender, id, raw, true, true)
    } catch (error) {
      console.error('A save made as its window went did not land:', error)
      event.returnValue = null
    }
  })
  /**
   * One capture saved; `tell` says the windows now, or leaves it to a batch's one telling; `now` writes its
   * Markdown copy before this returns.
   *
   * What holds main's thread here is the write and little else. An editor's words arrive as they are kept, as
   * bytes, and go to the database that way; the row is read once, and never its words, which the database compares
   * where they lie; what is worked out of the words (line cards, the name watch, the list's row, the Markdown
   * copy) comes after this has answered. A 4 MB note's save held the app 120 to 150 ms before (12 Nov).
   */
  function saveOne(sender: Electron.WebContents, id: unknown, raw: unknown, tell: boolean, now = false): SaveResult {
    const patch = Patch().parse(raw)
    const key = String(id)
    // A meeting in the shape it had before 6 Nov (an old version put back, a copy): kept the new way, every word in it.
    if (patch.body !== undefined) patch.body = foldMeeting(patch.body)
    const { kept, base } = wordsOf(patch)
    // An exit is taken from the inbox only: a promoted capture resolved, or a
    // resolved one discarded, would leave its undo nothing true to go back to.
    const before = db.prepare(`select status, private, first_used_at is null as unused, ${LABEL} as label from captures where id = ?`).get(key) as { status: string; private: number; unused: number; label: string } | undefined
    const was = before?.status
    // The Bin takes a capture from wherever it is, and remembers where, so it
    // comes back exactly there; an undo out of the Bin goes back the same way.
    const binning = !!patch.bin && (patch.status === 'discarded' || was === 'discarded')
    const refused = !binning && !!patch.status && patch.status !== 'open' && was !== 'open'
    if (refused) patch.status = undefined
    if (binning && patch.status === 'discarded' && was !== 'discarded') db.prepare('update captures set binned_was = ? where id = ?').run(was ?? 'open', key)
    if (binning && patch.status && patch.status !== 'discarded') db.prepare('update captures set binned_was = null where id = ?').run(key)
    // #bit written in makes it private, once: taken off by hand, it stays off. The words as they were are asked
    // only of a note not private yet whose new words carry the tag.
    const bit = kept !== null && !!before && !before.private && keptTagged(kept, 'bit')
    const hadBit = bit && tagged((db.prepare('select body from captures where id = ?').get(key) as { body: string | null } | undefined)?.body, 'bit')
    // One write of the row, of what the patch carries and nothing else: a column set to itself still wakes the
    // rules that watch it, each of which reads a long note's row through again. With the words go the words as
    // first written, kept the first time you change them (a capture edited and then promoted still has what you
    // actually caught; only your edits count, a link's card or a tag added in bulk do not), and when, for the
    // note's "Edited 2h ago". (`$edit`: these are your words. Every value on the right is the row as it was.)
    const fields = ([['title', patch.title], ['kind', patch.kind], ['status', patch.status]] as const).filter(([, value]) => value !== undefined)
    const NEW = 'cast($body as text)'
    // "Are these other words than the ones kept?" An editor's bytes are compared with their base here, where both
    // already are; the database then has nothing to compare (each time it is asked, it copies the 4 MB once more).
    const other = kept instanceof Uint8Array && base instanceof Uint8Array ? Buffer.compare(kept, base) !== 0 : null
    const land = (words: Kept | null, from: Kept | null): { number: number } | undefined => {
      // Known already, when the write itself checks that the words kept are the base.
      const known = from !== null && other !== null
      const edited = known ? '$edit' : `$edit and body is not ${NEW}`
      const sets = [
        ...(words === null || (known && (patch.fetched || !other)) ? [] : [
          `original_body = case when ${edited} then coalesce(original_body, body) else original_body end`,
          `edited_at = case when ${edited} then strftime('%Y-%m-%dT%H:%M:%fZ', 'now') else edited_at end`
        ]),
        ...(words === null ? [] : [`body = ${NEW}`]),
        ...fields.map(([name]) => `${name} = $${name}`)
      ]
      // A note not used yet is marked used by its first save past its first minute (the rule on `status`, haligtree.ts).
      if (sets.length && before?.unused && !patch.status) sets.push('status = status')
      // Nothing of the row to change (its Markdown copy alone, or words that gave way): only whether it is there.
      if (!sets.length) return db.prepare('select number from captures where id = ?').get(key) as { number: number } | undefined
      // Two editors on one note, or an editor and a merge: words written since this editor last looked are never
      // written over. `body is $base` is that question, asked in the write itself.
      return db.prepare(`update captures set ${sets.join(', ')} where id = $id${from === null ? '' : ' and body is cast($base as text)'} returning number`).get({
        $id: key,
        ...(words === null ? {} : { $body: words }),
        ...(words === null || (known && (patch.fetched || !other)) ? {} : { $edit: patch.fetched ? 0 : 1 }),
        ...(from === null ? {} : { $base: from }),
        ...Object.fromEntries(fields.map(([name, value]) => [`$${name}`, value as string]))
      }) as { number: number } | undefined
    }
    let row = named('save: the write', () => land(kept, base))
    // Not written: the note is gone, or its words are not the base letter for letter. The slow look says whether
    // they have moved on (the editor is told what is there now, and folds its own words in; the rest of the patch
    // still lands) or are the same words kept with other spacing (they land).
    const moved = !row && kept !== null && base !== null ? movedOn('captures', key, base) : null
    if (!row && kept !== null && base !== null) row = land(moved ? null : kept, null)
    const landed = !!row && kept !== null && !moved
    if (landed && bit && !hadBit) db.prepare('update captures set private = 1 where id = ?').run(key)
    // Its "question :: answer" lines kept as review cards: after this has answered for an editor's words.
    if (landed && patch.words) lineCardsSoon('captures', key)
    else if (landed) syncLineCards(`capture:${key}`, patch.body, (db.prepare('select private from captures where id = ?').get(key) as { private: number }).private)
    // The Markdown copy. It comes with an ordinary note's words. A long note's editor sends it after them, under
    // the number its save was answered with, and it is taken only while those are still the last words saved;
    // a document saved without one (a sticky's tick) is turned into it here.
    let copy: number | undefined
    // For a window on its way out, and once the app is quitting, the copy is on the disk before this answers.
    const written = (number: number, text: string): Promise<void> => (now || quitting ? (writeMarkdownNow(number, text), Promise.resolve()) : writeMarkdown(number, text))
    if (row && patch.markdown !== undefined && !moved) {
      const mine = patch.copy
      if (mine === undefined) {
        if (landed) settled(key)
        void written(row.number, patch.markdown)
        // Owed until it is on the disk.
      } else if (owed.get(key)?.copy === mine) void written(row.number, patch.markdown).then(() => void (owed.get(key)?.copy === mine && settled(key)))
    } else if (landed && patch.words) copy = owe(key, row!.number)
    else if (landed) {
      settled(key)
      void written(row!.number, markdown(patch.body))
    } else if (patch.status) checkMarkdown(key)
    // A copy alone changes nothing a window shows.
    if (tell && !(patch.markdown !== undefined && kept === null && !fields.length)) changed({ kind: 'capture', id: key })
    // Renamed: once the new name rests, every link to it says it (renames.ts), looked at once this has answered.
    // Only a name you changed: a link card filling in its page's title, or a book being set out, is written as fetched and renames nothing.
    if (row && before && !patch.fetched && (landed || patch.title !== undefined)) setImmediate(() => named('save: the name watched', () => watchName(key, before.label ?? '', sender)))
    const result: SaveResult = { was, refused, ...(moved ? { conflict: true, body: moved.body } : {}), ...(copy === undefined ? {} : { copy }) }
    if (tell && patch.status) celebrateAfter('captures:save', sender, [id, patch], result)
    return result
  }
}

/** One new row, numbered after the last. */
function insert(patch: CapturePatch & { source?: string }, capturedAt: string): { id: string; number: number } {
  // A #tag typed in the name goes to the note's last line, however it came in (tags-off-name.ts).
  if (patch.body !== undefined) patch.body = tagsOffName(patch.body, patch.plainTags?.map((tag) => tag.toLowerCase())) ?? patch.body
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
  if (db) quietly(() => db.prepare('insert into app_opens (opened_at, surface) values (?, ?)').run(new Date().toISOString(), surface))
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
    const joked = (jokes || isBit(titleOfMarkdown(words))) && !tagged(words, 'bit') ? String(withTag(words, 'bit')) : words
    const chunk = String(tagsOffName(joked) ?? joked)
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
 * Each keeps its title, its address, the day it was saved, and its site as
 * where it came from. Raindrop's highlights come too, each as a quote under
 * the link's card, and its folder (all but "Unsorted") and tags as #tags. A
 * link already in the book is not made twice: only highlights it does not
 * have yet are added under it.
 */
export function importBookmarks(name: string, html: string): number {
  // Matched on the address anywhere in the body: once a link becomes its card,
  // the body is the card, and a second import must still see it.
  const seen = db.prepare('select id, number, body from captures where source = ? and body like ?')
  const where = db.prepare('update captures set medium = ? where id = ?')
  const again = db.prepare('update captures set body = ? where id = ?')
  let added = 0
  const plain = (text: string): string =>
    text.replace(/&(amp|quot|#39|lt|gt);/g, (_, code: string) => ({ amp: '&', quot: '"', '#39': "'", lt: '<', gt: '>' })[code]!).trim()
  const tagOf = (word: string): string => word.trim().toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '')
  type Block = { type: string; attrs?: Record<string, unknown>; content?: Block[]; text?: string }
  // A highlight's lines, without what a copied search answer leaves behind ("+2", "·Great Books In 10 Minutes").
  const quote = (raw: string): Block | null => {
    const lines = plain(raw.replace(/<[^>]+>/g, '')).split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !/^\+\d+$/.test(line) && !/^·/.test(line))
    return lines.length ? { type: 'blockquote', content: lines.map((line) => ({ type: 'paragraph', content: [{ type: 'text', text: line }] })) } : null
  }
  let folder = ''
  // Each entry: a folder heading, or a link with what follows it up to the next entry (its highlights).
  for (const [, heading, url, attrs, raw, after] of html.matchAll(/<h3[^>]*>([^<]*)<\/h3>|<a\s+href="([^"]+)"([^>]*)>([^<]*)<\/a>([\s\S]*?)(?=<dt>|<\/dl>|$)/gi)) {
    if (heading !== undefined) {
      folder = /^unsorted$/i.test(plain(heading)) ? '' : plain(heading)
      continue
    }
    const title = plain(raw)
    // An address that does not parse ("http://[bad") is skipped, not the rest of the file.
    const host = URL.canParse(url) ? new URL(url).hostname.replace(/^www\./, '') : null
    if (!host || !/^https?:/.test(url)) continue
    const quotes = [...after.matchAll(/<blockquote[^>]*>([\s\S]*?)<\/blockquote>/gi)].map(([, text]) => quote(text)).filter((one): one is Block => !!one)
    const was = seen.get(name, `%${url}%`) as { id: string; number: number; body: string } | undefined
    if (was) {
      // Already here: only the highlights it does not have yet.
      const body = JSON.parse(was.body) as unknown
      const doc: Block = body && typeof body === 'object' ? (body as Block) : { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: String(body ?? url) }] }] }
      const has = JSON.stringify(doc)
      const fresh = quotes.filter((one) => !has.includes(JSON.stringify(one.content![0].content![0].text).slice(1, 41)))
      if (!fresh.length) continue
      again.run(JSON.stringify({ ...doc, content: [...(doc.content ?? []), ...fresh] }), was.id)
      added += 1
      continue
    }
    const saved = /add_date="(\d+)"/i.exec(attrs)?.[1]
    const cover = /data-cover="([^"]+)"/i.exec(attrs)?.[1] ?? ''
    const tags = [folder, ...(/tags="([^"]*)"/i.exec(attrs)?.[1] ?? '').split(',')].map(tagOf).filter(Boolean)
    // With highlights, the card is made here from what Raindrop kept, so the quotes sit under it; a bare link stays
    // its address, and becomes its card as any link does (link-card.ts).
    const card: Block = { type: 'bookmark', attrs: { href: url, title: title || url, description: '', image: cover, icon: '', site: host, id: randomUUID(), loading: false } }
    const tagLine: Block[] = tags.length ? [{ type: 'paragraph', content: [{ type: 'text', text: tags.map((tag) => `#${tag}`).join(' ') }] }] : []
    const body = quotes.length || tags.length ? { type: 'doc', content: [card, ...quotes, ...tagLine] } : url
    const { id, number } = insert({ title: title || url, kind: 'link', body, source: name }, saved ? new Date(Number(saved) * 1000).toISOString() : new Date().toISOString())
    where.run(host, id)
    const lines = quotes.map((one) => one.content!.map((line) => `> ${line.content![0].text}`).join('\n'))
    void writeMarkdown(number, [`[${title || url}](${url})`, ...lines, ...(tags.length ? [tags.map((tag) => `#${tag}`).join(' ')] : [])].join('\n\n'))
    added += 1
  }
  if (added) changed()
  return added
}
/**
 * A drawing whose note went away while its window was still open: kept as a
 * note of its own in the Inbox rather than lost with the window.
 */
export function rescueDrawing(scene: unknown): void {
  const body = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Drawing, rescued' }] }, { type: 'excalidraw', attrs: { scene, height: 300 } }] }
  insert({ title: '', kind: 'note', body }, new Date().toISOString())
  changed()
}

/**
 * A new empty note for a small window (small-window.ts): in the Inbox while the window holds it, and gone with the
 * window if that closes with it still empty. Made here rather than through captures:create, so a page with nothing on
 * it never counts as a capture kept (a new small window showed "100 captures kept" over an empty page).
 */
export function emptyNote(): string {
  const { id } = insert({ title: '', kind: 'note', body: { type: 'doc', content: [{ type: 'paragraph' }] } as never }, new Date().toISOString())
  changed()
  return id
}

/** A meeting just recorded (meeting.ts), kept as a note named for it, in the Inbox and on its day in the Journal. */
export function keepMeeting(title: string, body: unknown): string {
  const { id, number } = insert({ title, kind: 'note', body: body as never, source: 'Meeting' }, new Date().toISOString())
  db.prepare('update captures set named = 1 where id = ?').run(id)
  void writeMarkdown(number, markdown(body as never))
  changed()
  return id
}

/**
 * Words sent from another app's Services menu ("Send to Haligtree"): a quote in the
 * Inbox, saying where it came from (the page's address as a link, else the app),
 * with nothing copied. Its id; '' when there were no words.
 */
export function captureSent(text: string, from: { app?: string; url?: string; title?: string }): string {
  const lines = text.replace(/\r\n?/g, '\n').split(/\n{2,}/).map((one) => one.trim()).filter(Boolean)
  if (!lines.length) return ''
  const said = lines.map((line) => ({ type: 'paragraph', content: [{ type: 'text', text: line }] }))
  const url = from.url && /^https?:\/\//.test(from.url) ? from.url : ''
  const where = url ? [{ type: 'paragraph', content: [{ type: 'text', text: from.title || url, marks: [{ type: 'link', attrs: { href: url } }] }] }] : []
  const { id } = insert({ title: '', kind: 'quote', body: { type: 'doc', content: [...said, ...where] } as never }, new Date().toISOString())
  // Where it came from, said beside it in lists and search: the app (not an import, so no import date).
  if (from.app) db.prepare('update captures set source = ? where id = ?').run(from.app, id)
  recordOpen('services')
  changed()
  return id
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
    const kind = one.who ? 'quote' : guessKind(text, 'note')
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
    add.run(randomUUID(), cut(front.split('\n')[0], 160), JSON.stringify(back), front, at, at)
    added += 1
  }
  if (added) changed()
  return added
}

/** The vault note at this path, if it came in before: a capture, or an article. */
export function alreadyImported(path: string): Imported | null {
  const row = (db.prepare("select id as link, title from captures where source = ? and named = 1").get(path) ??
    db.prepare("select case when tier = 'article' then 'article:' else 'nugget:' end || id as link, title from nuggets where tier in ('article', 'nugget') and source = ?").get(path)) as { link: string; title: string } | undefined
  return row ? { ...row, path } : null
}

/**
 * An imported page whose file changed since it was last brought (its file time later than `source_at`): read again,
 * to be updated in place (`importNote`). One brought before the time was kept takes this time as where changes count.
 */
export function sourceChanged(path: string, modified: Date): boolean {
  const row = db.prepare("select id, source_at as at from nuggets where tier in ('article', 'nugget') and source = ?").get(path) as { id: string; at: string | null } | undefined
  if (!row) return false
  if (!row.at) return (db.prepare('update nuggets set source_at = ? where id = ?').run(modified.toISOString(), row.id), false)
  return row.at < modified.toISOString()
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
/** `toWriting`: an article in Pages, not yet sorted, whatever folder it is in (an import that files folders into groups). */
export function importNote(path: string, text: string, modified: Date, hidden = false, toWriting = false): Imported | 'empty' | 'already here' | 'updated' {
  const front = /^---\n([\s\S]*?)\n---(?:\n|$)/.exec(text)
  const fields = propertiesOf(front?.[1] ?? '')
  // Private by its name, or because an export from here said so.
  const secret = hidden || fields.private === 'true'
  delete fields.private
  // Its tags come in as real #tags (bringVault) and its aliases as other names
  // for it, each in its own row: not again as plain properties under them.
  const aliases = fields.aliases ? JSON.stringify(fields.aliases.split(/,\s*/).filter(Boolean)) : null
  delete fields.tags
  delete fields.aliases
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
  if (toWriting || /(^|\/)permanent\//.test(path)) {
    // Brought before: the same note, never a second copy. Changed in the source since, and not written in here since
    // it came (its saved time is still the file's), its words are the new ones; wherever the person moved it, it stays.
    // The file's own time when it was last brought (`source_at`, folders.ts lays the column down): a later one is a change.
    const had = db.prepare("select id, source_at as at from nuggets where tier in ('article', 'nugget') and source = ?").get(path) as { id: string; at: string | null } | undefined
    if (had) {
      const now = modified.toISOString()
      // Brought before the time was kept: this import's time is where changes count from.
      if (!had.at) db.prepare('update nuggets set source_at = ? where id = ?').run(now, had.id)
      if (!had.at || had.at >= now) return 'already here'
      // Its words before, kept in its history (the versions an edit keeps, notes.ts), whatever the ten-minute rule says:
      // the file's new words are a change made elsewhere, never a keystroke.
      db.prepare("insert into versions (item_id, body, saved_at) select id, body, ? from nuggets where id = ? and body is not null and body not in ('null', '\"\"')").run(new Date().toISOString(), had.id)
      db.prepare('update nuggets set body = ?, updated_at = ?, source_at = ? where id = ?').run(JSON.stringify(body), new Date().toISOString(), now, had.id)
      changed()
      return 'updated'
    }
    const id = randomUUID()
    // A note of one line the capture box would call a quote or a word comes in as a gem of that kind (import.ts
    // `kindOf`); anything else, or unsure, is a page, as a long note always is.
    const guess = toWriting && !body.includes('\n') ? kindOf(body.trim()) : null
    const gem = guess === 'quote' || guess === 'word' ? guess : null
    db.prepare("insert into nuggets (id, tier, kind, title, body, created_at, updated_at, source, fields, private, unsorted, source_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .run(id, gem ? 'nugget' : 'article', gem ?? 'note', gem ? '' : title, JSON.stringify(body), new Date(at).toISOString(), modified.toISOString(), path, kept, secret ? 1 : 0, toWriting ? 1 : 0, modified.toISOString())
    if (aliases) db.prepare('update nuggets set aliases = ? where id = ?').run(aliases, id)
    return { link: `${gem ? 'nugget' : 'article'}:${id}`, title, path, private: secret }
  }
  if (db.prepare('select 1 from captures where source = ? and named = 1').get(path)) return 'already here'
  // A kind of ours, as an export from here writes it, comes back as that kind with its fields.
  // Otherwise the capture box's own guess, from its words (import.ts `kindOf`): a quote, a word, a link. A note of
  // several lines is never a task, whatever its first word (a checklist stays a note with its tasks in it); unsure
  // stays a note.
  const guess = kindOf(body.split('\n').length > 1 ? body : body.trim())
  const guessed = guess && !(guess === 'todo' && body.includes('\n')) && guess !== 'checkback' && (KINDS as readonly string[]).includes(guess) ? (guess as (typeof KINDS)[number]) : null
  const kind = (KINDS as readonly string[]).includes(fields.kind) ? (fields.kind as (typeof KINDS)[number]) : guessed ?? 'note'
  if (kind !== 'note') delete fields.kind
  const own = Object.keys(fields).length ? JSON.stringify(fields) : null
  const { id, number } = insert({ title, kind, body, source: path }, new Date(at).toISOString())
  db.prepare('update captures set named = 1, fields = ?, private = max(private, ?), aliases = coalesce(?, aliases) where id = ?').run(own, secret ? 1 : 0, aliases, id)
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
    const [table, id] = link.startsWith('article:') ? ['nuggets', link.slice(8)] : link.startsWith('nugget:') ? ['nuggets', link.slice(7)] : ['captures', link]
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
        .replace(/(?<!!)\[([^\]]*)\]\((?!https?:|haligtree:)([^)]+?\.md)(#[^)]*)?\)/g, (whole, shown: string, page: string, heading?: string) =>
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

/**
 * Notes brought in before their front matter's `tags` stopped coming in twice:
 * the plain "tags" property goes, but only where every tag it lists is on the
 * note as a real #tag. Anything else is left as it is. How many it took from.
 */
export function dropDuplicateTags(): number {
  let dropped = 0
  for (const table of ['captures', 'nuggets'] as const) {
    const rows = db.prepare(`select id, body, fields, title as label from ${table} where fields like '%"tags"%'`).all() as { id: string; body: string | null; fields: string; label: string | null }[]
    for (const row of rows) {
      const read = (text: string | null): unknown => {
        try { return JSON.parse(text ?? '') } catch { return text }
      }
      const fields = read(row.fields) as Record<string, unknown> | null
      if (!fields || typeof fields !== 'object' || typeof fields.tags !== 'string') continue
      const body = read(row.body)
      const listed = fields.tags.split(/[,\s]+/).map((one) => one.replace(/^#/, '').toLowerCase()).filter(Boolean)
      const real = new Set(tagsIn(`${row.label ?? ''}\n${plain(body)}`))
      if (!listed.length || !listed.every((one) => real.has(one))) continue
      delete fields.tags
      db.prepare(`update ${table} set fields = ? where id = ?`).run(Object.keys(fields).length ? JSON.stringify(fields) : null, row.id)
      dropped += 1
    }
  }
  return dropped
}

export function registerImportConversion(): void {
  ipcMain.handle('haligtree:properties:drop-duplicate-tags', () => dropDuplicateTags())
  ipcMain.handle('haligtree:imports:pending', () => importing ? [] : [
    ...db.prepare("select 'captures' as tbl, id from captures where named = 1 and body like '\"%'").all(),
    ...db.prepare("select 'nuggets' as tbl, id from nuggets where tier in ('article', 'nugget') and source != '' and body like '\"%'").all()
  ])
  ipcMain.handle('haligtree:imports:body', (_event, tbl: unknown, id: unknown) =>
    (db.prepare(`select body from ${tbl === 'nuggets' ? 'nuggets' : 'captures'} where id = ?`).get(String(id)) as { body: string } | undefined)?.body ?? null)
  // Only over the Markdown it was made from: a note edited meanwhile keeps its edit.
  ipcMain.handle('haligtree:imports:converted', (_event, tbl: unknown, id: unknown, markdown: unknown, doc: unknown) => {
    const table = tbl === 'nuggets' ? 'nuggets' : 'captures'
    const last = (db.prepare('select coalesce(max(id), 0) as n from versions').get() as { n: number }).n
    db.prepare(`update ${table} set body = ? where id = ? and body = ?`).run(JSON.stringify(doc), String(id), JSON.stringify(String(markdown)))
    db.prepare('delete from versions where item_id = ? and id > ?').run(String(id), last)
  })
}
