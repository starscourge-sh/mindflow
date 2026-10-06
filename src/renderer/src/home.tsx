import { themeActions } from '@/lib/theme'
import { Fragment, useEffect, useRef, useState, useSyncExternalStore, type CSSProperties } from 'react'
import { Minimize2, ArrowLeft, ArrowRight, ChevronDown, ChevronRight, CircleHelp, PanelLeft, Search as SearchIcon, Shield, SquarePen, Tag } from 'lucide-react'
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuShortcut, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { AnimatePresence, motion } from 'motion/react'
import { chime, soundOn } from './lib/sound'
import { NotePreview } from './components/vigil/note-preview'

import { CAPTURE_TYPES } from './components/capture-kinds/capture-kind-picker'
import { useCaptures, type CaptureMeta } from './components/capture-list'
import { Search } from './components/search'
import { CapturesView } from './components/vigil/captures-view'
import { ItemsView } from './components/vigil/items-view'
import { QuestionsView, startQuestion } from './components/vigil/questions-view'
import { ReviewView } from './components/vigil/review-view'
import { SettingsView } from './components/vigil/settings-view'
import { StatsView } from './components/vigil/stats-view'
import { TagsView } from './components/vigil/tags-view'
import { TasksView } from './components/vigil/tasks-view'
import { WeekView } from './components/vigil/week-view'
import { placed } from './lib/tasks'
import { Kbd, Rolling, Toaster, toast, typing, FocusNote, useFocusMode, SoundToggle } from './components/vigil/ui'
import { FocusScenery } from './components/vigil/scenery'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './components/ui/tooltip'
import { useAppearance, useLive, vigil, type Item, type Pin, type Settings, type Task } from './lib/vigil'
import { Tip, showTopTitle, useTopTitle } from '@/components/vigil/ui'
import MagnifierIcon from '@/components/ui/magnifier-icon'
import ExpandIcon from '@/components/ui/expand-icon'
import GearIcon from '@/components/ui/gear-icon'
import DotsHorizontalIcon from '@/components/ui/dots-horizontal-icon'
import { AliveIcon } from '@/components/vigil/alive-icon'
import { ShortcutSheet } from '@/components/vigil/shortcut-sheet'
import { Tour } from '@/components/vigil/tour'
import { DayView } from '@/components/vigil/day-view'
import { MonthPage, SCALE_VIEW, WeekPage, YearPage, type Scale } from '@/components/vigil/periods-view'
import { RecentPanel } from '@/components/vigil/recent-panel'
import { Passes, openPass } from '@/components/vigil/pass'
import { noteActions } from '@/lib/notes'
import { headingIn } from '@/lib/capture-links'
import { openWindow } from '@/lib/notes'
import { PlaceIcon, SECTIONS, ShowList, useShown } from '@/components/vigil/places'
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover'
import { RowMenu } from '@/components/vigil/row-menu'
import SlidersHorizontalIcon from '@/components/ui/sliders-horizontal-icon'

// A nonce makes asking again a fresh visit: the recap reopens each time.
type View = { id: string; focus?: string; nonce?: number }

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
const TOOL = 'flex h-7 min-w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground [&_svg]:size-4'
const keyed = (label: string, keys: string): React.JSX.Element => <span className="flex items-center gap-1.5">{label} <Kbd>{keys}</Kbd></span>

