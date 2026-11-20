import type { Shape } from './understand'

/**
 * Wrapped's lines, written by Apple Intelligence on this Mac from the facts the app counted and nothing else
 * (wrap-story.tsx `wrapFacts`): one request a story, one line a page, each checked here before it is shown. A line
 * with a number the page's facts do not hold, past its word limit, or saying why something happened, is dropped,
 * and that page keeps its own sentence. Kept apart from Electron so a test can read it alone.
 */

/**
 * A page's facts, in plain words as the page counts them ("87 things caught"); `above`: what the page already shows over
 * the line (its big number or heading), so the line follows it and need not repeat it; `most`: the line's word limit.
 */
export type WrapPage = { page: string; facts: string[]; above?: string; most: number }

// The on-device model, given facts as "label: value" lists, copied them back as its lines (20 Nov, the first real
// request); given every fact as a phrase, it listed them all in one flat sentence (the second). So: plain phrases, what
// the page shows said apart, one or two facts picked, and examples of a line written.
export const WRAP_INSTRUCTIONS = [
  'You write the lines of a short story about someone\'s month or week in their notebook app, one line for each page, shown as cards turned one by one.',
  'Each line is one short sentence in your own words, speaking to them as "you", warm and plain, like a friend who noticed. Pick the one or two facts that matter most and leave the rest to the page: never list them all, never copy them out, never speak of pages, headings or lines.',
  'Use only that page\'s facts. Write every number in digits, exactly as given. Never add a number, name, date, feeling, reason or cause that is not in the facts. Never grade them or urge them to do more. No exclamation marks.',
  'Begin each line differently.',
  'Examples of good lines.',
  'Facts: 3 h 10 min of focus; 7 sessions; most of it on “Essay plan”, 2 h. Line: Most of your 3 h 10 min went to “Essay plan”, over 7 sessions.',
  'Facts: 12 days in a row with something caught; 3 May to 14 May. Line: From 3 May to 14 May, you came back 12 days running.',
  'Facts: April; 5 more things caught than last month (30). Line: That was April, every page of it yours.'
].join(' ')

/** The prompt: each page's facts under its name, in story order. */
export const wrapPrompt = (pages: WrapPage[]): string =>
  pages.map((one) => `PAGE ${one.page}. Under ${one.most} words.${one.above ? ` Shown above the line already: ${one.above}.` : ''}\nFacts: ${one.facts.join('; ')}.`).join('\n\n')

/** The shape asked for: a line for each page, its page one of those given. */
export const wrapSchema = (pages: WrapPage[]): Shape => ({
  type: 'object',
  properties: [{
    name: 'lines', type: 'array', min: 1, max: pages.length, description: 'One line for each PAGE, in the order given',
    items: { type: 'object', properties: [
      { name: 'page', type: 'string', choices: pages.map((one) => one.page), description: 'The PAGE this line is for' },
      { name: 'line', type: 'string', description: 'One short, whole sentence for this page, as said aloud to a friend, under the page\'s word limit: one or two of its facts, never a list. Use only the facts given for this page; every number exactly as given, in digits; no invented feelings, reasons or causes' }
    ] }
  }]
})

const WORDS: Record<string, number> = { two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, hundred: 100, dozen: 12, half: 0.5, twice: 2, double: 2 }

/** Every number in some words: digits as written (thousands' commas taken out), and number words as their value. */
export function numbersIn(text: string): string[] {
  const digits = [...text.matchAll(/\d+(?:[.,]\d+)*/g)].map((one) => String(Number(one[0].replace(/,(?=\d{3}\b)/g, ''))))
  const words = (text.toLowerCase().match(/[a-z]+/g) ?? []).filter((word) => word in WORDS).map((word) => String(WORDS[word]))
  return [...digits, ...words]
}

/** Words that give a reason or put a feeling in the person: the model was told never to, and a line that does is not shown. */
const SAYS_WHY = /\b(because|due to|thanks to|which is why|that's why|that is why|you (?:felt|must have|probably|seemed|were feeling))\b/i

/**
 * Whether a line may stand on its page: every number in it is one of the page's facts', it is under its word limit,
 * and it gives no reason or feeling. Its words, tidied, when it may; null when the page keeps its own sentence.
 */
export function checkLine(line: unknown, page: WrapPage): string | null {
  // Facts copied out as a list ("things caught: 87" a line), or words about the card itself, are not a line.
  if (typeof line !== 'string' || /\n|\S: |\b(heading|large type|this line|the page)\b/i.test(line.trim())) return null
  // Quotation marks round the whole line (asked not to) come off; a name quoted at its end keeps its own.
  const said = line.replace(/\s+/g, ' ').trim().replace(/^["“]([^"“”]*)["”]$/, '$1').trim()
  // Three commas or more is the facts run together as a list ("You spent 4 h 5 min on 6 sessions, most on …, 2 h 30
  // min, 40 more minutes than last week, 205"), the way the model wrote when it was not a sentence.
  if (!said || said.split(' ').length > page.most || (said.match(/,/g) ?? []).length >= 3 || /[!\u{1F300}-\u{1FAFF}]/u.test(said) || SAYS_WHY.test(said)) return null
  const all = [...page.facts, page.above ?? ''].join(' ')
  // An example's own names said back (the small model copies its examples) are never this person's.
  if (['April', 'May', 'Essay plan'].some((word) => said.includes(word) && !all.includes(word))) return null
  const given = new Set(numbersIn(all))
  // A capital to start, unless it starts with a site's name (youtube.com stays as it is written).
  return numbersIn(said).every((n) => given.has(n)) ? said.replace(/^\p{Ll}(?![^\s]*\.\S)/u, (letter) => letter.toUpperCase()) : null
}

/** The lines kept, by page: only pages asked for, the first line for each, each checked. */
export function keptLines(said: unknown, pages: WrapPage[]): Record<string, string> {
  const out: Record<string, string> = {}
  const lines = said && typeof said === 'object' && Array.isArray((said as { lines?: unknown }).lines) ? (said as { lines: { page?: unknown; line?: unknown }[] }).lines : []
  for (const one of lines) {
    const page = pages.find((p) => p.page === one?.page)
    if (!page || page.page in out) continue
    const kept = checkLine(one.line, page)
    if (kept) out[page.page] = kept
  }
  return out
}

/**
 * The test stand-in's lines (HALIGTREE_QA_CAPS=ai): each page's first fact said back, marked as a stand-in's; the first
 * page's line carries a number it was never given, so a probe sees the check drop it and that page keep its sentence.
 */
export const standLines = (pages: WrapPage[]): { lines: { page: string; line: string }[] } => ({
  lines: pages.map((one, n) => ({ page: one.page, line: n === 0 ? `A stand-in counted 98765 things here.` : `${one.facts[0]}, in a stand-in's words.` }))
})
