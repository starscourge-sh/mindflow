// Run with: node --test test/practices.test.ts
// A practice: what its minutes count as, the pill's bar, when it is offered, and the better time.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { bestHour, fillOf, honestOf, logLine, nextProblem, offerDue, partOfDay, stageOf } from '../src/main/practice-rules.ts'

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

test('the honest record: real minutes a day over two weeks, only days it was offered or done', () => {
  const now = new Date(2026, 9, 24, 20, 0)
  const on = (back: number, minutes: number): { startedAt: string; minutes: number } => ({ startedAt: new Date(2026, 9, 24 - back, 21, 0).toISOString(), minutes })
  const daily = { days: [0, 1, 2, 3, 4, 5, 6], targetMin: 30, createdAt: new Date(2026, 8, 1).toISOString() }
  assert.equal(honestOf([], daily, now), null, 'nothing yet')
  // 13 days back to yesterday offered; 4 done (20 + 30 + 10 + 28 = 88), 9 not: 88 / 13 = 6.8.
  assert.deepEqual(honestOf([on(1, 20), on(2, 30), on(3, 10), on(4, 28)], daily, now), { planned: 30, average: 7, days: 14 })
  // Done today counts today: 88 + 22 over 14 days = 7.9.
  assert.equal(honestOf([on(0, 22), on(1, 20), on(2, 30), on(3, 10), on(4, 28)], daily, now)!.average, 8)
  // Weekdays only: weekends with nothing done are left out. Oct 24 2026 is a Saturday.
  const weekdays = { ...daily, days: [1, 2, 3, 4, 5] }
  const done = [1, 2, 3, 4, 5, 8, 9, 10, 11, 12].map((back) => on(back, 22))
  assert.deepEqual(honestOf(done, weekdays, now), { planned: 30, average: 22, days: 14 })
  // A Sunday done anyway counts as a day.
  assert.equal(honestOf([...done, on(6, 33)], weekdays, now)!.average, 23)
  // Begun 3 days ago: only those days.
  assert.deepEqual(honestOf([on(1, 15), on(2, 25)], { ...daily, createdAt: new Date(2026, 9, 22).toISOString() }, now), { planned: 30, average: 20, days: 3 })
})
