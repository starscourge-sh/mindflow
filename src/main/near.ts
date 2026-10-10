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
