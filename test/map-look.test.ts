import { test } from 'node:test'
import assert from 'node:assert/strict'
import { autoGroups, groupHue, lookOf, shownMap } from '../src/renderer/src/lib/map-look.ts'

const node = (id: string, title: string, more: object = {}) => ({ type: 'capture', id, title, kind: 'note', links: 1, ...more })
const map = {
  nodes: [node('a', 'Hamlet', { tag: 'book', tint: 'purple', tags: ['book', 'play'] }), node('b', 'Why Hamlet waits', { tags: ['play'] }), node('p', 'A book', { type: 'pdf' })],
  edges: [['a', 'b', 1, 1], ['a', 'p', 1, 1]] as [string, string, number, number][],
  alone: 1,
  lonely: [node('c', 'On its own', { links: 0, pictures: ['haligtree://assets/x.png'] })]
}

test('the defaults show the map as it was', () => {
  const shown = shownMap(map, lookOf(null))
  assert.deepEqual(shown.nodes.map((one) => one.id), ['a', 'b', 'p'])
  assert.equal(shown.edges.length, 2)
})

test('each filter adds or takes away dots', () => {
  assert.equal(shownMap(map, lookOf({ tags: true })).nodes.length, 5)
  assert.equal(shownMap(map, lookOf({ files: false })).nodes.length, 2)
  assert.equal(shownMap(map, lookOf({ hideLonely: false })).nodes.length, 4)
  assert.equal(shownMap(map, lookOf({ hideLonely: false, pictures: true })).nodes.length, 5)
  assert.deepEqual(shownMap(map, lookOf({ search: 'waits' })).nodes.map((one) => one.id), ['b'])
})

test('the groups the panel starts from colour every dot as the automatic colours do', () => {
  const groups = autoGroups(map.nodes)
  assert.deepEqual(groups, [{ query: '#book', colour: 'purple' }])
  assert.equal(groupHue(map.nodes[0], groups), 'purple')
  assert.equal(groupHue(map.nodes[1], groups), undefined)
})

test('a group by kind or by words in a name', () => {
  assert.equal(groupHue(map.nodes[1], [{ query: 'waits', colour: 'red' }]), 'red')
  assert.equal(groupHue(map.nodes[1], [{ query: 'kind:note', colour: 'blue' }]), 'blue')
  assert.equal(groupHue(map.nodes[1], [{ query: '#play', colour: 'green' }]), 'green')
})
