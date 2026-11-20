import type { Shape } from './understand'

/**
 * Wrapped's lead-ins, written by Apple Intelligence on this Mac: a few words over each page, on how its facts feel
 * against last time ("A quieter week than the last."), never a number. The page's own sentence under it keeps every
 * number, as the app counted it. One request a story, each lead-in checked here; one that fails is left out and its page
 * shows its sentence alone. Kept apart from Electron so a test can read it alone.
 *
 * Why no numbers: asked for whole lines, the on-device model restated the counts as flat lists ("You caught 23 things
 * this week, 9 fewer than last week, 32.", 20 Nov). Feel is what it does well; counting stays with the app.
 */

/** A page's key facts, in words with no numbers ("more things caught than last month"); `most`: a lead-in is at most LEAD_MOST words. */
export type WrapPage = { page: string; facts: string[] }

export const LEAD_MOST = 8

export const WRAP_INSTRUCTIONS = [
  'You write the lead-ins of a short story about someone\'s month or week in their notebook app: a few words over each page, shown as cards turned one by one. The page itself says the numbers; you never do.',
  'Each lead-in is a few words, warm and plain, about how that page\'s facts feel next to last time, like a friend who noticed. Use only that page\'s facts. Never a digit or a number word, never a reason, a cause or a feeling you were not given. Never grade them or urge them on. No exclamation marks.',
  'Keep it true to the facts: more stays more, fewer stays fewer, and nothing happens "again" unless a fact says so. Whole, natural English, as a person would say it. Say it fresh: never the facts\' own words, never an example\'s. Begin each one differently, and use "than" at most once in the story.',
  // Shown as facts turned into words, since given the examples alone it copied them, and given facts it said them back (20 Nov).
  'How facts become a lead-in, for example: "fewer things caught than last week" becomes "A quieter week than the last."; "ideas came most in the evening" becomes "Your ideas kept late hours."; "#latin is new since last month" becomes "Latin crept up on you."; "most of it on “Thesis”" becomes "“Thesis” had your attention."; "the busiest day was a Monday" becomes "Monday carried the week."'
].join(' ')

/** The examples' own lead-ins: one said back word for word is the model copying, not writing. */
const EXAMPLES = ['a quieter week than the last', 'your ideas kept late hours', 'latin crept up on you', 'thesis had your attention', 'monday carried the week']
/** Words that say a count went up, or down: a lead-in must lean the way its facts do. */
const UP = /\b(more|fuller|busier|bigger|grew|rose|richer|longer|up)\b/i
const DOWN = /\b(less|fewer|quieter|quiet|slower|smaller|lighter|shorter|fell|dipped|down)\b/i
const plain = (text: string): string => text.toLowerCase().replace(/[^\p{L}\s#]/gu, '').replace(/\s+/g, ' ').trim()

/** The prompt: each page's facts under its name, in story order. */
export const wrapPrompt = (pages: WrapPage[]): string => pages.map((one) => `PAGE ${one.page}. Facts: ${one.facts.join('; ')}.`).join('\n')

/** The shape asked for: a lead-in for each page, its page one of those given. */
export const wrapSchema = (pages: WrapPage[]): Shape => ({
  type: 'object',
  properties: [{
    name: 'leads', type: 'array', min: 1, max: pages.length, description: 'One lead-in for each PAGE, in the order given',
    items: { type: 'object', properties: [
      { name: 'page', type: 'string', choices: pages.map((one) => one.page), description: 'The PAGE this lead-in is for' },
      { name: 'lead', type: 'string', description: `A few words, under ${LEAD_MOST}, no digits or number words, about how this page's facts feel compared with last time. Only this page's facts; no reasons, causes or feelings that are not given` }
    ] }
  }]
})

/** Number words a lead-in may not hold: the page's sentence says every number. ("one" stays: "a quieter one".) */
const NUMBER_WORDS = /\b(zero|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|million|dozen|dozens|half|twice|thrice|double|triple|once)\b/i

/** Words that give a reason or put a feeling in the person: the model was told never to. */
const SAYS_WHY = /\b(because|due to|thanks to|which is why|that's why|that is why|so that|you (?:felt|feel|must have|probably|seemed|were feeling))\b/i

/**
 * A lead-in that may stand over its page, tidied; null when the page shows its sentence alone: one with a digit or a
 * number word, over LEAD_MOST words, giving a reason or a feeling, or only a fact or an example said back.
 */
export function checkLead(lead: unknown, page: WrapPage): string | null {
  if (typeof lead !== 'string') return null
  // Quotation marks round the whole of it come off; a name quoted inside keeps its own.
  const said = lead.replace(/\s+/g, ' ').trim().replace(/^["“]([^"“”]*)["”]$/, '$1').trim()
  if (!said || /\d|!|\n|\S: /.test(said) || /[\u{1F300}-\u{1FAFF}]/u.test(said) || NUMBER_WORDS.test(said) || SAYS_WHY.test(said)) return null
  if (said.split(' ').length > LEAD_MOST) return null
  const words = plain(said)
  if (EXAMPLES.includes(words) || page.facts.some((fact) => plain(fact) === words || plain(fact).startsWith(words))) return null
  // Turned the wrong way ("A quiet stretch than the last." over more focus, 20 Nov), a "than" with nothing to compare
  // ("Days passed steadily than before."), or something come back that no fact says came back.
  const facts = page.facts.join(' ')
  if ((/\bmore\b/.test(facts) && !/\b(fewer|less)\b/.test(facts) && DOWN.test(said)) || (/\b(fewer|less)\b/.test(facts) && !/\bmore\b/.test(facts) && UP.test(said))) return null
  if ((/\bthan\b/i.test(said) && !/\b(\w+er|more|less|fewer)\b.*\bthan\b/i.test(said)) || /\b(again|returned)\b/i.test(said)) return null
  // A capital to start, unless it starts with a site's name (youtube.com stays as it is written); a full stop to end.
  return said.replace(/^\p{Ll}(?![^\s]*\.\S)/u, (letter) => letter.toUpperCase()).replace(/(?<![.?…])$/, '.')
}

/** The lead-ins kept, by page: only pages asked for, the first for each, each checked. */
export function keptLeads(said: unknown, pages: WrapPage[]): Record<string, string> {
  const out: Record<string, string> = {}
  const leads = said && typeof said === 'object' && Array.isArray((said as { leads?: unknown }).leads) ? (said as { leads: { page?: unknown; lead?: unknown }[] }).leads : []
  for (const one of leads) {
    const page = pages.find((p) => p.page === one?.page)
    if (!page || page.page in out) continue
    const kept = checkLead(one.lead, page)
    if (kept) out[page.page] = kept
  }
  return out
}

/**
 * The test stand-in's lead-ins (HALIGTREE_QA_CAPS=ai), marked as a stand-in's; the first page's holds a number, so a
 * probe sees the check drop it and that page show its sentence alone.
 */
export const standLeads = (pages: WrapPage[]): { leads: { page: string; lead: string }[] } => ({
  leads: pages.map((one, n) => ({ page: one.page, lead: n === 0 ? 'Twice the stand-in counted 3 things.' : `A stand-in's lead for ${one.page}.` }))
})
