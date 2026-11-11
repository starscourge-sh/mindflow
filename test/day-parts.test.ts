import { test } from 'node:test'
import assert from 'node:assert/strict'
import { MORNING_FROM, isMorning, smallHours } from '../src/main/day-parts.ts'
import { dayPart } from '../src/main/journal-words.ts'
import { partOfDay } from '../src/main/practice-rules.ts'

// 11 Nov: at 4:30 the Day page said "Night pages: whatever will not let you sleep". From 4 it is morning.
test('morning starts at 4, one rule for every part of the day', () => {
  assert.equal(MORNING_FROM, 4)
  assert.equal(smallHours(3), true)
  assert.equal(smallHours(4), false)
  assert.equal(isMorning(3), false)
  assert.equal(isMorning(4), true)
  assert.equal(isMorning(11), true)
  assert.equal(isMorning(12), false)
})

test('the Day page asks a morning question from 4', () => {
  assert.equal(dayPart(0), 'late')
  assert.equal(dayPart(3), 'late')
  assert.equal(dayPart(4), 'morning')
  assert.equal(dayPart(11), 'morning')
  assert.equal(dayPart(22), 'evening')
  assert.equal(dayPart(23), 'late')
})

test('practice speaks of mornings from 4', () => {
  assert.equal(partOfDay(3), 'Nights')
  assert.equal(partOfDay(4), 'Mornings')
})
