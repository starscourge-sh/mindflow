import { useEffect, useRef, type RefObject } from 'react'
import { EASING, motionNow, still } from '@/lib/motion'
import { edge } from '@/lib/haptics'
import { FIRM, project, rubber, spring } from '@/lib/snap'
import { frameLoop } from './year-zoom'

/**
 * The Calendar's levels, felt by hand: pinching out over a week in Month opens
 * that week, over a day in Week that day; pinching in goes back up. The same
 * pinch as the Journal's year (year-zoom.ts): wheel events with ctrlKey, read
 * in the same log units, with the app's one spring and give (lib/snap.ts).
 * Short of the change, what the level shows (its weeks, its hours) grows or
 * shrinks with the fingers about the point under them, whole and in
 * proportion, inside its own frame, and springs back firmly when they lift;
 * once the pinch is heading past the line (where it would stop, read from its
 * speed) the level changes once, and the rest of that pinch is spent, unless
 * the fingers turn round: then it is theirs again, and can take the level back.
 */

/** How far a pinch goes, in the year zoom's log units (a fifth wider), before the level changes. */
const OPEN = 0.18
/** A gap this long between a pinch's events: the fingers lifted, the next pinch is a new one. A pinch has no glide after it. */
const QUIET = 300
/** No pinch event for this long (five frames; a pinch sends one a frame while the fingers move): they stopped, and what grew goes back. */
const REST = 80
/** How far ahead a pinch's speed is read to say where it is heading: a brisk pinch changes the level before the fingers get there. */
const AHEAD = 0.05
/** How much of the way the fingers themselves must have gone before the speed may finish it: a twitch never changes the level. */
const EARNED = 0.6
/**
 * How much a level grows at the edge of the change, or shrinks pinching in: little enough that what leaves its frame
 * at the sides is the days' own padding (a week's number, 9px in from the edge, is whole three quarters of the way).
 */
const SWELL = 0.03
/** How far the fingers must come back, of the way to a change, before a spent pinch is theirs again: more than the wobble of a lift. */
const TURNED = 0.25
/** How long one level takes to give way to the next, the size the level left goes on to, and the size the next sets off from. */
const CHANGE = 200
const GONE = 0.06
const COME = 0.04
/** The name of a change's animations, to tell them from any other on the same elements. */
const NAME = 'mf-cal-level'

export type Way = 'closer' | 'up'
/** What a pinch would do: `body`, the part of the level in front that follows the fingers, and `to`, the level it would change to. */
export type Found<T> = { body: HTMLElement; to: T }

/**
 * `find(el, way)` says what a pinch over `el` that way would open or go back to, or null when there is no level that
 * way. `ahead(to)` is told as soon as a pinch has set off for a level, for it to be drawn, unseen, before the fingers
 * get there (null: the pinch came to nothing). `go(way, to, at, release)` changes the level; `at` is the point in the
 * window the fingers were over, and `release()` gives the body back its own size (call it as the level changes).
 */
