// Run with: node --test test/practices.test.ts
// A practice: what its minutes count as, the pill's bar, when it is offered, and the better time.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { bestHour, fillOf, logLine, nextProblem, offerDue, partOfDay, stageOf } from '../src/main/practice-rules.ts'

const MIN = 60_000

test('every minute counts: partial under 5, complete to the target, met past it', () => {
  assert.equal(stageOf(3, 30), 'partial')
  assert.equal(stageOf(5, 30), 'complete')
  assert.equal(stageOf(29.9, 30), 'complete')
  assert.equal(stageOf(30, 30), 'met')
  assert.equal(stageOf(70, 30), 'met')
})

test('the bar: gold to the notch at 5, calmer to the target, full past it', () => {
  assert.deepEqual(fillOf(0, 30), { first: 0, bonus: 0, notch: 5 / 30, stage: 'start' })
  assert.deepEqual(fillOf(5 * MIN, 30), { first: 5 / 30, bonus: 0, notch: 5 / 30, stage: 'min' })
  const at15 = fillOf(15 * MIN, 30)
  assert.equal(at15.stage, 'min')
  assert.ok(Math.abs(at15.bonus - 10 / 30) < 1e-9)
  const at30 = fillOf(30 * MIN, 30)
  assert.equal(at30.stage, 'met')
  assert.ok(Math.abs(at30.first + at30.bonus - 1) < 1e-9)
  assert.equal(fillOf(60 * MIN, 30).stage, 'long')
  assert.ok(Math.abs(fillOf(90 * MIN, 30).first + fillOf(90 * MIN, 30).bonus - 1) < 1e-9)
})

test('offered at its time on its days, for a few hours, and nothing piles up', () => {
  const p = { days: [3], at: '21:00' }
  const wed = (h: number, m = 0): Date => new Date(2026, 9, 21, h, m)
  const none = { ranToday: false, skippedToday: false, laterAt: null }
  assert.equal(offerDue(p, wed(20, 59), none), false)
  assert.equal(offerDue(p, wed(21, 0), none), true)
  assert.equal(offerDue(p, wed(23, 30), none), true)
  assert.equal(offerDue(p, new Date(2026, 9, 22, 21, 0), none), false, 'not on a Thursday')
  assert.equal(offerDue(p, wed(21, 5), { ...none, skippedToday: true }), false, 'not tonight is gone until next time')
  assert.equal(offerDue(p, wed(21, 5), { ...none, ranToday: true }), false)
  const later = wed(21, 35).getTime()
  assert.equal(offerDue(p, wed(21, 10), { ...none, laterAt: later }), false, 'in 30 min waits')
  assert.equal(offerDue(p, wed(21, 36), { ...none, laterAt: later }), true)
})

test('the better time: the hour you are usually about, not the one skipped', () => {
  const hours = [7, 7, 7, 7, 8, 8, 21, 21, 21, 21, 21, 22, 13, 13]
  assert.equal(bestHour(hours, 21), 7)
  assert.equal(bestHour([21, 21, 21, 20, 22], 21), null)
  assert.equal(partOfDay(7), 'Mornings')
  assert.equal(partOfDay(21), 'Nights')
})

test('the log line, and the next problem', () => {
  assert.equal(logLine('Design patterns', 14.2), 'practice:: design patterns, 14 min')
  assert.equal(logLine('LeetCode', 0.2), 'practice:: LeetCode, 1 min')
  const list = { type: 'doc', content: [{ type: 'taskList', content: [
    { type: 'taskItem', attrs: { checked: true }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Two sum' }] }] },
    { type: 'taskItem', attrs: { checked: false }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Three sum' }] }] }
  ] }] }
  assert.deepEqual(nextProblem(list, 0), { text: 'Three sum', index: 1, total: 2 })
  assert.deepEqual(nextProblem('- Arrays\n- Strings\n- Trees', 4), { text: 'Strings', index: 1, total: 3 })
})
