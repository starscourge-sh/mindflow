import { ipcMain } from 'electron'
import { changed, database, whenChanged } from './captures'
import { ask, left } from './reader'
import { languageName, ownLanguage, understand } from './understand'

/**
 * What a note is quietly offered, from your own book, on this Mac: another
 * note it names (a link), one it nearly repeats, the folder it reads like,
 * and the people it names. Also the notes for a question or an event.
 *
 * The reading is book-offers.ts, run on the reading thread (reader.ts):
 * indexing the book and matching every name against a long note took main's
 * thread for up to a third of a second at a time, and every window with it.
 * Here are only the asks, and the count of the book's changes they carry.
 */

export type { NoteOffers } from './book-offers'

/** How many times the book has changed since launch: an index made at an earlier count is out of date. */
let changes = 1

export function registerOffers(): void {
  // Anything saved: the index is made again the next time it is asked.
  whenChanged(() => void changes++)
  // `asker` names the one note view asking: of its asks, one not yet begun gives way to a newer one, and once it
  // says it has left (the note closed, or another opened in its place) nothing more is read for it.
  const slot = (sender: Electron.WebContents, asker: unknown): string | undefined => (typeof asker === 'string' ? `offers:${sender.id}:${asker}` : undefined)
  ipcMain.handle('haligtree:offers:note', (event, key: unknown, text: unknown, linked: unknown, asker: unknown) =>
    ask('offers:note', [changes, String(key ?? ''), String(text ?? ''), Array.isArray(linked) ? linked.map(String) : []], slot(event.sender, asker)))
  // Words in another language than yours, where one of your tags reads aloud in it (a deck of that language): that
  // tag, to offer. Only when the Mac is sure (0.8 or more) of the language, of four words or more, and the note does
  // not carry the tag already; decks first, then any tag that speaks it. Null otherwise.
  ipcMain.handle('haligtree:offers:language', async (_event, text: unknown): Promise<{ tag: string; language: string } | null> => {
    const words = String(text ?? '').trim()
    if (words.split(/\s+/).length < 4) return null
    const speaking = database().prepare('select tag, speak from tag_meta where speak is not null order by deck desc, tag').all() as { tag: string; speak: string }[]
    if (!speaking.length) return null
    const said = await understand('language', { text: words.slice(0, 2000) })
    const lang = String(said.lang ?? 'und').split('-')[0].toLowerCase()
    if (Number(said.confidence ?? 0) < 0.8 || lang === 'und' || lang === ownLanguage()) return null
    const has = new Set([...words.toLowerCase().matchAll(/#([\p{L}\p{N}_/-]+)/gu)].map((one) => one[1]))
    const fit = speaking.find((one) => one.speak.split('-')[0].toLowerCase() === lang && !has.has(one.tag.toLowerCase()))
    return fit ? { tag: fit.tag, language: languageName(lang) } : null
  })
  ipcMain.handle('haligtree:offers:left', (event, asker: unknown) => { const gone = slot(event.sender, asker); if (gone) left(gone) })
  // Made once the app has settled, so the first offer never waits for the whole book to be read.
  setTimeout(() => void ask('offers:warm', [changes]).catch(() => undefined), 20_000)
  ipcMain.handle('haligtree:offers:about', (_event, text: unknown, leave: unknown) => ask('offers:about', [changes, String(text ?? ''), typeof leave === 'string' ? leave : undefined]))
  // "Which folder?" taken: the note filed, last in it; the Undo puts it back loose.
  ipcMain.handle('haligtree:offers:file', (_event, id: unknown, group: unknown) => {
    const db = database()
    const last = (db.prepare('select max(group_order) as at from nuggets where group_id = ?').get(String(group ?? '')) as { at: number | null }).at ?? 0
    db.prepare('update nuggets set group_id = ?, group_order = ?, unsorted = 0 where id = ?').run(group ? String(group) : null, group ? last + 1 : null, String(id))
    changes++
    changed()
    return true
  })
}
