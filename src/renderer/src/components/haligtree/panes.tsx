import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react'
import { AnimatePresence, motion, useIsPresent } from 'motion/react'

import '@/assets/split.css'
import { byKeys, EASE, growFrom, still } from '@/lib/motion'
import { takeLanding } from './split-drop'
import { chime } from '@/lib/sound'
import { PANE_GAP, PANE_MIN, PaneContext, PaneWidthContext, panesFit, type PaneWidth } from '@/lib/split'
import { jumpTo } from './ui'
import { placedHere } from '@/lib/note-place'
import { TabRow, type TabActions, type TabGroup, type TabShown } from './tab-row'
import type { Scrolled } from '@/lib/nav'

/** What the main window needs of a pane to keep Back exact: how its page is scrolled. */
export type PaneApi = { scrolled: () => Scrolled }
/** A pane as drawn: its tabs, the one open, and that tab's page. `at` names the step on show: when it changes, the page's scroll is put back. */
type PaneShown = { key: string; tabs: TabShown[]; active: string; at: string; scroll?: Scrolled; width?: PaneWidth; node: ReactNode }

// A list's rows, each named by its id; one inside another is a part of its row, not a row.
const ROWS = '[data-id]:not([data-id] [data-id])'
/** The row at a box's top edge (the first whose bottom is below it) and how far below the edge it starts. Rows run down the page in order, so halved, not walked: a long list reads a dozen rows, never all. */
const rowAtTop = (box: Element): [string, number] | null => {
  const rows = box.querySelectorAll(ROWS)
  const edge = box.getBoundingClientRect().top
  let low = 0
  let high = rows.length
  while (low < high) {
    const mid = (low + high) >> 1
    if (rows[mid].getBoundingClientRect().bottom > edge + 1) high = mid
    else low = mid + 1
  }
  const row = rows[low]
  const id = row?.getAttribute('data-id')
  return row && id ? [id, Math.round(row.getBoundingClientRect().top - edge)] : null
}
/** A box put back where it was: its row at the same distance under its top edge, or, the row not drawn (yet), the same scroll. */
const putBack = (box: HTMLElement, top: number, row?: string, at?: number): void => {
  const there = row !== undefined ? box.querySelector(`[data-id="${CSS.escape(row)}"]`) : null
  const want = there ? box.scrollTop + there.getBoundingClientRect().top - box.getBoundingClientRect().top - (at ?? 0) : top
  if (Math.abs(box.scrollTop - want) > 1) jumpTo(box, want)
}

// Whether the last thing pressed was Tab: only then does focus arriving in a
// pane bring it to the front. A menu closing hands the focus back to the row
// it opened from, and that must never pull the wrong pane forward.
let tabbed = false
addEventListener('keydown', (event) => void (tabbed = event.key === 'Tab'), true)
addEventListener('pointerdown', () => void (tabbed = false), true)

const MIN = PANE_MIN
const GAP = PANE_GAP

/** A box's place in the page, as the child index at each level down. */
// The old page held over the new one while it loads (data-page-held) is not counted: it put the new page one place
// on, and Back scrolled the held page instead, so Home showed at its top and jumped a moment later.
const kids = (at: Element): Element[] => [...at.children].filter((one) => !one.hasAttribute('data-page-held'))
const pathTo = (root: Element, node: Element): string => {
  const steps: number[] = []
  for (let at: Element | null = node; at && at !== root; at = at.parentElement) steps.unshift(at.parentElement ? kids(at.parentElement).indexOf(at) : 0)
  return steps.join('.')
}
const atPath = (root: Element, path: string): Element | null =>
  path.split('.').reduce<Element | null>((at, index) => (at ? kids(at)[Number(index)] ?? null : null), root)

/**
 * The main window's page, split into panes side by side. Each is a card like
 * the page always was, under its own row of tabs; the one in front is raised
 * and the others dim a touch. Dividers between them drag to resize, and a
 * double-click shares the room equally again. In a window too narrow for two,
 * only the pane in front is on show, with every pane's tabs in its row: choosing
 * a tab of another brings that pane forward, nothing closed, nothing lost.
 */
