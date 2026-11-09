/**
 * Where a card being dragged lines up, Raycast's way: its middle with the
 * screen's middle, its edges with another Haligtree card's edges (or a gap
 * beside it), or a margin in from the screen's edge. Within SNAP of a line it
 * is drawn onto it; once there it stays until the hand takes it LEAVE away, so
 * it never stutters on and off the line. Nothing here knows about windows, so
 * it is tested on its own (test/snap-lines.test.ts).
 */
import type { Box } from './sticky-place'

/** How near counts as on a line, how far the hand must go to leave it, the margin from the screen's edge and the gap kept beside a neighbour. */
export const SNAP = 8
export const LEAVE = 14
export const EDGE = 16
export const GAP = 8

/** A guide: a line down the screen at `at` (axis 'x'), or across it (axis 'y'). */
export type Line = { axis: 'x' | 'y'; at: number }
/** Where the card sits on each line it is held to: what the next step carries on from. */
export type Held = { x?: number; y?: number }
export type Lined = { x: number; y: number; lines: Line[]; held: Held }

type Pull = { to: number; line: number }

/** Every place the card's left (or top) could line up, and where each one's guide is drawn. */
function pulls(axis: 'x' | 'y', card: Box, others: Box[], area: Box): Pull[] {
  const at = (b: Box): number => (axis === 'x' ? b.x : b.y)
  const size = (b: Box): number => (axis === 'x' ? b.width : b.height)
  const own = size(card)
  const start = at(area)
  const end = start + size(area)
  const middle = start + size(area) / 2
  const list: Pull[] = [
    { to: Math.round(middle - own / 2), line: Math.round(middle) },
    { to: start + EDGE, line: start + EDGE },
    { to: end - EDGE - own, line: end - EDGE }
  ]
  // Across the other way: whether the two sit side by side (for a gap beside it).
  const crossAt = (b: Box): number => (axis === 'x' ? b.y : b.x)
  const crossSize = (b: Box): number => (axis === 'x' ? b.height : b.width)
  for (const one of others) {
    const lo = at(one)
    const hi = lo + size(one)
    list.push({ to: lo, line: lo }, { to: hi - own, line: hi })
    const beside = crossAt(card) < crossAt(one) + crossSize(one) && crossAt(one) < crossAt(card) + crossSize(card)
    if (beside) list.push({ to: hi + GAP, line: hi + GAP }, { to: lo - GAP - own, line: lo - GAP })
  }
  return list
}

function axisLine(axis: 'x' | 'y', card: Box, others: Box[], area: Box, was: number | undefined): { at: number; held?: number; lines: Line[] } {
  const now = axis === 'x' ? card.x : card.y
  const list = pulls(axis, card, others, area)
  // Still near the line it was held to: it stays there.
  let to: number | undefined = was !== undefined && Math.abs(now - was) <= LEAVE && list.some((one) => one.to === was) ? was : undefined
  if (to === undefined) {
    const near = list.filter((one) => Math.abs(now - one.to) <= SNAP).sort((a, b) => Math.abs(now - a.to) - Math.abs(now - b.to))[0]
    to = near?.to
  }
  if (to === undefined) return { at: now, lines: [] }
  const lines = [...new Set(list.filter((one) => one.to === to).map((one) => one.line))].map((at) => ({ axis, at }))
  return { at: to, held: to, lines }
}

/** Where `card` goes when the hand has it there, and the guides to draw. `was` is the last step's `held`. */
export function lineUp(card: Box, others: Box[], area: Box, was: Held = {}): Lined {
  const x = axisLine('x', card, others, area, was.x)
  const y = axisLine('y', card, others, area, was.y)
  return { x: x.at, y: y.at, lines: [...x.lines, ...y.lines], held: { x: x.held, y: y.held } }
}

/** Whether a step came onto a line it was not on before: the moment for one haptic tick. */
export const cameOnto = (was: Held, now: Held): boolean =>
  (now.x !== undefined && now.x !== was.x) || (now.y !== undefined && now.y !== was.y)
