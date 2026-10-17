// Run with: node --test test/calendar-words.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { advance, commandFor, daySaid, readTask } from '../src/main/task-words.ts'

// A Saturday morning in October.
const at = new Date(2026, 9, 17, 10, 0)
const day = (iso: string | null | undefined): string => (iso ? new Date(iso).toDateString() : 'none')
const time = (iso: string): string => new Date(iso).toTimeString().slice(0, 5)

test('a day typed alone is a day to go to', () => {
  assert.equal(day(daySaid('fri', at)?.due), 'Fri Oct 23 2026')
  assert.equal(day(daySaid('next tuesday', at)?.due), 'Tue Oct 20 2026')
  assert.equal(day(daySaid('3 nov', at)?.due), 'Tue Nov 03 2026')
  assert.equal(day(daySaid('in 2 weeks', at)?.due), 'Sat Oct 31 2026')
  assert.equal(day(daySaid('christmas', at)?.due), 'Fri Dec 25 2026')
  assert.equal(day(daySaid('go to friday', at)?.due), 'Fri Oct 23 2026')
  assert.equal(daySaid('friday 3pm', at)?.timed, true)
})

test('words that are more than a day are not one', () => {
  assert.equal(daySaid('call bob friday', at), null)
  assert.equal(daySaid('may', at), null)
  assert.equal(daySaid('notes', at), null)
  assert.equal(daySaid('every friday', at), null)
})

const timed = { dueAt: new Date(2026, 9, 19, 10, 0).toISOString(), allDay: 0, estimate: 30 }
const allDay = { dueAt: new Date(2026, 9, 19, 9, 0).toISOString(), allDay: 1, estimate: null }

test('move this to friday 3pm sets the day and the time', () => {
  const said = commandFor('move this to Friday 3pm', timed, at)
  assert.equal(said?.kind, 'move')
  if (said?.kind !== 'move') return
  assert.equal(day(said.due), 'Fri Oct 23 2026')
  assert.equal(time(said.due), '15:00')
  assert.equal(said.allDay, false)
})

test('a day alone keeps the time the task had', () => {
  const said = commandFor('tomorrow', timed, at)
  assert.ok(said?.kind === 'move' && day(said.due) === 'Sun Oct 18 2026' && time(said.due) === '10:00' && !said.allDay)
  const plain = commandFor('tomorrow', allDay, at)
  assert.ok(plain?.kind === 'move' && plain.allDay)
})

test('+1h and 30 min earlier move it by that much', () => {
  const later = commandFor('+1h', timed, at)
  assert.ok(later?.kind === 'move' && time(later.due) === '11:00')
  const earlier = commandFor('30 min earlier', timed, at)
  assert.ok(earlier?.kind === 'move' && time(earlier.due) === '09:30')
  const days = commandFor('+2d', allDay, at)
  assert.ok(days?.kind === 'move' && day(days.due) === 'Wed Oct 21 2026' && days.allDay)
})

test('make it 45 minutes gives it a length', () => {
  assert.deepEqual(commandFor('make it 45 minutes', timed, at), { kind: 'length', minutes: 45 })
  assert.deepEqual(commandFor('1h30', timed, at), { kind: 'length', minutes: 90 })
})

test("every last friday repeats on the month's last Friday", () => {
  const said = commandFor('every last friday', timed, at)
  assert.ok(said?.kind === 'repeat' && said.rule === 'every last friday')
  assert.equal(day(readTask('pay rent every last friday', at).due), 'Fri Oct 30 2026')
  assert.equal(new Date(advance(new Date(2026, 9, 30, 9), 'every last friday')).toDateString(), 'Fri Nov 27 2026')
  assert.equal(new Date(advance(new Date(2026, 11, 25, 9), 'every last friday')).toDateString(), 'Fri Jan 29 2027')
})

test('delete, open and duplicate to next week', () => {
  assert.deepEqual(commandFor('delete', timed, at), { kind: 'bin' })
  assert.deepEqual(commandFor('open', timed, at), { kind: 'open' })
  const copy = commandFor('duplicate to next week', timed, at)
  assert.ok(copy?.kind === 'copy' && day(copy.due) === 'Mon Oct 26 2026' && time(copy.due) === '10:00')
  assert.equal(commandFor('call bob', timed, at), null)
})
