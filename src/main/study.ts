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
type LineCard = { question: string; answer: string }

/**
 * A line that is a card: "question :: answer", with a space either side of
 * the ::, so `std::vector` or a time like 10::30 never counts. Both sides
 * need words. Null for any other line.
 */
export function lineCard(line: string): LineCard | null {
  const whole = line.trim()
  // A :: inside `inline code` or a $formula$ is part of it, never the split:
  // the spans are blanked out to find the split, then the line is cut there.
  const blanked = whole.replace(SHIELDED, (span) => '\u0000'.repeat(span.length))
  const match = /^(.*?\S)\s+::\s+(\S.*)$/.exec(blanked)
  if (!match) return null
  const question = whole.slice(0, match[1].length).replace(/^[-*+]\s+|^\d+[.)]\s+|^\[[ x]\]\s+/i, '').trim()
  const answer = whole.slice(whole.length - match[2].length).trim()
  // "hot : cold :: up : down" is a ratio, an analogy written out, not a card.
  if (/\s:\s/.test(question) && /\s:\s/.test(answer)) return null
  return question && answer ? { question, answer } : null
}

/** Spans whose :: belongs to them: `inline code` and $formulas$. */
const SHIELDED = /`[^`\n]+`|\$[^$\n]+\$/g

/**
 * A line that is an equation, not a term and its meaning: "a - b = c" or
 * "x^2 - 4 = 0". It has an = and no word of three letters or more outside a
 * formula's own commands (\frac, \sqrt), so "Force - F = ma" is still a card.
 */
export const isEquation = (line: string): boolean => /=/.test(line) && !/\p{L}{3,}/u.test(line.replace(/\\[a-z]+/gi, ''))

type Node = { type?: string; text?: string; content?: Node[]; attrs?: { latex?: string }; marks?: { type?: string }[] }

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
  // A formula is written back as `$...$` and code as `...`, so the card keeps
  // its maths (Review draws it) and a :: inside either is not the split.
  const text = (node: Node): string =>
    node.type === 'inlineMath'
      ? `$${node.attrs?.latex ?? ''}$`
      : node.text !== undefined
        ? node.marks?.some((one) => one.type === 'code') ? `\`${node.text}\`` : node.text
        : (node.content ?? []).map(text).join('')
  const walk = (node: Node | null | undefined): void => {
    if (!node || node.type === 'codeBlock') return
    if (node.type === 'paragraph' || node.type === 'heading') return add(text(node))
    node.content?.forEach(walk)
  }
  walk(body as Node)
  return found
}

