import { createContext, useContext, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { DndContext, MeasuringStrategy, PointerSensor, closestCenter, pointerWithin, useSensor, useSensors, type CollisionDetection, type DragEndEvent, type DragMoveEvent, type DragStartEvent, type Modifier } from '@dnd-kit/core'
import { SortableContext, useSortable, type SortingStrategy } from '@dnd-kit/sortable'
import { AnimatePresence, motion, useMotionValue, useSpring, useTransform, type MotionValue } from 'motion/react'
import { ChevronRight, GripVertical, Layers, Plus, X as Cross } from 'lucide-react'

import { alive } from '@/components/ui/alive-icon'
import XIcon from '@/components/ui/x-icon'
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger } from '@/components/ui/context-menu'
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover'
import { IconPicker } from '@/components/emoji/icon-picker'
import { CAPTURE_TYPES } from '../capture-kinds/capture-kind-picker'
import { chime, click } from '@/lib/sound'
import { slotTicker } from '@/lib/proximity'
import { archive } from '@/lib/notes'
import { spring as springs } from '@/lib/motion'
import { GROUP_COLORS, groups, tintOf } from '@/lib/groups'
import { KEY, isGroup, type How } from '@/lib/group-layout'
import { cn } from '@/lib/cn'
import { realMove } from '@/lib/real-move'
import { openAside } from '@/lib/split'
import { Overlay, SETTLE } from './sortable'
import { copy } from './row-menu'
import { Tip, VirtualList, refuse, toast } from './ui'
import type { Entry } from './note-list'

const X = alive(XIcon)

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

export type GroupView = { id: string; name: string; icon: string | null; color: string | null; open: boolean; members: string[]; /** Coming apart (left with one note): drawn going. */ parting?: boolean }
/** A line of the list: one note at the top level, or a group and the notes it shows. */
export type Bundle = { group?: GroupView; entries: Entry[] }

export type Folds = {
  bundles: Bundle[]
  /** In your own order: false while sorted some other way, when only joining or leaving a group means anything. */
  ordered: boolean
  /** A drop, for the list to work out and save: `ids` is everything carried, in the order it is read. */
  onDrop: (ids: string[], target: string, how: How) => void
  /** The rows picked (⌘-click, ⇧-click, x): carrying one of them carries them all. */
  picked: string[]
  /** Carrying a row that is not picked lets the picks go, as Finder does. */
  onLetGo: () => void
  onFold: (group: GroupView, open: boolean) => void
  /** A note just made in a group, to open. */
  onNewNote: (id: string) => void
  /** The group whose name is being written, as one just made is. */
  renaming: string | null
  onRenaming: (id: string | null) => void
  /** A group just made, which arrives rather than appears. */
  born: string | null
}

const still = (): boolean => document.documentElement.dataset.motion === 'off' || matchMedia('(prefers-reduced-motion: reduce)').matches
/** Up and down only. */
const upDown: Modifier = ({ transform }) => ({ ...transform, x: 0 })
/** Over a row, that row; in the hair between two, the nearest. */
const collide: CollisionDetection = (args) => {
  const hit = pointerWithin(args)
  return hit.length ? hit : closestCenter(args)
}
/** Emil's ease-out, the curve everything here settles on. */
const OUT = 'cubic-bezier(0.23, 1, 0.32, 1)'
const INDENT = 16

/** What letting go now would do, and the words for it. */
type Aim = { target: string; how: How; into: string | null; label: string | null; tint?: string }
type Carry = {
  aim: Aim | null
  /** The carried row's height: the room a preview makes. */
  height: number
  /** A note being carried out of its group: that group closes over its place. */
  leaving: { group: string; id: string } | null
  /** Dragging down (the rows between move up to make room) or up. */
  down: boolean
  /** The other rows carried along with the one in hand: they wait, faded, in their places. */
  along: Set<string>
  /** The group the pointer is within while carrying. */
  within: string | null
  /** The row in hand. */
  hand: string | null
}
const Carrying = createContext<Carry>({ aim: null, height: 0, leaving: null, down: false, along: new Set(), within: null, hand: null })

