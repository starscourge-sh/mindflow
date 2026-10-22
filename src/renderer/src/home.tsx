import { detailsShown, showDetails } from '@/lib/reading'
import { themeActions } from '@/lib/theme'
import { useAbandonAction } from '@/lib/abandon'
import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties } from 'react'
import { FileText, Minimize2, PanelsTopLeft } from 'lucide-react'
import CameraIcon from '@/components/ui/camera-icon'
import CameraOffIcon from '@/components/ui/camera-off-icon'
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuShortcut, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { AnimatePresence, motion } from 'motion/react'
import { EASE, byKeys, keyedMotion, shift, spring } from './lib/motion'
import { Highlight, Unfold, useChosen, useFluidHover, Weighted } from './components/haligtree/glide'
import { chime, chimedWithin, pageTurn, paper, soundOn, tickedWithin, turnedNow } from './lib/sound'
import { peekRead, readOnPress, whenRead } from './lib/early-read'
import { WarmEditor } from './components/haligtree/warm-editor'
import { PageSwap } from './components/haligtree/page-swap'
import { foldEverything } from './extensions/heading-fold'
import { NotePreview } from './components/haligtree/note-preview'
import { TASK_KIND } from './components/haligtree/everything'
import { PickDays } from './components/haligtree/late-tasks'

import { CAPTURE_TYPES } from './components/capture-kinds/capture-kind-picker'
import { useCaptures, type CaptureMeta } from './components/capture-list'
import { Search, type Action } from './components/search'
import { keepTyped } from './lib/keep-typed'
import { landPromoted } from './lib/promote'
import { CapturesView } from './components/haligtree/captures-view'
import { ItemsView } from './components/haligtree/items-view'
import { startQuestion } from './components/haligtree/questions-view'
import { GoalsView, startGoal } from './components/haligtree/goals-view'
import { QueueReader, QueueView } from './components/haligtree/queue-view'
import { useQueue } from './lib/reading-queue'
import { ReviewView } from './components/haligtree/review-view'
import { HomeView } from './components/haligtree/home-view'
import { SettingsView } from './components/haligtree/settings-view'
import { StatsView } from './components/haligtree/stats-view'
import { PracticesView } from './components/haligtree/practices-view'
import { usePracticeActions } from '@/lib/practices'
import { MapView } from './components/haligtree/map-view'
import { PowersView } from './components/haligtree/powers-view'
import { TagsView } from './components/haligtree/tags-view'
import { SourcePageView, SourcesView } from './components/haligtree/source-page'
import { TagIcon } from './components/haligtree/tag-icon'
import { prefetchTag, renameTag } from './components/haligtree/tag-read'
import { TasksView, askDate, askSessions } from './components/haligtree/tasks-view'
import { WeekView } from './components/haligtree/week-view'
import { CalendarView } from './components/haligtree/calendar-view'
import { MatrixView } from './components/haligtree/matrix-view'
import { bucket, onToday, picked, taskName } from './lib/tasks'
import { stickOnDesktop } from './components/haligtree/sticky-note'
import { Count, Toaster, toast, refuse, typing, HELD, FocusNote, useFocusMode, SoundToggle, quietly } from './components/haligtree/ui'
import { GrowFrom } from './components/haligtree/grow-from'
import { FocusScenery } from './components/haligtree/scenery'
import { TooltipProvider } from './components/ui/tooltip'
import { SidePeek } from './components/haligtree/page-peeks'
import { MenuPeek } from './components/haligtree/menu-peeks'
import { useStickiesOut } from './lib/stickies-out'
import { useReadsIn } from './lib/reads-in'
import { call, unloaded, useAppearance, useLive, haligtree, type Item, type Pin, type Settings, type Task } from './lib/haligtree'
import { Button } from '@/components/ui/button'
import { allRecorded, recordAll } from './lib/recordings'
import { Tip, showTopTitle, useTopTitle, Pressed, useEscapeLeavesEditor } from '@/components/haligtree/ui'
import { Celebrations, tryCelebration } from '@/components/haligtree/celebrate'
import MagnifierIcon from '@/components/ui/magnifier-icon'
import ExpandIcon from '@/components/ui/expand-icon'
import GearIcon from '@/components/ui/gear-icon'
import LayoutSidebarRightIcon from '@/components/ui/layout-sidebar-right-icon'
import ArrowNarrowLeftIcon from '@/components/ui/arrow-narrow-left-icon'
import ArrowNarrowRightIcon from '@/components/ui/arrow-narrow-right-icon'
import PenIcon from '@/components/ui/pen-icon'
import ShieldCheck from '@/components/ui/shield-check'
import DownChevron from '@/components/ui/down-chevron'
import { AliveIcon } from '@/components/ui/alive-icon'
import { ShortcutSheet } from '@/components/haligtree/shortcut-sheet'
import { UnusedFiles } from '@/components/haligtree/unused-files'
import { Tour } from '@/components/haligtree/tour'
import { SandboxHost, SandboxPill } from '@/components/haligtree/sandbox'
import { SANDBOX, enterSandbox, leaveSandbox, resetSandbox } from '@/lib/sandbox'
import { askBook } from '@/lib/books'
import { BookName, askNewBook } from '@/components/haligtree/books'
import { Welcome } from '@/components/haligtree/welcome'
import { WelcomeTwo } from '@/components/haligtree/welcome-v2'
import { PageHint } from '@/components/haligtree/page-hint'
import { onboarding, playWelcome, tryWelcome } from '@/lib/onboarding'
import { DayView } from '@/components/haligtree/day-view'
import { MonthPage, SCALE_VIEW, WeekPage, YearPage, mondayOf, type Scale } from '@/components/haligtree/periods-view'
import { RecentPanel } from '@/components/haligtree/recent-panel'
import { Passes, openPass } from '@/components/haligtree/pass'
import { noteActions } from '@/lib/notes'
import { headingIn } from '@/lib/capture-links'
import { openApart } from '@/lib/apart'
import { PlaceIcon, SECTIONS, ShowList, dropOrder, earn, orderItems, risen, showWords, sidebarParts, useInOrder, useOrder, useSections, useShown, useWaiting, type Group } from '@/components/haligtree/places'
import { SortableList, SortableRow } from '@/components/haligtree/sortable'
import { pageTravel } from '@/lib/page-travel'
import { Branches } from '@/components/haligtree/branches'
import { Term, WordNotes } from '@/components/haligtree/term'
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover'
import { RowMenu } from '@/components/haligtree/row-menu'
import { onRemoveKey, pinFromSide, sideMenu, useFullMenu } from '@/components/haligtree/side-menu'
import { touch as touchOpen } from '@/lib/open-today'
import { useStoredFlag } from '@/lib/use-stored-flag'
import { NavContext, type Nav, type Step } from '@/lib/nav'
import { SplitPanes, type PaneApi } from '@/components/haligtree/panes'
import { SplitDrop, type Carried, type Side } from '@/components/haligtree/split-drop'
import { rowOf } from '@/components/haligtree/row-card'
import { PairRow, pinLayout, sameLayout, unpinLayout, usePinnedLayouts, type PaneName } from '@/components/haligtree/split-pairs'
import type { BookRef } from '@/lib/books'
import type { RowItem } from '@/components/haligtree/row-menu'
import { MAX_PANES, asideClick, asideItem, keepTitle, roomFor, setPaneNotes, setPanes, spendAsideClick, titleOf, type PaneWidth } from '@/lib/split'
import XIcon from '@/components/ui/x-icon'
import { WhatsNewPage, openWhatsNew } from '@/components/haligtree/whats-new'
import { BinView } from '@/components/haligtree/bin-view'
import { CloseDaySheet, openCloseDay } from '@/components/haligtree/close-day'
import { writeOutDay } from '@/components/haligtree/day-list'
import { SortSheet } from '@/components/haligtree/sort-out'
import { openInboxSort } from '@/lib/sort-out'
import { ExpandedSheet } from '@/components/note-link/expanded-note'
import { openCloseWeek } from '@/components/haligtree/close-week'
import { FIT_CHOICES, FitsSheet, fitsHeard, openFits } from '@/components/haligtree/fits'
import { openPlaybook } from '@/lib/playbook'
import { menuShowing } from '@/lib/menu-keys'
import { ChevronRight, CircleHelp } from '@/components/ui/icons'
import { still } from '@/lib/motion'
import { calendarAside, calendarPalette, revealOnCalendar } from '@/lib/calendar-scope'
import { dated, dayjs, dayKey, daysFromToday, noon, num } from '../../main/dates'
import { WrapOffer, WrapSheet, monthToWrap, openWrap } from '@/components/haligtree/wrap-story'
import { caretInLink } from './extensions/link-tidy'
import { APP_NAME } from '../../main/name'
import { countUse, takeWay, via, type Via } from '@/lib/usage'

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

/** The top bar's buttons, one size and one look, each named with its key on hover. */
const TOOL = 'flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground [&_svg]:size-4'
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
const holdsNotes = (id: string): boolean => !['home', 'day', 'weekpage', 'monthpage', 'yearpage', 'tags', 'sources', 'source', 'stats', 'map', 'powers', 'whatsnew', 'settings', 'review', 'queue', 'calendar', 'practices', 'kind:practice'].includes(id)
/** A step onto a note (not a task, a day or an event): the page that shows it turns, as a book's does. */
const turnsPage = (view: View): boolean => !!view.focus && holdsNotes(view.id) && !['today', 'tomorrow', 'upcoming', 'routines', 'later', 'goals', 'week', 'matrix', 'discarded'].includes(view.id)
/** Where one thing opens: a view by name, a day's page, or a note or task in its section. */
const stepOf = (type: string, id: string): View =>
  type === 'view' ? { id } : type === 'day' ? { id: 'day', focus: id } : type === 'event' ? { id: 'calendar', focus: `event:${id}` } : { id: type === 'capture' ? 'all' : type === 'task' ? 'upcoming' : `${type}s`, focus: id }