/** A note's words, code left out (a "#include" is no tag): what its #tags are read from. */
export function wordsIn(body: unknown): string {
  if (typeof body === 'string') return body.replace(/```[\s\S]*?(?:```|$)|`[^`\n]+`/g, '')
  const walk = (node: Node): string =>
    node.type === 'codeBlock' || node.marks?.some((one) => one.type === 'code') ? '' : (node.text ?? (node.content ?? []).map(walk).join('\n'))
  return body ? walk(body as Node) : ''
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
const OLD_DAYS = 30

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

/**
 * How strictly a tag's typed answers are taken as right at once. Usual: the answer word for word, capitals, spaces,
 * stops and accents aside. Exact: every mark the same (a formula, a chemical symbol, a case name). "Meaning", an older
 * tag's choice, reads as Usual: what an answer means is judged by Apple Intelligence where the Mac has it, and graded by
 * you where it does not, never scored by the letters two answers share (19 Nov 2026: not reliable).
 */
export type Strictness = 'usual' | 'exact' | 'meaning'

/**
 * A typed answer that is the answer word for word: capitals, runs of spaces and stops aside (accents too), or with
 * `exact` every mark the same. The one check that may call an answer right without asking; how many letters two answers
 * share decides nothing (19 Nov: not reliable).
 */
export function sameAnswer(typed: string, answer: string, exact = false): boolean {
  if (exact) return typed.trim() === answer.trim()
  const plain = (text: string): string => text.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[\p{P}\p{S}]+/gu, ' ').replace(/\s+/g, ' ').trim()
  return !!plain(answer) && plain(typed) === plain(answer)
}

/**
 * The day a card comes back, moved a little to even out heavy days (Anki's
 * load balancer): for a gap of 3 days or more, any day within 5% of it (at
 * least 1, at most 4 days either side) may be picked, the one with the
 * fewest cards due; a lighter day (a weekday the person chose) is avoided
 * when another is in reach. `load` says how many are due on a day; days are
 * counted from today, 0 being today.
 */
export function balancedDay(days: number, load: (day: number) => number, lighter: (day: number) => boolean = () => false): number {
  if (days < 3) return days
  const reach = Math.min(4, Math.max(1, Math.round(days * 0.05)))
  let best = days
  let bestScore = Infinity
  for (let day = days - reach; day <= days + reach; day++) {
    // Lighter days count as full; nearer the planned day wins a tie.
    const score = (lighter(day) ? 1e6 : 0) + load(day) * 10 + Math.abs(day - days)
    if (score < bestScore) (best = day), (bestScore = score)
  }
  return best
}

/**
 * How many things an answer asks you to recall: its list items (lines that
 * start with a dash, a bullet or a number, or plain lines), or for a single
 * line the parts between commas or semicolons. Carter's rule: past 4, a card
 * stops being remembered as a whole.
 */
export function thingsIn(answer: string): number {
  const lines = answer.split('\n').map((line) => line.trim()).filter(Boolean)
  // Lines are things only when they are a list: marked as one (-, *, •, 1.), or every line short. A word's meaning
  // set out over a few lines (the sense, an example, its kin) is one thing to recall, not six ("Nefarious").
  const listed = (line: string): boolean => /^([-*•–]|\d+[.)])\s/.test(line)
  if (lines.length > 1) return lines.every(listed) || lines.every((line) => line.split(/\s+/).length <= 4) ? lines.length : 1
  const parts = (lines[0] ?? '').split(/[;,]| and /).map((part) => part.trim()).filter(Boolean)
  // A sentence with commas is not a list: only short parts count as things.
  return parts.length > 1 && parts.every((part) => part.split(' ').length <= 4) ? parts.length : 1
}

/**
 * New cards kept within each tag's own new cards a day: `limits` by tag (a
 * tag under it, #art-baroque under #art, counts toward it), `started` the
 * tags of each card already started today. Cards with no limited tag pass.
 */
export function withinTagLimits<T>(cards: T[], tagsOf: (card: T) => string[], limits: Map<string, number>, started: string[][] = []): T[] {
  if (!limits.size) return cards
  const under = (tags: string[]): string[] => [...limits.keys()].filter((limit) => tags.some((tag) => tag === limit || tag.startsWith(`${limit}-`)))
  const used = new Map<string, number>()
  for (const tags of started) for (const limit of under(tags)) used.set(limit, (used.get(limit) ?? 0) + 1)
  return cards.filter((card) => {
    const mine = under(tagsOf(card))
    if (mine.some((limit) => (used.get(limit) ?? 0) >= limits.get(limit)!)) return false
    for (const limit of mine) used.set(limit, (used.get(limit) ?? 0) + 1)
    return true
  })
}

/**
 * "term - meaning" lines, as pasted from a glossary or a vocabulary list:
 * a dash, en dash, colon or equals sign between the two, each side short.
 * Empty unless at least three lines read that way and most of the list does.
 */
export function termLines(text: string): { term: string; meaning: string }[] {
  const lines = text.split('\n').map((line) => line.trim()).filter(Boolean)
  const found = lines.flatMap((line) => {
    const match = /^(?:[-*•]\s+|\d+[.)]\s+)?(.{1,60}?)(?:\s+[-–—=]|\s*:)\s+(.{1,300})$/.exec(line)
    return match && !/::/.test(line) && !isEquation(line) ? [{ term: match[1].trim(), meaning: match[2].trim() }] : []
  })
  return found.length >= 3 && found.length >= lines.length * 0.7 ? found : []
}

/**
 * Days in a row with something reviewed, rest days banked: every seven days
 * in a row bank a rest day (three at most), and a day without reviews spends
 * one rather than ending the run. Today, not yet reviewed, does not count
 * against it. `days` are the local days reviewed ("2026-10-08"); `today` the
 * same. Nothing here is ever a loss: a run that ends simply starts again.
 */
export function daysInARow(days: string[], today: string, away: Set<string> = new Set()): { run: number; banked: number; best: number; since: string } {
  const seen = new Set(days)
  if (!seen.size) return { run: 0, banked: 0, best: 0, since: today }
  const step = (day: string, n: number): string => {
    const at = new Date(`${day}T12:00:00Z`)
    at.setUTCDate(at.getUTCDate() + n)
    return at.toISOString().slice(0, 10)
  }
  let day = [...seen].sort()[0]
  let run = 0
  let banked = 0
  let streak = 0
  // The longest run there has been, rest days spent the same way: your own record, never a target.
  let best = 0
  // The day the run now going began, so a run can be told from the one before it.
  let since = day
  while (day <= today) {
    if (seen.has(day)) {
      if (!run) since = day
      run++
      streak++
      best = Math.max(best, run)
      if (streak % 7 === 0) banked = Math.min(3, banked + 1)
    } else if (day !== today && !away.has(day)) {
      // A day the Mac was away for (away.ts) neither counts nor costs a banked day.
      if (banked > 0) banked--
      else {
        run = 0
        streak = 0
      }
    }
    day = step(day, 1)
  }
  return { run, banked, best, since }
}

/**
 * New cards you wrote, shuffled, so a list learned in order is not learned
 * as its order: card 7 recalled because card 6 came first. The same order
 * all day (seeded by the day, so a session and its count agree), and two
 * cards from one note at least `apart` places apart, so one card never
 * gives away the next. Cards with no note (group null) mix freely.
 */
export function shuffleNew<T extends { id: string; group: string | null }>(cards: T[], day: string, apart = 5): T[] {
  const seed = (text: string): number => {
    let hash = 2166136261
    for (const char of day + text) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619)
    return hash >>> 0
  }
  const waiting = [...cards].sort((a, b) => seed(a.id) - seed(b.id))
  const out: T[] = []
  const lastAt = new Map<string, number>()
  while (waiting.length) {
    // The first that keeps its note's cards far enough apart; when none can, the one whose sibling is furthest back.
    let pick = waiting.findIndex((one) => !one.group || (lastAt.get(one.group) ?? -Infinity) <= out.length - apart)
    if (pick < 0) pick = waiting.reduce((best, one, at) => ((lastAt.get(one.group!) ?? 0) < (lastAt.get(waiting[best].group!) ?? 0) ? at : best), 0)
    const [one] = waiting.splice(pick, 1)
    if (one.group) lastAt.set(one.group, out.length)
    out.push(one)
  }
  return out
}

/**
 * How long a new card lasts after its first grade, fitted to your own
 * reviews: for each first grade (Again to Easy), the stability that best
 * explains whether the next look, a day or more later, was remembered.
 * `curve(t, s)` is the scheduler's forgetting curve. A grade with fewer than
 * `least` reviews keeps the default. Gives back the four stabilities, in days.
 */
export function fitFirstDays(pairs: { first: number; days: number; recalled: boolean }[], defaults: number[], curve: (t: number, s: number) => number, least = 20): number[] {
  const grid = Array.from({ length: 120 }, (_, i) => 0.05 * Math.pow(1.08, i))
  return [1, 2, 3, 4].map((grade, at) => {
    const mine = pairs.filter((one) => one.first === grade && one.days >= 1)
    if (mine.length < least) return defaults[at]
    let best = defaults[at]
    let score = -Infinity
    for (const s of grid) {
      let sum = 0
      for (const one of mine) {
        const r = Math.min(0.9999, Math.max(0.0001, curve(one.days, s)))
        sum += Math.log(one.recalled ? r : 1 - r)
      }
      if (sum > score) (score = sum), (best = s)
    }
    return Math.round(best * 1000) / 1000
  })
}

/**
 * The note a card shares with other cards, as Anki's siblings: the two cards
 * of a "both ways" pair here (`pair:<id>:<side>`), or the cards of one Anki
 * note, its reversed side or its other blanks (`anki:<note>:<card>`). Null
 * for a card on its own.
 */
export const siblingsOf = (origin: string | null | undefined): string | null => {
  const match = /^(anki|pair):([^:]+):\d+$/.exec(origin ?? '')
  return match ? `${match[1]}:${match[2]}` : null
}

/**
 * One card of a note a day, as Anki buries siblings: the first of each note
 * in `cards` stays, the others wait for tomorrow, and a note met today
 * (`metToday`) shows none again. Order is kept.
 */
export function burySiblings<T>(cards: T[], noteOf: (card: T) => string | null, metToday: Set<string>): T[] {
  const taken = new Set(metToday)
  return cards.filter((card) => {
    const note = noteOf(card)
    if (!note) return true
    if (taken.has(note)) return false
    taken.add(note)
    return true
  })
}
