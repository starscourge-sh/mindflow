// Dates and times lit in notes (main/date-words.ts): what is surely a date in prose, and the day it means.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { dateWords } from '../src/main/date-words.ts'

const at = new Date('2026-11-06T09:00')
const hm = (date: Date): string => `${date.getHours()}:${String(date.getMinutes()).padStart(2, '0')}`
const lit = (text: string, on = at): string[][] => dateWords(text, on, hm).map((one) => [one.text, one.said])

test('days, written dates and clock times are lit, with the day they mean', () => {
  assert.deepEqual(lit('Seminar on Friday at 3pm'), [['Friday at 3pm', 'Friday 6 November, 15:00']])
  assert.deepEqual(lit('Essay due 14 Nov'), [['14 Nov', 'Saturday 14 November']])
  assert.deepEqual(lit('read chapter 3 by tomorrow'), [['tomorrow', 'Saturday 7 November']])
  assert.deepEqual(lit('on 2026-11-20 the exam'), [['2026-11-20', 'Friday 20 November']])
  assert.deepEqual(lit('died in May 2020'), [['May 2020', 'May 2020']])
})
test('prose that only looks like time is left alone', () => {
  for (const text of ['I may go', 'a second time', 'The 1960s were wild', 'March of the penguins', 'sun was out', 'I sat for a minute', 'at 10', 'version 2.0', 'The Sunday Times said', 'Page 12 of 300', 'in an hour'])
    assert.deepEqual(lit(text), [], text)
})
test('an old note reads "tomorrow" as the day after it was written', () => {
  assert.deepEqual(lit('see you tomorrow', new Date('2026-03-02T10:00')), [['tomorrow', 'Tuesday 3 March']])
  assert.deepEqual(lit('see you tomorrow', new Date('2025-12-31T10:00')), [['tomorrow', 'Thursday 1 January 2026']])
})
test('a bare "today" is not lit, a full stop is the sentence’s', () => {
  assert.deepEqual(lit('What happened today'), [])
  assert.deepEqual(lit('Due 14 Nov.'), [['14 Nov', 'Saturday 14 November']])
  assert.deepEqual(lit('today at 5pm'), [['today at 5pm', 'Friday 6 November, 17:00']])
})
