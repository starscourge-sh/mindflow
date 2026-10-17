// Run with: node --test test/tuck-place.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { shownOf, tuckPlaces, MOST_SHOWN, TAB, type Screen } from '../src/main/tuck-place.ts'

// A MacBook screen: the menu bar on top, the Dock hidden. And the same with the Dock showing at the bottom.
const laptop: Screen = { id: 1, bounds: { x: 0, y: 0, width: 1512, height: 982 }, workArea: { x: 0, y: 37, width: 1512, height: 945 } }
const docked: Screen = { ...laptop, workArea: { x: 0, y: 37, width: 1512, height: 875 } }
// A second screen to the right of the laptop, and one below it.
const right: Screen = { id: 2, bounds: { x: 1512, y: 0, width: 1920, height: 1080 }, workArea: { x: 1512, y: 25, width: 1920, height: 1055 } }
const below: Screen = { id: 3, bounds: { x: 0, y: 982, width: 1512, height: 982 }, workArea: { x: 0, y: 982, width: 1512, height: 982 } }
const box = (x: number, y: number, width = 640, height = 300) => ({ x, y, width, height })
const first = (b: ReturnType<typeof box>, screens: Screen[]) => tuckPlaces(b, screens)[0]?.edge
const W = 1512, H = 982

test('never the top, wherever the box is', () => {
  for (const screens of [[laptop], [docked], [laptop, right], [laptop, below], [laptop, right, below]])
    for (const x of [0, 200, 436, 800, W - 640]) for (const y of [37, 60, 300, 640]) for (const [w, h] of [[640, 300], [1080, 600], [500, 180]])
      for (const one of tuckPlaces(box(x, y, w, h), screens)) assert.notEqual(one.edge as string, 'top')
})

test('one screen: top left, top centre, top right, middle and bottom', () => {
  assert.equal(first(box(20, 37), [laptop]), 'left')
  assert.equal(first(box(W - 640 - 20, 37), [laptop]), 'right')
  // Top centre: left and right tie, so left, never up against the top.
  assert.equal(first(box((W - 640) / 2, 37), [laptop]), 'left')
  // The real box opens top middle at 1080 wide: still to a side.
  assert.equal(first(box(216, 37, 1080, 600), [laptop]), 'left')
  // Tall and near the top on a wide box: the bottom is nearest, so it slides down and off it.
  assert.equal(first(box(216, 100, 1080, 860), [laptop]), 'bottom')
  assert.equal(first(box((W - 640) / 2, 340), [laptop]), 'bottom')
  assert.equal(first(box((W - 640) / 2, H - 300 - 10), [laptop]), 'bottom')
})

test('two screens: never an edge another screen sits against', () => {
  // Top right, with a screen to the right: left or bottom instead.
  const tr = tuckPlaces(box(W - 640 - 20, 37), [laptop, right]).map((one) => one.edge)
  assert.ok(!tr.includes('right'))
  assert.equal(tr[0], 'bottom')
  // Top left with a screen to the right: left, as alone.
  assert.equal(first(box(20, 37), [laptop, right]), 'left')
  // Bottom with a screen below: a side instead.
  const bottom = tuckPlaces(box(100, H - 310), [laptop, below]).map((one) => one.edge)
  assert.ok(!bottom.includes('bottom'))
  assert.equal(bottom[0], 'left')
  // Middle with screens right and below: only left is free.
  assert.deepEqual(tuckPlaces(box(436, 340), [laptop, right, below]).map((one) => one.edge), ['left'])
  // On the right-hand screen, top left: its left edge meets the laptop, so right or bottom.
  const other = tuckPlaces(box(1512 + 20, 25), [laptop, right]).map((one) => one.edge)
  assert.ok(!other.includes('left'))
})

test('the tab: 24px left showing, above the Dock when it shows', () => {
  const left = tuckPlaces(box(20, 37), [laptop])[0].to
  assert.equal(left.x + left.width, TAB)
  const down = tuckPlaces(box(436, 600), [docked])[0].to
  assert.equal(down.y, 37 + 875 - TAB)
  assert.equal(shownOf(down, 'bottom', [docked]), TAB)
})

test('in view: a tab is away, a box held at the edge is not', () => {
  assert.ok(shownOf(box(-640 + TAB, 37), 'left', [laptop]) <= MOST_SHOWN)
  // macOS holding a bottom tuck 32px up is still away.
  assert.ok(shownOf(box(436, H - 32), 'bottom', [laptop]) <= MOST_SHOWN)
  // Only moved against the edge, all of it showing: in the way.
  assert.equal(shownOf(box(0, 37), 'left', [laptop]), 640)
  assert.ok(shownOf(box(436, 37), 'bottom', [laptop]) > MOST_SHOWN)
  // Grown wider while tucked left (its x kept): more of it shows.
  assert.ok(shownOf(box(-640 + TAB, 37, 900), 'left', [laptop]) > MOST_SHOWN)
})
