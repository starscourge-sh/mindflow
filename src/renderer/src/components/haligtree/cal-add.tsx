import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react'
import { animate, createGeneratorEasing, generateLinearEasing, motion, spring as springCurve, useMotionValue, useTransform, type MotionValue } from 'motion/react'
import { CalendarPlus, SquareCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PopoverAnchor, PopoverArrow, PopoverContent } from '@/components/ui/popover'
import { chime } from '@/lib/sound'
import { FLOAT } from '@/lib/float'
import { byKeys, spring, still } from '@/lib/motion'
import { taskName } from '@/lib/tasks'
import type { Task } from '@/lib/haligtree'
import { quoted } from '../../../../main/clip'
import { dayjs, dayKey } from '../../../../main/dates'
import { EventRows, NewEvent, tint, type Shown } from './calendar-events'
import { KindSwitch, NewTask } from './day-side'
import { TaskRows } from './tasks-view'
import { POP_ISLANDS, refuse, stage, toast } from './ui'
import type { RowItem } from './row-menu'

/** Where something is on the Calendar: a day, or a time on it for a length; `until`, the last day of an event over several days. */
export type Place = { day: string; minute: number | null; length: number; until?: string }
/**
 * What is being made on the Calendar, where it will be: a day, or a time on
 * it for a length (or days, dragged across in Month), as an event or a task.
 * `words` are the ones it opens holding (an Undo brings them back);
 * `calendar` the one picked for an event; `at`, where its words put it when
 * they say a when of their own ("fri 1pm"): its draft is drawn there.
 */
export type Add = Place & { kind: 'event' | 'task'; words?: string; calendar?: string | null; at?: Place }
/** Where its draft is drawn: where its words put it, or where it was put. A task is one day's. */
export const placeOf = (add: Add): Add => {
  const at = add.at ? { ...add, day: add.at.day, minute: add.at.minute, length: add.at.length, until: add.at.until } : add
  return at.until && (add.kind === 'task' || at.until <= at.day) ? { ...at, until: undefined } : at
}
const samePlace = (a: Place, b: Place): boolean => a.day === b.day && a.minute === b.minute && a.length === b.length && (a.until ?? '') === (b.until ?? '')
/** The days a draft covers in Month, first to last. */
export const daysOf = (at: Place): string[] => {
  const out = [at.day]
  for (let day = dayjs(at.day).add(1, 'day'); at.until && dayKey(day) <= at.until; day = day.add(1, 'day')) out.push(dayKey(day))
  return out
}
/** A place said as one line, what a draft drawn there is told (`DraftMark`'s `at`). */
export const placeKey = (at: Place): string => `${at.day}|${at.minute ?? ''}|${at.until ?? ''}`
// Where the draft was drawn just before its words moved it, and the place it was moved to: the draft drawn there
// travels from that spot, once. Kept for that place alone, so no other draft ever sets off from it.
let travel: { to: string; rect: DOMRect } | null = null
/** The page turned to show where the words put the draft: it is simply there, nothing travels. */
export const stayPut = (): void => void (travel = null)

/** Kept clear of the window's edges, and of the traffic lights (DESIGN.md, The Room to Breathe Rule). */
const ROOM = { top: 52, right: 12, bottom: 12, left: 12 }
/** One width, for an event and for a task. */
const WIDE = 320
/**
 * The room kept under the popover as it opens, for what may open inside it: as tall as the tallest of an open thing's
 * rows (an event's “Repeat”), and for a new one the difference between a task and an event with a line or two more read
 * back. In rem, so it follows the interface size.
 */
const KEPT = { open: 18, fresh: 6 }
/** How far past the middle of what it is tied to the popover's own bottom edge always reaches, so its point is on its side and never under it. */
const TIE = 28
/**
 * The tallest thing beside which the point is the placed box's own (`Shell`), in rem: the middle of a thing this tall is
 * always within the smallest card (a new task's), so the point is on the card's edge. Beside a taller thing (a long
 * afternoon) the point is the card's, and goes no lower than the card does.
 */
const TALL = 17.5
type Side = 'right' | 'left' | 'bottom' | 'top'
/** Beside the draft where there is room for it, on the right first; with none on either side, under it, or over it: never on top of it. */
const sideFor = (at: DOMRect): Side => {
  const need = WIDE + 7 + 6 + ROOM.right
  if (window.innerWidth - at.right >= need) return 'right'
  if (at.left >= need) return 'left'
  return window.innerHeight - at.bottom >= at.top - ROOM.top ? 'bottom' : 'top'
}

/**
 * A day's (or a time's) own right-click lines, the same two wherever a thing can be added to a day: the Calendar's
 * month, its hours and its all-day lane, Home's month and the Journal's.
 */
export const addLines = (open: (to: Add) => void, day: string, minute: number | null, taskLength = 30): RowItem[] => [
  { label: 'New event here', icon: <CalendarPlus />, run: () => open({ day, minute, length: minute === null ? 0 : 60, kind: 'event' }) },
  { label: 'New task here', icon: <SquareCheck />, run: () => open({ day, minute, length: minute === null ? 0 : taskLength, kind: 'task' }) }
]

