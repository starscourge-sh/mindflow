import { detailsShown, showDetails } from '@/lib/reading'
import { themeActions } from '@/lib/theme'
import { Fragment, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type CSSProperties } from 'react'
import { FileText, ListTodo, Minimize2, PanelsTopLeft, Wrench } from 'lucide-react'
import { alive } from '@/components/ui/alive-icon'
import RightChevronIcon from '@/components/ui/right-chevron'
import InfoCircleIcon from '@/components/ui/info-circle-icon'
import BookmarkIcon from '@/components/ui/bookmark-icon'
import CameraIcon from '@/components/ui/camera-icon'
import CameraOffIcon from '@/components/ui/camera-off-icon'
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuShortcut, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { AnimatePresence, motion } from 'motion/react'
import { EASE, byKeys, shift, spring } from './lib/motion'
import { Highlight, Unfold, useChosen, useFluidHover, Weighted } from './components/vigil/glide'
import { chime, pageTurn, paper, soundOn } from './lib/sound'
import { foldEverything } from './extensions/heading-fold'
import { NotePreview } from './components/vigil/note-preview'

import { CAPTURE_TYPES } from './components/capture-kinds/capture-kind-picker'
import { useCaptures, type CaptureMeta } from './components/capture-list'
import { Search } from './components/search'
import { CapturesView } from './components/vigil/captures-view'
import { ItemsView } from './components/vigil/items-view'
import { QuestionsView, startQuestion } from './components/vigil/questions-view'
import { GoalsView, startGoal } from './components/vigil/goals-view'
import { QueueReader, QueueView } from './components/vigil/queue-view'
import { useQueue } from './lib/reading-queue'
import { ReviewView } from './components/vigil/review-view'
import { HomeView } from './components/vigil/home-view'
import { SettingsView } from './components/vigil/settings-view'
import { StatsView } from './components/vigil/stats-view'
import { MapView } from './components/vigil/map-view'
import { PowersView } from './components/vigil/powers-view'
import { TagsView } from './components/vigil/tags-view'
import { TagIcon } from './components/vigil/tag-icon'
import { prefetchTag, usePinnedTags } from './components/vigil/tag-read'
import { TasksView } from './components/vigil/tasks-view'
import { WeekView } from './components/vigil/week-view'
import { MatrixView } from './components/vigil/matrix-view'
import { picked, placed } from './lib/tasks'
import { stickOnDesktop } from './components/vigil/sticky-note'
import { Rolling, Toaster, toast, typing, FocusNote, useFocusMode, SoundToggle } from './components/vigil/ui'
import { FocusScenery } from './components/vigil/scenery'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './components/ui/tooltip'
import { useAppearance, useLive, vigil, type Item, type Pin, type Settings, type Task } from './lib/vigil'
import { Tip, showTopTitle, useTopTitle, Pressed, useEscapeLeavesEditor } from '@/components/vigil/ui'
import { Celebrations, tryCelebration } from '@/components/vigil/celebrate'
import MagnifierIcon from '@/components/ui/magnifier-icon'
import ExpandIcon from '@/components/ui/expand-icon'
import GearIcon from '@/components/ui/gear-icon'
import DotsHorizontalIcon from '@/components/ui/dots-horizontal-icon'
import LayoutSidebarRightIcon from '@/components/ui/layout-sidebar-right-icon'
import ArrowNarrowLeftIcon from '@/components/ui/arrow-narrow-left-icon'
import ArrowNarrowRightIcon from '@/components/ui/arrow-narrow-right-icon'
import PenIcon from '@/components/ui/pen-icon'
import ShieldCheck from '@/components/ui/shield-check'
import DownChevron from '@/components/ui/down-chevron'
import { AliveIcon } from '@/components/vigil/alive-icon'
import { ShortcutSheet } from '@/components/vigil/shortcut-sheet'
import { UnusedFiles } from '@/components/vigil/unused-files'
import { Tour } from '@/components/vigil/tour'
import { SandboxHost, SandboxPill } from '@/components/vigil/sandbox'
import { SANDBOX, enterSandbox, leaveSandbox, resetSandbox } from '@/lib/sandbox'
import { askBook } from '@/lib/books'
import { BookName, askNewBook } from '@/components/vigil/books'
import { Welcome } from '@/components/vigil/welcome'
import { PageHint } from '@/components/vigil/page-hint'
import { onboarding, playWelcome } from '@/lib/onboarding'
import { DayView } from '@/components/vigil/day-view'
import { MonthPage, SCALE_VIEW, WeekPage, YearPage, type Scale } from '@/components/vigil/periods-view'
import { RecentPanel } from '@/components/vigil/recent-panel'
import { Passes, openPass } from '@/components/vigil/pass'
import { noteActions } from '@/lib/notes'
import { headingIn } from '@/lib/capture-links'
import { openWindow } from '@/lib/notes'
import { PlaceIcon, SECTIONS, ShowList, useShown } from '@/components/vigil/places'
import { Branches } from '@/components/vigil/branches'
import { Term, WordNotes } from '@/components/vigil/term'
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover'
import { RowMenu } from '@/components/vigil/row-menu'
import { useStoredFlag } from '@/lib/use-stored-flag'
import { NavContext, type Nav, type Step } from '@/lib/nav'
import { SplitPanes, type PaneApi } from '@/components/vigil/panes'
import { SplitDrop, type Carried, type Side } from '@/components/vigil/split-drop'
import { RowCard, rowOf } from '@/components/vigil/row-card'
import { PairRow, pinLayout, sameLayout, unpinLayout, usePinnedLayouts, type PaneName } from '@/components/vigil/split-pairs'
import type { BookRef } from '@/lib/books'
import type { RowItem } from '@/components/vigil/row-menu'
import { asideClick, keepTitle, roomFor, setPaneNotes, setPanes, spendAsideClick, titleOf, type PaneWidth } from '@/lib/split'
import XIcon from '@/components/ui/x-icon'

// itshover drawings in lucide's place, moving when their control is pointed at.
const ChevronRight = alive(RightChevronIcon)
const CircleHelp = alive(InfoCircleIcon)
const PinMark = alive(BookmarkIcon)

// A nonce makes asking again a fresh visit: the recap reopens each time.
type View = Step

/** An open-or-shut fold in the sidebar, remembered across launches; shut to start unless said. */
function useRemembered(key: string, start = false): [boolean, (open: boolean) => void] {
  const [open, setOpen] = useState(() => {
    try {
      const kept = localStorage.getItem(key)
      return kept ? kept === 'open' : start
    } catch {
      return start
    }
  })
  return [open, (next) => {
    setOpen(next)
    try {
      localStorage.setItem(key, next ? 'open' : 'shut')
    } catch {
      // Open for now, not next time.
    }
  }]
}

const today = (): number => new Date().setHours(24, 0, 0, 0)

/** The top bar's buttons, one size and one look, each named with its key on hover. */
const TOOL = 'flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground [&_svg]:size-4'
/** Joined buttons, and the one button that matters, wear an edge: a hairline pill the height of the rest. */
const PILL = 'flex h-7 items-center overflow-hidden rounded-full border'
const keyed = (label: string, keys: string): React.JSX.Element => <span className="flex items-center gap-1.5">{label} <Pressed keys={keys} /></span>

/** Whether the window is under 760px wide, followed as it is resized. */
const NARROW = '(max-width: 759px)'
const followNarrow = (change: () => void): (() => void) => {
  const query = matchMedia(NARROW)
  query.addEventListener('change', change)
  return () => query.removeEventListener('change', change)
}
/**
 * The open note's name in the title bar. Its own component, so the name
 * changing as a note scrolls (G, gg) redraws only this line, not the whole
 * window and the long list beside the note.
 */
function TopTitle({ on }: { on: boolean }): React.JSX.Element {
  const title = useTopTitle()
  return <span className={`min-w-0 flex-1 truncate px-4 text-center text-muted-foreground transition-opacity duration-200 ${title && on ? 'opacity-100' : 'opacity-0'}`}>{title}</span>
}

const useNarrow = (): boolean => useSyncExternalStore(followNarrow, () => matchMedia(NARROW).matches)
/** Under 1000px wide, Recent lies over the page's right edge rather than squeezing it. */
const CRAMPED = '(max-width: 999px)'
const followCramped = (change: () => void): (() => void) => {
  const query = matchMedia(CRAMPED)
  query.addEventListener('change', change)
  return () => query.removeEventListener('change', change)
}
const useCramped = (): boolean => useSyncExternalStore(followCramped, () => matchMedia(CRAMPED).matches)

// --- split view: each pane's trail, kept across launches while split

type Trail = { views: View[]; at: number }
type PaneState = { key: string; trail: Trail; width?: PaneWidth }
type SplitState = { panes: PaneState[]; front: string; sizes: number[] }
const SPLIT = 'split'
let made = 0
const fresh = (views: View[] = [{ id: 'home' }]): PaneState => ({ key: `p${Date.now().toString(36)}${made++}`, trail: { views, at: views.length - 1 } })
/** Pages that hold one note open beside their list, its id as the step's focus. */
const holdsNotes = (id: string): boolean => !['home', 'day', 'weekpage', 'monthpage', 'yearpage', 'tags', 'stats', 'map', 'powers', 'settings', 'review', 'queue'].includes(id)
/** Where one thing opens: a view by name, a day's page, or a note or task in its section. */
const stepOf = (type: string, id: string): View =>
  type === 'view' ? { id } : type === 'day' ? { id: 'day', focus: id } : { id: type === 'capture' ? 'all' : type === 'task' ? 'upcoming' : `${type}s`, focus: id }
