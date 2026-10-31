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

export function clearRoom(): void {
  let solid: boolean | null = null
  const say = (now: boolean): void => {
    if (now === solid) return
    solid = now
    window.api.solid(now)
  }
  // A button held down (a drag, a selection running past the card) keeps the window's hold on the pointer until let go.
  window.addEventListener('mousemove', (event) => say(event.buttons !== 0 || !clear(event.target)), true)
}
