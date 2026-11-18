import { Fragment, createContext, memo, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { useDndContext } from '@dnd-kit/core'
import { useSortable } from '@dnd-kit/sortable'
import { AnimatePresence, animate, cubicBezier, motion, motionValue, useMotionValue, useSpring, useTransform, type MotionValue } from 'motion/react'
import { GripVertical } from 'lucide-react'

import { EASING, spring as springs, still } from '@/lib/motion'
import { slotTicker } from '@/lib/proximity'
import { isGroup, type How } from '@/lib/group-layout'
import { cn } from '@/lib/cn'
import { cut } from '../../../../main/clip'
import { brief } from '../../../../main/dates'

/**
 * Carrying a thing, the one way every list does it: the card under the pointer,
 * the room the rows open, the rows and a panel's edges gliding on one clock, the
 * panel giving a little as it accepts, and the ticks and taps of each new place.
 */

/** A panel's edges at rest, and the ends' height: past the corners' curve, so only the straight middle is stretched. */
export const REST: Shape = { top: 0, bottom: 0 }
const CAP = 12
/** How far a panel swells past its place as it accepts, and draws in as it lets go. */
const GIVE = 12
const GIVE_BACK = 5
/** How long the pointer rests on a row's middle before letting go there would gather them. */
export const DWELL = 550
/** How far left of where it was taken up a row is carried before it means "out of what holds it", as dragging left outdents in Notion. */
export const OUTDENT = 40

/** Emil's ease-out, the curve everything here settles on. */
export const OUT = EASING
export const INDENT = 0
/** The rows' slide, for a panel to keep pace with them. */
const SLIDE = { duration: 0.22, ease: [0.2, 0.9, 0.3, 1] as [number, number, number, number] }

/**
 * What letting go now would do, and the words for it: read off the layout the
 * drop itself would leave, so the hint and the result are one thing.
 */
export type Aim = {
  target: string
  how: How
  /** The group the carried row would be in (null: the top level). */
  into: string | null
  label: string | null
  tint?: string
  /** A new group would form with the target. */
  make?: boolean
  /** The room opens just after this row on show (-1: at the very top); null, nowhere. */
  gap: number | null
  /** Every group the carried row would be inside, innermost first: their panels take the room in. */
  around: string[]
  /** The room sits close under the row at the gap, in the same group, rather than just over the next row. */
  snug?: boolean
  /** How much more (or less) room a group carried takes where it lands than where it was: a subgroup's block sits in less air. */
  fit?: number
  /** Landing last in a group with the next row on show outside it: where that group's own rows end, as drawn at rest. */
  until?: number
  /** Where its line starts in from the row's edge: a step's is further in than a line's. */
  indent?: number
  /** Letting go here is refused: the words say why, and nothing moves. */
  refused?: boolean
  /** What letting go does, for a list that works it out itself. */
  act?: unknown
}
/** How far a group's panel's top and bottom edges move while something is carried, in pixels: down is more. */
export type Shape = { top: number; bottom: number }
export type Carry = {
  aim: Aim | null
  /** The carried row's height: the room a new group's preview makes. */
  height: number
  /** The room what is carried opens where it would land. */
  span: number
  /** The other rows carried along with the one in hand: they wait, faded, in their places. */
  along: Set<string>
  /** The row in hand. */
  hand: string | null
  /** Each group's panel, following its rows as they make room or close over a gap. */
  shapes: Map<string, Shape>
  /** Just let go: rows go straight to where the drop put them. */
  snap: boolean
  /** How far each row slides to make room. */
  ys: Map<string, number>
  /** How far a carried group's row sits inside its block's air: the room starts that much above it. */
  inset: number
  /** The group it was lifted from (null: the top level). */
  home: string | null
  /** A panel's give: what moves past its place on this run, and by how much. */
  give: Give
}
/**
 * As a panel takes what is carried its foot swells a little, and everything under
 * it is pushed along by as much, so nothing runs into it; as it lets go, its foot
 * draws in a little, never past its last row.
 */
type Give = { n: number; rows: Set<string>; feet: Map<string, number>; tops: Map<string, number> }
export const Carrying = createContext<Carry>({ aim: null, height: 0, span: 0, along: new Set(), hand: null, shapes: new Map(), snap: false, ys: new Map(), inset: 0, home: null, give: { n: 0, rows: new Set(), feet: new Map(), tops: new Map() } })
const same = (a: Aim | null, b: Aim | null): boolean => JSON.stringify(a) === JSON.stringify(b)

/**
 * The one clock every row, group head and panel part slides on. Whenever any
 * of their places changes, all of them start again together from where they
 * are now towards where they now go, on one shared progress: each is always
 * the same blend of two whole layouts, so no two ever cross, a box never comes
 * apart from its rows, and a row never leaves its box mid-glide. Each sliding
 * on its own clock, retargeted at its own moment, did all three for a frame or two.
 */
type Glider = { y: MotionValue<number>; scale: MotionValue<number>; from: [number, number]; to: [number, number]; /** Where its slide has it now, its give left out. */ at: [number, number]; /** How far past that it gives. */ over: [number, number] }
const gliders = new Set<Glider>()
const slide = motionValue(1)
/** The give runs on a clock of its own: a row moving on just after a panel accepts must not cut its give short. */
const giving = motionValue(1)
/** The give's whole run: up to its most about as the rows arrive, and back to nothing by the end. */
const GIVE_RUN = 0.42
const eased = cubicBezier(...SLIDE.ease)
const paint = (): void => {
  const m = eased(slide.get())
  const g = Math.sin(Math.PI * giving.get() ** 0.65)
  for (const one of gliders) {
    one.at = [one.from[0] + (one.to[0] - one.from[0]) * m, one.from[1] + (one.to[1] - one.from[1]) * m]
    one.y.set(one.at[0] + one.over[0] * g)
    one.scale.set(one.at[1] + one.over[1] * g)
  }
}
slide.on('change', paint)
giving.on('change', paint)
let sliding: { stop: () => void } | null = null
let gave: { stop: () => void } | null = null
let dueSlide = false
let dueGive = false
/** Once for all the places a commit changed: every glider starts again from where it is, then any give begins. */
const settle = (): void => {
  queueMicrotask(() => {
    if (dueSlide) {
      sliding?.stop()
      for (const one of gliders) one.from = one.at
      slide.jump(0)
      sliding = animate(slide, 1, { duration: SLIDE.duration, ease: 'linear' })
    }
    if (dueGive) {
      gave?.stop()
      giving.jump(0)
      gave = animate(giving, 1, { duration: GIVE_RUN, ease: 'linear' })
    }
    dueSlide = dueGive = false
  })
}
const retarget = (): void => void (dueSlide || dueGive || settle(), (dueSlide = true))
const kickGive = (): void => void (dueSlide || dueGive || settle(), (dueGive = true))

/**
 * An element's slide on the one clock above; or at once, written in the same
 * frame React draws, so nothing shows a frame at its old place.
 */
function useGlide(y: number, scaleY: number, instant: boolean, kick = 0, over: [number, number] = [0, 0]): { ref: (el: HTMLElement | null) => void; style: { y: MotionValue<number>; scaleY: MotionValue<number> } } {
  const my = useMotionValue(y)
  const ms = useMotionValue(scaleY)
  const el = useRef<HTMLElement | null>(null)
  const me = useRef<Glider>({ y: my, scale: ms, from: [y, scaleY], to: [y, scaleY], at: [y, scaleY], over: [0, 0] })
  const kicked = useRef(kick)
  const now = instant || still() || scrolled
  useLayoutEffect(() => {
    const one = me.current
    gliders.add(one)
    return () => void gliders.delete(one)
  }, [])
  useLayoutEffect(() => {
    const one = me.current
    const kicks = kicked.current !== kick
    kicked.current = kick
    const moves = one.to[0] !== y || one.to[1] !== scaleY
    if (!moves && !now && !kicks) return
    one.to = [y, scaleY]
    if (now) {
      // Where it is and where it goes are the same: the shared clock leaves it there.
      one.from = one.at = [y, scaleY]
      one.over = [0, 0]
      my.jump(y)
      ms.jump(scaleY)
      if (el.current) el.current.style.transform = y || scaleY !== 1 ? `translateY(${y}px) scaleY(${scaleY})` : 'none'
      // The row in hand holds the room's line, drawn (and heard of) a moment before the row is moved here: the card riding
      // clear of it reads it again now, or it stayed on the line until the pointer next moved.
      if (moves && lineNow && el.current?.contains(lineNow)) for (const tell of lineHeard) tell()
      return
    }
    if (kicks) (one.over = over, kickGive())
    if (moves) retarget()
  }, [y, scaleY, now, kick]) // eslint-disable-line react-hooks/exhaustive-deps
  return { ref: useCallback((node: HTMLElement | null) => void (el.current = node), []), style: { y: my, scaleY: ms } }
}

/**
 * Pieces of a page that stay where the page lays them (the sidebar's folders, its sections, its pages in their runs):
 * carried among, they make way as a list's rows do, on the same one clock, each slide written straight onto the piece.
 */
const ways = new Map<HTMLElement, Glider & { quiet: Quiet }>()
/**
 * How a piece is written to: at once, or, for a page that redraws what it sees change (a note's blocks: ProseMirror
 * reads a style written on one of its blocks as an edit and draws the block again without it), out of its sight.
 */
export type Quiet = (change: () => void) => void
const aloud: Quiet = (change) => change()
const moved = (y: number): string => (y ? `translateY(${y}px)` : '')
const glideEl = (el: HTMLElement, y: number, now: boolean, quiet: Quiet): void => {
  let one = ways.get(el)
  if (!one) {
    const my = motionValue(0)
    my.on('change', (v) => one!.quiet(() => void (el.style.transform = moved(v))))
    one = { y: my, scale: motionValue(1), from: [0, 1], to: [0, 1], at: [0, 1], over: [0, 0], quiet }
    ways.set(el, one)
    gliders.add(one)
  }
  if (one.to[0] === y && !now) return
  one.to = [y, 1]
  if (now || still()) return void ((one.from = one.at = [y, 1]), one.y.jump(y), one.quiet(() => void (el.style.transform = moved(y))))
  retarget()
}
/** Where a piece is laid out, its slide left out. */
export const restBox = (el: HTMLElement): { top: number; height: number; left: number; width: number } => {
  const box = el.getBoundingClientRect()
  return { top: box.top - new DOMMatrixReadOnly(getComputedStyle(el).transform).m42, height: box.height, left: box.left, width: box.width }
}
/** Where the room is, as the page will show it once the pieces have made way. */
export type Spot = { top: number; height: number; left: number; width: number; own: boolean }
/**
 * Everything between where the carried piece was and where it would land slides by its height, the rest stays; the
 * room is as tall as the carried piece (`tall`, its one row when it holds more). `all`, every piece in its run, the
 * carried one among them; `gap`: the room opens just after the piece at that place in `all` as laid out (-1: before
 * the first), null: nowhere, and everything goes home. `now`: they are there at once (a page scrolling under a still
 * pointer moves everything already, and a glide there would hide the room's line again at every new place).
 */
export function makeWay(all: HTMLElement[], carried: HTMLElement, gap: number | null, tall: number, quiet: Quiet = aloud, now = scrolled): Spot | null {
  const laid = all.map((el) => ({ el, ...restBox(el) })).sort((a, b) => a.top - b.top)
  const from = laid.findIndex((one) => one.el === carried)
  if (from < 0) {
    // Carried in from outside the run (a note's column out of its row): it leaves no place among them to close over,
    // so only the room where it lands opens, the pieces after it making way by its height.
    for (const [at, one] of laid.entries()) (quiet(() => void (one.el.dataset.carryPiece = '')), glideEl(one.el, gap !== null && at > gap ? tall : 0, now, quiet))
    const by = gap === null ? undefined : laid[gap + 1] ?? laid[gap]
    if (gap === null || !by) return null
    return { top: laid[gap + 1] ? by.top : by.top + by.height, height: tall, left: by.left, width: by.width, own: false }
  }
  const own = gap === null || gap === from || gap === from - 1
  // The carried piece's own place, with the air under it: what the pieces after it close over.
  const span = (laid[from + 1] ? laid[from + 1].top : laid[from].top + laid[from].height + 1) - laid[from].top
  for (const [at, one] of laid.entries()) {
    if (one.el === carried) continue
    quiet(() => void (one.el.dataset.carryPiece = ''))
    glideEl(one.el, own ? 0 : gap > from ? (at > from && at <= gap ? -span : 0) : at > gap && at < from ? span : 0, now, quiet)
  }
  if (gap === null) return null
  const me = laid[from]
  if (own) return { top: me.top, height: tall, left: me.left, width: me.width, own: true }
  // Going down, the room takes the foot of the last piece passed; going up, the head of the first one passed.
  const top = gap > from ? laid[gap].top + laid[gap].height - tall : laid[gap + 1].top
  return { top, height: tall, left: me.left, width: me.width, own: false }
}
/** Every piece home: let go, at once where the drop leaves them; put back, gliding there. */
export function clearWay(snap: boolean): void {
  for (const [el, one] of ways) {
    one.quiet(() => void delete el.dataset.carryPiece)
    if (snap || still() || !el.isConnected) {
      one.y.jump(0)
      one.quiet(() => void (el.style.transform = ''))
      gliders.delete(one)
      ways.delete(el)
    } else glideEl(el, 0, false, one.quiet)
  }
}

/** A room's band and line wait until the pieces have made way, so the line is never drawn across one still moving. */
export const roomWait = (): string | undefined => (still() || scrolled ? undefined : `mf-room 100ms ${OUT} ${Math.round(SLIDE.duration * 800)}ms both`)
/** The room's quiet band, wherever one is drawn. */
const ROOM = 'pointer-events-none absolute inset-x-1 rounded-md bg-[color-mix(in_srgb,var(--tt-brand-color-400)_6%,transparent)]'
/** A carried thing's own place, while nothing else is open for it: the same quiet band, never a faded copy of it. */
export const OwnRoom = (): React.JSX.Element => <span aria-hidden data-own-room="" className={cn(ROOM, 'inset-y-0')} />
/** What holds that band where the thing is not a list's row (a tab, a Matrix card): everything in it but the band goes out of sight. */
export const HELD = 'relative [&>*:not([data-own-room])]:opacity-0'
/**
 * The room where a carried thing's own box is the room (a board's card, which the cards round it make way for): the
 * quiet band, the one line through its middle once it would land somewhere new; over its own place, the band alone.
 * Its holder hides everything else in it (`HELD`, or the same for its own children).
 */
export const RoomIn = ({ moves, how }: { moves: boolean; how: string }): React.JSX.Element =>
  moves ? (
    <Fragment key={how}>
      <span aria-hidden data-drop-room="1" className={cn(ROOM, 'inset-y-0')} style={{ animation: roomWait() }} />
      <DropLine how={how} style={{ left: 12, top: '50%', animation: roomWait() }} />
    </Fragment>
  ) : <OwnRoom />

/**
 * Where it lands, the one line every list draws: a dot at its start. In a row's
 * room it runs through the band's middle; `fixed`, it is laid over the page at a
 * place read off it, for rows that stay where they are (the sidebar's trees).
 */
export function DropLine({ how, style, fixed = false, upright = false }: { how: string; style: CSSProperties; fixed?: boolean; /** Standing beside what it lands by (a note's block going beside another), its dot at its top. */ upright?: boolean }): React.JSX.Element {
  const line = useRef<HTMLSpanElement>(null)
  // Said to the card each time it is drawn at a place, and when it goes: the card rides clear of it (useClear).
  useLayoutEffect(() => {
    lineNow = line.current
    for (const tell of lineHeard) tell()
    return () => {
      lineNow = null
      for (const tell of lineHeard) tell()
    }
  })
  return <span ref={line} aria-hidden data-drop-line={how} style={style} className={cn('pointer-events-none rounded-full shrink-0 bg-(--tt-brand-color-400) before:absolute before:size-2 before:rounded-full before:border-2 before:border-(--tt-brand-color-400) before:bg-background', upright ? 'w-0.5 -translate-x-1/2 before:-top-2 before:-left-[3px]' : 'h-0.5 -translate-y-1/2 before:-top-[3px] before:-left-2', fixed ? 'fixed z-[70]' : 'absolute right-2')} />
}
/** The line drawn just now, if any, and who hears of it moving. */
let lineNow: HTMLElement | null = null
/** The place on the page lit for the carried row just now (useTargets): the card rides clear of that too. */
let litNow: HTMLElement | null = null
const lineHeard = new Set<() => void>()
/** How far the card stays from the line it is about. */
const CLEAR = 6

/**
 * The card never covers the line it is about (in a narrow list it hid nearly all
 * of it): where it would, it rides just clear of it, on the side of the line the
 * pointer is on, so the pointer stays on the card, and crosses over as the pointer
 * does. Heard from the pointer, the card's own holder being moved, a list scrolling
 * and the line itself, never read on a clock. A spring there; with Reduce motion or
 * Motion off it is simply there.
 */
function useClear(base?: () => number): { ref: (node: HTMLElement | null) => void; y: MotionValue<number> } {
  const to = useMotionValue(0)
  const y = useSpring(to, { stiffness: 520, damping: 38, mass: 0.6 })
  const card = useRef<HTMLElement | null>(null)
  useLayoutEffect(() => {
    let side: 'under' | 'over' | null = null
    const look = (): void => {
      const own = card.current?.getBoundingClientRect()
      // As it is drawn: a card turned a little in the hand (the Matrix's) reaches past the box that holds it, and the pile
      // and count under several carried hang below it (CarriedCount): all of it rides clear of the line.
      const turned = card.current?.firstElementChild?.getBoundingClientRect()
      const hung = [...(card.current?.querySelectorAll('[data-fanned], [data-carried]') ?? [])].map((one) => one.getBoundingClientRect())
      const box = own && { top: Math.min(own.top, turned?.top ?? own.top, ...hung.map((one) => one.top)), bottom: Math.max(own.bottom, turned?.bottom ?? own.bottom, ...hung.map((one) => one.bottom)) }
      // How far all of it reaches above and below the card's own middle.
      const [up, down] = own && box ? [(own.top + own.bottom) / 2 - box.top, box.bottom - (own.top + own.bottom) / 2] : [0, 0]
      const alone = (): number => (own ? (own.top + own.bottom) / 2 - y.get() : 0)
      // A line standing upright beside a block (a note's block going beside another): the card rides under its foot
      // where it would cover it, as it rides clear of a flat line.
      const drawn = lineNow?.isConnected ? lineNow.getBoundingClientRect() : null
      const line = drawn && drawn.width > drawn.height ? drawn : null
      const upright = drawn && !line ? drawn : null
      // A small place the card is carried onto (a tab): it rides just under it, so the place's own name stays in sight.
      // Lit, the place is under the pointer, so the card is on it or about to be (sideways it follows a touch late).
      const place = !line?.width && litNow?.isConnected && litNow.dataset.rowDrop !== undefined ? litNow.getBoundingClientRect() : null
      let next = 0
      const flat = card.current?.getBoundingClientRect()
      if (box && upright && flat && flat.left < upright.right + CLEAR && flat.right > upright.left - CLEAR) {
        side = null
        const home = card.current?.parentElement?.getBoundingClientRect()
        const middle = home ? (home.top + home.bottom) / 2 + (base?.() ?? 0) : alone()
        next = Math.max(0, upright.bottom + CLEAR + up - middle)
      } else if (box && box.bottom > box.top && line?.width) {
        const at = line.top + line.height / 2
        // The side the pointer is on, kept through a few pixels round the line so the card never flutters across it.
        side = side === 'under' ? (pointerY < at - 4 ? 'over' : 'under') : side === 'over' ? (pointerY > at + 4 ? 'under' : 'over') : pointerY >= at ? 'under' : 'over'
        // Where its middle would be by the pointer alone, and how far that is from clear of the line. Read off the box that
        // holds it, which its own spring never moves: read off the card itself mid-spring, it came to rest a little short.
        const home = card.current?.parentElement?.getBoundingClientRect()
        const middle = home ? (home.top + home.bottom) / 2 + (base?.() ?? 0) : alone()
        next = side === 'under' ? Math.max(0, at + up + CLEAR - middle) : Math.min(0, at - down - CLEAR - middle)
      } else {
        side = null
        if (box && place && place.height <= 48) {
          const home = card.current?.parentElement?.getBoundingClientRect()
          const middle = home ? (home.top + home.bottom) / 2 + (base?.() ?? 0) : alone()
          next = Math.max(0, place.bottom + CLEAR + up - middle)
        }
      }
      if (still()) (to.jump(next), y.jump(next))
      else to.set(next)
    }
    lineHeard.add(look)
    window.addEventListener('pointermove', look, true)
    window.addEventListener('scroll', look, true)
    // Read again once what holds the card has itself been moved (a list's lifted place, or the page's own box for it):
    // the pointer's move comes a step before that. Where nothing else read it again (the Matrix, whose line sits on
    // another card), the card stopped one step short of clear and touched its line.
    const holder = card.current?.closest('.mf-drag-picture') ?? card.current?.parentElement ?? null
    const moved = new MutationObserver(look)
    if (holder) moved.observe(holder, { attributes: true, attributeFilter: ['style'] })
    return () => {
      moved.disconnect()
      lineHeard.delete(look)
      window.removeEventListener('pointermove', look, true)
      window.removeEventListener('scroll', look, true)
    }
  }, [to, y])
  return { ref: useCallback((node: HTMLElement | null) => void (card.current = node), []), y }
}

/**
 * The room among pieces that stay where the page lays them (makeWay): the same quiet band with the one line through its
 * middle, laid over the page where they open it. Over the carried piece's own place, the band alone. It waits for the
 * pieces to make way, as a list's room does. The band is a tint with nothing in it, placed from the page's top (which
 * never scrolls), as a list's band is placed in its row.
 */
export function RoomAt({ at, how, indent = 0, place, now = false }: { at: Spot; how: string; indent?: number; /** Which place among the pieces it is, where that is known: a page scrolling under it moves the band with it, never drawing it afresh (each new drawing waits again, and a note scrolling under a still pointer hid it for good). */ place?: string; /** The pieces were moved at once (makeWay's `now`): nothing is still moving, so nothing to wait for. */ now?: boolean }): React.JSX.Element {
  const wait = at.own || now ? undefined : roomWait()
  const key = place ? `${place}:${at.own}` : `${Math.round(at.top)}:${at.own}`
  return createPortal(
    <Fragment key={key}>
      <span aria-hidden {...(at.own ? { 'data-own-room': '' } : { 'data-drop-room': '1' })} className={cn(ROOM, 'z-[70] inset-x-auto')} style={{ top: at.top, height: at.height - 2, left: at.left + 4, width: at.width - 8, animation: wait }} />
      {!at.own && <DropLine fixed how={how} style={{ top: at.top + (at.height - 2) / 2, left: at.left + 12 + indent, width: at.width - 20 - indent, animation: wait }} />}
    </Fragment>,
    document.body
  )
}

/** A card drawn by the page itself, not in a list's lifted place (the sidebar's folders): it rides clear of the line too. */
export function Clear({ children }: { children: ReactNode }): React.JSX.Element {
  const clear = useClear()
  return <motion.div ref={clear.ref} style={{ y: clear.y }}>{children}</motion.div>
}

/** Where a card at the pointer goes: just past it, level with it, never past the window's edges. */
const cardPlace = (x: number, y: number): { left: number; top: number; translate: string } => {
  const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16
  const wide = Math.min(20 * rem, window.innerWidth - 9 * rem)
  // Level with the pointer, its middle kept a card's half height in from the window's top and foot.
  const top = Math.min(Math.max(y, 28), window.innerHeight - 28)
  // Room on neither side of the pointer (the smallest window): as far right as it fits whole, never past either edge.
  return x + 18 + wide + 8 <= window.innerWidth ? { left: x + 18, top, translate: '0 -50%' }
    : x - 18 - wide >= 8 ? { left: x - 18, top, translate: '-100% -50%' }
      : { left: Math.max(8, window.innerWidth - wide - 8), top, translate: '0 -50%' }
}

/**
 * That card where the pointer is (`x`, `y`; left out, it follows the pointer itself, drawn by nothing else): just past
 * it, level with it, over everything, and clear of the line. Never past the window's edges: carried to the far side of
 * the page (a note's block going beside another), it rides on the pointer's other side, as wide as it would be
 * (CarriedCard's widest). The Calendar's cards had a placing of their own, which ran off the window's right edge.
 */
export function CardAt({ x, y, children }: { x?: number; y?: number; children: ReactNode }): React.JSX.Element {
  const box = useRef<HTMLDivElement>(null)
  const given = x !== undefined && y !== undefined
  useLayoutEffect(() => {
    if (given) return
    const put = (px: number, py: number): void => {
      if (!box.current) return
      const place = cardPlace(px, py)
      Object.assign(box.current.style, { left: `${place.left}px`, top: `${place.top}px`, translate: place.translate })
    }
    const at = pointerAt()
    put(at.x, at.y)
    const follow = (event: PointerEvent): void => put(event.clientX, event.clientY)
    window.addEventListener('pointermove', follow, true)
    return () => window.removeEventListener('pointermove', follow, true)
  }, [given])
  return createPortal(
    <div ref={box} aria-hidden className="pointer-events-none fixed z-[80]" style={given ? cardPlace(x!, y!) : undefined}>
      <Clear>{children}</Clear>
    </div>,
    document.body
  )
}

type RowProps = { id: string; children: ReactNode; inner?: CSSProperties; indent?: number; /** A list that draws its own handle says so. */ grip?: boolean }

/**
 * A row of a list that carries. It reads the carry and hands the row only its own part in it (its slide, its light,
 * whether it is in the hand), so a new place draws again the two rows it moves, not every row on show: drawing them
 * all at each place cost frames in a long list.
 */
export function CarryRow({ id, children, inner, indent = 0, grip = true }: RowProps): React.JSX.Element {
  const carry = useContext(Carrying)
  const { aim, ys, along, snap, give, hand } = carry
  const mine = aim?.target === id
  const forming = mine && !!aim.make
  return (
    <Carried id={id} inner={inner} indent={indent} grip={grip} y={Math.round(ys.get(id) ?? 0)} snap={snap} kick={give.n} pushed={give.rows.has(id)}
      how={mine ? aim.how : undefined} step={mine && aim.act === 'step'} forming={forming} faded={along.has(id)}
      // The row in hand draws the room where it would land, and a row a group would form on its preview: they alone read the whole carry.
      carry={hand === id || forming ? carry : null}>
      {children}
    </Carried>
  )
}

const Carried = memo(function Carried({ id, children, inner, indent = 0, grip = true, y, snap, kick, pushed, how, step, forming, faded, carry }: RowProps & {
  y: number; snap: boolean; kick: number; pushed: boolean; how: How | undefined; step: boolean; forming: boolean; faded: boolean; carry: Carry | null
}): React.JSX.Element {
  // dnd-kit says where each row goes; the row glides there on the same clock as the groups' panels (PanelParts), so a
  // row and the box around it always move together, even turned back halfway. Its own CSS transition is off.
  // dnd-kit's own slide of a row whose place in the list changed (its layout animation) is off too: the list is redrawn as it lands.
  const { setNodeRef, attributes, listeners, isDragging } = useSortable({ id, transition: null, animateLayoutChanges: () => false })
  const aim = carry?.aim ?? null
  const [height, span, inset] = [carry?.height ?? 0, carry?.span ?? 0, carry?.inset ?? 0]
  // What is carried never slides through the other rows: its room is simply there, shown once they have made way.
  // Let go, the list is drawn as the drop left it, so every row is at once in place.
  const glide = useGlide(y, 1, isDragging || snap, kick, [pushed ? GIVE : 0, 0])
  const ref = useCallback((node: HTMLElement | null): void => void (setNodeRef(node), glide.ref(node)), [setNodeRef, glide.ref]) // eslint-disable-line react-hooks/exhaustive-deps
  // Anything that moves the room draws it anew, so it never shows while the rows are still making way.
  const place = aim ? `${aim.gap}:${aim.snug}:${aim.fit}:${span}` : ''
  const wait = roomWait()
  // A new group would form here: this row lifts, with a panel around it and the room under it.
  const lifted = forming
  // The row in hand leaves its title with the card and its place to the room, however many are carried: the others
  // carried with it wait, faded, in their places, so only one row's room ever opens and no row is drawn over another.
  // Forming a new group, the room is the dashed place under the row it forms on, and its own place is closed over.
  const room = isDragging && !!aim && aim.gap !== null && !aim.make
  const fade = isDragging ? 0 : faded ? 0.3 : undefined
  return (
    <motion.div
      ref={ref}
      data-sortable-id={id}
      data-aim={how}
      // Where its slide ends: a card resting on a new group's place reads that place where it will be, not where it was.
      data-slid={y || undefined}
      // In the hand a row is its one line: whatever hangs under it (a task's steps, its question) folds away (main.css).
      data-held={isDragging || undefined}
      // A row that would take the carried one in as its own (a task, its step) lights, and nothing opens.
      data-nest-hot={step || undefined}
      {...attributes}
      {...listeners}
      tabIndex={-1}
      role={undefined}
      // Lit too as the one thing standing for its part, where that part has no heading over it (useTargets).
      className="group/grip relative isolate rounded-md data-[nest-hot]:bg-accent data-[nest-hot]:ring-1 data-[nest-hot]:ring-ring data-[drop-hot]:bg-accent data-[drop-hot]:ring-1 data-[drop-hot]:ring-ring"
      style={glide.style}
    >
      {/* That a row can be carried, said quietly: a grip in the margin by its left edge, as soon as the pointer is on it, as Today's lines show theirs. */}
      {grip && <GripVertical aria-hidden data-grip="" className="absolute top-1/2 size-3 -translate-y-1/2 text-muted-foreground/60 opacity-0 transition-opacity duration-150 group-hover/grip:opacity-100 motion-reduce:transition-none" style={{ left: indent - 13 }} />}
      {room && (
        // One hint per drop: a soft band the size of the room, the line through its middle. Drawn anew at each new place.
        // It waits for the rows to make way, so it never shows over one sliding past.
        <Fragment key={place}>
          <span aria-hidden data-drop-room={(carry?.along.size ?? 0) + 1} className={ROOM} style={{ top: -inset, height: span - 2, animation: wait }} />
          {!aim.make && <DropLine how={aim.how} style={{ left: (aim.indent ?? (aim.into ? INDENT : 0)) + 12, top: span / 2 - inset, animation: wait }} />}
        </Fragment>
      )}
      {/* Its own place, while nothing else is open for it: the same quiet room, never a faded copy of it. */}
      {isDragging && !room && !aim?.make && <OwnRoom />}
      <AnimatePresence>
        {forming && (
          <motion.div
            key="forming"
            aria-hidden
            data-preview=""
            className="pointer-events-none absolute -inset-x-1 -top-1 -z-10 origin-top rounded-lg bg-[color-mix(in_srgb,var(--foreground)_5%,transparent)] shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--foreground)_8%,transparent)]"
            style={{ height: `calc(100% + ${Math.max(height, span) + 6}px)` }}
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98, transition: { duration: 0.1 } }}
            transition={still() ? { duration: 0 } : springs.moderate}
          >
            {/* Where the carried row would land: a quiet dashed place under the row it joins. */}
            <span className="absolute inset-x-2 bottom-1.5 rounded-md border border-dashed border-foreground/15" style={{ height: Math.max(height, span) - 6 }} />
          </motion.div>
        )}
      </AnimatePresence>
      <div
        className="transition-[scale,translate,opacity] duration-200 motion-reduce:transition-none"
        style={{ transitionTimingFunction: OUT, scale: lifted ? 1.02 : 1, paddingLeft: indent || undefined, ...inner, ...(fade === undefined ? {} : { opacity: fade }) }}
      >
        {children}
      </div>
    </motion.div>
  )
})

