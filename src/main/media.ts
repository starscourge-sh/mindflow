import { app, BrowserWindow, dialog, ipcMain, shell, systemPreferences } from 'electron'
import { LABEL, bookStamp, changed, database, whenAnyChanged } from './captures'
import { dayName } from './dates'
import { copyFile, mkdir, open, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { constants, createReadStream, existsSync, readFileSync, statSync } from 'node:fs'
import { createHash, randomUUID } from 'node:crypto'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { basename, extname, join } from 'node:path'
import type { DatabaseSync } from 'node:sqlite'
import { assetsDir, lookAhead } from './pictures'
import { wordsOfPicture } from './picture-words'
import { IN_PICTURE } from './picture-lines'
import { MEDIA_ADDED as ADDED, addedRows, kindByEnd } from './find-files'
import { TURNED, sniff, type AddResult, type MediaKind, type Taken } from './media-words'

/**
 * Media: every picture, GIF, PDF, recording, video and document kept in the book's notes, found
 * where the notes hold them (a capture, a gem, a page, a Journal day), with
 * the note each lives in and the words around it, so a search can find it.
 * Only files in the book's own store count: a picture linked from the web is
 * not kept here, and could not be copied.
 *
 * A file can also be added here with no note at all: it goes in the same store
 * as any note's, named by its bytes, and `media_added` remembers that it was
 * added, under what name and when. A note that later holds it is a use of the
 * one file; nothing is copied. Each file is one tile, however many notes hold it.
 */

export type { MediaKind } from './media-words'
/** A note that holds a file. */
export type MediaUse = { type: string; id: string; title: string; private: boolean }
export type Media = {
  /** The stored file, as the note points at it. */
  src: string
  kind: MediaKind
  /** The name a file came in under; a picture has none of its own. */
  name: string
  /** A file's size in bytes, as its card says it; 0 for a picture. */
  size: number
  /** The newest note it lives in; '' when no note holds it. */
  type: string
  id: string
  title: string
  /** Its note is private: blurred until pointed at, as in every list. */
  private: boolean
  /** The words just before and after it, and its caption. */
  near: string
  /** When the note was made, for the order: newest first. */
  at: string
  /** It belongs to a shared deck: shown under Media's "Deck pictures" chip, not in the grid. */
  deck?: boolean
  /** Every note that holds it, newest first; none when it was added to Media and is used nowhere yet. */
  uses: MediaUse[]
  /** It was added to Media, so it stays here whatever happens to the notes. */
  added: boolean
  /** Its file is no longer in the book's store. */
  gone: boolean
  /**
   * How it came: 'library' when added on purpose (Files, Finder, "Keep in Files", and every file a book held before
   * this was kept), 'attachment' when pasted or dropped straight into a note. A library file outlives its notes; an
   * attachment no note holds any more waits under Files' "Unlinked" until it is moved to the Bin. Nothing is deleted by itself.
   */
  how: 'library' | 'attachment'
  /** When the last note let it go; only for one no note holds. */
  letGoAt?: string
  /** A recording's length in seconds, once its waveform has been worked out (kept beside it as `.peaks`); a video's once a player has read it. */
  seconds?: number
  /** When it was last opened as itself (looked at, read, played), from any window. */
  openedAt?: string
  /** A video: where it was left, in seconds, and when (Files' "Carry on watching"). */
  played?: number
  playedAt?: string
}

/**
 * How each file in a note came, and when the last note let it go. A file is written here the first time a note is
 * seen holding it: as 'attachment' (pasted or dropped in), except the very first time this table is made, when every
 * file the book already holds is written as 'library', so nothing a person already has is ever offered for clean-up.
 */
const HOW = "create table if not exists media_how (src text primary key, how text not null, name text not null default '', size integer not null default 0, kind text not null default '', seen_at text not null, let_go_at text)"
type HowRow = { src: string; how: 'library' | 'attachment'; name: string; size: number; kind: string; let_go_at: string | null }

/** Written down: files seen in notes for the first time, and the ones the last note just let go. */
function settle(db: DatabaseSync, held: Map<string, Media>): Map<string, HowRow> {
  const fresh = !db.prepare("select 1 from sqlite_master where type = 'table' and name = 'media_how'").get()
  db.exec(HOW)
  // When this record began: a file already in the store by then (held by a note in the Bin, say, and brought back
  // later) came before it, and is a library file too, never an attachment to clean up.
  db.exec('create table if not exists media_how_since (at real not null)')
  if (fresh) db.prepare('insert into media_how_since (at) values (?)').run(Date.now())
  const since = Number((db.prepare('select min(at) as at from media_how_since').get() as { at: number | null } | undefined)?.at ?? 0)
  const store = assetsDir()
  const before = (src: string): boolean => {
    const at = statSync(join(store, src.slice(src.lastIndexOf('/') + 1)), { throwIfNoEntry: false })?.birthtimeMs
    return !!since && at !== undefined && at < since
  }
  const rows = new Map((db.prepare('select src, how, name, size, kind, let_go_at from media_how').all() as HowRow[]).map((one) => [one.src, one]))
  const now = new Date().toISOString()
  const writes: (() => void)[] = []
  for (const tile of held.values()) {
    if (tile.deck) continue
    const was = rows.get(tile.src)
    if (!was) {
      const row: HowRow = { src: tile.src, how: fresh || tile.kind === 'pdf' || before(tile.src) ? 'library' : 'attachment', name: tile.name, size: tile.size, kind: tile.kind, let_go_at: null }
      rows.set(tile.src, row)
      writes.push(() => void db.prepare('insert or ignore into media_how (src, how, name, size, kind, seen_at) values (?, ?, ?, ?, ?, ?)').run(row.src, row.how, row.name, row.size, row.kind, now))
    } else if (was.let_go_at || (!was.name && tile.name)) {
      was.let_go_at = null
      was.name ||= tile.name
      writes.push(() => void db.prepare("update media_how set let_go_at = null, name = case when name = '' then ? else name end, size = case when size = 0 then ? else size end where src = ?").run(tile.name, tile.size, tile.src))
    }
  }
  for (const row of rows.values()) {
    if (row.let_go_at || held.has(row.src)) continue
    row.let_go_at = now
    writes.push(() => void db.prepare('update media_how set let_go_at = ? where src = ? and let_go_at is null').run(now, row.src))
  }
  if (writes.length) {
    db.exec('begin')
    try {
      writes.forEach((write) => write())
      db.exec('commit')
    } catch (error) {
      db.exec('rollback')
      throw error
    }
  }
  return rows
}

/** A file made a library file ("Keep in Files", or added through Files), or back to an attachment. */
export function keepInFiles(src: string, on: boolean): void {
  const db = database()
  db.exec(HOW)
  db.exec(ADDED)
  db.prepare("insert into media_how (src, how, seen_at) values (?, ?, ?) on conflict(src) do update set how = excluded.how").run(src, on ? 'library' : 'attachment', new Date().toISOString())
  // Added through Files and now let go of: the name it came under is kept, and it is an attachment like any other.
  if (!on) {
    const added = db.prepare('select name, size from media_added where src = ? and binned_at is null').get(src) as { name: string; size: number } | undefined
    if (added) {
      db.prepare("update media_how set name = case when name = '' then ? else name end, size = case when size = 0 then ? else size end where src = ?").run(added.name, added.size, src)
      db.prepare('delete from media_added where src = ? and binned_at is null').run(src)
    }
  }
}

type Doc = { type?: string; text?: string; attrs?: Record<string, unknown>; content?: Doc[] }

const STORED = /^(haligtree|mindflow):\/\/assets\/[a-f0-9]{64}\.[a-z0-9]+$/
const AUDIO = /\.(mp3|m4a|weba|wav|ogg|aac|flac)$/i

/** What a stored file is, by its ending; null for one outside the book's store (a picture linked from the web). */
export function kindOf(node: 'image' | 'attachment', src: string, name: string): MediaKind | null {
  if (!STORED.test(src)) return null
  if (node === 'image') return /\.gif$/i.test(src) ? 'gif' : 'picture'
  if (/\.pdf$/i.test(name) || /\.pdf$/i.test(src)) return 'pdf'
  if (AUDIO.test(name) || AUDIO.test(src)) return 'audio'
  // As the note's own block decides it (attachment-view.tsx): a video plays, anything else is a file's card.
  if (VIDEO.test(name)) return 'video'
  return 'document'
}
const VIDEO = /\.(mp4|m4v|mov|webm)$/i

/** A line's words, plainly: a link reads as its name. */
const wordsOf = (node: Doc): string =>
  node.type === 'noteLink' ? String(node.attrs?.label ?? '') : node.text ?? (node.content ?? []).map(wordsOf).join('')

const cut = (text: string, room: number): string => (text.length > room ? text.slice(0, room) : text)

/** The media in one stored body, each with the words around it. */
function mediaIn(body: string | null): Found[] {
  if (!body) return []
  let doc: unknown
  try {
    doc = JSON.parse(body)
  } catch {
    return []
  }
  type Part = { words: string; timed?: boolean } | { node: 'image' | 'attachment'; src: string; name: string; size: number; caption: string }
  const parts: Part[] = []
  if (typeof doc === 'string') {
    // Words kept as Markdown (an import never opened): a picture is ![..](src), a file [name](src).
    for (const line of doc.split('\n')) {
      // A link back into a PDF (a gem's "Book, p. 12", with its #page) points at a place in the book, not at the file: never a card of its own.
      const found = [...line.matchAll(/(!?)\[([^\]]*)\]\(((?:haligtree|mindflow):\/\/assets\/[a-f0-9]{64}\.[a-z0-9]+)([^)]*)\)/g)].filter((one) => !one[4].startsWith('#'))
      if (!found.length) {
        if (line.trim()) parts.push({ words: line.trim() })
        continue
      }
      for (const [, bang, label, src] of found) parts.push({ node: bang ? 'image' : 'attachment', src, name: bang ? '' : label, size: 0, caption: bang ? label : '' })
    }
  } else if (doc && typeof doc === 'object') {
    const walk = (node: Doc): void => {
      if (node.type === 'image' || node.type === 'attachment') {
        const attrs = node.attrs ?? {}
        parts.push({ node: node.type, src: String(attrs.src ?? ''), name: String(attrs.name ?? ''), size: Number(attrs.size) || 0, caption: [attrs.caption, attrs.alt, attrs.title].filter((one) => typeof one === 'string' && one).join(' ') })
        return
      }
      if (node.type === 'paragraph' || node.type === 'heading' || node.type === 'codeBlock') {
        const words = wordsOf(node).trim()
        if (words) parts.push({ words, timed: TIMED.test(words) })
        return
      }
      node.content?.forEach(walk)
    }
    walk(doc as Doc)
  }
  const found: Found[] = []
  const seen = new Set<string>()
  parts.forEach((part, at) => {
    if ('words' in part) return
    const kind = kindOf(part.node, part.src, part.name)
    if (!kind || seen.has(part.src)) return
    seen.add(part.src)
    const before = parts.slice(0, at).reverse().find((one) => 'words' in one) as { words: string } | undefined
    const after = parts.slice(at + 1).find((one) => 'words' in one) as { words: string } | undefined
    // A recording's transcript: the lines under it that start with a time ("[0:12] …"), as transcribe.ts writes them.
    const said: string[] = []
    if (kind === 'audio') for (let next = at + 1; next < parts.length; next++) {
      const line = parts[next]
      if (!('words' in line) || !line.timed) break
      said.push(line.words)
    }
    found.push({ src: part.src, kind, name: part.name, size: part.size, near: [part.caption, before && cut(before.words, 200), after && cut(after.words, 200)].filter(Boolean).join(' · '), ...(said.length ? { said: said.join('\n') } : {}) })
  })
  return found
}

