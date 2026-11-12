import { Fragment, createContext, useContext, useEffect, useId, useLayoutEffect, useRef, useState, type ComponentProps, type ReactNode } from 'react'
import { dragWords } from '@/lib/drag-words'
import { createPortal } from 'react-dom'
import { DndContext, DragOverlay, useDndMonitor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent, type DragMoveEvent, type DragStartEvent, type DropAnimation, type Modifier } from '@dnd-kit/core'
import { SortableContext, arrayMove, horizontalListSortingStrategy, useSortable } from '@dnd-kit/sortable'
import { motion } from 'motion/react'
import { EASING, spring, still } from '@/lib/motion'
import { CarriedCard, CarryRow, DropLine, Hand, Shaped, pointerAt, rowAt, swallowRelease, titleOf, useAim, useRest } from './carry'
import { chime } from '@/lib/sound'
import { slotTicker } from '@/lib/proximity'
import { refuse } from './ui'

/**
 * Dragging rows into your own order, drawn the one way every list draws a
 * carry (carry.tsx): the row lifts as a card that says what letting go would
 * do, the others glide aside to open room where it will land with a line
 * through its middle, and the list scrolls by itself near its top and bottom.
 */

/** Up and down only: a list has no sideways. */
export const upDown: Modifier = ({ transform }) => ({ ...transform, x: 0 })
/** Side to side only, for a row of tabs. */
const sideways: Modifier = ({ transform }) => ({ ...transform, y: 0 })

/** Settles with a small overshoot, a spring's shape in one curve. */
export const SETTLE: DropAnimation = { duration: 280, easing: 'cubic-bezier(0.2, 1.25, 0.4, 1)' }

/**
 * The lifted thing, drawn at the page's top level. Inside an ancestor that is
 * moved or eased in (a view sliding up), `fixed` counts from that ancestor
 * rather than the window, and the lifted thing floated off from the pointer.
 */
const putBack = (event: KeyboardEvent): void => {
  if (event.key !== 'Escape') return
  event.preventDefault()
  event.stopPropagation()
  swallowRelease()
  window.dispatchEvent(new Event('resize'))
}

export function Overlay(props: ComponentProps<typeof DragOverlay>): React.JSX.Element {
  // The closed hand for as long as something is carried, wherever the pointer is.
  // Esc while carrying puts it back and does nothing else: the page under it
  // never sees the key (it went back a page, or shut the view). dnd-kit lets go
  // on a resize of the window, so that is how it is told.
  const hand = (on: boolean) => (): void => {
    if (on) (document.documentElement.dataset.dragging = ''), window.addEventListener('keydown', putBack, true)
    else delete document.documentElement.dataset.dragging, window.removeEventListener('keydown', putBack, true)
  }
  useDndMonitor({ onDragStart: hand(true), onDragEnd: hand(false), onDragCancel: hand(false) })
  useEffect(() => hand(false), []) // eslint-disable-line react-hooks/exhaustive-deps
  // Marked, so a check can count the lifted pictures on screen (qa/matrix-drag.mjs): one, never two.
  return createPortal(<DragOverlay {...props} className={`mf-drag-picture ${props.className ?? ''}`} />, document.body)
}

/**
 * For a lifted picture smaller than what was picked up: the point you grabbed
 * stays where it was on it, pulled in only as far as it takes to keep the
 * pointer on the picture.
 */
export const underPointer: Modifier = ({ transform, activatorEvent, activeNodeRect, overlayNodeRect }) => {
  if (!activeNodeRect || !overlayNodeRect || !(activatorEvent instanceof PointerEvent)) return transform
  const x = activatorEvent.clientX - activeNodeRect.left
  const y = activatorEvent.clientY - activeNodeRect.top
  return {
    ...transform,
    x: transform.x + Math.max(0, x - (overlayNodeRect.width - 12)),
    y: transform.y + Math.max(0, y - overlayNodeRect.height / 2)
  }
}

/** A place a row can be dropped on (`data-row-drop`, or a part's heading, `data-row-part`), lit as a calendar's day is while a row is over it. */
export const DROP_LIT = 'transition-colors data-[drop-hot]:bg-accent data-[drop-hot]:text-foreground data-[drop-hot]:ring-1 data-[drop-hot]:ring-ring'

