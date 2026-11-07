/**
 * A new group's first name, from what its notes are called. No imports, so `node --test` can run it as it is.
 */

const LITTLE = new Set(['about', 'after', 'again', 'from', 'have', 'into', 'over', 'that', 'their', 'there', 'this', 'what', 'when', 'where', 'which', 'with', 'your'])
const wordsOf = (title: string): string[] => title.match(/[\p{L}\p{N}]+/gu) ?? []

/** The longest run of up to four words in every title, as the first one writes it ("Deep Dive"), if one says anything; every Mac can do this. */
export function sharedWords(titles: string[]): string | null {
  const said = titles.map(wordsOf)
  if (said.length < 2 || said.some((one) => !one.length)) return null
  const lower = said.map((one) => ` ${one.join(' ').toLowerCase()} `)
  for (let size = Math.min(4, said[0].length); size > 0; size--) {
    for (let at = 0; at + size <= said[0].length; at++) {
      const run = said[0].slice(at, at + size)
      const means = run.some((word) => /\p{L}/u.test(word) && word.length >= 4 && !LITTLE.has(word.toLowerCase()))
      if (means && lower.every((one) => one.includes(` ${run.join(' ').toLowerCase()} `))) return run.join(' ')
    }
  }
  return null
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
