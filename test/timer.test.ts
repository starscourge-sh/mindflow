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

import { nextStretch, roundsFrom } from '../src/renderer/src/lib/timer.ts'

test('4x25 is four 25-minute rounds with 5-minute breaks', () => {
  const said = roundsFrom('4x25 essay draft')
  assert.ok(said)
  assert.equal(said.rounds, 4)
  assert.equal(said.workMs, 25 * 60_000)
  assert.equal(said.breakMs, 5 * 60_000)
  assert.equal(said.longMs, 15 * 60_000)
  assert.equal(said.goal, 'essay draft')
  assert.equal('4x25 essay draft'.slice(said.span.from, said.span.to), '4x25')
})

test('4x25/5 says the break too, and it can come last', () => {
  const said = roundsFrom('write the essay 3 × 50/10')
  assert.ok(said)
  assert.equal(said.rounds, 3)
  assert.equal(said.workMs, 50 * 60_000)
  assert.equal(said.breakMs, 10 * 60_000)
  assert.equal(said.goal, 'write the essay')
  assert.equal(roundsFrom('4x25/5')?.goal, 'Focus')
})

test('not rounds: too short, too many, or part of a word', () => {
  assert.equal(roundsFrom('2x4 lumber'), null)
  assert.equal(roundsFrom('40x25'), null)
  assert.equal(roundsFrom('buy 4x25mm screws'), null)
  assert.equal(roundsFrom('the 1920x1080 screen'), null)
})

test('a long break follows the fourth round, then it ends', () => {
  const steps: string[] = []
  let at: Parameters<typeof nextStretch>[0] | null = { rounds: 4, round: 1, phase: 'work', workMs: 1, breakMs: 1, longMs: 1 }
  while (at) {
    steps.push(`${at.phase}${at.round}`)
    at = nextStretch(at)
  }
  assert.deepEqual(steps, ['work1', 'break1', 'work2', 'break2', 'work3', 'break3', 'work4', 'long4'])
  assert.equal(nextStretch({ rounds: 2, round: 2, phase: 'work', workMs: 1, breakMs: 1, longMs: 1 }), null)
})
