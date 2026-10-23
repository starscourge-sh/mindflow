import { DatabaseSync } from 'node:sqlite'
import { closeSync, copyFileSync, cpSync, existsSync, mkdirSync, openSync, readFileSync, readdirSync, readSync, readlinkSync, realpathSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, dirname, join, relative, sep } from 'node:path'
import { isRealFolder, refuseRun } from './real-folder.ts'

/**
 * Notes from before the rename, brought in once. Every build until
 * 2026-10-23 (c992669b) kept its data in `<Application Support>/mindflow`,
 * whatever the app was called (mindflow, then Vigil, then Haligtree), with
 * `mindflow.db` in it. Haligtree now uses `<Application Support>/haligtree`
 * and `haligtree.db`, so a person updating would find an empty app.
 *
 * On a launch where the haligtree folder is missing, or holds no notes of its
 * own, the old folder is copied (never moved, never written to) into a
 * folder beside the new one, its databases renamed, and only then renamed
 * into place, so a crash midway never leaves half a folder that counts as
 * done. The old folder stays as it was, as a backup.
 */

/** Every name an older build's data folder had. On a Mac the disk ignores case, so some are the same folder. */
export const OLD_NAMES = ['mindflow', 'MindFlow', 'Vigil', 'vigil']
/** Left in the new folder by a move: where from, and whether the app has said so yet. Its being there means never move again. */
export const MOVED = 'moved-in.json'
export type Moved = { from: string; at: string; told?: boolean }

/** Folders that rebuild themselves (Chromium's caches, the app's picture caches) and the locks a running app holds. */
const SKIP = new Set(['Cache', 'Code Cache', 'GPUCache', 'DawnGraphiteCache', 'DawnWebGPUCache', 'blob_storage', 'Shared Dictionary',
  'VideoDecodeStats', 'shared_proto_db', 'DIPS', 'DIPS-wal', 'DevToolsActivePort', 'scenery-cache', 'giphy-cache',
  'SingletonLock', 'SingletonSocket', 'SingletonCookie'])
const skipped = (name: string): boolean =>
  SKIP.has(name) || name.includes('declarative_performance_observer.db') || /\.db(-wal|-shm|-journal)?$/.test(name)

/** Every file below a folder, as paths relative to it, leaving out what is skipped. */
function walk(root: string, at = ''): string[] {
  const out: string[] = []
  for (const entry of readdirSync(join(root, at), { withFileTypes: true })) {
    if (SKIP.has(entry.name) || entry.name.includes('declarative_performance_observer.db')) continue
    const rel = at ? join(at, entry.name) : entry.name
    if (entry.isDirectory()) out.push(...walk(root, rel))
    else if (entry.isFile()) out.push(rel)
  }
  return out
}

const isSqlite = (file: string): boolean => {
  const fd = openSync(file, 'r')
  try {
    const head = Buffer.alloc(16)
    return readSync(fd, head, 0, 16, 0) === 16 && head.toString('latin1', 0, 15) === 'SQLite format 3'
  } finally {
    closeSync(fd)
  }
}

/** When a database was last saved to: its file or its log, whichever is newer. */
const savedAt = (file: string): number =>
  Math.max(...[file, `${file}-wal`].map((one) => (existsSync(one) ? statSync(one).mtimeMs : 0)))

/** The first capture the welcome made ("What's on your mind?"), kept in its settings (onboarding.ts, Setup.made.firstId). */
function welcomeCapture(db: DatabaseSync, schema = 'main'): string | null {
  try {
    const row = db.prepare(`select value from ${schema}.settings where key = 'setup'`).get() as { value: string } | undefined
    const id = row && (JSON.parse(row.value) as { made?: { firstId?: unknown } }).made?.firstId
    return typeof id === 'string' ? id : null
  } catch {
    return null
  }
}

/**
 * Anything of yours in a database: a capture, something kept, a task
 * (onboarding.ts, hasData), but not the one line the welcome asked for, which
 * is carried over instead. Unreadable counts as yours.
 */
function hasNotes(file: string): boolean {
  let db: DatabaseSync | undefined
  try {
    db = new DatabaseSync(file, { readOnly: true })
    const tables = new Set((db.prepare("select name from sqlite_master where type = 'table'").all() as { name: string }[]).map((row) => row.name))
    const first = tables.has('settings') ? welcomeCapture(db) : null
    if (tables.has('captures') && db.prepare('select 1 from captures where id is not ? limit 1').get(first)) return true
    return ['nuggets', 'tasks'].some((table) => tables.has(table) && !!db!.prepare(`select 1 from "${table}" limit 1`).get())
  } catch {
    return true
  } finally {
    db?.close()
  }
}

