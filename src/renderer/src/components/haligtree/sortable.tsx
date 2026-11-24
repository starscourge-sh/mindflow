import { Fragment, createContext, useContext, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type ComponentProps, type ReactNode } from 'react'
import { dragWords } from '@/lib/drag-words'
import { createPortal, flushSync } from 'react-dom'
import { DndContext, DragOverlay, useDndMonitor, closestCenter, useSensor, useSensors, type CollisionDetection, type DragEndEvent, type DragStartEvent, type DropAnimation, type Modifier } from '@dnd-kit/core'
import { RowSensor } from '@/lib/own-press'
import { SortableContext, arrayMove, horizontalListSortingStrategy, useSortable, type SortingStrategy } from '@dnd-kit/sortable'
import { motion } from 'motion/react'
import { EASING, spring, still } from '@/lib/motion'
import { CarriedCard, CarryRow, HELD, Hand, OwnRoom, RoomAt, Shaped, clearWay, makeWay, pointerAt, restBox, rowAt, swallowRelease, titleOf, useAim, useRest, useTargets, headRow, offWindow, type Parts, type Places, type Spot } from './carry'
import { chime } from '@/lib/sound'
import { slotTicker } from '@/lib/proximity'
import { refuse } from './ui'
import '@/lib/carry-cursor'

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

/** What a lifted row's card says, read as it is picked up: the row itself may scroll away under the pointer. */
const carriedOf = (id: string, event: Event): Lift | null => {
  const row = `[data-sortable-id="${CSS.escape(id)}"]`
  // The row the press was on: two lists on the page can hold the same thing (two panes).
  const node = (event.target instanceof Element ? event.target.closest<HTMLElement>(row) : null) ?? document.querySelector<HTMLElement>(row)
  if (!node) return null
  const box = node.getBoundingClientRect()
  const [x, y] = event instanceof PointerEvent ? [event.clientX, event.clientY] : [box.left, box.top]
  // A task's card is its words alone (a subtask's too): its first picture is the tick's check, which would read as done.
  const icon = node.querySelector('[data-task-row], [data-subtask-row]') ? undefined : [...node.querySelectorAll('svg')].find((one) => !one.closest('[data-grip]'))
  // Its list's own part of the page: the nearest thing round it that holds another row.
  let within = node.parentElement
  while (within && within !== document.body && within.querySelectorAll('[data-sortable-id]').length < 2) within = within.parentElement
  // In the hand a row is its one line (carry.tsx marks it, main.css folds what hangs under it): how tall that is, read
  // here at the press, while nothing else on the page has changed, so the lift itself is drawn once and reads nothing.
  let folded = box.height
  if (node.querySelector('.mf-held-folds')) {
    node.setAttribute('data-held', '')
    folded = node.getBoundingClientRect().height
    node.removeAttribute('data-held')
  }
  return { id, title: titleOf(node), icon: icon?.outerHTML, grab: x - box.left, from: x, top: y - box.top, tall: box.height, folded, within }
}
type Lift = { id: string; title: string; icon?: string; grab: number; from: number; /** How far down the row it was taken, how tall the row was then, and how tall it is folded in the hand. */ top: number; tall: number; folded: number; within: HTMLElement | null }

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
  /** What the card says over a row it would go inside, given that row's name: a step (the usual), or a folder's "Move into". */
  nestSays?: (title: string) => string
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
  places?: Places
  /**
   * Rows standing in parts under a heading each (Overdue, Today), where a rule
   * of the part's own says what is in it. Carried over another part's rows,
   * nothing opens: that part's heading (`data-row-part`) lights and the card
   * says what letting go does (`words`), or why it cannot go there (`refused`).
   */
  parts?: Parts
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
/** A held order let go of when anything is undone (ui.tsx `undone`): what the book says is drawn again. */
export function useLetGoOnUndo(letGo: () => void): void {
  const latest = useRef(letGo)
  latest.current = letGo
  useEffect(() => {
    const on = (): void => latest.current()
    window.addEventListener('haligtree:undone', on)
    return () => window.removeEventListener('haligtree:undone', on)
  }, [])
}