function loadSplit(): SplitState {
  try {
    const kept = JSON.parse(localStorage.getItem(SPLIT) ?? 'null') as SplitState | null
    const fine = (pane: PaneState): boolean => typeof pane?.key === 'string' && Array.isArray(pane.trail?.views) && pane.trail.views.every((one) => typeof one?.id === 'string') && pane.trail.at >= 0 && pane.trail.at < pane.trail.views.length
    if (kept && Array.isArray(kept.panes) && kept.panes.length > 1 && kept.panes.length <= 3 && kept.panes.every(fine)) {
      const sizes = Array.isArray(kept.sizes) && kept.sizes.length === kept.panes.length && kept.sizes.every((one) => one > 0) ? kept.sizes : kept.panes.map(() => 1 / kept.panes.length)
      return { panes: kept.panes, front: kept.panes.some((one) => one.key === kept.front) ? kept.front : kept.panes[0].key, sizes }
    }
  } catch {
    // Nothing kept, or nothing readable: one pane on Home.
  }
  const one = fresh()
  return { panes: [one], front: one.key, sizes: [1] }
}
function saveSplit(split: SplitState): void {
  try {
    if (split.panes.length < 2) return localStorage.removeItem(SPLIT)
    // Each trail without its scroll, and only its last fifty steps.
    const panes = split.panes.map(({ trail, ...pane }) => {
      const from = Math.max(0, Math.min(trail.at, trail.views.length - 50))
      return { ...pane, trail: { views: trail.views.slice(from).map(({ id, focus, tab }) => ({ id, focus, tab })), at: trail.at - from } }
    })
    localStorage.setItem(SPLIT, JSON.stringify({ ...split, panes }))
  } catch {
    // Kept for this run only.
  }
}

/**
 * The main window: the sections down the left, the one picked filling the
 * rest. Built the way Linear and Todoist are, because the plan spends its
 * novelty on the tiers and the resurfacing, and nothing on the chrome: a
 * sidebar with counts, G and a letter to jump, C to capture, ⌘K to search.
 */
