import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { DndContext, DragOverlay, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent, type DragStartEvent, type DropAnimation, type Modifier } from '@dnd-kit/core'
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { chime } from '@/lib/sound'

/**
 * Dragging rows into your own order, the way compose-dnd feels: the row lifts
 * and follows the pointer up and down only, the others slide aside to make
 * room, the list scrolls by itself near its top and bottom edges, and on
 * letting go the row settles into its gap with a little overshoot.
 */

/** Up and down only: a list has no sideways. */
const upDown: Modifier = ({ transform }) => ({ ...transform, x: 0 })

/** Settles with a small overshoot, a spring's shape in one curve. */
export const SETTLE: DropAnimation = { duration: 280, easing: 'cubic-bezier(0.2, 1.25, 0.4, 1)' }

const still = (): boolean => document.documentElement.dataset.motion === 'off' || matchMedia('(prefers-reduced-motion: reduce)').matches

/** Whether rows here can be dragged at all: a list not in your own order never drags. */
const On = createContext(false)

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
  return <div style={{ width: shot.width }} className="cursor-grabbing rounded-md bg-background shadow-[0_8px_24px_-6px_rgb(0_0_0/0.35)] ring-1 ring-foreground/10 has-[>.border]:ring-0" dangerouslySetInnerHTML={{ __html: shot.html }} />
}

/**
 * A list whose rows can be dragged into a new order. It holds the new order
 * itself from the moment you let go until the saved one comes back, so the
 * row never jumps back to where it was while the save is on its way.
 */
export function SortableList<T>({ items, keyOf, onMove, children }: {
  items: T[]
  keyOf: (item: T) => string
  /** A row dropped onto another lands before it (going up) or after it (going down). */
  onMove?: (id: string, target: string, after: boolean) => void
  children: (items: T[]) => ReactNode
}): React.JSX.Element {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))
  const [held, setHeld] = useState<string[] | null>(null)
  const [shot, setShot] = useState<Shot | null>(null)
  const ids = items.map(keyOf)
  const incoming = ids.join('\n')
  // The saved order (or anything else) has arrived: it is the truth again.
  useEffect(() => setHeld(null), [incoming])
  if (!onMove) return <>{children(items)}</>
  const byId = new Map(items.map((item) => [keyOf(item), item]))
  const shown = held ? held.map((id) => byId.get(id)).filter((one): one is T => !!one) : items
  const onDragStart = ({ active }: DragStartEvent): void => {
    chime('tap')
    setShot(snapshot(String(active.id)))
  }
  const onDragEnd = ({ active, over }: DragEndEvent): void => {
    setShot(null)
    if (!over || over.id === active.id) return chime('fold')
    const order = shown.map(keyOf)
    const from = order.indexOf(String(active.id))
    const to = order.indexOf(String(over.id))
    setHeld(arrayMove(order, from, to))
    onMove(String(active.id), String(over.id), to > from)
  }
  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} modifiers={[upDown]} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setShot(null)}>
      <SortableContext items={shown.map(keyOf)} strategy={verticalListSortingStrategy}>
        <On.Provider value>{children(shown)}</On.Provider>
      </SortableContext>
      <DragOverlay dropAnimation={still() ? null : SETTLE}>
        <Lifted shot={shot} />
      </DragOverlay>
    </DndContext>
  )
}

/** One row of a SortableList: its gap stays faintly where it was picked up from. */
export function SortableRow({ id, children }: { id: string; children: ReactNode }): React.JSX.Element {
  if (!useContext(On)) return <div>{children}</div>
  return <Row id={id}>{children}</Row>
}

function Row({ id, children }: { id: string; children: ReactNode }): React.JSX.Element {
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
      style={{ transform: transform ? `translate3d(0, ${Math.round(transform.y)}px, 0)` : undefined, transition, opacity: isDragging ? 0.3 : undefined }}
    >
      {children}
    </div>
  )
}
