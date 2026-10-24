import { Fragment, createContext, useContext, useEffect, useId, useRef, useState, type ComponentProps, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { DndContext, DragOverlay, useDndMonitor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent, type DragMoveEvent, type DragStartEvent, type DropAnimation, type Modifier } from '@dnd-kit/core'
import { SortableContext, arrayMove, horizontalListSortingStrategy, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { motion } from 'motion/react'
import { spring, still } from '@/lib/motion'
import { chime } from '@/lib/sound'
import { slotTicker } from '@/lib/proximity'

/**
 * Dragging rows into your own order, the way compose-dnd feels: the row lifts
 * and follows the pointer up and down only, the others slide aside to make
 * room, the list scrolls by itself near its top and bottom edges, and on
 * letting go the row settles into its gap with a little overshoot.
 */

/** Up and down only: a list has no sideways. */
const upDown: Modifier = ({ transform }) => ({ ...transform, x: 0 })
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

/** Whether rows here can be dragged at all: a list not in your own order never drags. */
const On = createContext(false)
/** Which way the rows go: down a list, or along a row of tabs. */
const Axis = createContext<'y' | 'x'>('y')
/**
 * From the lift until just after the drop: a row that glides to its new place
 * (moved from a menu) stays put then, since the drag has already carried it.
 */
const Sorting = createContext(false)

/**
 * The lifted row, as it looked when picked up. A picture of it rather than the
 * row itself, so it stays under the pointer even when the list, which only
 * draws the rows in view, scrolls the real one away.
 */
export const snapshot = (id: string): Shot | null => {
  const node = document.querySelector<HTMLElement>(`[data-sortable-id="${CSS.escape(id)}"]`)
  if (!node) return null
  const box = node.getBoundingClientRect()
  return { id, html: node.innerHTML, width: box.width, height: box.height }
}
type Shot = { id: string; html: string; width: number; height: number }

export function Lifted({ shot }: { shot: Shot | null }): React.JSX.Element | null {
  if (!shot) return null
  // A card that has a border of its own (the week's) keeps just that one: the
  // ring is for rows, which have none, and both together drew a double edge.
  // One surface: the row's own light (pointed at, under the keys, picked) and a
  // group's panel came along in the picture and read as a card inside the card.
  return <div data-lifted="" style={{ width: shot.width }} className="cursor-grabbing rounded-md bg-background shadow-(--mf-shadow-lift) ring-1 ring-foreground/10 has-[>.border]:ring-0 [&_[data-panel]]:hidden [&_[data-row]]:bg-transparent!" dangerouslySetInnerHTML={{ __html: shot.html }} />
}

/**
 * A list whose rows can be dragged into a new order. It holds the new order
 * itself from the moment you let go until the saved one comes back, so the
 * row never jumps back to where it was while the save is on its way.
 */
export function SortableList<T>({ items, keyOf, onMove, axis = 'y', children }: {
  items: T[]
  /** Down a list (the usual), or along a row (tabs). */
  axis?: 'y' | 'x'
  keyOf: (item: T) => string
  /** A row dropped onto another lands before it (going up) or after it (going down). */
  onMove?: (id: string, target: string, after: boolean) => void
  children: (items: T[]) => ReactNode
}): React.JSX.Element {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))
  const [held, setHeld] = useState<string[] | null>(null)
  const [shot, setShot] = useState<Shot | null>(null)
  const [sorting, setSorting] = useState(false)
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
  const onDragStart = ({ active }: DragStartEvent): void => {
    chime('lift')
    clearTimeout(settle.current)
    setSorting(true)
    ticks.start(String(active.id))
    setShot(snapshot(String(active.id)))
  }
  const onDragEnd = ({ active, over }: DragEndEvent): void => {
    setShot(null)
    done()
    if (!over || over.id === active.id) return chime('stay')
    const order = shown.map(keyOf)
    const from = order.indexOf(String(active.id))
    const to = order.indexOf(String(over.id))
    setHeld(arrayMove(order, from, to))
    onMove(String(active.id), String(over.id), to > from)
  }
  return (
    // Its screen-reader lines go to the page's foot, never among the rows (a tree of rows counts its children).
    <DndContext accessibility={{ container: document.body }} sensors={sensors} collisionDetection={closestCenter} modifiers={[axis === 'x' ? sideways : upDown]} onDragStart={onDragStart} onDragOver={({ over }) => ticks(over?.id)} onDragEnd={onDragEnd} onDragCancel={() => (setShot(null), done())}>
      <SortableContext items={shown.map(keyOf)} strategy={axis === 'x' ? horizontalListSortingStrategy : verticalListSortingStrategy}>
        <Axis.Provider value={axis}><Sorting.Provider value={sorting}><On.Provider value>{children(shown)}</On.Provider></Sorting.Provider></Axis.Provider>
      </SortableContext>
      <Overlay dropAnimation={still() ? null : SETTLE}>
        <Lifted shot={shot} />
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
  const row = on ? <Row id={id} className={className}>{children}</Row> : <div className={className}>{children}</div>
  if (!glide) return row
  return <motion.div layout={sorting || still() ? false : 'position'} layoutId={glide} transition={spring.moderate} className={className}>{row}</motion.div>
}

function Row({ id, className, children }: { id: string; className?: string; children: ReactNode }): React.JSX.Element {
  const axis = useContext(Axis)
  const { setNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({
    id,
    transition: still() ? null : { duration: 220, easing: 'cubic-bezier(0.2, 0.9, 0.3, 1)' }
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
      className={className}
      style={{ transform: transform ? (axis === 'x' ? `translate3d(${Math.round(transform.x)}px, 0, 0)` : `translate3d(0, ${Math.round(transform.y)}px, 0)`) : undefined, transition, opacity: isDragging ? 0.3 : undefined }}
    >
      {children}
    </div>
  )
}

/** A row's new place: the block it goes into, and the row it goes before (null: that block's end). */
export type BlockDrop = { block: string; before: string | null }
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
  const [shot, setShot] = useState<Shot | null>(null)
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
  const onDragStart = ({ active }: DragStartEvent): void => {
    chime('lift')
    clearTimeout(settle.current)
    setSorting(true)
    lifted.current = String(active.id)
    ticks.start('stay')
    setShot(snapshot(String(active.id)))
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
    <DndContext accessibility={{ container: document.body }} sensors={sensors} collisionDetection={closestCenter} modifiers={[upDown]} onDragStart={onDragStart} onDragMove={onDragMove} onDragEnd={onDragEnd} onDragCancel={() => (mark(null, false), setShot(null), done())}>
      <SortableContext items={shown.flatMap((one) => one.items.map(keyOf))} strategy={stayPut}>
        <Axis.Provider value="y"><Sorting.Provider value={sorting}><On.Provider value>{shown.map(draw)}</On.Provider></Sorting.Provider></Axis.Provider>
      </SortableContext>
      {/* Where it will land, the one hint: a line, in whichever block that is. */}
      {slot && createPortal(<div data-drop-line={`${slot.block}:${slot.before ?? ''}`} aria-hidden className="pointer-events-none fixed z-[70] h-0.5 rounded-full bg-primary" style={{ top: Math.round(slot.y) - 1, left: slot.left + 4, width: slot.width - 8 }} />, document.body)}
      <Overlay dropAnimation={still() || refused ? null : SETTLE}>
        {shot && (
          <div className="flex flex-col items-start gap-1">
            <div className={refused ? 'opacity-50' : undefined}><Lifted shot={shot} /></div>
            {refused && refuse && <div data-drop-refused className="rounded-md bg-popover px-2 py-1 text-control text-foreground shadow-(--mf-shadow-lift) ring-1 ring-foreground/10">{refuse.said}</div>}
          </div>
        )}
      </Overlay>
    </DndContext>
  )
}
