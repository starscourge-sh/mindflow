import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import { AnimatePresence, motion, useReducedMotion, type Transition } from 'motion/react'
import { cn } from '@/lib/cn'
import { byKeys, spring, WEIGHT } from '@/lib/motion'

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
function useReflow(box: RefObject<HTMLElement | null>, then: () => void): void {
  const call = useRef(then)
  call.current = then
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

export type FluidHover = {
  /** Where the light is, or null while the pointer is away. */
  spot: Spot | null
  /** Counts each time the pointer comes in, so the light fades in where it lands instead of sliding over from where it last was. */
  session: number
  /** True when the rows moved under a resting light (a fold, a reflow): it follows at once rather than travelling. */
  snap: boolean
  handlers: {
    onMouseMove: (event: React.MouseEvent) => void
    onMouseEnter: () => void
    onMouseLeave: () => void
    onClick: (event: React.MouseEvent) => void
  }
}

/**
 * The light for the list in `box`: its rows are what `items` finds there.
 * Pointed into a gap, the nearest row lights (`axis` says nearest along what:
 * y for a column, x for a strip, xy for rows that wrap), and a click there
 * goes to that row. The lit row carries `data-fluid-hover-active`, so it can
 * look pointed at too (its icon in colour, its text in full).
 */
export function useFluidHover(box: RefObject<HTMLElement | null>, { items, axis = 'y' }: { items: string; axis?: 'x' | 'y' | 'xy' }): FluidHover {
  const [lit, setLit] = useState<{ el: HTMLElement; spot: Spot; snap: boolean } | null>(null)
  const [session, setSession] = useState(0)
  const pointer = useRef<{ x: number; y: number } | null>(null)
  const entered = useRef(false)
  const frame = useRef(0)
  const litRef = useRef<HTMLElement | null>(null)
  litRef.current = lit?.el ?? null

  const pick = useCallback((x: number, y: number): HTMLElement | null => {
    const el = box.current
    if (!el) return null
    const at = el.getBoundingClientRect()
    const px = x - at.left - el.clientLeft + el.scrollLeft
    const py = y - at.top - el.clientTop + el.scrollTop
    let nearest: HTMLElement | null = null
    let best = Infinity
    // The rows' own reach: the gaps between them belong to the nearest, but
    // the empty part of a box wider than its rows (a row of chips in a full
    // width bar) is no one's, so a click out there picks nothing.
    const reach = { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity }
    for (const row of el.querySelectorAll<HTMLElement>(items)) {
      if (!shown(row) || row.matches(':disabled, [aria-disabled="true"]')) continue
      const s = spotOf(row, el)
      const inside = px >= s.left && px <= s.left + s.width && py >= s.top && py <= s.top + s.height
      if (inside) return row
      reach.left = Math.min(reach.left, s.left)
      reach.top = Math.min(reach.top, s.top)
      reach.right = Math.max(reach.right, s.left + s.width)
      reach.bottom = Math.max(reach.bottom, s.top + s.height)
      const dx = px - (s.left + s.width / 2)
      const dy = py - (s.top + s.height / 2)
      const far = axis === 'x' ? Math.abs(dx) : axis === 'y' ? Math.abs(dy) : Math.hypot(dx, dy)
      if (far < best) (best = far), (nearest = row)
    }
    const SLACK = 6
    if (px < reach.left - SLACK || px > reach.right + SLACK || py < reach.top - SLACK || py > reach.bottom + SLACK) return null
    return nearest
  }, [box, items, axis])

  const light = useCallback((row: HTMLElement | null, snap: boolean): void => {
    const el = box.current
    setLit((was) => {
      if (!row || !el) return null
      const spot = spotOf(row, el)
      return was && was.el === row && same(was.spot, spot) ? was : { el: row, spot, snap }
    })
  }, [box])

  // The rows moved under the light: it follows them at once, or picks again if its row went.
  useReflow(box, () => {
    const row = litRef.current
    if (!row) return
    if (row.isConnected && shown(row)) return light(row, true)
    light(pointer.current ? pick(pointer.current.x, pointer.current.y) : null, true)
  })

  // Said in the page too, for the lit row's own look and for tests to read.
  useEffect(() => {
    const row = lit?.el
    const el = box.current
    if (!row || !el) return el?.removeAttribute('data-fluid-hover-active-index')
    row.setAttribute('data-fluid-hover-active', '')
    el.setAttribute('data-fluid-hover-active-index', String([...el.querySelectorAll(items)].indexOf(row)))
    return () => row.removeAttribute('data-fluid-hover-active')
  }, [lit?.el, box, items])

  useEffect(() => () => cancelAnimationFrame(frame.current), [])
  // The window put away or left with the pointer still on a row never hears it leave:
  // the light goes then, so it is not waiting, stale, on a row nobody points at when the window is back.
  useEffect(() => {
    const away = (): void => void ((pointer.current = null), light(null, false))
    const hidden = (): void => void (document.hidden && away())
    addEventListener('blur', away)
    document.addEventListener('visibilitychange', hidden)
    const offHiding = window.api?.onHiding?.(away)
    return () => (removeEventListener('blur', away), document.removeEventListener('visibilitychange', hidden), offHiding?.())
  }, [light])

  const handlers = {
    onMouseMove: (event: React.MouseEvent) => {
      // Moves inside a menu or tooltip opened from a row are not over this list.
      if (!(event.currentTarget as Node).contains(event.target as Node)) return
      const { clientX: x, clientY: y } = event
      pointer.current = { x, y }
      cancelAnimationFrame(frame.current)
      frame.current = requestAnimationFrame(() => {
        const row = pick(x, y)
        if (entered.current && row !== litRef.current) {
          entered.current = false
          setSession((n) => n + 1)
        }
        light(row, false)
      })
    },
    onMouseEnter: () => void (entered.current = true),
    onMouseLeave: () => {
      cancelAnimationFrame(frame.current)
      pointer.current = null
      light(null, false)
    },
    onClick: (event: React.MouseEvent) => {
      const target = event.target as Element
      const row = litRef.current
      if (!row || !(event.currentTarget as Node).contains(target) || !target.isConnected) return
      // A click on a row, or on a control of its own between rows, is its own.
      if (target.closest(`${items}, button, a, input, textarea, select, label, [role="button"], [contenteditable]`)) return
      row.click()
    }
  }
  return { spot: lit?.spot ?? null, session, snap: lit?.snap ?? false, handlers }
}

/**
 * Where the chosen row in `box` is (what `selector` finds), followed as it
 * changes: a new choice travels there, unless it was reached by a key, which
 * arrives at once; the rows moving under it it simply follows.
 */
export function useChosen(box: RefObject<HTMLElement | null>, selector: string, key: unknown): { spot: Spot | null; snap: boolean } {
  const [chosen, setChosen] = useState<{ spot: Spot | null; snap: boolean }>({ spot: null, snap: true })
  const read = useCallback((snap: boolean) => {
    const el = box.current
    const row = el?.querySelector<HTMLElement>(selector)
    const spot = el && row && shown(row) ? spotOf(row, el) : null
    setChosen((was) => (same(was.spot, spot) ? was : { spot, snap: snap || !was.spot }))
  }, [box, selector])
  // Where it sits is read once the window has drawn the change, not in the
  // middle of drawing it: reading then would lay out a whole new page twice
  // (opening a note from the sidebar was held up by it). Only the first is at once.
  const drawn = useRef(false)
  useLayoutEffect(() => {
    if (!drawn.current) return void ((drawn.current = true), read(byKeys()))
    const keyed = byKeys()
    let after = 0
    const frame = requestAnimationFrame(() => void (after = window.setTimeout(() => read(keyed), 0)))
    return () => (cancelAnimationFrame(frame), clearTimeout(after))
  }, [read, key])
  useReflow(box, () => read(true))
  return chosen
}

/**
 * The light itself, drawn behind the rows: the list holding it is `relative
 * isolate`, so it sits under every row without each needing a place of its
 * own. It moves on a transform alone, on the compositor: a box the size of the
 * row it started on, moved and scaled to each row it travels to, and quietly
 * given its row's own size once it rests there. With Reduce motion it only fades.
 */
export function Highlight({ spot, session = 0, snap, from, travel = spring.fast, className }: {
  spot: Spot | null
  session?: number
  snap?: boolean
  /** Where a fresh light fades in from: the chosen row, so pointing grows out of it. */
  from?: Spot | null
  travel?: Transition
  className?: string
}): React.JSX.Element {
  const still = useReducedMotion()
  // No frames run in a hidden window: a glide started there would be left part
  // way, so it arrives at once.
  const now = snap || still || (typeof document !== 'undefined' && document.hidden)
  // The size the box is drawn at, fixed for a visit; the transform stretches it to each row.
  const base = useRef<{ width: number; height: number } | null>(null)
  const visit = useRef(session)
  if (visit.current !== session) void ((visit.current = session), (base.current = null))
  if (!base.current && spot) base.current = { width: spot.width, height: spot.height }
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
  return (
    <AnimatePresence>
      {spot && (
        <motion.div
          key={session}
          aria-hidden
          data-glide=""
          className={cn('pointer-events-none absolute top-0 left-0 -z-10 origin-top-left rounded-md bg-accent/60', className)}
          style={size}
          initial={{ opacity: 0, ...at(from ?? spot) }}
          animate={{ opacity: 1, ...at(spot) }}
          exit={{ opacity: 0, transition: spring.fast.exit }}
          transition={{ ...(now || resizing ? { duration: 0 } : travel), opacity: { duration: spring.fast.duration } }}
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
export function Weighted({ on, children, className }: { on: boolean; children: ReactNode; className?: string }): React.JSX.Element {
  return (
    // The one not shown is also hidden once faded (visibility goes with the
    // opacity), so the label's words are read out, and copied, once.
    <span className={cn('inline-grid min-w-0 *:col-start-1 *:row-start-1 *:truncate *:[transition:opacity_80ms,visibility_80ms]', className)}>
      <span className={on ? 'invisible opacity-0' : ''} style={{ fontWeight: WEIGHT.normal }}>{children}</span>
      <span className={on ? '' : 'invisible opacity-0'} style={{ fontWeight: WEIGHT.chosen }}>{children}</span>
    </span>
  )
}

/**
 * What a fold holds, opening to its own height and closing to nothing: the
 * words fade a little ahead of the edge, so they dissolve rather than being
 * cut. Opening springs; closing is quicker, a decision already made. A change
 * inside that is not the fold itself (a row added) is followed at once, never
 * chased. Shut, what it held leaves the page.
 */
export function Unfold({ open, children, className }: { open: boolean; children: ReactNode; className?: string }): React.JSX.Element {
  const inner = useRef<HTMLDivElement>(null)
  const [height, setHeight] = useState<number | null>(null)
  const [gone, setGone] = useState(!open)
  // When it was last turned: only a change that soon after is the fold's own.
  const turned = useRef(-Infinity)
  // Turned by a key (Enter, Space, an arrow), it is open or shut at once.
  const keyed = useRef(false)
  const was = useRef(open)
  const still = useReducedMotion()
  if (was.current !== open) {
    was.current = open
    turned.current = performance.now()
    keyed.current = byKeys()
    if (open && gone) setGone(false)
  }
  // Read before the first frame shows it, so the fold opens to the right height.
  // Not as it first comes in: open from the start it is its own height ('auto'),
  // and measured then it laid out the whole page in the middle of drawing it
  // (a note's first frame); its observer reads its height before that frame paints.
  const mounted = useRef(false)
  useLayoutEffect(() => {
    if (!mounted.current) return void (mounted.current = true)
    if (inner.current) setHeight(inner.current.offsetHeight)
  }, [open, gone])
  useEffect(() => {
    const el = inner.current
    if (!el) return
    const sized = new ResizeObserver(() => setHeight(el.offsetHeight))
    sized.observe(el)
    return () => sized.disconnect()
  }, [])
  const own = performance.now() - turned.current < 250
  const travel: Transition = !own || still || keyed.current ? { duration: 0 } : open ? spring.fast : { type: 'tween', ...spring.fast.exit }
  return (
    // A height on purpose, not a clip or a scale: what sits under a fold has
    // to move with it, and only a height carries it without the page jumping
    // when the fold ends. It is short (80ms, a few rows), and goes at once
    // from the keys or with Reduce motion.
    <motion.div
      initial={false}
      // Cut only along the edge that folds, so what hangs off a side (the
      // sidebar's branches, drawn in the margin) still shows.
      className={cn('[clip-path:inset(-100vh_-100vw_0_-100vw)]', className)}
      animate={{ height: open ? (height ?? 'auto') : 0, opacity: open ? 1 : 0 }}
      transition={{ height: travel, opacity: { duration: keyed.current ? 0 : open ? spring.fast.exit.duration : 0.04 } }}
      onAnimationComplete={() => void (!open && setGone(true))}
      inert={!open}
    >
      <div ref={inner}>{!gone && children}</div>
    </motion.div>
  )
}
