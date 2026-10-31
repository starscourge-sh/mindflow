/**
 * The one way the page asks a Force Touch trackpad for a tap (main/haptic.ts).
 * `detent()`: a value stepped onto its next stop (a page, a slot, a notch).
 * `edge()`: the firmer one, for the first or last stop and the marks worth
 * feeling (a chapter's start, the page you came from).
 * Taps asked for in one frame become one (an edge wins), and none comes
 * closer than GAP after the last, so a fast scrub is a patter, never a buzz.
 * Tests never feel one: main only counts them under HALIGTREE_QA_AWAY.
 */
const GAP = 80
let pending: 'align' | 'level' | null = null
let felt = 0

function flush(): void {
  if (!pending) return
  // Too soon after the last: the same tap waits for the next frame, never lost and never doubled.
  if (performance.now() - felt < GAP) return void requestAnimationFrame(flush)
  const kind = pending
  pending = null
  felt = performance.now()
  const api = (window as { api?: { tap?: () => void; tapHard?: () => void } }).api
  if (kind === 'level') api?.tapHard?.()
  else api?.tap?.()
}

function ask(kind: 'align' | 'level'): void {
  const first = pending === null
  if (kind === 'level' || first) pending = kind
  if (first) requestAnimationFrame(flush)
}

/** A light tap: the value came to its next stop. */
export const detent = (): void => ask('align')
/** A firm tap: the first or last stop, or a mark worth feeling. */
export const edge = (): void => ask('level')
/** `edge()` on the ends or a mark, else `detent()`: the tap for landing on `value`. */
export function stepTap(value: number, min: number, max: number, marks?: ReadonlySet<number>): void {
  if (value <= min || value >= max || marks?.has(value)) edge()
  else detent()
}