/** Pages that show one day, week, month or year: with no focus, or a focus in the present one, they are on now. */
const DATED = ['day', 'weekpage', 'monthpage', 'yearpage']
const atNow = (view: View): boolean => {
  const at = view.focus
  if (!DATED.includes(view.id) || !at) return true
  if (view.id === 'day') return at === dayKey()
  if (view.id === 'weekpage') return mondayOf(noon(at).toDate()) === mondayOf()
  if (view.id === 'monthpage') return at.slice(0, 7) === dayKey().slice(0, 7)
  return at.slice(0, 4) === dayKey().slice(0, 4)
}
/** A dated page on another day, week, month or year, named as the app says it elsewhere: "Yesterday", "15 October", "Last week". */
const datedName = (view: View): string | null => {
  if (atNow(view)) return null
  const at = view.focus!
  if (view.id === 'day') {
    const by = daysFromToday(noon(at))
    return by === -1 ? 'Yesterday' : by === 1 ? 'Tomorrow' : dated(noon(at), 'D MMMM')
  }
  if (view.id === 'weekpage') {
    const by = Math.round(noon(mondayOf(noon(at).toDate())).diff(noon(mondayOf()), 'day') / 7)
    return by === -1 ? 'Last week' : by === 1 ? 'Next week' : `Week of ${dated(noon(mondayOf(noon(at).toDate())), 'D MMMM')}`
  }
  if (view.id === 'monthpage') return dated(noon(`${at.slice(0, 7)}-01`), 'MMMM')
  return at.slice(0, 4)
}
function loadSplit(): SplitState {
  try {
    const kept = JSON.parse(localStorage.getItem(SPLIT) ?? 'null') as SplitState | null
    const fine = (pane: PaneState): boolean => typeof pane?.key === 'string' && Array.isArray(pane.trail?.views) && pane.trail.views.every((one) => typeof one?.id === 'string') && pane.trail.at >= 0 && pane.trail.at < pane.trail.views.length
    if (kept && Array.isArray(kept.panes) && kept.panes.length > 1 && kept.panes.length <= MAX_PANES && kept.panes.every(fine)) {
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
  // each pane of the page. Usually one; split, up to four side by side, the
  // one in front taking the keys, the header's Back and Forward and its title.
  const [split, setSplit] = useState<SplitState>(loadSplit)
  const splitRef = useRef(split)
  splitRef.current = split
  const frontRef = useRef(split.front)
  frontRef.current = split.front
  const front = split.panes.find((one) => one.key === split.front) ?? split.panes[0]
  const trail = front.trail
  const view = trail.views[trail.at]
  // The usage counts (lib/usage.ts): each move to another page counts that page
  // and how it was found; another note on the same page counts only when
  // something said how (a link, a search), so moving down a list is not counted.
  // Where the window opens is not a move.
  const seen = useRef<{ id: string; focus?: string } | null>(null)
  useEffect(() => {
    const was = seen.current
    seen.current = { id: view.id, focus: view.focus }
    if (!was || (was.id === view.id && was.focus === view.focus)) return
    const way = takeWay()
    if (was.id === view.id) return void (way && countUse(null, way))
    countUse(view.id, way ?? 'other')
  }, [view.id, view.focus])
  // Sent from another window or a notification: told how just before (main's sendHome).
  useEffect(() => window.api.onUsageVia((way) => via(way as Via)), [])
  // Said before anything in the panes listens for keys, so the right one answers.
  useLayoutEffect(() => setPanes(front.key, split.panes.length), [front.key, split.panes.length])
  // Which note each pane has open, so a list can mark its row L, M or R.
  useLayoutEffect(() => setPaneNotes(split.panes.map((one) => {
    const there = one.trail.views[one.trail.at]
    return holdsNotes(there.id) ? there.focus ?? null : null
  })), [split])
  // Kept across launches while the page is split; on its own, Haligtree opens on Home as always.
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
      // A day's, week's or month's page asked for by name goes to now, from any other day it is on.
      if (here.id === next.id && (here.focus === next.focus || (next.focus === undefined && atNow(here))) && here.nonce === next.nonce) return trail
      if (here.id === next.id && next.focus === undefined && !atNow(here)) chime(here.id === 'day' ? 'page' : 'season')
      // One sound a move: a place reached by something that already spoke (a map dot, ⌘K's Year) stays quiet.
      // A note opened on another page is heard as its page turn alone.
      if (here.id !== next.id && !chimedWithin(150) && !turnedNow(next.focus) && !tickedWithin(200)) chime('tap')
      return push(trail, next, scroll)
    })
  }
  const step = (by: -1 | 1, key = frontRef.current): void => {
    via('back')
    const scroll = scrolled(key)
    setTrail(key, ({ views, at }) => {
      const next = Math.max(0, Math.min(views.length - 1, at + by))
      if (next === at) return { views, at }
      // Back and forward sound like any other move between sections; onto a note, its page turn is the sound.
      if (!turnsPage(views[next])) chime('tap')
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
    if (next.focus) pageTurn(false, next.focus)
    else chime('slide')
    if (now.panes.length < 2 || (now.panes.length < MAX_PANES && roomFor(now.panes.length + 1))) {
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
    if (next.focus) pageTurn(false, next.focus)
    else chime('slide')
    if (now.panes.length < MAX_PANES) {
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
    // Closed by a slip of ⌃W or the ×: one Undo brings the pane back, where it was.
    quietly(() => setSplit(now))
    lastFocus.current.delete(key)
    toFront(next)
  }
  /** ⌘K's Pane to the left or right: the keys move, and it says which pane has them now. */
  const paneSaid = (by: -1 | 1): void => {
    const now = splitRef.current
    const to = now.panes[now.panes.findIndex((one) => one.key === now.front) + by]
    moveFront(by)
    if (to) toast(`${paneName(to.trail.views[to.trail.at]).title} has the keys now`, undefined, 'info')
  }
  /** ⌥⌘\: the page in front, again beside it. A note stays in one pane, so the copy shows its list with nothing open. */
  const splitFront = (): void => {
    if (splitRef.current.panes.length >= MAX_PANES) return void (chime('nope'), toast('Four panes at most: close one with ⌃W first'))
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
  // A person's or a source's page, asked for from a note's who or where anywhere in the window.
  useEffect(() => {
    const onSource = (event: Event): void => setView({ id: 'source', focus: (event as CustomEvent<string>).detail })
    window.addEventListener('haligtree:source', onSource)
    return () => window.removeEventListener('haligtree:source', onSource)
  })
  // What's new, asked for by the card, ⌘K or the Haligtree menu: its built-in pages.
  useEffect(() => {
    const onNews = (): void => (chime('page'), setView({ id: 'whatsnew' }))
    window.addEventListener('haligtree:whats-new', onNews)
    return () => window.removeEventListener('haligtree:whats-new', onNews)
  })
  // Opened to the side from anywhere in the window: a row's menu, a note's ⋯, an @ link's card.
  useEffect(() => {
    const onAside = (event: Event): void => {
      const { type, id, from } = (event as CustomEvent<{ type: string; id: string; from?: string | null }>).detail
      asideRef.current(stepOf(type, id), from ?? undefined)
    }
    window.addEventListener('haligtree:aside', onAside)
    return () => window.removeEventListener('haligtree:aside', onAside)
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
  // The groups fold too, Notion's way, and start open.
  const [pinsOpen, setPinsOpen] = useRemembered('sidebar:pinned', true)
  const [tasksOpen, setTasksOpen] = useRemembered('sidebar:tasks', true)
  const [notesOpen, setNotesOpen] = useRemembered('sidebar:notes', true)
  // Tasks' pages not used yet, under a quiet "More": shut to start, and each time Haligtree opens.
  const [moreOpen, setMoreOpen] = useState(false)
  const [keptOpen, setKeptOpen] = useRemembered('sidebar:kept', true)
  const [customizing, setCustomizing] = useState(false)
  // One light for the whole sidebar list, gliding to the row nearest the
  // pointer, and the page you are on marked by one fill that travels to the
  // next. A row folding shut is left out of both.
  const sideList = useRef<HTMLDivElement>(null)
  const sideHover = useFluidHover(sideList, { items: '[data-side-row]:not([inert] *)' })
  const sideChosen = useChosen(sideList, '[data-side-row][aria-current="page"]:not([inert] *)', `${view.id}:${view.focus ?? ''}`)
  // A calm sidebar: what serves capturing and coming back. One switched off is not there at all, a G or ⌘K away.
  const settings = useLive(haligtree.settings, null as Settings | null)
  const shownAll = useShown('sidebarShown')
  // Back after a long time away: only capture and Today, until the next start or "Show everything".
  const away = useLive(() => call<{ days: number; quiet: boolean }>('return:quiet'), { days: 0, quiet: false })
  const quiet = away.quiet
  // A growing sidebar's page opened for the first time (a chip, ⌘K, a link)
  // has its row from the same frame, rising in: waiting for main to write it
  // down left no row to light, and the light went out and came back.
  const rowId = view.id === 'practices' ? 'routines' : view.id
  const earning = !quiet && settings?.sidebarGrows && SECTIONS.some((one) => one.id === rowId) && !shownAll.includes(rowId) && !settings.sidebarMet.includes(rowId) ? rowId : null
  if (earning) risen.add(earning)
  const shown = quiet ? ['inbox', 'today'] : earning ? [...shownAll, earning] : shownAll
  const quietOpened = useRef(false)
  useEffect(() => {
    if (!quiet || quietOpened.current) return
    quietOpened.current = true
    setView({ id: 'today' })
  }, [quiet]) // eslint-disable-line react-hooks/exhaustive-deps
  // The places, and the pins, in your own order (dragged, or moved from a right click).
  const sidebarSaved = useOrder('sidebarOrder')
  // This book's places: a new book's grow with it, writing first (places.tsx, grownSections).
  const sections = useSections()
  const waiting = useWaiting().filter((one) => one.id !== earning)
  const ordered = useInOrder(sections, 'sidebarOrder', (section) => section.id)
  const pinSaved = useOrder('pinOrder')
  const pinsUsual = useLive(haligtree.pins, [] as Pin[])
  const pins = useInOrder(pinsUsual, 'pinOrder', (pin) => `${pin.type}:${pin.id}`)
  const fullMenu = useFullMenu()
  const tags = useLive(haligtree.tags, [] as Awaited<ReturnType<typeof haligtree.tags>>)
  // Pinned from a tag's page: those first, then the most used.
  const sideTags = tags.slice(0, 8)
  // The Tags heading is marked on the Tags page, and on a tag's page whose own row is folded away or not among these.
  const onTags = view.id === 'tags' && (!view.focus || !tagsOpen || !sideTags.some(({ tag }) => tag === view.focus))
  const captures = useCaptures()
  const dueRead = useLive(haligtree.dueCount, null as number | null, [], ['item'])
  const due = dueRead ?? 0
  const tasks = useLive(haligtree.tasks, [] as Task[])
  // What ⌘K offers for the Calendar, read once as it opens: the task picked on it, the day it shows.
  const palette = useMemo(() => (searching ? calendarPalette((day) => setView({ id: 'calendar', focus: day })) : null), [searching]) // eslint-disable-line react-hooks/exhaustive-deps
  const nuggets = useLive(() => haligtree.items('nugget'), [] as Item[], [], ['item'])
  const articles = useLive(() => haligtree.items('article'), [] as Item[], [], ['item'])
  const questions = useLive(() => haligtree.items('question'), [] as Item[], [], ['item'])
  const goals = useLive(() => haligtree.items('goal'), [] as Item[], [], ['item'])
  const queued = useQueue()
  // A new book's sidebar grows as it is used: a page opened any way (a row,
  // "More", ⌘K, G and its letter, a link) joins it for good, and so does a
  // page once the book has one of its things.
  const grows = !!settings?.sidebarGrows
  useEffect(() => {
    if (grows && SECTIONS.some((one) => one.id === rowId)) void earn([rowId])
  }, [grows, rowId])
  const has = [nuggets.length && 'nuggets', questions.length && 'questions', goals.length && 'goals', (queued.queue.length || queued.read.length) && 'queue', tags.length && 'tags'].filter(Boolean) as string[]
  useEffect(() => {
    if (grows && has.length) void earn(has)
  }, [grows, has.join(' ')]) // eslint-disable-line react-hooks/exhaustive-deps
  // "New" makes a blank page, as in Obsidian (a new book's way), or a capture in quick capture.
  const newPage = settings?.newMakes === 'page'
  const makeNew = (): void => {
    if (!newPage) return void (chime('open'), window.api.showPrompt())
    void haligtree.newArticle().then((id) => (chime('promote'), open('article', id)))
  }
  // Tags switched on for the sidebar (here or in Settings) unfold your tags under
  // their heading, so the switch shows them at once instead of only a folded name.
  const tagsOn = settings ? (settings.sidebarShown ?? []).includes('tags') : null
  const tagsOnWas = useRef<boolean | null>(null)
  useEffect(() => {
    if (tagsOn === null) return
    if (tagsOnWas.current === false && tagsOn) setTagsOpen(true)
    tagsOnWas.current = tagsOn
  }, [tagsOn]) // eslint-disable-line react-hooks/exhaustive-deps
  // ⌘K's Abandon session, while one runs.
  const abandonAction = useAbandonAction()
  const practiceActions = usePracticeActions()
  // Seen in screen recordings or not: all at once here, each kind of window on its own in Settings.
  const recordable = allRecorded(settings?.inRecordings)
  const [typewriter, setTypewriter] = useStoredFlag('typewriter')
  // A new section has no note scrolled: the last one's name does not follow you there.
  // The note's name in the top bar is the front pane's: kept for each pane as it scrolls (captures-view).
  const lastFront = useRef(split.front)
  useEffect(() => {
    if (lastFront.current !== split.front) return void ((lastFront.current = split.front), showTopTitle(titleOf(split.front)))
    keepTitle(split.front, null)
    showTopTitle(null)
  }, [split.front, view.id])

  // The note in front, opened: ⌘K lists it under Recent (lib/open-today.ts).
  useEffect(() => {
    const type = view.id === 'nuggets' ? 'nugget' : view.id === 'articles' ? 'article' : view.id === 'questions' ? 'question' : view.id === 'goals' ? 'goal' : ['inbox', 'all'].includes(view.id) || view.id.startsWith('kind:') ? 'capture' : null
    // Everything holds tasks too: a task open there is not a note opened.
    if (type && view.focus && !(view.id === 'all' && tasks.some((one) => one.id === view.focus))) touchOpen(type, view.focus)
  }, [view.id, view.focus]) // eslint-disable-line react-hooks/exhaustive-deps
  // A note carried onto Pinned in the sidebar (split-drop.tsx).
  useEffect(() => {
    const onDrop = (event: Event): void => {
      const { to, open: carried } = (event as CustomEvent<{ to: string; open: string }>).detail
      const at = carried.indexOf(':')
      const [type, id] = [carried.slice(0, at), carried.slice(at + 1)]
      if (type === 'task' || !id) return void chime('nope')
      if (to === 'pinned') void pinFromSide(type, id)
    }
    window.addEventListener('haligtree:side-drop', onDrop)
    return () => window.removeEventListener('haligtree:side-drop', onDrop)
  }, [])
  // The page Haligtree opens on (Settings, Layout): read once settings arrive, and only while nothing has been opened yet.
  const started = useRef(false)
  useEffect(() => {
    // Back after a long gap, Today wins for that run (above): the page you chose is for every other start.
    if (!settings || started.current || quiet) return
    started.current = true
    const to = settings.startPage
    if (!to || to === 'home' || !SECTIONS.some((one) => one.id === to)) return
    setSplit((now) => now.panes.length === 1 && now.panes[0].trail.views.length === 1 && now.panes[0].trail.views[0].id === 'home'
      ? { ...now, panes: [{ ...now.panes[0], trail: { views: [{ id: to }], at: 0 } }] }
      : now)
  }, [settings, quiet])
  // The sidebar on the right, and its peek: with it hidden, pointing at that edge of the window slides it out over the page.
  const right = settings?.sidebarSide === 'right'
  const [peek, setPeekState] = useState(false)
  const peekLeave = useRef(0)
  const setPeek = (on: boolean): void => {
    if (on) return (clearTimeout(peekLeave.current), (peekLeave.current = 0), setPeekState(true))
    // Already on its way back: the pointer moving on does not put that off.
    if (peekLeave.current) return
    // A moment's grace, so a pointer that slips off the edge and back does not shut it.
    // A menu or popover opened from it holds it out until that is closed and the pointer is still away.
    const later = (): void => {
      peekLeave.current = window.setTimeout(() => (document.querySelector('[role="menu"], [data-radix-popper-content-wrapper]:not(:has([role="tooltip"]))') ? later() : ((peekLeave.current = 0), setPeekState(false))), 260)
    }
    later()
  }
  useEffect(() => void (sidebar && setPeekState(false)), [sidebar])
  // Read from where the pointer is, not only its leaving: a menu opened from the peek takes the pointer's events while it is up.
  useEffect(() => {
    if (!peek) return
    const onMove = (event: PointerEvent): void => {
      const box = document.querySelector('[data-sidebar-peek="in"]')?.getBoundingClientRect()
      if (!box) return
      const inside = event.clientX >= box.left - 8 && event.clientX <= box.right + 8 && event.clientY >= box.top - 8 && event.clientY <= box.bottom + 8
      setPeek(inside)
    }
    window.addEventListener('pointermove', onMove, true)
    return () => window.removeEventListener('pointermove', onMove, true)
  }, [peek])
  const peeking = !sidebar && peek && settings?.sidebarPeek !== false
  // Kept on screen while it slides back, then gone.
  const [peekMounted, setPeekMounted] = useState(false)
  const [peekIn, setPeekIn] = useState(false)
  useEffect(() => {
    if (peeking) {
      setPeekMounted(true)
      const frame = requestAnimationFrame(() => requestAnimationFrame(() => setPeekIn(true)))
      return () => cancelAnimationFrame(frame)
    }
    setPeekIn(false)
    const gone = setTimeout(() => setPeekMounted(false), 220)
    return () => clearTimeout(gone)
  }, [peeking])

  /** What a sidebar count counts, in words, for its tip. */
  const countSaid = (id: string, n: number): string => {
    const said: Record<string, [string, string]> = { review: ['card to review now', 'cards to review now'], today: ['task due today or before', 'tasks due today or before'], nuggets: ['gem kept', 'gems kept'], articles: ['article kept', 'articles kept'], questions: ['question still open', 'questions still open'], goals: ['goal under way', 'goals under way'], queue: ['thing to read next', 'things to read next'] }
    const [one, many] = said[id] ?? ['', '']
    return one ? `${num(n)} ${n === 1 ? one : many}` : ''
  }
  // No Inbox count: the inbox is a place to set things down, never a queue to clear.
  // Archived ones are out of sight in their lists, so out of the counts too.
  const today = dayKey()
  const counts: Record<string, number> = useMemo(() => ({
    review: due,
    // The one rule the Today list, the desktop Today sticky and Today's brief count by.
    today: tasks.filter(onToday).length,
    nuggets: nuggets.filter((one) => !one.archivedAt).length,
    articles: articles.filter((one) => !one.archivedAt).length,
    // Held, not owed: counted in the same quiet grey, never as behind.
    questions: questions.filter((one) => !one.archivedAt && !one.closedAt).length,
    goals: goals.filter((one) => one.goalAt && !one.archivedAt && !one.closedAt).length,
    queue: queued.queue.length
  // Counted again only when a list or the day changes, not on every step.
  }), [due, tasks, nuggets, articles, questions, goals, queued.queue.length, today]) // eslint-disable-line react-hooks/exhaustive-deps
  // The counts come in together, once every one is read: never one number, then the next, down the sidebar.
  const countsIn = dueRead !== null && ![tasks, nuggets, articles, questions, goals, queued].some(unloaded)
  // The sidebar is drawn whole, once its rows' reads are in too: before, Pinned and the tags came in a beat late and pushed the places down.
  const { style: sideStyle } = useReadsIn(!settings || unloaded(away) || !countsIn || unloaded(pinsUsual) || unloaded(tags))

  // Tidy stickies is offered only with a sticky out to tidy.
  const stickiesOut = useStickiesOut()

  const safeMode = (): void => {
    const on = !settings?.safeMode
    chime(on ? 'on' : 'off')
    void haligtree.setSettings({ safeMode: on }).then(() => toast(on ? 'Safe mode on: nothing comes up on its own' : 'Safe mode off', () => void haligtree.setSettings({ safeMode: !on })))
  }

  // Blurring, beside Safe mode: private words blurred, the dim when you leave
  // the window, words arriving from a soft blur. One switch for all of it.
  const blurring = (): void => {
    const on = settings?.blur === false
    chime(on ? 'on' : 'off')
    void haligtree.setSettings({ blur: on }).then(() => toast(on ? 'Blurring on: notes marked “Private” stay blurred until you point at them' : 'Blurring off: everything plain and sharp', () => void haligtree.setSettings({ blur: !on })))
  }

  // The keyboard, Linear's way: G then a letter goes somewhere, C captures.
  // Held across renders: kept inside the effect, a render between G and its letter dropped the G.
  const gPending = useRef(false)
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      // ⌘ keys work with the caret in a note too; only something held over
      // the page (Read, a question) keeps them.
      const held = document.querySelector(HELD)
      // The Calendar's side panel is a task picked there: ⌘K over it is about that task.
      if (document.querySelector('[data-day-side]') && event.metaKey && !event.altKey && !event.shiftKey && event.key === 'k') return (event.preventDefault(), calendarAside(), setSearching('all'))
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
        if (menuShowing()) return
        event.preventDefault()
        event.stopPropagation()
        return event.code === 'KeyW' ? closePane() : moveFront(event.code === 'KeyH' ? -1 : 1)
      }
      // ⌘K with the caret in a web link edits the link, as in any editor.
      if (event.metaKey && (event.key === 'k' || event.key === 'p') && !(event.key === 'k' && caretInLink())) {
        event.preventDefault()
        return setSearching(event.key === 'k' ? 'all' : 'notes')
      }
      // ⌘N, as in Notion and Linear: what "New" makes, a blank page or a capture in the box.
      if (event.metaKey && event.key === 'n') {
        event.preventDefault()
        return makeNew()
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
      if (gPending.current) {
        gPending.current = false
        // G + is the = key, with Shift or without, as its keycap says.
        const letter = event.key === '=' ? '+' : event.key.toLowerCase()
        const to = SECTIONS.find((section) => section.key === letter)
        // Taken here, so G T goes to Today and does not also move a task to today.
        if (to) {
          event.preventDefault()
          via('keys')
          setView({ id: to.id })
        }
        return
      }
      // Only a small g: ⇧G is the lists' last row.
      if (event.key === 'g') gPending.current = true
      else if (event.key === 'c') (chime('open'), window.api.showPrompt())
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  })

  // Somewhere else sent you to one thing: open its section with it open.
  // In a pane (the front one unless said); ⌥-clicked, beside it instead.
  const open = (type: string, id: string, key = frontRef.current): void => {
    // Which way it goes is read from the click itself, before any wait.
    const side = asideClick()
    if (side) spendAsideClick()
    // A task opens in the list that holds it (Today, Routines, Later), so its row is there beside it; Upcoming when it is not known yet.
    const step = (): View => {
      const task = type === 'task' ? peekRead<Task>('task', id) : undefined
      const list = !task || task.status !== 'open' ? null : onToday(task) ? 'today' : task.recurrence ? 'routines' : bucket(task) && !task.deadline ? 'later' : null
      return list ? { id: list, focus: id } : stepOf(type, id)
    }
    const go = (): void => (side ? aside(step(), key) : setView(step(), key))
    // A note's page turns on the click, not once it has loaded (the page then
    // turns no second time), and waits the moment it takes to read its words
    // (lib/early-read.ts), so its page opens on them at once: no wait at all
    // for one read before and unchanged, never the page first and the note after.
    if (type === 'capture' || type === 'nugget' || type === 'article' || type === 'question') pageTurn(false, id)
    const reading = holdsNotes(stepOf(type, id).id) ? whenRead(type, id) : null
    if (reading) return void reading.then(go)
    go()
  }
  // A page sent with one of its groups named ("Show them" after a list with no dates):
  // once the page is drawn, that group's heading scrolled to the top.
  const landOnGroup = (heading: string): void => {
    const until = Date.now() + 3000
    const calm = still()
    const look = (): void => {
      const found = [...document.querySelectorAll<HTMLElement>('[class*="@container/page"] :is(h2, h3)')].find((one) => one.textContent?.trim().startsWith(heading))
      if (found) return found.scrollIntoView({ block: 'start', behavior: calm ? 'auto' : 'smooth' })
      // A long list draws only what is in sight: a screen further down, and look again.
      const list = [...document.querySelectorAll<HTMLElement>('[class*="@container/page"] *')].find((one) => one.scrollHeight > one.clientHeight + 4 && /(auto|scroll)/.test(getComputedStyle(one).overflowY))
      if (list) list.scrollTop += list.clientHeight
      if (Date.now() < until) setTimeout(look, 120)
    }
    setTimeout(look, 150)
  }
  const toScale = (scale: Scale, key?: string): void => (chime('season'), setView({ id: SCALE_VIEW[scale] }, key))
  // A view is sent by name (⌘, sends Settings), anything else as one thing to open.
  // A heading link from a note window lands on its heading once the note is open.
  // A press on anything that opens a note starts reading it (lib/early-read.ts).
  useEffect(readOnPress, [])
  useEffect(() => window.api.onSentTo((type, id, heading) => {
    // The passes lay themselves over whatever is open, rather than being a place.
    if (type === 'view' && (id === 'tidy' || id === 'decide')) openPass(id)
    else if (type === 'view') (setView({ id }), heading && landOnGroup(heading))
    else if (type === 'recap') setView({ id: 'stats', focus: id, nonce: Date.now() })
    // A wrap, from the Sunday notification or quick capture's menu: the story over the page.
    else if (type === 'wrap') openWrap(id)
    // From the session bubble, at its Sessions part.
    // Its words read first, as any note's are (lib/early-read.ts), so Today opens on the task, not on its name while it is read.
    else if (type === 'task') {
      const go = (): void => void (setView({ id: 'today', focus: id }), heading === 'sessions' && askSessions(id))
      const reading = whenRead('task', id)
      if (reading) void reading.then(go)
      else go()
    }
    // "Pick a date…" from another window: the task, its calendar open.
    else if (type === 'task-date') (askDate(id), setView({ id: 'today', focus: id }))
    // A page to sort, sent from the box or a note's window; Today written out, from anywhere.
    else if (type === 'sort') window.dispatchEvent(new CustomEvent('haligtree:sort-out', { detail: JSON.parse(id) }))
    // The expanded view of a note, asked for in another window.
    else if (type === 'expand') window.dispatchEvent(new CustomEvent('haligtree:expand', { detail: id }))
    else if (type === 'write') (setView({ id: 'today' }), writeOutDay())
    else if (type === 'person') (setSearchFor(id), setSearching('all'))
    // A capture's version history, asked for in the box: opened, then once
    // its page is up, its history.
    else if (type === 'versions') {
      open('capture', id)
      setTimeout(() => window.dispatchEvent(new CustomEvent('haligtree:versions', { detail: id })), 600)
    } else open(type, id)
    if (heading && type !== 'view' && !(type === 'task' && heading === 'sessions')) headingIn(type, id, heading)
    // Promoted from quick capture with ⌘O: the caret lands where it was.
    landPromoted(type, id)
  }), [])

  const kind = (view: View): (typeof CAPTURE_TYPES)[number] | undefined => CAPTURE_TYPES.find((type) => `kind:${type.id}` === view.id)
  /** A page's name, for the top bar; a pane is named by its note first (paneName). */
  /** A sidebar row lit for the page you are on; a day's, week's or month's row only on today's, this week's or this month's. */
  // Practices is Routines' other tab: its row stays lit there.
  const lit = (id: string): boolean => rowId === id && atNow(view)
  const labelOf = (view: View): string => datedName(view) ?? SECTIONS.find((section) => section.id === view.id)?.label ?? kind(view)?.label ?? (view.id === 'source' ? view.focus?.slice(view.focus.indexOf(':') + 1) || 'Source' : view.id === 'settings' ? 'Settings' : view.id === 'whatsnew' ? "What's new" : view.id === 'practices' ? 'Practices' : view.id === 'yearpage' ? 'Year' : view.id === 'day' ? 'Day' : view.id === 'weekpage' ? 'Week' : view.id === 'monthpage' ? 'Month' : '')
  const paneWidth = (key: string, width: PaneWidth): void => {
    chime(width === 'narrow' ? 'fold' : 'slide')
    setSplit((now) => ({ ...now, panes: now.panes.map((one) => (one.key === key ? { ...one, width } : one)) }))
  }
  const keep: Record<string, (capture: CaptureMeta) => boolean> = {
    // What has no exit yet; archived is kept, out of sight, so not waiting here.
    inbox: (capture) => capture.status === 'open' && !capture.archivedAt,
    all: (capture) => capture.status !== 'discarded',
    // Nothing is destroyed: a discard lands here, and comes back from here.
    discarded: (capture) => capture.status === 'discarded',
    // Out of sight but kept: one moved to the Bin is in the Bin, not here.
    archived: (capture) => !!capture.archivedAt && capture.status !== 'discarded',
    // Asked and not answered yet; written in, it leaves for the rest of your words.
    lookups: (capture) => capture.lookup === 'asked' && capture.status !== 'discarded' && !capture.archivedAt
  }

  // --- split pairs: the panes as one row in Pinned, and the menu they share (split-pairs.tsx)
  const layouts = usePinnedLayouts()
  /** The note a step has open: where it lives, its name and kind; null for a page with none. */
  // Every note and task by its id, made once a list changes rather than searched on every render: Back and Forward redraw this page.
  const known = useMemo(() => {
    const all = new Map<string, { capture?: (typeof captures)[number]; item?: (typeof nuggets)[number]; task?: (typeof tasks)[number] }>()
    for (const task of tasks) all.set(task.id, { task })
    for (const list of [goals, questions, articles, nuggets]) for (const item of list) all.set(item.id, { item })
    for (const capture of captures) all.set(capture.id, { capture })
    return all
  }, [captures, nuggets, articles, questions, goals, tasks])
  const noteIn = (view: View): { type: string; id: string; name: PaneName } | null => {
    if (!view.focus || !holdsNotes(view.id)) return null
    const { capture, item, task } = known.get(view.focus) ?? {}
    if (capture) {
      const kind = CAPTURE_TYPES.find((type) => type.id === capture.kind) ?? CAPTURE_TYPES[0]
      return { type: 'capture', id: capture.id, name: { title: taskName(capture.label).text || 'Untitled', icon: kind.icon, tint: kind.tint, private: !!capture.private } }
    }
    if (item) {
      const kind = CAPTURE_TYPES.find((type) => type.id === item.kind)
      return { type: item.tier, id: item.id, name: { title: item.title || 'Untitled', icon: kind?.icon ?? FileText, tint: kind?.tint, private: !!item.private } }
    }
    return task ? { type: 'task', id: task.id, name: { title: taskName(task.title).text || 'Untitled', icon: TASK_KIND.icon, tint: TASK_KIND.tint } } : null
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
    // Every way in (the pair's menu, a tab, ⌘K) can be taken back.
    quietly(() => setSplit(now))
  }
  /** ⌘K's Even out panes: the room shared equally, as a double-click on a divider does, said in words with a way back. */
  const evenPanes = (): void => {
    const now = splitRef.current
    const even = now.panes.map(() => 1 / now.panes.length)
    if (now.panes.length < 2) return void chime('nope')
    if (now.sizes.length === even.length && now.sizes.every((one) => Math.abs(one - even[0]) < 0.01)) return void (chime('tap'), toast('The panes are already even', undefined, 'info'))
    const was = now.sizes
    chime('tap')
    setSplit((one) => ({ ...one, sizes: even }))
    quietly(() => setSplit((one) => (one.panes.length === was.length ? { ...one, sizes: was } : one)))
  }
  /** ⌘K's Close the other panes: the one in front stays, the rest fold away, and Undo lays them out again. */
  const closeOthers = (): void => {
    if (splitRef.current.panes.length < 2) return void chime('nope')
    separate()
  }
  /**
   * The menu of a split pair, the same wherever it is opened (the pair's row,
   * the page's name in the top bar, a pane's tab), Dia's menu for a split
   * with what Haligtree has: its layout, the notes in it, and its panes.
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
      { label: 'Open in a new window', run: () => openApart(note.type, note.id) },
      { label: 'Copy title', run: () => void navigator.clipboard.writeText(note.name.title).then(() => (chime('copy'), toast('Copied')), () => refuse('Could not copy it', 'error')) }
    ]
    const key = live?.key ?? frontRef.current
    return [
      pinned ? { label: 'Unpin the layout', run: () => unpinLayout(pinned) } : { label: 'Pin the layout', run: () => pinLayout(views, sizes) },
      'separator',
      live ? { label: 'Separate', run: () => separate(key) } : { label: 'Open the layout', run: () => openLayout(views, sizes) },
      { label: 'Duplicate the layout', run: () => (pinLayout(views, sizes), toast('Duplicated: a copy of the layout is pinned')) },
      'separator',
      targets.length > 0 && { label: 'Move to group', items: targets.map((one) => ({ label: one.label, icon: one.icon, run: () => moveAll(one.label) })) },
      refs.length > 0 && { label: 'Copy to book', items: [{ label: refs.length > 1 ? `Copy ${num(refs.length)} notes to book…` : 'Copy to book…', run: () => askBook('copy', { refs }) }] },
      notes.length > 0 && { label: 'Open in new window', run: () => notes.forEach((note) => openApart(note.type, note.id)) },
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
      // Views are switched all day, as Finder and Mail switch them: the new
      // one goes on show whole the frame its reads are in, the old one staying
      // up until then and gone in that same frame (page-swap.tsx), so no frame
      // shows two pages, two notes, an empty window, or the window through two
      // faint ones. Clicked to, it only settles in: down the sidebar it comes
      // up from below, up it from above. A transform string, so it stays
      // smooth while the view mounts. Each page keeps its own step.
      <PageSwap id={view.id}>
      <NavContext.Provider value={navFor(key, view)}>
      <motion.div
        key={view.id}
        data-page={view.id}
        // Keyboard travel (G and a letter, ⌘[ and ⌘]) is done hundreds of times a day: no settle then.
        initial={byKeys() ? false : { transform: shift(`translateY(${(pageTravel(key, view.id, ordered.map((section) => section.id)) || 1) * 6}px)`) }}
        animate={{ transform: shift('translateY(0px)') }}
        transition={{ duration: 0.16, ease: EASE }}
        className="flex min-w-0 flex-1"
      >
        {view.id === 'home' ? (
          <HomeView onOpen={(type, id) => (via('home'), go(type, id))} onView={(id, focus) => (via('home'), setView({ id, focus }, key))} />
        ) : view.id === 'discarded' ? (
          <BinView onOpen={go} />
        ) : view.id === 'inbox' || view.id === 'all' || view.id === 'archived' || view.id === 'lookups' ? (
          <CapturesView title={SECTIONS.find((section) => section.id === view.id)!.label} keep={keep[view.id]} focus={view.focus} onOpen={go} archived={view.id === 'archived'} everything={view.id === 'all'} />
        ) : view.id === 'day' ? (
          <DayView start={view.focus} onOpen={go} onScale={scale} />
        ) : view.id === 'weekpage' ? (
          <WeekPage start={view.focus} onOpen={go} onScale={scale} onRecent={setRecent} recentOpen={!!recent} onDay={(day) => go('day', day)} />
        ) : view.id === 'monthpage' ? (
          <MonthPage start={view.focus} onScale={scale} onDay={(day) => go('day', day)} />
        ) : view.id === 'yearpage' ? (
          <YearPage start={view.focus} onScale={scale} onMonth={(month) => setView({ id: 'monthpage', focus: month }, key)} onDay={(day) => go('day', day)} />
        ) : view.id === 'practices' || view.id === 'kind:practice' ? (
          <PracticesView key={view.focus === 'new' ? `new-${view.nonce ?? ''}` : 'practices'} focus={view.focus} onOpen={go} />
        ) : kind(view) ? (
          <CapturesView title={kind(view)!.label} keep={(capture) => capture.kind === kind(view)!.id && capture.status !== 'discarded'} focus={view.focus} onOpen={go} />
        ) : view.id === 'review' ? (
          <ReviewView />
        ) : view.id === 'today' || view.id === 'tomorrow' || view.id === 'upcoming' || view.id === 'routines' || view.id === 'later' ? (
          <TasksView mode={view.id} focus={view.focus} onOpen={go} />
        ) : view.id === 'calendar' ? (
          <CalendarView focus={view.focus} onOpen={go} />
        ) : view.id === 'week' ? (
          <WeekView focus={view.focus} onOpen={go} />
        ) : view.id === 'matrix' ? (
          <MatrixView focus={view.focus} onOpen={go} />
        ) : view.id === 'nuggets' || view.id === 'articles' || view.id === 'questions' ? (
          // Questions are pages in Writing: sent to one, Writing opens with its "Questions" chip on.
          <ItemsView tier={view.id === 'nuggets' ? 'nugget' : 'article'} only={view.id === 'questions' ? 'questions' : undefined} focus={view.focus} onOpen={go} />
        ) : view.id === 'goals' ? (
          <GoalsView focus={view.focus} onOpen={go} />
        ) : view.id === 'queue' ? (
          <QueueView />
        ) : view.id === 'tags' ? (
          <TagsView onOpen={go} focus={view.focus} />
        ) : view.id === 'sources' ? (
          <SourcesView onOpen={go} />
        ) : view.id === 'source' ? (
          <SourcePageView key={view.focus} focus={view.focus} onOpen={go} />
        ) : view.id === 'stats' ? (
          <StatsView key={`${view.focus}-${view.nonce}`} recap={view.focus} />
        ) : view.id === 'map' ? (
          <MapView onOpen={go} />
        ) : view.id === 'whatsnew' ? (
          <WhatsNewPage focus={view.focus} onView={(id, focus) => setView({ id, focus }, key)} />
        ) : view.id === 'powers' ? (
          <PowersView onView={(id, focus) => setView({ id, focus }, key)} />
        ) : (
          <SettingsView />
        )}
      </motion.div>
      </NavContext.Provider>
      </PageSwap>
    )
  }

  return (
    <TooltipProvider delayDuration={600} skipDelayDuration={400}>
    <div className="isolate flex h-screen flex-col bg-background text-foreground">
      {/* Centred over the page, not the sidebar beside it. */}
      <div className={`contents ${sidebar ? (right ? (narrow ? '[--toast-right:4rem]' : '[--toast-right:15rem]') : (narrow ? '[--toast-left:4rem]' : '[--toast-left:15rem]')) : ''}`}><Toaster /></div>
      <PickDays />
      {/* A note opened from a sticky grows out of where the sticky is (main/grow.ts). */}
      <GrowFrom />
      <Celebrations place="home" />
      <NotePreview />
      {/* The first note opened draws as fast as the rest. */}
      <WarmEditor />
      <ShortcutSheet />
      <WordNotes />
      <UnusedFiles />
      <Passes onOpen={(type, id) => open(type, id)} />
      <QueueReader />
      <Welcome />
      <WelcomeTwo />
      <Tour />
      <CloseDaySheet />
      <FitsSheet />
      <SortSheet />
      <ExpandedSheet />
      <SandboxHost />
      <FocusNote />
      <FocusScenery />
      <WrapSheet />
      <WrapOffer />
      <AnimatePresence>
      {searching && (
        <Search
          key={searchFor}
          // With the Calendar in front and a task picked, ⌘K is about that task (⌫ for everything).
          scope={searching === 'notes' ? undefined : palette?.scope}
          initial={searchFor}
          // Words that match nothing, kept as something new and opened here; or carried to the box.
          onKeep={(as, text) => {
            setSearching(false)
            setSearchFor('')
            void keepTyped(as, text, open, (words) => (step(-1), setSearchFor(words), setSearching('all')))
          }}
          keeps={['note', 'task', 'question', 'box']}
          // The same palette as the box's: places to go and things to switch.
          actions={searching === 'notes' ? [] : ([
            // A day typed alone ("fri", "3 nov") goes there on the Calendar; with it in front, its own commands too.
            ...(palette?.actions ?? []),
            // Back after a while, the sidebar shows only capture and Today: the way to the rest, from here too (the sidebar's own button is not there when it is narrow or hidden).
            ...(quiet ? [{ label: 'Show everything', hint: 'Every page in the sidebar again', cue: null, run: () => void call('return:show-all').then(() => chime('unshelve')) }] : []),
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
                  run: () => void haligtree.setBeacon(goal.id, mode).then(() => {
                    chime(mode === 'off' ? 'unstick' : 'stick')
                    toast(mode === 'always' ? 'On screen, on every Space' : mode === 'sometimes' ? 'On screen now and then: it comes out a few times a day' : 'Off screen: the menu bar and Home still show it', () => void haligtree.setBeacon(goal.id, goal.beacon))
                  })
                }))
              })
            }] : []),
            ...(picked.ids.length > 1 ? [{ label: 'Make one task', hint: `From the ${num(picked.ids.length)} selected captures`, cue: null, run: () => window.dispatchEvent(new CustomEvent('haligtree:one-task')) }] : []),
            { label: 'Keep Today on screen', hint: "Today's tasks on the desktop", cue: null, run: () => stickOnDesktop('today', 'today') },
            { label: 'Show all goals on one sticky', hint: 'Each goal in its own colour, with a legend', cue: null, run: () => stickOnDesktop('goals', 'all') },
            { label: 'Write out my day', hint: 'Today as a list you write', cue: null, run: () => (setView({ id: 'today' }), writeOutDay()) },
            { label: 'Tidy captures', hint: 'Tidy: a few minutes tagging your latest captures', run: () => openPass('tidy') },
            { label: 'Decide what to keep', hint: 'Decide: once a week, look over what waited', run: () => openPass('decide') },
            { label: 'Import Obsidian or Notion…', hint: 'A vault or a Notion export', cue: null, run: () => void window.api.importFrom('vault') },
            { label: 'Import from Apple Notes…', hint: 'Folder by folder, into Writing, to sort', cue: null, run: () => void window.api.importFrom('apple-notes') },
            { label: 'Import highlights and files…', hint: 'Readwise, Kindle, Markdown, bookmarks or Anki', cue: null, run: () => void window.api.importFrom('files') },
            { label: 'Switch book…', hint: 'Another book of yours, or the sandbox', cue: null, run: () => askBook('switch') },
            ...(SANDBOX ? [] : [
              { label: 'New book…', hint: 'An empty one, apart from this', cue: null, run: () => void askNewBook() },
              { label: 'Import into another book…', cue: null, run: () => askBook('import') }
            ]),
            // In the sandbox, restoring reads as a risk to your notes: it is not offered there.
            ...(SANDBOX ? [
              { label: 'Back to my notes', hint: 'Leave the sandbox', cue: null, run: () => void leaveSandbox() },
              { label: 'Reset the sandbox', hint: 'Their book back to how it began', cue: null, run: () => void resetSandbox() }
            ] : [
              { label: 'Restore from a backup…', cue: null, run: () => void window.api.restoreBackup() },
              { label: 'Open the sandbox', hint: "A peek into someone else's book, with examples", cue: null, run: () => void enterSandbox() }
            ]),
            { label: `What can ${APP_NAME} do?`, hint: 'Every power, with a way to try it', cue: null, run: () => setView({ id: 'powers' }) },
            { label: "What's new", hint: `The latest in ${APP_NAME}, with a way to try each`, cue: null, run: openWhatsNew },
            { label: 'Close the day', hint: "What got done, and tomorrow's first task", cue: null, run: openCloseDay },
            { label: 'Sort out the Inbox', hint: 'About ten minutes: where each capture goes', cue: null, run: openInboxSort },
            { label: 'Close the week', hint: 'What went well, what moves on, and the one thing for next week', cue: null, run: openCloseWeek },
            // A spare few minutes: what fits them, in the Matrix's order. "i have 20" or "20 min" asks straight away.
            { label: 'I have 15 minutes…', hint: 'Tasks that fit the time you have', cue: null, run: () => {},
              choices: () => FIT_CHOICES.map((minutes) => ({ label: `${minutes} minutes`, note: minutes === (settings?.fitMinutes ?? 15) ? 'last time' : undefined, run: () => openFits(minutes) })),
              heard: (typed: string) => { const minutes = fitsHeard(typed); return minutes ? { label: `I have ${minutes} minutes`, hint: 'Tasks that fit', cue: null, run: () => openFits(minutes) } : null } },
            { label: 'Open my playbook', hint: 'How I work, in my own words', cue: null, run: () => void openPlaybook() },
            { label: 'Show the welcome again', cue: null, run: () => playWelcome() },
            // Either welcome, to feel which is right: played in the sandbox, so your own book is never touched.
            ...([1, 2] as const).map((version) => ({ label: `Show the welcome (version ${version})`, hint: version === 1 ? 'The first welcome, in the sandbox' : 'The short one that starts you writing, in the sandbox', cue: null, run: () => void tryWelcome(version) })),
            { label: 'Try a celebration', cue: null, run: () => tryCelebration() },
            ...SECTIONS.map((section) => ({ label: `Go to ${section.label}`, keys: `G ${section.key.toUpperCase()}`, run: () => setView({ id: section.id }) })),
            { label: sidebar ? 'Hide the sidebar' : 'Show the sidebar', keys: '⌘B', cue: sidebar ? 'fold' : 'slide', run: () => (setSidebar(!sidebar), (sidebar ? toast('Sidebar hidden. ⌘B brings it back', () => setSidebar(sidebar)) : quietly(() => setSidebar(sidebar)))) },
            { label: sidebar || detailsShown() ? 'Hide every sidebar' : 'Show every sidebar', keys: '⇧⌘B', cue: null, run: () => { const open = sidebar || detailsShown(); chime(open ? 'fold' : 'slide'); showDetails(!open); setSidebar(!open); (open ? toast('Every sidebar hidden. ⇧⌘B brings them back', () => (showDetails(open), setSidebar(open))) : quietly(() => (showDetails(open), setSidebar(open)))) } },
            { label: fill ? 'Back to compact' : 'Fill the screen', keys: '⌃⇧F', cue: null, run: () => (setFill(!fill), (fill ? quietly(() => setFill(fill)) : toast('Filling the screen. ⌃⇧F goes back', () => setFill(fill)))) },
            { label: 'Split the page', hint: 'Split: this page again, beside it', keys: '⌥⌘\\', cue: null, run: () => {
              const before = splitRef.current.panes.length
              splitFront()
              if (before < MAX_PANES) toast(`Split: ${paneName(view).title} is on the right too. ⌃W closes it`)
            } },
            ...(split.panes.length > 1 ? [
              { label: 'Close this pane', keys: '⌃W', cue: null, run: () => closePane() },
              { label: 'Even out panes', hint: 'Each the same width', cue: null, run: evenPanes },
              { label: 'Close the other panes', hint: 'Keep this one', cue: null, run: closeOthers },
              { label: 'Pane to the left', keys: '⌃H', cue: null, run: () => paneSaid(-1) },
              { label: 'Pane to the right', keys: '⌃L', cue: null, run: () => paneSaid(1) }
            ] : []),
            { label: 'Fold every heading', cue: null, run: () => void (foldEverything(true) ? quietly(() => void foldEverything(false)) : refuse('No headings to fold in the note in front')) },
            { label: 'Unfold every heading', cue: null, run: () => void (foldEverything(false) ? quietly(() => void foldEverything(true)) : refuse('No headings to unfold in the note in front')) },
            { label: typewriter ? 'Turn typewriter scrolling off' : 'Turn typewriter scrolling on', cue: typewriter ? 'off' : 'on', run: () => (setTypewriter(!typewriter), toast(typewriter ? 'Typewriter scrolling off' : 'Typewriter scrolling on', () => setTypewriter(typewriter))) },
            { label: settings?.sounds ? 'Turn sounds off' : 'Turn sounds on', cue: null, run: () => {
              soundOn(!settings?.sounds)
              chime(settings?.sounds ? 'off' : 'on')
              void haligtree.setSettings({ sounds: !settings?.sounds })
              const was = !!settings?.sounds
              toast(was ? 'Sounds off' : 'Sounds on', () => (soundOn(was), void haligtree.setSettings({ sounds: was })))
            } },
            { label: settings?.safeMode ? 'Turn safe mode off' : 'Turn safe mode on', keys: '⌥⌘S', cue: null, run: safeMode },
            { label: settings?.stickiesShown === false ? 'Show sticky notes' : 'Hide sticky notes', keys: '⌃⌥⌘N', cue: null, run: () => {
              const show = settings?.stickiesShown === false
              void haligtree.setSettings({ stickiesShown: show }).then(() => (show ? quietly : (undo: () => void) => toast('Sticky notes hidden. ⌃⌥⌘N brings them back', undo))(() => void haligtree.setSettings({ stickiesShown: !show })))
            } },
            { label: recordable ? 'Hide from recordings' : 'Show in recordings', hint: `${APP_NAME} in screen recordings and shares`, cue: recordable ? 'off' : 'on', icon: recordable ? CameraOffIcon : CameraIcon, run: () => recordAll(!recordable, settings?.inRecordings) },
            // Not in safe mode: the notes it would bring are meant to be put away then.
            ...(settings?.safeMode ? [] : [{ label: 'Bring sticky notes here', cue: null, run: () => window.api.gatherStickies() }]),
            ...(settings?.safeMode || !stickiesOut ? [] : [{ label: 'Tidy stickies', keys: '⌃⌥⌘T', cue: null, run: () => window.api.tidyStickies() }]),
            { label: 'reveal' in document.documentElement.dataset ? 'Blur private titles again' : 'Show private titles', hint: 'For now', cue: 'reveal' in document.documentElement.dataset ? 'off' : 'on', run: () => {
              const root = document.documentElement
              const flip = (): void => void ('reveal' in root.dataset ? delete root.dataset.reveal : (root.dataset.reveal = ''))
              flip()
              quietly(flip)
            } },
            ...abandonAction,
            ...practiceActions,
            { label: 'Keyboard shortcuts', keys: '?', cue: null, run: () => window.dispatchEvent(new CustomEvent('haligtree:shortcuts')) },
            { label: 'Clear unused pictures…', cue: null, run: () => window.dispatchEvent(new CustomEvent('haligtree:unused')) },
            ...themeActions((text, undo) => toast(text, undo)),
            { label: settings?.blur === false ? 'Turn blurring on' : 'Turn blurring off', cue: null, run: blurring },
            { label: 'Settings', keys: '⌘,', run: () => setView({ id: 'settings' }) },
            // The wrench on a sidebar heading shows only on pointing: found here too.
            { label: 'Customize the sidebar…', cue: null, run: () => void setTimeout(() => setCustomizing(true), 120) },
            { label: recent ? 'Hide Recent' : 'Show Recent', hint: recent ? undefined : 'Recent: everything made lately, beside the page', keys: '⇧⌘Y', cue: null, run: toggleRecent },
            { label: "Open the year's page", hint: 'Year: your seasons of life, month by month', cue: 'season', run: () => setView({ id: 'yearpage' }) },
            ...noteActions({ day: false }),
            // The recap, Wrapped's way, over Stats.
            { label: 'Your month, wrapped', hint: 'A few cards on the month', cue: null, run: () => openWrap(monthToWrap()) },
            { label: 'Your week, wrapped', hint: 'A few cards on this week', cue: null, run: () => openWrap(`week:${dayKey(dayjs().startOf('week'))}`) },
            { label: 'Your year, wrapped', run: () => setView({ id: 'stats', focus: 'year', nonce: Date.now() }) }
          // Each one says it came from ⌘K, for the usage counts.
          ] satisfies Action[]).map((one) => ({ ...one, run: () => (via('palette'), one.run()) }))}
          onClose={() => (setSearching(false), setSearchFor(''))}
          onAside={(type, id) => {
            setSearching(false)
            setSearchFor('')
            via('search')
            aside(stepOf(type, id))
          }}
          onOpen={(type, id) => {
            setSearching(false)
            setSearchFor('')
            via('search')
            // A task found with the Calendar in front: the Calendar goes to its day and opens it there.
            if (type === 'task' && revealOnCalendar(tasks.find((one) => one.id === id))) return
            open(type, id)
          }}
        />
      )}
      </AnimatePresence>

      {/* Like Raycast's settings window: the sidebar is a card of its own with
          the window's buttons set into it, and the page beside it has only a
          slim bar. The bar and the card's top drag the window; every control
          on them says it does not. */}
      <div className={`relative flex min-h-0 flex-1 gap-2 p-2 ${right ? 'flex-row-reverse' : ''}`}>
      {/* Hidden, the sidebar waits at its edge of the window: point there and it slides out over the page. */}
      {!sidebar && settings?.sidebarPeek !== false && (
        <div data-sidebar-edge aria-hidden className={`absolute inset-y-0 z-40 w-1.5 ${right ? 'right-0' : 'left-0'}`} onPointerEnter={() => setPeek(true)} onPointerLeave={() => setPeek(false)} />
      )}
      {(sidebar || peekMounted) && (
      // Peeking, it slides out over the page and back by a CSS transition (an ease-out of its own, 200ms);
      // with Motion off or Reduce motion it only fades. Docked, the wrapper is not there at all.
      <div data-sidebar-peek={sidebar ? undefined : peekIn ? 'in' : 'out'}
        className={sidebar ? 'contents' : `absolute inset-y-2 z-50 flex rounded-xl bg-background shadow-(--mf-panel-shadow) transition-[opacity,transform] duration-200 ease-[cubic-bezier(.22,1,.36,1)] motion-reduce:!transform-none [:root[data-motion=off]_&]:!transform-none ${right ? 'right-2' : 'left-2'} ${peekIn ? 'translate-x-0 opacity-100' : `opacity-0 ${right ? 'translate-x-6' : '-translate-x-6'}`}`}
        onPointerEnter={sidebar ? undefined : () => setPeek(true)} onPointerLeave={sidebar ? undefined : () => setPeek(false)}>
      {/* Customize opens beside the whole sidebar, just under the window's top bar, so it never hides the bar nor runs off the window. */}
      <Popover open={customizing} onOpenChange={setCustomizing}>
      <PopoverAnchor asChild>
      {/* Anything the sidebar opens, its menus too, was found by the sidebar (lib/usage.ts). */}
      <aside data-chrome data-book-tint style={sideStyle} onClickCapture={() => via('sidebar')} className={`group/side flex shrink-0 flex-col overflow-hidden rounded-xl border bg-accent/20 ${narrow ? 'w-12' : 'w-56'}`}>
        {/* Room for the traffic lights, and somewhere to hold the window by.
            It stays put: only the list under the search scrolls, so nothing
            ever slides under the window's buttons. */}
        {/* In the Mac's full screen there are no traffic lights here, so the room closes up. */}
        <div data-drag-strip="" className="h-10 shrink-0 [:root[data-fullscreen]_&]:h-2" style={{ WebkitAppRegion: 'drag' } as CSSProperties} />
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
        <div ref={sideList} {...sideHover.handlers} className={`mf-fade-end ${narrow ? 'mf-fade-tall' : ''} relative isolate flex min-h-0 flex-1 flex-col overflow-y-auto px-2 pt-1 pb-3`}>
        {/* Rows' previews: once one is up, the next swaps in at once, even after a short pause between rows. */}
        <TooltipProvider delayDuration={600} skipDelayDuration={900}>
        <Highlight spot={sideChosen.spot} snap={sideChosen.snap} travel={spring.moderate} className="bg-accent" />
        <Highlight spot={sideHover.spot} session={sideHover.session} snap={sideHover.snap} from={sideChosen.spot} />
        <nav className="flex flex-col gap-px">
          {(() => {
            // Where a promoted capture or a new task flies to (lib/fly-home.ts).
            const homeOf = (id: string): string | undefined => (id === 'nuggets' ? 'nugget' : id === 'upcoming' ? 'task' : id === 'questions' ? 'question' : undefined)
            // A fold's heading stands in for the rows it holds while they are shut away.
            const homesIn = (list: typeof SECTIONS): string | undefined => list.map((section) => homeOf(section.id)).filter(Boolean).join(' ') || undefined
            // Shown or hidden from a row's right click, said with a way back.
            const showIt = async (section: (typeof SECTIONS)[number], on: boolean): Promise<void> => {
              const was = (await haligtree.settings()).sidebarShown ?? shown
              chime(on ? 'on' : 'off')
              await haligtree.setSettings({ sidebarShown: on ? [...was.filter((one) => one !== section.id), section.id] : was.filter((one) => one !== section.id) })
              toast(showWords(section, !on).said, () => void haligtree.setSettings({ sidebarShown: was }).then(() => chime(on ? 'off' : 'on')))
            }
            // What a right click on a place offers: go there (here or beside), move it, hide it, or bring back one hidden.
            const placeMenu = (section: (typeof SECTIONS)[number], among: string[]): RowItem[] => {
              const on = shown.includes(section.id)
              const stays = section.id === 'home' || (on && shown.length === 1)
              const hidden = ordered.filter((one) => !shown.includes(one.id))
              return [
                view.id !== section.id && { label: 'Open', run: () => setView({ id: section.id }) },
                asideItem('view', section.id),
                'separator',
                ...orderItems({ setting: 'sidebarOrder', usual: sections.map((one) => one.id), id: section.id, among, what: 'The sidebar', name: section.label }, sidebarSaved.length > 0),
                'separator',
                !stays && { label: showWords(section, on).label, run: () => void showIt(section, !on) },
                // The pages switched off, quietly: pick one to put it back where it belongs.
                hidden.length > 0 && { label: 'Show hidden pages', items: hidden.map((one) => ({ label: one.label, icon: <PlaceIcon place={one} />, run: () => void showIt(one, true) })) },
                // Once the menu has shut and handed the focus back, or the panel would take that as a click away.
                { label: 'Customize the sidebar…', run: () => void setTimeout(() => setCustomizing(true), 120) }
              ]
            }
            // A row glides when moved, but the copy left showing under a folded
            // group's heading does not share its name: while the group shuts, the row
            // is in both places, and a shared name made it fly up and drop back in.
            const row = (section: (typeof SECTIONS)[number], among: string[] = [], still = false): React.JSX.Element => (
              <SortableRow key={section.id} id={section.id} glide={still ? undefined : `side-${section.id}`}>
              <RowMenu items={placeMenu(section, among)}>
              {/* A row that has just joined the sidebar rises in, once. */}
              <motion.div className="flex flex-col" initial={risen.has(section.id) ? { opacity: 0, y: 6 } : false} animate={{ opacity: 1, y: 0 }}
                transition={{ type: 'spring', duration: 0.42, bounce: 0 }} onAnimationComplete={() => risen.delete(section.id)}>
              {/* Its preview: a picture of the page, a line on what it is for, and its keys. */}
              <SidePeek id={section.id} keys={`G ${section.key.toUpperCase()}`}>
              <button
                type="button"
                data-home={homeOf(section.id)}
                data-tour={section.id === 'inbox' || section.id === 'review' ? section.id : undefined}
                data-side-row
                data-queue-drop={section.id === 'queue' ? '' : undefined}
                aria-label={section.label}
                aria-current={lit(section.id) ? 'page' : undefined}
                onClick={() => open('view', section.id)}
                className={`group relative flex items-center gap-2.5 rounded-md py-1.5 transition-colors duration-80 ${narrow ? 'justify-center px-0' : 'px-2'} ${lit(section.id) ? 'text-foreground' : 'text-foreground/80'} data-[queue-hot]:bg-[color-mix(in_oklab,var(--tt-color-text-blue)_16%,transparent)] data-[queue-hot]:text-foreground data-[queue-hot]:ring-1 data-[queue-hot]:ring-[color-mix(in_oklab,var(--tt-color-text-blue)_45%,transparent)]`}
              >
                {/* Each icon keeps its colour, softened while at rest so the hues do not
                    shout at once; the one you are on, or reaching for, is in full. */}
                <PlaceIcon place={section} full={lit(section.id)} />
                {!narrow && <Weighted on={lit(section.id)} className="flex-1 text-left">{section.label}</Weighted>}
                {!narrow && countsIn && counts[section.id] ? (
                  // Each count says what it counts, pointed at: the orange one is what is due today.
                  <Tip label={countSaid(section.id, counts[section.id])}>
                    <span data-side-count={section.id}>
                      <Count tip={!countSaid(section.id, counts[section.id])} n={counts[section.id]} className={`text-xs ${section.id === 'today' ? 'text-[var(--tt-color-text-orange)]' : 'text-muted-foreground'}`} />
                    </span>
                  </Tip>
                ) : null}
              </button>
              </SidePeek>
              </motion.div>
              </RowMenu>
              </SortableRow>
            )
            // A part of the sidebar whose rows drag into your own order; folded to one row, or narrow, they keep still.
            const sorted = (list: typeof SECTIONS, still = false): React.JSX.Element => (
              <SortableList items={list} keyOf={(section) => section.id} onMove={narrow || still ? undefined : dropOrder('sidebarOrder', sections.map((one) => one.id), (id) => SECTIONS.find((one) => one.id === id)?.label)}>
                {(items) => items.map((section) => row(section, items.map((one) => one.id), still))}
              </SortableList>
            )
            // A group's name, small: a click folds it. Which pages it holds is set in "Customize sidebar…", not here.
            const heading = (label: string, open: boolean, fold: (open: boolean) => void, near?: string): React.JSX.Element =>
              narrow ? <div key={label} className="mt-3" /> : (
                <div key={label} className="group/head relative mt-2.5 mb-0.5 flex min-h-6 items-center">
                  <button
                    type="button"
                    aria-expanded={open}
                    data-side-row
                    data-home-near={near}
                    onClick={() => (chime(open ? 'fold' : 'slide'), fold(!open))}
                    className={`flex min-h-6 flex-1 items-center gap-1 rounded-md py-0.5 pl-2 pr-2 text-left text-meta text-muted-foreground transition-colors duration-80 hover:text-foreground data-[fluid-hover-active]:text-foreground`}
                  >
                    {label}
                    <ChevronRight className={`size-3 transition-[rotate,opacity] duration-80 ${open ? 'rotate-90 opacity-0 group-hover/head:opacity-100' : ''}`} />
                  </button>
                </div>
              )
            // Open, a group's rows hang off its heading, the way down to where you are lit.
            const branched = (list: typeof SECTIONS): React.JSX.Element => (
              <Branches current={list.findIndex((section) => lit(section.id))} className="flex flex-col gap-px">{sorted(list)}</Branches>
            )
            // Not drawn, even unseen, until settings say which rows show: a fold measured with a row
            // the settings then take away held that row's room for a frame once the sidebar showed.
            const parts = settings && !unloaded(away) ? sidebarParts(sections, ordered, shown) : []
            const folds: Record<Group, [boolean, (open: boolean) => void]> = { Notes: [notesOpen, setNotesOpen], Tasks: [tasksOpen, setTasksOpen], Saved: [keptOpen, setKeptOpen] }
            // Tasks' pages not used yet wait here, quiet and shut; opening one brings it into Tasks for good.
            const more = (): React.JSX.Element | null => !waiting.length || narrow ? null : (
              <div data-side-more className="flex flex-col gap-px">
                <button type="button" data-side-row aria-expanded={moreOpen} onClick={() => (chime(moreOpen ? 'fold' : 'slide'), setMoreOpen(!moreOpen))}
                  className="flex items-center gap-1 rounded-md py-1 pl-2 text-left text-meta text-muted-foreground transition-colors duration-80 hover:text-foreground data-[fluid-hover-active]:text-foreground">
                  More
                  <ChevronRight className={`size-3 transition-[rotate] duration-80 ${moreOpen ? 'rotate-90' : ''}`} />
                </button>
                <Unfold open={moreOpen}>
                  <div data-side-waiting className="flex flex-col gap-px opacity-80">{sorted(waiting, true)}</div>
                </Unfold>
              </div>
            )
            // A group lists only what is shown; with nothing shown it is gone. A
            // page switched off is not here at all, even while you are on it: the
            // page's own title says where you are, and nothing jumps in and out.
            const group = (name: Group, list: typeof SECTIONS): React.JSX.Element | null => {
              const [open, fold] = folds[name]
              if (!list.length && !(name === 'Tasks' && waiting.length)) return null
              const here = (section: (typeof SECTIONS)[number]): boolean => section.id === rowId
              // Narrow, every row is an icon and the group never shuts.
              if (narrow) return (
                <Fragment key={name}>
                  {heading(name, open, fold)}
                  {sorted(list, true)}
                </Fragment>
              )
              // Folded, the one you are on still shows, so you never lose your place.
              return (
                <Fragment key={name}>
                  {heading(name, open, fold, open ? undefined : homesIn(list))}
                  <Unfold open={open}>{branched(list)}{name === 'Tasks' && more()}</Unfold>
                  {!open && sorted(list.filter(here), true)}
                </Fragment>
              )
            }
            // Pinned, and the split open now, sit under Notes in a book that has it, else under the first rows.
            const pinsAfter = parts.some((part) => part.group === 'Notes') ? 'Notes' : 'top'
            const pinned = (<>
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
              {/* Pinned, Notion's Favourites: only there while something is, or while a note is carried to it. */}
              {pins.length === 0 && layouts.length === 0 && !narrow && (
                <div data-side-drop="pinned" className="hidden rounded-md data-[queue-hot]:bg-[color-mix(in_oklab,var(--primary)_12%,transparent)] data-[queue-hot]:ring-1 data-[queue-hot]:ring-[color-mix(in_oklab,var(--primary)_40%,transparent)] [html[data-split-drag]_&]:block">
                  <div className="mt-3 mb-0.5 px-2 py-0.5 text-meta text-muted-foreground">Pinned</div>
                  <p className="px-2 pb-1.5 text-control text-muted-foreground">Drop here to pin</p>
                </div>
              )}
              {!quiet && (pins.length > 0 || layouts.length > 0) && (<div data-side-drop="pinned" className="rounded-md data-[queue-hot]:bg-[color-mix(in_oklab,var(--primary)_12%,transparent)] data-[queue-hot]:ring-1 data-[queue-hot]:ring-[color-mix(in_oklab,var(--primary)_40%,transparent)]">
                {heading('Pinned', pinsOpen, setPinsOpen)}
                <Unfold open={pinsOpen || narrow}><Branches current={-1} bare={narrow} className="flex flex-col gap-px">{[
                  ...layouts.map((one) => {
                    const live = split.panes.length > 1 && sameLayout(one.views, split.panes.map((pane) => pane.trail.views[pane.trail.at]))
                    return <PairRow key={one.id} live={live} isPinned narrow={narrow} names={one.views.map(paneName)} menu={pairMenu(one.views, live ? {} : null, one.id)}
                      onOpen={(index) => (live ? (chime('tap'), toFront(split.panes[index].key)) : openLayout(one.views, one.sizes))}
                      onClose={live ? (index) => closePane(split.panes[index].key) : undefined} />
                  }),
                  // Pins drag into your own order too; carried off the sidebar, one still opens to the side.
                  <SortableList key="pins" items={pins} keyOf={(pin) => `${pin.type}:${pin.id}`} onMove={narrow ? undefined : dropOrder('pinOrder', pinsUsual.map((pin) => `${pin.type}:${pin.id}`), (id) => pinsUsual.find((pin) => `${pin.type}:${pin.id}` === id)?.title || 'Untitled')}>{(items) => items.map((pin) => {
                  const kind = CAPTURE_TYPES.find((type) => type.id === pin.kind) ?? CAPTURE_TYPES[0]
                  const menu = fullMenu(pin.type, pin.id, () => open(pin.type, pin.id)) ?? sideMenu(pin.type, pin.id, pin.title, { onOpen: open, pinned: true, kind: pin.kind, status: captures.find((one) => one.id === pin.id)?.status })
                  menu.splice(menu.lastIndexOf('separator'), 0, 'separator', ...orderItems({ setting: 'pinOrder', usual: pinsUsual.map((one) => `${one.type}:${one.id}`), id: `${pin.type}:${pin.id}`, among: items.map((one) => `${one.type}:${one.id}`), what: 'Pinned', name: pin.title || 'Untitled' }, pinSaved.length > 0))
                  return (
                    <SortableRow key={pin.id} id={`${pin.type}:${pin.id}`} glide={`pin-${pin.id}`}>
                    <RowMenu items={menu}>
                      <span className="flex min-w-0">
                      <Tip label={narrow ? pin.title || 'Untitled' : ''}>
                      <button
                        type="button"
                        data-private={pin.private ? '' : undefined}
                        data-side-row
                        data-drag-open={`${pin.type}:${pin.id}`}
                        // The one open now says so, in full ink, as the page you are on does above.
                        data-open={view.focus === pin.id || undefined}
                        aria-current={view.focus === pin.id ? 'true' : undefined}
                        onClick={() => open(pin.type, pin.id)}
                        // ⌫ unpins, as the menu's line does.
                        onKeyDown={(event) => onRemoveKey(event, menu, 'Unpin')}
                        className={`flex min-w-0 flex-1 items-center gap-2.5 rounded-md py-1.5 ${view.focus === pin.id ? 'bg-accent/60 text-foreground' : 'text-foreground/80'} ${narrow ? 'justify-center px-0' : 'px-2'}`}
                      >
                        <kind.icon className="size-4 shrink-0" style={{ color: kind.tint }} />
                        {!narrow && <Weighted on={view.focus === pin.id} className="private-text min-w-0 flex-1 truncate text-left">{taskName(pin.title).text || 'Untitled'}</Weighted>}
                      </button>
                      </Tip>
                      </span>
                    </RowMenu>
                    </SortableRow>
                  )
                })}</SortableList>]}</Branches></Unfold>
              </div>)}
              {/* Back after a while: said plainly, with the way to everything else one click away. */}
              {quiet && !narrow && (
                <div data-quiet-return className="mt-4 space-y-1.5 px-2">
                  <p className="text-[0.9375rem] leading-snug text-foreground">Welcome back after {away.days} days. Just capture and Today for now.</p>
                  <Button variant="secondary" size="sm" onClick={() => void call('return:show-all').then(() => chime('unshelve'))}>Show everything</Button>
                </div>
              )}
            </>)
            return (<>
              {parts.map((part, at) => {
                // Tags' own page is opened from the Tags heading over your tags, so it is not listed twice.
                const list = !narrow && tags.length > 0 ? part.list.filter((section) => section.id !== 'tags') : part.list
                return (
                  <Fragment key={part.key}>
                    {part.group ? group(part.group, list) : (<>
                      {/* Rows in no group, after one, get the room a group's heading takes, so they never read as the last group's rows. */}
                      {at > 0 && list.length > 0 && <div data-side-gap aria-hidden className={narrow ? 'mt-3' : 'mt-2.5 mb-0.5 min-h-6'} />}
                      {sorted(list)}
                    </>)}
                    {part.key === pinsAfter && pinned}
                  </Fragment>
                )
              })}
            </>)
          })()}
        </nav>

        {!narrow && !quiet && (<>
        {/* A heading like the groups' above: one row, lit across the sidebar's width as they are. */}
        <div className="group/head relative mt-2.5 mb-0.5 flex min-h-6 items-center">
        <button
          type="button"
          data-side-row
          aria-expanded={kindsOpen}
          onClick={() => (chime(kindsOpen ? 'fold' : 'slide'), setKindsOpen(!kindsOpen))}
          className="flex min-h-6 flex-1 items-center gap-1 rounded-md px-2 py-0.5 text-left text-meta text-muted-foreground transition-colors duration-80 hover:text-foreground data-[fluid-hover-active]:text-foreground"
        >
          Types <ChevronRight className={`size-3 transition-[rotate,opacity] duration-80 ${kindsOpen ? 'rotate-90 opacity-0 group-hover/head:opacity-100' : ''}`} />
        </button>
        </div>
        <Unfold open={kindsOpen}>
          <Branches current={CAPTURE_TYPES.findIndex((type) => view.id === `kind:${type.id}`)} className="flex flex-col">
          {CAPTURE_TYPES.map((type) => {
            const count = captures.filter((capture) => capture.kind === type.id && capture.status !== 'discarded' && !capture.archivedAt).length
            return (
              <SidePeek key={type.id} id={`kind:${type.id}`}>
              <button
                type="button"
                data-side-row
                aria-current={view.id === `kind:${type.id}` ? 'page' : undefined}
                onClick={() => setView({ id: `kind:${type.id}` })}
                className={`flex w-full items-center gap-2.5 rounded-md px-2 py-1 ${view.id === `kind:${type.id}` ? '' : 'text-foreground/80'}`}
              >
                <type.icon className="size-4" style={{ color: type.tint }} />
                <Weighted on={view.id === `kind:${type.id}`} className="flex-1 text-left">{type.label}</Weighted>
                {count ? <Count n={count} className="text-xs text-muted-foreground" /> : null}
              </button>
              </SidePeek>
            )
          })}
          </Branches>
        </Unfold>

        {/* Your most used tags, with counts, the way Todoist keeps favourite labels. */}
        {/* Its name opens the Tags page (G #), the chevron folds the list: one "Tags", not two. */}
        {/* One row, lit as the other headings are: the row opens the Tags page,
            the chevron in it folds the list, with only its own small fill under
            the pointer and a ring only from the keyboard. */}
        {tags.length > 0 && (
          <div className="group/head relative mt-2.5 mb-0.5 flex min-h-6 items-center gap-1 px-2 py-0.5 text-meta">
            {/* Its page's preview on pointing, as every other place's row has. */}
            <SidePeek id="tags" keys="G #">
            <button
              type="button"
              data-side-row
              // On a tag's page whose own row is folded away or not listed, the heading is the place marked.
              aria-current={onTags ? 'page' : undefined}
              onClick={() => setView({ id: 'tags' })}
              className={`absolute inset-0 flex items-center rounded-md px-2 text-left transition-colors duration-80 group-hover/head:text-foreground data-[fluid-hover-active]:text-foreground ${onTags ? 'text-foreground' : 'text-muted-foreground'}`}
            >
              Tags
            </button>
            </SidePeek>
            {/* Holds the word's room, so the chevron sits just after it as in the other headings. */}
            <span aria-hidden className="invisible">Tags</span>
            <button
              type="button"
              aria-label={tagsOpen ? 'Fold the tags away' : 'Show your tags'}
              aria-expanded={tagsOpen}
              onClick={() => (chime(tagsOpen ? 'fold' : 'slide'), setTagsOpen(!tagsOpen))}
              className={`mf-hit relative -my-0.5 -ml-0.5 flex size-4 items-center justify-center rounded text-muted-foreground transition-[color,background-color,opacity] duration-80 hover:bg-accent hover:text-foreground focus-visible:opacity-100 ${tagsOpen ? 'opacity-0 group-hover/head:opacity-100' : ''}`}
            >
              <ChevronRight className={`size-3 transition-transform duration-80 ${tagsOpen ? 'rotate-90' : ''}`} />
            </button>
          </div>
        )}
        <Unfold open={tagsOpen && tags.length > 0}>
          <Branches current={view.id === 'tags' ? sideTags.findIndex(({ tag }) => tag === view.focus) : -1} className="flex flex-col">
          {sideTags.map(({ tag, count, color }) => (
            <RowMenu key={tag} items={[
              { label: 'Open', run: () => setView({ id: 'tags', focus: tag }) },
              { label: 'Rename or merge…', run: () => void renameTag(tag, (now) => view.id === 'tags' && view.focus === tag && setView({ id: 'tags', focus: now })) }
            ]}>
            <button
              key={tag}
              type="button"
              data-side-row
              data-side-tag={tag}
              aria-current={view.id === 'tags' && view.focus === tag ? 'page' : undefined}
              onClick={() => setView({ id: 'tags', focus: tag })}
              // Read ahead while the pointer rests on it, so the click shows it at once.
              onPointerEnter={() => prefetchTag(tag)}
              className={`flex w-full items-center gap-2.5 rounded-md px-2 py-1 ${view.id === 'tags' && view.focus === tag ? '' : 'text-foreground/80'}`}
            >
              <TagIcon tag={tag} color={color} />
              <Weighted on={view.id === 'tags' && view.focus === tag} className="flex-1 text-left">{tag}</Weighted>
              <Count n={count} className="text-xs text-muted-foreground" />
            </button>
            </RowMenu>
          ))}
          </Branches>
        </Unfold>
        </>)}
        </TooltipProvider>

        </div>
        {/* One row at the foot, the way Notion keeps its workspace menu: Settings,
            Safe mode, Blurring, the keys and the tour wait behind Haligtree's name.
            Safe mode on still shows, since a quiet box should say why. */}
        <div className={`mx-2 mb-2 flex shrink-0 items-center gap-1 border-t pt-2 ${narrow ? 'flex-col' : ''}`}>
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              <button type="button" aria-label={`${APP_NAME} menu`}
                className={`flex min-w-0 items-center gap-2 rounded-md py-1.5 text-foreground/80 transition-colors hover:bg-accent/60 data-[state=open]:bg-accent/60 ${narrow ? 'justify-center px-0' : 'flex-1 px-2'}`}>
                <AliveIcon icon={GearIcon} size={16} />
                {!narrow && <span className="flex-1 truncate text-left">{SANDBOX ? 'Sandbox' : <BookName />}</span>}
                {!narrow && <AliveIcon icon={DownChevron} size={14} className="text-muted-foreground" />}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="top" align="start" className="w-60">
              {/* Each row's card beside the menu: what it does, before you choose it. */}
              <MenuPeek />
              {/* Customize leads (the user's ask, 928); Settings closes the menu, its ⌘, still beside it. */}
              <DropdownMenuItem data-peek="customize" onSelect={() => setTimeout(() => setCustomizing(true), 0)}>Customize sidebar…</DropdownMenuItem>
              {/* Every way to bring notes in, under one line. */}
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>Import</DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="w-56">
                  <DropdownMenuItem onSelect={() => void window.api.importFrom('apple-notes')}>From Apple Notes…</DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => void window.api.importFrom('vault')}>From Obsidian or Notion…</DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => void window.api.importFrom('files')}>From highlights and files…</DropdownMenuItem>
                </DropdownMenuSubContent>
              </DropdownMenuSub>
              <DropdownMenuSeparator />
              <DropdownMenuCheckboxItem data-peek="safe" checked={!!settings?.safeMode} onSelect={(event) => event.preventDefault()} onCheckedChange={() => safeMode()}>
                Safe mode<DropdownMenuShortcut>⌥⌘S</DropdownMenuShortcut>
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem data-peek="blur" checked={settings?.blur !== false} onSelect={(event) => event.preventDefault()} onCheckedChange={() => blurring()}>
                Blurring
              </DropdownMenuCheckboxItem>
              {/* Every sticky down the right middle of its screen, clear of other apps' buttons at the top right. Only with one out to tidy. */}
              {!settings?.safeMode && stickiesOut > 0 && <DropdownMenuItem data-peek="tidy" onSelect={() => window.api.tidyStickies()}>Tidy stickies<DropdownMenuShortcut>⌃⌥⌘T</DropdownMenuShortcut></DropdownMenuItem>}
              <DropdownMenuSeparator />
              <DropdownMenuItem data-peek="shortcuts" onSelect={() => window.dispatchEvent(new CustomEvent('haligtree:shortcuts'))}>Keyboard shortcuts<DropdownMenuShortcut>?</DropdownMenuShortcut></DropdownMenuItem>
              <DropdownMenuItem data-peek="welcome" onSelect={() => playWelcome()}>Show the welcome again</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem data-peek="switch" onSelect={() => askBook('switch')}>Switch book…</DropdownMenuItem>
              {SANDBOX ? (<>
                <DropdownMenuItem data-peek="back" onSelect={() => void leaveSandbox()}>Back to my notes</DropdownMenuItem>
                <DropdownMenuItem data-peek="reset" onSelect={() => void resetSandbox()}>Reset the sandbox</DropdownMenuItem>
              </>) : (
                <DropdownMenuItem data-peek="sandbox" onSelect={() => void enterSandbox()}>Open the sandbox…</DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem data-peek="settings" onSelect={() => setView({ id: 'settings' })}>Settings<DropdownMenuShortcut>⌘,</DropdownMenuShortcut></DropdownMenuItem>
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
            <button type="button" aria-label="Keyboard shortcuts" onClick={() => window.dispatchEvent(new CustomEvent('haligtree:shortcuts'))}
              className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground">
              <CircleHelp className="size-4" strokeWidth={2} />
            </button>
          </Tip>
        </div>
      </aside>
      </PopoverAnchor>
      <PopoverContent side={right ? 'left' : 'right'} align="start" sideOffset={8} alignOffset={52}
        // Its own row toggles it: a click there is not a click away.
        onInteractOutside={(event) => (event.target as Element | null)?.closest?.('[data-customize]') && event.preventDefault()}
        className="mf-fade-end max-h-[calc(var(--radix-popover-content-available-height)-60px)] w-72 gap-1 overflow-y-auto p-1.5">
        <p className="px-2 pt-1 pb-1.5 text-meta text-muted-foreground">Shown in the sidebar, in its order: drag one up or down to move it. One switched off leaves the sidebar; G with its letter, or ⌘K, still opens it.</p>
        <ShowList places={SECTIONS} setting="sidebarShown" />
      </PopoverContent>
      </Popover>
      </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col gap-2">
      {/* Clear of the traffic lights whatever sits to the left: nothing, or the folded rail. */}
      <header data-drag-strip="" className={`@container/bar flex h-8 shrink-0 items-center gap-1 ${!sidebar || right ? 'pl-[84px] [:root[data-fullscreen]_&]:pl-3' : narrow ? 'pl-3' : ''}`} style={{ WebkitAppRegion: 'drag' } as CSSProperties}>
        {[
          { icon: LayoutSidebarRightIcon, flip: !right, label: sidebar ? 'Hide the sidebar' : 'Show the sidebar', keys: '⌘B', run: () => (chime(sidebar ? 'fold' : 'slide'), setSidebar(!sidebar)) },
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
        <span className={`${PILL} mf-segs shrink-0`} style={{ WebkitAppRegion: 'no-drag' } as CSSProperties}>
          {[
            { icon: ArrowNarrowLeftIcon, label: 'Back', keys: '⌘[', run: () => step(-1), off: trail.at === 0 },
            { icon: ArrowNarrowRightIcon, label: 'Forward', keys: '⌘]', run: () => step(1), off: trail.at === trail.views.length - 1 }
          ].map(({ icon, label, keys, run, off }) => (
            <Tip key={label} label={keyed(label, keys)}>
              <button type="button" aria-label={label} disabled={off} onClick={run}
                className="relative flex size-[22px] after:absolute after:-inset-0.5 after:rounded-full items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground disabled:pointer-events-none disabled:opacity-40">
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
        {/* Cut short past half the bar, or sooner in a narrow window, so the buttons either side keep their size. */}
        {(() => {
          // The same name Back, Forward and the split give the page: a source's page and What's new were blank here.
          const named = labelOf(view)
          // The page's name rolls to the next one, the way the page itself travels; by a key it is simply there.
          const way = pageTravel('title', view.id, ordered.map((section) => section.id)) || 1
          const title = <h1 data-pane-title className="-my-1 ml-2 max-w-[55%] min-w-12 truncate py-1 font-medium" style={{ textWrap: 'nowrap', WebkitAppRegion: split.panes.length > 1 ? 'no-drag' : undefined } as CSSProperties}>
            <motion.span key={named} className="-my-1 block truncate py-1" initial={byKeys() ? false : { opacity: 0, transform: shift(`translateY(${way * 5}px)`) }} animate={{ opacity: 1, transform: shift('translateY(0px)') }} transition={{ duration: 0.18, ease: EASE }}><Term>{named}</Term></motion.span>
          </h1>
          // Split, the page's name is the split's header: a right click there has the pair's menu.
          return split.panes.length > 1 ? <RowMenu items={pairMenu(split.panes.map((pane) => pane.trail.views[pane.trail.at]), { key: split.front })}>{title}</RowMenu> : title
        })()}
        {/* The open note's name, faint, once its first line has scrolled away. */}
        <TopTitle on={settings?.topTitle !== false} />
        {/* The window's own settings, quiet and side by side: what you hear, how much screen it takes. */}
        <span className="flex shrink-0 items-center">
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
        <Tip label={keyed(newPage ? 'A blank page' : 'New capture, in quick capture', '⌘N')}>
          <button type="button" data-new={newPage ? 'page' : 'capture'} onClick={makeNew}
            style={{ WebkitAppRegion: 'no-drag' } as CSSProperties}
            className={`${PILL} ml-1.5 shrink-0 gap-1.5 pr-1.5 pl-3 text-control font-medium text-foreground/90 transition-colors hover:bg-accent/60 hover:text-foreground`}>
            <AliveIcon icon={PenIcon} size={14} />
            New
            {!newPage && <Pressed keys="C" className="ml-1 h-[18px] min-w-[18px] rounded-[5px]" />}
          </button>
        </Tip>
      </header>
      {/* The first time a page is reached, one line on what it is for. */}
      <PageHint page={view.id} />
      {/* The page itself, a card like the sidebar's; the main landmark, for VoiceOver to jump to. */}
      <div role="main" className="relative flex min-h-0 flex-1 gap-2">
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
            // Put away quicker than it came: closing is the answer, not a show. By ⇧⌘Y it is simply there, and simply goes.
            {...keyedMotion({ opacity: 0, transform: shift('translateX(8px)') }, { opacity: 1, transform: shift('translateX(0px)') }, { duration: 0.2, ease: EASE },
              { opacity: 0, transform: shift('translateX(8px)'), transition: { duration: 0.14, ease: EASE } })}
            className={`flex min-h-0 overflow-hidden rounded-xl border bg-background ${cramped ? 'absolute inset-y-0 right-0 z-20 w-72 shadow-(--mf-panel-shadow)' : 'w-72 shrink-0'}`}
          >
            <RecentPanel className="flex-1" until={recent.until ?? undefined} onClose={() => setRecentState(null)}
              // Beside a week's page, a note opens in its own window so the page stays.
              onOpen={(type, id) => (view.id === 'weekpage' && type !== 'task' ? openApart(type, id) : open(type, id))} />
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
