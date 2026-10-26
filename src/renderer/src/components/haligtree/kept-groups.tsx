import { Fragment, createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { DndContext, MeasuringStrategy, PointerSensor, closestCenter, pointerWithin, useDndContext, useSensor, useSensors, type CollisionDetection, type DragEndEvent, type DragMoveEvent, type DragStartEvent, type Modifier } from '@dnd-kit/core'
import { SortableContext, useSortable, type SortingStrategy } from '@dnd-kit/sortable'

/** dnd-kit moves no row itself: where each one slides is worked out once, for rows and panels alike (Shaped). */
const unmoved: SortingStrategy = () => null
import { AnimatePresence, animate, motion, motionValue, useMotionValue, useSpring, useTransform, type MotionValue } from 'motion/react'
import { BookOpen, ChevronRight, GripVertical, ImagePlus, Layers, Plus, X as Cross } from 'lucide-react'
import { saveImage } from '@/extensions/image-drop'

import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger } from '@/components/ui/context-menu'
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover'
import { IconPicker } from '@/components/emoji/icon-picker'
import { offerTag } from './side-folders'
import { CAPTURE_TYPES } from '../capture-kinds/capture-kind-picker'
import { chime, click } from '@/lib/sound'
import { slotTicker } from '@/lib/proximity'
import { archive } from '@/lib/notes'
import { byKeys, spring as springs, still } from '@/lib/motion'
import { GROUP_COLORS, groups, tintOf } from '@/lib/groups'
import { KEY, groupOf, groupsAround, isGroup, type How, type Layout } from '@/lib/group-layout'
import { cn } from '@/lib/cn'
import { Overlay, SETTLE } from './sortable'
import { copy } from './row-menu'
import { Rolling, Tip, VirtualList, refuse, toast, quietly } from './ui'
import type { Entry } from './note-list'
import { ROW_PAD, ROW_SHAPE, ROW_TILE } from './row-shape'
import { Branches } from './branches'
import { X } from '@/components/ui/icons'
import { brief, num } from '../../../../main/dates'

/** A group's heading, open or folded: a slim title bar, 36px tall, a page's tile high. */
const HEAD = 'h-9 py-0'

/**
 * Groups in a kept list, Dia's way with tabs: a row with an icon, a name in
 * bold and a chevron, folding its notes away under it. Pointed at, a soft
 * panel in the group's colour gathers the row and its notes, with an × to
 * separate them again (the notes stay; only the group goes).
 *
 * A carried row says what letting go would do before it happens. Over the
 * middle of a row, that row lifts and a panel opens around it with room for
 * the carried one: the group about to form (or the group it would join).
 * Near a row's top or bottom edge, only a line shows where it would go. And
 * a note carried out of its group leaves a gap its group closes over. A
 * small label by the pointer says it in words.
 */

export type GroupView = { id: string; name: string; icon: string | null; color: string | null; open: boolean; members: string[]; /** Coming apart (left with one note): drawn going. */ parting?: boolean; /** Its imported notes not yet sorted. */ unsorted?: string[] }
/** A part of a group: one of its notes, or a subgroup and its notes. */
export type Part = { entry: Entry } | { group: GroupView; entries: Entry[]; /** Its own notes and subgroups, three levels deep. */ parts?: Part[] }
/** The rows a part shows: one for a note, and an open subgroup's own on show, folded ones inside it left out. */
const onShow = (part: Part): number => ('entry' in part ? 1 : !part.group.open ? 0 : part.parts ? part.parts.reduce((sum, one) => sum + onShow(one), 0) : part.entries.length)
/** A line of the list: one note at the top level, or a group and its notes (every one, its subgroups' too), with `parts` in the order they show.
 * `head`: a loose note that starts a section of a list grouped by kind or date, the section's name and how many loose notes it holds. */
export type Bundle = { group?: GroupView; entries: Entry[]; parts?: Part[]; head?: [string, number] }

/** A section's name over its rows, in a list grouped by kind or date. */
export const SectionHead = ({ head, first }: { head: [string, number]; first: boolean }): React.JSX.Element => (
  <div data-group-head={head[0]} className={`px-2 pb-1 text-xs text-muted-foreground ${first ? 'pt-1' : 'pt-4'}`}>
    {head[0]} <span className="tabular-nums"><Rolling text={head[1]} /></span>
  </div>
)

/** The rows a group shows while open: its notes, and a subgroup's while that is open too. */
const shownIn = (one: { entries: Entry[]; parts?: Part[] }): number => (one.parts ? one.parts.reduce((n, part) => n + ('entry' in part ? 1 : part.group.open ? part.entries.length : 0), 0) : one.entries.length)

export type Folds = {
  bundles: Bundle[]
  /** In your own order: false while sorted some other way, when only joining or leaving a group means anything. */
  ordered: boolean
  /** What a drop would leave, worked out as the drop itself is: the layout before and after, and the rows on show after, in order. Null when nothing would change. */
  preview: (ids: string[], target: string, how: How) => { before: Layout; after: Layout; shown: string[] } | null
  /** A drop, for the list to work out and save: `ids` is everything carried, in the order it is read. */
  onDrop: (ids: string[], target: string, how: How) => void
  /** The rows picked (⌘-click, ⇧-click, x): carrying one of them carries them all. */
  picked: string[]
  /** Carrying a row that is not picked lets the picks go, as Finder does. */
  onLetGo: () => void
  onFold: (group: GroupView, open: boolean) => void
  /** A note just made in a group, to open. */
  onNewNote: (id: string) => void
  /** A group read as a page of its own. */
  onPage?: (id: string) => void
  /** A folder opened, as Finder opens one: the list shows only what it holds. */
  onOpenFolder?: (id: string) => void
  /** The group whose name is being written, as one just made is. */
  renaming: string | null
  onRenaming: (id: string | null) => void
  /** A group just made, which arrives rather than appears. */
  born: string | null
  /** "Sort these": a pass through a group's notes not yet sorted. */
  onSort?: (ids: string[]) => void
  /** Kept as they are: these notes sorted, or back to not yet sorted (for Undo). */
  onSorted?: (ids: string[], sorted: boolean) => void
}

/** Up and down only. */
const upDown: Modifier = ({ transform }) => ({ ...transform, x: 0 })
/** Over a row, that row; in the hair between two, the nearest. */
const collide: CollisionDetection = (args) => {
  const hit = pointerWithin(args)
  return hit.length ? hit : closestCenter(args)
}
/** Emil's ease-out, the curve everything here settles on. */
const OUT = 'cubic-bezier(0.23, 1, 0.32, 1)'
const INDENT = 0

/**
 * What letting go now would do, and the words for it: read off the layout the
 * drop itself would leave, so the hint and the result are one thing.
 */
type Aim = {
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
}
/** How far a group's panel's top and bottom edges move while something is carried, in pixels: down is more. */
type Shape = { top: number; bottom: number }
type Carry = {
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
}
const Carrying = createContext<Carry>({ aim: null, height: 0, span: 0, along: new Set(), hand: null, shapes: new Map(), snap: false, ys: new Map(), inset: 0 })
const same = (a: Aim | null, b: Aim | null): boolean => JSON.stringify(a) === JSON.stringify(b)

/**
 * The one clock every row, group head and panel part slides on. Whenever any
 * of their places changes, all of them start again together from where they
 * are now towards where they now go, on one shared progress: each is always
 * the same blend of two whole layouts, so no two ever cross, a box never comes
 * apart from its rows, and a row never leaves its box mid-glide. Each sliding
 * on its own clock, retargeted at its own moment, did all three for a frame or two.
 */
type Glider = { y: MotionValue<number>; scale: MotionValue<number>; from: [number, number]; to: [number, number] }
const gliders = new Set<Glider>()
const progress = motionValue(1)
let running: { stop: () => void } | null = null
let due = false
progress.on('change', (at) => {
  for (const one of gliders) {
    one.y.set(one.from[0] + (one.to[0] - one.from[0]) * at)
    one.scale.set(one.from[1] + (one.to[1] - one.from[1]) * at)
  }
})
/** Start every glider again from where it is, once for all the places a commit changed. */
const retarget = (): void => {
  if (due) return
  due = true
  queueMicrotask(() => {
    due = false
    running?.stop()
    for (const one of gliders) one.from = [one.y.get(), one.scale.get()]
    progress.jump(0)
    running = animate(progress, 1, SLIDE)
  })
}

/**
 * An element's slide on the one clock above; or at once, written in the same
 * frame React draws, so nothing shows a frame at its old place.
 */
function useGlide(y: number, scaleY: number, instant: boolean): { ref: (el: HTMLElement | null) => void; style: { y: MotionValue<number>; scaleY: MotionValue<number> } } {
  const my = useMotionValue(y)
  const ms = useMotionValue(scaleY)
  const el = useRef<HTMLElement | null>(null)
  const me = useRef<Glider>({ y: my, scale: ms, from: [y, scaleY], to: [y, scaleY] })
  const now = instant || still()
  useLayoutEffect(() => {
    const one = me.current
    gliders.add(one)
    return () => void gliders.delete(one)
  }, [])
  useLayoutEffect(() => {
    const one = me.current
    if (one.to[0] === y && one.to[1] === scaleY && !now) return
    one.to = [y, scaleY]
    if (now) {
      // Where it is and where it goes are the same: the shared clock leaves it there.
      one.from = [y, scaleY]
      my.jump(y)
      ms.jump(scaleY)
      if (el.current) el.current.style.transform = y || scaleY !== 1 ? `translateY(${y}px) scaleY(${scaleY})` : 'none'
      return
    }
    retarget()
  }, [y, scaleY, now]) // eslint-disable-line react-hooks/exhaustive-deps
  return { ref: useCallback((node: HTMLElement | null) => void (el.current = node), []), style: { y: my, scaleY: ms } }
}

