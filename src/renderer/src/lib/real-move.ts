/**
 * Whether a mouse event came from the hand moving, or only from the page
 * changing under a hand at rest.
 *
 * Chromium fires mouseover and mousemove at a still pointer whenever new
 * content appears under it: ⌘K opening, a list filling in, a scroll. A list
 * that picks its row on hover then hands the choice to whatever row happens to
 * sit under the resting cursor, and keeps pulling it back there. Raycast and
 * cmdk let hover choose only once the pointer really moves, and so does every
 * list here: an event counts only if it is somewhere else than the last one of
 * its kind.
 */

type Seen = { x: number; y: number; event: Event; moved: boolean }
const last: Record<string, Seen> = {}

const note = (event: MouseEvent): void => {
  const was = last[event.type]
  last[event.type] = {
    x: event.clientX,
    y: event.clientY,
    event,
    moved: !!was && (was.x !== event.clientX || was.y !== event.clientY)
  }
}

if (typeof window !== 'undefined') {
  // Capture on the window, so it is noted before any list hears of it.
  for (const type of ['pointermove', 'mousemove']) window.addEventListener(type, note as EventListener, { capture: true, passive: true })
}

/** True when this mousemove or pointermove moved the pointer. */
export function realMove(event: Event | { nativeEvent: Event }): boolean {
  const native = 'nativeEvent' in event ? event.nativeEvent : event
  const seen = last[native.type]
  return seen?.event === native ? seen.moved : true
}

/**
 * For a Radix menu row's `onPointerMove`: Radix leaves the highlight alone
 * once the event is prevented, so a pointer at rest does not take it.
 */
export function onlyRealMoves<E extends { nativeEvent: Event; preventDefault: () => void }>(own?: (event: E) => void): (event: E) => void {
  return (event) => {
    own?.(event)
    if (!realMove(event)) event.preventDefault()
  }
}

/**
 * For a cmdk row, whose own pointermove handler cannot be wrapped: stopped on
 * the way down, a still pointer's event never reaches it.
 */
export function stopStillMoves(event: { nativeEvent: Event; stopPropagation: () => void }): void {
  if (!realMove(event)) event.stopPropagation()
}
