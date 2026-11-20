/**
 * The Feed's one way of bringing things back: what comes up, picked by rule, stable for a day and different the next.
 * The day's posts (book-feed.ts, one passage each, `resurface`) and the insights Apple Intelligence writes (insights.ts,
 * Connect and Reframe) are both picked here. No Electron and no database in it, so a unit test runs it as it is
 * (test/insight-pick.test.ts).
 *
 * The person's idea, made the rule: from every note, gem, page, question, capture, Journal day and highlight, by
 * shares of about 40% the newest (the last 30 days), 25% the oldest, 20% the middle, and 15% a note with neighbours
 * (one it links to, one that links to it, or one sharing a tag). Never a private note (the pool leaves those out),
 * never one shown in the last 14 days. Within a share, a liked note comes sooner and a faded one later (`weight`).
 */

export type Level = 'resurface' | 'connect' | 'reframe'
/** The insight cards, written by Apple Intelligence: Resurface is the Feed's own posts. */
export type CardLevel = Exclude<Level, 'resurface'>
export const LEVELS: CardLevel[] = ['connect', 'reframe']
export type Lane = 'newest' | 'oldest' | 'middle' | 'linked'
export const SHARES: Record<Lane, number> = { newest: 0.4, oldest: 0.25, middle: 0.2, linked: 0.15 }
/** Days a note rests after it was in an insight. */
export const REST_DAYS = 14
/** All the passages of one request together, at most: the model's whole budget is about 4,096 tokens. */
export const BUDGET = 1200

export type Passage = {
  type: 'capture' | 'nugget' | 'article' | 'question' | 'day' | 'highlight'
  id: string
  title: string
  text: string
  made: string
  tags: string[]
  /** Notes it links to or that link to it, by id. */
  links: string[]
  /** A highlight's way back into its PDF or page. */
  href?: string
  /** How much sooner it comes than others in its share: a heart raises it, "Less of this" lowers it. 1 when unset. */
  weight?: number
}