type Found = Pick<Media, 'src' | 'kind' | 'name' | 'size' | 'near'> & { /** A recording's transcript, for Files' search only: never sent with the list. */ said?: string }
/** A transcript's line, as transcribe.ts writes it: a time first. */
const TIMED = /^\[(?:\d{1,2}:)?\d{1,2}:[0-5]\d\]/

/**
 * Files' search index: each file's words in lower case (its name, its note, the words around it, the words the
 * Mac read in a picture, a recording's transcript), built as the list is, so a search is one pass over it in
 * memory, never a reading of any picture.
 */
let findIndex = new Map<string, string>()
/** Each recording's length, read once from its `.peaks` (the store names files by their bytes, so it never goes stale). */
const lengths = new Map<string, number | null>()
const lengthOf = (src: string): number | null => {
  if (lengths.has(src)) return lengths.get(src)!
  let seconds: number | null = null
  try {
    seconds = Number((JSON.parse(readFileSync(join(assetsDir(), `${src.slice(src.lastIndexOf('/') + 1)}.peaks`), 'utf8')) as { seconds?: unknown }).seconds) || null
  } catch {
    // Not worked out yet: the player works it out the first time it is shown, and says so here.
  }
  lengths.set(src, seconds)
  return seconds
}
const sizes = new Map<string, number>()
const sizeOfStored = (src: string): number => {
  let size = sizes.get(src)
  if (size === undefined) sizes.set(src, (size = statSync(join(assetsDir(), src.slice(src.lastIndexOf('/') + 1)), { throwIfNoEntry: false })?.size ?? 0))
  return size
}
/** The Mac's icon for each ending, as a data URL, asked for once. */
const icons = new Map<string, string>()
/** When each file was last opened as itself. */
const OPENED = 'create table if not exists media_opened (src text primary key, at text not null)'
/** Each video's length once read, and where it was left and when ('' until it is first played). */
const PLACES = "create table if not exists media_place (src text primary key, seconds real not null, at real not null default 0, played_at text not null default '')"

