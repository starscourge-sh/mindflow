import { app } from 'electron'
import { existsSync } from 'fs'
import { copyFile, mkdir, readdir, rm, writeFile } from 'fs/promises'
import type { DatabaseSync } from 'node:sqlite'
import { homedir } from 'os'
import { join } from 'path'

/**
 * Where copies of everything go: iCloud Drive when there is one, so the copies
 * leave this machine, and beside the app's data when there is not.
 *
 *   database/   a full copy of mindflow.db per day, the last 30 kept
 *   assets/     every picture and file, copied once and never removed
 *   captures/   every capture as Markdown, readable without the app
 */
const ICLOUD = join(homedir(), 'Library/Mobile Documents/com~apple~CloudDocs')
export const backupDir = (): string =>
  existsSync(ICLOUD) ? join(ICLOUD, 'mindflow') : join(app.getPath('userData'), 'backups')

const KEEP = 30

/** Today's copy of the database, if there is none yet, and any new assets. */
export async function backUp(db: DatabaseSync): Promise<void> {
  const dir = join(backupDir(), 'database')
  await mkdir(dir, { recursive: true })

  // `vacuum into` writes a clean, complete copy even while the app is using
  // the file, which copying the file itself does not promise. Local date, so a
  // day is the day you lived. `sv` is the locale that writes it as 2026-10-02.
  const today = join(dir, `mindflow-${new Date().toLocaleDateString('sv')}.db`)
  if (!existsSync(today)) db.prepare('vacuum into ?').run(today)

  // Only copies this made, oldest first, past the newest 30.
  const copies = (await readdir(dir)).filter((name) => /^mindflow-\d{4}-\d{2}-\d{2}\.db$/.test(name))
  for (const name of copies.sort().slice(0, -KEEP)) await rm(join(dir, name))

  // Named by their contents, so a name already there is the same file.
  const from = join(app.getPath('userData'), 'assets')
  const to = join(backupDir(), 'assets')
  await mkdir(to, { recursive: true })
  const have = new Set(await readdir(to))
  for (const name of existsSync(from) ? await readdir(from) : []) {
    if (!have.has(name)) await copyFile(join(from, name), join(to, name))
  }
}

/** A capture as Markdown, under its handle, replacing the last version of it. */
export async function writeMarkdown(number: number, markdown: string): Promise<void> {
  const dir = join(backupDir(), 'captures')
  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, `MF-${number}.md`), markdown)
}
