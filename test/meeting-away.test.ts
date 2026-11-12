// Run with: node --test test/meeting-away.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { NO_SIGNALS, SIGNALS, anywayKept, awayWhy, deskAway, inMeeting, seenSaid, signalsOn, type Signals } from '../src/main/meeting-away.ts'

const only = (...on: (typeof SIGNALS)[number][]): Signals => ({ ...NO_SIGNALS, ...Object.fromEntries(on.map((one) => [one, true])) })

test('no signal, no meeting', () => {
  assert.equal(inMeeting(NO_SIGNALS, true), false)
  assert.deepEqual(signalsOn(NO_SIGNALS), [])
  assert.equal(seenSaid(NO_SIGNALS, true, false), 'Nothing is on')
})

test('each signal by itself is a meeting', () => {
  for (const one of SIGNALS) {
    assert.equal(inMeeting(only(one), true), true, one)
    assert.equal(deskAway(inMeeting(only(one), true), false, false), true, one)
  }
})

test('two signals overlap: a meeting until the last one ends', () => {
  let signals = only('camera', 'mic')
  assert.equal(inMeeting(signals, true), true)
  signals = { ...signals, camera: false }
  assert.equal(inMeeting(signals, true), true)
  signals = { ...signals, mic: false }
  assert.equal(inMeeting(signals, true), false)
})

test('the setting off: nothing is a meeting, and Settings still says what it sees', () => {
  for (const one of SIGNALS) assert.equal(inMeeting(only(one), false), false, one)
  assert.equal(seenSaid(only('camera'), false, false), 'A camera is on: stickies and goal cards stay out')
})

test('“Show anyway” brings the desk back, for a meeting and for quiet hours', () => {
  assert.equal(deskAway(true, false, true), false)
  assert.equal(deskAway(false, true, true), false)
  assert.equal(deskAway(true, true, false), true)
  assert.equal(deskAway(false, false, false), false)
})

test('“Show anyway” lasts as long as what hid them, and no longer', () => {
  assert.equal(anywayKept(true, true, false), true)
  assert.equal(anywayKept(true, false, true), true)
  // The meeting over and no quiet hours: forgotten, so the next meeting hides them again.
  assert.equal(anywayKept(true, false, false), false)
  assert.equal(anywayKept(false, true, true), false)
})

test('why the desk is away: a meeting is said before quiet hours', () => {
  assert.equal(awayWhy(true, true), 'meeting')
  assert.equal(awayWhy(false, true), 'quiet')
  assert.equal(awayWhy(false, false), null)
})

test('what it sees names the surest signal and what follows from it', () => {
  assert.equal(seenSaid(only('mic'), true, false), 'Another app is using the microphone: stickies and goal cards are hidden')
  assert.equal(seenSaid(only('mic', 'camera'), true, false), 'A camera is on: stickies and goal cards are hidden')
  assert.equal(seenSaid(only('recording', 'mirrored'), true, false), 'Haligtree is recording a meeting: stickies and goal cards are hidden')
  assert.equal(seenSaid(only('event'), true, true), 'A Calendar event with other people is on: stickies and goal cards are shown anyway')
  assert.equal(seenSaid(only('mirrored'), true, false), 'The screen is mirrored: stickies and goal cards are hidden')
})
