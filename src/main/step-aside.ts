/**
 * Stepping aside: what Haligtree floats over your work (the session bubble, the corner's cards) gets out of the way
 * when the pointer comes to rest beside it. The rules alone, with no window in them: main (index.ts) reads the
 * pointer it already reads ten times a second and moves the windows. Nothing here sees a click or a key in another
 * app, so nothing needs a permission: where the pointer is, and that it has stopped, is all it goes by.
 */
export type Box = { x: number; y: number; width: number; height: number }
export type Point = { x: number; y: number }

/** How close the pointer rests to count as beside it: the distance quick capture steps aside at. */
export const NEAR = 48
/** How long the pointer lies still before it counts as resting: six readings a tenth of a second apart. A hand on its way across never stops that long. */
export const REST_MS = 600

/** On it or within `near` of it. */
export const beside = (at: Point, box: Box, near = NEAR): boolean =>
  at.x >= box.x - near && at.x < box.x + box.width + near && at.y >= box.y - near && at.y < box.y + box.height + near

/**
 * The bubble's places: the left, the middle and the right of the top of its screen. The top middle is where it
 * starts; the top of the screen is where nobody types, and the only edge it can open downwards from, whole (at the
 * bottom its island would open off the screen). `top` is how far under the menu bar it hangs; `gap` is how far in
 * from the sides its window rests, where a thrown box lands.
 */
export function topPlaces(box: Box, area: Box, top = 6, gap = 12): Point[] {
  return [area.x + gap, Math.round(area.x + (area.width - box.width) / 2), area.x + area.width - box.width - gap].map((x) => ({ x, y: area.y + top }))
}

/** A corner card's places: the four corners of its screen, the top right (where it starts) first. */
export type Corner = 'top-right' | 'bottom-right' | 'top-left' | 'bottom-left'
export const CORNERS: Corner[] = ['top-right', 'bottom-right', 'top-left', 'bottom-left']
export const cornerPlace = (corner: Corner, size: { width: number; height: number }, area: Box, side = 10, top = 8): Point => ({
  x: corner.endsWith('left') ? area.x + side : area.x + area.width - size.width - side,
  y: corner.startsWith('top') ? area.y + top : area.y + area.height - size.height - top
})

/**
 * Whether a box sliding straight from where it is to `to` would come over the pointer on the way, or within `clear`
 * of it. A box the pointer is already under (its clear room) is only leaving it: that is not a crossing.
 */
export function crosses(box: Box, to: Point, at: Point, clear = 0): boolean {
  // The pointer is under the box from `from` to `till` of the way along, on one axis.
  const span = (start: number, size: number, move: number, p: number): [number, number] | null => {
    if (!move) return p >= start - clear && p < start + size + clear ? [-Infinity, Infinity] : null
    const a = (p - size - clear - start) / move
    const b = (p + clear - start) / move
    return [Math.min(a, b), Math.max(a, b)]
  }
  const across = span(box.x, box.width, to.x - box.x, at.x)
  const down = span(box.y, box.height, to.y - box.y, at.y)
  if (!across || !down) return false
  const from = Math.max(across[0], down[0])
  const till = Math.min(across[1], down[1])
  return from <= till && from > 0 && from <= 1
}

/** How far from the pointer it keeps when it has to go round it. */
const BERTH = 12

/**
 * Where it goes: the nearest of its places that is clear of the pointer, reached by moving away from the pointer
 * all the way (never towards it). With every place towards the pointer (in a corner, the pointer on its open side):
 * the nearest one it can reach without passing over the pointer, or within 12 points of it. Null when there is
 * none (the pointer level with it, in the way of every place): it stays where it is, never across the pointer.
 */
export function clearPlace<Place extends Point>(box: Box, at: Point, places: Place[], near = NEAR): Place | null {
  const centre = { x: box.x + box.width / 2, y: box.y + box.height / 2 }
  const nearest = (fits: (to: Place) => boolean): Place | null => {
    let best: Place | null = null
    let least = Infinity
    for (const to of places) {
      const far = Math.hypot(to.x - box.x, to.y - box.y)
      if (far < 1 || far >= least || beside(at, { ...box, ...to }, near) || !fits(to)) continue
      best = to
      least = far
    }
    return best
  }
  // Away from the pointer: a straight line whose first step does not close on it never does later.
  const away = nearest((to) => (to.x - box.x) * (centre.x - at.x) + (to.y - box.y) * (centre.y - at.y) >= 0 && !crosses(box, to, at))
  return away ?? (beside(at, box, BERTH) ? null : nearest((to) => !crosses(box, to, at, BERTH)))
}

/** Whether two boxes overlap. */
export const overlaps = (a: Box, b: Box): boolean => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height
