import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react'
import { AnimatePresence, motion } from 'motion/react'

import '@/assets/split.css'
import { shift, spring } from '@/lib/motion'
import { chime } from '@/lib/sound'
import { PANE_GAP, PANE_MIN, PaneContext, PaneWidthContext, panesFit, type PaneWidth } from '@/lib/split'
import XIcon from '@/components/ui/x-icon'
import { AliveIcon } from './alive-icon'
import { Tip } from './ui'
import { RowMenu, type RowItem } from './row-menu'

/** What the main window needs of a pane to keep Back exact: how its page is scrolled, and where to put it back. */
export type PaneApi = { scrolled: () => [string, number][]; restore: (scroll: [string, number][] | null) => void }
/** A pane as drawn: `label` is what it shows, its open note's name, or its page's when no note is open. */
export type PaneShown = { key: string; label: string; private?: boolean; at: number; width?: PaneWidth; node: ReactNode }

// Whether the last thing pressed was Tab: only then does focus arriving in a
// pane bring it to the front. A menu closing hands the focus back to the row
// it opened from, and that must never pull the wrong pane forward.
let tabbed = false
addEventListener('keydown', (event) => void (tabbed = event.key === 'Tab'), true)
addEventListener('pointerdown', () => void (tabbed = false), true)

const MIN = PANE_MIN
const GAP = PANE_GAP

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
export function SplitPanes({ panes, front, sizes, onSizes, onFront, onClose, onWidth, apis, menuFor }: {
  panes: PaneShown[]
  front: string
  sizes: number[]
  onSizes: (sizes: number[]) => void
  onFront: (key: string) => void
  onClose: (key: string) => void
  onWidth: (key: string, width: PaneWidth) => void
  apis: RefObject<Map<string, PaneApi>>
  /** The split's own menu, for a right click on a pane's tab. */
  menuFor?: (key: string) => RowItem[]
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
  const turns = split && !panesFit(panes.length, room)
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
            <RowMenu key={pane.key} items={menuFor?.(pane.key) ?? []}>
            <span data-pane-tab={pane.key} className={`flex h-7 max-w-56 min-w-0 shrink items-center rounded-full border text-control transition-colors ${pane.key === front ? 'bg-accent text-foreground' : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground'}`}>
              <Tip label={index ? `Pane ${index + 1}  ⌃L` : 'Pane 1  ⌃H'}>
                <button type="button" role="tab" aria-selected={pane.key === front} onClick={() => (pane.key !== front && chime('tap'), onFront(pane.key))}
                  data-private={pane.private ? '' : undefined} className="private-text min-w-0 truncate py-0.5 pr-1 pl-3 text-left">
                  {pane.label}
                </button>
              </Tip>
              <Tip label="Close this pane  ⌃W">
                <button type="button" onClick={() => onClose(pane.key)} className="mr-1 flex size-5 shrink-0 items-center justify-center rounded-full hover:bg-accent [&_svg]:size-3">
                  <AliveIcon icon={XIcon} size={12} />
                </button>
              </Tip>
            </span>
            </RowMenu>
          ))}
        </div>
      )}
      <div ref={box} data-split-area className="relative flex min-h-0 min-w-0 flex-1">
        <AnimatePresence initial={false}>
          {panes.map((pane, index) => (
            <PaneFrame key={pane.key} pane={pane} apis={apis} split={split} front={pane.key === front} hidden={turns && pane.key !== front}
              head={split && !turns} menu={menuFor?.(pane.key) ?? []} onClose={onClose}
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
function PaneFrame({ pane, apis, split, front, hidden, head, menu, onClose, share, divider, onFront, onWidth }: {
  pane: PaneShown
  apis: RefObject<Map<string, PaneApi>>
  split: boolean
  front: boolean
  hidden: boolean
  /** Side by side: a line over the pane with its name and an × that closes it. */
  head: boolean
  menu: RowItem[]
  onClose: (key: string) => void
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
        className={`relative min-h-0 min-w-0 flex-col gap-1 ${hidden ? 'hidden' : 'flex'}`}
        // The page's own background, for the pane in front to be raised from.
        style={{ flexGrow: share, flexBasis: 0, '--mf-under': 'var(--background)' } as React.CSSProperties}
      >
        {/* Split, the pane with the keys reads as the surface in front, the way Dia
            shows it: a firmer hairline and a soft shadow, its words at full
            strength. The others step back: a fainter hairline, no shadow, their
            header lines muted and the page a touch dimmer. Nothing coloured.
            On its own, the page is the card it always was. */}
        {/* Side by side, each pane says what it shows and closes from its own ×,
            for anyone who never learns ⌃W. A right click has the split's menu. */}
        {head && (
          <RowMenu items={menu}>
            <div data-pane-head className="flex h-7 shrink-0 items-center gap-1 pr-0.5 pl-3 text-control">
              <span data-private={pane.private ? '' : undefined}
                className={`private-text min-w-0 flex-1 truncate transition-colors duration-150 ${front ? 'font-medium text-foreground' : 'text-muted-foreground'}`}>
                {pane.label}
              </span>
              <Tip label="Close this pane  ⌃W">
                <button type="button" data-pane-close aria-label="Close this pane" onClick={() => onClose(pane.key)}
                  className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
                  <AliveIcon icon={XIcon} size={14} />
                </button>
              </Tip>
            </div>
          </RowMenu>
        )}
        <div ref={pageRef} data-pane-card className={`@container/page relative flex min-h-0 min-w-0 flex-1 overflow-hidden rounded-xl border transition-[opacity,border-color,box-shadow] duration-150 ${
          !split ? '' : front
            // In a dark theme (every theme carries .dark; light ones add data-light) a shadow barely reads, so the key pane's surface is raised a step, as macOS lifts its key window.
            ? 'border-foreground/12 bg-background shadow-[0_1px_2px_rgb(0_0_0/0.05),0_6px_18px_-6px_rgb(0_0_0/0.12)] [:root:not([data-light])_&]:[--background:color-mix(in_srgb,var(--mf-under)_94%,white)]'
            : 'border-foreground/6 opacity-[0.94] [:root:not([data-light])_&]:opacity-[0.85] [&_header]:text-muted-foreground'}`}>
          <PaneContext.Provider value={pane.key}>
            <PaneWidthContext.Provider value={split ? width : null}>{pane.node}</PaneWidthContext.Provider>
          </PaneContext.Provider>
        </div>
      </motion.div>
    </>
  )
}
