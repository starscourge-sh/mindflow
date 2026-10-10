// Run with: node --test test/study.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { LEECH_AT, bucketOf, closeness, daysInARow, fitFirstDays, isLeech, keyWords, lineCard, lineCardsIn, matchLineCards, mentions, minutesFor, suggestGrade, termLines } from '../src/main/study.ts'

test('a line with :: between words is a card', () => {
  assert.deepEqual(lineCard('Capital of Peru :: Lima'), { question: 'Capital of Peru', answer: 'Lima' })
  assert.deepEqual(lineCard('  What is 2 + 2?   ::   4  '), { question: 'What is 2 + 2?', answer: '4' })
  // Only the first :: splits; the answer may hold more.
  assert.deepEqual(lineCard('Ratio :: 1 :: 2'), { question: 'Ratio', answer: '1 :: 2' })
})

test('code, times and half-written lines are not cards', () => {
  assert.equal(lineCard('std::vector<int> is a template'), null)
  assert.equal(lineCard('a::b'), null)
  assert.equal(lineCard('Capital of Peru ::'), null)
  assert.equal(lineCard(':: Lima'), null)
  assert.equal(lineCard('Capital of Peru'), null)
  assert.equal(lineCard(''), null)
})

test('a list marker before the question is not part of it', () => {
  assert.deepEqual(lineCard('- First law :: Ellipses'), { question: 'First law', answer: 'Ellipses' })
  assert.deepEqual(lineCard('2. Second law :: Equal areas'), { question: 'Second law', answer: 'Equal areas' })
})

test('cards are found in a stored note, list items included, code blocks skipped', () => {
  const doc = {
    type: 'doc',
    content: [
      { type: 'heading', content: [{ type: 'text', text: 'Kepler' }] },
      { type: 'bulletList', content: [
        { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'First law ' }, { type: 'text', text: ':: Ellipses', marks: [{ type: 'bold' }] }] }] },
        { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Second law :: Equal areas' }] }] }
      ] },
      { type: 'codeBlock', content: [{ type: 'text', text: 'x :: y' }] },
      { type: 'paragraph' }
    ]
  }
  assert.deepEqual(lineCardsIn(doc), [{ question: 'First law', answer: 'Ellipses' }, { question: 'Second law', answer: 'Equal areas' }])
})

test('cards are found in Markdown, not inside a fence', () => {
  const text = 'Notes\n- Peru :: Lima\n```\nfoo :: bar\n```\nChile :: Santiago'
  assert.deepEqual(lineCardsIn(text), [{ question: 'Peru', answer: 'Lima' }, { question: 'Chile', answer: 'Santiago' }])
})

test('an edited line keeps its card; a new line makes one; a line gone drops one', () => {
  const had = [{ id: 'a', prompt: 'Peru' }, { id: 'b', prompt: 'Chile' }]
  // Chile's question reworded, Peru unchanged, a third line added.
  const { keep, add, drop } = matchLineCards(had, [{ question: 'Peru', answer: 'Lima' }, { question: 'Capital of Chile', answer: 'Santiago' }, { question: 'Bolivia', answer: 'Sucre' }])
  assert.deepEqual(keep.map((one) => [one.card.id, one.line.question]), [['a', 'Peru'], ['b', 'Capital of Chile']])
  assert.deepEqual(add.map((one) => one.question), ['Bolivia'])
  assert.deepEqual(drop, [])
  // Moved lines keep their own cards, matched by question first.
  const swapped = matchLineCards(had, [{ question: 'Chile', answer: 'Santiago' }, { question: 'Peru', answer: 'Lima' }])
  assert.deepEqual(swapped.keep.map((one) => [one.card.id, one.line.question]), [['b', 'Chile'], ['a', 'Peru']])
  // Every line taken out: both cards go.
  assert.deepEqual(matchLineCards(had, []).drop.map((one) => one.id), ['a', 'b'])
})

test('a card is slipping from its fourth miss', () => {
  assert.equal(LEECH_AT, 4)
  assert.equal(isLeech(3), false)
  assert.equal(isLeech(4), true)
  assert.equal(isLeech(9), true)
  assert.equal(isLeech(0), false)
})

