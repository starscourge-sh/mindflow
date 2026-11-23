import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import { AnimatePresence, motion, useReducedMotion, type Transition } from 'motion/react'
import { flushSync } from 'react-dom'
import { cn } from '@/lib/cn'
import { byKeys, EASE, EASING, motionOff, spring, still, WEIGHT } from '@/lib/motion'

/**
 * One light per list that glides to whichever row is nearest the pointer, so
 * crossing the gap between two rows never goes dark, and what is lit is what a
 * click lands on. The way Fluid Functionalism's lists answer the hand.
 */

/** Where a thing sits, in its list's own space. */
export type Spot = { top: number; left: number; width: number; height: number }

/** A long list's row is set in place by a translateY of its own (ui.tsx, VirtualList): that is layout too. */
const placed = (el: HTMLElement): number =>
  el.dataset.index === undefined ? 0 : Number(/translateY\((-?[\d.]+)px\)/.exec(el.style.transform)?.[1] ?? 0)

/**
 * Where `el` sits inside `box`, counted from layout rather than from the
 * screen, so a menu still growing in (a scale) does not skew it. `box` must be
 * positioned, as every glide list is.
 */
export function spotOf(el: HTMLElement, box: HTMLElement): Spot {
  let top = el.offsetTop
  let left = el.offsetLeft
  let up = el.offsetParent as HTMLElement | null
  while (up && up !== box && box.contains(up)) {
    top += up.offsetTop + up.clientTop + placed(up)
    left += up.offsetLeft + up.clientLeft
    up = up.offsetParent as HTMLElement | null
  }
  return { top, left, width: el.offsetWidth, height: el.offsetHeight }
}

const same = (a: Spot | null, b: Spot | null): boolean =>
  a === b || (!!a && !!b && a.top === b.top && a.left === b.left && a.width === b.width && a.height === b.height)

/** A row on show: in the page, and not folded away. */
const shown = (el: HTMLElement): boolean => el.offsetWidth > 0 || el.offsetHeight > 0

/**
 * Calls `then` once a frame at most while anything inside `box` changes size
 * or place (a fold opening, a count rolling, a row added, a label filling in
 * after the first measure, a font arriving, the padding changing at a width),
 * once when the list first appears, which may be after its owner (a page
 * waiting for its settings), and again whenever the window comes back into
 * view. While the window is hidden there are no frames, so it measures at once
 * instead of waiting for one.
 */
function useReflow(box: RefObject<HTMLElement | null>, then: () => void, /** Told the moment a change is heard, before the frame: what was measured is out of date. */ stale?: () => void): void {
  const call = useRef(then)
  call.current = then
  const old = useRef(stale)
  old.current = stale
  const watching = useRef<{ el: HTMLElement; stop: () => void } | null>(null)
  // After every commit, but it only starts over when the list itself is new.
  useEffect(() => {
    const el = box.current
    if (watching.current?.el === el) return
    watching.current?.stop()
    watching.current = null
    if (!el) return
    let frame = 0
    const soon = (): void => {
      old.current?.()
      cancelAnimationFrame(frame)
      if (document.hidden) return call.current()
      frame = requestAnimationFrame(() => call.current())
    }
    // The content box and the border box both: padding that changes at a
    // width moves every row while one of the two may stay the same.
    const sized = new ResizeObserver(soon)
    const outer = new ResizeObserver(soon)
    const watch = (): void => {
      sized.disconnect()
      sized.observe(el)
      outer.disconnect()
      outer.observe(el, { box: 'border-box' })
      for (const child of el.children) sized.observe(child)
    }
    watch()
    const changed = new MutationObserver(() => (watch(), soon()))
    changed.observe(el, { childList: true, subtree: true })
    // What can change layout without any row changing size, or happen while
    // no frames run: a font arriving, the window resized or shown again.
    const back = (): void => void (!document.hidden && soon())
    document.fonts?.addEventListener('loadingdone', soon)
    // Asked once the window has drawn: asking for the fonts lays out the whole
    // page there and then, and this runs as a new page is being drawn.
    let fonts = 0
    const fontsFrame = requestAnimationFrame(() => void (fonts = window.setTimeout(() => void document.fonts?.ready.then(() => watching.current?.el === el && soon()), 0)))
    window.addEventListener('resize', soon)
    window.addEventListener('focus', back)
    window.addEventListener('pageshow', back)
    document.addEventListener('visibilitychange', back)
    soon()
    watching.current = {
      el,
      stop: () => {
        cancelAnimationFrame(frame)
        cancelAnimationFrame(fontsFrame)
        clearTimeout(fonts)
        sized.disconnect()
        outer.disconnect()
        changed.disconnect()
        document.fonts?.removeEventListener('loadingdone', soon)
        window.removeEventListener('resize', soon)
        window.removeEventListener('focus', back)
        window.removeEventListener('pageshow', back)
        document.removeEventListener('visibilitychange', back)
      }
    }
  })
  // Forgotten as well as stopped: React's development checks (and a hot
  // reload) stop every effect and start it again on the same list, and a
  // watch only stopped would look like one still running and never restart.
  useEffect(() => () => {
    watching.current?.stop()
    watching.current = null
  }, [])
}

