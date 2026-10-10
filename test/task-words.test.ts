// Run with: node --test test/task-words.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { advance, quadrantOf, readTask } from '../src/main/task-words.ts'

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

test('"every month" is monthly, not every Monday', () => {
  const read = readTask('pay rent every month', new Date(2026, 9, 7, 10, 0))
  assert.equal(day(read.due), 'Wed Oct 07 2026')
  assert.equal(day(advance(new Date(2026, 9, 7, 9), 'every month').toISOString()), 'Sat Nov 07 2026')
})

test('a repeat of nothing still moves on', () => {
  assert.equal(day(advance(new Date(2026, 9, 5, 9), 'every 0 days').toISOString()), 'Tue Oct 06 2026')
})

test('a monthly series on the 31st keeps its day after a short month', () => {
  const feb = advance(new Date(2026, 0, 31, 9), 'every month', 31)
  assert.equal(day(feb.toISOString()), 'Sat Feb 28 2026')
  assert.equal(day(advance(feb, 'every month', 31).toISOString()), 'Tue Mar 31 2026')
})

test('"tonight" and "this evening" are timed at eight', () => {
  for (const words of ['call mom tonight', 'call mom this evening']) {
    const read = readTask(words, at)
    assert.equal(read.title, 'call mom')
    assert.equal(new Date(read.due!).toString().slice(0, 21), 'Mon Oct 05 2026 20:00')
    assert.equal(read.allDay, false)
  }
})

test('"weekly" before a noun is part of the name, not a repeat', () => {
  for (const words of ['Write the weekly review', 'weekly review notes', 'read my daily log']) {
    const read = readTask(words, at)
    assert.equal(read.title, words)
    assert.equal(read.recurrence, null)
  }
})

test('"weekly" saying when is still a repeat', () => {
  assert.equal(readTask('review the garden weekly', at).recurrence, 'every week')
  assert.equal(readTask('review the garden weekly', at).title, 'review the garden')
  assert.equal(readTask('water plants weekly on monday', at).recurrence, 'every week')
  assert.equal(readTask('stretch daily !!', at).recurrence, 'every day')
})

test('a leading "Someday:" takes its colon with it', () => {
  const read = readTask('Someday: learn to bind books', at)
  assert.equal(read.title, 'Learn to bind books')
  assert.equal(read.plan, 'someday')
  assert.equal(readTask('Tomorrow: call Sam', at).title, 'Call Sam')
})

test('a date word taken from the front leaves a capital, and nothing else changes case', () => {
  assert.equal(readTask('every monday water plants', at).title, 'Water plants')
  assert.equal(readTask('call mom tonight', at).title, 'call mom')
  assert.equal(readTask('review the garden weekly', at).title, 'review the garden')
})

test('a trailing !alert, !quiet or !pull is the task\'s own reminder level, not its title', () => {
  const alert = readTask('call the vet tomorrow 3pm !alert', at)
  assert.equal(alert.notify, 'alerts')
  assert.equal(alert.title, 'call the vet')
  assert.equal(readTask('stretch !quiet', at).notify, 'quiet')
  assert.equal(readTask('tidy the desk !PULL', at).notify, 'pull')
  assert.equal(readTask('tidy the desk', at).notify, null)
})

test('a reminder word never clashes with the !s of a priority', () => {
  const read = readTask('file taxes by friday !! !alerts', at)
  assert.equal(read.priority, 2)
  assert.equal(read.notify, 'alerts')
  assert.equal(read.title, 'file taxes')
  // Glued to a word, or a word that only starts like one, it stays in the title.
  assert.equal(readTask('say wow!alert', at).notify, null)
  assert.equal(readTask('buy !quieter fan', at).notify, null)
})

test('urgent is late or within two days; important is the flag', () => {
  const on = (days: number): string => new Date(2026, 9, 5 + days, 9).toISOString()
  const task = (days: number | null, important: number, deadline: number | null = null) => ({ dueAt: days === null ? null : on(days), deadline: deadline === null ? null : on(deadline), important })
  assert.equal(quadrantOf(task(0, 1), at), 'do')
  assert.equal(quadrantOf(task(-3, 1), at), 'do')
  assert.equal(quadrantOf(task(2, 0), at), 'handoff')
  assert.equal(quadrantOf(task(3, 1), at), 'plan')
  assert.equal(quadrantOf(task(null, 1), at), 'plan')
  assert.equal(quadrantOf(task(null, 0), at), 'drop')
  assert.equal(quadrantOf(task(9, 0), at), 'drop')
  // A deadline counts as much as a scheduled day.
  assert.equal(quadrantOf(task(9, 0, 1), at), 'handoff')
})

test('words kept as plain text are not read, and stay in the title', () => {
  const text = 'call mom tomorrow 5pm p1'
  const from = text.indexOf('tomorrow 5pm')
  const read = readTask(text, at, [{ from, to: from + 'tomorrow 5pm'.length }])
  assert.equal(read.due, null)
  assert.equal(read.priority, 1)
  assert.equal(read.title, 'call mom tomorrow 5pm')
  const plainP1 = readTask(text, at, [{ from: text.indexOf('p1'), to: text.length }])
  assert.equal(plainP1.priority, 0)
  assert.equal(day(plainP1.due), 'Tue Oct 06 2026')
  assert.equal(plainP1.title, 'call mom p1')
})

test('a bare length is how long, not when: "10 min walk every day"', () => {
  const read = readTask('10 min walk every day', at)
  assert.equal(read.title, '10 min walk')
  assert.equal(read.recurrence, 'every day')
  // All day from today, not ten minutes from now.
  assert.equal(read.allDay, true)
  assert.equal(day(read.due), 'Mon Oct 05 2026')
  assert.ok(!read.spans.some((span) => span.kind === 'date'))
})

test('a length beside a day keeps the day: "read 20 min tomorrow"', () => {
  const read = readTask('read 20 min tomorrow', at)
  assert.equal(read.title, 'read 20 min')
  assert.equal(day(read.due), 'Tue Oct 06 2026')
  assert.equal(read.allDay, true)
})

test('"in 10 min" is still a time from now', () => {
  const read = readTask('stretch in 10 minutes', at)
  assert.equal(read.title, 'stretch')
  assert.equal(new Date(read.due!).toString().slice(0, 21), 'Mon Oct 05 2026 10:10')
})

test('a length alone is no date at all', () => {
  const read = readTask('10 min walk', at)
  assert.equal(read.due, null)
  assert.equal(read.title, '10 min walk')
})

test('~30m and ~1h set how long a task takes', () => {
  const half = readTask('write the report ~30m tomorrow', at)
  assert.equal(half.estimate, 30)
  assert.equal(half.title, 'write the report')
  assert.equal(day(half.due), 'Tue Oct 06 2026')
  assert.ok(half.spans.some((span) => span.kind === 'length' && 'write the report ~30m tomorrow'.slice(span.from, span.to) === '~30m'))
  assert.equal(readTask('plan the trip ~1h', at).estimate, 60)
  assert.equal(readTask('plan the trip ~1h30m', at).estimate, 90)
  assert.equal(readTask('plan the trip ~1.5h', at).estimate, 90)
  assert.equal(readTask('stretch ~ 10 min', at).estimate, 10)
})

test('a length without a tilde stays in the name', () => {
  const read = readTask('read 20 min tomorrow', at)
  assert.equal(read.estimate, null)
  assert.equal(read.title, 'read 20 min')
})
