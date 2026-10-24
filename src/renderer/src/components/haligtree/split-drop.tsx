import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion, useMotionValue, useSpring, type MotionValue } from 'motion/react'
import { Columns2 } from 'lucide-react'

import { chime, click } from '@/lib/sound'
import { canSplit } from '@/lib/split'
import { enqueue } from '@/lib/reading-queue'
import { CAPTURE_TYPES } from '../capture-kinds/capture-kind-picker'
import { cut } from '../../../../main/clip'
import { still } from '@/lib/motion'

/**
 * Drag to split, Dia's way with tabs: carry a row, a Home tile, a pinned
 * note, a search result or an @ link over the page, and two tall dashed
 * places come up at its left and right edges. Let go over one and what you
 * carried opens in a new pane on that side (with four open already, it
 * takes that side's pane instead).
 *
 * The places and the carried card pull toward each other as they near, the
 * way React Bits' Magnet pulls a thing toward the pointer: within about
 * 120px, on a spring, the place leans out and grows a touch, and the card is
 * drawn in until, over it, it shrinks into a small card inside it. Escape
 * puts it all down. With Reduce motion nothing leans or grows; the places
 * still light.
 *
 * A row or card that drags inside its own list or board (your own order,
 * the Matrix's boxes, the week's days) keeps doing that, with its own lifted
 * picture as the only one: the places come up only while the pointer is
 * truly at the page's left or right edge, narrow, so they never cover a box
 * or a day it could be dropped in, and go again when it comes back in.
 */

export type Side = 'left' | 'right'
/** What was carried: `type:id` to open, or a list row in a pane (its id, and which pane). */
export type Carried = { open?: string; row?: { pane: string; id: string }; title: string; kind?: string }

/** How near, in px, the pull begins. */
const REACH = 120
/** How near the page's left or right edge a list's own drag goes before the places come up. */
const EDGE = 48
/** A place's width beside a list's own drag: a strip at the edge, never over what it could drop in. */
const NARROW = 72
/** How far past a list's column, to either side, a list's own drag goes before the places come up. */
const OUTSIDE = 24
/** How far the pointer moves before anything is carried. */
const START = 8

/** What can be carried from where the pointer went down, or null for anything else. */
function sourceOf(target: EventTarget | null): { node: HTMLElement; carried: Carried; column: boolean } | null {
  if (!(target instanceof Element)) return null
  if (target.closest('input, textarea, select, [data-no-split], [role="menu"], [role="separator"]')) return null
  const chip = target.closest<HTMLElement>('a.tiptap-note-link[data-note]')
  if (chip) {
    const raw = chip.getAttribute('data-note') ?? ''
    const [type, id] = raw.includes(':') ? [raw.slice(0, raw.indexOf(':')), raw.slice(raw.indexOf(':') + 1)] : ['capture', raw]
    if (type === 'person' || type === 'tag' || !id) return null
    return { node: chip, carried: { open: `${type}:${id}`, title: (chip.textContent ?? '').replace(/^@/, '').trim() }, column: false }
  }
  if (target.closest('[contenteditable="true"]')) return null
  const own = target.closest<HTMLElement>('[data-drag-open]')
  // One in a list of your own order (a pin in the sidebar) moves there first, as a list row does.
  if (own) return { node: own, carried: { open: own.dataset.dragOpen, title: titleOf(own), kind: own.dataset.dragKind }, column: !!own.closest('[data-sortable-id]') }
  const row = target.closest<HTMLElement>('[data-pane] [data-row][data-id]')
  const pane = row?.closest('[data-pane]')?.getAttribute('data-pane')
  if (!row || !pane || row.closest('[data-group-row]')) return null
  // A row that drags into your own order waits until it leaves its column.
  return { node: row, carried: { row: { pane, id: row.dataset.id! }, title: titleOf(row), kind: row.dataset.dragKind }, column: !!row.closest('[data-sortable-id]') }
}

/** A carried thing's name, as it reads: its title, never the age or counts beside it. */
const titleOf = (node: HTMLElement): string =>
  node.dataset.dragTitle ||
  (node.querySelector<HTMLElement>('.private-text, [data-title]')?.innerText ?? node.innerText).split('\n').map((line) => line.trim()).map((line) => cut(line, 80)).find(Boolean) ||
  'Untitled'