export function Home(): React.JSX.Element {
  // Escape in a note lets go of the note, and never goes back: ⌘[ does.
  useEscapeLeavesEditor()
  // Where you have been, for back and forward: a list and a place in it, for
  // each pane of the page. Usually one; split, up to three side by side, the
  // one in front taking the keys, the header's Back and Forward and its title.
  const [split, setSplit] = useState<SplitState>(loadSplit)
  const splitRef = useRef(split)
  splitRef.current = split
  const frontRef = useRef(split.front)
  frontRef.current = split.front
  const front = split.panes.find((one) => one.key === split.front) ?? split.panes[0]
  const trail = front.trail
  const view = trail.views[trail.at]
  // Said before anything in the panes listens for keys, so the right one answers.
  useLayoutEffect(() => setPanes(front.key, split.panes.length), [front.key, split.panes.length])
  // Which note each pane has open, so a list can mark its row L, M or R.
  useLayoutEffect(() => setPaneNotes(split.panes.map((one) => {
    const there = one.trail.views[one.trail.at]
    return holdsNotes(there.id) ? there.focus ?? null : null
  })), [split])
  // Kept across launches while the page is split; on its own, Vigil opens on Home as always.
  useEffect(() => saveSplit(split), [split])
  // Back returns to exactly what you saw: each step keeps how far its page
  // was scrolled, read as you leave it and put back when you return (panes.tsx).
  const apis = useRef(new Map<string, PaneApi>())
  const scrolled = (key: string): [string, number][] => apis.current.get(key)?.scrolled() ?? []
  const setTrail = (key: string, change: (trail: Trail) => Trail): void =>
    setSplit((now) => ({ ...now, panes: now.panes.map((one) => (one.key === key ? { ...one, trail: change(one.trail) } : one)) }))
  /** A new step after the one you are on, which keeps its scroll; what was ahead is let go. */
  const push = (trail: Trail, next: View, scroll: [string, number][]): Trail => ({
    views: [...trail.views.slice(0, trail.at), { ...trail.views[trail.at], scroll }, next],
    at: trail.at + 1
  })
  const setView = (next: View, key = frontRef.current): void => {
    const scroll = scrolled(key)
    setTrail(key, (trail) => {
      const here = trail.views[trail.at]
      // Going where you already are is not a step: Back would have to undo it.
      // Nor is the section you are in, asked for again: what is open stays.
      if (here.id === next.id && (here.focus === next.focus || next.focus === undefined) && here.nonce === next.nonce) return trail
      if (here.id !== next.id) chime('tap')
      return push(trail, next, scroll)
    })
  }
  const step = (by: -1 | 1, key = frontRef.current): void => {
    const scroll = scrolled(key)
    setTrail(key, ({ views, at }) => {
      const next = Math.max(0, Math.min(views.length - 1, at + by))
      if (next === at) return { views, at }
      // Back and forward sound like any other move between sections.
      chime('tap')
      apis.current.get(key)?.restore(views[next].scroll ?? null)
      return { views: views.map((one, index) => (index === at ? { ...one, scroll } : one)), at: next }
    })
  }
  // What a page sees of its pane's trail: opening something in it is a step;
  // a tab or the day on show is kept in the step it is on.
  const navFor = (key: string, view: View): Nav => ({
    here: view,
    go: (focus) => {
      const scroll = scrolled(key)
      setTrail(key, (trail) => {
        const here = trail.views[trail.at]
        if (here.id !== view.id || (here.focus ?? null) === focus) return trail
        return push(trail, { id: here.id, focus: focus ?? undefined, tab: here.tab }, scroll)
      })
    },
    keep: (patch) =>
      setTrail(key, (trail) => {
        const here = trail.views[trail.at]
        if (here.id !== view.id || Object.entries(patch).every(([name, value]) => here[name as keyof View] === value)) return trail
        return { ...trail, views: trail.views.map((one, index) => (index === trail.at ? { ...one, ...patch } : one)) }
      })
  })
  // Where each pane last had the keys, so coming back to it puts them there again.
  const lastFocus = useRef(new Map<string, Element>())
  useEffect(() => {
    const onFocus = (event: FocusEvent): void => {
      const pane = event.target instanceof Element ? event.target.closest('[data-pane]') : null
      if (pane) lastFocus.current.set(pane.getAttribute('data-pane')!, event.target as Element)
    }
    document.addEventListener('focusin', onFocus)
    return () => document.removeEventListener('focusin', onFocus)
  }, [])
  /** Bring a pane to the front, the keys with it: where it last had them, or the page itself. */
  const toFront = (key: string): void => {
    setSplit((now) => (now.front === key || !now.panes.some((one) => one.key === key) ? now : { ...now, front: key }))
    requestAnimationFrame(() => {
      const pane = document.querySelector(`[data-pane="${key}"]`)
      const held = document.activeElement
      if (!pane || (held && pane.contains(held) && held !== document.body)) return
      const last = lastFocus.current.get(key)
      if (last?.isConnected && pane.contains(last)) {
        // An editor takes the keys back with its caret where it was, and the page where it was scrolled.
        const editor = (last.closest('.ProseMirror') as (Element & { editor?: { commands: { focus: (at: null, options: { scrollIntoView: boolean }) => void } } }) | null)?.editor
        if (editor) return editor.commands.focus(null, { scrollIntoView: false })
        if (last instanceof HTMLElement) return last.focus({ preventScroll: true })
      }
      if (held instanceof HTMLElement) held.blur()
    })
  }
  /** ⌃H and ⌃L: the pane to the left or right, like moving between Vim's windows. */
  const moveFront = (by: -1 | 1): void => {
    const now = splitRef.current
    const at = now.panes.findIndex((one) => one.key === now.front)
    const to = now.panes[at + by]
    if (!to) return void chime('nope')
    chime('tap')
    toFront(to.key)
  }
  /**
   * Open beside a pane (the one in front unless said): a new pane to its
   * right while there is room for one side by side, else the rightmost pane
   * takes it as a step (the one left of it, when that is where it came
   * from), so its Back returns to what it showed. The split never folds
   * into turns because of it.
   */
  const aside = (next: View, from = frontRef.current): void => {
    const now = splitRef.current
    const at = Math.max(0, now.panes.findIndex((one) => one.key === from))
    // A note opened beside: a page turned; a list or a page, the panel's slide.
    if (next.focus) pageTurn()
    else chime('slide')
    if (now.panes.length < 2 || (now.panes.length < 3 && roomFor(now.panes.length + 1))) {
      const made = fresh([next])
      const panes = [...now.panes.slice(0, at + 1), made, ...now.panes.slice(at + 1)]
      // The new one takes its share, the others give theirs up evenly.
      const kept = now.sizes.length === now.panes.length ? now.sizes : now.panes.map(() => 1 / now.panes.length)
      const sizes = [...kept.slice(0, at + 1), 1, ...kept.slice(at + 1)].map((one, index) => (index === at + 1 ? 1 / panes.length : (one * (panes.length - 1)) / panes.length))
      setSplit({ panes, front: made.key, sizes })
      return
    }
    const last = now.panes.length - 1
    const target = now.panes[last].key !== now.panes[at].key ? now.panes[last] : now.panes[last - 1]
    setView(next, target.key)
    toFront(target.key)
  }
  const asideRef = useRef(aside)
  asideRef.current = aside
  /**
   * Dropped on a side of the page (split-drop.tsx): a new pane at that edge
   * while there is room for one, else the pane at that edge takes it as a
   * step, so its Back returns to what it showed.
   */
  const placeAt = (next: View, side: Side): void => {
    const now = splitRef.current
    if (next.focus) pageTurn()
    else chime('slide')
    if (now.panes.length < 3) {
      const made = fresh([next])
      const n = now.panes.length + 1
      const kept = now.sizes.length === now.panes.length ? now.sizes : now.panes.map(() => 1 / now.panes.length)
      const total = kept.reduce((sum, one) => sum + one, 0) || 1
      const rest = kept.map((one) => (one / total) * ((n - 1) / n))
      setSplit({ panes: side === 'left' ? [made, ...now.panes] : [...now.panes, made], front: made.key, sizes: side === 'left' ? [1 / n, ...rest] : [...rest, 1 / n] })
      return
    }
    const target = side === 'left' ? now.panes[0] : now.panes[now.panes.length - 1]
    setView(next, target.key)
    toFront(target.key)
  }
  /** What was carried to a side, as a step: a note by its kind and id, or a list's row in the list it is in. */
  const dropAside = (carried: Carried, side: Side): void => {
    let next: View | null = null
    if (carried.open) {
      const at = carried.open.indexOf(':')
      next = stepOf(carried.open.slice(0, at), carried.open.slice(at + 1))
    } else if (carried.row) {
      const pane = splitRef.current.panes.find((one) => one.key === carried.row!.pane)
      const there = pane?.trail.views[pane.trail.at]
      if (there && holdsNotes(there.id)) next = { id: there.id, focus: carried.row.id, tab: there.tab }
    }
    if (!next) return void chime('nope')
    setSearching(false)
    setSearchFor('')
    placeAt(next, side)
  }
  /** ⌃W: the pane in front closes, and the one beside it takes the keys. */
  const closePane = (key = frontRef.current): void => {
    const now = splitRef.current
    if (now.panes.length < 2) return void chime('nope')
    const at = now.panes.findIndex((one) => one.key === key)
    if (at < 0) return
    // A pane folded away, paper and all.
    chime('fold')
    paper('fold')
    let panes = now.panes.filter((one) => one.key !== key)
    // On its own again, a page follows Page width in Settings.
    if (panes.length === 1) panes = panes.map((one) => ({ ...one, width: undefined }))
    const kept = now.sizes.length === now.panes.length ? now.sizes.filter((_, index) => index !== at) : panes.map(() => 1)
    const total = kept.reduce((sum, one) => sum + one, 0) || 1
    const next = key === now.front ? (panes[at - 1] ?? panes[0]).key : now.front
    setSplit({ panes, front: now.front === key ? next : now.front, sizes: kept.map((one) => one / total) })
    lastFocus.current.delete(key)
    toFront(next)
  }
  /** ⌥⌘\: the page in front, again beside it. A note stays in one pane, so the copy shows its list with nothing open. */
  const splitFront = (): void => {
    if (splitRef.current.panes.length >= 3) return void (chime('nope'), toast('Three panes at most: close one with ⌃W first'))
    aside(holdsNotes(view.id) ? { id: view.id, tab: view.tab } : { id: view.id, focus: view.focus, tab: view.tab })
  }
  // One note, one pane: two editors on one note would each save over the
  // other's words. The pane in front keeps it; any other lets it go.
  useEffect(() => {
    if (!view.focus || !holdsNotes(view.id)) return
    for (const pane of split.panes) {
      const there = pane.trail.views[pane.trail.at]
      if (pane.key === split.front || there.focus !== view.focus || !holdsNotes(there.id)) continue
      setTrail(pane.key, (trail) => ({ ...trail, views: trail.views.map((one, index) => (index === trail.at ? { ...one, focus: undefined } : one)) }))
    }
  }, [split]) // eslint-disable-line react-hooks/exhaustive-deps
  // Opened to the side from anywhere in the window: a row's menu, a note's ⋯, an @ link's card.
  useEffect(() => {
    const onAside = (event: Event): void => {
      const { type, id, from } = (event as CustomEvent<{ type: string; id: string; from?: string | null }>).detail
      asideRef.current(stepOf(type, id), from ?? undefined)
    }
    window.addEventListener('vigil:aside', onAside)
    return () => window.removeEventListener('vigil:aside', onAside)
  }, [])
  // ⌥-click on a row of a list: that note to the side, the list it is in around it.
  useEffect(() => {
    const onClick = (event: MouseEvent): void => {
      if (event.button !== 0 || !event.altKey || event.metaKey || event.ctrlKey || event.shiftKey) return
      const row = event.target instanceof Element ? event.target.closest('[data-pane] [data-row][data-id]') : null
      const key = row?.closest('[data-pane]')?.getAttribute('data-pane')
      const pane = splitRef.current.panes.find((one) => one.key === key)
      const there = pane?.trail.views[pane.trail.at]
      if (!row || !pane || !there || !holdsNotes(there.id)) return
      event.preventDefault()
      event.stopPropagation()
      spendAsideClick()
      asideRef.current({ id: there.id, focus: row.getAttribute('data-id')!, tab: there.tab }, pane.key)
    }
    window.addEventListener('click', onClick, true)
    return () => window.removeEventListener('click', onClick, true)
  }, [])
  const [sidebar, setSidebar] = useState(true)
  // Under 760px wide the sidebar folds down to its icons, each named on hover,
  // so a window tiled into a corner keeps its page.
  const narrow = useNarrow()
  const cramped = useCramped()
  // Private titles shown on purpose go back to blurred once the window is put away.
  useEffect(() => {
    const onHide = (): void => void (document.hidden && delete document.documentElement.dataset.reveal)
    document.addEventListener('visibilitychange', onHide)
    return () => document.removeEventListener('visibilitychange', onHide)
  }, [])
  // Compact, beside your work, unless asked to fill the screen; remembered.
  // Filling the screen is the window's own maximize, so the green button, a
  // drag or a tiling manager all keep this icon honest.
  const [fill, setFillState] = useState(false)
  const setFill = (on: boolean): void => {
    chime(on ? 'slide' : 'fold')
    void window.api.fillHome(on)
  }
  const fillRef = useRef(false)
  fillRef.current = fill
  useEffect(() => window.api.onFilled(setFillState), [])
  // ⌃⇧F, the same chord that makes the prompt bigger. Held, it fires once.
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.repeat || event.key.toLowerCase() !== 'f' || !event.ctrlKey || !event.shiftKey || event.metaKey || event.altKey) return
      event.preventDefault()
      chime(fillRef.current ? 'fold' : 'slide')
      void window.api.fillHome('toggle')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  useAppearance()
  useFocusMode('home')
  // ⌘K: notes and every action. ⌘P, Obsidian's quick open: notes only.
  const [searching, setSearching] = useState<false | 'all' | 'notes'>(false)
  // What an @ link to a person searches for: every note with their words.
  const [searchFor, setSearchFor] = useState('')
  // Getting started's last step: ⌘K opened once.
  useEffect(() => void (searching && onboarding.mark('search')), [searching])
  // Recent beside the page: everything made lately, or in the week a week's
  // page shows. `until` null reaches back from now.
  const [recent, setRecentState] = useState<{ until: string | null } | null>(null)
  const setRecent = (until: string | null | 'close'): void => setRecentState(until === 'close' ? null : { until })
  const toggleRecent = (): void => {
    chime(recent ? 'fold' : 'slide')
    setRecentState(recent ? null : { until: null })
  }
  const [kindsOpen, setKindsOpen] = useState(false)
  // Folded away unless you open them, and kept the way you left them.
  const [tagsOpen, setTagsOpen] = useRemembered('sidebar:tags')
  const [moreOpen, setMoreOpen] = useRemembered('sidebar:more')
  // The groups fold too, Notion's way, and start open.
  const [pinsOpen, setPinsOpen] = useRemembered('sidebar:pinned', true)
  const [tasksOpen, setTasksOpen] = useRemembered('sidebar:tasks', true)
  const [keptOpen, setKeptOpen] = useRemembered('sidebar:kept', true)
  const [customizing, setCustomizing] = useState(false)
  // One light for the whole sidebar list, gliding to the row nearest the
  // pointer, and the page you are on marked by one fill that travels to the
  // next. A row folding shut is left out of both.
  const sideList = useRef<HTMLDivElement>(null)
  const sideHover = useFluidHover(sideList, { items: '[data-side-row]:not([inert] *)' })
  const sideChosen = useChosen(sideList, '[data-side-row][aria-current="page"]:not([inert] *)', `${view.id}:${view.focus ?? ''}`)
  // A calm sidebar: what serves capturing and coming back; the rest under More.
  const shown = useShown('sidebarShown')
  const pins = useLive(vigil.pins, [] as Pin[])
  const tags = useLive(vigil.tags, [] as Awaited<ReturnType<typeof vigil.tags>>)
  // Pinned from a tag's page: those first, then the most used.
  const [pinnedTags] = usePinnedTags()
  const sideTags = [...tags.filter((one) => pinnedTags.includes(one.tag)), ...tags.filter((one) => !pinnedTags.includes(one.tag))].slice(0, Math.max(8, pinnedTags.length))
  const captures = useCaptures()
  const due = useLive(vigil.dueCount, 0, [], ['item'])
  const tasks = useLive(vigil.tasks, [] as Task[])
  const nuggets = useLive(() => vigil.items('nugget'), [] as Item[], [], ['item'])
  const articles = useLive(() => vigil.items('article'), [] as Item[], [], ['item'])
  const questions = useLive(() => vigil.items('question'), [] as Item[], [], ['item'])
  const goals = useLive(() => vigil.items('goal'), [] as Item[], [], ['item'])
  const queued = useQueue()
  const settings = useLive(vigil.settings, null as Settings | null)
  // Seen in screen recordings or not: one flag with the box's menu and Settings.
  const [recordable, setRecordable] = useStoredFlag('recordable')
  const [typewriter, setTypewriter] = useStoredFlag('typewriter')
  // A new section has no note scrolled: the last one's name does not follow you there.
  // The note's name in the top bar is the front pane's: kept for each pane as it scrolls (captures-view).
  const lastFront = useRef(split.front)
  useEffect(() => {
    if (lastFront.current !== split.front) return void ((lastFront.current = split.front), showTopTitle(titleOf(split.front)))
    keepTitle(split.front, null)
    showTopTitle(null)
  }, [split.front, view.id])

  // No Inbox count: the inbox is a place to set things down, never a queue to clear.
  // Archived ones are out of sight in their lists, so out of the counts too.
  const counts: Record<string, number> = {
    review: due,
    today: tasks.filter((task) => task.status === 'open' && !task.waitingOn && (placed(task) ?? Infinity) < today()).length,
    nuggets: nuggets.filter((one) => !one.archivedAt).length,
    articles: articles.filter((one) => !one.archivedAt).length,
    // Held, not owed: counted in the same quiet grey, never as behind.
    questions: questions.filter((one) => !one.archivedAt && !one.closedAt).length,
    goals: goals.filter((one) => !one.archivedAt && !one.closedAt).length,
    queue: queued.queue.length
  }

  const safeMode = (): void => {
    const on = !settings?.safeMode
    chime(on ? 'on' : 'off')
    void vigil.setSettings({ safeMode: on }).then(() => toast(on ? 'Safe mode: no hints, old captures or pinned notes come up' : 'Safe mode off'))
  }

  // Blurring, beside Safe mode: private words blurred, the dim when you leave
  // the window, words arriving from a soft blur. One switch for all of it.
  const blurring = (): void => {
    const on = settings?.blur === false
    chime(on ? 'on' : 'off')
    void vigil.setSettings({ blur: on }).then(() => toast(on ? 'Blurring on: private words are blurred until you point at them' : 'Blurring off: everything plain and sharp'))
  }

  // The keyboard, Linear's way: G then a letter goes somewhere, C captures.
  useEffect(() => {
    let pending = false
    const onKey = (event: KeyboardEvent): void => {
      // ⌘ keys work with the caret in a note too; only something held over
      // the page (Read, a question) keeps them. A month told back is the step
      // itself (⌘K's "Your month, wrapped"), so Back and Forward leave it.
      const held = document.querySelector('[role="dialog"]')
      const told = !!held && !!held.closest('[data-pane]') && !!held.getAttribute('aria-label')?.endsWith('told back')
      if (told && event.metaKey && !event.altKey && (event.key === '[' || event.key === ']')) return step(event.key === '[' ? -1 : 1)
      if (held) return
      // Split view. ⌥⌘\ opens the page in front again beside it.
      if (event.metaKey && event.altKey && !event.ctrlKey && !event.shiftKey && event.code === 'Backslash') {
        event.preventDefault()
        return splitFront()
      }
      // ⌃H and ⌃L move between panes as Vim moves between windows, ⌃W closes
      // one. Only while split, and taken before the editor (which keeps none
      // of the three, vim mode included); a menu open over the page keeps them.
      if (event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey && splitRef.current.panes.length > 1 && ['KeyH', 'KeyL', 'KeyW'].includes(event.code)) {
        if (document.querySelector('[cmdk-root], [role=menu], [role=listbox], .tiptap-suggestion-popup')) return
        event.preventDefault()
        event.stopPropagation()
        return event.code === 'KeyW' ? closePane() : moveFront(event.code === 'KeyH' ? -1 : 1)
      }
      if (event.metaKey && (event.key === 'k' || event.key === 'p')) {
        event.preventDefault()
        return setSearching(event.key === 'k' ? 'all' : 'notes')
      }
      // ⌘N, as in Notion and Linear: a new capture, in the box.
      if (event.metaKey && event.key === 'n') {
        event.preventDefault()
        return void (chime('open'), window.api.showPrompt())
      }
      // ⇧⌘Y: Recent beside the page, or away again.
      if (event.metaKey && event.shiftKey && event.key.toLowerCase() === 'y') {
        event.preventDefault()
        return toggleRecent()
      }
      // ⌥⌘[ is the editor's fold, not Back.
      if (event.metaKey && !event.altKey && event.key === '[') return step(-1)
      if (event.metaKey && !event.altKey && event.key === ']') return step(1)
      if (event.metaKey && !event.altKey && event.key === '\\') {
        chime(sidebar ? 'fold' : 'slide')
        return setSidebar((open) => !open)
      }
      // ⌘B the sidebar too, as in Finder and most editors; while you write it
      // stays Bold. ⇧⌘B puts every side away at once (or brings them back),
      // the page on its own.
      if (event.metaKey && !event.altKey && event.key.toLowerCase() === 'b' && !typing()) {
        event.preventDefault()
        const open = event.shiftKey ? sidebar || detailsShown() : sidebar
        chime(open ? 'fold' : 'slide')
        if (event.shiftKey) showDetails(!open)
        return setSidebar(!open)
      }
      if (event.metaKey || event.ctrlKey || event.altKey || typing()) return
      // Shift on its own is half of a capital, not a key: G, let go, Shift+R.
      if (event.key === 'Shift') return
      if (pending) {
        pending = false
        const to = SECTIONS.find((section) => section.key === event.key.toLowerCase())
        // Taken here, so G T goes to Today and does not also move a task to today.
        if (to) {
          event.preventDefault()
          setView({ id: to.id })
        }
        return
      }
      // Only a small g: ⇧G is the lists' last row.
      if (event.key === 'g') pending = true
      else if (event.key === 'c') (chime('open'), window.api.showPrompt())
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  })

  // Somewhere else sent you to one thing: open its section with it open.
  // In a pane (the front one unless said); ⌥-clicked, beside it instead.
  const open = (type: string, id: string, key = frontRef.current): void => {
    if (!asideClick()) return setView(stepOf(type, id), key)
    spendAsideClick()
    aside(stepOf(type, id), key)
  }
  const toScale = (scale: Scale, key?: string): void => (chime('season'), setView({ id: SCALE_VIEW[scale] }, key))
  // A view is sent by name (⌘, sends Settings), anything else as one thing to open.
  // A heading link from a note window lands on its heading once the note is open.
  useEffect(() => window.api.onSentTo((type, id, heading) => {
    // The passes lay themselves over whatever is open, rather than being a place.
    if (type === 'view' && (id === 'tidy' || id === 'decide')) openPass(id)
    else if (type === 'view') setView({ id })
    else if (type === 'recap') setView({ id: 'stats', focus: id, nonce: Date.now() })
    else if (type === 'task') setView({ id: 'today', focus: id })
    else if (type === 'person') (setSearchFor(id), setSearching('all'))
    // A capture's version history, asked for in the box: opened, then once
    // its page is up, its history.
    else if (type === 'versions') {
      open('capture', id)
      setTimeout(() => window.dispatchEvent(new CustomEvent('vigil:versions', { detail: id })), 600)
    } else open(type, id)
    if (heading) headingIn(type, id, heading)
  }), [])

  const kind = (view: View): (typeof CAPTURE_TYPES)[number] | undefined => CAPTURE_TYPES.find((type) => `kind:${type.id}` === view.id)
  /** A page's name, for the top bar; a pane is named by its note first (paneName). */
  const labelOf = (view: View): string => SECTIONS.find((section) => section.id === view.id)?.label ?? kind(view)?.label ?? (view.id === 'settings' ? 'Settings' : view.id === 'yearpage' ? 'Year' : view.id === 'day' ? 'Day' : view.id === 'weekpage' ? 'Week' : view.id === 'monthpage' ? 'Month' : '')
  const paneWidth = (key: string, width: PaneWidth): void => {
    chime(width === 'narrow' ? 'fold' : 'slide')
    setSplit((now) => ({ ...now, panes: now.panes.map((one) => (one.key === key ? { ...one, width } : one)) }))
  }
  const keep: Record<string, (capture: CaptureMeta) => boolean> = {
    inbox: (capture) => capture.status === 'open',
    all: (capture) => capture.status !== 'discarded',
    // Nothing is destroyed: a discard lands here, and comes back from here.
    discarded: (capture) => capture.status === 'discarded',
    archived: (capture) => !!capture.archivedAt
  }

  // --- split pairs: the panes as one row in Pinned, and the menu they share (split-pairs.tsx)
  const layouts = usePinnedLayouts()
  /** The note a step has open: where it lives, its name and kind; null for a page with none. */
  const noteIn = (view: View): { type: string; id: string; name: PaneName } | null => {
    if (!view.focus || !holdsNotes(view.id)) return null
    const capture = captures.find((one) => one.id === view.focus)
    if (capture) {
      const kind = CAPTURE_TYPES.find((type) => type.id === capture.kind) ?? CAPTURE_TYPES[0]
      return { type: 'capture', id: capture.id, name: { title: capture.label || 'Untitled', icon: kind.icon, tint: kind.tint, private: !!capture.private } }
    }
    const item = [...nuggets, ...articles, ...questions, ...goals].find((one) => one.id === view.focus)
    if (item) {
      const kind = CAPTURE_TYPES.find((type) => type.id === item.kind)
      return { type: item.tier, id: item.id, name: { title: item.title || 'Untitled', icon: kind?.icon ?? FileText, tint: kind?.tint, private: !!item.private } }
    }
    const task = tasks.find((one) => one.id === view.focus)
    return task ? { type: 'task', id: task.id, name: { title: task.title || 'Untitled', icon: ListTodo } } : null
  }
  const paneName = (view: View): PaneName => noteIn(view)?.name ?? { title: labelOf(view) || 'Page', icon: PanelsTopLeft }
  /** Lay a pinned layout out again: each pane a fresh trail on its page. */
  const openLayout = (views: View[], sizes: number[]): void => {
    chime('slide')
    const panes = views.slice(0, 3).map((one) => fresh([{ ...one }]))
    setSplit({ panes, front: panes[0].key, sizes: sizes.length === panes.length ? sizes : panes.map(() => 1 / panes.length) })
  }
  /** Separate: the split closes, the pane in front stays. */
  const separate = (keep = frontRef.current): void => {
    const now = splitRef.current
    const pane = now.panes.find((one) => one.key === keep)
    if (!pane || now.panes.length < 2) return void chime('nope')
    chime('separate')
    paper('fold')
    setSplit({ panes: [{ ...pane, width: undefined }], front: pane.key, sizes: [1] })
    toFront(pane.key)
  }
  /**
   * The menu of a split pair, the same wherever it is opened (the pair's row,
   * the page's name in the top bar, a pane's tab), Dia's menu for a split
   * with what Vigil has: its layout, the notes in it, and its panes.
   */
  const pairMenu = (views: View[], live: { key?: string } | null, pinnedId?: string): RowItem[] => {
    const notes = views.map(noteIn).filter((one): one is NonNullable<ReturnType<typeof noteIn>> => !!one)
    const refs: BookRef[] = notes.filter((one) => one.type !== 'task').map((one) => ({ table: one.type === 'capture' ? 'captures' : 'nuggets', id: one.id }))
    const sizes = live ? splitRef.current.sizes : layouts.find((one) => one.id === pinnedId)?.sizes ?? []
    const pinned = pinnedId ?? layouts.find((one) => sameLayout(one.views, views))?.id
    // Move to group: the groups a note's own menu offers, done to every note of the pair that can go.
    const groupsOf = (id: string): RowItem[] => (rowOf(id)?.menu ?? []).flatMap((one) => (one && one !== 'separator' && 'items' in one && /^move to group/i.test(one.label) ? one.items : []))
    const targets = notes.length ? groupsOf(notes[0].id).filter((one): one is { label: string; run: () => void; icon?: React.ReactNode } => !!one && one !== 'separator' && 'run' in one) : []
    const moveAll = (label: string): void => notes.forEach((note, at) => setTimeout(() => {
      const item = groupsOf(note.id).find((one) => !!one && one !== 'separator' && 'run' in one && one.label === label)
      if (item && item !== 'separator' && 'run' in item) item.run()
    }, at * 450))
    // Each note's own row actions, as its list offers them; a note not drawn yet has the few every note has.
    const own = (note: (typeof notes)[number]): RowItem[] => rowOf(note.id)?.menu ?? [
      { label: 'Open', run: () => open(note.type, note.id) },
      { label: 'Open in a new window', run: () => openWindow(note.type, note.id) },
      { label: 'Copy title', run: () => void navigator.clipboard.writeText(note.name.title).then(() => (chime('copy'), toast('Copied'))) }
    ]
    const key = live?.key ?? frontRef.current
    return [
      pinned ? { label: 'Unpin the layout', run: () => unpinLayout(pinned) } : { label: 'Pin the layout', run: () => pinLayout(views, sizes) },
      'separator',
      live ? { label: 'Separate', run: () => separate(key) } : { label: 'Open the layout', run: () => openLayout(views, sizes) },
      { label: 'Duplicate the layout', run: () => (pinLayout(views, sizes), toast('Duplicated: a copy of the layout is pinned')) },
      'separator',
      targets.length > 0 && { label: 'Move to group', items: targets.map((one) => ({ label: one.label, icon: one.icon, run: () => moveAll(one.label) })) },
      refs.length > 0 && { label: 'Copy to book', items: [{ label: refs.length > 1 ? `Copy ${refs.length} notes to book…` : 'Copy to book…', run: () => askBook('copy', { refs }) }] },
      notes.length > 0 && { label: 'Open in new window', run: () => notes.forEach((note) => openWindow(note.type, note.id)) },
      notes.length > 0 && 'separator',
      notes.length > 0 && { heading: 'Notes' },
      ...notes.map((note): RowItem => ({ label: note.name.title, icon: <note.name.icon className="size-3.5 shrink-0" style={{ color: note.name.tint }} />, items: own(note) })),
      live && 'separator',
      live && { label: 'Close pane', keys: '⌃W', run: () => closePane(key) },
      live && { label: 'Close other panes', run: () => separate(key) }
    ]
  }

  /** A pane's page: the step it is on, drawn with everything it opens kept in that pane. */
  const pageFor = (key: string, view: View): React.JSX.Element => {
    const go = (type: string, id: string): void => open(type, id, key)
    const scale = (to: Scale): void => toScale(to, key)
    return (
      <NavContext.Provider value={navFor(key, view)}>
      {/* Views are switched by key all day: the new one is there at once and
          only settles in, never waiting for the old one to leave first. A
          transform string, so it stays smooth while the view mounts. */}
      <motion.div
        key={view.id}
        // Keyboard travel (G and a letter, ⌘[ and ⌘]) is done hundreds of times a day: no settle then.
        initial={byKeys() ? false : { opacity: 0, transform: shift('translateY(4px)') }}
        animate={{ opacity: 1, transform: shift('translateY(0px)') }}
        transition={{ duration: 0.14, ease: EASE }}
        className="flex min-w-0 flex-1"
      >
        {view.id === 'home' ? (
          <HomeView onOpen={go} onView={(id, focus) => setView({ id, focus }, key)} />
        ) : view.id === 'inbox' || view.id === 'all' || view.id === 'discarded' || view.id === 'archived' ? (
          <CapturesView title={SECTIONS.find((section) => section.id === view.id)!.label} keep={keep[view.id]} focus={view.focus} onOpen={go} archived={view.id === 'archived'} />
        ) : view.id === 'day' ? (
          <DayView start={view.focus} onOpen={go} onScale={scale} />
        ) : view.id === 'weekpage' ? (
          <WeekPage start={view.focus} onOpen={go} onScale={scale} onRecent={setRecent} recentOpen={!!recent} onDay={(day) => go('day', day)} />
        ) : view.id === 'monthpage' ? (
          <MonthPage start={view.focus} onScale={scale} onDay={(day) => go('day', day)} />
        ) : view.id === 'yearpage' ? (
          <YearPage start={view.focus} onScale={scale} onMonth={(month) => setView({ id: 'monthpage', focus: month }, key)} onDay={(day) => go('day', day)} />
        ) : kind(view) ? (
          <CapturesView title={kind(view)!.label} keep={(capture) => capture.kind === kind(view)!.id && capture.status !== 'discarded'} focus={view.focus} onOpen={go} />
        ) : view.id === 'review' ? (
          <ReviewView />
        ) : view.id === 'today' || view.id === 'upcoming' || view.id === 'routines' || view.id === 'later' ? (
          <TasksView mode={view.id} focus={view.focus} onOpen={go} />
        ) : view.id === 'week' ? (
          <WeekView focus={view.focus} onOpen={go} />
        ) : view.id === 'matrix' ? (
          <MatrixView focus={view.focus} onOpen={go} />
        ) : view.id === 'nuggets' || view.id === 'articles' ? (
          <ItemsView tier={view.id === 'nuggets' ? 'nugget' : 'article'} focus={view.focus} onOpen={go} />
        ) : view.id === 'questions' ? (
          <QuestionsView focus={view.focus} onOpen={go} />
        ) : view.id === 'goals' ? (
          <GoalsView focus={view.focus} onOpen={go} />
        ) : view.id === 'queue' ? (
          <QueueView />
        ) : view.id === 'tags' ? (
          <TagsView onOpen={go} focus={view.focus} />
        ) : view.id === 'stats' ? (
          <StatsView key={`${view.focus}-${view.nonce}`} recap={view.focus} />
        ) : view.id === 'map' ? (
          <MapView onOpen={go} />
        ) : view.id === 'powers' ? (
          <PowersView onView={(id, focus) => setView({ id, focus }, key)} />
        ) : (
          <SettingsView />
        )}
      </motion.div>
      </NavContext.Provider>
    )
  }

  return (
    <TooltipProvider delayDuration={600} skipDelayDuration={400}>
    <div className="isolate flex h-screen flex-col bg-background text-foreground">
      {/* Centred over the page, not the sidebar beside it. */}
      <div className={`contents ${sidebar ? (narrow ? '[--toast-left:4rem]' : '[--toast-left:15rem]') : ''}`}><Toaster /></div>
      <Celebrations place="home" />
      <NotePreview />
      <RowCard />
      <ShortcutSheet />
      <WordNotes />
      <UnusedFiles />
      <Passes onOpen={(type, id) => open(type, id)} />
      <QueueReader />
      <Welcome />
      <Tour />
      <SandboxHost />
      <FocusNote />
      <FocusScenery />
      {searching && (
        <Search
          key={searchFor}
          initial={searchFor}
          // The same palette as the box's: places to go and things to switch.
          actions={searching === 'notes' ? [] : [
            { label: 'New capture', keys: 'C', run: () => window.api.showPrompt() },
            { label: 'New question', cue: null, run: () => void startQuestion(open) },
            { label: 'New goal', cue: null, run: () => void startGoal(open) },
            // One action for every open goal's beacon, then a short list: each goal, and the two settings it is not on.
            ...(goals.some((one) => !one.archivedAt && !one.closedAt) ? [{
              label: 'Goal on screen…', cue: null, run: () => {},
              choices: () => goals.filter((one) => !one.archivedAt && !one.closedAt).flatMap((goal) => {
                const now = goal.beacon ?? settings?.goalBeacon ?? 'sometimes'
                const said = (mode: string): string => (mode === 'always' ? 'always on screen' : mode === 'sometimes' ? 'on screen now and then' : 'off screen')
                return (['always', 'sometimes', 'off'] as const).filter((mode) => mode !== now).map((mode) => ({
                  label: `${said(mode).charAt(0).toUpperCase()}${said(mode).slice(1)}: ${goal.title}`, note: `now ${said(now)}`,
                  run: () => void vigil.setBeacon(goal.id, mode).then(() => {
                    chime(mode === 'off' ? 'unstick' : 'stick')
                    toast(mode === 'always' ? 'On screen, on every Space' : mode === 'sometimes' ? 'On screen now and then: it comes out a few times a day' : 'Off screen: the menu bar and Home still show it', () => void vigil.setBeacon(goal.id, goal.beacon))
                  })
                }))
              })
            }] : []),
            ...(picked.ids.length > 1 ? [{ label: `Make one task from the ${picked.ids.length} selected captures`, cue: null, run: () => window.dispatchEvent(new CustomEvent('vigil:one-task')) }] : []),
            { label: "Keep today's tasks on screen", cue: null, run: () => stickOnDesktop('today', 'today') },
            { label: 'Tidy: a few minutes over the latest captures', run: () => openPass('tidy') },
            { label: 'Decide: the weekly pass over what waited', run: () => openPass('decide') },
            { label: 'Import an Obsidian vault or Notion export…', cue: null, run: () => void window.api.importFrom('vault') },
            { label: 'Import Readwise, Kindle, Markdown, bookmarks or Anki…', cue: null, run: () => void window.api.importFrom('files') },
            { label: 'Switch book: another book of yours, or the sandbox', cue: null, run: () => askBook('switch') },
            ...(SANDBOX ? [] : [
              { label: 'New book: an empty one, apart from this', cue: null, run: () => void askNewBook() },
              { label: 'Import into another book…', cue: null, run: () => askBook('import') }
            ]),
            // In the sandbox, restoring reads as a risk to your notes: it is not offered there.
            ...(SANDBOX ? [
              { label: 'Back to my notes: leave the sandbox', cue: null, run: () => void leaveSandbox() },
              { label: 'Reset the sandbox: every example back to how it began', cue: null, run: () => void resetSandbox() }
            ] : [
              { label: 'Restore from a backup…', cue: null, run: () => void window.api.restoreBackup() },
              { label: 'Open the sandbox: examples to try, apart from your notes', cue: null, run: () => void enterSandbox() }
            ]),
            { label: 'What can Vigil do? Every power, with a way to try it', cue: null, run: () => setView({ id: 'powers' }) },
            { label: 'Show the welcome again', cue: null, run: playWelcome },
            { label: 'Try a celebration', cue: null, run: () => tryCelebration() },
            ...SECTIONS.map((section) => ({ label: `Go to ${section.label}`, keys: `G ${section.key.toUpperCase()}`, run: () => setView({ id: section.id }) })),
            { label: sidebar ? 'Hide the sidebar' : 'Show the sidebar', keys: '⌘B', cue: sidebar ? 'fold' : 'slide', run: () => setSidebar(!sidebar) },
            { label: sidebar || detailsShown() ? 'Hide every sidebar' : 'Show every sidebar', keys: '⇧⌘B', cue: null, run: () => { const open = sidebar || detailsShown(); chime(open ? 'fold' : 'slide'); showDetails(!open); setSidebar(!open) } },
            { label: fill ? 'Back to compact' : 'Fill the screen', keys: '⌃⇧F', cue: null, run: () => setFill(!fill) },
            { label: 'Split: this page again, beside it', keys: '⌥⌘\\', cue: null, run: splitFront },
            ...(split.panes.length > 1 ? [
              { label: 'Close this pane', keys: '⌃W', cue: null, run: () => closePane() },
              { label: 'Pane to the left', keys: '⌃H', cue: null, run: () => moveFront(-1) },
              { label: 'Pane to the right', keys: '⌃L', cue: null, run: () => moveFront(1) }
            ] : []),
            { label: 'Fold every heading', cue: null, run: () => void (foldEverything(true) || chime('nope')) },
            { label: 'Unfold every heading', cue: null, run: () => void (foldEverything(false) || chime('nope')) },
            { label: typewriter ? 'Turn typewriter scrolling off' : 'Turn typewriter scrolling on', cue: typewriter ? 'off' : 'on', run: () => setTypewriter(!typewriter) },
            { label: settings?.sounds ? 'Turn sounds off' : 'Turn sounds on', cue: null, run: () => {
              soundOn(!settings?.sounds)
              chime(settings?.sounds ? 'off' : 'on')
              void vigil.setSettings({ sounds: !settings?.sounds })
            } },
            { label: settings?.safeMode ? 'Turn safe mode off' : 'Turn safe mode on', keys: '⌥⌘S', cue: null, run: safeMode },
            { label: settings?.stickiesShown === false ? 'Show sticky notes' : 'Hide sticky notes', keys: '⌃⌥⌘N', cue: null, run: () => void vigil.setSettings({ stickiesShown: settings?.stickiesShown === false }) },
            { label: recordable ? 'Hide Vigil from screen recordings' : 'Show Vigil in screen recordings', cue: recordable ? 'off' : 'on', icon: recordable ? CameraOffIcon : CameraIcon, run: () => (setRecordable(!recordable), void window.api.setRecordable(!recordable)) },
            // Not in safe mode: the notes it would bring are meant to be put away then.
            ...(settings?.safeMode ? [] : [{ label: 'Bring sticky notes here', cue: null, run: () => window.api.gatherStickies() }]),
            ...(settings?.safeMode ? [] : [{ label: 'Tidy stickies', keys: '⌃⌥⌘T', cue: null, run: () => window.api.tidyStickies() }]),
            { label: 'reveal' in document.documentElement.dataset ? 'Blur private titles again' : 'Show private titles for now', cue: 'reveal' in document.documentElement.dataset ? 'off' : 'on', run: () => {
              const root = document.documentElement
              if ('reveal' in root.dataset) delete root.dataset.reveal
              else root.dataset.reveal = ''
            } },
            { label: 'Keyboard shortcuts', keys: '?', run: () => window.dispatchEvent(new CustomEvent('vigil:shortcuts')) },
            { label: 'Clear unused pictures…', run: () => window.dispatchEvent(new CustomEvent('vigil:unused')) },
            ...themeActions((text) => toast(text)),
            { label: settings?.blur === false ? 'Turn blurring on' : 'Turn blurring off', cue: settings?.blur === false ? 'on' : 'off', run: () => void vigil.setSettings({ blur: settings?.blur === false }) },
            { label: 'Settings', keys: '⌘,', run: () => setView({ id: 'settings' }) },
            { label: recent ? 'Hide Recent' : 'Recent: everything made lately, beside the page', keys: '⇧⌘Y', cue: null, run: toggleRecent },
            { label: 'Year: your seasons of life, month by month', cue: 'season', run: () => setView({ id: 'yearpage' }) },
            ...noteActions({ day: false }),
            // The recap, Wrapped's way, over Stats.
            { label: 'Your month, wrapped', run: () => setView({ id: 'stats', focus: 'month', nonce: Date.now() }) },
            { label: 'Your year, wrapped', run: () => setView({ id: 'stats', focus: 'year', nonce: Date.now() }) }
          ]}
          onClose={() => (setSearching(false), setSearchFor(''))}
          onAside={(type, id) => {
            setSearching(false)
            setSearchFor('')
            aside(stepOf(type, id))
          }}
          onOpen={(type, id) => {
            setSearching(false)
            setSearchFor('')
            open(type, id)
          }}
        />
      )}

      {/* Like Raycast's settings window: the sidebar is a card of its own with
          the window's buttons set into it, and the page beside it has only a
          slim bar. The bar and the card's top drag the window; every control
          on them says it does not. */}
      <div className="flex min-h-0 flex-1 gap-2 p-2">
      {sidebar && (
      // Customize opens beside the whole sidebar, just under the window's top bar, so it never hides the bar nor runs off the window.
      <Popover open={customizing} onOpenChange={setCustomizing}>
      <PopoverAnchor asChild>
      <aside data-chrome className={`group/side flex shrink-0 flex-col overflow-hidden rounded-xl border bg-accent/20 ${narrow ? 'w-12' : 'w-56'}`}>
        {/* Room for the traffic lights, and somewhere to hold the window by.
            It stays put: only the list under the search scrolls, so nothing
            ever slides under the window's buttons. */}
        <div className="h-10 shrink-0" style={{ WebkitAppRegion: 'drag' } as CSSProperties} />
        <div className="shrink-0 px-2 pb-2">
          <button
            type="button"
            data-tour="search"
            aria-label="Search"
            onClick={() => setSearching('all')}
            className={`flex w-full items-center gap-2 rounded-lg bg-accent/60 py-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground ${narrow ? 'justify-center px-0' : 'px-2.5'}`}
          >
            <AliveIcon icon={MagnifierIcon} size={16} />
            {!narrow && <span className="flex-1 text-left">Search…</span>}
            {!narrow && <Pressed keys="⌘K" />}
          </button>
        </div>
        <div ref={sideList} {...sideHover.handlers} className="mf-fade-end relative isolate flex min-h-0 flex-1 flex-col overflow-y-auto px-2 pt-1 pb-3">
        <Highlight spot={sideChosen.spot} snap={sideChosen.snap} travel={spring.moderate} className="bg-accent" />
        <Highlight spot={sideHover.spot} session={sideHover.session} snap={sideHover.snap} from={sideChosen.spot} />
        <nav className="flex flex-col gap-px">
          {(() => {
            // Where a promoted capture or a new task flies to (lib/fly-home.ts).
            const homeOf = (id: string): string | undefined => (id === 'nuggets' ? 'nugget' : id === 'upcoming' ? 'task' : id === 'questions' ? 'question' : undefined)
            // A fold's heading stands in for the rows it holds while they are shut away.
            const homesIn = (list: typeof SECTIONS): string | undefined => list.map((section) => homeOf(section.id)).filter(Boolean).join(' ') || undefined
            const row = (section: (typeof SECTIONS)[number]): React.JSX.Element => (
              <Tooltip key={section.id}>
              <TooltipTrigger asChild>
              <button
                type="button"
                data-home={homeOf(section.id)}
                data-tour={section.id === 'inbox' || section.id === 'review' ? section.id : undefined}
                data-side-row
                data-queue-drop={section.id === 'queue' ? '' : undefined}
                aria-label={section.label}
                aria-current={view.id === section.id ? 'page' : undefined}
                onClick={() => setView({ id: section.id })}
                className={`group relative flex items-center gap-2.5 rounded-md py-1.5 transition-colors duration-80 ${narrow ? 'justify-center px-0' : 'px-2'} ${view.id === section.id ? 'text-foreground' : 'text-foreground/80'} data-[queue-hot]:bg-[color-mix(in_oklab,var(--tt-color-text-blue)_16%,transparent)] data-[queue-hot]:text-foreground data-[queue-hot]:ring-1 data-[queue-hot]:ring-[color-mix(in_oklab,var(--tt-color-text-blue)_45%,transparent)]`}
              >
                {/* Each icon keeps its colour, softened while at rest so the hues do not
                    shout at once; the one you are on, or reaching for, is in full. */}
                <PlaceIcon place={section} full={view.id === section.id} />
                {!narrow && <Weighted on={view.id === section.id} className="flex-1 text-left">{section.label}</Weighted>}
                {!narrow && counts[section.id] ? (
                  <Rolling
                    text={counts[section.id]}
                    className={`text-xs tabular-nums ${section.id === 'today' ? 'text-[var(--tt-color-text-orange)]' : 'text-muted-foreground'}`}
                  />
                ) : null}
              </button>
              </TooltipTrigger>
              <TooltipContent side="right" className="flex items-center gap-1.5">
                {/* The name only when the icon stands alone; beside its name, just the keys. */}
                {narrow && <>{section.label} </>}<Pressed keys={`G ${section.key.toUpperCase()}`} />
              </TooltipContent>
              </Tooltip>
            )
            // A group's name, small: click folds it; pointed at, it offers Customize.
            const heading = (label: string, open: boolean, fold: (open: boolean) => void, customize = true, near?: string): React.JSX.Element =>
              narrow ? <div key={label} className="mt-3" /> : (
                <div key={label} className="group/head mt-3 mb-0.5 flex items-center">
                  <button
                    type="button"
                    aria-expanded={open}
                    data-side-row
                    data-home-near={near}
                    onClick={() => (chime(open ? 'fold' : 'slide'), fold(!open))}
                    className="flex flex-1 items-center gap-1 rounded-md px-2 py-0.5 text-left text-meta text-muted-foreground transition-colors duration-80 hover:text-foreground data-[fluid-hover-active]:text-foreground"
                  >
                    {label}
                    <ChevronRight className={`size-3 transition-[rotate,opacity] duration-80 ${open ? 'rotate-90 opacity-0 group-hover/head:opacity-100' : ''}`} />
                  </button>
                  {customize && (
                    <Tip label="Customize sidebar">
                      <button type="button" onClick={() => setCustomizing(true)}
                        className="rounded p-0.5 text-muted-foreground opacity-0 transition-opacity group-hover/head:opacity-100 hover:bg-accent hover:text-foreground focus-visible:opacity-100">
                        <Wrench className="size-3.5" />
                      </button>
                    </Tip>
                  )}
                </div>
              )
            // Open, a group's rows hang off its heading, the way down to where you are lit.
            const branched = (list: typeof SECTIONS): React.JSX.Element => (
              <Branches current={list.findIndex((section) => section.id === view.id)} className="flex flex-col gap-px">{list.map(row)}</Branches>
            )
            // A fold opens to its height and shuts to nothing; shut, the row you are on still shows under its heading.
            const folding = (list: typeof SECTIONS, open: boolean): React.JSX.Element => (<>
              <Unfold open={open && !narrow}>{branched(list)}</Unfold>
              {!(open && !narrow) && list.filter((section) => narrow || view.id === section.id).map(row)}
            </>)
            const visible = SECTIONS.filter((section) => shown.includes(section.id))
            const hidden = SECTIONS.filter((section) => !shown.includes(section.id))
            const first = SECTIONS.findIndex((section) => section.group)
            const loose = (after: boolean): typeof SECTIONS => visible.filter((section) => !section.group && SECTIONS.indexOf(section) > first === after)
            const group = (name: string, open: boolean, fold: (open: boolean) => void): React.JSX.Element | null => {
              const list = visible.filter((section) => section.group === name)
              if (!list.length) return null
              // Folded, the one you are on still shows, so you never lose your place.
              return <Fragment key={name}>{heading(name, open, fold, true, homesIn(list))}{folding(list, open)}</Fragment>
            }
            return (<>
              {loose(false).map(row)}
              {/* The split open now, as one row under its own name, never among the
                  pinned: Pinned holds only what was pinned. Not shown when it is one
                  of the pinned layouts, whose row lights instead. */}
              {split.panes.length > 1 && !layouts.some((one) => sameLayout(one.views, split.panes.map((pane) => pane.trail.views[pane.trail.at]))) && (() => {
                const views = split.panes.map((pane) => pane.trail.views[pane.trail.at])
                return (<>
                  {narrow ? <div className="mt-3" /> : <div data-side-heading="split" className="mt-3 mb-0.5 px-2 py-0.5 text-meta text-muted-foreground">Side by side</div>}
                  <PairRow key="live" live isPinned={false} narrow={narrow} names={views.map(paneName)} menu={pairMenu(views, {})}
                    onOpen={(index) => (chime('tap'), toFront(split.panes[index].key))} onClose={(index) => closePane(split.panes[index].key)} />
                </>)
              })()}
              {/* Pinned, Notion's Favourites: only there while something is. */}
              {(pins.length > 0 || layouts.length > 0) && (<>
                {heading('Pinned', pinsOpen, setPinsOpen, false)}
                <Unfold open={pinsOpen || narrow}><Branches current={-1} bare={narrow} className="flex flex-col gap-px">{[
                  ...layouts.map((one) => {
                    const live = split.panes.length > 1 && sameLayout(one.views, split.panes.map((pane) => pane.trail.views[pane.trail.at]))
                    return <PairRow key={one.id} live={live} isPinned narrow={narrow} names={one.views.map(paneName)} menu={pairMenu(one.views, live ? {} : null, one.id)}
                      onOpen={(index) => (live ? (chime('tap'), toFront(split.panes[index].key)) : openLayout(one.views, one.sizes))}
                      onClose={live ? (index) => closePane(split.panes[index].key) : undefined} />
                  }),
                  ...pins.map((pin) => {
                  const kind = CAPTURE_TYPES.find((type) => type.id === pin.kind) ?? CAPTURE_TYPES[0]
                  const table = pin.type === 'capture' ? 'captures' : 'nuggets'
                  return (
                    <RowMenu key={pin.id} items={[
                      { label: 'Open', run: () => open(pin.type, pin.id) },
                      'separator',
                      { label: 'Unpin', run: () => void vigil.pin(table, pin.id, false).then(() => chime('unpin')) }
                    ]}>
                      <span className="flex min-w-0">
                      <Tip label={narrow ? pin.title || 'Untitled' : ''}>
                      <button
                        type="button"
                        data-private={pin.private ? '' : undefined}
                        data-side-row
                        data-drag-open={`${pin.type}:${pin.id}`}
                        onClick={() => open(pin.type, pin.id)}
                        className={`flex min-w-0 flex-1 items-center gap-2.5 rounded-md py-1.5 text-foreground/80 ${narrow ? 'justify-center px-0' : 'px-2'}`}
                      >
                        <kind.icon className="size-4 shrink-0" style={{ color: kind.tint }} />
                        {!narrow && <span className="private-text min-w-0 flex-1 truncate text-left">{pin.title || 'Untitled'}</span>}
                      </button>
                      </Tip>
                      </span>
                    </RowMenu>
                  )
                })]}</Branches></Unfold>
              </>)}
              {group('Tasks', tasksOpen, setTasksOpen)}
              {group('Saved', keptOpen, setKeptOpen)}
              {loose(true).length > 0 && <div className="mt-3" />}
              {loose(true).map(row)}
              {/* Everything not shown, one fold away; G and a letter reach it anyway. */}
              {hidden.length > 0 && (narrow ? (
                <Tip label="More">
                  <button type="button" data-side-row data-home-near={homesIn(hidden)} aria-expanded={moreOpen} aria-label="More" onClick={() => (chime(moreOpen ? 'fold' : 'slide'), setMoreOpen(!moreOpen))}
                    className="mt-3 flex justify-center rounded-md py-1 text-muted-foreground hover:text-foreground">
                    <AliveIcon icon={DotsHorizontalIcon} size={16} />
                  </button>
                </Tip>
              ) : heading('More', moreOpen, setMoreOpen, true, homesIn(hidden)))}
              {narrow ? hidden.filter((section) => moreOpen || view.id === section.id).map(row) : folding(hidden, moreOpen)}
            </>)
          })()}
        </nav>

        {!narrow && (<>
        <button
          type="button"
          data-side-row
          aria-expanded={kindsOpen}
          onClick={() => (chime(kindsOpen ? 'fold' : 'slide'), setKindsOpen(!kindsOpen))}
          className="mt-3 mb-0.5 flex items-center gap-1 rounded-md px-2 py-0.5 text-meta text-muted-foreground transition-colors duration-80 hover:text-foreground data-[fluid-hover-active]:text-foreground"
        >
          Types <ChevronRight className={`size-3 transition-transform duration-80 ${kindsOpen ? 'rotate-90' : ''}`} />
        </button>
        <Unfold open={kindsOpen}>
          <Branches current={CAPTURE_TYPES.findIndex((type) => view.id === `kind:${type.id}`)} className="flex flex-col">
          {CAPTURE_TYPES.map((type) => {
            const count = captures.filter((capture) => capture.kind === type.id && capture.status !== 'discarded' && !capture.archivedAt).length
            return (
              <button
                key={type.id}
                type="button"
                data-side-row
                aria-current={view.id === `kind:${type.id}` ? 'page' : undefined}
                onClick={() => setView({ id: `kind:${type.id}` })}
                className={`flex w-full items-center gap-2.5 rounded-md px-2 py-1 ${view.id === `kind:${type.id}` ? '' : 'text-foreground/80'}`}
              >
                <type.icon className="size-4" style={{ color: type.tint }} />
                <Weighted on={view.id === `kind:${type.id}`} className="flex-1 text-left">{type.label}</Weighted>
                <span className="text-xs text-muted-foreground tabular-nums">{count ? <Rolling text={count} /> : ''}</span>
              </button>
            )
          })}
          </Branches>
        </Unfold>

        {/* Your most used tags, with counts, the way Todoist keeps favourite labels. */}
        {tags.length > 0 && (
          <button
            type="button"
            data-side-row
            aria-expanded={tagsOpen}
            onClick={() => (chime(tagsOpen ? 'fold' : 'slide'), setTagsOpen(!tagsOpen))}
            className="mt-3 mb-0.5 flex items-center gap-1 rounded-md px-2 py-0.5 text-meta text-muted-foreground transition-colors duration-80 hover:text-foreground data-[fluid-hover-active]:text-foreground"
          >
            Tags <ChevronRight className={`size-3 transition-transform duration-80 ${tagsOpen ? 'rotate-90' : ''}`} />
          </button>
        )}
        <Unfold open={tagsOpen && tags.length > 0}>
          <Branches current={view.id === 'tags' ? sideTags.findIndex(({ tag }) => tag === view.focus) : -1} className="flex flex-col">
          {sideTags.map(({ tag, count, color }) => (
            <button
              key={tag}
              type="button"
              data-side-row
              aria-current={view.id === 'tags' && view.focus === tag ? 'page' : undefined}
              onClick={() => setView({ id: 'tags', focus: tag })}
              // Read ahead while the pointer rests on it, so the click shows it at once.
              onPointerEnter={() => prefetchTag(tag)}
              className={`flex w-full items-center gap-2.5 rounded-md px-2 py-1 ${view.id === 'tags' && view.focus === tag ? '' : 'text-foreground/80'}`}
            >
              <TagIcon tag={tag} color={color} />
              <Weighted on={view.id === 'tags' && view.focus === tag} className="flex-1 text-left">{tag}</Weighted>
              {pinnedTags.includes(tag) && <PinMark className="size-3 text-muted-foreground" aria-label="Pinned" />}
              <span className="text-xs text-muted-foreground tabular-nums"><Rolling text={count} /></span>
            </button>
          ))}
          </Branches>
        </Unfold>
        </>)}

        </div>
        {/* One row at the foot, the way Notion keeps its workspace menu: Settings,
            Safe mode, Blurring, the keys and the tour wait behind Vigil's name.
            Safe mode on still shows, since a quiet box should say why. */}
        <div className={`mx-2 mb-2 flex shrink-0 items-center gap-1 border-t pt-2 ${narrow ? 'flex-col' : ''}`}>
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              <button type="button" aria-label="Vigil menu"
                className={`flex min-w-0 items-center gap-2 rounded-md py-1.5 text-foreground/80 transition-colors hover:bg-accent/60 data-[state=open]:bg-accent/60 ${narrow ? 'justify-center px-0' : 'flex-1 px-2'}`}>
                <AliveIcon icon={GearIcon} size={16} />
                {!narrow && <span className="flex-1 truncate text-left">{SANDBOX ? 'Vigil sandbox' : <BookName />}</span>}
                {!narrow && <AliveIcon icon={DownChevron} size={14} className="text-muted-foreground" />}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="top" align="start" className="w-60">
              <DropdownMenuItem onSelect={() => setView({ id: 'settings' })}>Settings<DropdownMenuShortcut>⌘,</DropdownMenuShortcut></DropdownMenuItem>
              <DropdownMenuItem onSelect={() => void window.api.importFrom('vault')}>Import from Obsidian or Notion…</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuCheckboxItem checked={!!settings?.safeMode} onSelect={(event) => event.preventDefault()} onCheckedChange={() => safeMode()}>
                Safe mode<DropdownMenuShortcut>⌥⌘S</DropdownMenuShortcut>
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem checked={settings?.blur !== false} onSelect={(event) => event.preventDefault()} onCheckedChange={() => blurring()}>
                Blurring
              </DropdownMenuCheckboxItem>
              {/* Every sticky down the right middle of its screen, clear of other apps' buttons at the top right. */}
              {!settings?.safeMode && <DropdownMenuItem onSelect={() => window.api.tidyStickies()}>Tidy stickies<DropdownMenuShortcut>⌃⌥⌘T</DropdownMenuShortcut></DropdownMenuItem>}
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => window.dispatchEvent(new CustomEvent('vigil:shortcuts'))}>Keyboard shortcuts<DropdownMenuShortcut>?</DropdownMenuShortcut></DropdownMenuItem>
              <DropdownMenuItem onSelect={playWelcome}>Show the welcome again</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => askBook('switch')}>Switch book…</DropdownMenuItem>
              {!SANDBOX && <DropdownMenuItem onSelect={() => void askNewBook()}>New book…</DropdownMenuItem>}
              {SANDBOX ? (<>
                <DropdownMenuItem onSelect={() => void leaveSandbox()}>Back to my notes</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => void resetSandbox()}>Reset the sandbox</DropdownMenuItem>
              </>) : (
                <DropdownMenuItem onSelect={() => void enterSandbox()}>Open the sandbox…</DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              {/* Used once, so it waits here rather than taking a row of the sidebar; each group's ··· has it too. */}
              <DropdownMenuItem onSelect={() => setTimeout(() => setCustomizing(true), 0)}>Customize sidebar…</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          {settings?.safeMode && (
            <Tip label="Safe mode is on: no hints, old captures or pinned notes come up  ⌥⌘S">
              <button type="button" aria-label="Turn safe mode off" onClick={safeMode}
                className="flex size-7 items-center justify-center rounded-md text-[color-mix(in_srgb,var(--tt-brand-color-400)_55%,var(--foreground))] transition-colors hover:bg-accent/60">
                <AliveIcon icon={ShieldCheck} size={16} />
              </button>
            </Tip>
          )}
          <Tip label="Keyboard shortcuts  ?">
            <button type="button" aria-label="Keyboard shortcuts" onClick={() => window.dispatchEvent(new CustomEvent('vigil:shortcuts'))}
              className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground">
              <CircleHelp className="size-4" strokeWidth={2} />
            </button>
          </Tip>
        </div>
      </aside>
      </PopoverAnchor>
      <PopoverContent side="right" align="start" sideOffset={8} alignOffset={52}
        // Its own row toggles it: a click there is not a click away.
        onInteractOutside={(event) => (event.target as Element | null)?.closest?.('[data-customize]') && event.preventDefault()}
        className="max-h-[calc(var(--radix-popover-content-available-height)-60px)] w-72 gap-1 overflow-y-auto p-1.5">
        <p className="px-2 pt-1 pb-1.5 text-meta text-muted-foreground">Shown in the sidebar. The rest wait under More, and G with their letter still goes to them.</p>
        <ShowList places={SECTIONS} setting="sidebarShown" />
      </PopoverContent>
      </Popover>
      )}

      <div className="flex min-w-0 flex-1 flex-col gap-2">
      {/* Clear of the traffic lights whatever sits to the left: nothing, or the folded rail. */}
      <header className={`@container/bar flex h-8 shrink-0 items-center gap-1 ${!sidebar ? 'pl-[84px]' : narrow ? 'pl-3' : ''}`} style={{ WebkitAppRegion: 'drag' } as CSSProperties}>
        {[
          { icon: LayoutSidebarRightIcon, flip: true, label: sidebar ? 'Hide the sidebar' : 'Show the sidebar', keys: '⌘B', run: () => (chime(sidebar ? 'fold' : 'slide'), setSidebar(!sidebar)) },
          // With the sidebar away, its search field comes up here as a button.
          ...(sidebar ? [] : [{ icon: MagnifierIcon, flip: false, label: 'Search', keys: '⌘K', run: () => setSearching('all') }])
        ].map(({ icon, flip, label, keys, run }) => (
          <Tip key={keys} label={keyed(label, keys)}>
            {/* With the sidebar away, what would fly to it lands on the button that brings it back. */}
            <button type="button" aria-label={label} onClick={run} data-home-away={keys === '⌘B' && !sidebar ? '' : undefined} className={TOOL} style={{ WebkitAppRegion: 'no-drag' } as CSSProperties}>
              {/* itshover draws the panel on the right; ours is on the left. */}
              <AliveIcon icon={icon} size={16} className={flip ? '-scale-x-100' : ''} />
            </button>
          </Tip>
        ))}
        {/* Back and forward as one pill, the way Raycast and Safari join them. */}
        <span className={PILL} style={{ WebkitAppRegion: 'no-drag' } as CSSProperties}>
          {[
            { icon: ArrowNarrowLeftIcon, label: 'Back', keys: '⌘[', run: () => step(-1), off: trail.at === 0 },
            { icon: ArrowNarrowRightIcon, label: 'Forward', keys: '⌘]', run: () => step(1), off: trail.at === trail.views.length - 1 }
          ].map(({ icon, label, keys, run, off }, index) => (
            <Tip key={label} label={keyed(label, keys)}>
              <button type="button" aria-label={label} disabled={off} onClick={run}
                className={`flex h-full w-8 items-center justify-center text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground disabled:pointer-events-none disabled:opacity-40 ${index ? 'border-l' : ''}`}>
                <AliveIcon icon={icon} size={16} />
              </button>
            </Tip>
          ))}
        </span>
        {/* Split, the pane in front can be closed from here too, as with ⌃W. */}
        {split.panes.length > 1 && (
          <Tip label={keyed('Close this pane', '⌃W')}>
            <button type="button" aria-label="Close this pane" onClick={() => closePane()} className={`${TOOL} ml-1`} style={{ WebkitAppRegion: 'no-drag' } as CSSProperties}>
              <AliveIcon icon={XIcon} size={16} />
            </button>
          </Tip>
        )}
        {/* In the sandbox, always: where you are, and the two ways out. */}
        <SandboxPill />
        {/* Never squeezed by what sits before it (the sandbox pill gives way instead): cut short only past two fifths of the bar. */}
        {(() => {
          const title = <h1 data-pane-title className="ml-2 max-w-[40%] shrink-0 truncate font-medium" style={{ textWrap: 'nowrap', WebkitAppRegion: split.panes.length > 1 ? 'no-drag' : undefined } as CSSProperties}><Term>{SECTIONS.find((section) => section.id === view.id)?.label ?? (kind(view) ? kind(view)!.label : view.id === 'settings' ? 'Settings' : view.id === 'yearpage' ? 'Year' : '')}</Term></h1>
          // Split, the page's name is the split's header: a right click there has the pair's menu.
          return split.panes.length > 1 ? <RowMenu items={pairMenu(split.panes.map((pane) => pane.trail.views[pane.trail.at]), { key: split.front })}>{title}</RowMenu> : title
        })()}
        {/* The open note's name, faint, once its first line has scrolled away. */}
        <TopTitle on={settings?.topTitle !== false} />
        {/* The window's own settings, quiet and side by side: what you hear, how much screen it takes. */}
        <span className="flex items-center">
          <SoundToggle className={TOOL} />
          <Tip label={keyed(fill ? 'Back to compact' : 'Fill the screen', '⌃⇧F')}>
            <button type="button" aria-label={fill ? 'Back to compact' : 'Fill the screen'} aria-pressed={fill} onClick={() => setFill(!fill)}
              style={{ WebkitAppRegion: 'no-drag' } as CSSProperties}
              className={TOOL}>
              {fill ? <Minimize2 strokeWidth={2} /> : <AliveIcon icon={ExpandIcon} size={16} />}
            </button>
          </Tip>
        </span>
        {/* The one thing the window is for, so the one with an edge: the same pill as back and forward, its key beside it. */}
        <Tip label={keyed('New capture, in quick capture', '⌘N')}>
          <button type="button" onClick={() => (chime('open'), window.api.showPrompt())}
            style={{ WebkitAppRegion: 'no-drag' } as CSSProperties}
            className={`${PILL} ml-1.5 shrink-0 gap-1.5 pr-1.5 pl-3 text-control font-medium text-foreground/90 transition-colors hover:bg-accent/60 hover:text-foreground`}>
            <AliveIcon icon={PenIcon} size={14} />
            New
            <Pressed keys="C" className="ml-1 h-[18px] min-w-[18px] rounded-[5px]" />
          </button>
        </Tip>
      </header>
      {/* The first time a page is reached, one line on what it is for. */}
      <PageHint page={view.id} />
      {/* The page itself, a card like the sidebar's. */}
      <div className="relative flex min-h-0 flex-1 gap-2">
      <SplitDrop panes={split.panes.length} onDrop={dropAside} />
      <SplitPanes
        apis={apis}
        front={split.front}
        sizes={split.sizes}
        onSizes={(sizes) => setSplit((now) => ({ ...now, sizes }))}
        onFront={toFront}
        onClose={closePane}
        onWidth={paneWidth}
        menuFor={(key) => pairMenu(split.panes.map((pane) => pane.trail.views[pane.trail.at]), { key })}
        panes={split.panes.map(({ key, trail, width }) => { const name = paneName(trail.views[trail.at]); return { key, width, at: trail.at, label: name.title, private: name.private, node: pageFor(key, trail.views[trail.at]) } })}
      />
      {/* Beside the page, not over it, while there is room; over its right edge in a narrow window. */}
      <AnimatePresence>
        {recent && (
          <motion.div
            key="recent"
            initial={{ opacity: 0, transform: shift('translateX(16px)') }}
            animate={{ opacity: 1, transform: shift('translateX(0px)') }}
            // Put away quicker than it came: closing is the answer, not a show.
            exit={{ opacity: 0, transform: shift('translateX(16px)'), transition: { duration: 0.14, ease: EASE } }}
            transition={{ duration: 0.2, ease: EASE }}
            className={`flex min-h-0 overflow-hidden rounded-xl border bg-background ${cramped ? 'absolute inset-y-0 right-0 z-20 w-72 shadow-(--mf-panel-shadow)' : 'w-72 shrink-0'}`}
          >
            <RecentPanel className="flex-1" until={recent.until ?? undefined} onClose={() => setRecentState(null)}
              // Beside a week's page, a note opens in its own window so the page stays.
              onOpen={(type, id) => (view.id === 'weekpage' && type !== 'task' ? openWindow(type, id) : open(type, id))} />
          </motion.div>
        )}
      </AnimatePresence>
      </div>
      </div>
      </div>
    </div>
    </TooltipProvider>
  )
}