function useHeld<T>(items: T[], keyOf: (item: T) => string): { shown: T[]; keys: string[]; setHeld: (ids: string[]) => void; sorting: boolean; lifting: () => void; landed: () => void } {
  const [held, setHeld] = useState<string[] | null>(null)
  const [sorting, setSorting] = useState(false)
  const settle = useRef<ReturnType<typeof setTimeout>>(undefined)
  const incoming = items.map(keyOf).join('\n')
  // The saved order (or anything else) has arrived: it is the truth again.
  useEffect(() => setHeld(null), [incoming])
  useLetGoOnUndo(() => setHeld(null))
  // The same list from one draw to the next unless the rows or their held order change: what is drawn from it is kept (Rows).
  const shown = useMemo(() => {
    if (!held) return items
    const byId = new Map(items.map((item) => [keyOf(item), item]))
    return held.map((id) => byId.get(id)).filter((one): one is T => !!one)
  }, [held, items]) // eslint-disable-line react-hooks/exhaustive-deps
  const keys = useMemo(() => shown.map(keyOf), [shown]) // eslint-disable-line react-hooks/exhaustive-deps
  return {
    shown, keys, setHeld, sorting,
    lifting: () => (clearTimeout(settle.current), setSorting(true)),
    // A row gliding to a new place from a menu stays put until the drop has settled (Sorting).
    landed: () => (clearTimeout(settle.current), void (settle.current = setTimeout(() => setSorting(false), 320)))
  }
}

