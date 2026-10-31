import { createEmptyCard, fsrs, generatorParameters, Rating, type Card } from 'ts-fsrs'

/**
 * What a review setting costs, worked out on your own cards: the next 30 days
 * run through the same FSRS scheduler Review uses, at a retention and a
 * number of new cards a day, so Settings can say "about 22 minutes a day, 140
 * reviews" while you move it. Each review is remembered as often as the card's
 * own recall chance says (from a fixed seed, so the same settings always give
 * the same answer); each card forgotten goes round its learning steps again.
 * Nothing here touches the database: the caller hands in the cards.
 */
export type CostCards = { cards: Card[]; unseen: number; weights: number[]; now: number }

const DAY = 86_400_000

/** A small, fixed random sequence (mulberry32): the same run every time. */
const seeded = (seed: number): (() => number) => () => {
  seed = (seed + 0x6d2b79f5) | 0
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

/** Reviews a day, on average over the days ahead, at this retention and this many new cards a day. */
export function reviewsADay({ cards, unseen, weights, now }: CostCards, retention: number, newPerDay: number, days = 30): number {
  const scheduler = fsrs(generatorParameters({ request_retention: retention, learning_steps: ['10m', '1d'], enable_fuzz: false, w: weights }))
  const random = seeded(42)
  const start = new Date(now).setHours(0, 0, 0, 0)
  let deck = cards.map((card) => ({ ...card }))
  let left = unseen
  let total = 0
  for (let day = 0; day < days; day++) {
    const end = start + (day + 1) * DAY
    const from = Math.max(now, start + day * DAY)
    // Today's new cards join the deck as Review would bring them in.
    const fresh = Math.min(left, Math.max(0, Math.round(newPerDay)))
    left -= fresh
    for (let n = 0; n < fresh; n++) deck.push({ ...createEmptyCard(new Date(from)) })
    deck = deck.map((card) => {
      let one = card
      // A card comes back as often as it falls due within the day (a missed one in ten minutes).
      for (let guard = 0; guard < 8 && one.due.getTime() < end; guard++) {
        const at = new Date(Math.max(from, one.due.getTime()))
        const recall = one.state === 0 ? 1 : scheduler.get_retrievability(one, at, false)
        const grade = one.state !== 0 && random() > recall ? Rating.Again : Rating.Good
        one = scheduler.next(one, at, grade).card
        total++
      }
      return one
    })
  }
  return total / days
}
