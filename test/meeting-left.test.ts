// Run with: node --test test/meeting-left.test.ts
// What a recording left behind by a crash says, and how its lines are read back from what was written as it recorded.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { keptFor, linesFrom, offerWords } from '../src/main/meeting-left.ts'

test('the offer says when it began and how much was kept', () => {
  const now = new Date(2026, 10, 6, 16, 0)
  assert.equal(offerWords(new Date(2026, 10, 6, 14, 10).toISOString(), 42 * 60, now), 'A recording from today at 14:10 stopped early: 42 min kept')
  assert.equal(offerWords(new Date(2026, 10, 5, 9, 5).toISOString(), 38, now), 'A recording from yesterday at 9:05 stopped early: 38 sec kept')
  assert.equal(offerWords(new Date(2026, 10, 3, 23, 59).toISOString(), 3700, now), 'A recording from 3 Nov at 23:59 stopped early: 1 h 2 min kept')
})

test('lengths round to what a person says', () => {
  assert.equal(keptFor(4), '4 sec')
  assert.equal(keptFor(59.6), '1 min')
  assert.equal(keptFor(3600), '1 h')
  assert.equal(keptFor(3660), '1 h 1 min')
})

test('a line written twice is its last, one cut off by the crash is left out, and the order is when it was said', () => {
  const line = (id: string, track: string, text: string, start: number, final: boolean): string => JSON.stringify({ id, track, text, start, end: start + 1, final, speaker: track === 'you' ? 'you' : 's1' })
  const got = linesFrom([line('o1', 'others', 'second line', 5, false), line('o0', 'others', 'half', 1, false), line('o0', 'others', 'half of it said', 1, true), '{"id":"o2","tex'].join('\n'))
  assert.deepEqual(got.map((one) => [one.id, one.text, one.final]), [['o0', 'half of it said', true], ['o1', 'second line', false]])
})

test('a voice from the speakers heard again through the microphone is kept once, as the others\' line', () => {
  const line = (id: string, track: string, text: string): string => JSON.stringify({ id, track, text, start: 2, end: 3, final: true, speaker: track })
  const got = linesFrom([line('o0', 'others', 'we ship the beta next week'), line('y0', 'you', 'we ship the beta next week')].join('\n'))
  assert.deepEqual(got.map((one) => one.id), ['o0'])
})
