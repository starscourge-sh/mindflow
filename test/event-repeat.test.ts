// Run with: node --test test/event-repeat.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { indexOf, occurrences, repeatSaid, splitAt, type Repeat } from '../src/main/event-repeat.ts'

/** Each date as "2026-10-30 09:00", in the machine's own time, as the calendar shows it. */
const days = (list: Date[]): string[] => list.map((one) => {
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${one.getFullYear()}-${pad(one.getMonth() + 1)}-${pad(one.getDate())} ${pad(one.getHours())}:${pad(one.getMinutes())}`
})
const local = (y: number, m: number, d: number, h = 9, min = 0): Date => new Date(y, m - 1, d, h, min)

test('every day, and every 3 days', () => {
  assert.deepEqual(days(occurrences({ freq: 'daily' }, local(2026, 10, 1), local(2026, 10, 1), local(2026, 10, 4))), ['2026-10-01 09:00', '2026-10-02 09:00', '2026-10-03 09:00'])
  assert.deepEqual(days(occurrences({ freq: 'daily', every: 3 }, local(2026, 10, 1), local(2026, 10, 1), local(2026, 10, 11))), ['2026-10-01 09:00', '2026-10-04 09:00', '2026-10-07 09:00', '2026-10-10 09:00'])
})

test('weekdays skip the weekend', () => {
  // Friday 16 October 2026.
  const got = days(occurrences({ freq: 'weekly', days: [1, 2, 3, 4, 5] }, local(2026, 10, 16), local(2026, 10, 16), local(2026, 10, 21)))
  assert.deepEqual(got, ['2026-10-16 09:00', '2026-10-19 09:00', '2026-10-20 09:00'])
})

test('weekly on chosen days, and every 2 weeks', () => {
  // Monday 5 October.
  const rule: Repeat = { freq: 'weekly', days: [3, 1] }
  assert.deepEqual(days(occurrences(rule, local(2026, 10, 5), local(2026, 10, 5), local(2026, 10, 15))), ['2026-10-05 09:00', '2026-10-07 09:00', '2026-10-12 09:00', '2026-10-14 09:00'])
  const fortnight = days(occurrences({ freq: 'weekly', every: 2, days: [1] }, local(2026, 10, 5), local(2026, 10, 1), local(2026, 11, 3)))
  assert.deepEqual(fortnight, ['2026-10-05 09:00', '2026-10-19 09:00', '2026-11-02 09:00'])
})

test('a weekly day before the start in its first week is not counted', () => {
  // Starts Wednesday 7 October, on Mondays and Wednesdays: the Monday before is not one.
  assert.deepEqual(days(occurrences({ freq: 'weekly', days: [1, 3] }, local(2026, 10, 7), local(2026, 10, 1), local(2026, 10, 13))), ['2026-10-07 09:00', '2026-10-12 09:00'])
})

test('monthly on the last Friday', () => {
  // Friday 30 October 2026 is the last Friday of October.
  const rule: Repeat = { freq: 'monthly', by: 'nth', nth: -1 }
  const got = days(occurrences(rule, local(2026, 10, 30, 16), local(2026, 10, 1), local(2027, 3, 1)))
  assert.deepEqual(got, ['2026-10-30 16:00', '2026-11-27 16:00', '2026-12-25 16:00', '2027-01-29 16:00', '2027-02-26 16:00'])
})

test('monthly on the 2nd Tuesday', () => {
  // Tuesday 13 October 2026 is the second Tuesday.
  const got = days(occurrences({ freq: 'monthly', by: 'nth', nth: 2 }, local(2026, 10, 13), local(2026, 10, 1), local(2027, 1, 31)))
  assert.deepEqual(got, ['2026-10-13 09:00', '2026-11-10 09:00', '2026-12-08 09:00', '2027-01-12 09:00'])
})

test('a fifth weekday is skipped in months without one', () => {
  // Thursday 29 October 2026 is a fifth Thursday; November has none, December has the 31st.
  const got = days(occurrences({ freq: 'monthly', by: 'nth', nth: 5 }, local(2026, 10, 29), local(2026, 10, 1), local(2027, 1, 1)))
  assert.deepEqual(got, ['2026-10-29 09:00', '2026-12-31 09:00'])
})

test('monthly on a date takes the last day of a short month', () => {
  const got = days(occurrences({ freq: 'monthly' }, local(2027, 1, 31), local(2027, 1, 1), local(2027, 4, 15)))
  assert.deepEqual(got, ['2027-01-31 09:00', '2027-02-28 09:00', '2027-03-31 09:00'])
})

test('yearly, with 29 February on the 28th in other years', () => {
  const got = days(occurrences({ freq: 'yearly' }, local(2028, 2, 29), local(2028, 1, 1), local(2030, 12, 31)))
  assert.deepEqual(got, ['2028-02-29 09:00', '2029-02-28 09:00', '2030-02-28 09:00'])
})

test('ends on a day, or after so many times, counted from the very first', () => {
  const until = days(occurrences({ freq: 'daily', until: '2026-10-03' }, local(2026, 10, 1), local(2026, 9, 1), local(2026, 12, 1)))
  assert.deepEqual(until, ['2026-10-01 09:00', '2026-10-02 09:00', '2026-10-03 09:00'])
  // Five in all: a span starting after the third shows only the last two.
  const count = days(occurrences({ freq: 'daily', count: 5 }, local(2026, 10, 1), local(2026, 10, 4), local(2026, 12, 1)))
  assert.deepEqual(count, ['2026-10-04 09:00', '2026-10-05 09:00'])
})

test('the time of day stays the same over a clock change', () => {
  const got = occurrences({ freq: 'weekly' }, local(2026, 3, 20, 9), local(2026, 3, 1), local(2026, 4, 15))
  assert.ok(got.every((one) => one.getHours() === 9 && one.getMinutes() === 0), days(got).join(', '))
})

test('which time in the series, and splitting for "This and following"', () => {
  const rule: Repeat = { freq: 'weekly', count: 6 }
  assert.equal(indexOf(rule, local(2026, 10, 5), local(2026, 10, 19)), 2)
  assert.equal(indexOf(rule, local(2026, 10, 5), local(2026, 10, 20)), -1)
  const { before, after } = splitAt(rule, local(2026, 10, 5), local(2026, 10, 19))
  assert.deepEqual(days(occurrences(before, local(2026, 10, 5), local(2026, 1, 1), local(2027, 1, 1))), ['2026-10-05 09:00', '2026-10-12 09:00'])
  assert.equal(after.count, 4)
  const open = splitAt({ freq: 'daily' }, local(2026, 10, 1), local(2026, 10, 4))
  assert.equal(open.before.until, '2026-10-03')
  assert.equal(open.after.until, undefined)
})

test('rules said in words', () => {
  assert.equal(repeatSaid({ freq: 'monthly', by: 'nth', nth: -1 }, local(2026, 10, 30)), 'Monthly on the last Friday')
  assert.equal(repeatSaid({ freq: 'monthly', by: 'nth', nth: 2 }, local(2026, 10, 13)), 'Monthly on the second Tuesday')
  assert.equal(repeatSaid({ freq: 'weekly', days: [1, 2, 3, 4, 5] }, local(2026, 10, 13)), 'Every weekday')
  assert.equal(repeatSaid({ freq: 'weekly', every: 2, days: [3, 1], count: 5 }, local(2026, 10, 5)), 'Every 2 weeks on Monday and Wednesday, 5 times')
  assert.equal(repeatSaid({ freq: 'monthly' }, local(2026, 10, 22)), 'Monthly on the 22nd')
  assert.equal(repeatSaid({ freq: 'daily', until: '2026-12-18' }, local(2026, 10, 22)), 'Every day, until 18 December 2026')
})
