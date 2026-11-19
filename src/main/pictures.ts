import { app, ipcMain, nativeImage, powerMonitor } from 'electron'
import { imageSizeFromFile } from 'image-size/fromFile'
import { existsSync } from 'fs'
import { mkdir, readdir, writeFile } from 'fs/promises'
import { dirname, join } from 'path'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { rgbaToThumbHash } from 'thumbhash'

import { database, quietly } from './captures'
import { bandsOf, fourThree } from './letterbox'

/**
 * Each stored picture's size and a few bytes of its colours (a ThumbHash), so
 * a note keeps every picture's place before the picture itself has loaded,
 * and paints a soft blur of its colours there in the meantime.
 *
 * Worked out once per picture and kept in the database: a new one as it is
 * stored, an older one the first time a note shows it. One at a time, with a
 * pause between, so a note full of them never holds up the app; the files are
 * only ever read, and a picture half done when the app quits is simply done
 * again next time.
 */

/**
 * Width, height, the ThumbHash in base64 (empty when the colours could not be
 * read), and the share of its height taken by black bands baked in at the top
 * and the bottom (0 when there are none), which are left out wherever it is shown.
 */
type PictureLook = [number, number, string, number, number]

const PICTURE = /^[a-f0-9]{64}\.(png|jpe?g|gif|webp|avif|bmp|heic|svg)$/
/** The folder every picture and file a note holds is kept in. */
export const assetsDir = (): string => join(app.getPath('userData'), 'assets')

/**
 * A stored picture's small copy, at most `size` on its long side (`tall`: its height, for rows and tiles that crop):
 * drawn by macOS's own thumbnailer, outside this thread, and kept beside the store, so each is made once, ever. The
 * original is never opened here: this thread answers every window, and a 10,446 by 13,522 painting held the app for
 * seconds on every run (the user, 15 Nov 2026: "this page struggles to display content e.g images quickly despite it
 * being a local app"). Its path, or null when the Mac draws none (an SVG).
 */
/**
 * Every copy is made by the Mac's `sips`, in a process of its own. The thumbnailer, when it cannot draw a picture, hands
 * back the file's icon as if it were the picture: a JPEG's for a screen-sized copy of an 8,167 by 9,851 painting, a
 * WebP's for every WebP tile on a MacBook Air (the user, 19 Nov 2026), and both were kept and shown. Kept under their own
 * name (`-s`), so an icon kept by an earlier build is never served again. The thumbnailer is asked only for what sips
 * cannot read (an SVG).
 */
const copyPath = (name: string, size: number, tall = false): string =>
  join(assetsDir(), '..', 'thumbs', `${name.replace(/\.[a-z0-9]+$/, '')}-s${tall ? 'h' : ''}${size}.${/\.png$/i.test(name) ? 'png' : 'jpg'}`)
export async function smallCopy(name: string, size: number, tall = false): Promise<string | null> {
  const small = copyPath(name, size, tall)
  if (existsSync(small)) return small
  const path = join(assetsDir(), name)
  if (process.platform === 'darwin' && !/\.svg$/i.test(name)) {
    const read = await imageSizeFromFile(path).catch(() => null)
    const [w, h] = read?.width && read.height ? ((read.orientation ?? 1) >= 5 ? [read.height, read.width] : [read.width, read.height]) : [0, 0]
    // The long side at most `size`, or for `tall` the height at most `size` and the width at most three times it; never larger than it is.
    const long = tall ? (w > h * 3 ? size * 3 : Math.round((size * Math.max(w, h)) / h)) : size
    const fit = w && h && Math.max(w, h) > long ? ['-Z', String(long)] : []
    const format = small.endsWith('.png') ? ['png'] : ['jpeg', '-s', 'formatOptions', '85']
    await mkdir(dirname(small), { recursive: true })
    const done = await promisify(execFile)('sips', [...fit, '-s', 'format', ...format, path, '--out', small], { timeout: 60_000 }).then(() => true, () => false)
    if (done && existsSync(small)) return small
  }
  const made = await nativeImage.createThumbnailFromPath(join(assetsDir(), name), tall ? { width: size * 3, height: size } : { width: size, height: size }).catch(() => null)
  if (!made || made.isEmpty()) return null
  await mkdir(dirname(small), { recursive: true })
  await writeFile(small, small.endsWith('.png') ? made.toPNG() : made.toJPEG(85))
  return small
}