// The draft's words as they are typed, for the draft on the grid alone: the page itself is not drawn again for a letter.
let said = ''
const heard = new Set<() => void>()
const say = (next: string): void => { if (next !== said) (said = next), heard.forEach((run) => run()) }
const useSaid = (): string => useSyncExternalStore((run) => (heard.add(run), () => void heard.delete(run)), () => said)

const TASK_INK = 'var(--tt-brand-color-400)'
/** The app's slow spring (lib/motion.ts `spring.slow`) as the browser's own easing, for a move the browser plays itself. */
const SLOW: KeyframeAnimationOptions = (() => {
  const { ease, duration } = createGeneratorEasing({ duration: spring.slow.duration * 1000, bounce: spring.slow.bounce }, 100, springCurve)
  return { duration: duration * 1000, easing: generateLinearEasing(ease, duration * 1000) }
})()

/**
 * The thing being made, drawn where it will be before it is: an event a soft
 * fill in its calendar's colour, a task an outline with its round tick (the two
 * marks the grid already has for them), ringed as the one picked is, with the
 * words as they are typed. A line in a month's day, a chip in the all-day
 * lane, a block at its hours. The popover is tied to it.
 */
export function DraftMark({ kind, color, shape, time, style, ref, at, bar }: {
  kind: 'event' | 'task'; color: string; shape: 'line' | 'chip' | 'block'
  /** A block's hours, under its name. */
  time?: string
  style?: React.CSSProperties
  ref?: React.Ref<HTMLDivElement>
  /** Where it is drawn, said as one line: when its words move it there, it travels from where it was. */
  at?: string
  /** One piece of a bar across days in Month: which of its ends this piece holds (the popover is tied to one of them). */
  bar?: { start: boolean; end: boolean }
}): React.JSX.Element {
  const words = useSaid()
  const own = useRef<HTMLDivElement | null>(null)
  // Moved by its words ("fri 1pm"), it travels from where it was to where it is now drawn on the app's spring, its
  // popover following it there (Shell, `updatePositionStrategy`). With Motion off or Reduce motion it is simply there.
  // Brought into sight first, at once, so it lands where it can be seen (an evening below the hours shown).
  // The spot it left is let go of once it has arrived, not as it sets off: run twice (the development build's StrictMode
  // runs each effect, puts it away, then runs it again), the second run sets off again from the same spot rather than
  // finding nothing and leaving the draft where the first run's stop held it, at the spot it left.
  useLayoutEffect(() => {
    const el = own.current
    const mine = travel && travel.to === at ? travel : null
    if (!el || !mine || bar || still()) return
    el.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'instant' })
    const to = el.getBoundingClientRect()
    const [x, y] = [mine.rect.left - to.left, mine.rect.top - to.top]
    if (Math.abs(x) < 1 && Math.abs(y) < 1) return void (travel = null)
    // It flies over the page: a copy of it, laid over where it is going, sets off from where it was, and the draft itself
    // waits unseen in its new place until the copy lands there. Moved inside its day, it was cut off by the day's edges
    // (a month's day holds what is in it): it vanished from the day it left and showed only coming in over its new day's
    // edge. Played by the browser on the app's slow spring (`SLOW`), by its left and top: the page sets them at each
    // frame before anything that frame reads them, and its popover, placed again from the copy at every frame
    // (AddPopover), is drawn in the same frame. As a transform, the compositor played it on a clock of its own and,
    // with the page a frame behind under load, the copy ran in under its popover's edge.
    const flying = el.cloneNode(true) as HTMLElement
    for (const name of ['data-cal-draft', 'data-cal-draft-at']) flying.removeAttribute(name)
    flying.setAttribute('data-cal-draft-flying', '')
    flying.setAttribute('aria-hidden', 'true')
    Object.assign(flying.style, { position: 'fixed', left: `${to.left}px`, top: `${to.top}px`, width: `${to.width}px`, height: `${to.height}px`, margin: '0', zIndex: '40', pointerEvents: 'none' })
    document.body.append(flying)
    el.style.visibility = 'hidden'
    const land = (): void => void (flying.remove(), el.style.removeProperty('visibility'))
    const going = flying.animate([{ left: `${mine.rect.left}px`, top: `${mine.rect.top}px` }, { left: `${to.left}px`, top: `${to.top}px` }], SLOW)
    going.onfinish = () => (land(), void (travel === mine && (travel = null)))
    return () => (going.cancel(), land())
  }, [at]) // eslint-disable-line react-hooks/exhaustive-deps
  const look: React.CSSProperties = kind === 'event' ? tint(color) : { background: 'var(--background)', border: `1.5px solid color-mix(in oklab, ${TASK_INK} 75%, transparent)`, color: 'var(--foreground)' }
  const box = shape === 'block' ? 'absolute inset-x-1 z-20 flex-col rounded-[6px] px-1.5 pt-[3px]' : shape === 'chip' ? 'h-6 items-center gap-1 rounded-[5px] px-1.5' : 'mt-0.5 h-[calc(1.25rem-2px)] shrink-0 items-center gap-1 rounded-[5px] px-1.5'
  const tie = (node: HTMLDivElement | null): void => {
    own.current = node
    if (typeof ref === 'function') ref(node)
    else if (ref) (ref as React.RefObject<HTMLDivElement | null>).current = node
  }
  return (
    <div ref={tie} data-cal-draft={kind} data-cal-draft-at={at} data-cal-draft-start={bar?.start || undefined} data-cal-draft-end={bar?.end || undefined} data-cal-draft-bar={bar ? '' : undefined}
      className={`flex min-w-0 overflow-hidden text-left text-control leading-snug ${box}`} style={{ ...look, outline: '2px solid var(--ring)', outlineOffset: shape === 'block' ? 1 : -2, ...style }}>
      <span className="flex min-w-0 items-center gap-1">
        {kind === 'task' && <span aria-hidden className="size-3 shrink-0 rounded-full border-[1.5px]" style={{ borderColor: TASK_INK }} />}
        <span dir="auto" data-cal-draft-name className="truncate font-semibold">{words || (kind === 'event' ? 'New event' : 'New task')}</span>
      </span>
      {shape === 'block' && time && <span className="truncate text-meta tabular-nums">{time}</span>}
    </div>
  )
}

