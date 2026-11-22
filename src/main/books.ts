import { pathToFileURL } from 'node:url'
import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import { randomBytes, randomUUID } from 'crypto'
import { existsSync, readFileSync, statSync } from 'fs'
import { copyFile, cp, mkdir, readdir, readFile, rename, rm, writeFile } from 'fs/promises'
import { keepNewest } from './keep-days'
import { DatabaseSync } from 'node:sqlite'
import { Worker } from 'node:worker_threads'
import { join } from 'path'
import copyThread from './copy-worker?modulePath'

import { atomically, changed, database } from './captures'
import { dayKey } from './dates'
import { BOOK, SANDBOX, bookRoot, dataRoot, isBookId, readShelf, realRoot, relaunch, sandboxRoot, writeShelf } from './sandbox'
import { cut } from './clip'

/**
 * Books, as the app uses them: the list, a new one, a name changed, one
 * deleted (a full copy kept first), the switch from one to
 * another, and a note copied into another book.
 *
 * A book is only ever written by the run that has it open. A note copied
 * into another book is written down as a file in that book's `arriving/`
 * folder, with its pictures and files copied into that book's store, and
 * the book takes it in the next time it opens, after its own database is
 * ready. The book it came from is only read.
 */

/**
 * Another book's file, looked into without touching it: no lock taken and no lock file written beside it, so a peek
 * from the sandbox leaves your own folder byte for byte as it was. Only for a book not open anywhere, whose last
 * close folded every save into the file.
 */
const peek = (file: string): DatabaseSync => new DatabaseSync(pathToFileURL(file).href + '?immutable=1', { readOnly: true })

export const DEFAULT_NAME = 'My book'
/** "default" for My book, a book's id, or "sandbox": what the renderer and the menus pass around. */
type BookId = string

export const here = (): BookId => (SANDBOX ? 'sandbox' : (BOOK ?? 'default'))
export const nameOf = (id: BookId): string => {
  const shelf = readShelf()
  if (id === 'sandbox') return 'Sandbox'
  if (id === 'default') return shelf.defaultName?.trim() || DEFAULT_NAME
  return shelf.books.find((one) => one.id === id)?.name ?? 'A book'
}
/** The hues a book can wear: the theme's own, so each one suits every theme. */
export const HUES = ['blue', 'purple', 'pink', 'red', 'orange', 'yellow', 'green', 'gray'] as const
const hueOf = (color: unknown): string | null => (HUES as readonly unknown[]).includes(color) ? (color as string) : null
/**
 * Every book, each with its colour or null, in the one order every list of them keeps (the shelf, Settings › Books,
 * ⌘K). Once you have dragged them into an order of your own, yours, a book made since at its end (the user, 22 Nov:
 * "I'd love to be able to reorder the books"). Until then the open one first, then the others by when each was last
 * opened, so the first of the others is the book you were just in. One never opened since that was kept comes after
 * those, My book before the rest, as they were made.
 */
export const books = (): { id: BookId; name: string; createdAt: string | null; current: boolean; color: string | null; openedAt: number | null }[] => {
  const shelf = readShelf()
  const at = (id: BookId): number => (typeof shelf.opened?.[id] === 'number' ? shelf.opened[id] : 0)
  return [
    ...(shelf.defaultGone ? [] : [{ id: 'default', name: nameOf('default'), createdAt: null, current: here() === 'default', color: hueOf(shelf.defaultColor) }]),
    ...shelf.books.map((one) => ({ id: one.id, name: one.name, createdAt: one.createdAt, current: here() === one.id, color: hueOf(one.color) }))
  ].map((one, made) => ({ ...one, openedAt: at(one.id) || null, made }))
    .sort((a, b) => {
      if (shelf.order?.length) {
        const [x, y] = [shelf.order.indexOf(a.id), shelf.order.indexOf(b.id)]
        if (x !== y) return x < 0 ? 1 : y < 0 ? -1 : x - y
        return a.made - b.made
      }
      return Number(b.current) - Number(a.current) || (b.openedAt ?? 0) - (a.openedAt ?? 0) || a.made - b.made
    })
    .map(({ made: _made, ...one }) => one)
}
const folderOf = (id: BookId): string | null => (id === 'default' ? (readShelf().defaultGone ? null : realRoot()) : isBookId(id) && readShelf().books.some((one) => one.id === id) ? bookRoot(id) : null)
const cleanName = (name: unknown): string => cut(String(name ?? '').replace(/\s+/g, ' ').trim(), 60)

