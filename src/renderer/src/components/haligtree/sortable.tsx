import { Fragment, createContext, useContext, useEffect, useId, useRef, useState, type ComponentProps, type ReactNode } from 'react'
import { dragWords } from '@/lib/drag-words'
import { createPortal } from 'react-dom'
import { DndContext, DragOverlay, useDndMonitor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent, type DragMoveEvent, type DragStartEvent, type DropAnimation, type Modifier } from '@dnd-kit/core'
import { SortableContext, arrayMove, horizontalListSortingStrategy, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { motion } from 'motion/react'
import { EASING, spring, still } from '@/lib/motion'
import { CarriedCard, Hand, swallowRelease, titleOf } from './carry'
import { chime } from '@/lib/sound'
import { slotTicker } from '@/lib/proximity'

/**
 * Dragging rows into your own order, the way compose-dnd feels: the row lifts
 * and follows the pointer up and down only, the others slide aside to make
 * room, the list scrolls by itself near its top and bottom edges, and on
 * letting go the row settles into its gap with a little overshoot.
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

/** A place a row can be dropped on (`data-row-drop`), lit as a calendar's day is while a row is over it. */
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
  const node = document.querySelector<HTMLElement>(`[data-sortable-id="${CSS.escape(id)}"]`)
  if (!node) return null
  const x = event instanceof PointerEvent ? event.clientX : 0
  const icon = [...node.querySelectorAll('svg')].find((one) => !one.closest('[data-grip]'))
  return { title: titleOf(node), icon: icon?.outerHTML, grab: x - node.getBoundingClientRect().left, from: x }
}
type Lift = { title: string; icon?: string; grab: number; from: number }

function Lifted({ shot, axis = 'y' }: { shot: Lift | null; axis?: 'x' | 'y' }): React.JSX.Element | null {
  if (!shot) return null
  return (
    <Hand grab={shot.grab} from={axis === 'x' ? null : shot.from}>
      <CarriedCard attrs={{ 'data-lifted': '' }} title={shot.title} icon={shot.icon ? <span aria-hidden className="shrink-0 [&_svg]:block [&_svg]:size-4" dangerouslySetInnerHTML={{ __html: shot.icon }} /> : undefined} />
    </Hand>
  )
}

/**
 * Places on the page a row can be dropped on, as well as among its rows (a tab,
 * a folded section's heading, a card): any element marked `data-row-drop` with
 * what it is. The one under the pointer is lit and its name said.
 */
export function usePlaces(on: boolean): { place: string | null; aimed: { current: HTMLElement | null }; aimAt: (next: HTMLElement | null) => void; following: (on: boolean) => void } {
  const [place, setPlace] = useState<string | null>(null)
  const aimed = useRef<HTMLElement | null>(null)
  const aimAt = (next: HTMLElement | null): void => {
    if (aimed.current === next) return
    if (aimed.current) delete aimed.current.dataset.dropHot
    if (next) next.dataset.dropHot = ''
    aimed.current = next
    setPlace(next?.dataset.rowDrop ?? null)
    if (next) chime('tick')
  }
  // The place under the pointer itself, wherever it goes: the lifted row goes up and down only, and a drag's own move is the row's.
  const follow = useRef((event: PointerEvent): void => {
    const under = document.elementsFromPoint(event.clientX, event.clientY)
    aimAt(under.map((one) => one.closest<HTMLElement>('[data-row-drop]')).find((one) => !!one) ?? null)
  })
  const following = (going: boolean): void => {
    if (going && on) window.addEventListener('pointermove', follow.current)
    else window.removeEventListener('pointermove', follow.current)
  }
  useEffect(() => () => following(false), []) // eslint-disable-line react-hooks/exhaustive-deps
  return { place, aimed, aimAt, following }
}

/** What letting go on a place does, in the words the refused note uses for where it cannot go. */
export const PlaceSaid = ({ place, said }: { place: string; said: string }): React.JSX.Element => (
  <div data-drop-said={place} className="rounded-md bg-popover px-2 py-1 text-control text-foreground shadow-(--mf-shadow-lift) ring-1 ring-foreground/10">{said}</div>
)

/**
 * A list whose rows can be dragged into a new order. It holds the new order
 * itself from the moment you let go until the saved one comes back, so the
 * row never jumps back to where it was while the save is on its way.
 */
