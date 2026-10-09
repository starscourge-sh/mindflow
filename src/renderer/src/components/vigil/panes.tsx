import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react'
import { AnimatePresence, motion } from 'motion/react'

import '@/assets/split.css'
import { shift, spring } from '@/lib/motion'
import { chime } from '@/lib/sound'
import { PaneContext, PaneWidthContext, type PaneWidth } from '@/lib/split'
import XIcon from '@/components/ui/x-icon'
import { AliveIcon } from './alive-icon'
import { Tip } from './ui'

/** What the main window needs of a pane to keep Back exact: how its page is scrolled, and where to put it back. */
export type PaneApi = { scrolled: () => [string, number][]; restore: (scroll: [string, number][] | null) => void }
export type PaneShown = { key: string; label: string; at: number; width?: PaneWidth; node: ReactNode }

// Whether the last thing pressed was Tab: only then does focus arriving in a
// pane bring it to the front. A menu closing hands the focus back to the row
// it opened from, and that must never pull the wrong pane forward.
let tabbed = false
addEventListener('keydown', (event) => void (tabbed = event.key === 'Tab'), true)
addEventListener('pointerdown', () => void (tabbed = false), true)

/** Narrower than this, a pane would only show a sliver of its page: they take turns instead. */
const MIN = 300
/** The gap between panes, which is also where a divider is held. */
const GAP = 8

/** A box's place in the page, as the child index at each level down. */
const pathTo = (root: Element, node: Element): string => {
  const steps: number[] = []
  for (let at: Element | null = node; at && at !== root; at = at.parentElement) steps.unshift(at.parentElement ? [...at.parentElement.children].indexOf(at) : 0)
  return steps.join('.')
}
const atPath = (root: Element, path: string): Element | null =>
  path.split('.').reduce<Element | null>((at, index) => at?.children[Number(index)] ?? null, root)

/**
 * The main window's page, split into up to three panes side by side. Each is
 * a card like the page always was, with its own Back and Forward; the one in
 * front has a calm line along its top and the others dim a touch. Dividers
 * between them drag to resize, and a double-click shares the room equally
 * again. In a window too narrow for them all, they take turns in one place,
 * with a small switcher over them: every pane kept as it was, one shown.
 */
export function SplitPanes({ panes, front, sizes, onSizes, onFront, onClose, onWidth, apis }: {
  panes: PaneShown[]
  front: string
  sizes: number[]
  onSizes: (sizes: number[]) => void
  onFront: (key: string) => void
  onClose: (key: string) => void
  onWidth: (key: string, width: PaneWidth) => void
  apis: RefObject<Map<string, PaneApi>>
}): React.JSX.Element {
  const box = useRef<HTMLDivElement>(null)
  const [room, setRoom] = useState(0)
  useLayoutEffect(() => {
    const el = box.current
    if (!el) return
    const watch = new ResizeObserver(() => setRoom(el.clientWidth))
    watch.observe(el)
    setRoom(el.clientWidth)
    return () => watch.disconnect()
  }, [])
  const split = panes.length > 1
  const turns = split && room > 0 && room - GAP * (panes.length - 1) < MIN * panes.length
  // Held while a divider is dragged, so only this draws, not every page.
  const [dragged, setDragged] = useState<number[] | null>(null)
  const shares = dragged ?? (sizes.length === panes.length ? sizes : panes.map(() => 1 / panes.length))
  const drag = (index: number) => (event: React.PointerEvent<HTMLDivElement>): void => {
    if (event.button !== 0) return
    event.preventDefault()
    const handle = event.currentTarget
    handle.setPointerCapture(event.pointerId)
    const startX = event.clientX
    const start = shares
    const width = (box.current?.clientWidth ?? 1) - GAP * (panes.length - 1)
    const least = Math.min(MIN / width, 0.45)
    let now = start
    const move = (moved: PointerEvent): void => {
      const by = (moved.clientX - startX) / width
      const pair = start[index] + start[index + 1]
      const left = Math.max(least, Math.min(pair - least, start[index] + by))
      now = start.map((one, at) => (at === index ? left : at === index + 1 ? pair - left : one))
      setDragged(now)
    }
    const up = (): void => {
      handle.removeEventListener('pointermove', move)
      handle.removeEventListener('pointerup', up)
      handle.removeEventListener('pointercancel', up)
      setDragged(null)
      if (now !== start) onSizes(now)
    }
    handle.addEventListener('pointermove', move)
    handle.addEventListener('pointerup', up)
    handle.addEventListener('pointercancel', up)
  }
  const even = (): void => {
    chime('tap')
    onSizes(panes.map(() => 1 / panes.length))
  }
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2">
      {turns && (
        // Taking turns: which pane is shown, and a way to the others, in one quiet row.
        <div role="tablist" aria-label="Panes" className="flex shrink-0 items-center gap-1 overflow-x-auto [scrollbar-width:none]">
          {panes.map((pane, index) => (
            <span key={pane.key} className={`flex h-7 min-w-0 shrink items-center rounded-full border text-control transition-colors ${pane.key === front ? 'bg-accent text-foreground' : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground'}`}>
              <Tip label={index ? `Pane ${index + 1}  ⌃L` : 'Pane 1  ⌃H'}>
                <button type="button" role="tab" aria-selected={pane.key === front} onClick={() => (pane.key !== front && chime('tap'), onFront(pane.key))}
                  className="min-w-0 truncate py-0.5 pr-1 pl-3 text-left">
                  {pane.label}
                </button>
              </Tip>
              <Tip label="Close this pane  ⌃W">
                <button type="button" onClick={() => onClose(pane.key)} className="mr-1 flex size-5 shrink-0 items-center justify-center rounded-full hover:bg-accent [&_svg]:size-3">
                  <AliveIcon icon={XIcon} size={12} />
                </button>
              </Tip>
            </span>
          ))}
        </div>
      )}
      <div ref={box} className="relative flex min-h-0 min-w-0 flex-1">
        <AnimatePresence initial={false}>
          {panes.map((pane, index) => (
            <PaneFrame key={pane.key} pane={pane} apis={apis} split={split} front={pane.key === front} hidden={turns && pane.key !== front}
              share={turns ? 1 : shares[index]} onFront={onFront} onWidth={onWidth} divider={!turns && index > 0 ? (
                <div role="separator" data-pane-divider aria-orientation="vertical" aria-label="Drag to resize, double-click to share equally"
                  onPointerDown={drag(index - 1)} onDoubleClick={even}
                  className="group/divider relative -mr-px w-2 shrink-0 cursor-col-resize touch-none" style={{ width: GAP }}>
                  <span className="absolute inset-y-4 left-1/2 w-[3px] -translate-x-1/2 rounded-full bg-foreground/0 transition-colors duration-150 group-hover/divider:bg-foreground/15 group-active/divider:bg-foreground/25" />
                </div>
              ) : null} />
          ))}
        </AnimatePresence>
      </div>
    </div>
  )
}

