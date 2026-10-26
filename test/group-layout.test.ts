// Run with: node --test test/group-layout.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { drop, flatten, gather, groupsAround, landsIn, layoutOf, reorderAs, sameLayout, shownKeys, step, tidy } from '../src/renderer/src/lib/group-layout.ts'

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

test('a note let go outside its group leaves it, and the emptied group stays, as a folder does', () => {
  const one = layoutOf(['a', 'b', 'd'], [{ id: 'G', members: ['b'] }])
  assert.deepEqual(drop(one, 'b', 'd', 'after', none, make)!, { top: ['a', 'g:G', 'd', 'b'], groups: { G: [] } })
})

test('a group carried by its row takes its notes, and lands beside a group, never in it', () => {
  assert.deepEqual(flatten(drop(base(), 'g:G', 'e', 'after', none, make)!), ['a', 'd', 'e', 'g:G', 'b', 'c'])
  const two = layoutOf(['a', 'x', 'b', 'c', 'd'], [{ id: 'G', members: ['a', 'x'] }, { id: 'H', members: ['c', 'd'] }])
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
  // b and c out of G, after e: G stays, empty.
  assert.deepEqual(dropMany(base(), ['b', 'c'], 'e', 'after', none, make)!, { top: ['a', 'g:G', 'd', 'e', 'b', 'c'], groups: { G: [] } })
  // on the middle of a lone row: a new group of it and both.
  const made = dropMany(base(), ['a', 'e'], 'd', 'join', none, make)!
  assert.deepEqual(made.groups.n, ['d', 'a', 'e'])
})

test('a group left with one note stays a group', () => {
  // c carried out of G past e: G keeps b, and nothing comes apart.
  const raw = drop(base(), 'c', 'e', 'after', none, make)!
  assert.deepEqual(raw.groups.G, ['b'])
  const { layout, dissolved } = tidy(raw)
  assert.deepEqual(dissolved, [])
  assert.deepEqual(layout, raw)
})

test('a group of one is drawn as a group, and an empty one first in what holds it', () => {
  assert.deepEqual(layoutOf(['a', 'b'], [{ id: 'G', members: ['a'] }]), { top: ['g:G', 'b'], groups: { G: ['a'] } })
  assert.deepEqual(layoutOf(['a', 'b'], [{ id: 'E', members: [] }]), { top: ['g:E', 'a', 'b'], groups: { E: [] } })
  assert.deepEqual(layoutOf(['a', 'b'], [{ id: 'G', members: ['b'] }, { id: 'E', members: [], parent: 'G' }]).groups, { G: ['g:E', 'b'], E: [] })
})

test('an empty group stands where its key was put; a filled one where its notes are', () => {
  assert.deepEqual(layoutOf(['a', 'g:E', 'b'], [{ id: 'E', members: [] }]), { top: ['a', 'g:E', 'b'], groups: { E: [] } })
  assert.deepEqual(layoutOf(['a', 'b', 'g:E'], [{ id: 'G', members: ['a'] }, { id: 'E', members: [], parent: 'G' }]).groups, { G: ['a', 'g:E'], E: [] })
  assert.deepEqual(layoutOf(['g:G', 'a', 'b'], [{ id: 'G', members: ['b'] }]).top, ['a', 'g:G'])
  assert.deepEqual(layoutOf(['a', 'g:gone'], []).top, ['a'])
})

test('groups go three levels deep, and one deeper sits beside the third', () => {
  const deep = layoutOf(['a', 'b', 'c', 'd'], [{ id: 'G', members: ['a'] }, { id: 'S', members: ['b'], parent: 'G' }, { id: 'T', members: ['c'], parent: 'S' }, { id: 'U', members: ['d'], parent: 'T' }])
  assert.deepEqual(deep, { top: ['g:G'], groups: { G: ['a', 'g:S'], S: ['b', 'g:T', 'g:U'], T: ['c'], U: ['d'] } })
  assert.deepEqual(flatten(deep), ['g:G', 'a', 'g:S', 'b', 'g:T', 'c', 'g:U', 'd'])
})

// Subgroups, one level: G holds b, then subgroup S of c and x, then y.
const nested = () => layoutOf(['a', 'b', 'c', 'x', 'y', 'd'], [{ id: 'G', members: ['b', 'y'] }, { id: 'S', members: ['c', 'x'], parent: 'G' }])

test('a subgroup reads back inside its group, in its place', () => {
  assert.deepEqual(nested(), { top: ['a', 'g:G', 'd'], groups: { G: ['b', 'g:S', 'y'], S: ['c', 'x'] } })
  assert.deepEqual(flatten(nested()), ['a', 'g:G', 'b', 'g:S', 'c', 'x', 'y', 'd'])
})

