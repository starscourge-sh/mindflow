type Box = { x: number; y: number; width: number; height: number }

/**
 * Where a throw from `from` that way (dx, dy) lands: always all the way, in
 * the general direction of the flick, never partway. The flick is read as one
 * of eight ways: straight left, right, up or down slides the box to that edge
 * keeping its place along it; a diagonal takes it into that corner. Always
 * `gap` in from the edge of the screen's work area, wholly on screen.
 */
export function throwSpot(from: Box, area: Box, dx: number, dy: number, gap = 12): { x: number; y: number } {
  const left = area.x + gap
  const right = area.x + area.width - gap - from.width
  const top = area.y + gap
  const bottom = area.y + area.height - gap - from.height
  const x0 = Math.max(left, Math.min(from.x, right))
  const y0 = Math.max(top, Math.min(from.y, bottom))
  if (!dx && !dy) return { x: x0, y: y0 }
  // The nearest of the eight ways, each a 45 degree slice centred on it.
  const turn = Math.round(Math.atan2(dy, dx) / (Math.PI / 4))
  const sx = Math.round(Math.cos((turn * Math.PI) / 4))
  const sy = Math.round(Math.sin((turn * Math.PI) / 4))
  return { x: sx > 0 ? right : sx < 0 ? left : x0, y: sy > 0 ? bottom : sy < 0 ? top : y0 }
}