/** How long the pointer's light takes to reach the next row: two frames at 60 a second, so it is wholly there within 50ms of the pointer. */
const GLIDE_MS = 32
/** The light coming in on a row, and going out as the pointer leaves the list. */
const FADE_MS = 32
/** A glide starts this far along its way, so the light is seen to move in the very frame the pointer crossed over. */
const LEAD = 0.35
/**
 * The app's one curve (lib/motion EASE) worked out at `p`, for knowing where a glide is part way; the browser plays
 * the same curve (EASING). Along a curve like this x only rises, so halving finds where on it `p` falls.
 */
const along = (t: number, a: number, b: number): number => 3 * (1 - t) ** 2 * t * a + 3 * (1 - t) * t ** 2 * b + t ** 3
const eased = (p: number): number => {
  let low = 0
  let high = 1
  for (let i = 0; i < 12; i++) {
    const t = (low + high) / 2
    if (along(t, EASE[0], EASE[2]) < p) low = t
    else high = t
  }
  return along((low + high) / 2, EASE[1], EASE[3])
}
const between = (a: Spot, b: Spot, p: number): Spot => ({
  top: a.top + (b.top - a.top) * p,
  left: a.left + (b.left - a.left) * p,
  width: a.width + (b.width - a.width) * p,
  height: a.height + (b.height - a.height) * p
})

/**
 * The light a pointer carries over a list, moved by hand: the pointer's own
 * event places it with the browser's animations (a transform and a fade, run
 * off the page's thread), and React draws nothing for it. Held in state, it
 * drew its whole owner again for every row the pointer crossed (the sidebar's
 * owner is the main window itself) and set off a second later, which is what
 * made it trail the hand.
 */
export type Light = {
  /** Given to the light's element as its ref. */
  mount: (el: HTMLElement | null) => void
  /** Go to `spot` (null: the pointer has left). `snap` arrives at once, as rows moving under a resting light do. */
  to: (spot: Spot | null, snap: boolean, danger?: boolean) => void
}