/** The welcome's first capture, from the folder being replaced into the copy, so the line typed there is not lost. Gives back whether all went well. */
function carryWelcome(from: string, to: string): boolean {
  if (!existsSync(from) || !existsSync(to)) return true
  const db = new DatabaseSync(to)
  try {
    db.prepare('attach database ? as was').run(from)
    const id = welcomeCapture(db, 'was')
    if (!id) return true
    const cols = (table: string, schema: string): string[] =>
      (db.prepare(`select name from pragma_table_info('${table}', '${schema}')`).all() as { name: string }[]).map((one) => one.name)
    const theirs = new Set(cols('captures', 'was'))
    const both = cols('captures', 'main').filter((one) => theirs.has(one)).map((one) => `"${one.replace(/"/g, '""')}"`).join(', ')
    if (!both) return false
    db.prepare(`insert or ignore into main.captures (${both}) select ${both} from was.captures where id = ?`).run(id)
    return true
  } catch (error) {
    console.error('Old data: the welcome line could not be carried over:', error)
    return false
  } finally {
    db.close()
  }
}

/** Another Haligtree is running on this folder now: its lock names a process that is still there. */
function inUse(root: string): boolean {
  try {
    const pid = Number(readlinkSync(join(root, 'SingletonLock')).split('-').pop())
    if (!pid) return false
    process.kill(pid, 0)
    return true
  } catch (error) {
    return (error as NodeJS.ErrnoException)?.code === 'EPERM'
  }
}

/**
 * The new folder is not set up yet: missing, or with no notes of its own in
 * My book or any other book (a launch that only showed the welcome). Never
 * one moved in before, and never one another Haligtree has open.
 */
export function notSetUp(root: string): boolean {
  if (!existsSync(root)) return true
  if (existsSync(join(root, MOVED)) || inUse(root)) return false
  const books = existsSync(join(root, 'books')) ? readdirSync(join(root, 'books')).map((id) => join(root, 'books', id, 'haligtree.db')) : []
  return ![join(root, 'haligtree.db'), ...books].some((file) => existsSync(file) && hasNotes(file))
}

/** The old folder to bring in: the only one with a database, or the one saved to most recently. */
export function findOld(appData: string): string | null {
  const seen = new Map<string, number>()
  for (const name of OLD_NAMES) {
    const root = join(appData, name)
    if (!existsSync(join(root, 'mindflow.db'))) continue
    // On a Mac "mindflow" and "MindFlow" are one folder: known by its real name.
    const real = realpathSync.native(root)
    const books = existsSync(join(real, 'books')) ? readdirSync(join(real, 'books')).map((id) => join(real, 'books', id, 'mindflow.db')) : []
    seen.set(real, Math.max(...[join(real, 'mindflow.db'), ...books].map(savedAt)))
  }
  const found = [...seen].sort((a, b) => b[1] - a[1])
  if (found.length > 1) console.log(`Old data: ${found.length} old folders (${found.map(([path]) => basename(path)).join(', ')}); bringing in ${basename(found[0][0])}, saved to most recently`)
  return found[0]?.[0] ?? null
}

/** One old database, whole, under its new name. Read from a copy of it (and its log), so the old folder is never written to, not even SQLite's -shm. */
function copyDatabase(from: string, to: string, work: string): void {
  mkdirSync(dirname(to), { recursive: true })
  for (let tries = 0; ; tries++) {
    const before = [from, `${from}-wal`].map((one) => (existsSync(one) ? `${statSync(one).size}:${statSync(one).mtimeMs}` : '-')).join()
    rmSync(work, { recursive: true, force: true })
    mkdirSync(work, { recursive: true })
    copyFileSync(from, join(work, 'x.db'))
    if (existsSync(`${from}-wal`)) copyFileSync(`${from}-wal`, join(work, 'x.db-wal'))
    const after = [from, `${from}-wal`].map((one) => (existsSync(one) ? `${statSync(one).size}:${statSync(one).mtimeMs}` : '-')).join()
    // The old app still open and saving while this read: read it again.
    if (before !== after && tries < 5) continue
    const db = new DatabaseSync(join(work, 'x.db'))
    try {
      rmSync(to, { force: true })
      db.prepare('vacuum into ?').run(to)
    } finally {
      db.close()
      rmSync(work, { recursive: true, force: true })
    }
    return
  }
}

/** Pictures linked by the old protocol name, mindflow://, by the new one in every text column (the old name still shows, this keeps it tidy). */
function rewriteLinks(file: string): number {
  const db = new DatabaseSync(file)
  let changed = 0
  try {
    const rows = db.prepare("select name, sql from sqlite_master where type = 'table' and name not like 'sqlite_%'").all() as { name: string; sql: string | null }[]
    // A virtual table (full-text search) is kept by its own shadow tables: neither is written to directly.
    const virtual = rows.filter((row) => /^create virtual table/i.test(row.sql ?? '')).map((row) => row.name)
    for (const { name } of rows) {
      if (virtual.some((one) => name === one || name.startsWith(`${one}_`))) continue
      for (const { name: col } of db.prepare(`select name from pragma_table_info('${name.replace(/'/g, "''")}')`).all() as { name: string }[]) {
        const c = `"${col.replace(/"/g, '""')}"`
        changed += Number(db.prepare(`update "${name.replace(/"/g, '""')}" set ${c} = replace(${c}, 'mindflow://', 'haligtree://') where typeof(${c}) = 'text' and ${c} like '%mindflow://%'`).run().changes)
      }
    }
  } finally {
    db.close()
  }
  return changed
}

