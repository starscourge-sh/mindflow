import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, animate, motion, useMotionValue, type AnimationPlaybackControls, type MotionValue } from 'motion/react'
import { X } from 'lucide-react'
import { EASE, motionNow } from '@/lib/motion'
import { call } from '@/lib/haligtree'
import { detent } from '@/lib/haptics'
import { HUES, hueName, hueVar, type Hue } from '@/lib/books'
import { Swatch } from '@/components/haligtree/row-menu'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'

/** The paint for a ribbon in a hue (pdf.css [data-ribbon-hue]): its own deep red when it has none. */
export const ribbonInk = (hue: Hue | null | undefined): Record<string, string> | undefined => (hue ? { '--ribbon-hue': hueVar(hue) } : undefined)

/**
 * The ribbon: a book's one sewn marker, laid where you mean to come back to, as a planner's satin ribbon lies between
 * its pages. It hangs from the top edge of the reader as a short tab; a click on it, ⌘D, or "Lay the ribbon here" on a
 * page's right-click menu lays it across the top of that page (pdf-reader.tsx), or beside a paragraph of an article
 * (web-reader.tsx). Laid on a PDF's page it comes out of that page's own top edge, standing a few px above it as a
 * ribbon comes out of the top of a book, and lies down over the page. It is drawn inside the pages' own box, in its
 * page's coordinates, so it moves, scales and scrolls with its page in every frame of a pinch, a zoom step, Fit, a
 * spread or a resize.
 *
 * Picked up (the laid ribbon, or the hanging tab), it is carried anywhere over the pages, 1:1 with the pointer, swaying
 * from where it is held. The page under its top end is where it will lie (in two pages, the left or the right one, by x
 * and y alike): a "p. N" chip beside it says which, and each new page under it is felt as a tap on the trackpad. Held
 * near the top or the foot of the view, the pages scroll under it. Let go, it lies on that page's top edge where it was
 * let go; Esc glides it back. A click on it opens its own small menu.
 *
 * Laid out of sight, a small pill in the desk beside the pages says where ("p. 92 ↓" at the foot when it lies further
 * on, "p. 40 ↑" at the top when before), never over a page's words; a click glides there, and it fades as the ribbon
 * comes into view. Gone to by any way ("Go to it", ⇧⌘D, the menus, the pill), it gives a small elastic bounce once the
 * pages come to rest.
 *
 * Its place is always worked out from where it rests now plus an offset that springs to nothing, so it never jumps:
 * laid from the hanging tab, it glides down from where the tab was.
 */

/** A book's ribbon as the store keeps it (main/pdf-highlights.ts): a PDF's by page, an article's by paragraph.
 *  `across`: where along its page's top edge it lies, as a share of the page's width (null: near the right edge). */
export type RibbonPlace = { page: number; block: number | null; words: string | null; across?: number | null; hue?: Hue | null }

export const readRibbon = (src: string): Promise<RibbonPlace | null> => call<RibbonPlace | null>('ribbon:get', src)
export const keepRibbon = (src: string, place: RibbonPlace | null): Promise<boolean> => call<boolean>('ribbon:lay', src, place)

/** How wide the satin is, and how long it shows hanging, hovered, and laid on a page (the user, 21 Nov: 138 was "too
 *  long"; still clearly a ribbon, not a tab). */
const WIDTH = 22
const HANG = 30
const HANG_NEAR = 38
const LAID = 84
/** The tab's distance in from the right of the pages, hanging. */
const IN_FROM_RIGHT = 64
/** A laid ribbon not yet slid: this share of its page's width along the top edge, near the right. */
const NEAR_RIGHT = 0.9
/** Slid, it stays this far in from either side of its page. */
const INSET = 14
/** How far a laid ribbon stands above its page's top edge, coming out of the top of the book. */
export const OVERHANG = 6
/** Held this near the top or the foot of the view, the pages scroll under it, faster the nearer; at most this fast. */
const EDGE_ZONE = 64
const EDGE_SPEED = 22

