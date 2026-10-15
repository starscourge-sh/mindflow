/**
 * Cutting words short without breaking a letter: counted in what a reader
 * sees as one character (a grapheme), so an emoji such as 👩🏽‍🎓, an accented
 * letter or a flag is kept whole or left out whole, never split into a "�".
 * Shared by the main process and the windows.
 */

const letters = new Intl.Segmenter(undefined, { granularity: 'grapheme' })
const graphemes = (text: string): string[] => Array.from(letters.segment(text), (one) => one.segment)

/** At most `n` characters of `text`, cut cleanly, with no mark: for a stored or measured piece. */
export function cut(text: string, n: number): string {
  // No more code units than `n` means no more characters either.
  if (text.length <= n) return text
  return graphemes(text).slice(0, Math.max(0, n)).join('')
}

/** `text` in at most `n` characters, ending "…" when it was cut: for words shown in a sentence or a menu. */
export function clip(text: string, n: number): string {
  if (text.length <= n) return text
  const all = graphemes(text)
  return all.length <= n ? text : `${all.slice(0, Math.max(1, n - 1)).join('').trimEnd()}…`
}

/**
 * Words in curly quotes, cut to `n` characters: a quote's own marks are taken
 * off first, so a note that starts with “ never reads ““like this”.
 */
export function quoted(text: string, n = 60, by: (text: string, n: number) => string = clip): string {
  const bare = text.trim().replace(/^["“”‘’'«»„]+|["“”‘’'«»]+$/g, '').trim()
  return `“${by(bare || text.trim(), n)}”`
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