/**
 * One pane: the page card, which keeps how its page was scrolled for Back,
 * and comes to the front when pointed at, or tabbed into.
 */
function PaneFrame({ pane, apis, split, front, hidden, share, divider, onFront, onWidth }: {
  pane: PaneShown
  apis: RefObject<Map<string, PaneApi>>
  split: boolean
  front: boolean
  hidden: boolean
  share: number
  divider: ReactNode
  onFront: (key: string) => void
  onWidth: (key: string, width: PaneWidth) => void
}): React.JSX.Element {
  const pageRef = useRef<HTMLDivElement>(null)
  // Each box as last scrolled, since a page that has just opened another
  // note has already reset the box it showed in. Read once, then let go.
  // Kept by place, so a box swapped for the next note's still counts.
  const seen = useRef(new Map<string, number>())
  useEffect(() => {
    const root = pageRef.current
    const onScroll = (event: Event): void => void (root && event.target instanceof Element && seen.current.set(pathTo(root, event.target), event.target.scrollTop))
    root?.addEventListener('scroll', onScroll, true)
    return () => root?.removeEventListener('scroll', onScroll, true)
  }, [])
  const restore = useRef<[string, number][] | null>(null)
  apis.current.set(pane.key, {
    scrolled: () => {
      const root = pageRef.current
      if (!root) return []
      const tops = new Map([...root.querySelectorAll('*')].filter((one) => one.scrollTop > 0).map((one) => [pathTo(root, one), one.scrollTop]))
      for (const [path, top] of seen.current) tops.set(path, top)
      seen.current.clear()
      return [...tops].filter(([, top]) => top > 0)
    },
    restore: (scroll) => void (restore.current = scroll)
  })
  useEffect(() => () => void apis.current.delete(pane.key), []) // eslint-disable-line react-hooks/exhaustive-deps
  // Put back where the page was scrolled, frame by frame while it loads.
  useEffect(() => {
    const want = restore.current
    restore.current = null
    const root = pageRef.current
    if (!want?.length || !root) return
    let frame = 0
    let tries = 0
    const put = (): void => {
      let left = false
      for (const [path, top] of want) {
        const box = atPath(root, path)
        if (box && Math.abs(box.scrollTop - top) > 2) box.scrollTop = top
        if (!box || Math.abs(box.scrollTop - top) > 2) left = true
      }
      if (left && ++tries < 90) frame = requestAnimationFrame(put)
    }
    put()
    return () => cancelAnimationFrame(frame)
  }, [pane.at])
  const width = useMemo(() => ({ width: pane.width, set: (next: PaneWidth) => onWidth(pane.key, next) }), [pane.width, pane.key, onWidth])
  return (
    <>
      {divider}
      <motion.div
        // A new pane comes in from the right, on a spring; Motion off or Reduce motion, it is simply there.
        initial={{ opacity: 0, transform: shift('translateX(28px)') }}
        animate={{ opacity: 1, transform: shift('translateX(0px)') }}
        transition={spring.slow}
        data-pane={pane.key}
        data-pane-front={split && front ? '' : undefined}
        data-width={split && pane.width ? (pane.width === 'narrow' ? 'page' : pane.width) : undefined}
        onPointerDownCapture={() => !front && onFront(pane.key)}
        onFocusCapture={() => tabbed && !front && onFront(pane.key)}
        className={`relative min-h-0 min-w-0 ${hidden ? 'hidden' : 'flex'}`}
        style={{ flexGrow: share, flexBasis: 0 }}
      >
        <div ref={pageRef} className={`@container/page relative flex min-h-0 min-w-0 flex-1 overflow-hidden rounded-xl border transition-opacity duration-150 ${split && !front ? 'opacity-[0.86]' : ''}`}>
          {/* The pane with the keys: a calm line along its top edge. */}
          {split && (
            <span aria-hidden className={`pointer-events-none absolute inset-x-0 top-0 z-40 h-[2px] bg-[color-mix(in_srgb,var(--tt-brand-color-400)_65%,transparent)] transition-opacity duration-150 ${front ? 'opacity-100' : 'opacity-0'}`} />
          )}
          <PaneContext.Provider value={pane.key}>
            <PaneWidthContext.Provider value={split ? width : null}>{pane.node}</PaneWidthContext.Provider>
          </PaneContext.Provider>
        </div>
      </motion.div>
    </>
  )
}
