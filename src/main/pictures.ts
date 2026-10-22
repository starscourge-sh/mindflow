import { app, ipcMain, nativeImage } from 'electron'
import { imageSizeFromFile } from 'image-size/fromFile'
import { join } from 'path'
import { rgbaToThumbHash } from 'thumbhash'

import { database } from './captures'
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
export type PictureLook = [number, number, string, number, number]

const PICTURE = /^[a-f0-9]{64}\.(png|jpe?g|gif|webp|avif|bmp|heic|svg)$/
const store = (): string => join(app.getPath('userData'), 'assets')

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
  const path = join(store(), name)
  const size = await imageSizeFromFile(path).catch(() => null)
  if (!size?.width || !size.height) return null
  // Turned on its side by its camera: drawn the way it is turned.
  const turned = (size.orientation ?? 1) >= 5
  const [width, height] = turned ? [size.height, size.width] : [size.width, size.height]
  const copy = await nativeImage.createThumbnailFromPath(path, { width: 400, height: 400 }).catch(() => null)
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
      if (look) db().prepare('insert or replace into picture_looks (name, width, height, hash, top, bottom) values (?, ?, ?, ?, ?, ?)').run(name, ...look)
      return look
    })
    line = waiting.then(() => new Promise((done) => setTimeout(done, PAUSE)))
    asked.set(name, waiting)
  }
  return waiting
}

/** For a picture just stored: its look worked out now, in the background. */
export const lookAhead = (url: string): void => void lookOf(url.replace(/^haligtree:\/\/assets\//, ''))

export function registerPictures(): void {
  // Every look known so far, at once, so a note opened later has them all to hand.
  ipcMain.handle('haligtree:pictures:looks', () =>
    Object.fromEntries((db().prepare('select name, width, height, hash, top, bottom from picture_looks').all() as (Row & { name: string })[]).map((row) => [row.name, lookFrom(row)])))
  // The ones a note shows that are not known yet, each answered as it is worked out.
  ipcMain.handle('haligtree:pictures:look', (_event, names: unknown) =>
    Promise.all((Array.isArray(names) ? names : []).slice(0, 500).map((name) => lookOf(String(name)))))
}