/**
 * How far everything slides while something is carried, from where it was
 * (`from`) to just after the
 * row at `gap`: the carried unit moves there (`carried`), and the rows it
 * passes slide by `span` the other way (`other`, by index). The list's own
 * slide and its groups' panels both read it, so they never disagree.
 */
function slideOf(from: number, gap: number, span: number, rect: (index: number) => { top: number; height: number } | undefined, snug = true, inset = 0, until?: number, grow = 0): { carried: number; other: (index: number) => number } {
  const last = from
  const down = gap > last
  const up = gap < from - 1
  const at = rect(from)
  const end = (one: { top: number; height: number } | undefined): number | undefined => one && one.top + one.height
  // Where the unit's top (a group's, its air included) goes: close under the row at the gap when it lands in that row's
  // own group, else just over the next row, past any group's edge between. Moving down, the rows it passes close up first.
  let top: number | undefined
  if (until !== undefined && (down || up)) top = until + 1 - (down ? span : 0)
  else if (down) top = snug ? (end(rect(gap)) ?? 0) + 1 - span : (rect(gap + 1)?.top ?? (end(rect(gap)) ?? 0) + 1) - span
  else if (up) top = snug ? (end(rect(gap)) ?? 0) + 1 : rect(gap + 1)?.top
  // Next to where it was, it moves only into the row above's group (or out of it).
  else if (snug && gap >= 0) top = (end(rect(gap)) ?? 0) + 1
  return {
    carried: !at || top === undefined ? 0 : top + inset - at.top,
    // Moving down, the rows it passes close over the room it took where it was; moving up, they make the room it takes where it lands.
    other: (index) => (down && last < index && index <= gap ? -span : up && gap < index && index < from ? span + grow : 0)
  }
}

