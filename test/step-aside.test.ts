// Run with: node --test test/step-aside.test.ts
// What floats over your work steps aside for a pointer at rest beside it: where it goes, and where it never goes.
import { test } from 'node:test'
import assert from 'node:assert/strict'
const { NEAR, REST_MS, beside, topPlaces, cornerPlace, crosses, clearPlace, overlaps } = await import('../src/main/step-aside.ts')

const area = { x: 0, y: 25, width: 1440, height: 875 }
// The bubble's window at the top middle, where it starts.
const pill = { x: 550, y: 31, width: 340, height: 64 }
const places = topPlaces(pill, area)

test('beside is on it or within 48 points of it, and six readings make a rest', () => {
  assert.equal(NEAR, 48)
  assert.equal(REST_MS, 600)
  assert.equal(beside({ x: 600, y: 60 }, pill), true)
  assert.equal(beside({ x: 600, y: 31 + 64 + 47 }, pill), true)
  assert.equal(beside({ x: 600, y: 31 + 64 + 48 }, pill), false)
  assert.equal(beside({ x: 550 - 49, y: 60 }, pill), false)
})

test('the bubble has three places: the left, the middle and the right of the top of its screen', () => {
  assert.deepEqual(places, [{ x: 12, y: 31 }, { x: 550, y: 31 }, { x: 1088, y: 31 }])
})

test('a pointer resting under its right half sends it along the top to the left, and under its left half to the right', () => {
  assert.deepEqual(clearPlace(pill, { x: 800, y: 120 }, places), { x: 12, y: 31 })
  assert.deepEqual(clearPlace(pill, { x: 640, y: 120 }, places), { x: 1088, y: 31 })
})

test('put low on the page with the pointer in the field under it, it goes straight up: never down over the pointer', () => {
  const low = { ...pill, y: 640 }
  const to = clearPlace(low, { x: 720, y: 730 }, topPlaces(low, area))
  assert.deepEqual(to, { x: 550, y: 31 })
})

test('it never lands where the pointer would be beside it again', () => {
  const left = { ...pill, x: 12 }
  // In the top left corner with the pointer level with it at its right: every other place is across the pointer, so it stays.
  assert.deepEqual(clearPlace(left, { x: 380, y: 60 }, places), null)
  // The pointer by where the top middle would put it: the middle is not clear of it, so it is passed over for the next.
  assert.deepEqual(clearPlace(pill, { x: 800, y: 120 }, [{ x: 700, y: 31 }, { x: 12, y: 31 }]), { x: 12, y: 31 })
})

test('in a corner with the pointer on its open side, it goes round the pointer, never over it', () => {
  const left = { ...pill, x: 12 }
  // Under its right half: every place is towards the pointer, and the top middle is reached passing above it.
  assert.deepEqual(clearPlace(left, { x: 300, y: 130 }, places), { x: 550, y: 31 })
  // Under its own clear room there is no way round: it stays.
  assert.deepEqual(clearPlace(left, { x: 340, y: 90 }, [{ x: 550, y: 31 }]), null)
})

test('a way that would pass over the pointer is not taken', () => {
  // Sliding right along the top with the pointer in the way, further along.
  assert.equal(crosses(pill, { x: 1088, y: 31 }, { x: 1000, y: 60 }), true)
  assert.equal(crosses(pill, { x: 12, y: 31 }, { x: 1000, y: 60 }), false)
  // The pointer under the window's own clear room is only left behind.
  assert.equal(crosses(pill, { x: 12, y: 31 }, { x: 880, y: 90 }), false)
  // Passing 10 points above the pointer is over it when a berth of 12 is asked.
  assert.equal(crosses(pill, { x: 1088, y: 31 }, { x: 1000, y: 105 }), false)
  assert.equal(crosses(pill, { x: 1088, y: 31 }, { x: 1000, y: 105 }, 12), true)
})

test('on a second screen every place is on that screen, and so is where it goes', () => {
  const second = { x: 1440, y: -180, width: 1920, height: 1055 }
  const there = { x: 2230, y: -174, width: 340, height: 64 }
  const spots = topPlaces(there, second)
  for (const spot of spots) assert.equal(spot.x >= second.x && spot.x + there.width <= second.x + second.width && spot.y >= second.y && spot.y + there.height <= second.y + second.height, true)
  assert.deepEqual(clearPlace(there, { x: 2500, y: -80 }, spots), { x: 1452, y: -174 })
})

test('a place it is already at is not a move', () => {
  assert.equal(clearPlace(pill, { x: 720, y: 400 }, [{ x: 550, y: 31 }]), null)
})

test('a card has the four corners, the top right first, and grows up from a bottom one', () => {
  const size = { width: 360, height: 150 }
  assert.deepEqual(cornerPlace('top-right', size, area), { x: 1070, y: 33 })
  assert.deepEqual(cornerPlace('bottom-right', size, area), { x: 1070, y: 742 })
  assert.deepEqual(cornerPlace('top-left', size, area), { x: 10, y: 33 })
  assert.deepEqual(cornerPlace('bottom-left', { width: 360, height: 300 }, area), { x: 10, y: 592 })
})

test('overlap is told for the card and the window bar it must stay off', () => {
  assert.equal(overlaps({ x: 1070, y: 33, width: 360, height: 150 }, { x: 200, y: 25, width: 1240, height: 60 }), true)
  assert.equal(overlaps({ x: 1070, y: 742, width: 360, height: 150 }, { x: 200, y: 25, width: 1240, height: 60 }), false)
})

test('low on the page with the pointer resting above it: up and away when there is a way, never through the pointer', () => {
  const low = { ...pill, y: 640 }
  // Above it and off its right end: up and to the left, away from the pointer.
  assert.deepEqual(clearPlace(low, { x: 920, y: 600 }, topPlaces(low, area)), { x: 12, y: 31 })
  // Right above it: every way to the top passes over the pointer, so it stays.
  assert.deepEqual(clearPlace(low, { x: 800, y: 600 }, topPlaces(low, area)), null)
})