/** Every window's open editors write what is waiting, then the switch. */
async function flushWindows(): Promise<void> {
  await Promise.all(BrowserWindow.getAllWindows().filter((win) => !win.isDestroyed()).map((win) =>
    win.webContents.executeJavaScript("window.dispatchEvent(new Event('pagehide'))").catch(() => undefined)))
  // Each save is a message on its way: a moment for them to land.
  await new Promise((done) => setTimeout(done, 250))
}

/** What comes along into a book: your look, the same as into the sandbox. Applied once there. */
const CARRY = 'carry.json'
/** What to do once there: an import, asked for by Import into…. */
const NEXT = 'next.json'
const ARRIVING = 'arriving'

/** The switch: remembered as the book last open, then the gapless restart into it. */
async function switchTo(id: BookId, carry: unknown, then?: unknown): Promise<boolean> {
  const folder = folderOf(id)
  if (!folder || id === here() || SANDBOX) return false
  await mkdir(folder, { recursive: true })
  if (carry && typeof carry === 'object') await writeFile(join(folder, CARRY), JSON.stringify(carry))
  // What to import once there: a kind, or a vault already chosen (a test book made for it), not asked for again.
  const root = then && typeof then === 'object' && typeof (then as { root?: unknown }).root === 'string' ? (then as { root: string }).root : undefined
  if (then === 'vault' || then === 'files' || root) await writeFile(join(folder, NEXT), JSON.stringify({ import: root ? 'vault' : then, root }))
  await flushWindows()
  writeShelf({ ...readShelf(), last: id })
  setTimeout(() => relaunch({ book: id }), 60)
  return true
}

// --- copying into another book --------------------------------------------------------------

type Row = Record<string, unknown>
type Parcel = { from: string; at: string; items: { table: 'captures' | 'nuggets'; row: Row; glosses: Row[] }[] }
const ASSET = /haligtree:\/\/assets\/([a-f0-9]{64}\.[a-z0-9]+)/g

/** Copies of these notes, written down for another book with their pictures and files. The count copied. */
async function copyInto(refs: unknown, id: BookId): Promise<number> {
  const folder = folderOf(id)
  if (!folder || id === here() || !Array.isArray(refs)) return 0
  const db = database()
  const items: Parcel['items'] = []
  for (const ref of refs as { table?: unknown; id?: unknown }[]) {
    const table = ref?.table === 'nuggets' ? 'nuggets' : 'captures'
    const row = db.prepare(`select * from ${table} where id = ?`).get(String(ref?.id)) as Row | undefined
    if (!row || items.some((one) => one.row.id === row.id)) continue
    const glosses = table === 'nuggets' ? (db.prepare('select * from glosses where item_id = ? order by created_at').all(String(row.id)) as Row[]) : []
    items.push({ table, row, glosses })
  }
  if (!items.length) return 0
  // Pictures and files are named by their contents: one already there is the same file.
  const store = join(app.getPath('userData'), 'assets')
  const to = join(folder, 'assets')
  await mkdir(to, { recursive: true })
  for (const [, name] of JSON.stringify(items).matchAll(ASSET)) {
    // Copied beside and renamed in, so one cut short is never taken for the whole file.
    if (existsSync(join(store, name)) && !existsSync(join(to, name))) await copyFile(join(store, name), join(to, `${name}.part`)).then(() => rename(join(to, `${name}.part`), join(to, name)))
  }
  await mkdir(join(folder, ARRIVING), { recursive: true })
  const parcel: Parcel = { from: nameOf(here()), at: new Date().toISOString(), items }
  // Written whole under another name, then named: a book opening now never reads half of one.
  const file = join(folder, ARRIVING, `${Date.now()}-${randomUUID()}`)
  await writeFile(`${file}.part`, JSON.stringify(parcel))
  await rename(`${file}.part`, `${file}.json`)
  return items.length
}

