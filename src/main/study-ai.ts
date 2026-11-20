import { interval } from './dates.ts'

/**
 * Review and reading with Apple Intelligence (native/understand.swift "judge",
 * "hint" and "cards"): the plain rules around what the model says, kept here
 * so they are the same on every surface and can be tested without a model.
 */

/** What the model says of a typed answer, by its meaning. */
export type Verdict = 'same' | 'close' | 'partly' | 'off'

/** The grade a verdict suggests: the grade is still yours; this only says where it points. */
export function meaningGrade(verdict: Verdict): 1 | 2 | 3 {
  return verdict === 'off' ? 1 : verdict === 'partly' ? 2 : 3
}

/** The words for a verdict, said before "you said …, the card says …". */
export const VERDICT_SAID: Record<Verdict, string> = {
  same: 'The same in meaning',
  close: 'Close enough',
  partly: 'Partly there',
  off: 'Not the same in meaning'
}

/** Words cut at a word, for "the card says “…”". */
export function cutWords(text: string, most = 60): string {
  const one = text.replace(/\s+/g, ' ').trim()
  if (one.length <= most) return one
  const cut = one.slice(0, most)
  return `${cut.slice(0, Math.max(cut.lastIndexOf(' '), most / 2)).replace(/[,;:.]$/, '')}…`
}

/** How long a time reads, in minutes, as Review says it ("24h" and "1d" read the same). */
const MINUTES: Record<string, number> = { m: 1, h: 60, d: 1440, w: 10080, mo: 43800, y: 525600 }
function shown(iso: string, now: number): number {
  const [, n, unit] = /^(\d+)(\D+)$/.exec(interval(iso, now)) ?? []
  return Number(n) * (MINUTES[unit] ?? 1)
}

/** How much of its time away a card keeps for each hint taken: two hints, about a third. */
export const HINT_KEEPS = 0.6

/**
 * When each grade brings a card back after hints, from when it would have
 * (Review's four times): Again as it is, the others sooner by the same share.
 * Where shortening would make a grade read the same as the one before it
 * ("in 1 day" twice), it is moved on a unit at a time, never past its own
 * time, so the four stay four and in order. What you pressed is what the log keeps.
 */
export function hintedTimes(times: Record<number, string>, now: number, hints: number): Record<number, string> {
  if (hints <= 0) return times
  const out: Record<number, string> = { 1: times[1] }
  for (const grade of [2, 3, 4]) {
    const due = Date.parse(times[grade])
    const before = Date.parse(out[grade - 1])
    let at = now + (due - now) * HINT_KEEPS ** Math.min(hints, 2)
    // Reading the same as the grade before: one of its units later (a day, an hour, a minute), never past its own time.
    const step = before - now >= 864e5 ? 864e5 : before - now >= 36e5 ? 36e5 : 60e3
    while ((at <= before || shown(new Date(at).toISOString(), now) <= shown(out[grade - 1], now)) && at < due) at = Math.min(due, at + step)
    out[grade] = new Date(at).toISOString()
  }
  return out
}

export type OutlineRow = { title: string; depth: number; page: number }

/**
 * The part of a book to make cards from: the section being read, the outline's last heading at or before the page
 * (the deepest of those on that page), running to the next heading at its level or above; the headings inside it are
 * its headings. A section of one page is read with the one it is in, so it has words enough. With no outline, the
 * pages on screen. (17 Nov: the reader was in "Planning AI Applications" and the cards came from "Table of Contents",
 * pages v to x: the top level of that book's outline held its contents page and the parts its chapters sit in.)
 */
export function chapterRange(outline: OutlineRow[], page: number, pages: number, onScreen: [number, number]): { from: number; to: number; title: string | null; headings: OutlineRow[] } {
  const rows = [...outline].sort((a, b) => a.page - b.page || a.depth - b.depth)
  const end = (at: number): number => {
    const next = rows.slice(at + 1).find((row) => row.page > rows[at].page && row.depth <= rows[at].depth)
    return Math.max(rows[at].page, Math.min(pages, (next?.page ?? pages + 1) - 1))
  }
  let at = rows.findLastIndex((row) => row.page <= page)
  if (at < 0) return { from: onScreen[0], to: onScreen[1], title: null, headings: [] }
  // Of one page: the section it is in (the nearest heading above it at a higher level).
  while (end(at) === rows[at].page) {
    const up = rows.slice(0, at).findLastIndex((row) => row.depth < rows[at].depth)
    if (up < 0) break
    at = up
  }
  const from = rows[at].page
  const to = end(at)
  return { from, to, title: rows[at].title, headings: rows.filter((row, n) => n !== at && row.depth > rows[at].depth && row.page >= from && row.page <= to) }
}

/**
 * The words the model reads, at most `budget` letters (its whole window is
 * about 4,000 tokens): your own highlights first, then the headings, then each
 * page's opening lines, an even share a page, so an 80-page chapter is read
 * across, not only its first pages. Each line carries its page, "[p. 12]".
 */
/**
 * A page's lines as sentences: a short line with no stop of its own, before a
 * line that starts afresh (a heading, "Page 7", a running head), ends with a full stop, so it is never read into the
 * sentence after it; the lines of a paragraph join with a space.
 */
