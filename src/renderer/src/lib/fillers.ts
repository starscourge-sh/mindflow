/**
 * Speech tidied by rules, never by a model: the sounds people make while
 * thinking ("um", "uh", "erm"), a word said twice in a row ("the the"), and
 * "you know" or "like" said as a pause at the edge of a clause. Everything
 * else is left exactly as said. The original is kept by the caller, so the
 * tidy can always be undone.
 */

/** Thinking sounds, on their own as words. */
const SOUNDS = /(^|[\s,.;:!?…-])(?:u+m+|u+h+m*|e+r+m+|e+r+|h+m+|a+h+|m+h+m+)(?=$|[\s,.;:!?…-])/gi
/** "you know" or "I mean" or "like", alone between commas or at a sentence's start or end. */
const EDGES = /(^\s*|[.!?]\s+|,\s*)(?:you know|i mean|like|so like|kind of like)\s*(?=,|[.!?]|\s*$)/gi
const LEADS = /(^\s*|[.!?]\s+)(?:you know|i mean|so like)\s*,\s*/gi
/** Where a filler was taken out, until the commas round it are settled. */
const GONE = '\u0000'

export function tidySpeech(said: string): string {
  let text = ` ${said} `
  text = text.replace(SOUNDS, `$1${GONE}`)
  text = text.replace(LEADS, '$1')
  text = text.replace(EDGES, `$1${GONE}`)
  // "the, uh, patent": the commas that held the filler go with it.
  text = text.replace(new RegExp(`,\\s*${GONE}\\s*,`, 'g'), ' ').replace(new RegExp(`${GONE}\\s*,\\s*`, 'g'), '').replace(new RegExp(GONE, 'g'), '')
  // A word said twice in a row, whatever its case: "the the" is "the". Not across punctuation ("no, no").
  text = text.replace(/\b(\p{L}[\p{L}']*)(\s+\1\b)+/giu, '$1')
  // The commas and spaces the removals leave behind.
  text = text
    .replace(/\s*,(\s*,)+/g, ',')
    .replace(/(^|[.!?]\s*)\s*,\s*/g, '$1')
    .replace(/\s*,\s*([.!?])/g, '$1')
    .replace(/\s+([,.!?;:])/g, '$1')
    .replace(/\s{2,}/g, ' ')
    .trim()
    .replace(/^,\s*/, '')
    .replace(/,$/, '')
  // A sentence that now starts with a small letter, because its first word went, starts with a capital again.
  text = text.replace(/(^|[.!?]\s+)(\p{Ll})/gu, (_, lead: string, letter: string) => lead + letter.toUpperCase())
  // Nothing but a filler: kept as it was, never an empty line.
  return /\p{L}/u.test(text) ? text : said.trim()
}
