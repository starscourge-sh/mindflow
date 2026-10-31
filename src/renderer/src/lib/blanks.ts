/**
 * Fill-in-the-blank cards, for any subject: a date in history, a dose in
 * medicine, a constant in physics, a word in a poem. A blank is "_____" in the
 * question; a hint goes inside it in brackets ("_____ (how many mL)"), shown in
 * Review as grey words in the gap. Several blanks on one card are asked
 * together; asked apart, each is a card of its own.
 */

export const BLANK = '_____'
/** A blank with its hint, if it has one: "_____" or "_____ (how many mL)". */
const BLANK_AT = /_____(?: \(([^)\n]{1,80})\))?/g

const flat = (text: string): string => text.replace(/\s+/g, ' ').trim()

/** The blanks in a question, in order, each with its hint ("how many mL") or null. */
export function blanksIn(prompt: string | null): { hint: string | null }[] {
  return [...(prompt ?? '').matchAll(BLANK_AT)].map((match) => ({ hint: match[1] ?? null }))
}

/**
 * What to blank when these words are picked in this text, so the card asks
 * the right thing:
 * - a number with its unit ("75%", "1,200 mL", "3 L") blanks the number only:
 *   the unit stays showing as the cue (Ali Abdaal: "I still see that it's a
 *   percentage sign");
 * - an "a" or "an" just before goes inside the blank, as it gives the answer
 *   away ("an _____" can only be a word starting with a vowel).
 * Gives back the words to blank, where they start, and the unit kept, if any.
 */
export function blankFor(text: string, picked: string, from = 0): { words: string; at: number; unit: string | null; article: string | null } | null {
  const words = picked.trim()
  let at = text.indexOf(words, from)
  if (!words || at < 0) return null
  let blank = words
  let unit: string | null = null
  const measured = /^([-+−]?\d[\d,.]*)(\s*)(%|°[CF]?|[A-Za-zµμ]{1,4}(?:\/[A-Za-z]{1,4})?)$/u.exec(words)
  if (measured) {
    blank = measured[1]
    unit = measured[3]
  }
  let article: string | null = null
  const before = /(?:^|\s)(an?)\s+$/i.exec(text.slice(0, at))
  if (before && !measured) {
    article = before[1]
    const start = at - before[0].length + (before[0].length - before[0].trimStart().length)
    blank = text.slice(start, at) + blank
    at = start
  }
  return { words: blank, at, unit, article }
}

/**
 * The question with one more blank: the picked words blanked in `base` (the
 * card's question if it has blanks already, else its words), the first place
 * they appear outside a blank. Null when they are not there.
 */
export function addBlank(base: string, picked: string, hint?: string | null): { prompt: string; blanked: string; unit: string | null; article: string | null } | null {
  // The first place outside an existing blank.
  let from = 0
  for (;;) {
    const found = blankFor(base, picked, from)
    if (!found) return null
    const inside = [...base.matchAll(BLANK_AT)].some((match) => found.at >= match.index && found.at < match.index + match[0].length)
    if (!inside) {
      const gap = hint?.trim() ? `${BLANK} (${hint.trim()})` : BLANK
      return { prompt: base.slice(0, found.at) + gap + base.slice(found.at + found.words.length), blanked: found.words, unit: found.unit, article: found.article }
    }
    from = found.at + 1
  }
}

/**
 * The answer to each blank, read from the card's words: the question's words
 * between blanks are found in order and what lies between is each answer.
 * Null when the words no longer line up (the note was rewritten).
 */
export function answersOf(prompt: string | null, body: string): string[] | null {
  if (!prompt?.includes(BLANK)) return null
  const text = flat(body)
  const parts = flat(prompt).split(BLANK_AT).filter((_, n) => n % 2 === 0)
  // parts: the words before the first blank, between each, and after the last.
  const answers: string[] = []
  const head = parts[0].slice(-30)
  let start = head ? text.indexOf(head) : 0
  if (start < 0) return null
  start += head.length
  for (let n = 1; n < parts.length; n++) {
    const next = parts[n].trim()
    const last = n === parts.length - 1
    const cue = last ? next.slice(0, 30) : next
    const end = cue ? text.indexOf(cue, start) : last ? text.length : -1
    if (end < 0) return null
    const found = text.slice(start, end).trim()
    if (!found || found.length > 200) return null
    answers.push(found)
    start = end + (last ? 0 : next.length)
  }
  return answers
}