export function pageWords(text: string): string {
  const lines = text.split(/\n+/).map((line) => line.replace(/\s+/g, ' ').trim()).filter(Boolean)
  // A heading: short, no stop of its own, and the next line starts afresh (a capital or a number), not mid-sentence.
  return lines.map((line, n) => (line.length < 60 && !/[.!?:;,]$/.test(line) && /^[\p{Lu}\p{N}"“]/u.test(lines[n + 1] ?? 'A') ? `${line}.` : line)).join(' ')
}

/** What Apple Intelligence is asked for cards: one line each, though it often answers in its own shape (cardsSaid). */
export const cardsAsked = (count: number): string =>
  `You write study flashcards from part of a book, in the book's own language. Make exactly ${count} cards on the most important ideas, preferring the reader's highlights and the headings. Each card is one line: Q: a clear question || A: its answer in under twenty words || P: the page number it comes from, from the [p. N] marks. Use only what the text says. No other lines.`

/**
 * The cards in what the model wrote, in whichever shape it chose. Asked for "Q: … || A: … || P: …" on one line, it
 * mostly answers "**Q:** …" and "**A:** …" on lines of their own with "[p. 412]" under them (20 Nov, on two dense
 * pages of Fluent Python): read one line at a time, those five cards were all dropped and the panel said it wrote
 * none. Each Q starts a card, its A ends the question, a page mark or "P:" gives its page; a line with no mark of
 * its own carries on the part before it. With none at all, the error says what the model did answer.
 */
export function cardsSaid(reply: string, count: number): { cards: { question: string; answer: string; page: number }[] } | { error: string } {
  type Card = { question: string; answer: string; page: number }
  const cards: Card[] = []
  // Set inside done() too: typed by assertion, so the checker never narrows them to null for good.
  let card = null as Card | null
  let part = null as 'question' | 'answer' | null
  const done = (): void => {
    if (card && card.question && card.answer && cards.length < count) cards.push({ ...card, question: card.question.trim(), answer: card.answer.trim() })
    card = null
    part = null
  }
  for (const line of reply.split(/\r?\n/)) {
    if (!line.trim()) { part = null; continue }
    for (const piece of line.split('||')) {
      // Markdown's bold and a list's number or dash, which the model adds unasked; never the underscores of `__dict__`.
      const bare = piece.replace(/\*\*/g, '').replace(/^\s*(?:\d+[.)]|[-*•])\s+/, '').trim()
      if (!bare) continue
      const mark = /^(?:Card\s*\d+\s*[:.-]\s*)?(Q|Question|A|Answer|P|Page)\s*[:：]\s*(.*)$/i.exec(bare)
      const page = /^\[?\(?p(?:age|\.)?\s*(\d+)\]?\)?\.?$/i.exec(bare)
      if (page || mark?.[1].toLowerCase().startsWith('p')) {
        const n = Number((page?.[1] ?? mark![2]).replace(/\D/g, ''))
        if (card && n) card.page = n
        part = null
        continue
      }
      const which = mark ? (mark[1].toLowerCase().startsWith('q') ? 'question' : 'answer') : part
      if (mark && which === 'question') (done(), (card = { question: '', answer: '', page: 0 }))
      if (!card || !which) continue
      // A page said at the end of the words ("… not sabotage. [p. 413]") is the card's page, not part of them.
      const words = mark ? mark[2] : bare
      const tail = /\s*[[(]p(?:age|\.)?\s*(\d+)[\])]\.?\s*$/i.exec(words)
      if (tail) card.page = Number(tail[1])
      card[which] = `${mark ? '' : card[which]} ${tail ? words.slice(0, tail.index) : words}`.trim()
      part = which
    }
  }
  done()
  if (cards.length) return { cards }
  const said = reply.replace(/\s+/g, ' ').trim()
  if (!said) return { error: 'Apple Intelligence sent back an empty answer for these pages. Try again: each try is worded afresh.' }
  return { error: `Apple Intelligence answered without a question and its answer in it: “${cutWords(said, 140).replace(/[.!]$/, '')}”. Try again: each try is worded afresh.` }
}

export function chapterText(parts: { pages: { page: number; text: string }[]; highlights: { page: number; text: string }[]; headings: { page: number; title: string }[] }, budget = 9000): string {
  const lines: string[] = []
  let left = budget
  const put = (line: string): boolean => {
    if (line.length > left) return false
    lines.push(line)
    left -= line.length + 1
    return true
  }
  for (const one of parts.highlights) if (!put(`[p. ${one.page}] Highlighted: ${one.text.replace(/\s+/g, ' ').trim().slice(0, 400)}`)) break
  for (const one of parts.headings) if (!put(`[p. ${one.page}] Heading: ${one.title.trim()}`)) break
  const pages = parts.pages.filter((one) => one.text.trim())
  if (!pages.length || left <= 0) return lines.join('\n')
  // More pages than room for a useful line each (about 120 letters): every few pages, evenly, across the whole chapter.
  const step = Math.max(1, Math.ceil((pages.length * 130) / left))
  const taken = pages.filter((_, n) => n % step === 0)
  const room = Math.floor(left / taken.length) - 10
  for (const one of taken) {
    const words = pageWords(one.text)
    const cut = words.length > room ? `${words.slice(0, words.lastIndexOf(' ', room) > 0 ? words.lastIndexOf(' ', room) : room)}` : words
    if (!put(`[p. ${one.page}] ${cut}`)) break
  }
  return lines.join('\n')
}
