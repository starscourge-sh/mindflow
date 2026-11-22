/**
 * What an insight must pass in code before it is shown, and the Feed's "Check back" post: the app works out the facts,
 * the model only rewords, and what fails a check is dropped, never shown. No Electron and no database in it, so a unit
 * test runs it as it is (test/insight-checks.test.ts).
 */

/** Words too common to say what a line is about. */
const STOP = new Set(('also about after again against always another anything because been before being both could does doing done each even ever every '
  + 'everything from have here into just like little made make many maybe might more most much must never nothing only other over perhaps really '
  + 'same seem should side since some someone something still such than that their them then there these they thing things this those through '
  + 'turn turned under very want what when where which while will with without would your yours idea ideas note notes word words instead quite').split(' '))

/** Lowercase, curly quotes straight, apostrophes gone, every other mark a space: "Jimmy’s rule," reads "jimmys rule". */
export const flat = (said: string): string => said.toLowerCase().replace(/['’`]/g, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
const wordsOf = (said: string): string[] => flat(said).split(' ').filter(Boolean)
/** A word's root, near enough: "silence" and "silent", "friend" and "friends" count as one. */
const root = (word: string): string => (word.length > 5 ? word.slice(0, 5) : word.replace(/s$/, ''))
/** The words that say what a line is about: four letters or more, not a stop word. */
export const meaningful = (said: string): Set<string> => new Set(wordsOf(said).filter((word) => word.length >= 4 && !STOP.has(word)).map(root))
const shares = (a: Set<string>, b: Set<string>): boolean => [...a].some((word) => b.has(word))
/** Said inside the text, word for word, case, marks and spaces aside. */
export const quotedIn = (quote: string, text: string): boolean => {
  const said = flat(quote)
  return !!said && ` ${flat(text)} `.includes(` ${said} `)
}
const clean = (said: string): string => said.replace(/\s+/g, ' ').trim().replace(/^["“”'‘]+|["“”'’]+$/g, '').trim()

/** A note that tells you to do something, not one that holds a view: it starts with what to do. */
const INSTRUCTION = /^(please\s+)?(look into|make sure|remember to|don'?t forget|delete|remove|add|send|check|fix|set( up)?|prep(are)?|call|email|buy|book|ask|update|install|create|move|clean|finish|start|try|read|watch|schedule|follow up|reply|pay|submit|turn (on|off))\b/i

/** Reframe: the view the note holds, quoted from it, and the other side of it. */
export type Reframe = { view: string; other: string }
/**
 * Kept only when it names what it turns around: `view` is in the note word for word (four words at least); `other` is
 * at most 20 words, shares a word that means something with the view or the note, and is no question that only says
 * the view again. Anything else: null, and the card is dropped.
 */
export const checkReframe = (view: string, other: string, note: string): Reframe | null => {
  const v = clean(view)
  const o = clean(other)
  if (wordsOf(v).length < 4 || !quotedIn(v, note)) return null
  // A to-do is no view to turn around ("Delete unused resources today" → "Keep unused resources today", the user, 22 Nov).
  if (INSTRUCTION.test(v)) return null
  const count = wordsOf(o).length
  if (count < 3 || count > 20) return null
  const said = meaningful(o)
  if (!shares(said, meaningful(`${v} ${note}`))) return null
  // Only the view said again: its words, or the view whole inside it.
  if (quotedIn(v, o)) return null
  const fromView = meaningful(v)
  // The view said again in other words, question or not: most of what it says is the view's own words.
  if ([...said].filter((word) => fromView.has(word)).length >= Math.max(1, said.size * 0.6)) return null
  return { view: v, other: o }
}

/** A word that means something, said in both texts as it is written in the first: none, null. */
export const sharedWord = (a: string, b: string): string | null => {
  const inB = new Set(wordsOf(b))
  return wordsOf(a).find((word) => word.length >= 5 && !STOP.has(word) && inB.has(word)) ?? null
}

/** Connect: what both notes say, word for word, and one sentence on why they belong together. */
export type Connect = { thread: string; why: string }
/**
 * Kept only when it names the thread: `thread` is said in each note (a meaningful word in it), and `why` is at most 30
 * words and shares a meaningful word with each note. Anything else: null.
 */
export const checkConnect = (thread: string, why: string, notes: [string, string]): Connect | null => {
  const t = clean(thread)
  const w = clean(why)
  if (!meaningful(t).size || wordsOf(t).length > 6 || !notes.every((one) => quotedIn(t, one))) return null
  const count = wordsOf(w).length
  if (count < 4 || count > 30) return null
  const said = meaningful(w)
  if (!notes.every((one) => shares(said, meaningful(one)))) return null
  return { thread: t, why: w }
}

/** A note's properties, read whichever name they were saved under (a key, or the label a person typed). */
const field = (fields: Record<string, unknown>, ...keys: string[]): string | null => {
  for (const key of keys) {
    const value = fields[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return null
}
const CALL = ['call', 'The call']
const REOPEN = ['reopen', 'Reopen only if']
const ASK = ['ask', 'Then ask']
const BACK = ['back', 'Check back on']

/** A decision: a note of that kind, or one holding a call (what was decided), what would reopen it, or decided as its status. */
export const isDecision = (kind: string | null | undefined, fields: Record<string, unknown> | null | undefined): boolean =>
  kind === 'decision' || (!!fields && (!!field(fields, ...CALL) || !!field(fields, ...REOPEN) || fields.state === 'Decided'))

/** What an insight may be made from: every passage but a decision (a Feed post, `resurface`, may still be one). */
export const forInsights = <T extends { decision?: boolean }>(pool: T[], level: 'resurface' | 'connect' | 'reframe'): T[] => (level === 'resurface' ? pool : pool.filter((one) => !one.decision))

/** The calendar day of a moment, where the person is: "2026-11-24". */
export const localDay = (at: string | Date): string => {
  const d = new Date(at)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const dayNumber = (day: string): number => Date.UTC(Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1, Number(day.slice(8, 10))) / 86_400_000

/** Days before its check-back date the post comes, and days after it stays. */
export const BACK_BEFORE = 2
export const BACK_AFTER = 7
/** A decision's check back, as the Feed shows it: only what the note holds. */
export type CheckBack = { back: string; call: string | null; ask: string | null; reopen: string | null; done?: 'held' | 'dismissed' }
/**
 * The Feed's "Check back" post for a decision, or null: shown from two days before its check-back date to a week after,
 * until it is reopened (a status other than Decided), decided again, answered or said to still hold in that time, or
 * dismissed (`dismissedOn`, the day it was dismissed for this date). Needs a call or a question to show. Said to hold
 * or dismissed today, it stays where it was for the rest of the day, saying so (`done`), so nothing under it moves.
 */
export const checkBackOf = (kind: string | null | undefined, fields: Record<string, unknown>, today: string, dismissedOn: string | null = null): CheckBack | null => {
  if (!isDecision(kind, fields)) return null
  const back = field(fields, ...BACK)
  if (!back || !/^\d{4}-\d\d-\d\dT/.test(back)) return null
  const held = field(fields, 'heldAt')
  const words = { call: field(fields, ...CALL), ask: field(fields, ...ASK), reopen: field(fields, ...REOPEN) }
  if (held && localDay(held) === today && (words.call || words.ask)) return { back, ...words, done: 'held' }
  if (dismissedOn) return dismissedOn === today && (words.call || words.ask) ? { back, ...words, done: 'dismissed' } : null
  const backDay = localDay(back)
  const from = dayNumber(backDay) - BACK_BEFORE
  const now = dayNumber(today)
  if (now < from || now > dayNumber(backDay) + BACK_AFTER) return null
  if (typeof fields.state === 'string' && fields.state && fields.state !== 'Decided') return null
  // Decided again, answered or said to hold since the window opened: done for this date.
  for (const key of ['decidedAt', 'answeredAt', 'heldAt']) {
    const at = fields[key]
    if (typeof at === 'string' && /^\d{4}-/.test(at) && dayNumber(localDay(at)) >= from) return null
  }
  if (!words.call && !words.ask) return null
  return { back, ...words }
}

/** Days a decision is asked about again when it had no interval of its own. */
export const HOLD_DAYS = 30
/**
 * "Still holds": its next check-back date, the same interval on (from when it was last decided or said to hold, else
 * made, to its date), or 30 days; counted from today when the date has passed. Noon, as every check-back date is.
 */
export const holdNext = (fields: Record<string, unknown>, made: string, now = new Date()): { back: string; heldAt: string } => {
  const back = field(fields, ...BACK)
  const since = field(fields, 'heldAt') ?? field(fields, 'decidedAt') ?? made
  const days = back ? Math.round(dayNumber(localDay(back)) - dayNumber(localDay(since))) : 0
  const step = days >= 1 ? days : HOLD_DAYS
  const start = back && dayNumber(localDay(back)) > dayNumber(localDay(now)) ? new Date(back) : now
  const next = new Date(start.getFullYear(), start.getMonth(), start.getDate() + step, 12)
  return { back: next.toISOString(), heldAt: now.toISOString() }
}