/**
 * Where each group's panel edges go while something is carried, worked out
 * from the rows' own places (as the list measures them, transforms left out)
 * and how far each one slides: the top follows the group's own row, the
 * bottom its last row, and a group the carried row would land in takes the
 * room in too. So the panel lights exactly the group named, on its own edges.
 */
export function Shaped({ aim, keys, hand, home = null, many, span, inset, row: mid, snap, blocks, footRoom = true, within, children }: { aim: Aim | null; keys: string[]; hand: string | null; home?: string | null; many: string[]; span: number; inset: number; row: number; snap: boolean; blocks: { id: string; rows: string[] }[]; /** Its panels have air under their last rows, to draw in over. */ footRoom?: boolean; /** The list's own part of the page, where two lists on it hold the same rows (two panes): rows are read there alone. */ within?: ParentNode | null; children: ReactNode }): React.JSX.Element {
  const { droppableRects } = useDndContext()
  const gap = aim?.gap ?? null
  const shapes = new Map<string, Shape>()
  // How far each row slides: every one in the same draw, and its group's panel with it.
  const ys = new Map<string, number>()
  const from = hand ? keys.indexOf(hand) : -1
  const order = new Map(keys.map((key, index) => [key, index]))
  // A new group opens its room under the row it joins. That has to win over the move: in a list you ordered yourself
  // the gap stays set, and the move then closed the group over the rows still standing in it, so they landed on the
  // notes below (16 Nov, four notes onto one).
  const forming = !!(aim?.make && aim.target && keys.indexOf(aim.target) >= 0)
  const sliding = forming || (gap !== null && from >= 0 && span > 0)
  // Each row's place read off the page as it lies now, its slide left out. Only while something is actually moving.
  const drawn = new Map<string, HTMLElement>()
  if (sliding) for (const node of (within ?? document).querySelectorAll<HTMLElement>('[data-sortable-id]')) drawn.set(node.dataset.sortableId!, node)
  const read = new Map<string, { top: number; height: number } | undefined>()
  const box = (key: string | undefined): { top: number; height: number } | undefined => {
    if (key === undefined) return undefined
    if (read.has(key)) return read.get(key)
    const node = drawn.get(key)
    const r = node?.getBoundingClientRect()
    const one = node && r ? { top: r.top - new DOMMatrixReadOnly(getComputedStyle(node).transform).m42, height: r.height } : droppableRects.get(key)
    read.set(key, one)
    return one
  }
  // Several carried open the room of the one in hand, as one carried does: the others wait, faded, in their places
  // (playbook, "One look for every drag"). A room for all of them was a tall empty band with its line far from the
  // pointer, and the rows that closed over the one place left slid by every carried row's height, onto the rows
  // under them (16 Nov, six notes across the Obsidian folder's groups); gathering them into a block there moved
  // half the list at every new place.
  // A panel follows the rows that stay in it, the faded ones too, and takes in the room where it lands.
  const panels = (shift: (key: string) => number, room?: { id: (id: string) => boolean; bottom: number }): void => {
    for (const { id, rows } of blocks) {
      if (rows[0] === hand) continue
      const all = rows.filter((key) => box(key))
      const staying = all.filter((key) => key !== hand)
      if (!staying.length) continue
      const was = Math.max(...all.map((key) => box(key)!.top + box(key)!.height))
      let now = Math.max(...staying.map((key) => box(key)!.top + box(key)!.height + shift(key)))
      if (room?.id(id)) now = Math.max(now, room.bottom)
      const top = box(rows[0]) ? shift(rows[0]) : 0
      const bottom = Math.round(now - was)
      if (top || bottom) shapes.set(id, { top, bottom })
    }
  }
  if (!forming && gap !== null && from >= 0 && span) {
    const h = span + (aim!.fit ?? 0)
    const slide = slideOf(from, gap, span, (at) => box(keys[at]), aim!.snug ?? true, inset + (aim!.fit ?? 0) / 2, aim!.until, aim!.fit ?? 0)
    const shift = (key: string): number => slide.other(order.get(key) ?? -1)
    for (const key of keys) if (key !== hand && shift(key)) ys.set(key, shift(key))
    if (slide.carried) ys.set(hand!, slide.carried)
    const roomTop = box(hand!) ? box(hand!)!.top - inset + slide.carried - (aim!.fit ?? 0) / 2 : undefined
    panels(shift, roomTop === undefined ? undefined : { id: (id) => aim!.around.includes(id), bottom: roomTop + h })
  }
  // A new group forming on a row: the panel around it holds the carried row's place under it, so every row after it
  // makes way by that much, and the row in hand leaves its own place, which the rows after it close over. Before, they
  // stayed put and the next row sat inside the panel, as if it joined too; and the place the row was lifted from stayed
  // open, an empty band over the rows that had made way (22-2).
  if (forming && aim?.target) {
    const at = keys.indexOf(aim.target)
    const down = (span > 0 ? span : mid) + 6
    const gone = from >= 0 ? box(hand!)?.height ?? mid : 0
    const shift = (key: string): number => {
      const index = order.get(key) ?? -1
      return (index > at ? down : 0) - (from >= 0 && index > from ? gone : 0)
    }
    for (const key of keys) if (key !== hand && shift(key)) ys.set(key, shift(key))
    const target = box(aim.target)
    // The group it forms inside takes the new group's room in at its foot.
    panels(shift, target && { id: (id) => !!blocks.find((one) => one.id === id)?.rows.includes(aim.target), bottom: target.top + target.height + shift(aim.target) + down })
  }
  // What would hold it now, and the give each change of that makes.
  const holder = hand ? (aim ? aim.into : home) : null
  const held = useRef(holder)
  const lifted = useRef(hand)
  const give = useRef<Give>({ n: 0, rows: new Set(), feet: new Map(), tops: new Map() })
  // Lifting and letting go give nothing: only what it crosses while carried.
  if (lifted.current !== hand) (lifted.current = hand, (held.current = holder))
  if (held.current !== holder) {
    const next: Give = { n: give.current.n + 1, rows: new Set(), feet: new Map(), tops: new Map() }
    if (footRoom && held.current) next.feet.set(held.current, -GIVE_BACK)
    const order = new Map(keys.map((key, at) => [key, at]))
    const spanOf = (rows: string[]): number[] => rows.map((key) => order.get(key) ?? -1).filter((at) => at >= 0)
    const taking = holder ? spanOf(blocks.find((one) => one.id === holder)?.rows ?? []) : []
    if (taking.length) {
      const [first, last] = [Math.min(...taking), Math.max(...taking)]
      for (const key of keys.slice(last + 1)) next.rows.add(key)
      for (const { id, rows } of blocks) {
        const at = spanOf(rows)
        if (!at.length) continue
        if (Math.min(...at) > last) (next.tops.set(id, GIVE), next.feet.set(id, GIVE))
        else if (Math.min(...at) <= first && Math.max(...at) >= last) next.feet.set(id, GIVE)
      }
    }
    held.current = holder
    give.current = next
  }
  const signature = [...shapes].map(([id, one]) => `${id}:${one.top}:${one.bottom}`).join() + [...ys].map(([id, y]) => `${id}=${Math.round(y)}`).join()
  const along = many.filter((one) => one !== hand).join()
  // A new value only when something drawn changes: every row reads it.
  const value = useMemo<Carry>(() => ({ aim, height: mid, span: span + (aim?.fit ?? 0), along: new Set(along ? along.split(',') : []), hand, shapes, ys, snap, inset: isGroup(hand ?? '') ? inset + (aim?.fit ?? 0) / 2 : 0, home, give: give.current }), [aim, mid, span, inset, along, hand, signature, snap, home, give.current]) // eslint-disable-line react-hooks/exhaustive-deps
  return <Carrying.Provider value={value}>{children}</Carrying.Provider>
}