function Node({ id, children, inner, indent = 0 }: { id: string; children: ReactNode; inner?: CSSProperties; indent?: number }): React.JSX.Element {
  // dnd-kit says where each row goes; the row glides there on the same clock as the groups' panels (PanelParts), so a
  // row and the box around it always move together, even turned back halfway. Its own CSS transition is off.
  // dnd-kit's own slide of a row whose place in the list changed (its layout animation) is off too: the list is redrawn as it lands.
  const { setNodeRef, attributes, listeners, isDragging } = useSortable({ id, transition: null, animateLayoutChanges: () => false })
  const { aim, height, span, along, snap, ys, inset } = useContext(Carrying)
  // What is carried never slides through the other rows: its room is simply there, shown once they have made way.
  // Let go, the list is drawn as the drop left it, so every row is at once in place.
  const glide = useGlide(Math.round(ys.get(id) ?? 0), 1, isDragging || snap)
  const ref = useCallback((node: HTMLElement | null): void => void (setNodeRef(node), glide.ref(node)), [setNodeRef, glide.ref]) // eslint-disable-line react-hooks/exhaustive-deps
  // Anything that moves the room draws it anew, so it never shows while the rows are still making way.
  const place = aim ? `${aim.gap}:${aim.snug}:${aim.fit}:${span}` : ''
  const wait = still() ? undefined : `mf-room 100ms ${OUT} ${Math.round(SLIDE.duration * 800)}ms both`
  // A new group would form here: this row lifts, with a panel around it and the room under it.
  const forming = !!aim?.make && aim.target === id
  const lifted = forming
  // The carried row's own place travels to where it would land: the room the rows open, with a line in it.
  const room = isDragging && !!aim && aim.gap !== null
  return (
    <motion.div
      ref={ref}
      data-sortable-id={id}
      data-aim={aim?.target === id ? aim.how : undefined}
      {...attributes}
      {...listeners}
      tabIndex={-1}
      role={undefined}
      className="group/grip relative isolate"
      style={{ ...glide.style, opacity: isDragging && !room ? 0.3 : undefined }}
    >
      {/* That a row can be carried, said quietly: a grip in the margin by its left edge, only once the pointer has rested on it a moment. */}
      <GripVertical aria-hidden data-grip="" className="absolute top-1/2 size-3 -translate-y-1/2 text-muted-foreground/60 opacity-0 transition-opacity duration-150 group-hover/grip:opacity-100 group-hover/grip:delay-[400ms] motion-reduce:transition-none" style={{ left: indent - 13 }} />
      {room && (
        // One hint per drop: a soft band the size of the room, the line through its middle. Drawn anew at each new place.
        // It waits for the rows to make way, so it never shows over one sliding past.
        <Fragment key={place}>
          <span aria-hidden data-drop-room={along.size + 1} className="pointer-events-none absolute inset-x-1 rounded-md bg-[color-mix(in_srgb,var(--tt-brand-color-400)_6%,transparent)]" style={{ top: -inset, height: span - 2, animation: wait }} />
          {!aim.make && (
            <span
              aria-hidden
              data-drop-line={aim.how}
              className="pointer-events-none absolute right-2 h-0.5 -translate-y-1/2 rounded-full bg-(--tt-brand-color-400) before:absolute before:-top-[3px] before:-left-2 before:size-2 before:rounded-full before:border-2 before:border-(--tt-brand-color-400) before:bg-background"
              style={{ left: (aim.into ? INDENT : 0) + 12, top: span / 2 - inset, animation: wait }}
            />
          )}
        </Fragment>
      )}
      <AnimatePresence>
        {forming && (
          <motion.div
            key="forming"
            aria-hidden
            data-preview=""
            className="pointer-events-none absolute -inset-x-1 -top-1 -z-10 origin-top rounded-lg bg-[color-mix(in_srgb,var(--foreground)_5%,transparent)] shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--foreground)_8%,transparent)]"
            style={{ height: `calc(100% + ${height + 6}px)` }}
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98, transition: { duration: 0.1 } }}
            transition={still() ? { duration: 0 } : springs.moderate}
          >
            {/* Where the carried row would land: a quiet dashed place under the row it joins. */}
            <span className="absolute inset-x-2 bottom-1.5 rounded-md border border-dashed border-foreground/15" style={{ height: height - 6 }} />
          </motion.div>
        )}
      </AnimatePresence>
      <div
        className="transition-[scale,translate,opacity] duration-200 motion-reduce:transition-none"
        style={{ transitionTimingFunction: OUT, scale: lifted ? 1.02 : 1, paddingLeft: indent || undefined, ...inner, ...(room ? { opacity: 0 } : along.has(id) ? { opacity: 0.3 } : {}) }}
      >
        {children}
      </div>
    </motion.div>
  )
}

/**
 * The list itself, in place of the plain one. `face` draws a note's row as
 * every list does; `index` counts rows on show, which is what the keyboard's
 * cursor counts.
 */
