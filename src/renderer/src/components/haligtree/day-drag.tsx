import { useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { DndContext, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent, type DragMoveEvent, type DragStartEvent } from '@dnd-kit/core'
import { SortableContext, type SortingStrategy } from '@dnd-kit/sortable'

import { pastEdge } from '@/lib/drag-edge'
import { still } from '@/lib/motion'
import { chime } from '@/lib/sound'
import { CarriedCard, Carrying, Hand, useCardPlace, OUTDENT, PanelParts, REST, Shaped, pointerNow, rowAt, sideOf, useAim, useCarriedLeft, useRest, useTall, type Aim } from './carry'
import { Overlay, PlaceSaid, SETTLE, upDown, usePlaces } from './sortable'
import { refuse } from './ui'

/**
 * Today's written page carried as a list's rows and groups are: a line is a row,
 * and a line with steps holds them as a group holds its rows. A step lifts alone
 * and lands among any line's steps; past a line's edge it is a line of its own;
 * a line rested on another's middle is made a step of it. A line with steps of its
 * own carries them along, and stays a line, said in words.
 */

export type DayLineDrag = { id: string; title: string; steps: string[]; /** Ticked: it takes no steps here. */ struck: boolean }
/** What letting go does: a line just before or after a line, or a step at a place among a line's steps. */
export type DayDrop = { to: 'line'; target: string; after: boolean } | { to: 'step'; parent: string; at: number }

const lineKey = (id: string): string => `t:${id}`
const stepKey = (id: string, at: number): string => `s:${id}:${at}`
const unmoved: SortingStrategy = () => null
/** A step's words start this far in. */
const STEP_IN = 36
const STEP_WORDS = 'Make it a step'
export const REFUSED = 'A line with steps of its own stays a line'

/** A step's key read back: the line it is in, and its place there. */
export const readStep = (key: string): { id: string; at: number } => ({ id: key.slice(2, key.lastIndexOf(':')), at: Number(key.slice(key.lastIndexOf(':') + 1)) })

/** One line and its steps, with the panel it lights as it takes what is carried. */
export function LineBlock({ id, children }: { id: string; children: ReactNode }): React.JSX.Element {
  const { aim, shapes, hand, snap } = useContext(Carrying)
  const block = useRef<HTMLDivElement>(null)
  const tall = useTall(block)
  const lit = aim?.into === id
  return (
    <div ref={block} data-line-block={id} data-carried-line={hand === lineKey(id) ? '' : undefined} className="relative isolate [&[data-carried-line]_[data-day-step]]:opacity-0">
      <div aria-hidden data-panel="" className={`pointer-events-none absolute inset-0 -z-10 origin-top transition-opacity duration-200 motion-reduce:transition-none ${lit ? '' : 'opacity-0'}`}
        style={{ '--panel-fill': 'color-mix(in srgb, var(--foreground) 3.5%, transparent)', '--panel-edge': 'color-mix(in srgb, var(--foreground) 9%, transparent)', '--panel-lit': 'color-mix(in srgb, var(--foreground) 4%, transparent)' } as React.CSSProperties}>
        <PanelParts id={id} shape={shapes.get(id) ?? REST} tall={tall} lit={lit} snap={snap} />
      </div>
      {children}
    </div>
  )
}

export function DayDrag({ lines, heading, tail, onDrop, onPlace, places, children }: {
  lines: DayLineDrag[]
  /** The small heading under this line's block, if one is drawn there: it slides with the rows. */
  heading?: { after: string; id: string }
  /** What is drawn under the last row (the line being written): it makes way as the rows do. */
  tail?: string
  onDrop: (carried: string, drop: DayDrop) => void
  /** Dropped on a place on the page (a heading, a tab). */
  onPlace: (carried: string, place: string) => void
  places: { said: (place: string) => string; foot?: ReactNode }
  children: ReactNode
}): React.JSX.Element {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))
  const [hand, setHand] = useState<string | null>(null)
  const [span, setSpan] = useState(0)
  const [rowH, setRowH] = useState(0)
  const [grab, setGrab] = useState(60)
  const [from, setFrom] = useState<number | null>(null)
  const [snap, setSnap] = useState(false)
  const { aim, aimed, start, point } = useAim()
  const { place, aimed: placed, aimAt, following } = usePlaces(true)
  const card = useCardPlace(aim, (now) => !!now.make || now.label === STEP_WORDS)
  const inside = useRef(new Set<string>())
  const sided = useRef<{ key: string; how: 'before' | 'after' } | null>(null)
  const lastMove = useRef<DragMoveEvent | null>(null)
  const { rested, undwell } = useRest(() => lastMove.current && onDragMove(lastMove.current))

  const blockKeys = (line: DayLineDrag): string[] => (hand === lineKey(line.id) ? [lineKey(line.id)] : [lineKey(line.id), ...line.steps.map((_, at) => stepKey(line.id, at))])
  const rows = lines.flatMap(blockKeys)
  const keys = [...lines.flatMap((line) => [...blockKeys(line), ...(heading?.after === line.id ? [heading.id] : [])]), ...(tail ? [tail] : [])]
  const blocks = lines.map((line) => ({ id: line.id, rows: blockKeys(line) }))
  const homeOf = (key: string | null): string | null => (key?.startsWith('s:') ? readStep(key).id : null)

  const onDragStart = ({ active, activatorEvent }: DragStartEvent): void => {
    const id = String(active.id)
    setSnap(false)
    chime('lift')
    start(id, homeOf(id))
    card.lift()
    inside.current.clear()
    following(true)
    setHand(id)
    const node = document.querySelector<HTMLElement>(`[data-sortable-id="${CSS.escape(id)}"]`)
    const box = node?.getBoundingClientRect()
    const x = activatorEvent instanceof PointerEvent ? activatorEvent.clientX : 0
    setFrom(x)
    setGrab(box ? x - box.left : 60)
    setRowH(box?.height ?? 28)
    // A line takes its steps along: the room it opens is its whole block.
    setSpan(id.startsWith('t:') ? node?.closest('[data-line-block]')?.getBoundingClientRect().height ?? box?.height ?? 28 : box?.height ?? 24)
  }

  const onDragMove = (event: DragMoveEvent): void => {
    lastMove.current = event
    const { active, activatorEvent, delta } = event
    const held = active.rect.current.initial
    if (held) card.follow(held.top + held.height / 2 + delta.y)
    const id = String(active.id)
    const y = activatorEvent instanceof PointerEvent ? activatorEvent.clientY + delta.y : null
    if (y === null || placed.current) return point(null)
    const over = rowAt(new Set(rows), y)
    if (!over) return point(null)
    const of = (key: string): DayLineDrag | undefined => lines.find((line) => line.id === (key.startsWith('s:') ? readStep(key).id : key.slice(2)))
    const carriedLine = id.startsWith('t:') ? of(id) : undefined
    const stepsCome = !!carriedLine?.steps.length
    const owner = of(over.id)
    if (!owner) return point(null)
    const block = owner === carriedLine ? null : over.node.closest<HTMLElement>('[data-line-block]')?.getBoundingClientRect()
    const past = pastEdge(block ? [{ id: owner.id, top: block.top, bottom: block.bottom }] : [], y, inside.current)
    const leftward = id.startsWith('s:') && activatorEvent instanceof PointerEvent && activatorEvent.clientX - pointerNow() > OUTDENT
    if (over.id === id && !past && !leftward) return point(null, true)
    const at = (y - over.top) / over.height
    const onHead = over.id.startsWith('t:')
    const middle = !past && onHead && !owner.struck && at > 0.28 && at < 0.72 && owner !== carriedLine
    if (!middle) undwell()

    const aimLine = (target: string, after: boolean): Aim | null => {
      const seq = rows.filter((key) => key !== id)
      const line = lines.find((one) => one.id === target)!
      const prev = after ? blockKeys(line).filter((key) => key !== id).at(-1) : seq[seq.indexOf(lineKey(target)) - 1]
      // Already there.
      if (carriedLine && prev === rows[rows.indexOf(id) - 1]) return null
      return { target: lineKey(target), how: after ? 'after' : 'before', into: null, label: carriedLine ? 'Move here' : 'Make it a task', gap: prev === undefined ? -1 : keys.indexOf(prev), around: [], snug: false, act: { to: 'line', target, after } satisfies DayDrop }
    }
    const aimStep = (parent: DayLineDrag, place: number): Aim | null => {
      const own = parent.steps.map((_, n) => stepKey(parent.id, n)).filter((key) => key !== id)
      if (id.startsWith('s:') && readStep(id).id === parent.id && readStep(id).at === place) return null
      const prev = place === 0 ? lineKey(parent.id) : own[place - 1]
      return { target: stepKey(parent.id, place), how: 'join', into: parent.id, label: id.startsWith('s:') && readStep(id).id === parent.id ? 'Move here' : STEP_WORDS, gap: keys.indexOf(prev), around: [parent.id], snug: true, indent: STEP_IN, act: { to: 'step', parent: parent.id, at: place } satisfies DayDrop }
    }
    // Past its edge, or carried well to the left of where a step sits: a line of its own, beside that line.
    if (past) return point(aimLine(past.id, past.how === 'after'))
    if (leftward && owner.id === homeOf(id)) return point(aimLine(owner.id, true))

    const side = sideOf(sided.current, over.id, at)
    sided.current = { key: over.id, how: side }
    // A line with steps of its own goes only beside another's whole block, read against that block.
    if (stepsCome || owner.struck) {
      if (middle && stepsCome && rested(over.id)) return point({ target: over.id, how: 'join', into: null, label: REFUSED, gap: null, around: [], refused: true })
      if (!block) return point(null, true)
      return point(aimLine(owner.id, (y - block.top) / block.height >= 0.5))
    }
    if (onHead) {
      if (middle && rested(over.id)) {
        if (owner.steps.length) return point(aimStep(owner, owner.steps.filter((_, n) => stepKey(owner.id, n) !== id).length))
        return point({ target: over.id, how: 'join', into: null, make: true, label: STEP_WORDS, gap: null, around: [], act: { to: 'step', parent: owner.id, at: 0 } satisfies DayDrop })
      }
      if (side === 'before') return point(aimLine(owner.id, false))
      return point(owner.steps.length && owner !== carriedLine ? aimStep(owner, 0) : aimLine(owner.id, true))
    }
    // Over a step: among that line's steps, by which half.
    const own = owner.steps.map((_, n) => stepKey(owner.id, n)).filter((key) => key !== id)
    return point(aimStep(owner, own.indexOf(over.id) + (side === 'after' ? 1 : 0)))
  }

  const end = (): void => {
    lastMove.current = null
    sided.current = null
    undwell()
    following(false)
    aimAt(null)
    setHand(null)
    point(null)
  }
  const onDragEnd = ({ active }: DragEndEvent): void => {
    const now = aimed.current
    const on = placed.current?.dataset.rowDrop
    const id = String(active.id)
    end()
    if (on) return onPlace(id, on)
    if (now?.refused) return refuse(REFUSED)
    if (!now?.act) return chime('stay')
    setSnap(true)
    onDrop(id, now.act as DayDrop)
  }
  useCarriedLeft(from, !!hand, () => lastMove.current && onDragMove(lastMove.current))
  // Rows changed under a still pointer: aimed afresh when they have.
  const shape = rows.join('\n')
  useEffect(() => {
    if (hand && lastMove.current) onDragMove(lastMove.current)
  }, [shape]) // eslint-disable-line react-hooks/exhaustive-deps

  const carried = hand?.startsWith('t:') ? lines.find((line) => lineKey(line.id) === hand)?.title : hand ? lines.find((line) => line.id === readStep(hand).id)?.steps[readStep(hand).at] : undefined
  const steps = hand?.startsWith('t:') ? lines.find((line) => lineKey(line.id) === hand)?.steps.length ?? 0 : 0
  const words = aim?.label ?? (steps ? `With its ${steps === 1 ? 'step' : `${steps} steps`}` : null)
  return (
    <DndContext accessibility={{ container: document.body }} sensors={sensors} collisionDetection={closestCenter} modifiers={[upDown]}
      onDragStart={onDragStart} onDragMove={onDragMove} onDragEnd={onDragEnd} onDragCancel={() => (end(), chime('stay'))}>
      <SortableContext items={rows} strategy={unmoved}>
        <Shaped aim={aim} keys={keys} hand={hand} home={homeOf(hand)} many={hand ? [hand] : []} span={span} inset={0} row={rowH} snap={snap} blocks={blocks} footRoom={false}>
          {children}
        </Shaped>
      </SortableContext>
      {/* Laid over what is under the list, never in its flow: a drag starting moves nothing else on the page. */}
      {hand && places.foot && <div data-drop-foot-over className="relative z-10 h-0"><div className="absolute inset-x-0 top-0 bg-background pb-2">{places.foot}</div></div>}
      <Overlay dropAnimation={still() || place || aim?.act ? null : SETTLE}>
        {hand && (
          <div className="flex h-full flex-col items-start gap-1">
            <div className={`h-full w-full ${place ? 'opacity-0' : ''}`}>
              <Hand grab={grab} from={from} rest={card.rest}>
                <CarriedCard title={carried || 'Untitled'} words={words} refused={!!aim?.refused} />
              </Hand>
            </div>
            {place && <PlaceSaid place={place} said={places.said(place)} />}
          </div>
        )}
      </Overlay>
    </DndContext>
  )
}