export function usePinchLevels<T>(box: RefObject<HTMLElement | null>, find: (el: Element, way: Way) => Found<T> | null, ahead: (to: T | null) => void, go: (way: Way, to: T, at: { x: number; y: number }, release: () => void) => void): void {
  const ask = useRef({ find, ahead, go })
  ask.current = { find, ahead, go }
  useEffect(() => {
    let lz = 0
    let speed = 0
    let last = 0
    // The way of the pinch that changed the level (1 closer, -1 up, 0 none), and how far the fingers have since come back.
    let spent = 0
    let back = 0
    let held: Found<T> | null = null
    let heldWay: Way | null = null
    let heldAt = { x: 0, y: 0 }
    let then = 0
    let pace = 0
    const draw = (): void => {
      if (!held) return
      const amount = Math.min(1, Math.abs(lz) / OPEN)
      const scale = 1 + Math.sign(lz) * SWELL * amount
      held.body.style.transform = still() || Math.abs(scale - 1) < 0.0005 ? '' : `scale(${scale})`
    }
    const clear = (body: HTMLElement): void => void ((body.style.transform = ''), (body.style.transformOrigin = ''), (body.style.willChange = ''))
    const letGo = (): void => {
      if (held) clear(held.body), ask.current.ahead(null)
      held = null
      heldWay = null
    }
    // Once the fingers stop, what grew springs back.
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
      // The event's own time, when the fingers moved: a long frame holds the rest of the pinch back, and read on
      // arrival they would look like a new pinch and open the next level too.
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
        const found = event.target instanceof Element ? ask.current.find(event.target, way) : null
        if (!found) return void (lz = Math.sign(lz) * rubber(Math.abs(lz), OPEN, 0.2))
        held = found
        heldWay = way
        heldAt = { x: event.clientX, y: event.clientY }
        // About the point under the fingers, moved as one picture: drawn again at each size, a frame would not keep up.
        const frame = found.body.getBoundingClientRect()
        found.body.style.transformOrigin = `${event.clientX - frame.left}px ${event.clientY - frame.top}px`
        found.body.style.willChange = 'transform'
        // The level it is heading for is drawn now, unseen, so the change itself has nothing left to draw.
        ask.current.ahead(found.to)
      }
      const heading = project(lz, pace, AHEAD)
      if (Math.abs(heading) >= OPEN && Math.abs(lz) >= OPEN * EARNED && Math.sign(heading) === Math.sign(lz) && held) {
        const { body, to } = held
        held = null
        heldWay = null
        spent = way === 'closer' ? 1 : -1
        back = 0
        lz = 0
        speed = 0
        pace = 0
        // Its own size again under the change's animation, which keeps the point it grows about until it is over (`crossed`).
        ask.current.go(way, to, heldAt, () => (mine(body).length ? void (body.style.transform = '') : clear(body)))
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

const part = (layer: HTMLElement, name: 'body' | 'names'): HTMLElement | null => layer.querySelector<HTMLElement>(`[data-cal-${name}]`)
const mine = (el: HTMLElement): Animation[] => el.getAnimations().filter((one) => one.id === NAME)

/**
 * One level giving way to the next under a pinch: `old` and `next` are the two levels themselves, both drawn, `next`
 * unseen until now. The level left goes on the way the fingers were taking it (larger as they spread, smaller as they
 * closed), fading, while the next comes to its own size from the other side, both about `at`, the point in the window
 * under the fingers: nothing is gone before the next thing is there, and both keep their shape. Only what each level
 * shows moves (its `data-cal-body`), inside its own frame; the day names over it (`data-cal-names`) stay where they
 * are and change places, the old ones gone before the new ones come, so two rows of names are never seen at once.
 * Transform and opacity alone, played by the compositor: nothing is drawn or laid out for the change, and a busy page
 * cannot make it stutter. A change turned round on its way starts from what is on screen. One firm tap, in the frame
 * the levels start to move. With the Mac's Reduce motion the levels fade across and nothing grows or travels; with
 * the app's Motion off it answers null, and the level is simply there.
 */
export function crossLevels(old: HTMLElement, next: HTMLElement, way: Way, at: { x: number; y: number }): { anims: Animation[]; done: Promise<boolean> } | null {
  edge()
  const how = motionNow()
  if (how === 'none') return null
  const grows = how === 'all'
  const length = grows ? CHANGE : 160
  const seen = (el: HTMLElement): number => Number(getComputedStyle(el).opacity)
  const size = (el: HTMLElement): number => new DOMMatrixReadOnly(getComputedStyle(el).transform).a
  const anims: Animation[] = []
  const play = (el: HTMLElement, frames: Keyframe[], easing = EASING): void => {
    // Read before the last change's animations go: this one sets off from what they were showing.
    mine(el).forEach((one) => one.cancel())
    const one = el.animate(frames, { duration: length, easing, fill: 'both' })
    one.id = NAME
    anims.push(one)
  }
  // A level already on its way (the change turned round) carries on from where it is; one not yet seen sets off from nothing.
  const fresh = mine(next).length === 0
  const [oldAt, nextAt] = [seen(old), fresh ? 0 : seen(next)]
  const [oldBody, nextBody, oldNames, nextNames] = [part(old, 'body'), part(next, 'body'), part(old, 'names'), part(next, 'names')]
  if (grows && oldBody) {
    const from = size(oldBody)
    if (!oldBody.style.transformOrigin) origin(oldBody, at)
    play(oldBody, [{ transform: `scale(${from})` }, { transform: `scale(${way === 'closer' ? 1 + GONE : 1 - GONE})` }])
  }
  if (grows && nextBody) {
    const from = fresh ? (way === 'closer' ? 1 - COME : 1 + COME) : size(nextBody)
    if (fresh) origin(nextBody, at)
    play(nextBody, [{ transform: `scale(${from})` }, { transform: 'scale(1)' }])
  }
  // The names change places in turn: the old row out over the first third, the new one in over the rest.
  if (oldNames) play(oldNames, [{ opacity: seen(oldNames), easing: 'ease-out' }, { opacity: 0, offset: 0.3 }, { opacity: 0 }], 'linear')
  if (nextNames) play(nextNames, [{ opacity: fresh ? 0 : seen(nextNames) }, { opacity: 0, offset: 0.3, easing: EASING }, { opacity: 1 }], 'linear')
  play(old, [{ opacity: oldAt }, { opacity: 0 }])
  play(next, [{ opacity: nextAt }, { opacity: 1 }])
  return { anims, done: Promise.all(anims.map((one) => one.finished)).then(() => true, () => false) }
}

/** `at`, a point in the window, as the point `el` grows about. */
function origin(el: HTMLElement, at: { x: number; y: number }): void {
  const frame = el.getBoundingClientRect()
  el.style.transformOrigin = `${at.x - frame.left}px ${at.y - frame.top}px`
}

/** A change over and done: its animations go (each level is by now at rest as the page itself draws it), and what the bodies grew about with them. */
export function crossed(anims: Animation[]): void {
  for (const one of anims) {
    const el = one.effect instanceof KeyframeEffect ? one.effect.target : null
    one.cancel()
    if (el instanceof HTMLElement && el.hasAttribute('data-cal-body')) (el.style.transformOrigin = ''), (el.style.willChange = '')
  }
}