export function GroupedList({ bundles, ordered, preview, onDrop, picked, onLetGo, onFold, onNewNote, onPage, onOpenFolder, renaming, onRenaming, born, onSort, onSorted, face, after, arrived, cursor, estimate, className }: Folds & {
  face: (entry: Entry, index: number) => React.JSX.Element
  after?: (entry: Entry) => ReactNode
  arrived: (id: string) => boolean
  cursor: number
  estimate: number
  className?: string
}): React.JSX.Element {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))
  const [carried, setCarried] = useState<string | null>(null)
  // A group carried is folded while it is in the hand: one card, its row, and what it holds goes with it, so the room
  // it opens is a row's and nothing it leaves behind is a hole. It opens again where it is let go.
  const open = (group: GroupView): boolean => group.open && carried !== KEY + group.id
  const partKeys = (one: Bundle): string[] => (one.parts ?? one.entries.map((entry) => ({ entry }))).flatMap((part) => ('entry' in part ? [part.entry.id] : [KEY + part.group.id, ...(open(part.group) ? part.entries.map((entry) => entry.id) : [])]))
  const keys = bundles.flatMap((one) => (one.group ? [KEY + one.group.id, ...(open(one.group) ? partKeys(one) : [])] : one.entries.map((entry) => entry.id)))
  const subsOf = (one: Bundle): { group: GroupView; entries: Entry[] }[] => (one.parts ?? []).filter((part): part is { group: GroupView; entries: Entry[] } => 'group' in part)
  const info = useMemo(() => new Map(bundles.flatMap((one) => (one.group ? [[one.group.id, one.group] as const, ...subsOf(one).map((sub) => [sub.group.id, sub.group] as const)] : []))), [bundles]) // eslint-disable-line react-hooks/exhaustive-deps
  // The group each row on show is in (the innermost), for what a drop would mean.
  const home = useMemo(() => new Map(bundles.flatMap((one) => (one.group ? [
    ...one.entries.map((entry) => [entry.id, one.group!.id] as const),
    ...subsOf(one).flatMap((sub) => sub.entries.map((entry) => [entry.id, sub.group.id] as const))
  ] : []))), [bundles]) // eslint-disable-line react-hooks/exhaustive-deps
  // Each subgroup's group.
  const parentOf = useMemo(() => new Map(bundles.flatMap((one) => (one.group ? subsOf(one).map((sub) => [sub.group.id, one.group!.id] as const) : []))), [bundles]) // eslint-disable-line react-hooks/exhaustive-deps
  // The rows on show in each group's block, its own row first: what its panel follows.
  const blockRows = useMemo(() => bundles.flatMap((one) => (one.group ? [
    { id: one.group.id, rows: [KEY + one.group.id, ...(open(one.group) ? partKeys(one) : [])] },
    ...subsOf(one).map((sub) => ({ id: sub.group.id, rows: [KEY + sub.group.id, ...(open(one.group!) && open(sub.group) ? sub.entries.map((entry) => entry.id) : [])] }))
  ] : [])), [bundles, carried]) // eslint-disable-line react-hooks/exhaustive-deps
  // Everything carried, in the order it is read: the row in hand, and the rest picked with it.
  const [many, setMany] = useState<string[]>([])
  // How far the pointer has carried things: the stack's back cards follow it a moment late.
  const dragY = useMotionValue(0)
  // And sideways: the card in hand follows the pointer left and right too (the list itself still reads only up and down).
  const dragX = useMotionValue(0)
  const manyRef = useRef<string[]>([])
  manyRef.current = many
  // Where the row was taken hold of, across it: the chip sits just past it.
  const [grab, setGrab] = useState(60)
  // The room what is carried takes: a row for each note, or a group's folded block.
  const [span, setSpan] = useState(0)
  // A group lifted, open: how tall it was, so the list keeps that height while it is folded in the hand and a list
  // scrolled to its end does not jump.
  const [unfolded, setUnfolded] = useState(0)
  const [rowH, setRowH] = useState(0)
  // Let go with a drop: until the next lift, rows go straight to their places.
  const [snap, setSnap] = useState(false)
  const spanRef = useRef(0)
  spanRef.current = span
  // A group carried: how far its row sits inside its block's air.
  const [inset, setInset] = useState(0)
  const insetRef = useRef(0)
  insetRef.current = inset
  const [aim, setAim] = useState<Aim | null>(null)
  const aimed = useRef<Aim | null>(null)
  const ticks = useRef(slotTicker()).current
  // A group carried takes its notes and its subgroups' rows along: they wait where they are.
  // Where the room opens: just after this row on show (-1, at the very top), so the rows slide apart by one row there.
  const point = (next: Aim | null): void => {
    if (same(aimed.current, next)) return
    aimed.current = next
    setAim(next)
    // Each new place (a gap, or "New group" on a row) ticks and taps once: nowhere is silent.
    if (next) ticks(`${next.how}:${next.target}:${next.into ?? ''}`)
  }
  const onDragStart = ({ active, activatorEvent }: DragStartEvent): void => {
    const id = String(active.id)
    dragY.jump(0)
    dragX.jump(0)
    // The list's own drag reads only up and down, so the sideways way is read off the pointer itself.
    const from = activatorEvent instanceof PointerEvent ? activatorEvent.clientX : null
    if (from !== null) {
      const follow = (event: PointerEvent): void => dragX.set(event.clientX - from)
      const done = (): void => (dragX.set(0), window.removeEventListener('pointermove', follow), window.removeEventListener('pointerup', done), window.removeEventListener('pointercancel', done))
      window.addEventListener('pointermove', follow)
      window.addEventListener('pointerup', done)
      window.addEventListener('pointercancel', done)
    }
    setSnap(false)
    chime('lift')
    ticks.start(id)
    setCarried(id)
    const all = bundles.flatMap((one) => one.entries.map((entry) => entry.id))
    if (!isGroup(id) && picked.includes(id) && picked.length > 1) setMany(all.filter((one) => picked.includes(one)))
    else {
      setMany([id])
      if (picked.length) onLetGo()
    }
    // Measured off the row itself: the drag's own first measure is not always taken yet at the lift.
    const start = document.querySelector<HTMLElement>(`[data-sortable-id="${CSS.escape(id)}"]`)?.getBoundingClientRect() ?? active.rect.current.initial
    setGrab(start && activatorEvent instanceof PointerEvent ? activatorEvent.clientX - start.left : 60)
    const row = start?.height ?? 48
    setRowH(row)
    const wrap = isGroup(id) ? document.querySelector<HTMLElement>(`[data-group-block="${CSS.escape(id.slice(KEY.length))}"]`)?.parentElement : null
    setInset(wrap && start ? start.top - wrap.getBoundingClientRect().top : 0)
    // A group's room is its block folded: as tall as it is less what it holds, from the lift on.
    const holds = wrap?.querySelector<HTMLElement>(':scope > [data-group-block] > [data-fold]')?.getBoundingClientRect().height ?? 0
    // Several carried: each one's own height, so a tall row among short ones makes room for itself, never three of it.
    const each = !isGroup(id) && picked.includes(id) && picked.length > 1 ? picked.map((one) => document.querySelector<HTMLElement>(`[data-sortable-id="${CSS.escape(one)}"]`)?.offsetHeight ?? row) : [row]
    setSpan(wrap ? wrap.getBoundingClientRect().height - holds : each.reduce((sum, one) => sum + one, 0))
    setUnfolded(wrap ? wrap.getBoundingClientRect().height : 0)
  }
  // Held over a folded group's row for a moment, the group opens, as a folder
  // does in Finder when something is held over it.
  const spring = useRef<{ key: string; timer: ReturnType<typeof setTimeout> } | null>(null)
  const unspring = (): void => {
    if (spring.current) clearTimeout(spring.current.timer)
    spring.current = null
  }
  const name = (group: string | null | undefined): string => info.get(group ?? '')?.name ?? 'the folder'
  // A group carried over the middle of anything inside a top-level group (its row, a subgroup's row, a note) aims at that group as a whole.
  const outerOf = (key: string): string | undefined => {
    const inner = isGroup(key) ? key.slice(KEY.length) : home.get(key)
    return inner ? parentOf.get(inner) ?? inner : undefined
  }
  const onDragMove = (event: DragMoveEvent): void => {
    lastMove.current = event
    const { active, activatorEvent, delta } = event
    dragY.set(delta.y)
    const id = String(active.id)
    // A group's room is its block folded, measured once it has folded.
    if (isGroup(id)) {
      const wrap = document.querySelector<HTMLElement>(`[data-group-block="${CSS.escape(id.slice(KEY.length))}"]`)?.parentElement
      const tall = wrap?.getBoundingClientRect().height
      if (tall && Math.abs(tall - spanRef.current) > 0.5) setSpan(tall)
    }
    const pointer = activatorEvent instanceof PointerEvent ? { x: activatorEvent.clientX + delta.x, y: activatorEvent.clientY + delta.y } : null
    if (!pointer) return point(null)
    // The row whose place the pointer is over, as the list lies before anything slid aside (as a sortable list reads it:
    // the room then opens just where the pointer is, and what it shows never feeds back into what is aimed at). In the
    // air between two rows, the nearer one.
    const known = new Set(keys)
    let over: { id: string; rect: { top: number; height: number } } | null = null
    let far = Infinity
    for (const node of document.querySelectorAll<HTMLElement>('[data-sortable-id]')) {
      const key = node.dataset.sortableId!
      if (!known.has(key)) continue
      const box = node.getBoundingClientRect()
      const top = box.top - new DOMMatrixReadOnly(getComputedStyle(node).transform).m42
      const off = pointer.y < top ? top - pointer.y : pointer.y > top + box.height ? pointer.y - top - box.height : 0
      if (off < far) (far = off, (over = { id: key, rect: { top, height: box.height } }))
    }
    if (!over) return point(null)
    const target: string = over.id
    // Over its own place: nothing changes.
    if (target === id) return point(null)
    const shut = target && !isGroup(id) ? info.get(target.slice(KEY.length)) : undefined
    if (!shut || shut.open || !isGroup(target!)) unspring()
    else if (spring.current?.key !== target) {
      unspring()
      spring.current = { key: target!, timer: setTimeout(() => (click('tick'), onFold(shut, true), (spring.current = null)), 600) }
    }
    if (manyRef.current.length > 1 && manyRef.current.includes(target)) return point(null)
    const ids = manyRef.current.length > 1 ? manyRef.current : [id]
    const at = (pointer.y - over.rect.top) / over.rect.height
    const middle = at > 0.28 && at < 0.72
    // A group carried over anything inside another group's block goes beside that whole block, so which side is read
    // against the block, not the row under the pointer: else every row's middle inside it flipped the room from above
    // the block to below it.
    let beside = target
    let side = at
    if (isGroup(id)) {
      const mine = document.querySelector(`[data-group-block="${CSS.escape(id.slice(KEY.length))}"]`)
      const chain: Element[] = []
      for (let el = document.querySelector(`[data-sortable-id="${CSS.escape(target)}"]`)?.closest('[data-group-block]'); el; el = el.parentElement?.closest('[data-group-block]') ?? null) chain.unshift(el)
      const unit = chain.find((one) => !mine || !one.contains(mine))
      if (unit) {
        const box = unit.getBoundingClientRect()
        beside = KEY + (unit as HTMLElement).dataset.groupBlock
        side = (pointer.y - box.top) / box.height
      }
    }
    // A dead band round the middle: the side kept until the pointer is well past it, so small moves never flip it.
    const was = sided.current?.key === beside ? sided.current.how : null
    const how: 'before' | 'after' = was === 'after' ? (side < 0.38 ? 'before' : 'after') : was === 'before' ? (side > 0.62 ? 'after' : 'before') : side < 0.5 ? 'before' : 'after'
    sided.current = { key: beside, how }
    // What to try, in turn: over a row's middle, gathering with it (or going into its group); else, or where that does nothing, beside it.
    const tries: [string, How][] = []
    // Once going inside a group, a group carried stays going inside it while the pointer is anywhere but its block's ends.
    const whole = isGroup(id) ? outerOf(target) : undefined
    const inside = !!whole && aimed.current?.how === 'join' && aimed.current.target === KEY + whole && side > 0.2 && side < 0.8
    if ((middle || inside) && isGroup(id)) {
      if (whole && KEY + whole !== id) tries.push([KEY + whole, 'join'])
    } else if (middle) tries.push([target, 'join'])
    tries.push([beside, how])
    for (const [where, how] of tries) {
      const land = preview(ids, where, how)
      if (!land) continue
      const lead = ids[0]
      const own = groupOf(land.before, lead) ?? null
      const into = groupOf(land.after, lead) ?? null
      const around = groupsAround(land.after, lead)
      const make = !!land.after.make
      // The room opens after the row it will follow on show, leaving out what is carried and what a carried group takes along.
      const known = new Set(keys)
      const seq = land.shown.filter((key) => key === lead || (known.has(key) && !ids.includes(key)))
      const prev = seq[seq.indexOf(lead) - 1]
      // Into a folded group it goes out of sight, and in a list sorted some other way it takes its sorted place in its new group:
      // either way nothing opens, only that group lights.
      const gap = !seq.includes(lead) || (!ordered && (into !== own || make)) ? null : prev === undefined ? -1 : keys.indexOf(prev)
      const n = ids.length
      const count = n > 1 ? `${n} ` : ''
      const outer = make ? groupOf(land.after, KEY + into) ?? null : null
      const words =
        make ? (outer ? (n > 1 ? `New folder of ${n + 1} in ${name(outer)}` : `New folder in ${name(outer)}`) : n > 1 ? `New folder of ${n + 1}` : 'New folder')
        : into !== own ? (into ? (isGroup(lead) ? `Put inside ${name(into)}` : own ? `Move ${count}to ${name(into)}` : `Add ${count}to ${name(into)}`) : isGroup(lead) ? `Move out of ${name(own)}` : `Remove ${count}from ${name(own)}`)
        : `${n > 1 ? `Move ${num(n)} here` : 'Move here'}${ordered ? '' : ' · Custom order'}`
      // In the gap row's own group (or first in the group whose row it is), the room sits close under it.
      const gapRow = gap !== null && gap >= 0 ? keys[gap] : undefined
      const snug = gapRow !== undefined && (isGroup(gapRow) ? gapRow.slice(KEY.length) === (make ? outer : into) : (home.get(gapRow) ?? null) === (make ? outer : into))
      // A group's block sits in 8px of air at the top level and 4px inside a group.
      const fit = isGroup(lead) ? (into ? 4 : 8) - (own ? 4 : 8) : 0
      // Last in a group whose next row on show is outside it (Group 3 carried below Group 2, the last thing in Apple Notes /
      // Notes): the room ends where that group's rows end, not just over the next row, past the group's own edge and air.
      const landing = make ? outer : into
      const next = gap !== null && !snug ? keys[gap + 1] : undefined
      const box = landing ? document.querySelector<HTMLElement>(`[data-group-block="${CSS.escape(landing)}"]`) : null
      const list = box?.querySelector<HTMLElement>(':scope > [data-fold] > div > div > div')
      const node = next && document.querySelector(`[data-sortable-id="${CSS.escape(next)}"]`)
      const until = list && node && !box!.contains(node) ? Math.round(list.getBoundingClientRect().bottom - parseFloat(getComputedStyle(list).paddingBottom)) : undefined
      return point({ target: where, how, into: make ? outer : into, label: words, make, gap, snug, fit, until, around: make ? around.slice(1) : around, tint: tintOf(info.get((make ? outer : into) ?? own ?? '')?.color) })
    }
    point(null)
  }
  // Rows changed under a still pointer (a folded group sprung open): aimed afresh once they have settled.
  const lastMove = useRef<DragMoveEvent | null>(null)
  // The side last chosen, and beside what: kept through the dead band round the middle.
  const sided = useRef<{ key: string; how: 'before' | 'after' } | null>(null)
  const shape = keys.join('\n')
  useEffect(() => {
    if (!carried || !lastMove.current) return
    const again = setTimeout(() => lastMove.current && onDragMove(lastMove.current), 240)
    return () => clearTimeout(again)
  }, [shape]) // eslint-disable-line react-hooks/exhaustive-deps
  const end = (): void => {
    lastMove.current = null
    sided.current = null
    unspring()
    setMany([])
    setCarried(null)
    point(null)
  }
  const onDragEnd = ({ active }: DragEndEvent): void => {
    const now = aimed.current
    end()
    if (!now || now.target === String(active.id)) return chime('stay')
    setSnap(true)
    onDrop(manyRef.current.length > 1 ? manyRef.current : [String(active.id)], now.target, now.how)
  }
  let index = 0
  const lines = bundles.map((one) => {
    const start = index
    if (!one.group || one.group.open) index += shownIn(one)
    return { one, start }
  })
  const line = lines.findIndex(({ one, start }) => cursor >= start && cursor < start + ((!one.group || one.group.open) ? shownIn(one) : 0))
  const row = (entry: Entry, at: number, inner?: CSSProperties, indent?: number): React.JSX.Element => (
    <Node key={entry.id} id={entry.id} inner={inner} indent={indent}>
      <div className={`group/item relative ${arrived(entry.id) ? 'mf-arrive' : ''}`}>
        {face(entry, at)}
        {after?.(entry)}
      </div>
    </Node>
  )
  // A group's block, and inside it each subgroup's, drawn the same way one level in.
  const block = (group: GroupView, entries: Entry[], parts: Part[] | undefined, start: number, inner = false): React.JSX.Element => (
    <GroupBlock key={group.id} group={group} entries={entries} parts={parts} start={start} cursor={cursor} estimate={estimate} row={row} inner={inner} carried={carried === KEY + group.id} renaming={renaming === group.id}
      born={born === group.id} onRenaming={(on) => onRenaming(on ? group.id : null)} onFold={(open) => onFold(group, open)} onNewNote={onNewNote} onPage={onPage} onOpenFolder={onOpenFolder} onSort={onSort} onSorted={onSorted}
      sub={(child, at) => block(child.group, child.entries, child.parts, at, true)} />
  )
  return (
    // The list scrolls by itself only in the last tenth by its top and bottom edges: a row near an edge can still be aimed at.
    <DndContext sensors={sensors} collisionDetection={collide} modifiers={[upDown]} autoScroll={{ threshold: { x: 0, y: 0.1 } }} measuring={{ droppable: { strategy: MeasuringStrategy.WhileDragging } }}
      onDragStart={onDragStart} onDragMove={onDragMove} onDragEnd={onDragEnd} onDragCancel={() => (end(), chime('stay'))}>
      <SortableContext items={keys} strategy={unmoved}>
        <Shaped aim={aim} keys={keys} hand={carried} many={many} span={span} inset={inset} row={rowH} snap={snap} blocks={blockRows}>
          {ordered && <OwnOrderHint />}
          <VirtualList items={lines} keyOf={({ one }) => (one.group ? KEY + one.group.id + (shownIn(one) > BIG ? ':big' : '') : one.entries[0].id)} holds={({ one }, id) => one.entries.some((entry) => entry.id === id)} cursor={line >= 0 ? line : undefined} estimate={estimate} className={className}
            // A big group's line is keyed apart from a small one's: emptied in one step (2,500 rows to none), the list
            // would place every row under it by the height it measured before, scroll there and draw it all twice.
            sizeOf={({ one }) => (one.group?.open ? estimate * (1 + shownIn(one)) : estimate)}>
            {({ one, start }) =>
              one.group ? (
                // A little air above and below every group, so two in a row never touch: 6px, the air the drag allows for (its fit), now the block keeps none of its own.
                <div className="py-1.5">
                {block(one.group, one.entries, one.parts, start)}
                </div>
              ) : one.head ? (
                <>
                  <SectionHead head={one.head} first={start === 0} />
                  {row(one.entries[0], start)}
                </>
              ) : (
                row(one.entries[0], start)
              )
            }
          </VirtualList>
          {carried && unfolded > span && <div aria-hidden data-kept-height="" style={{ height: unfolded - span }} />}
        </Shaped>
      </SortableContext>
      <Overlay dropAnimation={still() ? null : SETTLE}>
        {carried && <Ghost carried={carried} bundles={bundles} many={many} aim={aim} grab={grab} dragY={dragY} dragX={dragX} />}
      </Overlay>
    </DndContext>
  )
}

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
function Shaped({ aim, keys, hand, many, span, inset, row: mid, snap, blocks, children }: { aim: Aim | null; keys: string[]; hand: string | null; many: string[]; span: number; inset: number; row: number; snap: boolean; blocks: { id: string; rows: string[] }[]; children: ReactNode }): React.JSX.Element {
  const { droppableRects } = useDndContext()
  const gap = aim?.gap ?? null
  const shapes = new Map<string, Shape>()
  // How far each row slides: every one in the same draw, and its group's panel with it.
  const ys = new Map<string, number>()
  const from = hand ? keys.indexOf(hand) : -1
  if (gap !== null && from >= 0 && span) {
    const h = span + (aim!.fit ?? 0)
    // Each row's place read off the page as it lies now, its slide left out: dnd-kit's own measures can be from
    // before a folded group sprang open, and the carried row's room then opened a whole group's rows too low.
    // Each row read once a draw, and only rows drawn: one search of the page for each of 2,500 keys, several times over, was slow.
    const drawn = new Map<string, HTMLElement>()
    for (const node of document.querySelectorAll<HTMLElement>('[data-sortable-id]')) drawn.set(node.dataset.sortableId!, node)
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
    const slide = slideOf(from, gap, span, (at) => box(keys[at]), aim!.snug ?? true, inset + (aim!.fit ?? 0) / 2, aim!.until, aim!.fit ?? 0)
    const order = new Map(keys.map((key, index) => [key, index]))
    const shift = (key: string): number => slide.other(order.get(key) ?? -1)
    for (const key of keys) if (key !== hand && shift(key)) ys.set(key, shift(key))
    if (slide.carried) ys.set(hand!, slide.carried)
    const roomTop = box(hand!) ? box(hand!)!.top - inset + slide.carried - (aim!.fit ?? 0) / 2 : undefined
    for (const { id, rows } of blocks) {
      if (hand === KEY + id) continue
      const all = rows.filter((key) => box(key))
      const staying = all.filter((key) => key !== hand && !many.includes(key))
      if (!staying.length) continue
      const was = Math.max(...all.map((key) => box(key)!.top + box(key)!.height))
      let now = Math.max(...staying.map((key) => box(key)!.top + box(key)!.height + shift(key)))
      if (aim!.around.includes(id) && roomTop !== undefined) now = Math.max(now, roomTop + h)
      const top = box(rows[0]) ? shift(rows[0]) : 0
      const bottom = Math.round(now - was)
      if (top || bottom) shapes.set(id, { top, bottom })
    }
  }
  // A new group forming on a row: the panel around it holds the carried row's place under it, so every row
  // after it makes way by that much. Before, they stayed put and the next row sat inside the panel, as if it joined too.
  if (aim?.make && aim.target && gap === null) {
    const at = keys.indexOf(aim.target)
    const down = mid + 6
    if (at >= 0) {
      for (const key of keys.slice(at + 1)) if (key !== hand) ys.set(key, down)
      // A group after it moves down whole; one it forms inside grows by as much at its foot, so its rows after it stay in its box.
      for (const { id, rows } of blocks) {
        if (rows.length && keys.indexOf(rows[0]) > at && !rows.includes(aim.target)) shapes.set(id, { top: down, bottom: down })
        else if (rows.includes(aim.target) && aim.target !== rows[0]) shapes.set(id, { top: 0, bottom: down })
      }
    }
  }
  const signature = [...shapes].map(([id, one]) => `${id}:${one.top}:${one.bottom}`).join() + [...ys].map(([id, y]) => `${id}=${Math.round(y)}`).join()
  const along = many.filter((one) => one !== hand).join()
  // A new value only when something drawn changes: every row reads it.
  const value = useMemo<Carry>(() => ({ aim, height: mid, span: span + (aim?.fit ?? 0), along: new Set(along ? along.split(',') : []), hand, shapes, ys, snap, inset: isGroup(hand ?? '') ? inset + (aim?.fit ?? 0) / 2 : 0 }), [aim, mid, span, inset, along, hand, signature, snap]) // eslint-disable-line react-hooks/exhaustive-deps
  return <Carrying.Provider value={value}>{children}</Carrying.Provider>
}