/** A number as written ("1,200", "3.5", "75"), or null when it is not one. */
const numberOf = (text: string): number | null => {
  const match = /^[-+−]?\d[\d,]*(?:\.\d+)?/.exec(text.replace(/^(?:an?\s+)/i, '').trim())
  return match ? Number(match[0].replace(/,/g, '').replace('−', '-')) : null
}

/**
 * Whether blanks should be asked together: numbers that add up (to one of
 * them, or to a total said in the words) give each other away when asked
 * apart: "25 L, 13 L, 3 L, about 41 L in all" lets you work out the third
 * from the other two. Gives back the reason in words, or null.
 */
export function addsUp(answers: string[], text: string): string | null {
  const numbers = answers.map(numberOf)
  if (numbers.length < 2 || numbers.some((one) => one === null)) return null
  const values = numbers as number[]
  const near = (a: number, b: number): boolean => Math.abs(a - b) <= Math.max(1, Math.abs(b) * 0.03)
  const sum = values.reduce((a, b) => a + b, 0)
  // One is the others' total.
  for (let n = 0; n < values.length; n++) {
    const rest = values.filter((_, m) => m !== n)
    if (rest.length > 1 && near(rest.reduce((a, b) => a + b, 0), values[n])) return `Asked apart they give each other away: ${rest.slice(0, -1).map(String).join(' plus ')} and ${rest.at(-1)} make ${values[n]}.`
  }
  // A total in the words around them.
  const said = [...flat(text).matchAll(/\d[\d,]*(?:\.\d+)?/g)].map((match) => Number(match[0].replace(/,/g, ''))).filter((one) => !values.includes(one))
  const total = said.find((one) => near(sum, one))
  if (total === undefined) return null
  return `Asked apart they give each other away: ${total} minus ${values.slice(0, -1).join(' minus ')} is ${values.at(-1)}.`
}

/**
 * Whether the picked words are one item of a list (a bullet among three or
 * more, or one of three or more things in a sentence, "albumin, fibrinogen and
 * globulins"): blanking items one at a time teaches each one's place in the
 * list, not the idea (Ali Abdaal, "your brain would pattern match the position
 * of the thing on the list"). Gives back how many items the list has, or 0.
 */
export function listItemCount(text: string, picked: string): number {
  const words = picked.trim().toLowerCase()
  if (!words) return 0
  const lines = text.split('\n')
  // A bullet or numbered line among three or more in a row.
  const bullet = /^\s*(?:[-*•–]|\d+[.)])\s+/
  for (let n = 0; n < lines.length; n++) {
    if (!bullet.test(lines[n]) || !lines[n].toLowerCase().includes(words)) continue
    let first = n
    let last = n
    while (first > 0 && bullet.test(lines[first - 1])) first--
    while (last < lines.length - 1 && bullet.test(lines[last + 1])) last++
    if (last - first + 1 >= 3) return last - first + 1
  }
  // One of three or more things in a sentence, joined by commas and "and" or "or".
  for (const sentence of text.split(/(?<=[.;:!?])\s+|\n/)) {
    const items = sentence.split(/,\s*(?:and\s+|or\s+)?|\s+(?:and|or)\s+/i).map((one) => one.trim().toLowerCase()).filter(Boolean)
    if (items.length < 3 || !sentence.includes(',')) continue
    // The picked words are a whole item, or the item's last words (the start of the sentence leads in).
    if (items.some((item, n) => item === words || ((n === 0 || n === items.length - 1) && (item.endsWith(` ${words}`) || item.startsWith(`${words} `)))))
      return items.length
  }
  return 0
}

/** The question with one blank asked and the others filled back in: one card of several asked apart. */
export function onlyBlank(prompt: string, answers: string[], keep: number): string {
  let n = -1
  return prompt.replace(BLANK_AT, (gap) => (++n === keep ? gap : answers[n] ?? gap))
}
