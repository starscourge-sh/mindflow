import { useEffect, useRef, type RefObject } from 'react'
import { EASING, still } from '@/lib/motion'
import { edge } from '@/lib/haptics'
import { frameLoop, rubber, step } from './year-zoom'

/**
 * The Calendar's levels, felt by hand: pinching out over a week in Month opens
 * that week, over a day in Week that day; pinching in goes back up. The same
 * pinch as the Journal's year (year-zoom.ts): wheel events with ctrlKey, read
 * in the same log units, its spring and its give. Short of the change, the
 * week or day under the fingers swells with them and springs back when they
 * lift; past it the level changes once, and the rest of that pinch is spent.
 */

/** How far a pinch goes, in the year zoom's log units (a fifth wider), before the level changes. */
const OPEN = 0.22
/** A gap this long between a pinch's events: the fingers lifted, the next pinch is a new one. A pinch has no glide after it. */
const QUIET = 160
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
      const dt = Math.min(1 / 30, then ? (now - then) / 1000 : 1 / 60)
      then = now
      if (now - last < 120) return true
      ;[lz, speed] = step(lz, speed, 0, dt, 320)
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
      if (now - last > QUIET) (spent = false), (lz = 0), (speed = 0), letGo()
      last = now
      if (spent) return
      lz -= Math.max(-40, Math.min(40, event.deltaY)) * 0.01
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
      if (Math.abs(lz) >= OPEN && held) {
        const was = held
        letGo()
        const rect = was.getBoundingClientRect()
        spent = true
        lz = 0
        speed = 0
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
 * The level just opened grows out of where it stood (`from`, a rect on screen) to fill `el`; going back up, the level
 * shown starts with the part you came from (`from`, inside it) filling it, and settles to its own size. Transform
 * and opacity only, on the compositor. With Motion off or Reduce motion it is simply there.
 */
export function growFrom(el: HTMLElement, from: DOMRect, back: boolean): void {
  if (still() || !from.width || !from.height) return
  const to = el.getBoundingClientRect()
  const [sx, sy] = [from.width / to.width, from.height / to.height]
  const [tx, ty] = [from.left - to.left, from.top - to.top]
  const start = back ? `scale(${1 / sx}, ${1 / sy}) translate(${-tx}px, ${-ty}px)` : `translate(${tx}px, ${ty}px) scale(${sx}, ${sy})`
  el.animate([{ transform: start, transformOrigin: '0 0', opacity: 0.4 }, { transform: 'none', transformOrigin: '0 0', opacity: 1 }], { duration: 280, easing: EASING })
}