/** A small seeded random number source (mulberry32), so the same day and turn always pick the same. */
export const seeded = (seed: string): (() => number) => {
  let h = 1779033703 ^ seed.length
  for (let at = 0; at < seed.length; at++) {
    h = Math.imul(h ^ seed.charCodeAt(at), 3432918353)
    h = (h << 13) | (h >>> 19)
  }
  // The hash's last mix (xmur3's): without it, seeds a letter apart ("…:3:" and "…:4:") gave nearly the same first
  // draw, and 100 picks went 56% to the newest lane, not 40%.
  h = Math.imul(h ^ (h >>> 16), 2246822507)
  h = Math.imul(h ^ (h >>> 13), 3266489909)
  let a = (h ^ (h >>> 16)) >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** One of these by weight. */
export const weighted = <T extends string>(weights: Partial<Record<T, number>>, rng: () => number): T | null => {
  const entries = Object.entries(weights).filter(([, w]) => (w as number) > 0) as [T, number][]
  const sum = entries.reduce((all, [, w]) => all + w, 0)
  if (!sum) return null
  let at = rng() * sum
  for (const [key, w] of entries) if ((at -= w) < 0) return key
  return entries.at(-1)![0]
}

/** The pool cut into the four lanes, each in date order. */
export const lanesOf = (pool: Passage[], now: Date): Record<Lane, Passage[]> => {
  const month = new Date(now.getTime() - 30 * 86_400_000).toISOString()
  const byDate = [...pool].sort((a, b) => a.made.localeCompare(b.made) || a.id.localeCompare(b.id))
  const older = byDate.filter((one) => one.made < month)
  const third = Math.ceil(older.length / 3)
  const ids = new Set(pool.map((one) => one.id))
  const tagged = new Map<string, number>()
  for (const one of pool) for (const tag of one.tags) tagged.set(tag, (tagged.get(tag) ?? 0) + 1)
  return {
    newest: byDate.filter((one) => one.made >= month),
    oldest: older.slice(0, third),
    middle: older.slice(third),
    linked: byDate.filter((one) => one.links.some((id) => ids.has(id) && id !== one.id) || one.tags.some((tag) => (tagged.get(tag) ?? 0) > 1))
  }
}

/** Two notes linked either way. */
const linkedTo = (a: Passage, b: Passage): boolean => a.links.includes(b.id) || b.links.includes(a.id)

/** A passage's words cut at a word to a size. */
export const cutTo = (text: string, size: number): string => {
  const flat = text.replace(/\s+\n/g, '\n').trim()
  return flat.length > size ? `${flat.slice(0, size).replace(/\s+\S*$/, '')}…` : flat
}

export type Picked = { lane: Lane; passages: Passage[] }

/**
 * The passages for one insight of this level: `turn` is which of the day's insights it is, so each turn of a day
 * picks the same, and the next day picks anew. `rested` are the notes used in the last 14 days, never picked again.
 * Null when nothing is left to pick (or no second note for a Connect).
 */
export function pickPassages(pool: Passage[], level: Level, day: string, turn: number, rested: Set<string>, now = new Date(), shares: Record<Lane, number> = SHARES): Picked | null {
  // An insight needs words enough to read; a post is shown whole, so a short quote comes too.
  const least = level === 'resurface' ? 1 : 20
  const fresh = pool.filter((one) => !rested.has(one.id) && one.text.trim().length >= least)
  if (!fresh.length) return null
  const rng = seeded(`${day}:${turn}:${level}`)
  const lanes = lanesOf(fresh, now)
  const lane = weighted(Object.fromEntries((Object.keys(shares) as Lane[]).map((one) => [one, lanes[one].length ? shares[one] : 0])) as Record<Lane, number>, rng)
  if (!lane) return null
  // By weight inside the share: all at 1, this is the plain even draw, the same number drawn.
  const list = lanes[lane]
  const total = list.reduce((sum, one) => sum + (one.weight ?? 1), 0)
  let at = rng() * total
  const first = list.find((one) => (at -= one.weight ?? 1) < 0) ?? list.at(-1)!
  const byId = new Map(fresh.map((one) => [one.id, one]))
  const others = fresh.filter((one) => one.id !== first.id)
  const pickOne = (list: Passage[]): Passage | undefined => list[Math.floor(rng() * list.length)]
  let passages: Passage[] = [first]
  if (level === 'reframe' && lane === 'linked') {
    // The idea with what it links to (or shares a tag with), for its context: up to three passages in all.
    const near = others.filter((one) => linkedTo(first, one) || one.tags.some((tag) => first.tags.includes(tag)))
    while (passages.length < 3 && near.length) passages.push(near.splice(Math.floor(rng() * near.length), 1)[0])
  } else if (level === 'connect') {
    // Two notes not linked: from the linked lane, one sharing a tag but no link; otherwise one from another lane.
    const unlinked = others.filter((one) => !linkedTo(first, one))
    const tagMate = lane === 'linked' ? pickOne(unlinked.filter((one) => one.tags.some((tag) => first.tags.includes(tag)))) : undefined
    const otherLane = weighted(Object.fromEntries((Object.keys(shares) as Lane[]).map((one) => [one, one !== lane && lanes[one].some((p) => p.id !== first.id && byId.has(p.id) && !linkedTo(first, p)) ? shares[one] : 0])) as Record<Lane, number>, rng)
    const second = tagMate ?? (otherLane ? pickOne(lanes[otherLane].filter((one) => one.id !== first.id && !linkedTo(first, one))) : pickOne(unlinked))
    if (!second) return null
    passages = [first, second]
  }
  // The words cut so all of them together fit the model's budget.
  const each = Math.floor(BUDGET / passages.length)
  return { lane, passages: passages.map((one) => ({ ...one, text: cutTo(one.text, each) })) }
}

/** The level of the day's turn, by the person's mix (each level's weight; dismissing one lowers it a little). */
export const levelOf = <T extends string>(day: string, turn: number, mix: Partial<Record<T, number>>): T | null => weighted(mix, seeded(`${day}:${turn}:level`))

/**
 * Words the model wrote that the passages never said: a capitalised name or a number not in them. One is enough to
 * throw an answer away, since an insight is never a fact from the model's own memory.
 */
export const newFacts = (said: string, passages: { text: string; title: string }[]): string[] => {
  const given = passages.map((one) => `${one.title} ${one.text}`).join(' ').toLowerCase()
  const out: string[] = []
  const words = said.split(/\s+/)
  words.forEach((raw, at) => {
    const word = raw.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '')
    if (!word) return
    const starts = at === 0 || /[.!?:"“]$/.test(words[at - 1] ?? '')
    const named = /^\p{Lu}/u.test(word) && !starts && word !== 'I' && !/^I['’]/.test(word)
    const number = /\d/.test(word)
    if ((named || number) && !given.includes(word.toLowerCase())) out.push(word)
  })
  return out
}
