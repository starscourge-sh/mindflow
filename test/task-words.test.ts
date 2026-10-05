// Run with: node --test test/task-words.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readTask } from '../src/main/task-words.ts'

// A Monday morning, so "tomorrow" and "friday" land on known days.
const at = new Date(2026, 9, 5, 10, 0)
const day = (iso: string | null): string => (iso ? new Date(iso).toDateString() : 'none')

test('a repeat takes "by" as its start, not a deadline', () => {
  const read = readTask('water plants every week by friday', at)
  assert.equal(read.recurrence, 'every week')
  assert.equal(day(read.due), 'Fri Oct 09 2026')
  assert.equal(read.deadline, null)
})

test('without a repeat, "by" is still a deadline', () => {
  const read = readTask('file taxes by friday', at)
  assert.equal(read.due, null)
  assert.equal(day(read.deadline), 'Fri Oct 09 2026')
})

test('a time-only "by" falls on the scheduled day', () => {
  const read = readTask('call mom tomorrow by 5pm', at)
  assert.equal(day(read.due), 'Tue Oct 06 2026')
  assert.equal(new Date(read.deadline!).toString().slice(0, 21), 'Tue Oct 06 2026 17:00')
  assert.equal(read.deadlineTimed, true)
})