/** Whether rows here can be dragged at all: a list not in your own order never drags. */
const On = createContext(false)
/** Which way the rows go: down a list, or along a row of tabs. */
const Axis = createContext<'y' | 'x'>('y')
/**
 * From the lift until just after the drop: a row that glides to its new place
 * (moved from a menu) stays put then, since the drag has already carried it.
 */
const Sorting = createContext(false)
/** The list's order, as one string: a row glides only when this changes, never when a row above it grows or folds. */
const Order = createContext<string | undefined>(undefined)

/** A row rested on another's middle: what may happen there. `refused` says why it cannot. */
export type NestCheck = (carried: string, target: string) => true | { refused: string } | false

/** A card on the Board, as it looked when picked up: a card lifted is the same card. */
export const snapshot = (id: string): Shot | null => {
  const node = document.querySelector<HTMLElement>(`[data-sortable-id="${CSS.escape(id)}"]`)
  if (!node) return null
  const box = node.getBoundingClientRect()
  return { id, html: node.innerHTML, width: box.width, height: box.height }
}
type Shot = { id: string; html: string; width: number; height: number }

/** What a lifted row's card says, read as it is picked up: the row itself may scroll away under the pointer. */
const carriedOf = (id: string, event: Event): Lift | null => {
  const row = `[data-sortable-id="${CSS.escape(id)}"]`
  // The row the press was on: two lists on the page can hold the same thing (two panes).
  const node = (event.target instanceof Element ? event.target.closest<HTMLElement>(row) : null) ?? document.querySelector<HTMLElement>(row)
  if (!node) return null
  const box = node.getBoundingClientRect()
  const [x, y] = event instanceof PointerEvent ? [event.clientX, event.clientY] : [box.left, box.top]
  // A task's card is its words alone: its first picture is the tick's check, which would read as done.
  const icon = node.querySelector('[data-task-row]') ? undefined : [...node.querySelectorAll('svg')].find((one) => !one.closest('[data-grip]'))
  // Its list's own part of the page: the nearest thing round it that holds another row.
  let within = node.parentElement
  while (within && within !== document.body && within.querySelectorAll('[data-sortable-id]').length < 2) within = within.parentElement
  return { id, title: titleOf(node), icon: icon?.outerHTML, grab: x - box.left, from: x, top: y - box.top, tall: box.height, within }
}
type Lift = { id: string; title: string; icon?: string; grab: number; from: number; /** How far down the row it was taken, and how tall the row was then. */ top: number; tall: number; within: HTMLElement | null }

function Lifted({ shot, axis = 'y', words, refused, at }: { shot: Lift; axis?: 'x' | 'y'; /** What letting go here does. */ words?: string | null; refused?: boolean; at?: number }): React.JSX.Element {
  return (
    <Hand grab={shot.grab} from={axis === 'x' ? null : shot.from} at={at}>
      <CarriedCard attrs={{ 'data-lifted': '' }} title={shot.title} words={words} refused={refused} icon={shot.icon ? <span aria-hidden className="shrink-0 [&_svg]:block [&_svg]:size-4" dangerouslySetInnerHTML={{ __html: shot.icon }} /> : undefined} />
    </Hand>
  )
}

type ListProps<T> = {
  items: T[]
  /**
   * A row carried onto another's middle and rested there a moment is made its
   * step: that row lights and the card says so; the edges still reorder.
   * `nests` says whether a row may take it (false: not offered; refused: said why).
   */
  onNest?: (id: string, target: string) => void
  nests?: NestCheck
  /** Down a list (the usual), or along a row (tabs). */
  axis?: 'y' | 'x'
  keyOf: (item: T) => string
  /** A row dropped onto another lands before it (going up) or after it (going down). */
  onMove?: (id: string, target: string, after: boolean) => void
  /**
   * Places on the page a row can be dropped on, as well as among its rows (a
   * tab, a card): any element marked `data-row-drop` with what it is. Lit
   * while the row is over one, and the card says what letting go there does.
   */
  places?: { drop: (id: string, place: string) => void; said: (place: string) => string }
  /**
   * Rows standing in parts under a heading each (Overdue, Today), where a rule
   * of the part's own says what is in it. Carried over another part's rows,
   * nothing opens: that part's heading (`data-row-part`) lights and the card
   * says what letting go does (`words`), or why it cannot go there (`refused`).
   */
  parts?: { of: (id: string) => string | undefined; take: (id: string, part: string) => { words: string } | { refused: string }; drop: (id: string, part: string) => void }
  children: (items: T[]) => ReactNode
}