/**
 * A group's panel in three parts, a rounded top, a straight middle and a
 * rounded bottom, so its edges can move with its rows on the compositor: the
 * ends slide and only the middle stretches, and the corners stay true however
 * far it grows or closes. Lit, a deeper wash fades in over all three.
 */
export function PanelParts({ id, shape, tall, lit, snap }: { id: string; shape: Shape; tall: number; lit: boolean; snap: boolean }): React.JSX.Element {
  const { give } = useContext(Carrying)
  const middle = Math.max(1, tall - CAP * 2)
  const part = 'absolute inset-x-0 border-x border-(--panel-edge) bg-(--panel-fill) transition-[background-color] duration-200 motion-reduce:transition-none before:absolute before:-inset-x-px before:inset-y-0 before:rounded-[inherit] before:bg-(--panel-lit) before:transition-opacity before:duration-200 before:content-[""] motion-reduce:before:transition-none'
  const wash = lit ? 'before:opacity-100' : 'before:opacity-0'
  // On the rows' own clock (useGlide): CSS transitions each shorten on their own when turned back halfway, and the parts came apart.
  const [head, foot] = [give.tops.get(id) ?? 0, give.feet.get(id) ?? 0]
  const top = useGlide(shape.top, 1, snap, give.n, [head, 0])
  const mid = useGlide(shape.top, Math.max(0, middle + shape.bottom - shape.top) / middle, snap, give.n, [head, (foot - head) / middle])
  const bottom = useGlide(shape.bottom, 1, snap, give.n, [foot, 0])
  return (
    <>
      <motion.div ref={top.ref} data-panel-part="top" className={cn(part, wash, 'top-0 rounded-t-lg border-t')} style={{ height: CAP, ...top.style }} />
      <motion.div ref={mid.ref} data-panel-part="middle" className={cn(part, wash)} style={{ top: CAP, height: `calc(100% - ${CAP * 2}px)`, originY: 0, ...mid.style }} />
      <motion.div ref={bottom.ref} data-panel-part="bottom" className={cn(part, wash, 'bottom-0 rounded-b-lg border-b')} style={{ height: CAP, ...bottom.style }} />
    </>
  )
}