/**
 * What is carried: one small card beside the pointer, the same one the whole
 * way, whatever it is over. Its words change in place (Move here, Add to
 * Memory, New group), and it stays under the pointer the whole way. Where
 * letting go would do nothing, it says why. Several carried show as a stack with a count; a group, by its
 * icon and name.
 */
function Ghost({ carried, bundles, many, aim, grab, dragY, dragX }: { carried: string; bundles: Bundle[]; many: string[]; aim: Aim | null; grab: number; dragY: MotionValue<number>; dragX: MotionValue<number> }): React.JSX.Element {
  // Sideways it follows the pointer a touch late, and leans into the way it is moving, as a card held loosely does.
  const calm = still()
  const sideways = useSpring(dragX, { stiffness: 700, damping: 42, mass: 0.5 })
  const x = useTransform(() => (calm ? dragX.get() : sideways.get()))
  const lean = useSpring(useTransform(() => (calm ? 0 : Math.max(-3, Math.min(3, (dragX.get() - sideways.get()) * 0.12)))), { stiffness: 400, damping: 30 })
  const group = isGroup(carried) ? bundles.flatMap((one) => (one.group ? [one.group, ...(one.parts ?? []).flatMap((part) => ('group' in part ? [part.group] : []))] : [])).find((one) => KEY + one.id === carried) : undefined
  const entries = bundles.flatMap((one) => one.entries)
  const entry = group ? undefined : entries.find((one) => one.id === carried)
  const words = aim?.label ?? (aim ? 'Move here' : null)
  // The rest carried, fanned up and to the left behind the one in hand: two at most show.
  const behind = many.filter((one) => one !== carried).slice(0, 2).map((id) => entries.find((one) => one.id === id)).filter((one): one is Entry => !!one)
  return (
    <div className="relative h-full w-full">
      <div className="absolute top-1/2 w-[60%] min-w-64" style={{ left: `min(${grab + 18}px, 40%)`, translate: '0 -50%' }}>
        <motion.div className="relative" style={{ x, rotate: lean }}>
          {behind.map((one, at) => <Fanned key={one.id} entry={one} depth={at + 1} dragY={dragY} />).reverse()}
          <motion.div
            data-ghost=""
            className={cn('relative flex items-center gap-2 rounded-md px-2.5 py-1.5 text-control shadow-[0_8px_24px_-6px_rgb(0_0_0/0.35)] ring-1 ring-foreground/10', behind.length ? 'bg-[color-mix(in_srgb,var(--background)_90%,white)] dark:bg-[color-mix(in_srgb,var(--background)_92%,white)]' : 'bg-background')}
            initial={{ opacity: 0, scale: 0.94 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={still() ? { duration: 0 } : springs.moderate}
          >
            {group ? <GroupIcon icon={group.icon} color={group.color} /> : entry ? <entry.icon className="size-4 shrink-0" style={{ color: entry.tint }} /> : null}
            <span className={cn('min-w-0 flex-1 truncate', group ? 'font-semibold' : 'private-text')}>{group?.name ?? (entry?.title || 'Untitled')}</span>
            {/* The words cross-fade in place; the card itself never changes. */}
            <span className="grid shrink-0 justify-items-end text-xs text-muted-foreground">
              <AnimatePresence initial={false}>
                {words && (
                  <motion.span
                    key={words}
                    data-drag-label=""
                    className="col-start-1 row-start-1 flex items-center gap-1.5 whitespace-nowrap"
                    initial={{ opacity: 0, y: 3 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -3, transition: { duration: 0.08 } }}
                    transition={still() ? { duration: 0 } : springs.fast}
                  >
                    <span className="size-1.5 rounded-full" style={{ background: aim?.tint ?? 'var(--muted-foreground)' }} />
                    {words}
                  </motion.span>
                )}
              </AnimatePresence>
            </span>
            {behind.length > 0 && <Cross aria-hidden className="size-3 shrink-0 text-muted-foreground/70" />}
          </motion.div>
          {/* How many, hanging just under the stack. */}
          {many.length > 1 && <Count n={many.length} />}
        </motion.div>
      </div>
    </div>
  )
}

/**
 * One card behind the one in hand: fanned up and to the left, and following
 * the pointer a moment late, the farther the later, like a stack held
 * loosely. With Reduce motion it simply sits there.
 */
function Fanned({ entry, depth, dragY }: { entry: Entry; depth: number; dragY: MotionValue<number> }): React.JSX.Element {
  const calm = still()
  const late = useSpring(dragY, { stiffness: 900 - depth * 200, damping: 50, mass: 0.6 })
  const y = useTransform(() => (calm ? 0 : late.get() - dragY.get()))
  return (
    <motion.div className="absolute inset-0" style={{ y }}>
      <motion.div
        aria-hidden
        data-fanned={depth}
        className="absolute inset-0 flex items-center gap-2 overflow-hidden rounded-md bg-background px-2.5 py-1.5 text-control shadow-[0_6px_16px_-6px_rgb(0_0_0/0.3)] ring-1 ring-foreground/10"
        initial={calm ? false : { x: 0, y: 0, opacity: 0 }}
        // Each about a title's height up and a little to the left, so every title reads above the one before it.
        animate={{ x: -16 * depth, y: -28 * depth, opacity: 1 }}
        transition={calm ? { duration: 0 } : springs.moderate}
      >
        <entry.icon className="size-4 shrink-0" style={{ color: entry.tint }} />
        <span className="private-text min-w-0 flex-1 truncate">{entry.title || 'Untitled'}</span>
      </motion.div>
    </motion.div>
  )
}

/** Said once, the first time a list is in your own order: rows can be carried, and gathered. */
function OwnOrderHint(): React.JSX.Element | null {
  const [seen, setSeen] = useState(() => {
    try {
      return !!localStorage.getItem('hint:own-order')
    } catch {
      return true
    }
  })
  if (seen) return null
  const done = (): void => {
    setSeen(true)
    try {
      localStorage.setItem('hint:own-order', '1')
    } catch {
      // Not kept: it shows again next time, which is harmless.
    }
  }
  return (
    <p data-own-order-hint="" className="mb-1 flex items-center gap-2 px-2 text-xs text-muted-foreground animate-in fade-in-0 duration-300">
      <GripVertical aria-hidden className="size-3 shrink-0" />
      <span className="min-w-0 flex-1">Drag a row to move it; drop it on another row to make a group.</span>
      <button type="button" onClick={done} className="flex h-6 shrink-0 items-center rounded px-1.5 hover:bg-accent hover:text-foreground">Got it</button>
    </p>
  )
}

/** How many are carried, in a small badge on the lifted card's corner. */
function Count({ n }: { n: number }): React.JSX.Element {
  return (
    <span data-carried={n} className="absolute -bottom-3 left-1/2 z-10 flex h-5 -translate-x-1/2 min-w-5 items-center justify-center rounded-full bg-(--tt-brand-color-400) px-1.5 text-[11px] font-semibold mf-on-accent tabular-nums shadow-sm animate-in zoom-in-90 fade-in-0 duration-150">
      {brief(n)}
    </span>
  )
}


/** A group's small icon and its chevron, side by side in the column a page's tile takes, so its name starts where a page's title does. */
function GroupTile({ group, onFold, ...rest }: { group: GroupView; onFold?: () => void } & React.HTMLAttributes<HTMLSpanElement>): React.JSX.Element {
  return (
    <span {...rest} data-group-tile="" className="flex h-9 w-9 shrink-0 items-center justify-center gap-0.5">
      {/* Finder's disclosure triangle: the one part of the row that folds it open in place; the rest opens the folder. */}
      <span data-group-fold="" role="button" aria-label={group.open ? 'Fold' : 'Unfold'} className="-m-0.5 grid place-items-center rounded-sm p-0.5 transition-colors hover:bg-foreground/10"
        onClick={(event) => onFold && (event.stopPropagation(), event.preventDefault(), onFold())}>
        <ChevronRight
          aria-hidden
          className="size-3 shrink-0 text-muted-foreground transition-transform duration-200 motion-reduce:transition-none"
          style={{ transitionTimingFunction: OUT, transform: `rotate(${group.open ? 90 : 0}deg)` }}
        />
      </span>
      <GroupIcon icon={group.icon} color={group.color} className="size-3.5" />
    </span>
  )
}

/** A picture of your own as a folder's icon: stored with the book's pictures (a GIF keeps moving). */
const isPicture = (icon: string | null): icon is string => !!icon && icon.startsWith('haligtree://assets/')

/** A group's icon: a picture of your own, an emoji, a kind's drawing, or the stack every group starts with, in its colour. */
export function GroupIcon({ icon, color, className = 'size-4' }: { icon: string | null; color: string | null; className?: string }): React.JSX.Element {
  const kind = icon?.startsWith('kind:') ? CAPTURE_TYPES.find((one) => one.id === icon.slice(5)) : undefined
  const tint = tintOf(color)
  if (kind) return <kind.icon className={className} style={{ color: tint ?? kind.tint }} />
  if (isPicture(icon)) return <img data-folder-picture src={icon} alt="" draggable={false} className={cn(className, 'shrink-0 rounded-[3px] object-contain')} />
  if (icon) return <span className="text-[0.95rem] leading-none">{icon}</span>
  return <Layers className={cn(className, !tint && 'text-muted-foreground')} style={{ color: tint }} />
}

/** Set a group's look: it shows in place, and ⌘Z takes it back. */
const change = (group: GroupView, patch: Parameters<typeof groups.set>[1]): void => {
  const was = { name: group.name, icon: group.icon, color: group.color }
  void groups.set(group.id, patch).then(() => {
    quietly(() => void groups.set(group.id, was))
    // Named as a tag is: an offer to move that tag's notes in (side-folders.tsx).
    if (patch.name) void offerTag(null, group.id, patch.name)
  })
}

function GroupBlock({ group, entries, parts, start, cursor, estimate, row, carried, renaming, born, onRenaming, onFold, onNewNote, onPage, onOpenFolder, onSort, onSorted, sub, inner = false }: {
  onPage?: (id: string) => void
  onOpenFolder?: (id: string) => void
  group: GroupView
  entries: Entry[]
  /** Its notes and subgroups in order; left out, its notes alone. */
  parts?: Part[]
  /** A subgroup's own block. */
  sub: (part: { group: GroupView; entries: Entry[]; parts?: Part[] }, start: number) => React.JSX.Element
  /** A subgroup, drawn inside its group. */
  inner?: boolean
  start: number
  /** The keyboard's row, counted over the whole list, and a row's height before it is measured. */
  cursor: number
  estimate: number
  row: (entry: Entry, at: number, inner?: CSSProperties, indent?: number) => React.JSX.Element
  carried: boolean
  renaming: boolean
  born: boolean
  onRenaming: (on: boolean) => void
  onFold: (open: boolean) => void
  onNewNote: (id: string) => void
  onSort?: (ids: string[]) => void
  onSorted?: (ids: string[], sorted: boolean) => void
}): React.JSX.Element {
  const [menu, setMenu] = useState(false)
  const [picking, setPicking] = useState(false)
  const [pointing, setPointing] = useState(false)
  const [parted, setParting] = useState(false)
  const parting = parted || !!group.parting
  // Just made: its row unfolds above the two notes, a moment after it is drawn.
  const [arrived, setArrived] = useState(!born || still())
  useEffect(() => {
    if (arrived) return
    const frame = requestAnimationFrame(() => setArrived(true))
    return () => cancelAnimationFrame(frame)
  }, [arrived])
  const count = entries.length
  // Each part in turn, a note's row or a subgroup's block, with the rows on show counted as they go; and the one the keyboard is in.
  let next = start
  const placed = (parts ?? entries.map((entry) => ({ entry }))).map((part) => {
    const at = next
    next += onShow(part)
    return { part, at }
  })
  const inside = placed.findIndex(({ part, at }) => cursor >= at && cursor < at + onShow(part))
  const tint = tintOf(group.color)
  const key = KEY + group.id
  const { aim, shapes, hand, snap } = useContext(Carrying)
  // Folded at once as it is lifted, and open again at once where it lands.
  const [wasCarried, setWasCarried] = useState(carried)
  if (wasCarried !== carried) setWasCarried(carried)
  // Carrying, the panel lights only when letting go would leave the row in this very group, never one around it.
  const landing = !!aim && aim.into === group.id
  // Its edges follow its rows as they make room or close over a gap, on the compositor.
  const shape = shapes.get(group.id) ?? REST
  const block = useRef<HTMLDivElement>(null)
  // The block's height as drawn, for its panel's middle to stretch from: read after each draw and whenever it resizes,
  // never off the last draw (a block that had just folded or grown stretched its middle from its old height and the
  // panel came apart into a stray strip).
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
  }, [])
  const fold = (): void => {
    chime(group.open ? 'tuck' : 'untuck')
    onFold(!group.open)
  }
  // Separate: the panel fades, the notes slide back out to the list's edge one
  // after another, the row folds away, and only then is it done.
  const separate = (): void => {
    chime('separate')
    setParting(true)
    setTimeout(async () => {
      const was = await groups.separate(group.id)
      if (!was) return (setParting(false), refuse('That folder is already gone'))
      toast(`Deleted ${group.name}: ${count === 1 ? 'its note moved up' : count ? `its ${num(count)} notes moved up` : 'it was empty'}`, () => void groups.restore(was).then(() => chime('gather')))
    }, still() ? 0 : 140 + count * 40)
  }
  // A new name shows at once and stays, never the old one flashing back while the save is on its way.
  const [named, setNamed] = useState<string | null>(null)
  useEffect(() => void (named !== null && named === group.name && setNamed(null)), [named, group.name])
  const name = named ?? group.name
  const rename = (next: string): void => {
    onRenaming(false)
    if (!next.trim() || next.trim() === group.name) return
    setNamed(next.trim())
    change(group, { name: next.trim() })
  }
  const shown = (menu || picking || renaming || landing || pointing || !arrived || born) && !parting
  // Pointed at: its own panel deepens, never a subgroup's inside it.
  const [over, setOver] = useState(false)
  // Deeper while pointed at. While something is carried, every panel rests, and only the one it would land in lights (PanelParts' wash).
  const depth = (tint ? 6 : 3.5) * (hand ? 1 : pointing ? 2.2 : shown || over ? 1.6 : 1)
  return (
    <div
      ref={block}
      data-group-block={group.id}
      data-subgroup={inner ? '' : undefined}
      data-active={shown ? '' : undefined}
      data-landing={landing ? '' : undefined}
      onPointerOver={(event) => setOver(!(event.target as Element).closest('[data-group-block]') || (event.target as Element).closest('[data-group-block]') === event.currentTarget)}
      onPointerLeave={() => setOver(false)}
      // At the top level its panel is the rows' own box: folded, it is one row's box, and what is in it starts and ends where every other row does (qa/row-shape.mjs).
      className="group/fold relative isolate"
      style={{ '--group-tint': tint ?? 'var(--foreground)' } as CSSProperties}
    >
      {/* The panel: always there, faint, with a hairline round it; deeper while pointed at, or while something is about to happen to it. */}
      <div
        aria-hidden
        data-panel=""
        className={cn(
          'pointer-events-none absolute inset-0 -z-10 origin-top transition-[opacity,scale] duration-200 motion-reduce:transition-none',
          carried && 'opacity-0!',
          // A subfolder has no box of its own: its panel shows only to light where a drop would land.
          inner && !landing && 'opacity-0',
          parting && 'scale-[0.98] opacity-0!',
          !arrived && 'scale-[0.97] opacity-0'
        )}
        style={{
          transitionTimingFunction: OUT,
          '--panel-fill': `color-mix(in srgb, var(--group-tint) ${depth}%, transparent)`,
          '--panel-edge': `color-mix(in srgb, var(--group-tint) ${tint ? 16 : 9}%, transparent)`,
          '--panel-lit': `color-mix(in srgb, var(--group-tint) ${tint ? 6 : 4}%, transparent)`
        } as CSSProperties}
      >
        <PanelParts shape={shape} tall={tall} lit={landing} snap={snap} />
      </div>
      {/* The row: folded away until a group just made unfolds it, and as a separated one goes. */}
      <div
        className="grid transition-[grid-template-rows,opacity] duration-200 motion-reduce:transition-none"
        style={{ transitionTimingFunction: OUT, gridTemplateRows: arrived && !parting ? '1fr' : '0fr', opacity: arrived && !parting ? 1 : 0, transitionDelay: parting ? `${count * 40}ms` : undefined }}
      >
        <div className={cn('min-h-0 min-w-0', (!arrived || parting) && 'overflow-hidden')}>
          <Node id={key}>
            <Popover open={picking} onOpenChange={setPicking}>
              <ContextMenu onOpenChange={setMenu}>
                <Tip label={renaming || menu || !onOpenFolder ? '' : 'Click to fold or unfold. ⌘-click, or “Open folder” in its menu, opens it as its own page'}>
                <ContextMenuTrigger asChild>
                  {renaming ? (
                    <div className={cn(ROW_SHAPE, HEAD, 'data-[state=open]:bg-transparent!')}>
                      <PopoverAnchor asChild><GroupTile group={group} /></PopoverAnchor>
                      <input
                        autoFocus
                        defaultValue={group.name}
                        aria-label="Folder name"
                        onFocus={(event) => event.target.select()}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') rename(event.currentTarget.value)
                          if (event.key === 'Escape') (event.preventDefault(), event.stopPropagation(), onRenaming(false))
                        }}
                        onBlur={(event) => rename(event.target.value)}
                        className="min-w-0 flex-1 rounded-sm bg-transparent text-xs font-semibold outline-none placeholder:text-muted-foreground"
                        placeholder="Name the folder"
                      />
                    </div>
                  ) : (
                    <button
                      type="button"
                      data-group-row={group.id}
                      aria-expanded={group.open}
                      aria-label={name}
                      // As in Obsidian's file explorer and Notion's sidebar: a click anywhere on the row folds or unfolds it at once,
                      // and never opens it; ⌘-click (or "Open folder" in its menu, or its row in the sidebar) opens it as its own page.
                      // A double click on the name renames it, its two clicks' folds cancelling out.
                      onClick={(event) => {
                        if (event.detail > 1) return
                        if (event.metaKey && onOpenFolder) return (chime('open'), onOpenFolder(group.id))
                        fold()
                      }}
                      onDoubleClick={() => (onFold(!group.open), onRenaming(true))}
                      // Enter and Space fold it, ← folds and → unfolds, as a folder in a tree does; F2 renames it, as in Obsidian.
                      onKeyDown={(event) => {
                        if ((event.key === 'ArrowLeft' && group.open) || (event.key === 'ArrowRight' && !group.open) || event.key === 'Enter' || event.key === ' ') (event.preventDefault(), event.stopPropagation(), fold())
                        if (event.key === 'F2') (event.preventDefault(), onRenaming(true))
                      }}
                      // The panel marks it while its menu is open: no second mark on the row.
                      // A slim title bar: its box and focus ring are a page row's (row-shape.ts), its icon and chevron sit in a page's tile column,
                      // so its name starts on the page titles' line; only its right side keeps room for its buttons.
                      className={cn(ROW_SHAPE, HEAD, 'data-[state=open]:bg-transparent!')}
                      style={{ paddingRight: group.unsorted?.length && onSort ? '12.5rem' : '2.25rem' }}
                    >
                      <PopoverAnchor asChild><GroupTile group={group} onFold={fold} /></PopoverAnchor>
                      <span className="min-w-0 truncate text-xs font-semibold">{name}</span>
                      {/* How many it holds, open or folded, quiet after the name. */}
                      <span data-count="" className="-ml-1 shrink-0 text-xs text-muted-foreground tabular-nums">· {count}</span>
                      {/* Open, a hairline under it, inside the group's box. */}
                      {group.open && !inner && <span aria-hidden data-head-line="" className="pointer-events-none absolute inset-x-2 bottom-0 h-px" style={{ background: `color-mix(in srgb, var(--group-tint) ${tint ? 18 : 10}%, transparent)` }} />}
                    </button>
                  )}
                </ContextMenuTrigger>
                </Tip>
                <GroupMenu group={group} members={entries.map((entry) => entry.id)} onPage={onPage && (() => (chime('open'), onPage(group.id)))} onOpenFolder={onOpenFolder && (() => (chime('open'), onOpenFolder(group.id)))} onSeparate={separate} onRename={() => onRenaming(true)} onIcon={() => setPicking(true)} onNewNote={onNewNote} onSort={onSort} onSorted={onSorted} />
              </ContextMenu>
              {/* Open until an icon is picked, Esc, or a click elsewhere: the focus moving on as the menu shuts never closes it. */}
              <PopoverContent align="start" className="w-auto gap-0 overflow-hidden p-0" onFocusOutside={(event) => event.preventDefault()}>
                <IconChoice group={group} onPick={(icon) => (change(group, { icon }), chime('tap'), setPicking(false))} />
              </PopoverContent>
            </Popover>
            {/* What is left to sort, on its own pill by the name, a click from the pass through them. */}
            {!renaming && !!group.unsorted?.length && onSort && (
              <Tip label="Go through them one at a time: keep, tag, move or bin each">
                <button
                  type="button"
                  data-sort-these={group.unsorted.length}
                  onClick={() => onSort(group.unsorted!)}
                  onPointerDown={(event) => event.stopPropagation()}
                  className="absolute top-1/2 right-8 flex h-6 -translate-y-1/2 cursor-pointer! items-center gap-1.5 rounded-full px-2.5 text-control font-medium text-foreground transition-[filter] hover:brightness-95 dark:hover:brightness-125"
                  style={{ background: `color-mix(in srgb, var(--tt-color-text-orange) 14%, var(--background))` }}
                >
                  <span aria-hidden className="size-1.5 rounded-full bg-[var(--tt-color-text-orange)]" />
                  <span className="tabular-nums"><Rolling text={group.unsorted.length} /> to sort</span>
                  <span aria-hidden className="text-foreground/40">·</span>
                  <span>Sort these</span>
                </button>
              </Tip>
            )}
            {!renaming && (
              <Tip label={`Delete folder, keep its ${count === 1 ? 'note' : `${num(count)} notes`}`}>
                <button
                  type="button"
                  onClick={separate}
                  onMouseEnter={() => setPointing(true)}
                  onMouseLeave={() => setPointing(false)}
                  // Not a handle: pressing here never lifts the group.
                  onPointerDown={(event) => event.stopPropagation()}
                  className={cn('absolute top-1/2 right-0.5 flex size-6 -translate-y-1/2 cursor-pointer! items-center justify-center rounded-md text-muted-foreground transition-opacity duration-150 hover:bg-accent hover:text-foreground focus-visible:opacity-100', over || shown ? 'opacity-100' : 'opacity-0')}
                >
                  <X className="size-3.5" />
                </button>
              </Tip>
            )}
          </Node>
        </div>
      </div>
      <Fold open={group.open && !carried} instant={carried || wasCarried}>
        {(() => {
          const one = ({ part, at }: (typeof placed)[number], index: number): React.JSX.Element =>
            'entry' in part
              // Separating, they fade one after another.
              ? row(part.entry, at, { transitionDelay: parting ? `${index * 40}ms` : undefined, opacity: parting ? 0.6 : undefined }, INDENT)
              // Its twig meets its heading's middle, not the middle of all it holds.
              : <div key={part.group.id} data-twig-top={20} className="py-0.5">{sub(part, at)}</div>
          // A big group draws only the rows near the screen, as a plain list does: one of 2,500 drew every one, and ⌘A or a
          // fold froze the window. A small one draws them all, the way its carried rows and panel are measured.
          return placed.length > BIG ? (
            <div className="pb-[3px]">
              <VirtualList items={placed} keyOf={({ part }) => ('entry' in part ? part.entry.id : part.group.id)} cursor={inside >= 0 ? inside : undefined} estimate={estimate} rowClass="pb-px">
                {one}
              </VirtualList>
            </div>
          ) : placed.length && inner ? (
            // A subfolder's own, as the sidebar's tree draws them: stepped in under its heading, hung off a thin trunk, no box of its own.
            <Branches current={-1} className="ml-[26px] flex flex-col gap-px pb-1">{placed.map(one)}</Branches>
          ) : placed.length ? (
            <div className="flex flex-col gap-px pb-1">{placed.map(one)}</div>
          ) : (
            // A folder made empty, or emptied: it stays, as a row of its own in the list's shape (a dashed tile,
            // a line and a quiet line under it, on the page titles' edge), and a click starts its first note.
            <div className="pb-1">
              <button type="button" data-group-empty onClick={() => (chime('open'), onNewNote(group.id))} className={cn(ROW_SHAPE, ROW_PAD, 'hover:bg-accent/60')}>
                <span className={cn(ROW_TILE, 'border border-dashed border-foreground/20 text-muted-foreground')}><Plus className="size-4" /></span>
                <span className="flex min-w-0 flex-col">
                  <span className="text-control text-foreground">Nothing in it yet</span>
                  <span className="text-meta text-muted-foreground">Drag notes in, or click to start one</span>
                </span>
              </button>
            </div>
          )
        })()}
      </Fold>
    </div>
  )
}

