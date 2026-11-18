import { ipcMain } from 'electron'
import { createHash, randomUUID } from 'crypto'
import { mkdir, readFile, readdir, realpath, rename, stat, writeFile } from 'fs/promises'
import { homedir } from 'os'
import { join, sep } from 'path'
import { PICTURE, SHOWN, cleanRef, nameOf, tailOf } from './embeds'
import { assetsDir, lookAhead } from './pictures'

/**
 * Finding a picture a note pasted from Obsidian points at, with no setup:
 * Obsidian's own list of vaults says where to look, and the file is copied
 * into Haligtree's store the way a pasted picture is. Read only: nothing in a
 * vault is ever written to.
 */

/** Obsidian's list of vaults. A test points it at a copy of its own; a test that names none knows no vault, never the Mac's own. */
const configPath = (): string | null =>
  process.env.HALIGTREE_OBSIDIAN_CONFIG || (process.env.HALIGTREE_QA_AWAY !== undefined ? null : join(homedir(), 'Library', 'Application Support', 'obsidian', 'obsidian.json'))

/** Bigger than this is left where it is: a note is no place for a film. */
const MAX_BYTES = 100 * 1024 * 1024
/** A vault's own notes. */
const NOTE = /\.md$/i
/** How many files one vault's index walks at most, and for how long. */
const INDEX_CAP = Number(process.env.HALIGTREE_VAULT_INDEX_CAP) || 200_000
const INDEX_MS = 4000
/** A name not found is looked for again, but not more often than this. */
const STALE_MS = 30_000

type Vault = { path: string; open: boolean; ts: number }

/** The vaults Obsidian knows, the open one first, then the most recently used. */
async function vaults(): Promise<Vault[]> {
  const list = configPath()
  if (!list) return []
  try {
    const read = JSON.parse(await readFile(list, 'utf8')) as { vaults?: Record<string, { path?: unknown; ts?: unknown; open?: unknown }> }
    return Object.values(read.vaults ?? {})
      .filter((one): one is { path: string; ts?: unknown; open?: unknown } => typeof one?.path === 'string' && one.path.startsWith('/'))
      .map((one) => ({ path: one.path, open: one.open === true, ts: typeof one.ts === 'number' ? one.ts : 0 }))
      .sort((a, b) => Number(b.open) - Number(a.open) || b.ts - a.ts)
  } catch {
    return []
  }
}

/** One vault as the import picker shows it: its name, where it is and how many notes it holds. */
export type VaultChoice = { name: string; path: string; notes: number; more: boolean; open: boolean }

/** A vault's notes, counted the way the import walks it: hidden folders stepped over, a huge one cut short. */
async function countNotes(root: string): Promise<{ notes: number; more: boolean }> {
  const started = Date.now()
  const queue = [root]
  let notes = 0
  while (queue.length) {
    if (notes >= 50_000 || Date.now() - started > 1500) return { notes, more: true }
    const folder = queue.shift()!
    const entries = await readdir(folder, { withFileTypes: true }).catch(() => [])
    for (const entry of entries) {
      if (entry.name.startsWith('.') || entry.name === 'node_modules') continue
      if (entry.isDirectory()) queue.push(join(folder, entry.name))
      else if (entry.isFile() && entry.name.endsWith('.md')) notes += 1
    }
  }
  return { notes, more: false }
}

/** The vaults Obsidian knows that are still there, for the import picker. */
export async function vaultChoices(): Promise<VaultChoice[]> {
  const found = await Promise.all((await vaults()).map(async (vault) => {
    const there = await stat(vault.path).then((info) => info.isDirectory()).catch(() => false)
    if (!there) return null
    const { notes, more } = await countNotes(vault.path)
    return { name: nameOf(vault.path), path: vault.path, notes, more, open: vault.open }
  }))
  return found.filter((one): one is VaultChoice => one !== null)
}

/** Whether a folder is one of Obsidian's vaults: the picker may only import those without the folder dialog. */
export const isVault = async (path: string): Promise<boolean> => (await vaults()).some((vault) => vault.path === path)

/** Each vault's files Haligtree can show, and its notes, by lowercased name. */
const indexes = new Map<string, { at: number; byName: Map<string, string[]>; capped: boolean }>()

/**
 * Walk a vault for files Haligtree shows and for its notes, folders nearest
 * the top first. Its settings, trash and hidden folders and any node_modules
 * are stepped over, and a huge one is cut short rather than holding the paste up.
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
      else if (entry.isFile() && (SHOWN.test(entry.name) || NOTE.test(entry.name))) {
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
async function findEmbed(raw: string): Promise<string | null> {
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

/** A note in a vault: the vault's own folder and the note's file, both as the disk names them. */
export type VaultNote = { root: string; path: string }

/**
 * The vaults a link to a note not here yet may bring it in from: the ones
 * this book's imports came from (kept as each import starts), then those
 * Obsidian knows, the open one first. Read only.
 */
export const vaultRoots = async (kept: string[]): Promise<string[]> => [...new Set([...kept, ...(await vaults()).map((one) => one.path)])]

/**
 * The notes named `name` in these vaults, found as Obsidian finds `[[name]]`:
 * by the file's name in any folder, or, for a name with a folder in it, by
 * the end of its path. A vault that is gone or cannot be read is said apart,
 * so a link can say why it found nothing.
 */
export async function findVaultNotes(name: string, roots: string[]): Promise<{ found: VaultNote[]; unread: string[] }> {
  const wanted = name.trim().replace(/\.md$/i, '').replace(/^\/+/, '')
  const file = `${wanted.split('/').pop()!.toLowerCase()}.md`
  const ending = wanted.includes('/') ? `/${wanted.toLowerCase()}.md` : null
  const found = new Map<string, VaultNote>()
  const unread: string[] = []
  for (const root of roots) {
    const top = await realpath(root).catch(() => null)
    if (!top || !(await stat(top).then((info) => info.isDirectory(), () => false))) {
      unread.push(root)
      continue
    }
    // As the picture finder does: the walk kept a while, walked again when it finds nothing.
    const before = found.size
    for (const fresh of [false, true]) {
      const index = await indexOf(top, fresh)
      for (const path of index.byName.get(file) ?? []) {
        if (ending && !path.toLowerCase().endsWith(ending)) continue
        const real = await realpath(path).catch(() => null)
        if (real?.startsWith(top + sep) && NOTE.test(real) && (await stat(real).then((info) => info.isFile(), () => false))) found.set(real, { root: top, path: real })
      }
      if (found.size > before) break
    }
  }
  return { found: [...found.values()], unread }
}

/** What a found file became in Haligtree's store. */
interface BroughtIn {
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
  return { src: `haligtree://assets/${file}`, name: nameOf(path), size: bytes.byteLength, image: PICTURE.test(path) }
}

/** Each reference as the stored file it became, or null where none was found. */
export async function bringEmbeds(refs: string[], assets = assetsDir()): Promise<(BroughtIn | null)[]> {
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
