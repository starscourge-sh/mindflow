// Run with: node --test test/study.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { LEECH_AT, bucketOf, isLeech, keyWords, lineCard, lineCardsIn, matchLineCards, mentions, minutesFor } from '../src/main/study.ts'

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
