// Run with: node --test test/occlusion.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { coverOf, fromAddOn, fromAnki, inShares, occlusionOf, snapped } from '../src/main/occlusion.ts'

test("Anki's own occlusion field: a cover per cloze, its shape and its place, oi=1 hiding all", () => {
  const field = '{{c1::image-occlusion:rect:left=.1:top=.2:width=.3:height=.05:oi=1}}<br>{{c2::image-occlusion:ellipse:left=.5:top=.5:rx=.1:ry=.05:oi=1}}{{c3::image-occlusion:polygon:points=0.1,0.1 0.3,0.1 0.2,0.4:oi=1}}'
  const { covers, hide } = fromAnki(field)
  assert.equal(hide, 'all')
  assert.deepEqual(covers.map((one) => [one.kind, one.group]), [['box', 1], ['oval', 2], ['shape', 3]])
  assert.deepEqual([covers[0].x, covers[0].y, covers[0].w, covers[0].h], [0.1, 0.2, 0.3, 0.05])
  assert.deepEqual([covers[1].w, covers[1].h], [0.2, 0.1])
  assert.equal(fromAnki('{{c1::image-occlusion:rect:left=.1:top=.2:width=.3:height=.05}}').hide, 'one')
})

test('covers kept in pixels by older Anki are brought to shares of the picture', () => {
  const [one] = inShares([{ kind: 'box', x: 100, y: 50, w: 200, h: 20, group: 1 }], 1000, 500)
  assert.deepEqual([one.x, one.y, one.w, one.h], [0.1, 0.1, 0.2, 0.04])
  const shares = [{ kind: 'box' as const, x: 0.1, y: 0.1, w: 0.2, h: 0.1, group: 1 }]
  assert.equal(inShares(shares, 1000, 500), shares)
})

test("the add-on's question mask: the asked shapes group 1, the others each their own, hide all when there are others", () => {
  const svg = '<svg width="1000" height="500" xmlns="http://www.w3.org/2000/svg"><g><title>Masks</title><rect class="qshape" x="100" y="50" width="200" height="20" fill="#FF7E7E"/><rect class="shape" x="500" y="250" width="100" height="50"/><ellipse class="shape" cx="800" cy="100" rx="50" ry="25"/></g></svg>'
  const read = fromAddOn(svg)!
  assert.equal(read.hide, 'all')
  assert.deepEqual(read.covers.map((one) => [one.kind, one.group]), [['box', 1], ['box', 3], ['oval', 4]])
  assert.deepEqual([read.covers[0].x, read.covers[0].y, read.covers[0].w, read.covers[0].h], [0.1, 0.1, 0.2, 0.04])
  assert.equal(fromAddOn('<svg width="10" height="10"><rect class="shape" x="1" y="1" width="2" height="2"/></svg>'), null)
})

test('a box drawn over most of a label snaps to the label, a free shape never does', () => {
  const label = { text: 'Nucleus', x: 0.5, y: 0.2, w: 0.1, h: 0.04 }
  const drawn = snapped({ kind: 'box', x: 0.505, y: 0.205, w: 0.09, h: 0.03, group: 4 }, [label])
  assert.deepEqual(drawn, { ...coverOf(label, 4), kind: 'box' })
  assert.equal(drawn.text, 'Nucleus')
  const far = { kind: 'box' as const, x: 0.1, y: 0.7, w: 0.1, h: 0.05, group: 2 }
  assert.equal(snapped(far, [label]), far)
  const shape = { kind: 'shape' as const, x: 0.5, y: 0.2, w: 0.1, h: 0.04, points: [[0.5, 0.2], [0.6, 0.2], [0.55, 0.24]] as [number, number][], group: 1 }
  assert.equal(snapped(shape, [label]), shape)
})

test("a card's fields say whether it was made from a picture", () => {
  assert.equal(occlusionOf(null), null)
  assert.equal(occlusionOf('{"year":"1900"}'), null)
  assert.equal(occlusionOf('not json'), null)
  assert.equal(occlusionOf('{"occlusion":{"src":"haligtree://assets/x.png","covers":[],"ask":1,"hide":"one"}}')?.ask, 1)
})
