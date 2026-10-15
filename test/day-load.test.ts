// Run with: node --test test/day-load.test.ts
process.env.TZ = 'Europe/London'
import { test } from 'node:test'
import assert from 'node:assert/strict'
const { busyMinutes, loadOf, lengthSaid, loadSaid, leastFirst, planMoves, onDay, byTime, placeEvents } = await import('../src/main/day-load.ts')

const at = (day: string, time: string): string => new Date(`${day}T${time}:00`).toISOString()
const ev = (day: string, from: string, to: string, allDay = false) => ({ start: at(day, from), end: at(day, to), allDay })
const D = '2026-10-20' // a Tuesday

test('meetings: overlaps once, all-day left out, clipped to the day', () => {
  const from = new Date(`${D}T00:00:00`).getTime()
  const to = from + 86400000
  assert.equal(busyMinutes([ev(D, '09:00', '10:00'), ev(D, '09:30', '11:00'), ev(D, '13:00', '14:00')], from, to), 180)
  assert.equal(busyMinutes([ev(D, '00:00', '23:59', true), ev(D, '09:00', '10:00')], from, to), 60)
  // Inside another one: counted once.
  assert.equal(busyMinutes([ev(D, '09:00', '12:00'), ev(D, '10:00', '11:00')], from, to), 180)
  // From the evening before: only the part inside the day.
  assert.equal(busyMinutes([{ start: at('2026-10-19', '23:00'), end: at(D, '01:00'), allDay: false }], from, to), 60)
})

test('a day load against its room', () => {
  const load = loadOf(D, [ev(D, '09:00', '14:00')], [{ estimate: 120 }, { estimate: 120 }, { estimate: null }, { estimate: 0 }], 480)
  assert.deepEqual(load, { day: D, meetings: 300, tasks: 240, unsized: 2, count: 4, room: 480, over: 60, free: 0 })
  assert.equal(loadSaid(load), '5 h meetings · 4 h tasks')
  assert.equal(lengthSaid(60), '1 h')
  assert.equal(lengthSaid(270), '4 h 30 min')
  assert.equal(lengthSaid(45), '45 min')
  // A one-minute task is never "about 0 min".
  assert.equal(lengthSaid(1), '1 min')
  assert.equal(lengthSaid(2), '2 min')
})

const task = (id: string, day: string, estimate: number | null, extra: Record<string, unknown> = {}) =>
  ({ id, estimate, priority: 0, important: 0, dueAt: at(day, '10:00'), deadline: null, ...extra })

test('the least pressing first, by the Matrix', () => {
  const now = new Date(`2026-10-14T09:00:00`)
  const list = [
    task('do', D, 30, { important: 1, deadline: at('2026-10-15', '17:00') }),
    task('plan', D, 30, { important: 1 }),
    task('neither-low', D, 30, { priority: 4 }),
    task('neither-none', D, 30),
    task('urgent-only', D, 30, { deadline: at('2026-10-15', '17:00') })
  ]
  assert.deepEqual(leastFirst(list, now).map((one) => one.id), ['neither-none', 'neither-low', 'urgent-only', 'plan', 'do'])
})

test('moves on the least pressing, to the next weekday with room', () => {
  const now = new Date(`2026-10-14T09:00:00`)
  const room = 480
  const days = ['2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23', '2026-10-24', '2026-10-25', '2026-10-26'].map((day) => ({ day, tasks: [] as ReturnType<typeof task>[], events: [] as ReturnType<typeof ev>[] }))
  days[0].events = [ev(D, '09:00', '14:00')]
  days[0].tasks = [task('big', D, 120, { important: 1 }), task('small', D, 60, { priority: 4 }), task('free', D, 60), task('nolength', D, null), task('duebyonly', D, 120, { dueAt: null, deadline: at(D, '17:00') })]
  days[1].events = [ev('2026-10-21', '09:00', '16:30')] // 7h30: no room for an hour
  const loads = days.map((one) => ({ load: loadOf(one.day, one.events, one.tasks, room), tasks: one.tasks }))
  assert.equal(loads[0].load.over, 180)
  const moves = planMoves(D, loads, now)
  // 3h over: the two least pressing hours go to Thursday, then the important two hours too.
  assert.deepEqual(moves.map((one) => [one.id, one.to]), [['free', '2026-10-22'], ['small', '2026-10-22'], ['big', '2026-10-22']])
  // Never a weekend: Friday full, so Saturday and Sunday are passed for Monday.
  const full = loads.map((one) => one.load.day === '2026-10-22' || one.load.day === '2026-10-23' ? { ...one, load: { ...one.load, meetings: room } } : one)
  assert.deepEqual(planMoves(D, full, now).map((one) => one.to), ['2026-10-26', '2026-10-26', '2026-10-26'])
  // A day that fits moves nothing.
  assert.deepEqual(planMoves('2026-10-21', loads, now), [])
})

test('a moved task keeps its time of day, across a clock change', () => {
  assert.equal(new Date(onDay(at('2026-10-23', '15:30'), '2026-10-26')).toString().slice(0, 21), new Date(at('2026-10-26', '15:30')).toString().slice(0, 21))
})

test('one line by time', () => {
  const line = byTime([ev(D, '09:00', '10:00'), ev(D, '00:00', '23:59', true), ev(D, '14:00', '15:00')], [{ at: at(D, '11:00') }, { at: at(D, '08:00') }])
  assert.deepEqual(line.map((one) => one.kind === 'event' ? (one.one.allDay ? 'allday' : one.one.start.slice(11, 16)) : 't' + one.one.at.slice(11, 16)), ['allday', 't07:00', '08:00', 't10:00', '13:00'])
})

test('events placed among cards in their own order', () => {
  const cards = [{ key: 'a', at: null }, { key: 'b', at: at(D, '10:00') }, { key: 'c', at: null }, { key: 'd', at: at(D, '15:00') }, { key: 'e', at: null }]
  const placed = placeEvents([ev(D, '09:00', '09:30'), ev(D, '12:00', '13:00'), ev(D, '17:00', '18:00'), ev(D, '00:00', '00:00', true)], cards)
  assert.deepEqual([...placed.entries()].map(([key, list]) => [key, list.length]), [['top', 1], ['b', 1], ['d', 1], ['e', 1]])
  // No timed card: all at the top, as before.
  assert.deepEqual([...placeEvents([ev(D, '09:00', '10:00')], [{ key: 'a', at: null }]).keys()], ['top'])
})
