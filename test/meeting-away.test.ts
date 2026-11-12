// Run with: node --test test/meeting-away.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { NO_SIGNALS, SIGNALS, anywayKept, awayWhy, deskAway, inMeeting, seenSaid, signalsOn, type Signals } from '../src/main/meeting-away.ts'

const only = (...on: (typeof SIGNALS)[number][]): Signals => ({ ...NO_SIGNALS, ...Object.fromEntries(on.map((one) => [one, true])) })

test('no signal, no meeting', () => {
  assert.equal(inMeeting(NO_SIGNALS, true), false)
  assert.deepEqual(signalsOn(NO_SIGNALS), [])
  assert.equal(seenSaid(NO_SIGNALS), 'Nothing is on')
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
  assert.equal(seenSaid(only('camera')), 'A camera is on')
})

test('“Show anyway” brings the desk back, for a meeting and for quiet hours', () => {
  assert.equal(deskAway(true, false, true), false)
  assert.equal(deskAway(false, true, true), false)
  assert.equal(deskAway(true, true, false), true)
  assert.equal(deskAway(false, false, false), false)
})

test('“Show anyway” lasts as long as what hid them, and no longer', () => {
  assert.equal(anywayKept(true, 'meeting', 'meeting'), true)
  assert.equal(anywayKept(true, 'quiet', 'quiet'), true)
  // The meeting over: forgotten, so the next meeting hides them again.
  assert.equal(anywayKept(true, 'meeting', null), false)
  // Asked for in quiet hours, then a call starts: they hide for the call. And a call ending into quiet hours.
  assert.equal(anywayKept(true, 'quiet', 'meeting'), false)
  assert.equal(anywayKept(true, 'meeting', 'quiet'), false)
  assert.equal(anywayKept(false, 'meeting', 'meeting'), false)
})

test('why the desk is away: a meeting is said before quiet hours', () => {
  assert.equal(awayWhy(true, true), 'meeting')
  assert.equal(awayWhy(false, true), 'quiet')
  assert.equal(awayWhy(false, false), null)
})

test('what it sees names the surest signal, in words short enough for one line', () => {
  assert.equal(seenSaid(only('mic')), 'Another app has the microphone')
  assert.equal(seenSaid(only('mic', 'camera')), 'A camera is on')
  assert.equal(seenSaid(only('recording', 'mirrored')), 'Haligtree is recording')
  assert.equal(seenSaid(only('event')), 'A meeting is on in Calendar')
  assert.equal(seenSaid(only('mirrored')), 'The screen is mirrored')
  for (const one of SIGNALS) assert.ok(seenSaid(only(one)).length <= 30, one)
})
