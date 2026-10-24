import { click } from './sound'

/**
 * Guiding the hand to where it means to land, the way the theme dial does:
 * a mark grows clearer the nearer you come to it, a value is drawn gently
 * into a resting place a little either side of it, and a soft tick says you
 * have arrived. Only for the pointer: a key moves exactly where it is told,
 * so nothing here pulls or waits for one.
 */

/** 1 at the target, falling smoothly to 0 at `reach` away (a smoothstep). */
export function falloff(distance: number, reach: number): number {
  if (reach <= 0) return distance === 0 ? 1 : 0
  const t = Math.max(0, 1 - Math.abs(distance) / reach)
  return t * t * (3 - 2 * t)
}

/** `value`, or `at` when it is within `reach` of it: a detent that holds a little either side. */
export function detent(value: number, at: number, reach: number): number {
  return Math.abs(value - at) <= reach ? at : value
}

/** The trackpad taps too (main/haptic.ts), never closer than 60ms, so a fast drag never buzzes. */
let felt = 0
function feel(): void {
  const now = performance.now()
  if (now - felt < 60) return
  felt = now
  ;(window as { api?: { tap?: () => void } }).api?.tap?.()
}

/**
 * A tick for each new place a dragged thing comes over (a day, a box, a gap
 * between rows), heard once as it arrives rather than while it stays. Nowhere
 * (null) is silent and remembers, so a slip across the gutter between two
 * places and back is not heard twice. `start` names where the drag began,
 * which is not an arrival.
 */
export type SlotTicker = ((slot: string | number | null | undefined) => void) & { start: (slot: string | number | null | undefined) => void }
export function slotTicker(): SlotTicker {
  let last: string | number | null = null
  const tick = (slot: string | number | null | undefined): void => {
    if (slot === null || slot === undefined || slot === last) return
    last = slot
    click('tick')
    feel()
  }
  return Object.assign(tick, { start: (slot: string | number | null | undefined) => void (last = slot ?? null) })
}