export function makeLight(): Light {
  let el: HTMLElement | null = null
  // Where it rests or is going; null while the pointer is away.
  let at: Spot | null = null
  // The size the box is drawn at: a glide stretches it to each row by its transform, and at rest it takes the row's own.
  let base = { width: -1, height: -1 }
  let flight: { from: Spot; to: Spot; began: number } | null = null
  let move: Animation | null = null
  let fade: Animation | null = null
  const drawn = (spot: Spot): string => `translate(${spot.left}px, ${spot.top}px) scale(${spot.width / base.width}, ${spot.height / base.height})`
  /** Where it is drawn this moment, worked out from the glide's own clock rather than asked of the page. */
  const now = (): Spot | null => {
    if (!flight) return at
    const p = (performance.now() - flight.began) / GLIDE_MS
    return p >= 1 ? flight.to : between(flight.from, flight.to, eased(Math.max(0, p)))
  }
  /** There at once, at the row's own size. */
  const put = (spot: Spot): void => {
    if (!el) return
    move?.cancel()
    move = null
    flight = null
    if (base.width !== spot.width || base.height !== spot.height) {
      base = { width: spot.width, height: spot.height }
      el.style.width = `${spot.width}px`
      el.style.height = `${spot.height}px`
    }
    el.style.transform = `translate(${spot.left}px, ${spot.top}px)`
  }
  /** How lit it is this moment: part way through a fade, or at its end. */
  const glow = (): number => {
    const p = fade?.playState === 'running' ? fade.effect?.getComputedTiming().progress : null
    return typeof p === 'number' ? (at ? p : 1 - p) : at ? 1 : 0
  }
  const fadeTo = (on: boolean): void => {
    if (!el) return
    const from = glow()
    const to = on ? 1 : 0
    fade?.cancel()
    fade = null
    el.style.opacity = String(to)
    // Motion off: simply there, simply gone. Reduce motion keeps the fade and loses the travel.
    if (from === to || document.hidden || motionOff()) return
    fade = el.animate({ opacity: [from, to] }, { duration: FADE_MS * Math.abs(to - from), easing: 'linear' })
  }
  return {
    mount(node) {
      if (node === el) return
      move?.cancel()
      fade?.cancel()
      move = fade = flight = null
      el = node
      base = { width: -1, height: -1 }
      if (el && at) (put(at), (el.style.opacity = '1'))
    },
    to(spot, snap, danger = false) {
      if (!el) return void (at = spot)
      if (!spot) {
        if (!at) return
        fadeTo(false)
        at = null
        return
      }
      el.toggleAttribute('data-danger', danger)
      if (!at) {
        // The pointer just come in: the light fades in on the row under it, never sliding over from where it last was.
        const was = glow()
        // Already a little lit in its first frame, as a glide is already on its way.
        const from = was + (1 - was) * LEAD
        put(spot)
        at = spot
        fade?.cancel()
        fade = null
        el.style.opacity = '1'
        if (was < 1 && !document.hidden && !motionOff()) fade = el.animate({ opacity: [from, 1] }, { duration: FADE_MS * (1 - was), easing: 'linear' })
        return
      }
      if (same(at, spot)) return
      const here = now() ?? spot
      at = spot
      // More than a row behind (a fast sweep, a jump over a gap), it goes straight there: the light is never
      // seen on a row the pointer left long ago.
      const far =
        Math.abs(spot.top + spot.height / 2 - here.top - here.height / 2) > (spot.height + here.height) * 0.75 ||
        Math.abs(spot.left + spot.width / 2 - here.left - here.width / 2) > (spot.width + here.width) * 0.75
      if (snap || far || document.hidden || still()) return put(spot)
      const from = between(here, spot, LEAD)
      move?.cancel()
      // Its place is written at once and the glide played over it, so when the glide ends nothing is handed back.
      el.style.transform = drawn(spot)
      flight = { from, to: spot, began: performance.now() }
      const glide = (move = el.animate({ transform: [drawn(from), drawn(spot)] }, { duration: GLIDE_MS, easing: EASING }))
      // At rest on a row of another size it takes that size (its corners round again).
      glide.onfinish = () => void (move === glide && at && put(at))
    }
  }
}

type FluidHover = {
  /** The list's light: hand it to `<Highlight light>`. */
  light: Light
  handlers: {
    onMouseMove: (event: React.MouseEvent) => void
    onMouseLeave: () => void
    onPointerDown: (event: React.PointerEvent) => void
    onClick: (event: React.MouseEvent) => void
  }
}

const OFF = ':disabled, [aria-disabled="true"]'

/**
 * The light for the list in `box`: its rows are what `items` finds there.
 * Pointed into a gap, the nearest row lights (`axis` says nearest along what:
 * y for a column, x for a strip, xy for rows that wrap), and a click there
 * goes to that row. The lit row carries `data-fluid-hover-active`, so it can
 * look pointed at too (its icon in colour, its text in full). None of this is
 * React state: a pointer crossing rows draws no component again.
 */
