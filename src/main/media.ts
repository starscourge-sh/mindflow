import { app, BrowserWindow, dialog, ipcMain, nativeImage, shell, systemPreferences } from 'electron'
import { LABEL, changed, database, whenAnyChanged } from './captures'
import { dayName } from './dates'
import { copyFile, mkdir, open, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { createReadStream, existsSync, statSync } from 'node:fs'
import { createHash, randomUUID } from 'node:crypto'
import { basename, join } from 'node:path'
import type { DatabaseSync } from 'node:sqlite'
import { assetsDir, lookAhead } from './pictures'
import { IN_PICTURE, wordsOfPicture } from './picture-words'
import { AUDIO_ENDS, PICTURE_ENDS, TURNED, sniff, whyNot, type AddResult, type MediaKind, type Taken } from './media-words'

/**
 * Media: every picture, GIF, PDF and recording kept in the book's notes, found
 * where the notes hold them (a capture, a gem, a page, a Journal day), with
 * the note each lives in and the words around it, so a search can find it.
 * Only files in the book's own store count: a picture linked from the web is
 * not kept here, and could not be shown in Finder or copied.
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

/** What Media was given with no note: the file is in the store; this says it belongs to the book. */
const ADDED = 'create table if not exists media_added (src text primary key, name text not null, size integer not null, added_at text not null, binned_at text)'
type AddedRow = { src: string; name: string; size: number; at: string }
const addedRows = (db: DatabaseSync): AddedRow[] => {
  db.exec(ADDED)
  return db.prepare('select src, name, size, added_at as at from media_added where binned_at is null').all() as AddedRow[]
}

const END_OF = /\.([a-z0-9]+)$/
/** What a stored file is by its ending alone, as an added file is known. */
export const kindByEnd = (src: string): MediaKind | null => {
  const end = END_OF.exec(src)?.[1] ?? ''
  return end === 'gif' ? 'gif' : end === 'pdf' ? 'pdf' : AUDIO_ENDS.includes(end) ? 'audio' : PICTURE_ENDS.includes(end) ? 'picture' : null
}

/** The PDFs added with no note, as search and the shelf take them. */
export const addedPdfs = (db: DatabaseSync): AddedRow[] => addedRows(db).filter((one) => kindByEnd(one.src) === 'pdf')

/**
 * Pictures and recordings added with no note, as search lists them: found by
 * name and, for a picture, by the words the Mac read in it, as any note's are.
 * (An added PDF is found as every PDF is: pdf-highlights.ts.)
 */
export function mediaToFind(db: DatabaseSync): { type: 'media'; id: string; number: null; kind: string; status: string; source: string; attribution: string | null; label: string; capturedAt: string; text: string; raw: string }[] {
  return addedRows(db).filter((one) => kindByEnd(one.src) !== 'pdf').map((one) => {
    const label = one.name.replace(/\.[^.]+$/, '') || one.name
    const raw = `${label}${wordsOfPicture(one.src)}`
    return { type: 'media', id: `${one.src}|${one.name}`, number: null, kind: kindByEnd(one.src) ?? 'picture', status: 'open', source: '', attribution: null, label, capturedAt: one.at, text: `${raw} ${one.name}`.toLowerCase(), raw }
  })
}

type Doc = { type?: string; text?: string; attrs?: Record<string, unknown>; content?: Doc[] }

const STORED = /^(haligtree|mindflow):\/\/assets\/[a-f0-9]{64}\.[a-z0-9]+$/
const AUDIO = /\.(mp3|m4a|weba|wav|ogg|aac|flac)$/i

/** What a stored file is, by its ending; null for one Media does not show (a video, a document). */
export function kindOf(node: 'image' | 'attachment', src: string, name: string): MediaKind | null {
  if (!STORED.test(src)) return null
  if (node === 'image') return /\.gif$/i.test(src) ? 'gif' : 'picture'
  if (/\.pdf$/i.test(name) || /\.pdf$/i.test(src)) return 'pdf'
  if (AUDIO.test(name) || AUDIO.test(src)) return 'audio'
  return null
}

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
  type Part = { words: string } | { node: 'image' | 'attachment'; src: string; name: string; size: number; caption: string }
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
        if (words) parts.push({ words })
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
    found.push({ src: part.src, kind, name: part.name, size: part.size, near: [part.caption, before && cut(before.words, 200), after && cut(after.words, 200)].filter(Boolean).join(' · ') })
  })
  return found
}

