// Run with: node --test test/goal-tuck.test.ts
// A goal card's place by the clock: shown, peeking or tucked, and when it peeks out on its own.
import { test } from 'node:test'
import assert from 'node:assert/strict'
const { restNow, peeksOut, cardComesDown, OUT_OF_SIGHT_MS } = await import('../src/main/goal-tuck.ts')

const rules = { on: true, showUntil: '09:00', showFrom: '17:00', between: 'peek' as const, inFocus: 'tuck' as const, peekOut: true }

test('off, a card is always shown', () => {
  assert.equal(restNow({ ...rules, on: false }, '12:00', true), 'show')
})

test('shown before 9 and from 17, peeking in between', () => {
  assert.equal(restNow(rules, '08:59', false), 'show')
  assert.equal(restNow(rules, '09:00', false), 'peek')
  assert.equal(restNow(rules, '16:59', false), 'peek')
  assert.equal(restNow(rules, '17:00', false), 'show')
  assert.equal(restNow({ ...rules, between: 'tuck' }, '12:00', false), 'tuck')
})

test('a focus session tucks it, whatever the hour, unless told to stay', () => {
  assert.equal(restNow(rules, '20:00', true), 'tuck')
  assert.equal(restNow({ ...rules, inFocus: 'peek' }, '20:00', true), 'peek')
  assert.equal(restNow({ ...rules, inFocus: 'stay' }, '12:00', true), 'peek')
  assert.equal(restNow({ ...rules, inFocus: 'stay' }, '20:00', true), 'show')
})

test('hours that cross midnight, and the same hour twice', () => {
  const owl = { ...rules, showUntil: '23:00', showFrom: '06:00' }
  assert.equal(restNow(owl, '23:30', false), 'peek')
  assert.equal(restNow(owl, '03:00', false), 'peek')
  assert.equal(restNow(owl, '12:00', false), 'show')
  assert.equal(restNow({ ...rules, showFrom: '09:00' }, '12:00', false), 'show')
  assert.equal(restNow({ ...rules, showFrom: 'later' }, '12:00', false), 'show')
})

test('out of sight two days, it peeks out once that day', () => {
  const now = Date.parse('2026-10-21T10:00:00Z')
  assert.equal(peeksOut('tuck', rules, now - OUT_OF_SIGHT_MS, undefined, now, '2026-10-21'), true)
  assert.equal(peeksOut('tuck', rules, now - OUT_OF_SIGHT_MS, '2026-10-21', now, '2026-10-21'), false)
  assert.equal(peeksOut('tuck', rules, now - OUT_OF_SIGHT_MS + 1, undefined, now, '2026-10-21'), false)
  assert.equal(peeksOut('peek', rules, now - OUT_OF_SIGHT_MS, undefined, now, '2026-10-21'), false)
  assert.equal(peeksOut('tuck', { ...rules, peekOut: false }, now - OUT_OF_SIGHT_MS, undefined, now, '2026-10-21'), false)
})

test('a goal card comes down when its goal no longer asks for one, but not one stuck by hand while its goal is open', () => {
  // The goal asks for a card of its own: it stays, stuck by hand or not.
  assert.equal(cardComesDown(true, false, true), false)
  assert.equal(cardComesDown(true, true, true), false)
  // The goal does not ask for one: its card comes down...
  assert.equal(cardComesDown(false, false, true), true)
  // ...unless it was stuck by hand: that one is the person's own, and stays while the goal is open.
  assert.equal(cardComesDown(false, true, true), false)
  // A goal that is over keeps no card, stuck by hand or not.
  assert.equal(cardComesDown(false, true, false), true)
  assert.equal(cardComesDown(false, false, false), true)
})
