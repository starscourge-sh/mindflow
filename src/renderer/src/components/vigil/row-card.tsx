import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'motion/react'
import { Columns2, Copy, Ellipsis, Link, Pin, PinOff } from 'lucide-react'

import { realMove } from '@/lib/real-move'
import { canSplit, openAside, usePaneMark } from '@/lib/split'
import { spring } from '@/lib/motion'
import { CAPTURE_TYPES } from '../capture-kinds/capture-kind-picker'
import { copy, type RowItem } from './row-menu'
import { Tip } from './ui'
import type { Entry } from './note-list'

/**
 * Point at a row of a list and rest there, and a small card comes up under
 * it, as Dia's does for a tab: the note's name, its kind and age, and four
 * quick things to do (Pin, Open to the side, Copy link, More). Half a second
 * first, and only after the hand really moved (lib/real-move.ts): a list
 * filling in under a still pointer, a drag, or keys being pressed never
 * bring it up. Moving onto the card keeps it; moving away lets it go.
 */

// Every row drawn tells the card what it is, by its id.
const known = new Map<string, Entry>()
export const knowRow = (entry: Entry): void => void known.set(entry.id, entry)
/** A row as its list last drew it: its name, kind and menu. */
export const rowOf = (id: string): Entry | undefined => known.get(id)

const WAIT = 500
/** How long the card waits for the pointer once it leaves the row or the card: time to cross the gap, or to come back. */
const GRACE = 280

/** Whether `p` is inside the triangle a, b, c: the way from where the pointer left the row to the card's near edge. */
const inside = (p: [number, number], a: [number, number], b: [number, number], c: [number, number]): boolean => {
  const side = (u: [number, number], v: [number, number], w: [number, number]): number => (u[0] - w[0]) * (v[1] - w[1]) - (v[0] - w[0]) * (u[1] - w[1])
  const d1 = side(p, a, b)
  const d2 = side(p, b, c)
  const d3 = side(p, c, a)
  return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0))
}
let lastKey = 0
if (typeof window !== 'undefined') addEventListener('keydown', () => void (lastKey = Date.now()), true)

type Shown = { entry: Entry; row: HTMLElement; x: number; top: number; below: boolean }

const isRun = (item: RowItem): item is { label: string; run: () => void } => !!item && item !== 'separator' && 'run' in item
const find = (entry: Entry, rule: RegExp): { label: string; run: () => void } | undefined =>
  (entry.menu ?? []).flatMap((item) => (item && item !== 'separator' && 'items' in item ? item.items : [item])).filter(isRun).find((item) => rule.test(item.label))

