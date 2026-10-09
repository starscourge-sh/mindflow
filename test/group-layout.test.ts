// Run with: node --test test/group-layout.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { drop, flatten, gather, landsIn, layoutOf, step } from '../src/renderer/src/lib/group-layout.ts'

const make = () => ({ id: 'n', name: 'New group' })
// a, then group G holding b and c, then d and e.
const base = () => layoutOf(['a', 'b', 'c', 'd', 'e'], [{ id: 'G', members: ['b', 'c'] }])
const none = new Set<string>()
const shown = ['a', 'g:G', 'b', 'c', 'd', 'e']

test('the saved order reads back as groups', () => {
  assert.deepEqual(base(), { top: ['a', 'g:G', 'd', 'e'], groups: { G: ['b', 'c'] } })
  assert.deepEqual(flatten(base()), ['a', 'g:G', 'b', 'c', 'd', 'e'])
})

test('let go over the middle of a row, the two make a group in its place', () => {
  const next = drop(base(), 'e', 'a', 'join', none, make)!
  assert.deepEqual(next.top, ['g:n', 'g:G', 'd'])
  assert.deepEqual(next.groups.n, ['a', 'e'])
  assert.deepEqual(next.make, make())
})

test('over the middle of a group row, it joins at the end', () => {
  assert.deepEqual(drop(base(), 'd', 'g:G', 'join', none, make)!.groups.G, ['b', 'c', 'd'])
})

test('over the middle of a note in a group, it joins after that note', () => {
  assert.deepEqual(drop(base(), 'e', 'b', 'join', none, make)!.groups.G, ['b', 'e', 'c'])
})

test('just before or after a row, it goes beside it, in that row\'s group', () => {
  assert.deepEqual(drop(base(), 'e', 'c', 'before', none, make)!.groups.G, ['b', 'e', 'c'])
  assert.deepEqual(drop(base(), 'e', 'c', 'after', none, make)!.groups.G, ['b', 'c', 'e'])
  assert.deepEqual(drop(base(), 'a', 'd', 'after', none, make)!.top, ['g:G', 'd', 'a', 'e'])
  assert.deepEqual(drop(base(), 'e', 'd', 'before', none, make)!.top, ['a', 'g:G', 'e', 'd'])
})

test('just under an open group row is first in it; under a folded one, outside it', () => {
  assert.deepEqual(drop(base(), 'e', 'g:G', 'after', none, make)!.groups.G, ['e', 'b', 'c'])
  assert.deepEqual(drop(base(), 'a', 'g:G', 'after', new Set(['G']), make)!.top, ['g:G', 'a', 'd', 'e'])
})

test('a note let go outside its group leaves it, and an emptied group goes', () => {
  const one = layoutOf(['a', 'b', 'd'], [{ id: 'G', members: ['b'] }])
  assert.deepEqual(drop(one, 'b', 'd', 'after', none, make)!, { top: ['a', 'd', 'b'], groups: {} })
})

test('a group carried by its row takes its notes, and lands beside a group, never in it', () => {
  assert.deepEqual(flatten(drop(base(), 'g:G', 'e', 'after', none, make)!), ['a', 'd', 'e', 'g:G', 'b', 'c'])
  const two = layoutOf(['a', 'b', 'c', 'd'], [{ id: 'G', members: ['a'] }, { id: 'H', members: ['c', 'd'] }])
  assert.deepEqual(drop(two, 'g:G', 'd', 'before', none, make)!.top, ['b', 'g:G', 'g:H'])
})

test('where a drop lands is known before it happens', () => {
  assert.equal(landsIn(base(), 'b', 'before', none), 'G')
  assert.equal(landsIn(base(), 'd', 'before', none), null)
  assert.equal(landsIn(base(), 'g:G', 'after', none), 'G')
  assert.equal(landsIn(base(), 'g:G', 'before', none), null)
})

test('the keys step into a group and out of it one place at a time', () => {
  // a down: first in G.
  assert.deepEqual(step(base(), shown, 'a', 1, none)!.groups.G, ['a', 'b', 'c'])
  // c down: out, just under G.
  assert.deepEqual(step(base(), shown, 'c', 1, none)!.top, ['a', 'g:G', 'c', 'd', 'e'])
  // d up: into G, at its end.
  assert.deepEqual(step(base(), shown, 'd', -1, none)!.groups.G, ['b', 'c', 'd'])
  // b up: out, above G.
  assert.deepEqual(step(base(), shown, 'b', -1, none)!.top, ['a', 'b', 'g:G', 'd', 'e'])
})

test('a group from a note already in one sits after that group', () => {
  const next = gather(base(), 'b', ['e'], make())
  assert.deepEqual(next.top, ['a', 'g:G', 'g:n', 'd'])
  assert.deepEqual(next.groups, { G: ['c'], n: ['b', 'e'] })
})

test('several carried at once land together, in their order', async () => {
  const { dropMany } = await import('../src/renderer/src/lib/group-layout.ts')
  // a and e into G at its end, after c.
  assert.deepEqual(dropMany(base(), ['a', 'e'], 'g:G', 'join', none, make)!.groups.G, ['b', 'c', 'a', 'e'])
  // a and d before e, at the top level.
  assert.deepEqual(dropMany(base(), ['a', 'd'], 'e', 'before', none, make)!.top, ['g:G', 'a', 'd', 'e'])
  // b and c out of G, after e: G goes.
  assert.deepEqual(dropMany(base(), ['b', 'c'], 'e', 'after', none, make)!, { top: ['a', 'd', 'e', 'b', 'c'], groups: {} })
  // on the middle of a lone row: a new group of it and both.
  const made = dropMany(base(), ['a', 'e'], 'd', 'join', none, make)!
  assert.deepEqual(made.groups.n, ['d', 'a', 'e'])
})