/** Past this many rows, a group draws only those near the screen. */
const BIG = 150
const REST: Shape = { top: 0, bottom: 0 }
/** The rows' slide (dnd-kit's transition on each row), for a panel to keep pace with them. */
const SLIDE = { duration: 0.22, ease: [0.2, 0.9, 0.3, 1] as [number, number, number, number] }
/** The rounded ends' height: past the corners' curve, so only the straight middle is stretched. */
const CAP = 12

/**
 * A group's panel in three parts, a rounded top, a straight middle and a
 * rounded bottom, so its edges can move with its rows on the compositor: the
 * ends slide and only the middle stretches, and the corners stay true however
 * far it grows or closes. Lit, a deeper wash fades in over all three.
 */
function PanelParts({ shape, tall, lit, snap }: { shape: Shape; tall: number; lit: boolean; snap: boolean }): React.JSX.Element {
  const middle = Math.max(1, tall - CAP * 2)
  const part = 'absolute inset-x-0 border-x border-(--panel-edge) bg-(--panel-fill) transition-[background-color] duration-200 motion-reduce:transition-none before:absolute before:-inset-x-px before:inset-y-0 before:rounded-[inherit] before:bg-(--panel-lit) before:transition-opacity before:duration-200 before:content-[""] motion-reduce:before:transition-none'
  const wash = lit ? 'before:opacity-100' : 'before:opacity-0'
  // On the rows' own clock (useGlide): CSS transitions each shorten on their own when turned back halfway, and the parts came apart.
  const top = useGlide(shape.top, 1, snap)
  const mid = useGlide(shape.top, Math.max(0, middle + shape.bottom - shape.top) / middle, snap)
  const bottom = useGlide(shape.bottom, 1, snap)
  return (
    <>
      <motion.div ref={top.ref} data-panel-part="top" className={cn(part, wash, 'top-0 rounded-t-lg border-t')} style={{ height: CAP, ...top.style }} />
      <motion.div ref={mid.ref} data-panel-part="middle" className={cn(part, wash)} style={{ top: CAP, height: `calc(100% - ${CAP * 2}px)`, originY: 0, ...mid.style }} />
      <motion.div ref={bottom.ref} data-panel-part="bottom" className={cn(part, wash, 'bottom-0 rounded-b-lg border-b')} style={{ height: CAP, ...bottom.style }} />
    </>
  )
}

