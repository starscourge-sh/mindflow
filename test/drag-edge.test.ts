// Run with: node --test test/drag-edge.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { BAND, pastEdge } from '../src/renderer/src/lib/drag-edge.ts'

const group = { id: 'g', top: 100, bottom: 200 }
const sub = { id: 's', top: 140, bottom: 180 }

test('past the edge is out, inside is in', () => {
  const inside = new Set<string>()
  assert.equal(pastEdge([group], 150, inside), null)
  assert.deepEqual(pastEdge([group], 200 + BAND + 1, inside), { id: 'g', how: 'after' })
  assert.deepEqual(pastEdge([group], 100 - BAND - 1, new Set(['g'])), { id: 'g', how: 'before' })
})

test('the dead band keeps what it last was, both ways', () => {
  const inside = new Set(['g'])
  assert.equal(pastEdge([group], 200 + BAND - 1, inside), null)
  assert.ok(pastEdge([group], 200 + BAND + 1, inside))
  // Out now: just inside the edge still reads out.
  assert.ok(pastEdge([group], 200 - BAND + 1, inside))
  assert.equal(pastEdge([group], 200 - BAND - 1, inside), null)
})

test('the outermost box left is the one named, and what it holds is left too', () => {
  const inside = new Set(['g', 's'])
  assert.deepEqual(pastEdge([group, sub], 190, inside), { id: 's', how: 'after' })
  assert.ok(inside.has('g') && !inside.has('s'))
  assert.deepEqual(pastEdge([group, sub], 300, inside), { id: 'g', how: 'after' })
  assert.equal(inside.size, 0)
})
