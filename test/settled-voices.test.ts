// Run with: node --test test/settled-voices.test.ts
// An older recording's voices settled as a new one's are: a voice in under 5% of the lines is folded into the nearest.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { settledVoices, type MeetingLine } from '../src/main/meeting-doc.ts'

// The user's 8 Nov recording, by its counts: s2 151, s4 106, s5 86, s8 20, s6 6, s7 4, s1 1, s3 1, and one line of yours.
const said = (): MeetingLine[] => {
  const who = ['s1', 'you', 's3', ...Array(151).fill('s2'), ...Array(106).fill('s4'), ...Array(86).fill('s5'), ...Array(20).fill('s8'), ...Array(6).fill('s6'), ...Array(4).fill('s7')]
  return who.map((one, at) => ({ id: `l${at}`, who: one, at: at * 10, end: at * 10 + 5, text: `line ${at}` }))
}

test('the 8 Nov recording: eight voices become four, numbered as they first spoke', () => {
  const out = settledVoices({ lines: said(), speakers: ['s1', 's2', 's3', 's4', 's5', 's6', 's7', 's8'], actions: [{ id: 'a0', text: 'tell the same', owner: 's8', date: null, at: 0, done: false, task: null, by: 'found' }] })!
  assert.equal(out.was, 8)
  assert.deepEqual(out.speakers, ['s1', 's2', 's3', 's4'])
  assert.equal(out.lines.length, 376)
  assert.equal(out.lines.filter((one) => one.who === 'you').length, 1)
  assert.equal(out.actions[0].owner, 's4')
  assert.equal(settledVoices({ ...out }), null)
})

test('a named voice is never folded, and settled voices are left alone', () => {
  assert.equal(settledVoices({ lines: said(), speakers: [], names: { s1: 'Thandi', s3: 'Sam', s6: 'A', s7: 'B' } }), null)
  assert.equal(settledVoices({ lines: said().filter((one) => ['s2', 's4'].includes(one.who)), speakers: ['s2', 's4'] }), null)
})
