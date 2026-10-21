type Box = { x: number; y: number; width: number; height: number }

/**
 * Where a throw from `from` along (dx, dy) lands: the ray from the box's
 * middle that way, run until the box meets the edge of the screen's work
 * area, `gap` in from it, so it is always flush there and wholly on screen.
 * The way is read against the screen's shape, as the fingers on a trackpad
 * the same shape would mean it: from the middle, a 45 degree flick reaches
 * the corner, not a point on the top edge short of it on a wide screen.
 * Mostly sideways lands on the side at the height the ray reaches; a
 * diagonal lands at or near a corner, and near one, in it.
 */
export function throwSpot(from: Box, area: Box, dx: number, dy: number, gap = 12, snap = 60): { x: number; y: number } {
  const left = area.x + gap
  const right = area.x + area.width - gap - from.width
  const top = area.y + gap
  const bottom = area.y + area.height - gap - from.height
  const x0 = Math.max(left, Math.min(from.x, right))
  const y0 = Math.max(top, Math.min(from.y, bottom))
  dx *= Math.max(0, right - left)
  dy *= Math.max(0, bottom - top)
  const along = (at: number, d: number, lo: number, hi: number): number => (d > 1e-6 ? (hi - at) / d : d < -1e-6 ? (lo - at) / d : Infinity)
  const tx = along(x0, dx, left, right)
  const ty = along(y0, dy, top, bottom)
  let x = tx <= ty ? (dx > 0 ? right : left) : Math.round(Math.max(left, Math.min(x0 + dx * ty, right)))
  let y = ty <= tx ? (dy > 0 ? bottom : top) : Math.round(Math.max(top, Math.min(y0 + dy * tx, bottom)))
  // Near a corner: about 60px, or a tenth of the way along that side on a big screen.
  if (Math.min(Math.abs(x - left), Math.abs(x - right)) <= Math.max(snap, (right - left) / 10) && Math.min(Math.abs(y - top), Math.abs(y - bottom)) <= Math.max(snap, (bottom - top) / 10)) {
    x = Math.abs(x - left) <= Math.abs(x - right) ? left : right
    y = Math.abs(y - top) <= Math.abs(y - bottom) ? top : bottom
  }
  return { x, y }
}
