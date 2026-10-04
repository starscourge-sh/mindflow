import { useEffect, useState, type CSSProperties } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  BarChart3,
  Brain,
  CalendarDays,
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
import { SlotText } from 'slot-text/react'
import { AnimatePresence, motion } from 'motion/react'
import { chime } from './lib/sound'
import 'slot-text/style.css'

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
import { Kbd, Toaster, toast, typing, FocusNote, useFocusMode } from './components/vigil/ui'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './components/ui/tooltip'
import { useAppearance, useLive, vigil, type Item, type Settings, type Task } from './lib/vigil'
import { Tip } from '@/components/vigil/ui'
import { Button } from '@/components/ui/button'

type View = { id: string; focus?: string }

/** The sections down the side, each with the key that jumps to it after G. */
/** Each has its own colour from the theme, as Todoist gives Inbox, Today and Upcoming theirs. */
const SECTIONS: { id: string; label: string; icon: LucideIcon; key: string; tint: string }[] = [
  { id: 'inbox', label: 'Inbox', icon: Inbox, key: 'i', tint: 'blue' },
  { id: 'review', label: 'Review', icon: Brain, key: 'r', tint: 'purple' },
  { id: 'today', label: 'Today', icon: Sun, key: 't', tint: 'green' },
  { id: 'upcoming', label: 'Upcoming', icon: CalendarDays, key: 'u', tint: 'orange' },
  { id: 'routines', label: 'Routines', icon: Repeat, key: 'o', tint: 'yellow' },
  { id: 'nuggets', label: 'Nuggets', icon: Gem, key: 'n', tint: 'pink' },
  { id: 'articles', label: 'Articles', icon: FileText, key: 'a', tint: 'brown' },
  { id: 'tags', label: 'Tags', icon: Tag, key: '#', tint: 'red' },
  { id: 'stats', label: 'Stats', icon: BarChart3, key: 's', tint: 'blue' },
  { id: 'all', label: 'All captures', icon: Layers, key: 'l', tint: 'gray' },
  { id: 'discarded', label: 'Discarded', icon: Trash2, key: 'd', tint: 'gray' }
]

