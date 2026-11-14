// Run with: node --test test/snap-lines.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cameOnto, guideLines, lineUp, CARRIED, EDGE, LEAVE, SNAP } from '../src/main/snap-lines.ts'

const area = { x: 0, y: 25, width: 1440, height: 875 }
const card = (x: number, y: number) => ({ x, y, width: 260, height: 180 })
const middleX = 720 - 130

test('near the screen middle, the card is drawn onto it with a line down the middle', () => {
  const at = lineUp(card(middleX + 5, 300), [], area)
  assert.equal(at.x, middleX)
  assert.equal(at.y, 300)
  assert.deepEqual(at.lines, [{ axis: 'x', at: 720 }])
})

test('the middle across too: a line across the screen', () => {
  const y = Math.round(25 + 875 / 2 - 90)
  const at = lineUp(card(400, y - 6), [], area)
  assert.equal(at.y, y)
  assert.deepEqual(at.lines, [{ axis: 'y', at: Math.round(25 + 875 / 2) }])
})

test('a margin in from the screen edge', () => {
  const at = lineUp(card(EDGE + 4, 300), [], area)
  assert.equal(at.x, EDGE)
  assert.deepEqual(at.lines, [{ axis: 'x', at: EDGE }])
  const right = lineUp(card(1440 - EDGE - 260 - 7, 300), [], area)
  assert.equal(right.x, 1440 - EDGE - 260)
  assert.deepEqual(right.lines, [{ axis: 'x', at: 1440 - EDGE }])
})

test('another card: left edges line up, anywhere on the screen', () => {
  const other = { x: 300, y: 600, width: 200, height: 120 }
  const at = lineUp(card(303, 100), [other], area)
  assert.equal(at.x, 300)
  assert.deepEqual(at.lines, [{ axis: 'x', at: 300 }])
})

test('another card beside it: no line in the empty space a gap beside its edge', () => {
  const other = { x: 300, y: 280, width: 200, height: 120 }
  const at = lineUp(card(500 + 8 + 2, 300), [other], area)
  assert.equal(at.x, 510)
  assert.equal(at.lines.filter((l) => l.axis === 'x').length, 0)
})

test('carried across cards stacked down the right edge, every guide shown sits at a fixed place and stays put while it shows', () => {
  // Today and two goal cards, a few points apart, as they stack at the right.
  const others = [{ x: 1164, y: 40, width: 260, height: 300 }, { x: 1170, y: 360, width: 248, height: 320 }, { x: 1158, y: 700, width: 268, height: 150 }]
  const fixed = new Set([720, EDGE, 1440 - EDGE, ...others.flatMap((o) => [o.x, o.x + o.width])])
  let held = {}
  let shown: number | null = null
  let moves = 0
  for (let x = 1100; x <= 1200; x++) {
    const at = lineUp(card(x, 420), others, area, held, CARRIED)
    held = at.held
    const line = at.lines.find((l) => l.axis === 'x')?.at ?? null
    if (line !== null) {
      assert.ok(fixed.has(line), `line at ${line} is at nothing on the screen`)
      // Shown, the card's edge is within the carried reach of it.
      assert.ok(Math.abs(x - line) <= CARRIED.leave || Math.abs(x + 260 - line) <= CARRIED.leave, `line ${line} far from the card at ${x}`)
    }
    if (shown !== null && line !== null && line !== shown) moves++
    shown = line
  }
  assert.equal(moves, 0, 'a guide jumped to a new place without first going away')
})

test('far from every line it stays where the hand has it, with no lines', () => {
  const at = lineUp(card(400, 300), [], area)
  assert.deepEqual([at.x, at.y, at.lines.length], [400, 300, 0])
})

test('held on a line it stays until the hand goes LEAVE past, then follows exactly', () => {
  const first = lineUp(card(middleX + SNAP, 300), [], area)
  assert.equal(first.x, middleX)
  const still = lineUp(card(middleX + LEAVE, 300), [], area, first.held)
  assert.equal(still.x, middleX)
  const left = lineUp(card(middleX + LEAVE + 1, 300), [], area, still.held)
  assert.equal(left.x, middleX + LEAVE + 1)
  assert.equal(left.lines.length, 0)
  // Back toward it: only within SNAP again.
  assert.equal(lineUp(card(middleX + SNAP + 1, 300), [], area, left.held).x, middleX + SNAP + 1)
})

test('one tick coming onto a line, none while held there, one for a new line', () => {
  assert.equal(cameOnto({}, { x: 10 }), true)
  assert.equal(cameOnto({ x: 10 }, { x: 10 }), false)
  assert.equal(cameOnto({ x: 10 }, {}), false)
  assert.equal(cameOnto({ x: 10 }, { x: 10, y: 5 }), true)
})

test('every line a card can settle on, drawn from the first move: the middles and the margins, on both axes', () => {
  const lines = guideLines(card(400, 300), [], area)
  assert.deepEqual(lines, [
    { axis: 'x', at: 720 }, { axis: 'x', at: EDGE }, { axis: 'x', at: 1440 - EDGE },
    { axis: 'y', at: Math.round(25 + 875 / 2) }, { axis: 'y', at: 25 + EDGE }, { axis: 'y', at: 25 + 875 - EDGE }
  ])
})

test('another card adds its edges; a place that would put the card off the screen draws nothing', () => {
  const other = { x: 300, y: 600, width: 200, height: 120 }
  const lines = guideLines(card(400, 300), [other], area)
  for (const at of [300, 500]) assert.ok(lines.some((l) => l.axis === 'x' && l.at === at), `x ${at}`)
  // Its top lines up (600); its bottom would need the card's top at 540, and the card is 180 tall: 720, on the screen.
  for (const at of [600, 720]) assert.ok(lines.some((l) => l.axis === 'y' && l.at === at), `y ${at}`)
  // A card hard by the screen's left: lining up with its right edge would put this card past the screen's left.
  const edge = guideLines(card(400, 300), [{ x: 0, y: 600, width: 100, height: 120 }], area)
  assert.ok(!edge.some((l) => l.axis === 'x' && l.at === 100), JSON.stringify(edge))
})

test('carried across the screen past other cards, the lines drawn never change, and the one lit is always one of them', () => {
  const others = [{ x: 1164, y: 40, width: 260, height: 300 }, { x: 1170, y: 360, width: 248, height: 320 }, { x: 300, y: 600, width: 200, height: 120 }]
  for (const reach of [undefined, CARRIED]) {
    const first = JSON.stringify(guideLines(card(0, 0), others, area, reach))
    let held = {}
    for (let x = 0; x <= 1180; x += 3) {
      const at = card(x, 200 + (x % 400))
      assert.equal(JSON.stringify(guideLines(at, others, area, reach)), first, `the lines changed at ${x}`)
      const lined = lineUp(at, others, area, held, reach)
      held = lined.held
      for (const lit of lined.lines) assert.ok(first.includes(JSON.stringify(lit)), `lit ${JSON.stringify(lit)} is not drawn`)
    }
  }
})

test('two places a few points apart are drawn once: the card is never taken from one to the next', () => {
  // Another card's left edge 3 points in from the margin: one place, the margin's.
  const lines = guideLines(card(400, 300), [{ x: EDGE + 3, y: 600, width: 200, height: 120 }], area)
  assert.ok(!lines.some((l) => l.axis === 'x' && l.at === EDGE + 3), JSON.stringify(lines))
})