/**
 * A list whose rows can be dragged into a new order. It holds the new order
 * itself from the moment you let go until the saved one comes back, so the
 * row never jumps back to where it was while the save is on its way.
 */
export function SortableList<T>(props: ListProps<T>): React.JSX.Element {
  return props.axis === 'x' ? <TabRow {...props} /> : <Rows {...props} />
}

/** The new order, held from the drop until the saved one arrives, and the lift's own state. */
function useHeld<T>(items: T[], keyOf: (item: T) => string): { shown: T[]; keys: string[]; setHeld: (ids: string[]) => void; sorting: boolean; lifting: () => void; landed: () => void } {
  const [held, setHeld] = useState<string[] | null>(null)
  const [sorting, setSorting] = useState(false)
  const settle = useRef<ReturnType<typeof setTimeout>>(undefined)
  const incoming = items.map(keyOf).join('\n')
  // The saved order (or anything else) has arrived: it is the truth again.
  useEffect(() => setHeld(null), [incoming])
  const byId = new Map(items.map((item) => [keyOf(item), item]))
  const shown = held ? held.map((id) => byId.get(id)).filter((one): one is T => !!one) : items
  return {
    shown, keys: shown.map(keyOf), setHeld, sorting,
    lifting: () => (clearTimeout(settle.current), setSorting(true)),
    // A row gliding to a new place from a menu stays put until the drop has settled (Sorting).
    landed: () => (clearTimeout(settle.current), void (settle.current = setTimeout(() => setSorting(false), 320)))
  }
}

