import { useEffect, useRef, type RefObject } from 'react'
import { EASING, still } from '@/lib/motion'
import { edge } from '@/lib/haptics'
import { FIRM, project, rubber, spring } from '@/lib/snap'
import { frameLoop } from './year-zoom'

/**
 * The Calendar's levels, felt by hand: pinching out over a week in Month opens
 * that week, over a day in Week that day; pinching in goes back up. The same
 * pinch as the Journal's year (year-zoom.ts): wheel events with ctrlKey, read
 * in the same log units, with the app's one spring and give (lib/snap.ts).
 * Short of the change, the week or day under the fingers swells with them,
 * whole and in proportion, and springs back firmly when they lift; once the
 * pinch is heading past the line (where it would stop, read from its speed)
 * the level changes once, and the rest of that pinch is spent.
 */

/** How far a pinch goes, in the year zoom's log units (a fifth wider), before the level changes. */
const OPEN = 0.18
/** A gap this long between a pinch's events: the fingers lifted, the next pinch is a new one. A pinch has no glide after it. */
const QUIET = 300
/** No pinch event for this long (five frames; a pinch sends one a frame while the fingers move): they stopped, and what swelled goes back. */
const REST = 80
/** How far ahead a pinch's speed is read to say where it is heading: a brisk pinch changes the level before the fingers get there. */
const AHEAD = 0.08
/** How much the week or day swells at the edge of the change, and shrinks pinching in. */
const SWELL = 0.06

export type Way = 'closer' | 'up'

/**
 * `target(el, way)` names the element a pinch over `el` would open or leave (a week's row, a day's column, the view),
 * or null when there is no level that way. `go(way, el, rect)` changes the level, `rect` where the target stood.
 */
export function usePinchLevels(box: RefObject<HTMLElement | null>, target: (el: Element, way: Way) => HTMLElement | null, go: (way: Way, el: HTMLElement, rect: DOMRect) => void): void {
  const ask = useRef({ target, go })
  ask.current = { target, go }
  useEffect(() => {
    let lz = 0
    let speed = 0
    let last = 0
    let spent = false
    let held: HTMLElement | null = null
    let heldWay: Way | null = null
    let then = 0
    let pace = 0
    const draw = (): void => {
      if (!held) return
      const amount = Math.min(1, Math.abs(lz) / OPEN)
      const scale = lz > 0 ? 1 + SWELL * amount : 1 - (SWELL / 2) * amount
      held.style.transform = still() || Math.abs(scale - 1) < 0.0005 ? '' : `scale(${scale})`
      held.style.zIndex = held.style.transform ? '2' : ''
    }
    const letGo = (): void => {
      if (held) (held.style.transform = ''), (held.style.zIndex = ''), (held.style.transformOrigin = '')
      held = null
      heldWay = null
    }
    // Once the fingers stop, what swelled springs back.
    const frames = frameLoop((now) => {
      const dt = then ? (now - then) / 1000 : 1 / 60
      then = now
      if (now - last < REST) return true
      // Stepped by the time the frame really took, from rest: the fingers had stopped.
      ;[lz, speed] = spring(lz, speed, 0, dt, FIRM)
      const done = Math.abs(lz) < 0.002 && Math.abs(speed) < 0.01
      if (done) (lz = 0), (speed = 0), (then = 0), letGo()
      else draw()
      return !done
    })
    // Heard on the window and kept to the box: the box itself may be drawn only once the page's reads are in.
    const wheel = (event: WheelEvent): void => {
      if (!event.ctrlKey || !(event.target instanceof Node) || !box.current?.contains(event.target)) return
      event.preventDefault()
      // The event's own time, when the fingers moved: a long frame (the level just opened being drawn) holds the rest
      // of the pinch back, and read on arrival they would look like a new pinch and open the next level too.
      const now = event.timeStamp
      if (now - last > QUIET) (spent = false), (lz = 0), (speed = 0), (pace = 0), letGo()
      const gap = Math.max(4, Math.min(50, now - last))
      last = now
      if (spent) return
      const by = -Math.max(-40, Math.min(40, event.deltaY)) * 0.01
      // The pinch's speed, a second's worth, evened over its last few events. A spring on its way back is caught where it is.
      pace = pace * 0.6 + (by / gap) * 1000 * 0.4
      speed = 0
      lz += by
      const way: Way = lz >= 0 ? 'closer' : 'up'
      if (way !== heldWay) {
        letGo()
        const found = event.target instanceof Element ? ask.current.target(event.target, way) : null
        if (!found) return void (lz = Math.sign(lz) * rubber(Math.abs(lz), OPEN, 0.2))
        held = found
        heldWay = way
        const box = found.getBoundingClientRect()
        held.style.transformOrigin = `${event.clientX - box.left}px ${event.clientY - box.top}px`
      }
      const heading = project(lz, pace, AHEAD)
      if (Math.abs(heading) >= OPEN && Math.sign(heading) === Math.sign(lz) && held) {
        const was = held
        letGo()
        const rect = was.getBoundingClientRect()
        spent = true
        lz = 0
        speed = 0
        pace = 0
        edge()
        ask.current.go(way, was, rect)
        // The time the new level takes to draw is no pause of the fingers: the quiet that ends this pinch counts from its first frame.
        requestAnimationFrame(() => void (last = Math.max(last, performance.now())))
        return
      }
      draw()
      then = 0
      frames.again()
    }
    window.addEventListener('wheel', wheel, { passive: false })
    return () => (window.removeEventListener('wheel', wheel), frames.stop(), letGo())
  }, [box])
}

/**
 * The level just opened comes in around where it stood (`from`, a rect on screen): a touch smaller going closer, a
 * touch larger going back up, fading in as it settles to its own size. One scale for both ways across, about the
 * middle of what was under the fingers, so words and blocks keep their shape: stretched from a week's wide strip to
 * the whole pane, every word was pulled tall and thin on the way. Transform and opacity only, on the compositor.
 * With Motion off or Reduce motion it is simply there.
 */
export function growFrom(el: HTMLElement, from: DOMRect, back: boolean): void {
  if (still() || !from.width || !from.height) return
  const to = el.getBoundingClientRect()
  const transformOrigin = `${from.left + from.width / 2 - to.left}px ${from.top + from.height / 2 - to.top}px`
  el.animate([{ transform: `scale(${back ? 1 + SWELL : 1 - SWELL})`, transformOrigin, opacity: 0.35 }, { transform: 'none', transformOrigin, opacity: 1 }], { duration: 200, easing: EASING })
}
