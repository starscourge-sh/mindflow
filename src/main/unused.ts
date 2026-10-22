import { app, ipcMain, shell } from 'electron'
import { readdir, readFile, stat } from 'fs/promises'
import { join } from 'path'
import { database } from './captures'

/**
 * Pictures and files no note points at any more: found first and shown, then
 * moved to the Mac's Bin only when you say so, so each can still be put back.
 * Nothing here deletes outright.
 *
 * A file counts as used when its name appears anywhere in the database, in
 * any table: notes, old versions (undo and history need them), day and period
 * pages, glosses, tasks, settings. Matching the bare 64-letter name rather
 * than one shape of link keeps a file however it is pointed at. Scenery's
 * copies live in their own folder and are never looked at.
 */

const assets = (): string => join(app.getPath('userData'), 'assets')
/** What the store names its files: a hash and an ending. Anything else is left alone. */
const STORED = /^([a-f0-9]{64})\.[a-z0-9]+$/
const HASH = /[a-f0-9]{64}/g
/** A file this new may be a paste still on its way into a note. */
const FRESH = 24 * 60 * 60 * 1000
const IMAGE = /\.(png|jpe?g|gif|webp|avif|bmp|svg)$/

export type Unused = { name: string; size: number; image: boolean; at: number }

/** Each scan's number: a newer one, or a stop, leaves the older one to give up. */
let scan = 0
class Stopped extends Error {}
/** A breath for the rest of the app every so many rows, and the place a stopped scan ends. */
const breathe = async (mine: number): Promise<void> => {
  await new Promise((done) => setImmediate(done))
  if (mine !== scan) throw new Stopped()
}

/** Every stored name anything mentions. Throws if the database cannot be read, which stops the whole scan. */
async function used(extra: string[], mine: number): Promise<Set<string>> {
  const found = new Set<string>()
  const take = (text: string): void => {
    for (const [hash] of text.matchAll(HASH)) found.add(hash)
  }
  const db = database()
  const tables = db.prepare("select name from sqlite_master where type = 'table' and name not like 'sqlite_%'").all() as { name: string }[]
  if (!tables.length) throw new Error('no tables')
  for (const { name } of tables) {
    // Read in pages, not one long run: a big database would hold up every window.
    // By rowid, so a row added or removed meanwhile never shifts another out of the scan.
    const page = db.prepare(`select rowid as __at, * from "${name.replace(/"/g, '""')}" where rowid > ? order by rowid limit 400`)
    for (let after = Number.MIN_SAFE_INTEGER; ; ) {
      const got = page.all(after) as Record<string, unknown>[]
      for (const row of got) for (const value of Object.values(row)) if (typeof value === 'string' && value.length >= 64) take(value)
      if (got.length < 400) break
      after = got[got.length - 1].__at as number
      await breathe(mine)
    }
  }
  // The old notes folder from before the database: unread by the app now, but kept honest.
  const old = join(app.getPath('userData'), 'notes')
  for (const file of await readdir(old).catch(() => [] as string[])) take(await readFile(join(old, file), 'utf8').catch(() => ''))
  // What only a window holds, like the box's unsent draft.
  extra.forEach((text) => typeof text === 'string' && take(text))
  return found
}

/** The files nothing uses, biggest first. */
async function find(extra: string[]): Promise<Unused[] | { error: string } | null> {
  const mine = ++scan
  let keep: Set<string>
  try {
    keep = await used(Array.isArray(extra) ? extra : [], mine)
  } catch (error) {
    if (error instanceof Stopped) return null
    return { error: 'Could not read your notes, so nothing was looked at.' }
  }
  const names = await readdir(assets()).catch(() => [] as string[])
  const found: Unused[] = []
  for (const name of names) {
    const hash = STORED.exec(name)?.[1]
    if (!hash || keep.has(hash)) continue
    const info = await stat(join(assets(), name)).catch(() => null)
    if (!info?.isFile() || Date.now() - info.mtimeMs < FRESH) continue
    found.push({ name, size: info.size, image: IMAGE.test(name), at: info.mtimeMs })
    if (mine !== scan) return null
  }
  return found.sort((a, b) => b.size - a.size)
}

export function registerUnused(): void {
  ipcMain.handle('haligtree:unused:find', (_event, extra: unknown) => find(extra as string[]))
  // The sheet closed while it looked: the scan stops at its next breath.
  ipcMain.handle('haligtree:unused:stop', () => void scan++)
  // Looked for again first, so a file a note took up since the sheet opened stays.
  ipcMain.handle('haligtree:unused:bin', async (_event, names: unknown, extra: unknown) => {
    const now = await find(extra as string[])
    if (!Array.isArray(now) || !Array.isArray(names)) return { moved: 0, size: 0 }
    const still = new Map(now.map((one) => [one.name, one.size]))
    let moved = 0
    let size = 0
    for (const name of names) {
      if (typeof name !== 'string' || !still.has(name)) continue
      await shell.trashItem(join(assets(), name)).then(() => (moved++, (size += still.get(name) ?? 0)), () => undefined)
    }
    return { moved, size }
  })
}
