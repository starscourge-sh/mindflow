import type { CSSProperties } from 'react'
import { Archive, BarChart3, Brain, CalendarDays, CalendarFold, CalendarRange, FileText, Gem, History, Inbox, Layers, ListChecks, NotebookPen, Orbit, Repeat, Sprout, Sun, Tag, Telescope, Trash2, type LucideIcon } from 'lucide-react'
import { Switch } from '@/components/ui/switch'
import { chime } from '@/lib/sound'
import { useLive, vigil, type Settings } from '@/lib/vigil'
import { Kbd } from './ui'

/** A place the main window's sidebar or the box's tabs can show. */
export type Place = { id: string; label: string; icon: LucideIcon; tint: string; key?: string; group?: 'Tasks' | 'Kept' }

/**
 * The main window's sections, each with the key that jumps to it after G, in
 * the order the sidebar lists them. Each has its own colour from the theme, as
 * Todoist gives Inbox, Today and Upcoming theirs. Which ones show is a
 * setting (`sidebarShown`); the rest sit under More and are still a G away.
 */
export const SECTIONS: (Place & { key: string })[] = [
  { id: 'inbox', label: 'Inbox', icon: Inbox, key: 'i', tint: 'blue' },
  { id: 'review', label: 'Review', icon: Brain, key: 'r', tint: 'purple' },
  // The daily note: written in, and what the day held.
  // Its own colour, not Today's green: the two sit next to each other.
  { id: 'day', label: "Today's page", icon: NotebookPen, key: 'p', tint: 'yellow' },
  // Wider stretches, less detail each: a week in a few lines, a month in two.
  { id: 'weekpage', label: "Week's page", icon: CalendarFold, key: 'k', tint: 'yellow' },
  { id: 'monthpage', label: "Month's page", icon: Sprout, key: 'm', tint: 'yellow' },
  // The same two words as the box's tabs: what to do, what you kept.
  { id: 'today', label: 'Today', icon: Sun, key: 't', tint: 'green', group: 'Tasks' },
  { id: 'week', label: 'Week', icon: CalendarRange, key: 'w', tint: 'blue', group: 'Tasks' },
  { id: 'upcoming', label: 'Upcoming', icon: CalendarDays, key: 'u', tint: 'orange', group: 'Tasks' },
  { id: 'routines', label: 'Routines', icon: Repeat, key: 'o', tint: 'yellow', group: 'Tasks' },
  // This month, This year and Someday: what has no day yet.
  { id: 'later', label: 'Later', icon: Telescope, key: 'z', tint: 'purple', group: 'Tasks' },
  { id: 'nuggets', label: 'Nuggets', icon: Gem, key: 'n', tint: 'pink', group: 'Kept' },
  { id: 'articles', label: 'Articles', icon: FileText, key: 'a', tint: 'brown', group: 'Kept' },
  // Questions you are holding open: what you keep circling and cannot name yet.
  { id: 'questions', label: 'Holding', icon: Orbit, key: 'h', tint: 'gray', group: 'Kept' },
  { id: 'tags', label: 'Tags', icon: Tag, key: '#', tint: 'red' },
  { id: 'stats', label: 'Stats', icon: BarChart3, key: 's', tint: 'blue' },
  { id: 'all', label: 'All captures', icon: Layers, key: 'l', tint: 'gray' },
  { id: 'discarded', label: 'Discarded', icon: Trash2, key: 'd', tint: 'gray' },
  // Out of sight, not let go: apart from the exits.
  { id: 'archived', label: 'Archived', icon: Archive, key: 'v', tint: 'gray' }
]

/** The box's tabs, in their row's order; ⌃1 to ⌃5 reach each, shown or not. */
export const BOX_TABS: Place[] = [
  { id: 'inbox', label: 'Inbox', icon: Inbox, tint: 'blue' },
  { id: 'today', label: 'Tasks', icon: ListChecks, tint: 'green' },
  { id: 'review', label: 'Review', icon: Brain, tint: 'purple' },
  { id: 'kept', label: 'Kept', icon: Gem, tint: 'pink' },
  { id: 'recent', label: 'Recent', icon: History, tint: 'gray' }
]

/** The calm start: what serves capture, review and coming back; the rest a key away. */
type Shown = 'sidebarShown' | 'boxTabs'
const SHOWN: Record<Shown, string[]> = {
  sidebarShown: ['inbox', 'review', 'day', 'today', 'week', 'nuggets', 'articles', 'questions'],
  boxTabs: ['inbox', 'today', 'review', 'kept']
}

/** A place's icon in its theme colour, softened unless `full`. */
export function PlaceIcon({ place, full }: { place: Place; full?: boolean }): React.JSX.Element {
  return (
    <place.icon
      className={`size-4 shrink-0 transition-colors ${full ? 'text-[var(--tint)]' : 'text-[color-mix(in_oklab,var(--tint)_55%,var(--muted-foreground))] group-hover:text-[var(--tint)]'}`}
      style={{ '--tint': `var(--tt-color-text-${place.tint})` } as CSSProperties}
    />
  )
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
            {place.key && <span className="flex gap-0.5 opacity-60"><Kbd>G</Kbd><Kbd>{place.key.toUpperCase()}</Kbd></span>}
            <Switch checked={on} disabled={on && shown.length === 1} onCheckedChange={(next) => void flip(place.id, next)} aria-label={`Show ${place.label}`} />
          </label>
        )
      })}
    </div>
  )
}

/** Which places a setting shows, the default until it has been changed. */
export function useShown(setting: Shown): string[] {
  const settings = useLive(vigil.settings, null as Settings | null)
  return settings?.[setting] ?? SHOWN[setting]
}
