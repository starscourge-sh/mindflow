/**
 * Cutting words short without breaking a letter: counted in what a reader
 * sees as one character (a grapheme), so an emoji such as 👩🏽‍🎓, an accented
 * letter or a flag is kept whole or left out whole, never split into a "�".
 * Shared by the main process and the windows.
 */

const letters = new Intl.Segmenter(undefined, { granularity: 'grapheme' })
const graphemes = (text: string): string[] => Array.from(letters.segment(text), (one) => one.segment)

/**
 * At most `n` characters of `text`, cut cleanly, with no mark: for a stored or measured piece.
 * Read only as far as the cut: the first 220 characters of a long note's million used to cost a pass over them
 * all (a tenth of a second on main's thread, for every card Home and the Related list showed of it).
 */
export function cut(text: string, n: number): string {
  // No more code units than `n` means no more characters either.
  if (text.length <= n) return text
  let end = 0, count = 0
  for (const one of letters.segment(text)) {
    if (count++ >= n) break
    end = one.index + one.segment.length
  }
  return text.slice(0, end)
}

/** `text` in at most `n` characters, ending "…" when it was cut: for words shown in a sentence or a menu. Read only as far as it takes to know it is too long. */
export function clip(text: string, n: number): string {
  if (text.length <= n) return text
  const keep = Math.max(1, n - 1)
  let end = 0, count = 0
  for (const one of letters.segment(text)) {
    if (count < keep) end = one.index + one.segment.length
    count++
    if (count > n && count >= keep) return `${text.slice(0, end).trimEnd()}…`
  }
  return count > n ? `${text.slice(0, end).trimEnd()}…` : text
}

/** The most a title holds; past it, the words go on in the notes. */
const TITLE_MOST = 500

/**
 * A title that fits: its first line, cut at a word near `most` characters
 * and ended "…". Null when the words are a title already (one line, short).
 */
export function fittedTitle(text: string, most = TITLE_MOST): string | null {
  const first = text.trim().split('\n')[0].trim()
  if (first === text.trim() && graphemes(first).length <= most) return null
  if (graphemes(first).length <= most) return first
  const head = cut(first, most - 1)
  const space = head.lastIndexOf(' ')
  return `${(space > most * 0.6 ? head.slice(0, space) : head).trimEnd()}…`
}

/** Words without the quote marks around them: a quote's title keeps its own, and is not quoted twice. */
export const unquoted = (text: string): string => text.trim().replace(/^["“”‘’'«»„]+|["“”‘’'«»]+$/g, '').trim() || text.trim()

/**
 * Words in curly quotes, cut to `n` characters: a quote's own marks are taken
 * off first, so a note that starts with “ never reads ““like this”.
 */
export function quoted(text: string | null | undefined, n = 60, by: (text: string, n: number) => string = clip): string {
  return `“${by(unquoted(text ?? ''), n)}”`
}

/**
 * `text` in at most `n` characters, cut in the middle: for names that differ
 * at the end ("Email the department … fragment 7").
 */
export function clipMiddle(text: string, n: number): string {
  if (text.length <= n) return text
  const all = graphemes(text)
  if (all.length <= n) return text
  const tail = Math.max(1, Math.floor((n - 1) / 3))
  return `${all.slice(0, n - 1 - tail).join('').trimEnd()} … ${all.slice(all.length - tail).join('').trimStart()}`
}
