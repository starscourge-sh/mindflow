/**
 * Where it went, shown: a copy of the thing you acted on travels from where it
 * was to the place it now lives (the Kept tab, Tasks, the sidebar's Nuggets),
 * and that place nods as it lands: its words fade, it folds into a small
 * square, and the square flies. Skipped entirely when motion is off.
 *
 * Call `lift` before the change, while the source is still on screen; it
 * returns a `land` to call once the change is made, or nothing to call.
 */
export type Home = 'nugget' | 'task' | 'capture' | 'question'

const still = (): boolean =>
  document.documentElement.dataset.motion === 'off' || matchMedia('(prefers-reduced-motion: reduce)').matches

export const lift = (id: string, home: Home): (() => void) | undefined =>
  liftFrom(document.querySelector<HTMLElement>(`[data-id="${CSS.escape(id)}"]`), home)

/** How big the square is that a card becomes before it flies. */
const SQUARE = 26

/** The same, from any element: a whole note sent off to the Inbox. */
export function liftFrom(from: HTMLElement | null, home: Home): (() => void) | undefined {
  if (!from || still()) return undefined
  const box = from.getBoundingClientRect()
  // A picture of it as it is now, inside a plain card: the real one is about
  // to change or go. The card is what flies; the picture only fades.
  const picture = from.cloneNode(true) as HTMLElement
  picture.removeAttribute('data-id')
  Object.assign(picture.style, { margin: '0', width: `${box.width}px`, height: `${box.height}px`, pointerEvents: 'none' })
  const card = document.createElement('div')
  Object.assign(card.style, {
    position: 'fixed', left: `${box.left}px`, top: `${box.top}px`, width: `${box.width}px`, height: `${box.height}px`,
    zIndex: '60', pointerEvents: 'none', overflow: 'hidden', borderRadius: '8px',
    // Solid in every theme, with a hairline edge, so the square reads as an object.
    backgroundImage: 'linear-gradient(var(--popover), var(--popover)), linear-gradient(var(--background), var(--background))',
    backgroundColor: 'Canvas', border: '1px solid var(--border)', boxShadow: '0 1px 2px rgb(0 0 0 / 0.12), 0 6px 16px -6px rgb(0 0 0 / 0.35)'
  })
  card.append(picture)
  return () => {
    // The nearest place it lives that is on screen now: the prompt's tab, or
    // the main window's sidebar.
    const to = [...document.querySelectorAll<HTMLElement>(`[data-home~="${home}"]`)].find((el) => el.offsetParent !== null)
    if (!to) return
    const end = to.getBoundingClientRect()
    document.body.append(card)
    // Three steps, one after the other, so it always looks the same whatever
    // was sent: the words go, the card folds into a small square where it
    // was, and the square flies home. A whole card flying looked thrown.
    const cx = box.left + box.width / 2
    const cy = box.top + box.height / 2
    const fade = picture.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 110, easing: 'linear', fill: 'forwards' })
    void fade.finished
      .then(() =>
        card.animate(
          [
            { left: `${box.left}px`, top: `${box.top}px`, width: `${box.width}px`, height: `${box.height}px`, borderRadius: '8px' },
            { left: `${cx - SQUARE / 2}px`, top: `${cy - SQUARE / 2}px`, width: `${SQUARE}px`, height: `${SQUARE}px`, borderRadius: '7px' }
          ],
          { duration: 200, easing: 'cubic-bezier(0.32, 0.72, 0, 1)', fill: 'forwards' }
        ).finished
      )
      .then(() => {
        const dx = end.left + end.width / 2 - cx
        const dy = end.top + end.height / 2 - cy
        const scale = Math.max(0.5, Math.min(1, end.height / SQUARE))
        // A slight arc: it lifts on its way rather than sliding in a straight line.
        return card.animate(
          [
            { transform: 'translate(0, 0) scale(1)', opacity: 1 },
            { transform: `translate(${dx * 0.5}px, ${dy * 0.5 - 18}px) scale(1.04)`, opacity: 1, offset: 0.5 },
            { transform: `translate(${dx}px, ${dy}px) scale(${scale})`, opacity: 0.4 }
          ],
          { duration: 320, easing: 'cubic-bezier(0.5, 0, 0.2, 1)', fill: 'forwards' }
        ).finished
      })
      .then(() => {
        card.remove()
        to.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.12)' }, { transform: 'scale(1)' }], { duration: 220, easing: 'ease-out' })
      })
      .catch(() => card.remove())
  }
}
