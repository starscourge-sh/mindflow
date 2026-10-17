// Run with: node --test test/sticky-place.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cardInView, magnet, rubber, settle, tween, GAP, MARGIN } from '../src/main/sticky-place.ts'

const area = { x: 0, y: 25, width: 1440, height: 875 }
const card = (x: number, y: number) => ({ x, y, width: 260, height: 180 })

test('let go near the screen edge, a card lines up a margin in from it', () => {
  assert.deepEqual(magnet(card(3, 300), [], area), { x: MARGIN, y: 300 })
  assert.deepEqual(magnet(card(1440 - 260 - 15, 300), [], area), { x: 1440 - 260 - MARGIN, y: 300 })
  assert.deepEqual(magnet(card(500, 30), [], area), { x: 500, y: 25 + MARGIN })
})

test('far from everything, it stays where it was let go', () => {
  assert.deepEqual(magnet(card(500, 300), [card(900, 600)], area), { x: 500, y: 300 })
})

test('beside a neighbour, it keeps the gap and lines up its top', () => {
  const other = card(600, 300)
  // Its right edge 5 points short of the line GAP left of the neighbour, top 9 points lower.
  const at = magnet(card(600 - GAP - 260 - 5, 309), [other], area)
  assert.deepEqual(at, { x: 600 - GAP - 260, y: 300 })
})

test('under a neighbour, it keeps the gap and lines up its left', () => {
  const other = card(600, 300)
  const at = magnet(card(606, 300 + 180 + GAP + 10), [other], area)
  assert.deepEqual(at, { x: 600, y: 300 + 180 + GAP })
})

test('the nearer pull wins', () => {
  const other = card(MARGIN + 10 + GAP + 260, 300)
  // 4 from the edge's line, 6 from the neighbour's: the edge.
  assert.equal(magnet(card(MARGIN + 4, 300), [other], area).x, MARGIN)
})

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