type Node = { type?: string; text?: string; attrs?: Record<string, unknown>; content?: Node[]; marks?: unknown[] }
/** Links to what came along point at the copies; links to anything else become their words. */
function relink(body: unknown, ids: Map<string, string>): unknown {
  if (typeof body !== 'string') return body
  let doc: unknown
  try {
    doc = JSON.parse(body)
  } catch {
    return body
  }
  const walk = (node: Node): Node | null => {
    if (node?.type === 'noteLink') {
      const now = ids.get(String(node.attrs?.id ?? ''))
      if (now) return { ...node, attrs: { ...node.attrs, id: now, key: '' } }
      const words = String(node.attrs?.label || node.attrs?.text || '')
      return words ? { type: 'text', text: words } : null
    }
    return Array.isArray(node?.content) ? { ...node, content: node.content.map(walk).filter((one): one is Node => !!one) } : node
  }
  return doc && typeof doc === 'object' ? JSON.stringify(walk(doc as Node)) : body
}

/** What has arrived for this book from another, taken in as its own notes. */
async function takeArrivals(): Promise<number> {
  const dir = join(dataRoot(), ARRIVING)
  const files = existsSync(dir) ? (await readdir(dir)).filter((name) => name.endsWith('.json')).sort() : []
  if (!files.length) return 0
  const db = database()
  const columns = (table: string): Set<string> => new Set((db.prepare(`pragma table_info(${table})`).all() as { name: string }[]).map((one) => one.name))
  const have = { captures: columns('captures'), nuggets: columns('nuggets'), glosses: columns('glosses') }
  const put = (table: 'captures' | 'nuggets' | 'glosses', row: Row): void => {
    const keys = Object.keys(row).filter((key) => have[table].has(key))
    db.prepare(`insert into ${table} (${keys.join(', ')}) values (${keys.map(() => '?').join(', ')})`).run(...(keys.map((key) => row[key]) as never[]))
  }
  let made = 0
  for (const name of files) {
    let parcel: Parcel
    try {
      parcel = JSON.parse(await readFile(join(dir, name), 'utf8')) as Parcel
    } catch {
      continue
    }
    const ids = new Map(parcel.items.map((one) => [String(one.row.id), randomUUID()]))
    atomically(() => {
      for (const { table, row, glosses } of parcel.items) {
        const copy: Row = { ...row, id: ids.get(String(row.id)), body: relink(row.body, ids) }
        if (table === 'captures') {
          copy.number = (db.prepare('select coalesce(max(number), 0) + 1 as n from captures').get() as { n: number }).n
          // What it was lifted from stayed behind.
          copy.origin_id = null
        } else copy.capture_id = null
        put(table, copy)
        for (const gloss of glosses ?? []) put('glosses', { ...gloss, id: randomUUID(), item_id: copy.id })
        made++
      }
    })
    await rm(join(dir, name), { force: true })
  }
  if (made) changed()
  return made
}

/** Once, as a book opens: your look as it came along, for the main window to wear. */
export const carried = (): unknown => {
  try {
    return JSON.parse(readFileSync(join(dataRoot(), CARRY), 'utf8'))
  } catch {
    return null
  }
}
/** The import asked for by Import into…, taken once. */
export async function nextImport(): Promise<{ what: 'vault' | 'files'; root?: string } | null> {
  const file = join(dataRoot(), NEXT)
  try {
    const asked = JSON.parse(await readFile(file, 'utf8')) as { import?: string; root?: string }
    await rm(file, { force: true })
    return asked.import === 'vault' || asked.import === 'files' ? { what: asked.import, root: typeof asked.root === 'string' ? asked.root : undefined } : null
  } catch {
    return null
  }
}

// --- backups of every book ------------------------------------------------------------------

/**
 * A whole copy of a book's file at `to` (`vacuum into`), written on a thread of its own (copy-worker.ts): made on
 * main, the first start of each day held every window while the books were copied, the longest hold of that start
 * on the user's book (qa/start-time.mjs, 16 Nov). Fails with SQLite's own words, as a copy made on main did.
 */
