import { app, ipcMain, systemPreferences } from 'electron'
import { LABEL, database } from './captures'
import { dayName } from './dates'

/**
 * Media: every picture, GIF, PDF and recording kept in the book's notes, found
 * where the notes hold them (a capture, a gem, a page, a Journal day), with
 * the note each lives in and the words around it, so a search can find it.
 * Only files in the book's own store count: a picture linked from the web is
 * not kept here, and could not be shown in Finder or copied.
 */

export type MediaKind = 'picture' | 'gif' | 'pdf' | 'audio'
export type Media = {
  /** The stored file, as the note points at it. */
  src: string
  kind: MediaKind
  /** The name a file came in under; a picture has none of its own. */
  name: string
  /** A file's size in bytes, as its card says it; 0 for a picture. */
  size: number
  /** The note it lives in. */
  type: string
  id: string
  title: string
  /** Its note is private: blurred until pointed at, as in every list. */
  private: boolean
  /** The words just before and after it, and its caption. */
  near: string
  /** When the note was made, for the order: newest first. */
  at: string
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
function mediaIn(body: string | null): Omit<Media, 'type' | 'id' | 'title' | 'private' | 'at'>[] {
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
  const found: Omit<Media, 'type' | 'id' | 'title' | 'private' | 'at'>[] = []
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

/** Each note's media, worked out again only when its body changes: a big book is read once, then only what moved. */
const read = new Map<string, { body: string; found: Omit<Media, 'type' | 'id' | 'title' | 'private' | 'at'>[] }>()

export function registerMedia(): void {
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
  ipcMain.handle('haligtree:media:list', () => {
    const db = database()
    // Only bodies that point into the store are read at all.
    const HOLDS = "body like '%://assets/%'"
    const rows = [
      ...db.prepare(`select 'capture' as type, id, ${LABEL} as title, body, private, captured_at as at from captures where status != 'discarded' and ${HOLDS}`).all(),
      ...db.prepare(`select tier as type, id, coalesce(nullif(title, ''), label('', body)) as title, body, private, created_at as at from nuggets where binned_at is null and superseded_by is null and tier != 'card' and ${HOLDS}`).all(),
      ...db.prepare(`select 'day' as type, day as id, day as title, body, 0 as private, day as at from day_pages where ${HOLDS}`).all()
    ] as { type: string; id: string; title: string; body: string; private: number; at: string }[]
    const all: Media[] = []
    const live = new Set<string>()
    for (const row of rows) {
      const key = `${row.type}:${row.id}`
      live.add(key)
      let kept = read.get(key)
      if (kept?.body !== row.body) read.set(key, (kept = { body: row.body, found: mediaIn(row.body) }))
      for (const one of kept.found) all.push({ ...one, type: row.type, id: row.id, title: row.type === 'day' ? dayName(row.id) : row.title, private: !!row.private, at: row.at })
    }
    for (const key of read.keys()) if (!live.has(key)) read.delete(key)
    return all.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0))
  })
}
