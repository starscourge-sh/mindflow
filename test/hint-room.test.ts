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

test('"One line to start": the right is the round controls\' room, always; a hint goes left or above', () => {
  const { side, room } = hintRoom(at(20, 60), SCREEN, BASE, true)
  assert.equal(side, null)
  assert.equal(room.right, HINT_SIDE)
  assert.equal(hintRoom(at(400, 94), SCREEN, BASE, true).side, 'left')
})

test('"One line to start" at three screen widths: the controls\' room on the right only where the screen has it', () => {
  for (const width of [1280, 1440, 1920]) {
    const screen = { x: 0, y: 25, width, height: 875 }
    const middle = at(Math.round((width - 640) / 2), 94)
    // A 1280 screen leaves 312px beside a 640px box at its middle, short of the controls' 344: above the pill there.
    assert.equal(hintRoom(middle, screen, BASE, true).room.right, width >= 1440 ? HINT_SIDE : BASE.right, `top middle of a ${width} screen`)
    // At the right edge there is no room for them there: the room stays as it is, and the page puts them above the pill.
    assert.equal(hintRoom(at(width - 660, 94), screen, BASE, true).room.right, BASE.right, `right edge of a ${width} screen`)
  }
})
