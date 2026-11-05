// Run with: node --test test/waveform.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { barsOf, peaksOf } from '../src/renderer/src/lib/waveform.ts'

test('peaks follow the loudness along the sound, the loudest at 255', () => {
  // A quiet first half and a loud second half.
  const samples = new Float32Array(1000).map((_, i) => (i < 500 ? 0.1 : 0.8) * Math.sin(i))
  const peaks = peaksOf(samples, 10)
  assert.equal(peaks.length, 10)
  assert.equal(Math.max(...peaks), 255)
  assert.ok(peaks.slice(0, 5).every((one) => one < 120), String(peaks))
  assert.ok(peaks.slice(5).every((one) => one > 240), String(peaks))
})

test('silence is flat, never divided by nothing', () => {
  assert.deepEqual(peaksOf(new Float32Array(100), 4), [0, 0, 0, 0])
})

test('bars take the loudest of the peaks each covers, from 0 to 1', () => {
  assert.deepEqual(barsOf([0, 255, 0, 51], 2), [1, 0.2])
  // More bars than peaks: each bar shows the peak under it.
  assert.deepEqual(barsOf([255, 0], 4), [1, 1, 0, 0])
  assert.deepEqual(barsOf([], 5), [])
})
