/**
 * A new group's first name, from what its notes are called. No imports, so `node --test` can run it as it is.
 */

const LITTLE = new Set(['about', 'after', 'again', 'from', 'have', 'into', 'over', 'that', 'their', 'there', 'this', 'what', 'when', 'where', 'which', 'with', 'your'])
const wordsOf = (title: string): string[] => title.match(/[\p{L}\p{N}]+/gu) ?? []

/**
 * The longest run of up to four words most of the titles share (three in five, and at least two), as the first title
 * holding it writes it ("Deep Dive"), if one says anything; every Mac can do this. Not every title: one note in a group
 * of "Deep Dive"s ("On meta-learning") left the whole group called "Group 1" (10 Nov).
 */
export function sharedWords(titles: string[]): string | null {
  const said = titles.map(wordsOf)
  if (said.length < 2) return null
  const need = Math.max(2, Math.ceil(said.length * 0.6))
  const lower = said.map((one) => ` ${one.join(' ').toLowerCase()} `)
  let best: { run: string; size: number; count: number } | null = null
  for (const words of said) {
    for (let size = Math.min(4, words.length); size > 0; size--) {
      for (let at = 0; at + size <= words.length; at++) {
        const run = words.slice(at, at + size)
        if (!run.some((word) => /\p{L}/u.test(word) && word.length >= 4 && !LITTLE.has(word.toLowerCase()))) continue
        const key = ` ${run.join(' ').toLowerCase()} `
        const count = lower.filter((one) => one.includes(key)).length
        if (count >= need && (!best || size > best.size || (size === best.size && count > best.count))) best = { run: run.join(' '), size, count }
      }
    }
  }
  return best?.run ?? null
}

/** What the model said, as a name, or null when it is not one: empty, a sentence, too long, a note's own title, or a name already taken. */
export function cleanName(said: unknown, titles: string[], taken: Set<string>): string | null {
  if (typeof said !== 'string' || said.includes('\n')) return null
  const name = said.trim().replace(/^["'\u201c\u2018]+|["'\u201d\u2019]+$/g, '').replace(/[.:!]+$/, '').trim()
  const lower = name.toLowerCase()
  if (!/\p{L}/u.test(name) || name.length > 32 || wordsOf(name).length > 4) return null
  if (taken.has(lower) || titles.some((one) => one.trim().toLowerCase() === lower)) return null
  return name
}
