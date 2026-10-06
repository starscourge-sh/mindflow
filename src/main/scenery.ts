import { app, dialog, ipcMain, nativeImage } from 'electron'
import { createHash } from 'crypto'
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
}
type Entry = Scene & { path: string; key: string }

const PICTURES = new Set(['.jpg', '.jpeg', '.png', '.webp'])
/** About as wide as a window ever is at 2x, and small enough to load at once. */
const WIDTH = 1600

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
  let runs = 0, short = 0
  for (const at of [0.3, 0.5, 0.7]) {
    const row = image.crop({ x: 0, y: Math.floor(height * at), width, height: 1 }).toBitmap()
    let run = 1
    for (let i = 4; i < row.length; i += 4) {
      if (row[i] === row[i - 4] && row[i + 1] === row[i - 3] && row[i + 2] === row[i - 2]) run++
      else {
        runs++
        if (run < 3) short++
        run = 1
      }
    }
  }
  return runs > 12 && short / runs < 0.1
}

/** The copy for one picture, made if it is new or has changed since. */
async function prepare(path: string): Promise<Entry | null> {
  const facts = await stat(path)
  const key = createHash('sha1').update(`2\0${path}\0${facts.mtimeMs}\0${facts.size}`).digest('hex').slice(0, 32)
  const kept = known.get(key)
  if (kept) return kept
  const image = nativeImage.createFromPath(path)
  if (image.isEmpty()) return null
  const { width } = image.getSize()
  const pixel = blocky(image, path)
  // Pixel art is kept whole, as a PNG: shrinking it smears the squares, and
  // squares compress to almost nothing anyway.
  const copy = pixel ? image : width > WIDTH ? image.resize({ width: WIDTH, quality: 'good' }) : image
  const ext = pixel ? 'png' : 'jpg'
  await writeFile(join(sceneryDir(), `${key}.${ext}`), pixel ? copy.toPNG() : copy.toJPEG(80))
  const size = copy.getSize()
  return { id: key, key, path, url: `mindflow://scenery/${key}.${ext}`, width: size.width, height: size.height, pixel, ...read(copy) }
}

/** Every picture in the folders, one level down too, copied where needed. */
async function scan(folders: string[]): Promise<void> {
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
      if (entry && !known.has(entry.key)) {
        known.set(entry.key, entry)
        fresh++
        await breathe()
        // The first few made: enough to show something while the rest follow.
        if (fresh === 6) {
          await save(next)
          changed()
        }
      }
    } catch {
      // An unreadable picture is skipped, never the whole folder.
    }
  }
  known = next
  await save(next)
  // Copies of pictures no longer in any folder go, so the cache never grows
  // past what you have chosen.
  const keep = new Set([...next.values()].map((one) => one.url.split('/').pop()))
  for (const name of await readdir(sceneryDir()).catch(() => [] as string[]))
    if (name !== 'index.json' && !keep.has(name)) await rm(join(sceneryDir(), name), { force: true })
  if (fresh) changed()
}

const save = (entries: Map<string, Entry>): Promise<void> => writeFile(indexFile(), JSON.stringify([...entries.values()]))

/** The scenes in the folders, as far as they are known now; a scan starts if the folders changed. */
async function list(folders: string[]): Promise<{ scenes: Scene[]; scanning: boolean }> {
  const wanted = JSON.stringify(folders)
  // Looked at again now and then too, so a picture dropped into a folder turns up.
  if ((wanted !== scanned || Date.now() - scannedAt > 10 * 60000) && !scanning) {
    scanned = wanted
    scannedAt = Date.now()
    scanning = scan(folders).catch(() => undefined).finally(() => {
      scanning = null
      // The folders changed again while that ran: go round once more.
      if (scanned !== wanted) void list(JSON.parse(scanned) as string[])
    })
  } else if (wanted !== scanned) scanned = wanted
  await loading()
  const inFolders = (path: string): boolean => folders.some((folder) => path.startsWith(folder.endsWith('/') ? folder : `${folder}/`))
  // Only what the windows need: where a picture lives on disk stays here.
  const scenes: Scene[] = [...known.values()].filter((one) => inFolders(one.path)).map((one) => ({ id: one.id, url: one.url, mood: one.mood, width: one.width, height: one.height, pixel: one.pixel, color: one.color, light: one.light, name: basename(one.path, extname(one.path)), folder: basename(dirname(one.path)) }))
  return { scenes, scanning: !!scanning }
}

export function registerScenery(): void {
  ipcMain.handle('vigil:scenery', (_event, folders: unknown) =>
    // Whole folders only, named from the top of the disk: nothing relative to wherever the app runs.
    list(Array.isArray(folders) ? folders.filter((one): one is string => typeof one === 'string' && isAbsolute(one)) : []))
  ipcMain.handle('vigil:scenery:folder', async () => {
    const { filePaths } = await dialog.showOpenDialog({ title: 'Choose a folder of pictures', buttonLabel: 'Use this folder', properties: ['openDirectory'] })
    return filePaths[0] ?? null
  })
}