/** Each note's media, worked out again only when its body changes: a big book is read once, then only what moved. */
const read = new Map<string, { body: string; found: Found[] }>()

export function registerMedia(): void {
  // A note saved: once the saving settles, what it took in or let go of is written down, so a picture pasted and
  // deleted before Files is next opened still waits under Unlinked, with the moment it went.
  let settling: NodeJS.Timeout | null = null
  whenAnyChanged(() => {
    if (settling) clearTimeout(settling)
    settling = setTimeout(() => { settling = null; try { allMedia() } catch { /* the book is closing */ } }, 1200)
    settling.unref?.()
  })
  // Before a voice note: macOS asks once, with the sentence in electron-builder.yml, and remembers.
  // True when the microphone may be used; elsewhere than a Mac, Chromium asks for itself.
  // Whether it may, without asking (the welcome's Permissions step shows it live). A probe's stand-in microphone
  // reads as not asked until mic:ask is called, then as allowed.
  let standInAsked = false
  ipcMain.handle('haligtree:mic:status', () => {
    if (process.platform !== 'darwin' || app.commandLine.hasSwitch('use-fake-device-for-media-stream')) return standInAsked ? 'granted' : 'unasked'
    const now = systemPreferences.getMediaAccessStatus('microphone')
    return now === 'granted' ? 'granted' : now === 'not-determined' ? 'unasked' : 'denied'
  })
  ipcMain.handle('haligtree:mic:ask', async () => {
    // Chromium's stand-in microphone (a probe's) is no device of the Mac's: nothing to ask.
    if (process.platform !== 'darwin' || app.commandLine.hasSwitch('use-fake-device-for-media-stream')) return (standInAsked = true)
    const now = systemPreferences.getMediaAccessStatus('microphone')
    if (now === 'granted') return true
    if (now === 'denied' || now === 'restricted') return false
    return systemPreferences.askForMediaAccess('microphone')
  })
  // A recording's waveform (lib/waveform.ts), worked out once from its sound and kept beside the file as
  // `<file>.peaks`: the store names each file by the hash of its bytes, so what is kept never goes stale.
  const peaksFile = (src: unknown): string | null => {
    const found = /^(?:haligtree|mindflow):\/\/assets\/([a-f0-9]{64}\.[a-z0-9]+)$/.exec(String(src ?? ''))
    return found && AUDIO.test(found[1]) ? join(assetsDir(), `${found[1]}.peaks`) : null
  }
  ipcMain.handle('haligtree:media:peaks', async (_event, src: unknown) => {
    const file = peaksFile(src)
    return file ? readFile(file, 'utf8').then((text) => JSON.parse(text), () => null) : null
  })
  ipcMain.handle('haligtree:media:keep-peaks', async (_event, src: unknown, kept: unknown) => {
    const file = peaksFile(src)
    const { peaks, seconds } = (kept ?? {}) as { peaks?: unknown; seconds?: unknown }
    if (!file || !Array.isArray(peaks) || peaks.length > 4096 || !peaks.every((one) => Number.isInteger(one) && one >= 0 && one <= 255) || !(Number(seconds) > 0)) return false
    // Written beside and renamed in, so a half-written one is never read.
    const temporary = `${file}.${process.pid}.tmp`
    await writeFile(temporary, JSON.stringify({ peaks, seconds: Number(seconds) }))
    await rename(temporary, file)
    lengths.set(String(src), Number(seconds))
    return true
  })
  // The Mac's own page for it, from any "No microphone" message (ui.tsx, refuseMic).
  ipcMain.handle('haligtree:mic:privacy', () => void shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone'))
  ipcMain.handle('haligtree:media:list', () => allMedia())
  // A document's face when Quick Look draws none: the Mac's own icon for its kind (Finder's), once per ending.
  ipcMain.handle('haligtree:media:icon', async (_event, src: unknown) => {
    const found = /^(?:haligtree|mindflow):\/\/assets\/([a-f0-9]{64}\.([a-z0-9]+))$/.exec(String(src ?? ''))
    if (!found) return ''
    let made = icons.get(found[2])
    if (made === undefined) {
      const icon = await app.getFileIcon(join(assetsDir(), found[1]), { size: 'normal' }).catch(() => null)
      made = icon && !icon.isEmpty() ? icon.toDataURL({ scaleFactor: 2 }) : ''
      icons.set(found[2], made)
    }
    return made
  })
  // A Markdown or text file's own words, for Files' preview to set as text (file-look.tsx): its first 200,000
  // letters, and whether there was more. Only those kinds, from the app's own store.
  ipcMain.handle('haligtree:media:text', async (_event, src: unknown) => {
    const found = /^(?:haligtree|mindflow):\/\/assets\/([a-f0-9]{64}\.(md|markdown|txt|text))$/.exec(String(src ?? ''))
    if (!found) return null
    const text = await readFile(join(assetsDir(), found[1]), 'utf8').catch(() => null)
    return text === null ? null : { text: text.slice(0, 200_000), more: text.length > 200_000 }
  })
  // Files' search: every file whose words hold every word asked for, from the index the list keeps.
  ipcMain.handle('haligtree:media:find', (_event, query: unknown) => {
    const words = String(query ?? '').toLowerCase().split(/\s+/).filter(Boolean).slice(0, 16)
    if (!words.length) return []
    if (!findIndex.size) allMedia()
    const out: string[] = []
    for (const [key, text] of findIndex) if (words.every((word) => text.includes(word))) out.push(key)
    return out
  })
  // A file opened as itself (a picture looked at, a book read, a recording played), for Files' "Last opened".
  ipcMain.handle('haligtree:media:opened', (_event, src: unknown) => {
    if (typeof src !== 'string' || !STORED.test(src)) return false
    const db = database()
    db.exec(OPENED)
    db.prepare('insert into media_opened (src, at) values (?, ?) on conflict(src) do update set at = excluded.at').run(src, new Date().toISOString())
    return true
  })
  // A video's length as a player or a tile read it, and, once played, where it stopped (`at`; none when only its length is told).
  ipcMain.handle('haligtree:media:place', (_event, src: unknown, seconds: unknown, at: unknown) => {
    const length = Number(seconds)
    if (typeof src !== 'string' || !STORED.test(src) || !(length > 0) || !Number.isFinite(length)) return false
    const db = database()
    db.exec(PLACES)
    if (at === undefined || at === null) db.prepare('insert into media_place (src, seconds) values (?, ?) on conflict(src) do update set seconds = excluded.seconds').run(src, length)
    else db.prepare('insert into media_place (src, seconds, at, played_at) values (?, ?, ?, ?) on conflict(src) do update set seconds = excluded.seconds, at = excluded.at, played_at = excluded.played_at')
      .run(src, length, Math.min(length, Math.max(0, Number(at) || 0)), new Date().toISOString())
    return true
  })
  ipcMain.handle('haligtree:media:pick', async (event) => {
    const owner = BrowserWindow.fromWebContents(event.sender)
    const options: Electron.OpenDialogOptions = {
      title: 'Add to Files',
      properties: ['openFile', 'multiSelections'],
      // Any file at all: a picture, a video, a Word or Pages file, a spreadsheet, a ZIP.
    }
    const { filePaths } = await (owner ? dialog.showOpenDialog(owner, options) : dialog.showOpenDialog(options))
    return Promise.all(filePaths.map(async (path) => ({ path, size: (await stat(path).catch(() => null))?.size ?? 0 })))
  })
  ipcMain.handle('haligtree:media:add', (_event, items: unknown) => addMedia(Array.isArray(items) ? items : []))
  // "Undo" on a batch: what was new is let go (the file stays in the store until Settings clears unused ones), what came out of the Bin goes back.
  ipcMain.handle('haligtree:media:add:undo', (_event, kept: { added?: string[]; revived?: string[] }) => {
    const db = database()
    for (const src of kept?.added ?? []) db.prepare('delete from media_added where src = ?').run(String(src))
    for (const src of kept?.revived ?? []) db.prepare('update media_added set binned_at = ? where src = ?').run(new Date().toISOString(), String(src))
    changed()
    return true
  })
  // To the Bin, only what no note holds: a note keeps its picture, so a file a note uses stays where it is, and is said back.
  ipcMain.handle('haligtree:media:bin', (_event, srcs: unknown) => {
    const db = database()
    const tiles = new Map(allMedia().filter((one) => !one.deck).map((one) => [one.src, one]))
    const binned: string[] = [], stayed: { src: string; name: string; notes: number }[] = []
    const now = new Date().toISOString()
    for (const src of Array.isArray(srcs) ? srcs.map(String) : []) {
      const one = tiles.get(src)
      if (!one) continue
      if (one.uses.length) stayed.push({ src, name: one.name || one.title, notes: one.uses.length })
      else (toBin(db, one, now), binned.push(src))
    }
    if (binned.length) changed()
    return { binned, stayed }
  })
  // "Keep in Files", from a note's picture or file and from Files: on, it is a library file and outlives its notes.
  ipcMain.handle('haligtree:media:keep', (_event, src: unknown, on: unknown) => (keepInFiles(String(src), !!on), changed(), true))
  ipcMain.handle('haligtree:media:kept', () => keptFiles())
  // "Move all to the Bin" on Unlinked: every attachment no note holds, and only those; Undo puts them back under Unlinked.
  ipcMain.handle('haligtree:media:bin-unlinked', () => {
    const db = database()
    const now = new Date().toISOString()
    const binned = allMedia().filter((one) => !one.deck && one.how === 'attachment' && !one.uses.length).map((one) => (toBin(db, one, now), one.src))
    if (binned.length) changed()
    return binned
  })
  // "Remove and move to the Bin" from a note, asked once the note's words are saved: to the Bin only when no note holds it now.
  ipcMain.handle('haligtree:media:bin-let-go', (_event, src: unknown) => {
    const one = allMedia().find((each) => !each.deck && each.src === String(src))
    if (!one || one.uses.length) return { binned: false, others: one?.uses.length ?? 0 }
    toBin(database(), one, new Date().toISOString())
    changed()
    return { binned: true, others: 0 }
  })
  ipcMain.handle('haligtree:media:unbin', (_event, srcs: unknown) => {
    for (const src of Array.isArray(srcs) ? srcs.map(String) : []) mediaFromBin(src)
    changed()
    return true
  })
}

/**
 * To the Bin: an added file is marked so; one never added (an attachment, or a file a note let go of) is written in
 * the Bin's list with the same moment as its "added", which says, when it comes back, to go back where it was.
 */
const toBin = (db: DatabaseSync, one: Media, now: string): void => {
  const was = db.prepare('select 1 from media_added where src = ?').get(one.src)
  // One pasted a moment ago and not yet written down is an attachment, so it comes back from the Bin as one.
  if (!was) db.prepare('insert or ignore into media_how (src, how, name, size, kind, seen_at, let_go_at) values (?, ?, ?, ?, ?, ?, ?)').run(one.src, 'attachment', one.name, one.size, one.kind, now, now)
  if (was)db.prepare('update media_added set binned_at = ? where src = ?').run(now, one.src)
  else db.prepare('insert into media_added (src, name, size, added_at, binned_at) values (?, ?, ?, ?, ?)').run(one.src, one.name || basename(one.src), one.size, now, now)
}
/** Out of the Bin, back where it was: an added file to Files, a let-go one to Unlinked (or "In no note"). */
export const mediaFromBin = (src: string): void => {
  const db = database()
  db.exec(HOW)
  const row = db.prepare('select added_at as at, binned_at as binned from media_added where src = ?').get(src) as { at: string; binned: string | null } | undefined
  if (row?.binned && row.at === row.binned && db.prepare('select 1 from media_how where src = ?').get(src)) db.prepare('delete from media_added where src = ?').run(src)
  else db.prepare('update media_added set binned_at = null where src = ?').run(src)
}
/** Let go for good: the file itself is cleared with the rest of the unused ones (unused.ts), as a deleted note's are. */
export const mediaForget = (src?: string): number => {
  const db = database()
  db.exec(ADDED)
  db.exec(HOW)
  // Gone for good from the Bin: what said how it came goes too, or it would come back under Unlinked.
  if (src) db.prepare('delete from media_how where src = ? and src in (select src from media_added where binned_at is not null)').run(src)
  else db.prepare('delete from media_how where src in (select src from media_added where binned_at is not null)').run()
  return Number((src ? db.prepare('delete from media_added where src = ? and binned_at is not null').run(src) : db.prepare('delete from media_added where binned_at is not null').run()).changes)
}
/**
 * What the Bin lists of Media. A file binned and then dropped into a note is
 * in use again: it comes out by itself, rather than being in both places.
 */
export function mediaInBin(): { type: string; id: string; title: string; kind: string; at: string; line: null }[] {
  const db = database()
  db.exec(ADDED)
  const rows = db.prepare('select src, name, binned_at as at from media_added where binned_at is not null').all() as { src: string; name: string; at: string }[]
  if (!rows.length) return []
  const used = new Set(allMedia().filter((one) => one.uses.length).map((one) => one.src))
  return rows.filter((one) => {
    if (used.has(one.src)) mediaFromBin(one.src)
    return !used.has(one.src)
  }).map((one) => ({ type: 'media', id: one.src, title: one.name, kind: kindByEnd(one.src) ?? 'file', at: one.at, line: null }))
}
/** One in the Bin as its preview shows it: the block it would be in a note. */
export function mediaPeek(src: string): { type: string; id: string; title: string; kind: string; body: unknown; private: boolean; madeAt: string; binnedAt: string | null; attribution: null; tags: string[] } | null {
  const db = database()
  db.exec(ADDED)
  const one = db.prepare('select name, size, added_at as at, binned_at as binned from media_added where src = ?').get(src) as { name: string; size: number; at: string; binned: string | null } | undefined
  if (!one) return null
  const kind = kindByEnd(src)
  const block = kind === 'picture' || kind === 'gif' ? { type: 'image', attrs: { src, alt: one.name } } : { type: 'attachment', attrs: { src, name: one.name, size: one.size } }
  return { type: 'media', id: src, title: one.name, kind: kind ?? 'file', body: { type: 'doc', content: [block] }, private: false, madeAt: one.at, binnedAt: one.binned, attribution: null, tags: [] }
}

/** Every file in the book, one tile each: what notes hold, then what was added with no note, newest first. */
function allMedia(): Media[] {
  // Nothing written since the last read: the same answer (Files, the Calendar and Home each ask as they open; a big book's read is 400 ms of main).
  if (media?.at === bookStamp()) return [...media.all]
  const db = database()
  // Only bodies that point into the store are read at all.
  const HOLDS = "body like '%://assets/%'"
  const rows = [
    ...db.prepare(`select 'capture' as type, id, ${LABEL} as title, body, private, captured_at as at from captures where status != 'discarded' and ${HOLDS}`).all(),
    ...db.prepare(`select tier as type, id, coalesce(nullif(nullif(trim(title), 'Untitled'), ''), label('', body)) as title, body, private, created_at as at from nuggets where binned_at is null and superseded_by is null and tier not in ('card', 'deck') and ${HOLDS}`).all(),
    // A shared deck's pictures sit on its questions: read from the question and the answer together, and marked as the deck's.
    ...db.prepare(`select 'nugget' as type, id, coalesce(nullif(nullif(trim(title), 'Untitled'), ''), label('', body)) as title, json_quote(coalesce(prompt, '') || char(10) || coalesce(json_extract(body, '$'), '')) as body, private, created_at as at, 1 as deck from nuggets where binned_at is null and tier = 'deck' and (prompt like '%://assets/%' or ${HOLDS})`).all(),
    ...db.prepare(`select 'day' as type, day as id, day as title, body, 0 as private, day as at from day_pages where ${HOLDS}`).all()
  ] as { type: string; id: string; title: string; body: string; private: number; at: string; deck?: number }[]
  const tiles = new Map<string, Media>()
  const live = new Set<string>()
  const transcripts = new Map<string, string>()
  // Newest note first, so a file's tile speaks for the newest note holding it.
  for (const row of rows.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0))) {
    const key = `${row.type}:${row.id}`
    live.add(key)
    let kept = read.get(key)
    if (kept?.body !== row.body) read.set(key, (kept = { body: row.body, found: mediaIn(row.body) }))
    const title = row.type === 'day' ? dayName(row.id) : row.title
    for (const { said, ...one } of kept.found) {
      const tile = `${row.deck ? 'deck:' : ''}${one.src}`
      if (said) transcripts.set(tile, transcripts.has(tile) ? `${transcripts.get(tile)}\n${said}` : said)
      const use = { type: row.type, id: row.id, title, private: !!row.private }
      const was = tiles.get(tile)
      if (was) {
        was.uses.push(use)
        was.private ||= use.private
        was.name ||= one.name
        was.size ||= one.size
        if (one.near) was.near = `${was.near} · ${one.near}`
      } else tiles.set(tile, { ...one, type: row.type, id: row.id, title, private: !!row.private, at: row.at, ...(row.deck ? { deck: true } : {}), uses: [use], added: false, gone: false, how: 'attachment' })
    }
  }
  for (const key of read.keys()) if (!live.has(key)) read.delete(key)
  const hows = settle(db, tiles)
  for (const row of addedRows(db)) {
    const was = tiles.get(row.src)
    const kind = kindByEnd(row.src)
    if (was) {
      was.added = true
      was.name = row.name
      was.size = row.size
      if (row.at > was.at) was.at = row.at
    } else if (kind) {
      // A picture's own words, read by the Mac as any kept picture's are, so Media's search finds it by them.
      const words = wordsOfPicture(row.src).split(IN_PICTURE).join('').trim()
      tiles.set(row.src, { src: row.src, kind, name: row.name, size: row.size, type: '', id: '', title: '', private: false, near: words, at: row.at, uses: [], added: true, gone: false, how: 'library' })
    }
  }
  // What notes let go of and nobody added or binned: an attachment under Unlinked, a library file under "In no note".
  const anyAdded = new Set((db.prepare('select src from media_added').all() as { src: string }[]).map((one) => one.src))
  for (const row of hows.values()) {
    const kind = (row.kind || kindByEnd(row.src)) as MediaKind | null
    if (tiles.has(row.src) || anyAdded.has(row.src) || !kind || !row.let_go_at) continue
    const words = kind === 'picture' || kind === 'gif' ? wordsOfPicture(row.src).split(IN_PICTURE).join('').trim() : ''
    tiles.set(row.src, { src: row.src, kind, name: row.name, size: row.size, type: '', id: '', title: '', private: false, near: words, at: row.let_go_at, uses: [], added: false, gone: false, how: row.how, letGoAt: row.let_go_at })
  }
  for (const one of tiles.values()) {
    if (one.deck) continue
    const how = hows.get(one.src)?.how
    one.how = one.added || how === 'library' ? 'library' : 'attachment'
  }
  const store = assetsDir()
  const all = [...tiles.values()]
  db.exec(OPENED)
  const opened = new Map((db.prepare('select src, at from media_opened').all() as { src: string; at: string }[]).map((one) => [one.src, one.at]))
  db.exec(PLACES)
  const places = new Map((db.prepare('select src, seconds, at, played_at from media_place').all() as { src: string; seconds: number; at: number; played_at: string }[]).map((one) => [one.src, one]))
  const index = new Map<string, string>()
  for (const one of all) {
    one.gone = !existsSync(join(store, one.src.slice(one.src.lastIndexOf('/') + 1)))
    const at = opened.get(one.src)
    if (at) one.openedAt = at
    const place = one.kind === 'video' ? places.get(one.src) : undefined
    if (place) {
      one.seconds = place.seconds
      if (place.played_at) (one.played = place.at, (one.playedAt = place.played_at))
    }
    // A picture in a note has no size of its own: its file's, read once (the store names files by their bytes, so it holds).
    if (!one.size && !one.gone) one.size = sizeOfStored(one.src)
    if (one.kind === 'audio' && !one.gone) {
      const seconds = lengthOf(one.src)
      if (seconds) one.seconds = seconds
    }
    const key = `${one.deck ? 'deck:' : ''}${one.src}`
    // A picture's words as the Mac read them (none read yet: asked for in the background, as search asks).
    const seen = !one.deck && (one.kind === 'picture' || one.kind === 'gif') ? wordsOfPicture(one.src).split(IN_PICTURE).join('') : ''
    index.set(key, `${one.title} ${one.name} ${one.near} ${one.uses.map((use) => use.title).join(' ')} ${seen} ${transcripts.get(key) ?? ''}`.toLowerCase())
  }
  findIndex = index
  // Said with the book's stamp after this read's own writes: until something is written again, the answer stands.
  library = { at: bookStamp(), srcs: all.filter((one) => one.how === 'library').map((one) => one.src) }
  media = { at: library.at, all: all.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0)) }
  return [...media.all]
}
/** The last answer of allMedia, with the book's stamp it holds for. */
let media: { at: number; all: Media[] } | null = null