let made = false
const db = (): ReturnType<typeof database> => {
  if (!made) {
    database().exec('create table if not exists picture_looks (name text primary key, width integer not null, height integer not null, hash text not null, top real not null default 0, bottom real not null default 0)')
    // A book opened by an earlier build made the table before it kept black bands: add them.
    const has = new Set((database().prepare('pragma table_info(picture_looks)').all() as { name: string }[]).map((one) => one.name))
    for (const column of ['top', 'bottom']) if (!has.has(column)) database().exec(`alter table picture_looks add column ${column} real not null default 0`)
  }
  made = true
  return database()
}

type Row = { width: number; height: number; hash: string; top: number; bottom: number }
// Bands kept by an earlier build for a picture that is not 4:3 are not used:
// only a 4:3 picture is ever cropped (letterbox.ts).
const lookFrom = (row: Row): PictureLook => (fourThree(row.width, row.height) ? [row.width, row.height, row.hash, row.top, row.bottom] : [row.width, row.height, row.hash, 0, 0])
/** A picture's look if already worked out, without waiting for it. */
export const known = (name: string): PictureLook | undefined => {
  const row = db().prepare('select width, height, hash, top, bottom from picture_looks where name = ?').get(name) as Row | undefined
  return row && lookFrom(row)
}

/** A system picture's pixels, red first and not multiplied by their alpha, which is how ThumbHash and bandsOf read them. */
function rgbaOf(image: Electron.NativeImage): { w: number; h: number; rgba: Uint8Array } {
  const { width: w, height: h } = image.getSize()
  const bgra = image.toBitmap()
  const rgba = new Uint8Array(w * h * 4)
  for (let i = 0; i < rgba.length; i += 4) {
    const a = bgra[i + 3]
    const un = a && a < 255 ? 255 / a : 1
    rgba[i] = Math.min(255, bgra[i + 2] * un)
    rgba[i + 1] = Math.min(255, bgra[i + 1] * un)
    rgba[i + 2] = Math.min(255, bgra[i] * un)
    rgba[i + 3] = a
  }
  return { w, h, rgba }
}

/**
 * Its size from the file's first bytes; its bands and colours from a copy the
 * system makes 400px across (the bands are looked for there, finely enough to
 * leave no black edge), and the colours of what is between them at 100px.
 */
async function measure(name: string): Promise<PictureLook | null> {
  const path = join(assetsDir(), name)
  const size = await imageSizeFromFile(path).catch(() => null)
  if (!size?.width || !size.height) return null
  // Turned on its side by its camera: drawn the way it is turned.
  const turned = (size.orientation ?? 1) >= 5
  const [width, height] = turned ? [size.height, size.width] : [size.width, size.height]
  // From its small copy (smallCopy), never the thumbnailer straight: where that cannot draw a picture it hands back the file's icon.
  const twin = await smallCopy(name, 640)
  const read = twin ? nativeImage.createFromPath(twin) : null
  const copy = read && !read.isEmpty() ? read.resize(read.getSize().width >= read.getSize().height ? { width: Math.min(400, read.getSize().width) } : { height: Math.min(400, read.getSize().height) }) : null
  if (!copy || copy.isEmpty()) return [width, height, '', 0, 0]
  const { w, h, rgba } = rgbaOf(copy)
  const bands = bandsOf(rgba, w, h)
  const top = bands ? Math.round(bands.top * h) : 0
  const kept = h - top - (bands ? Math.round(bands.bottom * h) : 0)
  const inside = bands ? copy.crop({ x: 0, y: top, width: w, height: kept }) : copy
  const scale = 100 / Math.max(w, kept)
  const small = rgbaOf(scale < 1 ? inside.resize({ width: Math.max(1, Math.round(w * scale)), height: Math.max(1, Math.round(kept * scale)) }) : inside)
  const hash = small.w <= 100 && small.h <= 100 ? Buffer.from(rgbaToThumbHash(small.w, small.h, small.rgba)).toString('base64') : ''
  return [width, height, hash, bands?.top ?? 0, bands?.bottom ?? 0]
}

