import { detailsShown, showDetails } from '@/lib/reading'
import { deskAwayAction, useDeskAway } from '@/lib/desk-away'
import { heroBack, heroing } from '@/lib/hero'
import { CardAt, CarriedCard, RoomAt } from '@/components/haligtree/carry'
import { useRemindersInStep } from '@/lib/reminders'
import { useBackLine } from '@/lib/back-line'
import { toolTakes } from '@/lib/tool-keys'
import { useToday } from '@/lib/use-today'
import { showInList } from '@/lib/show-in-list'
import { TagColourPick } from './components/haligtree/tag-colour-pick'
import { themeActions } from '@/lib/theme'
import { START_FOCUS, useAbandonAction } from '@/lib/abandon'
import { warmBin } from '@/lib/fly-home'
import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties, type RefObject } from 'react'
import { wearFinish } from './components/haligtree/review-toolbar'
import { BookOpen, ChevronsDownUp, ChevronsUpDown, Compass, FileText, PanelsTopLeft, Plus, Settings as SettingsLine } from 'lucide-react'
import CameraIcon from '@/components/ui/camera-icon'
import CameraOffIcon from '@/components/ui/camera-off-icon'
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuShortcut, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { AnimatePresence, motion } from 'motion/react'
import { EASE, byKeys, byPointer, keyedMotion, shift, spring } from './lib/motion'
import { Highlight, Unfold, useChosen, useFluidHover, Weighted } from './components/haligtree/glide'
import { chime, chimedWithin, pageTurn, paper, soundOn, tickedWithin, turnedNow } from './lib/sound'
import { peekRead, readOnPress, whenRead } from './lib/early-read'
import { WarmEditor } from './components/haligtree/warm-editor'
import { PageSwap } from './components/haligtree/page-swap'
import { isCollecting, startCollect, stopCollect } from '@/extensions/collect'
import { foldEverything } from './extensions/heading-fold'
import { NotePreview } from './components/haligtree/note-preview'
import { TASK_KIND } from './components/haligtree/everything'
import { PickDays } from './components/haligtree/late-tasks'

import { CAPTURE_TYPES } from './components/capture-kinds/capture-kind-picker'
import { useCaptures, type CaptureMeta } from './components/capture-list'
import { Search, type Action } from './components/search'
import { keepTyped } from './lib/keep-typed'
import { landPromoted } from './lib/promote'
import { CapturesView, keepInbox } from './components/haligtree/captures-view'
import { sources, type SourceSummary } from '@/lib/sources'
import { HomeView } from './components/haligtree/home-view'
import { PracticeAsked } from './components/haligtree/practice-now'
import { LAST_PLACE } from './components/haligtree/resume-cards'
import { ItemsView } from './components/haligtree/items-view'
import { QuestionTabs, QuestionsSaid, startQuestion, type Asked } from './components/haligtree/questions-view'
import { GoalsView, startGoal } from './components/haligtree/goals-view'
import { QueueReader, QueueView } from './components/haligtree/queue-view'
import { useQueue } from './lib/reading-queue'
import { ReviewArea, reviewPlaceName } from './components/haligtree/review-area'
import { SHELVES } from './components/haligtree/files-shelves'
import { SettingsView, exportEverything } from './components/haligtree/settings-view'
import { StatsView } from './components/haligtree/stats-view'
import { PracticesView } from './components/haligtree/practices-view'
import { usePracticeActions } from '@/lib/practices'
import { MapView } from './components/haligtree/map-view'
import { FeedView, showLiked } from './components/haligtree/feed-view'
import { PowersView } from './components/haligtree/powers-view'
import { TagsView } from './components/haligtree/tags-view'
import { RailFolders, SideFolders } from './components/haligtree/side-folders'
import { FoldersSection, newFolderHere } from './components/haligtree/side-folder-section'
import { WritingPages } from './components/haligtree/side-writing'
import { useEveryFold, useFold, type FoldKey } from '@/lib/side-folds'
import { askFolder, folders, useFolderOf, useFolders, type FolderKind } from '@/lib/folders'
import { FolderOpen } from 'lucide-react'
import { FoldersView, tabOfKind } from './components/haligtree/folder-view'
import { FolderPicker } from './components/haligtree/folder-picker'
import { hoverNote } from './components/haligtree/note-preview'
import { groups, isFolder, useGroups } from '@/lib/groups'
import { SourcePageView, SourcesView } from './components/haligtree/source-page'
import { prefetchTag, renameTag } from './components/haligtree/tag-read'
import { TasksView, askDate, askSessions } from './components/haligtree/tasks-view'
import { CalendarView } from './components/haligtree/calendar-view'
import { MatrixView } from './components/haligtree/matrix-view'
import { comingBack } from '@/lib/note-place'
import { bucket, onToday, picked, taskName } from './lib/tasks'
import { stickOnDesktop } from './components/haligtree/sticky-note'
import { Count, Kbd, Toaster, sayNow, toast, refuse, typing, HELD, FocusNote, useFocusMode, SoundToggle, quietly, askSure } from './components/haligtree/ui'
import { shownName } from '@/lib/haligtree'
import { GrowFrom } from './components/haligtree/grow-from'
import { FocusScenery } from './components/haligtree/scenery'
import { TooltipProvider } from './components/ui/tooltip'
import { SidePeek } from './components/haligtree/page-peeks'
import { MenuPeek } from './components/haligtree/menu-peeks'
import { useStickiesOut } from './lib/stickies-out'
import { useReadsIn } from './lib/reads-in'
import { call, unloaded, unread, useAppearance, useLive, haligtree, type Item, type Pin, type Settings, type Task } from './lib/haligtree'
import { Button } from '@/components/ui/button'
import { allRecorded, recordAll } from './lib/recordings'
import { MoreBelow, Tip, showTopTitle, useTopTitle, Pressed, useEscapeLeavesEditor } from '@/components/haligtree/ui'
import { recordAsCapture } from '@/components/haligtree/voice-note'
import { MEETING_WORDS, recordMeeting } from '@/lib/meeting'
import { recordingsWithoutWords, transcribePage } from '@/lib/transcribe'
import { Celebrations, tryCelebration } from '@/components/haligtree/celebrate'
import MagnifierIcon from '@/components/ui/magnifier-icon'
import GearIcon from '@/components/ui/gear-icon'
import LayoutSidebarRightIcon from '@/components/ui/layout-sidebar-right-icon'
import PenIcon from '@/components/ui/pen-icon'
import ShieldCheck from '@/components/ui/shield-check'
import DownChevron from '@/components/ui/down-chevron'
import { AliveIcon } from '@/components/ui/alive-icon'
import { ShortcutSheet } from '@/components/haligtree/shortcut-sheet'
import { UnusedFiles } from '@/components/haligtree/unused-files'
import { Tour } from '@/components/haligtree/tour'
import { SandboxHost, SandboxPill } from '@/components/haligtree/sandbox'
import { SANDBOX, enterSandbox, leaveSandbox, resetSandbox } from '@/lib/sandbox'
import { askBook, switchBook, useShelf, type Book } from '@/lib/books'
import { nameNewDeck, useMadeDecks } from './components/haligtree/decks'
import { NAMING_MENU } from '@/components/haligtree/name-in-place'
import { BookMark, BookName, BookShelf, NewBookRow, askNewBook, bookMenu, colourChoices, colourHeading, colourSwatches } from '@/components/haligtree/books'
import { Welcome } from '@/components/haligtree/welcome'
import { PageHint, pageSaid } from '@/components/haligtree/page-hint'
import { onboarding, playWelcome, tryWelcome } from '@/lib/onboarding'
import { DayView } from '@/components/haligtree/day-view'
import { MonthPage, SCALE_VIEW, WeekPage, YearPage, mondayOf, type Scale } from '@/components/haligtree/periods-view'
import { HistoryPanel, RecentPanel } from '@/components/haligtree/recent-panel'
import { OpenedIcon, pdfDrawing, type Opened } from '@/components/haligtree/recent-island'
import { Passes, openPass } from '@/components/haligtree/pass'
import { noteActions } from '@/lib/notes'
import { headingIn } from '@/lib/capture-links'
import { openApart } from '@/lib/apart'
import { MediaView } from '@/components/haligtree/media-view'
import { sideOrder, sectionMoves, useSectionDrag } from '@/lib/side-sections'
import { sideTagLine, sideTagsOf } from '@/lib/side-tags'
import { FOOT, G_ALIASES, JOURNAL_SCALES, LIBRARY, SECTIONS as PLACES, OFF_SIDEBAR, startPageOf, PlaceIcon, SECTIONS, SIDE_GROUPS, ShowList, showGroup, type Place, placeDrawing, TASK_PAGES, dropInBlock, dropOrder, orderItems, risen, litRow, showWords, sidebarParts, useInOrder, useOrder, useSections, useShown } from '@/components/haligtree/places'
import { BlockList, SortableList, SortableRow } from '@/components/haligtree/sortable'
import { pageTravel } from '@/lib/page-travel'
import { Branches } from '@/components/haligtree/branches'
import { Term, WordNotes } from '@/components/haligtree/term'
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover'
import { copyLinkItem, openFromGrip, RowMenu, Swatch } from '@/components/haligtree/row-menu'
import DotsHorizontalIcon from '@/components/ui/dots-horizontal-icon'
import { onRemoveKey, pinFromSide, sideMenu, useFullMenu } from '@/components/haligtree/side-menu'
import { touch as touchOpen } from '@/lib/open-today'
import { useStoredFlag } from '@/lib/use-stored-flag'
import { NavContext, type Nav, type Scrolled, type Step } from '@/lib/nav'
import { SplitPanes, type PaneApi } from '@/components/haligtree/panes'
import { SplitDrop, type Carried } from '@/components/haligtree/split-drop'
import { dropLayout, PinnedSplit, pinLayout, sameLayout, short, usePinnedLayouts, type PaneName } from '@/components/haligtree/split-pairs'
import type { TabActions } from '@/components/haligtree/tab-row'
import { activeTab, addTab, bareSplit, closeTab, frontOf, insertPane, keepTabs, moveTab, newTab, onShow, paneOf, pinTab, readSplit, removePane, selectTab, tabStep, tabToNewPane, type Split as SplitState, type Pane as PaneState, type Tab, type Trail } from '@/lib/tabs'
import type { RowItem } from '@/components/haligtree/row-menu'
import { keepTitle, openItems, setPaneNotes, setPanes, spendAsideClick, takeClick, titleOf, type PaneWidth } from '@/lib/split'
import XIcon from '@/components/ui/x-icon'
import { WhatsNewPage, openWhatsNew } from '@/components/haligtree/whats-new'
import { PdfReader, fromPdfFocus, pdfFocus, pdfName } from '@/components/pdf/pdf-reader'
import { WebReader, articleName } from '@/components/pdf/web-reader'
import { BinView } from '@/components/haligtree/bin-view'
import { CloseDaySheet, openCloseDay } from '@/components/haligtree/close-day'
import { writeOutDay } from '@/components/haligtree/day-list'
import { SortSheet } from '@/components/haligtree/sort-out'
import { openInboxSort } from '@/lib/sort-out'
import { ReadSheet } from '@/components/haligtree/read-through'
import { openCloseWeek } from '@/components/haligtree/close-week'
import { FIT_CHOICES, FitsSheet, fitsHeard, openFits } from '@/components/haligtree/fits'
import { openPlaybook } from '@/lib/playbook'
import { menuShowing } from '@/lib/menu-keys'
import { ArrowRight, ChevronRight, Gem as GemSign, History } from '@/components/ui/icons'
import { glideWay } from '@/lib/motion'
import { SwipeBack, placesFrom } from '@/components/haligtree/swipe-back'
import { calendarAside, calendarPalette, revealOnCalendar } from '@/lib/calendar-scope'
import { dated, dayjs, dayKey, daysFromToday, noon, num, plural } from '../../main/dates'
import { WrapOffer, WrapSheet, monthToWrap, openWrap } from '@/components/haligtree/wrap-story'
import { kMeansLink } from './extensions/link-tidy'
import { APP_NAME } from '../../main/name'
import { countUse, takeWay, via, type Via } from '@/lib/usage'
import { quoted } from '../../main/clip'

// A nonce makes asking again a fresh visit: the recap reopens each time.
type View = Step

/** An open-or-shut fold in the sidebar, remembered across launches; shut to start unless said. */
/**
 * A sidebar group that folds by itself: whether it is open is its own state (remembered under `kept`), so folding
 * it draws its heading and its rows and nothing else. Held by the main window, one fold drew the whole window.
 * `held` keeps it open whatever was chosen (the sidebar is its narrow rail, with no headings to press).
 * `here`: the page you are on is inside it. Arriving there (⌘K, a link, Back) opens it to show where you are, and it
 * stays open, as Finder reveals a file; pressed while you are there it folds, as its sound says, and stays folded.
 */
function Folding({ kept, held, here, head, children }: { kept: FoldKey; held: boolean; here: boolean; head: (open: boolean, fold: (open: boolean) => void) => React.ReactNode; children: React.ReactNode }): React.JSX.Element {
  const [open, setOpen] = useFold(kept)
  useLayoutEffect(() => void (here && setOpen(true)), [here]) // eslint-disable-line react-hooks/exhaustive-deps
  return <>{head(open || held, setOpen)}<Unfold open={open || held}>{children}</Unfold></>
}

/** The top bar's buttons, one size and one look, each named with its key on hover. */
const TOOL = 'flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground [&_svg]:size-4'
const keyed = (label: string, keys: string): React.JSX.Element => <span className="flex items-center gap-1.5">{label} <Pressed keys={keys} /></span>

/** Whether the window is under 760px wide, followed as it is resized. */
/** The place inside a page a step is on (each page's useStepped), in the words its tabs show; null for a page without places. */
const placeName = (view: View): string | null => {
  const tab = view.tab
  if (!tab) return null
  if (view.id === 'review') return reviewPlaceName(tab)
  if (view.id === 'feed') return ({ notes: 'Notes', reading: 'Reading', liked: 'Liked' } as Record<string, string>)[tab] ?? null
  if (view.id === 'stats') return ({ now: 'At a glance', month: 'Your month', year: 'Your year' } as Record<string, string>)[tab] ?? null
  if (view.id === 'media') return tab === 'all' ? 'All' : SHELVES.find((one) => one.id === tab)?.label ?? null
  // Settings' sections and What Haligtree can do's tabs are kept by the words they show.
  if (view.id === 'tags') return tab === 'manage' ? 'Manage' : 'Read'
  return view.id === 'settings' || view.id === 'powers' ? tab : null
}
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
  // Kept while it fades out, so the words go with the fade rather than before it.
  const [kept, setKept] = useState(title)
  if (title && title !== kept) setKept(title)
  return <span data-top-title={title && on ? '' : undefined} className={`min-w-0 truncate transition-opacity duration-200 ${title && on ? 'opacity-100' : 'opacity-0'}`}>{title || kept}</span>
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

// --- the panes and their tabs, kept across launches, so launch reopens what was open

const SPLIT = 'split'
/** One pane on one tab. */
const fresh = (views: View[] = [{ id: 'day' }]): PaneState => paneOf(newTab(views.map(landing)))
/** What the + opens, and what the last tab of the only pane goes to when it closes. */
const LANDING: View = { id: 'day' }
/** Whether a capture is still in the Inbox without "Show dealt with too": asked by `landing` (set by Home). */
let unsorted: (id: string) => boolean = () => false
/**
 * Pages that are not places of their own any more, sent where they live now:
 * Everything is the Inbox with "Show dealt with too" on (only
 * when what it opens needs it), Tomorrow and This week the top of Upcoming.
 */
