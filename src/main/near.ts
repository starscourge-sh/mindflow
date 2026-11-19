/** How many single-letter edits turn one word into the other (Levenshtein). */
export function distance(a: string, b: string): number {
  let row = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    const next = [i]
    for (let j = 1; j <= b.length; j++) next[j] = Math.min(row[j] + 1, next[j - 1] + 1, row[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
    row = next
  }
  return row[b.length]
}

/** Within a slip of a key or two of each other, for names of a few letters or more. */
export function near(a: string, b: string): boolean {
  if (Math.abs(a.length - b.length) > 2) return false
  return distance(a, b) <= (b.length < 8 ? 1 : 2)
}

// Where each key sits on a keyboard: its row, and how far along it, each row set a little further right as on the keys.
const KEYS = new Map(['qwertyuiop', 'asdfghjkl', 'zxcvbnm'].flatMap((row, at) => [...row].map((key, along) => [key, [at, along + [0, 0.25, 0.75][at]]] as const)))
/** Two keys side by side, or touching in the row above or below: where a finger lands instead of the one it meant. */
const beside = (a: string | undefined, b: string | undefined): boolean => {
  const one = a && KEYS.get(a)
  const two = b && KEYS.get(b)
  return !!one && !!two && Math.abs(one[0] - two[0]) <= 1 && Math.abs(one[1] - two[1]) <= 1
}

const VOWELS = 'aeiouy'

/**
 * How many slips of the keys turn `typed` into `word`, at most `left`, else
 * Infinity. A slip is what fingers really do: two letters swapped ("recieve"),
 * the key beside the one meant ("bargsin") or one vowel for another
 * ("speach", "seperate"), a letter left out of a word of five
 * letters or more ("tomatos"), or one doubled or caught from a key beside it
 * ("recceive"). The first letter is never the slip. Two words one letter apart
 * by any other change are different words, not a slip: "faust" is neither
 * "fault" (s and l are far apart) nor "fast".
 */
export function slips(typed: string, word: string, left = 1): number {
  const from = (i: number, j: number, left: number): number => {
    while (i < typed.length && j < word.length && typed[i] === word[j]) i++, j++
    if (i === typed.length && j === word.length) return 0
    if (!left || (i === 0 && j === 0)) return Infinity
    const on = (di: number, dj: number): number => 1 + from(i + di, j + dj, left - 1)
    const [a, b] = [typed[i], word[j]]
    return Math.min(
      a && b && a === word[j + 1] && typed[i + 1] === b ? on(2, 2) : Infinity,
      a && b && (beside(a, b) || (VOWELS.includes(a) && VOWELS.includes(b))) ? on(1, 1) : Infinity,
      b && typed.length >= 5 ? on(0, 1) : Infinity,
      a && (a === typed[i - 1] || a === typed[i + 1] || beside(a, typed[i - 1]) || beside(a, typed[i + 1])) ? on(1, 0) : Infinity
    )
  }
  return Math.abs(typed.length - word.length) > left ? Infinity : from(0, 0, left)
}

/** The different words of three letters or more in `text`, in lower case: what `forgives` compares against, kept by a caller that asks often. */
export const wordsOf = (text: string): string[] => [...new Set(text.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((one) => one.length >= 3))]

/**
 * Search that forgives spelling: every word asked for is in `text`, or a word
 * there is a slip of the keys from it (`slips`: one, or two in a word of eight
 * letters or more). Words under four letters must be there as typed, so "cat"
 * never finds "car". The answer is the words that stood in for those not found
 * as typed, closest first, and how many slips they took in all (what ⌘K ranks
 * them by, and names on each row); null when the text does not answer.
 */
export function forgiven(words: string[], text: string, there = wordsOf(text)): { near: string[]; slips: number } | null {
  const lower = text.toLowerCase()
  const near: string[] = []
  let total = 0
  for (const word of words) {
    if (lower.includes(word)) continue
    if (word.length < 4) return null
    let best = Infinity, found = ''
    for (const one of there) {
      const by = slips(word, one, word.length >= 8 ? 2 : 1)
      if (by < best) (best = by), (found = one)
    }
    if (best === Infinity) return null
    near.push(found)
    total += best
  }
  return { near, slips: total }
}

/** Whether `text` answers the words asked for, spelling forgiven as `forgiven` does. */
export const forgives = (words: string[], text: string, there?: string[]): boolean => forgiven(words, text, there) !== null
