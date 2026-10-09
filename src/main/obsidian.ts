import { app, ipcMain } from 'electron'
import { createHash, randomUUID } from 'crypto'
import { mkdir, readFile, readdir, realpath, rename, stat, writeFile } from 'fs/promises'
import { homedir } from 'os'
import { join, sep } from 'path'
import { PICTURE, SHOWN, cleanRef, nameOf, tailOf } from './embeds'
import { lookAhead } from './pictures'

/**
 * Finding a picture a note pasted from Obsidian points at, with no setup:
 * Obsidian's own list of vaults says where to look, and the file is copied
 * into Vigil's store the way a pasted picture is. Read only: nothing in a
 * vault is ever written to.
 */

/** Obsidian's list of vaults. A test points it at a copy of its own. */
const configPath = (): string =>
  process.env.MINDFLOW_OBSIDIAN_CONFIG || join(homedir(), 'Library', 'Application Support', 'obsidian', 'obsidian.json')

/** Bigger than this is left where it is: a note is no place for a film. */
const MAX_BYTES = 100 * 1024 * 1024
/** How many files one vault's index walks at most, and for how long. */
const INDEX_CAP = Number(process.env.MINDFLOW_VAULT_INDEX_CAP) || 200_000
const INDEX_MS = 4000
/** A name not found is looked for again, but not more often than this. */
const STALE_MS = 30_000

type Vault = { path: string; open: boolean; ts: number }

/** The vaults Obsidian knows, the open one first, then the most recently used. */
async function vaults(): Promise<Vault[]> {
  try {
    const read = JSON.parse(await readFile(configPath(), 'utf8')) as { vaults?: Record<string, { path?: unknown; ts?: unknown; open?: unknown }> }
    return Object.values(read.vaults ?? {})
      .filter((one): one is { path: string; ts?: unknown; open?: unknown } => typeof one?.path === 'string' && one.path.startsWith('/'))
      .map((one) => ({ path: one.path, open: one.open === true, ts: typeof one.ts === 'number' ? one.ts : 0 }))
      .sort((a, b) => Number(b.open) - Number(a.open) || b.ts - a.ts)
  } catch {
    return []
  }
}

/** Each vault's files Vigil can show, by lowercased name. */
const indexes = new Map<string, { at: number; byName: Map<string, string[]>; capped: boolean }>()

/**
 * Walk a vault for files Vigil shows, folders nearest the top first. Its
 * settings, trash and hidden folders and any node_modules are stepped over,
 * and a huge one is cut short rather than holding the paste up.
 */
async function buildIndex(root: string): Promise<{ at: number; byName: Map<string, string[]>; capped: boolean }> {
  const byName = new Map<string, string[]>()
  const started = Date.now()
  const queue = [root]
  let seen = 0
  let capped = false
  while (queue.length) {
    if (seen >= INDEX_CAP || Date.now() - started > INDEX_MS) {
      capped = true
      break
    }
    const folder = queue.shift()!
    const entries = await readdir(folder, { withFileTypes: true }).catch(() => [])
    for (const entry of entries) {
      seen += 1
      if (entry.name.startsWith('.') || entry.name === 'node_modules') continue
      const path = join(folder, entry.name)
      if (entry.isDirectory()) queue.push(path)
      else if (entry.isFile() && SHOWN.test(entry.name)) {
        const key = entry.name.toLowerCase()
        byName.set(key, [...(byName.get(key) ?? []), path])
      }
    }
  }
  const index = { at: Date.now(), byName, capped }
  indexes.set(root, index)
  return index
}

/** One walk at a time per vault: several pictures in one paste share it. */
const walking = new Map<string, Promise<{ byName: Map<string, string[]> }>>()
const indexOf = async (root: string, fresh: boolean): Promise<{ byName: Map<string, string[]> }> => {
  const known = indexes.get(root)
  if (known && (!fresh || Date.now() - known.at < STALE_MS)) return known
  const already = walking.get(root)
  if (already) return already
  const walk = buildIndex(root).finally(() => walking.delete(root))
  walking.set(root, walk)
  return walk
}