export function SortableList<T>({ items, keyOf, onMove, axis = 'y', places, children }: {
  items: T[]
  /** Down a list (the usual), or along a row (tabs). */
  axis?: 'y' | 'x'
  keyOf: (item: T) => string
  /** A row dropped onto another lands before it (going up) or after it (going down). */
  onMove?: (id: string, target: string, after: boolean) => void
  /**
   * Places on the page a row can be dropped on, as well as among its rows (a
   * tab, a folded section's heading, a card): any element marked
   * `data-row-drop` with what it is. Lit while the row is over one, what
   * dropping does said under the lifted row, and `foot` drawn under the rows
   * only while one is carried, for places the page has nowhere else.
   */
  places?: { drop: (id: string, place: string) => void; said: (place: string) => string; foot?: ReactNode }
  children: (items: T[]) => ReactNode
}): React.JSX.Element {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))
  const [held, setHeld] = useState<string[] | null>(null)
  const [shot, setShot] = useState<Lift | null>(null)
  const [sorting, setSorting] = useState(false)
  // The place the row is over, if any: its element lit, its name said.
  const { place: aim, aimed, aimAt, following } = usePlaces(!!places)
  const settle = useRef<ReturnType<typeof setTimeout>>(undefined)
  const done = (): void => (clearTimeout(settle.current), void (settle.current = setTimeout(() => setSorting(false), 320)))
  // A soft tick as the lifted row comes over each new place in the list.
  const ticks = useRef(slotTicker()).current
  const ids = items.map(keyOf)
  const incoming = ids.join('\n')
  // The saved order (or anything else) has arrived: it is the truth again.
  useEffect(() => setHeld(null), [incoming])
  if (!onMove) return <>{children(items)}</>
  const byId = new Map(items.map((item) => [keyOf(item), item]))
  const shown = held ? held.map((id) => byId.get(id)).filter((one): one is T => !!one) : items
  const onDragStart = ({ active, activatorEvent }: DragStartEvent): void => {
    chime('lift')
    clearTimeout(settle.current)
    setSorting(true)
    ticks.start(String(active.id))
    setShot(carriedOf(String(active.id), activatorEvent))
    following(true)
  }
  const onDragEnd = ({ active, over }: DragEndEvent): void => {
    setShot(null)
    done()
    following(false)
    const place = aimed.current?.dataset.rowDrop
    aimAt(null)
    if (place && places) return places.drop(String(active.id), place)
    if (!over || over.id === active.id) return chime('stay')
    const order = shown.map(keyOf)
    const from = order.indexOf(String(active.id))
    const to = order.indexOf(String(over.id))
    setHeld(arrayMove(order, from, to))
    onMove(String(active.id), String(over.id), to > from)
  }
  return (
    // Its screen-reader lines go to the page's foot, never among the rows (a tree of rows counts its children).
    <DndContext accessibility={dragWords} sensors={sensors}
      // Over a place, the rows stay where they are: it goes there, not among them.
      collisionDetection={(args) => (aimed.current ? [] : closestCenter(args))}
      modifiers={[axis === 'x' ? sideways : upDown]} onDragStart={onDragStart} onDragOver={({ over }) => ticks(over?.id)} onDragEnd={onDragEnd} onDragCancel={() => (setShot(null), following(false), aimAt(null), done())}>
      <SortableContext items={shown.map(keyOf)} strategy={axis === 'x' ? horizontalListSortingStrategy : verticalListSortingStrategy}>
        <Axis.Provider value={axis}><Sorting.Provider value={sorting}><On.Provider value><Order.Provider value={shown.map(keyOf).join('\n')}>{children(shown)}</Order.Provider></On.Provider></Sorting.Provider></Axis.Provider>
      </SortableContext>
      {/* Laid over what is under the list, never in its flow: a drag starting moves nothing else on the page. */}
      {shot && places?.foot && <div data-drop-foot-over className="relative z-10 h-0"><div className="absolute inset-x-0 top-0 bg-background pb-2">{places.foot}</div></div>}
      <Overlay dropAnimation={still() || aim ? null : SETTLE}>
        {shot && (
          <div className="flex h-full flex-col items-start gap-1">
            {/* Over a place, the row's card steps aside so the lit place under it shows, and what letting go does is said. */}
            <div className={`h-full w-full ${aim ? 'opacity-0' : ''}`}><Lifted shot={shot} axis={axis} /></div>
            {aim && places && <PlaceSaid place={aim} said={places.said(aim)} />}
          </div>
        )}
      </Overlay>
    </DndContext>
  )
}