/** The give when it settles: the app's quick drop (focus-pill.tsx DROP), a touch softer, so it overshoots a little. */
const SETTLE = { type: 'spring', stiffness: 420, damping: 26, mass: 1 } as const
/** Its length, as the focus pill grows (focus-pill.tsx SPRING). */
const GROW = { type: 'spring', stiffness: 152, damping: 17.8, mass: 1 } as const
/** The sway, held and let go: a loose pendulum that comes to rest in a swing or two. */
const SWAY = { type: 'spring', stiffness: 260, damping: 11, mass: 1 } as const
/** Gone to: it stretches down from its top, then springs back with a wobble or two (about 500 ms in all). */
const STRETCH = { duration: 0.11, ease: EASE } as const
const BOUNCE = { type: 'spring', stiffness: 520, damping: 13, mass: 1 } as const
/** Reduce motion: a plain glide, no sway and no give. */
const GLIDE = { duration: 0.2, ease: EASE } as const

type Point = { x: number; y: number }
/** A spot's top edge, in the pages' own box (unscaled): its left and right, and its top. */
export type RibbonEdge = { left: number; right: number; top: number }
/** A spot it can be laid on: a page's top edge and its key. */
export type RibbonSpot = RibbonEdge & { key: string }
type Side = 'up' | 'down'

