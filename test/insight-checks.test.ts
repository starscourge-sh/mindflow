// Run with: node --test test/insight-checks.test.ts
// The Feed's insights only reword what the app has checked: a Reframe quotes its note, a vague line is dropped, a
// decision never goes to Connect or Reframe, and a decision comes back as its own "Check back" post near its date.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { checkBackOf, checkConnect, checkReframe, forInsights, holdNext, isDecision } from '../src/main/insight-checks.ts'
import { pickPassages, type Passage } from '../src/main/insight-pick.ts'

const walking = 'Walking without headphones\nI notice more when I walk without headphones. The street talks back: birds, a bus, two people arguing about bread.'
const party = { 'The call': 'Say nothing. The cake was still a surprise.', 'Reopen only if': 'It happens at my party.', ask: 'Does saying nothing still hold?', back: '2026-11-24T12:00:00.000Z' }

test('a Reframe is kept only when its view is in the note, word for word, and its other side is about the same things', () => {
  const kept = checkReframe('“I notice more when I walk without headphones.”', 'With headphones on, the walk is yours alone, and the street can wait.', walking)
  assert.deepEqual(kept, { view: 'I notice more when I walk without headphones.', other: 'With headphones on, the walk is yours alone, and the street can wait.' })
  // A view the model made up, or one too short to say anything, is no quote of the note.
  assert.equal(checkReframe('Silence makes the city louder', 'With headphones on, the walk is yours alone.', walking), null)
  assert.equal(checkReframe('walk without', 'With headphones on, the walk is yours alone.', walking), null)
})

test('a vague other side, sharing no word that means something with the note, is dropped', () => {
  const vague = 'What if the silence broke not with a word but with a sound that made the hidden thing visible'
  assert.equal(checkReframe('I notice more when I walk without headphones', vague, walking), null)
  // Too long, or a question that only says the view again, is dropped too.
  assert.equal(checkReframe('I notice more when I walk without headphones', 'With headphones on the walk is yours and the street can wait while you think about everything else you carry each day', walking), null)
  assert.equal(checkReframe('I notice more when I walk without headphones', 'Do you notice more when you walk without headphones?', walking), null)
  // Connect: the words both notes say must be in both, and why must touch each.
  const bread = 'Sourdough on Sundays\nThe starter needs feeding every morning, like a pet that smells of bread.'
  assert.ok(checkConnect('bread', 'Both notes listen to the street and the bread, one on a walk, one at the starter.', [walking, bread]))
  assert.equal(checkConnect('patience', 'Both are about patience in daily life and small rituals.', [walking, bread]), null)
})

test('a decision note never goes to Reframe or Connect, though it may still be a Feed post', () => {
  assert.ok(isDecision('checkback', party))
  assert.ok(isDecision('decision', {}))
  assert.equal(isDecision('checkback', { ask: 'Did it work?', back: party.back }), false)
  const decision: Passage & { decision?: boolean } = { type: 'capture', id: 'party', title: 'Not saying who spoilt the surprise party', text: "Jimmy's rule in Goodfellas: never rat on your friends, and always keep your mouth shut.", made: '2026-11-09T19:40:00.000Z', tags: [], links: [], decision: true }
  assert.equal(pickPassages(forInsights([decision], 'reframe'), 'reframe', '2026-11-21', 0, new Set()), null)
  assert.equal(pickPassages(forInsights([decision], 'connect'), 'connect', '2026-11-21', 0, new Set()), null)
  assert.equal(forInsights([decision], 'resurface').length, 1)
})

test('the check-back post shows only the fields the note holds, and only from two days before its date to a week after', () => {
  assert.deepEqual(checkBackOf('checkback', party, '2026-11-24'), { back: party.back, call: party['The call'], ask: party.ask, reopen: party['Reopen only if'] })
  assert.ok(checkBackOf('checkback', party, '2026-11-22'))
  assert.ok(checkBackOf('checkback', party, '2026-12-01'))
  assert.equal(checkBackOf('checkback', party, '2026-11-21'), null)
  assert.equal(checkBackOf('checkback', party, '2026-12-02'), null)
  // No reopen written: none shown.
  assert.equal(checkBackOf('decision', { call: 'Walk to work', back: party.back }, '2026-11-24')?.reopen, null)
  // Dismissed, reopened, said to hold or decided again since the window opened: gone.
  assert.equal(checkBackOf('checkback', party, '2026-11-24', '2026-11-23'), null)
  // Said to hold or dismissed today: it stays put for the day, saying so, so nothing under it moves.
  assert.equal(checkBackOf('checkback', party, '2026-11-24', '2026-11-24')?.done, 'dismissed')
  assert.equal(checkBackOf('checkback', { ...party, back: '2026-12-09T12:00:00.000Z', heldAt: '2026-11-24T09:00:00' }, '2026-11-24')?.done, 'held')
  assert.equal(checkBackOf('checkback', { ...party, state: 'Reopened' }, '2026-11-24'), null)
  assert.equal(checkBackOf('checkback', { ...party, heldAt: '2026-11-23T09:00:00.000Z' }, '2026-11-24'), null)
  // "Still holds": the same interval on (made the 9th, back the 24th: 15 days), or 30 days with none.
  const next = holdNext(party, '2026-11-09T19:40:00.000Z', new Date('2026-11-24T10:00:00'))
  assert.equal(new Date(next.back).getDate(), 9)
  assert.equal(new Date(next.back).getMonth(), 11)
  const none = holdNext({ back: '2026-11-24T12:00:00.000Z' }, '2026-11-24T08:00:00.000Z', new Date('2026-11-24T10:00:00'))
  assert.equal(Math.round((new Date(none.back).getTime() - new Date('2026-11-24T12:00:00').getTime()) / 86_400_000), 30)
})