test('practice buckets', () => {
  const card = { seen: true, last: 3, lapses: 0, recall: 0.95, daysSince: 3 }
  assert.equal(bucketOf({ ...card, seen: false }, 0.9), 'new')
  assert.equal(bucketOf({ ...card, last: 1 }, 0.9), 'weak')
  assert.equal(bucketOf({ ...card, lapses: 3 }, 0.9), 'weak')
  assert.equal(bucketOf({ ...card, recall: 0.7 }, 0.9), 'learning')
  assert.equal(bucketOf({ ...card, daysSince: 45 }, 0.9), 'old')
  assert.equal(bucketOf(card, 0.9), 'fresh')
})

test('a blurt mentions a gem by the words they share', () => {
  const blurt = keyWords('The event horizon is where light cannot escape. Hawking radiation leaks out slowly.')
  assert.equal(mentions(blurt, 'Event horizon: the boundary past which light cannot escape a black hole'), true)
  assert.equal(mentions(blurt, 'Schwarzschild radius: how small a mass must be squeezed to become a black hole'), false)
  // Plurals and case match.
  assert.equal(mentions(keyWords('PLANETS move in ellipses'), 'A planet moves in an ellipse'), true)
})

test('a review takes about thirty seconds a card unless your reviews say otherwise', () => {
  assert.equal(minutesFor(12, null), 6)
  assert.equal(minutesFor(1, null), 1)
  assert.equal(minutesFor(10, 12000), 2)
  // A stray slow review is not believed.
  assert.equal(minutesFor(12, 900000), 6)
})

test('a typed answer: typos still count on a short one, key words on a long one', () => {
  assert.equal(closeness('Lima', 'Lima'), 1)
  assert.ok(closeness('lmia', 'Lima') >= 0.5)
  assert.ok(closeness('Paris', 'Lima') < 0.4)
  assert.ok(closeness('light cannot escape past it', 'The boundary past which light cannot escape a black hole') >= 0.5)
  assert.equal(closeness('', 'Lima'), 0)
  assert.equal(suggestGrade(1), 4)
  assert.equal(suggestGrade(0.8), 3)
  assert.equal(suggestGrade(0.5), 2)
  assert.equal(suggestGrade(0.1), 1)
})

test('a pasted list of term - meaning lines', () => {
  const list = termLines('Ephemeral - lasting a very short time\nLaconic – using few words\nSanguine: hopeful\n')
  assert.deepEqual(list.map((one) => one.term), ['Ephemeral', 'Laconic', 'Sanguine'])
  assert.equal(list[1].meaning, 'using few words')
  // Two lines, or prose with a dash in it, is not a list.
  assert.deepEqual(termLines('a - b\nc - d'), [])
  assert.deepEqual(termLines('I went out - it rained.\nThen I came home and read for an hour.\nAnd slept.\nThe end - of it all.'), [])
})

test('days in a row: a week banks a rest day, a missed day spends it', () => {
  const days = (from: number, n: number): string[] => Array.from({ length: n }, (_, i) => `2026-10-${String(from + i).padStart(2, '0')}`)
  assert.deepEqual(daysInARow([], '2026-10-10'), { run: 0, banked: 0 })
  // Today not reviewed yet: the run stands.
  assert.deepEqual(daysInARow(days(5, 4), '2026-10-09'), { run: 4, banked: 0 })
  assert.deepEqual(daysInARow(days(5, 4), '2026-10-10').run, 0)
  // Seven in a row, a day off, two more: the rest day was spent, the run goes on.
  assert.deepEqual(daysInARow([...days(1, 7), ...days(9, 2)], '2026-10-10'), { run: 9, banked: 0 })
  // Without a banked day the run starts again.
  assert.equal(daysInARow([...days(1, 3), ...days(5, 2)], '2026-10-06').run, 2)
})

test('fitting how long a first grade lasts', () => {
  const curve = (t: number, s: number): number => Math.pow(1 + (19 / 81) * (t / s), -0.5)
  // Good cards remembered nine times in ten after 3 days, three in four after 30: a few days to a fortnight.
  const pairs = [...Array(40)].flatMap((_, i) => [{ first: 3, days: 3, recalled: i % 10 !== 0 }, { first: 3, days: 30, recalled: i % 4 !== 0 }])
  const fitted = fitFirstDays(pairs, [0.2, 1.2, 3, 15], curve)
  assert.ok(fitted[2] > 3 && fitted[2] < 15, String(fitted[2]))
  // Too few to say: the defaults stay.
  assert.equal(fitted[0], 0.2)
  assert.equal(fitted[3], 15)
})