function Rows<T>({ items, keyOf, onMove, onNest, nests, nestSays, places, parts, children }: ListProps<T>): React.JSX.Element {
  const sensors = useSensors(useSensor(RowSensor, { activationConstraint: { distance: 5 } }))
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
  const read = useRef((): void => undefined)
  const { rested, undwell } = useRest(() => read.current())
  // A place on the page, or another part's heading, lit while the carried row would go there (carry.tsx, one for every list).
  const targets = useTargets(places, parts, !!shot, () => read.current())
  // The rows' names, once a draw: asked on every move of the pointer.
  const known = useMemo(() => new Set(keys), [keys])
  // The rows as the page draws them, drawn again only when the page or their order changes. Each new place while carrying
  // draws this list again; drawing every row's own contents with it (a task's menu, marks and steps) cost frames in a long
  // list. Each row's slide still reaches it, through carry.tsx's own context.
  const drawn = useMemo(() => children(shown), [children, shown])
  // The parts' headings as the list lay when the row was taken, and that row's own top: carried into another part, the
  // headings between slide with the rows, so room opens where it lands as it does among rows, and no row slides over a
  // heading (the user, 23 and 24 Nov: one look for every drag).
  const heads = useRef<{ el: HTMLElement; top: number }[]>([])
  const fromTop = useRef(0)
  const slideHeads = (to: number | null, height: number): void => {
    for (const one of heads.current) {
      const between = to !== null && (to > fromTop.current ? one.top > fromTop.current && one.top < to : one.top > to && one.top < fromTop.current)
      one.el.style.transition = 'transform 200ms cubic-bezier(0.2, 0, 0, 1)'
      one.el.style.transform = between ? `translateY(${to! > fromTop.current ? -height : height}px)` : ''
    }
  }
  const restHeads = (): void => { for (const one of heads.current) (one.el.style.transform = '', one.el.style.transition = ''); heads.current = [] }
  if (!onMove && !onNest) return <>{drawn}</>
  read.current = (): void => {
    const lift = carrying.current
    if (!lift) return
    const id = lift.id
    const { y } = pointerAt()
    // Out of the window, nothing is aimed at, and letting go puts it back.
    if (offWindow()) return (undwell(), targets.dim(), point(null))
    // A place on the page: it lights, and the card says what letting go there does.
    const spot = targets.place(id)
    if (spot) return (undwell(), point(spot))
    // The row whose place the pointer is over, as the list lies before anything slid aside (level with a part's heading, that part's first row).
    const over = headRow(parts, () => keys, y, lift.within) ?? rowAt(known, y, lift.within)
    if (!over || over.id === id) return (undwell(), targets.dim(), point(null, true))
    const target = over.id
    const at = (y - over.top) / over.height
    // Rested on a row's middle: its step, or the reason it cannot be. Until it has rested there, it only moves beside it.
    const may = onNest && at > 0.28 && at < 0.72 ? (nests ? nests(id, target) : true) : false
    if (!may) undwell()
    else if (rested(target)) {
      targets.dim()
      return point(may === true
        ? { target, how: 'join', into: target, label: nestSays ? nestSays(titleOf(over.node)) : `Make it a step of “${titleOf(over.node)}”`, gap: null, around: [], act: 'step' }
        : { target, how: 'join', into: null, label: may.refused, gap: null, around: [], refused: true })
    }
    if (!onMove) return (targets.dim(), point(null, true))
    // Among the rows, the one under the pointer makes way: up if the carried row came from above it, down if from below.
    const [from, to] = [keys.indexOf(id), keys.indexOf(target)]
    const gap = from < to ? to : to - 1
    const next = keys[gap + 1]
    // Another part of the list, whose own rule says what is in it: taken in, room opens where it lands, as among rows,
    // with the headings between sliding along with the rows; the card says what letting go does there ("Move to Today").
    // Refused, nothing opens and the card says why.
    const part = targets.part(id, target, lift.within)
    if (part && part.refused) return (slideHeads(null, 0), point(part))
    if (part) {
      targets.dim()
      slideHeads(over.top + (from < to ? over.height : 0), lift.folded || lift.tall)
      return point({ ...part, part: part.target, target, how: from < to ? 'after' : 'before', into: null, gap, around: [] })
    }
    slideHeads(null, 0)
    targets.dim()
    // Last of its part (a heading comes next), the room sits close under the row before it.
    point({ target, how: from < to ? 'after' : 'before', into: null, label: 'Move here', gap, around: [], snug: next === undefined || (!!parts && parts.of(next) !== parts.of(id)) })
  }
  const end = (): void => {
    restHeads()
    carrying.current = null
    setShot(null)
    undwell()
    targets.dim()
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
    const within = lift?.within ?? null
    heads.current = within ? [...within.querySelectorAll<HTMLElement>('[data-row-part]')].map((el) => ({ el, top: el.getBoundingClientRect().top })) : []
    fromTop.current = (within?.querySelector<HTMLElement>(`[data-sortable-id="${CSS.escape(String(active.id))}"]`) ?? null)?.getBoundingClientRect().top ?? 0
    setShot(lift)
    setSpan(lift?.folded ?? 0)
  }
  // Drawn in the frame it is let go in (flushSync, at the DndContext): dnd-kit hands the drop over from the pointer's own
  // listener, outside React's events, so React drew it as work spread over frames, and Tasks, slow to draw on a busy
  // Mac, showed the old order for a frame or more after the drop (57 ms at load 12; one-drag part 5 on the stack).
  const onDragEnd = ({ active }: DragEndEvent): void => {
    const now = aimed.current
    const id = String(active.id)
    end()
    setQuiet(!now || now.gap === null)
    if (!now) return chime('stay')
    const done = targets.drop(id, now)
    if (done) return void (done.said !== undefined && refuse(done.said))
    setSnap(true)
    if (now.act === 'step') return (setHeld(keys.filter((one) => one !== id)), onNest?.(id, now.target))
    const [from, to] = [keys.indexOf(id), keys.indexOf(now.target)]
    setHeld(arrayMove(keys, from, to))
    onMove?.(id, now.target, to > from)
  }
  // A row taller in the list than in the hand (a task with its steps open): the card rides where it was taken.
  const folded = shot ? shot.tall - span : 0
  // A list that only reorders carries the row itself, under the pointer where it was taken (taken on its folded steps,
  // by its middle): the others part for it, and nothing fills a place, as a book slides along its shelf (ShelfList).
  // A list that also takes a row in (a step, a place, another part) carries the card, which says what letting go does.
  const itself = !onNest && !places && !parts
  const grab = itself && shot ? (shot.top < span ? shot.top : span / 2) : null
  return (
    // Its screen-reader lines go to the page's foot, never among the rows (a tree of rows counts its children).
    // Where each row slides is worked out once, for them all (Shaped): dnd-kit moves none itself, and reads no row as under the card.
    <DndContext accessibility={dragWords} sensors={sensors} collisionDetection={nothing} modifiers={[upDown]} onDragStart={onDragStart} onDragMove={() => read.current()} onDragEnd={(event) => flushSync(() => onDragEnd(event))} onDragCancel={() => (end(), chime('stay'))}>
      <SortableContext items={keys} strategy={stayPut}>
        <Axis.Provider value="y"><Sorting.Provider value={sorting}><On.Provider value><Order.Provider value={keys.join('\n')}>
          <Shaped aim={aim} keys={keys} hand={shot?.id ?? null} many={shot ? [shot.id] : []} span={span} inset={0} row={span} snap={snap} blocks={[]} footRoom={false} within={shot?.within} grab={grab}>
            {drawn}
            {/* Folded in the hand, the list keeps the height it had: one scrolled to its end does not jump. */}
            {folded > 0.5 && <div aria-hidden data-kept-height="" style={{ height: folded }} />}
          </Shaped>
        </Order.Provider></On.Provider></Sorting.Provider></Axis.Provider>
      </SortableContext>
      {/* Carried as itself, nothing is drawn in the hand: the overlay is kept for the closed hand and Esc alone. */}
      <Overlay dropAnimation={still() || quiet || itself ? null : SETTLE}>
        {shot && !itself && <Lifted shot={shot} words={aim?.label ?? null} refused={!!aim?.refused} at={folded > 0.5 ? shot.top : undefined} />}
      </Overlay>
    </DndContext>
  )
}

