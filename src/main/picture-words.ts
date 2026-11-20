import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { BrowserWindow, ipcMain } from 'electron'
import helper from '../../resources/labels?asset&asarUnpack'
import { database } from './captures'
import { assetsDir } from './pictures'
import { PICTURE, STORED, hasWords, pictureLines, pictureNamed, type Pictures } from './picture-lines'
import { isArt } from './picture-sight'
import { meets } from './needs'
import { caps } from './understand'

/**
 * The words in every picture you keep (a screenshot, a photo of a slide, a
 * notebook page in your own hand), read by the Mac itself with Apple's Vision
 * (native/labels.swift --text: accurate, the language found by itself), kept
 * in the database, and made part of the note that holds the picture, so search
 * and ⌘K find a note by the words in its pictures. Every Mac; on device.
 *
 * Read in the background, one picture at a time: a picture is asked for the
 * first time search reads its note (captures.ts `words`), and read a moment
 * later; none is ever read twice.
 */

let made = false
const db = (): ReturnType<typeof database> => {
  if (!made) database().exec('create table if not exists picture_words (name text primary key, text text not null, read_at text not null)')
  made = true
  return database()
}

/** Every picture's words known so far, by file name. */
let known: Map<string, string> | null = null
const words = (): Map<string, string> => {
  known ??= new Map((db().prepare('select name, text from picture_words').all() as { name: string; text: string }[]).map((row) => [row.name, row.text]))
  return known
}

/** Read the words of one stored picture now; '' when it holds none, null when it could not be read. */
export function readPicture(name: string): Promise<string | null> {
  if (!PICTURE.test(name) || process.platform !== 'darwin') return Promise.resolve(null)
  const kept = words().get(name)
  if (kept !== undefined) return Promise.resolve(kept)
  const path = join(assetsDir(), name)
  if (!existsSync(path)) return Promise.resolve(null)
  return new Promise((done) => {
    execFile(helper, ['--text', path], { timeout: 60_000, maxBuffer: 8 * 1024 * 1024 }, (error, out) => {
      let text: string | null = null
      try {
        const said = JSON.parse(String(out).trim().split('\n').pop() ?? '') as { text?: string; sure?: number[] }
        if (!error && typeof said.text === 'string') {
          const lines = said.text.split('\n').map((line, n) => ({ text: line, confidence: said.sure?.[n] }))
          // A painting's windows read as letters are no words: none kept, so search, "Copy text from image" and "Make it a note" see none.
          text = hasWords(lines, isArt(name)) ? said.text : ''
        }
      } catch {
        // Not read: asked again next time.
      }
      if (text !== null) {
        words().set(name, text)
        db().prepare('insert or replace into picture_words (name, text, read_at) values (?, ?, ?)').run(name, text, new Date().toISOString())
      }
      done(text)
    })
  })
}

/** A word or a line in a picture, its box a share of the picture as it is seen, from the top left. */
type Box = { text: string; x: number; y: number; w: number; h: number }
export type PictureLine = Box & { words: Box[]; confidence?: number }
export type PictureLines = { lines: PictureLine[]; kept: boolean }

/**
 * The words in a picture with where each lies, for selecting them in place
 * in the picture viewer (native/labels.swift --lines): read once per picture
 * (its name is its hash) and kept in the database (`kept` when it came from
 * there), no lines when it holds none, null when it could not be read (asked
 * again next time). One reading at a time per picture, in the helper's own
 * process, so nothing here waits on it.
 */
const inFlight = new Map<string, Promise<PictureLines | null>>()
/** The lines to offer for selecting: none in a picture whose letters are only shapes (picture-lines.ts `hasWords`). */
const judged = (name: string, lines: PictureLine[]): PictureLine[] => (hasWords(lines, isArt(name)) ? lines : [])
let linesMade = false
export function readLines(name: string): Promise<PictureLines | null> {
  if (!PICTURE.test(name) || process.platform !== 'darwin') return Promise.resolve(null)
  if (!linesMade) database().exec('create table if not exists picture_lines (name text primary key, lines text not null, read_at text not null)')
  linesMade = true
  const kept = database().prepare('select lines from picture_lines where name = ?').get(name) as { lines: string } | undefined
  const stored = kept ? (JSON.parse(kept.lines) as PictureLine[]) : null
  // Read before Vision's confidence was kept: read again, once, to tell its words from shapes.
  if (stored && (!stored.length || stored.every((line) => line.confidence !== undefined))) return Promise.resolve({ lines: judged(name, stored), kept: true })
  const path = join(assetsDir(), name)
  if (!existsSync(path)) return Promise.resolve(null)
  const asked = inFlight.get(name)
  if (asked) return asked
  const read = new Promise<PictureLines | null>((done) => {
    execFile(helper, ['--lines', path], { timeout: 60_000, maxBuffer: 32 * 1024 * 1024 }, (error, out) => {
      let lines: PictureLine[] | null = null
      try {
        const said = JSON.parse(String(out).trim().split('\n').pop() ?? '') as { lines?: PictureLine[] }
        if (!error && Array.isArray(said.lines)) lines = said.lines
      } catch {
        // Not read: asked again next time.
      }
      inFlight.delete(name)
      if (!lines) return done(null)
      database().prepare('insert or replace into picture_lines (name, lines, read_at) values (?, ?, ?)').run(name, JSON.stringify(lines), new Date().toISOString())
      // Search's words for it too, the same reading judged the same way (one read before kept a painting's shapes as words).
      const offered = judged(name, lines)
      const text = offered.map((line) => line.text).join('\n')
      words().set(name, text)
      db().prepare('insert or replace into picture_words (name, text, read_at) values (?, ?, ?)').run(name, text, new Date().toISOString())
      done({ lines: offered, kept: false })
    })
  })
  inFlight.set(name, read)
  return read
}

