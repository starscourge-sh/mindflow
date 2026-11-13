// Run with: node --test test/room-clock.test.ts
// The room a row leaves closes on the clock rows already move on when a carried row makes room (carry.tsx, SLIDE):
// one length and one curve for both, so a list never moves two ways. The two are written down in two files
// (carry.tsx is the drag helper's, and keeps its own); this holds them together.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const carry = readFileSync('src/renderer/src/components/haligtree/carry.tsx', 'utf8')
const room = readFileSync('src/renderer/src/lib/room.ts', 'utf8')

test("the room closes on the rows' own slide: the same length and the same curve", () => {
  const slide = /const SLIDE = \{ duration: ([\d.]+), ease: \[([\d., ]+)\]/.exec(carry)
  assert.ok(slide, 'carry.tsx still names its slide SLIDE, with a duration and a curve')
  const ms = /export const ROOM_MS = (\d+)/.exec(room)
  const ease = /export const ROOM_EASE = 'cubic-bezier\(([\d., ]+)\)'/.exec(room)
  assert.ok(ms && ease, 'room.ts names its length and its curve')
  assert.equal(Number(ms[1]), Math.round(Number(slide[1]) * 1000))
  assert.deepEqual(ease[1].split(',').map(Number), slide[2].split(',').map(Number))
})

test('the room moves rows by translate and holds room by padding, never by a transform or a style written on the row', () => {
  // A list's own transforms (carry.tsx slides rows by theirs) are never written over, and nothing React or the virtual list reads is changed.
  assert.ok(!/\.style\.(transform|translate|padding|margin|height)/.test(room), 'no inline style is written')
  assert.ok(!/transform:/.test(room.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')), 'no transform is animated')
})

test('every way a row leaves with a flight keeps its room: the Bin, a task closed, a capture sent on', () => {
  const fly = readFileSync('src/renderer/src/lib/fly-home.ts', 'utf8')
  assert.match(fly, /export function binFlightFrom[\s\S]{0,700}keepRoom\(from\)/)
  assert.match(fly, /export function liftFrom[\s\S]{0,400}keepRoom\(from\)/)
  // The ball's lift-off closes it: where it lands is asked as it lifts.
  assert.match(fly, /one\.go\(\(\) => \(room\?\.close\(FLIGHT_MS\), to\(\)\)/)
})
