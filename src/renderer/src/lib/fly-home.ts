/**
 * Where it went, shown: a copy of the thing you acted on travels from where it
 * was to the place it now lives (the Kept tab, Tasks, the sidebar's Nuggets),
 * and that place nods as it lands. About a third of a second, drawn on the
 * compositor, and skipped entirely when motion is off.
 *
 * Call `lift` before the change, while the source is still on screen; it
 * returns a `land` to call once the change is made, or nothing to call.
 */
export type Home = 'nugget' | 'task' | 'capture'

const still = (): boolean =>
  document.documentElement.dataset.motion === 'off' || matchMedia('(prefers-reduced-motion: reduce)').matches

export const lift = (id: string, home: Home): (() => void) | undefined =>
  liftFrom(document.querySelector<HTMLElement>(`[data-id="${CSS.escape(id)}"]`), home)

/** The same, from any element: a whole note sent off to the Inbox. */
export function liftFrom(from: HTMLElement | null, home: Home): (() => void) | undefined {
  if (!from || still()) return undefined
  const box = from.getBoundingClientRect()
  // A picture of it as it is now: the real one is about to change or go.
  const ghost = from.cloneNode(true) as HTMLElement
  Object.assign(ghost.style, {
    position: 'fixed', left: `${box.left}px`, top: `${box.top}px`, width: `${box.width}px`, height: `${box.height}px`,
    margin: '0', zIndex: '60', pointerEvents: 'none', transformOrigin: 'center', borderRadius: '8px',
    background: 'var(--popover)', boxShadow: '0 12px 32px -8px rgb(0 0 0 / 0.5)', overflow: 'hidden'
  })
  ghost.removeAttribute('data-id')
  return () => {
    // The nearest place it lives that is on screen now: the prompt's tab, or
    // the main window's sidebar.
    const to = [...document.querySelectorAll<HTMLElement>(`[data-home="${home}"]`)].find((el) => el.offsetParent !== null)
    if (!to) return
    const end = to.getBoundingClientRect()
    document.body.append(ghost)
    const dx = end.left + end.width / 2 - (box.left + box.width / 2)
    const dy = end.top + end.height / 2 - (box.top + box.height / 2)
    const scale = Math.max(0.08, Math.min(end.width / box.width, end.height / box.height))
    const flight = ghost.animate(
      [
        { transform: 'translate(0, 0) scale(1)', opacity: 1 },
        { transform: `translate(${dx * 0.55}px, ${dy * 0.35}px) scale(${(1 + scale) / 2})`, opacity: 0.9, offset: 0.55 },
        { transform: `translate(${dx}px, ${dy}px) scale(${scale})`, opacity: 0.15 }
      ],
      { duration: 380, easing: 'cubic-bezier(0.5, 0, 0.2, 1)' }
    )
    flight.onfinish = () => {
      ghost.remove()
      to.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.12)' }, { transform: 'scale(1)' }], { duration: 220, easing: 'ease-out' })
    }
  }
}