/** A file, only if it really sits inside the vault (no link out of it) and is a size worth bringing. */
async function inside(root: string, path: string): Promise<{ path: string; size: number; mtime: number } | null> {
  try {
    const [real, top] = await Promise.all([realpath(path), realpath(root)])
    if (!real.startsWith(top + sep) || !SHOWN.test(real)) return null
    const info = await stat(real)
    if (!info.isFile() || !info.size || info.size > MAX_BYTES) return null
    return { path: real, size: info.size, mtime: info.mtimeMs }
  } catch {
    return null
  }
}

/**
 * Where a reference points. Its path from the top of a vault first (relative
 * to a note whose folder is unknown, its `../` steps are dropped); then by
 * name, as Obsidian itself finds `![[name.png]]`. Several by that name: the
 * one whose path ends the same way, then the open vault's, then the newest.
 */
export async function findEmbed(raw: string): Promise<string | null> {
  const ref = cleanRef(raw)
  if (!ref) return null
  const known = await vaults()
  const tail = tailOf(ref)
  if (ref.startsWith('/')) {
    for (const vault of known) {
      const hit = await inside(vault.path, ref)
      if (hit) return hit.path
    }
  }
  if (tail.includes('/'))
    for (const vault of known) {
      const hit = await inside(vault.path, join(vault.path, tail))
      if (hit) return hit.path
    }
  const name = nameOf(ref).toLowerCase()
  const ending = `/${tail.toLowerCase()}`
  for (const fresh of [false, true]) {
    const found: { path: string; mtime: number; rank: number }[] = []
    for (const [at, vault] of known.entries()) {
      const index = await indexOf(vault.path, fresh)
      for (const path of index.byName.get(name) ?? []) {
        const hit = await inside(vault.path, path)
        if (hit) found.push({ path: hit.path, mtime: hit.mtime, rank: (path.toLowerCase().endsWith(ending) ? 0 : 10) + (vault.open ? 0 : 1) + at / 1000 })
      }
    }
    if (found.length) return found.sort((a, b) => Math.floor(a.rank) - Math.floor(b.rank) || b.mtime - a.mtime)[0].path
  }
  return null
}

/** What a found file became in Vigil's store. */
export interface BroughtIn {
  src: string
  name: string
  size: number
  image: boolean
}

/** Copy a file into the store by the hash of its bytes, as a pasted picture is, so the same one is kept once. */
async function keep(path: string, assets: string): Promise<BroughtIn | null> {
  const bytes = await readFile(path).catch(() => null)
  if (!bytes?.byteLength) return null
  const ending = (path.split('.').pop() ?? '').toLowerCase()
  const extension = ending === 'jpeg' ? 'jpg' : ending
  const file = `${createHash('sha256').update(bytes).digest('hex')}.${extension}`
  const destination = join(assets, file)
  await mkdir(assets, { recursive: true })
  if (!(await stat(destination).catch(() => null))) {
    // Beside it, then renamed: a half-written picture is never shown.
    const temporary = `${destination}.${randomUUID()}.tmp`
    await writeFile(temporary, bytes)
    await rename(temporary, destination)
  }
  if (PICTURE.test(path)) lookAhead(file)
  return { src: `mindflow://assets/${file}`, name: nameOf(path), size: bytes.byteLength, image: PICTURE.test(path) }
}

/** Each reference as the stored file it became, or null where none was found. */
export async function bringEmbeds(refs: string[], assets = join(app.getPath('userData'), 'assets')): Promise<(BroughtIn | null)[]> {
  return Promise.all(refs.map(async (ref) => {
    const path = await findEmbed(ref).catch(() => null)
    return path ? keep(path, assets).catch(() => null) : null
  }))
}

export function registerObsidian(): void {
  ipcMain.handle('obsidian:bring', (_event, refs: unknown) =>
    Array.isArray(refs) && refs.length <= 200 && refs.every((one) => typeof one === 'string' && one.length <= 2048)
      ? bringEmbeds(refs as string[])
      : [])
}