function Rows<T>({ items, keyOf, onMove, onNest, nests, places, parts, children }: ListProps<T>): React.JSX.Element {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))
  const { shown, keys, setHeld, sorting, lifting, landed } = useHeld(items, keyOf)
  const [shot, setShot] = useState<Lift | null>(null)
  const carrying = useRef<Lift | null>(null)
  // The room the carried row takes: its own height, folded to its one line.
  const [span, setSpan] = useState(0)
  // Let go with a drop: until the next lift, rows go straight to their places. `quiet`: the card has nowhere to fly back to.
  const [snap, setSnap] = useState(false)
  const [quiet, setQuiet] = useState(false)
  // What letting go would do, with the tick and tap of each new place.
  const { aim, aimed, start, point } = useAim()
  // A place on the page lit while the carried row would go there (a tab, a part's heading).
  const lit = useRef<HTMLElement | null>(null)
  const light = (next: HTMLElement | null): void => {
    if (lit.current === next) return
    if (lit.current) delete lit.current.dataset.dropHot
    if (next) next.dataset.dropHot = ''
    lit.current = next
  }
  const read = useRef((): void => undefined)
  const { rested, undwell } = useRest(() => read.current())
  // In the hand a row folds to its one line (CarryRow marks it, main.css folds it): its room is that tall, read once it has folded.
  useLayoutEffect(() => {
    if (!shot) return
    const node = (shot.within ?? document).querySelector(`[data-sortable-id="${CSS.escape(shot.id)}"]`)
    if (node) setSpan(node.getBoundingClientRect().height)
  }, [shot])
  // Sideways the list's own drag says nothing (it goes up and down only): along a row of tabs the pointer itself is followed.
  const tabs = !!places
  useEffect(() => {
    if (!shot || !tabs) return
    const follow = (): void => read.current()
    window.addEventListener('pointermove', follow)
    return () => window.removeEventListener('pointermove', follow)
  }, [shot, tabs])
  if (!onMove && !onNest) return <>{children(items)}</>
  read.current = (): void => {
    const lift = carrying.current
    if (!lift) return
    const id = lift.id
    const { x, y } = pointerAt()
    // A place on the page: it lights, and the card says what letting go there does.
    const spot = places ? document.elementsFromPoint(x, y).map((one) => one.closest<HTMLElement>('[data-row-drop]')).find((one) => !!one) : undefined
    if (spot && places) {
      const place = spot.dataset.rowDrop ?? ''
      return (undwell(), light(spot), point({ target: place, how: 'join', into: place, label: places.said(place), gap: null, around: [], act: 'place' }))
    }
    // The row whose place the pointer is over, as the list lies before anything slid aside.
    const over = rowAt(new Set(keys), y, lift.within)
    if (!over || over.id === id) return (undwell(), light(null), point(null, true))
    const target = over.id
    const at = (y - over.top) / over.height
    // Rested on a row's middle: its step, or the reason it cannot be. Until it has rested there, it only moves beside it.
    const may = onNest && at > 0.28 && at < 0.72 ? (nests ? nests(id, target) : true) : false
    if (!may) undwell()
    else if (rested(target)) {
      light(null)
      return point(may === true
        ? { target, how: 'join', into: target, label: `Make it a step of “${titleOf(over.node)}”`, gap: null, around: [], act: 'step' }
        : { target, how: 'join', into: null, label: may.refused, gap: null, around: [], refused: true })
    }
    if (!onMove) return (light(null), point(null, true))
    // Another part of the list, whose own rule says what is in it: its heading lights and nothing opens.
    const part = parts?.of(target)
    if (parts && part !== undefined && part !== parts.of(id)) {
      const take = parts.take(id, part)
      const no = 'refused' in take
      light(no ? null : (lift.within?.querySelector<HTMLElement>(`[data-row-part="${CSS.escape(part)}"]`) ?? null))
      return point({ target: part, how: 'join', into: no ? null : part, label: no ? take.refused : take.words, gap: null, around: [], refused: no || undefined, act: 'part' })
    }
    light(null)
    // Among the rows, the one under the pointer makes way: up if the carried row came from above it, down if from below.
    const [from, to] = [keys.indexOf(id), keys.indexOf(target)]
    const gap = from < to ? to : to - 1
    const next = keys[gap + 1]
    // Last of its part (a heading comes next), the room sits close under the row before it.
    point({ target, how: from < to ? 'after' : 'before', into: null, label: 'Move here', gap, around: [], snug: next === undefined || (!!parts && parts.of(next) !== parts.of(id)) })
  }
  const end = (): void => {
    carrying.current = null
    setShot(null)
    undwell()
    light(null)
    point(null)
    landed()
  }
  const onDragStart = ({ active, activatorEvent }: DragStartEvent): void => {
    const lift = carriedOf(String(active.id), activatorEvent)
    chime('lift')
    lifting()
    setSnap(false)
    setQuiet(false)
    start(String(active.id), null)
    carrying.current = lift
    setShot(lift)
    setSpan(lift?.tall ?? 0)
  }
  const onDragEnd = ({ active }: DragEndEvent): void => {
    const now = aimed.current
    const id = String(active.id)
    end()
    setQuiet(!now || now.gap === null)
    if (!now) return chime('stay')
    if (now.refused) return refuse(now.label ?? '')
    if (now.act === 'place') return places?.drop(id, now.target)
    if (now.act === 'part') return parts?.drop(id, now.target)
    setSnap(true)
    if (now.act === 'step') return (setHeld(keys.filter((one) => one !== id)), onNest?.(id, now.target))
    const [from, to] = [keys.indexOf(id), keys.indexOf(now.target)]
    setHeld(arrayMove(keys, from, to))
    onMove?.(id, now.target, to > from)
  }
  // A row taller in the list than in the hand (a task with its steps open): the card rides where it was taken.
  const folded = shot ? shot.tall - span : 0
  return (
    // Its screen-reader lines go to the page's foot, never among the rows (a tree of rows counts its children).
    // Where each row slides is worked out once, for them all (Shaped): dnd-kit moves none itself, and reads no row as under the card.
    <DndContext accessibility={dragWords} sensors={sensors} collisionDetection={nothing} modifiers={[upDown]} onDragStart={onDragStart} onDragMove={() => read.current()} onDragEnd={onDragEnd} onDragCancel={() => (end(), chime('stay'))}>
      <SortableContext items={keys} strategy={stayPut}>
        <Axis.Provider value="y"><Sorting.Provider value={sorting}><On.Provider value><Order.Provider value={keys.join('\n')}>
          <Shaped aim={aim} keys={keys} hand={shot?.id ?? null} many={shot ? [shot.id] : []} span={span} inset={0} row={span} snap={snap} blocks={[]} footRoom={false} within={shot?.within}>
            {children(shown)}
            {/* Folded in the hand, the list keeps the height it had: one scrolled to its end does not jump. */}
            {folded > 0.5 && <div aria-hidden data-kept-height="" style={{ height: folded }} />}
          </Shaped>
        </Order.Provider></On.Provider></Sorting.Provider></Axis.Provider>
      </SortableContext>
      <Overlay dropAnimation={still() || quiet ? null : SETTLE}>
        {shot && <Lifted shot={shot} words={aim?.label ?? null} refused={!!aim?.refused} at={folded > 0.5 ? shot.top : undefined} />}
      </Overlay>
    </DndContext>
  )
}