/**
 * The library's files (added on purpose or kept in Files), as every window asks for them: on each right-click, and
 * after a file is added, kept or binned. Read again only once the book was written to since: reading means every note body that
 * holds a file (about 100 ms of this thread on a big book), and three windows asking after one write, or a window
 * come back to, asked it again for an answer that could not have changed.
 */
let library: { at: number; srcs: string[] } | null = null
const keptFiles = (): string[] => (library && library.at === bookStamp() ? library.srcs : (allMedia(), library!.srcs))

const HASHED = /assets\/([a-f0-9]{64})\./
const hashOf = (src: string): string => HASHED.exec(src)?.[1] ?? ''

/** A file's bytes as their hash, read a piece at a time: a 500 MB book never sits in memory. */
const hashFile = (path: string): Promise<string> => new Promise((done, fail) => {
  const hash = createHash('sha256')
  createReadStream(path).on('data', (piece) => hash.update(piece)).on('error', fail).on('end', () => done(hash.digest('hex')))
})

/** The start of a file, enough to tell what it is. */
async function headOf(path: string): Promise<Uint8Array> {
  const file = await open(path, 'r')
  try {
    const head = Buffer.alloc(1024)
    const { bytesRead } = await file.read(head, 0, 1024, 0)
    return head.subarray(0, bytesRead)
  } finally {
    await file.close()
  }
}

