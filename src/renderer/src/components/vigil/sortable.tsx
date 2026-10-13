import { createContext, useContext, useEffect, useRef, useState, type ComponentProps, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { DndContext, DragOverlay, useDndMonitor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent, type DragStartEvent, type DropAnimation, type Modifier } from '@dnd-kit/core'
import { SortableContext, arrayMove, horizontalListSortingStrategy, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { motion } from 'motion/react'
import { spring } from '@/lib/motion'
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
export function Overlay(props: ComponentProps<typeof DragOverlay>): React.JSX.Element {
  // The closed hand for as long as something is carried, wherever the pointer is.
  const hand = (on: boolean) => (): void => void (on ? (document.documentElement.dataset.dragging = '') : delete document.documentElement.dataset.dragging)
  useDndMonitor({ onDragStart: hand(true), onDragEnd: hand(false), onDragCancel: hand(false) })
  useEffect(() => hand(false), [])
  return createPortal(<DragOverlay {...props} />, document.body)
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

const still = (): boolean => document.documentElement.dataset.motion === 'off' || matchMedia('(prefers-reduced-motion: reduce)').matches

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
