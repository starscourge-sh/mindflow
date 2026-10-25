import { BrowserWindow, app } from 'electron'
import { existsSync } from 'fs'
import { copyFile, mkdir, readdir, rename, rm, stat, writeFile } from 'fs/promises'
import type { DatabaseSync } from 'node:sqlite'
import { homedir } from 'os'
import { join } from 'path'

import { database, setting } from './captures'
import { dayKey } from './dates'
import { backUpOthers } from './books'
import { BOOK, SANDBOX, apart, readShelf, realRoot, writeShelf, type Shelf } from './sandbox'
import { NOTE_KEY } from './name'

/** The list of books, with the backup folder chosen in Settings beside them. */
type Kept = Shelf & { backupFolder?: string }

/**
 * Where copies of everything go: iCloud Drive when there is one, so the copies
 * leave this machine, and beside the app's data when there is not.
 *
 *   database/   a full copy of haligtree.db per day, the last 30 kept
 *   assets/     every picture and file, copied once and never removed
 *   captures/   every capture as Markdown, readable without the app; never
 *               a private or discarded one, and off in Settings
 */
const ICLOUD = join(homedir(), 'Library/Mobile Documents/com~apple~CloudDocs')
/** Where My book's copies go; every other book's go in `books/<id>/` under it. */
export const backupBase = (): string =>
  // A folder you chose in Settings wins; otherwise a QA run, or the sandbox,
  // keeps its own data, and its backups with it, off iCloud.
  chosenFolder() ??
  (existsSync(ICLOUD) && !apart()
    ? join(ICLOUD, 'haligtree')
    : join(realRoot(), 'backups'))
/** The backup folder chosen in Settings, kept with the list of books so every book uses it; null for the usual place. */
export const chosenFolder = (): string | null => {
  const chosen = (readShelf() as Kept).backupFolder
  return typeof chosen === 'string' && chosen ? chosen : null
}
/** Use another folder for the backups from now on, or null to go back to the usual place. */
export function chooseFolder(folder: string | null): void {
  const shelf: Kept = readShelf()
  writeShelf({ ...shelf, backupFolder: folder ?? undefined } as Kept)
}
/** One book's copies: null is My book. */
export const backupDirFor = (book: string | null): string => (book ? join(backupBase(), 'books', book) : backupBase())
/** This run's: the sandbox keeps its own inside its folder. */
export const backupDir = (): string => (SANDBOX ? join(app.getPath('userData'), 'backups') : backupDirFor(BOOK))

const KEEP = 30

/**
 * How the backups are going, for Settings to say ("Last backup 2 hours
 * ago") and for a warning once two runs in a row have failed: one failure
 * can be a blip (iCloud busy, a drive waking up), two is a folder that
 * cannot be written to.
 */
let last: { at: number | null; failures: number; reason: string } = { at: null, failures: 0, reason: '' }

/** Why a backup failed, in plain words. */
const why = (error: unknown): string => {
  const code = (error as NodeJS.ErrnoException | undefined)?.code ?? ''
  if (code === 'ENOSPC') return 'the disk the backup folder is on is full'
  if (code === 'ENOENT') return 'the backup folder is gone (a drive unplugged, or the folder moved)'
  if (/^(EACCES|EPERM|EROFS|ENOTDIR|EEXIST|EISDIR)$/.test(code)) return "the backup folder can't be written to"
  return "the backup couldn't be written"
}

/** Tells the main window, the only one that warns. */
const tellMain = (reason: string | null): void => {
  for (const win of BrowserWindow.getAllWindows()) if (!win.isDestroyed() && win.webContents.getURL().includes('view=home')) win.webContents.send('backup:trouble', reason)
}

/** A backup run, remembered: the second failure in a row warns, and the first success after that says so. */
export async function backUpWatched(db: DatabaseSync): Promise<void> {
  try {
    await backUp(db)
    if (last.failures >= 2) tellMain(null)
    last = { at: Date.now(), failures: 0, reason: '' }
  } catch (error) {
    last = { ...last, failures: last.failures + 1, reason: why(error) }
    console.error('Backup failed:', error)
    if (last.failures === 2) tellMain(last.reason)
  }
}

