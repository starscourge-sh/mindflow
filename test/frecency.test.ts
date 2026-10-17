// Run with: node --test test/frecency.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { byFrecency } from '../src/renderer/src/lib/frecency.ts'

test('most used and most recent first, unused keep their order after', () => {
  const ids = ['note', 'todo', 'quote', 'word', 'link'] as const
  assert.deepEqual(byFrecency(ids, { word: 3, todo: 1.2 }), ['word', 'todo', 'note', 'quote', 'link'])
  assert.deepEqual(byFrecency(ids, {}), [...ids])
})
