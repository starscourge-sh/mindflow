import { app, dialog, ipcMain, nativeImage } from 'electron'
import { createHash, randomUUID } from 'crypto'
import { execFile } from 'child_process'
import { tmpdir } from 'os'
import { promisify } from 'util'
import { mkdir, readFile, readdir, rm, stat, writeFile } from 'fs/promises'
import { basename, dirname, extname, isAbsolute, join } from 'path'
import { changed } from './captures'

/**
 * Scenery: pictures from folders you choose, shown at the quiet moments (an
 * empty inbox, a finished review, the top of today's page). The originals are
 * yours and stay where they are; what the windows load is a smaller copy made
 * once and kept in the app's own folder, so a 4K screenshot is never decoded
 * on every view.
 */

/** When a picture fits: by its colour and how light it is. */
export type Mood = 'day' | 'dusk' | 'night' | 'interior'
export type Scene = {
  id: string
  /** What the windows load: mindflow://scenery/<id>.<ext>. */
  url: string
  mood: Mood
  width: number
  height: number
  /** Drawn in big square pixels: scaled up blocky, never smoothed. */
  pixel: boolean
  /** Its average colour, to paint while it loads. */
  color: string
  /** 0 is black, 1 is white. */
  light: number
  /** The file's name without its ending, and its folder's, for a credit under the picture. */
  name?: string
  folder?: string
  /** A copy small enough for a list's tiles: mindflow://scenery/<id>-s.jpg. */
  small?: string
}
type Entry = Scene & { path: string; key: string }

const PICTURES = new Set(['.jpg', '.jpeg', '.png', '.webp'])
/** About as wide as a window ever is at 2x, and small enough to load at once. */
const WIDTH = 1600
/** Wide enough for the biggest tile or cover at 2x. */
const SMALL = 480

export const sceneryDir = (): string => join(app.getPath('userData'), 'scenery-cache')
const indexFile = (): string => join(sceneryDir(), 'index.json')

let known = new Map<string, Entry>()
/** What the last run worked out, read back once: copies made before are not made again. */
let index: Promise<void> | null = null
const loading = (): Promise<void> => (index ??= (async () => {
  await mkdir(sceneryDir(), { recursive: true })
  try {
    known = new Map((JSON.parse(await readFile(indexFile(), 'utf8')) as Entry[]).map((one) => [one.key, one]))
  } catch {
    // None yet, or unreadable: every copy is made again.
  }
})())
let scanned = ''
let scannedAt = 0
let scanning: Promise<void> | null = null

/** A pause between pictures, so making copies never holds up the windows. */
const breathe = (): Promise<void> => new Promise((done) => setTimeout(done, 25))

/**
 * Colour, lightness and mood from a tiny copy. Mood is read from how much of
 * the picture is warm, gold or blue rather than its average alone: a gold sky
 * over a dark field averages to brown, which says nothing.
 */
function read(image: Electron.NativeImage): Pick<Scene, 'mood' | 'color' | 'light'> {
  const small = image.resize({ width: 32, height: 32, quality: 'good' })
  const bytes = small.toBitmap() // BGRA
  let r = 0, g = 0, b = 0, light = 0, red = 0, gold = 0
  const n = bytes.length / 4
  for (let i = 0; i < bytes.length; i += 4) {
    const [B, G, R] = [bytes[i] / 255, bytes[i + 1] / 255, bytes[i + 2] / 255]
    r += R; g += G; b += B
    const l = 0.2126 * R + 0.7152 * G + 0.0722 * B
    light += l
    const max = Math.max(R, G, B), min = Math.min(R, G, B)
    const sat = max ? (max - min) / max : 0
    if (sat < 0.2 || max < 0.12) continue
    let hue = max === R ? ((G - B) / (max - min)) % 6 : max === G ? (B - R) / (max - min) + 2 : (R - G) / (max - min) + 4
    hue = (hue * 60 + 360) % 360
    if (hue < 28 || hue >= 335) red++
    else if (hue < 62 && max > 0.45) gold++
  }
  light /= n
  const share = (count: number): number => count / n
  // Above zero the picture leans warm (red over blue), below it cool.
  const warmth = (r - b) / n
  const mood: Mood =
    light < 0.13 ? (warmth > 0.015 ? 'interior' : 'night')
    : share(red) > 0.18 && share(red) > share(gold) ? 'dusk'
    : warmth < 0 ? 'night'
    : light < 0.2 ? 'interior'
    : share(red) > 0.08 && share(red) > share(gold) ? 'dusk'
    : 'day'
  const hex = (v: number): string => Math.round((v / n) * 255).toString(16).padStart(2, '0')
  return { mood, light: Math.round(light * 1000) / 1000, color: `#${hex(r)}${hex(g)}${hex(b)}` }
}

