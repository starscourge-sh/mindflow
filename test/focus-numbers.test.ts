// Run with: node --test test/focus-numbers.test.ts
process.env.TZ = 'Europe/London'
import { test } from 'node:test'
import assert from 'node:assert/strict'
const { focusStats, taskFocus, streaks, outcomeOf } = await import('../src/main/focus-numbers.ts')

const row = (start: string, minutes: number, extra: Record<string, unknown> = {}) => ({
  id: start, taskId: 't1', title: 'Budget', startedAt: new Date(start).toISOString(),
  endedAt: new Date(new Date(start).getTime() + minutes * 60000 + ((extra.pausedMs as number) ?? 0)).toISOString(),
  pausedMs: 0, plannedMs: 25 * 60000, abandonedAt: null, ...extra
})

test('a session ends finished, early or abandoned', () => {
  assert.equal(outcomeOf(row('2026-10-10T09:00', 25)), 'finished')
  assert.equal(outcomeOf(row('2026-10-10T09:00', 24.5)), 'finished')
  assert.equal(outcomeOf(row('2026-10-10T09:00', 15)), 'early')
  assert.equal(outcomeOf(row('2026-10-10T09:00', 15, { plannedMs: null })), 'finished')
  assert.equal(outcomeOf(row('2026-10-10T09:00', 15, { abandonedAt: '2026-10-10T09:15:00Z' })), 'abandoned')
})

test('a task counts its kept time, its last session and its endings', () => {
  const focus = taskFocus([
    row('2026-10-08T09:00', 25), row('2026-10-09T09:00', 10), row('2026-10-10T09:00', 5, { abandonedAt: 'x' })
  ])
  assert.equal(focus.sessions, 2)
  assert.equal(focus.minutes, 35)
  assert.deepEqual([focus.finished, focus.early, focus.abandoned], [1, 1, 1])
  assert.equal(focus.recent.length, 3)
  assert.equal(focus.recent[2].outcome, 'abandoned')
  assert.equal(focus.lastAt, focus.recent.length && new Date(new Date('2026-10-10T09:00').getTime() + 5 * 60000).toISOString())
})

test('a streak runs through yesterday until today is worked', () => {
  const days = new Set(['2026-10-08', '2026-10-09', '2026-10-10', '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04'])
  assert.deepEqual(streaks(days, '2026-10-11'), { now: 3, best: 4 })
  assert.deepEqual(streaks(days, '2026-10-12'), { now: 0, best: 4 })
  assert.deepEqual(streaks(new Set(), '2026-10-12'), { now: 0, best: 0 })
})

test('Stats: days, weeks, pauses, breaks, best time and top tasks', () => {
  const now = new Date('2026-10-14T18:00')
  const stats = focusStats([
    row('2026-10-14T09:00', 25), row('2026-10-13T09:30', 50, { plannedMs: 50 * 60000, pausedMs: 120000 }),
    row('2026-10-12T20:00', 25, { taskId: 't2', title: 'Plan' }), row('2026-10-06T09:00', 30, { plannedMs: null }),
    row('2026-10-05T09:00', 5, { abandonedAt: 'x' })
  ], [{ at: '2026-10-13T10:25:00Z', ms: 300000 }, { at: '2026-10-13T11:00:00Z', ms: 10000 }], now)
  assert.equal(stats.today, 25)
  assert.equal(stats.week, 100)
  assert.equal(stats.weekBefore, 30)
  assert.equal(stats.weeks[11].minutes, 100)
  assert.equal(stats.weeks[10].minutes, 30)
  assert.deepEqual(stats.streak, { now: 3, best: 3 })
  assert.equal(stats.sessions, 4)
  assert.equal(stats.average, 33)
  assert.equal(stats.longest, 50)
  assert.deepEqual(stats.best, { part: 'morning', hour: 9 })
  assert.deepEqual(stats.outcomes, { finished: 4, early: 0, abandoned: 1 })
  assert.deepEqual(stats.pauses, { sessions: 1, minutes: 2 })
  // A break under half a minute is not counted.
  assert.deepEqual(stats.breaks, { n: 1, minutes: 5 })
  assert.equal(stats.top[0].title, 'Budget')
  assert.equal(stats.top[0].minutes, 105)
  assert.equal(stats.days.length, 28)
  assert.equal(stats.weeks.length, 12)
  assert.equal(stats.total.sessions, 4)
})

test('nothing yet is nothing, not an error', () => {
  const stats = focusStats([], [], new Date('2026-10-14T18:00'))
  assert.equal(stats.total.sessions, 0)
  assert.equal(stats.best, null)
  assert.equal(stats.average, 0)
  assert.equal(stats.top.length, 0)
})