export function SplitPanes({ panes, front, sizes, onSizes, onFront, onWidth, apis, actions }: {
  panes: PaneShown[]
  front: string
  sizes: number[]
  onSizes: (sizes: number[]) => void
  onFront: (key: string) => void
  onWidth: (key: string, width: PaneWidth) => void
  apis: RefObject<Map<string, PaneApi>>
  actions: TabActions
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
  // Too narrow for even two: one on show, carrying every pane's tabs. Room for two but
  // not for all: each keeps its least width and the row scrolls sideways, so
  // no pane is ever dropped for want of room (an ultrawide holds them all).
  const turns = split && !panesFit(2, room)
  const scrolls = split && !turns && !panesFit(panes.length, room)
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
    // Each page keeps its width while the divider moves and is laid out once,
    // when it is let go (as Trellis does): before, a long note or a PDF
    // rewrapped every line on every frame of the drag. The card clips or
    // shows its own paper meanwhile.
    const held = [...(box.current?.querySelectorAll<HTMLElement>('[data-pane-card] > *') ?? [])].filter((one) => !/^(absolute|fixed)$/.test(getComputedStyle(one).position))
    held.forEach((one) => Object.assign(one.style, { width: `${one.offsetWidth}px`, flex: 'none' }))
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
      held.forEach((one) => Object.assign(one.style, { width: '', flex: '' }))
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
  const groupOf = (pane: PaneShown): TabGroup => ({ pane: pane.key, tabs: pane.tabs, active: pane.active, front: pane.key === front })
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div ref={box} data-split-area data-split-scrolls={scrolls ? '' : undefined} className={`relative flex min-h-0 min-w-0 flex-1 ${scrolls ? 'overflow-x-auto overscroll-x-contain' : ''}`}>
        <AnimatePresence initial={false}>
          {panes.map((pane, index) => (
            <PaneFrame key={pane.key} pane={pane} apis={apis} split={split} front={pane.key === front} hidden={turns && pane.key !== front}
              least={scrolls} groups={turns && pane.key === front ? panes.map(groupOf) : [groupOf(pane)]} actions={actions} edge={turns ? 0 : index === 0 ? -1 : index === panes.length - 1 ? 1 : 0}
              share={turns ? 1 : shares[index]} held={!!dragged || turns} onFront={onFront} onWidth={onWidth} divider={!turns && index > 0 ? (
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
function PaneFrame({ pane, apis, split, front, hidden, least, groups, actions, share, edge, divider, onFront, onWidth }: {
  pane: PaneShown
  apis: RefObject<Map<string, PaneApi>>
  split: boolean
  front: boolean
  hidden: boolean
  /** The row scrolls sideways: this pane keeps its least width rather than being squeezed. */
  least?: boolean
  /** The tabs its row carries: its own, or every pane's while only one is on show. */
  groups: TabGroup[]
  actions: TabActions
  share: number
  /** A divider is in the hand, or only one pane is on show. Every share now follows at once, so this no longer changes anything. */
  held: boolean
  /** Which edge the pane sits at, -1 left, 1 right, 0 between, for it to leave toward. */
  edge: -1 | 0 | 1
  divider: ReactNode
  onFront: (key: string) => void
  onWidth: (key: string, width: PaneWidth) => void
}): React.JSX.Element {
  const pageRef = useRef<HTMLDivElement>(null)
  // Each box as last scrolled, since a page that has just opened another
  // note has already reset the box it showed in. Read once, then let go.
  // Kept by place, so a box swapped for the next note's still counts.
  // With the box it was heard from, to tell a box still there from one swapped for the next note's.
  // The row at its top too, read as it scrolls (the page is laid out then), never as it is left.
  type Heard = { top: number; row?: [string, number] }
  const seen = useRef(new Map<string, { box: Element } & Heard>())
  // Heard since the last step was read: only these stand in for a box since swapped.
  const heard = useRef(new Map<string, Heard>())
  useEffect(() => {
    const root = pageRef.current
    const onScroll = (event: Event): void => {
      if (!root || !(event.target instanceof Element)) return
      // A note's own scroller is not kept here: its place is a block, kept and put back by lib/note-place.ts alone.
      // (Kept here too, by distance, Back to a long note was put back twice over, and every scroll event of a
      // note paid for the walk up the page that finds its box's path.)
      if (placedHere(event.target)) return
      const path = pathTo(root, event.target)
      const now: Heard = { top: event.target.scrollTop, row: rowAtTop(event.target) ?? undefined }
      seen.current.set(path, { box: event.target, ...now })
      heard.current.set(path, now)
    }
    root?.addEventListener('scroll', onScroll, true)
    return () => root?.removeEventListener('scroll', onScroll, true)
  }, [])
  const landing = useRef<Scrolled | null>(null)
  const api: PaneApi = {
    scrolled: () => {
      const root = pageRef.current
      if (!root) return []
      // Only what has scrolled since the pane was made (every scroll is heard
      // above), as last heard: the page is never read here. Asked as a note
      // opens, reading a box's scrollTop made the browser lay out the whole
      // new note early, 20 to 28ms before its words could show.
      const tops: Scrolled = []
      for (const [path, last] of seen.current) {
        // A box swapped for the next note's: the last one heard since the last step is where it was, or nothing.
        const was = atPath(root, path) === last.box ? last : heard.current.get(path)
        if (was && was.top > 0) tops.push(was.row ? [path, was.top, ...was.row] : [path, was.top])
        else seen.current.delete(path)
      }
      heard.current.clear()
      // Left while still held where it was put back (nothing pressed since): where it was put, its row and all.
      const going = landing.current ?? []
      return [...tops.filter(([path]) => !going.some(([one]) => one === path)), ...going]
    }
  }
  apis.current.set(pane.key, api)
  // Set again whenever it starts, not only while drawing: React's development
  // checks stop and start every effect, and a pane only taken off would have
  // no way to keep its scroll until it next drew.
  useEffect(() => {
    apis.current.set(pane.key, api)
    return () => void apis.current.delete(pane.key)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  // Put back where the page was scrolled: each box by the row at its top. Held there, not by frames or a
  // timer but as the page changes (rows drawn, anything above growing or shrinking: a fold, "Show more", a
  // list filling late, the window resized), until you scroll or press something yourself, or the step changes.
  useLayoutEffect(() => {
    const want = pane.scroll
    const root = pageRef.current
    if (!want?.length || !root) return
    const place = (): void => {
      for (const [path, top, row, at] of want) {
        const box = atPath(root, path)
        // A note's own scroller (a step kept before it was left alone, or another box's path now leading to it): not this one's to move.
        if (box instanceof HTMLElement && !placedHere(box)) putBack(box, top, row, at)
      }
    }
    const grows = new ResizeObserver(place)
    const watched = new Set<Element>()
    // Each box held and what it holds: its size changing is the page growing or shrinking around the row.
    const watch = (): void => {
      for (const [path] of want) {
        const box = atPath(root, path)
        for (const one of box ? [box, ...box.children] : []) if (!watched.has(one)) (watched.add(one), grows.observe(one))
      }
    }
    const changed = new MutationObserver(() => (watch(), place()))
    const letGo = (): void => {
      landing.current = null
      grows.disconnect()
      changed.disconnect()
    }
    landing.current = want
    watch()
    place()
    changed.observe(root, { childList: true, subtree: true })
    root.addEventListener('wheel', letGo, { passive: true, capture: true })
    root.addEventListener('pointerdown', letGo, true)
    window.addEventListener('keydown', letGo, true)
    // A list bringing its open row into view (the note Back returned to) wins over where the page was.
    window.addEventListener('haligtree:row-shown', letGo)
    return () => {
      letGo()
      root.removeEventListener('wheel', letGo, true)
      root.removeEventListener('pointerdown', letGo, true)
      window.removeEventListener('keydown', letGo, true)
      window.removeEventListener('haligtree:row-shown', letGo)
    }
  }, [pane.at])
  const width = useMemo(() => ({ width: pane.width, set: (next: PaneWidth) => onWidth(pane.key, next) }), [pane.width, pane.key, onWidth])
  // Closing, the pane simply goes and the panes beside it take the room at
  // once: a width eased frame by frame rewrapped every line on the way.
  const present = useIsPresent()
  const cardWidth = useRef(0)
  useLayoutEffect(() => {
    const el = pageRef.current
    if (!el) return
    const watch = new ResizeObserver(() => present && (cardWidth.current = el.offsetWidth))
    // The watch tells of its first size once the pane is laid out: read at once, it laid out the pane still mounting.
    watch.observe(el)
    return () => watch.disconnect()
  }, [present])
  // A pane opened by dropping a note beside the page grows out of the card
  // that was carried, from where it was let go: you see where it went.
  // A frame on: the pane opens at no width and takes its share after its first frame (unseen, at no opacity).
  useLayoutEffect(() => {
    const from = takeLanding()
    const page = pageRef.current
    if (!from || !page) return
    // Unseen until it starts from the card, or its first frame showed it whole, then small.
    page.style.opacity = '0'
    const id = requestAnimationFrame(() => {
      page.style.opacity = ''
      growFrom(page, from)
    })
    return () => {
      cancelAnimationFrame(id)
      page.style.opacity = ''
    }
  }, [])
  const kept = present || !cardWidth.current ? undefined : { width: cardWidth.current, minWidth: cardWidth.current }
  return (
    <>
      {divider && (
        // The gap before a pane closes with it, so its neighbour slides over rather than jumping 8px at the end.
        <motion.div className="flex shrink-0 overflow-hidden" initial={false} exit={{ width: 0, opacity: 0, transition: { duration: 0 } }} style={{ width: GAP }}>{divider}</motion.div>
      )}
      <motion.div
        // Widths change at once, never frame by frame (that rewrapped every
        // pane's words as it went): a new pane only fades in where it lands,
        // and one closed simply goes. By a key, with Motion off or with Reduce
        // motion, the new one is simply there too.
        initial={byKeys() || still() ? false : { opacity: 0, flexGrow: 0 }}
        animate={{ opacity: 1, flexGrow: share }}
        exit={{ opacity: 0, flexGrow: 0, transition: { duration: 0 } }}
        transition={{ default: { duration: 0.16, ease: EASE }, flexGrow: { duration: 0 } }}
        data-pane={pane.key}
        data-pane-front={split && front ? '' : undefined}
        data-pane-back={split && !front ? '' : undefined}
        data-width={split && pane.width ? (pane.width === 'narrow' ? 'page' : pane.width) : undefined}
        onPointerDownCapture={() => !front && onFront(pane.key)}
        onFocusCapture={() => tabbed && !front && onFront(pane.key)}
        className={`relative min-h-0 min-w-0 flex-col ${hidden ? 'hidden' : 'flex'} ${present ? '' : `pointer-events-none overflow-hidden ${edge > 0 ? 'items-end' : edge < 0 ? 'items-start' : 'items-center'}`}`}
        // The page's own background, for the pane in front to be raised from.
        style={{ flexBasis: 0, minWidth: least ? MIN : undefined, '--mf-under': 'var(--background)' } as React.CSSProperties}
      >
        {/* Split, the pane with the keys reads as the surface in front, the way Dia
            shows it: a firmer hairline and a soft shadow, its words at full
            strength. The others step back: a fainter hairline, no shadow, their
            header lines muted and the page a touch dimmer. Nothing coloured.
            On its own, the page is the card it always was. */}
        <TabRow pane={pane.key} groups={groups} actions={actions} />
        <div ref={pageRef} data-pane-card
          style={kept}
          className={`@container/page relative flex min-h-0 min-w-0 flex-1 overflow-hidden rounded-xl border transition-[opacity,border-color,box-shadow] duration-150 ${
          !split ? '' : front
            // In a dark theme (every theme carries .dark; light ones add data-light) a shadow barely reads, so the key pane's surface is raised a step, as macOS lifts its key window.
            ? 'border-foreground/12 bg-background shadow-[0_1px_2px_color-mix(in_oklab,var(--mf-shadow-ink)_5%,transparent),0_6px_18px_-6px_color-mix(in_oklab,var(--mf-shadow-ink)_12%,transparent)] [:root:not([data-light])_&]:[--background:color-mix(in_srgb,var(--mf-under)_94%,white)]'
            : 'border-foreground/6 opacity-[0.94] [:root:not([data-light])_&]:opacity-[0.85] [&_header]:text-muted-foreground'}`}>
          <PaneContext.Provider value={pane.key}>
            <PaneWidthContext.Provider value={split ? width : null}>{pane.node}</PaneWidthContext.Provider>
          </PaneContext.Provider>
        </div>
      </motion.div>
      {/* The leftmost pane leaving takes the gap after it along, as the pane now first lets its own go. */}
      {!present && edge < 0 && <motion.div aria-hidden className="shrink-0" initial={{ width: GAP }} animate={{ width: 0 }} transition={{ duration: 0 }} />}
    </>
  )
}
