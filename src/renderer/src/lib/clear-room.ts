/**
 * A window drawn larger than its card (a paper sticky keeps room round it for
 * its lean, lift and shadow): the clear room round the card lets clicks through
 * to the app behind, so it is never an invisible wall. Main forwards the
 * pointer's moves even while clicks pass through, so the page hears where it
 * is and says each time it crosses between clear room and anything drawn: the
 * card, or a menu, pill or toast hanging past its edge. Anything drawn counts,
 * wherever it sits, so a new floating thing needs nothing of its own.
 */

/** The page's own empty layers, and any wrapper marked `data-clear` (the room round the card). */
const clear = (at: EventTarget | null): boolean =>
  !(at instanceof Element) || at === document.documentElement || at === document.body || at.id === 'root' || at.hasAttribute('data-clear')

/** How far out from anything drawn the window takes the pointer back: a fast move covers about this much between two moves. */
const NEAR = 12
/** Whether anything drawn lies within NEAR points of this point: the eight points round it, read as the page would hit them. */
const nearDrawn = (x: number, y: number): boolean => {
  for (const [dx, dy] of [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]])
    if (!clear(document.elementFromPoint(x + dx * NEAR, y + dy * NEAR))) return true
  return false
}

export function clearRoom(): void {
  let solid: boolean | null = null
  const say = (now: boolean): void => {
    if (now === solid) return
    solid = now
    window.api.solid(now)
  }
  // A button held down (a drag, a selection running past the card) keeps the window's hold on the pointer until let go.
  // The hold is taken a little before the pointer reaches anything drawn (NEAR points out): taken only once it was on
  // the card, a pointer coming straight onto a corner button kept the arrow, since the Mac sets a window's cursor as
  // the pointer moves in, and a window letting clicks through has none. Taken in the clear room just outside, the
  // card's own cursors (the hand on its buttons) come with the pointer's next move onto them.
  window.addEventListener('mousemove', (event) => say(event.buttons !== 0 || !clear(event.target) || nearDrawn(event.clientX, event.clientY)), true)
  // A file dragged in from another app sends no moves: main asks instead, point by point. Never while a button of
  // our own is held (a selection run past the card keeps its hold, as above).
  let held = false
  window.addEventListener('mousedown', () => void (held = true), true)
  window.addEventListener('mouseup', () => void (held = false), true)
  window.api.onProbe?.((x, y) => held || say(!clear(document.elementFromPoint(x, y))))
}
