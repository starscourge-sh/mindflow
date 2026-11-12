import { foldMeeting } from './meeting-doc.ts'
import { tagged } from './kinds.ts'
import { lineCardsIn, wordsIn } from './study.ts'
import { tagsIn } from './tag-words.ts'

/**
 * A note's words as they are kept: the document written out as JSON. An editor hands a save over already in that
 * shape, as bytes (UTF-8, what the database keeps), with the words it was made from the same way; any other save
 * hands over a document, written out here. So a keystroke's save of a long note (4 MB) is never rebuilt as objects on
 * main's one thread, never made into text there, and goes to the database without being read letter by letter: that
 * was most of the 120 to 150 ms such a save held the app. Pure, so main, the reading thread and the tests share it.
 */
export type Kept = Uint8Array | string

/** What a save may say of its words: an editor's bytes (`words`, `wordsBase`), or a document (`body`, `base`). */
export type SavedWords = { body?: unknown; base?: unknown; words?: Uint8Array; wordsBase?: Uint8Array }

const utf8 = new TextDecoder()
const bytesOf = (kept: Uint8Array): Buffer => Buffer.from(kept.buffer, kept.byteOffset, kept.byteLength)

/** Kept words as text. */
export const textOf = (kept: Kept): string => (typeof kept === 'string' ? kept : utf8.decode(kept))

/** Stored words read back: a document, or the text itself when it is not one. */
export function readKept(stored: string | null | undefined): unknown {
  try {
    return JSON.parse(stored ?? 'null')
  } catch {
    return stored
  }
}

/**
 * The words a save carries and the words it was made from, each as kept; null for one it does not carry.
 * A meeting in the shape it had before 6 Nov (an old version put back, a copy) is kept the new way, every word in
 * it: an editor's bytes are read back into a document only when they hold such a line.
 */
export function wordsOf(patch: SavedWords, /** A capture's words; a gem's or a page's are kept as they come. */ meetings = true): { kept: Kept | null; base: Kept | null } {
  const fold = <T>(doc: T): T => (meetings ? foldMeeting(doc) : doc)
  const old = meetings && patch.words && bytesOf(patch.words).includes('"type":"meetingLine"')
  const kept = patch.words && !old ? patch.words : patch.words ? JSON.stringify(fold(JSON.parse(utf8.decode(patch.words)))) : patch.body === undefined ? null : JSON.stringify(fold(patch.body))
  const base = patch.wordsBase ?? (patch.base === undefined ? null : JSON.stringify(patch.base ?? null))
  return { kept, base }
}

/**
 * Whether the words stored are still the `base` a save was made from. Main asks the database first, which compares
 * them where they lie; this is the slow, exact look for when it says no: letter for letter, then as parsed JSON, so
 * words kept with other spacing (an import, a file edited by hand) are still the same words.
 */
export function stillBase(stored: string | null | undefined, base: Kept): boolean {
  const based = textOf(base)
  return (stored ?? 'null') === based || JSON.stringify(readKept(stored) ?? null) === based
}

/**
 * `tagged` (kinds.ts) asked of kept words. Bytes are made into text only when `#tag` may be among them: each "#"
 * is looked at where it stands, so a long note without the tag is passed over in well under a millisecond.
 */
export function keptTagged(kept: Kept, tag: string): boolean {
  if (typeof kept === 'string') return tagged(kept, tag)
  const bytes = bytesOf(kept)
  // A letter that /i also takes in another spelling (k, s), or one outside ASCII: the whole text is read.
  let may = !/^[a-jl-rt-z0-9_-]+$/i.test(tag)
  for (let at = bytes.indexOf(35); !may && at >= 0; at = bytes.indexOf(35, at + 1)) may = bytes.toString('latin1', at + 1, at + 1 + tag.length).toLowerCase() === tag.toLowerCase()
  return may && tagged(utf8.decode(kept), tag)
}

/**
 * The whole blocks at the start of a document's kept text, as a document: read out of its first `within` letters
 * alone, so a long note is named by its first line without all of it being read (book-words.ts `label`). Null
 * when they hold no whole block: not a document as the editor writes one, or a first block longer than that.
 */
export function startOf(raw: string, within: number): unknown {
  const open = '{"type":"doc","content":['
  if (!raw.startsWith(open)) return null
  let depth = 0
  let quoted = false
  let end = -1
  for (let at = open.length, to = Math.min(raw.length, within); at < to && depth >= 0; at++) {
    const letter = raw.charCodeAt(at)
    // Inside a string only its own end counts, and a backslash takes the letter after it.
    if (quoted) {
      if (letter === 92) at++
      else if (letter === 34) quoted = false
    } else if (letter === 34) quoted = true
    else if (letter === 123 || letter === 91) depth++
    else if ((letter === 125 || letter === 93) && --depth === 0) end = at + 1
  }
  if (end < 0) return null
  try {
    return JSON.parse(`${raw.slice(0, end)}]}`)
  } catch {
    return null
  }
}

/**
 * A note's "question :: answer" lines and the #tags that go on their cards (line-cards.ts keeps them as review
 * cards), read out of its words: a document, or plain words and Markdown. The whole document is walked.
 */
export function linesIn(body: unknown): { lines: { question: string; answer: string }[]; tags: string } {
  // Text that is itself a document is read as that document.
  const read = typeof body === 'string' && body.trim().startsWith('{') ? readKept(body) : body
  const lines = lineCardsIn(read)
  return { lines, tags: lines.length ? tagsIn(wordsIn(read)).map((tag) => `#${tag}`).join(' ') : '' }
}

/** The same of words as stored: what the reading thread is asked after an editor's save. */
export const linesOf = (stored: string | null | undefined): ReturnType<typeof linesIn> => linesIn(readKept(stored))