function Node({ id, children, inner, indent = 0 }: { id: string; children: ReactNode; inner?: CSSProperties; indent?: number }): React.JSX.Element {
  const { setNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({
    id,
    transition: still() ? null : { duration: 220, easing: 'cubic-bezier(0.2, 0.9, 0.3, 1)' }
  })
  const { aim, height, along } = useContext(Carrying)
  const here = aim?.target === id ? aim : null
  const lifted = here?.how === 'join'
  // A new group would form here: the panel around this row and the room under it.
  const forming = lifted && !here.into
  // The carried row's own place travels to where it would land: the room the rows open. Near an edge, a line in it.
  const room = isDragging && !!aim
  // The room is a row for each note carried, softly tinted.
  const rows = along.size + 1
  return (
    <div
      ref={setNodeRef}
      data-sortable-id={id}
      data-aim={here?.how}
      {...attributes}
      {...listeners}
      tabIndex={-1}
      role={undefined}
      className="group/grip relative isolate"
      style={{ transform: transform ? `translate3d(0, ${Math.round(transform.y)}px, 0)` : undefined, transition, opacity: isDragging && !room ? 0.3 : undefined }}
    >
      {/* That a row can be carried, said quietly: a grip in the margin by its left edge, only once the pointer has rested on it a moment. */}
      <GripVertical aria-hidden data-grip="" className="absolute top-1/2 size-3 -translate-y-1/2 text-muted-foreground/60 opacity-0 transition-opacity duration-150 group-hover/grip:opacity-100 group-hover/grip:delay-[400ms] motion-reduce:transition-none" style={{ left: indent - 13 }} />
      {room && (
        <span aria-hidden data-room={rows} className="pointer-events-none absolute inset-x-1 top-0 rounded-md bg-[color-mix(in_srgb,var(--tt-brand-color-400)_6%,transparent)] animate-in fade-in-0 duration-150" style={{ height: rows * height - 2 }} />
      )}
      {room && aim.how !== 'join' && (
        <span
          aria-hidden
          data-drop-line={aim.how}
          className="pointer-events-none absolute inset-y-0 right-2 my-auto h-0.5 rounded-full bg-(--tt-brand-color-400) animate-in fade-in-0 duration-150 before:absolute before:-top-[3px] before:-left-2 before:size-2 before:rounded-full before:border-2 before:border-(--tt-brand-color-400) before:bg-background"
          style={{ left: (aim.into ? INDENT : 0) + 12 }}
        />
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
    </div>
  )
}

/**
 * The list itself, in place of the plain one while it is in your own order.
 * `face` draws a note's row as every list does; `index` counts rows on show,
 * which is what the keyboard's cursor counts.
 */
export function GroupedList({ bundles, ordered, onDrop, picked, onLetGo, onFold, onNewNote, renaming, onRenaming, born, face, after, arrived, cursor, estimate, className }: Folds & {
  face: (entry: Entry, index: number) => React.JSX.Element
  after?: (entry: Entry) => ReactNode
  arrived: (id: string) => boolean
  cursor: number
  estimate: number
  className?: string
}): React.JSX.Element {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))
  const keys = bundles.flatMap((one) => (one.group ? [KEY + one.group.id, ...(one.group.open ? one.entries.map((entry) => entry.id) : [])] : one.entries.map((entry) => entry.id)))
  const info = useMemo(() => new Map(bundles.flatMap((one) => (one.group ? [[one.group.id, one.group] as const] : []))), [bundles])
  // The group each row on show is in, for what a drop would mean.
  const home = useMemo(() => new Map(bundles.flatMap((one) => (one.group ? one.entries.map((entry) => [entry.id, one.group!.id] as const) : []))), [bundles])
  const [carried, setCarried] = useState<string | null>(null)
  // Everything carried, in the order it is read: the row in hand, and the rest picked with it.
  const [many, setMany] = useState<string[]>([])
  // How far the pointer has carried things: the stack's back cards follow it a moment late.
  const dragY = useMotionValue(0)
  const manyRef = useRef<string[]>([])
  manyRef.current = many
  const [height, setHeight] = useState(0)
  const heightRef = useRef(0)
  heightRef.current = height
  const [within, setWithin] = useState<string | null>(null)
  const withinRef = useRef<string | null>(null)
  // Where the row was taken hold of, across it: the chip sits just past it.
  const [grab, setGrab] = useState(60)
  const [aim, setAim] = useState<Aim | null>(null)
  const aimed = useRef<Aim | null>(null)
  const ticks = useRef(slotTicker()).current
  // Over the middle of a row, room opens just after it (or after the last of
  // its group's notes): where the carried row would land. Anywhere else
  // nothing moves; a line says where it would go. A group carried by its row
  // leaves its own notes where they are.
  const mine = carried && isGroup(carried) ? new Set(bundles.find((one) => one.group && KEY + one.group.id === carried)?.entries.map((entry) => entry.id)) : null
  const anchor = (target: string): string => {
    if (!isGroup(target)) return target
    const group = info.get(target.slice(KEY.length))
    return group?.open ? group.members.filter((id) => keys.includes(id)).pop() ?? target : target
  }
  // Where the room opens: just after this row on show (-1, at the very top), so the rows slide apart by one row there.
  const gapAfter = !aim ? null : aim.how === 'join' ? keys.indexOf(anchor(aim.target)) : aim.how === 'after' ? keys.indexOf(aim.target) : keys.indexOf(aim.target) - 1
  const down = !!carried && gapAfter !== null && keys.indexOf(carried) <= gapAfter
  const strategy: SortingStrategy = useMemo(
    () => (args) => {
      if (gapAfter === null || (mine && mine.has(keys[args.index]))) return null
      // Exactly one row of room, whatever lies between: the rows from the carried one's place to the gap slide by its height and no more.
      const { activeIndex, index, rects, activeNodeRect } = args
      const to = activeIndex <= gapAfter ? gapAfter : gapAfter + 1
      // A row of room for each note carried.
      const h = (activeNodeRect?.height ?? rects[activeIndex]?.height ?? 0) * Math.max(1, manyRef.current.length)
      const still = { x: 0, scaleX: 1, scaleY: 1 }
      if (index === activeIndex) {
        const at = rects[activeIndex]
        const there = rects[to]
        if (!at || !there || to === activeIndex) return null
        return { ...still, y: to > activeIndex ? there.top + there.height - h - at.top : there.top - at.top }
      }
      if (activeIndex < index && index <= to) return { ...still, y: -h }
      if (to <= index && index < activeIndex) return { ...still, y: h }
      return null
    },
    [gapAfter, carried, keys.join('\n')] // eslint-disable-line react-hooks/exhaustive-deps
  )
  const point = (next: Aim | null): void => {
    const was = aimed.current
    if (was?.target === next?.target && was?.how === next?.how && was?.label === next?.label) return
    aimed.current = next
    setAim(next)
  }
  const onDragStart = ({ active, activatorEvent }: DragStartEvent): void => {
    const id = String(active.id)
    dragY.jump(0)
    chime('lift')
    ticks.start(id)
    setCarried(id)
    const all = bundles.flatMap((one) => one.entries.map((entry) => entry.id))
    if (!isGroup(id) && picked.includes(id) && picked.length > 1) setMany(all.filter((one) => picked.includes(one)))
    else {
      setMany([id])
      if (picked.length) onLetGo()
    }
    setHeight(active.rect.current.initial?.height ?? 48)
    const start = active.rect.current.initial
    setGrab(start && activatorEvent instanceof PointerEvent ? activatorEvent.clientX - start.left : 60)
  }
  // Held over a folded group's row for a moment, the group opens, as a folder
  // does in Finder when something is held over it.
  const spring = useRef<{ key: string; timer: ReturnType<typeof setTimeout> } | null>(null)
  const unspring = (): void => {
    if (spring.current) clearTimeout(spring.current.timer)
    spring.current = null
  }
  const onDragMove = ({ active, over, activatorEvent, delta }: DragMoveEvent): void => {
    dragY.set(delta.y)
    const id = String(active.id)
    const target = over && String(over.id)
    const pointer = activatorEvent instanceof PointerEvent ? { x: activatorEvent.clientX + delta.x, y: activatorEvent.clientY + delta.y } : null
    const shut = target && !isGroup(id) ? info.get(target.slice(KEY.length)) : undefined
    if (!shut || shut.open || !isGroup(target!)) unspring()
    else if (spring.current?.key !== target) {
      unspring()
      spring.current = { key: target!, timer: setTimeout(() => (click('tick'), onFold(shut, true), (spring.current = null)), 600) }
    }
    // The group the pointer is within, header, rows, the hair between them or
    // the room opened at its end: its panel stays lit all the while.
    if (pointer) {
      let inside: string | null = null
      for (const block of document.querySelectorAll<HTMLElement>('[data-group-block]')) {
        const box = block.getBoundingClientRect()
        const more = aimed.current?.into === block.dataset.groupBlock ? heightRef.current : 0
        if (pointer.y >= box.top - more && pointer.y <= box.bottom + more) inside = block.dataset.groupBlock ?? null
      }
      if (inside !== withinRef.current) (withinRef.current = inside, setWithin(inside))
    }
    if (!target || target === id || !pointer || (manyRef.current.length > 1 && manyRef.current.includes(target))) return point(null)
    const at = (pointer.y - over.rect.top) / over.rect.height
    const own = home.get(id)
    const targetGroup = isGroup(target) ? target.slice(KEY.length) : home.get(target)
    // A group never goes into another, and a note's own group is no new home.
    const joinable = !isGroup(id) && !(own && own === targetGroup)
    const how: How = joinable && at > 0.28 && at < 0.72 ? 'join' : at < 0.5 ? 'before' : 'after'
    const into = isGroup(id) ? null : how === 'join' ? targetGroup ?? null : isGroup(target) ? (how === 'after' && info.get(targetGroup!)?.open ? targetGroup! : null) : targetGroup ?? null
    const name = (group: string | null | undefined): string => info.get(group ?? '')?.name ?? 'the group'
    // Several carried say how many.
    const n = manyRef.current.length
    const count = n > 1 ? `${n} ` : ''
    const words =
      isGroup(id) ? null
      : how === 'join' ? (into ? `Add ${count}to ${name(into)}` : n > 1 ? `New group of ${n + 1}` : 'New group')
      : own && into !== own ? (into ? `Move ${count}to ${name(into)}` : `Remove ${count}from ${name(own)}`)
      : !own && into ? `Add ${count}to ${name(into)}`
      : n > 1 ? `Move ${n} here`
      : null
    // Sorted some other way, a row has no place of its own to move to: only into a group, or out of one, does anything.
    if (!ordered && !isGroup(id) && how !== 'join' && (into ?? undefined) === own) return point(null)
    point({ target, how, into, label: words, tint: tintOf(info.get(into ?? own ?? '')?.color) })
  }
  const end = (): void => {
    unspring()
    withinRef.current = null
    setWithin(null)
    setMany([])
    setCarried(null)
    point(null)
  }
  const onDragEnd = ({ active, over }: DragEndEvent): void => {
    const now = aimed.current
    end()
    if (!over || !now || now.target === String(active.id)) return chime('stay')
    onDrop(manyRef.current.length > 1 ? manyRef.current : [String(active.id)], now.target, now.how)
  }
  const own = carried ? home.get(carried) : undefined
  const leaving = own && aim && aim.into !== own ? { group: own, id: carried! } : null
  let index = 0
  const lines = bundles.map((one) => {
    const start = index
    if (!one.group || one.group.open) index += one.entries.length
    return { one, start }
  })
  const line = lines.findIndex(({ one, start }) => cursor >= start && cursor < start + ((!one.group || one.group.open) ? one.entries.length : 0))
  const row = (entry: Entry, at: number, inner?: CSSProperties, indent?: number): React.JSX.Element => (
    <Node key={entry.id} id={entry.id} inner={inner} indent={indent}>
      <div className={`group/item relative ${arrived(entry.id) ? 'mf-arrive' : ''}`}>
        {face(entry, at)}
        {after?.(entry)}
      </div>
    </Node>
  )
  return (
    <DndContext sensors={sensors} collisionDetection={collide} modifiers={[upDown]} measuring={{ droppable: { strategy: MeasuringStrategy.WhileDragging } }}
      onDragStart={onDragStart} onDragMove={onDragMove} onDragOver={({ over }) => ticks(over?.id)} onDragEnd={onDragEnd} onDragCancel={end}>
      <SortableContext items={keys} strategy={strategy}>
        <Carrying.Provider value={{ aim, height, leaving, down, along: new Set(many.filter((one) => one !== carried)), within, hand: carried }}>
          {ordered && <OwnOrderHint />}
          <VirtualList items={lines} keyOf={({ one }) => (one.group ? KEY + one.group.id : one.entries[0].id)} cursor={line >= 0 ? line : undefined} estimate={estimate} className={className}>
            {({ one, start }) =>
              one.group ? (
                // A little air above and below every group, so two in a row never touch.
                <div className="py-1">
                <GroupBlock group={one.group} entries={one.entries} start={start} row={row} carried={carried === KEY + one.group.id} renaming={renaming === one.group.id}
                  born={born === one.group.id} onRenaming={(on) => onRenaming(on ? one.group!.id : null)} onFold={(open) => onFold(one.group!, open)} onNewNote={onNewNote} />
                </div>
              ) : (
                row(one.entries[0], start)
              )
            }
          </VirtualList>
        </Carrying.Provider>
      </SortableContext>
      <Overlay dropAnimation={still() ? null : SETTLE}>
        {carried && <Ghost carried={carried} bundles={bundles} many={many} aim={aim} grab={grab} lift={aim?.how === 'join' && !down ? height : 0} dragY={dragY} />}
      </Overlay>
    </DndContext>
  )
}

/**
 * What is carried: one small card beside the pointer, the same one the whole
 * way, whatever it is over. Its words change in place (Move here, Add to
 * Memory, New group), and over a row's middle it drops into the room it
 * previews. Several carried show as a stack with a count; a group, by its
 * icon and name.
 */
function Ghost({ carried, bundles, many, aim, grab, lift, dragY }: { carried: string; bundles: Bundle[]; many: string[]; aim: Aim | null; grab: number; lift: number; dragY: MotionValue<number> }): React.JSX.Element {
  const group = isGroup(carried) ? bundles.find((one) => one.group && KEY + one.group.id === carried)?.group : undefined
  const entries = bundles.flatMap((one) => one.entries)
  const entry = group ? undefined : entries.find((one) => one.id === carried)
  const words = aim?.label ?? (aim ? 'Move here' : null)
  // The rest carried, fanned up and to the left behind the one in hand: two at most show.
  const behind = many.filter((one) => one !== carried).slice(0, 2).map((id) => entries.find((one) => one.id === id)).filter((one): one is Entry => !!one)
  return (
    <div className="relative h-full w-full">
      <div className="absolute top-1/2 w-[60%] min-w-64" style={{ left: `min(${grab + 18}px, 40%)`, translate: '0 -50%' }}>
        <motion.div className="relative" initial={false} animate={{ y: lift }} transition={still() ? { duration: 0 } : springs.moderate}>
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
      <button type="button" onClick={done} className="shrink-0 rounded px-1.5 py-0.5 hover:bg-accent hover:text-foreground">Got it</button>
    </p>
  )
}

/** How many are carried, in a small badge on the lifted card's corner. */
function Count({ n }: { n: number }): React.JSX.Element {
  return (
    <span data-carried={n} className="absolute -bottom-3 left-1/2 z-10 flex h-5 -translate-x-1/2 min-w-5 items-center justify-center rounded-full bg-(--tt-brand-color-400) px-1.5 text-[11px] font-semibold text-[var(--on-brand,white)] tabular-nums shadow-sm animate-in zoom-in-75 fade-in-0 duration-150">
      {n}
    </span>
  )
}

/** A group's icon: an emoji, a kind's drawing, or the stack every group starts with, in its colour. */
export function GroupIcon({ icon, color, className = 'size-4' }: { icon: string | null; color: string | null; className?: string }): React.JSX.Element {
  const kind = icon?.startsWith('kind:') ? CAPTURE_TYPES.find((one) => one.id === icon.slice(5)) : undefined
  const tint = tintOf(color)
  if (kind) return <kind.icon className={className} style={{ color: tint ?? kind.tint }} />
  if (icon) return <span className="text-[0.95rem] leading-none">{icon}</span>
  return <Layers className={cn(className, !tint && 'text-muted-foreground')} style={{ color: tint }} />
}

/** Set a group's look, and say so with a way back. */
const change = (group: GroupView, patch: Parameters<typeof groups.set>[1], said: string): void => {
  const was = { name: group.name, icon: group.icon, color: group.color }
  void groups.set(group.id, patch).then(() => toast(said, () => void groups.set(group.id, was)))
}

function GroupBlock({ group, entries, start, row, carried, renaming, born, onRenaming, onFold, onNewNote }: {
  group: GroupView
  entries: Entry[]
  start: number
  row: (entry: Entry, at: number, inner?: CSSProperties, indent?: number) => React.JSX.Element
  carried: boolean
  renaming: boolean
  born: boolean
  onRenaming: (on: boolean) => void
  onFold: (open: boolean) => void
  onNewNote: (id: string) => void
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
  const tint = tintOf(group.color)
  const key = KEY + group.id
  const { aim, height, leaving, down, within, hand, along } = useContext(Carrying)
  const joining = aim?.how === 'join' && aim.into === group.id
  // Carrying, the panel answers the pointer being anywhere within the group, and deepens when letting go would put the row in it.
  const near = within === group.id && !carried
  const landing = !!aim && aim.into === group.id
  const losing = leaving?.group === group.id ? entries.findIndex((entry) => entry.id === leaving.id) : -1
  // The panel follows what is about to happen: wider for one about to join, closing over one about to leave.
  // Room opened inside it for a row from elsewhere: the panel takes that row in too.
  const span = height * (along.size + 1)
  const stretch = landing && !entries.some((entry) => entry.id === hand) ? (down ? { top: -span } : { bottom: -span }) : losing >= 0 ? (down ? { bottom: span } : { top: span }) : {}
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
      if (!was) return (setParting(false), refuse('That group is already gone'))
      toast(`Separated: ${count === 1 ? 'the note stays' : `all ${count} notes stay`}`, () => void groups.restore(was).then(() => chime('gather')))
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
    change(group, { name: next.trim() }, `Renamed ${next.trim()}`)
  }
  const peek = usePeek(!group.open && !menu && !picking && !renaming && !hand && !parting)
  const shown = (menu || picking || renaming || joining || landing || near || losing >= 0 || pointing || !arrived || born) && !parting
  return (
    <div
      data-group-block={group.id}
      data-active={shown ? '' : undefined}
      className="group/fold relative isolate"
      style={{ '--group-tint': tint ?? 'var(--foreground)' } as CSSProperties}
    >
      {/* The panel: only while pointed at, or while something is about to happen to it. */}
      <div
        aria-hidden
        data-panel=""
        className={cn(
          'pointer-events-none absolute inset-0 -z-10 origin-top rounded-lg opacity-0 transition-[opacity,scale,top,bottom,background-color] duration-200 group-hover/fold:opacity-100 group-data-[active]/fold:opacity-100 motion-reduce:transition-none',
          carried && 'opacity-0!',
          parting && 'scale-[0.98] opacity-0!',
          !arrived && 'scale-[0.97]'
        )}
        style={{
          transitionTimingFunction: OUT,
          background: `color-mix(in srgb, var(--group-tint) ${(tint ? 9 : 4.5) * (pointing ? 1.7 : landing ? 1.6 : 1)}%, transparent)`,
          ...stretch
        }}
      />
      {/* The row: folded away until a group just made unfolds it, and as a separated one goes. */}
      <div
        className="grid transition-[grid-template-rows,opacity] duration-200 motion-reduce:transition-none"
        style={{ transitionTimingFunction: OUT, gridTemplateRows: arrived && !parting ? '1fr' : '0fr', opacity: arrived && !parting ? 1 : 0, transitionDelay: parting ? `${count * 40}ms` : undefined }}
      >
        <div className={cn('min-h-0 min-w-0', (!arrived || parting) && 'overflow-hidden')}>
          <Node id={key}>
            <Popover open={picking} onOpenChange={setPicking}>
              <ContextMenu onOpenChange={setMenu}>
                <ContextMenuTrigger asChild>
                  {renaming ? (
                    <div className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 data-[state=open]:bg-transparent!">
                      <PopoverAnchor asChild><span className="flex w-9 shrink-0 justify-center"><GroupIcon icon={group.icon} color={group.color} /></span></PopoverAnchor>
                      <input
                        autoFocus
                        defaultValue={group.name}
                        aria-label="Group name"
                        onFocus={(event) => event.target.select()}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') rename(event.currentTarget.value)
                          if (event.key === 'Escape') (event.preventDefault(), event.stopPropagation(), onRenaming(false))
                        }}
                        onBlur={(event) => rename(event.target.value)}
                        className="min-w-0 flex-1 rounded-sm bg-transparent text-control font-semibold outline-none placeholder:text-muted-foreground"
                        placeholder="Name the group"
                      />
                    </div>
                  ) : (
                    <button
                      type="button"
                      data-group-row={group.id}
                      aria-expanded={group.open}
                      onPointerMove={(event) => peek.near(event)}
                      onPointerLeave={peek.away}
                      onClick={() => (peek.close(), fold())}
                      onDoubleClick={() => onRenaming(true)}
                      // ← folds and → unfolds, as a folder in a list does.
                      onKeyDown={(event) => {
                        if ((event.key === 'ArrowLeft' && group.open) || (event.key === 'ArrowRight' && !group.open)) (event.preventDefault(), fold())
                      }}
                      // The panel marks it while its menu is open: no second mark on the row.
                      className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 pr-9 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:bg-transparent!"
                    >
                      <PopoverAnchor asChild><span className="flex w-9 shrink-0 justify-center"><GroupIcon icon={group.icon} color={group.color} /></span></PopoverAnchor>
                      <span className="min-w-0 truncate text-control font-semibold">{name}</span>
                      <ChevronRight
                        aria-hidden
                        className="size-3.5 shrink-0 text-muted-foreground transition-transform duration-200 motion-reduce:transition-none"
                        style={{ transitionTimingFunction: OUT, transform: `rotate(${group.open ? 90 : 0}deg)` }}
                      />
                      {/* Folded, how many it holds, coming out of the chevron. */}
                      <AnimatePresence initial={false}>
                        {!group.open && (
                          <motion.span
                            key="count"
                            data-count=""
                            className="shrink-0 rounded-full px-1.5 text-xs leading-5 text-muted-foreground tabular-nums"
                            style={{ background: `color-mix(in srgb, var(--group-tint) ${tint ? 14 : 8}%, transparent)` }}
                            initial={{ opacity: 0, scale: 0.6, x: -6 }}
                            animate={{ opacity: 1, scale: 1, x: 0 }}
                            exit={{ opacity: 0, scale: 0.6, x: -6, transition: { duration: 0.08 } }}
                            transition={still() ? { duration: 0 } : springs.moderate}
                          >
                            {count}
                          </motion.span>
                        )}
                      </AnimatePresence>
                    </button>
                  )}
                </ContextMenuTrigger>
                <GroupMenu group={group} members={entries.map((entry) => entry.id)} onSeparate={separate} onRename={() => onRenaming(true)} onIcon={() => setPicking(true)} onNewNote={onNewNote} />
              </ContextMenu>
              <PopoverContent align="start" className="w-auto gap-0 overflow-hidden p-0">
                <IconChoice group={group} onPick={(icon) => (change(group, { icon }, 'Icon changed'), chime('tap'), setPicking(false))} />
              </PopoverContent>
            </Popover>
            {!renaming && (
              <Tip label={`Separate: keeps ${count === 1 ? 'the note' : `all ${count} notes`}`}>
                <button
                  type="button"
                  onClick={separate}
                  onMouseEnter={() => setPointing(true)}
                  onMouseLeave={() => setPointing(false)}
                  // Not a handle: pressing here never lifts the group.
                  onPointerDown={(event) => event.stopPropagation()}
                  className="absolute top-1/2 right-0.5 flex size-6 -translate-y-1/2 cursor-pointer! items-center justify-center rounded-md text-muted-foreground opacity-0 transition-opacity duration-150 group-hover/fold:opacity-100 group-data-[active]/fold:opacity-100 hover:text-foreground focus-visible:opacity-100"
                >
                  <X className="size-3.5" />
                </button>
              </Tip>
            )}
          </Node>
        </div>
      </div>
      {peek.at && (
        <GroupPeek group={group} entries={entries} at={peek.at} onStay={peek.stay} onAway={peek.away} onClose={peek.close} onOpen={onNewNote} />
      )}
      <Fold open={group.open}>
        <div className="pb-1">
          {entries.map((entry, at) =>
            row(entry, start + at, {
              // Its notes sit in by a step; separating, they slide back out to the list's edge one after another.
              translate: parting ? `-${INDENT}px 0` : undefined,
              transitionDelay: parting ? `${at * 40}ms` : undefined
            }, INDENT)
          )}
        </div>
      </Fold>
    </div>
  )
}

