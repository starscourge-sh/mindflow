// Run with: node --test test/word-aim.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseAim } from '../src/renderer/src/components/count/aim-words.ts'

// A Monday morning, so "friday" lands on a known day.
const at = new Date(2026, 9, 5, 10, 0)

test('a word aim is a number of words, with or without "words"', () => {
  assert.deepEqual(parseAim('800', at), { words: 800, by: null })
  assert.deepEqual(parseAim('800 words', at), { words: 800, by: null })
  assert.deepEqual(parseAim('1,200 words', at), { words: 1200, by: null })
  assert.deepEqual(parseAim('1.5k', at), { words: 1500, by: null })
})

test('a day after "by", either side of the words', () => {
  assert.deepEqual(parseAim('800 by Friday', at), { words: 800, by: '2026-10-09' })
  assert.deepEqual(parseAim('by Friday, 800 words', at), { words: 800, by: '2026-10-09' })
  assert.deepEqual(parseAim('2000 words by 3 November', at), { words: 2000, by: '2026-11-03' })
})

test('no number of words is no aim', () => {
  assert.equal(parseAim('by Friday', at), null)
  assert.equal(parseAim('lots', at), null)
  assert.equal(parseAim('0', at), null)
})
