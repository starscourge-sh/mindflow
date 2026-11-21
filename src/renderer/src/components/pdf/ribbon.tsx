import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react'
import { AnimatePresence, animate, motion, useMotionValue, type AnimationPlaybackControls, type MotionValue } from 'motion/react'
import { X } from 'lucide-react'
import { EASE, motionNow } from '@/lib/motion'
import { call } from '@/lib/haligtree'
import { hueVar, type Hue } from '@/lib/books'

/** The paint for a ribbon in a hue (pdf.css [data-ribbon-hue]): its own deep red when it has none. */
export const ribbonInk = (hue: Hue | null | undefined): Record<string, string> | undefined => (hue ? { '--ribbon-hue': hueVar(hue) } : undefined)

/**
 * The ribbon: a book's one sewn marker, laid where you mean to come back to, as a planner's satin ribbon lies between
 * its pages. It hangs from the top edge of the reader as a short tab; a click on it, ⌘D, or "Lay the ribbon here" on a
 * page's right-click menu lays it across the top of that page (pdf-reader.tsx), or beside a paragraph of an article
 * (web-reader.tsx). Laid on a PDF's page it can be slid sideways along that page's top edge, and only that: it follows
 * the pointer 1:1, sways from where it is held, and its page never changes (the user, 21 Nov 2026: dragging it from page
 * to page "is buggy"; the menu and ⌘D say exactly which page). Opening the book, the ribbon wins over the page kept as
 * you read.
 *
 * The ribbon is one element for its whole life, hanging, held and laid: its place is always worked out from where it
 * rests now plus an offset that springs to nothing, so it never jumps from one state to the next, and a scroll moves a
 * laid ribbon with its page in the same frame.
 */

/** A book's ribbon as the store keeps it (main/pdf-highlights.ts): a PDF's by page, an article's by paragraph.
 *  `across`: where along its page's top edge it lies, as a share of the page's width (null: near the right edge). */
export type RibbonPlace = { page: number; block: number | null; words: string | null; across?: number | null; hue?: Hue | null }

export const readRibbon = (src: string): Promise<RibbonPlace | null> => call<RibbonPlace | null>('ribbon:get', src)
export const keepRibbon = (src: string, place: RibbonPlace | null): Promise<boolean> => call<boolean>('ribbon:lay', src, place)

/** How wide the satin is, and how long it shows hanging, hovered, and laid on a page. */
const WIDTH = 22
const HANG = 46
const HANG_NEAR = 60
const LAID = 138
/** The tab's distance in from the right of the pages, hanging, and a laid ribbon's when it has not been slid. */
const IN_FROM_RIGHT = 64
/** Slid, it stays this far in from either side of its page. */
const INSET = 14

/** The give when it settles: the app's quick drop (focus-pill.tsx DROP), a touch softer, so it overshoots a little. */
const SETTLE = { type: 'spring', stiffness: 420, damping: 26, mass: 1 } as const
/** Its length, as the focus pill grows (focus-pill.tsx SPRING). */
const GROW = { type: 'spring', stiffness: 152, damping: 17.8, mass: 1 } as const
/** The sway, held and let go: a loose pendulum that comes to rest in a swing or two. */
const SWAY = { type: 'spring', stiffness: 260, damping: 11, mass: 1 } as const
/** Reduce motion: a plain glide, no sway and no give. */
const GLIDE = { duration: 0.2, ease: EASE } as const

type Point = { x: number; y: number }
/** A spot's top edge on screen: its left and right, and where the ribbon's top sits. */
export type RibbonEdge = { left: number; right: number; top: number }
/** A spot it can be slid onto, along the same top edge (the other page of a spread's row). */
export type RibbonTrackSpot = RibbonEdge & { key: string }