const today = (): number => new Date().setHours(24, 0, 0, 0)

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
  const setView = (next: View): void => {
    if (next.id !== trail.views[trail.at].id) chime('tap')
    setTrail(({ views, at }) => ({ views: [...views.slice(0, at + 1), next], at: at + 1 }))
  }
  const step = (by: -1 | 1): void =>
    setTrail(({ views, at }) => ({ views, at: Math.max(0, Math.min(views.length - 1, at + by)) }))
  const [sidebar, setSidebar] = useState(true)
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

  const counts: Record<string, number> = {
    inbox: captures.filter((capture) => capture.status === 'open').length,
    review: due,
    today: tasks.filter((task) => task.status === 'open' && task.dueAt && new Date(task.dueAt).getTime() < today()).length,
    nuggets: nuggets.length,
    articles: articles.length
  }

  const safeMode = (): void => {
    const on = !settings?.safeMode
    void vigil.setSettings({ safeMode: on }).then(() => toast(on ? 'Safe mode: nothing will surface unasked' : 'Safe mode off'))
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
      if (event.metaKey && event.key === '\\') return setSidebar((open) => !open)
      if (event.metaKey || event.ctrlKey || event.altKey) return
      if (pending) {
        pending = false
        const to = SECTIONS.find((section) => section.key === event.key)
        // Taken here, so G T goes to Today and does not also move a task to today.
        if (to) {
          event.preventDefault()
          setView({ id: to.id })
        }
        return
      }
      if (event.key === 'g') pending = true
      else if (event.key === 'c') window.api.showPrompt()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  })

  // Somewhere else sent you to one thing: open its section with it open.
  const open = (type: string, id: string): void =>
    setView({ id: type === 'capture' ? 'all' : type === 'task' ? 'upcoming' : `${type}s`, focus: id })

  const kind = CAPTURE_TYPES.find((type) => `kind:${type.id}` === view.id)
  const keep: Record<string, (capture: CaptureMeta) => boolean> = {
    inbox: (capture) => capture.status === 'open',
    all: (capture) => capture.status !== 'discarded',
    // Nothing is destroyed: a discard lands here, and comes back from here.
    discarded: (capture) => capture.status === 'discarded'
  }

  return (
    <TooltipProvider delayDuration={600}>
    <div className="flex h-screen flex-col bg-background text-sm text-foreground">
      <Toaster />
      <FocusNote />
      {searching && (
        <Search
          onClose={() => setSearching(false)}
          onOpen={(type, id) => {
            setSearching(false)
            open(type, id)
          }}
        />
      )}

      {/* The toolbar, with the traffic lights set into its left end. The strip
          drags the window; every control on it says it does not. */}
      <header className="flex h-12 shrink-0 items-center gap-0.5 border-b pr-3 pl-[84px]" style={{ WebkitAppRegion: 'drag' } as CSSProperties}>
        {[
          { icon: PanelLeft, title: 'Sidebar ⌘\\', run: () => setSidebar(!sidebar) },
          { icon: SearchIcon, title: 'Search ⌘K', run: () => setSearching(true) },
          { icon: ArrowLeft, title: 'Back ⌘[', run: () => step(-1), off: trail.at === 0 },
          { icon: ArrowRight, title: 'Forward ⌘]', run: () => step(1), off: trail.at === trail.views.length - 1 }
        ].map(({ icon: Icon, title, run, off }) => (
          <Tip key={title} label={title}>
            <span style={{ WebkitAppRegion: 'no-drag' } as CSSProperties}>
              <Button variant="ghost" size="icon" aria-label={title} disabled={off} onClick={run} className="text-muted-foreground">
                <Icon className="size-4" />
              </Button>
            </span>
          </Tip>
        ))}
        <span className="ml-3 font-medium">
          {SECTIONS.find((section) => section.id === view.id)?.label ?? (kind ? kind.label : view.id === 'settings' ? 'Settings' : '')}
        </span>
        <span className="flex-1" />
        <Tip label="New capture  C">
        <Button variant="ghost" size="sm"
        
          onClick={() => window.api.showPrompt()}
          style={{ WebkitAppRegion: 'no-drag' } as CSSProperties}
          className="flex items-center gap-1.5 text-muted-foreground"
        >
          <SquarePen className="size-4" /> New
        </Button>
        </Tip>
      </header>

      <div className="flex min-h-0 flex-1">
      {sidebar && (
      <aside data-chrome className="flex w-56 shrink-0 flex-col overflow-y-auto border-r bg-accent/20 p-2">
        <nav className="flex flex-col gap-px">
          {SECTIONS.map((section) => (
            <Tooltip key={section.id}>
            <TooltipTrigger asChild>
            <button
              type="button"
              onClick={() => setView({ id: section.id })}
              className={`group relative flex items-center gap-2.5 rounded-md px-2 py-1.5 transition-colors ${view.id === section.id ? 'bg-accent text-foreground' : 'text-foreground/80 hover:bg-accent/60'}`}
            >
              <section.icon className="size-4" style={{ color: `var(--tt-color-text-${section.tint})` }} />
              <span className="flex-1 text-left">{section.label}</span>
              {counts[section.id] ? (
                <SlotText
                  text={String(counts[section.id])}
                  className={`text-xs tabular-nums ${section.id === 'today' ? 'text-[var(--tt-color-text-orange)]' : 'text-muted-foreground'}`}
                />
              ) : null}
            </button>
            </TooltipTrigger>
            <TooltipContent side="right" className="flex items-center gap-1.5">
              {section.label} <Kbd>G</Kbd><Kbd>{section.key.toUpperCase()}</Kbd>
            </TooltipContent>
            </Tooltip>
          ))}
        </nav>

        <button
          type="button"
          onClick={() => setKindsOpen(!kindsOpen)}
          className="mt-5 mb-1 flex items-center gap-1 px-2 text-xs text-muted-foreground hover:text-foreground"
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
                <span className="text-xs text-muted-foreground tabular-nums">{count || ''}</span>
              </button>
            )
          })}

        {/* Your most used tags, with counts, the way Todoist keeps favourite labels. */}
        {tags.length > 0 && (
          <button
            type="button"
            onClick={() => setTagsOpen(!tagsOpen)}
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
              <span className="text-xs text-muted-foreground tabular-nums">{count}</span>
            </button>
          ))}

        <div className="mt-auto flex flex-col gap-px pt-4">
          <Tip label="⌥⌘S">
          <button
            type="button"
            onClick={safeMode}
          
            className={`flex items-center gap-2.5 rounded-md px-2 py-1.5 transition-colors hover:bg-accent/60 ${settings?.safeMode ? 'text-[var(--tt-brand-color-400)]' : 'text-foreground/80'}`}
          >
            {settings?.safeMode ? <Shield className="size-4" /> : <ShieldOff className="size-4" />}
            <span className="flex-1 text-left">{settings?.safeMode ? 'Safe mode on' : 'Safe mode'}</span>
          </button>
          </Tip>
          <button
            type="button"
            onClick={() => setView({ id: 'settings' })}
            className={`flex items-center gap-2.5 rounded-md px-2 py-1.5 ${view.id === 'settings' ? 'bg-accent' : 'text-foreground/80 hover:bg-accent/60'}`}
          >
            <SettingsIcon className="size-4" />
            <span className="flex-1 text-left">Settings</span>
          </button>
          <p className="mt-2 px-2 text-[11px] text-muted-foreground">
            <Kbd>G</Kbd> then a letter to jump · <Kbd>C</Kbd> to capture
          </p>
        </div>
      </aside>
      )}

      <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={view.id}
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -4 }}
        transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
        className="flex min-w-0 flex-1"
      >
        {view.id === 'inbox' || view.id === 'all' || view.id === 'discarded' ? (
          <CapturesView title={SECTIONS.find((section) => section.id === view.id)!.label} keep={keep[view.id]} focus={view.focus} onOpen={open} />
        ) : kind ? (
          <CapturesView title={kind.label} keep={(capture) => capture.kind === kind.id} onOpen={open} />
        ) : view.id === 'review' ? (
          <ReviewView />
        ) : view.id === 'today' || view.id === 'upcoming' || view.id === 'routines' ? (
          <TasksView mode={view.id} focus={view.focus} />
        ) : view.id === 'nuggets' || view.id === 'articles' ? (
          <ItemsView tier={view.id === 'nuggets' ? 'nugget' : 'article'} focus={view.focus} onOpen={open} />
        ) : view.id === 'tags' ? (
          <TagsView key={view.focus} onOpen={open} focus={view.focus} />
        ) : view.id === 'stats' ? (
          <StatsView />
        ) : (
          <SettingsView />
        )}
      </motion.div>
      </AnimatePresence>
      </div>
    </div>
    </TooltipProvider>
  )
}