/**
 * What a group holds, opening to its height and closing to nothing on the
 * grid-rows trick, its notes drawing up into the row as they go: under a
 * quarter of a second, easing out, and at once with Reduce motion. Shut, its
 * notes leave the page, so nothing hidden can be dropped on.
 */
function Fold({ open, instant: now = false, children }: { open: boolean; instant?: boolean; children: ReactNode }): React.JSX.Element {
  const [kept, setKept] = useState(open)
  const [settled, setSettled] = useState(open)
  const was = useRef(open)
  // Folded by a key (an arrow, Enter), it is open or shut at once.
  const keyed = useRef(false)
  if (was.current !== open) {
    was.current = open
    keyed.current = byKeys() || now
    const instant = still() || keyed.current
    if (open && !kept) setKept(true)
    setSettled(instant)
    if (!open && instant) setKept(false)
  }
  return (
    <div
      data-fold=""
      inert={!open}
      onTransitionEnd={(event) => {
        if (event.target !== event.currentTarget || event.propertyName !== 'grid-template-rows') return
        setSettled(true)
        if (!open) setKept(false)
      }}
      className={cn('grid transition-[grid-template-rows,opacity] duration-200 motion-reduce:transition-none', keyed.current && 'transition-none')}
      style={{ transitionTimingFunction: OUT, gridTemplateRows: open ? '1fr' : '0fr', opacity: open ? 1 : 0 }}
    >
      {/* Cut only while it moves: open and still, a row lifted past its edge shows whole. */}
      {/* min-w-0: a grid item is as wide as its longest title otherwise, and the rows' titles ran past the panel instead of ending in an ellipsis. */}
      <div className={cn('min-h-0 min-w-0', !(open && settled) && 'overflow-hidden')}>
        <div className={cn('transition-[translate] duration-200 motion-reduce:transition-none', keyed.current && 'transition-none')} style={{ transitionTimingFunction: OUT, translate: open ? '0 0' : '0 -8px' }}>
          {kept && children}
        </div>
      </div>
    </div>
  )
}