/** A row of tabs, carried side to side: they slide along to make room, the carried one's place kept quiet where it will land. */
/** The nearest tab to the one carried; none out of the window, so a tab let go there goes back (quick capture's small window). */
const inWindow: CollisionDetection = (args) => (offWindow() ? [] : closestCenter(args))

function TabRow<T>({ items, keyOf, onMove, children }: ListProps<T>): React.JSX.Element {
  const sensors = useSensors(useSensor(RowSensor, { activationConstraint: { distance: 5 } }))
  const { shown, keys, setHeld, sorting, lifting, landed } = useHeld(items, keyOf)
  const [shot, setShot] = useState<Lift | null>(null)
  // Over another tab's place: letting go moves it there, and the card says so.
  const [onto, setOnto] = useState(false)
  // A soft tick as the lifted tab comes over each new place in the row.
  const ticks = useRef(slotTicker()).current
  if (!onMove) return <>{children(items)}</>
  const onDragEnd = ({ active, over }: DragEndEvent): void => {
    setShot(null)
    setOnto(false)
    landed()
    if (!over || over.id === active.id) return chime('stay')
    const [from, to] = [keys.indexOf(String(active.id)), keys.indexOf(String(over.id))]
    setHeld(arrayMove(keys, from, to))
    onMove(String(active.id), String(over.id), to > from)
  }
  return (
    <DndContext accessibility={dragWords} sensors={sensors} collisionDetection={inWindow} modifiers={[sideways]}
      onDragStart={({ active, activatorEvent }) => (chime('lift'), lifting(), ticks.start(String(active.id)), setShot(carriedOf(String(active.id), activatorEvent)))}
      onDragOver={({ active, over }) => (ticks(over?.id), setOnto(!!over && over.id !== active.id))} onDragEnd={onDragEnd} onDragCancel={() => (setShot(null), setOnto(false), landed(), chime('stay'))}>
      <SortableContext items={keys} strategy={horizontalListSortingStrategy}>
        <Axis.Provider value="x"><Sorting.Provider value={sorting}><On.Provider value><Order.Provider value={keys.join('\n')}>{children(shown)}</Order.Provider></On.Provider></Sorting.Provider></Axis.Provider>
      </SortableContext>
      <Overlay dropAnimation={still() ? null : SETTLE}>{shot && <Lifted shot={shot} axis="x" words={onto ? 'Move here' : null} />}</Overlay>
    </DndContext>
  )
}

/**
 * One row of a SortableList. With `glide` (a name unique on the page), a row
 * moved some other way (a menu's Move up, or shown and hidden between two
 * lists) slides to its new place on a spring rather than jumping there.
 */
