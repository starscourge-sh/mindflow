import type { ComponentType, CSSProperties, RefAttributes } from 'react'
import { Archive, CalendarFold, CalendarRange, Compass, Flag, Grid2x2, Sprout, type LucideIcon } from 'lucide-react'
import { alive } from '@/components/ui/alive-icon'
import BrainCircuitIcon from '@/components/ui/brain-circuit-icon'
import ClockIcon from '@/components/ui/clock-icon'
import LibraryIcon from '@/components/ui/library-icon'
import StackIcon from '@/components/ui/stack-icon'
import CheckedIcon from '@/components/ui/checked-icon'
import PenIcon from '@/components/ui/pen-icon'
import QuestionMarkIcon from '@/components/ui/question-mark'
import BrightnessDownIcon from '@/components/ui/brightness-down-icon'
import BookmarkIcon from '@/components/ui/bookmark-icon'
import { Switch } from '@/components/ui/switch'
import { chime } from '@/lib/sound'
import { useLive, vigil, type Settings } from '@/lib/vigil'
import { Pressed } from './ui'
import { AliveIcon } from './alive-icon'
import type { AnimatedIconHandle, AnimatedIconProps } from '@/components/ui/types'
import HomeIcon from '@/components/ui/home-icon'
import FileDescriptionIcon from '@/components/ui/file-description-icon'
import HashtagIcon from '@/components/ui/hashtag-icon'
import ChartBarIcon from '@/components/ui/chart-bar-icon'
import LayersIcon from '@/components/ui/layers-icon'
import TrashIcon from '@/components/ui/trash-icon'
import RefreshIcon from '@/components/ui/refresh-icon'
import HistoryCircleIcon from '@/components/ui/history-circle-icon'
import LinkIcon from '@/components/ui/link-icon'

// itshover drawings in lucide's place, moving when their control is pointed at.
const BarChart3 = alive(ChartBarIcon)
const Brain = alive(BrainCircuitIcon)
const CalendarDays = alive(ClockIcon)
const FileText = alive(FileDescriptionIcon)
const Gem = alive(LibraryIcon)
const History = alive(HistoryCircleIcon)
const House = alive(HomeIcon)
const Inbox = alive(StackIcon)
const Layers = alive(LayersIcon)
const Links = alive(LinkIcon)
const ListChecks = alive(CheckedIcon)
const NotebookPen = alive(PenIcon)
const Orbit = alive(QuestionMarkIcon)
const Repeat = alive(RefreshIcon)
const Sun = alive(BrightnessDownIcon)
const Tag = alive(HashtagIcon)
const Telescope = alive(BookmarkIcon)
const Trash2 = alive(TrashIcon)

/** A place the main window's sidebar or the box's tabs can show. */
export type Place = {
  id: string; label: string; icon: LucideIcon; tint: string; key?: string; group?: 'Tasks' | 'Saved'
  /** The same drawing, moving when its row is pointed at, where itshover has one. */
  alive?: ComponentType<AnimatedIconProps & RefAttributes<AnimatedIconHandle>>
}

/**
 * The main window's sections, each with the key that jumps to it after G, in
 * the order the sidebar lists them. Each has its own colour from the theme, as
 * Todoist gives Inbox, Today and Upcoming theirs. Which ones show is a
 * setting (`sidebarShown`); the rest sit under More and are still a G away.
 */
export const SECTIONS: (Place & { key: string })[] = [
  // Where things come back to you; the window opens here. Always shown.
  { id: 'home', label: 'Home', icon: House, alive: HomeIcon, key: 'y', tint: 'orange' },
  { id: 'inbox', label: 'Inbox', icon: Inbox, key: 'i', tint: 'blue' },
  { id: 'review', label: 'Review', icon: Brain, key: 'r', tint: 'purple' },
  // The daily note: written in, and what the day held.
  // Its own colour, not Today's green: the two sit next to each other.
  { id: 'day', label: "Today's page", icon: NotebookPen, key: 'p', tint: 'yellow' },
  // Wider stretches, less detail each: a week in a few lines, a month in two.
  { id: 'weekpage', label: "Week's page", icon: CalendarFold, key: 'k', tint: 'yellow' },
  { id: 'monthpage', label: "Month's page", icon: Sprout, key: 'm', tint: 'yellow' },
  // The same two words as the box's tabs: what to do, what you saved.
  { id: 'today', label: 'Today', icon: Sun, key: 't', tint: 'green', group: 'Tasks' },
  { id: 'week', label: 'Week', icon: CalendarRange, key: 'w', tint: 'blue', group: 'Tasks' },
  { id: 'upcoming', label: 'Upcoming', icon: CalendarDays, key: 'u', tint: 'orange', group: 'Tasks' },
  // Eisenhower's four boxes: urgent by date, important by the flag.
  { id: 'matrix', label: 'Matrix', icon: Grid2x2, key: 'q', tint: 'red', group: 'Tasks' },
  { id: 'routines', label: 'Routines', icon: Repeat, alive: RefreshIcon, key: 'o', tint: 'yellow', group: 'Tasks' },
  // This month, This year and Someday: what has no day yet.
  { id: 'later', label: 'Later', icon: Telescope, key: 'z', tint: 'purple', group: 'Tasks' },
  { id: 'nuggets', label: 'Ideas', icon: Gem, key: 'n', tint: 'pink', group: 'Saved' },
  { id: 'articles', label: 'Writing', icon: FileText, alive: FileDescriptionIcon, key: 'a', tint: 'brown', group: 'Saved' },
  // Questions you are holding open: what you keep circling and cannot name yet.
  { id: 'questions', label: 'Questions', icon: Orbit, key: 'h', tint: 'gray', group: 'Saved' },
  // Goals: a day you are working toward, and the road there.
  { id: 'goals', label: 'Goals', icon: Flag, key: 'e', tint: 'orange', group: 'Saved' },
  { id: 'tags', label: 'Tags', icon: Tag, alive: HashtagIcon, key: '#', tint: 'red' },
  { id: 'stats', label: 'Stats', icon: BarChart3, alive: ChartBarIcon, key: 's', tint: 'blue' },
  // Every note you have linked, as a map of dots and lines.
  { id: 'map', label: 'Map', icon: Links, alive: LinkIcon, key: 'x', tint: 'purple' },
  { id: 'all', label: 'All captures', icon: Layers, alive: LayersIcon, key: 'l', tint: 'gray' },
  { id: 'discarded', label: 'Discarded', icon: Trash2, alive: TrashIcon, key: 'd', tint: 'gray' },
  // Out of sight, not let go: apart from the exits.
  { id: 'archived', label: 'Archived', icon: Archive, key: 'v', tint: 'gray' },
  // Every power Vigil keeps out of sight, a card each (powers-view.tsx).
  { id: 'powers', label: 'What Vigil can do', icon: Compass, key: 'f', tint: 'green' }
]