// One at a time, a short pause between each.
const asked = new Map<string, Promise<PictureLook | null>>()
let line: Promise<unknown> = Promise.resolve()
const PAUSE = 25

/** A picture's look, from the database, or worked out in its turn and kept. Null for one that cannot be read. */
export function lookOf(name: string): Promise<PictureLook | null> {
  if (!PICTURE.test(name)) return Promise.resolve(null)
  const had = known(name)
  if (had) return Promise.resolve(had)
  let waiting = asked.get(name)
  if (!waiting) {
    waiting = line.then(async () => {
      const look = await measure(name).catch(() => null)
      // Kept quietly (captures.ts): only this file reads a picture's look, so it never moves the book's stamp. Moving it,
      // each picture a list measured made search read the whole book again (keys of 12 to 19 s on a big book).
      if (look) quietly(() => db().prepare('insert or replace into picture_looks (name, width, height, hash, top, bottom) values (?, ?, ?, ?, ?, ?)').run(name, ...look))
      return look
    })
    line = waiting.then(() => new Promise((done) => setTimeout(done, PAUSE)))
    asked.set(name, waiting)
  }
  return waiting
}

/**
 * The small copy a grid, a board's card or a deck's gallery draws (`?w=640`, index.ts), made ahead: a picture whose
 * copy was first asked for as its board opened came in frames after its card, the Mac's thumbnailer not done within
 * the 150 ms a page waits. One at a time, so an import of a thousand pictures never runs a thousand at once.
 */
const AHEAD = 640
const SHRINKS = /\.(png|jpe?g|webp|heic|tiff?)$/i
const copying = new Set<string>()
/** Pictures the Mac drew no copy of: never asked again in this run. */
const undrawable = new Set<string>()
let copies: Promise<unknown> = Promise.resolve()
const copyAhead = (name: string): void => {
  if (!PICTURE.test(name) || !SHRINKS.test(name) || copying.has(name)) return
  copying.add(name)
  copies = copies.then(() => smallCopy(name, AHEAD)).catch(() => null).then((made) => (made || undrawable.add(name), copying.delete(name)))
}

/** For a picture just stored: its look worked out now, and its small copy made, in the background. */
export const lookAhead = (url: string): void => {
  const name = url.replace(/^haligtree:\/\/assets\//, '')
  void lookOf(name)
  copyAhead(name)
}

/**
 * The small copies older pictures lack (stored before copies were made ahead, or by another app), filled in a few
 * at a time, and only while the person has left the Mac alone for a minute, so the work never competes with them.
 * Each book's store is looked through until it has none missing.
 */
const IDLE = 60
const FEW = 4
const filled = new Set<string>()
let filling = false
async function fill(): Promise<void> {
  const store = assetsDir()
  if (filling || filled.has(store)) return
  filling = true
  try {
    // A few, then look again: the moment the person is back, the rest wait for the next quiet minute.
    while (powerMonitor.getSystemIdleTime() >= IDLE && assetsDir() === store) {
      const missing = (await readdir(store)).filter((name) => PICTURE.test(name) && SHRINKS.test(name) && !undrawable.has(name) && !existsSync(copyPath(name, AHEAD)))
      if (!missing.length) return void filled.add(store)
      missing.slice(0, FEW).forEach(copyAhead)
      await copies
    }
  } catch {
    // A store not made yet (a new book): looked at again next time.
  } finally {
    filling = false
  }
}
function fillCopies(): void {
  setInterval(() => void fill(), 15_000)
}

export function registerPictures(): void {
  fillCopies()
  // Every look known so far, at once, so a note opened later has them all to hand.
  ipcMain.handle('haligtree:pictures:looks', () =>
    Object.fromEntries((db().prepare('select name, width, height, hash, top, bottom from picture_looks').all() as (Row & { name: string })[]).map((row) => [row.name, lookFrom(row)])))
  // The ones a note shows that are not known yet, each answered as it is worked out.
  ipcMain.handle('haligtree:pictures:look', (_event, names: unknown) =>
    Promise.all((Array.isArray(names) ? names : []).slice(0, 500).map((name) => lookOf(String(name)))))
}
