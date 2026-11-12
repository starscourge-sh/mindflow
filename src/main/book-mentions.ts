import type { DatabaseSync } from 'node:sqlite'
import { NameBook, everyday, linkableLines, nameFrom, reading, tooCommon, type Name } from './name-match'
import { LABEL } from './book-words'
import { mdWords } from './md-words'
import { cut } from './clip'
import { withoutTags } from './tag-words'
import { NOTE_KEY } from './name'

/**
 * A note's mentions, as a read of the book and nothing else (no Electron in
 * it): every note that links here, every note that names this one without
 * linking it, and the same the other way. It reads every note, so it is asked
 * of the reading thread (reader.ts) and never holds main.
 */

type Doc = { type?: string; text?: string; attrs?: Record<string, unknown>; marks?: { type: string; attrs?: Record<string, unknown> }[]; content?: Doc[] }

export function bookMentions(db: DatabaseSync, timed: <T>(name: string, run: () => T) => T) {
  // Backlinks the way Obsidian lists them under a note: every note that links
  // here, with the sentence it does it in; and every note that names this
  // one without linking it yet, which one press turns into a link.
  type Mention = { type: string; id: string; title: string; snippet: string; private: number; /** For a note this one names: the very words that name it here, so they can be made its link. */ words?: string }
  type Note = { type: string; id: string; title: string; body: string; private: number }
  const around = (text: string, at: number, length: number): string => {
    const start = Math.max(0, text.lastIndexOf('\n', at) + 1, at - 80)
    const end = Math.min(text.length, at + length + 80)
    const line = text.slice(start, end).split('\n')[0]
    return `${start > 0 && text[start - 1] !== '\n' ? '…' : ''}${line}${end < text.length && !text.slice(at, end).includes('\n') ? '…' : ''}`
  }
  // The words as read: inline pieces run together, links as their names,
  // blocks on their own lines.
  const words = (value: unknown): string => {
    // An imported page's Markdown reads as words, its [[@link|name]] as its name.
    if (typeof value === 'string') return mdWords(value)
    const walk = (node: Doc): string =>
      node.type === 'noteLink' ? String(node.attrs?.label ?? '') :
      node.text ?? (node.content ?? []).map(walk).join(node.content?.every((child) => child.type === 'text' || child.type === 'noteLink' || child.type === 'hardBreak') ? '' : '\n')
    return value ? walk(value as Doc) : ''
  }
  const titleOf = (id: string): { title: string; key: string; link: string } | null => {
    const capture = db.prepare(`select ${LABEL} as title, number from captures where id = ?`).get(id) as { title: string; number: number } | undefined
    if (capture) return { title: capture.title, key: `${NOTE_KEY}-${capture.number}`, link: id }
    const nugget = db.prepare('select title, tier from nuggets where id = ?').get(id) as { title: string; tier: string } | undefined
    return nugget ? { title: nugget.title, key: '', link: `${nugget.tier}:${id}` } : null
  }
  // What truly names a note (name-match.ts, the one rule set): each note's lines read once and kept until its words
  // change, the book of names made again only when a title changes, so a save reads one note, never the book.
  const linesKept = new Map<string, { body: string; lines: string[]; names: string; held: Set<string> }>()
  let nameBook: { stamp: string; book: NameBook } | null = null
  /**
   * The mentions read every note in the book, on every open and after every save: on a large book (95 MB of notes)
   * that is 65 to 380 ms each time. It is asked of the reading thread, and read there in turns: `turn()` lets the
   * thread go once it has been held 8 ms (a search or a newer ask goes first, and word that the asker has left
   * comes in) and says false when the answer is no longer wanted. Each step keeps its name, for the freeze log
   * when main has to answer in the thread's place (stalls.ts).
   */
  type Turn = () => Promise<boolean>
  const turns = (wanted: () => boolean): Turn => {
    let since = performance.now()
    return async () => {
      if (performance.now() - since < 8) return true
      await new Promise((done) => setImmediate(done))
      since = performance.now()
      return wanted()
    }
  }
  /** Every note, a few at a read; null once it is no longer wanted. */
  const everythingInTurns = async (turn: Turn): Promise<Note[] | null> => {
    const out: Note[] = []
    for (const page of [
      db.prepare(`select rowid as at, 'capture' as type, id, ${LABEL} as title, body, private from captures where status != 'discarded' and rowid > ? order by rowid limit 30`),
      db.prepare("select rowid as at, tier as type, id, title, body, private from nuggets where superseded_by is null and tier not in ('card', 'deck') and rowid > ? order by rowid limit 30")
    ]) {
      for (let at = 0; ;) {
        const rows = timed('mentions: thirty notes read', () => page.all(at)) as unknown as (Note & { at: number })[]
        if (!rows.length) break
        out.push(...rows)
        at = rows[rows.length - 1].at
        if (!(await turn())) return null
      }
    }
    return out
  }
  /** `book.find` over many lines, a part at a time, with the same answer as in one go (name-match.ts `reading`); `first`: the first hit is enough. */
  const findInTurns = async (book: NameBook, lines: string[], leave: Set<string>, strict: boolean, own: string, turn: Turn, first = false): Promise<ReturnType<NameBook['find']> | null> => {
    const part = reading(own)
    const out: ReturnType<NameBook['find']> = []
    for (let from = 0; from < lines.length && !(first && out.length); from += 120) {
      out.push(...timed('mentions: names looked for in 120 lines', () => book.find(lines.slice(from, from + 120), leave, strict, own, part)))
      if (!(await turn())) return null
    }
    return out
  }
  const linesOf = async (row: { id: string; body: string }, stamp: string, book: NameBook, turn: Turn): Promise<{ lines: string[]; held: Set<string> } | null> => {
    let kept = linesKept.get(row.id)
    if (!kept || kept.body !== row.body) {
      kept = timed("mentions: a note's lines read", () => {
        let doc: unknown = null
        try { doc = JSON.parse(row.body) } catch { doc = row.body }
        return { body: row.body, lines: linkableLines(doc), names: '', held: new Set<string>() }
      })
      linesKept.set(row.id, kept)
    }
    // Every name standing in it as whole words, read as a name or not: how common a name is, and where to look closer.
    if (kept.names !== stamp) {
      const hits = await findInTurns(book, kept.lines, new Set([row.id]), false, '', turn)
      if (!hits) return null
      kept.held = new Set(hits.map((hit) => hit.key))
      kept.names = stamp
    }
    return (await turn()) ? kept : null
  }
  /** The ids a note's words already link to, read once. */
  const linkedIn = (body: string): Set<string> => new Set([...body.matchAll(/"id":"(?:[a-z]+:)?([^"]+)"|\[\[@(?:[a-z]+:)?([^|\]]+)\|/g)].map((hit) => hit[1] ?? hit[2]))
  type Mentions = { linked: Mention[]; unlinked: Mention[]; out: Mention[]; named: Mention[]; more: { unlinked: boolean; named: boolean }; me: string }
  /** A note's mentions, worked out in turns; null once no longer wanted. */
  const mentionsOf = async (id: string, turn: Turn): Promise<Mentions | null> => {
    const me = titleOf(id)
    const name = me?.title.trim() ?? ''
    const every = await everythingInTurns(turn)
    if (!every) return null
    const all = every.filter((row) => row.body)
    const stamp = all.map((row) => `${row.id}\u0000${row.title}`).join('\u0001')
    if (nameBook?.stamp !== stamp) nameBook = { stamp, book: timed('mentions: the book of names made', () => new NameBook(all.map((row) => nameFrom(row.id, row.title ?? '')).filter((one): one is Name => !!one), everyday)) }
    const book = nameBook.book
    const read = new Map<string, { lines: string[]; held: Set<string> }>()
    for (const row of all) {
      const lines = await linesOf(row, stamp, book, turn)
      if (!lines) return null
      read.set(row.id, lines)
    }
    // How many notes hold each name: one that many do names nothing.
    const held = new Map<string, number>()
    for (const one of read.values()) for (const key of one.held) held.set(key, (held.get(key) ?? 0) + 1)
    const rare = (key: string): boolean => !tooCommon(held.get(key) ?? 0, all.length)
    const snippetAt = (line: string, from: number, to: number): string => around(line, from, to - from).replace(/\s*\u2063\s*/g, ' ')
    const linked: Mention[] = []
    const unlinked: Mention[] = []
    const mine = all.find((row) => row.id === id)
    const own = nameFrom(id, name)
    const ownBook = own && rare(id) ? new NameBook([own], everyday) : null
    for (const row of all) {
      if (!(await turn())) return null
      if (row.id === id) continue
      // A link as the editor keeps it, or as an imported page still holds it.
      const links = row.body.includes(id) && new RegExp(`"id":"(?:[a-z]+:)?${id}"|\\[\\[@(?:[a-z]+:)?${id}\\|`).test(row.body)
      if (links) {
        const text = timed('mentions: a note that links here read', () => words(JSON.parse(row.body)))
        const label = /"label":"([^"]*)"/.exec(row.body.slice(Math.max(0, row.body.search(new RegExp(`"id":"(?:[a-z]+:)?${id}"`)))))?.[1] ??
          new RegExp(`\\[\\[@(?:[a-z]+:)?${id}\\|([^\\]]+)\\]\\]`).exec(row.body)?.[1] ?? name
        const at = text.indexOf(label)
        const snippet = at >= 0 ? around(text, at, label.length) : cut(text, 160)
        // A line that is only the link and tags says nothing the row does not: none then.
        const bare = !withoutTags(snippet.replace(label, '')).replace(row.title ?? '', '').replace(/[\s….,:;·-]/g, '')
        linked.push({ type: row.type, id: row.id, title: row.title, private: row.private, snippet: bare ? '' : snippet })
        continue
      }
      // Only a note that holds the name at all is read closer: is it written there as this note's name?
      const theirs = read.get(row.id)!
      if (!ownBook || !theirs.held.has(id)) continue
      const hits = await findInTurns(ownBook, theirs.lines, new Set(), true, row.title ?? '', turn, true)
      if (!hits) return null
      const hit = hits[0]
      if (hit) unlinked.push({ type: row.type, id: row.id, title: row.title, private: row.private, snippet: snippetAt(theirs.lines[hit.line], hit.from, hit.to) })
    }
    // And the other way, as Obsidian's Outgoing links has it: what this note
    // links to, and the notes it names without linking them yet.
    const out: Mention[] = []
    const named: Mention[] = []
    if (mine) {
      const already = linkedIn(mine.body)
      const rows = new Map(all.map((row) => [row.id, row]))
      for (const key of already) {
        const row = rows.get(key)
        if (row && key !== id) out.push({ type: row.type, id: row.id, title: row.title, private: row.private, snippet: '' })
      }
      const lines = read.get(id)!.lines
      const hits = await findInTurns(book, lines, new Set([id, ...already]), true, name, turn)
      if (!hits) return null
      for (const hit of hits) {
        const row = rows.get(hit.key)
        if (row && rare(hit.key)) named.push({ type: row.type, id: row.id, title: row.title, private: row.private, snippet: snippetAt(lines[hit.line], hit.from, hit.to), words: lines[hit.line].slice(hit.from, hit.to) })
      }
    }
    // The lists show twenty; `more` says when there were more, so a heading never counts what it does not list.
    return { linked, unlinked: unlinked.slice(0, 20), out, named: named.slice(0, 20), more: { unlinked: unlinked.length > 20, named: named.length > 20 }, me: mine?.type ?? 'capture' }
  }

  return {
    titleOf,
    words,
    /** A note's mentions; null once `gone` says its asker has left. */
    of: (id: string, gone: () => boolean): Promise<Mentions | null> => mentionsOf(id, turns(() => !gone()))
  }
}