export function RowCard(): React.JSX.Element | null {
  const [shown, setShown] = useState<Shown | null>(null)
  const shownRef = useRef<Shown | null>(null)
  shownRef.current = shown
  const card = useRef<HTMLDivElement>(null)
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    let leave: ReturnType<typeof setTimeout> | undefined
    let over: HTMLElement | null = null
    let pending = false
    // Where the pointer last was on the shown row, the tip of the way to the card.
    let lastOnRow: [number, number] | null = null
    const busy = (): boolean =>
      'dragging' in document.documentElement.dataset || 'splitDrag' in document.documentElement.dataset || Date.now() - lastKey < 1500 || !!document.querySelector('[role="menu"], [aria-modal="true"]')
    const hide = (): void => {
      pending = false
      clearTimeout(timer)
      clearTimeout(leave)
      over = null
      setShown(null)
    }
    /** Let the card go after a moment, unless the pointer comes back to it or its row first. */
    const letGo = (): void => {
      clearTimeout(leave)
      leave = setTimeout(() => setShown(null), GRACE)
    }
    /** On the way from the row to the card: inside the triangle from where it left the row to the card's near edge. */
    const crossing = (x: number, y: number): boolean => {
      const box = card.current?.getBoundingClientRect()
      const now = shownRef.current
      if (!box || !now || !lastOnRow) return false
      const edge = now.below ? box.top : box.bottom
      // A little wider than the card, so a hand drifting at its corner still counts.
      return inside([x, y], lastOnRow, [box.left - 12, edge], [box.right + 12, edge])
    }
    const onMove = (event: PointerEvent): void => {
      if (!realMove(event)) return
      const target = event.target instanceof Element ? event.target : null
      const shownNow = shownRef.current
      // On the card: it stays, and no row under it starts a card of its own.
      if (target && card.current?.contains(target)) {
        clearTimeout(leave)
        clearTimeout(timer)
        pending = false
        over = shownNow?.row ?? null
        return
      }
      if (event.buttons) return hide()
      const row = target?.closest<HTMLElement>('[data-pane] [data-row][data-id]') ?? null
      // Back on the row whose card is up: it stays.
      if (shownNow && row === shownNow.row) {
        clearTimeout(leave)
        over = row
        lastOnRow = [event.clientX, event.clientY]
        return
      }
      // On the way to the card, across the gap and the rows it passes over: it waits, and starts nothing new.
      if (shownNow && crossing(event.clientX, event.clientY)) {
        clearTimeout(timer)
        pending = false
        letGo()
        return
      }
      // Still on the same row: only a row whose wait was cut short (keys, a drag) starts it again.
      if (row === over && pending) return
      over = row
      clearTimeout(timer)
      pending = false
      // Off the row and the card: a moment's grace, then it goes.
      if (shownNow) letGo()
      if (!row) return
      pending = true
      timer = setTimeout(() => {
        pending = false
        const entry = known.get(row.dataset.id ?? '')
        if (!entry || !row.isConnected || over !== row || busy()) return
        const box = row.getBoundingClientRect()
        const below = box.bottom + 120 < window.innerHeight
        clearTimeout(leave)
        lastOnRow = [event.clientX, event.clientY]
        setShown({ entry, row, x: Math.min(Math.max(12, event.clientX - 40), window.innerWidth - 300), top: below ? box.bottom + 4 : box.top - 4, below })
      }, WAIT)
    }
    const onKey = (): void => void (shownRef.current && hide())
    const onDown = (event: PointerEvent): void => {
      if (event.target instanceof Element && card.current?.contains(event.target)) return
      hide()
    }
    document.addEventListener('pointermove', onMove, true)
    document.addEventListener('keydown', onKey, true)
    document.addEventListener('pointerdown', onDown, true)
    document.addEventListener('scroll', hide, true)
    window.addEventListener('blur', hide)
    // Out of the window altogether: the same grace, in case it comes straight back.
    const onOut = (event: MouseEvent): void => void (!event.relatedTarget && shownRef.current && letGo())
    document.addEventListener('mouseout', onOut)
    return () => {
      document.removeEventListener('mouseout', onOut)
      hide()
      document.removeEventListener('pointermove', onMove, true)
      document.removeEventListener('keydown', onKey, true)
      document.removeEventListener('pointerdown', onDown, true)
      document.removeEventListener('scroll', hide, true)
      window.removeEventListener('blur', hide)
    }
  }, [])
  return createPortal(
    <AnimatePresence>
      {shown && (
        <motion.div
          key={shown.entry.id}
          ref={card}
          role="toolbar"
          aria-label={shown.entry.title || 'Untitled'}
          data-row-card={shown.entry.id}
          data-private={shown.entry.private ? '' : undefined}
          className="fixed z-[70] w-72 rounded-lg border bg-popover p-2.5 text-control text-popover-foreground shadow-(--mf-panel-shadow)"
          style={{ left: shown.x, top: shown.top, translateY: shown.below ? 0 : '-100%' }}
          initial={{ opacity: 0, y: shown.below ? -4 : 4, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.08 } }}
          transition={spring.moderate}
        >
          <Face entry={shown.entry} row={shown.row} onDone={() => setShown(null)} />
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  )
}

function Face({ entry, row, onDone }: { entry: Entry; row: HTMLElement; onDone: () => void }): React.JSX.Element {
  const kind = CAPTURE_TYPES.find((one) => one.icon === entry.icon)
  const kindName = kind?.label ?? entry.type.charAt(0).toUpperCase() + entry.type.slice(1)
  const pin = find(entry, /^(unpin|pin)\b/i)
  const pinned = !!pin && /^unpin/i.test(pin.label)
  // A link to the note itself first; a note's own web links only where that is all there is.
  const link = find(entry, /^copy link to this note/i) ?? find(entry, /^copy link/i)
  const mark = usePaneMark(entry.id)
  const more = (): void => {
    onDone()
    const box = row.getBoundingClientRect()
    row.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: box.left + 24, clientY: box.bottom - 4, button: 2 }))
  }
  const button = (label: string, icon: React.ReactNode, run: () => void, name: string): React.JSX.Element => (
    <Tip label={label}>
      <button type="button" data-card-action={name} onClick={() => run()}
        className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground [&_svg]:size-4">
        {icon}
      </button>
    </Tip>
  )
  return (
    <div className="flex flex-col gap-2">
      <div className="flex min-w-0 items-start gap-2 px-0.5">
        <entry.icon className="mt-0.5 size-4 shrink-0" style={{ color: entry.tint }} />
        <div className="min-w-0 flex-1">
          <p className="private-text line-clamp-2 font-medium">{entry.title || 'Untitled'}</p>
          <p className="text-xs text-muted-foreground">
            {kindName}
            {entry.age && <> · {entry.age}</>}
            {mark && <> · open on the {mark === 'L' ? 'left' : mark === 'R' ? 'right' : 'middle'}</>}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-0.5 border-t pt-1.5">
        {pin && button(pinned ? 'Unpin' : 'Pin', pinned ? <PinOff /> : <Pin />, () => (onDone(), pin.run()), 'pin')}
        {canSplit() && button('Open to the side  ⌥-click', <Columns2 />, () => (onDone(), openAside(entry.type, entry.id)), 'aside')}
        {link
          ? button('Copy link', <Link />, () => (onDone(), link.run()), 'link')
          : button('Copy title', <Copy />, () => (onDone(), copy(entry.title || 'Untitled')), 'link')}
        <span className="flex-1" />
        {entry.menu && button('More', <Ellipsis />, more, 'more')}
      </div>
    </div>
  )
}
