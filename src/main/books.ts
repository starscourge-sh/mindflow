import { app, BrowserWindow, ipcMain, shell } from 'electron'
import { randomBytes, randomUUID } from 'crypto'
import { existsSync, readFileSync, statSync } from 'fs'
import { copyFile, cp, mkdir, readdir, readFile, rename, rm, writeFile } from 'fs/promises'
import { DatabaseSync } from 'node:sqlite'
import { join } from 'path'

import { atomically, changed, database } from './captures'
import { dayKey } from './dates'
import { BOOK, SANDBOX, bookRoot, dataRoot, isBookId, readShelf, realRoot, relaunch, writeShelf } from './sandbox'
import { cut } from './clip'

/**
 * Books, as the app uses them: the list, a new one, a name changed, one
 * shown in Finder or deleted (a full copy kept first), the switch from one to
 * another, and a note copied into another book.
 *
 * A book is only ever written by the run that has it open. A note copied
 * into another book is written down as a file in that book's `arriving/`
 * folder, with its pictures and files copied into that book's store, and
 * the book takes it in the next time it opens, after its own database is
 * ready. The book it came from is only read.
 */

export const DEFAULT_NAME = 'My book'
/** "default" for My book, a book's id, or "sandbox": what the renderer and the menus pass around. */
export type BookId = string

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
/** Every book, My book first, each with its colour or null. */
export const books = (): { id: BookId; name: string; createdAt: string | null; current: boolean; color: string | null }[] => {
  const shelf = readShelf()
  return [
    { id: 'default', name: nameOf('default'), createdAt: null, current: here() === 'default', color: hueOf(shelf.defaultColor) },
    ...shelf.books.map((one) => ({ id: one.id, name: one.name, createdAt: one.createdAt, current: here() === one.id, color: hueOf(one.color) }))
  ]
}
const folderOf = (id: BookId): string | null => (id === 'default' ? realRoot() : isBookId(id) && readShelf().books.some((one) => one.id === id) ? bookRoot(id) : null)
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
  if (then === 'vault' || then === 'files') await writeFile(join(folder, NEXT), JSON.stringify({ import: then }))
  await flushWindows()
  writeShelf({ ...readShelf(), last: id })
  setTimeout(() => relaunch({ book: id }), 60)
  return true
}

// --- copying into another book --------------------------------------------------------------

