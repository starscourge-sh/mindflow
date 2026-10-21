// Run with: node --test test/throw-spot.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { throwSpot } from '../src/main/throw-spot.ts'

const area = { x: 0, y: 25, width: 1600, height: 975 }
const box = { x: 500, y: 300, width: 600, height: 200 }
const L = 12, R = 1600 - 12 - 600, T = 37, B = 1000 - 12 - 200
const way = (deg: number): [number, number] => [Math.cos((deg * Math.PI) / 180), -Math.sin((deg * Math.PI) / 180)]

test('straight throws keep the other place and end flush', () => {
  assert.deepEqual(throwSpot(box, area, 1, 0), { x: R, y: 300 })
  assert.deepEqual(throwSpot(box, area, -1, 0), { x: L, y: 300 })
  assert.deepEqual(throwSpot(box, area, 0, -1), { x: 500, y: T })
  assert.deepEqual(throwSpot(box, area, 0, 1), { x: 500, y: B })
})

test('diagonals from the middle go to the corner', () => {
  const box = { x: 500, y: 412, width: 600, height: 200 }
  for (const [d, at] of [[45, { x: R, y: T }], [135, { x: L, y: T }], [225, { x: L, y: B }], [315, { x: R, y: B }]] as const)
    assert.deepEqual(throwSpot(box, area, ...way(d)), at, `${d} degrees`)
})

test('a shallow angle still goes all the way, straight to that side', () => {
  assert.deepEqual(throwSpot(box, area, ...way(10)), { x: R, y: 300 })
  assert.deepEqual(throwSpot(box, area, ...way(-20)), { x: R, y: 300 })
})

test('a rough diagonal goes into that corner, from anywhere', () => {
  assert.deepEqual(throwSpot(box, area, ...way(30)), { x: R, y: T })
  assert.deepEqual(throwSpot({ ...box, x: L, y: B }, area, ...way(60)), { x: R, y: T })
  assert.deepEqual(throwSpot(box, area, ...way(200)), { x: L, y: 300 })
  assert.deepEqual(throwSpot(box, area, ...way(240)), { x: L, y: B })
})

test('off screen it starts on screen', () => {
  assert.deepEqual(throwSpot({ ...box, x: -400 }, area, -1, 0), { x: L, y: 300 })
})
