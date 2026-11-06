// Run with: node --test test/tabs.test.ts
// The tabs and panes of the main window, as plain data: what each move leaves behind.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { addTab, closeTab, insertPane, keepTabs, moveTab, newTab, paneOf, readSplit, removePane, selectTab, tabToNewPane, type Split } from '../src/renderer/src/lib/tabs.ts'

const two = (): Split => {
  const a = paneOf(newTab([{ id: 'inbox' }]))
  const b = paneOf(newTab([{ id: 'calendar' }]))
  return { panes: [a, b], front: b.key, sizes: [0.5, 0.5] }
}
const landing = () => newTab([{ id: 'day' }])

test('a new tab goes just after the open one, open and in front', () => {
  const s = two()
  const t = newTab([{ id: 'goals' }])
  const next = addTab(s, s.panes[0].key, t)
  assert.equal(next.panes[0].tabs[1], t)
  assert.equal(next.panes[0].active, t.key)
  assert.equal(next.front, s.panes[0].key)
})

test('closing the open tab opens its neighbour to the right, or else its left', () => {
  let s = two()
  const key = s.panes[0].key
  const [one, three] = [newTab([{ id: 'goals' }]), newTab([{ id: 'review' }])]
  s = addTab(addTab(s, key, one), key, three)
  s = selectTab(s, key, one.key)
  s = closeTab(s, key, one.key, landing)
  assert.equal(s.panes[0].active, three.key)
  s = closeTab(s, key, three.key, landing)
  assert.equal(s.panes[0].tabs.length, 1)
})

test('the last tab of a pane takes the pane, and its neighbours take the room', () => {
  const s = closeTab(two(), two().panes[0].key, 'nope', landing)
  assert.equal(s.panes.length, 2)
  const t = two()
  const gone = closeTab(t, t.panes[1].key, t.panes[1].tabs[0].key, landing)
  assert.equal(gone.panes.length, 1)
  assert.deepEqual(gone.sizes, [1])
  assert.equal(gone.front, t.panes[0].key)
})

test('the last tab of the only pane goes to the landing page: never blank', () => {
  const pane = paneOf(newTab([{ id: 'calendar' }]))
  const s = closeTab({ panes: [pane], front: pane.key, sizes: [1] }, pane.key, pane.tabs[0].key, landing)
  assert.equal(s.panes.length, 1)
  assert.equal(s.panes[0].tabs[0].trail.views[0].id, 'day')
  assert.equal(s.panes[0].active, s.panes[0].tabs[0].key)
})

test('a tab moved along its row lands in the gap shown, counted without it', () => {
  let s = two()
  const key = s.panes[0].key
  const first = s.panes[0].tabs[0]
  const [x, y] = [newTab([{ id: 'goals' }]), newTab([{ id: 'review' }])]
  s = addTab(addTab(s, key, x), key, y)
  s = moveTab(s, key, first.key, key, 2)
  assert.deepEqual(s.panes[0].tabs.map((one) => one.key), [x.key, y.key, first.key])
  assert.equal(s.panes[0].active, first.key)
})

test('a tab moved to another row opens there; a pane left empty closes', () => {
  const s = two()
  const [from, to] = [s.panes[1], s.panes[0]]
  const moved = moveTab(s, from.key, from.tabs[0].key, to.key, 0)
  assert.equal(moved.panes.length, 1)
  assert.equal(moved.panes[0].tabs[0].key, from.tabs[0].key)
  assert.equal(moved.panes[0].active, from.tabs[0].key)
  assert.equal(moved.front, to.key)
  assert.deepEqual(moved.sizes, [1])
})

test('a tab carried to a gap makes a new pane there; a pane\'s only tab moves the pane', () => {
  let s = two()
  const key = s.panes[0].key
  const extra = newTab([{ id: 'goals' }])
  s = addTab(s, key, extra)
  const made = tabToNewPane(s, key, extra.key, 1)
  assert.equal(made.panes.length, 3)
  assert.equal(made.panes[1].tabs[0].key, extra.key)
  assert.equal(made.panes[0].tabs.length, 1)
  const only = two()
  const moved = tabToNewPane(only, only.panes[0].key, only.panes[0].tabs[0].key, 2)
  assert.equal(moved.panes.length, 2)
  assert.equal(moved.panes[1].tabs[0].key, only.panes[0].tabs[0].key)
  assert.equal(moved.panes[0].key, only.panes[1].key)
})

test('shares always add up to one', () => {
  const s = insertPane(two(), paneOf(newTab([{ id: 'goals' }])), 1)
  assert.ok(Math.abs(s.sizes.reduce((a, b) => a + b) - 1) < 1e-9)
  const r = removePane(s, s.panes[1].key)
  assert.ok(Math.abs(r.sizes.reduce((a, b) => a + b) - 1) < 1e-9)
})

test('keeping some tabs: the open one stays if it can, or the one asked for opens', () => {
  let s = two()
  const key = s.panes[0].key
  const [x, y] = [newTab([{ id: 'goals' }]), newTab([{ id: 'review' }])]
  s = addTab(addTab(s, key, x), key, y)
  const others = keepTabs(s, key, (one) => one.key === x.key, x.key)
  assert.deepEqual(others.panes[0].tabs.map((one) => one.key), [x.key])
  assert.equal(others.panes[0].active, x.key)
})

test('old values read as one tab a pane; bad ones as nothing', () => {
  const old = { panes: [{ key: 'a', trail: { views: [{ id: 'inbox' }, { id: 'goals' }], at: 1 } }], front: 'a', sizes: [1] }
  const read = readSplit(old, (one) => one)
  assert.equal(read?.panes[0].tabs.length, 1)
  assert.equal(read?.panes[0].tabs[0].trail.at, 1)
  assert.equal(read?.panes[0].active, read?.panes[0].tabs[0].key)
  assert.equal(readSplit({ panes: [{ key: 'a' }] }, (one) => one), null)
  assert.equal(readSplit({ panes: [] }, (one) => one), null)
  assert.equal(readSplit(null, (one) => one), null)
  assert.equal(readSplit({ panes: [{ key: 'a', trail: { views: [], at: 0 } }] }, (one) => one), null)
})