/** How tall an element is as drawn, read whenever it resizes: a panel's middle stretches from this. */
export function useTall(block: RefObject<HTMLElement | null>): number {
  const [tall, setTall] = useState(0)
  useLayoutEffect(() => {
    const el = block.current
    if (!el) return
    // Read when it resizes, never after every draw: the panel drawn from this height can change the block's
    // height by a pixel, and a read after each draw then drew again forever and froze the page.
    const read = (): void => setTall((was) => (Math.abs(was - el.offsetHeight) < 1 ? was : el.offsetHeight))
    read()
    const sized = new ResizeObserver(read)
    sized.observe(el)
    return () => sized.disconnect()
  }, [block])
  return tall
}

/** The row whose place the pointer is over, as the list lies before anything slid aside; in the air between two, the nearer. */
export function rowAt(known: Set<string>, y: number, within: ParentNode | null = null): { id: string; node: HTMLElement; top: number; height: number } | null {
  const nodes: HTMLElement[] = []
  for (const node of (within ?? document).querySelectorAll<HTMLElement>('[data-sortable-id]')) if (known.has(node.dataset.sortableId!)) nodes.push(node)
  if (!nodes.length) return null
  const read = (node: HTMLElement): { id: string; node: HTMLElement; top: number; height: number; off: number } => {
    const box = node.getBoundingClientRect()
    const top = box.top - new DOMMatrixReadOnly(getComputedStyle(node).transform).m42
    return { id: node.dataset.sortableId!, node, top, height: box.height, off: y < top ? top - y : y > top + box.height ? y - top - box.height : 0 }
  }
  // Rows stand in order down the page, so the one at the pointer is found by halving: a handful of rows read on each
  // move of the pointer, where every row on show was (in a long list that cost frames while carrying).
  let [low, high] = [0, nodes.length - 1]
  while (low < high) {
    const mid = (low + high + 1) >> 1
    if (read(nodes[mid]).top <= y) low = mid
    else high = mid - 1
  }
  let over = read(nodes[low])
  // In the air between two (or past either end), every row is read and the nearest taken.
  if (over.off > 0) for (const node of nodes) {
    const one = read(node)
    if (one.off < over.off) over = one
  }
  return { id: over.id, node: over.node, top: over.top, height: over.height }
}

