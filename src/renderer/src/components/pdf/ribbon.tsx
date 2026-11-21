import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, animate, motion, useMotionValue, type AnimationPlaybackControls, type MotionValue } from 'motion/react'
import { X } from 'lucide-react'
import { EASE, motionNow } from '@/lib/motion'
import { call } from '@/lib/haligtree'
import { hueVar, type Hue } from '@/lib/books'
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'

/** The paint for a ribbon in a hue (pdf.css [data-ribbon-hue]): its own deep red when it has none. */
export const ribbonInk = (hue: Hue | null | undefined): Record<string, string> | undefined => (hue ? { '--ribbon-hue': hueVar(hue) } : undefined)

/**
 * The ribbon: a book's one sewn marker, laid where you mean to come back to, as a planner's satin ribbon lies between
 * its pages. It hangs from the top edge of the reader as a short tab; a click on it, ⌘D, or "Lay the ribbon here" on a
 * page's right-click menu lays it across the top of that page (pdf-reader.tsx), or beside a paragraph of an article
 * (web-reader.tsx). Laid on a PDF's page it comes out of that page's own top edge, standing a few px above it as a
 * ribbon comes out of the top of a book, and lies down over the page. It is drawn inside the pages' own box, in its
 * page's coordinates, so it moves, scales and scrolls with its page in every frame of a pinch, a zoom step, Fit, a
 * spread or a resize. It slides sideways along that edge (in two pages, across its row onto the other page), 1:1 with
 * the pointer, swaying from where it is held; never to another row (the user, 21 Nov 2026: dragging it from page to
 * page "is buggy"; the menu and ⌘D say exactly which page). A click on it opens its own small menu.
 *
 * Its place is always worked out from where it rests now plus an offset that springs to nothing, so it never jumps:
 * laid from the hanging tab, it glides down from where the tab was.
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
/** How far a laid ribbon stands above its page's top edge, coming out of the top of the book. */
export const OVERHANG = 6

/** The give when it settles: the app's quick drop (focus-pill.tsx DROP), a touch softer, so it overshoots a little. */
const SETTLE = { type: 'spring', stiffness: 420, damping: 26, mass: 1 } as const
/** Its length, as the focus pill grows (focus-pill.tsx SPRING). */
const GROW = { type: 'spring', stiffness: 152, damping: 17.8, mass: 1 } as const
/** The sway, held and let go: a loose pendulum that comes to rest in a swing or two. */
const SWAY = { type: 'spring', stiffness: 260, damping: 11, mass: 1 } as const
/** Reduce motion: a plain glide, no sway and no give. */
const GLIDE = { duration: 0.2, ease: EASE } as const

type Point = { x: number; y: number }
/** A spot's top edge, in the pages' own box (unscaled): its left and right, and its top. */
export type RibbonEdge = { left: number; right: number; top: number }
/** A spot it can be slid onto, along the same top edge (the other page of a spread's row). */
export type RibbonTrackSpot = RibbonEdge & { key: string }