function landing(view: View): View {
  if (view.id === 'all') return { ...view, id: 'inbox', tab: view.focus && unsorted(view.focus) ? undefined : 'sorted' }
  if (view.id === 'tomorrow' || view.id === 'week') return { ...view, id: 'upcoming' }
  return view
}
/** Pages that hold one note open beside their list, its id as the step's focus. */
/** Words selected in the note being written in: ⌘B is Bold for them, and the sidebar's anywhere else (a selection left in a note you have clicked away from counts for nothing). */
/** The caret in a note's editor, in any mode (Vim's normal mode too): there ⌘B is Bold, as in Obsidian. */
const caretInNote = (): boolean => !!document.activeElement?.closest('.ProseMirror[contenteditable="true"]')
/** Settings as a place: the gear its button at the sidebar's foot draws, for a pane on it. */
/** An icon alone in the narrow rail (its search, its rows, the book's menu): one round button, lit as a circle at every width (17 Nov: "highlight no longer a circle on small screen"). */
const NARROW_ICON = 'mx-auto size-8 shrink-0 justify-center rounded-full p-0'
const SETTINGS_PLACE: Place = { id: 'settings', label: 'Settings', icon: SettingsLine, alive: GearIcon, emoji: '⚙️', tint: 'gray' }
const holdsNotes = (id: string): boolean => !['pick', 'home', 'day', 'weekpage', 'monthpage', 'yearpage', 'tags', 'sources', 'source', 'stats', 'map', 'feed', 'powers', 'whatsnew', 'settings', 'review', 'queue', 'calendar', 'practices', 'kind:practice', 'pdf', 'web'].includes(id)
/** A step onto a note (not a task, a day or an event): the page that shows it turns, as a book's does. */
const turnsPage = (view: View): boolean => !!view.focus && holdsNotes(view.id) && !['today', 'tomorrow', 'upcoming', 'routines', 'later', 'alltasks', 'goals', 'week', 'matrix', 'discarded'].includes(view.id)
/** Where one thing opens: a view by name, a day's page, or a note or task in its section. */
const stepOf = (type: string, id: string): View =>
  // A Writing or Gems folder: "article:<group>" or "nugget:<group>", its list opened inside it.
  // One tag's cards studied in Review.
  type === 'study' ? { id: 'review', focus: id }
  : type === 'folder' ? { id: 'folders', folder: id.slice(id.indexOf(':') + 1) }
  // A person's link: their own page in People, the one the People list opens.
  : type === 'person' || type === 'character' ? { id: 'source', focus: `attribution:${id}` }
  // A work found in ⌘K: its page among the sources.
  : type === 'work' ? { id: 'source', focus: `medium:${id}` }
  : type === 'view' ? { id } : type === 'pdf' || type === 'web' ? { id: type, focus: id } : type === 'day' ? { id: 'day', focus: id } : type === 'event' ? { id: 'calendar', focus: `event:${id}` } : { id: type === 'capture' ? 'all' : type === 'task' ? 'upcoming' : `${type}s`, focus: id }
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
/** Already what is asked for: the same note wherever it is listed, or the same place. */
const sameOpen = (a: View, b: View): boolean => {
  if (b.nonce || b.id === 'pick' || (b.tab !== undefined && b.tab !== a.tab)) return false
  if (b.focus && holdsNotes(b.id)) return a.focus === b.focus && holdsNotes(a.id)
  return a.id === b.id && a.folder === b.folder && (a.focus === b.focus || (b.focus === undefined && atNow(a)))
}
function loadSplit(): SplitState {
  const today = (view: View): View => (DATED.includes(view.id) ? { ...view, focus: undefined } : view)
  try {
    // Kept splits, an idea gone: their one value is let go. A value from before tabs reads as one tab a pane.
    localStorage.removeItem('split-kept')
    const kept = readSplit(JSON.parse(localStorage.getItem(SPLIT) ?? localStorage.getItem('pane-one') ?? 'null'), (view) => today(landing(view)))
    if (kept) return kept
  } catch {
    // Nothing kept, or nothing readable: one pane on the Day page.
  }
  const one = fresh()
  return { panes: [one], front: one.key, sizes: [1] }
}
function saveSplit(split: SplitState): void {
  try {
    localStorage.setItem(SPLIT, JSON.stringify(bareSplit(split)))
    localStorage.removeItem('pane-one')
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
/**
 * The lists commonplace keepers share as ideas for a first page (r/commonplacebook): each a
 * folder of Gems, made with its emoji, with Undo.
 */
const STARTER_LISTS: [string, string][] = [
  ['👂', 'Overheard'], ['🔎', 'Random research'], ['📛', 'Interesting names'], ['🌸', 'Scents'],
  ['🙏', 'Grateful for'], ['🧩', 'Words from crosswords'], ['🍲', 'Recipes to keep'], ['🙈', 'Searches I would not admit to']
]
async function startList(icon: string, name: string): Promise<string> {
  // Started already: that one is opened, never a second of the same name.
  const had = (await folders.list()).find((one) => !one.parent && one.name.trim().toLowerCase() === name.toLowerCase())
  if (had) return (toast(`${quoted(name, 80)} is already a folder`), had.id)
  const made = await folders.make(name)
  await folders.set(made, { icon })
  chime('settled')
  toast(`${quoted(name, 80)} is a folder now, in the sidebar`, () => void folders.remove(made))
  return made
}

/** A capture kind's own page ("kind:idea"), if that is where a step is. */
const kind = (view: View): (typeof CAPTURE_TYPES)[number] | undefined => CAPTURE_TYPES.find((type) => `kind:${type.id}` === view.id)
/** Which captures each list of them keeps. */
const keep: Record<string, (capture: CaptureMeta) => boolean> = {
  // What has no exit yet; archived is kept, out of sight, so not waiting here.
  inbox: keepInbox,
  all: (capture) => capture.status !== 'discarded',
  // Nothing is destroyed: a discard lands here, and comes back from here.
  discarded: (capture) => capture.status === 'discarded',
  // Out of sight but kept: one moved to the Bin is in the Bin, not here.
  archived: (capture) => !!capture.archivedAt && capture.status !== 'discarded',
  // Every word or term looked up (Questions, Looked up): one kept asking is an open question now, listed there instead.
  lookups: (capture) => capture.kind === 'word' && capture.status !== 'discarded' && capture.status !== 'question' && !capture.archivedAt
}

/**
 * The same functions every time, each calling the newest one it was given: how a part of the window that is kept
 * as drawn (a pane's page) still reaches what the window does now, without being drawn again each time the window is.
 */
function useNewest<T extends Record<string, (...args: never[]) => unknown>>(now: T): T {
  const newest = useRef(now)
  newest.current = now
  const [same] = useState(() => Object.fromEntries(Object.keys(now).map((name) => [name, (...args: never[]) => newest.current[name](...args)])) as T)
  return same
}

/** What a pane's page asks of the window: each is the window's newest (useNewest), so a page kept as drawn is never behind. */
type PageDoes = {
  open: (type: string, id: string, key?: string, folder?: string) => void
  toScale: (scale: Scale, key?: string) => void
  setView: (asked: View, key?: string) => void
  setTrail: (key: string, change: (trail: Trail) => Trail, tab?: string) => void
  closeTabIn: (key?: string, tab?: string) => void
  aside: (next: View, from?: string) => void
  openTab: (asked: View, key?: string, always?: boolean) => void
  setRecent: (until: string | null | 'close') => void
  navFor: (key: string, tab: string, view: View) => Nav
  placesTo: (key?: string) => Action[]
  /** The sidebar's pages in their order, for which way a page settles in. */
  order: () => string[]
}

/**
 * A pane's page: the step it is on, drawn with everything it opens kept in that pane. Its own component, drawn
 * again only when its step, its tab or its pane changes: the window draws for many reasons that are not the page's
 * (a fold in the sidebar, a count, a letter typed into ⌘K, the sidebar's mark moving), and drawn from inside the
 * window each of those drew the whole page again, two or three times for one page change.
 */
const PanePage = memo(function PanePage({ does, pane: key, tab, view, recentOpen, tabChosen, splitRef }: {
  does: PageDoes
  pane: string
  tab: string
  view: View
  /** “Recent” is open beside the page (the week's page lights its button). */
  recentOpen: boolean
  tabChosen: RefObject<boolean>
  splitRef: RefObject<SplitState>
}): React.JSX.Element {
  const go = (type: string, id: string): void => does.open(type, id, key)
  const scale = (to: Scale): void => does.toScale(to, key)
  // What the page sees of its pane's trail: the same for as long as it is on this step, and each call asks the window as it is now.
  const nav = useMemo<Nav>(() => ({
    here: view,
    go: (focus) => does.navFor(key, tab, view).go(focus),
    step: (patch) => does.navFor(key, tab, view).step(patch),
    keep: (patch) => does.navFor(key, tab, view).keep(patch)
  }), [does, key, tab, view])
  // ⌘K's places for a pane's own picker: each runs the window's newest.
  const places = useMemo(() => (view.id === 'pick' ? does.placesTo(key).map((one, at) => ({ ...one, run: () => does.placesTo(key)[at].run() })) : []), [does, key, view.id])
  return (
    // Views are switched all day, as Finder and Mail switch them: the new
    // one goes on show whole the frame its reads are in, the old one staying
    // up until then and gone in that same frame (page-swap.tsx), so no frame
    // shows two pages, two notes, an empty window, or the window through two
    // faint ones. Clicked to, it only settles in: down the sidebar it comes
    // up from below, up it from above. A transform string, so it stays
    // smooth while the view mounts. Each page keeps its own step.
    // Two tabs on one kind of page share it, as Back and Forward do: only the note changes, so a switch never builds the list again.
    <PageSwap id={view.id}>
    <NavContext.Provider value={nav}>
    <motion.div
      key={view.id}
      data-page={view.id}
      // Keyboard travel (G and a letter, ⌘[ and ⌘]) is done hundreds of times a day: no settle then.
      initial={byKeys() || tabChosen.current || heroing() ? false : { transform: shift(`translateY(${(pageTravel(key, view.id, does.order()) || 1) * 6}px)`) }}
      animate={{ transform: shift('translateY(0px)') }}
      transition={{ duration: 0.16, ease: EASE }}
      className="flex min-w-0 flex-1"
    >
      {view.id === 'pick' ? (
        // ⌥⌘\'s new pane, or ⌘O in any pane: ⌘K's own search, as the pane's page, for anything to open here.
        // Asked for over a page (⌘O), Esc goes back to that page; on a new tab, it closes the tab.
        (() => {
          const shown = splitRef.current.panes.find((one) => one.key === key)
          const before = (shown ? activeTab(shown).trail.at : 0) > 0
          return (
        <Search inPane={{ title: 'Open anything here', lead: <>A page, a list, a note, a task, a day, or a place like the Inbox or the Calendar. <Kbd>↵</Kbd> opens it in this pane, <Kbd>esc</Kbd> {before ? 'goes back' : 'closes the tab'}.</> }}
          actions={places} placeholder="Type a name, or a place to go…"
          onClose={() => (before ? does.setTrail(key, (trail) => ({ ...trail, views: trail.views.slice(0, trail.at), at: trail.at - 1 })) : does.closeTabIn(key, tab))}
          onOpen={(type, id) => (via('search'), go(type, id))} onAside={(type, id) => (via('search'), does.aside(stepOf(type, id), key))} onTab={(type, id) => (via('search'), does.openTab(stepOf(type, id), key))} />
          )
        })()
      ) : view.id === 'home' ? (
        <HomeView onOpen={(type, id) => (via('home'), go(type, id))} onView={(id, focus) => (via('home'), does.setView({ id, focus }, key))} />
      ) : view.id === 'discarded' ? (
        <BinView onOpen={go} focus={view.focus} />
      ) : view.id === 'lookups' || (view.id === 'questions' && view.folder === 'looked') ? (
        // Lookups are questions answered at once: Questions' Looked up list. An old link to Lookups lands here too.
        <CapturesView title="Questions" lookups keep={keep.lookups} focus={view.focus} onOpen={go}
          lead={<div data-list-tabs className="flex shrink-0" style={{ marginLeft: 'calc(var(--list-edge) - var(--list-ink) - 3px)' }}><QuestionTabs on="looked" pick={(one) => does.setView({ id: 'questions', folder: one }, key)} /></div>} said={<QuestionsSaid on="looked" />} />
      ) : view.id === 'inbox' || view.id === 'archived' ? (
        <CapturesView title={SECTIONS.find((section) => section.id === view.id)!.label} keep={keep[view.id]} focus={view.focus} onOpen={go} archived={view.id === 'archived'} inbox={view.id === 'inbox'} />
      ) : view.id === 'day' ? (
        <DayView start={view.focus} onOpen={go} onScale={scale} onView={(id, focus) => does.setView({ id, focus }, key)} />
      ) : view.id === 'weekpage' ? (
        <WeekPage start={view.focus} onOpen={go} onScale={scale} onRecent={does.setRecent} recentOpen={recentOpen} onDay={(day) => go('day', day)} />
      ) : view.id === 'monthpage' ? (
        <MonthPage start={view.focus} onScale={scale} onDay={(day) => go('day', day)} />
      ) : view.id === 'yearpage' ? (
        <YearPage start={view.focus} onScale={scale} onMonth={(month) => does.setView({ id: 'monthpage', focus: month }, key)} onDay={(day) => go('day', day)} />
      ) : view.id === 'practices' || view.id === 'kind:practice' ? (
        <PracticesView key={view.focus === 'new' ? `new-${view.nonce ?? ''}` : 'practices'} focus={view.focus} onOpen={go} />
      ) : kind(view) ? (
        <CapturesView title={kind(view)!.label} keep={(capture) => capture.kind === kind(view)!.id && capture.status !== 'discarded'} focus={view.focus} onOpen={go} />
      ) : view.id === 'review' ? (
        <ReviewArea key={view.focus ?? ''} focus={view.focus} onOpen={go} />
      ) : view.id === 'today' || view.id === 'upcoming' || view.id === 'routines' || view.id === 'later' || view.id === 'alltasks' ? (
        <TasksView mode={view.id} focus={view.focus} onOpen={go} />
      ) : view.id === 'calendar' ? (
        <CalendarView focus={view.focus} onOpen={go} />
      ) : view.id === 'matrix' ? (
        <MatrixView focus={view.focus} onOpen={go} />
      ) : view.id === 'nuggets' || view.id === 'articles' || view.id === 'questions' ? (
        // Questions are pages in Pages: sent to one, Writing opens with its "Questions" chip on.
        <ItemsView tier={view.id === 'nuggets' ? 'nugget' : 'article'} only={view.id === 'questions' ? 'questions' : undefined} focus={view.focus}
          ask={view.id === 'questions' && (view.folder === 'answered' || view.folder === 'words') ? view.folder : 'open'} onAsk={view.id === 'questions' ? (one: Asked) => does.setView({ id: 'questions', folder: one }, key) : undefined}
          // Gone into to show the note open there (`reveal`), the folder is the place you are already at, not a step: the
          // note stays open and Back is as it was. Asked for (a press on a folder), it is a step of its own.
          folder={view.id !== 'questions' ? view.folder : undefined} onFolder={(id, reveal) => reveal
            ? does.setTrail(key, (trail) => ({ ...trail, views: trail.views.map((one, at) => (at === trail.at ? { ...one, folder: id ?? undefined } : one)) }))
            : does.setView({ id: view.id, folder: id ?? undefined })} onOpen={go} />
      ) : view.id === 'goals' ? (
        <GoalsView focus={view.focus} onOpen={go} />
      ) : view.id === 'queue' ? (
        <QueueView />
      ) : view.id === 'folders' ? (
        <FoldersView focus={view.folder} note={view.focus} tab={view.tab} onTab={(tab) => does.setView({ id: 'folders', folder: view.folder, tab }, key)} onOpen={(type, id, folder) => does.open(type, id, key, folder)} onPlace={(id) => does.setView({ id: 'folders', folder: id ?? 'all' }, key)} />
      ) : view.id === 'tags' ? (
        <TagsView onOpen={go} focus={view.focus} />
      ) : view.id === 'sources' ? (
        <SourcesView onOpen={go} />
      ) : view.id === 'source' ? (
        <SourcePageView key={view.focus} focus={view.focus} onOpen={go} onSources={() => does.setView({ id: 'sources' }, key)} />
      ) : view.id === 'stats' ? (
        <StatsView key={`${view.focus}-${view.nonce}`} recap={view.focus} />
      ) : view.id === 'map' ? (
        <MapView onOpen={go} />
      ) : view.id === 'media' ? (
        <MediaView onOpen={go} />
      ) : view.id === 'pdf' && view.focus ? (
        <PdfReader key={view.focus} {...fromPdfFocus(view.focus)} page={Number(view.tab) || undefined} onPage={(page) => nav.keep({ tab: String(page) })} />
      ) : view.id === 'web' && view.focus ? (
        <WebReader key={view.focus} href={view.focus} />
      ) : view.id === 'whatsnew' ? (
        <WhatsNewPage focus={view.focus} onView={(id, focus) => does.setView({ id, focus }, key)} />
      ) : view.id === 'feed' ? (
        <FeedView onOpen={go} focus={view.focus} />
      ) : view.id === 'powers' ? (
        <PowersView onView={(id, focus) => does.setView({ id, focus }, key)} />
      ) : (
        <SettingsView focus={view.focus} nonce={view.nonce} />
      )}
    </motion.div>
    </NavContext.Provider>
    </PageSwap>
  )
})

export function Home(): React.JSX.Element {
  // Escape in a note lets go of the note, and never goes back: ⌘[ does.
  useEscapeLeavesEditor()
  // The Bin's paper made ready while the app is idle (lib/fly-home.ts).
  useEffect(warmBin, [])
  // Back after hours away: what came due, said once (lib/back-line.ts).
  useBackLine()
  // A task in your Mac's Reminders kept ticked in step (lib/reminders.ts).
  useRemindersInStep()
  // Where you have been, for back and forward: a list and a place in it, for
  // each tab of each pane of the page. The tab open in the pane in front takes
  // the keys, the top bar's title and the sidebar's one light.
  const [split, setSplit] = useState<SplitState>(loadSplit)
  const splitRef = useRef(split)
  splitRef.current = split
  const frontRef = useRef(split.front)
  frontRef.current = split.front
  const front = frontOf(split)
  // What was closed, newest last, for ⇧⌘T as in a browser: a tab closed, or a note left for another page in its tab.
  const closed = useRef<({ tab: Tab; pane: string; at: number; paneAt: number } | { view: View })[]>([])
  const leftFrom = useRef<{ tab: string; view: View } | null>(null)
  {
    const tab = activeTab(frontOf(split))
    const now = tabStep(tab)
    const was = leftFrom.current
    if (was && was.tab === tab.key && was.view.focus && holdsNotes(was.view.id) && (was.view.id !== now.id || was.view.focus !== now.focus)) closed.current = [...closed.current.slice(-19), { view: { id: was.view.id, focus: was.view.focus, tab: was.view.tab, folder: was.view.folder } }]
    leftFrom.current = { tab: tab.key, view: now }
  }
  const trail = activeTab(front).trail
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
    const there = onShow(one)
    return holdsNotes(there.id) ? there.focus ?? null : null
  })), [split])
  // Kept across launches: every pane, every tab, the one open in each.
  useEffect(() => saveSplit(split), [split])
  // Back returns to exactly what you saw: each step keeps how far its page
  // was scrolled, read as you leave it and put back when you return (panes.tsx).
  // Each tab keeps its own: its step on show holds its scroll while it is not.
  const apis = useRef(new Map<string, PaneApi>())
  const scrolled = (key: string): Scrolled => apis.current.get(key)?.scrolled() ?? []
  /** The trail of a tab of a pane, its open one unless said. */
  const setTrail = (key: string, change: (trail: Trail) => Trail, tab?: string): void =>
    setSplit((now) => ({ ...now, panes: now.panes.map((one) => (one.key !== key ? one : { ...one, tabs: one.tabs.map((each) => (each.key === (tab ?? one.active) ? { ...each, trail: change(each.trail) } : each)) })) }))
  /** A pane's open tab, holding how its page is scrolled now: read as it goes off show. */
  const withScroll = (now: SplitState, key: string, scroll: Scrolled): SplitState => ({ ...now, panes: now.panes.map((one) => (one.key !== key ? one : {
    ...one, tabs: one.tabs.map((each) => (each.key !== one.active ? each : { ...each, trail: { ...each.trail, views: each.trail.views.map((step, at) => (at === each.trail.at ? { ...step, scroll } : step)) } }))
  })) })
  /** Set just before a tab is chosen: its page is simply there, not settling in as a move to another place does. */
  const tabChosen = useRef(false)
  useEffect(() => void (tabChosen.current = false))
  /** Another tab of a pane opens, and takes the keys. */
  const goToTab = (key: string, tab: string): void => {
    const pane = splitRef.current.panes.find((one) => one.key === key)
    if (!pane) return
    if (pane.active !== tab) {
      const scroll = scrolled(key)
      chime('tap')
      tabChosen.current = true
      comingBack(true)
      setSplit((now) => selectTab(withScroll(now, key, scroll), key, tab))
    }
    toFront(key)
  }
  /** The tab of a pane already on what is asked for, if another than the open one. */
  const otherTab = (key: string, next: View): string | null => {
    const pane = splitRef.current.panes.find((one) => one.key === key)
    if (!pane || sameOpen(onShow(pane), next)) return null
    return pane.tabs.find((one) => one.key !== pane.active && sameOpen(tabStep(one), next))?.key ?? null
  }
  /** A new step after the one you are on, which keeps its scroll; what was ahead is let go. */
  const push = (trail: Trail, next: View, scroll: Scrolled): Trail => ({
    views: [...trail.views.slice(0, trail.at), { ...trail.views[trail.at], scroll }, next],
    at: trail.at + 1
  })
  const setView = (asked: View, key = frontRef.current): void => {
    // Opened, not returned to (lib/note-place.ts): said before the tab already on it is chosen, which says otherwise.
    comingBack(false)
    // ⌘-clicked: a new tab. ⌥-clicked: to the side. Whatever the click was on.
    const how = takeClick()
    if (how) return placed(asked, how, key)
    const next = landing(asked)
    // Already open in another tab of this pane: that tab, never the same thing twice.
    const there = otherTab(key, next)
    if (there) return goToTab(key, there)
    // A pinned tab keeps its page, as Safari's and Arc's do: going somewhere else from it (another section, another
    // note) opens a new tab beside it. Moving within its own page (a day before, a week on) stays in it.
    const pane = splitRef.current.panes.find((one) => one.key === key)
    if (pane?.tabs.find((one) => one.key === pane.active)?.pinned) {
      const here = onShow(pane)
      if (here.id !== next.id || (holdsNotes(next.id) && here.focus !== next.focus)) return openTab(next, key)
    }
    const scroll = scrolled(key)
    setTrail(key, (trail) => {
      const here = trail.views[trail.at]
      // Going where you already are is not a step: Back would have to undo it.
      // Nor is the section you are in, asked for again: what is open stays.
      // A day's, week's or month's page asked for by name goes to now, from any other day it is on.
      // A tab asked for (the Inbox's "Show dealt with too", from an Everything link) is a change of its own.
      if (here.id === next.id && here.folder === next.folder && (here.focus === next.focus || (next.focus === undefined && atNow(here))) && here.nonce === next.nonce && (next.tab === undefined || next.tab === here.tab)) return trail
      if (here.id === next.id && next.focus === undefined && !atNow(here)) chime(here.id === 'day' ? 'page' : 'season')
      // One sound a move: a place reached by something that already spoke (a map dot, ⌘K's Year) stays quiet.
      // A note opened on another page is heard as its page turn alone.
      if (here.id !== next.id && !chimedWithin(150) && !turnedNow(next.focus) && !tickedWithin(200)) chime('tap')
      // A new pane's picker (⌘\) is not a step: what it opens takes its place, and Back never returns to it.
      if (here.id === 'pick') return { ...trail, views: [...trail.views.slice(0, trail.at), next] }
      return push(trail, next, scroll)
    })
  }
  /** Opened as the click that asked said: a new tab, to the side, or (no way said) in the tab on show. */
  const placed = (next: View, how: 'tab' | 'aside' | null, key = frontRef.current): void =>
    how === 'tab' ? openTab(next, key) : how === 'aside' ? aside(next, key) : setView(next, key)
  // A step through the trail: by a key, a swipe, a mouse's side button or a history menu it is simply there.
  const step = (by: number, key = frontRef.current): void => stepBy(by, key)
  const stepBy = (by: number, key: string): void => {
    via('back')
    // A page returned to: a note on it is exactly where it was left (lib/note-place.ts).
    comingBack(true)
    const scroll = scrolled(key)
    setTrail(key, ({ views, at }) => {
      const next = Math.max(0, Math.min(views.length - 1, at + by))
      if (next === at) return { views, at }
      // Back and forward sound like any other move between sections; onto a note, its page turn is the sound.
      if (!turnsPage(views[next])) chime('tap')
      return { views: views.map((one, index) => (index === at ? { ...one, scroll } : one)), at: next }
    })
  }
  // What a page sees of its pane's trail: opening something in it is a step;
  // a tab or the day on show is kept in the step it is on.
  const navFor = (key: string, tab: string, view: View): Nav => ({
    here: view,
    go: (focus) => {
      const there = focus && otherTab(key, { id: view.id, focus })
      if (there) return goToTab(key, there)
      const scroll = scrolled(key)
      setTrail(key, (trail) => {
        const here = trail.views[trail.at]
        if (here.id !== view.id || (here.focus ?? null) === focus) return trail
        return push(trail, { id: here.id, focus: focus ?? undefined, folder: here.folder, tab: here.tab }, scroll)
      }, tab)
    },
    step: (patch) => {
      const scroll = scrolled(key)
      setTrail(key, (trail) => {
        const here = trail.views[trail.at]
        if (here.id !== view.id || Object.entries(patch).every(([name, value]) => here[name as keyof View] === value)) return trail
        return push(trail, { ...here, scroll: undefined, ...patch }, scroll)
      }, tab)
    },
    keep: (patch) =>
      setTrail(key, (trail) => {
        const here = trail.views[trail.at]
        if (here.id !== view.id || Object.entries(patch).every(([name, value]) => here[name as keyof View] === value)) return trail
        return { ...trail, views: trail.views.map((one, index) => (index === trail.at ? { ...one, ...patch } : one)) }
      }, tab)
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
      // A right click brought it forward, and its menu has the keys now: moving them would shut it.
      if (menuShowing()) return
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
  /** A new tab in a pane (the one in front unless said), after its open one and open. What is open there already just comes forward. */
  const openTab = (asked: View, key = frontRef.current, always = false): void => {
    const next = landing(asked)
    if (!always) {
      const there = otherTab(key, next)
      if (there) return goToTab(key, there)
      const pane = splitRef.current.panes.find((one) => one.key === key)
      if (pane && sameOpen(onShow(pane), next)) return toFront(key)
    }
    if (next.focus && holdsNotes(next.id)) pageTurn(false, next.focus)
    else if (!chimedWithin(150)) chime('slide')
    const scroll = scrolled(key)
    tabChosen.current = true
    setSplit((now) => addTab(withScroll(now, key, scroll), key, newTab([next])))
    toFront(key)
  }
  /**
   * Open to the side of a pane (the one in front unless said): a new tab in the
   * pane to its right, or with none there, a new pane. No other pane is touched,
   * and there is no limit: past the room for them all, the panes scroll sideways (panes.tsx).
   */
  const aside = (next: View, from = frontRef.current): void => {
    const now = splitRef.current
    const at = Math.max(0, now.panes.findIndex((one) => one.key === from))
    const beside = now.panes[at + 1]
    if (beside) return openTab(next, beside.key)
    placeAt(next, at + 1)
  }
  const asideRef = useRef(aside)
  asideRef.current = aside
  /** A new pane at gap `at` between the panes, however many there are already. */
  const placeAt = (next: View, at: number): void => {
    if (next.focus) pageTurn(false, next.focus)
    else chime('slide')
    setSplit((now) => insertPane(now, fresh([next]), at))
  }
  /** What was carried, as a step: a note by its kind and id, or a list's row in the list it is in. */
  const carriedStep = (carried: Carried): View | null => {
    if (carried.open) {
      const at = carried.open.indexOf(':')
      return stepOf(carried.open.slice(0, at), carried.open.slice(at + 1))
    }
    const pane = splitRef.current.panes.find((one) => one.key === carried.row?.pane)
    const there = pane && onShow(pane)
    return there && holdsNotes(there.id) ? { id: there.id, focus: carried.row!.id, tab: there.tab } : null
  }
  /** A tab moved, its scroll going with it; a pane left empty closes, said with Undo. */
  const moveCarried = (from: string, tab: string, change: (now: SplitState) => SplitState, sound: Parameters<typeof chime>[0]): void => {
    const was = splitRef.current
    const scroll = scrolled(from)
    const source = was.panes.find((one) => one.key === from)
    const moving = source?.tabs.find((one) => one.key === tab)
    if (!source || !moving) return
    const next = change(source.active === tab ? withScroll(was, from, scroll) : was)
    chime(sound)
    tabChosen.current = true
    setSplit(next)
    if (next.panes.length < was.panes.length) toast(`Moved ${quoted(short(shownName(paneName(tabStep(moving)).title)), 80)}, and its split closed`, () => setSplit(was))
    toFront(next.front)
  }
  /** Carried to a gap between panes (split-drop.tsx): a new pane there. */
  const dropAside = (carried: Carried, at: number): void => {
    if (carried.tab) return moveCarried(carried.tab.pane, carried.tab.key, (now) => tabToNewPane(now, carried.tab!.pane, carried.tab!.key, at), 'slide')
    const next = carriedStep(carried)
    if (!next) return void chime('nope')
    setSearching(false)
    setSearchFor('')
    placeAt(next, at)
  }
  /** Carried to a row of tabs (split-drop.tsx): a tab there, open, placed where the gap showed. */
  const dropOnRow = (carried: Carried, key: string, at: number): void => {
    if (carried.tab) return moveCarried(carried.tab.pane, carried.tab.key, (now) => moveTab(now, carried.tab!.pane, carried.tab!.key, key, at), 'settled')
    const next = carriedStep(carried)
    if (!next) return void chime('nope')
    const there = otherTab(key, next)
    if (there) return goToTab(key, there)
    if (next.focus) pageTurn(false, next.focus)
    else chime('slide')
    const scroll = scrolled(key)
    tabChosen.current = true
    setSplit((now) => addTab(withScroll(now, key, scroll), key, newTab([landing(next)]), at))
    toFront(key)
  }
  // ⌘W (File > Close): the frontmost thing open goes, as its ✕ or Esc would: a dialog or panel, then the note or
  // task open beside the front pane's list, then the front pane's tab; the window only when that tab is all there is, on the landing page.
  useEffect(() => {
    const onClose = (event: Event): void => {
      // A pinned tab's "Close this pinned tab?" up: a second ⌘W says yes.
      if (pinAsked()) return event.preventDefault()
      if (document.querySelector('[role="dialog"], [data-radix-popper-content-wrapper], [role="menu"]')) {
        event.preventDefault()
        // As Esc pressed where the keys are: a field's own Esc (search's) hears it, and it rises to the page's panels.
        return void (document.activeElement ?? document.body).dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true, cancelable: true }))
      }
      const key = frontRef.current
      const pane = splitRef.current.panes.find((one) => one.key === key)
      const here = pane && onShow(pane)
      if (here?.focus && holdsNotes(here.id)) {
        event.preventDefault()
        chime('fold')
        return setTrail(key, (trail) => ({ ...trail, views: trail.views.map((one, index) => (index === trail.at ? { ...one, focus: undefined } : one)) }))
      }
      if (!lastLanding(key)) return void (event.preventDefault(), closeAsked(key))
    }
    window.addEventListener('haligtree:close-front', onClose)
    return () => window.removeEventListener('haligtree:close-front', onClose)
  })
  /** The window's only tab, already on the landing page: nothing left to close but the window. */
  const lastLanding = (key: string): boolean => {
    const now = splitRef.current
    const pane = now.panes.find((one) => one.key === key)
    return now.panes.length === 1 && pane?.tabs.length === 1 && sameOpen(onShow(pane), LANDING) && pane.tabs[0].trail.views.length === 1
  }
  /** A tab closes (the open one unless said). Its pane's last takes the pane, said with Undo; the only pane's last goes to the landing page. */
  const closeTabIn = (key = frontRef.current, tab?: string): void => {
    const now = splitRef.current
    const pane = now.panes.find((one) => one.key === key)
    const gone = pane?.tabs.find((one) => one.key === (tab ?? pane.active))
    if (!pane || !gone) return
    if (lastLanding(key)) return void chime('nope')
    // A pane folding away is the paper. The ordinary fold on top of it was two sounds for one close (⌘W, 17 Nov).
    const paneGoes = pane.tabs.length === 1 && now.panes.length > 1
    if (paneGoes) paper('fold')
    else chime('fold')
    closed.current = [...closed.current.slice(-19), { tab: gone, pane: key, at: pane.tabs.indexOf(gone), paneAt: now.panes.indexOf(pane) }]
    const next = closeTab(now, key, gone.key, () => newTab([LANDING]))
    tabChosen.current = true
    setSplit(next)
    if (next.panes.length < now.panes.length) {
      lastFocus.current.delete(key)
      toast(`Closed ${quoted(short(shownName(paneName(tabStep(gone)).title)), 80)}, and its split`, () => setSplit(now))
    }
    toFront(next.front)
  }
  /** "Close this pinned tab?" asked now: its Close pressed, as a second ⌘W, ⌃W or ⌫ does. */
  const pinAsked = (): boolean => {
    const yes = document.querySelector<HTMLElement>('[data-sure="pinned-tab"] [data-sure-yes]')
    yes?.click()
    return !!yes
  }
  /**
   * A tab closed by its keys (⌘W, ⌃W, ⌫) or a middle click: a pinned one is asked about in place first, under it,
   * and the same key again while it asks closes it. Its menu's Close closes it at once: that is the choice made.
   */
  const closeAsked = (key = frontRef.current, tab?: string): void => {
    if (pinAsked()) return
    const pane = splitRef.current.panes.find((one) => one.key === key)
    const one = pane?.tabs.find((each) => each.key === (tab ?? pane.active))
    if (!one?.pinned) return closeTabIn(key, tab)
    const at = document.querySelector(`[data-tab-row="${key}"] [data-tab="${one.key}"]`)
    void askSure('Close this pinned tab?', 'It stays at the left of its row, through restarts, until it is closed. ⌘W again closes it.', 'Close', { at, no: 'Keep', tag: 'pinned-tab' })
      .then((yes) => yes && closeTabIn(key, one.key))
  }
  /** A tab pinned or let go, in its own pane: pinned, it moves to the left of the row, small, and stays. */
  const pinTabIn = (key: string, tab: string, on: boolean): void => {
    chime(on ? 'pin' : 'unpin')
    setSplit((now) => pinTab(now, key, tab, on))
  }
  /** "Close others" and "Close to the right": every tab `keep` says no to goes, pinned ones never, and one Undo brings them back. */
  const closeMany = (key: string, tab: string, keep: (one: Tab, at: number) => boolean): void => {
    const now = splitRef.current
    const pane = now.panes.find((one) => one.key === key)
    if (!pane) return
    const gone = pane.tabs.filter((one, at) => !one.pinned && !keep(one, at))
    if (!gone.length) return void chime('nope')
    chime('fold')
    closed.current = [...closed.current.slice(-19), ...gone.map((one) => ({ tab: one, pane: key, at: pane.tabs.indexOf(one), paneAt: now.panes.indexOf(pane) }))]
    setSplit(keepTabs(now, key, (one, at) => !!one.pinned || keep(one, at), tab))
    toast(`Closed ${plural(gone.length, 'tab', 'tabs')}`, () => setSplit(now))
  }
  /** ⇧⌘T: the last tab closed comes back where it was, or the last note left opens again. */
  const reopen = (): void => {
    const last = closed.current.pop()
    if (!last) return void (chime('nope'), toast('Nothing closed to bring back', undefined, 'info'))
    chime('open')
    if ('view' in last) return setView(last.view)
    const now = splitRef.current
    const pane = now.panes.find((one) => one.key === last.pane)
    const tab = { ...last.tab, key: newTab([LANDING]).key }
    tabChosen.current = true
    if (pane) setSplit(addTab(now, pane.key, tab, Math.min(last.at, pane.tabs.length)))
    else setSplit(insertPane(now, paneOf(tab), Math.min(last.paneAt, now.panes.length)))
  }
  /** ⌘K's Pane to the left or right: the keys move, and it says which pane has them now. */
  const paneSaid = (by: -1 | 1): void => {
    const now = splitRef.current
    const to = now.panes[now.panes.findIndex((one) => one.key === now.front) + by]
    moveFront(by)
    if (to) toast(`${paneName(onShow(to)).title} has the keys now`, undefined, 'info')
  }
  /**
   * A new pane right of the one in front, with the keys, with no limit. ⌘\, Obsidian's way: it shows the page in
   * front again, and ⌘O there searches for what to open in it. ⌥⌘\: it opens on that search at once.
   */
  const splitRight = (asking = false): void => {
    const now = splitRef.current
    chime('slide')
    setSplit(insertPane(now, fresh([asking ? { id: 'pick' } : { id: view.id, focus: view.focus, tab: view.tab, folder: view.folder }]), Math.max(0, now.panes.findIndex((one) => one.key === now.front)) + 1))
  }
  // A person's or a source's page, asked for from a note's who or where anywhere in the window.
  useEffect(() => {
    // ⌥-clicked, beside the page it was asked from.
    const onSource = (event: Event): void => {
      placed({ id: 'source', focus: (event as CustomEvent<string>).detail }, takeClick())
    }
    window.addEventListener('haligtree:source', onSource)
    return () => window.removeEventListener('haligtree:source', onSource)
  })
  // Settings opened at one of its rows (the goals at the top of Home: “Choose what shows here…”): its section, the row in view.
  useEffect(() => {
    const onAt = (event: Event): void => (chime('page'), setView({ id: 'settings', focus: String((event as CustomEvent).detail ?? ''), nonce: Date.now() }))
    window.addEventListener('haligtree:settings-at', onAt)
    return () => window.removeEventListener('haligtree:settings-at', onAt)
  })
  // What's new, asked for by the card, ⌘K or the Haligtree menu: its built-in pages.
  useEffect(() => {
    const onNews = (): void => (chime('page'), setView({ id: 'whatsnew' }))
    window.addEventListener('haligtree:whats-new', onNews)
    return () => window.removeEventListener('haligtree:whats-new', onNews)
  })
  // A PDF opened full size (a note's PDF block, a gem's link back): a step in the pane in front, or beside it on ⌥-click.
  useEffect(() => {
    const onPdf = (event: Event): void => {
      const { src, name, page, aside } = (event as CustomEvent<{ src: string; name: string; page?: number; aside?: boolean }>).detail
      const step: View = { id: 'pdf', focus: pdfFocus(src, name), tab: page ? String(page) : undefined }
      // "Open to the side" from a right-click asks for the side as ⌥-click does.
      const how = takeClick()
      chime('page')
      placed(step, aside ? 'aside' : how)
    }
    window.addEventListener('haligtree:pdf', onPdf)
    return () => window.removeEventListener('haligtree:pdf', onPdf)
  })
  // A web page in the reader (a link card, a link's popover, ⌘K, a gem's link back): as a PDF is.
  // Asked for to the side (or a new tab) in words, as the click would; a link followed in the reader steps in its own pane.
  useEffect(() => {
    const onWeb = (event: Event): void => {
      const { href, how: asked, from } = (event as CustomEvent<{ href: string; how?: 'aside' | 'tab'; from?: string | null }>).detail
      const how = takeClick()
      chime('page')
      placed({ id: 'web', focus: href }, asked ?? how, from && splitRef.current.panes.some((one) => one.key === from) ? from : undefined)
    }
    window.addEventListener('haligtree:web', onWeb)
    return () => window.removeEventListener('haligtree:web', onWeb)
  })
  // A PDF's own title, read as it opens: the top bar and its pane's tab say it too.
  const [, pdfTitled] = useState(0)
  useEffect(() => {
    const onTitle = (): void => pdfTitled((n) => n + 1)
    window.addEventListener('haligtree:pdf-title', onTitle)
    return () => window.removeEventListener('haligtree:pdf-title', onTitle)
  }, [])
  // "Search for …" from a right-click on picked words: ⌘K, opened on them.
  useEffect(() => {
    const onSearch = (event: Event): void => {
      setSearchFor((event as CustomEvent<{ words: string }>).detail.words)
      setSearching('all')
    }
    window.addEventListener('haligtree:search', onSearch)
    return () => window.removeEventListener('haligtree:search', onSearch)
  }, [])
  // One thing opened by name from a surface with no `onOpen` of its own (a PDF's mark opening its gem).
  useEffect(() => {
    const onOpen = (event: Event): void => {
      const { type, id } = (event as CustomEvent<{ type: string; id: string }>).detail
      open(type, id)
    }
    window.addEventListener('haligtree:open', onOpen)
    return () => window.removeEventListener('haligtree:open', onOpen)
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
  // "Open in a new tab" from anywhere in the window (a row's menu, a list that has no picking to keep ⌘-click for).
  useEffect(() => {
    const onTab = (event: Event): void => {
      const { type, id } = (event as CustomEvent<{ type: string; id: string }>).detail
      spendAsideClick()
      openTab(stepOf(type, id))
    }
    window.addEventListener('haligtree:new-tab', onTab)
    return () => window.removeEventListener('haligtree:new-tab', onTab)
  })
  // ⌥-click on a row of a list: that note to the side, the list it is in around it.
  useEffect(() => {
    const onClick = (event: MouseEvent): void => {
      if (event.button !== 0 || !event.altKey || event.metaKey || event.ctrlKey || event.shiftKey) return
      const row = event.target instanceof Element ? event.target.closest('[data-pane] [data-row][data-id]') : null
      const key = row?.closest('[data-pane]')?.getAttribute('data-pane')
      const pane = splitRef.current.panes.find((one) => one.key === key)
      const there = pane && onShow(pane)
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
  // Said once, quietly, as too many goals for cards of their own gather on one sticky.
  useEffect(() => window.api.onGoalsGathered((count) => toast(`Your ${num(count)} goals share one card on the desktop. “Always” on a goal gives it a card of its own.`, undefined, 'info')), [])
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
  // ⌘K: notes and every action. ⌘P, Obsidian's quick open: notes only. ⌃⌥⌘S from anywhere: ⌘K on “Start focus”'s lengths.
  const [searching, setSearching] = useState<false | 'all' | 'notes' | 'focus'>(false)
  // What an @ link to a person searches for: every note with their words.
  const [searchFor, setSearchFor] = useState('')
  // Getting started's last step: ⌘K opened once.
  useEffect(() => void (searching && onboarding.mark('search')), [searching])
  // Recent beside the page: everything made lately, or in the week a week's
  // page shows. `until` null reaches back from now.
  // Or, in the same place, All history: everything opened lately in any tab (`opened`), what Back's and Forward's menus end with.
  const [recent, setRecentState] = useState<{ until: string | null; opened?: boolean } | null>(null)
  const setRecent = (until: string | null | 'close'): void => setRecentState(until === 'close' ? null : { until })
  const toggleRecent = (): void => {
    const off = !!recent && !recent.opened
    chime(off ? 'fold' : 'slide')
    setRecentState(off ? null : { until: null })
  }
  const toggleHistory = (): void => {
    const off = !!recent?.opened
    chime(off ? 'fold' : 'slide')
    setRecentState(off ? null : { until: null, opened: true })
  }
  // Folded away unless you open them, and kept the way you left them.
  const [tagsKept, keepTags] = useFold('sidebar:tags')
  // Pinned folds, Notion's way, and starts open.
  const [pinsOpen, setPinsOpen] = useFold('sidebar:pinned')
  // A section's heading dragged moves the whole section (lib/side-sections.ts).
  const sectionDrag = useSectionDrag()
  // Recent: the last few notes you opened, under Pinned, a short list (four at most: ⌘K has the rest), kept folded or open as you left it.
  const [recentOpen, setRecentOpen] = useFold('sidebar:recent')
  // Unread until its first answer: the sidebar waits for it (below), or Recent came in a beat late in the place
  // Tags had been drawn in, and Tags stepped down under it.
  const [recents, setRecents] = useState<Opened[]>(() => unread([]))
  const recentShown = useRef<Opened[]>([])
  // Writing's and Gems' folders, open to start (side-folders.tsx).
  const [articleKept, keepArticle] = useFold('sidebar:folders:article')
  const [nuggetKept, keepNugget] = useFold('sidebar:folders:nugget')
  // Journal's Week, Month and Year fold as Writing's folders do, open to start.
  const [journalOpen, setJournalOpen] = useFold('sidebar:journal')
  const [customizing, setCustomizing] = useState(false)
  // Your books, for the menu under the book's name and for ⌘K, kept current as one is made, renamed, coloured or
  // deleted in any window: the open one first, then the others by when each was last opened (main keeps that order).
  const shelfNow = useShelf()
  const openBook = shelfNow?.books.find((one) => one.current)
  // ⌘K's Switch book: the one you were in last first, whatever order the shelf is in.
  const otherBooks = (shelfNow?.books.filter((one) => !one.current) ?? []).sort((a, b) => (b.openedAt ?? 0) - (a.openedAt ?? 0))
  // The menu under the book's name, opened and shut from here: a right-click on one of its books shuts it as
  // that book's own menu opens where it was pressed, so there is never one menu left up under another.
  const [footMenu, setFootMenu] = useState(false)
  // Shut that way it is gone at once: its 60ms fade would show for a moment under the book's own menu.
  const [footCut, setFootCut] = useState(false)
  // A new book being named in the menu's own row (New book…, here, from ⌘K or the menu bar): the menu holds open while it is typed.
  const [namingBook, setNamingBook] = useState(false)
  // The row of the menu a press began on (none: the press began on the button that opened it, or off the rows).
  const footPressed = useRef<Element | null>(null)
  useEffect(() => {
    const onNaming = (): void => {
      setFootCut(false)
      setNamingBook(true)
      setFootMenu(true)
    }
    window.addEventListener('haligtree:book-naming', onNaming)
    return () => window.removeEventListener('haligtree:book-naming', onNaming)
  }, [])
  const bookMenuAt = useRef<HTMLSpanElement>(null)
  const bookMenuFor = useRef<Book | null>(null)
  const footGave = useRef(false)
  // A spine right-clicked on the shelf: its menu opens beside that spine, a layer over the book menu, which stays open
  // behind it (the user, 22 Nov: the book menu shut and the spine's menu floated in the middle of the sidebar, reading as
  // an unrelated popup). The spine stands pulled out while its menu is up; Esc or a click away shuts that menu alone.
  const [spineMenu, setSpineMenu] = useState<string | null>(null)
  const spineHeld = useRef(false)
  const openBookMenu = (event: React.MouseEvent, book: Book | undefined, spine?: Element): void => {
    event.preventDefault()
    if (!book) return
    bookMenuFor.current = book
    if (spine && footMenu) {
      const box = spine.getBoundingClientRect()
      spineHeld.current = true
      setSpineMenu(book.id)
      bookMenuAt.current?.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: box.right + 4, clientY: box.top, button: 2 }))
      return
    }
    footGave.current = footMenu
    if (footMenu) setFootCut(true)
    setFootMenu(false)
    bookMenuAt.current?.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: event.clientX, clientY: event.clientY, button: 2 }))
  }
  // One light for the whole sidebar list, gliding to the row nearest the
  // pointer, and the page you are on marked by one fill that travels to the
  // next. A row folding shut is left out of both.
  const sideList = useRef<HTMLDivElement>(null)
  const sideHover = useFluidHover(sideList, { items: '[data-side-row]:not([inert] *)' })
  // A calm sidebar: what serves capturing and coming back. One switched off is not there at all, a G or ⌘K away.
  const settings = useLive(haligtree.settings, null as Settings | null)
  // Library came after people had dragged its rows into other runs: they go into it once, then stay wherever they are dragged.
  // The sidebar by how often a place is used (8 Nov): every row goes to its new home once (the seven of every day on top,
  // Library folded, Bin, Archived and the powers in the foot), then stays wherever it is dragged.
  useEffect(() => {
    if (!settings || settings.sidebarByUseOnce) return
    void haligtree.setSettings({ sidebarGroups: {}, sideSections: ['folders', 'library', 'pinned', 'recent', 'tags'], libraryOnce: true, sidebarByUseOnce: true })
  }, [settings?.sidebarByUseOnce]) // eslint-disable-line react-hooks/exhaustive-deps
  // Review's finish, satin or paper, worn from the start and whenever it changes (review-toolbar.tsx).
  useEffect(() => { if (settings) wearFinish(settings.reviewFinish ?? 'satin') }, [settings?.reviewFinish]) // eslint-disable-line react-hooks/exhaustive-deps
  // With "Open folders on their page", Writing's and Gems' folders and the tags unfold as their page (or one of its
  // folders) opens. Leaving never folds them: only the arrow does, so a fold never shuts by itself as you click
  // elsewhere (the user: "weird that the writing tab collapses itself when you click on a different tab").
  const follow = !!settings?.foldersFollow
  useEffect(() => {
    if (!follow) return
    if (view.id === 'articles' && !articleKept) keepArticle(true)
    if (view.id === 'nuggets' && !nuggetKept) keepNugget(true)
    if (view.id === 'tags' && !tagsKept) keepTags(true)
  }, [follow, view.id]) // eslint-disable-line react-hooks/exhaustive-deps
  const [tagsOpen, setTagsOpen] = [tagsKept, keepTags]
  const [articleFolders, setArticleFolders] = [articleKept, keepArticle]
  const [nuggetFolders, setNuggetFolders] = [nuggetKept, keepNugget]
  const shownAll = useShown('sidebarShown')
  // Back after a long time away: only the Inbox, Journal and Tasks, until the next start or "Show everything".
  const away = useLive(() => call<{ days: number; quiet: boolean }>('return:quiet'), { days: 0, quiet: false })
  const quiet = away.quiet
  // Week's and Month's pages are reached through Journal (its Week and Month under its row), never rows of their own
  // for now, so a book that once showed them does not list them twice.
  const shown = quiet ? ['day', 'inbox', 'today'] : shownAll.filter((id) => !OFF_SIDEBAR.includes(id))
  const quietOpened = useRef(false)
  useEffect(() => {
    if (!quiet || quietOpened.current) return
    quietOpened.current = true
    setView({ id: 'today' })
  }, [quiet]) // eslint-disable-line react-hooks/exhaustive-deps
  // The places, and the pins, in your own order (dragged, or moved from a right click).
  const sidebarSaved = useOrder('sidebarOrder')
  // The places, writing first: the same in every book (places.tsx).
  const sections = useSections()
  const ordered = useInOrder(sections, 'sidebarOrder', (section) => section.id)
  const pinSaved = useOrder('pinOrder')
  const pinsUsual = useLive(haligtree.pins, [] as Pin[])
  const pins = useInOrder(pinsUsual, 'pinOrder', (pin) => `${pin.type}:${pin.id}`)
  const fullMenu = useFullMenu()
  const everyFolder = useFolders()
  // The button beside the search: every fold in the sidebar at once, Folders' tree too (lib/side-folds.ts).
  const everyFold = useEveryFold(everyFolder.filter((one) => !one.archived).map((one) => one.id))
  const tags = useLive(haligtree.tags, [] as Awaited<ReturnType<typeof haligtree.tags>>)
  // Pinned from a tag's page: those first, then the most used.
  // In your order once dragged (tagOrder), the rest by use after them.
  const tagSaved = useOrder('tagOrder')
  // The sidebar keeps your first eight; finding among all of them is the Tags page's (its own "Find a tag").
  const tagsInOrder = useInOrder(tags, 'tagOrder', (one) => one.tag)
  // Only the ones you chose for it (lib/side-tags.ts), in your order.
  const sideTags = (() => { const chosen = sideTagsOf(settings?.sideTags, tagsInOrder.map((one) => one.tag)); return tagsInOrder.filter((one) => chosen.includes(one.tag)) })()
  // The first favourite unfolds the section, so it is seen arriving where the toast says it went.
  const hadFavourite = useRef<boolean | null>(null)
  useEffect(() => {
    if (!settings) return
    if (sideTags.length && hadFavourite.current === false && !tagsOpen) setTagsOpen(true)
    hadFavourite.current = sideTags.length > 0
  }, [sideTags.length, !settings]) // eslint-disable-line react-hooks/exhaustive-deps
  // The Tags heading is marked on the Tags page, and on a tag's page whose own row is folded away or not among these.
  const captures = useCaptures()
  const sourceList = useLive(sources.list, [] as SourceSummary[])
  // One the list has not heard of yet (made a moment ago by a link) is asked of its copy read on the press: in the
  // Inbox, it opened with "Show dealt with too" switched on.
  unsorted = (id) => {
    const one = captures.find((capture) => capture.id === id) ?? peekRead<CaptureMeta>('capture', id)
    return !!one && keepInbox(one)
  }
  const dueRead = useLive(haligtree.dueCount, null as number | null, [], ['item'])
  const due = dueRead ?? 0
  const tasks = useLive(haligtree.tasks, [] as Task[])
  // What ⌘K offers for the Calendar, read once as it opens: the task picked on it, the day it shows.
  const palette = useMemo(() => (searching ? calendarPalette((day) => setView({ id: 'calendar', focus: day })) : null), [searching]) // eslint-disable-line react-hooks/exhaustive-deps
  const nuggets = useLive(() => haligtree.items('nugget'), [] as Item[], [], ['item'])
  const articles = useLive(() => haligtree.items('article'), [] as Item[], [], ['item'])
  const questions = useLive(() => haligtree.items('question'), [] as Item[], [], ['item'])
  // A folder in the sidebar counts what its list shows: notes not archived, and in Writing the open questions too.
  // A folder counts what its page lists: pages (or gems) on show, never a question, which lives in Questions.
  const shownIn = (_list: string, notes: Item[]): Set<string> => new Set(notes.filter((one) => !one.archivedAt).map((one) => one.id))
  const goals = useLive(() => haligtree.items('goal'), [] as Item[], [], ['item'])
  const queued = useQueue()
  // "New" makes a blank page, as in Obsidian (a new book's way), or a capture in quick capture.
  // In the window, New makes a blank page, as Apple Notes does; quick capture keeps its own key from anywhere.
  const newPage = settings?.newMakes !== 'capture'
  // In one of Writing's or Gems' folders, "New" (and ⌘N) makes a note there, of its list (groups.ts).
  const inFolderRef = useRef<{ id: string; tier: string } | null>(null)
  inFolderRef.current = (view.id === 'articles' || view.id === 'nuggets') && view.folder ? { id: view.folder, tier: view.id === 'articles' ? 'article' : 'nugget' } : null
  const makeNew = (): void => {
    const folder = inFolderRef.current
    if (folder) return void groups.note(folder.id).then((id) => id && (chime('promote'), setView({ id: folder.tier === 'article' ? 'articles' : 'nuggets', focus: id, folder: folder.id })))
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
  // The tags whose cards ⌘K offers to study.
  const cardTags = useLive(haligtree.cardTags, null as string[] | null, [], ['item'])
  // Every deck of yours (a tag that holds cards, or one made by hand): ⌘K makes a card in any of them.
  const madeDecks = useMadeDecks()
  const deckTags = [...new Set([...(cardTags ?? []), ...madeDecks])]
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
  }, [split.front, activeTab(front).key, view.id])

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
    // Chosen, then hidden from the sidebar: the first page it shows, never a page you put away.
    const to = startPageOf(settings)
    if (to === 'day'|| !SECTIONS.some((one) => one.id === to)) return
    setSplit((now) => {
      const tab = now.panes.length === 1 && now.panes[0].tabs.length === 1 ? now.panes[0].tabs[0] : null
      return tab && tab.trail.views.length === 1 && tab.trail.views[0].id === 'day'
        ? { ...now, panes: [{ ...now.panes[0], tabs: [{ ...tab, trail: { views: [{ id: to }], at: 0 } }] }] }
        : now
    })
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
  // Page previews on pointing (peek.tsx), switched off in Settings.
  useEffect(() => void document.documentElement.toggleAttribute('data-no-previews', settings?.pagePreviews === false), [settings?.pagePreviews])
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
    const said: Record<string, [string, string]> = { review: ['card to review now', 'cards to review now'], today: ['task due today or before', 'tasks due today or before'], nuggets: ['gem kept', 'gems kept'], articles: ['page kept', 'pages kept'], questions: ['question still open', 'questions still open'], goals: ['goal under way', 'goals under way'], queue: ['thing to read next', 'things to read next'], lookups: ['word still asked', 'words still asked'], sources: ['person or work', 'people and works'] }
    const [one, many] = said[id] ?? ['', '']
    return one ? plural(n, one, many) : ''
  }
  // No Inbox count: the inbox is a place to set things down, never a queue to clear.
  // Archived ones are out of sight in their lists, so out of the counts too.
  // Kept current: left open past midnight, the sidebar counts the new day.
  const today = useToday()
  const counts: Record<string, number> = useMemo(() => ({
    review: due,
    // The one rule the Today list, the desktop Today sticky and Today's brief count by.
    today: tasks.filter(onToday).length,
    nuggets: nuggets.filter((one) => !one.archivedAt).length,
    articles: articles.filter((one) => !one.archivedAt).length,
    // Held, not owed: counted in the same quiet grey, never as behind.
    questions: questions.filter((one) => !one.archivedAt && !one.closedAt).length,
    goals: goals.filter((one) => one.goalAt && !one.archivedAt && !one.closedAt).length,
    queue: queued.queue.length,
    // Asked and not answered yet, as the Lookups page lists them.
    lookups: captures.filter((one) => one.lookup === 'asked' && one.status !== 'discarded' && !one.archivedAt).length,
    // Every person and work with a page, as the Sources page counts them.
    sources: sourceList.length
  // Counted again only when a list or the day changes, not on every step.
  }), [due, tasks, nuggets, articles, questions, goals, queued.queue.length, captures, sourceList, today]) // eslint-disable-line react-hooks/exhaustive-deps
  // The counts come in together, once every one is read: never one number, then the next, down the sidebar.
  const countsIn = dueRead !== null && ![tasks, nuggets, articles, questions, goals, queued, captures, sourceList].some(unloaded)
  // Counts can be turned off, all at once or page by page (Customize sidebar); folders and tags follow the first.
  const countsOn = settings?.sidebarCounts !== false
  const countOf = (id: string): number => (countsOn && !(settings?.sidebarCountsOff ?? []).includes(id) && counts[id]) || 0
  // The sidebar is drawn whole, once its rows' reads are in too: before, Pinned and the tags came in a beat late and pushed the places down.
  // How many pages and gems are in no folder, the Folders section's last count: read here so the sidebar waits for it
  // too, or its "0" was drawn and became the real number a beat later.
  const { style: sideStyle } = useReadsIn(!settings || unloaded(away) || !countsIn || unloaded(pinsUsual) || unloaded(tags) || unloaded(recents))
  // Come into from the welcome's "Open my book": the sidebar comes up with Home's parts, a little apart, never simply there.
  const [opened, setOpened] = useState(false)
  useEffect(() => {
    let off: ReturnType<typeof setTimeout> | undefined
    const now = (): void => (setOpened(true), clearTimeout(off), void (off = setTimeout(() => setOpened(false), 2400)))
    window.addEventListener('haligtree:book-opened', now)
    return () => (clearTimeout(off), window.removeEventListener('haligtree:book-opened', now))
  }, [])

  // Tidy stickies is offered only with a sticky out to tidy.
  const stickiesOut = useStickiesOut()
  const desk = useDeskAway()

  const safeMode = (): void => {
    const on = !settings?.safeMode
    chime(on ? 'on' : 'off')
    sayNow(haligtree.setSettings({ safeMode: on }), on ? 'Safe mode on: nothing comes up on its own' : 'Safe mode off', () => void haligtree.setSettings({ safeMode: !on }))
  }

  // Blurring, beside Safe mode: private words blurred, the dim when you leave
  // the window, words arriving from a soft blur. One switch for all of it.
  const blurring = (): void => {
    const on = settings?.blur === false
    chime(on ? 'on' : 'off')
    sayNow(haligtree.setSettings({ blur: on }), on ? 'Blurring on: notes marked “Private” stay blurred until you point at them' : 'Blurring off: everything plain and sharp', () => void haligtree.setSettings({ blur: !on }))
  }

  // The keyboard, Linear's way: G then a letter goes somewhere, C captures.
  // Held across renders: kept inside the effect, a render between G and its letter dropped the G.
  const gPending = useRef(false)
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      // A tool that is up with keys of its own (the reader's bar) is asked first: C there makes a card, not a capture (lib/tool-keys.ts).
      // The key after G is the chord's (G R goes to Review, not "R" on the card in front), unless it names no place.
      const chord = gPending.current && !event.metaKey && !event.ctrlKey && !event.altKey
      if (!chord && toolTakes(event)) return
      // ⌘ keys work with the caret in a note too; only something held over
      // the page (Read, a question) keeps them.
      const held = document.querySelector(HELD)
      // The Calendar's side panel is a task picked there: ⌘K over it is about that task.
      if (document.querySelector('[data-day-side]') && event.metaKey && !event.altKey && !event.shiftKey && event.key === 'k') return (event.preventDefault(), calendarAside(), setSearching('all'))
      if (held) return
      // Split view. ⌥⌘\ opens the page in front again beside it; ⌘\ a new pane to its right, to open anything in.
      if (event.metaKey && !event.ctrlKey && !event.shiftKey && event.code === 'Backslash') {
        event.preventDefault()
        return splitRight(event.altKey)
      }
      // ⌘O, Obsidian's quick switcher: search for what to open in the pane in front, in its place. A note open in
      // front takes ⌘O first, out to its own window (lib/apart.tsx).
      if (event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey && event.code === 'KeyO' && !event.defaultPrevented) {
        event.preventDefault()
        if (view.id === 'pick') return
        chime('open')
        return setView({ id: 'pick' })
      }
      // ⌃H and ⌃L move between panes as Vim moves between windows, ⌃W closes
      // one. Only while split, and taken before the editor (which keeps none
      // of the three, vim mode included); a menu open over the page keeps them.
      // Only one that is open over the page, as for ⌘W: a list or a suggestion popup showing in the page answers none
      // of these keys (its own Ctrl keys are N, P, J and K), and counted, ⌃W did nothing after words typed in a note
      // while ⌘W closed the tab (20 Nov). A tip is no menu either.
      const keysHeld = (): boolean => menuShowing('[role=menu], [role=dialog], [role=alertdialog], [data-radix-popper-content-wrapper]:not(:has([role=tooltip]))')
      if (event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey && splitRef.current.panes.length > 1 && ['KeyH', 'KeyL'].includes(event.code)) {
        if (keysHeld()) return
        event.preventDefault()
        event.stopPropagation()
        return moveFront(event.code === 'KeyH' ? -1 : 1)
      }
      // ⌃W closes the tab in front. ⌃Tab and ⌃⇧Tab move through the tabs of the pane in front, round and round.
      if (event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey && event.code === 'KeyW') {
        if (keysHeld()) return
        event.preventDefault()
        event.stopPropagation()
        return closeAsked()
      }
      if (event.ctrlKey && !event.metaKey && !event.altKey && event.key === 'Tab') {
        if (keysHeld()) return
        event.preventDefault()
        event.stopPropagation()
        const pane = frontOf(splitRef.current)
        if (pane.tabs.length < 2) return void chime('nope')
        const at = pane.tabs.findIndex((one) => one.key === pane.active)
        return goToTab(pane.key, pane.tabs[(at + (event.shiftKey ? -1 : 1) + pane.tabs.length) % pane.tabs.length].key)
      }
      // ⌘T: a new tab on the landing page, as the + beside the tabs.
      if (event.metaKey && !event.shiftKey && !event.altKey && !event.ctrlKey && event.code === 'KeyT') {
        event.preventDefault()
        return openTab(LANDING, frontRef.current, true)
      }
      // ⌘K with the caret in a web link edits the link, and on words picked gives them one, as in any editor.
      // ⇧⌘P is picked blocks' "Move to…" (extensions/picked-blocks.ts), never the notes' search.
      if (event.metaKey && (event.key === 'k' || (event.key === 'p' && !event.shiftKey)) && !(event.key === 'k' && kMeansLink())) {
        event.preventDefault()
        return setSearching(event.key === 'k' ? 'all' : 'notes')
      }
      // ⌘N, as in Notion and Linear: what "New" makes, a blank page or a capture in the box.
      if (event.metaKey && !event.shiftKey && event.key === 'n') {
        event.preventDefault()
        return makeNew()
      }
      // ⇧⌘T, as in a browser: the last tab closed, or the last note left, open again.
      if (event.metaKey && event.shiftKey && !event.altKey && event.key.toLowerCase() === 't') {
        event.preventDefault()
        return reopen()
      }
      // ⇧⌘Y: Recent beside the page, or away again.
      if (event.metaKey && event.shiftKey && event.key.toLowerCase() === 'y') {
        event.preventDefault()
        return toggleRecent()
      }
      // ⌥⌘Y: All history beside the page, or away again (⇧⌘H is the editor's highlight, ⌘Y its redo).
      if (event.metaKey && event.altKey && !event.shiftKey && event.code === 'KeyY') {
        event.preventDefault()
        return toggleHistory()
      }
      // ⌥⌘[ is the editor's fold, not Back.
      if (event.metaKey && !event.altKey && event.key === '[') return step(-1)
      if (event.metaKey && !event.altKey && event.key === ']') return step(1)
      // ⌘B the sidebar, but never in a note: with the caret in one, picked words or not, Vim on or off, ⌘B is Bold, as in
      // Obsidian (the user, 15 Nov 2026: "that should be for toggling bold (whether im inside of vim or not)"). ⇧⌘B puts
      // every side away at once (or brings them back), the page on its own, from anywhere. Taken before the editor, and
      // the menu's ⌘B (app-menu.ts) never fires for a key the page took.
      if (event.metaKey && !event.altKey && !event.ctrlKey && event.code === 'KeyB' && (event.shiftKey || !caretInNote())) {
        event.preventDefault()
        event.stopPropagation()
        const open = event.shiftKey ? sidebar || detailsShown() : sidebar
        if (!event.shiftKey) chime('tap')
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
        const to = SECTIONS.find((section) => section.key === letter)?.id ?? G_ALIASES[letter]
        // Taken here, so G T goes to Tasks and does not also move a task to today.
        if (to) {
          event.preventDefault()
          via('keys')
          setView({ id: to })
        } else toolTakes(event)
        return
      }
      // Only a small g: ⇧G is the lists' last row.
      if (event.key === 'g') gPending.current = true
      else if (event.key === 'c') (chime('open'), window.api.showPrompt())
    }
    window.addEventListener('keydown', onKey, true)
    // A mouse's own back and forward buttons (the side buttons, 3 and 4) step through the pane's trail, as ⌘[ and ⌘]
    // do, the way they go back and forward in a browser and in Finder.
    const onMouse = (event: MouseEvent): void => {
      if (event.button !== 3 && event.button !== 4) return
      event.preventDefault()
      step(event.button === 3 ? -1 : 1)
    }
    window.addEventListener('mouseup', onMouse)
    return () => (window.removeEventListener('keydown', onKey, true), window.removeEventListener('mouseup', onMouse))
  })

  // Somewhere else sent you to one thing: open its section with it open.
  // In a pane (the front one unless said); ⌥-clicked, beside it instead.
  // Read again as each note opens, so the list is never behind.
  // A PDF's title, read once it opens, names it here too ("The Crime Book", never its file's "crime").
  useEffect(() => {
    const read = (): void => void call<Opened[]>('home:recent-opened', 12).then(setRecents)
    read()
    window.addEventListener('haligtree:pdf-title', read)
    // And when a note goes: a page a link made, left empty, is dropped a moment after the page changed. Only on a
    // change of the whole book (`null`), as a drop is, never on one note's save while typing.
    const off = window.api.captures.onChange((what) => void (what === null && read()), ['capture'])
    return () => (window.removeEventListener('haligtree:pdf-title', read), off())
  }, [view.focus])
  const open = (type: string, id: string, key = frontRef.current, folder?: string): void => {
    // Opened from anywhere but its Pinned or Recent row (those mark it after this), its list's row keeps the light.
    openedFrom.current = null
    // Which way it goes is read from the click itself, before any wait.
    const how = takeClick()
    // A task opens in the list that holds it (Today, Routines, Later), so its row is there beside it; Upcoming when it is not known yet.
    // Opened from under its folder in the sidebar: in that folder's page, so ↓↑ step through what it holds, as a press
    // on its row there does (a gem went to Gems and stepped through all 122).
    const step = (): View => {
      if (folder) return { id: 'folders', folder, focus: id, tab: tabOfKind(type) }
      const task = type === 'task' ? peekRead<Task>('task', id) : undefined
      const list = !task || task.status !== 'open' ? null : onToday(task) ? 'today' : task.recurrence ? 'routines' : bucket(task) && !task.deadline ? 'later' : null
      return list ? { id: list, focus: id } : stepOf(type, id)
    }
    const go = (): void => placed(step(), how, key)
    // A note's page turns on the click, not once it has loaded (the page then
    // turns no second time), and waits the moment it takes to read its words
    // (lib/early-read.ts), so its page opens on them at once: no wait at all
    // for one read before and unchanged, never the page first and the note after.
    if (type === 'capture' || type === 'nugget' || type === 'article' || type === 'question') pageTurn(false, id)
    const reading = holdsNotes(stepOf(type, id).id) ? whenRead(type, id) : null
    if (reading) return void reading.then(go)
    go()
  }
  // A new page, opened with its title ready to write, as Writing's own "New page" makes it; inside a folder when the +
  // was a folder's (Notion's "Add a page inside", the user, 15 Nov 2026: "what if i want to add a new page?").
  const addPage = (folder: string | null = null): void => void haligtree.newArticle().then(async (id) => {
    if (folder) await groups.place([{ id, group: folder }])
    chime('promote')
    open('article', id)
  })
  // A page sent with one of its groups named ("Show them" after a list with no dates):
  // once the page is drawn, that group's heading scrolled to the top.
  const landOnGroup = (heading: string): void => {
    const until = Date.now() + 3000
    const look = (): void => {
      const found = [...document.querySelectorAll<HTMLElement>('[class*="@container/page"] :is(h2, h3)')].find((one) => one.textContent?.trim().startsWith(heading))
      if (found) return found.scrollIntoView({ block: 'start', behavior: glideWay() })
      // A long list draws only what is in sight: a screen further down, and look again.
      const list = [...document.querySelectorAll<HTMLElement>('[class*="@container/page"] *')].find((one) => one.scrollHeight > one.clientHeight + 4 && /(auto|scroll)/.test(getComputedStyle(one).overflowY))
      if (list) list.scrollTop += list.clientHeight
      if (Date.now() < until) setTimeout(look, 120)
    }
    setTimeout(look, 150)
  }
  // A note a link brought in from the vault, taken back by the notice's Undo while it is on show: back to where the link was.
  useEffect(() => {
    const gone = (event: Event): void => void ((event as CustomEvent<string>).detail === view.focus && step(-1))
    window.addEventListener('haligtree:unbrought', gone)
    return () => window.removeEventListener('haligtree:unbrought', gone)
  }, [view.focus]) // eslint-disable-line react-hooks/exhaustive-deps
  const toScale = (scale: Scale, key?: string): void => (chime('season'), setView({ id: SCALE_VIEW[scale] }, key))
  // A view is sent by name (⌘, sends Settings), anything else as one thing to open.
  // A heading link from a note window lands on its heading once the note is open.
  // A press on anything that opens a note starts reading it (lib/early-read.ts).
  useEffect(readOnPress, [])
  // The menu bar's File > New page and Export everything…, and View's sidebar (app-menu.ts): each as its button or key here does it.
  useEffect(() => {
    const onNewPage = (): void => void haligtree.newArticle().then((id) => (chime('promote'), open('article', id)))
    const onExport = (): void => void exportEverything()
    const onSidebar = (): void => (chime('tap'), setSidebar(!sidebar))
    // View > Split the Page, or Open in a split to the right (asking), clicked: the new pane eases in, as anything a pointer opens.
    const onSplitRight = (event: Event): void => (byPointer(), splitRight((event as CustomEvent<boolean | undefined>).detail === true))
    window.addEventListener('haligtree:split-right', onSplitRight)
    window.addEventListener('haligtree:new-page', onNewPage)
    window.addEventListener('haligtree:export-all', onExport)
    window.addEventListener('haligtree:sidebar', onSidebar)
    return () => {
      window.removeEventListener('haligtree:new-page', onNewPage)
      window.removeEventListener('haligtree:export-all', onExport)
      window.removeEventListener('haligtree:sidebar', onSidebar)
      window.removeEventListener('haligtree:split-right', onSplitRight)
    }
  })
  useEffect(() => window.api.onSentTo((type, id, heading) => {
    // The shortcuts list asked for from quick capture, opened here (shortcut-sheet.tsx).
    if (type === 'shortcuts') window.dispatchEvent(new CustomEvent('haligtree:shortcuts', { detail: id }))
    // ⌘K (or ⌘P) from quick capture, opened here (App.tsx); ⌃⌥⌘S from anywhere, on “Start focus”'s lengths (main's askFocus).
    else if (type === 'search') setSearching(id === 'notes' || id === 'focus' ? id : 'all')
    // The passes lay themselves over whatever is open, rather than being a place.
    else if (type === 'view' && (id === 'tidy' || id === 'decide')) openPass(id)
    // Review on one of its pages (":decks" from an import's notice).
    else if (type === 'view' && id === 'review' && heading?.startsWith(':')) setView({ id, focus: heading })
    // The Bin at what was just put there (a "Moved to the Bin" toast's click).
    else if (type === 'view' && id === 'discarded' && heading) setView({ id, focus: heading, nonce: Date.now() })
    // Files on one kind (⌘K's "show it in Files"): the kind is the step's own, as Back and Forward keep it (lib/nav.ts).
    else if (type === 'view' && id === 'media' && heading?.startsWith('kind:')) setView({ id, tab: heading.slice(5) })
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
    // Read for one note, its links in place, asked for in another window.
    else if (type === 'read') window.dispatchEvent(new CustomEvent('haligtree:read', { detail: id }))
    else if (type === 'write') (setView({ id: 'today' }), writeOutDay())
    // A PDF at a page, from a link followed in the box or a note's window: the reader, at that page.
    else if (type === 'pdf' && heading) window.dispatchEvent(new CustomEvent('haligtree:pdf', { detail: { ...fromPdfFocus(id), page: Number(heading) || undefined } }))
    // A capture's version history, asked for in the box: opened, then once
    // its page is up, its history.
    else if (type === 'versions') {
      open('capture', id)
      setTimeout(() => window.dispatchEvent(new CustomEvent('haligtree:versions', { detail: id })), 600)
    } else open(type, id)
    // "Show in list" from a note's own window: its row in the list here, lit once its page is up.
    if (heading === 'show-in-list') setTimeout(() => showInList(id), 600)
    else if (heading && type !== 'view' && type !== 'pdf' && !(type === 'task' && heading === 'sessions')) headingIn(type, id, heading)
    // Promoted from quick capture with ⌘O: the caret lands where it was.
    landPromoted(type, id)
  }), [])

  /** A page's name, for the top bar; a pane is named by its note first (paneName). */
  // A folder's page is named for the folder in its tab, as a note's is for the note.
  const folderLabel = (focus?: string): string => (!focus || focus === 'all' ? 'Folders' : focus === 'unfiled' ? 'Not in a folder' : everyFolder.find((one) => one.id === focus)?.name ?? 'Folder')
  const labelOf = (view: View): string => datedName(view) ?? (view.id === 'folders' ? folderLabel(view.folder) : null) ?? (view.id === 'matrix' ? 'Urgent and important' : TASK_PAGES.includes(view.id) ? 'Tasks' : view.id === 'questions' || view.id === 'lookups' ? 'Questions' : null) ?? SECTIONS.find((section) => section.id === view.id)?.label ?? kind(view)?.label ?? (view.id === 'source' ? view.focus?.slice(view.focus.indexOf(':') + 1) || 'Source' : view.id === 'settings' ? 'Settings' : view.id === 'pick' ? 'New tab' : view.id === 'whatsnew' ? "What's new" : view.id === 'pdf' ? pdfName(fromPdfFocus(view.focus ?? '').src, fromPdfFocus(view.focus ?? '').name) : view.id === 'web' ? articleName(view.focus ?? '') : view.id === 'practices' ? 'Practices' : view.id === 'yearpage' ? 'Year' : view.id === 'day' ? 'Day' : view.id === 'weekpage' ? 'Week' : view.id === 'monthpage' ? 'Month' : '')
  const paneWidth = (key: string, width: PaneWidth): void => {
    chime(width === 'narrow' ? 'fold' : 'slide')
    setSplit((now) => ({ ...now, panes: now.panes.map((one) => (one.key === key ? { ...one, width } : one)) }))
  }

  /**
   * A page's icon, the one the sidebar draws for it: its place's (Home's house,
   * Tasks' list, the Journal's sun for its Week, Month and Year), a kind's own, the
   * gear for Settings, a PDF's cover, the open book for a page read in the reader.
   */
  const pageLook = (view: View): Pick<PaneName, 'icon' | 'tint' | 'kind'> => {
    if (view.id === 'pdf') return { icon: pdfDrawing(view.focus ?? ''), kind: 'PDF' }
    if (view.id === 'web') return { icon: BookOpen, kind: 'Web page' }
    if (view.id === 'settings') return { icon: placeDrawing(SETTINGS_PLACE) }
    if (view.id === 'folders') return { icon: FolderOpen }
    const owned = kind(view)
    if (owned) return { icon: owned.icon, tint: owned.tint }
    const place = [...JOURNAL_SCALES, ...SECTIONS].find((one) => one.id === view.id) ?? SECTIONS.find((one) => one.id === litRow(view.id === 'source' ? 'sources' : view.id))
    return place ? { icon: placeDrawing(place), tint: `var(--mf-icon-tint, var(--tt-color-text-${place.tint}))` } : { icon: PanelsTopLeft }
  }

  // --- a split pinned on purpose: its panes as one row in Pinned, each reopening as one tab (split-pairs.tsx)
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
    const found = known.get(view.focus) ?? {}
    const { task } = found
    // A capture made a moment ago (by a link), or a page brought in from the vault, is not in the list yet: its copy
    // read before it opened names it from the first frame, so the tab never says "Inbox" or "Writing" over it while
    // the list catches up.
    const item = found.item ?? (!found.capture && !task ? peekRead<NonNullable<typeof found.item>>('article', view.focus) : undefined)
    const capture = found.capture ?? (!item && !task ? peekRead<CaptureMeta>('capture', view.focus) : undefined)
    // A list of captures (the Inbox, Archived, a kind's own list) shows only a capture, and the Inbox a task: never
    // named by a gem or a page that has the same id (an older link's step did that: the tab named the gem over an empty Inbox).
    if ((['inbox', 'all', 'archived', 'lookups'].includes(view.id) || kind(view) || (view.id === 'questions' && view.folder === 'looked')) && !capture && !(task && ['inbox', 'all'].includes(view.id))) return null
    if (capture) {
      const kind = CAPTURE_TYPES.find((type) => type.id === capture.kind) ?? CAPTURE_TYPES[0]
      return { type: 'capture', id: capture.id, name: { title: taskName(capture.label).text || 'New note', icon: kind.icon, tint: kind.tint, private: !!capture.private, kind: kind.label } }
    }
    if (item) {
      const kind = CAPTURE_TYPES.find((type) => type.id === item.kind)
      return { type: item.tier, id: item.id, name: { title: item.title || 'New note', icon: item.tier === 'nugget' && (!kind || kind.id === 'note') ? GemSign : kind?.icon ?? FileText, tint: kind?.tint, private: !!item.private, kind: item.tier === 'article' ? 'Writing' : kind?.label ?? 'Note' } }
    }
    return task ? { type: 'task', id: task.id, name: { title: taskName(task.title).text || 'New note', icon: TASK_KIND.icon, tint: TASK_KIND.tint, kind: 'Task' } } : null
  }
  // A place in the app (Settings, Gems) is named by itself, with no kind: "Page" is a piece of writing.
  const paneName = (view: View): PaneName => noteIn(view)?.name ?? { title: labelOf(view) || APP_NAME, ...pageLook(view) }
  // A step named for what was on show there, for swipe back's list: the note open in it, else the place and its folder ("Writing › YouTube").
  const writingFolders = useGroups('article')
  const gemFolders = useGroups('nugget')
  const swipeName = (view: View): PaneName => {
    const name = paneName(view)
    const folder = view.folder && !noteIn(view) ? [...writingFolders, ...gemFolders].find((one) => one.id === view.folder)?.name : undefined
    // A place inside a page (useStepped) is named by it too, so Back's menu never lists "Review" three times over.
    const inside = folder ?? (noteIn(view) ? null : placeName(view))
    return inside ? { ...name, title: `${name.title} › ${inside}` } : name
  }
  // --- the sidebar follows the open tab of the pane in front: one light, wherever that thing lives
  const noteNow = noteIn(view)
  const noteList = noteNow?.type === 'article' ? 'article' : noteNow?.type === 'nugget' ? 'nugget' : null
  /** The folder a note lives in, whichever way it was opened: a group inside a folder counts as that folder. */
  const homeFolder = (() => {
    if (!noteNow || !noteList) return null
    const all = noteList === 'article' ? writingFolders : gemFolders
    let at = all.find((one) => one.members.includes(noteNow.id))
    while (at && !isFolder(at)) at = all.find((one) => one.id === at?.parent)
    return at?.id ?? null
  })()
  // Where the note in front lives in Folders (any kind but a task): Folders' own record of it.
  const openedFrom = useRef<{ id: string; where: 'pin' | 'recent' } | null>(null)
  const keptNuggets = useFolderOf()
  const keptCaptures = useLive(() => folders.of('captures'), {} as Record<string, string>, [], undefined, 'folders:of:captures')
  const keptFolder = noteNow && noteNow.type !== 'task' ? (noteNow.type === 'capture' ? keptCaptures[noteNow.id] : keptNuggets[noteNow.id]) : undefined
  const foldersOn = (list: 'article' | 'nugget'): boolean => !narrow && settings?.sidebarFolders?.[list] !== false
  const recentOn = !(settings?.sidebarGroupsOff ?? []).includes(SIDE_GROUPS[1].id) && !quiet && !narrow
  const pinsOn = !(settings?.sidebarGroupsOff ?? []).includes(SIDE_GROUPS[0].id) && !quiet && !narrow
  const inRecent = !!view.focus && (!!noteNow || view.id === 'pdf' || view.id === 'web') && noteNow?.type !== 'task' && (!!noteNow || recents.some((one) => one.id === view.focus))
  // The note open now, if it was opened from its row under Pinned or Recent: that row is where the person is. Opened
  // from a list (Writing, the Inbox, Gems), the list's own row in the sidebar keeps the light (the user, 20 Nov: a page
  // opened in Writing lit Recent, and Writing not at all).
  if (openedFrom.current && openedFrom.current.id !== view.focus) openedFrom.current = null
  const from = openedFrom.current?.where
  // Whether the page on show has a row of its own in the sidebar to light.
  const placeShown = shown.includes(litRow(view.id, shown))
  /** Where the light belongs, whatever is folded: the kind of row, and which. */
  const wanted = (() => {
    // A folder's page, "Not in a folder" or every folder: the one row of the Folders section that is lit (one light
    // at a time: with no key of its own, the light stayed on the last folder when "All folders…" was opened).
    // A note open on it is the one lit instead: its row under its folder (`kept:` below).
    if (view.id === 'folders' && !(keptFolder && noteNow)) return `folders:${view.folder ?? 'all'}`
    if (noteList && homeFolder && foldersOn(noteList)) return `note:${noteNow!.id}`
    // A note kept in one of Folders' folders: its row under that folder (the section lights its heading when folded),
    // wherever it was opened from: ahead of Writing's own fold, which lists it too.
    if (keptFolder && !narrow && !quiet) return `kept:${noteNow!.id}`
    // A page in no folder, with Writing unfolded: its row under Writing, lit (side-writing.tsx), unless it was opened from a pin or Recent.
    if (noteList === 'article' && articleKept && foldersOn('article') && !quiet && from !== 'pin' && from !== 'recent') return `wpage:${noteNow!.id}`
    if (noteNow && noteNow.type !== 'task' && pinsOn && pins.some((one) => one.id === noteNow.id) && (from === 'pin' || !placeShown)) return `pin:${noteNow.id}`
    if (inRecent && recentOn && (from === 'recent' || !placeShown)) return `recent:${view.focus}`
    if (narrow) return `place:${litRow(view.id, shown)}`
    if ((view.id === 'articles' || view.id === 'nuggets') && view.folder && !noteNow && foldersOn(view.id === 'articles' ? 'article' : 'nugget')) return `folder:${view.folder}`
    if (!shown.includes(view.id) && JOURNAL_SCALES.some((one) => one.id === view.id)) return `scale:${view.id}`
    if (view.id === 'tags' && shown.includes('tags')) return view.focus && sideTags.some(({ tag }) => tag === view.focus) ? `tag:${view.focus}` : 'tags'
    return `place:${litRow(view.id, shown)}`
  })()
  // Folded by hand, it stays folded until focus next comes to something in it; meanwhile the section holding it takes the light.
  const light = wanted.startsWith('note:') && !(noteList === 'article' ? articleKept : nuggetKept) ? `place:${litRow(view.id, shown)}`
    : wanted.startsWith('pin:') && !pinsOpen ? (inRecent && recentOn && recentOpen ? `recent:${view.focus}` : `place:${litRow(view.id, shown)}`)
    : wanted.startsWith('recent:') && !recentOpen ? `place:${litRow(view.id, shown)}`
    : wanted.startsWith('tag:') && !tagsOpen ? 'tags'
    : wanted.startsWith('scale:') && !journalOpen ? `place:day`
    : wanted
  const sideChosen = useChosen(sideList, '[data-side-row][aria-current="page"]:not([inert] *)', light)
  useEffect(() => {
    if (wanted.startsWith('note:')) (noteList === 'article' ? keepArticle : keepNugget)(true)
    if (wanted.startsWith('pin:')) setPinsOpen(true)
    if (wanted.startsWith('recent:')) setRecentOpen(true)
    if (wanted.startsWith('tag:')) keepTags(true)
    // Once it has unfolded: into view, a row that is already there never moving.
    const frame = requestAnimationFrame(() => sideList.current?.querySelector('[data-side-row][aria-current="page"]:not([inert] *)')?.scrollIntoView({ block: 'nearest' }))
    return () => cancelAnimationFrame(frame)
  }, [wanted]) // eslint-disable-line react-hooks/exhaustive-deps
  // The one thing you were last in (a note, a book, an article), for Home's line after a long absence (resume-cards.tsx).
  const lastName = view.focus && (view.id === 'pdf' || view.id === 'web' || holdsNotes(view.id)) ? paneName(view).title : null
  useEffect(() => {
    if (!lastName || lastName === APP_NAME || !view.focus) return
    try {
      localStorage.setItem(LAST_PLACE, JSON.stringify({ view: { id: view.id, focus: view.focus, tab: view.tab, folder: view.folder }, title: lastName, at: Date.now() }))
    } catch {
      // Kept for this run only.
    }
  }, [view.id, view.focus, lastName]) // eslint-disable-line react-hooks/exhaustive-deps
  /** A pinned split laid out again, each pane one tab on its page; what was open comes back with Undo. */
  const openLayout = (views: View[], sizes: number[], at = 0): void => {
    const now = splitRef.current
    const shown = now.panes.map(onShow)
    if (sameLayout(views, shown)) return void (chime('tap'), toFront(now.panes[at]?.key ?? now.front))
    chime('slide')
    const panes = views.map((one) => fresh([{ ...one }]))
    setSplit({ panes, front: panes[at]?.key ?? panes[0].key, sizes: sizes.length === panes.length ? sizes : panes.map(() => 1 / panes.length) })
    toast('Opened the favorite split', () => setSplit(now))
  }
  /** The split on screen, kept in Pinned or let go from there. */
  const pinLine = (): { label: string; hint: string; run: () => void } => {
    const shown = splitRef.current.panes.map(onShow)
    const pinned = layouts.find((one) => sameLayout(one.views, shown))
    return pinned
      ? { label: 'Remove this split from Favorites', hint: 'It leaves Favorites; these sides stay open', run: () => dropLayout(pinned.id, 'Removed this split from Favorites') }
      : { label: 'Add this split to Favorites', hint: 'These sides, kept in the sidebar to open together again in one go', run: () => pinLayout(shown, splitRef.current.sizes) }
  }
  /** ⌘K's Even the split out: the room shared equally, as a double-click on a divider does, said in words with a way back. */
  const evenPanes = (): void => {
    const now = splitRef.current
    const even = now.panes.map(() => 1 / now.panes.length)
    if (now.panes.length < 2) return void chime('nope')
    if (now.sizes.length === even.length && now.sizes.every((one) => Math.abs(one - even[0]) < 0.01)) return void (chime('tap'), toast('The split is already even', undefined, 'info'))
    const was = now.sizes
    chime('tap')
    setSplit((one) => ({ ...one, sizes: even }))
    quietly(() => setSplit((one) => (one.panes.length === was.length ? { ...one, sizes: was } : one)))
  }
  /** ⌘K's End the split: the pane in front stays with its tabs, the rest fold away, and Undo lays them out again. */
  const endSplit = (): void => {
    const now = splitRef.current
    if (now.panes.length < 2) return void chime('nope')
    // The panes fold away: the paper says it. The separate chime on top was a second sound for the same close.
    paper('fold')
    setSplit(now.panes.filter((one) => one.key !== now.front).reduce((left, one) => removePane(left, one.key), now))
    toFront(now.front)
    toast('Ended the split', () => setSplit(now))
  }
  /**
   * A tab's one menu: what closes it, where it can move, and for a note what
   * every note's menu has. A place like Calendar has nothing to pin or link.
   */
  const tabMenu = (key: string, tabKey: string): RowItem[] => {
    const now = splitRef.current
    const pane = now.panes.find((one) => one.key === key)
    const tab = pane?.tabs.find((one) => one.key === tabKey)
    if (!pane || !tab) return []
    const at = pane.tabs.indexOf(tab)
    const paneAt = now.panes.indexOf(pane)
    const moveTo = (to: PaneState): void => moveCarried(key, tabKey, (one) => moveTab(one, key, tabKey, to.key, to.tabs.length), 'settled')
    const note = noteIn(tabStep(tab))
    const lines: RowItem[] = !note ? [] : note.type === 'task'
      ? [copyLinkItem(`task:${note.id}`, note.name.title)]
      : sideMenu(note.type, note.id, note.name.title, { onOpen: open, pinned: pins.some((one) => one.id === note.id), kind: known.get(note.id)?.capture?.kind, status: known.get(note.id)?.capture?.status })
        .filter((one) => !one || one === 'separator' || !('label' in one) || !/^open( in a new tab)?$/i.test(one.label))
    const loose = (index: number): boolean => !pane.tabs[index].pinned
    return [
      { label: 'Close', keys: '⌃W', run: () => closeTabIn(key, tabKey) },
      pane.tabs.some((one, index) => one !== tab && loose(index)) && { label: 'Close others', hint: pane.tabs.some((one) => one.pinned && one !== tab) ? 'Pinned tabs stay' : undefined, run: () => closeMany(key, tabKey, (one) => one.key === tabKey) },
      pane.tabs.some((_, index) => index > at && loose(index)) && { label: 'Close to the right', run: () => closeMany(key, tabKey, (_, index) => index <= at) },
      'separator',
      tab.pinned
        ? { label: 'Unpin tab', hint: 'Back among the others, with its name and ✕', run: () => pinTabIn(key, tabKey, false) }
        : { label: 'Pin tab', hint: 'Small, at the left, kept through restarts', run: () => pinTabIn(key, tabKey, true) },
      'separator',
      paneAt > 0 && { label: 'Move to the split on the left', run: () => moveTo(now.panes[paneAt - 1]) },
      paneAt < now.panes.length - 1 && { label: 'Move to the split on the right', run: () => moveTo(now.panes[paneAt + 1]) },
      pane.tabs.length > 1 && { label: 'Move to a new split', run: () => moveCarried(key, tabKey, (one) => tabToNewPane(one, key, tabKey, paneAt + 1), 'slide') },
      now.panes.length > 1 && 'separator',
      now.panes.length > 1 && pinLine(),
      'separator',
      ...lines
    ]
  }
  const tabActions: TabActions = {
    select: goToTab,
    close: closeAsked,
    add: (key) => openTab(LANDING, key, true),
    menu: tabMenu,
    // Back by a click on the button, onto the page something grew open from: it shrinks back into its place (lib/hero.ts).
    step: (key, by) => (by < 0 ? heroBack(() => stepBy(by, key)) : stepBy(by, key)),
    // Held or right-clicked, Back and Forward list this tab's own last five steps, nearest first, as a browser's do,
    // and end with All history: what was opened in every tab.
    history: (key, by) => {
      const pane = split.panes.find((one) => one.key === key)
      if (!pane) return []
      const trail = activeTab(pane).trail
      return [
        ...placesFrom(trail, by, swipeName).slice(0, 5).map(({ index, name }) => ({
          label: name.title, icon: <name.icon className="size-3.5 shrink-0" style={{ color: name.tint }} />, run: () => (step(index - trail.at, key), toFront(key))
        })),
        'separator' as const,
        { label: 'Show all history', keys: '⌥⌘Y', icon: <History className="size-3.5 shrink-0" />, run: () => setRecentState({ until: null, opened: true }) }
      ]
    },
    canStep: (key, by) => {
      const pane = split.panes.find((one) => one.key === key)
      const { at, views } = pane ? activeTab(pane).trail : { at: 0, views: [] }
      return by < 0 ? at > 0 : at < views.length - 1
    }
  }

  /** Every place to go, as ⌘K offers them, opened in a pane (the one in front unless said). */
  const placesTo = (key?: string): Action[] => [
    ...SECTIONS.map((section) => ({ label: `Go to ${section.label}`, hint: pageSaid(section.id), keys: `G ${section.key.toUpperCase()}`, run: () => setView({ id: section.id }, key) })),
    // The Tasks row's other tabs, and the pages that are a chip or a menu line now: still a G and a letter away.
    ...([['Upcoming', 'upcoming', 'U'], ['Later', 'later', 'Z'], ['Routines', 'routines', 'O'], ['All tasks', 'alltasks', '*'], ['Urgent and important', 'matrix', 'Q'], ['Questions: Looked up', 'lookups', '.']] as const).map(([name, id, letter]) => ({ label: `Go to ${name}`, hint: pageSaid(id), keys: `G ${letter}`, run: () => setView({ id }, key) }))
  ]

  /** What a pane's page asks of the window, the same functions for the window's whole life (useNewest). */
  const pageDoes = useNewest<PageDoes>({ open, toScale, setView, setTrail, closeTabIn, aside, openTab, setRecent, navFor, placesTo, order: () => ordered.map((section) => section.id) })
  /** A pane's page: the step it is on (PanePage). */
  const pageFor = (key: string, tab: string, view: View): React.JSX.Element => <PanePage does={pageDoes} pane={key} tab={tab} view={view} recentOpen={!!recent} tabChosen={tabChosen} splitRef={splitRef} />

  return (
    <TooltipProvider delayDuration={600} skipDelayDuration={400}>
    <div data-frame={settings?.darkFrame === false ? undefined : 'dark'} data-frame-grain={settings?.frameGrain === false ? undefined : ''} style={{ '--mf-frame-depth': settings?.frameDepth ?? 75 } as CSSProperties} className="isolate flex h-screen flex-col bg-background text-foreground">
      {/* Centred over the page, not the sidebar beside it. */}
      <div data-toast-lane className={`contents ${sidebar ? (right ? (narrow ? '[--toast-right:4rem]' : '[--toast-right:15rem]') : (narrow ? '[--toast-left:4rem]' : '[--toast-left:15rem]')) : ''}`}><Toaster /></div>
      <FolderPicker onFolders={() => setView({ id: 'folders', folder: 'all' })} />
      <PracticeAsked onHome={split.panes.some((one) => onShow(one).id === 'home')} />
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
      <Tour />
      <CloseDaySheet />
      <FitsSheet />
      <SortSheet />
      <ReadSheet />
      <SandboxHost />
      <FocusNote />
      <FocusScenery />
      <WrapSheet />
      <WrapOffer />
      <AnimatePresence>
      {searching && (
        <Search
          // Opened afresh on the lengths when ⌃⌥⌘S comes with ⌘K already open.
          key={`${searchFor}:${searching === 'focus'}`}
          // With the Calendar in front and a task picked, ⌘K is about that task (⌫ for everything).
          scope={searching === 'all' ? palette?.scope : undefined}
          choose={searching === 'focus' ? START_FOCUS : undefined}
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
            ...(quiet ? [{ label: 'Show everything', hint: 'Every page in the sidebar again', first: true, cue: null, run: () => void call('return:show-all').then(() => chime('unshelve')) }] : []),
            { label: 'New capture', hint: 'A blank capture in quick capture: write, then it goes to the Inbox', keys: 'C', first: true, run: () => window.api.showPrompt() },
            { label: 'Record a voice note', hint: 'Kept as a new capture', first: true, words: 'dictate dictation transcribe speech to text voice memo talk speak microphone', cue: null, run: () => void recordAsCapture((id) => open('capture', id)) },
            { label: 'Record a call or lecture', hint: 'Your microphone and this Mac’s sound, who said what', keys: '⌃⌥⌘M', words: MEETING_WORDS, cue: null, run: () => void recordMeeting() },
            { label: 'Recordings', hint: 'Every call and lecture you recorded', words: 'meetings recordings calls lectures transcripts', cue: null, run: () => setView({ id: 'tags', focus: 'recording' }) },
            ...(recordingsWithoutWords() ? [{ label: 'Transcribe the voice notes', hint: 'Their words under each, on this Mac', words: 'dictation speech to text', cue: null, run: transcribePage }] : []),
            { label: 'New question', hint: 'Something you want to find out, kept in Questions until it is answered', first: true, cue: null, run: () => void startQuestion(open) },
            { label: 'New goal', hint: 'Name it, give it a date if you like, then log each step', first: true, cue: null, run: () => void startGoal(open) },
            // One action for every open goal's beacon, then a short list: each goal, and the two settings it is not on.
            ...(goals.some((one) => !one.archivedAt && !one.closedAt) ? [{
              label: 'Goal on screen…', hint: 'How often a goal’s card shows on your screen: always, now and then, or never', cue: null, run: () => {},
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
            // What Home shows of your goals: none, the nearest few, or only the ones you choose. Settings has the same, and their order.
            ...(goals.some((one) => !one.archivedAt && !one.closedAt) ? [{
              label: 'Goals on Home…', hint: 'None, the nearest few, or only the ones you choose', words: 'strip top show hide nearest closest chosen pick', cue: null, run: () => {},
              choices: () => {
                const was = { goalsOnHome: settings?.goalsOnHome ?? 'off', goalsNearest: settings?.goalsNearest ?? 2 } as const
                const keep = (next: { goalsOnHome: 'off' | 'nearest' | 'chosen'; goalsNearest?: 1 | 2 | 3 }, said: string) => (): void => void haligtree.setSettings(next).then(() => {
                  chime(next.goalsOnHome === 'off' ? 'unstick' : 'stick')
                  toast(said, () => void haligtree.setSettings(was))
                })
                const here = (mode: string, count?: number): boolean => was.goalsOnHome === mode && (count === undefined || was.goalsNearest === count)
                return [
                  !here('off') && { label: 'No goals on Home', note: 'the strip goes', run: keep({ goalsOnHome: 'off' }, 'No goals on Home now') },
                  ...([1, 2, 3] as const).filter((count) => !here('nearest', count)).map((count) => ({
                    label: count === 1 ? 'The nearest goal' : `The nearest ${plural(count, 'goal')}`, note: 'by their day, soonest first',
                    run: keep({ goalsOnHome: 'nearest', goalsNearest: count }, count === 1 ? 'Home shows your nearest goal' : `Home shows your nearest ${plural(count, 'goal')}`)
                  })),
                  !here('chosen') && { label: 'Only the goals I choose', note: 'in the order you put them', run: keep({ goalsOnHome: 'chosen' }, 'Home shows the goals you choose: right-click a goal and choose “Show on Home”') }
                ].filter((one): one is { label: string; note: string; run: () => void } => !!one)
              }
            }] : []),
            ...(picked.ids.length > 1 ? [{ label: 'Make one task', hint: `From the ${num(picked.ids.length)} selected captures`, first: true, cue: null, run: () => window.dispatchEvent(new CustomEvent('haligtree:one-task')) }] : []),
            { label: 'Stick Today on the desktop', hint: 'Today’s tasks on a sticky note, over every window', cue: null, run: () => stickOnDesktop('today', 'today') },
            { label: 'Stick all goals', hint: 'On the desktop, each goal in its own colour, with a legend', words: 'desktop sticky stickies one', cue: null, run: () => stickOnDesktop('goals', 'all') },
            { label: 'Write out my day', hint: 'A new line at the end of Today’s list', first: true, cue: null, run: () => (setView({ id: 'today' }), writeOutDay()) },
            { label: 'Tidy captures', hint: 'A few minutes tagging your latest captures', run: () => openPass('tidy') },
            { label: 'Decide what to keep', hint: 'Once a week, look over what waited', run: () => openPass('decide') },
            { label: 'Import Obsidian or Notion…', hint: 'A vault or a Notion export', words: 'markdown vault bring in', cue: null, run: () => void window.api.importFrom('vault') },
            { label: 'Import from Apple Notes…', hint: 'Folder by folder, into Writing, to sort', cue: null, run: () => void window.api.importFrom('apple-notes') },
            { label: 'Import highlights and files…', hint: 'Readwise, Kindle, Markdown, bookmarks, Anki decks (.apkg, .colpkg) or CSV', words: 'import anki flashcards cards apkg kindle', cue: null, run: () => void window.api.importFrom('files') },
            // Your other books as this list's own second step, the one you were in last first: ↵ flips between the two. Not offered with no other book to go to.
            ...(otherBooks.length ? [{
              label: 'Switch book…', hint: 'Another book of yours: the one you were in last comes first', words: 'open change go to other book vault workspace space', cue: null, run: () => {},
              choices: () => otherBooks.map((book, index) => ({ label: book.name, mark: <BookMark hue={book.color} />, note: index === 0 && book.openedAt ? 'you were in it last' : undefined, run: () => void switchBook(book.id) }))
            }] : []),
            ...(SANDBOX ? [] : [
              { label: 'New book…', hint: 'An empty one, apart from this', cue: null, run: () => void askNewBook() },
              // The sandbox is someone else's book: its colour is not offered there.
              ...(openBook ? [{ label: 'Book colour…', hint: `The colour ${openBook.name} wears on its sidebar and in the accent’s place, to tell your books apart at a glance`, words: 'color accent tint hue space theme', cue: null, run: () => {}, choices: () => colourChoices(openBook) }] : []),
              { label: 'Import into another book…', hint: 'Bring notes into one of your other books, not this one', cue: null, run: () => askBook('import') }
            ]),
            // In the sandbox, restoring reads as a risk to your notes: it is not offered there.
            ...(SANDBOX ? [
              { label: 'Back to my notes', hint: 'Leave the sandbox', cue: null, run: () => void leaveSandbox() },
              { label: 'Reset the sandbox', hint: 'Their book back to how it began', cue: null, run: () => void resetSandbox() }
            ] : [
              { label: 'Restore from a backup…', hint: 'Pick a backup file: your book goes back to how it was then', cue: null, run: () => void window.api.restoreBackup() },
              { label: 'Open the sandbox', hint: "A peek into someone else's book, with examples", cue: null, run: () => void enterSandbox() }
            ]),
            { label: `What can ${APP_NAME} do?`, hint: 'Every power, with a way to try it', cue: null, run: () => setView({ id: 'powers' }) },
            { label: "What's new", hint: `The latest in ${APP_NAME}, with a way to try each`, cue: null, run: openWhatsNew },
            { label: 'Close the day', first: true, hint: "What got done, and tomorrow's first task", cue: null, run: openCloseDay },
            { label: 'Sort out the Inbox', hint: 'About ten minutes: where each capture goes', cue: null, run: openInboxSort },
            { label: 'Close the week', hint: 'What went well, what moves on, and the one thing for next week', cue: null, run: openCloseWeek },
            // A spare few minutes: what fits them, in the Matrix's order. "i have 20" or "20 min" asks straight away.
            // One of the focus tools: offered only while they are on, as in Tasks' ⋯.
            ...(settings?.focusTools === true ? [{ label: 'I have 15 minutes…', hint: 'Tasks that fit the time you have', cue: null, run: () => {},
              choices: () => FIT_CHOICES.map((minutes) => ({ label: `${minutes} minutes`, note: minutes === (settings?.fitMinutes ?? 15) ? 'last time' : undefined, run: () => openFits(minutes) })),
              heard: (typed: string) => { const minutes = fitsHeard(typed); return minutes ? { label: `I have ${minutes} minutes`, hint: 'Tasks that fit', cue: null, run: () => openFits(minutes) } : null } }] : []),
            { label: 'Open my playbook', hint: 'How I work, in my own words', cue: null, run: () => void openPlaybook() },
            { label: 'Show the welcome again', hint: 'The first-run tour, from the start', cue: null, run: () => playWelcome() },
            // Either welcome, to feel which is right: played in the sandbox, so your own book is never touched.
            { label: 'Show the welcome in the sandbox', hint: 'Your own notes stay as they are', cue: null, run: () => void tryWelcome() },
            // Each look of Wrapped on the sandbox's month, to feel which is right.
            ...(SANDBOX ? ([['Files', 'files'], ['Night', 'night'], ['surprise me', 'surprise']] as const).map(([name, world]) => (
              { label: `Wrapped: ${name}`, hint: world === 'surprise' ? 'Any look, never the same twice' : `The month's wrap in the ${name} look`, words: 'wrap story month spotify', cue: null, run: () => openWrap(monthToWrap(), world) })) : []),
            { label: 'Try a celebration', hint: 'One of the moments the app marks, like an empty Inbox, shown now', cue: null, run: () => tryCelebration() },
            ...placesTo(),
            { label: sidebar ? 'Hide the sidebar' : 'Show the sidebar', hint: sidebar ? 'More room for the page; ⌘B brings it back' : 'Your pages, folders and favorites on the left', keys: '⌘B', cue: sidebar ? 'fold' : 'slide', run: () => (setSidebar(!sidebar), (sidebar ? toast('Sidebar hidden. ⌘B brings it back', () => setSidebar(sidebar)) : quietly(() => setSidebar(sidebar)))) },
            { label: sidebar || detailsShown() ? 'Hide every sidebar' : 'Show every sidebar', hint: sidebar || detailsShown() ? 'The page alone, with nothing at its sides' : 'The sidebar on the left and the details on the right', keys: '⇧⌘B', cue: null, run: () => { const open = sidebar || detailsShown(); showDetails(!open); setSidebar(!open); (open ? toast('Every sidebar hidden. ⇧⌘B brings them back', () => (showDetails(open), setSidebar(open))) : quietly(() => (showDetails(open), setSidebar(open)))) } },
            { label: fill ? 'Back to compact' : 'Fill the screen', hint: fill ? 'The window back to the size it was' : 'The window as big as the screen, without going full screen', keys: '⌃⇧F', cue: null, run: () => (setFill(!fill), (fill ? quietly(() => setFill(fill)) : toast('Filling the screen. ⌃⇧F goes back', () => setFill(fill)))) },
            { label: 'Split the page', hint: 'This page again beside it; ⌘O there opens something else', keys: '⌘\\', cue: null, run: () => splitRight() },
            { label: 'Open in a split to the right', hint: 'A new side, searching for what to open', keys: '⌥⌘\\', cue: null, run: () => splitRight(true) },
            { label: 'Open something here', hint: 'Search for a page or note to open in this tab', keys: '⌘O', cue: null, run: () => setView({ id: 'pick' }) },
            { label: 'New tab', hint: 'On the Journal, in this split', keys: '⌘T', cue: null, run: () => openTab(LANDING, frontRef.current, true) },
            { label: 'Close this tab', hint: 'The page in front; ⇧⌘T brings it back', keys: '⌃W', cue: null, run: () => closeTabIn() },
            { label: 'Reopen what you closed', hint: 'The last tab closed, or the last note left', keys: '⇧⌘T', cue: null, run: reopen },
            ...(split.panes.length > 1 ? [
              { label: 'Even out the split', hint: 'Each side the same width', cue: null, run: evenPanes },
              { label: 'End the split', hint: 'Keep this side and its tabs', cue: null, run: endSplit },
              { ...pinLine(), cue: null },
              { label: 'Pane to the left', hint: 'Move to the side on the left', keys: '⌃H', cue: null, run: () => paneSaid(-1) },
              { label: 'Pane to the right', hint: 'Move to the side on the right', keys: '⌃L', cue: null, run: () => paneSaid(1) }
            ] : []),
            { label: 'Fold every heading', hint: 'In the note in front: only its headings show', cue: null, run: () => void (foldEverything(true) ? quietly(() => void foldEverything(false)) : refuse('No headings to fold in the note in front')) },
            { label: 'Unfold every heading', hint: 'In the note in front: everything under its headings shows again', cue: null, run: () => void (foldEverything(false) ? quietly(() => void foldEverything(true)) : refuse('No headings to unfold in the note in front')) },
            isCollecting()
              ? { label: 'Stop collecting what I copy', hint: 'What you copy stays on the clipboard only', keys: '⎋', cue: null, run: stopCollect }
              : { label: 'Collect what I copy', hint: 'Everything you copy on this Mac lands in the note in front', cue: null, run: () => void (startCollect() || refuse('Open a note to collect into')) },
            { label: typewriter ? 'Turn typewriter scrolling off' : 'Turn typewriter scrolling on', hint: typewriter ? 'The page scrolls only when the line you write reaches the edge' : 'The line you are writing stays in the middle of the window', cue: typewriter ? 'off' : 'on', run: () => (setTypewriter(!typewriter), toast(typewriter ? 'Typewriter scrolling off' : 'Typewriter scrolling on', () => setTypewriter(typewriter))) },
            { label: settings?.lineNumbers !== false ? 'Turn line numbers off' : 'Turn line numbers on', hint: settings?.lineNumbers !== false ? 'Notes without the numbers in their left margin' : 'Each line of a note numbered in its left margin', cue: settings?.lineNumbers !== false ? 'off' : 'on', run: () => {
              const was = settings?.lineNumbers !== false
              void haligtree.setSettings({ lineNumbers: !was })
              toast(was ? 'Line numbers off' : 'Line numbers on', () => void haligtree.setSettings({ lineNumbers: was }))
            } },
            { label: settings?.sounds ? 'Turn sounds off' : 'Turn sounds on', hint: settings?.sounds ? 'Every action happens quietly' : 'A small sound answers each action', cue: null, run: () => {
              soundOn(!settings?.sounds)
              chime(settings?.sounds ? 'off' : 'on')
              void haligtree.setSettings({ sounds: !settings?.sounds })
              const was = !!settings?.sounds
              toast(was ? 'Sounds off' : 'Sounds on', () => (soundOn(was), void haligtree.setSettings({ sounds: was })))
            } },
            { label: settings?.safeMode ? 'Turn safe mode off' : 'Turn safe mode on', hint: settings?.safeMode ? 'Hints, favorites, sticky notes and goal cards come back' : 'Nothing comes up unasked, for sharing your screen', keys: '⌥⌘S', cue: null, run: safeMode },
            // Away for a meeting or quiet hours: the way to have them out all the same.
            ...deskAwayAction(desk),
            { label: settings?.stickiesShown === false ? 'Show sticky notes' : 'Hide sticky notes', hint: settings?.stickiesShown === false ? 'Your sticky notes back on the desktop' : 'Off the desktop for now, kept as they are', keys: '⌃⌥⌘N', cue: null, run: () => {
              const show = settings?.stickiesShown === false
              void haligtree.setSettings({ stickiesShown: show }).then(() => (show ? quietly : (undo: () => void) => toast('Sticky notes hidden. ⌃⌥⌘N brings them back', undo))(() => void haligtree.setSettings({ stickiesShown: !show })))
            } },
            { label: recordable ? 'Hide from recordings' : 'Show in recordings', hint: `${APP_NAME} in screen recordings and shares`, cue: recordable ? 'off' : 'on', icon: recordable ? CameraOffIcon : CameraIcon, run: () => recordAll(!recordable, settings?.inRecordings) },
            // Not in safe mode: the notes it would bring are meant to be put away then.
            // The starter lists, found by name too ("Start a list: Overheard"), not only from Gems' right-click.
            ...STARTER_LISTS.map(([icon, name]) => ({ label: `Start a list: ${name}`, hint: `${icon} A folder for what you keep`, cue: null, run: () => void startList(icon, name).then((folder) => setView({ id: 'folders', folder: folder })) })),
            // Folders: the open note kept in one, a new one, every one.
            ...(noteNow && ['capture', 'article', 'nugget', 'question', 'task'].includes(noteNow.type) ? [{ label: 'Keep in folder…', hint: 'The open note, in a folder you pick or make', cue: null, run: () => askFolder([{ type: noteNow.type as FolderKind, id: noteNow.id }]) }] : []),
            { label: 'New folder', hint: 'In Folders, named as it is made', keys: '⌃⌘N', cue: null, run: () => newFolderHere(null) },
            { label: 'All folders', hint: 'Every folder, to find one by its name', cue: null, run: () => setView({ id: 'folders', folder: 'all' }) },
            ...(settings?.safeMode || desk?.hidden ? [] : [{ label: 'Bring sticky notes here', hint: 'Every sticky note, fanned out at the top right of this screen', cue: null, run: () => window.api.gatherStickies() }]),
            ...(settings?.safeMode || !stickiesOut ? [] : [{ label: 'Tidy stickies', hint: 'Line the sticky notes up in a neat column', keys: '⌃⌥⌘T', cue: null, run: () => window.api.tidyStickies() }]),
            { label: 'reveal' in document.documentElement.dataset ? 'Blur private titles again' : 'Show private titles', hint: 'For now', cue: 'reveal' in document.documentElement.dataset ? 'off' : 'on', run: () => {
              const root = document.documentElement
              const flip = (): void => void ('reveal' in root.dataset ? delete root.dataset.reveal : (root.dataset.reveal = ''))
              flip()
              quietly(flip)
            } },
            ...abandonAction,
            ...practiceActions,
            { label: 'Study stats', hint: 'Reviews a day, how often you remember, what falls due', cue: null, run: () => setView({ id: 'review', focus: ':stats' }) },
            { label: 'Decks', hint: 'Your decks, and shared Anki decks on their own shelf', cue: null, run: () => setView({ id: 'review', focus: ':decks' }) },
            { label: 'New deck', hint: 'A deck is a tag your cards share: name it, then make a card or add many at once', words: 'flashcard flashcards anki', cue: null, run: () => (setView({ id: 'review', focus: ':decks' }), nameNewDeck()) },
            ...deckTags.map((tag) => ({ label: `New card in #${tag}`, hint: 'Type the question and its answer, in Review', cue: null, run: () => setView({ id: 'review', focus: `:new:${tag}` }) })),
            { label: 'Add many cards at once', hint: 'Paste a list or a spreadsheet, one card a line: front | back', words: 'paste cards flashcard flashcards anki', cue: null, run: () => setView({ id: 'review', focus: ':paste' }) },
            { label: 'Study now', hint: 'The cards due today, in Review', cue: null, run: () => setView({ id: 'review', focus: ':today' }) },
            { label: 'Import an Anki deck or CSV…', hint: 'An .apkg, .colpkg or a spreadsheet of cards', words: 'import anki flashcards apkg', cue: null, run: () => void window.api.importFrom('files') },
            { label: 'Liked', hint: 'Every post you hearted, newest first, week by week', cue: null, run: () => (setView({ id: 'feed', focus: ':liked' }), showLiked()) },
            { label: 'Browse all cards', hint: 'Search, sort, pause and tag them, in Review', cue: null, run: () => setView({ id: 'review', focus: ':cards' }) },
            // Study one tag's cards, scheduled as in any review.
            ...(cardTags ?? []).map((tag) => ({ label: `Study #${tag}`, hint: 'Its cards in Review, with the tags under it', cue: null, run: () => setView({ id: 'review', focus: tag }) })),
            // Figma's grouping, for the notes picked in Writing, Gems or Questions (items-view.tsx does it, with Undo).
            ...(view.id === 'nuggets' || view.id === 'articles' || view.id === 'questions' ? [
              { label: 'Group the picked notes', hint: 'In place, in this list or folder', words: 'group gather', keys: '⌘G', cue: null, run: () => void window.dispatchEvent(new CustomEvent('haligtree:group', { detail: false })) },
              { label: 'Ungroup', hint: 'The group the picked notes are in comes apart; they stay where they are', words: 'separate ungroup', keys: '⇧⌘G', cue: null, run: () => void window.dispatchEvent(new CustomEvent('haligtree:group', { detail: true })) }
            ] : []),
            { label: 'Keyboard shortcuts', hint: 'Every key, by what it does', keys: '?', cue: null, run: () => window.dispatchEvent(new CustomEvent('haligtree:shortcuts')) },
            { label: 'Clear unused pictures…', hint: 'Pictures no note shows any more: see them, keep any, the rest go to the Mac’s Bin', cue: null, run: () => window.dispatchEvent(new CustomEvent('haligtree:unused')) },
            ...themeActions((text, undo) => toast(text, undo)),
            { label: settings?.blur === false ? 'Turn blurring on' : 'Turn blurring off', hint: settings?.blur === false ? 'Private notes blurred until you point at them' : 'Private notes shown plainly', cue: null, run: blurring },
            { label: 'Settings', hint: 'Look, sounds, keys, backups and your book', keys: '⌘,', run: () => setView({ id: 'settings' }) },
            // For anyone who finds it all too small: said the way they would ask, with the keys that do it.
            { label: 'Make everything bigger', hint: 'Text and controls, in every window', keys: '⌘+', cue: null, run: () => void window.dispatchEvent(new CustomEvent('haligtree:app-size', { detail: 1 })) },
            { label: 'Make everything smaller', hint: 'Text and controls, in every window', keys: '⌘−', cue: null, run: () => void window.dispatchEvent(new CustomEvent('haligtree:app-size', { detail: -1 })) },
            { label: 'Your reader card', hint: 'Your book on a card, in Settings', cue: null, run: () => setView({ id: 'settings', focus: 'reader-card', nonce: Date.now() }) },
            // The wrench on a sidebar heading shows only on pointing: found here too.
            { label: 'Customize the sidebar…', hint: 'Choose and order the pages it shows', cue: null, run: () => void setTimeout(() => setCustomizing(true), 120) },
            { label: recent && !recent.opened ? 'Hide Recent' : 'Show Recent', hint: recent && !recent.opened ? 'The list of what you made lately goes away' : 'Recent: everything made lately, beside the page', keys: '⇧⌘Y', cue: null, run: toggleRecent },
            { label: recent?.opened ? 'Hide all history' : 'Show all history', hint: recent?.opened ? 'The list of what you opened lately goes away' : 'Every note, book and page opened lately, in any tab', keys: '⌥⌘Y', cue: null, run: toggleHistory },
            { label: "Open the year's page", hint: 'Your seasons of life, month by month', cue: 'season', run: () => setView({ id: 'yearpage' }) },
            ...noteActions({ day: false }),
            // The recap, Wrapped's way, over Stats.
            { label: 'Your month in notes, wrapped', hint: 'What you captured most, your busiest day, the hour ideas came, focus hours, gems kept, what went well', cue: null, run: () => openWrap(monthToWrap()) },
            { label: 'Your week, wrapped', hint: 'A few cards on this week', cue: null, run: () => openWrap(`week:${dayKey(dayjs().startOf('week'))}`) },
            { label: 'Your month in study, card by card', hint: 'Cards reviewed, days studied, how much stayed, the book you read most, one line of your own', run: () => setView({ id: 'stats', focus: 'yourmonth', nonce: Date.now() }) },
            { label: 'Your year, wrapped', hint: 'Your year in notes, a card at a time', run: () => setView({ id: 'stats', focus: 'year', nonce: Date.now() }) }
          // Each one says it came from ⌘K, for the usage counts.
          ] satisfies Action[]).map((one) => ({ ...one, run: () => (via('palette'), one.run()) }))}
          onClose={() => (setSearching(false), setSearchFor(''))}
          onAside={(type, id) => {
            setSearching(false)
            setSearchFor('')
            via('search')
            aside(stepOf(type, id))
          }}
          onTab={(type, id) => {
            setSearching(false)
            setSearchFor('')
            via('search')
            openTab(stepOf(type, id))
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
        className={sidebar ? 'contents' : `absolute inset-y-2 z-50 flex rounded-xl bg-background shadow-(--mf-panel-shadow) transition-[opacity,transform] duration-200 ease-(--mf-ease) motion-reduce:!transform-none [:root[data-motion=off]_&]:!transform-none ${right ? 'right-2' : 'left-2'} ${peekIn ? 'translate-x-0 opacity-100' : `opacity-0 ${right ? 'translate-x-6' : '-translate-x-6'}`}`}
        onPointerEnter={sidebar ? undefined : () => setPeek(true)} onPointerLeave={sidebar ? undefined : () => setPeek(false)}>
      {/* Customize opens beside the whole sidebar, just under the window's top bar, so it never hides the bar nor runs off the window. */}
      <Popover open={customizing} onOpenChange={setCustomizing}>
      <PopoverAnchor asChild>
      {/* Anything the sidebar opens, its menus too, was found by the sidebar (lib/usage.ts). */}
      <aside data-chrome data-book-tint data-hero-still style={sideStyle} onClickCapture={() => via('sidebar')} className={`group/side flex shrink-0 flex-col overflow-hidden rounded-xl border bg-accent/20 ${narrow ? 'mt-9 w-12 [:root[data-fullscreen]_&]:mt-0' : 'w-56'} ${opened ? 'mf-opened-side' : ''}`}>
        {/* Room for the traffic lights, and somewhere to hold the window by.
            It stays put: only the list under the search scrolls, so nothing
            ever slides under the window's buttons. */}
        {/* In the Mac's full screen there are no traffic lights here, so the room closes up. */}
        <div data-drag-strip="" className={`${narrow ? 'h-2' : 'h-10'} shrink-0 [:root[data-fullscreen]_&]:h-2`} style={{ WebkitAppRegion: 'drag' } as CSSProperties} />
        <div className="flex shrink-0 items-center gap-1 px-2 pb-2">
          {/* "Search…" sits on the pill's fill, Brutal's accent included (Faded Ink was 4.4:1 there): the strong quiet ink. */}
          <button
            type="button"
            data-tour="search"
            aria-label="Search"
            onClick={() => setSearching('all')}
            className={`flex items-center gap-2 bg-accent/60 text-(--mf-muted-strong) transition-colors hover:bg-accent hover:text-foreground ${narrow ? NARROW_ICON : 'w-full rounded-lg px-2.5 py-1.5'}`}
          >
            <AliveIcon icon={MagnifierIcon} size={16} />
            {!narrow && <span className="flex-1 text-left">Search…</span>}
            {!narrow && <Pressed keys="⌘K" />}
          </button>
          {/* Every fold in the sidebar at once: shut them all while any is open, else open them all. */}
          {!narrow && (() => {
            const anyOpen = everyFold.anyOpen
            const label = anyOpen ? 'Fold everything in the sidebar' : 'Unfold everything in the sidebar'
            return (
              <Tip label={label}>
                <button type="button" data-side-fold-all={anyOpen ? 'fold' : 'unfold'} aria-label={label}
                  onClick={() => (chime(anyOpen ? 'fold' : 'slide'), everyFold.set(!anyOpen))}
                  className="flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground [&_svg]:size-4">
                  {anyOpen ? <ChevronsDownUp /> : <ChevronsUpDown />}
                </button>
              </Tip>
            )
          })()}
        </div>
        {/* More places and folders under the fold: a ↓ pill says so, as Arc's sidebar does. */}
        <MoreBelow target={sideList} />
        <div ref={sideList} {...sideHover.handlers}
          className={`mf-fade-end ${narrow ? 'mf-fade-tall snap-y snap-mandatory scroll-pt-1 [&_[data-side-row]]:snap-start' : ''} relative isolate flex min-h-0 flex-1 flex-col overflow-y-auto px-2 pt-1 pb-3`}>
        {/* Rows' previews: once one is up, the next swaps in at once, even after a short pause between rows. */}
        <TooltipProvider delayDuration={600} skipDelayDuration={900}>
        {/* In the narrow rail every row is an icon alone, lit as a circle as the icon buttons are, at every width. */}
        <Highlight chosen={sideChosen} travel={spring.moderate} className={narrow ? 'rounded-full bg-accent' : 'bg-accent'} />
        <Highlight light={sideHover.light} className={narrow ? 'rounded-full' : undefined} />
        <nav className="flex flex-col gap-px">
          {(() => {
            // Where a promoted capture or a new task flies to (lib/fly-home.ts).
            const homeOf = (id: string): string | undefined => (id === 'nuggets' ? 'nugget' : id === 'today' ? 'task' : id === 'articles' ? 'question' : id === 'discarded' ? 'bin' : id === 'media' ? 'files' : undefined)
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
              const hidden = ordered.filter((one) => !shown.includes(one.id) && !OFF_SIDEBAR.includes(one.id))
              return [
                view.id !== section.id && { label: 'Open', run: () => setView({ id: section.id }) },
                ...openItems('view', section.id),
                // Writing makes pages, first. Folders live in Folders, not in Writing or Gems (they keep only groups).
                section.id === 'articles' && { label: 'New page', run: () => addPage() },
                // The lists commonplace keepers start with, one press each: a folder of Gems, named, given its emoji and opened.
                section.id === 'nuggets' && { label: 'Start a list', items: STARTER_LISTS.map(([icon, name]) => ({ label: name, icon: <span aria-hidden className="flex size-4 items-center justify-center text-[0.9rem] leading-none">{icon}</span>, run: () => void startList(icon, name).then((folder) => setView({ id: 'folders', folder: folder })) })) },
                'separator',
                ...orderItems({ setting: 'sidebarOrder', usual: sections.map((one) => one.id), id: section.id, among, what: 'The sidebar', name: section.label }, sidebarSaved.length > 0 || Object.keys(settings?.sidebarGroups ?? {}).length > 0),
                'separator',
                !stays && { label: showWords(section, on).label, run: () => void showIt(section, !on) },
                // The pages switched off from the sidebar, each named with what choosing it does: put it back there.
                hidden.length > 0 && { label: 'Hidden pages', items: hidden.map((one) => ({ label: `Show ${quoted(one.label, 80)} in the sidebar`, icon: <PlaceIcon place={one} />, run: () => void showIt(one, true) })) },
                // Once the menu has shut and handed the focus back, or the panel would take that as a click away.
                { label: 'Customize the sidebar…', hint: 'Choose and order the pages it shows', run: () => void setTimeout(() => setCustomizing(true), 120) }
              ]
            }
            // The open note, under the folder it lives in, for as long as it is the one in front: not a file tree, only this one row.
            const NoteIcon = noteNow?.name.icon
            const noteRow = noteNow && NoteIcon && (
              <RowMenu key="note-row" items={fullMenu(noteNow.type, noteNow.id, () => open(noteNow.type, noteNow.id)) ?? []}>
                <button type="button" data-side-row data-side-note={noteNow.id} aria-current="page" data-private={noteNow.name.private ? '' : undefined} title={noteNow.name.private ? undefined : noteNow.name.title || undefined} onClick={() => open(noteNow.type, noteNow.id)}
                  className="flex w-full min-w-0 items-start gap-2 rounded-md py-1 pr-2 pl-2 text-foreground">
                  {/* A long title goes on to a second line, as a folder's name does, rather than being cut; the icon stays on its first. */}
                  <span className="flex h-[1lh] w-4 shrink-0 items-center justify-center"><NoteIcon className="size-3.5 shrink-0" style={{ color: noteNow.name.tint }} /></span>
                  {/* Its weight is the rows' around it, as Recent's lit row's is: the highlight says it is the one open. */}
                  <span className="private-text min-w-0 flex-1 text-left truncate">{noteNow.name.title}</span>
                </button>
              </RowMenu>
            )
            // A row glides when moved, but the copy left showing under a folded
            // group's heading does not share its name: while the group shuts, the row
            // is in both places, and a shared name made it fly up and drop back in.
            const row = (section: (typeof SECTIONS)[number], among: string[] = [], still = false): React.JSX.Element => {
              // Writing and Gems hold their groups as folders, folded with the chevron over the row's icon.
              const list = section.id === 'articles' ? 'article' : section.id === 'nuggets' ? 'nugget' : null
              // Journal's other scales hang under it as Writing's folders do: Day is Journal itself, so it is not one;
              // a scale with a row of its own in the sidebar is not listed twice.
              const scales = section.id === 'day' && !narrow ? JOURNAL_SCALES.filter((one) => !shown.includes(one.id)) : []
              const folders = list && !narrow && settings?.sidebarFolders?.[list] !== false ? (list === 'article' ? articles : nuggets) : null
              const [unfolded, setUnfolded] = list === 'article' ? [articleFolders, setArticleFolders] : list === 'nugget' ? [nuggetFolders, setNuggetFolders] : [journalOpen, setJournalOpen]
              // Writing's pages, under its row as a folder's are under it (side-writing.tsx), archived ones aside.
              const pages = list === 'article' && folders ? folders.filter((one) => !one.archivedAt) : []
              // What the chevron over the icon folds: Writing's pages and folders, Gems' folders, or Journal's scales;
              // only with something to fold (a Writing with no pages and no folders has none).
              const folds = (!!(folders && list) && (list !== 'article' || pages.length > 0 || writingFolders.some(isFolder))) || scales.length > 0
              // The folder to light the way down to: where the open note lives, or the one on show.
              const inFolder = list && noteList === list ? homeFolder ?? undefined : view.id === section.id && !noteNow ? view.folder : undefined
              const inScale = light === `scale:${view.id}` && scales.some((one) => one.id === view.id)
              const here = light === `place:${section.id}`
              return (
              <SortableRow key={section.id} id={section.id} glide={still ? undefined : `side-${section.id}`}>
              {/* Its menu is made as it opens (RowMenu): made with the row, sixteen menus were built each time the window drew. */}
              <RowMenu items={() => placeMenu(section, among)}>
              {/* A row that has just joined the sidebar rises in, once. */}
              <motion.div className="flex flex-col" initial={risen.has(section.id) ? { opacity: 0, y: 6 } : false} animate={{ opacity: 1, y: 0 }}
                transition={{ type: 'spring', duration: 0.42, bounce: 0 }} onAnimationComplete={() => risen.delete(section.id)}>
              {/* Its preview: a picture of the page, a line on what it is for, and its keys. */}
              <div className="group/fold relative flex flex-col">
              <SidePeek id={section.id} keys={`G ${section.key.toUpperCase()}`}>
              <button
                type="button"
                data-home={homeOf(section.id)}
                data-tour={section.id === 'inbox' || section.id === 'review' ? section.id : undefined}
                data-side-row
                data-queue-drop={section.id === 'queue' ? '' : undefined}
                // A capture carried here becomes a page in Writing (split-drop.tsx); lit while it is over it.
                data-writing-drop={section.id === 'articles' ? '' : undefined}
                aria-label={section.label}
                aria-current={here ? 'page' : undefined}
                onClick={() => open('view', section.id)}
                className={`group relative flex items-center gap-2.5 transition-colors duration-80 ${narrow ? NARROW_ICON : 'rounded-md px-2 py-1.5'} ${here || inFolder || inScale ? 'text-foreground' : 'text-(--mf-muted-strong)'} data-[queue-hot]:bg-[color-mix(in_oklab,var(--tt-color-text-blue)_16%,transparent)] data-[queue-hot]:text-foreground data-[queue-hot]:ring-1 data-[queue-hot]:ring-[color-mix(in_oklab,var(--tt-color-text-blue)_45%,transparent)]`}
              >
                {/* While anything is being dragged, a fold row keeps its icon and count: the row moving under a still
                    pointer flipped it to its chevron and back. */}
                {/* Each icon keeps its colour, softened while at rest so the hues do not
                    shout at once; the one you are on, or reaching for, is in full. */}
                <span className={`flex shrink-0 transition-opacity duration-80 ${folds ? 'group-hover/fold:opacity-0 [:root[data-dragging]_&]:!opacity-100' : ''}`}><PlaceIcon place={section} full={here || litRow(view.id, shown) === section.id} /></span>
                {!narrow && <Weighted on={here} className="flex-1 text-left">{section.label}</Weighted>}
                {!narrow && countsIn && countOf(section.id) ? (
                  // Each count says what it counts, pointed at: the orange one is what is due today.
                  <Tip label={countSaid(section.id, counts[section.id])}>
                    <span data-side-count={section.id} className={folds && list ? 'transition-opacity duration-80 group-hover/fold:opacity-0 [:root[data-dragging]_&]:!opacity-100' : undefined}>
                      <Count tip={!countSaid(section.id, counts[section.id])} n={counts[section.id]} className={`text-xs ${section.id === 'today' ? 'text-[var(--tt-color-text-orange)]' : 'text-muted-foreground'}`} />
                    </span>
                  </Tip>
                ) : null}
              </button>
              </SidePeek>
              {/* In the count's place, until pointed at (Notion's way): its menu ("···", the right click's own), and a +: a page
                  in Writing, a folder in Gems (gems come from notes, never blank). */}
              {list && !narrow && (list === 'article' || settings?.sidebarFolders?.[list] !== false) && (
                <span className="absolute top-1/2 right-1.5 flex -translate-y-1/2 items-center gap-0.5 opacity-0 transition-opacity duration-80 group-hover/fold:opacity-100 focus-within:opacity-100 [:root[data-dragging]_&]:!opacity-0">
                  <Tip label="More">
                    <button type="button" data-side-more={list} aria-label={`${section.label} menu`} onClick={openFromGrip}
                      className="mf-hit relative flex size-5 cursor-pointer items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
                      <AliveIcon icon={DotsHorizontalIcon} size={14} />
                    </button>
                  </Tip>
                  {/* Writing's "+" makes a page; Gems makes none from blank (gems come from notes), and no folders (Folders does). */}
                  {list === 'article' && (
                    <Tip label="Add a page">
                      <button type="button" data-folder-new={list} aria-label="Add a page to Writing" onClick={() => addPage()}
                        className="mf-hit relative flex size-5 cursor-pointer items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
                        <Plus className="size-3.5" />
                      </button>
                    </Tip>
                  )}
                </span>
              )}
              {/* Writing's and Gems' fold: quiet, over the icon, until pointed at (Notion's way). */}
              {folds && (
                <button type="button" data-folders-fold={list ?? 'journal'} aria-label={list ? (unfolded ? `Fold ${section.label}'s ${list === 'article' ? 'pages' : 'folders'} away` : `Show ${section.label}'s ${list === 'article' ? 'pages' : 'folders'}`) : unfolded ? `Fold ${section.label}'s pages away` : `Show ${section.label}'s pages`} aria-expanded={unfolded}
                  onClick={() => (chime(unfolded ? 'fold' : 'slide'), setUnfolded(!unfolded))}
                  className="absolute top-1/2 left-1.5 flex size-5 -translate-y-1/2 items-center justify-center rounded text-muted-foreground opacity-0 transition-[opacity,background-color] duration-80 group-hover/fold:opacity-100 hover:bg-accent hover:text-foreground focus-visible:opacity-100 [:root[data-dragging]_&]:!opacity-0">
                  <ChevronRight className={`size-3.5 transition-transform duration-80 ${unfolded ? 'rotate-90' : ''}`} />
                </button>
              )}
              </div>
              </motion.div>
              </RowMenu>
              {scales.length > 0 && (
                <Unfold open={journalOpen || inScale}>
                <Branches className="ml-5 flex flex-col gap-px">
                  {scales.map((one) => (
                    <button key={one.id} type="button" data-side-row data-side-scale={one.id} aria-current={light === `scale:${one.id}` ? 'page' : undefined}
                      // Its own press, not the Journal row's carry (lib/own-press.ts): the press itself travels on.
                      data-own-press=""
                      onClick={() => setView({ id: one.id })}
                      className={`group flex w-full min-w-0 items-center gap-2 rounded-md py-1 pr-2 pl-2 ${view.id === one.id ? 'text-foreground' : 'text-(--mf-muted-strong)'}`}>
                      <span className="flex size-4 shrink-0 items-center justify-center [&_svg]:size-3.5"><PlaceIcon place={one} full={view.id === one.id} /></span>
                      <Weighted on={view.id === one.id} className="flex-1 text-left">{one.label}</Weighted>
                    </button>
                  ))}
                </Branches>
                </Unfold>
              )}
              {/* On the icon rail, Writing's and Gems' folders and groups are a menu away, under their icon. */}
              {narrow && list && settings?.sidebarFolders?.[list] !== false && (
                <RailFolders list={list} onOpen={(id) => setView({ id: section.id, folder: id })} />
              )}
              {folders && list && (
                // Its own drags, not the row's: a folder pressed on is not Writing carried away (lib/own-press.ts). The
                // press is not stopped: every open popover hears it, so a folder's icon picker shuts when another is pressed.
                <div data-own-press="">
                  <SideFolders list={list} counted={countsOn} open={unfolded} here={inFolder} noteRow={light.startsWith('note:') && noteList === list ? noteRow : undefined} shown={shownIn(list, folders)}
                    onOpen={(id) => setView({ id: section.id, folder: id })} onUnfold={() => setUnfolded(true)} onNewPage={list === 'article' ? addPage : undefined} />
                  {/* Its pages on the same tree lines as a folder's things (FoldersSection): the first four, the one open among them, "See all". */}
                  {pages.length > 0 && (
                    <Unfold open={unfolded}>
                      <Branches className="ml-5 flex flex-col gap-px">
                        <WritingPages pages={pages} lit={light === `wpage:${noteNow?.id}` ? noteNow?.id : undefined} onOpen={(type, id) => open(type, id)} onAll={() => open('view', 'articles')} />
                      </Branches>
                    </Unfold>
                  )}
                </div>
              )}
              </SortableRow>
            )}
            const tagsBlock = (<>
        {/* Your starred tags, with counts, the way Todoist keeps favourite labels; none until you star one. */}
        {/* The heading folds the list, as Favorites' does (Notion's way): anywhere on it, not only its chevron.
            The Tags page is the arrow at its end, on pointing, and G # or ⌘K. */}
        {(
          <div className="group/head relative mt-2.5 mb-0.5 flex min-h-6 items-center gap-1 px-2 py-0.5 text-meta">
            <button
              type="button"
              data-side-row
              data-side-section-handle="tags"
              data-tags-fold
              aria-label={!sideTags.length ? 'Open the Tags page' : tagsOpen ? 'Fold your starred tags away' : 'Show your starred tags'}
              // On a tag's page whose own row is folded away or not listed, the heading is the place marked.
              aria-current={light === 'tags' ? 'page' : undefined}
              aria-expanded={sideTags.length ? tagsOpen : undefined}
              // With no favourite yet there is nothing to fold: the heading is the way to every tag.
              onClick={() => !sideTags.length ? (chime('tap'), setView({ id: 'tags' })) : (chime(tagsOpen ? 'fold' : 'slide'), setTagsOpen(!tagsOpen))}
              className={`absolute inset-0 flex items-center gap-1 rounded-md px-2 text-left transition-colors duration-80 group-hover/head:text-foreground data-[fluid-hover-active]:text-foreground ${light === 'tags' ? 'text-foreground' : 'text-muted-foreground'}`}
            >
              Tags
              {sideTags.length > 0 && <ChevronRight className={`size-3 transition-transform duration-80 ${tagsOpen ? 'rotate-90' : ''}`} />}
            </button>
            <span aria-hidden className="invisible">Tags</span>
            <SidePeek id="tags" keys="G #">
              <button type="button" aria-label="Open the Tags page" data-tags-page onClick={() => setView({ id: 'tags' })}
                className="relative ml-auto flex size-5 items-center justify-center rounded text-muted-foreground opacity-0 transition-[color,background-color,opacity] duration-80 group-hover/head:opacity-100 hover:bg-accent hover:text-foreground focus-visible:opacity-100">
                <ArrowRight className="size-3" />
              </button>
            </SidePeek>
          </div>
        )}
        <Unfold open={tagsOpen && sideTags.length > 0}>
          {/* A tag's card comes beside the list, not over the tags under it. */}
          <div data-note-side>
          {/* Stepped in under the heading, the trunk where Writing's folders hang theirs. */}
          <Branches className={`flex flex-col ${narrow ? '' : 'ml-5'}`}>
          {/* Dragged into your own order, as the pages and pins above are; saved. */}
          <SortableList items={sideTags} keyOf={(one) => one.tag} onMove={narrow ? undefined : dropOrder('tagOrder', tags.map((one) => one.tag), (id) => `#${id}`)}>{(items) => items.map(({ tag, count, color }) => (
            <SortableRow key={tag} id={tag} glide={`side-tag-${tag}`}>
            <RowMenu items={() => [
              { label: 'Open', run: () => setView({ id: 'tags', focus: tag }) },
              { label: 'Rename or merge…', run: () => void renameTag(tag, (now) => view.id === 'tags' && view.focus === tag && setView({ id: 'tags', focus: now })) },
              sideTagLine(tag, settings?.sideTags, tags.map((one) => one.tag)),
              'separator',
              ...orderItems({ setting: 'tagOrder', usual: tags.map((one) => one.tag), id: tag, among: items.map((one) => one.tag), what: 'Your tags', name: `#${tag}` }, tagSaved.length > 0)
            ]}>
            <button
              key={tag}
              type="button"
              data-side-row
              data-side-tag={tag}
              {...hoverNote('tag', tag)}
              aria-current={light === `tag:${tag}` ? 'page' : undefined}
              onClick={() => setView({ id: 'tags', focus: tag })}
              // Read ahead while the pointer rests on it, so the click shows it at once.
              onPointerEnter={() => prefetchTag(tag)}
              className={`flex w-full items-center gap-2.5 rounded-md px-2 py-1 ${light === `tag:${tag}` ? '' : 'text-(--mf-muted-strong)'}`}
            >
              <TagColourPick tag={tag} color={color} />
              <Weighted on={light === `tag:${tag}`} className="flex-1 text-left">{tag}</Weighted>
              {countsOn && <Count n={count} className="text-xs text-muted-foreground" />}
            </button>
            </RowMenu>
            </SortableRow>
          ))}</SortableList>
          </Branches>
          </div>
        </Unfold>
            </>)
            // A group's name, small: a click folds it. Which pages it holds is set in "Customize sidebar…", not here.
            // A right click hides the whole group, heading and notes, as a page's row hides itself.
            const hideGroup = async (group: Place): Promise<void> => {
              const was = await showGroup(group.id, false)
              toast(showWords(group, true).said, () => void haligtree.setSettings({ sidebarGroupsOff: was }).then(() => chime('on')))
            }
            const heading = (group: Place, open: boolean, fold: (open: boolean) => void, near?: string): React.JSX.Element =>
              narrow ? <div key={group.id} className="mt-3" /> : (
                <RowMenu key={group.id} items={() => [
                  // Library is not one to switch off: its rows are, each, in Customize.
                  ...sectionMoves(group.id, sideOrder(settings?.sideSections)),
                  ...(group.id === LIBRARY.id ? [] : [{ label: showWords(group, true).label, run: () => void hideGroup(group) }]),
                  // Recent is the top of All history: the rest of it a line away.
                  ...(group.id === SIDE_GROUPS[1].id ? [{ label: 'Show all history', keys: '⌥⌘Y', run: () => setRecentState({ until: null, opened: true }) }] : []),
                  { label: 'Customize the sidebar…', hint: 'Choose and order the pages it shows', run: () => void setTimeout(() => setCustomizing(true), 120) }
                ]}>
                <div data-side-heading={group.id} className="group/head relative mt-2.5 mb-0.5 flex min-h-6 items-center">
                  {(() => {
                    const button = (
                  <button
                    type="button"
                    aria-expanded={open}
                    data-side-row
                    data-side-section-handle={group.id}
                    data-home-near={near}
                    onClick={() => (chime(open ? 'fold' : 'slide'), fold(!open))}
                    className={`flex min-h-6 flex-1 items-center gap-1 rounded-md py-0.5 pl-2 pr-2 text-left text-meta text-muted-foreground transition-colors duration-80 hover:text-foreground data-[fluid-hover-active]:text-foreground`}
                  >
                    {group.label}
                    <ChevronRight className={`size-3 transition-[rotate,opacity] duration-80 ${open ? 'rotate-90 opacity-0 group-hover/head:opacity-100' : ''}`} />
                  </button>
                    )
                    // Recent says what it is: not this tab's Back, but what you opened anywhere.
                    return group.id === SIDE_GROUPS[1].id ? <Tip label="Notes, books and pages you opened lately, in any tab">{button}</Tip> : button
                  })()}
                </div>
                </RowMenu>
              )
            // Pinned and Recent, each drawn only while switched on in "Customize sidebar…" or Settings.
            const [pinsGroup, recentGroup] = SIDE_GROUPS
            const groupsOff = settings?.sidebarGroupsOff ?? []
            const pinsDrawn = !groupsOff.includes(pinsGroup.id)
            const powersPin = settings?.powersPinned !== false
            const recentDrawn = !groupsOff.includes(recentGroup.id)
            // Not drawn, even unseen, until settings say which rows show: a row
            // the settings then take away held its room for a frame once the sidebar showed.
            const parts = settings && !unloaded(away) ? sidebarParts(sections, ordered, shown, settings.sidebarGroups) : []
            // Pinned, Recent, Library and Tags in your order (dragged by their headings, or moved from their menus):
            // each drawn as one block, its place set by CSS order, so nothing in it is drawn twice or moved apart.
            const sectionOrder = sideOrder(settings?.sideSections)
            const sectionAt = (id: string): React.CSSProperties => ({ order: 1 + sectionOrder.indexOf(id) })
            const pinned = (<>
              {/* Favorites, as Notion's: only there while something is, or while a note is carried to it. */}
              {pinsDrawn && pins.length === 0 && layouts.length === 0 && !narrow && (
                <div data-side-drop="pinned" data-side-section="pinned" style={sectionAt('pinned')} className="hidden rounded-md data-[queue-hot]:bg-[color-mix(in_oklab,var(--primary)_12%,transparent)] data-[queue-hot]:ring-1 data-[queue-hot]:ring-[color-mix(in_oklab,var(--primary)_40%,transparent)] [html[data-split-pin]_&]:block">
                  <div className="mt-3 mb-0.5 px-2 py-0.5 text-meta text-muted-foreground">Favorites</div>
                  <p className="px-2 pb-1.5 text-control text-muted-foreground">Drop here to add to Favorites</p>
                </div>
              )}
              {pinsDrawn && !quiet && (pins.length > 0 || layouts.length > 0 || powersPin) && (<div data-side-drop="pinned" data-side-section="pinned" style={sectionAt('pinned')} className="rounded-md data-[queue-hot]:bg-[color-mix(in_oklab,var(--primary)_12%,transparent)] data-[queue-hot]:ring-1 data-[queue-hot]:ring-[color-mix(in_oklab,var(--primary)_40%,transparent)]">
                {heading(pinsGroup, pinsOpen, setPinsOpen)}
                <Unfold open={pinsOpen || narrow}><Branches bare={narrow} className={`flex flex-col gap-px ${narrow ? '' : 'ml-5'}`}>{[
                  // "What Haligtree can do", in Favorites for a newcomer until they take it out (Settings' powersPinned).
                  ...(powersPin ? [(
                    <RowMenu key="powers-pin" items={[
                      { label: 'Open', run: () => (chime('page'), setView({ id: 'powers' })) },
                      'separator',
                      { label: 'Remove from Favorites', hint: 'It stays in the sidebar\'s foot', run: () => sayNow(haligtree.setSettings({ powersPinned: false }), `Removed ${quoted(`What ${APP_NAME} can do`, 80)} from Favorites`, () => void haligtree.setSettings({ powersPinned: true })) }
                    ]}>
                      <span className="flex min-w-0">
                        <Tip label={narrow ? `What ${APP_NAME} can do` : ''}>
                          <button type="button" data-side-row data-powers-pin aria-current={light === 'place:powers' ? 'page' : undefined} onClick={() => (chime('page'), setView({ id: 'powers' }))}
                            className={`flex min-w-0 items-center gap-2.5 ${light === 'place:powers' ? 'text-foreground' : 'text-(--mf-muted-strong)'} ${narrow ? NARROW_ICON : 'flex-1 rounded-md px-2 py-1.5'}`}>
                            <Compass className="size-4 shrink-0" style={{ color: 'var(--tt-color-text-green)' }} />
                            {!narrow && <Weighted on={light === 'place:powers'} className="min-w-0 flex-1 truncate text-left">What {APP_NAME} can do</Weighted>}
                          </button>
                        </Tip>
                      </span>
                    </RowMenu>
                  )] : []),
                  ...layouts.map((one) => (
                    <PinnedSplit key={one.id} narrow={narrow} names={one.views.map(paneName)} onOpen={(index) => openLayout(one.views, one.sizes, index)}
                      onUnpin={() => dropLayout(one.id, `Removed the split of ${one.views.map((view) => `${quoted(short(shownName(paneName(view).title)), 80)}`).join(' and ')} from Favorites`)} />
                  )),
                  // Pins drag into your own order too; carried off the sidebar, one still opens to the side.
                  <SortableList key="pins" items={pins} keyOf={(pin) => `${pin.type}:${pin.id}`} onMove={narrow ? undefined : dropOrder('pinOrder', pinsUsual.map((pin) => `${pin.type}:${pin.id}`), (id) => pinsUsual.find((pin) => `${pin.type}:${pin.id}` === id)?.title || 'New note')}>{(items) => items.map((pin) => {
                  const kind = CAPTURE_TYPES.find((type) => type.id === pin.kind) ?? CAPTURE_TYPES[0]
                  // Made as the menu opens (RowMenu), not with every row each time the window draws.
                  const menu = (): RowItem[] => {
                    const lines = fullMenu(pin.type, pin.id, () => open(pin.type, pin.id)) ?? sideMenu(pin.type, pin.id, pin.title, { onOpen: open, pinned: true, kind: pin.kind, status: captures.find((one) => one.id === pin.id)?.status })
                    lines.splice(lines.lastIndexOf('separator'), 0, 'separator', ...orderItems({ setting: 'pinOrder', usual: pinsUsual.map((one) => `${one.type}:${one.id}`), id: `${pin.type}:${pin.id}`, among: items.map((one) => `${one.type}:${one.id}`), what: 'Favorites', name: pin.title || 'New note' }, pinSaved.length > 0))
                    return lines
                  }
                  return (
                    <SortableRow key={pin.id} id={`${pin.type}:${pin.id}`} glide={`pin-${pin.id}`}>
                    <RowMenu items={menu}>
                      <span className="flex min-w-0">
                      <Tip label={narrow ? pin.title || 'New note' : ''}>
                      <button
                        type="button"
                        data-private={pin.private ? '' : undefined}
                        // Cut to one line with an ellipsis, the whole title shows on pointing (the app's own tip, title-tips.tsx, only when cut).
                        title={narrow || pin.private ? undefined : taskName(pin.title).text || undefined}
                        data-side-row
                        data-drag-open={`${pin.type}:${pin.id}`}
                        // The one open now says so, in full ink, as the page you are on does above.
                        data-open={light === `pin:${pin.id}` || undefined}
                        aria-current={light === `pin:${pin.id}` ? 'page' : undefined}
                        onClick={() => (open(pin.type, pin.id), (openedFrom.current = { id: pin.id, where: 'pin' }))}
                        // ⌫ takes it out of Favorites, as the menu's line does.
                        onKeyDown={(event) => onRemoveKey(event, menu(), 'Remove from Favorites')}
                        className={`flex min-w-0 items-start gap-2.5 ${light === `pin:${pin.id}` ? 'text-foreground' : 'text-(--mf-muted-strong)'} ${narrow ? `${NARROW_ICON} items-center` : 'flex-1 rounded-md px-2 py-1.5'}`}
                      >
                        <span className="flex h-[1lh] shrink-0 items-center"><kind.icon className="size-4 shrink-0" style={{ color: kind.tint }} /></span>
                        {!narrow && <Weighted on={light === `pin:${pin.id}`} className="private-text min-w-0 flex-1 text-left truncate">{taskName(pin.title).text || 'New note'}</Weighted>}
                      </button>
                      </Tip>
                      </span>
                    </RowMenu>
                    </SortableRow>
                  )
                })}</SortableList>]}</Branches></Unfold>
              </div>)}
              {(() => {
                // Not one already pinned above it, four at most. The note open now is first if it is new here, and
                // stays where it is if not: a row pressed never jumps out from under the pointer.
                const open1 = inRecent && noteNow ? { id: noteNow.id, type: noteNow.type, title: noteNow.name.title, kind: known.get(noteNow.id)?.capture?.kind ?? known.get(noteNow.id)?.item?.kind ?? null, private: noteNow.name.private ? 1 : 0 } : null
                const fresh = recents.filter((one) => !pins.some((pin) => pin.id === one.id))
                // Held in their places, each by its newest name: a web page read for the first time is named by its
                // site until its article is kept, then by its title ("Roman Empire", not "en.wikipedia.org"). One no
                // longer in the book (a page a link made, dropped for being left empty) goes: its row would open nothing.
                const held = recentShown.current.flatMap((one) => recents.find((each) => each.id === one.id) ?? (one.id === view.focus ? [one] : []))
                const rows = (view.focus && held.some((one) => one.id === view.focus) ? held : [...(open1 && !pins.some((pin) => pin.id === open1.id) ? [open1] : []), ...fresh.filter((one) => one.id !== open1?.id)].slice(0, 4))
                recentShown.current = rows
                if (!recentDrawn || quiet || narrow || !rows.length) return null
                return (
                  <div data-side-recent data-side-section="recent" style={sectionAt('recent')}>
                    {heading(recentGroup, recentOpen, setRecentOpen)}
                    <Unfold open={recentOpen}><Branches className="ml-5 flex flex-col gap-px">{rows.map((one) => {
                      return (
                        <button key={one.id} type="button" data-side-row data-private={one.private ? '' : undefined} title={one.private ? undefined : one.title || undefined} data-side-recent-row={one.id} aria-current={light === `recent:${one.id}` ? 'page' : undefined}
                          onClick={() => (open(one.type, one.id), (openedFrom.current = { id: one.id, where: 'recent' }))}
                          // Past, so quieter than the places above: the muted ink (never see-through), the row's full ink when pointed at or open.
                          className="group/recent flex min-w-0 flex-1 items-start gap-2.5 rounded-md px-2 py-1.5 text-[color-mix(in_oklab,var(--muted-foreground)_70%,var(--background))] transition-colors duration-80 hover:text-foreground aria-[current=page]:text-foreground">
                          <span className="flex h-[1lh] shrink-0 items-center"><OpenedIcon one={one} className="size-4 shrink-0 opacity-60 group-hover/recent:opacity-100" /></span>
                          <span className="private-text min-w-0 flex-1 truncate text-left">{one.title || 'New note'}</span>
                        </button>
                      )
                    })}</Branches></Unfold>
                  </div>
                )
              })()}
              {/* Back after a while: said plainly, with the way to everything else one click away. */}
              {quiet && !narrow && (
                // A note from the app, set apart as one (its own quiet panel, the sidebar's own text size), never loose
                // words under the rows at a size of their own (the user, 21 Nov: "looking like it was just dumped here").
                <div data-quiet-return className="mx-1 mt-4 flex flex-col gap-2 rounded-lg bg-[color-mix(in_oklab,var(--foreground)_5%,transparent)] px-3 py-2.5 text-control leading-snug">
                  <p className="text-(--mf-muted-strong)"><b className="font-medium text-foreground">Welcome back.</b> {away.days} days away, so just the Inbox, Journal and Tasks for now.</p>
                  <Button variant="secondary" size="sm" className="self-start" onClick={() => void call('return:show-all').then(() => chime('unshelve'))}>Show everything</Button>
                </div>
              )}
            </>)
            // Your most used tags, under their own row: shown with the Tags page on, between Pinned and the Bin.
            const tagRows = !narrow && !quiet && shown.includes('tags')
            // Tags drawn as their own part, which takes no page dropped on it, as Pinned does not.
            const tagsPart = <div data-side-drop="tags" data-side-section="tags" style={sectionAt('tags')} className="flex flex-col gap-px">{tagsBlock}</div>
            // Folders, where things live, right under the places (what they are): starred ones, as Tags shows favourites.
            const foldersPart = !narrow && !quiet && <FoldersSection style={sectionAt('folders')} counted={countsOn} noteIn={keptFolder} noteKey={keptFolder ? noteNow?.id : undefined} noteRow={keptFolder && light.startsWith('kept:') ? noteRow : undefined} here={view.id === 'folders' ? (!view.folder || view.folder === 'all' ? null : view.folder) : undefined} onOpen={(place) => setView({ id: 'folders', folder: place ?? 'all' })} onOpenItem={(type, id, folder) => open(type, id, undefined, folder)} lit={light.startsWith('kept:') ? noteNow?.id : undefined} />
            // Every page row drags as one list, into any block: the line shows where it lands.
            return (<>
              <BlockList
                // Tags' own page is opened from the Tags heading over your tags, so it is not listed twice.
                blocks={parts.map((part) => ({ key: part.key, items: tagRows ? part.list.filter((section) => section.id !== 'tags') : part.list }))}
                keyOf={(section) => section.id}
                onMove={narrow ? undefined : (id, drop) => void dropInBlock(id, drop.block, drop.before, shown)}
                refuse={{ selector: 'aside nav [data-side-drop]', said: 'A page can’t go in Favorites or Tags' }}
                row={(section, among) => row(section, among)}
                around={(block, at, box, items) => (<>
                  {block === 'rest' && foldersPart}
                  {block === 'rest' && tagRows && tagsPart}
                  {/* Each run after the first gets a gap the height of a heading, with no heading: what you write, then what you do, then the rest. */}
                  {/* Library, what you keep (Gems, Sources, Files), under a heading of its own that folds as Pinned's does. */}
                  {block === 'Library' && items.length > 0 ? (() => {
                    const [head, id] = [LIBRARY, 'library'] as const
                    // The page you are on is in sight: its fold opens when you go there from elsewhere.
                    // A note lit under its folder, or a folder's page, is in sight under its list's row (Gems is in Library).
                    const lit = (one: { id: string }): boolean => light === `place:${one.id}` || (light.startsWith('note:') && one.id === (noteList === 'article' ? 'articles' : 'nuggets')) || (light.startsWith('folder:') && one.id === view.id)
                    const here = items.some(lit)
                    // Library folds under its heading, folded to start; it stays as you leave it,
                    // and keeps that itself (Folding), so a fold draws the group alone.
                    return (<div data-side-section={id} style={sectionAt(id)} className="flex flex-col">
                      <Folding kept="sidebar:library" held={narrow} here={here} head={(open, fold) => heading(head, open, fold)}>
                        {/* Hung off a trunk under its heading, as Pinned's and Recent's are: they are its children. */}
                        <Branches bare={narrow} rows=":scope > [data-drop-list] > *" className={narrow ? '' : 'ml-5'}>{box}</Branches>
                      </Folding>
                    </div>)
                  })() : (<div className="flex flex-col" style={block === 'rest' ? { order: 9 } : undefined}>
                    {at > 0 && items.length > 0 && <div data-side-gap aria-hidden className={narrow ? 'mt-3' : 'mt-2.5 mb-0.5 min-h-1'} />}
                    {box}
                  </div>)}
                  {/* Pinned, and the split open now, sit under the places. */}
                  {block === 'Write' && pinned}
                </>)}
              />
              {!parts.some((part) => part.key === 'rest') && foldersPart}
              {!parts.some((part) => part.key === 'rest') && tagRows && tagsPart}
            </>)
          })()}
        </nav>
        {/* Where a section carried by its heading would land: the room the others open, the one line through it (carry.tsx). */}
        {sectionDrag.carrying && sectionDrag.room && <RoomAt at={sectionDrag.room} how={`section:${sectionDrag.carrying}`} />}
        {/* The section carried, as a lifted card under the pointer, named as its heading is, saying what letting go would do. */}
        {sectionDrag.carrying && sectionDrag.at && (
          <CardAt x={sectionDrag.at.x} y={sectionDrag.at.y}>
            <CarriedCard attrs={{ 'data-section-card': '' }} strong words={sectionDrag.words} title={({ folders: 'Folders', pinned: 'Favorites', recent: 'Recent', library: 'Library', tags: 'Tags' } as Record<string, string>)[sectionDrag.carrying] ?? ''} />
          </CardAt>
        )}

        </TooltipProvider>

        </div>
        {/* Where a corner card lands (a milestone), Arc's way: at the sidebar's foot, the list above it giving up the
            room and scrolling, so it never covers a page or a menu (celebrate.tsx). Empty, it takes no room. Its own
            band, under the same hairline as the foot row, so the list's faded last row reads as the list's edge, never as tucked behind the card. */}
        {!narrow && <div data-corner-dock className="mx-2 mb-2 shrink-0 border-t pt-2 empty:hidden" />}
        {/* One row at the foot, the way Notion keeps its workspace menu: Settings,
            Safe mode, Blurring, the keys and the tour wait behind Haligtree's name.
            Safe mode on still shows, since a quiet box should say why. */}
        <div className={`mx-2 mb-2 flex shrink-0 items-center gap-1 border-t pt-2 ${narrow ? 'flex-col' : ''}`}>
          {/* A book's own menu (its colour, its name, its place in Settings), opened where it was right-clicked: on
              its row in the menu below, which shuts as this opens, or on the book's name here. Held by a point of
              its own, so the menu below can go without taking it along. */}
          <RowMenu onOpenChange={(open) => {
            if (open || !spineHeld.current) return
            // Shut: back to the book menu, on the spine it was opened from. Let go of a beat later, so the click away
            // that shut it is not taken by the book menu as a click away from it too.
            const id = spineMenu
            setTimeout(() => {
              spineHeld.current = false
              setSpineMenu(null)
              if (id) document.querySelector<HTMLElement>(`[data-book-shelf] [data-book="${CSS.escape(id)}"]`)?.focus({ preventScroll: true })
            }, 0)
          }} items={() => {
            // Read afresh from the shelf on each draw: a colour picked with the menu open moves its tick.
            const book = shelfNow?.books.find((one) => one.id === (bookMenuFor.current ?? openBook)?.id) ?? bookMenuFor.current ?? openBook
            const inSettings = (what: 'book' | 'book-rename' | 'book-delete') => () => setView({ id: 'settings', focus: `${what}:${book!.id}`, nonce: Date.now() })
            return book ? bookMenu(book, { rename: inSettings('book-rename'), show: inSettings('book'), remove: inSettings('book-delete') }) : []
          }}>
            <span ref={bookMenuAt} aria-hidden data-book-menu-at className="pointer-events-none fixed top-0 left-0 size-0" />
          </RowMenu>
          <DropdownMenu modal={false} open={footMenu} onOpenChange={(open) => (open && setFootCut(false), !open && setNamingBook(false), setFootMenu(open))}>
            <DropdownMenuTrigger asChild>
              <button type="button" aria-label={`${APP_NAME} menu`} onContextMenu={(event) => openBookMenu(event, openBook)}
                className={`flex min-w-0 items-center gap-2 text-(--mf-muted-strong) transition-colors hover:bg-accent/60 data-[state=open]:bg-accent/60 ${narrow ? NARROW_ICON : 'flex-1 rounded-md px-2 py-1.5'}`}>
                <AliveIcon icon={GearIcon} size={16} />
                {!narrow && <span data-sidebar-book-name className="flex-1 truncate text-left">{SANDBOX ? 'Sandbox' : <BookName />}</span>}
                {!narrow && <AliveIcon icon={DownChevron} size={14} className="text-muted-foreground" />}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="top" align="start" className={`w-60 ${footCut ? 'data-[state=closed]:hidden' : ''} ${namingBook ? NAMING_MENU : ''}`}
              // While a new book is named in its row, the rows under the pointer never take the focus from the name (so
              // they are not pointed at), and Esc leaves the name, not the menu.
              onEscapeKeyDown={(event) => namingBook && event.preventDefault()}
              // A spine's own menu up over it: a press or the focus in it, or a click away from both, leaves this one open.
              onInteractOutside={(event) => spineHeld.current && event.preventDefault()}
              // A row runs only for a press that began on it. A menu's own way, a press held and let go over another row
              // choosing that row, made a book pressed long and moved away open "New book…" (the user, 22 Nov: "Nothing is
              // clear about how and why"): a press on a book now carries it along the shelf, and letting go anywhere else does nothing.
              onPointerDownCapture={(event) => void (footPressed.current = event.target instanceof Element ? event.target.closest('[role^="menuitem"]') : null)}
              // Only a row let go on that is not the row pressed is held back: a plain click on any row, a book included, runs it.
              onPointerUpCapture={(event) => {
                const on = event.target instanceof Element ? event.target.closest('[role^="menuitem"]') : null
                if (on && on !== footPressed.current) event.preventDefault()
                footPressed.current = null
              }}
              // Shut by a right-click on one of its books: the keys go to that book's menu, not back to the button.
              onCloseAutoFocus={(event) => { if (footGave.current) (footGave.current = false, event.preventDefault()) }}>
              {/* Each row's card beside the menu: what it does, before you choose it. A book's says its whole name, however long. */}
              <MenuPeek />
              {/* Your books first, on a shelf: the open one turned to its face, the one pointed at pulled out (books.tsx). */}
              {!!shelfNow?.books.length && <BookShelf books={shelfNow.books} menuFor={spineMenu} onMenu={(event, book) => openBookMenu(event, book, event.currentTarget)}
                onPick={(book) => (book.current ? setView({ id: 'settings', focus: `book:${book.id}`, nonce: Date.now() }) : void switchBook(book.id))} />}
              {/* New book…: the row itself becomes the new book's name, typed in place as Finder names a folder (books.tsx NewBookRow). */}
              {!SANDBOX && (namingBook ? <NewBookRow onDone={() => setNamingBook(false)} /> : (
                <DropdownMenuItem data-peek="new-book" data-book-new-row onSelect={(event) => (event.preventDefault(), chime('open'), setNamingBook(true))}>New book…</DropdownMenuItem>
              ))}
              {/* The open book's colour, where a person looks for it first: under the books, the nine in the menu itself
                  under a small heading, as its right-click menu has them (row-menu.tsx lines). A submenu holding one row of
                  swatches was a second step for nothing (the user, 21 Nov: "why did color have to be a submenu"). */}
              {!SANDBOX && openBook && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel data-book-colour>{colourHeading(openBook)}</DropdownMenuLabel>
                  <div role="group" aria-label="Its colour" className="flex items-center gap-1 px-1.5 py-1">
                    {colourSwatches(openBook).map((one) => (
                      <DropdownMenuItem key={one.label} aria-label={one.label} aria-checked={one.on} role="menuitemradio" onSelect={(event) => (event.preventDefault(), one.run())}
                        className="flex size-6 min-h-0 items-center justify-center rounded-md p-0 focus:bg-accent">
                        <Swatch color={one.color} on={one.on} />
                      </DropdownMenuItem>
                    ))}
                  </div>
                  {/* Its name beside its colour: the open book's own two, worded as its right-click menu words them. */}
                  <DropdownMenuItem data-book-rename onSelect={() => setView({ id: 'settings', focus: `book-rename:${openBook.id}`, nonce: Date.now() })}>Rename…</DropdownMenuItem>
                </>
              )}
              <DropdownMenuSeparator />
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
              {/* The sandbox is someone else's book, never one of yours: its own line, not a row among your books. */}
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
            <Tip label="Safe mode is on: no hints, old captures or favorites come up  ⌥⌘S">
              <button type="button" aria-label="Turn safe mode off" onClick={safeMode}
                className="flex size-7 items-center justify-center rounded-md text-[color-mix(in_srgb,var(--tt-brand-color-400)_55%,var(--foreground))] transition-colors hover:bg-accent/60">
                <AliveIcon icon={ShieldCheck} size={16} />
              </button>
            </Tip>
          )}
          {/* Bin, Archived and the powers: places gone to now and then, small icons beside the book's menu, lit while open. */}
          {!narrow && FOOT.map((id) => {
            const place = PLACES.find((one) => one.id === id)
            if (!place) return null
            const on = light === `place:${id}`
            return (
              <Tip key={id} label={place.key ? `${place.label}  G ${place.key.toUpperCase()}` : place.label}>
                <button type="button" data-side-foot={id} data-home={id === 'discarded' ? 'bin' : undefined} aria-label={place.label} aria-current={on ? 'page' : undefined} onClick={() => (chime('page'), setView({ id }))}
                  className={`flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-md transition-[color,background-color,scale] duration-100 hover:bg-accent/60 hover:text-foreground active:scale-[0.94] ${on ? 'bg-accent text-foreground' : 'text-muted-foreground'}`}>
                  <PlaceIcon place={place} />
                </button>
              </Tip>
            )
          })}
          {/* Keyboard shortcuts: in the book's menu and on ?, so the foot keeps its room for the book's name. */}
        </div>
      </aside>
      </PopoverAnchor>
      <PopoverContent side={right ? 'left' : 'right'} align="start" sideOffset={8} alignOffset={52}
        // Focus goes to the panel, not its ×: on the × it opened the ×'s tip, and the first Esc closed only that.
        onOpenAutoFocus={(event) => (event.preventDefault(), (event.currentTarget as HTMLElement).focus())}
        // Its own row toggles it: a click there is not a click away.
        onInteractOutside={(event) => (event.target as Element | null)?.closest?.('[data-customize]') && event.preventDefault()}
        // The panel holds still with its heading; its long list scrolls inside, fading at whichever edge has more (the
        // lists' one fade, .mf-more): on the panel itself, the panel's own opening animation took the fade's place.
        className="flex max-h-[calc(var(--radix-popover-content-available-height)-60px)] w-72 flex-col gap-1 overflow-hidden p-1.5">
        {/* A way out in sight: Esc and a click away close it too, but nothing said so. */}
        <div className="flex items-center justify-between gap-2 pl-2">
          <span className="text-control font-medium text-foreground">Customize sidebar</span>
          <Tip label="Close (Esc)"><Button variant="ghost" size="icon-sm" data-customize-close aria-label="Close" onClick={() => (chime('away'), setCustomizing(false))}><AliveIcon icon={XIcon} size={16} /></Button></Tip>
        </div>
        <div data-customize-list="" className="mf-more -mx-1.5 min-h-0 overflow-y-auto px-1.5">
        <p className="px-2 pt-0.5 pb-1.5 text-meta text-muted-foreground">Shown in the sidebar, in its order: drag one up or down to move it. One switched off leaves the sidebar; G with its letter, or ⌘K, still opens it.</p>
        <ShowList places={SECTIONS} setting="sidebarShown" counts={countsIn ? counts : undefined} />
        </div>
      </PopoverContent>
      </Popover>
      </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
      {/* The page itself, a card like the sidebar's; the main landmark, for VoiceOver to jump to. */}
      <div role="main" className="relative flex min-h-0 flex-1 gap-2">
      <SplitDrop onDrop={dropAside} onRow={dropOnRow} />
      <SplitPanes
        // One row at the window's top, as Dia's: the window's own controls ride the tab rows (panes.tsx), the sidebar's
        // button before the first pane's tabs, clear of the traffic lights whatever sits to the left of it; sound and
        // New after the last pane's "+ ⌄", New at the very right. Nothing here moves as tabs come and go.
        lead={<span data-on-frame className={`flex shrink-0 items-center gap-1 self-center ${!sidebar || right ? 'pl-[76px] [:root[data-fullscreen]_&]:pl-1' : 'pl-1'}`}>
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
        {/* In the sandbox, always: where you are, and the two ways out. */}
        <SandboxPill />
        {/* Cut short past half the bar, or sooner in a narrow window, so the buttons either side keep their size. */}
        {(() => {
          // The same name Back, Forward and the split give the page: a source's page and What's new were blank here.
          const named = labelOf(view)
          // The page's name rolls to the next one, the way the page itself travels; by a key it is simply there.
          const way = pageTravel('title', view.id, ordered.map((section) => section.id)) || 1
          // The open tab says what is on show, over its own pane, and in a split one name up here could not say which: VoiceOver's alone.
          const title = <h1 data-pane-title className="sr-only" style={{ textWrap: 'nowrap' } as CSSProperties}>
            <motion.span key={named} className="-my-1 block truncate py-1" initial={byKeys() ? false : { opacity: 0, transform: shift(`translateY(${way * 5}px)`) }} animate={{ opacity: 1, transform: shift('translateY(0px)') }} transition={{ duration: 0.18, ease: EASE }}><Term>{named}</Term></motion.span>
          </h1>
          return title
        })()}
        </span>}
        // The open note's name, faint, once its first line has scrolled away: in the room the tabs leave, never here
        // before Back and Forward, where its words pushed the arrows and every tab ~200px right as a page scrolled.
        title={<TopTitle on={settings?.topTitle !== false} />}
        tail={<span data-on-frame className="mr-1 flex shrink-0 items-center self-center">
        {/* The window's own setting, quiet: what you hear. How much screen it takes is the green button's (and ⌃⇧F's),
            so the room here goes to the note's own "Read" (note-extras.tsx). */}
        <span className="flex shrink-0 items-center">
          <SoundToggle className={TOOL} />
        </span>
        {/* The one thing the window is for, so the one with an edge: the same pill as back and forward, its key beside it. */}
        <Tip label={keyed(inFolderRef.current ? 'A new note in this folder' : newPage ? 'A blank page' : 'New capture, in quick capture', '⌘N')}>
          <button type="button" data-new={inFolderRef.current ? 'folder' : newPage ? 'page' : 'capture'} onClick={makeNew}
            style={{ WebkitAppRegion: 'no-drag' } as CSSProperties}
            className={`flex h-6 items-center overflow-hidden rounded-full border ml-1.5 shrink-0 gap-1.5 pr-1 pl-2.5 text-[0.8125rem] font-medium text-foreground/90 transition-colors hover:bg-accent/60 hover:text-foreground`}>
            <AliveIcon icon={PenIcon} size={14} />
            New
            {!newPage && !inFolderRef.current && <Pressed keys="C" className="ml-1 h-4 min-w-4 rounded-[4px]" />}
          </button>
        </Tip>
        </span>}
        apis={apis}
        front={split.front}
        sizes={split.sizes}
        onSizes={(sizes) => setSplit((now) => ({ ...now, sizes }))}
        onFront={toFront}
        onWidth={paneWidth}
        actions={tabActions}
        panes={split.panes.map((pane) => {
          const tab = activeTab(pane)
          return {
            key: pane.key,
            width: pane.width,
            active: tab.key,
            at: `${tab.key}:${tab.trail.at}`,
            scroll: tabStep(tab).scroll,
            tabs: pane.tabs.map((one) => {
              const name = paneName(tabStep(one))
              const note = noteIn(tabStep(one))
              return { key: one.key, pinned: one.pinned, label: name.title, private: name.private, icon: name.icon, tint: name.tint, open: note && note.type !== 'task' ? `${note.type}:${note.id}` : undefined }
            }),
            node: pageFor(pane.key, tab.key, tabStep(tab))
          }
        })}
      />
      <SwipeBack front={() => frontRef.current} nameOf={swipeName} go={(key, to) => { const pane = splitRef.current.panes.find((one) => one.key === key); step(to - (pane ? activeTab(pane).trail.at : to), key); toFront(key) }}
        trailOf={(key) => { const pane = splitRef.current.panes.find((one) => one.key === key); return pane ? activeTab(pane).trail : null }} />
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
            {recent.opened
              ? <HistoryPanel className="flex-1" fresh={view.focus} onClose={() => setRecentState(null)} onOpen={(type, id) => open(type, id)} />
              : <RecentPanel className="flex-1" until={recent.until ?? undefined} onClose={() => setRecentState(null)}
                // Beside a week's page, a note opens in its own window so the page stays.
                onOpen={(type, id) => (view.id === 'weekpage' && type !== 'task' ? openApart(type, id) : open(type, id))} />}
          </motion.div>
        )}
      </AnimatePresence>
      </div>
      {/* The first time a page is reached, one line on what it is for: under the page, so the tabs over it never move for it. */}
      <PageHint page={view.id} />
      </div>
      </div>
    </div>
    </TooltipProvider>
  )
}