/** A dead band round a row's middle: the side kept until the pointer is well past it, so small moves never flip it. */
export function sideOf(kept: { key: string; how: 'before' | 'after' } | null, key: string, at: number): 'before' | 'after' {
  const was = kept?.key === key ? kept.how : null
  return was === 'after' ? (at < 0.38 ? 'before' : 'after') : was === 'before' ? (at > 0.62 ? 'after' : 'before') : at < 0.5 ? 'before' : 'after'
}

/** How far the pointer may drift and still be resting: a hand held still wavers a little. */
const STILL = 4
/**
 * Rested on a row's middle: `rested` says when the pointer has been held still there DWELL. Held still, not merely
 * over it: a row carried slowly past was a long time over each row's middle, so a group began to form under it and
 * was gone again as it moved on. Once rested it stays so until the pointer leaves that middle. A pointer held still
 * sends no moves, so `again` reads the aim afresh then: the rest is the input, measured in time.
 */
export function rester(again: () => void): { rested: (key: string) => boolean; undwell: () => void } {
  let dwell: { key: string; since: number; x: number; y: number; done: boolean; timer: ReturnType<typeof setTimeout> } | null = null
  const undwell = (): void => {
    if (dwell) clearTimeout(dwell.timer)
    dwell = null
  }
  const rested = (key: string): boolean => {
    const now = dwell
    if (now?.key === key && (now.done || Math.hypot(pointerX - now.x, pointerY - now.y) <= STILL)) return (now.done ||= performance.now() - now.since >= DWELL)
    undwell()
    dwell = { key, since: performance.now(), x: pointerX, y: pointerY, done: false, timer: setTimeout(again, DWELL) }
    return false
  }
  return { rested, undwell }
}
/**
 * The same rest for a list drawn by React: `again` is always its latest. A list scrolling under a still pointer (its
 * edge scroll while a row is carried) sends no moves either: each scroll reads the aim afresh too, at the pointer, so
 * the room is where the pointer holds it at every place the scroll brings. With nothing carried, `again` reads nothing.
 */
export function useRest(again: () => void): { rested: (key: string) => boolean; undwell: () => void } {
  const read = useRef(again)
  read.current = again
  const rest = useRef<ReturnType<typeof rester> | null>(null)
  rest.current ??= rester(() => read.current())
  useEffect(() => {
    const look = (): void => read.current()
    window.addEventListener('scroll', look, { capture: true, passive: true })
    return () => window.removeEventListener('scroll', look, true)
  }, [])
  return rest.current
}

/**
 * Places on the page a row can be dropped on as well as among its rows (a tab, a card): any element marked
 * `data-row-drop` with what it is. Lit while the row is over one, and the card says what letting go there does
 * (`said`; null: that place takes nothing from this row, and stays unlit).
 */
export type Places = { drop: (id: string, place: string) => void; said: (place: string, id: string) => string | null }
/**
 * Rows standing in parts under a heading each (Overdue, Today; a goal's day), where a rule of the part's own says
 * what is in it. Carried over another part's rows, nothing opens: that part's heading (`data-row-part`) lights and
 * the card says what letting go does (`words`), or why it cannot go there (`refused`).
 */
export type Parts = { of: (id: string) => string | undefined; take: (id: string, part: string) => { words: string } | { refused: string }; drop: (id: string, part: string) => void }

/**
 * Level with a part's own heading, that part is meant, whichever row is nearer (the heading's top half is nearer the
 * part before it): the first of `rows` that is in it stands for it. Null anywhere else.
 */
