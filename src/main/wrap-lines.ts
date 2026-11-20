import type { Shape } from './understand'

/**
 * Wrapped's lead-ins: a few words over each page. The app writes each page's plain statement itself, from its facts
 * ("You caught more than last week.", wrap-story.tsx `wrapSays`); on a Mac with Apple Intelligence the model is asked
 * only to say that one statement again in fresh words, in the voice of the story's look. Each answer is checked here; one
 * that fails is replaced by the plain statement, never a blank. The page's own sentence under it keeps every number.
 *
 * Why rephrase and not write: asked to say how a page's facts felt against last time (one request a story, 20 Nov), the
 * on-device model got the direction backwards ("A quiet stretch than the last." over more focus) or made facts up ("Late
 * hours kept the path clear." with no hour given). Judging is where a 3B model slips; saying one given sentence again is
 * what it does well. Kept apart from Electron so a test can read it alone.
 */

/** Which way a page's statement leans, so a rephrasing must lean the same: `null` for none (a day, an hour, a word). */
export type Lean = 'up' | 'down' | 'same' | null
/** A page's plain statement; `names`: the things it names (a tag, a weekday, a time of day) that any rephrasing keeps; `span`: the story's. */
export type WrapPage = { page: string; says: string; lean: Lean; names: string[]; span: 'week' | 'month' }

export const LEAD_MOST = 8

/** The voices a story can speak in, all original types; every look speaks in pulp (wrap-story.tsx VOICE). */
export const VOICES = {
  warm: 'a warm, plain-spoken friend',
  librarian: 'a wry librarian, dry and bookish',
  noir: 'a hard-boiled detective narrating a case, terse and dark',
  // Every look's voice since 21 Nov (the user's pick): an original type, never a named director or film.
  pulp: 'a cocky pulp-paperback narrator with swagger: snappy, punchy, deadpan, darkly funny understatement, like the voice-over of a stylish heist film (e.g. "Bigger haul than last week. Nobody is complaining.")'
} as const
export type Voice = keyof typeof VOICES

/** The model's instructions for one statement, in a voice: the voice changes the wording and nothing else. */
export const wrapInstructions = (voice: Voice): string => [
  'You say one short line from a notebook app again, in fresh words, for a card in a story about someone\'s week or month. Talk to them as "you", in natural English a person would say aloud.',
  'Keep its meaning exactly: keep every name in it (a #tag, a weekday, a time of day, a kind of person) and the words week or month, and keep its direction (more stays more, less stays less, as much stays as much).',
  `Add nothing: no numbers, no reason, no feeling, no praise, no advice, no exclamation mark. One sentence, at most ${LEAD_MOST} words.`,
  `Speak as ${VOICES[voice]}; the voice changes only the wording, never what is said.`,
  'For example, "Your reading slowed this week." could become "Fewer pages turned this week."'
].join(' ')

/** The line, and what any rephrasing must keep, said outright: a 3B model keeps a rule it is handed better than one it infers. */
export const wrapPrompt = (page: WrapPage): string => {
  const span = /\bmonth\b/.test(page.says) ? 'month' : /\bweek\b/.test(page.says) ? 'week' : null
  return [
    `The line: "${page.says}"`,
    page.lean === 'up' ? 'It says more: keep more.' : page.lean === 'down' ? 'It says less: keep less or fewer.' : page.lean === 'same' ? 'It says as much as before: never more or less.' : 'It compares with nothing: never say more, less, fewer or than.',
    page.names.length ? `Keep these words: ${page.names.join(', ')}.` : '',
    span ? `It is about a ${span}: say ${span}, never ${span === 'month' ? 'week' : 'month'}.` : ''
  ].filter(Boolean).join('\n')
}

export const wrapSchema: Shape = {
  type: 'object',
  properties: [{ name: 'line', type: 'string', description: `The line said again in fresh words, same meaning, at most ${LEAD_MOST} words, no digits or number words` }]
}