/** A row of tabs, carried side to side: they slide along to make room, the carried one's place kept quiet where it will land. */
function TabRow<T>({ items, keyOf, onMove, children }: ListProps<T>): React.JSX.Element {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))
  const { shown, keys, setHeld, sorting, lifting, landed } = useHeld(items, keyOf)
  const [shot, setShot] = useState<Lift | null>(null)
  // A soft tick as the lifted tab comes over each new place in the row.
  const ticks = useRef(slotTicker()).current
  if (!onMove) return <>{children(items)}</>
  const onDragEnd = ({ active, over }: DragEndEvent): void => {
    setShot(null)
    landed()
    if (!over || over.id === active.id) return chime('stay')
    const [from, to] = [keys.indexOf(String(active.id)), keys.indexOf(String(over.id))]
    setHeld(arrayMove(keys, from, to))
    onMove(String(active.id), String(over.id), to > from)
  }
  return (
    <DndContext accessibility={dragWords} sensors={sensors} collisionDetection={closestCenter} modifiers={[sideways]}
      onDragStart={({ active, activatorEvent }) => (chime('lift'), lifting(), ticks.start(String(active.id)), setShot(carriedOf(String(active.id), activatorEvent)))}
      onDragOver={({ over }) => ticks(over?.id)} onDragEnd={onDragEnd} onDragCancel={() => (setShot(null), landed(), chime('stay'))}>
      <SortableContext items={keys} strategy={horizontalListSortingStrategy}>
        <Axis.Provider value="x"><Sorting.Provider value={sorting}><On.Provider value><Order.Provider value={keys.join('\n')}>{children(shown)}</Order.Provider></On.Provider></Sorting.Provider></Axis.Provider>
      </SortableContext>
      <Overlay dropAnimation={still() ? null : SETTLE}>{shot && <Lifted shot={shot} axis="x" />}</Overlay>
    </DndContext>
  )
}

/**
 * One row of a SortableList. With `glide` (a name unique on the page), a row
 * moved some other way (a menu's Move up, or shown and hidden between two
 * lists) slides to its new place on a spring rather than jumping there.
 */
export function SortableRow({ id, glide, className, children }: { id: string; glide?: string; className?: string; children: ReactNode }): React.JSX.Element {
  const on = useContext(On)
  const axis = useContext(Axis)
  const sorting = useContext(Sorting)
  // Folding a group of rows above it (the sidebar's folders) moves it at once, in the same frame: only a change of order glides.
  const order = useContext(Order)
  // Down a list, the row every list carries (carry.tsx); it draws no handle of its own here.
  const row = !on ? <div className={className}>{children}</div> : axis === 'x' ? <Tab id={id} className={className}>{children}</Tab> : <CarryRow id={id} grip={false}>{children}</CarryRow>
  if (!glide) return row
  return <motion.div layout={sorting || still() ? false : 'position'} layoutDependency={order} layoutId={glide} transition={spring.moderate} className={className}>{row}</motion.div>
}

