import { useEffect, useRef, useState, type ComponentType, type CSSProperties } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { edge, detent } from '@/lib/haptics'
import { chime } from '@/lib/sound'
import { EASE, still } from '@/lib/motion'

/**
 * Two fingers sideways on the trackpad go Back and Forward, Dia's way: a small
 * round button with an arrow peeks in from the pane's edge and follows the
 * fingers; the page itself never moves. Past the line, one firm tap: let go
 * then and it goes. Hold there and the button grows into the pages behind you,
 * nearest first; two fingers up and down move the pick (a light tap each), and
 * letting go goes there. Once open the list stays until it is answered: ↑ ↓,
 * Enter or a click goes, Esc or a click outside closes.
 *
 * The page hears the wheel but not the fingers: their lifting comes from main
 * (Chromium ends the scroll then, never while they rest still), and the
 * trackpad's glide after a flick (each step shorter than the last) counts as a
 * let go too. A wheel some part of the page used (the Map, a carousel) or a
 * sideways scroller under the pointer that can still move keeps the swipe.
 */
export type SwipeName = { title: string; icon: ComponentType<{ className?: string; style?: CSSProperties }>; tint?: string }
type Trail = { views: unknown[]; at: number }
type Props = {
  front: () => string
  trailOf: (key: string) => Trail | null
  nameOf: (view: never) => SwipeName
  go: (key: string, to: number) => void
}

const LINE = 110 // px of fingers to the tap
const SIZE = 56
const HOLD = 900 // ms resting past the tap before the list opens
type G = { key: string; way: -1 | 1; pull: number; armed: boolean; steps: number[]; rect: DOMRect }
type List = { key: string; way: -1 | 1; rect: DOMRect; rows: { index: number; name: SwipeName }[]; pick: number; moved: boolean }