/**
 * Hovering a folded group's row: after a short rest (and only once the hand
 * really moved, lib/real-move.ts), its notes show beside it, as Dia shows a
 * folded tab group's tabs. Leaving the row gives a moment to reach them.
 */
function usePeek(can: boolean): { at: DOMRect | null; near: (event: React.PointerEvent<HTMLElement>) => void; away: () => void; stay: () => void; close: () => void } {
  const [at, setAt] = useState<DOMRect | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const leave = useRef<ReturnType<typeof setTimeout>>(undefined)
  const close = (): void => (clearTimeout(timer.current), clearTimeout(leave.current), setAt(null))
  useEffect(() => void (!can && close()), [can]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => close, []) // eslint-disable-line react-hooks/exhaustive-deps
  return {
    at,
    near: (event) => {
      if (!can || !realMove(event) || event.buttons || 'dragging' in document.documentElement.dataset) return
      clearTimeout(leave.current)
      if (at) return
      const row = event.currentTarget
      clearTimeout(timer.current)
      timer.current = setTimeout(() => row.isConnected && setAt(row.getBoundingClientRect()), 320)
    },
    away: () => {
      clearTimeout(timer.current)
      clearTimeout(leave.current)
      leave.current = setTimeout(() => setAt(null), 180)
    },
    stay: () => clearTimeout(leave.current),
    close
  }
}

