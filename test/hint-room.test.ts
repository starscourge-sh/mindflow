// Run with: node --test test/hint-room.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { hintRoom, HINT_SIDE } from '../src/main/hint-room.ts'

const BASE = { left: 48, top: 88, right: 48, bottom: 48 }
const SCREEN = { x: 0, y: 25, width: 1440, height: 875 }
// A screen too short for a hint under the card held at its tallest (600).
const SHORT = { x: 0, y: 25, width: 1440, height: 700 }
const at = (x: number, y: number, width = 640) => ({ x, y, width, height: 280 })

test('"One line to start": room under the pill for the box a new line grows it into, where the screen has it', () => {
  const pill = (y: number) => ({ x: 400, y, width: 640, height: 56 })
  // The pill at the top of the screen: 48 + (280 - 56) under it, more than the hint's own room.
  assert.equal(hintRoom(pill(94), SCREEN, BASE, true).room.bottom, BASE.bottom + 280 - 56)
  // Near the screen's foot it keeps what the screen has, never less than its own room.
  assert.equal(hintRoom(pill(700), SCREEN, BASE, true).room.bottom, 25 + 875 - (700 + 56) - 8)
  assert.equal(hintRoom(pill(860), SCREEN, BASE, true).room.bottom, BASE.bottom)
  // Not "One line to start": as before, the hint's room alone.
  assert.equal(hintRoom(pill(94), SCREEN, BASE).room.bottom, Math.min(BASE.bottom + 168, 25 + 875 - (94 + 600) - 8))
})

test('the top middle of a laptop screen: the hint sits under the card (note 277ae401)', () => {
  const { side, room } = hintRoom(at(400, 25 + 69), SCREEN, BASE)
  assert.equal(side, 'below')
  // Room for it under the card at its tallest, never past the screen's foot.
  assert.equal(room.bottom, Math.min(48 + 168, 25 + 875 - (94 + 600) - 8))
  assert.deepEqual({ ...room, bottom: 48 }, BASE)
})

test('lower on the screen, with room both ways: still under the card, never above or beside it', () => {
  assert.equal(hintRoom(at(400, 100), { ...SCREEN, height: 1200 }, BASE).side, 'below')
  for (const x of [20, 400, 780]) assert.equal(hintRoom(at(x, 60), SCREEN, BASE).side, 'below')
})

test('no room under it: above, with as much room as a hint needs', () => {
  assert.deepEqual(hintRoom(at(400, 400), SCREEN, BASE), { side: 'above', room: { ...BASE, top: 88 + 168 } })
})

test('no room under or above it: the hint waits, never beside the card', () => {
  assert.deepEqual(hintRoom(at(400, 25 + 69), SHORT, BASE), { side: null, room: BASE })
  assert.equal(hintRoom(at(20, 60), SHORT, BASE).side, null)
})

test('"One line to start": the right is the round controls\' room where the screen has it', () => {
  assert.equal(hintRoom(at(20, 60), SHORT, BASE, true).room.right, HINT_SIDE)
  for (const width of [1280, 1440, 1920]) {
    const screen = { x: 0, y: 25, width, height: 700 }
    const middle = at(Math.round((width - 640) / 2), 94)
    // A 1280 screen leaves 312px beside a 640px box at its middle, short of the controls' 344.
    assert.equal(hintRoom(middle, screen, BASE, true).room.right, width >= 1440 ? HINT_SIDE : BASE.right, `top middle of a ${width} screen`)
    assert.equal(hintRoom(at(width - 660, 94), screen, BASE, true).room.right, BASE.right, `right edge of a ${width} screen`)
  }
})