export function SwipeBack({ front, trailOf, nameOf, go }: Props): React.JSX.Element {
  const [shown, setShown] = useState<{ way: -1 | 1; rect: DOMRect; pull: number; armed: boolean } | null>(null)
  const [list, setList] = useState<List | null>(null)
  const listRef = useRef<List | null>(null)
  listRef.current = list
  const props = useRef({ front, trailOf, nameOf, go })
  props.current = { front, trailOf, nameOf, go }

  useEffect(() => {
    let g: G | null = null
    let last = 0
    let spent = false // the rest of a sequence already answered (gone or cancelled) is swallowed
    let ignored = false // a sequence the page keeps (a scroller, the Map, vertical)
    let hold = 0
    let rest = 0
    let dy = 0
    const draw = (): void => setShown(g ? { way: g.way, rect: g.rect, pull: g.pull, armed: g.armed } : null)
    const end = (): void => {
      clearTimeout(hold)
      clearTimeout(rest)
      g = null
      spent = true
      draw()
    }
    const goBy = (key: string, to: number): void => {
      props.current.go(key, to)
    }
    const openList = (): void => {
      if (!g) return
      const trail = props.current.trailOf(g.key)
      if (!trail) return end()
      const rows: List['rows'] = []
      for (let index = trail.at + g.way; index >= 0 && index < trail.views.length && rows.length < 9; index += g.way) rows.push({ index, name: props.current.nameOf(trail.views[index] as never) })
      setList({ key: g.key, way: g.way, rect: g.rect, rows, pick: 0, moved: false })
      chime('slide')
      dy = 0
      g = null
      draw()
    }
    const lifted = (): void => {
      const open = listRef.current
      if (open) {
        // Let go after choosing with the fingers: go there. Opened and not moved, it stays open to be answered.
        if (open.moved) (setList(null), goBy(open.key, open.rows[open.pick].index))
        spent = true
        return
      }
      if (!g) return
      const { key, way, armed } = g
      const trail = props.current.trailOf(key)
      end()
      if (armed && trail) goBy(key, trail.at + way)
    }
    const startable = (event: WheelEvent): G | null => {
      const target = event.target instanceof Element ? event.target : null
      if (!target || target.closest('canvas, [data-swipe-own], [role=dialog], [role=menu]')) return null
      // A sideways scroller under the pointer that can still go that way keeps the swipe.
      for (let el: Element | null = target; el && el !== document.body; el = el.parentElement) {
        const style = getComputedStyle(el)
        if (!/(auto|scroll)/.test(style.overflowX) || el.scrollWidth <= el.clientWidth + 1) continue
        if (event.deltaX < 0 ? el.scrollLeft > 0 : el.scrollLeft < el.scrollWidth - el.clientWidth - 1) return null
      }
      const paneEl = target.closest<HTMLElement>('[data-pane]')
      const key = paneEl?.dataset.pane ?? props.current.front()
      const trail = props.current.trailOf(key)
      // Fingers to the right (the wheel's deltaX below 0 with natural scrolling): Back.
      const way: -1 | 1 = event.deltaX < 0 ? -1 : 1
      if (!trail || trail.at + way < 0 || trail.at + way >= trail.views.length) return null
      const rect = (paneEl ?? document.querySelector('[data-pane]') ?? document.body).getBoundingClientRect()
      return { key, way, pull: 0, armed: false, steps: [], rect }
    }
    const onWheel = (event: WheelEvent): void => {
      const now = performance.now()
      const fresh = now - last > 220
      last = now
      const open = listRef.current
      if (open) {
        // Two fingers up and down move the pick, a light tap a row.
        if (spent && !fresh) return
        spent = false
        event.preventDefault()
        dy += event.deltaY
        const by = Math.trunc(dy / 36)
        if (!by) return
        dy -= by * 36
        const pick = Math.max(0, Math.min(open.rows.length - 1, open.pick + Math.sign(by)))
        if (pick !== open.pick) (detent(), setList({ ...open, pick, moved: true }))
        return
      }
      if (fresh) (spent = false, (ignored = false))
      if (spent || ignored) return
      if (!g) {
        if (event.defaultPrevented || event.ctrlKey || event.metaKey || Math.abs(event.deltaX) < 2 || Math.abs(event.deltaX) < Math.abs(event.deltaY) * 1.5) return void (ignored = !fresh || Math.abs(event.deltaY) > 2)
        g = startable(event)
        if (!g) return void (ignored = true)
      }
      event.preventDefault()
      const fingers = -event.deltaX * -g.way // toward the middle of the page from the edge it came from
      g.pull = Math.max(0, g.pull + fingers)
      g.steps.push(Math.abs(event.deltaX))
      if (!g.armed && g.pull >= LINE) (g.armed = true, edge())
      else if (g.armed && g.pull < LINE * 0.8) g.armed = false
      draw()
      // The trackpad's glide: four steps in a row, each shorter than the one before. The fingers are off.
      const tail = g.steps.slice(-4)
      if (g.steps.length > 6 && tail.length === 4 && tail.every((one, n) => !n || one < tail[n - 1] * 0.97)) return lifted()
      clearTimeout(hold)
      clearTimeout(rest)
      // Resting past the tap: the list. Resting short of it, a while: put away.
      if (g.armed) hold = window.setTimeout(openList, HOLD)
      else rest = window.setTimeout(() => g && !g.armed && end(), 700)
    }
    const onLifted = (): void => lifted()
    window.addEventListener('wheel', onWheel, { passive: false })
    window.addEventListener('haligtree:swipe-lifted', onLifted)
    const off = window.api.onSwipeLifted?.(onLifted)
    return () => {
      window.removeEventListener('wheel', onWheel)
      window.removeEventListener('haligtree:swipe-lifted', onLifted)
      off?.()
      clearTimeout(hold)
      clearTimeout(rest)
    }
  }, [])

  // The open list answers ↑ ↓, Enter and Esc, and a click outside closes it.
  useEffect(() => {
    if (!list) return
    const onKey = (event: KeyboardEvent): void => {
      const open = listRef.current
      if (!open) return
      if (event.key === 'Escape') (setList(null), chime('fold'))
      else if (event.key === 'Enter') (setList(null), props.current.go(open.key, open.rows[open.pick].index))
      else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        const pick = Math.max(0, Math.min(open.rows.length - 1, open.pick + (event.key === 'ArrowDown' ? 1 : -1)))
        if (pick !== open.pick) (detent(), setList({ ...open, pick }))
      } else return
      event.preventDefault()
      event.stopPropagation()
    }
    const onDown = (event: PointerEvent): void => void (!(event.target as Element)?.closest?.('[data-swipe-list]') && setList(null))
    window.addEventListener('keydown', onKey, true)
    window.addEventListener('pointerdown', onDown, true)
    return () => {
      window.removeEventListener('keydown', onKey, true)
      window.removeEventListener('pointerdown', onDown, true)
    }
  }, [list !== null]) // eslint-disable-line react-hooks/exhaustive-deps

  const calm = still()
  const at = list ?? shown
  const mid = at ? at.rect.top + at.rect.height / 2 : 0
  // From hidden past the edge to sitting just inside it at the tap; past it, a little further, slower.
  const slid = shown ? (shown.pull < LINE ? -SIZE + (shown.pull / LINE) * (SIZE + 8) : 8 + Math.sqrt(shown.pull - LINE) * 1.6) : 8
  const Arrow = at?.way === 1 ? ChevronRight : ChevronLeft
  const side = (rect: DOMRect, way: -1 | 1, inset: number): CSSProperties => (way === -1 ? { left: rect.left + inset } : { left: rect.right - inset - SIZE })
  return (
    <>
      {shown && !list && (
        <div data-swipe-arrow={shown.armed ? 'armed' : 'pulling'} aria-hidden
          className="pointer-events-none fixed z-50 flex items-center justify-center rounded-full border bg-popover text-popover-foreground shadow-(--mf-panel-shadow)"
          style={{
            top: mid - SIZE / 2, width: SIZE, height: SIZE,
            ...(calm ? side(shown.rect, shown.way, 8) : side(shown.rect, shown.way, 0)),
            transform: calm ? undefined : `translateX(${shown.way === -1 ? slid : -slid}px) scale(${shown.armed ? 1.06 : 1})`,
            opacity: calm ? Math.min(1, shown.pull / LINE) : 1,
            transition: `transform 120ms cubic-bezier(${EASE.join(',')})`
          }}>
          <Arrow className="size-6" strokeWidth={shown.armed ? 2.6 : 2} />
        </div>
      )}
      <AnimatePresence>
        {list && (
          <motion.div key="swipe-list" data-swipe-list role="listbox" aria-label={list.way === -1 ? 'Back to' : 'Forward to'}
            initial={calm ? { opacity: 0 } : { opacity: 0, scale: 0.4 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.12 } }}
            transition={calm ? { duration: 0.15 } : { type: 'spring', duration: 0.32, bounce: 0.18 }}
            className="fixed z-50 flex w-64 flex-col gap-0.5 rounded-xl border bg-popover p-1.5 text-popover-foreground shadow-(--mf-panel-shadow)"
            style={{ top: Math.max(8, mid - 24), ...(list.way === -1 ? { left: list.rect.left + 8 } : { left: list.rect.right - 8 - 256 }), transformOrigin: list.way === -1 ? 'left center' : 'right center' }}>
            {list.rows.map((row, n) => {
              const Icon = row.name.icon
              return (
                <button key={row.index} type="button" role="option" aria-selected={n === list.pick} data-swipe-row={row.index}
                  onPointerEnter={() => n !== list.pick && setList({ ...list, pick: n })}
                  onClick={() => (setList(null), go(list.key, row.index))}
                  className={`flex h-9 cursor-pointer items-center gap-2.5 rounded-lg px-2.5 text-left text-sm ${n === list.pick ? 'bg-accent text-accent-foreground' : ''}`}>
                  <Icon className="size-4 shrink-0" style={{ color: row.name.tint }} />
                  <span className="truncate">{row.name.title}</span>
                </button>
              )
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