export function copyBook(from: string, to: string): Promise<void> {
  // Written beside its name and renamed in once whole: Haligtree quit while a copy is under way leaves no half copy
  // standing for the day (`clearCutCopies` takes it away at the next start).
  const part = `${to}.${process.pid}.part`
  return new Promise<void>((done, failed) => {
    const thread = new Worker(copyThread, { workerData: { from, to: part }, name: 'haligtree-copy' })
    thread.once('message', (fault: { message: string; code?: unknown } | null) => (fault ? failed(Object.assign(new Error(fault.message), { code: fault.code })) : done()))
    thread.once('error', failed)
    thread.once('exit', (code) => failed(new Error(`the copy stopped (its thread ended with code ${code})`)))
  }).then(() => rename(part, to), (error) => rm(part, { force: true }).then(() => Promise.reject(error)))
}

/** Copies a quit cut short in a backup folder (never this run's): gone, so they never fill it. */
export async function clearCutCopies(dir: string): Promise<void> {
  for (const name of await readdir(dir)) {
    const pid = /\.db\.(\d+)\.part$/.exec(name)?.[1]
    if (pid && Number(pid) !== process.pid) await rm(join(dir, name), { force: true })
  }
}

/**
 * Today's copy of each book not open in this run, by `vacuum into` from a
 * read-only connection (`copyBook`), and only when the book has changed since its last
 * copy: a book left alone for a month is not opened at all.
 */
export async function backUpOthers(dirFor: (id: string | null) => string): Promise<void> {
  for (const book of books()) {
    if (book.current) continue
    const folder = folderOf(book.id)
    const file = folder && join(folder, 'haligtree.db')
    if (!file || !existsSync(file)) continue
    const dir = join(dirFor(book.id === 'default' ? null : book.id), 'database')
    const today = join(dir, `haligtree-${dayKey()}.db`)
    // Every book's old copies go, whether or not it has a new one today: before, a book not open was never pruned.
    await keepNewest(dir)
    if (existsSync(today)) continue
    await mkdir(dir, { recursive: true })
    await clearCutCopies(dir)
    const copies = (await readdir(dir)).filter((name) => /^haligtree-\d{4}-\d{2}-\d{2}\.db$/.test(name)).sort()
    const latest = copies.at(-1)
    // Saves not yet folded into the file wait in its log, so the newer of the
    // two says when it last changed; a log written before the last copy (or
    // an empty one, left by the read-only copy) holds nothing new.
    const wal = `${file}-wal`
    const lastSave = Math.max(statSync(file).mtimeMs, existsSync(wal) && statSync(wal).size > 0 ? statSync(wal).mtimeMs : 0)
    const changedSince = !latest || lastSave > statSync(join(dir, latest)).mtimeMs
    if (!changedSince) continue
    await copyBook(file, today).catch((error) => console.error(`Backup of ${book.name} failed:`, error))
  }
}

/** A book's reader card on the shelf (books.tsx ShelfBook, reader-card.tsx ShelfCover): its seed and the facts behind its stamps. */
type Card = { seed: number | null; facts: { notes: number; since: string | null; linked: boolean; journal: number; reviewed: boolean } }
/** Each book's card, kept until its file changes: pointing along the shelf again asks nothing of any book. */
const cards = new Map<string, { stamp: number; card: Card | null }>()
/** Books whose card could not be read, said once each in the log. */
const cardTold = new Set<string>()

/**
 * The reader card another book wears on the shelf, read as Settings reads the open book's (haligtree.ts 'reader:card'):
 * the seed kept in its settings and the counts behind its stamps. Read from its file without opening it here (`peek`).
 * Each part asked on its own, so a book made by an older build, without the journal or the review log, still shows its
 * card with what it has. A file that cannot be read at all is said once in the log, with why, and gets no card.
 */
