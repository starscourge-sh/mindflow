import { Fragment, useEffect, useRef, useState, useSyncExternalStore, type CSSProperties } from 'react'
import {
  Minimize2,
  ArrowLeft,
  ArrowRight,
  BarChart3,
  Brain,
  CalendarDays,
  CalendarRange,
  Telescope,
  ChevronRight,
  FileText,
  Gem,
  Inbox,
  Repeat,
  Trash2,
  Layers,
  PanelLeft,
  Search as SearchIcon,
  Settings as SettingsIcon,
  Shield,
  ShieldOff,
  SquarePen,
  Sun,
  Tag,
  type LucideIcon
} from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { chime, soundOn } from './lib/sound'
import { NotePreview } from './components/vigil/note-preview'

import { CAPTURE_TYPES } from './components/capture-kinds/capture-kind-picker'
import { useCaptures, type CaptureMeta } from './components/capture-list'
import { Search } from './components/search'
import { CapturesView } from './components/vigil/captures-view'
import { ItemsView } from './components/vigil/items-view'
import { ReviewView } from './components/vigil/review-view'
import { SettingsView } from './components/vigil/settings-view'
import { StatsView } from './components/vigil/stats-view'
import { TagsView } from './components/vigil/tags-view'
import { TasksView } from './components/vigil/tasks-view'
import { WeekView } from './components/vigil/week-view'
import { placed } from './lib/tasks'
import { Kbd, Rolling, Toaster, toast, typing, FocusNote, useFocusMode, SoundToggle } from './components/vigil/ui'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './components/ui/tooltip'
import { useAppearance, useLive, vigil, type Item, type Settings, type Task } from './lib/vigil'
import { Tip, showTopTitle, useTopTitle } from '@/components/vigil/ui'
import { Button } from '@/components/ui/button'
import MagnifierIcon from '@/components/ui/magnifier-icon'
import ExpandIcon from '@/components/ui/expand-icon'
import { AliveIcon } from '@/components/vigil/alive-icon'
import { ShortcutSheet } from '@/components/vigil/shortcut-sheet'
import { Tour } from '@/components/vigil/tour'
import { DayView } from '@/components/vigil/day-view'
import { noteActions } from '@/lib/notes'
import { Archive, NotebookPen } from 'lucide-react'

type View = { id: string; focus?: string }

/** The sections down the side, each with the key that jumps to it after G. */
/** Each has its own colour from the theme, as Todoist gives Inbox, Today and Upcoming theirs. */
const SECTIONS: { id: string; label: string; icon: LucideIcon; key: string; tint: string }[] = [
  { id: 'inbox', label: 'Inbox', icon: Inbox, key: 'i', tint: 'blue' },
  { id: 'review', label: 'Review', icon: Brain, key: 'r', tint: 'purple' },
  // The daily note: written in, and what the day held.
  { id: 'day', label: "Today's page", icon: NotebookPen, key: 'p', tint: 'green' },
  { id: 'today', label: 'Today', icon: Sun, key: 't', tint: 'green' },
  { id: 'upcoming', label: 'Upcoming', icon: CalendarDays, key: 'u', tint: 'orange' },
  { id: 'week', label: 'Week', icon: CalendarRange, key: 'w', tint: 'blue' },
  { id: 'routines', label: 'Routines', icon: Repeat, key: 'o', tint: 'yellow' },
  // This month, This year and Someday: what has no day yet.
  { id: 'later', label: 'Later', icon: Telescope, key: 'z', tint: 'purple' },
  { id: 'nuggets', label: 'Nuggets', icon: Gem, key: 'n', tint: 'pink' },
  { id: 'articles', label: 'Articles', icon: FileText, key: 'a', tint: 'brown' },
  { id: 'tags', label: 'Tags', icon: Tag, key: '#', tint: 'red' },
  { id: 'stats', label: 'Stats', icon: BarChart3, key: 's', tint: 'blue' },
  { id: 'all', label: 'All captures', icon: Layers, key: 'l', tint: 'gray' },
  { id: 'discarded', label: 'Discarded', icon: Trash2, key: 'd', tint: 'gray' },
  // Out of sight, not let go: apart from the exits.
  { id: 'archived', label: 'Archived', icon: Archive, key: 'v', tint: 'gray' }
]

const today = (): number => new Date().setHours(24, 0, 0, 0)