export function useFluidHover(box: RefObject<HTMLElement | null>, { items, axis = 'y' }: { items: string; axis?: 'x' | 'y' | 'xy' }): FluidHover {
  const [light] = useState(makeLight)
  const pointer = useRef<{ x: number; y: number } | null>(null)
  const litRef = useRef<HTMLElement | null>(null)
  // Each row's place, measured once and kept until the list next changes size or place (useReflow says when): a
  // pointer crossing rows it has crossed before reads nothing from the page, so no move ever lays the page out.
  const [spots] = useState(() => new Map<HTMLElement, Spot>())
  const spotFor = useCallback((row: HTMLElement, el: HTMLElement): Spot => {
    let spot = spots.get(row)
    if (!spot) spots.set(row, (spot = spotOf(row, el)))
    return spot
  }, [spots])

  const pick = useCallback((x: number, y: number): HTMLElement | null => {
    const el = box.current
    if (!el) return null
    const at = el.getBoundingClientRect()
    const px = x - at.left - el.clientLeft + el.scrollLeft
    const py = y - at.top - el.clientTop + el.scrollTop
    let nearest: HTMLElement | null = null
    let best = Infinity
    let bestAcross = Infinity
    // The rows' own reach: the gaps between them belong to the nearest, but
    // the empty part of a box wider than its rows (a row of chips in a full
    // width bar) is no one's, so a click out there picks nothing.
    const reach = { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity }
    for (const row of el.querySelectorAll<HTMLElement>(items)) {
      const s = spotFor(row, el)
      // A row on show (one folded away has no size), and one that can be pressed.
      if ((!s.width && !s.height) || row.matches(OFF)) continue
      const inside = px >= s.left && px <= s.left + s.width && py >= s.top && py <= s.top + s.height
      if (inside) return row
      reach.left = Math.min(reach.left, s.left)
      reach.top = Math.min(reach.top, s.top)
      reach.right = Math.max(reach.right, s.left + s.width)
      reach.bottom = Math.max(reach.bottom, s.top + s.height)
      const dx = px - (s.left + s.width / 2)
      const dy = py - (s.top + s.height / 2)
      const far = axis === 'x' ? Math.abs(dx) : axis === 'y' ? Math.abs(dy) : Math.hypot(dx, dy)
      // Rows side by side in a column (a split's two halves) are equally near along y: the one nearer
      // across wins, never simply the first, or a pointer coming in at the right lit the left half first.
      const across = axis === 'y' ? Math.abs(dx) : axis === 'x' ? Math.abs(dy) : 0
      if (far < best || (far === best && across < bestAcross)) (best = far), (bestAcross = across), (nearest = row)
    }
    const SLACK = 6
    if (px < reach.left - SLACK || px > reach.right + SLACK || py < reach.top - SLACK || py > reach.bottom + SLACK) return null
    return nearest
  }, [box, items, axis, spotFor])

  /** The row the pointer is straight on, told from what it touched: nothing is measured for it. */
  const under = useCallback((target: Element): HTMLElement | null => {
    const el = box.current
    if (!el) return null
    // `:scope` means the list itself, which only the list can answer.
    const row = items.includes(':scope')
      ? ([...el.querySelectorAll<HTMLElement>(items)].find((one) => one.contains(target)) ?? null)
      : target.closest<HTMLElement>(items)
    return row && el.contains(row) && !row.matches(OFF) ? row : null
  }, [box, items])

  const lightOn = useCallback((row: HTMLElement | null, snap: boolean): void => {
    const el = box.current
    const was = litRef.current
    if (!row || !el) {
      was?.removeAttribute('data-fluid-hover-active')
      litRef.current = null
      return light.to(null, false)
    }
    // Read (if it must be) before anything is written, so the page is never laid out for it.
    const spot = spotFor(row, el)
    if (was !== row) {
      // Said in the page too, for the lit row's own look and for tests to read.
      was?.removeAttribute('data-fluid-hover-active')
      row.setAttribute('data-fluid-hover-active', '')
      litRef.current = row
    }
    light.to(spot, snap, row.dataset.variant === 'destructive')
  }, [box, light, spotFor])

  // The rows moved under the light: it follows them at once, or picks again if its row went.
  useReflow(box, () => {
    const row = litRef.current
    if (!row) return
    if (row.isConnected && shown(row)) return lightOn(row, true)
    lightOn(pointer.current ? pick(pointer.current.x, pointer.current.y) : null, true)
  }, () => spots.clear())

  // The window put away or left with the pointer still on a row never hears it leave:
  // the light goes then, so it is not waiting, stale, on a row nobody points at when the window is back.
  useEffect(() => {
    const away = (): void => void ((pointer.current = null), lightOn(null, false))
    const hidden = (): void => void (document.hidden && away())
    addEventListener('blur', away)
    document.addEventListener('visibilitychange', hidden)
    const offHiding = window.api?.onHiding?.(away)
    return () => (removeEventListener('blur', away), document.removeEventListener('visibilitychange', hidden), offHiding?.(), void litRef.current?.removeAttribute('data-fluid-hover-active'))
  }, [lightOn])

  const pressedRow = useRef(false)
  const handlers = {
    onMouseMove: (event: React.MouseEvent) => {
      // Moves inside a menu or tooltip opened from a row are not over this list.
      if (!(event.currentTarget as Node).contains(event.target as Node)) return
      const { clientX: x, clientY: y } = event
      pointer.current = { x, y }
      const on = under(event.target as Element)
      // Still on the lit row: nothing to do, and nothing read.
      if (on && on === litRef.current) return
      lightOn(on ?? pick(x, y), false)
    },
    onMouseLeave: () => {
      pointer.current = null
      lightOn(null, false)
    },
    // Pressed on a row and let go elsewhere (a row dragged, or a drag put back with Esc), the click lands between rows: it is no click on the lit one.
    onPointerDown: (event: React.PointerEvent) => void (pressedRow.current = !!(event.target as Element).closest?.(items)),
    onClick: (event: React.MouseEvent) => {
      const target = event.target as Element
      const row = litRef.current
      if (pressedRow.current) return void (pressedRow.current = false)
      if (!row || !(event.currentTarget as Node).contains(target) || !target.isConnected) return
      // A click on a row, or on a control of its own between rows, is its own.
      if (target.closest(`${items}, button, a, input, textarea, select, label, [role="button"], [contenteditable]`)) return
      row.click()
    }
  }
  return { light, handlers }
}

