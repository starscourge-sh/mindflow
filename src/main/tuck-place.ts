/**
 * Where quick capture's box tucks while you drag out an area (shots.ts), and
 * how much of it is still in view. Nothing here knows about windows, so it is
 * tested on its own (test/tuck-place.test.ts).
 */
export type Box = { x: number; y: number; width: number; height: number }
export type Screen = { id: number; bounds: Box; workArea: Box }
export type Edge = 'left' | 'right' | 'bottom'

/** The tab left showing at the edge. */
export const TAB = 24
/** More than this still in view and the box is in the way: it goes see-through instead. */
export const MOST_SHOWN = 40

const overlap = (a: Box, b: Box): number =>
  Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y))

/** The screen a box is mostly on, as Electron's getDisplayMatching picks it. */
export function screenOf(box: Box, screens: Screen[]): Screen {
  return screens.reduce((best, one) => (overlap(box, one.bounds) > overlap(box, best.bounds) ? one : best), screens[0])
}

/**
 * Where the box can tuck on its screen, the nearest first: the left, right or
 * bottom edge of the part windows may use (above the Dock, beside it). Never
 * the top: macOS keeps a window below the menu bar, so a box sent up there
 * only moves against the top edge. Never an edge another screen sits against,
 * where the box would only land on that screen. Ties go left, right, bottom.
 */
export function tuckPlaces(from: Box, screens: Screen[]): { edge: Edge; to: Box }[] {
  const mine = screenOf(from, screens)
  const { workArea: area, bounds: whole } = mine
  const places = [
    { edge: 'left' as const, gap: from.x - area.x, to: { ...from, x: area.x - from.width + TAB } },
    { edge: 'right' as const, gap: area.x + area.width - (from.x + from.width), to: { ...from, x: area.x + area.width - TAB } },
    { edge: 'bottom' as const, gap: area.y + area.height - (from.y + from.height), to: { ...from, y: area.y + area.height - TAB } }
  ]
  // The part of the box past its screen's edge, which must fall on no other screen.
  const past = (edge: Edge, to: Box): Box =>
    edge === 'left' ? { x: to.x, y: to.y, width: whole.x - to.x, height: to.height }
      : edge === 'right' ? { x: whole.x + whole.width, y: to.y, width: to.x + to.width - (whole.x + whole.width), height: to.height }
        : { x: to.x, y: whole.y + whole.height, width: to.width, height: to.y + to.height - (whole.y + whole.height) }
  return places
    .filter((one) => !screens.some((other) => other.id !== mine.id && overlap(past(one.edge, one.to), other.bounds) > 0))
    .sort((m, n) => m.gap - n.gap)
    .map(({ edge, to }) => ({ edge, to }))
}

/**
 * How much of the box is still in view, across the edge it was tucked into:
 * its width on screen for a side, its height for the bottom. Counted on the
 * part windows may use, so a box held behind the Dock counts as away.
 */
export function shownOf(box: Box, edge: Edge | null, screens: Screen[]): number {
  const area = screens.reduce((sum, one) => sum + overlap(box, one.workArea), 0)
  return Math.round(area / Math.max(1, edge === 'bottom' ? box.width : box.height))
}
