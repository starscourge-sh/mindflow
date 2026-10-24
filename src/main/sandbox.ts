import { app, BrowserWindow, globalShortcut, ipcMain, session } from 'electron'
import { spawn, type ChildProcess } from 'child_process'
import { randomUUID } from 'crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'fs'
import { copyFile, mkdir, rename, rm, stat, writeFile } from 'fs/promises'
import { join } from 'path'

import { changed, database, shutDatabase } from './captures'
import { retireKinds } from './kinds'
import { dayKey } from './dates'
import { refuseRun } from './real-folder'
import { moveOldIn } from './old-data'

/**
 * The sandbox: someone else's book, full of examples, kept apart from
 * your notes by its folder alone. It is a second data folder,
 * `<your data>/sandbox/`, opened by starting the app again with `--sandbox`.
 * Everything the app writes (the database, pictures, stickies, the windows'
 * own storage, drafts) lives under the data folder, so moving that one folder
 * before the app is ready moves all of it, and nothing in the running app has
 * to be swapped or cleared. Your notes are never opened by the sandbox.
 *
 * Information only ever goes one way at a time, through a file: your look in
 * (`sandbox/carry.json`, written by your own app before it restarts), and
 * what you caught while practising out (`sandbox-carry-out.json`, written by
 * the sandbox as it leaves, read by your own app when it starts).
 */

/** This run is the sandbox. Only ever set by the restart: a normal launch is always your own notes. */
export const SANDBOX = process.argv.includes('--sandbox')

/** Your own data folder: a test run's, or the one the app has always used. */
export const realRoot = (): string => process.env.HALIGTREE_USER_DATA ?? join(app.getPath('appData'), 'haligtree')
/** The sandbox's folder, inside yours, which never reads it. */
export const sandboxRoot = (): string => join(realRoot(), 'sandbox')

/**
 * Books: more than one Haligtree of your own, each a data folder like the
 * sandbox's. Your first one, "My book", is the folder Haligtree has always used
 * and never moves; every other lives in `<your data>/books/<id>/`. Which
 * books there are, their names and the one last open are kept in
 * `<your data>/books.json`, read here before the app is ready.
 */
/** A book's colour, Arc's way with its spaces: one of the theme's hues for its accent and sidebar, or none for the theme's own. */
/** `kept`: the book a focus session was left running in by a switch, for the pill elsewhere to name. */
export type Shelf = { defaultName?: string; defaultColor?: string; last?: string; kept?: string; keptSlept?: { book: string; at: number }[]; books: { id: string; name: string; createdAt: string; color?: string }[] }
const SHELF = 'books.json'
export const isBookId = (id: unknown): id is string => typeof id === 'string' && /^b-[a-z0-9]{6,24}$/.test(id)
export const bookRoot = (id: string): string => join(realRoot(), 'books', id)
export function readShelf(): Shelf {
  try {
    const shelf = JSON.parse(readFileSync(join(realRoot(), SHELF), 'utf8')) as Shelf
    return { ...shelf, books: Array.isArray(shelf.books) ? shelf.books.filter((one) => isBookId(one?.id) && typeof one.name === 'string') : [] }
  } catch {
    return { books: [] }
  }
}
/** Written whole to a new file, then moved over the old, so a crash never leaves half a list. */
export function writeShelf(shelf: Shelf): void {
  mkdirSync(realRoot(), { recursive: true })
  const temp = join(realRoot(), `${SHELF}.${process.pid}.tmp`)
  writeFileSync(temp, JSON.stringify(shelf, null, 2))
  renameSync(temp, join(realRoot(), SHELF))
}
/** The book this run opens: the one asked for by the restart, or the one last open. Null is My book. */
function pickBook(): string | null {
  if (SANDBOX) return null
  const asked = process.argv.find((arg) => arg.startsWith('--book='))?.slice('--book='.length)
  const want = asked ?? readShelf().last
  return isBookId(want) && readShelf().books.some((one) => one.id === want) ? want : null
}
// The first launch after the rename brings in the notes from the old folder
// (old-data.ts), before anything reads this one: the book last open is in it.
moveOldIn(app.getPath('appData'), realRoot(), process.env, SANDBOX)
/** This run's book, or null for My book (and for the sandbox). */
export const BOOK = pickBook()
/** Where this run keeps everything. */
export const dataRoot = (): string => (SANDBOX ? sandboxRoot() : BOOK ? bookRoot(BOOK) : realRoot())
/** A test run or the sandbox: no iCloud, no login item, no copies anywhere else. */
export const apart = (): boolean => SANDBOX || !!process.env.HALIGTREE_USER_DATA