/** Where the chosen row sits, and whether the mark goes there at once. */
type Place = { spot: Spot | null; snap: boolean }

/**
 * Where a list's chosen row is, kept out of React's state: only the mark reads it (`<Highlight chosen>`), so a
 * choice moving draws that one element again and never the list's owner. Held in the owner's state, every new
 * choice drew the owner a second time, and the sidebar's owner is the main window: each page change drew the whole
 * window once more only to move the mark.
 */
export type Mark = { get: () => Place; subscribe: (heard: () => void) => () => void }

function makeMark(): Mark & { set: (next: (was: Place) => Place) => void } {
  let now: Place = { spot: null, snap: true }
  const hearers = new Set<() => void>()
  return {
    get: () => now,
    subscribe: (heard) => (hearers.add(heard), () => void hearers.delete(heard)),
    set: (next) => {
      const to = next(now)
      if (to === now) return
      now = to
      for (const heard of hearers) heard()
    }
  }
}

/**
 * The mark for the chosen row in `box` (what `selector` finds), followed as it
 * changes: a new choice travels there, unless it was reached by a key, which
 * arrives at once; the rows moving under it it simply follows. Hand what this
 * gives to `<Highlight chosen>`.
 */
export function useChosen(box: RefObject<HTMLElement | null>, selector: string, key: unknown): Mark {
  const [mark] = useState(makeMark)
  const read = useCallback((snap: boolean) => {
    const el = box.current
    const row = el?.querySelector<HTMLElement>(selector)
    const spot = el && row && shown(row) ? spotOf(row, el) : null
    mark.set((was) => (same(was.spot, spot) ? was : { spot, snap: snap || !was.spot }))
  }, [box, selector, mark])
  // Where it sits is read once the window has drawn the change, not in the
  // middle of drawing it: reading then would lay out a whole new page twice
  // (opening a note from the sidebar was held up by it). The first is read in
  // the same frame, but once the window has laid the page out and before it is
  // painted (a size observer's first say), so the light is there from the first
  // frame and the page is not laid out an extra time for it (Today's chips, 55ms).
  const drawn = useRef(false)
  // A list that moves (a fold, a row joining) is followed at once, but not
  // while a new choice is on its way: the list changing with the choice (a
  // row rising into the sidebar as its page opens) read it first, and the
  // light jumped there instead of gliding.
  const chosenAt = useRef(-Infinity)
  useLayoutEffect(() => {
    if (drawn.current) chosenAt.current = performance.now()
    if (!drawn.current) {
      drawn.current = true
      const el = box.current
      if (!el) return
      const keyed = byKeys()
      const laid = new ResizeObserver(() => (laid.disconnect(), flushSync(() => read(keyed))))
      laid.observe(el)
      return () => laid.disconnect()
    }
    const keyed = byKeys()
    let after = 0
    const frame = requestAnimationFrame(() => void (after = window.setTimeout(() => read(keyed), 0)))
    return () => (cancelAnimationFrame(frame), clearTimeout(after))
  }, [read, key])
  useReflow(box, () => read(performance.now() - chosenAt.current > 400 || byKeys()))
  return mark
}

