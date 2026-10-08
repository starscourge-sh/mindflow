// Run with: node --test test/group-layout.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { drop, flatten, gather, layoutOf } from '../src/renderer/src/lib/group-layout.ts'

const make = () => ({ id: 'n', name: 'New group' })
// a, then group G holding b and c, then d and e.
const base = () => layoutOf(['a', 'b', 'c', 'd', 'e'], [{ id: 'G', members: ['b', 'c'] }])
const shown = ['a', 'g:G', 'b', 'c', 'd', 'e']
const none = new Set<string>()

test('the saved order reads back as groups', () => {
  assert.deepEqual(base(), { top: ['a', 'g:G', 'd', 'e'], groups: { G: ['b', 'c'] } })
  assert.deepEqual(flatten(base()), ['a', 'g:G', 'b', 'c', 'd', 'e'])
})

test('a row let go over the middle of another makes a group in its place', () => {
  const next = drop(base(), shown, 'e', 'a', true, none, make)!
  assert.deepEqual(next.top, ['g:n', 'g:G', 'd'])
  assert.deepEqual(next.groups.n, ['a', 'e'])
  assert.deepEqual(next.make, make())
})

test('over the middle of a group row, it joins at the end', () => {
  assert.deepEqual(drop(base(), shown, 'd', 'g:G', true, none, make)!.groups.G, ['b', 'c', 'd'])
})

test('over the middle of a note in a group, it joins after that note', () => {
  assert.deepEqual(drop(base(), shown, 'e', 'b', true, none, make)!.groups.G, ['b', 'e', 'c'])
})

test('between two notes of a group it goes in; past the group it stays out', () => {
  // e carried up over c: lands between b and c.
  assert.deepEqual(drop(base(), shown, 'e', 'c', false, none, make)!.groups.G, ['b', 'e', 'c'])
  // a carried down over d: lands after d, at the top level.
  assert.deepEqual(drop(base(), shown, 'a', 'd', false, none, make)!.top, ['g:G', 'd', 'a', 'e'])
})

test('a note dragged out of its group leaves it, and an emptied group goes', () => {
  const one = layoutOf(['a', 'b', 'd'], [{ id: 'G', members: ['b'] }])
  const next = drop(one, ['a', 'g:G', 'b', 'd'], 'b', 'd', false, none, make)!
  assert.deepEqual(next, { top: ['a', 'd', 'b'], groups: {} })
})

test('a group carried by its row takes its notes', () => {
  const next = drop(base(), shown, 'g:G', 'e', false, none, make)!
  assert.deepEqual(flatten(next), ['a', 'd', 'e', 'g:G', 'b', 'c'])
})

test('under a folded group row a note stays outside it', () => {
  const folded = ['a', 'g:G', 'd', 'e']
  const next = drop(base(), folded, 'a', 'g:G', false, new Set(['G']), make)!
  assert.deepEqual(next.top, ['g:G', 'a', 'd', 'e'])
})

test('a group from a note already in one sits after that group', () => {
  const next = gather(base(), 'b', ['e'], make())
  assert.deepEqual(next.top, ['a', 'g:G', 'g:n', 'd'])
  assert.deepEqual(next.groups, { G: ['c'], n: ['b', 'e'] })
})
