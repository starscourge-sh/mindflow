import assert from 'node:assert/strict'
import { test } from 'node:test'
import { tapeReady } from '../src/renderer/src/lib/pill-open.ts'

test('the tape stays hidden until the opening has cleared it, then comes in whole', () => {
  assert.equal(tapeReady(0.5, 20), 0)
  assert.equal(tapeReady(0.85, 20), 0)
  assert.ok(tapeReady(0.91, 20) > 0 && tapeReady(0.91, 20) < 1)
  assert.equal(tapeReady(1, 20), 1)
  assert.equal(tapeReady(1.2, 20), 1)
})
