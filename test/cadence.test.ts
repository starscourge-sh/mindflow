// Run with: node --test test/cadence.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
const { isDaily, reviewOf, overCap } = await import('../src/main/cadence.ts')

test('a daily habit is one kept every day or every weekday', () => {
  for (const rule of ['every day', 'every 1 day', 'every weekday', 'Every Day', 'every mon, tue, wed, thu, fri']) assert.equal(isDaily(rule), true, rule)
  for (const rule of ['every week', 'every 2 days', 'every month', 'every mon, wed', '', null]) assert.equal(isDaily(rule), false, String(rule))
})

test('each thing has one review: daily habits the week, the rest the month', () => {
  assert.equal(reviewOf({ recurrence: 'every day' }), 'week')
  assert.equal(reviewOf({ recurrence: 'every week' }), 'month')
  assert.equal(reviewOf({}), 'month')
})

test('the cap is soft: how many over, never negative, none when unset', () => {
  assert.equal(overCap(9, 7), 2)
  assert.equal(overCap(5, 7), 0)
  assert.equal(overCap(9, 0), 0)
  assert.equal(overCap(9, null), 0)
})