/** A right click on a group's row: Haligtree's own menu, with its colours as a row of dots. */
function GroupMenu({ group, members, onPage, onOpenFolder, onSeparate, onRename, onIcon, onNewNote, onSort, onSorted }: {
  group: GroupView
  onPage?: () => void
  onOpenFolder?: () => void
  members: string[]
  onSeparate: () => void
  onRename: () => void
  onIcon: () => void
  onNewNote: (id: string) => void
  onSort?: (ids: string[]) => void
  onSorted?: (ids: string[], sorted: boolean) => void
}): React.JSX.Element {
  const later = (run: () => void) => () => void setTimeout(run, 0)
  const left = group.unsorted ?? []
  return (
    <ContextMenuContent className="w-56" onCloseAutoFocus={(event) => event.preventDefault()}>
      {onOpenFolder && <ContextMenuItem data-group-open onSelect={later(onOpenFolder)}>Open folder</ContextMenuItem>}
      {onPage && <ContextMenuItem data-group-open-page onSelect={later(onPage)}><BookOpen className="size-3.5" />Read as one page</ContextMenuItem>}
      {(onOpenFolder || onPage) && <ContextMenuSeparator />}
      {left.length > 0 && onSort && <ContextMenuItem onSelect={later(() => onSort(left))}>Sort these ({left.length})</ContextMenuItem>}
      {left.length > 0 && onSorted && <ContextMenuItem onSelect={() => onSorted(left, true)}>Mark all as sorted</ContextMenuItem>}
      {left.length > 0 && <ContextMenuSeparator />}
      <ContextMenuItem onSelect={() => void groups.note(group.id).then((id) => id && (chime('promote'), onNewNote(id)))}>New note in folder</ContextMenuItem>
      <ContextMenuItem data-folder-delete onSelect={onSeparate}>Delete folder, keep its notes</ContextMenuItem>
      <ContextMenuItem
        onSelect={() =>
          void groups.duplicate(group.id).then((made) => made && (chime('copy'), toast('Duplicated, with a copy of each note', () => void groups.unclone(made.ids))))
        }
      >
        Duplicate folder
      </ContextMenuItem>
      <ContextMenuItem
        onSelect={() =>
          void groups.links(group.id).then((links) => (links.length ? copy(links.join('\n'), `Copied ${links.length === 1 ? 'one link' : `${num(links.length)} links`}`) : refuse('No web links in this folder')))
        }
      >
        Copy all links
      </ContextMenuItem>
      <ContextMenuSeparator />
      <div role="group" aria-label="Colour" className="flex items-center justify-between px-1 py-0.5">
        {GROUP_COLORS.map((color) => (
          <ContextMenuItem
            key={color}
            aria-label={color}
            data-color-dot={color}
            className="size-6 min-h-0 justify-center rounded-full p-0"
            // A colour is a glance: the menu stays open to see it land.
            onSelect={(event) => {
              event.preventDefault()
              chime('tap')
              const next = group.color === color ? null : color
              change(group, { color: next })
            }}
          >
            <span
              className={cn('size-3 rounded-full transition-transform duration-150', group.color === color && 'scale-125 shadow-[0_0_0_2px_var(--popover),0_0_0_3.5px_currentColor]')}
              style={{ background: `var(--tt-color-text-${color})`, color: `var(--tt-color-text-${color})` }}
            />
          </ContextMenuItem>
        ))}
      </div>
      <ContextMenuSeparator />
      <ContextMenuItem onSelect={later(onRename)}>Rename…</ContextMenuItem>
      <ContextMenuItem onSelect={later(onIcon)}>Change icon…</ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem onSelect={() => void archive('nuggets', members, true)}>Archive folder</ContextMenuItem>
    </ContextMenuContent>
  )
}