export function headRow(parts: Parts | undefined, rows: () => string[], y: number, within: ParentNode | null): ReturnType<typeof rowAt> {
  if (!parts) return null
  for (const head of (within ?? document).querySelectorAll<HTMLElement>('[data-row-part]')) {
    const box = head.getBoundingClientRect()
    if (y < box.top || y > box.bottom) continue
    const first = rows().find((key) => parts.of(key) === head.dataset.rowPart)
    return first === undefined ? null : rowAt(new Set([first]), y, within)
  }
  return null
}

/**
 * A carried row over a place or over another part of its list: the one thing lit, the aim the card reads, and what
 * letting go there does. One for every list that carries (Tasks' rows, and the lists with groups).
 */
export function useTargets(places: Places | undefined, parts: Parts | undefined, on: boolean, again: () => void): {
  /** The place under the pointer, lit: the aim at it, or null where there is none. */
  place: (id: string) => Aim | null
  /** `target` is a row of another part: that part's heading lit (`row`, where it stands under no heading), or the refusal. Null in its own part. */
  part: (id: string, target: string, within: ParentNode | null, row?: HTMLElement) => Aim | null
  /** Nothing lit. */
  dim: () => void
  /** Let go on a refusal, a place or a part: done here, `said` the refusal to say. Null for any other aim. */
  drop: (id: string, aim: Aim) => { said?: string } | null
} {
  const lit = useRef<HTMLElement | null>(null)
  const light = (next: HTMLElement | null): void => {
    if (lit.current === next) return
    if (lit.current) delete lit.current.dataset.dropHot
    if (next) next.dataset.dropHot = ''
    lit.current = litNow = next
    for (const tell of lineHeard) tell()
  }
  // Sideways the list's own drag says nothing (it goes up and down only): along a row of tabs the pointer itself is followed.
  // Only a move that is sideways alone: up or down the drag itself says, and reading twice a move cost frames in a long list.
  const readAt = useRef(-1)
  const read = useRef(again)
  read.current = again
  const tabs = !!places
  useEffect(() => {
    if (!on || !tabs) return
    const follow = (event: PointerEvent): void => void (event.clientY === readAt.current && read.current())
    window.addEventListener('pointermove', follow)
    return () => window.removeEventListener('pointermove', follow)
  }, [on, tabs])
  return {
    place: (id) => {
      readAt.current = pointerY
      if (!places) return null
      const spot = document.elementsFromPoint(pointerX, pointerY).map((one) => one.closest<HTMLElement>('[data-row-drop]')).find((one) => !!one)
      const name = spot?.dataset.rowDrop ?? ''
      const said = spot ? places.said(name, id) : null
      if (!spot || said === null) return null
      light(spot)
      return { target: name, how: 'join', into: name, label: said, gap: null, around: [], act: 'place' }
    },
    part: (id, target, within, row) => {
      const to = parts?.of(target)
      if (!parts || to === undefined || to === parts.of(id)) return null
      const take = parts.take(id, to)
      const no = 'refused' in take
      light(no ? null : ((within ?? document).querySelector<HTMLElement>(`[data-row-part="${CSS.escape(to)}"]`) ?? row ?? null))
      return { target: to, how: 'join', into: no ? null : to, label: no ? take.refused : take.words, gap: null, around: [], refused: no || undefined, act: 'part' }
    },
    dim: () => light(null),
    drop: (id, aim) => {
      if (aim.refused) return { said: aim.label ?? '' }
      if (aim.act === 'place') return (places?.drop(id, aim.target), {})
      if (aim.act === 'part') return (parts?.drop(id, aim.target), {})
      return null
    }
  }
}

/**
 * What letting go now would do, with the tick and tap of each new place: the
 * light tap between rows, and the firm one with its own tick on crossing what
 * holds it (a group's or a line's edge, either way, or a new group forming).
 */
export function useAim(): { aim: Aim | null; aimed: RefObject<Aim | null>; start: (id: string, home: string | null) => void; point: (next: Aim | null, own?: boolean) => void } {
  const [aim, setAim] = useState<Aim | null>(null)
  const aimed = useRef<Aim | null>(null)
  const ticks = useRef(slotTicker()).current
  const ring = useRef<string | null>(null)
  const homed = useRef<string | null>(null)
  const start = (id: string, home: string | null): void => {
    ticks.start(id)
    ring.current = homed.current = home
  }
  const point = (next: Aim | null, own = false): void => {
    if (same(aimed.current, next)) return
    aimed.current = next
    setAim(next)
    // Refused: the pointer says so too, wherever it is (main.css).
    if (next?.refused) document.documentElement.dataset.dragRefused = ''
    else delete document.documentElement.dataset.dragRefused
    if (!next && !own) return
    const now = next ? (next.make ? `make:${next.target}` : next.into) : homed.current
    const firm = now !== ring.current
    ring.current = now
    ticks(next ? `${next.gap ?? next.target}:${now ?? ''}` : 'own', firm)
  }
  return { aim, aimed, start, point }
}

/** Where the pointer is on the page: a list's own drag reads only up and down. */
let pointerX = 0
let pointerY = 0
/**
 * The page scrolled since the pointer last moved (a list's edge scroll under a still pointer): a place the scroll brings
 * is there at once, its rows moved and its room and line shown, never gliding or waiting again at each new place, as a
 * note's carry is (lib/block-carry.tsx `now`). A pointer that moves brings its places on the usual clock.
 */
let scrolled = false
if (typeof window !== 'undefined') {
  window.addEventListener('pointermove', (event) => void ((pointerX = event.clientX), (pointerY = event.clientY), (scrolled = false)), true)
  window.addEventListener('scroll', () => void (scrolled = true), { capture: true, passive: true })
}
export const pointerNow = (): number => pointerX
export const pointerAt = (): { x: number; y: number } => ({ x: pointerX, y: pointerY })
/**
 * Carried out of the window, the button still down: nothing there is aimed at, and letting go puts it back, as a Mac's
 * lists do. A list read the row level with the pointer however far outside it was, and the row moved there unseen.
 */
export const offWindow = (): boolean => pointerX < 0 || pointerY < 0 || pointerX >= window.innerWidth || pointerY >= window.innerHeight
/** Going left alone moves nothing a list's own drag reads, so crossing OUTDENT reads the aim afresh itself. */
export function useCarriedLeft(from: number | null, on: boolean, again: () => void): void {
  const read = useRef(again)
  read.current = again
  useEffect(() => {
    if (!on || from === null) return
    let was = false
    const look = (): void => {
      const left = from - pointerX > OUTDENT
      if (left !== was) (was = left, read.current())
    }
    window.addEventListener('pointermove', look)
    return () => window.removeEventListener('pointermove', look)
  }, [from, on])
}

/** The carried card's own look, for what is drawn behind it too. */
export const CARD = 'rounded-lg bg-popover px-3 py-2 text-control text-foreground shadow-(--mf-shadow-lift) ring-1 ring-foreground/10'

/**
 * The one thing carried, whatever it is and wherever it goes: a small card
 * with room round its words, in the float material. `words` (a list that says
 * what letting go would do) give it a fixed width, so it never resizes as they
 * change, and cross-fade in place.
 */
export function CarriedCard({ icon, title, strong = false, words, tint, refused = false, attrs, className }: { icon?: ReactNode; title: string; strong?: boolean; words?: string | null; tint?: string; refused?: boolean; attrs?: Record<string, string>; className?: string }): React.JSX.Element {
  return (
    <motion.div {...attrs} data-carried-card="" className={cn('relative flex max-w-[min(20rem,calc(100vw-9rem))] cursor-grabbing items-center gap-2', refused && 'flex-wrap', words !== undefined ? 'w-[min(20rem,calc(100vw-9rem))]' : 'w-fit', CARD, className)}
      initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }} transition={still() ? { duration: 0 } : springs.moderate}>
      {icon}
      <span className={cn('private-text min-w-0 flex-1 truncate', strong && 'font-semibold')}>{title}</span>
      {words !== undefined && (
        // At most three fifths of the card, ending in an ellipsis: a long group's name ran on past the card's edge (the
        // card's width is fixed) and left the title no room at all.
        <span className={cn('grid min-w-0 justify-items-end text-xs text-muted-foreground', refused ? 'basis-full justify-items-start' : 'max-w-[60%] shrink-0')}>
          <AnimatePresence initial={false}>
            {words && (
              <motion.span key={words} data-drag-label="" data-refused={refused ? '' : undefined} // A refusal says why and what would do it instead: a sentence, which takes a second line inside the card before it runs out of it.
                className={cn('col-start-1 row-start-1 flex max-w-full min-w-0 gap-1.5', refused ? 'items-start text-foreground' : 'items-center whitespace-nowrap')}
                initial={{ opacity: 0, y: 3 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -3, transition: { duration: 0.08 } }} transition={still() ? { duration: 0 } : springs.fast}>
                <span className={cn('size-1.5 rounded-full shrink-0', refused && 'mt-[0.45em]')} style={{ background: tint ?? 'var(--muted-foreground)' }} />
                <span className={cn(!refused && 'min-w-0 truncate')}>{words}</span>
              </motion.span>
            )}
          </AnimatePresence>
        </span>
      )}
    </motion.div>
  )
}

