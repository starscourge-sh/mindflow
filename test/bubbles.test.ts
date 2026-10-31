// Run with: node --test test/bubbles.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { bubblesOf } from '../src/renderer/src/lib/bubbles.ts'

test('lines run together into one bubble; a pause of 1.2s or more starts the next', () => {
  // "the patent" (about 0.7s) then "statute came first" at 0:01: no pause.
  // "statute came first" (about 1s, to 0:02) then "Venice" at 0:05: a pause of about 3s.
  const lines = ['[0:00] the patent', '[0:01] statute came first', '[0:05] Venice did it', '[0:06] in 1474']
  assert.deepEqual(bubblesOf(lines), [
    { at: 0, text: 'the patent statute came first' },
    { at: 5, text: 'Venice did it in 1474' }
  ])
})

test('hours read right', () => {
  assert.deepEqual(bubblesOf(['[1:02:03] late']), [{ at: 3723, text: 'late' }])
})

test('without times, one bubble a sentence', () => {
  assert.deepEqual(bubblesOf(['It worked. Did it? Yes!']), [{ at: null, text: 'It worked.' }, { at: null, text: 'Did it?' }, { at: null, text: 'Yes!' }])
})

test('three hundred lines four seconds apart stay three hundred bubbles, in order', () => {
  const lines = Array.from({ length: 300 }, (_, i) => `[${Math.floor((i * 4) / 60)}:${String((i * 4) % 60).padStart(2, '0')}] line ${i}`)
  const out = bubblesOf(lines)
  assert.equal(out.length, 300)
  assert.equal(out.at(-1)?.text, 'line 299')
})
