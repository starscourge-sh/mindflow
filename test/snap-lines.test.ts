// Run with: node --test test/snap-lines.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cameOnto, lineUp, EDGE, GAP, LEAVE, SNAP } from '../src/main/snap-lines.ts'

const area = { x: 0, y: 25, width: 1440, height: 875 }
const card = (x: number, y: number) => ({ x, y, width: 260, height: 180 })
const middleX = 720 - 130

test('near the screen middle, the card is drawn onto it with a line down the middle', () => {
  const at = lineUp(card(middleX + 5, 300), [], area)
  assert.equal(at.x, middleX)
  assert.equal(at.y, 300)
  assert.deepEqual(at.lines, [{ axis: 'x', at: 720 }])
})

test('the middle across too: a line across the screen', () => {
  const y = Math.round(25 + 875 / 2 - 90)
  const at = lineUp(card(400, y - 6), [], area)
  assert.equal(at.y, y)
  assert.deepEqual(at.lines, [{ axis: 'y', at: Math.round(25 + 875 / 2) }])
})

test('a margin in from the screen edge', () => {
  const at = lineUp(card(EDGE + 4, 300), [], area)
  assert.equal(at.x, EDGE)
  assert.deepEqual(at.lines, [{ axis: 'x', at: EDGE }])
  const right = lineUp(card(1440 - EDGE - 260 - 7, 300), [], area)
  assert.equal(right.x, 1440 - EDGE - 260)
  assert.deepEqual(right.lines, [{ axis: 'x', at: 1440 - EDGE }])
})

test('another card: left edges line up, anywhere on the screen', () => {
  const other = { x: 300, y: 600, width: 200, height: 120 }
  const at = lineUp(card(303, 100), [other], area)
  assert.equal(at.x, 300)
  assert.deepEqual(at.lines, [{ axis: 'x', at: 300 }])
})

test('another card beside it: a gap beside its edge', () => {
  const other = { x: 300, y: 280, width: 200, height: 120 }
  const at = lineUp(card(500 + GAP + 6, 300), [other], area)
  assert.equal(at.x, 500 + GAP)
})

test('far from every line it stays where the hand has it, with no lines', () => {
  const at = lineUp(card(400, 300), [], area)
  assert.deepEqual([at.x, at.y, at.lines.length], [400, 300, 0])
})

test('held on a line it stays until the hand goes LEAVE past, then follows exactly', () => {
  const first = lineUp(card(middleX + SNAP, 300), [], area)
  assert.equal(first.x, middleX)
  const still = lineUp(card(middleX + LEAVE, 300), [], area, first.held)
  assert.equal(still.x, middleX)
  const left = lineUp(card(middleX + LEAVE + 1, 300), [], area, still.held)
  assert.equal(left.x, middleX + LEAVE + 1)
  assert.equal(left.lines.length, 0)
  // Back toward it: only within SNAP again.
  assert.equal(lineUp(card(middleX + SNAP + 1, 300), [], area, left.held).x, middleX + SNAP + 1)
})

test('one tick coming onto a line, none while held there, one for a new line', () => {
  assert.equal(cameOnto({}, { x: 10 }), true)
  assert.equal(cameOnto({ x: 10 }, { x: 10 }), false)
  assert.equal(cameOnto({ x: 10 }, {}), false)
  assert.equal(cameOnto({ x: 10 }, { x: 10, y: 5 }), true)
})