/** The box's tabs, in their row's order; ⌃1 to ⌃5 reach each, shown or not. */
export const BOX_TABS: Place[] = [
  { id: 'inbox', label: 'Inbox', icon: Inbox, tint: 'blue' },
  { id: 'today', label: 'Tasks', icon: ListChecks, tint: 'green' },
  { id: 'review', label: 'Review', icon: Brain, tint: 'purple' },
  { id: 'kept', label: 'Saved', icon: Gem, tint: 'pink' },
  { id: 'recent', label: 'Recent', icon: History, alive: HistoryCircleIcon, tint: 'gray' }
]

/** The calm start: what serves capture, review and coming back; the rest a key away. */
type Shown = 'sidebarShown' | 'boxTabs'
const SHOWN: Record<Shown, string[]> = {
  sidebarShown: ['inbox', 'review', 'day', 'today', 'week', 'nuggets', 'articles', 'questions', 'goals'],
  boxTabs: ['inbox', 'today', 'review', 'kept']
}

/** A place's icon in its theme colour, softened unless `full`. */
export function PlaceIcon({ place, full }: { place: Place; full?: boolean }): React.JSX.Element {
  const className = `size-4 shrink-0 transition-colors duration-80 ${full ? 'text-[var(--tint)]' : 'text-[color-mix(in_oklab,var(--tint)_55%,var(--muted-foreground))] group-hover:text-[var(--tint)] group-data-[fluid-hover-active]:text-[var(--tint)]'}`
  const style = { '--tint': `var(--tt-color-text-${place.tint})` } as CSSProperties
  return place.alive ? <AliveIcon icon={place.alive} size={16} className={className} style={style} /> : <place.icon className={className} style={style} />
}

/**
 * Each place with a switch to show or hide it, saved as you flick it: the
 * sidebar's Customize and Settings both use this. The last one shown stays,
 * so there is always somewhere to be.
 */
export function ShowList({ places, setting }: { places: Place[]; setting: Shown }): React.JSX.Element {
  const shown = useShown(setting)
  // Read and written whole, so two quick flicks never lose one.
  const flip = async (id: string, on: boolean): Promise<void> => {
    const was = (await vigil.settings())[setting] ?? SHOWN[setting]
    chime(on ? 'on' : 'off')
    await vigil.setSettings({ [setting]: on ? [...was.filter((one) => one !== id), id] : was.filter((one) => one !== id) })
  }
  return (
    <div className="flex flex-col gap-px">
      {places.map((place) => {
        const on = shown.includes(place.id)
        return (
          <label key={place.id} className="group flex cursor-default items-center gap-2.5 rounded-md px-2 py-1.5 text-control text-foreground/80 hover:bg-accent/60">
            <PlaceIcon place={place} full={on} />
            <span className="flex-1 truncate">{place.label}</span>
            {place.key && <span className="flex gap-0.5 opacity-60"><Pressed keys={`G ${place.key.toUpperCase()}`} /></span>}
            <Switch checked={on} disabled={(on && shown.length === 1) || (setting === 'sidebarShown' && place.id === 'home')} onCheckedChange={(next) => void flip(place.id, next)} aria-label={`Show ${place.label}`} />
          </label>
        )
      })}
    </div>
  )
}

/** Which places a setting shows, the default until it has been changed. */
export function useShown(setting: Shown): string[] {
  const settings = useLive(vigil.settings, null as Settings | null)
  const list = settings?.[setting] ?? SHOWN[setting]
  return setting === 'sidebarShown' && !list.includes('home') ? ['home', ...list] : list
}