/** A folded group's notes beside its row: each to open (⌥-click to the side), and a new one in it. */
function GroupPeek({ group, entries, at, onStay, onAway, onClose, onOpen }: {
  group: GroupView
  entries: Entry[]
  at: DOMRect
  onStay: () => void
  onAway: () => void
  onClose: () => void
  onOpen: (id: string) => void
}): React.JSX.Element {
  const right = at.left + 248 + 260 < window.innerWidth
  const left = right ? Math.min(at.left + 248, at.right - 40) : Math.max(12, at.left + 24)
  const top = right ? at.top - 6 : at.bottom + 4
  return createPortal(
    <motion.div
      role="toolbar"
      aria-label={`${group.name}: ${entries.length === 1 ? 'one note' : `${entries.length} notes`}`}
      data-group-peek={group.id}
      className="fixed z-[70] flex max-h-80 w-64 flex-col overflow-hidden rounded-lg border bg-popover p-1 text-control text-popover-foreground shadow-(--mf-panel-shadow)"
      style={{ left, top }}
      initial={{ opacity: 0, x: right ? -4 : 0, y: right ? 0 : -4, scale: 0.98 }}
      animate={{ opacity: 1, x: 0, y: 0, scale: 1 }}
      transition={still() ? { duration: 0 } : springs.moderate}
      onPointerEnter={onStay}
      onPointerLeave={onAway}
    >
      <div className="flex items-center gap-2 px-2 pt-1 pb-1.5 text-meta text-muted-foreground">
        <GroupIcon icon={group.icon} color={group.color} className="size-3.5" />
        <span className="min-w-0 truncate">{group.name}</span>
      </div>
      <div className="min-h-0 overflow-y-auto">
        {entries.map((entry) => (
          <button key={entry.id} type="button" data-peek-note={entry.id} data-private={entry.private ? '' : undefined}
            onClick={(event) => {
              onClose()
              if (event.altKey) return openAside(entry.type, entry.id)
              // The note's own page turn is the sound: no second one first.
              onOpen(entry.id)
            }}
            className="flex w-full items-center gap-2 rounded-md px-2 py-1 text-left hover:bg-accent">
            <entry.icon className="size-3.5 shrink-0" style={{ color: entry.tint }} />
            <span className="private-text min-w-0 flex-1 truncate">{entry.title || 'Untitled'}</span>
          </button>
        ))}
      </div>
      <div className="mt-1 border-t pt-1">
        <button type="button" data-peek-new=""
          onClick={() => (onClose(), void groups.note(group.id).then((id) => id && (chime('promote'), onOpen(id))))}
          className="flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-muted-foreground hover:bg-accent hover:text-foreground">
          <Plus className="size-3.5 shrink-0" />
          New note in group
        </button>
      </div>
    </motion.div>,
    document.body
  )
}