/** Whether the window is under 760px wide, followed as it is resized. */
const NARROW = '(max-width: 759px)'
const followNarrow = (change: () => void): (() => void) => {
  const query = matchMedia(NARROW)
  query.addEventListener('change', change)
  return () => query.removeEventListener('change', change)
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

/**
 * The main window: the sections down the left, the one picked filling the
 * rest. Built the way Linear and Todoist are, because the plan spends its
 * novelty on the tiers and the resurfacing, and nothing on the chrome: a
 * sidebar with counts, G and a letter to jump, C to capture, ⌘K to search.
 */
export function Home(): React.JSX.Element {
  // Where you have been, for back and forward: a list and a place in it.
  const [trail, setTrail] = useState<{ views: View[]; at: number }>({ views: [{ id: 'inbox' }], at: 0 })
  const view = trail.views[trail.at]
  const setView = (next: View): void =>
    setTrail((trail) => {
      const here = trail.views[trail.at]
      // Going where you already are is not a step: Back would have to undo it.
      if (here.id === next.id && here.focus === next.focus && here.nonce === next.nonce) return trail
      if (here.id !== next.id) chime('tap')
      return { views: [...trail.views.slice(0, trail.at + 1), next], at: trail.at + 1 }
    })
  const step = (by: -1 | 1): void =>
    setTrail(({ views, at }) => {
      const next = Math.max(0, Math.min(views.length - 1, at + by))
      // Back and forward sound like any other move between sections.
      if (next !== at) chime('tap')
      return { views, at: next }
    })
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
  const [searching, setSearching] = useState(false)
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
  // A calm sidebar: what serves capturing and coming back; the rest under More.
  const shown = useShown('sidebarShown')
  const pins = useLive(vigil.pins, [] as Pin[])
  const tags = useLive(vigil.tags, [] as Awaited<ReturnType<typeof vigil.tags>>)
  const captures = useCaptures()
  const due = useLive(vigil.dueCount, 0, [], ['item'])
  const tasks = useLive(vigil.tasks, [] as Task[])
  const nuggets = useLive(() => vigil.items('nugget'), [] as Item[], [], ['item'])
  const articles = useLive(() => vigil.items('article'), [] as Item[], [], ['item'])
  const questions = useLive(() => vigil.items('question'), [] as Item[], [], ['item'])
  const settings = useLive(vigil.settings, null as Settings | null)
  const topTitle = useTopTitle()
  // A new section has no note scrolled: the last one's name does not follow you there.
  useEffect(() => showTopTitle(null), [view.id])

  // No Inbox count: the inbox is a place to set things down, never a queue to clear.
  // Archived ones are out of sight in their lists, so out of the counts too.
  const counts: Record<string, number> = {
    review: due,
    today: tasks.filter((task) => task.status === 'open' && !task.waitingOn && (placed(task) ?? Infinity) < today()).length,
    nuggets: nuggets.filter((one) => !one.archivedAt).length,
    articles: articles.filter((one) => !one.archivedAt).length,
    // Held, not owed: counted in the same quiet grey, never as behind.
    questions: questions.filter((one) => !one.archivedAt && !one.closedAt).length
  }

  const safeMode = (): void => {
    const on = !settings?.safeMode
    chime(on ? 'on' : 'off')
    void vigil.setSettings({ safeMode: on }).then(() => toast(on ? 'Safe mode: no hints, rot cards or pins come up' : 'Safe mode off'))
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
      // the page (Read, a question) keeps them.
      if (document.querySelector('[role="dialog"]')) return
      if (event.metaKey && event.key === 'k') {
        event.preventDefault()
        return setSearching(true)
      }
      // ⇧⌘Y: Recent beside the page, or away again.
      if (event.metaKey && event.shiftKey && event.key.toLowerCase() === 'y') {
        event.preventDefault()
        return toggleRecent()
      }
      if (event.metaKey && event.key === '[') return step(-1)
      if (event.metaKey && event.key === ']') return step(1)
      if (event.metaKey && event.key === '\\') {
        chime(sidebar ? 'fold' : 'slide')
        return setSidebar((open) => !open)
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
  const open = (type: string, id: string): void =>
    setView(type === 'day' ? { id: 'day', focus: id } : { id: type === 'capture' ? 'all' : type === 'task' ? 'upcoming' : `${type}s`, focus: id })
  const toScale = (scale: Scale): void => (chime('season'), setView({ id: SCALE_VIEW[scale] }))
  // A view is sent by name (⌘, sends Settings), anything else as one thing to open.
  // A heading link from a note window lands on its heading once the note is open.
  useEffect(() => window.api.onSentTo((type, id, heading) => {
    // The passes lay themselves over whatever is open, rather than being a place.
    if (type === 'view' && (id === 'tidy' || id === 'decide')) openPass(id)
    else if (type === 'view') setView({ id })
    else if (type === 'recap') setView({ id: 'stats', focus: id, nonce: Date.now() })
    else if (type === 'task') setView({ id: 'today', focus: id })
    // A capture's version history, asked for in the box: opened, then once
    // its page is up, its history.
    else if (type === 'versions') {
      open('capture', id)
      setTimeout(() => window.dispatchEvent(new CustomEvent('vigil:versions', { detail: id })), 600)
    } else open(type, id)
    if (heading) headingIn(type, id, heading)
  }), [])

  const kind = CAPTURE_TYPES.find((type) => `kind:${type.id}` === view.id)
  const keep: Record<string, (capture: CaptureMeta) => boolean> = {
    inbox: (capture) => capture.status === 'open',
    all: (capture) => capture.status !== 'discarded',
    // Nothing is destroyed: a discard lands here, and comes back from here.
    discarded: (capture) => capture.status === 'discarded',
    archived: (capture) => !!capture.archivedAt
  }

  return (
    <TooltipProvider delayDuration={600}>
    <div className="isolate flex h-screen flex-col bg-background text-foreground">
      {/* Centred over the page, not the sidebar beside it. */}
      <div className={`contents ${sidebar ? (narrow ? '[--toast-left:4rem]' : '[--toast-left:15rem]') : ''}`}><Toaster /></div>
      <NotePreview />
      <ShortcutSheet />
      <Passes onOpen={(type, id) => open(type, id)} />
      <Tour firstRun />
      <FocusNote />
      <FocusScenery />
      {searching && (
        <Search
          // The same palette as the prompt's: places to go and things to switch.
          actions={[
            { label: 'New capture', keys: 'C', run: () => window.api.showPrompt() },
            { label: 'New question', cue: null, run: () => void startQuestion(open) },
            { label: 'Tidy the last few days: tags and formatting, nothing to decide', run: () => openPass('tidy') },
            { label: 'Decide: the weekly pass over what you set aside', run: () => openPass('decide') },
            ...SECTIONS.map((section) => ({ label: `Go to ${section.label}`, keys: `G${section.key.toUpperCase()}`, run: () => setView({ id: section.id }) })),
            { label: sidebar ? 'Hide the sidebar' : 'Show the sidebar', keys: '⌘\\', cue: sidebar ? 'fold' : 'slide', run: () => setSidebar(!sidebar) },
            { label: fill ? 'Back to compact' : 'Fill the screen', keys: '⌃⇧F', cue: null, run: () => setFill(!fill) },
            { label: settings?.sounds ? 'Turn sounds off' : 'Turn sounds on', cue: null, run: () => {
              soundOn(!settings?.sounds)
              chime(settings?.sounds ? 'off' : 'on')
              void vigil.setSettings({ sounds: !settings?.sounds })
            } },
            { label: settings?.safeMode ? 'Turn safe mode off' : 'Turn safe mode on', keys: '⌥⌘S', cue: null, run: safeMode },
            { label: 'reveal' in document.documentElement.dataset ? 'Blur private titles again' : 'Show private titles for now', cue: 'reveal' in document.documentElement.dataset ? 'off' : 'on', run: () => {
              const root = document.documentElement
              if ('reveal' in root.dataset) delete root.dataset.reveal
              else root.dataset.reveal = ''
            } },
            { label: 'Keyboard shortcuts', keys: '?', run: () => window.dispatchEvent(new CustomEvent('vigil:shortcuts')) },
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
          onClose={() => setSearching(false)}
          onOpen={(type, id) => {
            setSearching(false)
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
      // Customize opens beside the whole sidebar, from its top, so it never runs off the window.
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
            onClick={() => setSearching(true)}
            className={`flex w-full items-center gap-2 rounded-lg bg-accent/60 py-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground ${narrow ? 'justify-center px-0' : 'px-2.5'}`}
          >
            <AliveIcon icon={MagnifierIcon} size={16} />
            {!narrow && <span className="flex-1 text-left">Search…</span>}
            {!narrow && <Kbd>⌘K</Kbd>}
          </button>
        </div>
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-2 pt-1 pb-3">
        <nav className="flex flex-col gap-px">
          {(() => {
            const row = (section: (typeof SECTIONS)[number]): React.JSX.Element => (
              <Tooltip key={section.id}>
              <TooltipTrigger asChild>
              <button
                type="button"
                data-home={section.id === 'nuggets' ? 'nugget' : section.id === 'upcoming' ? 'task' : section.id === 'questions' ? 'question' : undefined}
                data-tour={section.id === 'inbox' ? 'inbox' : undefined}
                aria-label={section.label}
                onClick={() => setView({ id: section.id })}
                className={`group relative flex items-center gap-2.5 rounded-md py-1.5 transition-colors ${narrow ? 'justify-center px-0' : 'px-2'} ${view.id === section.id ? 'bg-accent text-foreground' : 'text-foreground/80 hover:bg-accent/60'}`}
              >
                {/* Each icon keeps its colour, softened while at rest so the hues do not
                    shout at once; the one you are on, or reaching for, is in full. */}
                <PlaceIcon place={section} full={view.id === section.id} />
                {!narrow && <span className="flex-1 truncate text-left">{section.label}</span>}
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
                {narrow && <>{section.label} </>}<Kbd>G</Kbd><Kbd>{section.key.toUpperCase()}</Kbd>
              </TooltipContent>
              </Tooltip>
            )
            // A group's name, small: click folds it; pointed at, it offers Customize.
            const heading = (label: string, open: boolean, fold: (open: boolean) => void, customize = true): React.JSX.Element =>
              narrow ? <div key={label} className="mt-3" /> : (
                <div key={label} className="group/head mt-3 mb-0.5 flex items-center">
                  <button
                    type="button"
                    aria-expanded={open}
                    onClick={() => (chime(open ? 'fold' : 'slide'), fold(!open))}
                    className="flex flex-1 items-center gap-1 rounded-md px-2 py-0.5 text-left text-meta text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {label}
                    <ChevronRight className={`size-3 transition-[rotate,opacity] ${open ? 'rotate-90 opacity-0 group-hover/head:opacity-100' : ''}`} />
                  </button>
                  {customize && (
                    <Tip label="Customize sidebar">
                      <button type="button" onClick={() => setCustomizing(true)}
                        className="rounded p-0.5 text-muted-foreground opacity-0 transition-opacity group-hover/head:opacity-100 hover:bg-accent hover:text-foreground focus-visible:opacity-100">
                        <AliveIcon icon={DotsHorizontalIcon} size={14} />
                      </button>
                    </Tip>
                  )}
                </div>
              )
            const visible = SECTIONS.filter((section) => shown.includes(section.id))
            const hidden = SECTIONS.filter((section) => !shown.includes(section.id))
            const first = SECTIONS.findIndex((section) => section.group)
            const loose = (after: boolean): typeof SECTIONS => visible.filter((section) => !section.group && SECTIONS.indexOf(section) > first === after)
            const group = (name: string, open: boolean, fold: (open: boolean) => void): React.JSX.Element | null => {
              const list = visible.filter((section) => section.group === name)
              if (!list.length) return null
              // Folded, the one you are on still shows, so you never lose your place.
              return <Fragment key={name}>{heading(name, open, fold)}{list.filter((section) => open || narrow || view.id === section.id).map(row)}</Fragment>
            }
            return (<>
              {loose(false).map(row)}
              {/* Pinned, Notion's Favourites: only there while something is. */}
              {pins.length > 0 && (<>
                {heading('Pinned', pinsOpen, setPinsOpen, false)}
                {(pinsOpen || narrow) && pins.map((pin) => {
                  const kind = CAPTURE_TYPES.find((type) => type.id === pin.kind) ?? CAPTURE_TYPES[0]
                  const table = pin.type === 'capture' ? 'captures' : 'nuggets'
                  return (
                    <RowMenu key={pin.id} items={[
                      { label: 'Open', run: () => open(pin.type, pin.id) },
                      'separator',
                      { label: 'Unpin', run: () => void vigil.pin(table, pin.id, false).then(() => chime('fold')) }
                    ]}>
                      <span className="flex min-w-0">
                      <Tip label={narrow ? pin.title || 'Untitled' : ''}>
                      <button
                        type="button"
                        data-private={pin.private ? '' : undefined}
                        onClick={() => open(pin.type, pin.id)}
                        className={`flex min-w-0 flex-1 items-center gap-2.5 rounded-md py-1.5 text-foreground/80 transition-colors hover:bg-accent/60 ${narrow ? 'justify-center px-0' : 'px-2'}`}
                      >
                        <kind.icon className="size-4 shrink-0" style={{ color: kind.tint }} />
                        {!narrow && <span className="private-text min-w-0 flex-1 truncate text-left">{pin.title || 'Untitled'}</span>}
                      </button>
                      </Tip>
                      </span>
                    </RowMenu>
                  )
                })}
              </>)}
              {group('Tasks', tasksOpen, setTasksOpen)}
              {group('Kept', keptOpen, setKeptOpen)}
              {loose(true).length > 0 && <div className="mt-3" />}
              {loose(true).map(row)}
              {/* Everything not shown, one fold away; G and a letter reach it anyway. */}
              {hidden.length > 0 && (narrow ? (
                <Tip label="More">
                  <button type="button" aria-expanded={moreOpen} aria-label="More" onClick={() => (chime(moreOpen ? 'fold' : 'slide'), setMoreOpen(!moreOpen))}
                    className="mt-3 flex justify-center rounded-md py-1 text-muted-foreground hover:text-foreground">
                    <AliveIcon icon={DotsHorizontalIcon} size={16} />
                  </button>
                </Tip>
              ) : heading('More', moreOpen, setMoreOpen))}
              {hidden.filter((section) => moreOpen || view.id === section.id).map(row)}
            </>)
          })()}
        </nav>

        {!narrow && (<>
        <button
          type="button"
          onClick={() => (chime(kindsOpen ? 'fold' : 'slide'), setKindsOpen(!kindsOpen))}
          className="mt-3 mb-0.5 flex items-center gap-1 rounded-md px-2 py-0.5 text-meta text-muted-foreground transition-colors hover:text-foreground"
        >
          Kinds <ChevronRight className={`size-3 transition-transform ${kindsOpen ? 'rotate-90' : ''}`} />
        </button>
        {kindsOpen &&
          CAPTURE_TYPES.map((type) => {
            const count = captures.filter((capture) => capture.kind === type.id && !capture.archivedAt).length
            return (
              <button
                key={type.id}
                type="button"
                onClick={() => setView({ id: `kind:${type.id}` })}
                className={`flex items-center gap-2.5 rounded-md px-2 py-1 ${view.id === `kind:${type.id}` ? 'bg-accent' : 'text-foreground/80 hover:bg-accent/60'}`}
              >
                <type.icon className="size-4" style={{ color: type.tint }} />
                <span className="flex-1 text-left">{type.label}</span>
                <span className="text-xs text-muted-foreground tabular-nums">{count ? <Rolling text={count} /> : ''}</span>
              </button>
            )
          })}

        {/* Your most used tags, with counts, the way Todoist keeps favourite labels. */}
        {tags.length > 0 && (
          <button
            type="button"
            onClick={() => (chime(tagsOpen ? 'fold' : 'slide'), setTagsOpen(!tagsOpen))}
            className="mt-3 mb-0.5 flex items-center gap-1 rounded-md px-2 py-0.5 text-meta text-muted-foreground transition-colors hover:text-foreground"
          >
            Tags <ChevronRight className={`size-3 transition-transform ${tagsOpen ? 'rotate-90' : ''}`} />
          </button>
        )}
        {tagsOpen &&
          tags.slice(0, 8).map(({ tag, count, color }) => (
            <button
              key={tag}
              type="button"
              onClick={() => setView({ id: 'tags', focus: tag })}
              className={`flex items-center gap-2.5 rounded-md px-2 py-1 ${view.id === 'tags' && view.focus === tag ? 'bg-accent' : 'text-foreground/80 hover:bg-accent/60'}`}
            >
              <Tag className="size-4 text-muted-foreground" style={color ? { color: `var(--tt-color-text-${color})` } : undefined} />
              <span className="flex-1 truncate text-left">{tag}</span>
              <span className="text-xs text-muted-foreground tabular-nums"><Rolling text={count} /></span>
            </button>
          ))}
        </>)}

        <div className="mt-auto flex flex-col gap-px pt-4">
          {/* Notion's quiet last row: which sections the sidebar lists. Settings has the same switches. */}
          <Tip label={narrow ? 'Customize sidebar' : ''}>
          <button
            type="button"
            data-customize
            aria-label="Customize sidebar"
            aria-expanded={customizing}
            onClick={() => setCustomizing(!customizing)}
            className={`flex items-center gap-2.5 rounded-md py-1.5 text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground aria-expanded:bg-accent/60 ${narrow ? 'justify-center px-0' : 'px-2'}`}
          >
            <AliveIcon icon={SlidersHorizontalIcon} size={16} />
            {!narrow && <span className="flex-1 text-left">Customize sidebar</span>}
          </button>
          </Tip>
        </div>
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
                {!narrow && <span className="flex-1 truncate text-left">Vigil</span>}
                {!narrow && <ChevronDown className="size-3.5 text-muted-foreground" />}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="top" align="start" className="w-60">
              <DropdownMenuItem onSelect={() => setView({ id: 'settings' })}>Settings<DropdownMenuShortcut>⌘,</DropdownMenuShortcut></DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuCheckboxItem checked={!!settings?.safeMode} onSelect={(event) => event.preventDefault()} onCheckedChange={() => safeMode()}>
                Safe mode<DropdownMenuShortcut>⌥⌘S</DropdownMenuShortcut>
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem checked={settings?.blur !== false} onSelect={(event) => event.preventDefault()} onCheckedChange={() => blurring()}>
                Blurring
              </DropdownMenuCheckboxItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => window.dispatchEvent(new CustomEvent('vigil:shortcuts'))}>Keyboard shortcuts<DropdownMenuShortcut>?</DropdownMenuShortcut></DropdownMenuItem>
              <DropdownMenuItem onSelect={() => window.dispatchEvent(new CustomEvent('vigil:tour'))}>Take the tour</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          {settings?.safeMode && (
            <Tip label="Safe mode is on: no hints, rot cards or pins  ⌥⌘S">
              <button type="button" aria-label="Turn safe mode off" onClick={safeMode}
                className="flex size-7 items-center justify-center rounded-md text-[color-mix(in_srgb,var(--tt-brand-color-400)_55%,var(--foreground))] hover:bg-accent/60">
                <Shield className="size-4" />
              </button>
            </Tip>
          )}
          <Tip label="Keyboard shortcuts  ?">
            <button type="button" aria-label="Keyboard shortcuts" onClick={() => window.dispatchEvent(new CustomEvent('vigil:shortcuts'))}
              className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent/60 hover:text-foreground">
              <CircleHelp className="size-4" />
            </button>
          </Tip>
        </div>
      </aside>
      </PopoverAnchor>
      <PopoverContent side="right" align="start" sideOffset={8}
        // Its own row toggles it: a click there is not a click away.
        onInteractOutside={(event) => (event.target as Element | null)?.closest?.('[data-customize]') && event.preventDefault()}
        className="max-h-[calc(var(--radix-popover-content-available-height)-8px)] w-72 gap-1 overflow-y-auto p-1.5">
        <p className="px-2 pt-1 pb-1.5 text-meta text-muted-foreground">Shown in the sidebar. The rest wait under More, and G with their letter still goes to them.</p>
        <ShowList places={SECTIONS} setting="sidebarShown" />
      </PopoverContent>
      </Popover>
      )}

      <div className="flex min-w-0 flex-1 flex-col gap-2">
      {/* Clear of the traffic lights whatever sits to the left: nothing, or the folded rail. */}
      <header className={`flex h-8 shrink-0 items-center gap-1 ${!sidebar ? 'pl-[68px]' : narrow ? 'pl-3' : ''}`} style={{ WebkitAppRegion: 'drag' } as CSSProperties}>
        {[
          { icon: PanelLeft, label: sidebar ? 'Hide the sidebar' : 'Show the sidebar', keys: '⌘\\', run: () => (chime(sidebar ? 'fold' : 'slide'), setSidebar(!sidebar)) },
          // With the sidebar away, its search field comes up here as a button.
          ...(sidebar ? [] : [{ icon: SearchIcon, label: 'Search', keys: '⌘K', run: () => setSearching(true) }])
        ].map(({ icon: Icon, label, keys, run }) => (
          <Tip key={keys} label={keyed(label, keys)}>
            <button type="button" aria-label={label} onClick={run} className={TOOL} style={{ WebkitAppRegion: 'no-drag' } as CSSProperties}>
              <Icon />
            </button>
          </Tip>
        ))}
        {/* Back and forward as one pill, the way Raycast and Safari join them. */}
        <span className="flex items-center rounded-full border" style={{ WebkitAppRegion: 'no-drag' } as CSSProperties}>
          {[
            { icon: ArrowLeft, label: 'Back', keys: '⌘[', run: () => step(-1), off: trail.at === 0 },
            { icon: ArrowRight, label: 'Forward', keys: '⌘]', run: () => step(1), off: trail.at === trail.views.length - 1 }
          ].map(({ icon: Icon, label, keys, run, off }, index) => (
            <Tip key={label} label={keyed(label, keys)}>
              <button type="button" aria-label={label} disabled={off} onClick={run}
                className={`flex h-7 w-8 items-center justify-center text-muted-foreground hover:text-foreground disabled:opacity-40 ${index ? 'border-l' : ''}`}>
                <Icon className="size-3.5" />
              </button>
            </Tip>
          ))}
        </span>
        <h1 className="ml-2 truncate font-medium">{SECTIONS.find((section) => section.id === view.id)?.label ?? (kind ? kind.label : view.id === 'settings' ? 'Settings' : view.id === 'yearpage' ? 'Year' : '')}</h1>
        {/* The open note's name, faint, once its first line has scrolled away. */}
        <span className={`min-w-0 flex-1 truncate px-4 text-center text-muted-foreground transition-opacity duration-200 ${topTitle && settings?.topTitle !== false ? 'opacity-100' : 'opacity-0'}`}>{topTitle}</span>
        <SoundToggle className={TOOL} />
        <Tip label={keyed(fill ? 'Back to compact' : 'Fill the screen', '⌃⇧F')}>
          <button type="button" aria-label={fill ? 'Back to compact' : 'Fill the screen'} onClick={() => setFill(!fill)}
            style={{ WebkitAppRegion: 'no-drag' } as CSSProperties}
            className={TOOL}>
            {fill ? <Minimize2 /> : <AliveIcon icon={ExpandIcon} size={16} />}
          </button>
        </Tip>
        <Tip label={keyed('New capture', 'C')}>
          <button type="button" onClick={() => (chime('open'), window.api.showPrompt())}
            style={{ WebkitAppRegion: 'no-drag' } as CSSProperties}
            className={`${TOOL} gap-1.5 px-2`}>
            <SquarePen /> New
          </button>
        </Tip>
      </header>
      {/* The page itself, a card like the sidebar's. */}
      <div className="relative flex min-h-0 flex-1 gap-2">
      <div className="@container/page relative flex min-h-0 min-w-0 flex-1 overflow-hidden rounded-xl border">
      <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={view.id}
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -4 }}
        transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
        className="flex min-w-0 flex-1"
      >
        {view.id === 'inbox' || view.id === 'all' || view.id === 'discarded' || view.id === 'archived' ? (
          <CapturesView title={SECTIONS.find((section) => section.id === view.id)!.label} keep={keep[view.id]} focus={view.focus} onOpen={open} archived={view.id === 'archived'} />
        ) : view.id === 'day' ? (
          <DayView key={view.focus} start={view.focus} onOpen={open} onScale={toScale} />
        ) : view.id === 'weekpage' ? (
          <WeekPage onOpen={open} onScale={toScale} onRecent={setRecent} recentOpen={!!recent} />
        ) : view.id === 'monthpage' ? (
          <MonthPage key={view.focus} start={view.focus} onScale={toScale} />
        ) : view.id === 'yearpage' ? (
          <YearPage onScale={toScale} onMonth={(month) => setView({ id: 'monthpage', focus: month })} />
        ) : kind ? (
          <CapturesView title={kind.label} keep={(capture) => capture.kind === kind.id} onOpen={open} />
        ) : view.id === 'review' ? (
          <ReviewView />
        ) : view.id === 'today' || view.id === 'upcoming' || view.id === 'routines' || view.id === 'later' ? (
          <TasksView mode={view.id} focus={view.focus} onOpen={open} />
        ) : view.id === 'week' ? (
          <WeekView onOpen={open} />
        ) : view.id === 'nuggets' || view.id === 'articles' ? (
          <ItemsView tier={view.id === 'nuggets' ? 'nugget' : 'article'} focus={view.focus} onOpen={open} />
        ) : view.id === 'questions' ? (
          <QuestionsView focus={view.focus} onOpen={open} />
        ) : view.id === 'tags' ? (
          <TagsView key={view.focus} onOpen={open} focus={view.focus} />
        ) : view.id === 'stats' ? (
          <StatsView key={`${view.focus}-${view.nonce}`} recap={view.focus} />
        ) : (
          <SettingsView />
        )}
      </motion.div>
      </AnimatePresence>
      </div>
      {/* Beside the page, not over it, while there is room; over its right edge in a narrow window. */}
      <AnimatePresence>
        {recent && (
          <motion.div
            key="recent"
            initial={{ opacity: 0, x: 16 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 16 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
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