export function SortableRow({ id, glide, grip = false, className, children }: { id: string; glide?: string; /** The quiet grip in the margin, for rows whose own words take a press (a subtask's). */ grip?: boolean; className?: string; children: ReactNode }): React.JSX.Element {
  const on = useContext(On)
  const axis = useContext(Axis)
  const sorting = useContext(Sorting)
  // Folding a group of rows above it (the sidebar's folders) moves it at once, in the same frame: only a change of order glides.
  const order = useContext(Order)
  // Down a list, the row every list carries (carry.tsx); its grip only where asked.
  const row = !on ? <div className={className}>{children}</div> : axis === 'x' ? <Tab id={id} className={className}>{children}</Tab> : <CarryRow id={id} grip={grip}>{children}</CarryRow>
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
      className={`${className ?? ''} ${isDragging ? HELD : ''} rounded-md`}
      style={{ transform: transform ? `translate3d(${Math.round(transform.x)}px, 0, 0)` : undefined, transition }}
    >
      {/* Its own place slides along to where it will land: the quiet band every list draws there (carry.tsx). */}
      {isDragging && <OwnRoom />}
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
  const sensors = useSensors(useSensor(RowSensor, { activationConstraint: { distance: 5 } }))
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
  // Where the room is, while the rows make way for it; let go with a move, until the new order is drawn; the row's own place, closed over.
  const [room, setRoom] = useState<Spot | null>(null)
  const landing = useRef(false)
  const hid = useRef<HTMLElement | null>(null)
  const incoming = blocks.map((one) => `${one.key}:${one.items.map(keyOf).join(',')}`).join('\n')
  useEffect(() => setHeld(null), [incoming])
  useLetGoOnUndo(() => setHeld(null))
  const byId = new Map(blocks.flatMap((one) => one.items.map((item): [string, T] => [keyOf(item), item])))
  const shown = held ? held.map((one) => ({ key: one.key, items: one.ids.map((id) => byId.get(id)).filter((item): item is T => !!item) })) : blocks
  // The new order drawn after a drop: everything at once where it now stands, nothing sliding back first.
  const order = shown.map((one) => one.key + ':' + one.items.map(keyOf).join(',')).join('\n')
  useLayoutEffect(() => {
    if (!landing.current) return
    landing.current = false
    clearWay(true)
    if (hid.current) hid.current.style.visibility = ''
  }, [order])
  // Each row in a box of its own that makes way for the room while a row is carried (carry.tsx, makeWay).
  const draw = (one: { key: string; items: T[] }, at: number): ReactNode => {
    const ids = one.items.map(keyOf)
    return <Fragment key={one.key}>{around(one.key, at, <div data-drop-list={list} data-drop-block={one.key} className="flex flex-col gap-px">{one.items.map((item) => <div key={keyOf(item)} data-carry-way={keyOf(item)}>{row(item, ids)}</div>)}</div>, one.items)}</Fragment>
  }
  if (!onMove) return <>{shown.map(draw)}</>
  const rowOf = (id: string): HTMLElement | null => document.querySelector<HTMLElement>(`[data-drop-list="${CSS.escape(list)}"] [data-carry-way="${CSS.escape(id)}"]`)
  // Where the pointer is: over a part that refuses, or the nearest place between rows, all read where they rest (their slides left out).
  const where = (y: number): Slot | 'refused' | null => {
    for (const part of refuse ? document.querySelectorAll<HTMLElement>(refuse.selector) : []) {
      const box = restBox(part)
      if (box.height > 0 && y >= box.top && y <= box.top + box.height) return 'refused'
    }
    let best: Slot | null = null
    for (const block of document.querySelectorAll<HTMLElement>(`[data-drop-list="${CSS.escape(list)}"]`)) {
      const rows = [...block.querySelectorAll<HTMLElement>('[data-carry-way]')].map((one) => ({ id: one.dataset.carryWay ?? null, ...restBox(one) }))
      const box = block.getBoundingClientRect()
      // A block emptied by a drag still takes one back, where it sits.
      const marks = !rows.length ? [{ y: box.top, before: null }] : [...rows.map((one) => ({ y: one.top, before: one.id })), { y: rows[rows.length - 1].top + rows[rows.length - 1].height, before: null }]
      for (const mark of marks)
        if (!best || Math.abs(mark.y - y) < Math.abs(best.y - y)) best = { block: block.dataset.dropBlock ?? '', before: mark.before, y: mark.y, left: box.left, width: box.width }
    }
    return best
  }
  /** Every piece round the rows of every block, in the part of the page that holds them all: what makes way for the room. */
  const pieces = (): HTMLElement[] => {
    const all = [...document.querySelectorAll<HTMLElement>(`[data-drop-list="${CSS.escape(list)}"]`)]
    let holder = all[0]?.parentElement ?? null
    while (holder && !all.every((one) => holder!.contains(one))) holder = holder.parentElement
    const of = (node: Element): HTMLElement[] => [...node.children].flatMap((child) => {
      if (!(child instanceof HTMLElement) || !child.offsetHeight || /^(fixed|absolute)$/.test(getComputedStyle(child).position)) return []
      if (child.hasAttribute('data-carry-way')) return [child]
      return child.querySelector('[data-carry-way]') ? of(child) : [child]
    })
    return holder ? of(holder) : []
  }
  /** The rows make way where it would land and the room opens there; over its own place, or refused, everything stays home. */
  const way = (next: Slot | null): void => {
    const id = lifted.current
    const me = id ? rowOf(id) : null
    if (!me || !id || landing.current) return setRoom(null)
    const home = !next || stays(id, next)
    const all = pieces()
    const laid = all.map((el) => ({ el, top: restBox(el).top })).sort((a, b) => a.top - b.top)
    const at = (el: HTMLElement | null): number => laid.findIndex((one) => one.el === el)
    const block = next ? [...document.querySelectorAll<HTMLElement>(`[data-drop-list="${CSS.escape(list)}"][data-drop-block="${CSS.escape(next.block)}"] [data-carry-way]`)] : []
    const gap = home || !next ? null : next.before !== null ? at(rowOf(next.before)) - 1 : block.length ? at(block[block.length - 1]) : null
    const spot = makeWay(all, me, gap, me.offsetHeight)
    // Its own place is the list row's own quiet band (carry.tsx's CarryRow): away from it, that place is closed over.
    me.style.visibility = spot && !spot.own ? 'hidden' : ''
    hid.current = me
    setRoom(spot && !spot.own ? spot : null)
  }
  const mark = (next: Slot | null, no: boolean): void => {
    now.current = { slot: next, refused: no }
    setSlot(next)
    setRefused(no)
    way(no ? null : next)
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
  // The pointer as it is on the page: the drag's delta takes in the list's scroll too (kept-groups.tsx says how it hurt).
  const onDragMove = (): void => {
    // Out of the window it is over no place: let go there, it goes back.
    const found = offWindow() ? null : where(pointerAt().y)
    mark(found === 'refused' ? null : found, found === 'refused')
  }
  const onDragEnd = ({ active }: DragEndEvent): void => {
    const { slot: drop, refused: no } = now.current
    const id = String(active.id)
    // A move: the rows hold where they made way until the new order is drawn (above), so nothing slides back first.
    landing.current = !no && !!drop && !stays(id, drop) && shown.some((one) => one.key === drop.block)
    mark(null, false)
    // Not a move: everything goes home now, and the pieces are pieces no more.
    if (!landing.current) clearWay(false)
    setShot(null)
    done()
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
    <DndContext accessibility={dragWords} sensors={sensors} collisionDetection={closestCenter} modifiers={[upDown]} onDragStart={onDragStart} onDragMove={onDragMove} onDragEnd={onDragEnd} onDragCancel={() => (mark(null, false), clearWay(false), setShot(null), done())}>
      <SortableContext items={shown.flatMap((one) => one.items.map(keyOf))} strategy={stayPut}>
        <Axis.Provider value="y"><Sorting.Provider value={sorting}><On.Provider value><Order.Provider value={shown.map((one) => one.key + ':' + one.items.map(keyOf).join(',')).join('\n')}>{shown.map(draw)}</Order.Provider></On.Provider></Sorting.Provider></Axis.Provider>
      </SortableContext>
      {/* Where it will land: the rows make way and the room opens there, the line every list draws through it, in whichever block that is. */}
      {slot && moves && room && <RoomAt at={room} how={`${slot.block}:${slot.before ?? ''}`} />}
      <Overlay dropAnimation={still() || refused ? null : SETTLE}>
        {shot && <Lifted shot={shot} words={refused && refuse ? refuse.said : moves ? 'Move here' : null} refused={refused} />}
      </Overlay>
    </DndContext>
  )
}

/**
 * A row whose things are carried as themselves, never as a card (a book slid along its shelf, books.tsx): no picture
 * follows the pointer and no quiet room is drawn. The one held moves itself under the pointer (`useCarried` says it is
 * the one), and the others part to open its place. Its own list and rows, so no other list is touched by any of it.
 */
export function ShelfList<T>({ items, keyOf, onMove, room, children }: { items: T[]; keyOf: (item: T) => string; onMove?: (id: string, target: string) => void; /** The gap the others open for the one carried, its own room in the hand and the gap beside it (a spine's, however wide it was when taken). */ room: number; children: (items: T[]) => ReactNode }): React.JSX.Element {
  const sensors = useSensors(useSensor(RowSensor, { activationConstraint: { distance: 5 } }))
  const { shown, keys, setHeld, sorting, lifting, landed } = useHeld(items, keyOf)
  const ticks = useRef(slotTicker()).current
  if (!onMove) return <>{children(items)}</>
  const onDragEnd = ({ active, over }: DragEndEvent): void => {
    landed()
    if (!over || over.id === active.id) return chime('stay')
    const [from, to] = [keys.indexOf(String(active.id)), keys.indexOf(String(over.id))]
    setHeld(arrayMove(keys, from, to))
    onMove(String(active.id), String(over.id))
  }
  return (
    <DndContext accessibility={dragWords} sensors={sensors} collisionDetection={nearPointer} modifiers={[sideways]}
      onDragStart={({ active }) => (chime('lift'), lifting(), ticks.start(String(active.id)))}
      onDragOver={({ over }) => ticks(over?.id)} onDragEnd={onDragEnd} onDragCancel={() => (landed(), chime('stay'))}>
      <SortableContext items={keys} strategy={partFor(room)}>
        <Sorting.Provider value={sorting}><Order.Provider value={keys.join('\n')}>{children(shown)}</Order.Provider></Sorting.Provider>
      </SortableContext>
      {/* Nothing is drawn in the hand: the overlay is kept for the closed hand and Esc alone. */}
      <Overlay dropAnimation={null} />
    </DndContext>
  )
}

/**
 * Carried as itself, whose middle follows the pointer rather than the place it was taken: the place whose middle is
 * nearest the pointer. Each place is read as it stands now in the row, their partings left out (offsetLeft, counted
 * from the carried one's own room, which never moves): the carried one changes width under the hand (a book turning
 * back to its spine), so places measured as it was taken stood 80px off and the others piled up (the lead's frames).
 */
const nearPointer: CollisionDetection = ({ active, droppableContainers }) => {
  if (offWindow()) return []
  const { x } = pointerAt()
  const mine = droppableContainers.find((one) => one.id === active.id)?.node.current
  if (!mine) return []
  const left = mine.getBoundingClientRect().left - mine.offsetLeft
  let best: { id: string | number; far: number } | null = null
  for (const one of droppableContainers) {
    const node = one.node.current
    if (!node) continue
    const far = Math.abs(left + node.offsetLeft + node.offsetWidth / 2 - x)
    if (!best || far < best.far) best = { id: one.id, far }
  }
  return best ? [{ id: best.id, data: { value: best.far } }] : []
}
/**
 * The others part by just the carried one's room, read from the list, never from its width as it was taken (a book
 * pulled out is 112 wide, a spine in the hand 32): those between where it was and where it will go slide over by that.
 */
const partFor = (room: number): SortingStrategy => ({ activeIndex, overIndex, index }) => {
  const x = index > activeIndex && index <= overIndex ? -room : index < activeIndex && index >= overIndex ? room : 0
  return { x, y: 0, scaleX: 1, scaleY: 1 }
}
/** Whether this row's own child is the one carried (ShelfRow): it moves itself, under the pointer. */
const Carried = createContext(false)
export const useCarried = (): boolean => useContext(Carried)
/** The one held glides to its new place on its own (books.tsx): dnd-kit's slide from where it was taken would jump. */
const ownGlide = (): boolean => false

/** One thing of a ShelfList. With `glide`, moved some other way (⌥← and ⌥→), it slides to its new place on a spring. */
export function ShelfRow({ id, glide, className, children }: { id: string; glide?: string; className?: string; children: ReactNode }): React.JSX.Element {
  const sorting = useContext(Sorting)
  const order = useContext(Order)
  const { setNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({ id, transition: still() ? null : { duration: 220, easing: EASING }, animateLayoutChanges: ownGlide })
  // The one carried is moved by its own child, under the pointer; the rest part as ever.
  const row = (
    <div ref={setNodeRef} data-sortable-id={id} {...attributes} {...listeners} tabIndex={-1} role={undefined} className={`${className ?? ''} rounded-md`}
      style={{ transform: transform && !isDragging ? `translate3d(${Math.round(transform.x)}px, 0, 0)` : undefined, transition: isDragging ? undefined : transition }}>
      <Carried.Provider value={isDragging}>{children}</Carried.Provider>
    </div>
  )
  if (!glide) return row
  return <motion.div layout={sorting || still() ? false : 'position'} layoutDependency={order} layoutId={glide} transition={spring.moderate} className={className}>{row}</motion.div>
}
