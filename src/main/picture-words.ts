import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { BrowserWindow, ipcMain } from 'electron'
import helper from '../../resources/labels?asset&asarUnpack'
import { database } from './captures'
import { assetsDir } from './pictures'

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

const PICTURE = /^[a-f0-9]{64}\.(png|jpe?g|webp|gif|heic|tiff?|bmp)$/i
const STORED = /^(?:haligtree|mindflow):\/\/assets\/([a-f0-9]{64}\.[a-z0-9]+)$/i

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
        const said = JSON.parse(String(out).trim().split('\n').pop() ?? '') as { text?: string }
        if (!error && typeof said.text === 'string') text = said.text
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
export type PictureLine = Box & { words: Box[] }
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
let linesMade = false
export function readLines(name: string): Promise<PictureLines | null> {
  if (!PICTURE.test(name) || process.platform !== 'darwin') return Promise.resolve(null)
  if (!linesMade) database().exec('create table if not exists picture_lines (name text primary key, lines text not null, read_at text not null)')
  linesMade = true
  const kept = database().prepare('select lines from picture_lines where name = ?').get(name) as { lines: string } | undefined
  if (kept) return Promise.resolve({ lines: JSON.parse(kept.lines) as PictureLine[], kept: true })
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
      if (lines) {
        database().prepare('insert or replace into picture_lines (name, lines, read_at) values (?, ?, ?)').run(name, JSON.stringify(lines), new Date().toISOString())
        // Search's words for it too, if it had none yet: the same reading, not a second one.
        if (!words().has(name)) {
          const text = lines.map((line) => line.text).join('\n')
          words().set(name, text)
          db().prepare('insert or replace into picture_words (name, text, read_at) values (?, ?, ?)').run(name, text, new Date().toISOString())
        }
      }
      done(lines && { lines, kept: false })
    })
  })
  inFlight.set(name, read)
  return read
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

/** Marks a line of search's words as one read in a picture (captures.ts says so in a result, with the picture). */
export const IN_PICTURE = '\u001e'

/** The stored picture whose words hold this line, for a search result to show. */
export function pictureHolding(line: string): string | undefined {
  const plain = line.replace(/^…/, '').replace(/…$/, '').trim().toLowerCase()
  for (const [name, text] of words()) if (text.toLowerCase().includes(plain)) return `haligtree://assets/${name}`
  return undefined
}

/** A picture's words for search, a line each marked as the picture's, if read; asked for in the background if not. */
export function wordsOfPicture(src: unknown): string {
  if (typeof src !== 'string') return ''
  const name = STORED.exec(src)?.[1]
  if (!name || !PICTURE.test(name)) return ''
  const kept = words().get(name)
  if (kept !== undefined) return kept.trim() ? `\n${kept.split('\n').map((line) => IN_PICTURE + line).join('\n')}\n` : ''
  if (process.platform === 'darwin' && !queue.has(name)) {
    queue.add(name)
    setImmediate(() => void work())
  }
  return ''
}

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
  // Its words where they lie, to select in the picture viewer.
  ipcMain.handle('image-lines', (_event, src: unknown) => {
    const name = typeof src === 'string' ? STORED.exec(src)?.[1] : undefined
    return name ? readLines(name) : null
  })
}
