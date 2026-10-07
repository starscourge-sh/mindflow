// Run with: node --test test/goal-days.test.ts
// London has clock changes (29 Mar and 25 Oct 2026), so the days are checked across them.
process.env.TZ = 'Europe/London'
import { test } from 'node:test'
import assert from 'node:assert/strict'
const { daysLeft, daysBetween, wayThrough, journey, leftSaid, percent, tempus } = await import('../src/main/goal-days.ts')

test('days left counts calendar days, 0 on the day', () => {
  assert.equal(daysLeft('2026-12-14', '2026-10-07'), 68)
  assert.equal(daysLeft('2026-10-07', '2026-10-07'), 0)
  assert.equal(daysLeft('2026-10-08', '2026-10-07'), 1)
  assert.equal(daysLeft('2026-10-06', '2026-10-07'), -1)
  assert.equal(leftSaid(68), '68 days left')
  assert.equal(leftSaid(1), '1 day left')
  assert.equal(leftSaid(0), 'Today')
  assert.equal(leftSaid(-3), '3 days past')
})

test('a clock change neither adds nor loses a day', () => {
  // The autumn change: 25 Oct has 25 hours.
  assert.equal(daysBetween('2026-10-24', '2026-10-26'), 2)
  // The spring change: 29 Mar has 23 hours.
  assert.equal(daysBetween('2026-03-28', '2026-03-30'), 2)
  assert.equal(daysBetween('2026-01-01', '2027-01-01'), 365)
})

test('the share of the way is time gone between start and target', () => {
  // Halfway through a ten-day goal, at noon on its fifth day.
  assert.equal(wayThrough('2026-10-01', '2026-10-11', new Date(2026, 9, 5, 12)), 0.45)
  assert.equal(wayThrough('2026-10-01', '2026-10-11', new Date(2026, 9, 11, 9)), 1)
  assert.equal(wayThrough('2026-10-01', '2026-10-11', new Date(2026, 8, 20)), 0)
  // Started and due the same day: all the way.
  assert.equal(wayThrough('2026-10-07', '2026-10-07', new Date(2026, 9, 7, 8)), 1)
  // Midday on the long day of the autumn change is not quite half of it.
  assert.ok(Math.abs(wayThrough('2026-10-25', '2026-10-26', new Date(2026, 9, 25, 12)) - 13 / 25) < 1e-9)
  assert.equal(percent(0.999), '99%')
  assert.equal(percent(1), '100%')
  assert.equal(percent(0.414), '41%')
})

test('the journey has a dot a day across month ends and clock changes', () => {
  const road = journey('2026-10-20', '2026-11-03', '2026-10-27')
  assert.equal(road.by, 'day')
  assert.equal(road.dots.length, 15)
  assert.deepEqual(road.dots.map((dot) => dot.day).slice(4, 8), ['2026-10-24', '2026-10-25', '2026-10-26', '2026-10-27'])
  // 20 Oct 2026 is a Tuesday: the second row of the first column.
  assert.deepEqual([road.dots[0].col, road.dots[0].row], [0, 1])
  // Monday 26 Oct starts the second column.
  assert.deepEqual([road.dots[6].col, road.dots[6].row], [1, 0])
  assert.equal(road.cols, 3)
  assert.equal(road.dots.filter((dot) => dot.past).length, 7)
  assert.equal(road.dots.find((dot) => dot.today)?.day, '2026-10-27')
  assert.equal(road.dots.at(-1)?.target, true)
  assert.deepEqual(road.months.map((one) => one.label), ['Oct 2026'])
  // A leap year's February has its 29th.
  assert.ok(journey('2028-02-27', '2028-03-02').dots.some((dot) => dot.day === '2028-02-29'))
})

test('a road longer than a year has a dot a week', () => {
  const road = journey('2026-10-07', '2028-10-07', '2026-10-07')
  assert.equal(road.by, 'week')
  assert.ok(road.dots.length >= 104 && road.dots.length <= 106)
  assert.equal(road.dots[0].today, true)
  assert.equal(road.dots.at(-1)?.last, '2028-10-07')
  assert.equal(road.dots.at(-1)?.target, true)
  assert.equal(road.cols, 25)
  // Every day is in exactly one dot.
  const covered = road.dots.reduce((n, dot) => n + daysBetween(dot.day, dot.last) + 1, 0)
  assert.equal(covered, daysBetween('2026-10-07', '2028-10-07') + 1)
})

test('tempus reads the clock', () => {
  const at = tempus(new Date(2026, 9, 7, 12))
  assert.equal(at.day, 0.5)
  // Wednesday noon: two and a half days into a Monday week.
  assert.equal(at.week, 2.5 / 7)
  assert.ok(at.month > 0.209 && at.month < 0.21)
  assert.ok(at.year > 0.76 && at.year < 0.77)
})
