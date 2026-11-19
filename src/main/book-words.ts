import type { DatabaseSync } from 'node:sqlite'
import { transcriptLines, type MeetingLine } from './meeting-doc'
import { emojiReady } from './lazy/emoji'
import { firstLine } from './import'
import { cut } from './clip'
import { startOf } from './kept-words'
import { tagLine } from './tags-off-name'

/**
 * How a book's notes are read out of its database: the two SQL functions
 * every list and search is written with (`label`, a note's name; `words`, what
 * search reads of it) and the columns a list shows. No Electron in it: main
 * puts the functions on its connection (captures.ts), and the reading thread
 * (reader.ts) on its own read-only one, so both read a note the same way.
 */

/** Text matched literally by `like … escape '\\'`: its own % and _ escaped. */
export const like = (text: string): string => text.replace(/[\\%_]/g, '\\$&')

/**
 * The name a capture is shown by: the first line of what it says, worked out
 * on reading so an edit never leaves a stale name behind. The stored title is
 * only the fallback, for an import or a bookmark whose body is plain text.
 */
// `named` is 1 for a note that came with a name of its own (a vault note is
// called by its file name): that name wins over whatever its first line says.
export const LABEL = 'label(title, body, named)'
// A capture taken out of the Inbox into a question (as its first clue) or as a clue in one is
// "promoted" too: `keptIn` says which, with the question's name, so the row can say where it went.
export const KEPT_IN = `case when status = 'promoted' then coalesce(
  (select 'question:' || q.title from nuggets q where q.capture_id = captures.id and q.tier = 'question' limit 1),
  (select 'writing:' || a.title from nuggets a where a.capture_id = captures.id and a.tier = 'article' limit 1),
  (select 'clue:' || n.title from glosses g join nuggets n on n.id = g.item_id where g.source_id = captures.id and n.tier = 'question' limit 1)
) end`
/** A word or question to look up: asked until its answer (the Word's definition) is written, answered after.
 *  A word saved as a gem is answered too: it cannot be saved without its meaning ("Term: meaning", or lines under it). */
const LOOKUP = `case when kind = 'word' then case when status = 'promoted' or (json_valid(fields) and trim(coalesce(json_extract(fields, '$.definition'), '')) != '') then 'answered' else 'asked' end end`
export const LIST = `id, number, title, ${LABEL} as label, kind, status, source, private, pinned_at as pinnedAt, remind_at as remindAt, captured_at as capturedAt, edited_at as editedAt, attribution, medium, exited_at as closedAt, device, elapsed_ms as elapsedMs, weather, window_title as windowTitle, page_url as pageUrl, archived_at as archivedAt, imported_at as importedAt, snoozed_until as snoozedUntil, (select folder from put_away where put_away.id = captures.id and captures.archived_at is not null) as folder, ${KEPT_IN} as keptIn, fields, ${LOOKUP} as lookup, tag_line(body) as tagLine`

/**
 * `label` and `words`, put on a connection. `pictureWords` gives a picture's
 * own words (picture-lines.ts). What comes back empties the memory of every
 * note's words, for when a picture's words were read since.
 */
export function bookFunctions(db: DatabaseSync, pictureWords: (src: unknown) => string): () => void {
  // Worked out once per wording and remembered: every list asks for every
  // name, and reading each body again on every change made a big inbox slow.
  // Capped, since a name is a line in a list, not the whole of a long one.
  // A long note is remembered by its start and its length, not its whole
  // wording: keyed by every word, each autosave of a 1 MB note kept another
  // megabyte. Its name is a first line, so the start decides it, and a name
  // found further in than that is worked out each time instead.
  const names = new Map<string, string>()
  let kept = 0
  const HEAD = 8192
  // The tags on a note's last line, where a name's tags go (tags-off-name.ts): shown on its row beside the name's.
  db.function('tag_line', (body) => tagLine(typeof body === 'string' ? body : ''))
  db.function('label', { varargs: true }, (title, body, named) => {
    if (named && title) return String(title)
    const raw = String(body ?? '')
    const long = raw.length > HEAD
    const key = long ? `${title}\u0000${raw.length}\u0000${raw.slice(0, HEAD)}` : `${title}\u0000${raw}`
    let name = names.get(key)
    if (name === undefined) {
      try {
        // A long note's first line is looked for in its first blocks alone: each save of one changes its length,
        // so its name was worked out again every time by reading all of it (16 ms of main's thread for 4 MB).
        const line = (long && firstLine(startOf(raw, HEAD), true)) || firstLine(JSON.parse(raw || 'null'))
        // A bare address with a name of its own (an imported bookmark) goes by the name.
        const bare = !!title && /^https?:\/\/\S+$/.test(line)
        // With no words at all, named for what it holds rather than "Untitled".
        name = (bare ? '' : line) || String(title ?? '') ||
          (/"type":"image"/.test(raw) ? 'Picture' : /"type":"excalidraw"/.test(raw) ? 'Drawing' : /"type":"graph"/.test(raw) ? 'Graph' : /"type":"attachment"/.test(raw) ? 'File' : /"type":"codeBlock"/.test(raw) ? 'Code' : '')
      } catch {
        name = String(title ?? '')
      }
      name = cut(name, 300)
      const near = (at: number): boolean => at >= 0 && at < HEAD / 2
      if (long && !(name && near(raw.indexOf(JSON.stringify(name.split(/\s/)[0].slice(0, 12)).slice(1, -1))))) return name
      if (names.size > 20000 || kept > 8_000_000) (names.clear(), (kept = 0))
      // Read before the emoji table has loaded (lazy/emoji.ts), its emoji is missing: worked out again next time.
      if (!emojiReady() && raw.includes('"type":"emoji"')) return name
      names.set(key, name)
      kept += key.length
    }
    return name
  })
  // What search reads of a note: its words, and the addresses and names its
  // links and cards hold; never the editor's own JSON ("paragraph", "type",
  // "content"), which every note has. Remembered per note until it changes.
  const read = new Map<string, { body: string; words: string }>()
  const SAID = ['href', 'url', 'title', 'description', 'label', 'latex', 'alt', 'caption', 'language']
  type Part = { type?: string; text?: string; attrs?: Record<string, unknown>; marks?: Part[]; content?: Part[] }
  const wordsIn = (node: Part): string => node.type === 'meeting'
    // A meeting's lines are its own data: found by what was said, a line each, never its stored JSON.
    ? transcriptLines((node.attrs?.lines ?? []) as MeetingLine[], (node.attrs?.names ?? {}) as Record<string, string>).join('\n')
    : [
    node.text,
    // A picture's own words, read by the Mac (picture-words.ts): a screenshot or a notebook page is found by what it says.
    node.type === 'image' ? pictureWords(node.attrs?.src) : '',
    ...[node, ...(node.marks ?? [])].flatMap((one) => SAID.map((key) => one.attrs?.[key]).filter((value) => typeof value === 'string')),
    (node.content ?? []).map(wordsIn).join(node.type === 'paragraph' || node.type === 'heading' ? '' : '\n')
  ].filter(Boolean).join(' ')
  db.function('words', (id, body) => {
    const raw = String(body ?? '')
    const was = read.get(String(id))
    if (was?.body === raw) return was.words
    let words: string
    try {
      const doc = JSON.parse(raw || 'null') as unknown
      words = typeof doc === 'string' ? doc : doc && typeof doc === 'object' ? wordsIn(doc as Part) : ''
    } catch {
      words = raw
    }
    read.set(String(id), { body: raw, words })
    return words
  })
  return () => read.clear()
}