/**
 * Several carried, beside the card that stands for them (Writing's lists, a note's picked blocks): it rests on a small
 * pile, a card a little lower and narrower under it for each one more (two at most), as a Mac's Mail carries several
 * letters, with how many in a small badge hanging under it. A card a full card apart for each one stood a tall stack
 * over the very rows it was aimed between (16 Nov, 22-3); the rows themselves, faded in their places, say which they
 * are. `n`: the number the card's words count (a new group counts the row it forms on too); `carried`: how many are in hand.
 */
export function CarriedCount({ n, carried = n }: { n: number; carried?: number }): React.JSX.Element {
  const calm = still()
  return (
    <>
      {(carried > 2 ? [2, 1] : [1]).map((depth) => (
        <motion.span key={depth} aria-hidden data-fanned={depth} className={cn('absolute inset-0 -z-10', CARD)} style={{ y: depth * 4, scaleX: 1 - depth * 0.04 }}
          initial={calm ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={calm ? { duration: 0 } : springs.moderate} />
      ))}
      <span data-carried={n} className="absolute -bottom-3 left-1/2 z-10 flex h-5 -translate-x-1/2 min-w-5 items-center justify-center rounded-full bg-(--tt-brand-color-400) px-1.5 text-[11px] font-semibold mf-on-accent tabular-nums shadow-sm animate-in zoom-in-90 fade-in-0 duration-150">
        {brief(n)}
      </span>
    </>
  )
}

/**
 * Where the card rides in a list's lifted place: just past the point it was
 * taken hold of. `from`, the pointer's x at the lift: sideways it follows a touch
 * late and leans into the way it is moving, as a card held loosely does (the
 * list itself reads only up and down). Null: a list that already moves it sideways.
 */
export function Hand({ grab, from, rest, at, children }: { grab: number; from: number | null; /** How far up or down of the pointer it rests just now (useCardPlace). */ rest?: MotionValue<number>; /** How far down the lifted place the card rides, where that place is taller than the row in hand (a task lifted with its steps open): its middle otherwise. */ at?: number; children: ReactNode }): React.JSX.Element {
  const dragX = useMotionValue(0)
  useLayoutEffect(() => {
    if (from === null) return
    const follow = (event: PointerEvent): void => dragX.set(event.clientX - from)
    window.addEventListener('pointermove', follow, true)
    return () => window.removeEventListener('pointermove', follow, true)
  }, [from, dragX])
  const calm = still()
  const sideways = useSpring(dragX, { stiffness: 700, damping: 42, mass: 0.5 })
  const x = useTransform(() => (calm ? dragX.get() : sideways.get()))
  const lean = useSpring(useTransform(() => (calm ? 0 : Math.max(-3, Math.min(3, (dragX.get() - sideways.get()) * 0.12)))), { stiffness: 400, damping: 30 })
  // Up or down it rests where a list says (useCardPlace), and always clear of the line.
  const clear = useClear(() => rest?.get() ?? 0)
  const y = useTransform(() => (rest?.get() ?? 0) + clear.y.get())
  return (
    <div className="relative h-full w-full">
      {/* Never past the window's right edge: in a narrow window a row taken hold of far along it carried its card partly out of
          sight. Where the row starts is the pointer at the lift less how far along the row that was: nothing is read off the page. */}
      <div className="absolute" style={{ top: at ?? '50%', left: from === null ? `min(${grab + 18}px, 40%)` : `min(${grab + 18}px, 40%, calc(100vw - ${Math.round(from - grab)}px - min(20rem, calc(100vw - 9rem)) - 8px))`, translate: '0 -50%' }}>
        <motion.div ref={clear.ref} className="relative w-fit" style={{ x, y, rotate: lean }}>{children}</motion.div>
      </div>
    </div>
  )
}

/**
 * Where something would be taken in (a step, a new group), the card rests on the
 * very place it will land, as a split's card rests under its words, so the name of
 * what takes it stays readable. A spring there and back; with Reduce motion or
 * Motion off it is simply there. `follow`: where the card would be by the pointer alone.
 */
export function useCardPlace(aim: Aim | null, takes: (aim: Aim) => boolean): { rest: MotionValue<number>; follow: (by: number) => void; lift: () => void } {
  const y = useMotionValue(0)
  const rest = useSpring(y, { stiffness: 520, damping: 38, mass: 0.6 })
  const by = useRef(0)
  const place = useRef<number | null>(null)
  const go = (): void => {
    const to = place.current === null ? 0 : place.current - by.current
    if (still()) (y.jump(to), rest.jump(to))
    else y.set(to)
  }
  useLayoutEffect(() => {
    // The row a new group forms on may still be gliding: its dashed place is read from where that row's slide ends (it
    // moves up a row when the row in hand came from above it, that row's place closing).
    const dashed = aim && takes(aim) ? document.querySelector<HTMLElement>('[data-preview] > span') : null
    const row = dashed?.closest<HTMLElement>('[data-sortable-id]')
    const room = aim && takes(aim) ? document.querySelector('[data-drop-room]')?.getBoundingClientRect() : null
    place.current = dashed && row
      ? row.getBoundingClientRect().bottom - new DOMMatrixReadOnly(getComputedStyle(row).transform).m42 + Number(row.dataset.slid ?? 0) + dashed.offsetHeight / 2 + 5
      : room ? room.top + room.height / 2 : null
    go()
  }, [aim]) // eslint-disable-line react-hooks/exhaustive-deps
  return { rest, follow: (at) => ((by.current = at), go()), lift: () => ((place.current = null), y.jump(0), rest.jump(0)) }
}

/**
 * A thing between a list's rows that is not one of them (a section's heading): while a new group forms it slides as
 * the row under it does, on the rows' own clock, so the rows that make way under the group forming above it never leave
 * it behind, under the new group's panel. Over the row in hand it stays, the rows after it closing over that row's place
 * under it; and a plain move opens its room under a heading, never over it.
 */
export function Slid({ row, children }: { /** The row it heads. */ row: string; children: ReactNode }): React.JSX.Element {
  const { snap, ys, hand, aim } = useContext(Carrying)
  const glide = useGlide(aim?.make && row !== hand ? Math.round(ys.get(row) ?? 0) : 0, 1, snap)
  return <motion.div ref={glide.ref} style={glide.style}>{children}</motion.div>
}

/** A thing's name, as it reads on its row: its title, never the age or counts beside it. */
export const titleOf = (node: HTMLElement): string => {
  const first = (text: string): string | undefined => text.split('\n').map((line) => line.trim()).map((line) => cut(line, 80)).find(Boolean)
  if (node.dataset.dragTitle) return node.dataset.dragTitle
  // The first of its marked parts that holds words: a row with a picture marks the picture too (blurred with a
  // private note's words), and read first, with no words in it, a named note was carried as "Untitled".
  for (const part of node.querySelectorAll<HTMLElement>('.private-text, [data-title]')) {
    const name = first(part.innerText)
    if (name) return name
  }
  // No name of its own anywhere on it: what every list calls a note without one.
  return first(node.innerText) ?? 'New note'
}

/** Put back with Esc while still held: the click its release makes opens nothing either. */
export const swallowRelease = (): void => window.addEventListener('pointerup', swallowClick, { capture: true, once: true })

/** The click a release makes lands on nothing. */
export const swallowClick = (): void => {
  const swallow = (late: MouseEvent): void => (late.stopPropagation(), late.preventDefault())
  window.addEventListener('click', swallow, { capture: true, once: true })
  setTimeout(() => window.removeEventListener('click', swallow, { capture: true }), 80)
}
