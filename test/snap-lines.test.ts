// Run with: node --test test/snap-lines.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cameOnto, guideLines, lineUp, CARRIED, LEAVE, SNAP } from '../src/main/snap-lines.ts'

const area = { x: 0, y: 25, width: 1440, height: 875 }
const card = (x: number, y: number) => ({ x, y, width: 260, height: 180 })
// Quick capture's home: the box's own size, at the top middle.
const home = { x: 590, y: 200, width: 260, height: 180 }

test('the box: three lines along its home, down its left and right edges and across its top, and no others', () => {
  assert.deepEqual(guideLines(card(100, 600), [home], area), [{ axis: 'x', at: 590 }, { axis: 'x', at: 850 }, { axis: 'y', at: 200 }])
})

test('the box: carried near its home it is drawn onto it, both side lines and the top together', () => {
  const at = lineUp(card(590 + 5, 200 - 6), [home], area)
  assert.deepEqual([at.x, at.y], [590, 200])
  assert.deepEqual(at.lines, [{ axis: 'x', at: 590 }, { axis: 'x', at: 850 }, { axis: 'y', at: 200 }])
})

test('far from every line it stays where the hand has it, on no line', () => {
  const at = lineUp(card(400, 600), [home], area)
  assert.deepEqual([at.x, at.y, at.lines.length], [400, 600, 0])
})

test('a sticky: each card beside it gives its left, right and top, and nothing at the screen middle or margins', () => {
  const other = { x: 300, y: 600, width: 200, height: 120 }
  assert.deepEqual(guideLines(card(900, 100), [other], area), [{ axis: 'x', at: 300 }, { axis: 'x', at: 500 }, { axis: 'y', at: 600 }])
  assert.deepEqual(guideLines(card(900, 100), [], area), [])
  const lefts = lineUp(card(303, 100), [other], area)
  assert.equal(lefts.x, 300)
  assert.deepEqual(lefts.lines, [{ axis: 'x', at: 300 }])
  const rights = lineUp(card(500 - 260 + 4, 100), [other], area)
  assert.equal(rights.x + 260, 500)
  assert.deepEqual(rights.lines, [{ axis: 'x', at: 500 }])
})

test('a place that would put the card off the screen draws nothing', () => {
  // A card hard by the screen's left: lining up with its right edge would put this card past the screen's left.
  const lines = guideLines(card(400, 300), [{ x: 0, y: 600, width: 100, height: 120 }], area)
  assert.ok(!lines.some((l) => l.axis === 'x' && l.at === 100), JSON.stringify(lines))
})

test('held on a line it stays until the hand goes LEAVE past, then follows exactly', () => {
  const first = lineUp(card(590 + SNAP, 600), [home], area)
  assert.equal(first.x, 590)
  const still = lineUp(card(590 + LEAVE, 600), [home], area, first.held)
  assert.equal(still.x, 590)
  const left = lineUp(card(590 + LEAVE + 1, 600), [home], area, still.held)
  assert.equal(left.x, 590 + LEAVE + 1)
  assert.equal(left.lines.length, 0)
  // Back toward it: only within SNAP again.
  assert.equal(lineUp(card(590 + SNAP + 1, 600), [home], area, left.held).x, 590 + SNAP + 1)
})

test('one tick coming onto a line, none while held there, one for a new line', () => {
  assert.equal(cameOnto({}, { x: 10 }), true)
  assert.equal(cameOnto({ x: 10 }, { x: 10 }), false)
  assert.equal(cameOnto({ x: 10 }, {}), false)
  assert.equal(cameOnto({ x: 10 }, { x: 10, y: 5 }), true)
})

test('carried across the screen past other cards, the lines drawn never change, and the ones it is on are among them', () => {
  const others = [{ x: 1164, y: 40, width: 260, height: 300 }, { x: 1170, y: 360, width: 248, height: 320 }, { x: 300, y: 600, width: 200, height: 120 }]
  for (const reach of [undefined, CARRIED]) {
    const first = JSON.stringify(guideLines(card(0, 0), others, area, reach))
    let held = {}
    for (let x = 0; x <= 1180; x += 3) {
      const at = card(x, 200 + (x % 400))
      assert.equal(JSON.stringify(guideLines(at, others, area, reach)), first, `the lines changed at ${x}`)
      const lined = lineUp(at, others, area, held, reach)
      held = lined.held
      for (const on of lined.lines) assert.ok(first.includes(JSON.stringify(on)), `on ${JSON.stringify(on)}, which is not drawn`)
    }
  }
})

test('two places a few points apart are drawn once: the card is never taken from one to the next', () => {
  // Two stickies stacked down the right, their left edges 3 points apart: one line.
  const lines = guideLines(card(400, 300), [{ x: 1100, y: 40, width: 260, height: 200 }, { x: 1103, y: 300, width: 257, height: 200 }], area)
  assert.equal(lines.filter((l) => l.axis === 'x' && (l.at === 1100 || l.at === 1103)).length, 1, JSON.stringify(lines))
})