/** The instructions' own example said back is copying, not rephrasing. */
const EXAMPLE = 'fewer pages turned this week'
/** Words that say a count went up, or down: a rephrasing must lean the way its statement does. */
const UP = /\b(more|most|fuller|busier|bigger|grew|grow|grown|rose|risen|rise|climbed|richer|longer|up|higher|increased|extra|outpaced|surpassed)\b/i
const DOWN = /\b(less|least|fewer|fewest|quieter|quietest|slower|slowest|smaller|lighter|shorter|fell|fallen|dipped|down|dropped|declined|lower|eased|shrank|thinner|slipped|waned|faded)\b/i
/** Number words a lead-in may not hold: the page's sentence says every number. ("one" stays: "a quieter one".) */
const NUMBER_WORDS = /\b(zero|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|million|dozen|dozens|half|twice|thrice|double|triple)\b/i
/** A reason, a feeling put in the person, or a grade: the statement holds none, so a rephrasing may not add one. */
const ADDS = /\b(because|due to|thanks to|since you|which is why|so that|felt|feel|feeling|happy|proud|tired|weary|excited|eager|love|loved|enjoy|enjoyed|joy|passion|effort|dedicat\w*|determin\w*|motivat\w*|inspir\w*|stress\w*|struggl\w*|hard work|great|amazing|impressive|well done|keep it up|productive|lazy|must have|probably)\b/i
/** A time of day, or "new", may be said another way, as long as it still means that. */
const SAME_AS: Record<string, string[]> = {
  new: ['new', 'first', 'fresh', 'arrived', 'debuted', 'newcomer'],
  morning: ['morning', 'mornings', 'dawn', 'sunrise', 'daybreak', 'early'],
  afternoon: ['afternoon', 'afternoons', 'midday'],
  evening: ['evening', 'evenings', 'dusk', 'sunset', 'sundown', 'nightfall'],
  night: ['night', 'nights', 'midnight', 'dark', 'nighttime', 'late']
}
/** The counted thing a line is about, and the word stems that still say it. */
const DOING: Record<string, string[]> = {
  caught: ['caught', 'catch', 'gather', 'collect', 'captur', 'found', 'seiz', 'pull', 'took', 'pick', 'snag', 'net', 'hauled', 'haul'],
  focused: ['focus', 'attention', 'concentrat', 'attend']
}
const plain = (text: string): string => text.toLowerCase().replace(/[^\p{L}\s]/gu, '').replace(/\s+/g, ' ').trim()

/** Why a rephrasing is not kept, or null when it may stand over its page in place of the plain statement. */
export function whyDropped(said: string, page: WrapPage): string | null {
  if (!said) return 'empty'
  if (/\d/.test(said) || NUMBER_WORDS.test(said)) return 'a number'
  if (/!|\n|\S: /.test(said) || /[\u{1F300}-\u{1FAFF}]/u.test(said)) return 'not one plain sentence'
  if (said.split(' ').length > LEAD_MOST) return `over ${LEAD_MOST} words`
  if (ADDS.test(said)) return 'adds a reason or a feeling'
  if (plain(said) === EXAMPLE) return 'the example said back'
  // A week said in a month's story ("Morning thoughts surfaced this week.", 21 Nov), or the other way.
  if (new RegExp(`\\b${page.span === 'month' ? 'week' : 'month'}s?\\b`, 'i').test(said)) return 'the wrong span'
  // A # put on a word that is not a tag in the line ("A quiet #worker this #month.", 21 Nov).
  if ((said.match(/#[\p{L}\w-]+/gu) ?? []).some((tag) => !page.says.toLowerCase().includes(tag.toLowerCase()))) return 'a # on a word that is no tag'
  // "Came up" and the like name a thing, not a rise.
  const leans = said.replace(/\b(came|comes|turned|turns|showed|shows|cropped|crops|popped|pops|kept|keeps) up\b/gi, '')
  const up = UP.test(leans)
  const down = DOWN.test(leans)
  if (page.lean === 'up' && (!up || down)) return 'lost "more"'
  if (page.lean === 'down' && (!down || up)) return 'lost "less"'
  if (page.lean === 'same' && (up || down)) return 'lost "about the same"'
  // A line with no lean gains none ("More thoughts surfaced in the evening." over "Your ideas came in the evening.", 21 Nov).
  if (page.lean === null && (down || /\b(more|than)\b/i.test(leans))) return 'adds a more or a less'
  const words = plain(said).split(' ')
  // What was counted stays what was counted ("Fewer words penned this week." over "You focused less", 21 Nov).
  for (const [verb, ways] of Object.entries(DOING)) if (new RegExp(`\\b${verb}\\b`).test(page.says) && !ways.some((way) => words.some((word) => word.startsWith(way)))) return `lost "${verb}"`
  for (const name of page.names) {
    const ways = SAME_AS[name.toLowerCase()] ?? [plain(name)]
    if (!ways.some((way) => (way.includes(' ') ? plain(said).includes(way) : words.includes(way) || words.includes(`${way}s`)))) return `lost "${name}"`
  }
  return null
}

/** A rephrasing tidied and checked; the plain statement when it fails. */
export function leadFor(said: unknown, page: WrapPage): string {
  if (typeof said !== 'string') return page.says
  // Quotation marks round the whole of it come off; a name quoted inside keeps its own.
  const tidy = said.replace(/\s+/g, ' ').trim().replace(/^["“]([^"“”]*)["”]$/, '$1').trim()
  if (whyDropped(tidy, page)) return page.says
  // A capital to start, unless it starts with a tag or a site's name; a full stop to end.
  return tidy.replace(/^\p{Ll}(?![^\s]*\.\S)/u, (letter) => letter.toUpperCase()).replace(/(?<![.?…])$/, '.')
}

/**
 * The test stand-in's rephrasing (HALIGTREE_QA_CAPS=ai), marked as a stand-in's; the first page's holds a number, so a
 * probe sees the check drop it and that page show its plain statement.
 */
export const standLine = (page: WrapPage, n: number): { line: string } => ({ line: n === 0 ? 'Twice the stand-in counted 3 things.' : `${page.says.replace(/\.$/, '')} (stand-in).` })