/**
 * What a group holds, opening to its height and closing to nothing on the
 * grid-rows trick, its notes drawing up into the row as they go: under a
 * quarter of a second, easing out, and at once with Reduce motion. Shut, its
 * notes leave the page, so nothing hidden can be dropped on.
 */
function Fold({ open, children }: { open: boolean; children: ReactNode }): React.JSX.Element {
  const instant = still()
  const [kept, setKept] = useState(open)
  const [settled, setSettled] = useState(open)
  const was = useRef(open)
  if (was.current !== open) {
    was.current = open
    if (open && !kept) setKept(true)
    setSettled(instant)
    if (!open && instant) setKept(false)
  }
  return (
    <div
      inert={!open}
      onTransitionEnd={(event) => {
        if (event.target !== event.currentTarget || event.propertyName !== 'grid-template-rows') return
        setSettled(true)
        if (!open) setKept(false)
      }}
      className="grid transition-[grid-template-rows,opacity] duration-200 motion-reduce:transition-none"
      style={{ transitionTimingFunction: OUT, gridTemplateRows: open ? '1fr' : '0fr', opacity: open ? 1 : 0 }}
    >
      {/* Cut only while it moves: open and still, a row lifted past its edge shows whole. */}
      {/* min-w-0: a grid item is as wide as its longest title otherwise, and the rows' titles ran past the panel instead of ending in an ellipsis. */}
      <div className={cn('min-h-0 min-w-0', !(open && settled) && 'overflow-hidden')}>
        <div className="transition-[translate] duration-200 motion-reduce:transition-none" style={{ transitionTimingFunction: OUT, translate: open ? '0 0' : '0 -8px' }}>
          {kept && children}
        </div>
      </div>
    </div>
  )
}