/**
 * What a popover is open on, for as long as the popover is on the page. Let go (Esc, a press elsewhere, “Open”, ↵, a
 * save), the popover leaves by its clip, as it came and as every popover here does; until it has gone (`gone`, which
 * the popover calls as it is taken off the page) it is still drawn on what it was open on, its draft with it. Taken
 * off at once with its draft, it was the one popover that vanished. Another popover that takes its place (`taken`)
 * takes it at once; with Motion off or Reduce motion nothing plays and it is gone at once.
 */
export function useLeaving<T>(live: T | null, taken = false): { kept: T | null; gone: () => void; turn: number } {
  const [was, setWas] = useState<T | null>(live)
  const [kept, setKept] = useState<T | null>(null)
  // Each opening is a popover of its own (`turn` goes in its key): one opened while the last is still leaving, on the
  // same day, is put on the page anew, and the one leaving is taken off at once.
  const [turn, setTurn] = useState(0)
  if (was !== live) {
    setWas(live)
    setKept(live || taken ? null : was)
    if (live && !was) setTurn(turn + 1)
  } else if (kept && taken) setKept(null)
  const gone = useCallback(() => setKept(null), [])
  return { kept: live ? null : kept, gone, turn }
}

/**
 * Decides the popover's box once, as the popover is put on the page (and again only if it changes sides as it opens):
 * as tall as the card is now plus the room kept for it (`Shell`). It is a child of the card because the card is put on
 * the page a pass after `Shell` itself is (a portal): an effect of `Shell`'s own found nothing there, and never ran again.
 */
function Kept({ side, room }: { side: Side; room: (tall: number) => number }): React.JSX.Element {
  const mark = useRef<HTMLSpanElement>(null)
  const now = useRef(room)
  now.current = room
  useLayoutEffect(() => {
    const face = mark.current?.closest<HTMLElement>('[data-cal-add]')
    const box = face?.parentElement
    if (!face || !box) return
    const tall = face.getBoundingClientRect().height
    box.style.height = `${Math.ceil(tall + now.current(tall))}px`
  }, [side])
  return <span ref={mark} hidden />
}

/** Says when the popover it is in has been taken off the page (after it has left by its clip, or at once when nothing plays). */
function Gone({ run }: { run?: () => void }): null {
  const now = useRef(run)
  now.current = run
  useEffect(() => () => now.current?.(), [])
  return null
}

/**
 * A box that takes its height from what it holds, and moves to a new one on the app's spring (at once with Motion off
 * or Reduce motion, and when a key made the change). The height is held here, in a value of the box's own, from its first measure. Left to Motion's
 * `animate` with `initial={false}`, the first height (known only a render after the box is made) was taken as the place
 * the box already was: noted, never written to it. So the box held no height, grew at once with what it holds, and the
 * first change of every popover (Event to Task, a row opening) had nothing left to move; only the second sprang.
 */
