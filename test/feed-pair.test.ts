// Run with: node --test test/feed-pair.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { findPair, wordsOf, type PairNote } from '../src/main/feed-pair.ts'

const note = (id: string, text: string, tags: string[], extra: Partial<PairNote> = {}): PairNote =>
  ({ key: `nugget:${id}`, id, title: text.split('.')[0], text, tags, who: null, made: '2026-01-01T10:00:00.000Z', ...extra })
const FILING = new Set(['quote', 'mine'])

test('two notes sharing a rare word and no tag make a pair, said by the word', () => {
  const a = note('a', 'Heat death is entropy winning at last.', ['physics'])
  const b = note('b', 'Every poem fights entropy with rhyme.', ['poetry'], { made: '2026-03-01T10:00:00.000Z' })
  const c = note('c', 'Bread wants a slow rise overnight.', ['cooking'], { made: '2026-05-01T10:00:00.000Z' })
  const pair = findPair([a, b, c], FILING, [a.text, b.text, c.text])
  assert.deepEqual(pair?.why, { kind: 'word', word: 'entropy' })
  assert.deepEqual([pair?.a.id, pair?.b.id].sort(), ['a', 'b'])
})

test('a shared subject tag rules a pair out', () => {
  const a = note('a', 'Heat death is entropy winning.', ['physics'])
  const b = note('b', 'Entropy in a closed box.', ['physics', 'poetry'], { made: '2026-03-01T10:00:00.000Z' })
  assert.equal(findPair([a, b], FILING, [a.text, b.text]), null)
})

test('filing tags count for nothing: shared #quote does not join them, and alone is no subject', () => {
  const a = note('a', 'Heat death is entropy winning.', ['physics', 'quote'])
  const b = note('b', 'Every poem fights entropy.', ['poetry', 'quote'], { made: '2026-03-01T10:00:00.000Z' })
  assert.equal(findPair([a, b], FILING, [a.text, b.text])?.why.kind, 'word')
  const c = note('c', 'Heat death is entropy winning.', ['quote'])
  assert.equal(findPair([c, b], FILING, [c.text, b.text]), null)
})

test('a word common across the book is not a thread', () => {
  const a = note('a', 'Heat death is entropy winning.', ['physics'])
  const b = note('b', 'Every poem fights entropy.', ['poetry'], { made: '2026-03-01T10:00:00.000Z' })
  const book = [a.text, b.text, 'More entropy here.', 'And entropy again.']
  assert.equal(findPair([a, b], FILING, book), null)
})

test('stop words and short words are never the word', () => {
  assert.ok(!wordsOf('Something about there and which would').size)
  assert.ok(!wordsOf('the cat sat').size)
})

test('the same source quoted, with no rare word, is the next reason', () => {
  const a = note('a', 'The unexamined life.', ['ethics'], { who: 'Socrates' })
  const b = note('b', 'I know that I know nothing.', ['knowledge'], { who: 'socrates ', made: '2026-04-01T10:00:00.000Z' })
  assert.deepEqual(findPair([a, b], FILING, [a.text, b.text, 'unexamined', 'unexamined life']), { a, b, why: { kind: 'source', source: 'Socrates' } })
})

test('kept within the same hour is the last reason; two hours apart is not', () => {
  const a = note('a', 'Granite counter tops.', ['kitchen'], { made: '2026-01-01T10:00:00.000Z' })
  const b = note('b', 'Lisbon trams at night.', ['travel'], { made: '2026-01-01T10:40:00.000Z' })
  assert.equal(findPair([a, b], FILING, [a.text, b.text, a.text, b.text])?.why.kind, 'hour')
  const far = { ...b, made: '2026-01-01T12:10:00.000Z' }
  assert.equal(findPair([a, far], FILING, [a.text, b.text, a.text, b.text]), null)
})

test('no honest pair, no pair', () => {
  assert.equal(findPair([], FILING, []), null)
  assert.equal(findPair([note('a', 'Alone here.', ['solo'])], FILING, ['Alone here.']), null)
})
