/**
 * The study helpers that need no database: shared by the main process, the
 * windows and the tests (test/study.test.ts). Cards written inside a note
 * ("question :: answer"), when a gem counts as slipping, which practice
 * bucket a card falls in, and the word match that marks a blurt.
 */

/** A gem missed this many times in Review is slipping: Review offers to rewrite, split or set it aside. */
export const LEECH_AT = 4

/** Whether a gem with this many misses is slipping. A miss is an Again on a card already seen. */
export const isLeech = (lapses: number): boolean => Number(lapses) >= LEECH_AT

/** One card written on a line: the words before :: ask, the words after answer. */
export type LineCard = { question: string; answer: string }

/**
 * A line that is a card: "question :: answer", with a space either side of
 * the ::, so `std::vector` or a time like 10::30 never counts. Both sides
 * need words. Null for any other line.
 */
export function lineCard(line: string): LineCard | null {
  const match = /^(.*?\S)\s+::\s+(\S.*)$/.exec(line.trim())
  if (!match) return null
  const question = match[1].replace(/^[-*+]\s+|^\d+[.)]\s+|^\[[ x]\]\s+/i, '').trim()
  const answer = match[2].trim()
  return question && answer ? { question, answer } : null
}

type Node = { type?: string; text?: string; content?: Node[] }

/**
 * Every card line in a note, in order: a stored editor document, or plain
 * text and Markdown. Code is skipped, so :: in a code block stays code.
 */
export function lineCardsIn(body: unknown): LineCard[] {
  const found: LineCard[] = []
  const add = (line: string): void => {
    const card = lineCard(line)
    if (card) found.push(card)
  }
  if (typeof body === 'string') {
    let fenced = false
    for (const line of body.split('\n')) {
      if (/^\s*```/.test(line)) fenced = !fenced
      else if (!fenced) add(line)
    }
    return found
  }
  const text = (node: Node): string => node.text ?? (node.content ?? []).map(text).join('')
  const walk = (node: Node | null | undefined): void => {
    if (!node || node.type === 'codeBlock') return
    if (node.type === 'paragraph' || node.type === 'heading') return add(text(node))
    node.content?.forEach(walk)
  }
  walk(body as Node)
  return found
}

/**
 * Lines matched to the cards a note already has, so a card keeps its
 * schedule while its line is edited. Same question first; then what is left
 * pairs up in order, an edited line keeping its card; a line gone drops its
 * card, a new line makes one.
 */
export function matchLineCards<T extends { id: string; prompt: string | null }>(had: T[], lines: LineCard[]): { keep: { card: T; line: LineCard }[]; add: LineCard[]; drop: T[] } {
  const left = [...had]
  const keep: { card: T; line: LineCard }[] = []
  const unmatched: LineCard[] = []
  for (const line of lines) {
    const at = left.findIndex((card) => (card.prompt ?? '').trim() === line.question)
    if (at >= 0) keep.push({ card: left.splice(at, 1)[0], line })
    else unmatched.push(line)
  }
  const add: LineCard[] = []
  for (const line of unmatched) {
    const card = left.shift()
    if (card) keep.push({ card, line })
    else add.push(line)
  }
  return { keep, add, drop: left }
}

/** The five practice rounds above Review, each one kind of card from all your gems. */
export type Bucket = 'weak' | 'learning' | 'old' | 'fresh' | 'new'
export const BUCKETS: { id: Bucket; label: string }[] = [
  { id: 'weak', label: 'Weak spots' },
  { id: 'learning', label: 'Finish learning' },
  { id: 'old', label: 'Revive old' },
  { id: 'fresh', label: 'Keep fresh' },
  { id: 'new', label: 'New' }
]
/** Not looked at for this many days, a card is old. */
export const OLD_DAYS = 30

/**
 * Which bucket a card is in, the way an exam's readiness counts them:
 * never seen is new; missed last time or often is struggling (a weak spot);
 * not yet likely to be known on its next day is still learning; then, of
 * the ones you know, those untouched for a month are old, the rest fresh.
 */
export function bucketOf(card: { seen: boolean; last: number | null; lapses: number; recall: number; daysSince: number }, retention: number): Bucket {
  if (!card.seen) return 'new'
  if (struggling(card.last, card.lapses)) return 'weak'
  if (card.recall < retention) return 'learning'
  return card.daysSince >= OLD_DAYS ? 'old' : 'fresh'
}
/** Missed last time, or three times or more: an exam's "struggling" and practice's weak spots. */
export const struggling = (last: number | null | undefined, lapses: number): boolean => last === 1 || Number(lapses) >= 3

const STOP = new Set(('the and for are but not you all any can had her was one our out his has how its who did get may him now see two way use she too own via from with that this what when where which while will would there their they them then than have been were into about after before over under your yours also just only very some such more most other each both these those because could should might must shall upon onto between through during without within again once here why does done doing being made make many much like even still well back yet ever never always often itself')
  .split(' '))
/** The words that carry meaning: no short words or stop words, a plural's s taken off. */
export function keyWords(text: string): Set<string> {
  const out = new Set<string>()
  for (const raw of text.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').match(/[\p{L}\p{N}]+/gu) ?? []) {
    if (raw.length < 3 || STOP.has(raw)) continue
    out.add(raw.length > 4 && raw.endsWith('s') && !raw.endsWith('ss') ? raw.slice(0, -1) : raw)
  }
  return out
}

/**
 * Whether a blurt mentions a gem, by the words they share: a quarter of the
 * gem's key words, at least one and at most three are needed. Plain on
 * purpose: it is a nudge toward what you left out, not a mark.
 */
export function mentions(blurt: Set<string>, gem: string): boolean {
  const words = keyWords(gem)
  if (!words.size) return true
  let hits = 0
  for (const word of words) if (blurt.has(word)) hits++
  return hits >= Math.max(1, Math.min(3, Math.ceil(words.size / 4)))
}

/** About how long a review takes: 30 seconds a card unless your own reviews say otherwise. */
export function minutesFor(cards: number, msPerCard: number | null | undefined): number {
  const each = msPerCard && msPerCard > 3000 && msPerCard < 300000 ? msPerCard : 30000
  return Math.max(1, Math.round((cards * each) / 60000))
}