function Sized({ face, children }: {
  /** Which of its faces it shows (a new one's Event or Task). When that changes to a shorter one, what leaves stays drawn until the height has arrived. */
  face?: string
  children: React.ReactNode
}): React.JSX.Element {
  const inner = useRef<HTMLDivElement>(null)
  const height = useMotionValue<number | string>('auto')
  // The face it had, as it was drawn, taken as the next one is about to replace it (the page still holds the old one
  // while this runs). Only when the face changes: a letter typed takes no copy.
  const shown = useRef(face)
  const old = useRef<{ node: Node; at: number } | null>(null)
  if (face !== shown.current) {
    shown.current = face
    const node = inner.current?.cloneNode(true)
    old.current = node ? { node, at: performance.now() } : null
  }
  // What the rest of the popover adds to the box: its top row and its edges (not a whole number at every interface size).
  const rest = useRef(0)
  // Drawn so that the whole popover is a whole number of pixels tall, at every frame. The spring gives a height with a
  // fraction; the popover's placement reads that back to three decimals, and its sum (moved up to fit the window, then
  // asked once more whether it fits) could leave a hair over, 1e-13px. For that frame the popover was placed by its
  // other end, some 270px away, and came back on the next: a flash at the end of every row opened low in the window.
  const whole = useTransform(height, (now) => (typeof now === 'number' ? Math.ceil(now + rest.current - 0.001) - rest.current : now))
  useLayoutEffect(() => {
    const el = inner.current
    if (!el) return
    let going: { stop: () => void } | null = null
    // What is leaving, drawn under what took its place until the box has closed over it.
    let leaving: HTMLElement | null = null
    const gone = (): void => { leaving?.remove(); leaving = null }
    // Read as what it holds is laid out anew (a ResizeObserver runs once layout is done, so the read costs nothing).
    const fit = (): void => {
      const box = el.parentElement
      const pop = box?.parentElement
      if (box && pop) rest.current = pop.getBoundingClientRect().height - box.getBoundingClientRect().height
      const to = Math.ceil(el.getBoundingClientRect().height)
      const from = height.get()
      // The face just replaced, if this is the change that replaced it (a copy from an earlier change is never drawn).
      // Kept in hand until it is drawn: the new face is first laid out as tall as the old one and comes to its own
      // height a frame later.
      const was = old.current && performance.now() - old.current.at < 200 ? old.current.node : null
      if (!was) old.current = null
      going?.stop()
      going = null
      // Its first height, or nothing may travel, or a key did it (words typed in the line change what is read back
      // under it at every letter; reached by a key, nothing moves), or a row's fold inside it is moving and brings the
      // height with it (calendar-events.tsx, `Fold`): simply that tall, written now, before this frame is drawn (left
      // to the next frame, the box was one step behind what it holds, a strip of bare surface while a row closed).
      if (typeof from !== 'number' || still() || byKeys() || el.querySelector('[data-fold-moving]')) {
        gone()
        if (box) box.style.height = `${Math.ceil(to + rest.current - 0.001) - rest.current}px`
        return height.set(to)
      }
      if (from === to) return gone()
      // A shorter face (Event to Task): the old one's lower part stays drawn under the new one, cut by the box's own
      // lower edge as it closes over it, and is taken off the page when the height has arrived. Nothing bare meanwhile.
      // (The new face may settle its own height a frame later, what it reads back arriving: what is leaving stays through
      // that, cut where the new face now ends.)
      if (to >= from) gone()
      else if (leaving && !(was instanceof HTMLElement)) leaving.style.clipPath = `inset(${to}px 0 0 0)`
      else if (was instanceof HTMLElement && box) {
        old.current = null
        gone()
        leaving = document.createElement('div')
        leaving.setAttribute('aria-hidden', 'true')
        leaving.setAttribute('data-cal-leaving', '')
        leaving.inert = true
        leaving.style.cssText = `position:absolute;left:0;right:0;top:0;pointer-events:none;clip-path:inset(${to}px 0 0 0)`
        for (const one of [was, ...was.querySelectorAll('[id], [for], [name]')]) (one.removeAttribute('id'), one.removeAttribute('for'), one.removeAttribute('name'))
        leaving.append(was)
        box.append(leaving)
      }
      going = animate(height as MotionValue<number>, to, { ...spring.slow, onComplete: gone })
    }
    fit()
    const watch = new ResizeObserver(fit)
    watch.observe(el)
    return () => (watch.disconnect(), going?.stop(), gone())
  }, [height])
  return (
    <motion.div data-cal-add-sized style={{ height: whole }} className="mf-more relative min-h-0 shrink overflow-x-hidden overflow-y-auto [scrollbar-width:none]">
      <div ref={inner}>{children}</div>
    </motion.div>
  )
}

/**
 * The popover itself, the one a new event or task is written in and the one an
 * event or a task opens in: one width, its top row (which never moves), then
 * the line and what is under it, as tall as they are; tied by its point to what
 * it is about, beside it and never over it.
 */
