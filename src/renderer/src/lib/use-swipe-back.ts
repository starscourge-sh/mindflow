import { animate, useMotionValue, type MotionValue } from 'motion/react'
import { useEffect, useRef, type RefObject } from 'react'

/** How far, in the trackpad's own pixels, a swipe goes before it counts. */
const COMMIT = 110
/** The furthest the page follows: past it, the fingers pull against a spring. */
const REACH = 72
/** With nowhere to go that way, it barely gives at all. */
const STUCK = 18
/** No wheel events for this long: the fingers have lifted. */
const QUIET = 140

const still = (): boolean => document.documentElement.dataset.motion === 'off' || matchMedia('(prefers-reduced-motion: reduce)').matches

/** Something under the pointer that scrolls sideways itself (a wide table, a code block) keeps the swipe. */
const scrollsSideways = (from: EventTarget | null, by: number): boolean => {
  for (let node = from as HTMLElement | null; node && node !== document.body; node = node.parentElement) {
    if (node.scrollWidth <= node.clientWidth + 1) continue
    const overflow = getComputedStyle(node).overflowX
    if (overflow !== 'auto' && overflow !== 'scroll') continue
    if (by > 0 ? node.scrollLeft > 0 : node.scrollLeft + node.clientWidth < node.scrollWidth - 1) return true
  }
  return false
}

/**
 * Two fingers sideways on the trackpad go back and forward, as in Safari.
 * The page follows the fingers from the first event, with resistance (a
 * rubber band, softer where there is somewhere to go), so it plainly can be
 * swiped; going back is light and undoable, so it happens the moment the
 * swipe passes the line rather than waiting for the fingers to lift. Short
 * of the line, it springs home. Returns the offset to put on the page.
 */
export function useSwipeBack(
  target: RefObject<HTMLElement | null>,
  can: (by: -1 | 1) => boolean,
  go: (by: -1 | 1) => void
): MotionValue<number> {
  const x = useMotionValue(0)
  const latest = useRef({ can, go })
  latest.current = { can, go }
  useEffect(() => {
    const node = target.current
    if (!node) return
    // One gesture: whether it is ours, how far the fingers have gone, and
    // whether it has already gone somewhere.
    let gesture: { ours: boolean; pulled: number; done: boolean } | null = null
    let quiet: ReturnType<typeof setTimeout> | undefined
    const release = (): void => {
      gesture = null
      animate(x, 0, { type: 'spring', stiffness: 500, damping: 40 })
    }
    const onWheel = (event: WheelEvent): void => {
      clearTimeout(quiet)
      quiet = setTimeout(release, QUIET)
      if (!gesture) {
        // Decided once, on the first event: mostly sideways, a pinch is not it,
        // and nothing under the pointer wants to scroll that way itself.
        const ours = !event.ctrlKey && Math.abs(event.deltaX) > Math.abs(event.deltaY) * 1.5 && !scrollsSideways(event.target, -event.deltaX)
        gesture = { ours, pulled: 0, done: false }
      }
      if (!gesture.ours || gesture.done) return
      event.preventDefault()
      // Fingers moving right scroll content left (negative deltaX): back.
      gesture.pulled -= event.deltaX
      const by = gesture.pulled > 0 ? -1 : 1
      const room = latest.current.can(by)
      const reach = room ? REACH : STUCK
      const shown = Math.sign(gesture.pulled) * reach * (1 - Math.exp(-Math.abs(gesture.pulled) / (reach * 1.6)))
      if (!still()) x.set(shown)
      if (room && Math.abs(gesture.pulled) > COMMIT) {
        gesture.done = true
        latest.current.go(by)
        animate(x, 0, { type: 'spring', stiffness: 420, damping: 38 })
      }
    }
    node.addEventListener('wheel', onWheel, { passive: false })
    return () => {
      clearTimeout(quiet)
      node.removeEventListener('wheel', onWheel)
    }
  }, [target, x])
  return x
}
