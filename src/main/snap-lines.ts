/**
 * Where a card being dragged lines up, Raycast's way: its middle with the
 * screen's middle, its edges with another Haligtree card's edges, or a margin
 * in from the screen's edge. Every line sits at something fixed on the screen,
 * never at a place worked out from the card being carried, so a guide never
 * moves while it shows. (A line a gap beside another card was dropped: it was
 * drawn in empty space beside the card, a new one each few points as cards
 * stacked down the right edge passed, and read as guides following the card.)
 * Every line it can settle on is drawn from the drag's first move to its end
 * (guideLines), quiet; the one it is on is lit (lineUp's lines).
 * Within SNAP of a line it is drawn onto it; once there it stays until the
 * hand takes it LEAVE away, so it never stutters on and off the line. Nothing
 * here knows about windows, so it is tested on its own (test/snap-lines.test.ts).
 */
import type { Box } from './sticky-place'

/** How near counts as on a line, how far the hand must go to leave it, and the margin from the screen's edge. */
export const SNAP = 8
export const LEAVE = 14
export const EDGE = 16
/**
 * A sticky is carried by the Mac, under the hand, and cannot be drawn onto a
 * line until it is let go. Its guide shows only once its edge is within a few
 * points of the line, so the line sits along the card's edge, not a finger's
 * width beside it, and it lands there when let go.
 */
export const CARRIED = { snap: 4, leave: 6 }
export type Reach = { snap: number; leave: number }

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
  for (const one of others) {
    const lo = at(one)
    const hi = lo + size(one)
    list.push({ to: lo, line: lo }, { to: hi - own, line: hi })
  }
  // Only places where the whole card is on the screen: one past its edge is no place to settle (it is drawn back on).
  return list.filter((one) => one.to >= start && one.to + own <= end)
}

/**
 * The places on one axis a card of this size can settle, the same whatever point of the screen it is at. Lines a few
 * points apart (tilted stickies stacked down the right edge, a card's edge near the margin) would hand the guide from
 * one to the next as the card goes by, a line that seems to follow the card. So where places to land fall within
 * reach of one another only the first is kept: the screen's own lines, then the cards in order.
 */
function places(axis: 'x' | 'y', card: Box, others: Box[], area: Box, reach: Reach): Pull[] {
  const list: Pull[] = []
  for (const one of pulls(axis, card, others, area))
    if (!list.some((kept) => kept.to !== one.to && Math.abs(kept.to - one.to) <= reach.snap + reach.leave)) list.push(one)
  return list
}

/**
 * Every line a card of this size can settle on here: what a drag draws, quiet, from its first move to its end. It
 * hangs on nothing but the card's size, the other cards and the screen, so it holds still for the whole drag; the
 * card is drawn onto these lines and no others (lineUp).
 */
export function guideLines(card: Box, others: Box[], area: Box, reach: Reach = { snap: SNAP, leave: LEAVE }): Line[] {
  return (['x', 'y'] as const).flatMap((axis) => [...new Set(places(axis, card, others, area, reach).map((one) => one.line))].map((at) => ({ axis, at })))
}

function axisLine(axis: 'x' | 'y', card: Box, others: Box[], area: Box, was: number | undefined, reach: Reach): { at: number; held?: number; lines: Line[] } {
  const now = axis === 'x' ? card.x : card.y
  const list = places(axis, card, others, area, reach)
  // Still near the line it was held to: it stays there.
  let to: number | undefined = was !== undefined && Math.abs(now - was) <= reach.leave && list.some((one) => one.to === was) ? was : undefined
  if (to === undefined) {
    const near = list.filter((one) => Math.abs(now - one.to) <= reach.snap).sort((a, b) => Math.abs(now - a.to) - Math.abs(now - b.to))[0]
    to = near?.to
  }
  if (to === undefined) return { at: now, lines: [] }
  const lines = [...new Set(list.filter((one) => one.to === to).map((one) => one.line))].map((at) => ({ axis, at }))
  return { at: to, held: to, lines }
}

/** Where `card` goes when the hand has it there, and the lines it is on (lit among guideLines). `was` is the last step's `held`. */
export function lineUp(card: Box, others: Box[], area: Box, was: Held = {}, reach: Reach = { snap: SNAP, leave: LEAVE }): Lined {
  const x = axisLine('x', card, others, area, was.x, reach)
  const y = axisLine('y', card, others, area, was.y, reach)
  return { x: x.at, y: y.at, lines: [...x.lines, ...y.lines], held: { x: x.held, y: y.held } }
}

/** Whether a step came onto a line it was not on before: the moment for one haptic tick. */
export const cameOnto = (was: Held, now: Held): boolean =>
  (now.x !== undefined && now.x !== was.x) || (now.y !== undefined && now.y !== was.y)
