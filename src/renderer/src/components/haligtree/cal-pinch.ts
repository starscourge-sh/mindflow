import { useEffect, useRef, type RefObject } from 'react'
import { flushSync } from 'react-dom'
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
 * the level changes once, and the rest of that pinch is spent, unless the
 * fingers turn round: then it is theirs again, and can take the level back.
 */

/** How far a pinch goes, in the year zoom's log units (a fifth wider), before the level changes. */
const OPEN = 0.18
/** A gap this long between a pinch's events: the fingers lifted, the next pinch is a new one. A pinch has no glide after it. */
const QUIET = 300
/** No pinch event for this long (five frames; a pinch sends one a frame while the fingers move): they stopped, and what swelled goes back. */
const REST = 80
/** How far ahead a pinch's speed is read to say where it is heading: a brisk pinch changes the level before the fingers get there. */
const AHEAD = 0.05
/** How much of the way the fingers themselves must have gone before the speed may finish it: a twitch never changes the level. */
const EARNED = 0.6
/** How much the week or day swells at the edge of the change, and shrinks pinching in. */
const SWELL = 0.06
/** How far the fingers must come back, of the way to a change, before a spent pinch is theirs again: more than the wobble of a lift. */
const TURNED = 0.25
/** The level's name in the window's picture while one gives way to the next, and how long that takes. */
const NAME = 'mf-cal-level'
const CHANGE = 200

export type Way = 'closer' | 'up'

/**
 * `target(el, way)` names the element a pinch over `el` would open or leave (a week's row, a day's column, the view),
 * or null when there is no level that way. `go(way, el, rect, release)` changes the level, `rect` where the target
 * stood at its own size; the target is still swollen as the fingers left it, for the old level's picture to be taken
 * so, and `release()` puts it back (call it as the level changes).
 */
export function usePinchLevels(box: RefObject<HTMLElement | null>, target: (el: Element, way: Way) => HTMLElement | null, go: (way: Way, el: HTMLElement, rect: DOMRect, release: () => void) => void): void {
  const ask = useRef({ target, go })
  ask.current = { target, go }
  useEffect(() => {
    let lz = 0
    let speed = 0
    let last = 0
    // The way of the pinch that changed the level (1 closer, -1 up, 0 none), and how far the fingers have since come back.
    let spent = 0
    let back = 0
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
      if (now - last > QUIET) (spent = 0), (back = 0), (lz = 0), (speed = 0), (pace = 0), letGo()
      const gap = Math.max(4, Math.min(50, now - last))
      last = now
      const by = -Math.max(-40, Math.min(40, event.deltaY)) * 0.01
      if (spent) {
        // Still going the way that changed the level: spent, so one pinch never opens two levels. Turned round and
        // clearly coming back: a pinch of its own from here, which can take the level back without the fingers lifting.
        back = Math.sign(by) === spent ? 0 : back + by
        if (Math.abs(back) < OPEN * TURNED) return
        lz = back - by
        spent = 0
        back = 0
        pace = 0
      }
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
      if (Math.abs(heading) >= OPEN && Math.abs(lz) >= OPEN * EARNED && Math.sign(heading) === Math.sign(lz) && held) {
        const was = held
        // Where it stood at its own size, read with the swell off for a moment (a transform asks for no layout); the
        // swell itself stays on until the level changes, so the old level's picture is what the fingers were holding.
        const { transform, zIndex, transformOrigin } = was.style
        was.style.transform = ''
        const rect = was.getBoundingClientRect()
        was.style.transform = transform
        held = null
        heldWay = null
        spent = way === 'closer' ? 1 : -1
        back = 0
        lz = 0
        speed = 0
        pace = 0
        ask.current.go(way, was, rect, () => {
          if (was.style.transform === transform) was.style.transform = ''
          if (was.style.zIndex === zIndex) was.style.zIndex = ''
          if (was.style.transformOrigin === transformOrigin) was.style.transformOrigin = ''
        })
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

/** The change of level on now: a newer one skips it, which only means the new level is at its own size at once. */
let turning: ViewTransition | null = null

/**
 * One level giving way to the next under a pinch. The level being left stays in sight and carries on the way the
 * fingers were taking it (larger as they spread, smaller as they closed), fading as it goes, while the level opened
 * comes to its own size from the other side, both about what was under the fingers: `at`, a point in the window, or
 * `found()` once the new level is drawn (going back up, the part you came from). So nothing is ever gone before the
 * next thing is there, and both keep their shape: one scale both ways across, never a week's strip pulled to the whole
 * pane. A view transition of `box` alone: one picture of the old level and the new level itself, moved by transform
 * and opacity on the compositor, so the page drawing the new level cannot make it stutter, and the page under it
 * hears the fingers all the while (a pinch turned round mid-way starts from what is on screen). `change()` makes the
 * change. One firm tap, felt in the frame the levels start to move (drawing the new level takes a few frames; felt
 * before that, the tap came ahead of anything seen). With Motion off or Reduce motion the level is simply there.
 */
export function zoomLevel(box: HTMLElement, way: Way, at: { x: number; y: number } | null, change: () => void, found?: () => DOMRect | null): void {
  if (still() || typeof document.startViewTransition !== 'function') return edge(), change()
  turning?.skipTransition()
  const root = document.documentElement
  const style = document.createElement('style')
  box.style.viewTransitionName = NAME
  root.dataset.calZoom = way
  const turn = document.startViewTransition(() => {
    flushSync(change)
    const frame = box.getBoundingClientRect()
    const part = found?.()
    const x = (part ? part.left + part.width / 2 : (at?.x ?? frame.left + frame.width / 2)) - frame.left
    const y = (part ? part.top + part.height / 2 : (at?.y ?? frame.top + frame.height / 2)) - frame.top
    const [gone, come] = way === 'closer' ? [1 + SWELL, 1 - SWELL] : [1 - SWELL, 1 + SWELL]
    // Written before the new picture is taken, so both start in the same frame, on the compositor (as lib/hero.ts does).
    style.textContent = `@keyframes mf-cal-gone { to { opacity: 0; transform: scale(${gone}); } }
@keyframes mf-cal-come { from { opacity: 0; transform: scale(${come}); } }
:root[data-cal-zoom]::view-transition-old(${NAME}) { animation: mf-cal-gone ${CHANGE}ms ${EASING} both; transform-origin: ${x}px ${y}px; }
:root[data-cal-zoom]::view-transition-new(${NAME}) { animation: mf-cal-come ${CHANGE}ms ${EASING} both; transform-origin: ${x}px ${y}px; }`
    document.head.append(style)
  })
  turning = turn
  const end = (): void => {
    style.remove()
    if (turning !== turn) return
    turning = null
    box.style.viewTransitionName = ''
    delete root.dataset.calZoom
  }
  void turn.ready.then(edge, edge)
  void turn.finished.then(end, end)
}