/** The kinds' own drawings first, then any emoji. */
export function IconChoice({ group, onPick }: { group: Pick<GroupView, 'icon' | 'color'>; onPick: (icon: string | null) => void }): React.JSX.Element {
  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-0.5 border-b px-2 py-1.5">
        <Tip label="The stack">
          <button type="button" onClick={() => onPick(null)} data-active={!group.icon ? '' : undefined}
            className="flex size-7 items-center justify-center rounded-md hover:bg-accent data-[active]:bg-accent">
            <GroupIcon icon={null} color={group.color} />
          </button>
        </Tip>
        {CAPTURE_TYPES.map((kind) => (
          <Tip key={kind.id} label={kind.label}>
            <button type="button" onClick={() => onPick(`kind:${kind.id}`)} data-active={group.icon === `kind:${kind.id}` ? '' : undefined}
              className="flex size-7 items-center justify-center rounded-md hover:bg-accent data-[active]:bg-accent">
              <GroupIcon icon={`kind:${kind.id}`} color={group.color} />
            </button>
          </Tip>
        ))}
        <span className="flex-1" />
        {/* A picture of your own, as Notion lets you: a GIF keeps moving. */}
        <Tip label="Upload a picture: PNG, JPG, GIF or SVG">
          <label data-folder-upload className="flex h-7 cursor-pointer items-center gap-1.5 rounded-md px-2 text-control text-muted-foreground hover:bg-accent hover:text-foreground">
            <ImagePlus aria-hidden className="size-4" />Upload
            <input type="file" accept="image/png,image/jpeg,image/gif,image/webp,image/svg+xml,image/avif" className="sr-only"
              onChange={(event) => {
                const file = event.currentTarget.files?.[0]
                event.currentTarget.value = ''
                if (file) void saveImage(file).then(onPick, () => chime('nope'))
              }} />
          </label>
        </Tip>
      </div>
      <IconPicker icon={group.icon ?? ''} className="rounded-none! border-0! bg-transparent! shadow-none!" onPick={({ icon }) => icon && onPick(icon)} />
    </div>
  )
}