/**
 * Whether it is pixel art, from a few rows at full size: drawn in squares,
 * every run of one colour is several pixels long, where a photograph or a
 * smoothly painted picture keeps changing pixel to pixel and edges blend.
 */
function blocky(image: Electron.NativeImage, path: string): boolean {
  if (/pixel/i.test(path)) return true
  const { width, height } = image.getSize()
  let runs = 0, short = 0, soft = 0
  for (const at of [0.3, 0.5, 0.7]) {
    const row = image.crop({ x: 0, y: Math.floor(height * at), width, height: 1 }).toBitmap()
    let run = 1
    for (let i = 4; i < row.length; i += 4) {
      if (row[i] === row[i - 4] && row[i + 1] === row[i - 3] && row[i + 2] === row[i - 2]) run++
      else {
        runs++
        if (run < 3) short++
        // A step of a shade or two: a smooth gradient's long runs, not a drawn square's edge.
        if (Math.abs(row[i] - row[i - 4]) + Math.abs(row[i + 1] - row[i - 3]) + Math.abs(row[i + 2] - row[i - 2]) <= 6) soft++
        run = 1
      }
    }
  }
  return runs > 12 && short / runs < 0.1 && soft / runs < 0.5
}

/** Whether any of it is see-through, from a small copy. */
function seeThrough(image: Electron.NativeImage): boolean {
  const bytes = image.resize({ width: 64, quality: 'good' }).toBitmap() // BGRA
  for (let i = 3; i < bytes.length; i += 4) if (bytes[i] < 250) return true
  return false
}

/**
 * A picture as nativeImage reads it. WebP it cannot read (every .webp came
 * back empty and was skipped, the sandbox's own landscapes included), so on a
 * Mac those are turned into a PNG by the Mac's own `sips` first. (The system
 * thumbnailer reads them too, but pads them out square.)
 */
async function decode(path: string): Promise<Electron.NativeImage> {
  const image = nativeImage.createFromPath(path)
  if (!image.isEmpty() || !/\.webp$/i.test(path) || process.platform !== 'darwin') return image
  const out = join(tmpdir(), `vigil-scene-${randomUUID()}.png`)
  try {
    await promisify(execFile)('sips', ['-s', 'format', 'png', path, '--out', out], { timeout: 20000 })
    return nativeImage.createFromPath(out)
  } catch {
    return image
  } finally {
    await rm(out, { force: true })
  }
}

/** The copy for one picture, made if it is new or has changed since. */
async function prepare(path: string): Promise<Entry | null> {
  const facts = await stat(path)
  const key = createHash('sha1').update(`4\0${path}\0${facts.mtimeMs}\0${facts.size}`).digest('hex').slice(0, 32)
  const kept = known.get(key)
  // Kept only while both its copies are still on disk; a lost one is made again.
  const onDisk = (url = ''): Promise<boolean> => stat(join(sceneryDir(), url.split('/').pop() ?? '')).then(() => true, () => false)
  if (kept && (await onDisk(kept.url)) && (await onDisk(kept.small))) return kept
  const image = await decode(path)
  if (image.isEmpty()) return null
  const { width } = image.getSize()
  // A picture with see-through parts stays a PNG: a JPEG would fill them black.
  const clear = /\.(png|webp)$/i.test(path) && seeThrough(image)
  // A small copy too, for covers in lists.
  const tiny = clear ? 'png' : 'jpg'
  const small = `mindflow://scenery/${key}-s.${tiny}`
  const shrunk = width > SMALL ? image.resize({ width: SMALL, quality: 'good' }) : image
  await writeFile(join(sceneryDir(), `${key}-s.${tiny}`), clear ? shrunk.toPNG() : shrunk.toJPEG(82))
  const pixel = blocky(image, path)
  // Pixel art is kept whole, as a PNG: shrinking it smears the squares, and
  // squares compress to almost nothing anyway.
  const copy = pixel ? image : width > WIDTH ? image.resize({ width: WIDTH, quality: 'good' }) : image
  const ext = pixel || clear ? 'png' : 'jpg'
  await writeFile(join(sceneryDir(), `${key}.${ext}`), ext === 'png' ? copy.toPNG() : copy.toJPEG(80))
  const size = copy.getSize()
  return { id: key, key, path, url: `mindflow://scenery/${key}.${ext}`, small, width: size.width, height: size.height, pixel, ...read(copy) }
}

/**
 * Every picture in the folders, one level down too, copied where needed.
 * `whole` says these are all the folders every use wants; until then, what
 * other folders hold is kept as it is.
 */