/** When the last copy was made (this run's last success, or the newest copy in the folder), and whether it is failing now. */
export async function backupStatus(): Promise<{ at: number | null; failing: string | null; chosen: boolean }> {
  let at = last.at
  if (!at) {
    const dir = join(backupDir(), 'database')
    const copies = existsSync(dir) ? (await readdir(dir).catch(() => [])).filter((name) => /^haligtree-\d{4}-\d{2}-\d{2}\.db$/.test(name)).sort() : []
    if (copies.length) at = (await stat(join(dir, copies.at(-1)!)).catch(() => null))?.mtimeMs ?? null
  }
  return { at, failing: last.failures ? last.reason : null, chosen: !!chosenFolder() && !SANDBOX }
}

/** Today's copy of the database, if there is none yet, and any new assets. */
export async function backUp(db: DatabaseSync): Promise<void> {
  const dir = join(backupDir(), 'database')
  await mkdir(dir, { recursive: true })

  // `vacuum into` writes a clean, complete copy even while the app is using
  // the file, which copying the file itself does not promise. Local date, so a
  // day is the day you lived: 2026-10-02.
  const today = join(dir, `haligtree-${dayKey()}.db`)
  if (!existsSync(today)) db.prepare('vacuum into ?').run(today)

  // Only copies this made, oldest first, past the newest 30.
  const copies = (await readdir(dir)).filter((name) => /^haligtree-\d{4}-\d{2}-\d{2}\.db$/.test(name))
  for (const name of copies.sort().slice(0, -KEEP)) await rm(join(dir, name))

  // Every other book has its copy for today too, though it is not open.
  if (!SANDBOX) await backUpOthers(backupDirFor).catch((error) => console.error('Backup of the other books failed:', error))

  // Named by their contents, so a name already there is the same file.
  // A test run (its own data folder) keeps no copy of the pictures: each run
  // would otherwise copy the whole picture store, gigabytes, all over again.
  if (apart()) return
  const from = join(app.getPath('userData'), 'assets')
  const to = join(backupDir(), 'assets')
  await mkdir(to, { recursive: true })
  const have = new Set(await readdir(to))
  for (const name of existsSync(from) ? await readdir(from) : []) {
    // Copied beside and renamed in: a copy cut short (Haligtree quit mid-way) would
    // otherwise count as backed up and never be copied again.
    if (!have.has(name)) await copyFile(join(from, name), join(to, `${name}.part`)).then(() => rename(join(to, `${name}.part`), join(to, name)))
  }

  // A Markdown copy whose capture has since gone private, been discarded or
  // gone altogether is taken away: copies made before this rule go too.
  const captures = join(backupDir(), 'captures')
  for (const name of existsSync(captures) ? await readdir(captures) : []) {
    // MF- and V- were the handle before: an old copy goes once its new one is there.
    const [, old, number] = /^(MF|V|H)-(\d+)\.md$/.exec(name) ?? []
    if (number && (!mayCopy(Number(number)) || (old !== NOTE_KEY && existsSync(fileOf(Number(number)))))) await rm(join(captures, name), { force: true })
  }
}

/** Plain-text copies are a setting, on unless you turned them off. */
const copiesOn = (): boolean => setting<unknown>('markdownCopies', true) !== false
/** Whether a capture may have a Markdown copy: never a private or discarded one. */
const mayCopy = (number: number): boolean =>
  copiesOn() && !!database().prepare("select 1 from captures where number = ? and private = 0 and status != 'discarded'").get(number)
const fileOf = (number: number): string => join(backupDir(), 'captures', `${NOTE_KEY}-${number}.md`)

/** A capture as Markdown, under its handle, replacing the last version of it. */
export async function writeMarkdown(number: number, markdown: string): Promise<void> {
  // Asked before anything waits, so a capture made private in the same breath is never written.
  if (!mayCopy(number)) return void (await rm(fileOf(number), { force: true }).catch(() => undefined))
  // A copy that cannot be written (iCloud full, a folder made read-only) is
  // only a copy: the capture itself is already safe in the database.
  await mkdir(join(backupDir(), 'captures'), { recursive: true })
    .then(() => writeFile(fileOf(number), markdown))
    .catch((error) => console.error('Markdown copy failed:', error))
}

/** A capture just made private or discarded loses its copy now, not at the next hourly pass. */
export function checkMarkdown(id: string): void {
  const row = database().prepare('select number from captures where id = ?').get(id) as { number: number } | undefined
  if (row && !mayCopy(row.number)) void rm(fileOf(row.number), { force: true }).catch(() => undefined)
}