function Shell({ kind, label, side, opened, head, children, tied, onEscape, onKeep, onOutside, onGone, leaving = false }: {
  kind: 'event' | 'task'; label: string; side: Side
  /** The event's key or the task's id, when it is open on one that exists. */
  opened?: string
  head: React.ReactNode
  children: React.ReactNode
  /** What it is tied to on the page (a draft, a block, a chip, a row), read as it opens. */
  tied: () => Element | null
  onEscape: () => void
  /** ⌘↵: kept (or made), and closed. */
  onKeep: () => void
  onOutside: () => void
  /** It has been taken off the page. */
  onGone?: () => void
  /**
   * It has been let go and is on its way out (`useLeaving`): it answers nothing more. Still on the page for a tenth of a
   * second, it took a press elsewhere as its own, and a press on “New event” or on another day shut the popover that
   * very press had just opened.
   */
  leaving?: boolean
}): React.JSX.Element {
  const beside = side === 'right' || side === 'left'
  // While it is up, no tip comes up beside or over it from the page (ui.tsx, `stage`): one floating thing at a time.
  useEffect(() => stage(), [])
  // Its place is decided once, as it opens, for the tallest it can become. What is placed is a box with nothing drawn
  // (popover.tsx, `bare`), as tall as the popover is now plus the room kept for what may open in it; the popover is the
  // card at the box's top and grows down into that room. So the box never changes size, nothing places it again, and
  // the card's top edge and every row above a change stay exactly where they are: the row just pressed never moves from
  // under the pointer. (Placed again at each change, a popover low in the window grew upward: “Reminder” went up 156px
  // as its choices opened.) The room kept is only what there is under the thing it is tied to: the card's bottom edge
  // always reaches past that thing's middle, so its point stays on its side. With no room under it (the last hours of
  // a day, a window 400 tall, a popover over or under its thing) the box is the card as it opened, and what opens shows
  // inside the card's own scroller, behind its fade; nothing scrolls by itself.
  const room = (tall: number): number => {
    const at = side === 'top' ? null : tied()?.getBoundingClientRect()
    const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16
    // Beside its thing: down to the window's edge from just past the thing's middle. Under it: what is left below the
    // popover where it opens (its gap and its point are 13px). Over it: none, it would grow down onto its thing.
    const under = !at ? 0 : window.innerHeight - ROOM.bottom - (beside ? at.top + at.height / 2 + TIE : at.bottom + 13 + tall)
    return Math.max(0, Math.min((opened ? KEPT.open : KEPT.fresh) * rem, under))
  }
  // Whose the point is (see the card below), decided as it opens, with its side.
  const [boxPoint, setBoxPoint] = useState(beside)
  useLayoutEffect(() => {
    const at = tied()?.getBoundingClientRect()
    setBoxPoint(beside && (!at || at.height <= TALL * (parseFloat(getComputedStyle(document.documentElement).fontSize) || 16)))
  }, [side]) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <PopoverContent bare data-cal-hold data-takes-keys role="dialog" aria-label={label}
      // A new one's draft moves as its words are read ("fri 1pm"): where the draft is is read at every frame, and the
      // popover placed again whenever it has moved, so it rides beside its draft all the way there, never over it.
      updatePositionStrategy={opened ? 'optimized' : 'always'}
      // Open on a thing that exists, it is beside the page as its side panel is (ui.tsx, `typing`): a change made in its rows
      // is taken back by ⌘Z while it is still open, and a plain key typed in it stays in it. A new one being written
      // holds every key, as before.
      data-beside={opened ? '' : undefined}
      // A field in it that lets go of the keys (↵ in the place, a tag kept) hands them to the popover itself, never to the
      // page under it: there, the next ↵ started a new event on the day picked.
      onBlurCapture={(event) => void (opened && !event.relatedTarget && event.currentTarget.focus({ preventScroll: true }))} side={side} align={beside ? 'start' : 'center'} alignOffset={beside ? -14 : 0} sideOffset={6} arrowPadding={14} collisionPadding={ROOM}
      style={{ width: WIDE }} className="max-w-[calc(100vw-1.5rem)]"
      onOpenAutoFocus={(event) => event.preventDefault()}
      // Esc in a "which times" asked over it answers the ask alone: the popover stays, with its words.
      onEscapeKeyDown={(event) => (event.preventDefault(), !leaving && !document.querySelector('[data-scope-ask]') && onEscape())}
      // ⌘↵ keeps it too, as ↵ does (the key the side panel kept for "keep and close").
      onKeyDown={(event) => {
        if (leaving || event.key !== 'Enter' || !event.metaKey || event.shiftKey || event.altKey || event.ctrlKey) return
        event.preventDefault()
        event.stopPropagation()
        onKeep()
      }}
      onFocusOutside={(event) => event.preventDefault()}
      onPointerDownOutside={(event) => {
        event.preventDefault()
        if (leaving) return
        // The draft is part of it, and so are a notice (its Undo is the notice's own act, not a click away), any menu over it and a "which times" asked.
        if ((event.target as Element | null)?.closest?.('[data-cal-draft], [role="status"], [role="menu"], [data-scope-ask], [data-radix-popper-content-wrapper]')) return
        onOutside()
      }}>
      {/* The popover itself: the card, at the box's top. Beside its thing, the point belongs to the box that is placed,
          not to the card. Where the point can go is worked out from the height of the box it stands in, and inside the
          card (frosted, so the card is that box) the sum took the card's height while the popover was placed by the
          box's: the popover sat 45px above its draft with its point off the draft, and moved 19px when Event turned to
          Task beside a month's line. Over or under its thing, or beside one taller than `TALL`, the point stays in the
          card: on its edge whatever its height (over or under, the sum goes by widths, the same for both), or (beside a
          tall thing, where the sum moves nothing) no lower than the card reaches. Either way the point is on the side the
          clip shows from its first frame to its last, so it comes and goes with the card. */}
      <div data-cal-add={kind} data-cal-open={opened} className={`${FLOAT} mf-pop-card pointer-events-auto flex max-h-full min-h-0 w-full flex-col rounded-float text-control ${POP_ISLANDS}`}>
        {/* On the one left edge the line and the reading under it keep. */}
        <div className="flex shrink-0 items-center px-3 pt-3">{head}</div>
        <Sized face={kind}>{children}</Sized>
        {!boxPoint && <PopoverArrow />}
        <Kept side={side} room={room} />
        <Gone run={onGone} />
      </div>
      {/* A press on the point is a press on the popover, as it was inside the card (the box itself takes no clicks). */}
      {boxPoint && <PopoverArrow className="pointer-events-auto" />}
    </PopoverContent>
  )
}