/**
 * A picture as a PNG, made by the Mac's own `sips` in a process of its own (the way scenery.ts turns a WebP), never
 * on main's thread: the PNG's path, to be removed once used, or null when the Mac cannot read it. A HEIC or TIFF added
 * here (nativeImage, asked before, read neither, so each was kept as an unreadable file with no picture), and a picture
 * copied with "Copy image" (index.ts): qa/main-holds.mjs.
 */
export async function turnedCopy(path: string, bytes: Uint8Array | null, name: string): Promise<string | null> {
  if (process.platform !== 'darwin') return null
  const out = join(app.getPath('temp'), `haligtree-turned-${randomUUID()}`)
  const given = path || `${out}${extname(name)}`
  try {
    if (!path) await writeFile(given, bytes!)
    await promisify(execFile)('sips', ['-s', 'format', 'png', given, '--out', `${out}.png`], { timeout: 60_000 })
    return (await stat(`${out}.png`)).size ? `${out}.png` : null
  } catch {
    await rm(`${out}.png`, { force: true })
    return null
  } finally {
    if (!path) await rm(given, { force: true })
  }
}

export type MediaItem = { path?: unknown; name?: unknown; bytes?: unknown; why?: unknown }

/**
 * Files into Media, as they are: no note, nothing asked. By a path where there
 * is one (a drop from Finder, the picker, Finder's right-click) and by its
 * bytes where a file has none (a drag from another app). The same bytes already
 * here are met, not doubled, under whatever name and ending they came.
 */
