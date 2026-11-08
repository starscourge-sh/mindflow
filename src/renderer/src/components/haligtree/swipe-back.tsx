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

/** The places along a trail from where you are, the nearest first: each once, named for what was on show there. */
export function placesFrom(trail: Trail, way: -1 | 1, nameOf: Props['nameOf']): List['rows'] {
  const seen = new Set([nameOf(trail.views[trail.at] as never).title])
  const rows: List['rows'] = []
  for (let index = trail.at + way; index >= 0 && index < trail.views.length && rows.length < 9; index += way) {
    const name = nameOf(trail.views[index] as never)
    if (seen.has(name.title)) continue
    seen.add(name.title)
    rows.push({ index, name })
  }
  return rows
}

const LINE = 110 // px of fingers to the tap
const SIZE = 56
const HOLD = 450 // ms resting past the tap before the list opens
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
    // With natural scrolling (the Mac's default) the wheel's deltas run against the fingers. Read again as each swipe starts.
    let natural = true
    const readNatural = (): void => void window.api.naturalScrolling?.().then((on) => (natural = on))
    readNatural()
    const fingersX = (event: WheelEvent): number => (natural ? -event.deltaX : event.deltaX)
    const fingersY = (event: WheelEvent): number => (natural ? -event.deltaY : event.deltaY)
    // Every swipe's steps and the reason it ended, the last 300, for the probe (qa/swipe-back.mjs) and for a report.
    const log = ((window as { __swipeLog?: unknown[] }).__swipeLog ??= []) as unknown[]
    const note = (entry: Record<string, unknown>): void => void (log.push({ t: Math.round(performance.now()), ...entry }) > 300 && log.shift())
    // The Mac says when the fingers touch and lift (main, from native/glass.mm). Once it has spoken, that is all that
    // ends a swipe: resting still never does. Without it (another system), the trackpad's glide and a quiet stand in.
    let phases = false
    const draw = (): void => setShown(g ? { way: g.way, rect: g.rect, pull: g.pull, armed: g.armed } : null)
    const end = (why: string): void => {
      note({ end: why, pull: g ? Math.round(g.pull) : null, armed: g?.armed ?? null })
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
      if (!trail) return end('list: no trail')
      const rows = placesFrom(trail, g.way, props.current.nameOf)
      if (!rows.length) return end('list: nowhere to go')
      setList({ key: g.key, way: g.way, rect: g.rect, rows, pick: 0, moved: false })
      chime('slide')
      note({ end: 'list opened', pull: Math.round(g.pull) })
      dy = 0
      g = null
      draw()
    }
    const lifted = (why: string): void => {
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
      end(armed ? `go: ${why}` : `cancel: ${why} short of the tap`)
      // To the nearest place that looks different from this one: a step that only changed a tab's scroll is not a place.
      const to = trail && placesFrom(trail, way, props.current.nameOf)[0]
      if (armed && to) goBy(key, to.index)
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
      // Fingers to the right: Back.
      const way: -1 | 1 = fingersX(event) > 0 ? -1 : 1
      if (!trail || !placesFrom(trail, way, props.current.nameOf).length) return null
      // The page's card, not the pane around it (which takes in the gap beside it): the arrow and the list sit inside the page.
      const rect = (paneEl?.querySelector('[data-pane-card]') ?? paneEl ?? document.querySelector('[data-pane]') ?? document.body).getBoundingClientRect()
      return { key, way, pull: 0, armed: false, steps: [], rect }
    }
    const onWheel = (event: WheelEvent): void => {
      const now = performance.now()
      const fresh = now - last > 220
      last = now
      const open = listRef.current
      if (open) {
        // The list has the fingers while it is up: the page under it never scrolls.
        event.preventDefault()
        // Two fingers up and down move the pick, a light tap a row.
        if (spent && !fresh) return
        spent = false
        // Fingers down, the pick goes down.
        dy += fingersY(event)
        // A row for about every 24px the fingers travel.
        const by = Math.trunc(dy / 24)
        if (!by) return
        dy -= by * 24
        const pick = Math.max(0, Math.min(open.rows.length - 1, open.pick + Math.sign(by)))
        if (pick !== open.pick) (detent(), setList({ ...open, pick, moved: true }))
        return
      }
      if (fresh) (spent = false, (ignored = false), readNatural())
      if (spent || ignored) return
      if (!g) {
        // Whether the page used the wheel is not asked: smooth scrolling (Lenis) takes every wheel with any up or down in it,
        // and a sideways swipe nearly always has a little. What turns sideways itself says so with data-swipe-own.
        const why = event.ctrlKey || event.metaKey ? 'a key held' : !event.deltaX || Math.abs(event.deltaX) < Math.abs(event.deltaY) * 1.5 ? 'not sideways' : null
        if (why) return void ((ignored = !fresh || Math.abs(event.deltaY) > 2), note({ skip: why, dx: event.deltaX, dy: event.deltaY }))
        g = startable(event)
        if (!g) return void ((ignored = true), note({ skip: 'a scroller, the Map or nowhere to go', dx: event.deltaX }))
      }
      event.preventDefault()
      const fingers = fingersX(event) * -g.way // toward the middle of the page from the edge it came from
      g.pull = Math.max(0, g.pull + fingers)
      g.steps.push(Math.abs(event.deltaX))
      note({ dx: event.deltaX, dy: event.deltaY, pull: Math.round(g.pull), armed: g.armed })
      // Past the tap it stays armed unless the fingers clearly come back toward the edge.
      if (!g.armed && g.pull >= LINE) (g.armed = true, edge())
      else if (g.armed && g.pull < LINE * 0.5) g.armed = false
      draw()
      // Without the Mac's word: the trackpad's glide past the tap: four steps in a row, each shorter than the one before. The fingers are off.
      // Short of the tap a slowing is never an end (fingers slow mid-swipe too): the glide may yet carry it past.
      const tail = g.steps.slice(-4)
      if (!phases && g.armed && g.steps.length > 6 && tail.length === 4 && tail.every((one, n) => !n || one < tail[n - 1] * 0.97)) return lifted('glide')
      clearTimeout(hold)
      clearTimeout(rest)
      // Resting past the tap: the list. Resting short of it stays (only lifting ends it), unless no word of lifting comes.
      if (g.armed) hold = window.setTimeout(openList, HOLD)
      else if (!phases) rest = window.setTimeout(() => g && !g.armed && end('cancel: quiet short of the tap'), 700)
    }
    const onPhase = (kind: string): void => {
      phases = true
      note({ phase: kind })
      if (kind === 'ended') lifted('lift')
    }
    // A probe sends the same words the Mac would (qa/swipe-back.mjs).
    const onProbe = (event: Event): void => onPhase(String((event as CustomEvent).detail))
    window.addEventListener('wheel', onWheel, { passive: false })
    // While the list is up it hears the fingers before anything on the page (the page's smooth scroll included).
    const onListWheel = (event: WheelEvent): void => void (listRef.current && (event.stopPropagation(), onWheel(event)))
    window.addEventListener('wheel', onListWheel, { passive: false, capture: true })
    window.addEventListener('haligtree:swipe-phase', onProbe)
    const off = window.api.onSwipePhase?.(onPhase)
    return () => {
      window.removeEventListener('wheel', onWheel)
      window.removeEventListener('wheel', onListWheel, { capture: true })
      window.removeEventListener('haligtree:swipe-phase', onProbe)
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
            // Where the swipe was: grown out of the round arrow at the pane's edge, on the side it came from, at the
            // pane's middle, always inside the window; a long list rises to fit. Not from the arrows up in the tab
            // row: the hand is at the edge, and the list belongs under it.
            style={{
              top: Math.max(8, Math.min(mid - 24, window.innerHeight - 8 - 14 - list.rows.length * 38)),
              // Forward is held by its right side, so a list wider than its 16rem (a long name) still ends at the edge.
              ...(list.way === -1 ? { left: Math.max(8, list.rect.left + 8) } : { right: Math.max(8, window.innerWidth - Math.min(list.rect.right, window.innerWidth) + 8) }),
              transformOrigin: list.way === -1 ? 'left center' : 'right center'
            }}>
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
