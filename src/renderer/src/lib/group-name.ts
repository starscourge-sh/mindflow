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
        // A name never starts or ends on a little word: "pages on" from "Night pages on courage" and "Morning pages on fear".
        const edge = (word: string): boolean => word.length < 3 || LITTLE.has(word.toLowerCase()) || /^(and|the|for|but|nor|yet)$/i.test(word)
        if (edge(run[0]) || edge(run[run.length - 1])) continue
        const key = ` ${run.join(' ').toLowerCase()} `
        const count = lower.filter((one) => one.includes(key)).length
        if (count >= need && (!best || size > best.size || (size === best.size && count > best.count))) best = { run: run.join(' '), size, count }
      }
    }
  }
  return best?.run ?? null
}

/** Words that name no topic: the model saying what the things are ("Notes from titles"), not what they share. */
const EMPTY = /\b(notes?|titles?|groups?|things?|items?|folders?|misc|miscellaneous|various)\b/i

/**
 * The name the model filled in (its `name` field, main/understand.ts "ai:group-name"), or null when it is not one:
 * empty, a sentence, too long, a note's own title, a name already taken, or words that name no topic.
 */
export function cleanName(said: unknown, titles: string[], taken: Set<string>): string | null {
  if (typeof said !== 'string') return null
  const name = said.trim()
  const lower = name.toLowerCase()
  if (!/\p{L}/u.test(name) || name.length > 32 || wordsOf(name).length > 4 || EMPTY.test(name)) return null
  if (taken.has(lower) || titles.some((one) => one.trim().toLowerCase() === lower)) return null
  return name
}
