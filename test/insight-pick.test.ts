// Run with: node --test test/insight-pick.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { BUDGET, levelOf, lineOf, newFacts, pickPassages, type Lane, type Passage } from '../src/main/insight-pick.ts'

const NOW = new Date('2026-11-20T12:00:00.000Z')
const daysAgo = (n: number): string => new Date(NOW.getTime() - n * 86_400_000).toISOString()
// A book of 200 notes over two years, a few linked, a few sharing a tag.
const book: Passage[] = Array.from({ length: 200 }, (_, at) => ({
  type: 'nugget', id: `n${at}`, title: `Note ${at}`, text: `A thought worth keeping about walking slowly, number ${at}. `.repeat(20), made: daysAgo(at * 3.6), tags: at % 17 === 0 ? ['walking'] : [], links: at % 23 === 0 && at ? [`n${at - 1}`] : []
}))
for (const one of book) for (const to of one.links) book.find((other) => other.id === to)!.links.push(one.id)

test('100 seeded picks follow the shares: about 40% newest, 25% oldest, 20% middle, 15% linked', () => {
  const lanes: Record<Lane, number> = { newest: 0, oldest: 0, middle: 0, linked: 0 }
  for (let turn = 0; turn < 100; turn++) lanes[pickPassages(book, 'reframe', '2026-11-20', turn, new Set(), NOW)!.lane]++
  assert.ok(lanes.newest >= 28 && lanes.newest <= 52, `newest ${lanes.newest}`)
  assert.ok(lanes.oldest >= 15 && lanes.oldest <= 35, `oldest ${lanes.oldest}`)
  assert.ok(lanes.middle >= 10 && lanes.middle <= 30, `middle ${lanes.middle}`)
  assert.ok(lanes.linked >= 6 && lanes.linked <= 25, `linked ${lanes.linked}`)
})

test('the same day and turn pick the same; another day picks anew', () => {
  const ids = (day: string): string => [0, 1, 2].map((turn) => pickPassages(book, 'connect', day, turn, new Set(), NOW)!.passages.map((one) => one.id).join('+')).join(' ')
  assert.equal(ids('2026-11-20'), ids('2026-11-20'))
  assert.notEqual(ids('2026-11-20'), ids('2026-11-21'))
})

test('a note used in the last 14 days is never picked', () => {
  const rested = new Set(book.slice(0, 190).map((one) => one.id))
  for (let turn = 0; turn < 30; turn++) for (const one of pickPassages(book, 'connect', '2026-11-20', turn, rested, NOW)?.passages ?? []) assert.ok(!rested.has(one.id), one.id)
})

test('Connect gives two notes not linked; every request fits the budget', () => {
  for (let turn = 0; turn < 50; turn++) {
    const picked = pickPassages(book, 'connect', '2026-11-20', turn, new Set(), NOW)!
    assert.equal(picked.passages.length, 2)
    const [a, b] = picked.passages
    assert.ok(a.id !== b.id && !a.links.includes(b.id) && !b.links.includes(a.id))
    assert.ok(picked.passages.reduce((sum, one) => sum + one.text.length, 0) <= BUDGET + 2)
  }
})

test('Resurface is one passage; its line is a whole sentence of the note', () => {
  const picked = pickPassages(book, 'resurface', '2026-11-20', 0, new Set(), NOW)!
  assert.equal(picked.passages.length, 1)
  assert.ok(book.find((one) => one.id === picked.passages[0].id)!.text.includes(lineOf(picked.passages[0].text, 'x')))
})

test('a dismissed level comes less often', () => {
  const count = (mix: Record<string, number>): number => Array.from({ length: 300 }, (_, turn) => levelOf('2026-11-20', turn, mix)).filter((one) => one === 'reframe').length
  assert.ok(count({ resurface: 1, connect: 1, reframe: 0.85 ** 4 }) < count({ resurface: 1, connect: 1, reframe: 1 }))
})

test('a name or a number the notes never said is caught', () => {
  const notes = [{ title: 'Walking', text: 'I think best when I walk to the river.' }]
  assert.deepEqual(newFacts('Both notes find thinking in motion, as Nietzsche did in 1888.', notes), ['Nietzsche', '1888'])
  assert.deepEqual(newFacts('You think best on the way to the river, not at it.', notes), [])
})