function cardOf(id: BookId): Card | null {
  const folder = folderOf(id)
  const file = folder && join(folder, 'haligtree.db')
  if (!folder || !file || !existsSync(file)) return null
  const wal = `${file}-wal`
  const stamp = statSync(file).mtimeMs + (existsSync(wal) ? statSync(wal).mtimeMs : 0)
  const kept = cards.get(id)
  if (kept?.stamp === stamp) return kept.card
  let other: DatabaseSync | null = null
  let card: Card | null = null
  try {
    other = id === here() ? null : peek(file)
    const db = other ?? database()
    const one = <T>(sql: string, or: T, read: (row: Record<string, unknown> | undefined) => T): T => {
      try {
        return read(db.prepare(sql).get() as Record<string, unknown> | undefined)
      } catch {
        return or
      }
    }
    const notes = one("select count(*) n, min(captured_at) first from captures where status != 'discarded'", { n: 0, first: null as string | null }, (row) => ({ n: Number(row?.n ?? 0), first: (row?.first as string | null) ?? null }))
    const seed = one("select value from settings where key = 'readerSeed'", null as number | null, (row) => {
      const value = row ? JSON.parse(String(row.value)) : null
      return typeof value === 'number' ? value : null
    })
    card = {
      seed,
      facts: {
        notes: notes.n,
        since: notes.first,
        linked: one(`select 1 from captures where status != 'discarded' and (body like '%"noteLink"%' or body like '%[[@%') limit 1`, false, (row) => !!row),
        journal: one("select count(distinct day) n from journal where answer != ''", 0, (row) => Number(row?.n ?? 0)),
        reviewed: one('select 1 from review_log limit 1', false, (row) => !!row)
      }
    }
  } catch (error) {
    if (!cardTold.has(id)) (cardTold.add(id), console.warn(`The shelf could not read the reader card of ${nameOf(id)} (${file}):`, error instanceof Error ? error.message : error))
  } finally {
    other?.close()
  }
  cards.set(id, { stamp, card })
  return card
}

/** What is My book's own in the app's folder (its notes, pictures, files and its windows' places), as a book's own folder holds them. */
const MY_BOOK_PARTS = /^(haligtree\..*db(-wal|-shm|-journal)?|assets|notes|thumbs|meetings|Scenery|scenery-cache|giphy-cache|site-icons|arriving|[^/]+\.json|[^/]+\.part)$/
/** What the app and every book share there: never My book's to delete. */
const SHARED = new Set(['books', 'books.json', 'sandbox', 'sandbox-carry-out.json'])
/** "… is deleted", owed to the window of the run that deleted a book it had left. */
let deletedNote: string | null = null