export function Ribbon({
  frame,
  scroller,
  at,
  across = null,
  hue = null,
  host,
  edgeOf,
  trackOf,
  placeOf,
  homeX,
  ready,
  onSlide,
  onLayHere,
  menu,
  onMenuOpen,
  away
}: {
  /** The box the hanging tab hangs in (not scrolled): the reader's pages and their scroller fill it. */
  frame: RefObject<HTMLElement | null>
  scroller: RefObject<HTMLElement | null>
  /** The spot it is laid at, or null when it hangs. */
  at: string | null
  /** Where along its spot's edge it lies, a share of the edge (null: near the right). Only with `edgeOf`. */
  across?: number | null
  /** Its colour, one of a book's: null for its own deep red. */
  hue?: Hue | null
  /** The pages' own box (a PDF's): a laid ribbon is drawn inside it, so it scales and scrolls with the pages. */
  host?: () => HTMLElement | null
  /** The top edge of a spot in `host`'s own coordinates: given with `onSlide`, a laid ribbon slides along it. */
  edgeOf?: (key: string) => RibbonEdge | null
  /** The spots along the same edge, left to right, it can be slid across (a spread's row): just its own if not given. */
  trackOf?: (key: string) => RibbonTrackSpot[]
  /** Where its top left sits on screen when laid at `key`, for spots it does not slide on (an article's), drawn in the frame. */
  placeOf?: (key: string) => Point | null
  /** Where the tab hangs across, on screen. */
  homeX: () => number | null
  /** The book is drawn: until then the ribbon is not shown. */
  ready: boolean
  /** Slid along its edge and let go there: the share of the spot's edge it now lies at, and the spot. */
  onSlide?: (across: number, key: string) => void
  /** The hanging tab clicked: laid where you are reading. */
  onLayHere: () => void
  /** A laid ribbon clicked or right-clicked: the rows of its own small menu (its colour, taking it out). */
  menu?: ReactNode
  onMenuOpen?: (open: boolean) => void
  /** Laid out of sight: what the tab at the top says ("p. 95"), and going there. */
  away?: { label: string; go: () => void }
}): React.JSX.Element {
  const tab = useRef<HTMLDivElement>(null)
  const band = useRef<HTMLDivElement>(null)
  const ox = useMotionValue(0)
  const oy = useMotionValue(0)
  const rot = useMotionValue(0)
  const tabLen = useMotionValue(HANG)
  const len = useMotionValue(LAID)
  /** Held: the pointer, and how far in from the ribbon's left it took hold (in its own room). */
  const held = useRef<{ id: number; grab: number; pointer: Point; from: Point; moved: boolean; vx: number; t: number } | null>(null)
  const [holding, setHolding] = useState(false)
  const runs = useRef<AnimationPlaybackControls[]>([])
  /** Where the laid ribbon was last drawn, in its own room: the start of every glide. */
  const drawn = useRef<Point | null>(null)
  /** Where the hanging tab was last drawn, on screen: a ribbon laid from it glides down from there. */
  const tabScreen = useRef<Point | null>(null)
  const atNow = useRef(at)
  atNow.current = at
  /** Where along its edge it lies: set the moment it is let go, so it rests there before the reader has kept it. */
  const acrossNow = useRef(across)
  useLayoutEffect(() => void (acrossNow.current = across), [across, at])
  const reads = useRef({ placeOf, edgeOf, trackOf, homeX })
  reads.current = { placeOf, edgeOf, trackOf, homeX }
  const slides = !!edgeOf && !!onSlide
  // The pages' box, read again each time the reader draws (a book opened afresh makes a new one).
  const [hostEl, setHostEl] = useState<HTMLElement | null>(null)
  useLayoutEffect(() => {
    const now = host?.() ?? null
    if (now !== hostEl) setHostEl(now)
  })
  const inHost = !!hostEl && !!edgeOf
  const [gone, setGone] = useState(false)
  const [menuAt, setMenuAt] = useState<Point | null>(null)

  /** The laid ribbon's own room: the pages' box (its unscaled px, and how much a pinch scales it now), or the frame. */
  const room = (): { left: number; top: number; scale: number } | null => {
    if (inHost && hostEl) {
      const r = hostEl.getBoundingClientRect()
      return { left: r.left, top: r.top, scale: hostEl.offsetWidth ? r.width / hostEl.offsetWidth : 1 }
    }
    const r = frame.current?.getBoundingClientRect()
    return r ? { left: r.left, top: r.top, scale: 1 } : null
  }
  const toRoom = (p: Point): Point | null => {
    const r = room()
    return r && { x: (p.x - r.left) / r.scale, y: (p.y - r.top) / r.scale }
  }

  /** The left of a laid ribbon on its edge: at its share of it, never closer than INSET to either side. */
  const leftOn = (edge: RibbonEdge, share: number | null): number => {
    const low = edge.left + INSET
    const high = Math.max(low, edge.right - INSET - WIDTH)
    const x = share === null ? edge.right - IN_FROM_RIGHT : edge.left + share * (edge.right - edge.left) - WIDTH / 2
    return Math.max(low, Math.min(high, x))
  }
  /** Where the laid ribbon rests now, in its room: out of its page's top edge, or beside its paragraph. */
  const rest = (): Point | null => {
    const key = atNow.current
    if (!key) return null
    if (inHost) {
      const edge = reads.current.edgeOf?.(key)
      return edge ? { x: leftOn(edge, acrossNow.current), y: edge.top - OVERHANG } : null
    }
    const spot = reads.current.placeOf?.(key)
    return spot ? toRoom(spot) : null
  }
  /** The edge it can be slid along: its own page's, or its whole row's in a spread, and the spots on it. */
  const track = (): { edge: RibbonEdge; spots: RibbonTrackSpot[] } | null => {
    const key = atNow.current
    const own = key && inHost ? reads.current.edgeOf?.(key) : null
    if (!key || !own) return null
    const spots = reads.current.trackOf?.(key) ?? []
    if (!spots.length) return { edge: own, spots: [{ ...own, key }] }
    return { edge: { left: spots[0].left, right: spots[spots.length - 1].right, top: own.top }, spots }
  }
  /** Held and slid: along its edge only, at the pointer less where it was taken, kept inside the row's pages. */
  const heldAt = (): Point | null => {
    const hold = held.current
    const along = track()
    const p = hold && toRoom(hold.pointer)
    if (!hold?.moved || !along || !p) return null
    const { edge } = along
    return { x: leftOn(edge, (p.x - hold.grab + WIDTH / 2 - edge.left) / Math.max(1, edge.right - edge.left)), y: edge.top - OVERHANG }
  }
  const paint = (): void => {
    // The hanging tab, at the top of the frame.
    const box = frame.current?.getBoundingClientRect()
    const home = reads.current.homeX()
    if (tab.current && box && home !== null) {
      const x = home - box.left - IN_FROM_RIGHT
      tab.current.style.transform = `translate3d(${x}px, -2px, 0)`
      tab.current.style.height = `${tabLen.get()}px`
      tabScreen.current = { x: box.left + x, y: box.top - 2 }
    }
    // The laid ribbon, in its room.
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
  }
  const paints = useRef(paint)
  paints.current = paint

  // Every value it moves on draws it; a scroll, a zoom, a spread or a resize draws it where its page is now.
  useEffect(() => {
    const draw = (): void => paints.current()
    const off = [ox, oy, rot, len, tabLen].map((one) => one.on('change', draw))
    const box = scroller.current
    box?.addEventListener('scroll', draw, { passive: true })
    const grows = new ResizeObserver(draw)
    if (box) grows.observe(box)
    if (hostEl) grows.observe(hostEl)
    else if (box?.firstElementChild) grows.observe(box.firstElementChild)
    if (frame.current) grows.observe(frame.current)
    return () => {
      off.forEach((stop) => stop())
      box?.removeEventListener('scroll', draw)
      grows.disconnect()
    }
  }, [ox, oy, rot, len, tabLen, scroller, frame, hostEl])

  // Laid in the pages and scrolled out of sight: the tab at the top says where it is.
  useEffect(() => {
    const el = band.current
    const root = scroller.current
    if (!el || !root || !inHost || !at) return void setGone(false)
    const watch = new IntersectionObserver(([one]) => setGone(!one.isIntersecting), { root })
    watch.observe(el)
    return () => watch.disconnect()
  }, [inHost, at, scroller, hostEl])

  const stopAll = (): void => {
    runs.current.forEach((one) => one.stop())
    runs.current = []
  }
  const to = (value: MotionValue<number>, target: number, spring: object): void => {
    const how = motionNow()
    if (how === 'none') return value.set(target)
    runs.current.push(animate(value, target, (how === 'fade' ? GLIDE : spring) as never))
  }
  /** From `from` (in its room) to where it rests now: the offset is what is left, and it springs to nothing. */
  const settle = (from: Point | null = drawn.current): void => {
    stopAll()
    const base = rest()
    if (from && base) (ox.set(from.x - base.x), oy.set(from.y - base.y))
    to(ox, 0, SETTLE)
    to(oy, 0, SETTLE)
    to(rot, 0, SWAY)
  }

  // Laid, moved or taken out (a click, a key, the menu, Undo): it glides there from where it was. Laid from the
  // hanging tab, it glides down from where the tab was, growing to its length.
  const wasAt = useRef<string | null>(null)
  const wasReady = useRef(false)
  useLayoutEffect(() => {
    if (held.current) return
    const from = wasAt.current
    const shown = wasReady.current
    wasAt.current = at
    wasReady.current = ready
    // Found laid as the book opens: simply there, where it lies.
    if (at && !shown) settle(null)
    else if (at && !from) {
      const tabAt = tabScreen.current && toRoom(tabScreen.current)
      len.set(HANG)
      settle(tabAt)
      to(len, LAID, GROW)
    } else if (at) settle()
    paint()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [at, across, ready, hostEl])

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
    if (keep && along && drawn.current) {
      // The page under its middle (the left or the right of a row), and where along that page's edge, as a share of
      // it: it rests there at once, and the reader keeps it.
      const middle = drawn.current.x - ox.get() + WIDTH / 2
      const off = (one: RibbonEdge): number => Math.max(one.left - middle, middle - one.right, 0)
      const spot = along.spots.reduce((best, one) => (off(one) < off(best) ? one : best))
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

  /** Its own small menu, opened where it was clicked. */
  const openMenu = (p: Point): void => {
    const box = frame.current?.getBoundingClientRect()
    if (!menu || !box) return
    setMenuAt({ x: p.x - box.left, y: p.y - box.top })
    onMenuOpen?.(true)
  }

  const onDown = (event: React.PointerEvent<HTMLDivElement>): void => {
    if (event.button !== 0 || !band.current || !drawn.current) return
    // Taken by the ribbon alone: the pages' own pointer, a text selection and the scroller never see it.
    event.preventDefault()
    event.stopPropagation()
    band.current.setPointerCapture(event.pointerId)
    const pointer = { x: event.clientX, y: event.clientY }
    const p = toRoom(pointer)
    held.current = { id: event.pointerId, grab: p ? p.x - drawn.current.x : WIDTH / 2, pointer, from: pointer, moved: false, vx: 0, t: performance.now() }
  }
  const onMove = (event: React.PointerEvent<HTMLDivElement>): void => {
    const hold = held.current
    if (!hold || event.pointerId !== hold.id || !slides || !inHost) return
    const pointer = { x: event.clientX, y: event.clientY }
    if (!hold.moved && Math.abs(pointer.x - hold.from.x) < 4) return
    if (!hold.moved) {
      // Taken up: from here it lies wherever the pointer is along its edge, held at the point it was taken by, so
      // nothing jumps; what was left of a glide when it was taken springs away. It sways about that point.
      const was = drawn.current
      stopAll()
      ox.set(0)
      oy.set(0)
      hold.moved = true
      hold.pointer = hold.from
      const now = heldAt()
      if (was && now) (ox.set(was.x - now.x), oy.set(was.y - now.y), to(ox, 0, SETTLE), to(oy, 0, SETTLE))
      const from = toRoom(hold.from)
      band.current!.style.transformOrigin = `${hold.grab}px ${Math.max(0, (from?.y ?? 0) - (was?.y ?? 0))}px`
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
    // A click, no slide: its own menu, right there.
    if (!hold.moved) {
      release(false)
      return event.type === 'pointerup' ? openMenu({ x: event.clientX, y: event.clientY }) : undefined
    }
    // Let go, it rests there; the system taking the pointer (a cancel) puts it back.
    release(event.type !== 'pointercancel')
  }

  const laid = at && (
    <div
      ref={(node) => void ((band.current = node), node && paint())}
      className="ribbon"
      data-ribbon={holding ? 'held' : 'laid'}
      data-ribbon-at={at}
      data-in-page={inHost ? '' : undefined}
      data-slides={slides && inHost ? '' : undefined}
      data-menu={menu ? '' : undefined}
      data-unseen={ready ? undefined : ''}
      data-ribbon-hue={hue ?? undefined}
      role="button"
      aria-haspopup="menu"
      aria-label={slides ? 'Your ribbon: drag it along the top of its page, or click for its menu' : 'Your ribbon: click for its menu'}
      title={holding ? undefined : slides ? 'Your ribbon. Drag it along the top of the page; click it for its colour, or to take it out' : 'Your ribbon. Click it for its colour, or to take it out'}
      style={{ width: WIDTH, ...ribbonInk(hue) }}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      onLostPointerCapture={(event) => held.current && onUp(event)}
      onContextMenu={(event) => {
        event.preventDefault()
        event.stopPropagation()
        openMenu({ x: event.clientX, y: event.clientY })
      }}
    >
      <span className="ribbon-satin" />
    </div>
  )
  const tabState = !at ? 'hanging' : gone && away ? 'away' : 'hidden'
  return (
    <div className="ribbon-layer" aria-hidden={!ready} data-ribbon-holding={holding ? '' : undefined} data-ribbon-hue={hue ?? undefined} style={ribbonInk(hue)}>
      {/* Hanging, the tab at the top of the pages; laid out of sight, the same tab with the page it lies on beside it. */}
      <div
        ref={(node) => void ((tab.current = node), node && paint())}
        className="ribbon ribbon-tab"
        data-ribbon={tabState}
        data-ribbon-away={tabState === 'away' ? '' : undefined}
        data-unseen={ready ? undefined : ''}
        role="button"
        tabIndex={tabState === 'hidden' ? -1 : 0}
        aria-label={tabState === 'away' ? `Go to your ribbon, ${away?.label}` : 'Your ribbon: lay it where you are reading'}
        title={tabState === 'away' ? `Go to your ribbon, ${away?.label}  ⇧⌘D` : 'Your ribbon. Click to lay it where you are reading, or right-click a page  ⌘D'}
        style={{ width: WIDTH }}
        onPointerEnter={() => tabState === 'hanging' && to(tabLen, HANG_NEAR, GROW)}
        onPointerLeave={() => to(tabLen, HANG, GROW)}
        onClick={() => (tabState === 'hanging' ? onLayHere() : tabState === 'away' ? away?.go() : undefined)}
      >
        <span className="ribbon-satin" />
        {away && <span className="ribbon-away-label">{away.label}</span>}
      </div>
      {laid && (inHost && hostEl ? createPortal(laid, hostEl) : laid)}
      {menu && (
        <DropdownMenu open={!!menuAt} onOpenChange={(open) => void (!open && (setMenuAt(null), onMenuOpen?.(false)))}>
          <DropdownMenuTrigger asChild>
            <span aria-hidden className="ribbon-menu-at" style={{ transform: `translate(${menuAt?.x ?? 0}px, ${menuAt?.y ?? 0}px)` }} />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" sideOffset={4} data-ribbon-menu className="w-56">
            {menu}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
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