/**
 * The popover a new event or task is written in, tied by its point to the
 * draft on the grid, as Calendar on the Mac ties its own: "Event | Task" at
 * the top (it never moves), then the one line to type in with what it
 * understood read back under it, at one width for both; the height follows
 * what it holds. ↵ makes it. Esc takes the draft away (with words typed, a
 * notice whose Undo brings them back); a click anywhere else makes it when
 * there are words, and takes the draft away when there are none.
 */
export function AddPopover({ add, level, onChange, onClose, onAgain, onGone, leaving }: {
  /** It has left and been taken off the page (`useLeaving`). */
  onGone?: () => void
  /** It has been let go and is leaving: it answers nothing more. */
  leaving?: boolean
  add: Add
  /** The level of the Calendar in front, where the draft is drawn. */
  level: React.RefObject<HTMLElement | null>
  onChange: (patch: Partial<Add>) => void
  onClose: () => void
  /** The same draft again, holding its words: what an Undo asks for. */
  onAgain: (add: Add) => void
}): React.JSX.Element {
  const words = useState(add.words ?? '')
  const [text] = words
  useEffect(() => () => say(''), [])
  const held = useRef<(() => Promise<void>) | null>(null)
  const drawn = placeOf(add)
  // The words read a when of their own ("fri 1pm"): the draft moves there, travelling from where it is drawn now; read
  // back to none, it goes back where it was put.
  const now = useRef(add)
  now.current = add
  const onPlace = (to: Place): void => {
    const was = now.current
    if (samePlace(placeOf(was), to)) return
    const at = samePlace(was, to) ? undefined : to
    // From where it is seen now: still flying from its last move, the copy in the air.
    const rect = (document.querySelector('[data-cal-draft-flying]') ?? level.current?.querySelector('[data-cal-draft]:not([data-cal-draft-bar])'))?.getBoundingClientRect()
    travel = rect ? { to: placeKey(placeOf({ ...was, at })), rect } : null
    onChange({ at })
  }
  useEffect(() => () => void (travel = null), [])
  // Where it goes, read as it opens and again as its words move its draft, from the draft it is tied to; a day with no
  // room to draw its draft (a narrow month's dots) ties it to the day itself. A bar across days (dragged across in
  // Month) ties it to the bar's end with room beside it, else its start with room before it, else its end, above or under.
  const [side, setSide] = useState<Side>('right')
  const [bare, setBare] = useState<HTMLElement | null>(null)
  const rest = (el: HTMLElement): DOMRect => {
    // Where it rests: a draft setting off on its way here is drawn where it was for a frame (DraftMark).
    const box = el.getBoundingClientRect()
    const moved = new DOMMatrixReadOnly(getComputedStyle(el).transform)
    return new DOMRect(box.left - moved.m41, box.top - moved.m42, box.width, box.height)
  }
  // What it is tied to, read afresh at every frame (Shell, `updatePositionStrategy`): the draft's copy while it flies to
  // where its words put it (DraftMark), else the bar's piece chosen below, else the draft wherever it is drawn now (moved
  // to another day, it is a new element there), else its day.
  // One anchor for the popover's whole life: tied to an element, it stayed tied to the draft its words had just taken
  // off the page until the page told it of the new one, a frame or more later (qa/cal-add.mjs read 3 frames of 109 with
  // the draft under its popover).
  const tiedNow = useRef<() => Element | null>(() => null)
  tiedNow.current = () => document.querySelector('[data-cal-draft-flying]') ?? bare ?? level.current?.querySelector('[data-cal-draft]') ?? level.current?.querySelector(`[data-day="${drawn.day}"], [data-cal-col="${drawn.day}"]`) ?? null
  const [anchor] = useState(() => {
    let last = new DOMRect()
    return { current: { getBoundingClientRect: (): DOMRect => { const el = tiedNow.current(); if (el?.isConnected) last = el.getBoundingClientRect(); return last } } }
  })
  useLayoutEffect(() => {
    const end = level.current?.querySelector<HTMLElement>('[data-cal-draft-end]')
    if (end) {
      // Beside its end, else before its start, else under its last piece, else over its first: the first of those where
      // the card, pushed up or down to fit the window as it will be, covers no piece of the bar. Beside a bar over three
      // weeks low in the window, the card was pushed up over the whole week above it.
      const start = level.current?.querySelector<HTMLElement>('[data-cal-draft-start]') ?? end
      const [last, first] = [rest(end), rest(start)]
      const pieces = [...(level.current?.querySelectorAll<HTMLElement>('[data-cal-draft-bar]') ?? [])].map(rest)
      // The card's height: as it opens, the popover's card is put on the page a pass after this (it is a portal), so its
      // usual height stands in, a little over a new event's.
      const tall = document.querySelector('[data-cal-hold] [data-cal-add]')?.getBoundingClientRect().height || 16 * (parseFloat(getComputedStyle(document.documentElement).fontSize) || 16)
      const fit = (top: number): number => Math.max(ROOM.top, Math.min(top, window.innerHeight - ROOM.bottom - tall))
      const clear = (left: number, top: number): boolean => left >= ROOM.left && left + WIDE <= window.innerWidth - ROOM.right && top >= ROOM.top && top + tall <= window.innerHeight - ROOM.bottom
        && pieces.every((one) => left >= one.right || left + WIDE <= one.left || top >= one.bottom || top + tall <= one.top)
      const middle = (one: DOMRect): number => Math.max(ROOM.left, Math.min(one.left + one.width / 2 - WIDE / 2, window.innerWidth - ROOM.right - WIDE))
      const ways: [HTMLElement, Side, boolean][] = [
        [end, 'right', clear(last.right + 13, fit(last.top - 14))],
        [start, 'left', clear(first.left - 13 - WIDE, fit(first.top - 14))],
        [end, 'bottom', clear(middle(last), last.bottom + 13)],
        [start, 'top', clear(middle(first), first.top - 13 - tall)]
      ]
      const [tie, way] = ways.find(([, , ok]) => ok) ?? [end, sideFor(last)]
      setBare(tie)
      tie.scrollIntoView({ block: 'nearest', inline: 'nearest' })
      return setSide(way)
    }
    const at = level.current?.querySelector<HTMLElement>('[data-cal-draft]') ?? level.current?.querySelector<HTMLElement>(`[data-day="${drawn.day}"], [data-cal-col="${drawn.day}"]`) ?? null
    setBare(null)
    if (!at) return
    at.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    setSide(sideFor(rest(at)))
  }, [drawn.day, drawn.minute, drawn.until, level])
  const away = (): void => {
    const typed = text.trim()
    chime('away')
    onClose()
    if (typed) toast(`Not added: ${quoted(typed, 60)}`, () => onAgain({ ...add, words: typed }), 'info')
  }
  const outside = (): void => {
    const save = held.current
    held.current = null
    if (save) void save()
    else chime('away')
    onClose()
  }
  const keep = (): void => {
    const save = held.current
    // With nothing typed it says why not.
    if (!save) return refuse(add.kind === 'event' ? 'Nothing to add yet: type a name for the event' : 'Nothing to add yet: type the task')
    held.current = null
    void save()
    onClose()
  }
  return (
    <>
      <PopoverAnchor virtualRef={anchor} />
      <Shell kind={add.kind} label={add.kind === 'event' ? 'A new event' : 'A new task'} side={side} onEscape={away} onKeep={keep} onOutside={outside} onGone={onGone} leaving={leaving}
        tied={() => tiedNow.current()}
        head={<KindSwitch kind={add.kind} onKind={(kind) => onChange({ kind })} />}>
        {add.kind === 'event'
          ? <NewEvent ask={add} held={held} words={words} picked={[add.calendar ?? null, (calendar) => onChange({ calendar })]} onMade={onClose} onName={say} onPlace={onPlace} />
          : <NewTask ask={add} held={held} words={words} first="" onMade={onClose} onBack={(_id, typed) => onAgain({ ...add, words: typed })} onName={say} onPlace={onPlace} />}
      </Shell>
    </>
  )
}