const ICLOUD = (): string => join(homedir(), 'Library/Mobile Documents/com~apple~CloudDocs')

/**
 * Copy `old` into `root` (made new, or replacing one with no notes of its
 * own), and say what was done. Reads `old` only.
 */
export function bringIn(old: string, root: string): { databases: number; files: number; links: number } {
  const temp = `${root}.moving`
  const work = `${root}.moving-db`
  rmSync(temp, { recursive: true, force: true })
  // 1. Everything but the databases, the caches and the locks, as it is.
  const files = walk(old).filter((rel) => !skipped(basename(rel)))
  mkdirSync(temp, { recursive: true })
  for (const rel of files) {
    mkdirSync(dirname(join(temp, rel)), { recursive: true })
    cpSync(join(old, rel), join(temp, rel), { preserveTimestamps: true })
  }
  // 2. Every database whole, under its new name: mindflow.db is haligtree.db, a day's backup mindflow-2026-10-01.db is haligtree-2026-10-01.db.
  let databases = 0
  let links = 0
  for (const rel of walk(old).filter((one) => one.endsWith('.db'))) {
    const from = join(old, rel)
    const to = join(temp, dirname(rel), basename(rel).replace(/^mindflow/, 'haligtree'))
    if (!isSqlite(from)) {
      mkdirSync(dirname(to), { recursive: true })
      copyFileSync(from, to)
      continue
    }
    copyDatabase(from, to, work)
    links += rewriteLinks(to)
    databases++
  }
  // 3. Links in the copy's own text files, and the iCloud backup folder by its new name if it was chosen by its old one.
  for (const rel of files.filter((one) => /\.(json|md)$/.test(one))) {
    const file = join(temp, rel)
    let text = readFileSync(file, 'utf8')
    const was = text
    text = text.replaceAll('mindflow://', 'haligtree://')
    if (rel === 'books.json') {
      try {
        const shelf = JSON.parse(text) as { backupFolder?: string }
        const oldCloud = join(ICLOUD(), 'mindflow')
        if (shelf.backupFolder === oldCloud || shelf.backupFolder?.startsWith(oldCloud + sep)) {
          shelf.backupFolder = join(ICLOUD(), 'haligtree') + shelf.backupFolder.slice(oldCloud.length)
          text = JSON.stringify(shelf, null, 2)
        }
      } catch {
        // Not readable: left as it was.
      }
    }
    if (text !== was) writeFileSync(file, text)
  }
  // The one line typed into the welcome, if the new folder had only that.
  const carried = carryWelcome(join(root, 'haligtree.db'), join(temp, 'haligtree.db'))
  const moved: Moved = { from: old, at: new Date().toISOString() }
  writeFileSync(join(temp, MOVED), JSON.stringify(moved, null, 2))
  // 4. Into place in one step. A folder with no notes of its own (a launch that only showed the welcome) is set aside first, then removed.
  const aside = `${root}.unused-${Date.now()}`
  if (existsSync(root)) renameSync(root, aside)
  renameSync(temp, root)
  // Kept beside it if the welcome's line could not be carried over, so it is not lost.
  if (carried) rmSync(aside, { recursive: true, force: true })
  return { databases, files: files.length, links }
}

/**
 * At launch, before anything opens the data folder: bring in the old one if
 * this is the first launch after the rename. A test run (HALIGTREE_USER_DATA)
 * or the sandbox never looks in Application Support; a test brings its own
 * old folder in HALIGTREE_OLD_DATA, and never a real one.
 */
export function moveOldIn(appData: string, root: string, env: Record<string, string | undefined>, sandbox: boolean): Moved | null {
  if (sandbox || refuseRun(env, appData)) return null
  const testing = !!env.HALIGTREE_USER_DATA || env.HALIGTREE_QA_AWAY !== undefined
  const given = env.HALIGTREE_OLD_DATA
  if (testing && !given) return null
  if (given && (!testing || isRealFolder(given, appData))) return null
  try {
    const old = given ? (existsSync(join(given, 'mindflow.db')) ? given : null) : findOld(appData)
    if (!old || !notSetUp(root)) return null
    const done = bringIn(old, root)
    console.log(`Old data: brought in ${old} (${done.databases} databases, ${done.files} other files, ${done.links} links renamed); the old folder is kept as it was`)
    return JSON.parse(readFileSync(join(root, MOVED), 'utf8')) as Moved
  } catch (error) {
    // Never in the way of starting: the old folder is still there, and the next launch tries again.
    console.error('Old data: could not bring it in:', error)
    rmSync(`${root}.moving`, { recursive: true, force: true })
    return null
  }
}

/** The move, not said yet: said once, then marked told. */
export function untoldMove(root: string): Moved | null {
  try {
    const moved = JSON.parse(readFileSync(join(root, MOVED), 'utf8')) as Moved
    if (moved.told) return null
    writeFileSync(join(root, MOVED), JSON.stringify({ ...moved, told: true }, null, 2))
    return moved
  } catch {
    return null
  }
}

export const shortPath = (path: string): string => {
  const rel = relative(homedir(), path)
  return rel && !rel.startsWith('..') ? `~/${rel}` : path
}