function Tab({ id, className, children }: { id: string; className?: string; children: ReactNode }): React.JSX.Element {
  const { setNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({ id, transition: still() ? null : { duration: 220, easing: EASING } })
  return (
    <div
      ref={setNodeRef}
      data-sortable-id={id}
      {...attributes}
      {...listeners}
      // The tab's own button keeps the focus and the keys; this is only the grip.
      tabIndex={-1}
      role={undefined}
      className={`${className ?? ''} ${isDragging ? 'mf-carried-place' : ''} rounded-md`}
      style={{ transform: transform ? `translate3d(${Math.round(transform.x)}px, 0, 0)` : undefined, transition }}
    >
      {children}
    </div>
  )
}

/** A row's new place: the block it goes into, and the row it goes before (null: that block's end). */
type BlockDrop = { block: string; before: string | null }
type Slot = BlockDrop & { y: number; left: number; width: number }
/** dnd-kit slides no row itself. */
const stayPut = (): null => null
/** Nor reads any row as under the card: where it would land is read off the page. */
const nothing = (): never[] => []

/**
 * Rows in blocks with gaps between, dragged as one list: a row carried
 * anywhere goes there, into whichever block the line is in. The line sits
 * where it will land, at a block's end or the next one's start, so the two
 * places either side of a gap are told apart. Over a part that is not these
 * rows (`refuse`: where, and what to say), there is no line, the pointer and
 * the card say it cannot go there, and letting go puts it back. Holds
 * the new blocks itself until the saved ones come back.
 */
export function BlockList<T>({ blocks, keyOf, onMove, refuse, row, around }: {
  blocks: { key: string; items: T[] }[]
  keyOf: (item: T) => string
  onMove?: (id: string, drop: BlockDrop) => void
  refuse?: { selector: string; said: string }
  /** One row; `among` is its block's rows. */
  row: (item: T, among: string[]) => ReactNode
  /** A block's box of rows, with whatever goes around it (a gap before, a part after). */
  around: (block: string, at: number, box: ReactNode, items: T[]) => ReactNode
}): React.JSX.Element {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))
  const list = useId()
  const [held, setHeld] = useState<{ key: string; ids: string[] }[] | null>(null)
  const [shot, setShot] = useState<Lift | null>(null)
  const [slot, setSlot] = useState<Slot | null>(null)
  const [refused, setRefused] = useState(false)
  const [sorting, setSorting] = useState(false)
  const now = useRef<{ slot: Slot | null; refused: boolean }>({ slot: null, refused: false })
  const settle = useRef<ReturnType<typeof setTimeout>>(undefined)
  const done = (): void => (clearTimeout(settle.current), void (settle.current = setTimeout(() => setSorting(false), 320)))
  const ticks = useRef(slotTicker()).current
  const lifted = useRef<string | null>(null)
  const incoming = blocks.map((one) => `${one.key}:${one.items.map(keyOf).join(',')}`).join('\n')
  useEffect(() => setHeld(null), [incoming])
  const byId = new Map(blocks.flatMap((one) => one.items.map((item): [string, T] => [keyOf(item), item])))
  const shown = held ? held.map((one) => ({ key: one.key, items: one.ids.map((id) => byId.get(id)).filter((item): item is T => !!item) })) : blocks
  const draw = (one: { key: string; items: T[] }, at: number): ReactNode => {
    const ids = one.items.map(keyOf)
    return <Fragment key={one.key}>{around(one.key, at, <div data-drop-list={list} data-drop-block={one.key} className="flex flex-col gap-px">{one.items.map((item) => row(item, ids))}</div>, one.items)}</Fragment>
  }
  if (!onMove) return <>{shown.map(draw)}</>
  // Where the pointer is: over a part that refuses, or the nearest place between rows.
  const where = (y: number): Slot | 'refused' | null => {
    for (const part of refuse ? document.querySelectorAll(refuse.selector) : []) {
      const box = part.getBoundingClientRect()
      if (box.height > 0 && y >= box.top && y <= box.bottom) return 'refused'
    }
    let best: Slot | null = null
    for (const block of document.querySelectorAll<HTMLElement>(`[data-drop-list="${CSS.escape(list)}"]`)) {
      const rows = [...block.querySelectorAll<HTMLElement>('[data-sortable-id]')]
      const box = block.getBoundingClientRect()
      // A block emptied by a drag still takes one back, where it sits.
      const marks = !rows.length ? [{ y: box.top, before: null }] : [...rows.map((one) => ({ y: one.getBoundingClientRect().top, before: one.dataset.sortableId ?? null })), { y: rows[rows.length - 1].getBoundingClientRect().bottom, before: null }]
      for (const mark of marks)
        if (!best || Math.abs(mark.y - y) < Math.abs(best.y - y)) best = { block: block.dataset.dropBlock ?? '', before: mark.before, y: mark.y, left: box.left, width: box.width }
    }
    return best
  }
  const mark = (next: Slot | null, no: boolean): void => {
    now.current = { slot: next, refused: no }
    setSlot(next)
    setRefused(no)
    if (no) document.documentElement.dataset.dragRefused = ''
    else delete document.documentElement.dataset.dragRefused
    // Both lines round its own place are one place: no tick or tap for staying put.
    ticks(no ? 'refused' : next ? (lifted.current && stays(lifted.current, next) ? 'stay' : `${next.block}:${next.before}`) : null)
  }
  // The place it already has: the line just above it, or just under it.
  const stays = (id: string, drop: BlockDrop): boolean => {
    const ids = shown.find((one) => one.key === drop.block)?.items.map(keyOf) ?? []
    const at = ids.indexOf(id)
    return at >= 0 && (drop.before === id || drop.before === (ids[at + 1] ?? null))
  }
  const onDragStart = ({ active, activatorEvent }: DragStartEvent): void => {
    chime('lift')
    clearTimeout(settle.current)
    setSorting(true)
    lifted.current = String(active.id)
    ticks.start('stay')
    setShot(carriedOf(String(active.id), activatorEvent))
  }
  const onDragMove = ({ activatorEvent, delta }: DragMoveEvent): void => {
    const found = where((activatorEvent as PointerEvent).clientY + delta.y)
    mark(found === 'refused' ? null : found, found === 'refused')
  }
  const onDragEnd = ({ active }: DragEndEvent): void => {
    const { slot: drop, refused: no } = now.current
    mark(null, false)
    setShot(null)
    done()
    const id = String(active.id)
    if (no) return chime('nope')
    if (!drop || stays(id, drop)) return chime('stay')
    const next = shown.map((one) => ({ key: one.key, ids: one.items.map(keyOf).filter((other) => other !== id) }))
    const into = next.find((one) => one.key === drop.block)
    if (!into) return chime('stay')
    into.ids.splice(drop.before ? into.ids.indexOf(drop.before) : into.ids.length, 0, id)
    setHeld(next)
    onMove(id, { block: drop.block, before: drop.before })
  }
  // Round its own place nothing would change: the card says nothing, as a list's does.
  const moves = !!slot && !!shot && !stays(shot.id, slot)
  return (
    <DndContext accessibility={dragWords} sensors={sensors} collisionDetection={closestCenter} modifiers={[upDown]} onDragStart={onDragStart} onDragMove={onDragMove} onDragEnd={onDragEnd} onDragCancel={() => (mark(null, false), setShot(null), done())}>
      <SortableContext items={shown.flatMap((one) => one.items.map(keyOf))} strategy={stayPut}>
        <Axis.Provider value="y"><Sorting.Provider value={sorting}><On.Provider value><Order.Provider value={shown.map((one) => one.key + ':' + one.items.map(keyOf).join(',')).join('\n')}>{shown.map(draw)}</Order.Provider></On.Provider></Sorting.Provider></Axis.Provider>
      </SortableContext>
      {/* Where it will land, the one hint: the line every list draws, in whichever block that is. */}
      {slot && moves && createPortal(<DropLine fixed how={`${slot.block}:${slot.before ?? ''}`} style={{ top: Math.round(slot.y), left: slot.left + 12, width: slot.width - 20 }} />, document.body)}
      <Overlay dropAnimation={still() || refused ? null : SETTLE}>
        {shot && <Lifted shot={shot} words={refused && refuse ? refuse.said : moves ? 'Move here' : null} refused={refused} />}
      </Overlay>
    </DndContext>
  )
}