export function registerBooks(backupBase: () => string, onChange: () => void): void {
  const handle = (channel: string, run: (...args: never[]) => unknown): void =>
    void ipcMain.handle(`haligtree:books:${channel}`, (_event, ...args) => run(...(args as never[])))
  const tell = (): void => {
    for (const win of BrowserWindow.getAllWindows()) if (!win.isDestroyed()) win.webContents.send('books:changed')
    // What hears of it (the menu's book list, read from the open book) never undoes a change already kept on the shelf:
    // read while the book is shut for a switch, it failed the save, and the order was said "Not saved" when it was.
    try {
      onChange()
    } catch (error) {
      console.warn(`[haligtree] the shelf changed, but what follows it could not be told: ${(error as Error)?.message ?? error}`)
    }
  }

  // A book opened for the first time has nothing in it: Getting started, not the whole welcome.
  if (BOOK) {
    const db = database()
    const welcomed = db.prepare("select 1 from settings where key = 'welcomed'").get()
    const empty = !db.prepare('select 1 from captures limit 1').get() && !db.prepare('select 1 from nuggets limit 1').get()
    if (!welcomed && empty) db.prepare("insert or replace into settings (key, value) values ('welcomed', ?)").run(JSON.stringify(new Date().toISOString()))
  }
  void takeArrivals().catch((error) => console.error('Copies from another book:', error))
  // Opened now: kept on the shelf, for the order every list of books keeps. Never from the sandbox, which leaves your own folder as it was.
  if (!SANDBOX) {
    const shelf = readShelf()
    writeShelf({ ...shelf, opened: { ...shelf.opened, [here()]: Date.now() } })
  }

  handle('card', (id: unknown) => cardOf(String(id)))
  handle('list', () => ({ current: here(), name: nameOf(here()), books: books(), color: SANDBOX ? null : (books().find((one) => one.current)?.color ?? null) }))

  handle('create', async (name: unknown) => {
    if (SANDBOX) return null
    const named = cleanName(name) || 'New book'
    const id = `b-${randomBytes(5).toString('hex')}`
    await mkdir(bookRoot(id), { recursive: true })
    const shelf = readShelf()
    writeShelf({ ...shelf, books: [...shelf.books, { id, name: named, createdAt: new Date().toISOString() }] })
    tell()
    return id
  })

  handle('rename', (id: unknown, name: unknown) => {
    const named = cleanName(name)
    if (!named || SANDBOX) return false
    const shelf = readShelf()
    if (id === 'default') writeShelf({ ...shelf, defaultName: named })
    else if (shelf.books.some((one) => one.id === id)) writeShelf({ ...shelf, books: shelf.books.map((one) => (one.id === id ? { ...one, name: named } : one)) })
    else return false
    tell()
    return true
  })

  // Your books in the order you dragged them into: every id given that is a book, then any book not named, as they stood.
  handle('order', (ids: unknown) => {
    if (SANDBOX || !Array.isArray(ids)) return false
    const known = books().map((one) => one.id)
    const order = [...new Set(ids.map(String).filter((id) => known.includes(id)))]
    writeShelf({ ...readShelf(), order: [...order, ...known.filter((id) => !order.includes(id))] })
    tell()
    return true
  })

  // A book's colour, or null for the theme's own. Never the sandbox's: it is someone else's book.
  handle('color', (id: unknown, color: unknown) => {
    if (SANDBOX) return false
    const hue = hueOf(color) ?? undefined
    const shelf = readShelf()
    if (id === 'default') writeShelf({ ...shelf, defaultColor: hue })
    else if (shelf.books.some((one) => one.id === id)) writeShelf({ ...shelf, books: shelf.books.map((one) => (one.id === id ? { ...one, color: hue } : one)) })
    else return false
    tell()
    return true
  })
  // Once a run: whether this run began by switching into its book, so the window washes into its colour.
  let arrivalTold = false
  handle('arrived', () => {
    if (arrivalTold) return false
    arrivalTold = true
    return !SANDBOX && process.argv.some((arg) => arg.startsWith('--book='))
  })

  // Any book but your last one (the user, 22 Nov: "what if we just say you can't delete your last book"). The open one
  // is left first: this run opens another, and that run deletes it (a book is never deleted by the run that has it open).
  handle('delete', async (id: unknown): Promise<string | 'leaving' | null> => {
    if (SANDBOX || (id !== 'default' && !isBookId(id)) || books().length < 2 || !folderOf(String(id))) return null
    if (id === here()) {
      // The first of the others in the shelf's order: the one Settings names as opening first.
      const next = books().filter((one) => !one.current)[0]
      writeShelf({ ...readShelf(), deleting: String(id) })
      return (await switchTo(next.id, null)) ? 'leaving' : (writeShelf({ ...readShelf(), deleting: undefined }), null)
    }
    return removeBook(String(id))
  })
  // A book asked to be deleted while it was open, deleted now that this run is in another. Said once in its window.
  const owed = readShelf().deleting
  if (owed && owed !== here() && !SANDBOX) {
    const name = nameOf(owed)
    void removeBook(owed).then((kept) => {
      writeShelf({ ...readShelf(), deleting: undefined })
      deletedNote = kept ? `${name} is deleted. A whole copy of it is kept with your backups, under deleted books` : `${name} wasn't deleted: its copy couldn't be made with your backups, so it was left as it was`
      tell()
    })
  }
  handle('deleted-note', () => { const note = deletedNote; deletedNote = null; return note })

  /** A book's files gone, once a whole copy of them is kept with the backups: the copy's folder, or null when it could not be made. */
  async function removeBook(id: BookId): Promise<string | null> {
    const folder = folderOf(id)
    if (!folder) return null
    const name = nameOf(id)
    const kept = join(backupBase(), 'deleted books', `${name.replace(/[^\p{L}\p{N} _-]+/gu, '').trim() || id} ${dayKey()} ${id}`)
    // My book's files sit in the app's own folder, beside what every book and the app share: only its own go.
    const parts = id === 'default' ? (await readdir(folder)).filter((entry) => MY_BOOK_PARTS.test(entry) && !SHARED.has(entry)) : null
    await mkdir(kept, { recursive: true })
    if (parts) for (const entry of parts) await cp(join(folder, entry), join(kept, entry), { recursive: true })
    else if (existsSync(folder)) await cp(folder, kept, { recursive: true })
    // Only once the copy holds its notes.
    if (existsSync(join(folder, 'haligtree.db')) && !existsSync(join(kept, 'haligtree.db'))) return null
    if (parts) for (const entry of parts) await rm(join(folder, entry), { recursive: true, force: true })
    else await rm(folder, { recursive: true, force: true })
    const shelf = readShelf()
    const { [id]: _gone, ...opened } = shelf.opened ?? {}
    const left = shelf.books.filter((one) => one.id !== id)
    writeShelf({ ...shelf, ...(id === 'default' ? { defaultGone: true } : { books: left }), order: shelf.order?.filter((one) => one !== id), last: shelf.last === id ? here() : shelf.last, opened })
    tell()
    return kept
  }

  handle('switch', (id: unknown, carry: unknown, then: unknown) => switchTo(String(id), carry, then))
  // A vault or export folder chosen before its test book is made (vault-picker.tsx): the path, or null.
  handle('pick-vault', async () => (await dialog.showOpenDialog({ title: 'Try a vault in a test book of its own: an Obsidian vault or a Notion export (unzipped)', properties: ['openDirectory'] })).filePaths[0] ?? null)
  // “Keep it running”, asked as you switch: this book's session goes on in its own database, and the next book's pill names it.
  handle('keep', () => void (SANDBOX || writeShelf({ ...readShelf(), kept: here() })))
  // The session left running in another book, read from that book's database
  // and never written: its book's name, for the pill, and the way back to it.
  // Back in that book, or with the session over, it is forgotten.
  handle('elsewhere', () => {
    const kept = readShelf().kept
    if (!kept) return null
    const forget = (): null => (writeShelf({ ...readShelf(), kept: undefined }), null)
    if (kept === here()) return forget()
    const folder = folderOf(kept)
    const file = folder && join(folder, 'haligtree.db')
    if (!file || !existsSync(file)) return forget()
    let other: DatabaseSync | null = null
    try {
      other = peek(file)
      const row = other.prepare(`select s.id, s.task_id as taskId, coalesce(s.goal, t.title, case s.kind when 'focus' then 'Focus' else 'Timer' end) as goal, s.started_at as startedAt, s.planned_ms as plannedMs,
        s.paused_ms as pausedMs, s.paused_at as pausedAt, s.rounds, s.kind, s.extended_ms as extendedMs from sessions s left join tasks t on t.id = s.task_id
        where s.ended_at is null and (t.id is not null or s.task_id = '') order by s.started_at desc limit 1`).get()
      return row ? { ...row, book: kept, bookName: nameOf(kept), color: books().find((one) => one.id === kept)?.color ?? null } : forget()
    } catch {
      return null
    } finally {
      other?.close()
    }
  })
  // The bars a book draws, read from its file without opening it here: the moment of going there wears them. Null: not set out yet, so it will wear yours.
  handle('bars', (id: unknown) => {
    const folder = id === 'sandbox' ? sandboxRoot() : folderOf(String(id ?? readShelf().last ?? 'default'))
    const file = folder && join(folder, 'haligtree.db')
    if (!file || !existsSync(file)) return null
    let other: DatabaseSync | null = null
    try {
      other = peek(file)
      const row = other.prepare("select value from settings where key = 'progressBars'").get() as { value: string } | undefined
      return row ? JSON.parse(row.value) : 'line'
    } catch {
      return null
    } finally {
      other?.close()
    }
  })
  // From the sandbox: the book to come back to, then the sandbox's own way out.
  handle('last', (id: unknown) => {
    if (!folderOf(String(id))) return false
    writeShelf({ ...readShelf(), last: String(id) })
    return true
  })
  handle('copy', (refs: unknown, id: unknown) => copyInto(refs, String(id)))
  handle('carry', async () => {
    const carry = carried()
    await rm(join(dataRoot(), CARRY), { force: true })
    return carry
  })
}
