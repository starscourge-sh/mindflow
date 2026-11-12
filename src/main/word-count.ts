/**
 * Counting words, and nothing else (no Electron in it): how many a stored
 * body holds, and how many a save gained. Every word of a long note is read
 * for it (about 45 ms for a 4 MB note), so the word log (word-log.ts) asks it
 * of the reading thread (reader.ts) rather than count inside the save, on
 * main's one thread.
 */

type Part = { type?: string; text?: string; content?: Part[] }
const WORD = /[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu

/** How many words a stored body holds: a document's text, or Markdown as it is. */
export function wordsIn(body: unknown): number {
  const raw = String(body ?? '')
  if (!raw) return 0
  let text = raw
  try {
    const doc = JSON.parse(raw) as unknown
    const walk = (node: Part): string => [node.text ?? '', ...(node.content ?? []).map(walk)].join(' ')
    text = typeof doc === 'string' ? doc : doc && typeof doc === 'object' ? walk(doc as Part) : ''
  } catch {
    // Markdown, as it is.
  }
  return text.match(WORD)?.length ?? 0
}

/**
 * The words a save gained, never less than none. The last few wordings keep their count, by their text: the words
 * as they were are the ones the save before counted as they are, so a save counts once.
 */
export function wordCounter(): (was: unknown, now: unknown) => number {
  const counted = new Map<string, number>()
  const count = (body: unknown): number => {
    const raw = String(body ?? '')
    const kept = counted.get(raw)
    if (kept !== undefined) return kept
    const words = wordsIn(raw)
    // Only a wording long enough to be worth it, and three at most: each is held whole.
    if (raw.length > 20_000) {
      if (counted.size >= 3) counted.delete(counted.keys().next().value!)
      counted.set(raw, words)
    }
    return words
  }
  return (was, now) => {
    // As they were first: it is the one already counted, and must not be let go of to make room for the new one.
    const before = count(was)
    return Math.max(0, count(now) - before)
  }
}
