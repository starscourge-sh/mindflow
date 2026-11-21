// Run with: node --test test/feed-mattered.test.ts
// What mattered comes back more: a note's hearts, thoughts, opens, edits and links (each fading by half in 60 days)
// pull it within its share of the Feed, and a third of the day goes to what mattered most.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { matteredOf, pickPassages, pullOf, type Passage } from '../src/main/insight-pick.ts'

const NOW = new Date('2026-11-21T12:00:00.000Z')
const daysAgo = (n: number): string => new Date(NOW.getTime() - n * 86_400_000).toISOString()
// A book of 300 notes over three years, none touched.
const book = (): Passage[] => Array.from({ length: 300 }, (_, at) => ({
  type: 'nugget', id: `n${at}`, title: `Note ${at}`, text: `A thought kept about reading slowly, number ${at}.`, made: daysAgo(at * 3.6), tags: [], links: []
}))
/** A day of the Feed as book-feed.ts picks it: one passage a turn, none twice, none resting. */
const dayOf = (pool: Passage[], day: string, rested = new Set<string>(), size = 24): string[] => {
  const never = new Set(rested)
  const out: string[] = []
  for (let turn = 0; out.length < size && turn < size * 8; turn++) {
    const one = pickPassages(pool, 'resurface', `${day}:feed`, turn, never, NOW)?.passages[0]
    if (!one) break
    never.add(one.id)
    out.push(one.id)
  }
  return out
}

test('a note hearted and answered 90 days ago comes back more than an untouched note of the same age', () => {
  const pool = book()
  // n100 and n101 are both about a year old, in the same share; n100 was hearted and answered 90 days ago.
  const liked = pool.find((one) => one.id === 'n100')!
  Object.assign(liked, { weight: 1.5, signals: [{ kind: 'like', at: daysAgo(90) }, { kind: 'reply', at: daysAgo(90) }] })
  assert.ok(matteredOf(liked, NOW) > 2, `a heart and a thought 90 days on still count: ${matteredOf(liked, NOW).toFixed(2)}`)
  assert.ok(pullOf(liked, NOW) > pullOf(pool.find((one) => one.id === 'n101')!, NOW) * 3)
  // Sixty days of the Feed, each with its own rest: the hearted note comes up more than its untouched neighbour.
  const count = { n100: 0, n101: 0 }
  for (let day = 0; day < 60; day++) for (const id of dayOf(pool, `2026-${10 + Math.floor(day / 30)}-${String((day % 30) + 1).padStart(2, '0')}`)) if (id in count) count[id as keyof typeof count]++
  assert.ok(count.n100 > count.n101 * 2 && count.n100 >= 10, `hearted ${count.n100}, untouched ${count.n101}`)
})

test('a note faded with "Less of this" is never boosted, whatever else was done with it', () => {
  const pool = book()
  const faded = Object.assign(pool.find((one) => one.id === 'n100')!, { weight: 1 / 1.5, signals: [{ kind: 'like', at: daysAgo(2) }, { kind: 'open', at: daysAgo(1) }] })
  assert.equal(matteredOf(faded, NOW), 0)
  assert.ok(pullOf(faded, NOW) < 0.5, `one "Less of this" draws it at ${pullOf(faded, NOW).toFixed(2)}, under half an untouched note`)
  // Never among what mattered most: across many days it comes up less than an untouched note, not more.
  let seen = 0
  for (let day = 1; day <= 28; day++) seen += dayOf(pool, `2026-11-${String(day).padStart(2, '0')}`).filter((id) => id === 'n100').length
  assert.ok(seen <= 3, `faded note shown ${seen} times in 28 days`)
})

test('a new book with nothing touched still fills the day, from every share', () => {
  const pool = book()
  const day = dayOf(pool, '2026-11-21')
  assert.equal(day.length, 24)
  assert.equal(new Set(day).size, 24)
  // New notes and old both come: the shares stay the frame.
  const ages = day.map((id) => Number(id.slice(1)))
  assert.ok(ages.some((at) => at < 9) && ages.some((at) => at > 100), ages.join(', '))
})

test('the same day picks the same; what mattered never comes back inside its rest', () => {
  const pool = book()
  for (const at of [5, 120, 250]) Object.assign(pool[at], { weight: 1.5, signals: [{ kind: 'like', at: daysAgo(3) }] })
  assert.deepEqual(dayOf(pool, '2026-11-21'), dayOf(pool, '2026-11-21'))
  assert.notDeepEqual(dayOf(pool, '2026-11-21'), dayOf(pool, '2026-11-22'))
  const rested = new Set(['n5', 'n120', 'n250'])
  for (let day = 1; day <= 13; day++) assert.ok(!dayOf(pool, `2026-11-${day}`, rested).some((id) => rested.has(id)))
})
