/**
 * Where a carried card lines up, Raycast's way: along the places drawn for it, its home (quick capture's, where it
 * opens) or, for a sticky, which has none, each card beside it on the screen. A place gives Raycast's three lines:
 * down its left edge, down its right edge and across its top; the card settles with its left, its right or its top on
 * them. Every line sits at something fixed on the screen, never at a place worked out from the card being carried, so
 * the lines drawn at the drag's first move (guideLines) stay where they are to its end, and the card is drawn onto
 * them and no others (lineUp). Within SNAP of a line it is drawn onto it; once there it stays until the hand takes it
 * LEAVE away, so it never stutters on and off the line. Nothing here knows about windows, so it is tested on its own
 * (test/snap-lines.test.ts).
 */
import type { Box } from './sticky-place'

/** How near counts as on a line, and how far the hand must go to leave it. */
export const SNAP = 8
export const LEAVE = 14
/**
 * A sticky is carried by the Mac, under the hand, and cannot be drawn onto a
 * line until it is let go. It counts as on a line only once its edge is within
 * a few points of it, so it lands where it was let go, not a finger's width off.
 */
export const CARRIED = { snap: 4, leave: 6 }
export type Reach = { snap: number; leave: number }

/** A guide: a line down the screen at `at` (axis 'x'), or across it (axis 'y'). */
export type Line = { axis: 'x' | 'y'; at: number }
/** Where the card sits on each line it is held to: what the next step carries on from. */
export type Held = { x?: number; y?: number }
export type Lined = { x: number; y: number; lines: Line[]; held: Held }

type Pull = { to: number; line: number }

/** Where the card's left (or top) goes to sit on each place's lines, and the line: its left and right, or its top. */
function pulls(axis: 'x' | 'y', card: Box, places: Box[], area: Box): Pull[] {
  const own = axis === 'x' ? card.width : card.height
  const start = axis === 'x' ? area.x : area.y
  const end = start + (axis === 'x' ? area.width : area.height)
  const list = places.flatMap((one): Pull[] =>
    axis === 'x' ? [{ to: one.x, line: one.x }, { to: one.x + one.width - own, line: one.x + one.width }] : [{ to: one.y, line: one.y }])
  // Only places where the whole card is on the screen: one past its edge is no place to settle (it is drawn back on).
  return list.filter((one) => one.to >= start && one.to + own <= end)
}

/**
 * The places on one axis a card of this size can settle, the same whatever point of the screen it is at. Lines a few
 * points apart (tilted stickies stacked down the right edge) would hand the card from one to the next as it goes by,
 * so where places to land fall within reach of one another only the first is kept.
 */
function settles(axis: 'x' | 'y', card: Box, places: Box[], area: Box, reach: Reach): Pull[] {
  const list: Pull[] = []
  for (const one of pulls(axis, card, places, area))
    if (!list.some((kept) => kept.to !== one.to && Math.abs(kept.to - one.to) <= reach.snap + reach.leave)) list.push(one)
  return list
}

/**
 * Every line a card of this size can settle on along these places: what a drag draws from its first move to its end.
 * It hangs on nothing but the card's size, the places and the screen, so it holds still for the whole drag.
 */
export function guideLines(card: Box, places: Box[], area: Box, reach: Reach = { snap: SNAP, leave: LEAVE }): Line[] {
  return (['x', 'y'] as const).flatMap((axis) => [...new Set(settles(axis, card, places, area, reach).map((one) => one.line))].map((at) => ({ axis, at })))
}

function axisLine(axis: 'x' | 'y', card: Box, places: Box[], area: Box, was: number | undefined, reach: Reach): { at: number; held?: number; lines: Line[] } {
  const now = axis === 'x' ? card.x : card.y
  const list = settles(axis, card, places, area, reach)
  // Still near the line it was held to: it stays there.
  let to: number | undefined = was !== undefined && Math.abs(now - was) <= reach.leave && list.some((one) => one.to === was) ? was : undefined
  if (to === undefined) to = list.filter((one) => Math.abs(now - one.to) <= reach.snap).sort((a, b) => Math.abs(now - a.to) - Math.abs(now - b.to))[0]?.to
  if (to === undefined) return { at: now, lines: [] }
  const lines = [...new Set(list.filter((one) => one.to === to).map((one) => one.line))].map((at) => ({ axis, at }))
  return { at: to, held: to, lines }
}

/** Where `card` goes when the hand has it there, and the lines it is on (among guideLines). `was` is the last step's `held`. */
export function lineUp(card: Box, places: Box[], area: Box, was: Held = {}, reach: Reach = { snap: SNAP, leave: LEAVE }): Lined {
  const x = axisLine('x', card, places, area, was.x, reach)
  const y = axisLine('y', card, places, area, was.y, reach)
  return { x: x.at, y: y.at, lines: [...x.lines, ...y.lines], held: { x: x.held, y: y.held } }
}

/** Whether a step came onto a line it was not on before: the moment for one haptic tick. */
export const cameOnto = (was: Held, now: Held): boolean =>
  (now.x !== undefined && now.x !== was.x) || (now.y !== undefined && now.y !== was.y)
