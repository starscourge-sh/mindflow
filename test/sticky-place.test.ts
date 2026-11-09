// Run with: node --test test/sticky-place.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cardInView, rubber, settle, tween } from '../src/main/sticky-place.ts'

const area = { x: 0, y: 25, width: 1440, height: 875 }

test('a paper window may hang past the edge, its card never does', () => {
  const inset = { left: 20, top: 20, right: 20, bottom: 20 }
  assert.deepEqual(cardInView({ x: -200, y: 500, width: 300, height: 220 }, inset, area), { x: -20, y: 500, width: 300, height: 220 })
  assert.deepEqual(cardInView({ x: 1400, y: 880, width: 300, height: 220 }, inset, area), { x: 1440 - 280, y: 900 - 200, width: 300, height: 220 })
})

test('a grip pulled past its limit gives at most 6 points', () => {
  assert.equal(rubber(300, 220, 480), 300)
  assert.ok(rubber(1000, 220, 480) <= 486 && rubber(1000, 220, 480) > 485)
  assert.ok(rubber(200, 220, 480) < 220 && rubber(200, 220, 480) > 214)
})

test('settle starts at 0, ends exactly at 1, and goes a little past on the way', () => {
  assert.equal(settle(0), 0)
  assert.equal(settle(1), 1)
  const peak = Math.max(...Array.from({ length: 100 }, (_, i) => settle(i / 100)))
  assert.ok(peak > 1 && peak < 1.15)
})

test('a tween is told 1 exactly once, at the end', async () => {
  const seen: number[] = []
  await new Promise<void>((done) => tween(60, (t) => void seen.push(t), done))
  assert.equal(seen.filter((t) => t === 1).length, 1)
  assert.equal(seen.at(-1), 1)
  // How many frames land before the end depends on how busy the machine is: a loaded one may give only the last.
  assert.ok(seen.every((t, i) => i === 0 || t >= seen[i - 1]))
})
