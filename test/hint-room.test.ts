// Run with: node --test test/hint-room.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { hintRoom, HINT_SIDE } from '../src/main/hint-room.ts'

const BASE = { left: 48, top: 88, right: 48, bottom: 48 }
const SCREEN = { x: 0, y: 25, width: 1440, height: 875 }
const at = (x: number, y: number, width = 640) => ({ x, y, width, height: 280 })

test('the top middle of a laptop screen: no room above, so the hint sits beside the card on the left', () => {
  const { side, room } = hintRoom(at(400, 25 + 69), SCREEN, BASE)
  assert.equal(side, 'left')
  assert.deepEqual(room, { ...BASE, left: HINT_SIDE })
})

test('lower on the screen: above the card, with as much room as a hint needs', () => {
  assert.deepEqual(hintRoom(at(400, 400), SCREEN, BASE), { side: 'above', room: { ...BASE, top: 88 + 168 } })
  // Just enough room: only what the screen has.
  assert.deepEqual(hintRoom(at(400, 25 + 8 + 88 + 140), SCREEN, BASE), { side: 'above', room: { ...BASE, top: 88 + 140 } })
})

test('at the top left of the screen: beside the card on the right', () => {
  assert.equal(hintRoom(at(20, 60), SCREEN, BASE).side, 'right')
  assert.equal(hintRoom(at(20, 60), SCREEN, BASE).room.right, HINT_SIDE)
})

test('the side panel open (a wide card) at the top: still the left, which it does not grow into', () => {
  assert.equal(hintRoom(at(360, 60, 1080), SCREEN, BASE).side, 'left')
})

test('the side panel open on a 1440 laptop at the top middle: no room on either side, so the hint waits', () => {
  assert.equal(hintRoom(at(180, 94, 1080), SCREEN, BASE).side, null)
})

test('no room anywhere: the hint waits, the room as it always is', () => {
  assert.deepEqual(hintRoom(at(100, 60, 1240), SCREEN, BASE), { side: null, room: BASE })
})