const LIGHT = 'pointer-events-none absolute top-0 left-0 -z-10 origin-top-left rounded-md bg-accent/60'

/**
 * The light itself, drawn behind the rows: the list holding it is `relative
 * isolate`, so it sits under every row without each needing a place of its
 * own. It moves on a transform alone, on the compositor: a box the size of the
 * row it started on, moved and scaled to each row it travels to, and quietly
 * given its row's own size once it rests there. With Reduce motion it only fades.
 *
 * Two kinds. A pointer's light (`light`, from useFluidHover) is one element
 * that stays in the page, moved by the pointer's own events. The mark of what
 * is chosen (`chosen`, from useChosen) changes only when the choice does: it
 * reads its own place, so it alone is drawn again when that moves.
 */
export function Highlight(props: { light: Light; className?: string } | { chosen: Mark; travel?: Transition; className?: string }): React.JSX.Element {
  if ('light' in props) return <div ref={props.light.mount} aria-hidden data-glide="" className={cn(LIGHT, 'opacity-0', props.className)} />
  return <ChosenAt {...props} />
}

function ChosenAt({ chosen, travel, className }: { chosen: Mark; travel?: Transition; className?: string }): React.JSX.Element {
  const [place, setPlace] = useState(chosen.get)
  // Listening from the moment it is in the page (a layout effect), not a moment after it is painted: a list's first
  // place is read in its very first frame (useChosen), and heard then, the mark is drawn in that frame too. React's
  // own store hook starts listening only after the first paint, which left a new list one frame without its mark.
  useLayoutEffect(() => {
    setPlace(chosen.get())
    return chosen.subscribe(() => setPlace(chosen.get()))
  }, [chosen])
  return <Chosen spot={place.spot} snap={place.snap} travel={travel} className={className} />
}