/** A page's parts, top to bottom, as native/labels.swift --doc says them. */
export type PageBlock = { heading: string } | { paragraph: string } | { list: string[]; ordered: boolean } | { table: string[][] }
/**
 * A photo of a page read whole (macOS 26, Vision's RecognizeDocumentsRequest): its title, paragraphs, lists and
 * tables. Null where the Mac cannot (older than macOS 26) or the page could not be read, and the caller makes the
 * note of its plain lines instead (--text). Under test HALIGTREE_QA_CAPS stands in for the Mac's version.
 */
export async function readPage(name: string): Promise<PageBlock[] | null> {
  if (!PICTURE.test(name) || process.platform !== 'darwin' || !meets(await caps(), 'macos26')) return null
  const path = join(assetsDir(), name)
  if (!existsSync(path)) return null
  return new Promise((done) =>
    execFile(helper, ['--doc', path], { timeout: 60_000, maxBuffer: 16 * 1024 * 1024 }, (error, out) => {
      try {
        const said = JSON.parse(String(out).trim().split('\n').pop() ?? '') as { blocks?: PageBlock[] }
        done(!error && Array.isArray(said.blocks) ? said.blocks : null)
      } catch {
        done(null)
      }
    }))
}

// Pictures waiting to be read, oldest asked first; one at a time.
const queue = new Set<string>()
let reading = false
let told: (() => void) | null = null

async function work(): Promise<void> {
  if (reading) return
  reading = true
  let found = 0
  while (queue.size) {
    const [name] = queue
    queue.delete(name)
    if ((await readPicture(name))?.trim()) found++
  }
  reading = false
  // New words: search reads the notes again, and every open list hears of it.
  if (found) told?.()
}

/** A picture's words for search, a line each marked as the picture's, if read; asked for in the background if not. */
export function wordsOfPicture(src: unknown): string {
  const name = pictureNamed(src)
  if (!name) return ''
  const kept = words().get(name)
  if (kept !== undefined) return pictureLines(kept)
  readSoon([name])
  return ''
}

/** Pictures search met with no words yet (here, or on the reading thread, reader.ts): each read in the background, once. */
export function readSoon(names: string[]): void {
  if (process.platform !== 'darwin') return
  const fresh = names.filter((name) => PICTURE.test(name) && !words().has(name) && !queue.has(name))
  for (const name of fresh) queue.add(name)
  if (fresh.length) setImmediate(() => void work())
}

/** The book's pictures as main reads them (picture-lines.ts). */
export const pictures: Pictures = { wordsOf: wordsOfPicture, known: () => words() }

/** `forget` empties search's memory of each note's words, so the new picture words are read in. */
export function registerPictureWords(forget: () => void): void {
  told = () => {
    forget()
    for (const window of BrowserWindow.getAllWindows()) window.webContents.send('captures:changed', null)
  }
  // "Copy text from image" and every other reading of one picture: the same words search has.
  ipcMain.handle('image-text', (_event, src: unknown) => {
    const name = typeof src === 'string' ? STORED.exec(src)?.[1] : undefined
    return name ? readPicture(name) : null
  })
  // "Make it a note" on a Mac that can read a page whole: its headings, lists and tables.
  ipcMain.handle('image-page', (_event, src: unknown) => {
    const name = typeof src === 'string' ? STORED.exec(src)?.[1] : undefined
    return name ? readPage(name) : null
  })
  // Its words where they lie, to select in the picture viewer.
  ipcMain.handle('image-lines', (_event, src: unknown) => {
    const name = typeof src === 'string' ? STORED.exec(src)?.[1] : undefined
    return name ? readLines(name) : null
  })
}
