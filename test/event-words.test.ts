// Run with: node --test test/event-words.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readEvent } from '../src/main/event-words.ts'

// Saturday 17 October 2026, 10 in the morning.
const NOW = new Date(2026, 9, 17, 10, 0)
const local = (iso: string | null): string => {
  if (!iso) return 'none'
  const d = new Date(iso)
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

test('"lunch with Sam fri 1-2pm @Cafe"', () => {
  const got = readEvent('lunch with Sam fri 1-2pm @Cafe', NOW)
  assert.equal(got.title, 'Lunch with Sam')
  assert.equal(local(got.start), '2026-10-23 13:00')
  assert.equal(local(got.end), '2026-10-23 14:00')
  assert.equal(got.allDay, false)
  assert.equal(got.place, 'Cafe')
  assert.deepEqual(got.people, ['Sam'])
})

test('a place of several words, and a person spelt as you already have them', () => {
  const got = readEvent('coffee with sam and Jo tomorrow 9am @Cafe Nero', NOW, ['Sam Carter'])
  assert.equal(got.place, 'Cafe Nero')
  assert.deepEqual(got.people, ['Sam Carter', 'Jo'])
  assert.equal(local(got.start), '2026-10-18 09:00')
  assert.equal(local(got.end), '2026-10-18 10:00')
})

test('a length, all day, and no day at all', () => {
  const standup = readEvent('standup monday 9:30 for 15 min', NOW)
  assert.equal(standup.title, 'Standup')
  assert.equal(local(standup.end), '2026-10-19 09:45')
  const exam = readEvent('exam 3 nov all day', NOW)
  assert.equal(exam.allDay, true)
  assert.equal(local(exam.start), '2026-11-03 00:00')
  const bare = readEvent('think about the garden', NOW)
  assert.equal(bare.start, null)
  assert.equal(bare.title, 'Think about the garden')
})

test('repeats said in the words', () => {
  assert.deepEqual(readEvent('gym every mon, wed 7am', NOW).repeat, { freq: 'weekly', days: [1, 3] })
  assert.deepEqual(readEvent('review every weekday 5pm', NOW).repeat, { freq: 'weekly', days: [1, 2, 3, 4, 5] })
  assert.equal(readEvent('rent every month 1 nov', NOW).repeat?.freq, 'monthly')
})
