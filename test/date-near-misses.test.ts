// Run with: node --test test/date-near-misses.test.ts
// A letter with no number, or a word half typed at the caret, is never a time
// or a date (quick capture lit "the m" in "drive to the m" as "Today 5:56").
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dateIn, datesIn, readTask, saysWhen } from '../src/main/task-words.ts'
import { readEvent } from '../src/main/event-words.ts'
import { readValue } from '../src/main/property-words.ts'

const at = new Date(2026, 10, 6, 10, 0)
const dated = (line: string): boolean => {
  const read = readTask(line, at)
  return Boolean(read.due || read.deadline || read.spans.some((one) => one.kind === 'date' || one.kind === 'deadline'))
}

const NEAR_MISSES = [
  'drive to the m', 'at the h', 'pick up the h', 'wait at the s', 'in a sec', 'back in a sec', 'in a minute', 'in a moment',
  'the 1960s', 'read about the 1960s', 'in the 1960s', 'music of the 1980s', 'hold the plank 30s', 'stretch for 5 m',
  'may i go', 'may need more milk', 'march to town', 'march with the band', 'the march of time', 'sun', 'the sun is out',
  'put on sun cream', 'a sun hat', 'lemon tart', 'salmon and rice', 'monkey bars', 'call the monastery', 'mon ami', 'wed to the idea',
  'ask about the mo', 'look into the y', 'find the d', 'the w is silent', 'an h and an m', 'sat nav needs an update', 'the august issue'
]

test('near misses: no date and no time is read', () => {
  for (const line of NEAR_MISSES) assert.equal(dated(line), false, `"${line}" was given a date`)
})

test('the one reader says no to a length with no "in" or "ago"', () => {
  for (const said of ['the m', 'the h', 'a sec', 'in a sec', 'in a minute', '1960s', '30s', '5 m', 'the mo', 'about the mo', 'a m'])
    assert.equal(saysWhen(said), false, said)
  for (const said of ['in 5m', 'in an hour', 'in 2 hours', '2h ago', '3 days later', 'in 1h 30m', 'within 2 days', 'tomorrow 10:00', 'fri 3pm'])
    assert.equal(saysWhen(said), true, said)
  assert.equal(dateIn('the m', at), null)
  assert.equal(datesIn('drive to the m', at).length, 0)
})

test('every reader of typed words shares it: events and properties too', () => {
  assert.equal(readEvent('drive to the m', at).start, null)
  assert.deepEqual(readValue('the h', null, at), { type: 'text', value: 'the h' })
})

test('real whens still read', () => {
  const day = (line: string): string => new Date(readTask(line, at).due!).toString().slice(0, 21)
  assert.equal(day('call mum tomorrow 10:00'), 'Sat Nov 07 2026 10:00')
  assert.equal(day('call mum fri 3pm'), 'Fri Nov 06 2026 15:00')
  assert.equal(day('meet on sun').slice(0, 15), 'Sun Nov 08 2026')
  assert.ok(readTask('stretch in 5m', at).due)
  assert.ok(readTask('ring back in an hour', at).due)
  assert.ok(readTask('mon to fri standup', at).due)
  assert.ok(readTask('call mum sat', at).due)
})

test('100 ordinary task and note lines: none is given a date', () => {
  const lines = readFileSync(new URL('./fixtures-ordinary-lines.txt', import.meta.url), 'utf8').trim().split('\n')
  assert.equal(lines.length, 100)
  assert.deepEqual(lines.filter(dated), [])
})