/**
 * One row of a SortableList: its gap stays faintly where it was picked up from.
 * With `glide` (a name unique on the page), a row moved some other way (a
 * menu's Move up, or shown and hidden between two lists) slides to its new
 * place on a spring rather than jumping there.
 */
export function SortableRow({ id, glide, className, children }: { id: string; glide?: string; className?: string; children: ReactNode }): React.JSX.Element {
  const on = useContext(On)
  const sorting = useContext(Sorting)
  // Folding a group of rows above it (the sidebar's folders) moves it at once, in the same frame: only a change of order glides.
  const order = useContext(Order)
  const row = on ? <Row id={id} className={className}>{children}</Row> : <div className={className}>{children}</div>
  if (!glide) return row
  return <motion.div layout={sorting || still() ? false : 'position'} layoutDependency={order} layoutId={glide} transition={spring.moderate} className={className}>{row}</motion.div>
}

function Row({ id, className, children }: { id: string; className?: string; children: ReactNode }): React.JSX.Element {
  const axis = useContext(Axis)
  const { setNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({
    id,
    transition: still() ? null : { duration: 220, easing: EASING }
  })
  return (
    <div
      ref={setNodeRef}
      data-sortable-id={id}
      {...attributes}
      {...listeners}
      // The row's own button keeps the focus and the keys; this is only the grip.
      tabIndex={-1}
      role={undefined}
      className={`${className ?? ''} ${isDragging ? 'mf-carried-place' : ''}`}
      style={{ transform: transform ? (axis === 'x' ? `translate3d(${Math.round(transform.x)}px, 0, 0)` : `translate3d(0, ${Math.round(transform.y)}px, 0)`) : undefined, transition }}
    >
      {children}
    </div>
  )
}

/** A row's new place: the block it goes into, and the row it goes before (null: that block's end). */
type BlockDrop = { block: string; before: string | null }
type Slot = BlockDrop & { y: number; left: number; width: number }
/** No row slides aside here: a line shows where the carried one will land. */
const stayPut = (): null => null

/**
 * Rows in blocks with gaps between, dragged as one list: a row carried
 * anywhere goes there, into whichever block the line is in. The line sits
 * where it will land, at a block's end or the next one's start, so the two
 * places either side of a gap are told apart. Over a part that is not these
 * rows (`refuse`: where, and what to say), there is no line, the pointer and
 * the lifted row say it cannot go there, and letting go puts it back. Holds
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
  return (
    <DndContext accessibility={dragWords} sensors={sensors} collisionDetection={closestCenter} modifiers={[upDown]} onDragStart={onDragStart} onDragMove={onDragMove} onDragEnd={onDragEnd} onDragCancel={() => (mark(null, false), setShot(null), done())}>
      <SortableContext items={shown.flatMap((one) => one.items.map(keyOf))} strategy={stayPut}>
        <Axis.Provider value="y"><Sorting.Provider value={sorting}><On.Provider value><Order.Provider value={shown.map((one) => one.key + ':' + one.items.map(keyOf).join(',')).join('\n')}>{shown.map(draw)}</Order.Provider></On.Provider></Sorting.Provider></Axis.Provider>
      </SortableContext>
      {/* Where it will land, the one hint: a line, in whichever block that is. */}
      {slot && createPortal(<div data-drop-line={`${slot.block}:${slot.before ?? ''}`} aria-hidden className="pointer-events-none fixed z-[70] h-0.5 rounded-full bg-primary" style={{ top: Math.round(slot.y) - 1, left: slot.left + 4, width: slot.width - 8 }} />, document.body)}
      <Overlay dropAnimation={still() || refused ? null : SETTLE}>
        {shot && (
          <div className="flex h-full flex-col items-start gap-1">
            <div className={`h-full w-full ${refused ? 'opacity-50' : ''}`}><Lifted shot={shot} /></div>
            {refused && refuse && <div data-drop-refused className="rounded-md bg-popover px-2 py-1 text-control text-foreground shadow-(--mf-shadow-lift) ring-1 ring-foreground/10">{refuse.said}</div>}
          </div>
        )}
      </Overlay>
    </DndContext>
  )
}