type Row = Record<string, unknown>
type Parcel = { from: string; at: string; items: { table: 'captures' | 'nuggets'; row: Row; glosses: Row[] }[] }
const ASSET = /mindflow:\/\/assets\/([a-f0-9]{64}\.[a-z0-9]+)/g

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
export async function takeArrivals(): Promise<number> {
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
export async function nextImport(): Promise<'vault' | 'files' | null> {
  const file = join(dataRoot(), NEXT)
  try {
    const asked = (JSON.parse(await readFile(file, 'utf8')) as { import?: string }).import
    await rm(file, { force: true })
    return asked === 'vault' || asked === 'files' ? asked : null
  } catch {
    return null
  }
}

// --- backups of every book ------------------------------------------------------------------

/**
 * Today's copy of each book not open in this run, by `vacuum into` from a
 * read-only connection, and only when the book has changed since its last
 * copy: a book left alone for a month is not opened at all.
 */
export async function backUpOthers(dirFor: (id: string | null) => string): Promise<void> {
  for (const book of books()) {
    if (book.current) continue
    const folder = folderOf(book.id)
    const file = folder && join(folder, 'mindflow.db')
    if (!file || !existsSync(file)) continue
    const dir = join(dirFor(book.id === 'default' ? null : book.id), 'database')
    const today = join(dir, `mindflow-${dayKey()}.db`)
    if (existsSync(today)) continue
    await mkdir(dir, { recursive: true })
    const copies = (await readdir(dir)).filter((name) => /^mindflow-\d{4}-\d{2}-\d{2}\.db$/.test(name)).sort()
    const latest = copies.at(-1)
    // Saves not yet folded into the file wait in its log, so the newer of the
    // two says when it last changed; a log written before the last copy (or
    // an empty one, left by the read-only copy) holds nothing new.
    const wal = `${file}-wal`
    const lastSave = Math.max(statSync(file).mtimeMs, existsSync(wal) && statSync(wal).size > 0 ? statSync(wal).mtimeMs : 0)
    const changedSince = !latest || lastSave > statSync(join(dir, latest)).mtimeMs
    if (!changedSince) continue
    let other: DatabaseSync | null = null
    try {
      other = new DatabaseSync(file, { readOnly: true })
      other.prepare('vacuum into ?').run(today)
    } catch (error) {
      console.error(`Backup of ${book.name} failed:`, error)
    } finally {
      other?.close()
    }
  }
}

export function registerBooks(backupBase: () => string, onChange: () => void): void {
  const handle = (channel: string, run: (...args: never[]) => unknown): void =>
    void ipcMain.handle(`vigil:books:${channel}`, (_event, ...args) => run(...(args as never[])))
  const tell = (): void => {
    for (const win of BrowserWindow.getAllWindows()) if (!win.isDestroyed()) win.webContents.send('books:changed')
    onChange()
  }

  // A book opened for the first time has nothing in it: Getting started, not the whole welcome.
  if (BOOK) {
    const db = database()
    const welcomed = db.prepare("select 1 from settings where key = 'welcomed'").get()
    const empty = !db.prepare('select 1 from captures limit 1').get() && !db.prepare('select 1 from nuggets limit 1').get()
    if (!welcomed && empty) db.prepare("insert or replace into settings (key, value) values ('welcomed', ?)").run(JSON.stringify(new Date().toISOString()))
  }
  void takeArrivals().catch((error) => console.error('Copies from another book:', error))

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

  handle('reveal', (id: unknown) => {
    const folder = folderOf(String(id))
    if (!folder) return false
    void shell.openPath(folder)
    return true
  })

  // Never My book, never the one open. A whole copy of its folder is kept first, with the backups.
  handle('delete', async (id: unknown) => {
    if (SANDBOX || id === 'default' || id === here() || !isBookId(id)) return null
    const folder = folderOf(id)
    if (!folder) return null
    const name = nameOf(id)
    const kept = join(backupBase(), 'deleted books', `${name.replace(/[^\p{L}\p{N} _-]+/gu, '').trim() || id} ${dayKey()} ${id}`)
    if (existsSync(folder)) {
      await mkdir(kept, { recursive: true })
      await cp(folder, kept, { recursive: true })
      // Only once the copy is there in full.
      if (!existsSync(join(folder, 'mindflow.db')) || existsSync(join(kept, 'mindflow.db'))) await rm(folder, { recursive: true, force: true })
      else return null
    }
    const shelf = readShelf()
    writeShelf({ ...shelf, books: shelf.books.filter((one) => one.id !== id), last: shelf.last === id ? 'default' : shelf.last })
    tell()
    return kept
  })

  handle('switch', (id: unknown, carry: unknown, then: unknown) => switchTo(String(id), carry, then))
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
    const file = folder && join(folder, 'mindflow.db')
    if (!file || !existsSync(file)) return forget()
    let other: DatabaseSync | null = null
    try {
      other = new DatabaseSync(file, { readOnly: true })
      const row = other.prepare(`select s.id, s.task_id as taskId, coalesce(s.goal, t.title, 'Timer') as goal, s.started_at as startedAt, s.planned_ms as plannedMs,
        s.paused_ms as pausedMs, s.paused_at as pausedAt, s.rounds, s.kind, s.extended_ms as extendedMs from sessions s left join tasks t on t.id = s.task_id
        where s.ended_at is null and (t.id is not null or s.task_id = '') order by s.started_at desc limit 1`).get()
      return row ? { ...row, book: kept, bookName: nameOf(kept), color: books().find((one) => one.id === kept)?.color ?? null } : forget()
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