type Found = Pick<Media, 'src' | 'kind' | 'name' | 'size' | 'near'>

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
  ipcMain.handle('haligtree:mic:ask', async () => {
    // Chromium's stand-in microphone (a probe's) is no device of the Mac's: nothing to ask.
    if (process.platform !== 'darwin' || app.commandLine.hasSwitch('use-fake-device-for-media-stream')) return true
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
    return true
  })
  // The Mac's own page for it, from any "No microphone" message (ui.tsx, refuseMic).
  ipcMain.handle('haligtree:mic:privacy', () => void shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone'))
  ipcMain.handle('haligtree:media:list', () => allMedia())
  ipcMain.handle('haligtree:media:pick', async (event) => {
    const owner = BrowserWindow.fromWebContents(event.sender)
    const options: Electron.OpenDialogOptions = {
      title: 'Add to Files',
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'Pictures, GIFs, PDFs and audio', extensions: [...PICTURE_ENDS, 'pdf', ...AUDIO_ENDS] }]
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
  ipcMain.handle('haligtree:media:kept', () => allMedia().filter((one) => one.how === 'library').map((one) => one.src))
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
  const db = database()
  // Only bodies that point into the store are read at all.
  const HOLDS = "body like '%://assets/%'"
  const rows = [
    ...db.prepare(`select 'capture' as type, id, ${LABEL} as title, body, private, captured_at as at from captures where status != 'discarded' and ${HOLDS}`).all(),
    ...db.prepare(`select tier as type, id, coalesce(nullif(title, ''), label('', body)) as title, body, private, created_at as at from nuggets where binned_at is null and superseded_by is null and tier not in ('card', 'deck') and ${HOLDS}`).all(),
    // A shared deck's pictures sit on its questions: read from the question and the answer together, and marked as the deck's.
    ...db.prepare(`select 'nugget' as type, id, coalesce(nullif(title, ''), label('', body)) as title, json_quote(coalesce(prompt, '') || char(10) || coalesce(json_extract(body, '$'), '')) as body, private, created_at as at, 1 as deck from nuggets where binned_at is null and tier = 'deck' and (prompt like '%://assets/%' or ${HOLDS})`).all(),
    ...db.prepare(`select 'day' as type, day as id, day as title, body, 0 as private, day as at from day_pages where ${HOLDS}`).all()
  ] as { type: string; id: string; title: string; body: string; private: number; at: string; deck?: number }[]
  const tiles = new Map<string, Media>()
  const live = new Set<string>()
  // Newest note first, so a file's tile speaks for the newest note holding it.
  for (const row of rows.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0))) {
    const key = `${row.type}:${row.id}`
    live.add(key)
    let kept = read.get(key)
    if (kept?.body !== row.body) read.set(key, (kept = { body: row.body, found: mediaIn(row.body) }))
    const title = row.type === 'day' ? dayName(row.id) : row.title
    for (const one of kept.found) {
      const tile = `${row.deck ? 'deck:' : ''}${one.src}`
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
  for (const one of all) one.gone = !existsSync(join(store, one.src.slice(one.src.lastIndexOf('/') + 1)))
  return all.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0))
}

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
    const name = path ? basename(path) : typeof item?.name === 'string' && item.name ? item.name : 'That file'
    const refuse = (why: string): void => void out.refused.push({ name, why })
    try {
      if (typeof item?.why === 'string') { refuse(item.why); continue }
      const size0 = path ? await stat(path) : null
      if (size0?.isDirectory()) { refuse('a folder, so pick the files in it'); continue }
      let bytes = !path && item?.bytes instanceof Uint8Array ? item.bytes : null
      if (!path && !bytes) { refuse('it could not be read. Drag it in from Finder instead'); continue }
      // HEIC and TIFF come from the Mac's own apps and no window can draw them: the Mac turns them into a PNG once.
      if (TURNED.test(name)) {
        const picture = path ? nativeImage.createFromPath(path) : nativeImage.createFromBuffer(Buffer.from(bytes!))
        if (picture.isEmpty()) { refuse(whyNot(name)); continue }
        bytes = picture.toPNG()
      }
      if ((bytes ? bytes.byteLength : size0!.size) === 0) { refuse('empty'); continue }
      const looked = sniff(bytes ? bytes.subarray(0, 1024) : await headOf(path), TURNED.test(name) ? 'turned.png' : name)
      if (!looked) { refuse(whyNot(name)); continue }
      const hash = bytes ? createHash('sha256').update(bytes).digest('hex') : await hashFile(path)
      const file = `${hash}.${looked.end}`
      const src = `haligtree://assets/${file}`
      const destination = join(store, file)
      // Beside it and renamed in, so a half-written file is never read. Already whole in the store: left alone.
      if (!existsSync(destination)) {
        const temporary = `${destination}.${randomUUID()}.tmp`
        await (bytes ? writeFile(temporary, bytes) : copyFile(path, temporary)).catch(async (error) => {
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
    }
  }
  if (out.added.length || out.revived.length) changed()
  return out
}
