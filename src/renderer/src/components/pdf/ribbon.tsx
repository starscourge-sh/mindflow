import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react'
import { AnimatePresence, animate, motion, useMotionValue, type AnimationPlaybackControls, type MotionValue } from 'motion/react'
import { X } from 'lucide-react'
import { EASE, motionNow } from '@/lib/motion'
import { call } from '@/lib/haligtree'

/**
 * The ribbon: a book's one sewn marker, laid by hand where you mean to come back to, as a planner's satin ribbon lies
 * between its pages. It hangs from the top edge of the reader as a short tab; dragged, it follows the pointer and
 * sways from where it is held; let go over a page (or a paragraph of an article) it settles there with a small give.
 * Opening the book, the ribbon wins over the page kept as you read (pdf-reader.tsx, web-reader.tsx).
 *
 * The ribbon is one element for its whole life, hanging, held and laid: its place is always worked out from where it
 * rests now plus an offset that springs to nothing, so it never jumps from one state to the next, and a scroll moves a
 * laid ribbon with its page in the same frame.
 */

/** A book's ribbon as the store keeps it (main/pdf-highlights.ts): a PDF's by page, an article's by paragraph. */
export type RibbonPlace = { page: number; block: number | null; words: string | null }

export const readRibbon = (src: string): Promise<RibbonPlace | null> => call<RibbonPlace | null>('ribbon:get', src)
export const keepRibbon = (src: string, place: RibbonPlace | null): Promise<boolean> => call<boolean>('ribbon:lay', src, place)

/** Somewhere the ribbon can lie, as the reader names it: its key, and the words a pointer over it shows ("p. 3"). */
export type RibbonSpot = { key: string; label: string }

/** How wide the satin is, and how long it shows hanging, hovered, and laid on a page. */
const WIDTH = 14
const HANG = 30
const HANG_NEAR = 40
const LAID = 92
/** The tab's distance in from the right of the pages, hanging. */
const IN_FROM_RIGHT = 44

/** The give when it settles: the app's quick drop (focus-pill.tsx DROP), a touch softer, so it overshoots a little. */
const SETTLE = { type: 'spring', stiffness: 420, damping: 26, mass: 1 } as const
/** Its length, as the focus pill grows (focus-pill.tsx SPRING). */
const GROW = { type: 'spring', stiffness: 152, damping: 17.8, mass: 1 } as const
/** The sway, held and let go: a loose pendulum that comes to rest in a swing or two. */
const SWAY = { type: 'spring', stiffness: 260, damping: 11, mass: 1 } as const
/** Reduce motion: a plain glide, no sway and no give. */
const GLIDE = { duration: 0.2, ease: EASE } as const

type Point = { x: number; y: number }

