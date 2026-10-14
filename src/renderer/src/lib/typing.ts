/**
 * How a person types a line, as waits before each letter in milliseconds:
 * 42 to 74ms a letter, a breath between words, a longer one before a long
 * word and after a stop or a comma, and now and then a small hesitation, as
 * if choosing the next word. `cap` keeps a long line from boring anyone: the
 * whole line is squeezed to fit it, rhythm kept. The same seed gives the same
 * hand every time.
 */
export function typingWaits(text: string, random: () => number, quick = 1, cap = Infinity): number[] {
  const waits: number[] = []
  for (let i = 0; i < text.length; i++) {
    const before = text[i - 1] ?? ''
    const startsWord = i > 0 && /\s/.test(before)
    const word = startsWord ? text.slice(i).split(/\s/)[0] : ''
    let wait = 42 + random() * 32
    if (startsWord) wait += 25
    if (word.length > 6) wait += 120
    if (/[.,;:!?]/.test(before)) wait += 260
    // A small hesitation before about one word in twelve.
    if (startsWord && random() < 0.08) wait += 160 + random() * 120
    waits.push(wait * quick)
  }
  const total = waits.reduce((sum, one) => sum + one, 0)
  return total > cap ? waits.map((one) => (one * cap) / total) : waits
}

/** The same uneven hand every run: a seeded random number from 0 to 1. */
export function seeded(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