test('two of a group\'s own notes, one over the other, make a subgroup in it', () => {
  const next = drop(base(), 'c', 'b', 'join', none, make)!
  assert.deepEqual(next.top, ['a', 'g:G', 'd', 'e'])
  assert.deepEqual(next.groups.G, ['g:n'])
  assert.deepEqual(next.groups.n, ['b', 'c'])
})

test('two of a subgroup\'s notes make a third level, and no fourth', () => {
  const third = drop(nested(), 'x', 'c', 'join', none, make)!
  assert.deepEqual(third.groups.S, ['g:n'])
  assert.deepEqual(third.groups.n, ['c', 'x'])
  const deep = layoutOf(['c', 'x'], [{ id: 'G', members: [] }, { id: 'S', members: [], parent: 'G' }, { id: 'T', members: ['c', 'x'], parent: 'S' }])
  assert.equal(drop(deep, 'x', 'c', 'join', none, make), null)
})

test('a group with no subgroups let go on another group\'s row goes inside it', () => {
  const two = layoutOf(['a', 'b', 'c', 'd'], [{ id: 'G', members: ['a', 'b'] }, { id: 'H', members: ['c', 'd'] }])
  const next = drop(two, 'g:H', 'g:G', 'join', none, make)!
  assert.deepEqual(next, { top: ['g:G'], groups: { G: ['a', 'b', 'g:H'], H: ['c', 'd'] } })
  // A group holding a subgroup never goes inside another.
  assert.equal(drop(nested(), 'g:G', 'g:S', 'join', none, make), null)
})

test('a subgroup moves within its group, and out to the top level', () => {
  assert.deepEqual(drop(nested(), 'g:S', 'b', 'before', none, make)!.groups.G, ['g:S', 'b', 'y'])
  assert.deepEqual(drop(nested(), 'g:S', 'd', 'after', none, make)!.top, ['a', 'g:G', 'd', 'g:S'])
})

test('a note steps out of a subgroup into its group, not to the top', () => {
  assert.deepEqual(step(nested(), flatten(nested()), 'x', 1, none)!.groups.G, ['b', 'g:S', 'x', 'y'])
})

test('a subgroup left with one note stays inside its group', () => {
  const raw = drop(nested(), 'x', 'd', 'after', none, make)!
  assert.deepEqual(tidy(raw).layout.groups.S, ['c'])
})

test('a subgroup stays inside its group with no notes of its own', () => {
  assert.deepEqual(layoutOf(['a', 'c', 'x'], [{ id: 'G', members: [] }, { id: 'S', members: ['c', 'x'], parent: 'G' }]), { top: ['a', 'g:G'], groups: { G: ['g:S'], S: ['c', 'x'] } })
})

test('a list sorted some other way is laid out as it is seen, rows not on show keeping their slots', () => {
  const layout = layoutOf(['a', 'b', 'c', 'd', 'e'], [{ id: 'G', members: ['b', 'c', 'd'] }])
  const seen = reorderAs(layout, ['e', 'g:G', 'd', 'b', 'a'])
  assert.deepEqual(seen.top, ['e', 'g:G', 'a'])
  // c is filtered out: it keeps its slot, the two seen swap round it.
  assert.deepEqual(seen.groups.G, ['d', 'c', 'b'])
})

test('the rows on show leave out what a folded group holds', () => {
  const layout = layoutOf(['a', 'b', 'c', 'd'], [{ id: 'G', members: ['b', 'c'] }])
  assert.deepEqual(shownKeys(layout, new Set()), ['a', 'g:G', 'b', 'c', 'd'])
  assert.deepEqual(shownKeys(layout, new Set(['G'])), ['a', 'g:G', 'd'])
})

test('a subgroup let go on another subgroup goes inside it, a third level; beside it, it lands beside', () => {
  const layout = layoutOf(['a', 'b', 'c', 'd', 'e'], [{ id: 'O', members: ['e'] }, { id: 'S', members: ['a', 'b'], parent: 'O' }, { id: 'T', members: ['c', 'd'], parent: 'O' }])
  assert.deepEqual(layout.groups.O, ['g:S', 'g:T', 'e'])
  assert.deepEqual(drop(layout, 'g:T', 'g:S', 'join', none, make)!.groups.S, ['a', 'b', 'g:T'])
  const next = drop(layout, 'g:T', 'b', 'before', none, make)!
  assert.deepEqual(next.groups.O, ['g:T', 'g:S', 'e'])
  assert.deepEqual(groupsAround(next, 'c'), ['T', 'O'])
  assert.equal(sameLayout(next, layout), false)
  assert.equal(sameLayout(drop(layout, 'b', 'a', 'after', none, make)!, layout), true)
})