function Chosen({ spot, snap, travel = spring.fast, className }: { spot: Spot | null; snap?: boolean; travel?: Transition; className?: string }): React.JSX.Element {
  const calm = useReducedMotion()
  // No frames run in a hidden window: a glide started there would be left part
  // way, so it arrives at once.
  const now = snap || calm || (typeof document !== 'undefined' && document.hidden)
  // The size the box is drawn at; the transform stretches it to each row.
  const base = useRef<{ width: number; height: number } | null>(null)
  if (!base.current && spot) base.current = { width: spot.width, height: spot.height }
  // Nothing lit: no size kept. A box left at a row's old width stood out past a list narrowed since (a task opened beside
  // it) and made the pane scroll sideways (the user, 24 Nov).
  if (!spot) base.current = null
  const size = base.current ?? { width: 1, height: 1 }
  const at = (one: Spot): { transform: string } => ({ transform: `translate(${one.left}px, ${one.top}px) scale(${one.width / size.width}, ${one.height / size.height})` })
  // At rest on a row of another size, it takes that size at once (the same
  // look, its corners round again); that one change does not travel.
  const restedOn = useRef<Spot | null>(null)
  const [, rested] = useState(0)
  const rest = (): void => {
    if (!spot || !base.current || (base.current.width === spot.width && base.current.height === spot.height)) return
    base.current = { width: spot.width, height: spot.height }
    restedOn.current = spot
    rested((n) => n + 1)
  }
  const resizing = !!spot && restedOn.current === spot
  // A choice more than a row and a half away is there at once: a long slide past every row between reads as lag.
  // Worked out once per new spot, so a second render of the same one (StrictMode, a parent's) keeps the answer.
  const jump = useRef<{ from: Spot | null; to: Spot | null; far: boolean }>({ from: null, to: null, far: false })
  if (spot !== jump.current.to) {
    const was = jump.current.to
    jump.current = { from: was, to: spot, far: !!spot && !!was && (Math.abs(spot.top - was.top) > spot.height * 1.5 || Math.abs(spot.left - was.left) > spot.width * 1.5) }
  }
  const far = jump.current.far
  return (
    <AnimatePresence>
      {spot && (
        <motion.div
          aria-hidden
          data-glide=""
          className={cn(LIGHT, className)}
          style={size}
          initial={{ opacity: 0, ...at(spot) }}
          animate={{ opacity: 1, ...at(spot) }}
          exit={{ opacity: 0, transition: spring.fast.exit }}
          transition={{ ...(now || resizing || far ? { duration: 0 } : travel), opacity: { duration: spring.fast.duration } }}
          onAnimationComplete={rest}
        />
      )}
    </AnimatePresence>
  )
}

/**
 * A label that grows heavier when `on` without moving what is beside it: the
 * word is drawn at both weights in one place, the heavier holding the room,
 * and the two cross-fade (opacity only, so the text is never redrawn at the
 * weights between, as a font-weight transition did each frame).
 */
const HIDDEN = 'invisible opacity-0 max-h-[1lh] overflow-hidden'

export function Weighted({ on, children, className }: { on: boolean; children: ReactNode; className?: string }): React.JSX.Element {
  return (
    // The one not shown is hidden, so the label's words are read out, and
    // copied, once. Swapped at once, never crossfaded: halfway through a fade
    // both copies are half there, and a page opening behind it (Journal, the
    // Inbox) held the frame there, the label dim for as long as it took.
    <span className={cn('inline-grid min-w-0 *:col-start-1 *:row-start-1 *:truncate', className)}>
      {/* The hidden copy keeps the width but never the height: in a name that wraps, bold could take a second line
          the shown words do not, and the row stood a line taller with nothing in it ("Lines from books"). */}
      <span className={on ? HIDDEN : ''} style={{ fontWeight: WEIGHT.normal }}>{children}</span>
      <span className={on ? '' : HIDDEN} style={{ fontWeight: WEIGHT.chosen }}>{children}</span>
    </span>
  )
}

/**
 * What a fold holds: there when open, gone when shut, at once, the app's one
 * fold (the sidebar's folders, tags, pins and Recent among them). No slide:
 * what sits under it moves up or down in the same frame the fold is clicked,
 * as a group in a list does (kept-groups.tsx Fold). A slide left the rows under
 * it gliding after the click, and the user asked for folding to be instant.
 */
export function Unfold({ open, children, className }: { open: boolean; children: ReactNode; className?: string }): React.JSX.Element {
  return (
    <div className={className} inert={!open}>
      {open && children}
    </div>
  )
}