/** An event or a task that is open in the popover, and the thing on the page it was opened from (a block, a chip, a row). */
export type Opened = ({ kind: 'event'; key: string } | { kind: 'task'; id: string }) & {
  at: HTMLElement | null
  /** The words its line opens holding, when they are not its name: a name typed and not kept, brought back by a notice's Undo. */
  words?: string
}

/**
 * The same popover, open on an event or a task that exists: tied to it where
 * it is on the page, its name in the line (typed over and read as a new one's
 * words are: "fri 1pm" moves it), where it is read back under it, and “Open”
 * for its whole page. Each change is kept as it is made and said with Undo.
 * ↵ keeps the line and closes; so does a click anywhere else; Esc closes and
 * leaves the name as it was, and with a name typed and not kept a notice says
 * so, whose Undo brings the popover back holding the words, as a new one's does.
 */
export function OpenPopover({ opened, event, task, level, onClose, onPage, onKey, onAgain, onGone, leaving }: {
  /** It has left and been taken off the page (`useLeaving`). */
  onGone?: () => void
  /** It has been let go and is leaving: it answers nothing more. */
  leaving?: boolean
  opened: Opened
  /** The event, as the page has it now. */
  event?: Shown
  task?: Task
  /** Where its block or chip is looked for when the thing it was opened from is gone (it moved to another day). */
  level: React.RefObject<HTMLElement | null>
  onClose: () => void
  /** Its whole page (the side panel). */
  onPage: () => void
  /** A change made it another one (one time of a repeating event, cut loose): the popover follows it. */
  onKey: (key: string) => void
  /** Open on it again, its line holding these words: what the Undo of "Not kept" asks for. */
  onAgain: (words: string) => void
}): React.JSX.Element | null {
  // ⌘K opened over the page puts an opened event or task's card away, as a click away does: one floating thing at a time.
  useEffect(() => {
    const away = (): void => void (!leaving && onClose())
    window.addEventListener('haligtree:palette', away)
    return () => window.removeEventListener('haligtree:palette', away)
  }, [leaving, onClose])
  const held = useRef<(() => Promise<void>) | null>(null)
  // Its name as its line shows it (a task's without its #tags), and the words in the line, kept here so Esc knows them.
  const name = event ? event.title : task ? taskName(task.title).text : ''
  const words = useState(opened.words ?? name)
  const id = opened.kind === 'event' ? opened.key : opened.id
  const day = event ? dayKey(event.start) : task?.dueAt ? dayKey(task.dueAt) : null
  // What it is tied to: the thing it was opened from while that is on the page; then its block or chip on the level in
  // front (after "fri 1pm" moved it); with neither drawn (a crowded day's "+3 more"), its day.
  const [at, setAt] = useState<HTMLElement | null>(null)
  const [side, setSide] = useState<Side>('right')
  const looked = useRef(false)
  useLayoutEffect(() => {
    const mark = CSS.escape(id)
    const found = opened.at?.isConnected ? opened.at
      : level.current?.querySelector<HTMLElement>(opened.kind === 'event' ? `[data-cal-event="${mark}"], [data-cal-event-chip="${mark}"]` : `[data-cal-block="${mark}"], [data-cal-untimed="${mark}"], [data-plan-task="${mark}"]`)
        ?? (day ? level.current?.querySelector<HTMLElement>(`[data-day="${day}"], [data-cal-col="${day}"]`) : null) ?? null
    // Nowhere on the page to tie it to (a crowded day's "+3 more", a month too narrow to name its things): its page
    // instead, never a click that does nothing. Gone from the page later (binned, moved out of sight): closed.
    if (!found) (looked.current ? onClose : onPage)()
    looked.current = true
    setAt((was) => (was === found ? was : found))
  })
  useLayoutEffect(() => {
    if (!at) return
    at.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    setSide(sideFor(at.getBoundingClientRect()))
  }, [at])
  if (!at || !(event || task)) return null
  const close = (): void => {
    const typed = words[0].trim()
    chime('away')
    onClose()
    // A name typed and not kept: said, with the way back to it.
    if (typed && typed !== name.trim() && !event?.readOnly) toast(`Not kept: ${quoted(typed, 60)}`, () => onAgain(typed), 'info')
  }
  const keep = (): void => {
    // A field of its rows being written in (the place) is kept as it lets go of the keys, as on its page.
    const active = document.activeElement as HTMLElement | null
    if (active?.closest('[data-event-rows], [data-task-rows]')) active.blur()
    const save = held.current
    held.current = null
    if (save) void save()
    onClose()
  }
  const kind = opened.kind
  const mark = event
    ? <span aria-hidden className="size-3 shrink-0 rounded-[4px]" style={{ background: event.color }} />
    : <span aria-hidden className="size-3 shrink-0 rounded-full border-[1.5px]" style={{ borderColor: TASK_INK }} />
  const slot = event
    ? { day: dayKey(event.start), minute: event.allDay ? null : dayjs(event.start).hour() * 60 + dayjs(event.start).minute(), length: Math.max(15, dayjs(event.end).diff(dayjs(event.start), 'minute')) }
    : { day: day ?? dayKey(), minute: !task!.dueAt || task!.allDay ? null : dayjs(task!.dueAt).hour() * 60 + dayjs(task!.dueAt).minute(), length: task!.estimate ?? 0 }
  return (
    <>
      <PopoverAnchor virtualRef={{ current: at }} />
      <Shell kind={kind} opened={id} label={kind === 'event' ? 'The event' : 'The task'} side={side} onEscape={close} onKeep={keep} onOutside={keep} tied={() => at} onGone={onGone} leaving={leaving}
        head={
          <div className="flex h-8 min-w-0 flex-1 items-center gap-2 pl-0.5">
            {mark}
            {/* One of your Mac's says whose it is and that it is read only, where the others say what they are. */}
            <span data-cal-open-kind className="min-w-0 flex-1 truncate text-control font-medium text-foreground">{event?.readOnly ? `${event.calendarId.replace(/^mac:/, '')}, read only` : kind === 'event' ? 'Event' : 'Task'}</span>
            {/* No tip on it: nothing floats over the popover, and its word says what it does. */}
            {!event?.readOnly && <Button type="button" variant="ghost" size="sm" data-cal-open-page aria-label={kind === 'event' ? 'Open the event’s page' : 'Open the task’s page'} className="-mr-1.5" onClick={onPage}>Open</Button>}
          </div>
        }>
        {event
          ? <>
              <NewEvent key={event.key} one={event} ask={slot} held={held} words={words} onMade={(key) => (key !== event.key ? onKey(key) : undefined, onClose())} />
              {!event.readOnly && <EventRows one={event} onKey={onKey} />}
            </>
          : <>
              <NewTask key={task!.id} task={task} ask={slot} held={held} words={words} first="" onMade={onClose} onBack={() => undefined} />
              <TaskRows task={task!} />
            </>}
      </Shell>
    </>
  )
}