/** A right click on a group's row: Vigil's own menu, with its colours as a row of dots. */
function GroupMenu({ group, members, onSeparate, onRename, onIcon, onNewNote }: {
  group: GroupView
  members: string[]
  onSeparate: () => void
  onRename: () => void
  onIcon: () => void
  onNewNote: (id: string) => void
}): React.JSX.Element {
  const later = (run: () => void) => () => void setTimeout(run, 0)
  return (
    <ContextMenuContent className="w-56" onCloseAutoFocus={(event) => event.preventDefault()}>
      <ContextMenuItem onSelect={() => void groups.note(group.id).then((id) => id && (chime('promote'), onNewNote(id)))}>New note in group</ContextMenuItem>
      <ContextMenuItem onSelect={onSeparate}>Separate</ContextMenuItem>
      <ContextMenuItem
        onSelect={() =>
          void groups.duplicate(group.id).then((made) => made && (chime('copy'), toast('Duplicated, with a copy of each note', () => void groups.unclone(made.ids))))
        }
      >
        Duplicate group
      </ContextMenuItem>
      <ContextMenuItem
        onSelect={() =>
          void groups.links(group.id).then((links) => (links.length ? copy(links.join('\n'), `Copied ${links.length === 1 ? 'one link' : `${links.length} links`}`) : refuse('No web links in this group')))
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
              change(group, { color: next }, next ? `Coloured ${next}` : 'Colour taken off')
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
      <ContextMenuItem onSelect={() => void archive('nuggets', members, true)}>Archive group</ContextMenuItem>
    </ContextMenuContent>
  )
}

/** The kinds' own drawings first, then any emoji. */
function IconChoice({ group, onPick }: { group: GroupView; onPick: (icon: string | null) => void }): React.JSX.Element {
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
      </div>
      <IconPicker icon={group.icon ?? ''} className="rounded-none! border-0! bg-transparent! shadow-none!" onPick={({ icon }) => icon && onPick(icon)} />
    </div>
  )
}
