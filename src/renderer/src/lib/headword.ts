/**
 * A Lookup or a Word as a dictionary prints it: the word on its own, then
 * its meaning. Read for showing only: the note's own title is never changed.
 *
 * The meaning is the one written as its "Meaning or answer"; a note written
 * the quick way, "Sonder: the sense that every passer-by has a life as full as
 * your own", gives its word and meaning from its title. A question ("Why does
 * Gatsby watch the green light?") is its own headword, with no meaning yet.
 */
export type Headword = { word: string; meaning?: string }

/** "Word: meaning", "Word - meaning" or "Word – meaning": a short word or phrase before the mark, words after it. */
const SPLIT = /^\s*([^:?\n]{1,48}?)\s*(?::|\s[-\u2013\u2014]\s)\s*(\S[\s\S]*)$/

export function headword(title: string, definition?: string | null): Headword {
  const said = title.trim()
  const split = SPLIT.exec(said)
  // Five words at most before the mark: "Memento mori: remember you will die" splits; "What the narrator keeps returning to: the house" does not.
  const parts = split && split[1].trim().split(/\s+/).length <= 5 && !/^https?$/i.test(split[1].trim()) ? split : null
  const word = parts ? parts[1].trim() : said
  const meaning = (definition?.trim() || (parts ? parts[2].trim() : '')).split('\n')[0].trim()
  return meaning ? { word, meaning } : { word }
}

/** The letter a word is filed under, A to Z; anything else (a number, a symbol) under #. */
export function letterOf(word: string): string {
  const first = word.trim().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/^[^\p{L}\p{N}]+/u, '').charAt(0).toUpperCase()
  return /^[A-Z]$/.test(first) ? first : first && /\p{L}/u.test(first) ? first : '#'
}

/** Letters in dictionary order, # last. */
export const byLetter = (a: string, b: string): number => (a === '#' ? 1 : b === '#' ? -1 : a.localeCompare(b))