export function Ribbon({
  frame,
  scroller,
  at,
  across = null,
  hue = null,
  host,
  edgeOf,
  spotAt,
  nameOf,
  desk,
  placeOf,
  homeX,
  ready,
  onSlide,
  onLayHere,
  menu,
  onMenuOpen,
  away,
  bounce = 0
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
  /** The top edge of a spot in `host`'s own coordinates. */
  edgeOf?: (key: string) => RibbonEdge | null
  /** The spot under a point of `host`'s own coordinates (the nearest, between pages): given with `onSlide`, it is carried. */
  spotAt?: (x: number, y: number) => RibbonSpot | null
  /** What the chip says while it is carried over a spot ("p. 92"). */
  nameOf?: (key: string) => string
  /** The pages' column on screen where you are reading, its left and right: the out-of-sight pill sits beside it. */
  desk?: () => { left: number; right: number } | null
  /** Where its top left sits on screen when laid at `key`, for spots it does not slide on (an article's), drawn in the frame. */
  placeOf?: (key: string) => Point | null
  /** Where the tab hangs across, on screen. */
  homeX: () => number | null
  /** The book is drawn: until then the ribbon is not shown. */
  ready: boolean
  /** Carried and let go: the share of the spot's edge it now lies at, and the spot (laid from the tab, too). */
  onSlide?: (across: number, key: string) => void
  /** The hanging tab clicked: laid where you are reading. */
  onLayHere: () => void
  /** A laid ribbon clicked or right-clicked: the rows of its own small menu (its colour, taking it out). */
  menu?: ReactNode
  onMenuOpen?: (open: boolean) => void
  /** Laid out of sight: what the pill says ("p. 95"), and going there. */
  away?: { label: string; go: () => void }
  /** Counted up each time it is gone to: once the pages come to rest, it bounces. */
  bounce?: number
}): React.JSX.Element {
  const tab = useRef<HTMLDivElement>(null)
  const band = useRef<HTMLDivElement>(null)
  const chipEl = useRef<HTMLDivElement>(null)
  const pill = useRef<HTMLButtonElement>(null)
  const ox = useMotionValue(0)
  const oy = useMotionValue(0)
  /** The hanging tab's offset from home: let go of with Esc, it springs back. */
  const tx = useMotionValue(0)
  const ty = useMotionValue(0)
  const rot = useMotionValue(0)
  const stretch = useMotionValue(1)
  const tabLen = useMotionValue(HANG)
  const len = useMotionValue(LAID)
  /** Held: which one, the pointer, and where it took hold (in the laid ribbon's room, or on screen for the tab). */
  const held = useRef<{ id: number; kind: 'band' | 'tab'; grab: Point; pointer: Point; from: Point; moved: boolean; vx: number; t: number; key: string | null } | null>(null)
  const [holding, setHolding] = useState(false)
  const [chip, setChip] = useState<string | null>(null)
  const runs = useRef<AnimationPlaybackControls[]>([])
  /** Where the laid ribbon was last drawn, in its own room: the start of every glide. */
  const drawn = useRef<Point | null>(null)
  /** Where the hanging tab was last drawn, on screen: a ribbon laid from it glides down from there. */
  const tabScreen = useRef<Point | null>(null)
  /** The tab let go over a page: where it was, and how long, for the laid ribbon to take over from. */
  const dropped = useRef<{ at: Point; len: number } | null>(null)
  /** A click on the tab that ended a carry is not a click. */
  const carried = useRef(false)
  const atNow = useRef(at)
  atNow.current = at
  /** Where along its edge it lies: set the moment it is let go, so it rests there before the reader has kept it. */
  const acrossNow = useRef(across)
  useLayoutEffect(() => void (acrossNow.current = across), [across, at])
  const reads = useRef({ placeOf, edgeOf, spotAt, nameOf, desk, homeX })
  reads.current = { placeOf, edgeOf, spotAt, nameOf, desk, homeX }
  const slides = !!edgeOf && !!onSlide && !!spotAt
  // The pages' box, read again each time the reader draws (a book opened afresh makes a new one).
  const [hostEl, setHostEl] = useState<HTMLElement | null>(null)
  useLayoutEffect(() => {
    const now = host?.() ?? null
    if (now !== hostEl) setHostEl(now)
  })
  const inHost = !!hostEl && !!edgeOf
  /** Laid out of sight: above the view or below it (null: in view, hanging, or not in the pages). */
  const [side, setSide] = useState<Side | null>(null)
  const sideNow = useRef<Side | null>(null)
  const lastSide = useRef<Side>('down')
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
    // An edge with no room to slide along (an article's, beside its paragraph): exactly at its left.
    if (edge.right - edge.left < WIDTH + 2 * INSET) return edge.left
    const low = edge.left + INSET
    const high = Math.max(low, edge.right - INSET - WIDTH)
    // Never slid, it lies near the right at a share of the width too, so a zoom step leaves it at the same place along
    // the edge (a fixed number of px in from the right moved it along the edge as the page grew).
    const x = edge.left + (share ?? NEAR_RIGHT) * (edge.right - edge.left) - WIDTH / 2
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
  /** Carried: the laid ribbon at the pointer less where it was taken, anywhere over the pages (in its room). */
  const heldAt = (): Point | null => {
    const hold = held.current
    const p = hold?.kind === 'band' && hold.moved ? toRoom(hold.pointer) : null
    return hold && p ? { x: p.x - hold.grab.x, y: p.y - hold.grab.y } : null
  }
  /** Carried: the tab at the pointer less where it was taken, on screen. */
  const tabHeldAt = (): Point | null => {
    const hold = held.current
    return hold?.kind === 'tab' && hold.moved ? { x: hold.pointer.x - hold.grab.x, y: hold.pointer.y - hold.grab.y } : null
  }
  /** The spot under the carried ribbon's top end (its middle, where it comes out of the page), and where along it. */
  const under = (): { spot: RibbonSpot; share: number } | null => {
    const hold = held.current
    if (!hold?.moved) return null
    let top: Point | null = null
    if (hold.kind === 'band') {
      const p = heldAt()
      top = p && { x: p.x + WIDTH / 2, y: p.y + OVERHANG }
    } else {
      const p = tabHeldAt()
      const r = room()
      top = p && r && { x: (p.x + WIDTH / 2 - r.left) / r.scale, y: (p.y + OVERHANG - r.top) / r.scale }
    }
    const spot = top && reads.current.spotAt?.(top.x, top.y)
    return top && spot ? { spot, share: Math.max(0, Math.min(1, (top.x - spot.left) / Math.max(1, spot.right - spot.left))) } : null
  }
  /** Carried over a new page: a tap on the trackpad, once for each crossing, and the chip says which. */
  const aim = (): void => {
    const hold = held.current
    const now = under()
    if (!hold || !now || now.spot.key === hold.key) return
    if (hold.key !== null) detent()
    hold.key = now.spot.key
    setChip(reads.current.nameOf?.(now.spot.key) ?? null)
  }

  const paint = (): void => {
    const box = frame.current?.getBoundingClientRect()
    const r = room()
    // The hanging tab, at the top of the frame; carried, at the pointer.
    const home = reads.current.homeX()
    const carriedTab = tabHeldAt()
    if (tab.current && box && (home !== null || carriedTab)) {
      const x = carriedTab ? carriedTab.x - box.left : home! - box.left - IN_FROM_RIGHT + tx.get()
      const y = carriedTab ? carriedTab.y - box.top : -2 + ty.get()
      tab.current.style.transform = `translate3d(${x}px, ${y}px, 0)${carriedTab || rot.get() ? ` rotate(${rot.get()}deg)` : ''}`
      tab.current.style.height = `${tabLen.get()}px`
      tabScreen.current = { x: box.left + x, y: box.top + y }
    }
    // The laid ribbon, in its room.
    const el = band.current
    let shown: Point | null = null
    if (el) {
      const base = heldAt() ?? rest()
      if (!base) el.dataset.lost = ''
      else {
        delete el.dataset.lost
        const x = base.x + ox.get()
        const y = base.y + oy.get()
        drawn.current = { x, y }
        el.style.transform = `translate3d(${x}px, ${y}px, 0) rotate(${rot.get()}deg) scaleY(${stretch.get()})`
        el.style.height = `${len.get()}px`
        shown = { x, y }
      }
    }
    // Carried: the page under it, and the chip beside it.
    if (held.current?.moved) aim()
    if (chipEl.current && box && r) {
      const at = held.current?.kind === 'tab' ? tabScreen.current : shown && { x: r.left + shown.x * r.scale, y: r.top + shown.y * r.scale }
      if (at) chipEl.current.style.transform = `translate3d(${at.x - box.left + WIDTH * r.scale + 10}px, ${at.y - box.top + 18}px, 0)`
    }
    // Laid out of sight: which way, and the pill beside the pages at that edge of the view.
    const view = scroller.current
    let now: Side | null = null
    if (view && shown && r && inHost && !held.current) {
      const v = view.getBoundingClientRect()
      const top = r.top + shown.y * r.scale
      const bottom = top + len.get() * r.scale
      now = bottom < v.top + 2 ? 'up' : top > v.bottom - 2 ? 'down' : null
    }
    if (now !== sideNow.current) {
      sideNow.current = now
      if (now) lastSide.current = now
      setSide(now)
    }
    const p = pill.current
    if (p && view && box) {
      const v = view.getBoundingClientRect()
      const right = v.left + view.clientWidth
      const w = p.offsetWidth
      const cols = reads.current.desk?.() ?? null
      // In the desk beside the pages: right of them, else left of them; only when the pages fill the view, at its edge.
      const x = !cols ? right - w - 8 : right - cols.right >= w + 16 ? cols.right + 10 : cols.left - v.left >= w + 16 ? cols.left - 10 - w : right - w - 6
      const y = lastSide.current === 'up' ? v.top + 12 : v.top + view.clientHeight - p.offsetHeight - 12
      p.style.transform = `translate3d(${x - box.left}px, ${y - box.top}px, 0)`
    }
  }
  const paints = useRef(paint)
  paints.current = paint

  // Every value it moves on draws it; a scroll, a zoom, a spread or a resize draws it where its page is now.
  useEffect(() => {
    const draw = (): void => paints.current()
    const off = [ox, oy, tx, ty, rot, stretch, len, tabLen].map((one) => one.on('change', draw))
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
  }, [ox, oy, tx, ty, rot, stretch, len, tabLen, scroller, frame, hostEl])

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
    if (band.current) band.current.style.transformOrigin = ''
    if (stretch.get() !== 1) to(stretch, 1, BOUNCE)
    to(ox, 0, SETTLE)
    to(oy, 0, SETTLE)
    to(rot, 0, SWAY)
  }

  // Laid, moved or taken out (a click, a key, the menu, Undo, a drop): it glides there from where it was. Laid from the
  // hanging tab, it glides down from where the tab was, growing to its length.
  const wasAt = useRef<string | null>(null)
  const wasReady = useRef(false)
  useLayoutEffect(() => {
    if (held.current) return
    const from = wasAt.current
    const shown = wasReady.current
    wasAt.current = at
    wasReady.current = ready
    const drop = dropped.current
    dropped.current = null
    // Found laid as the book opens: simply there, where it lies.
    if (at && !shown) settle(null)
    else if (at && !from) {
      const start = drop?.at ?? tabScreen.current
      const tabAt = start && toRoom(start)
      len.set(drop?.len ?? HANG)
      settle(tabAt)
      to(len, LAID, GROW)
    } else if (at) settle()
    // Hanging again: the tab (hidden at once when it was let go over a page) fades back in at home.
    if (!at && tab.current) (tab.current.style.opacity = ''), (tab.current.style.transition = '')
    paint()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [at, across, ready, hostEl])

  // Gone to: once the pages have come to rest (no scroll for a moment, at most 2 s), a small elastic bounce, or with
  // reduce motion a soft brief shade.
  const bounced = useRef(bounce)
  useEffect(() => {
    if (bounce === bounced.current) return
    bounced.current = bounce
    const view = scroller.current
    let quiet = 0
    const began = performance.now()
    const go = (): void => {
      view?.removeEventListener('scroll', wait)
      const el = band.current
      if (!el || held.current) return
      if (motionNow() !== 'all') {
        delete el.dataset.flash
        void el.offsetWidth
        el.dataset.flash = ''
        return
      }
      el.style.transformOrigin = `${WIDTH / 2}px 0px`
      stretch.stop()
      const down = animate(stretch, 1.12, STRETCH as never)
      runs.current.push(down)
      void down.then(() => {
        if (held.current) return
        runs.current.push(animate(stretch, 1, BOUNCE as never))
        runs.current.push(animate(rot, 0, { ...SWAY, velocity: 40 } as never))
      })
    }
    const wait = (): void => {
      window.clearTimeout(quiet)
      quiet = window.setTimeout(go, performance.now() - began > 2000 ? 0 : 140)
    }
    view?.addEventListener('scroll', wait, { passive: true })
    // Already in place (no scroll comes), or the glide's first frame comes next: the quiet starts now either way.
    wait()
    return () => {
      window.clearTimeout(quiet)
      view?.removeEventListener('scroll', wait)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bounce])

  const calm = useRef(0)
  const edgeRun = useRef(0)
  useEffect(() => () => (window.clearTimeout(calm.current), cancelAnimationFrame(edgeRun.current)), [])

  /** Held near the top or the foot of the view, the pages scroll under it each frame, faster the nearer (and past it). */
  const edgeScroll = (): void => {
    cancelAnimationFrame(edgeRun.current)
    const view0 = scroller.current?.getBoundingClientRect()
    const depthAt = (y: number, v: DOMRect): number => (y < v.top + EDGE_ZONE ? y - (v.top + EDGE_ZONE) : y > v.bottom - EDGE_ZONE ? y - (v.bottom - EDGE_ZONE) : 0)
    // Taken up inside an edge's band (gone to, it lies just under the top), the pages wait until the pointer leaves
    // that band or is carried further toward the edge: picking it up never sets them scrolling.
    const start = view0 && held.current ? depthAt(held.current.from.y, view0) : 0
    let armed = !start
    const step = (): void => {
      const hold = held.current
      const view = scroller.current
      if (!hold?.moved || !view) return
      const v = view.getBoundingClientRect()
      const depth = depthAt(hold.pointer.y, v)
      if (!depth || Math.sign(depth) !== Math.sign(start) || Math.abs(depth) > Math.abs(start) + 16) armed = true
      const share = Math.min(1.5, Math.abs(depth) / EDGE_ZONE)
      if (depth && armed) view.scrollTop += Math.sign(depth) * Math.max(1, share * share * EDGE_SPEED)
      edgeRun.current = requestAnimationFrame(step)
    }
    edgeRun.current = requestAnimationFrame(step)
  }

  /** Let go (`keep`) or Esc: no longer held. Kept, it lies on the page under it; else it glides back where it was. */
  const release = (keep: boolean): void => {
    const hold = held.current
    if (!hold) return
    const target = keep ? under() : null
    held.current = null
    cancelAnimationFrame(edgeRun.current)
    window.clearTimeout(calm.current)
    setHolding(false)
    setChip(null)
    const el = hold.kind === 'band' ? band.current : tab.current
    if (el?.hasPointerCapture(hold.id)) el.releasePointerCapture(hold.id)
    if (!hold.moved) return
    carried.current = hold.kind === 'tab'
    if (hold.kind === 'tab') {
      const box = frame.current?.getBoundingClientRect()
      if (target && tabScreen.current) {
        // Laid from the tab: the laid ribbon takes over exactly where the tab is, and the tab is gone at once.
        stopAll()
        dropped.current = { at: tabScreen.current, len: tabLen.get() }
        if (tab.current) (tab.current.style.transition = 'none'), (tab.current.style.opacity = '0')
        rot.set(0)
        tabLen.set(HANG)
        tx.set(0)
        ty.set(0)
        return onSlide?.(target.share, target.spot.key)
      }
      // Put back: from where it was let go, it springs home.
      const home = reads.current.homeX()
      if (box && home !== null && tabScreen.current) {
        tx.set(tabScreen.current.x - (home - box.left - IN_FROM_RIGHT) - box.left)
        ty.set(tabScreen.current.y - box.top + 2)
      }
      stopAll()
      to(tx, 0, SETTLE)
      to(ty, 0, SETTLE)
      to(rot, 0, SWAY)
      to(tabLen, HANG, GROW)
      return
    }
    if (target) {
      // It lies on the page under its top end, at the share of that page's width where it was let go: it rests there
      // at once, and the reader keeps it.
      acrossNow.current = target.share
      atNow.current = target.spot.key
      settle()
      return onSlide?.(target.share, target.spot.key)
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

  /** Its own small menu, opened beside the ribbon itself (just right of it, a little below its top), wherever it was clicked. */
  const openMenu = (p: Point): void => {
    const box = frame.current?.getBoundingClientRect()
    if (!menu || !box) return
    const r = band.current?.getBoundingClientRect()
    const at = r && r.width ? { x: r.right + 4, y: Math.min(r.bottom, r.top + 14) } : p
    setMenuAt({ x: at.x - box.left, y: at.y - box.top })
    onMenuOpen?.(true)
  }

  const onDown = (kind: 'band' | 'tab') => (event: React.PointerEvent<HTMLDivElement>): void => {
    const el = kind === 'band' ? band.current : tab.current
    if (event.button !== 0 || !el) return
    if (kind === 'band' && !drawn.current) return
    if (kind === 'tab' && (at || !slides || !inHost || !tabScreen.current)) return
    carried.current = false
    // Taken by the ribbon alone: the pages' own pointer, a text selection and the scroller never see it.
    event.preventDefault()
    event.stopPropagation()
    el.setPointerCapture(event.pointerId)
    const pointer = { x: event.clientX, y: event.clientY }
    const p = kind === 'band' ? toRoom(pointer) : pointer
    const start = kind === 'band' ? drawn.current! : tabScreen.current!
    held.current = { id: event.pointerId, kind, grab: p ? { x: p.x - start.x, y: p.y - start.y } : { x: WIDTH / 2, y: 20 }, pointer, from: pointer, moved: false, vx: 0, t: performance.now(), key: kind === 'band' ? at : null }
  }
  const onMove = (event: React.PointerEvent<HTMLDivElement>): void => {
    const hold = held.current
    if (!hold || event.pointerId !== hold.id || !slides || !inHost) return
    const pointer = { x: event.clientX, y: event.clientY }
    if (!hold.moved && Math.hypot(pointer.x - hold.from.x, pointer.y - hold.from.y) < 4) return
    if (!hold.moved) {
      // Taken up: from here it is wherever the pointer is, held at the point it was taken by, so nothing jumps; what
      // was left of a glide when it was taken springs away. It sways about that point.
      const was = drawn.current
      stopAll()
      stretch.set(1)
      hold.moved = true
      hold.pointer = hold.from
      if (hold.kind === 'band') {
        ox.set(0)
        oy.set(0)
        const now = heldAt()
        if (was && now) (ox.set(was.x - now.x), oy.set(was.y - now.y), to(ox, 0, SETTLE), to(oy, 0, SETTLE))
        band.current!.style.transformOrigin = `${hold.grab.x}px ${Math.max(0, hold.grab.y)}px`
      } else {
        tx.set(0)
        ty.set(0)
        tab.current!.style.transformOrigin = `${hold.grab.x}px ${Math.max(0, hold.grab.y)}px`
        // Taken from the tab, it grows to a laid ribbon's length as it comes away.
        to(tabLen, LAID, GROW)
      }
      setHolding(true)
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
      runs.current.push(animate(rot, Math.max(-10, Math.min(10, hold.vx * 7)), SWAY as never))
      window.clearTimeout(calm.current)
      calm.current = window.setTimeout(() => held.current && runs.current.push(animate(rot, 0, SWAY as never)), 60)
    }
    paint()
  }
  const onUp = (event: React.PointerEvent<HTMLDivElement>): void => {
    const hold = held.current
    if (!hold || event.pointerId !== hold.id) return
    // A click, no carry: the laid ribbon's own menu, right there (the tab's click lays it).
    if (!hold.moved) {
      release(false)
      return event.type === 'pointerup' && hold.kind === 'band' ? openMenu({ x: event.clientX, y: event.clientY }) : undefined
    }
    // Let go, it lies there; the system taking the pointer (a cancel) puts it back.
    release(event.type !== 'pointercancel')
  }

  const laid = at && (
    <div
      ref={(node) => void ((band.current = node), node && paint())}
      className="ribbon"
      data-ribbon={holding && held.current?.kind === 'band' ? 'held' : 'laid'}
      data-ribbon-at={at}
      data-in-page={inHost ? '' : undefined}
      data-slides={slides && inHost ? '' : undefined}
      data-menu={menu ? '' : undefined}
      data-unseen={ready ? undefined : ''}
      data-ribbon-hue={hue ?? undefined}
      role="button"
      aria-haspopup="menu"
      aria-label={slides ? 'Your ribbon: drag it onto any page, or click for its menu' : 'Your ribbon: click for its menu'}
      title={holding ? undefined : slides ? 'Your ribbon. Drag it onto any page; click it for its colour, or to take it out' : 'Your ribbon. Click it for its colour, or to take it out'}
      style={{ width: WIDTH, ...ribbonInk(hue) }}
      onPointerDown={onDown('band')}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      onLostPointerCapture={(event) => held.current && onUp(event)}
      onAnimationEnd={(event) => void (event.animationName === 'ribbon-flash' && delete event.currentTarget.dataset.flash)}
      onContextMenu={(event) => {
        event.preventDefault()
        event.stopPropagation()
        openMenu({ x: event.clientX, y: event.clientY })
      }}
    >
      <span className="ribbon-satin" />
    </div>
  )
  const tabState = !at ? (holding ? 'held' : 'hanging') : 'hidden'
  const shownSide = side ?? lastSide.current
  return (
    <div className="ribbon-layer" aria-hidden={!ready} data-ribbon-holding={holding ? '' : undefined} data-ribbon-hue={hue ?? undefined} style={ribbonInk(hue)}>
      {/* Hanging, the tab at the top of the pages: a click lays it where you are reading; carried, it lies where let go. */}
      <div
        ref={(node) => void ((tab.current = node), node && paint())}
        className="ribbon ribbon-tab"
        data-ribbon={tabState}
        data-slides={slides && inHost && !at ? '' : undefined}
        data-unseen={ready ? undefined : ''}
        role="button"
        tabIndex={tabState === 'hidden' ? -1 : 0}
        aria-label="Your ribbon: lay it where you are reading"
        title={holding ? undefined : `Your ribbon. Click to lay it where you are reading${slides && inHost ? ', or drag it onto a page' : ', or right-click a page'}  ⌘D`}
        style={{ width: WIDTH }}
        onPointerEnter={() => tabState === 'hanging' && to(tabLen, HANG_NEAR, GROW)}
        onPointerLeave={() => !held.current && to(tabLen, HANG, GROW)}
        onPointerDown={onDown('tab')}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onLostPointerCapture={(event) => held.current && onUp(event)}
        onClick={() => {
          if (carried.current) return void (carried.current = false)
          if (tabState === 'hanging') onLayHere()
        }}
      >
        <span className="ribbon-satin" />
      </div>
      {/* Carried: the page it will lie on, beside it. */}
      <div ref={chipEl} className="ribbon-chip" data-ribbon-chip={holding && chip ? chip : undefined} aria-hidden>
        {chip}
      </div>
      {/* Laid out of sight: a pill in the desk beside the pages, at the edge of the view it lies beyond. */}
      {away && inHost && (
        <button
          ref={(node) => void ((pill.current = node), node && paint())}
          type="button"
          className="ribbon-away"
          data-ribbon-away={side ?? undefined}
          data-shown={side ? '' : undefined}
          tabIndex={side ? 0 : -1}
          aria-hidden={!side}
          aria-label={`Go to your ribbon, ${away.label}`}
          title={`Go to your ribbon, ${away.label}  ⇧⌘D`}
          onClick={() => away.go()}
        >
          <span className="ribbon-away-mark" aria-hidden />
          <span>{away.label}</span>
          <span aria-hidden className="ribbon-away-arrow">{shownSide === 'up' ? '↑' : '↓'}</span>
        </button>
      )}
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

/** A ribbon's colours: its own deep red first, then a book's (lib/books.ts HUES). */
export const RIBBON_HUES: (Hue | null)[] = [null, ...HUES]

/** The rows of a laid ribbon's own menu, the same in a PDF and an article: its colours inline (pointed at, shown on the
 *  ribbon at once; the menu closed without a pick, it goes back), then "Take the ribbon out". */
export function RibbonMenuRows({ hue, onPeek, onPick, onOut }: { hue: Hue | null; onPeek: (hue: Hue | null | undefined) => void; onPick: (hue: Hue | null) => void; onOut: () => void }): React.JSX.Element {
  return (
    <>
      <DropdownMenuLabel>Ribbon colour</DropdownMenuLabel>
      <div role="group" aria-label="Ribbon colour" className="flex items-center gap-1 px-1.5 py-1" data-ribbon-colours onPointerLeave={() => onPeek(undefined)}>
        {RIBBON_HUES.map((one) => (
          <DropdownMenuItem key={one ?? 'own'} aria-label={one ? hueName(one) : 'Ribbon red'} aria-checked={hue === one} role="menuitemradio" data-ribbon-hue-pick={one ?? 'own'}
            onPointerEnter={() => onPeek(one)} onFocus={() => onPeek(one)} onSelect={() => onPick(one)}
            className="flex size-6 cursor-pointer items-center justify-center rounded-md p-0 focus:bg-accent">
            <span data-ribbon-hue={one ?? undefined} style={ribbonInk(one)} className="contents"><Swatch color="var(--mf-ribbon)" on={hue === one} /></span>
          </DropdownMenuItem>
        ))}
      </div>
      <DropdownMenuSeparator />
      <DropdownMenuItem data-ribbon-out-own onSelect={onOut}>Take the ribbon out</DropdownMenuItem>
    </>
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