const CARRY = 'carry.json'
const OUT = 'sandbox-carry-out.json'

/**
 * Point the app at its data folder, before it is ready. A reset clears the
 * sandbox's folder here, while nothing has it open, keeping only the look
 * that was carried in. Gives back whether this run holds the one-copy lock
 * (always, for a test run), taken on your own folder so a normal launch while
 * the sandbox runs comes to the sandbox rather than starting a second Haligtree.
 */
export function useDataFolder(): boolean {
  // A test run never opens your real data folder (real-folder.ts says why).
  const refused = refuseRun(process.env, app.getPath('appData'))
  if (refused) {
    console.error(`Refused to start: ${refused}`)
    process.exit(1)
  }
  if (SANDBOX && process.argv.includes('--sandbox-reset')) {
    let carried: string | null = null
    try {
      carried = readFileSync(join(sandboxRoot(), CARRY), 'utf8')
    } catch {
      // Nothing was carried in.
    }
    // The run before is still up (its window shows until this one's does) and
    // still writes into the folder, so deleting it in place can fail half
    // done ("Directory not empty"). Moved aside in one step, it is gone from
    // this run's way at once; the moved copy is deleted after, and any left
    // by an earlier reset with it.
    const gone = `${sandboxRoot()}-gone-${Date.now()}`
    try {
      renameSync(sandboxRoot(), gone)
    } catch {
      // No sandbox yet, or it could not move: deleted where it is.
      rmSync(sandboxRoot(), { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
    }
    for (const old of readdirSync(realRoot()).filter((name) => name.startsWith('sandbox-gone-'))) {
      try {
        rmSync(join(realRoot(), old), { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
      } catch {
        // Still in use by the run before: the next reset takes it.
      }
    }
    if (carried) {
      mkdirSync(sandboxRoot(), { recursive: true })
      writeFileSync(join(sandboxRoot(), CARRY), carried)
    }
  }
  app.setPath('userData', realRoot())
  const locked = !!process.env.HALIGTREE_USER_DATA || app.requestSingleInstanceLock()
  app.setPath('userData', dataRoot())
  return locked
}

let relaunched = false

/**
 * Start again, into the sandbox or back to your notes, without a gap: this run
 * lets go of what only one Haligtree may hold (the menu bar icon, the keys, the
 * one-copy lock) but keeps its windows up, showing the moment,
 * until the new run says its main window is on screen. Only then does this
 * one go, so the main window is never simply gone for a while.
 */
export function relaunch(into: 'sandbox' | 'real' | { book: string }, reset = false): void {
  // Once a run: asked twice in the moment before it goes (two clicks, two windows), it would start two runs, each with the book's stickies up.
  if (relaunched) return
  relaunched = true
  const to: Target = typeof into === 'object' ? `book:${into.book}` : into === 'real' ? 'real' : reset ? 'reset' : 'sandbox'
  release()
  // A run the dev process started: that process starts the next, and ends this one once it is up.
  if (HANDED) return void process.send?.({ next: to })
  if (DEV) return start(to)
  const marker = arrival()
  spawn(process.execPath, argsFor(to), { detached: true, stdio: 'ignore', env: { ...process.env, HALIGTREE_ARRIVAL: marker } }).unref()
  // app.exit skips will-quit, so the book left is shut here: no -wal left beside it.
  whenArrived(marker, () => (shutDatabase(), app.exit(0)))
}

/**
 * Start again at once, without closing anything first (a restore, whose
 * database is already shut). Packaged, the app simply starts itself again.
 */
export function restartNow(): void {
  if (!DEV) {
    app.relaunch()
    shutDatabase()
    app.exit(0)
  } else if (HANDED) app.exit(CODES.real)
  else {
    for (const win of BrowserWindow.getAllWindows()) if (!win.isDestroyed()) win.destroy()
    release()
    start('real')
  }
}

/*
 * Under `electron-vite dev` the dev server ends the moment the first app
 * process ends, and a new one would find no pages to load. So in dev the first
 * process stays alive and starts each run itself (see `start`); a run started
 * that way asks it for the next one instead of starting it.
 */
type Target = 'real' | 'sandbox' | 'reset' | `book:${string}`
const DEV = !app.isPackaged && !!process.env.ELECTRON_RENDERER_URL
const HANDED = process.env.HALIGTREE_DEV_RELAUNCHED === '1'
const CODES: Record<'real' | 'sandbox' | 'reset', number> = { real: 75, sandbox: 76, reset: 77 }
const letGo: (() => void)[] = []
/** Something only the app itself holds (the menu bar icon), let go of before a dev restart. */
export const onHandOff = (run: () => void): void => void letGo.push(run)

function argsFor(to: Target): string[] {
  const base = process.argv.slice(1).filter((arg) => !arg.startsWith('--sandbox') && !arg.startsWith('--book=') && arg !== '--show-home')
  // A book by name; Back to my notes, with none, opens the book last open.
  if (to.startsWith('book:')) return [...base, '--show-home', `--book=${to.slice(5)}`]
  return [...base, '--show-home', ...(to === 'real' ? [] : ['--sandbox', ...(to === 'reset' ? ['--sandbox-reset'] : [])])]
}

/**
 * The database is shut and this run is only waiting to end: its own timers
 * (the menu bar, reminders, beacons) may still fire once or twice and find
 * no database. Those are let go quietly, never shown as an error box.
 */
export function windingDown(): void {
  process.on('uncaughtException', (error) => {
    if (/database is not open/.test(String(error?.message))) return
    console.error(error)
  })
}

/** Let go of everything only one Haligtree may hold, keeping the windows. */
let released = false
function release(): void {
  if (released) return
  released = true
  for (const run of letGo) run()
  // What the windows keep in their own storage (the box's draft) is written to disk now, not at the end.
  session.defaultSession?.flushStorageData()
  globalShortcut.unregisterAll()
  windingDown()
  // Its database stays open until it ends: the windows still up may ask it
  // for a list, and the new run works in a folder of its own (a reset clears
  // the sandbox's files, which this run's open copy does not mind).
  app.releaseSingleInstanceLock()
}

/** A fresh file for a new run to write once its main window shows. */
const arrival = (): string => join(app.getPath('temp'), `haligtree-arrived-${randomUUID()}`)
/** Called by a run started this way, once its main window is on screen. */
export function arrived(): void {
  const file = process.env.HALIGTREE_ARRIVAL
  if (!file) return
  delete process.env.HALIGTREE_ARRIVAL
  try {
    writeFileSync(file, '')
  } catch {
    // The run before gives up waiting on its own.
  }
}
/** Once the new run is up (or after ten seconds, whatever happened), then. */
function whenArrived(file: string, then: () => void): void {
  const start = Date.now()
  const look = setInterval(() => {
    if (!existsSync(file) && Date.now() - start < 10_000) return
    clearInterval(look)
    rmSync(file, { force: true })
    then()
  }, 80)
}

/**
 * The dev process's runs, one after another. Each asks for the next by
 * message; the next starts while it is still up, and it is ended once the
 * next has its window on screen. A run that simply ends ends this process.
 */
let current: ChildProcess | null = null
function start(to: Target): void {
  console.log(`[haligtree] dev restart: ${to}`)
  const before = current
  const marker = arrival()
  // The waiting process keeps its debugging ports; the new run must not ask for them again.
  const args = argsFor(to).filter((arg) => !/^--(inspect|remote-debugging-port)/.test(arg))
  const run = spawn(process.execPath, args, { stdio: ['inherit', 'inherit', 'inherit', 'ipc'], env: { ...process.env, HALIGTREE_DEV_RELAUNCHED: '1', HALIGTREE_ARRIVAL: marker } })
  current = run
  // The run waiting behind it has no windows: out of the Dock, so one app shows, not two.
  if (process.platform === 'darwin') app.dock?.hide()
  run.on('message', (message: { next?: Target }) => message?.next && start(message.next))
  run.on('exit', (status) => {
    if (current !== run) return
    // Ended asking for a restart by its code (a restore), or for good.
    const next = (Object.keys(CODES) as (keyof typeof CODES)[]).find((one) => CODES[one] === status)
    if (next) start(next)
    else app.exit(status ?? 0)
  })
  whenArrived(marker, () => {
    if (before) before.kill()
    // The first time, the windows going are this process's own.
    else for (const win of BrowserWindow.getAllWindows()) if (!win.isDestroyed()) win.destroy()
  })
}

const read = <T>(path: string, fallback: T): T => {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as T
  } catch {
    return fallback
  }
}
const setting = (key: string): unknown => {
  const row = database().prepare('select value from settings where key = ?').get(key) as { value: string } | undefined
  try {
    return row ? JSON.parse(row.value) : undefined
  } catch {
    return undefined
  }
}
const isIso = (value: unknown): value is string => typeof value === 'string' && !Number.isNaN(Date.parse(value)) && /^\d{4}-\d\d-\d\d/.test(value)

/** What a sandbox capture carries home: its words as they are, and what kind it was. */
type Carried = { body: unknown; kind: string; capturedAt: string; title: string; attribution: string | null; private: number }

/** One move of a date into the past, from the fixed list the seed may ask for. */
type Age =
  | { glossAt: string; id: string }
  | { done: string; at: string }
  | { reviewedAt: string; itemId: string; nth: number }
  | { dueAt: string; nuggetId: string }
  | { createdAt: string; nuggetId: string }
  | { exitedAt: string; captureId: string }
  | { openedAt: string }
  | { usedAt: string; captureId: string }
  | { closedAt: string; nuggetId: string }
  | { sessionAt: string; endedAt: string; taskId: string; pausedMs?: number; plannedMs?: number | null; abandoned?: boolean; recap?: string }
  | { breakAt: string; ms: number }

/** This run began setting the examples out; and whether it has asked to start over because a seed was cut short. */
let seedClaimed = false
let resetting = false

export function registerSandbox(): void {
  const handle = (channel: string, run: (...args: never[]) => unknown): void =>
    void ipcMain.handle(`haligtree:sandbox:${channel}`, (_event, ...args) => run(...(args as never[])))

  handle('state', () => ({
    on: SANDBOX,
    seeded: SANDBOX && !!setting('sandboxSeededOn'),
    seededOn: SANDBOX ? ((setting('sandboxSeededOn') as string | undefined) ?? null) : null
  }))

  // In the sandbox: the look carried in from your own app, to wear on its first start.
  handle('carry', () => (SANDBOX ? read<Record<string, unknown> | null>(join(sandboxRoot(), CARRY), null) : null))

  // From your own app: your look written down for the sandbox, then the restart.
  // The sandbox's folder is only written here, never read by your app.
  handle('enter', async (carry: unknown) => {
    if (SANDBOX) return false
    await mkdir(sandboxRoot(), { recursive: true })
    if (carry && typeof carry === 'object') await writeFile(join(sandboxRoot(), CARRY), JSON.stringify(carry))
    setTimeout(() => relaunch('sandbox'), 60)
    return true
  })

  // From the sandbox: anything caught for real while practising is written
  // down for your app to offer, then back to your notes.
  handle('leave', async () => {
    if (!SANDBOX) return false
    const since = setting('sandboxSeededAt')
    const rows = isIso(since)
      ? (database().prepare("select body, kind, captured_at as capturedAt, title, attribution, private from captures where captured_at > ? and status != 'discarded' and coalesce(source, '') = '' order by captured_at").all(since) as Carried[])
      : []
    const mine = rows.map((row) => ({ ...row, body: JSON.parse(String(row.body ?? 'null')) }))
    if (mine.length) {
      // Added to any not yet brought home from an earlier visit.
      const earlier = read<Carried[]>(join(realRoot(), OUT), [])
      const known = new Set(earlier.map((one) => `${one.capturedAt}|${JSON.stringify(one.body)}`))
      const all = [...earlier, ...mine.filter((one) => !known.has(`${one.capturedAt}|${JSON.stringify(one.body)}`))]
      await writeFile(join(realRoot(), OUT), JSON.stringify(all))
    }
    setTimeout(() => relaunch('real'), 60)
    return mine.length
  })

  handle('reset', () => {
    if (!SANDBOX) return false
    setTimeout(() => relaunch('sandbox', true), 60)
    return true
  })

  // The seed is finished: the sandbox is set out, and anything caught from now on is yours.
  // Asked once, just before the examples go in: whether to set them out now.
  // A seed already begun and never finished (the window reloaded, as a dev
  // build's hot reload does, or Haligtree quit midway) left half a book, and
  // seeding again over it made two of everything (two of Dune's goal cards on
  // the desktop): the sandbox is cleared and set out again instead.
  handle('seed:claim', () => {
    if (!SANDBOX || setting('sandboxSeededOn')) return 'seeded'
    if (seedClaimed || setting('sandboxSeedBegun')) {
      if (!resetting) (resetting = true, setTimeout(() => relaunch('sandbox', true), 60))
      return 'reset'
    }
    seedClaimed = true
    database().prepare('insert or replace into settings (key, value) values (?, ?)').run('sandboxSeedBegun', JSON.stringify(new Date().toISOString()))
    return 'go'
  })

  handle('seeded', () => {
    if (!SANDBOX) return false
    const put = database().prepare('insert or replace into settings (key, value) values (?, ?)')
    put.run('sandboxSeededOn', JSON.stringify(dayKey()))
    put.run('sandboxSeededAt', JSON.stringify(new Date().toISOString()))
    // Setting the sandbox out wrote no words of yours: Stats' writing starts from here.
    // The book's owner wrote before you came, though: a few weeks of their
    // writing days, all before today, so Stats' Writing reads lived in and
    // today's count is only what you write here. Only in the sandbox's own file.
    try {
      const db = database()
      db.exec('delete from word_days')
      const notes = (db.prepare("select id from captures where status != 'discarded' and length(coalesce(body, '')) > 200 order by captured_at desc limit 6").all() as { id: string }[]).map((one) => one.id)
      if (notes.length) {
        const put = db.prepare("insert into word_days (day, id, kind, words) values (date('now', 'localtime', ?), ?, 'capture', ?) on conflict (day, id) do update set words = words + excluded.words")
        for (let ago = 1; ago <= 28; ago++) {
          // Most days, not every day: a rest now and then, and a run of a few without.
          if (ago % 5 === 3 || (ago >= 16 && ago <= 18)) continue
          const words = 90 + ((ago * 137) % 520)
          const first = notes[ago % notes.length]
          put.run(`-${ago} days`, first, Math.round(words * 0.7))
          put.run(`-${ago} days`, notes[(ago + 2) % notes.length], words - Math.round(words * 0.7))
        }
      }
    } catch {
      // Not counted yet.
    }
    changed()
    return true
  })

  // The one write the app has nowhere else: a few dates moved into the past,
  // so the examples look lived in. Only in the sandbox, only these moves.
  handle('age', (moves: unknown) => {
    if (!SANDBOX || !Array.isArray(moves)) return 0
    const db = database()
    let done = 0
    for (const move of moves as Age[]) {
      if ('glossAt' in move && isIso(move.glossAt)) done += Number(db.prepare('update glosses set created_at = ? where id = ?').run(move.glossAt, String(move.id)).changes)
      else if ('done' in move && isIso(move.at)) done += Number(db.prepare('insert into task_done (task_id, done_at) select id, ? from tasks where id = ?').run(move.at, String(move.done)).changes)
      else if ('reviewedAt' in move && isIso(move.reviewedAt)) {
        const row = db.prepare('select rowid from review_log where item_id = ? order by reviewed_at, rowid limit 1 offset ?').get(String(move.itemId), Math.max(0, Number(move.nth) || 0)) as { rowid: number } | undefined
        if (row) done += Number(db.prepare('update review_log set reviewed_at = ? where rowid = ?').run(move.reviewedAt, row.rowid).changes)
      } else if ('dueAt' in move && isIso(move.dueAt)) done += Number(db.prepare('update nuggets set due_at = ? where id = ?').run(move.dueAt, String(move.nuggetId)).changes)
      else if ('createdAt' in move && isIso(move.createdAt)) done += Number(db.prepare('update nuggets set created_at = ?, updated_at = ? where id = ?').run(move.createdAt, move.createdAt, String(move.nuggetId)).changes)
      // Left the Inbox then, and so first used by then too, not on the day the seed ran.
      else if ('exitedAt' in move && isIso(move.exitedAt)) done += Number(db.prepare('update captures set exited_at = ?, first_used_at = min(coalesce(first_used_at, ?), ?) where id = ?').run(move.exitedAt, move.exitedAt, move.exitedAt, String(move.captureId)).changes)
      // First opened or acted on then: what Stats' time to first use reads.
      else if ('usedAt' in move && isIso(move.usedAt)) done += Number(db.prepare('update captures set first_used_at = ? where id = ?').run(move.usedAt, String(move.captureId)).changes)
      // A day the app was opened, for Stats' days-opened squares: a row added, never one changed.
      else if ('openedAt' in move && isIso(move.openedAt)) done += Number(db.prepare("insert into app_opens (opened_at, surface) values (?, 'home')").run(move.openedAt).changes)
      // A question settled some while ago: only one already closed.
      else if ('closedAt' in move && isIso(move.closedAt)) done += Number(db.prepare('update nuggets set closed_at = ? where id = ? and closed_at is not null').run(move.closedAt, String(move.nuggetId)).changes)
      // A focus session worked some while ago, for a task's numbers and Stats': a row added, on a task that is there.
      else if ('sessionAt' in move && isIso(move.sessionAt) && isIso(move.endedAt))
        done += Number(db.prepare('insert into sessions (id, task_id, started_at, ended_at, recap, paused_ms, planned_ms, abandoned_at) select ?, id, ?, ?, ?, ?, ?, ? from tasks where id = ?')
          .run(randomUUID(), move.sessionAt, move.endedAt, move.recap || null, Math.max(0, Number(move.pausedMs) || 0), Number(move.plannedMs) || null, move.abandoned ? move.endedAt : null, String(move.taskId)).changes)
      // A break taken between them.
      else if ('breakAt' in move && isIso(move.breakAt)) done += Number(db.prepare('insert into focus_breaks (at, ms) values (?, ?)').run(move.breakAt, Math.max(0, Number(move.ms) || 0)).changes)
    }
    changed()
    return done
  })

  // The bundled landscapes, written into the sandbox's own folder for
  // Scenery to read like any folder of yours. Only plain names, only webp.
  // Haligtree's own landscapes, written where this run keeps its things: the
  // sandbox's, or yours on a first start with no folder of your own chosen.
  handle('scenery', async (files: unknown) => {
    if (!Array.isArray(files)) return ''
    const folder = SANDBOX ? join(sandboxRoot(), 'Sandbox scenery') : join(dataRoot(), 'Scenery')
    await mkdir(folder, { recursive: true })
    for (const file of files as { name: unknown; bytes: unknown }[]) {
      if (typeof file?.name !== 'string' || !/^[a-z-]+\.webp$/.test(file.name) || !(file.bytes instanceof Uint8Array)) continue
      // Written once: on later starts only a painting not there yet is added.
      if ((await stat(join(folder, file.name)).catch(() => null))?.size === file.bytes.length) continue
      await writeFile(join(folder, file.name), file.bytes)
    }
    return folder
  })

  // In your own app: what was caught in the sandbox, waiting to be brought home.
  handle('carried', () => {
    if (SANDBOX) return []
    return read<Carried[]>(join(realRoot(), OUT), []).map((one) => ({ title: one.title, kind: one.kind, capturedAt: one.capturedAt }))
  })
  // Brought in as captures of your own, kept as they were written and when;
  // their pictures copied over from the sandbox's store. Or left: either way
  // the file goes.
  handle('carried:take', async (bring: unknown) => {
    if (SANDBOX) return 0
    const file = join(realRoot(), OUT)
    const all = read<Carried[]>(file, [])
    let made = 0
    if (bring === true) {
      const db = database()
      for (const one of all) {
        const body = JSON.stringify(one.body ?? null)
        for (const [, name] of body.matchAll(/haligtree:\/\/assets\/([a-f0-9]{64}\.[a-z0-9]+)/g)) {
          const from = join(sandboxRoot(), 'assets', name)
          // Into whichever book you came back to.
          const to = join(dataRoot(), 'assets', name)
          if (existsSync(from) && !existsSync(to)) await mkdir(join(dataRoot(), 'assets'), { recursive: true }).then(() => copyFile(from, `${to}.part`)).then(() => rename(`${to}.part`, to)).catch(() => undefined)
        }
        db.prepare(`insert into captures (id, number, title, kind, body, captured_at, source, private, attribution)
          values (?, (select coalesce(max(number), 0) + 1 from captures), ?, ?, ?, ?, '', ?, ?)`)
          .run(randomUUID(), one.title ?? '', String(one.kind || 'note'), body, isIso(one.capturedAt) ? one.capturedAt : new Date().toISOString(), one.private ? 1 : 0, one.attribution ?? null)
        made++
      }
      // Carried by an older Haligtree, a bit, an excerpt or a book: what it is now.
      if (made) (retireKinds(db), changed())
    }
    await rm(file, { force: true })
    return made
  })
}

