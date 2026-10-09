// Run with: node --test test/timer.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { timerFrom } from '../src/renderer/src/lib/timer.ts'

const lit = (text: string): string[] => (timerFrom(text)?.spans ?? []).map((span) => text.trim().slice(span.from, span.to))

test('a timer says which words made it one', () => {
  assert.deepEqual(lit('5m tea'), ['5m'])
  assert.deepEqual(lit('timer 25m'), ['timer 25m'])
  assert.deepEqual(lit('set a timer for 1h 30m'), ['set a timer for 1h 30m'])
  assert.deepEqual(lit('timer tea 10 minutes'), ['timer', '10 minutes'])
  assert.equal(timerFrom('5 minutes of reading a day is enough'), null)
})