export async function addMedia(items: MediaItem[]): Promise<AddResult> {
  const db = database()
  db.exec(ADDED)
  const out: AddResult = { added: [], revived: [], met: [], refused: [] }
  // Whatever is in Media by now, by hash: every note's and every added file's.
  const here = new Set(allMedia().filter((one) => !one.deck).map((one) => hashOf(one.src)))
  const binned = new Map((db.prepare('select src, name from media_added where binned_at is not null').all() as { src: string; name: string }[]).map((one) => [hashOf(one.src), one]))
  const store = assetsDir()
  await mkdir(store, { recursive: true })
  for (const item of items) {
    const path = typeof item?.path === 'string' && item.path ? item.path : ''
    const name = typeof item?.name === 'string' && item.name ? item.name : path ? basename(path) : 'That file'
    const refuse = (why: string): void => void out.refused.push({ name, why })
    let turned: string | null = null
    try {
      if (typeof item?.why === 'string') { refuse(item.why); continue }
      let size0 = path ? await stat(path) : null
      if (size0?.isDirectory()) { refuse('a folder, so pick the files in it'); continue }
      let bytes = !path && item?.bytes instanceof Uint8Array ? item.bytes : null
      if (!path && !bytes) { refuse('it could not be read. Drag it in from Finder instead'); continue }
      // HEIC and TIFF come from the Mac's own apps and no window can draw them: the Mac turns them into a PNG once, in
      // a program of its own (`sips`), as scenery.ts turns a WebP, never on this thread, which answers every window.
      // One the Mac cannot read either is kept as it came, as a plain file.
      turned = TURNED.test(name) ? await turnedCopy(path, bytes, name) : null
      const from = turned ?? path
      if (turned) [bytes, size0] = [null, await stat(turned)]
      if ((bytes ? bytes.byteLength : size0!.size) === 0) { refuse('empty'); continue }
      const looked = sniff(bytes ? bytes.subarray(0, 1024) : await headOf(from), turned ? 'turned.png' : name)
      const hash = bytes ? createHash('sha256').update(bytes).digest('hex') : await hashFile(from)
      const file = `${hash}.${looked.end}`
      const src = `haligtree://assets/${file}`
      const destination = join(store, file)
      // Beside it and renamed in, so a half-written file is never read. Already whole in the store: left alone.
      if (!existsSync(destination)) {
        const temporary = `${destination}.${randomUUID()}.tmp`
        await (bytes ? writeFile(temporary, bytes) : copyFile(from, temporary, constants.COPYFILE_FICLONE)).catch(async (error) => {
          await rm(temporary, { force: true })
          throw error
        })
        await rename(temporary, destination)
      }
      if (looked.kind === 'picture' || looked.kind === 'gif') lookAhead(file)
      const size = bytes ? bytes.byteLength : size0!.size
      const taken: Taken = { src, name, size, kind: looked.kind }
      const was = binned.get(hash)
      if (here.has(hash)) out.met.push(taken)
      else if (was) {
        mediaFromBin(was.src)
        out.revived.push({ ...taken, src: was.src, name: was.name })
      } else {
        db.prepare('insert or replace into media_added (src, name, size, added_at, binned_at) values (?, ?, ?, ?, null)').run(src, name, size, new Date().toISOString())
        out.added.push(taken)
      }
      here.add(hash)
      // Added on purpose: whichever way it came before, it is a library file now.
      db.exec(HOW)
      db.prepare("update media_how set how = 'library' where src like ?").run(`%/${hash}.%`)
    } catch (error) {
      refuse(error instanceof Error && 'code' in error && error.code === 'ENOENT' ? 'gone from where it was' : 'it could not be read')
    } finally {
      if (turned) await rm(turned, { force: true })
    }
  }
  if (out.added.length || out.revived.length) changed()
  return out
}
