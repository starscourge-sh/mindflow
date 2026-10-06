import { app } from 'electron'
import { existsSync } from 'fs'
import { copyFile, mkdir, readdir, rm, writeFile } from 'fs/promises'
import type { DatabaseSync } from 'node:sqlite'
import { homedir } from 'os'
import { join } from 'path'

import { database, setting } from './captures'
import { dayKey } from './dates'

/**
 * Where copies of everything go: iCloud Drive when there is one, so the copies
 * leave this machine, and beside the app's data when there is not.
 *
 *   database/   a full copy of mindflow.db per day, the last 30 kept
 *   assets/     every picture and file, copied once and never removed
 *   captures/   every capture as Markdown, readable without the app; never
 *               a private or discarded one, and off in Settings
 */
const ICLOUD = join(homedir(), 'Library/Mobile Documents/com~apple~CloudDocs')
export const backupDir = (): string =>
  // A QA run keeps its own data, and its backups with it, off iCloud.
  existsSync(ICLOUD) && !process.env.MINDFLOW_USER_DATA
    ? join(ICLOUD, 'mindflow')
    : join(app.getPath('userData'), 'backups')

const KEEP = 30

/** Today's copy of the database, if there is none yet, and any new assets. */
export async function backUp(db: DatabaseSync): Promise<void> {
  const dir = join(backupDir(), 'database')
  await mkdir(dir, { recursive: true })

  // `vacuum into` writes a clean, complete copy even while the app is using
  // the file, which copying the file itself does not promise. Local date, so a
  // day is the day you lived: 2026-10-02.
  const today = join(dir, `mindflow-${dayKey()}.db`)
  if (!existsSync(today)) db.prepare('vacuum into ?').run(today)

  // Only copies this made, oldest first, past the newest 30.
  const copies = (await readdir(dir)).filter((name) => /^mindflow-\d{4}-\d{2}-\d{2}\.db$/.test(name))
  for (const name of copies.sort().slice(0, -KEEP)) await rm(join(dir, name))

  // Named by their contents, so a name already there is the same file.
  // A test run (its own data folder) keeps no copy of the pictures: each run
  // would otherwise copy the whole picture store, gigabytes, all over again.
  if (process.env.MINDFLOW_USER_DATA) return
  const from = join(app.getPath('userData'), 'assets')
  const to = join(backupDir(), 'assets')
  await mkdir(to, { recursive: true })
  const have = new Set(await readdir(to))
  for (const name of existsSync(from) ? await readdir(from) : []) {
    if (!have.has(name)) await copyFile(join(from, name), join(to, name))
  }

  // A Markdown copy whose capture has since gone private, been discarded or
  // gone altogether is taken away: copies made before this rule go too.
  const captures = join(backupDir(), 'captures')
  for (const name of existsSync(captures) ? await readdir(captures) : []) {
    const number = /^MF-(\d+)\.md$/.exec(name)?.[1]
    if (number && !mayCopy(Number(number))) await rm(join(captures, name), { force: true })
  }
}

/** Plain-text copies are a setting, on unless you turned them off. */
const copiesOn = (): boolean => setting<unknown>('markdownCopies', true) !== false
/** Whether a capture may have a Markdown copy: never a private or discarded one. */
const mayCopy = (number: number): boolean =>
  copiesOn() && !!database().prepare("select 1 from captures where number = ? and private = 0 and status != 'discarded'").get(number)
const fileOf = (number: number): string => join(backupDir(), 'captures', `MF-${number}.md`)

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