type Zone = { side: Side; left: number; top: number; width: number; height: number }
const zonesIn = (area: DOMRect, narrow = false): Zone[] => {
  const width = narrow ? NARROW : Math.max(96, Math.min(168, area.width * 0.2))
  const top = area.top + 10
  const height = Math.max(120, area.height - 20)
  return [
    { side: 'left', left: area.left + 10, top, width, height },
    { side: 'right', left: area.right - 10 - width, top, width, height }
  ]
}
/** How far the pointer is from a place: 0 inside it. */
const distance = (zone: Zone, x: number, y: number): number => {
  const dx = Math.max(zone.left - x, 0, x - (zone.left + zone.width))
  const dy = Math.max(zone.top - y, 0, y - (zone.top + zone.height))
  return Math.hypot(dx, dy)
}

/** Cancel a list's own drag (dnd-kit), as leaving the window would. */
const dropListDrag = (): void => void window.dispatchEvent(new Event('visibilitychange'))

export function SplitDrop({ onDrop }: { onDrop: (carried: Carried, side: Side) => void }): React.JSX.Element | null {
  const [carried, setCarried] = useState<Carried | null>(null)
  // Carried by a list's own drag, which draws its own lifted picture: no second one here.
  const [bare, setBare] = useState(false)
  const [zones, setZones] = useState<Zone[]>([])
  const [hot, setHot] = useState<Side | null>(null)
  const dropRef = useRef(onDrop)
  dropRef.current = onDrop
  // The pointer, and where the card is drawn toward.
  const x = useMotionValue(0)
  const y = useMotionValue(0)
  const cardX = useMotionValue(0)
  const cardY = useMotionValue(0)
  const card = { x: useSpring(cardX, { stiffness: 520, damping: 38, mass: 0.6 }), y: useSpring(cardY, { stiffness: 520, damping: 38, mass: 0.6 }) }
  const shrink = useMotionValue(1)
  const cardScale = useSpring(shrink, { stiffness: 420, damping: 34 })
  // Each place's lean toward the pointer and its growth, sprung.
  const lean = { left: useMotionValue(0), right: useMotionValue(0) }
  const grow = { left: useMotionValue(1), right: useMotionValue(1) }
  const leanS = { left: useSpring(lean.left, { stiffness: 300, damping: 24 }), right: useSpring(lean.right, { stiffness: 300, damping: 24 }) }
  const growS = { left: useSpring(grow.left, { stiffness: 300, damping: 24 }), right: useSpring(grow.right, { stiffness: 300, damping: 24 }) }

  useEffect(() => {
    if (!canSplit()) return
    let down: { x: number; y: number; source: NonNullable<ReturnType<typeof sourceOf>>; column: DOMRect } | null = null
    let active = false
    let shown: Zone[] = []
    let over: Side | null = null
    // The Queue's row in the sidebar, while the carried thing is over it: let go there, it joins the queue.
    // Pinned in the sidebar takes a note the same way (side-menu.tsx).
    let queued: HTMLElement | null = null
    const queueAt = (px: number, py: number): HTMLElement | null => document.elementFromPoint(px, py)?.closest<HTMLElement>('[data-queue-drop], [data-side-drop]') ?? null
    const area = (): DOMRect | null => document.querySelector('[data-split-area]')?.getBoundingClientRect() ?? null
    let quiet = still()
    // The places put away while the drag goes on.
    const hide = (): void => {
      active = false
      shown = []
      over = null
      if (queued) delete queued.dataset.queueHot
      queued = null
      delete document.documentElement.dataset.splitDrag
      setCarried(null)
      setHot(null)
    }
    const reset = (): void => {
      down = null
      active = false
      shown = []
      over = null
      if (queued) delete queued.dataset.queueHot
      queued = null
      delete document.documentElement.dataset.splitDrag
      setCarried(null)
      setHot(null)
    }
    const follow = (px: number, py: number): void => {
      x.set(px)
      y.set(py)
      let target: Side | null = null
      let toX = px
      let toY = py
      for (const zone of shown) {
        const far = distance(zone, px, py)
        const pull = Math.max(0, 1 - far / REACH)
        const middle = { x: zone.left + zone.width / 2, y: Math.max(zone.top + 40, Math.min(zone.top + zone.height - 40, py)) }
        if (far === 0) target = zone.side
        // The place leans out toward the pointer and grows a touch; the card is drawn in.
        lean[zone.side].set(quiet ? 0 : Math.max(-14, Math.min(14, (px - middle.x) * 0.1 * pull)))
        grow[zone.side].set(quiet ? 1 : 1 + 0.035 * pull)
        if (far === 0) (toX = middle.x), (toY = middle.y)
        else if (pull > 0 && !quiet) (toX = px + (middle.x - px) * 0.32 * pull), (toY = py + (middle.y - py) * 0.32 * pull)
      }
      if (quiet) {
        card.x.jump(toX)
        card.y.jump(toY)
      } else {
        cardX.set(toX)
        cardY.set(toY)
      }
      const queue = target ? null : queueAt(px, py)
      if (queue !== queued) {
        if (queued) delete queued.dataset.queueHot
        if (queue) (queue.dataset.queueHot = ''), click('tick')
        queued = queue
      }
      shrink.set(target || queue ? 0.86 : 1)
      if (target !== over) {
        over = target
        setHot(target)
        if (target) click('tick')
      }
    }
    const begin = (px: number, py: number): void => {
      const box = area()
      if (!box || !down) return
      active = true
      quiet = still()
      shown = zonesIn(box, down.source.column)
      document.documentElement.dataset.splitDrag = ''
      document.getSelection()?.removeAllRanges()
      // A list row already sounded its lift; anything else lifts now.
      if (!down.source.column) chime('lift')
      // The card starts where the pointer is, not flying in from the corner.
      card.x.jump(px)
      card.y.jump(py)
      cardScale.jump(1)
      for (const side of ['left', 'right'] as const) (leanS[side].jump(0), growS[side].jump(1))
      setZones(shown)
      // Only when the list's own lifted picture is really there: otherwise this one is the picture.
      setBare(down.source.column && !!document.querySelector('.mf-drag-picture > *'))
      setCarried(down.source.carried)
      follow(px, py)
    }
    const onDown = (event: PointerEvent): void => {
      if (event.button !== 0 || event.altKey || event.metaKey || event.ctrlKey || event.shiftKey) return
      const source = sourceOf(event.target)
      down = source && { x: event.clientX, y: event.clientY, source, column: source.node.getBoundingClientRect() }
    }
    const onMove = (event: PointerEvent): void => {
      if (!down) return
      if (!(event.buttons & 1)) return reset()
      if (Math.hypot(event.clientX - down.x, event.clientY - down.y) < START) return
      if (down.source.column) {
        // A list's own drag first: the places only while the pointer is at the page's edge.
        const box = area()
        const px = event.clientX
        // Over the sidebar's Queue or Pinned (not the one it came from): it can go there too.
        const side = queueAt(px, event.clientY)
        const elsewhere = !!side && !side.contains(down.source.node)
        const atEdge = !!box && ((px >= box.left && px < box.left + EDGE) || (px <= box.right && px > box.right - EDGE))
        // Out past the list's own column to either side (Pages' rows sit in a narrow column): the list is left, the places come up.
        const out = px < down.column.left - OUTSIDE || px > down.column.right + OUTSIDE
        const edge = elsewhere || atEdge || out
        // Back in over its column, away from the edge: they go, and the list's drag carries on.
        const back = !elsewhere && !out && (!box || (px > box.left + 10 + NARROW + 12 && px < box.right - 10 - NARROW - 12) || px < box.left || px > box.right)
        if (active && back) return hide()
        if (!active && !edge) return
      }
      if (active) return follow(event.clientX, event.clientY)
      begin(event.clientX, event.clientY)
    }
    const onUp = (event: PointerEvent): void => {
      if (!active || !down) return void (down = null)
      const side = over
      const what = down.source.carried
      const id = what.open ? what.open.slice(what.open.indexOf(':') + 1) : what.row?.id
      if (!side && queued?.dataset.sideDrop && what.open) {
        dropListDrag()
        event.preventDefault()
        window.dispatchEvent(new CustomEvent('haligtree:side-drop', { detail: { to: queued.dataset.sideDrop, open: what.open } }))
      } else if (!side && queued && queued.dataset.queueDrop !== undefined && id) {
        dropListDrag()
        event.preventDefault()
        void enqueue([id])
      } else if (side) {
        dropListDrag()
        event.preventDefault()
        // The click this release would make lands on nothing.
        const swallow = (late: MouseEvent): void => (late.stopPropagation(), late.preventDefault())
        window.addEventListener('click', swallow, { capture: true, once: true })
        setTimeout(() => window.removeEventListener('click', swallow, { capture: true }), 80)
        dropRef.current(what, side)
      }
      reset()
    }
    const onKey = (event: KeyboardEvent): void => {
      if (!active || event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      dropListDrag()
      chime('stay')
      reset()
    }
    // Links and pictures would start the browser's own drag instead.
    const onDragStart = (event: DragEvent): void => void (down && event.preventDefault())
    window.addEventListener('pointerdown', onDown, true)
    window.addEventListener('pointermove', onMove, true)
    window.addEventListener('pointerup', onUp, true)
    window.addEventListener('pointercancel', reset, true)
    window.addEventListener('keydown', onKey, true)
    window.addEventListener('dragstart', onDragStart, true)
    window.addEventListener('blur', reset)
    return () => {
      window.removeEventListener('pointerdown', onDown, true)
      window.removeEventListener('pointermove', onMove, true)
      window.removeEventListener('pointerup', onUp, true)
      window.removeEventListener('pointercancel', reset, true)
      window.removeEventListener('keydown', onKey, true)
      window.removeEventListener('dragstart', onDragStart, true)
      window.removeEventListener('blur', reset)
      delete document.documentElement.dataset.splitDrag
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const kind = carried?.kind ? CAPTURE_TYPES.find((one) => one.id === carried.kind) : undefined
  return createPortal(
    <AnimatePresence>
      {carried && (
        <motion.div
          key="split-drop"
          data-split-drop=""
          className="pointer-events-none fixed inset-0 z-[80]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.1 } }}
          transition={{ duration: 0.12 }}
        >
          {zones.map((zone) => (
            <ZoneBox key={zone.side} zone={zone} hot={hot === zone.side} lean={leanS[zone.side]} grow={growS[zone.side]} />
          ))}
          {!bare && <motion.div
            data-split-card=""
            className="absolute top-0 left-0 flex max-w-56 items-center gap-2 rounded-lg bg-foreground px-2.5 py-1.5 text-control text-background shadow-[0_10px_28px_-8px_rgb(0_0_0/0.45)]"
            style={{ x: card.x, y: card.y, scale: cardScale, translateX: '-50%', translateY: '-50%' }}
          >
            {kind ? <kind.icon className="size-3.5 shrink-0" style={{ color: kind.tint }} /> : <Columns2 className="size-3.5 shrink-0 opacity-70" />}
            <span className="private-text min-w-0 truncate">{carried.title}</span>
          </motion.div>}
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  )
}

function ZoneBox({ zone, hot, lean, grow }: { zone: Zone; hot: boolean; lean: MotionValue<number>; grow: MotionValue<number> }): React.JSX.Element {
  // No limit on panes: a drop always adds one where it lands.
  const label = `Open on the ${zone.side}`
  // A strip at the edge, beside a list's own drag: its words wrap, smaller.
  const narrow = zone.width <= NARROW
  return (
    <motion.div
      data-split-zone={zone.side}
      data-hot={hot ? '' : undefined}
      aria-label={label}
      className={`absolute flex flex-col items-center justify-start gap-2 rounded-xl border-2 border-dashed pt-[min(30%,12rem)] transition-[background-color,border-color,color] duration-150 ${
        hot
          ? 'border-[var(--tt-brand-color-400)] bg-[color-mix(in_srgb,var(--tt-brand-color-400)_10%,var(--background))] text-foreground'
          : 'border-foreground/20 bg-background text-muted-foreground'
      }`}
      style={{ left: zone.left, top: zone.top, width: zone.width, height: zone.height, x: lean, scale: grow, transformOrigin: zone.side === 'left' ? 'left center' : 'right center' }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.14 }}
    >
      <span className={`flex size-8 items-center justify-center rounded-lg ${hot ? 'bg-[color-mix(in_srgb,var(--tt-brand-color-400)_22%,transparent)] text-[var(--tt-brand-color-400)]' : 'bg-foreground/5'}`}>
        <SplitMark side={zone.side} />
      </span>
      <span className={`rounded-md bg-popover py-0.5 text-center font-medium shadow-sm ${narrow ? 'mx-1 px-1 text-xs leading-tight' : 'px-2 text-control'}`}>{label}</span>
    </motion.div>
  )
}

/** Two panes side by side, the half that would be new filled in. */
function SplitMark({ side }: { side: Side }): React.JSX.Element {
  return (
    <svg viewBox="0 0 16 16" className="size-4" fill="none" stroke="currentColor" strokeWidth={1.4} aria-hidden>
      <rect x="1.5" y="2.5" width="13" height="11" rx="2" />
      <path d="M8 2.5v11" />
      <rect x={side === 'left' ? 2.6 : 8.6} y="3.6" width="4.8" height="8.8" rx="1" fill="currentColor" stroke="none" opacity="0.55" />
    </svg>
  )
}