export function Ribbon({
  frame,
  scroller,
  at,
  placeOf,
  spotAt,
  homeX,
  ready,
  onLay,
  onLayHere
}: {
  /** The box the ribbon hangs in (not scrolled): the reader's pages and their scroller fill it. */
  frame: RefObject<HTMLElement | null>
  scroller: RefObject<HTMLElement | null>
  /** The spot it is laid at, or null when it hangs. */
  at: string | null
  /** Where the ribbon's top left sits on screen when laid at `key`, or null while that spot is not drawn yet. */
  placeOf: (key: string) => Point | null
  /** The spot under a point on screen, or null where there is none. */
  spotAt: (x: number, y: number) => RibbonSpot | null
  /** Where the tab hangs across, on screen. */
  homeX: () => number | null
  /** The book is drawn: until then the ribbon is not shown. */
  ready: boolean
  /** Laid at a spot by a drag, or taken out (null) by dragging it back up. */
  onLay: (key: string | null) => void
  /** The hanging tab clicked: laid where you are reading. */
  onLayHere: () => void
}): React.JSX.Element {
  const layer = useRef<HTMLDivElement>(null)
  const band = useRef<HTMLDivElement>(null)
  const tip = useRef<HTMLDivElement>(null)
  const ox = useMotionValue(0)
  const oy = useMotionValue(0)
  const rot = useMotionValue(0)
  const len = useMotionValue(at ? LAID : HANG)
  /** Held: the pointer, and where on the ribbon it took hold. */
  const held = useRef<{ id: number; grab: Point; pointer: Point; from: Point; moved: boolean; vx: number; t: number } | null>(null)
  const [holding, setHolding] = useState(false)
  const [over, setOver] = useState<(RibbonSpot & { y: number }) | null>(null)
  const runs = useRef<AnimationPlaybackControls[]>([])
  /** Where it was last drawn, in the frame's own room: the start of every glide. */
  const drawn = useRef<Point | null>(null)
  const atNow = useRef(at)
  atNow.current = at
  const reads = useRef({ placeOf, homeX })
  reads.current = { placeOf, homeX }

  /** Where it rests now, in the frame's room: laid on its spot, or hanging at the top. */
  const rest = (): Point | null => {
    const box = frame.current?.getBoundingClientRect()
    if (!box) return null
    const key = atNow.current
    if (key) {
      const spot = reads.current.placeOf(key)
      return spot && { x: spot.x - box.left, y: spot.y - box.top }
    }
    const x = reads.current.homeX()
    return x === null ? null : { x: x - box.left - IN_FROM_RIGHT, y: -2 }
  }
  const paint = (): void => {
    const el = band.current
    const box = frame.current?.getBoundingClientRect()
    if (!el || !box) return
    const hold = held.current
    const base = hold?.moved ? { x: hold.pointer.x - box.left - hold.grab.x, y: hold.pointer.y - box.top - hold.grab.y } : rest()
    if (!base) return void (el.dataset.lost = '')
    delete el.dataset.lost
    const x = base.x + ox.get()
    const y = base.y + oy.get()
    drawn.current = { x, y }
    el.style.transform = `translate3d(${x}px, ${y}px, 0) rotate(${rot.get()}deg)`
    el.style.height = `${len.get()}px`
    // The page it would lie on, said beside the held end.
    if (tip.current) tip.current.style.transform = `translate3d(${x + WIDTH + 10}px, ${y + 8}px, 0)`
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

  // Laid, moved or taken out (a drag, a key, the menu, Undo): it glides there from where it was.
  useLayoutEffect(() => {
    if (held.current) return
    settle()
    paint()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [at, ready])

  /** Where the held ribbon would lie if let go now: read at its end (the cut tip), as a real ribbon falls where its end lies. */
  const spotUnder = (pointer: Point): (RibbonSpot & { y: number }) | null => {
    const box = frame.current?.getBoundingClientRect()
    if (!box || pointer.y < box.top + 24 || pointer.y > box.bottom || pointer.x < box.left || pointer.x > box.right) return null
    const end = drawn.current ? box.top + drawn.current.y + len.get() : pointer.y
    const spot = spotAt(pointer.x, Math.min(end, box.bottom))
    if (!spot) return null
    const place = placeOf(spot.key)
    return place ? { ...spot, y: place.y - box.top } : null
  }

  // Held near the top or the foot of the pages, they scroll under it, so a far page can be reached in one drag.
  const edgeRun = useRef(0)
  const calm = useRef(0)
  const edgeScroll = (): void => {
    cancelAnimationFrame(edgeRun.current)
    const step = (): void => {
      const hold = held.current
      const box = frame.current?.getBoundingClientRect()
      const pages = scroller.current
      if (!hold?.moved || !box || !pages) return
      const near = hold.pointer.y - box.top < 48 && hold.pointer.y - box.top > 24 ? -1 : box.bottom - hold.pointer.y < 48 ? 1 : 0
      if (!near) return
      pages.scrollTop += near * 10
      setOver(spotUnder(hold.pointer))
      edgeRun.current = requestAnimationFrame(step)
    }
    edgeRun.current = requestAnimationFrame(step)
  }
  useEffect(() => () => (cancelAnimationFrame(edgeRun.current), window.clearTimeout(calm.current)), [])

  const onDown = (event: React.PointerEvent<HTMLDivElement>): void => {
    if (event.button !== 0 || !band.current || !drawn.current) return
    event.preventDefault()
    event.stopPropagation()
    band.current.setPointerCapture(event.pointerId)
    stopAll()
    const box = frame.current!.getBoundingClientRect()
    const pointer = { x: event.clientX, y: event.clientY }
    held.current = { id: event.pointerId, grab: { x: pointer.x - box.left - drawn.current.x, y: pointer.y - box.top - drawn.current.y }, pointer, from: pointer, moved: false, vx: 0, t: performance.now() }
  }
  const onMove = (event: React.PointerEvent<HTMLDivElement>): void => {
    const hold = held.current
    if (!hold || event.pointerId !== hold.id) return
    const pointer = { x: event.clientX, y: event.clientY }
    if (!hold.moved && Math.hypot(pointer.x - hold.from.x, pointer.y - hold.from.y) < 4) return
    if (!hold.moved) {
      // Picked up: from here it is wherever the pointer is, held at the point it was taken by (measured as it was
      // drawn, offsets and all), so nothing jumps; it sways about that point.
      ox.set(0)
      oy.set(0)
      band.current!.style.transformOrigin = `${hold.grab.x}px ${hold.grab.y}px`
      hold.moved = true
      setHolding(true)
      to(len, LAID, GROW)
      edgeScroll()
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
      runs.current.push(animate(rot, Math.max(-12, Math.min(12, hold.vx * 9)), SWAY as never))
      window.clearTimeout(calm.current)
      calm.current = window.setTimeout(() => held.current && runs.current.push(animate(rot, 0, SWAY as never)), 60)
    }
    paint()
    setOver(spotUnder(pointer))
    edgeScroll()
  }
  const onUp = (event: React.PointerEvent<HTMLDivElement>): void => {
    const hold = held.current
    if (!hold || event.pointerId !== hold.id) return
    held.current = null
    cancelAnimationFrame(edgeRun.current)
    window.clearTimeout(calm.current)
    setHolding(false)
    setOver(null)
    if (!hold.moved) return atNow.current ? undefined : onLayHere()
    const spot = spotUnder({ x: event.clientX, y: event.clientY })
    // Back to where it rests (the spot it had, or the top) until the reader says where it is now: then it glides on.
    settle()
    if (spot) {
      // Its spot not wholly on screen: the pages glide to show it, and the ribbon with them (it is drawn from its spot).
      const box = frame.current?.getBoundingClientRect()
      const place = placeOf(spot.key)
      if (box && place && (place.y < box.top + 8 || place.y + LAID > box.bottom - 8))
        scroller.current?.scrollBy({ top: place.y - box.top - box.height / 3, behavior: motionNow() === 'all' ? 'smooth' : 'auto' })
      return spot.key === atNow.current ? undefined : onLay(spot.key)
    }
    if (atNow.current) onLay(null)
  }

  const shownAt = at ?? 'top'
  return (
    <div ref={layer} className="ribbon-layer" aria-hidden={!ready} data-ribbon-holding={holding ? '' : undefined}>
      {over && (
        <>
          <div className="ribbon-guide" style={{ transform: `translateY(${over.y + 14}px)` }} />
          <div ref={(node) => void ((tip.current = node), paint())} className="ribbon-tip" data-ribbon-tip>
            {over.label}
          </div>
        </>
      )}
      <div
        ref={band}
        className="ribbon"
        data-ribbon={holding ? 'held' : at ? 'laid' : 'hanging'}
        data-ribbon-at={shownAt}
        data-unseen={ready ? undefined : ''}
        role="button"
        aria-label={at ? 'Your ribbon: drag it to another page, or up and out' : 'Your ribbon: drag it onto a page to keep your place'}
        title={holding ? undefined : at ? 'Your ribbon. Drag it to move it, or up to the top to take it out' : 'Your ribbon. Drag it onto a page, or click to lay it here  ⌘D'}
        style={{ width: WIDTH }}
        onPointerEnter={() => !held.current && !atNow.current && to(len, HANG_NEAR, GROW)}
        onPointerLeave={() => !held.current && !atNow.current && to(len, HANG, GROW)}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onLostPointerCapture={(event) => held.current && onUp(event)}
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