export function Ribbon({
  frame,
  scroller,
  at,
  across = null,
  hue = null,
  edgeOf,
  trackOf,
  placeOf,
  homeX,
  ready,
  onSlide,
  onLayHere,
  onMenu,
  away
}: {
  /** The box the ribbon hangs in (not scrolled): the reader's pages and their scroller fill it. */
  frame: RefObject<HTMLElement | null>
  scroller: RefObject<HTMLElement | null>
  /** The spot it is laid at, or null when it hangs. */
  at: string | null
  /** Where along its spot's edge it lies, a share of the edge (null: near the right). Only with `edgeOf`. */
  across?: number | null
  /** Its colour, one of a book's: null for its own deep red. */
  hue?: Hue | null
  /** The top edge of a spot on screen, or null while it is not drawn: given with `onSlide`, a laid ribbon slides along it. */
  edgeOf?: (key: string) => RibbonEdge | null
  /** The spots along the same edge, left to right, the ribbon can be slid across (a spread's row): just its own if not given. */
  trackOf?: (key: string) => RibbonTrackSpot[]
  /** Where the ribbon's top left sits on screen when laid at `key`, for spots it does not slide on (an article's). */
  placeOf?: (key: string) => Point | null
  /** Where the tab hangs across, on screen. */
  homeX: () => number | null
  /** The book is drawn: until then the ribbon is not shown. */
  ready: boolean
  /** Slid along its edge and let go there: the spot it now lies on, and the share of that spot's edge. */
  onSlide?: (across: number, key: string) => void
  /** The hanging tab clicked: laid where you are reading. */
  onLayHere: () => void
  /** Right-clicked: its menu (its colour, going to it, taking it out). */
  onMenu?: (event: React.MouseEvent) => void
  /** Laid out of sight: what the tab at the top says ("p. 95"), and going there. */
  away?: { label: string; go: () => void }
}): React.JSX.Element {
  const band = useRef<HTMLDivElement>(null)
  const ox = useMotionValue(0)
  const oy = useMotionValue(0)
  const rot = useMotionValue(0)
  const len = useMotionValue(at ? LAID : HANG)
  /** Held: the pointer, and how far in from the ribbon's left it took hold. */
  const held = useRef<{ id: number; grab: number; pointer: Point; from: Point; moved: boolean; vx: number; t: number } | null>(null)
  const [holding, setHolding] = useState(false)
  const runs = useRef<AnimationPlaybackControls[]>([])
  /** Where it was last drawn, in the frame's own room: the start of every glide. */
  const drawn = useRef<Point | null>(null)
  const atNow = useRef(at)
  atNow.current = at
  /** Where along its edge it lies: set the moment it is let go, so it rests there before the reader has kept it. */
  const acrossNow = useRef(across)
  useLayoutEffect(() => void (acrossNow.current = across), [across, at])
  const reads = useRef({ placeOf, edgeOf, trackOf, homeX })
  reads.current = { placeOf, edgeOf, trackOf, homeX }
  /** The tab that says where a ribbon out of sight lies. */
  const awayTab = useRef<HTMLButtonElement>(null)
  const [gone, setGone] = useState(false)
  const goneNow = useRef(false)
  const slides = !!edgeOf && !!onSlide

  /** The left of a laid ribbon on its edge: at its share of it, never closer than INSET to either side. */
  const leftOn = (edge: RibbonEdge, share: number | null): number => {
    const low = edge.left + INSET
    const high = Math.max(low, edge.right - INSET - WIDTH)
    const x = share === null ? edge.right - IN_FROM_RIGHT : edge.left + share * (edge.right - edge.left) - WIDTH / 2
    return Math.max(low, Math.min(high, x))
  }
  /** Where it rests now, in the frame's room: laid on its spot, or hanging at the top. */
  const rest = (): Point | null => {
    const box = frame.current?.getBoundingClientRect()
    if (!box) return null
    const key = atNow.current
    if (key) {
      const edge = reads.current.edgeOf?.(key)
      if (edge) return { x: leftOn(edge, acrossNow.current) - box.left, y: edge.top - box.top }
      const spot = reads.current.placeOf?.(key)
      return spot ? { x: spot.x - box.left, y: spot.y - box.top } : null
    }
    const x = reads.current.homeX()
    return x === null ? null : { x: x - box.left - IN_FROM_RIGHT, y: -2 }
  }
  /** The edge it can be slid along: its own page's, or its whole row's in a spread, and the spots on it. */
  const track = (): { edge: RibbonEdge; spots: RibbonTrackSpot[] } | null => {
    const key = atNow.current
    const own = key ? reads.current.edgeOf?.(key) : null
    if (!key || !own) return null
    const spots = reads.current.trackOf?.(key) ?? [{ ...own, key }]
    if (!spots.length) return { edge: own, spots: [{ ...own, key }] }
    return { edge: { left: spots[0].left, right: spots[spots.length - 1].right, top: own.top }, spots }
  }
  /** Held and slid: along its edge only, at the pointer less where it was taken, kept inside the row's pages. */
  const heldAt = (): Point | null => {
    const hold = held.current
    const box = frame.current?.getBoundingClientRect()
    const along = track()
    if (!hold?.moved || !box || !along) return null
    const { edge } = along
    return { x: leftOn(edge, (hold.pointer.x - hold.grab + WIDTH / 2 - edge.left) / Math.max(1, edge.right - edge.left)) - box.left, y: edge.top - box.top }
  }
  const paint = (): void => {
    const el = band.current
    if (!el) return
    const base = heldAt() ?? rest()
    if (!base) return void (el.dataset.lost = '')
    delete el.dataset.lost
    const x = base.x + ox.get()
    const y = base.y + oy.get()
    drawn.current = { x, y }
    el.style.transform = `translate3d(${x}px, ${y}px, 0) rotate(${rot.get()}deg)`
    el.style.height = `${len.get()}px`
    // Laid out of sight (scrolled past, above or below): the tab at the top says where, and takes you there.
    const box = frame.current?.getBoundingClientRect()
    const out = !!atNow.current && !held.current && !!box && (y + LAID < 0 || y > box.height)
    if (out !== goneNow.current) setGone((goneNow.current = out))
    const home = reads.current.homeX()
    if (awayTab.current && box && home !== null) awayTab.current.style.transform = `translate3d(calc(${home - box.left - IN_FROM_RIGHT + WIDTH}px - 100%), -2px, 0)`
  }
  const paints = useRef(paint)
  paints.current = paint

  // Every value it moves on draws it; a scroll or a resize draws it where its page is now, in the same frame.
  useEffect(() => {
    const draw = (): void => paints.current()
    const off = [ox, oy, rot, len].map((one) => one.on('change', draw))
    const box = scroller.current
    box?.addEventListener('scroll', draw, { passive: true })
    const grows = new ResizeObserver(draw)
    if (box) grows.observe(box)
    if (box?.firstElementChild) grows.observe(box.firstElementChild)
    if (frame.current) grows.observe(frame.current)
    return () => {
      off.forEach((stop) => stop())
      box?.removeEventListener('scroll', draw)
      grows.disconnect()
    }
  }, [ox, oy, rot, len, scroller, frame])

  const stopAll = (): void => {
    runs.current.forEach((one) => one.stop())
    runs.current = []
  }
  const to = (value: MotionValue<number>, target: number, spring: object): void => {
    const how = motionNow()
    if (how === 'none') return value.set(target)
    runs.current.push(animate(value, target, (how === 'fade' ? GLIDE : spring) as never))
  }
  /** From wherever it was last drawn to where it rests now: the offset is what is left, and it springs to nothing. */
  const settle = (): void => {
    stopAll()
    const from = drawn.current
    const base = rest()
    if (from && base) (ox.set(from.x - base.x), oy.set(from.y - base.y))
    to(ox, 0, SETTLE)
    to(oy, 0, SETTLE)
    to(rot, 0, SWAY)
    to(len, atNow.current ? LAID : HANG, GROW)
  }

  // Laid, moved or taken out (a click, a key, the menu, Undo): it glides there from where it was.
  useLayoutEffect(() => {
    if (held.current) return
    settle()
    paint()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [at, across, ready])

  const calm = useRef(0)
  useEffect(() => () => window.clearTimeout(calm.current), [])

  /** Let go (`keep`) or Esc: no longer held. Kept, it rests where it was let go; else it glides back where it was. */
  const release = (keep: boolean): void => {
    const hold = held.current
    if (!hold) return
    held.current = null
    window.clearTimeout(calm.current)
    setHolding(false)
    if (band.current?.hasPointerCapture(hold.id)) band.current.releasePointerCapture(hold.id)
    if (!hold.moved) return
    const along = track()
    const box = frame.current?.getBoundingClientRect()
    if (keep && along && box && drawn.current) {
      // The page under its middle (the left or the right of a row), and where along that page's edge, as a share of
      // it: it rests there at once, and the reader keeps it.
      const middle = drawn.current.x - ox.get() + box.left + WIDTH / 2
      const spot = along.spots.reduce((best, one) => (Math.max(one.left - middle, middle - one.right, 0) < Math.max(best.left - middle, middle - best.right, 0) ? one : best))
      const share = Math.max(0, Math.min(1, (middle - spot.left) / Math.max(1, spot.right - spot.left)))
      acrossNow.current = share
      atNow.current = spot.key
      settle()
      return onSlide?.(share, spot.key)
    }
    settle()
  }
  const releases = useRef(release)
  releases.current = release

  // Held, Esc puts it back where it was, and nothing else hears that Esc (the reader would close).
  useEffect(() => {
    if (!holding) return
    const key = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      releases.current(false)
    }
    window.addEventListener('keydown', key, true)
    return () => window.removeEventListener('keydown', key, true)
  }, [holding])

  const onDown = (event: React.PointerEvent<HTMLDivElement>): void => {
    if (event.button !== 0 || !band.current || !drawn.current) return
    // Taken by the ribbon alone: the pages' own pointer, a text selection and the scroller never see it.
    event.preventDefault()
    event.stopPropagation()
    band.current.setPointerCapture(event.pointerId)
    const box = frame.current!.getBoundingClientRect()
    const pointer = { x: event.clientX, y: event.clientY }
    held.current = { id: event.pointerId, grab: pointer.x - box.left - drawn.current.x, pointer, from: pointer, moved: false, vx: 0, t: performance.now() }
  }
  const onMove = (event: React.PointerEvent<HTMLDivElement>): void => {
    const hold = held.current
    if (!hold || event.pointerId !== hold.id || !atNow.current || !slides) return
    const pointer = { x: event.clientX, y: event.clientY }
    if (!hold.moved && Math.abs(pointer.x - hold.from.x) < 4) return
    if (!hold.moved) {
      // Taken up: from here it lies wherever the pointer is along its edge, held at the point it was taken by, so
      // nothing jumps; what was left of a glide when it was taken springs away. It sways about that point.
      const was = drawn.current
      const box = frame.current?.getBoundingClientRect()
      stopAll()
      ox.set(0)
      oy.set(0)
      hold.moved = true
      hold.pointer = hold.from
      const now = heldAt()
      if (was && now) (ox.set(was.x - now.x), oy.set(was.y - now.y), to(ox, 0, SETTLE), to(oy, 0, SETTLE))
      band.current!.style.transformOrigin = `${hold.grab}px ${Math.max(0, hold.from.y - (box?.top ?? 0) - (was?.y ?? 0))}px`
      setHolding(true)
    }
    const now = performance.now()
    const dt = Math.max(8, now - hold.t)
    // How fast it is carried sideways, smoothed: the ribbon swings back against it from where it is held.
    hold.vx = hold.vx * 0.6 + ((pointer.x - hold.pointer.x) / dt) * 0.4
    hold.t = now
    hold.pointer = pointer
    // Carried right, its free end trails left (a turn clockwise about the hold); held still, it swings back to hang straight.
    if (motionNow() === 'all') {
      runs.current = runs.current.filter((one) => one.state !== 'finished')
      runs.current.push(animate(rot, Math.max(-10, Math.min(10, hold.vx * 7)), SWAY as never))
      window.clearTimeout(calm.current)
      calm.current = window.setTimeout(() => held.current && runs.current.push(animate(rot, 0, SWAY as never)), 60)
    }
    paint()
  }
  const onUp = (event: React.PointerEvent<HTMLDivElement>): void => {
    const hold = held.current
    if (!hold || event.pointerId !== hold.id) return
    // The hanging tab clicked: laid where you are reading.
    if (!atNow.current) {
      held.current = null
      return event.type === 'pointerup' ? onLayHere() : undefined
    }
    // Let go, it rests there; the system taking the pointer (a cancel) puts it back.
    release(event.type !== 'pointercancel')
  }

  const shownAt = at ?? 'top'
  return (
    <div className="ribbon-layer" aria-hidden={!ready} data-ribbon-holding={holding ? '' : undefined} data-ribbon-hue={hue ?? undefined} style={ribbonInk(hue)}>
      {/* Laid out of sight: a short tab where it hangs, saying the page, that takes you there. */}
      {away && (
        <button
          ref={(node) => void ((awayTab.current = node), paint())}
          type="button"
          className="ribbon-away"
          data-ribbon-away
          data-shown={gone && ready ? '' : undefined}
          tabIndex={gone ? 0 : -1}
          title={`Go to your ribbon, ${away.label}  ⇧⌘D`}
          onClick={away.go}
        >
          <span className="ribbon-away-satin" aria-hidden />
          <span className="ribbon-away-label">{away.label}</span>
        </button>
      )}
      <div
        ref={band}
        className="ribbon"
        data-ribbon={holding ? 'held' : at ? 'laid' : 'hanging'}
        data-ribbon-at={shownAt}
        data-gone={gone ? '' : undefined}
        data-slides={at && slides ? '' : undefined}
        data-unseen={ready ? undefined : ''}
        role="button"
        aria-label={at ? (slides ? 'Your ribbon: drag it along the top of its page' : 'Your ribbon') : 'Your ribbon: lay it where you are reading'}
        title={
          holding
            ? undefined
            : at
              ? slides
                ? 'Your ribbon. Drag it along the top of the page; right-click it for its colour, or to take it out'
                : 'Your ribbon. Right-click another paragraph to lay it there, or to take it out'
              : 'Your ribbon. Click to lay it where you are reading, or right-click a page  ⌘D'
        }
        style={{ width: WIDTH }}
        onPointerEnter={() => !held.current && !atNow.current && to(len, HANG_NEAR, GROW)}
        onPointerLeave={() => !held.current && !atNow.current && to(len, HANG, GROW)}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onLostPointerCapture={(event) => held.current && onUp(event)}
        onContextMenu={(event) => {
          if (!onMenu || !atNow.current) return
          event.preventDefault()
          event.stopPropagation()
          onMenu(event)
        }}
      >
        <span className="ribbon-satin" />
      </div>
    </div>
  )
}

/**
 * The page kept as you read, when it is further on than the ribbon: one quiet line over the foot of the pages, with
 * a way to go there. It fades in and out; nothing under it moves. `words` null: no line.
 */
export function ReadOnLine({ words, onGo, onClose }: { words: string | null; onGo: () => void; onClose: () => void }): React.JSX.Element {
  const fade = motionNow() === 'none' ? { duration: 0 } : { duration: 0.2, ease: EASE }
  return (
    <AnimatePresence>
      {words && (
        <motion.div className="ribbon-read-on" role="status" data-ribbon-read-on initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={fade}>
          <span className="ribbon-read-on-mark" aria-hidden />
          <span>{words}</span>
          <button type="button" className="ribbon-read-on-go" data-ribbon-read-on-go onClick={onGo}>
            Go there
          </button>
          <button type="button" className="ribbon-read-on-close" aria-label="Close" title="Close" onClick={onClose}>
            <X className="size-3.5" />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