async function scan(folders: string[], whole: boolean): Promise<void> {
  await loading()
  const paths: string[] = []
  for (const folder of folders) {
    try {
      for (const one of await readdir(folder, { withFileTypes: true })) {
        const full = join(folder, one.name)
        if (one.isFile() && PICTURES.has(extname(one.name).toLowerCase())) paths.push(full)
        else if (one.isDirectory() && !one.name.startsWith('.'))
          for (const inner of await readdir(full).catch(() => [] as string[]))
            if (PICTURES.has(extname(inner).toLowerCase())) paths.push(join(full, inner))
      }
    } catch {
      // A folder that has gone, or was never there: the others still count.
    }
  }
  const next = new Map<string, Entry>()
  let fresh = 0
  for (const path of paths) {
    try {
      const entry = await prepare(path)
      if (entry) next.set(entry.key, entry)
      if (entry && known.get(entry.key) !== entry) {
        known.set(entry.key, entry)
        fresh++
        await breathe()
        // The first few made: enough to show something while the rest follow.
        if (fresh === 6) {
          await save(known)
          changed()
        }
      }
    } catch {
      // An unreadable picture is skipped, never the whole folder.
    }
  }
  // Pictures in folders not looked at this time stay, unless this was every
  // folder in use: Covers' copies are never cleared by a look at Scenery's.
  const inScan = (path: string): boolean => folders.some((folder) => path.startsWith(folder.endsWith('/') ? folder : `${folder}/`))
  if (!whole) for (const one of known.values()) if (!inScan(one.path) && !next.has(one.key)) next.set(one.key, one)
  known = next
  await save(next)
  // Copies of pictures no longer in any folder go, so the cache never grows
  // past what you have chosen.
  const keep = new Set([...next.values()].flatMap((one) => [one.url, one.small ?? ''].map((url) => url.split('/').pop())))
  for (const name of await readdir(sceneryDir()).catch(() => [] as string[]))
    if (name !== 'index.json' && !keep.has(name)) await rm(join(sceneryDir(), name), { force: true })
  if (fresh) changed()
}

const save = (entries: Map<string, Entry>): Promise<void> => writeFile(indexFile(), JSON.stringify([...entries.values()]))

/**
 * The folders each use asks for (Scenery's, and Covers'): one scan and one
 * cache serve them all, so neither clears away the other's copies.
 */
const uses = new Map<string, string[]>()
const everyFolder = (): string => JSON.stringify([...new Set([...uses.values()].flat())].sort())

/** The scenes in the folders, as far as they are known now; a scan starts if the folders changed. */
async function list(folders: string[], use = 'scenery'): Promise<{ scenes: Scene[]; scanning: boolean }> {
  // An empty list is an answer too: that use wants nothing now, so its folders stop being copied.
  uses.set(use, folders)
  const wanted = everyFolder()
  // Looked at again now and then too, so a picture dropped into a folder turns up.
  if ((wanted !== scanned || Date.now() - scannedAt > 10 * 60000) && !scanning) {
    scanned = wanted
    scannedAt = Date.now()
    scanning = scan(JSON.parse(wanted) as string[], uses.has('scenery') && uses.has('covers')).catch(() => undefined).finally(() => {
      scanning = null
      // The folders changed while that ran: go round once more.
      if (everyFolder() !== wanted) void list(uses.get(use) ?? folders, use)
    })
  }
  await loading()
  const inFolders = (path: string): boolean => folders.some((folder) => path.startsWith(folder.endsWith('/') ? folder : `${folder}/`))
  // Only what the windows need: where a picture lives on disk stays here.
  const scenes: Scene[] = [...known.values()].filter((one) => inFolders(one.path)).map((one) => ({ id: one.id, url: one.url, mood: one.mood, width: one.width, height: one.height, pixel: one.pixel, color: one.color, light: one.light, name: basename(one.path, extname(one.path)), folder: basename(dirname(one.path)), small: one.small }))
  return { scenes, scanning: !!scanning }
}

export function registerScenery(): void {
  ipcMain.handle('vigil:scenery', (_event, folders: unknown, use: unknown) =>
    // Whole folders only, named from the top of the disk: nothing relative to wherever the app runs.
    list(Array.isArray(folders) ? folders.filter((one): one is string => typeof one === 'string' && isAbsolute(one)) : [], use === 'covers' ? 'covers' : 'scenery'))
  ipcMain.handle('vigil:scenery:folder', async () => {
    const { filePaths } = await dialog.showOpenDialog({ title: 'Choose a folder of pictures', buttonLabel: 'Use this folder', properties: ['openDirectory'] })
    return filePaths[0] ?? null
  })
}
