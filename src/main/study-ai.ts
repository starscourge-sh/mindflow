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

/**
 * The grade a card is scheduled at after hints: each hint a step down, never
 * below Hard, and Again stays Again. What you pressed is what the log keeps.
 */
export function hintedGrade(grade: 1 | 2 | 3 | 4, hints: number): 1 | 2 | 3 | 4 {
  if (grade === 1 || hints <= 0) return grade
  return Math.max(2, grade - Math.min(hints, 2)) as 2 | 3 | 4
}

export type OutlineRow = { title: string; depth: number; page: number }

/**
 * The part of a book to make cards from: the chapter the page is in, from the
 * outline's top level (its sections are headings inside it), or with no
 * outline the pages on screen.
 */
export function chapterRange(outline: OutlineRow[], page: number, pages: number, onScreen: [number, number]): { from: number; to: number; title: string | null; headings: OutlineRow[] } {
  const top = Math.min(...outline.map((row) => row.depth))
  const chapters = outline.filter((row) => row.depth === top).sort((a, b) => a.page - b.page)
  const at = chapters.findLastIndex((row) => row.page <= page)
  if (at < 0) return { from: onScreen[0], to: onScreen[1], title: null, headings: [] }
  const from = chapters[at].page
  const to = Math.max(from, Math.min(pages, (chapters[at + 1]?.page ?? pages + 1) - 1))
  return { from, to, title: chapters[at].title, headings: outline.filter((row) => row.depth > top && row.page >= from && row.page <= to) }
}

/**
 * The words the model reads, at most `budget` letters (its whole window is
 * about 4,000 tokens): your own highlights first, then the headings, then each
 * page's opening lines, an even share a page, so an 80-page chapter is read
 * across, not only its first pages. Each line carries its page, "[p. 12]".
 */
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
    const words = one.text.replace(/\s+/g, ' ').trim()
    const cut = words.length > room ? `${words.slice(0, words.lastIndexOf(' ', room) > 0 ? words.lastIndexOf(' ', room) : room)}` : words
    if (!put(`[p. ${one.page}] ${cut}`)) break
  }
  return lines.join('\n')
}