/** Whether the window is under 760px wide, followed as it is resized. */
const NARROW = '(max-width: 759px)'
const followNarrow = (change: () => void): (() => void) => {
  const query = matchMedia(NARROW)
  query.addEventListener('change', change)
  return () => query.removeEventListener('change', change)
}
const useNarrow = (): boolean => useSyncExternalStore(followNarrow, () => matchMedia(NARROW).matches)

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
      if (here.id === next.id && here.focus === next.focus) return trail
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
  const [kindsOpen, setKindsOpen] = useState(false)
  const [tagsOpen, setTagsOpen] = useState(true)
  const tags = useLive(vigil.tags, [] as Awaited<ReturnType<typeof vigil.tags>>)
  const captures = useCaptures()
  const due = useLive(vigil.dueCount, 0)
  const tasks = useLive(vigil.tasks, [] as Task[])
  const nuggets = useLive(() => vigil.items('nugget'), [] as Item[])
  const articles = useLive(() => vigil.items('article'), [] as Item[])
  const settings = useLive(vigil.settings, null as Settings | null)
  const topTitle = useTopTitle()
  // A new section has no note scrolled: the last one's name does not follow you there.
  useEffect(() => showTopTitle(null), [view.id])

  const counts: Record<string, number> = {
    inbox: captures.filter((capture) => capture.status === 'open').length,
    review: due,
    today: tasks.filter((task) => task.status === 'open' && !task.waitingOn && (placed(task) ?? Infinity) < today()).length,
    nuggets: nuggets.length,
    articles: articles.length
  }

  const safeMode = (): void => {
    const on = !settings?.safeMode
    chime(on ? 'on' : 'off')
    void vigil.setSettings({ safeMode: on }).then(() => toast(on ? 'Safe mode: no hints, rot cards or pins come up' : 'Safe mode off'))
  }

  // The keyboard, Linear's way: G then a letter goes somewhere, C captures.
  useEffect(() => {
    let pending = false
    const onKey = (event: KeyboardEvent): void => {
      if (typing()) return
      if (event.metaKey && event.key === 'k') {
        event.preventDefault()
        return setSearching(true)
      }
      if (event.metaKey && event.key === '[') return step(-1)
      if (event.metaKey && event.key === ']') return step(1)
      if (event.metaKey && event.key === '\\') {
        chime(sidebar ? 'fold' : 'slide')
        return setSidebar((open) => !open)
      }
      if (event.metaKey || event.ctrlKey || event.altKey) return
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
      if (event.key.toLowerCase() === 'g') pending = true
      else if (event.key === 'c') window.api.showPrompt()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  })

  // Somewhere else sent you to one thing: open its section with it open.
  const open = (type: string, id: string): void =>
    setView({ id: type === 'capture' ? 'all' : type === 'task' ? 'upcoming' : `${type}s`, focus: id })
  // A view is sent by name (⌘, sends Settings), anything else as one thing to open.
  useEffect(() => window.api.onSentTo((type, id) => (type === 'view' ? setView({ id }) : type === 'recap' ? setView({ id: 'stats', focus: id }) : type === 'task' ? setView({ id: 'today', focus: id }) : open(type, id))), [])

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
    <div className="flex h-screen flex-col bg-background text-foreground">
      {/* Centred over the page, not the sidebar beside it. */}
      <div className={`contents ${sidebar ? (narrow ? '[--toast-left:4rem]' : '[--toast-left:15rem]') : ''}`}><Toaster /></div>
      <NotePreview />
      <ShortcutSheet />
      <Tour firstRun />
      <FocusNote />
      {searching && (
        <Search
          // The same palette as the prompt's: places to go and things to switch.
          actions={[
            { label: 'New capture', keys: 'C', run: () => window.api.showPrompt() },
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
            { label: 'Settings', keys: '⌘,', run: () => setView({ id: 'settings' }) },
            ...noteActions({ day: false }),
            // The recap, Wrapped's way, over Stats.
            { label: 'Your month, wrapped', run: () => setView({ id: 'stats', focus: 'month' }) },
            { label: 'Your year, wrapped', run: () => setView({ id: 'stats', focus: 'year' }) }
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
      <aside data-chrome className={`flex shrink-0 flex-col overflow-y-auto rounded-xl border bg-accent/20 p-2 pb-3 ${narrow ? 'w-12' : 'w-56'}`}>
        {/* Room for the traffic lights, and somewhere to hold the window by. */}
        <div className="h-8 shrink-0" style={{ WebkitAppRegion: 'drag' } as CSSProperties} />
        <button
          type="button"
          data-tour="search"
          aria-label="Search"
          onClick={() => setSearching(true)}
          className={`mb-3 flex items-center gap-2 rounded-lg bg-accent/60 py-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground ${narrow ? 'justify-center px-0' : 'px-2.5'}`}
        >
          <AliveIcon icon={MagnifierIcon} size={16} />
          {!narrow && <span className="flex-1 text-left">Search…</span>}
          {!narrow && <Kbd>⌘K</Kbd>}
        </button>
        <nav className="flex flex-col gap-px">
          {SECTIONS.map((section) => (
            <Fragment key={section.id}>
            {/* The same two words as the prompt's tabs: what to do, what you kept. */}
            {section.id === 'today' && (narrow ? <div className="mt-3" /> : <div className="mt-3 mb-0.5 px-2 text-meta text-muted-foreground">Tasks</div>)}
            {section.id === 'nuggets' && (narrow ? <div className="mt-3" /> : <div className="mt-3 mb-0.5 px-2 text-meta text-muted-foreground">Kept</div>)}
            {section.id === 'tags' && <div className="mt-3" />}
            <Tooltip>
            <TooltipTrigger asChild>
            <button
              type="button"
              data-home={section.id === 'nuggets' ? 'nugget' : section.id === 'upcoming' ? 'task' : undefined}
              data-tour={section.id === 'inbox' ? 'inbox' : undefined}
              aria-label={section.label}
              onClick={() => setView({ id: section.id })}
              className={`group relative flex items-center gap-2.5 rounded-md py-1.5 transition-colors ${narrow ? 'justify-center px-0' : 'px-2'} ${view.id === section.id ? 'bg-accent text-foreground' : 'text-foreground/80 hover:bg-accent/60'}`}
            >
              <section.icon className="size-4" style={{ color: `var(--tt-color-text-${section.tint})` }} />
              {!narrow && <span className="flex-1 text-left">{section.label}</span>}
              {!narrow && counts[section.id] ? (
                <Rolling
                  text={counts[section.id]}
                  className={`text-xs tabular-nums ${section.id === 'today' ? 'text-[var(--tt-color-text-orange)]' : 'text-muted-foreground'}`}
                />
              ) : null}
            </button>
            </TooltipTrigger>
            <TooltipContent side="right" className="flex items-center gap-1.5">
              {section.label} <Kbd>G</Kbd><Kbd>{section.key.toUpperCase()}</Kbd>
            </TooltipContent>
            </Tooltip>
            </Fragment>
          ))}
        </nav>

        {!narrow && (<>
        <button
          type="button"
          onClick={() => (chime(kindsOpen ? 'fold' : 'slide'), setKindsOpen(!kindsOpen))}
          className="mt-4 mb-1 flex items-center gap-1 px-2 text-xs text-muted-foreground hover:text-foreground"
        >
          Kinds <ChevronRight className={`size-3 transition-transform ${kindsOpen ? 'rotate-90' : ''}`} />
        </button>
        {kindsOpen &&
          CAPTURE_TYPES.map((type) => {
            const count = captures.filter((capture) => capture.kind === type.id).length
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
            className="mt-4 mb-1 flex items-center gap-1 px-2 text-xs text-muted-foreground hover:text-foreground"
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
          <Tip label="Safe mode  ⌥⌘S">
          <button
            type="button"
            onClick={safeMode}
          
            aria-label={settings?.safeMode ? 'Safe mode: on' : 'Safe mode: off'}
            className={`flex items-center gap-2.5 rounded-md py-1.5 transition-colors hover:bg-accent/60 ${narrow ? 'justify-center px-0' : 'px-2'} ${settings?.safeMode ? 'text-[var(--tt-brand-color-400)]' : 'text-foreground/80'}`}
          >
            {settings?.safeMode ? <Shield className="size-4" /> : <ShieldOff className="size-4" />}
            {!narrow && <span className="flex-1 text-left">{settings?.safeMode ? 'Safe mode: on' : 'Safe mode: off'}</span>}
          </button>
          </Tip>
          <Tip label="Settings  ⌘,">
          <button
            type="button"
            aria-label="Settings"
            onClick={() => setView({ id: 'settings' })}
            className={`flex items-center gap-2.5 rounded-md py-1.5 ${narrow ? 'justify-center px-0' : 'px-2'} ${view.id === 'settings' ? 'bg-accent' : 'text-foreground/80 hover:bg-accent/60'}`}
          >
            <SettingsIcon className="size-4" />
            {!narrow && <span className="flex-1 text-left">Settings</span>}
          </button>
          </Tip>
          {!narrow && (
            <p className="mt-2 px-2 text-xs whitespace-nowrap text-muted-foreground">
              <Kbd>G</Kbd> jump <span className="mx-1">·</span> <Kbd>C</Kbd> capture <span className="mx-1">·</span> <Kbd>?</Kbd> keys
            </p>
          )}
        </div>
      </aside>
      )}

      <div className="flex min-w-0 flex-1 flex-col gap-2">
      <header className={`flex h-8 shrink-0 items-center gap-1 ${sidebar ? '' : 'pl-[68px]'}`} style={{ WebkitAppRegion: 'drag' } as CSSProperties}>
        {[
          { icon: PanelLeft, title: 'Sidebar ⌘\\', run: () => (chime(sidebar ? 'fold' : 'slide'), setSidebar(!sidebar)) },
          // With the sidebar away, its search field comes up here as a button.
          ...(sidebar ? [] : [{ icon: SearchIcon, title: 'Search ⌘K', run: () => setSearching(true) }])
        ].map(({ icon: Icon, title, run }) => (
          <Tip key={title} label={title}>
            <span style={{ WebkitAppRegion: 'no-drag' } as CSSProperties}>
              <Button variant="ghost" size="icon" aria-label={title} onClick={run} className="text-muted-foreground">
                <Icon className="size-4" />
              </Button>
            </span>
          </Tip>
        ))}
        {/* Back and forward as one pill, the way Raycast and Safari join them. */}
        <span className="flex items-center rounded-full border" style={{ WebkitAppRegion: 'no-drag' } as CSSProperties}>
          {[
            { icon: ArrowLeft, title: 'Back ⌘[', run: () => step(-1), off: trail.at === 0 },
            { icon: ArrowRight, title: 'Forward ⌘]', run: () => step(1), off: trail.at === trail.views.length - 1 }
          ].map(({ icon: Icon, title, run, off }, index) => (
            <Tip key={title} label={title}>
              <button type="button" aria-label={title} disabled={off} onClick={run}
                className={`flex h-7 w-8 items-center justify-center text-muted-foreground hover:text-foreground disabled:opacity-40 ${index ? 'border-l' : ''}`}>
                <Icon className="size-3.5" />
              </button>
            </Tip>
          ))}
        </span>
        <span className="ml-2 truncate font-medium">{SECTIONS.find((section) => section.id === view.id)?.label ?? (kind ? kind.label : view.id === 'settings' ? 'Settings' : '')}</span>
        {/* The open note's name, faint, once its first line has scrolled away. */}
        <span className={`min-w-0 flex-1 truncate px-4 text-center text-muted-foreground transition-opacity duration-200 ${topTitle && settings?.topTitle !== false ? 'opacity-100' : 'opacity-0'}`}>{topTitle}</span>
        <SoundToggle className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground [&_svg]:size-4" />
        <Tip label={`${fill ? 'Back to compact' : 'Fill the screen'}  ⌃⇧F`}>
          <button type="button" aria-label={fill ? 'Back to compact' : 'Fill the screen'} onClick={() => setFill(!fill)}
            style={{ WebkitAppRegion: 'no-drag' } as CSSProperties}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground">
            {fill ? <Minimize2 className="size-4" /> : <AliveIcon icon={ExpandIcon} size={16} />}
          </button>
        </Tip>
        <Tip label="New capture  C">
          <Button variant="ghost" size="sm" onClick={() => window.api.showPrompt()}
            style={{ WebkitAppRegion: 'no-drag' } as CSSProperties}
            className="flex items-center gap-1.5 text-muted-foreground">
            <SquarePen className="size-4" /> New
          </Button>
        </Tip>
      </header>
      {/* The page itself, a card like the sidebar's. */}
      <div className="@container/page relative flex min-h-0 flex-1 overflow-hidden rounded-xl border">
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
          <DayView onOpen={open} />
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
        ) : view.id === 'tags' ? (
          <TagsView key={view.focus} onOpen={open} focus={view.focus} />
        ) : view.id === 'stats' ? (
          <StatsView key={view.focus} recap={view.focus} />
        ) : (
          <SettingsView />
        )}
      </motion.div>
      </AnimatePresence>
      </div>
      </div>
      </div>
    </div>
    </TooltipProvider>
  )
}
