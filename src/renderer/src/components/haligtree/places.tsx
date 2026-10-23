import { type ComponentType, type CSSProperties, type RefAttributes } from 'react'
import { Archive, BookOpen, BookUser, Calendar, CalendarFold, Compass, Flag, ListVideo, Sprout, type LucideIcon } from 'lucide-react'
import { AliveIcon } from '@/components/ui/alive-icon'
import { Switch } from '@/components/ui/switch'
import { chime } from '@/lib/sound'
import { useLive, haligtree, type Settings } from '@/lib/haligtree'
import { Pressed, Tip, toast, quietly } from './ui'
import { RowMenu, type RowItem } from './row-menu'
import { SortableList, SortableRow } from './sortable'
import { LayoutGroup } from 'motion/react'
import { GripVertical } from 'lucide-react'
import { inOrder, isUsual, moved, stepped } from '@/lib/place-order'
import type { AnimatedIconHandle, AnimatedIconProps } from '@/components/ui/types'
import FileDescriptionIcon from '@/components/ui/file-description-icon'
import HashtagIcon from '@/components/ui/hashtag-icon'
import ChartBarIcon from '@/components/ui/chart-bar-icon'
import TrashIcon from '@/components/ui/trash-icon'
import RefreshIcon from '@/components/ui/refresh-icon'
import EyeIcon from '@/components/ui/eye-icon'
import HistoryCircleIcon from '@/components/ui/history-circle-icon'
import LinkIcon from '@/components/ui/link-icon'
import { BarChart3, Brain, FileText, Gem, History, Inbox, Link as Links, ListTodo as ListChecks, Sun, Tag, Trash2 } from '@/components/ui/icons'
import { APP_NAME } from '../../../../main/name'
import { SIDEBAR_SHAPE } from '../../../../main/sidebar-shape'
import { num } from '../../../../main/dates'

/** A run of the sidebar's places with a gap before it and no heading: what you write and keep, then what you do. */
export type Group = 'Write' | 'Do'
/** A place the main window's sidebar or the box's tabs can show. */
export type Place = {
  id: string; label: string; icon: LucideIcon; tint: string; key?: string; group?: Group
  /** The same drawing, moving when its row is pointed at, where itshover has one. */
  alive?: ComponentType<AnimatedIconProps & RefAttributes<AnimatedIconHandle>>
}

/**
 * The main window's sections, each with the key that jumps to it after G, in
 * the order the sidebar lists them: writing first (Today, Pages, Inbox, Gems,
 * Review), then a gap, then doing (Tasks, Calendar), then the rest. Each has
 * its own colour from the theme. Which ones show is a setting
 * (`sidebarShown`), the same for every book to start: one switched off is
 * not in the sidebar at all, and is still a G and its letter, or ⌘K, away.
 * This is the usual order: dragged or moved from a row's right-click menu,
 * yours is kept as `sidebarOrder` (useInOrder).
 */
export const SECTIONS: (Place & { key: string })[] = [
  // The Day page: the day's writing on top, today's tasks under it. The window opens here.
  { id: 'day', label: 'Today', icon: Sun, key: 'p', tint: 'orange', group: 'Write' },
  { id: 'articles', label: 'Pages', icon: FileText, alive: FileDescriptionIcon, key: 'a', tint: 'brown', group: 'Write' },
  { id: 'inbox', label: 'Inbox', icon: Inbox, key: 'i', tint: 'blue', group: 'Write' },
  { id: 'nuggets', label: 'Gems', icon: Gem, key: 'n', tint: 'pink', group: 'Write' },
  { id: 'review', label: 'Review', icon: Brain, key: 'r', tint: 'purple', group: 'Write' },
  // One row for every task list: Today, Upcoming, Later and Routines are its tabs (tasks-view.tsx).
  { id: 'today', label: 'Tasks', icon: ListChecks, key: 't', tint: 'green', group: 'Do' },
  // Day, week and month by the hour, the way a calendar app has them (calendar-view.tsx).
  { id: 'calendar', label: 'Calendar', icon: Calendar, key: 'c', tint: 'red', group: 'Do' },
  // The rest: off to start, a G and its letter or ⌘K away, each switched on in "Customize sidebar…".
  { id: 'weekpage', label: "Week's page", icon: CalendarFold, key: 'k', tint: 'yellow' },
  { id: 'monthpage', label: "Month's page", icon: Sprout, key: 'm', tint: 'yellow' },
  // Words and questions asked and waiting on an answer: a Word with no meaning written yet.
  { id: 'lookups', label: 'Lookups', icon: BookOpen, key: '.', tint: 'green' },
  // Goals: a day you are working toward, and the road there.
  { id: 'goals', label: 'Goals', icon: Flag, key: 'e', tint: 'orange' },
  // What you mean to read next, in order, Spotify's way.
  { id: 'queue', label: 'Queue', icon: ListVideo, key: 'b', tint: 'blue' },
  { id: 'tags', label: 'Tags', icon: Tag, alive: HashtagIcon, key: '#', tint: 'red' },
  // Every person and source your notes are from, a page each (source-page.tsx).
  { id: 'sources', label: 'Sources', icon: BookUser, key: 'j', tint: 'blue' },
  { id: 'stats', label: 'Stats', icon: BarChart3, alive: ChartBarIcon, key: 's', tint: 'blue' },
  // Every note you have linked, as a map of dots and lines.
  { id: 'map', label: 'Map', icon: Links, alive: LinkIcon, key: 'x', tint: 'purple' },
  { id: 'discarded', label: 'Bin', icon: Trash2, alive: TrashIcon, key: 'd', tint: 'gray' },
  // Out of sight, not let go: apart from the exits.
  { id: 'archived', label: 'Archived', icon: Archive, key: 'v', tint: 'gray' },
  // Every power Haligtree keeps out of sight, a card each (powers-view.tsx).
  { id: 'powers', label: `What ${APP_NAME} can do`, icon: Compass, key: 'f', tint: 'green' }
]

/** What every book's sidebar shows to start: the two runs, then Tags and the Bin (main/sidebar-shape.ts). */
export const SHAPE = SIDEBAR_SHAPE

/**
 * G and a letter for pages that are not rows of their own any more: Home and
 * the task lists are parts or tabs of a row now, and still a G away.
 */
export const G_ALIASES: Record<string, string> = { y: 'day', u: 'upcoming', w: 'upcoming', '+': 'upcoming', z: 'later', o: 'routines', q: 'matrix', l: 'all', h: 'questions' }

/** The task lists that are tabs of the one Tasks row: on any of them, its row is lit. */
export const TASK_PAGES = ['today', 'tomorrow', 'week', 'upcoming', 'later', 'routines', 'matrix']

/** The row a page lights: a task list lights Tasks, a question Pages, every capture list the Inbox. */
export const litRow = (id: string): string =>
  TASK_PAGES.includes(id) ? 'today' : id === 'questions' ? 'articles' : id === 'all' || id.startsWith('kind:') ? 'inbox' : id === 'home' ? 'day' : id

/** The sidebar's places, in their usual order: the same in every book. */
export function useSections(): typeof SECTIONS {
  return SECTIONS
}

/** Rows that just joined the sidebar: each rises in once, the first time it is drawn. */
export const risen = new Set<string>()
/** The box's tabs, in their row's order; ⌃1 to ⌃5 reach each, shown or not. */
export const BOX_TABS: Place[] = [
  { id: 'inbox', label: 'Inbox', icon: Inbox, tint: 'blue' },
  { id: 'today', label: 'Tasks', icon: ListChecks, tint: 'green' },
  { id: 'review', label: 'Review', icon: Brain, tint: 'purple' },
  { id: 'kept', label: 'Saved', icon: Gem, tint: 'pink' },
  { id: 'recent', label: 'Recent', icon: History, alive: HistoryCircleIcon, tint: 'gray' }
]

/** Every page in the sidebar from the start, to hide the ones you never use; the box keeps its few tabs. */
type Shown = 'sidebarShown' | 'boxTabs'
const SHOWN: Record<Shown, string[]> = {
  sidebarShown: SHAPE,
  boxTabs: ['inbox', 'today', 'review', 'kept']
}

/** A list kept in your own order, and which list's order each show-setting goes with. */
export type Ordered = 'sidebarOrder' | 'boxTabsOrder' | 'pinOrder'
const ORDER_OF: Record<Shown, Ordered> = { sidebarShown: 'sidebarOrder', boxTabs: 'boxTabsOrder' }
const same = (id: string): string => id

/** The ids of a list in your order, saved; empty is the usual order. */
export function useOrder(setting: Ordered): string[] {
  const settings = useLive(haligtree.settings, null as Settings | null)
  return settings?.[setting] ?? []
}
/** `usual` in your order, followed live as it changes anywhere. */
export function useInOrder<T>(usual: T[], setting: Ordered, keyOf: (one: T) => string): T[] {
  return inOrder(usual, useOrder(setting), keyOf)
}

/**
 * A change to the order, read and written whole from the latest saved one, so
 * two quick moves never lose one. Answers with the row-moved sound; one that
 * cannot move (already at the end) with the soft no.
 */
export async function reorder(setting: Ordered, usual: string[], change: (order: string[]) => string[] | null, said?: string): Promise<boolean> {
  const was = (await haligtree.settings())[setting] ?? []
  const next = change(inOrder(usual, was, same))
  if (!next) return (chime('nope'), false)
  chime('shift')
  await haligtree.setSettings({ [setting]: isUsual(next, usual) ? [] : next })
  // Said in a word, with Undo (and so ⌘Z) to put it back where it was.
  if (said) quietly(() => void haligtree.setSettings({ [setting]: was }).then(() => chime('shift')))
  return true
}
/** A row dropped on another: before it going up, after it going down. `nameOf` names it in what is said. */
export const dropOrder = (setting: Ordered, usual: string[], nameOf?: (id: string) => string | undefined) => (id: string, target: string, after: boolean): void =>
  void reorder(setting, usual, (order) => moved(order, id, target, after), `Moved${nameOf?.(id) ? ` “${nameOf(id)}”` : ''}`)

/** The usual order back, said, with Undo. */
export async function backToUsual(setting: Ordered, what: string): Promise<void> {
  const was = (await haligtree.settings())[setting] ?? []
  if (!was.length) return
  chime('settled')
  await haligtree.setSettings({ [setting]: [] })
  toast(`${what} back in the usual order`, () => void haligtree.setSettings({ [setting]: was }).then(() => chime('shift')))
}

/**
 * The lines a row's right-click menu offers to move it: up or down among the
 * rows shown with it (left or right for tabs), and the usual order back once
 * it has been changed.
 */
export function orderItems({ setting, usual, id, among, what, name, sideways = false }: {
  setting: Ordered; usual: string[]; id: string; among: string[]; what: string; name: string; sideways?: boolean
}, custom: boolean): RowItem[] {
  const at = among.indexOf(id)
  const [back, on] = sideways ? ['left', 'right'] : ['up', 'down']
  return [
    at > 0 && { label: `Move ${back}`, run: () => void reorder(setting, usual, (order) => stepped(order, id, -1, among), `Moved “${name}” ${back}`) },
    at >= 0 && at < among.length - 1 && { label: `Move ${on}`, run: () => void reorder(setting, usual, (order) => stepped(order, id, 1, among), `Moved “${name}” ${on}`) },
    custom && { label: 'Back to usual order', run: () => void backToUsual(setting, what) }
  ]
}

/**
 * The sidebar's places as it draws them, in your order: runs of places in the
 * usual order (Write, Do, then the rest), each holding only the places in
 * `shown` (Customize passes every place, to list them all with a switch). No
 * run has a heading: a gap sits between them. A row moves only within its own
 * part. A part with nothing shown is gone.
 */
export type SidebarPart = { key: string; group?: Group; list: (typeof SECTIONS)[number][] }
export function sidebarParts(usual: typeof SECTIONS, ordered: typeof SECTIONS, shown: string[]): SidebarPart[] {
  const runs: { group?: Group; ids: string[] }[] = []
  for (const one of usual) {
    const last = runs[runs.length - 1]
    if (last && last.group === one.group) last.ids.push(one.id)
    else runs.push({ group: one.group, ids: [one.id] })
  }
  return runs.map((run) => ({
    key: run.group ?? 'rest',
    group: run.group,
    list: ordered.filter((one) => run.ids.includes(one.id) && shown.includes(one.id))
  }))
}

/**
 * The words for showing or hiding a sidebar place, the same in the sidebar's
 * right click and in Customize: the menu line, and what is said once it has
 * changed. Hidden is gone from the sidebar, so the toast says how to reach it.
 */
export function showWords(place: Place, on: boolean): { label: string; said: string } {
  const where = place.group ? `in ${place.group}` : 'in the sidebar'
  return on
    ? { label: 'Hide from the sidebar', said: `“${place.label}” hidden. ${place.key ? `G ${place.key.toUpperCase()} or ` : ''}⌘K still opens it` }
    : { label: 'Show in the sidebar', said: `“${place.label}” shows ${where} now` }
}

/** A place's icon in its theme colour, softened unless `full`. */
export function PlaceIcon({ place, full }: { place: Place; full?: boolean }): React.JSX.Element {
  const className = `size-4 shrink-0 transition-colors duration-80 ${full ? 'text-[var(--tint)]' : 'text-[color-mix(in_oklab,var(--tint)_55%,var(--muted-foreground))] group-hover:text-[var(--tint)] group-data-[fluid-hover-active]:text-[var(--tint)]'}`
  const style = { '--tint': `var(--tt-color-text-${place.tint})` } as CSSProperties
  return place.alive ? <AliveIcon icon={place.alive} size={16} className={className} style={style} /> : <place.icon className={className} style={style} />
}

/**
 * Each place with a switch to show or hide it, saved as you flick it: the
 * sidebar's Customize and Settings both use this. Off means not in the
 * sidebar at all; its row here stays, so it can come back. The last one shown stays,
 * so there is always somewhere to be. In your order, laid out as the sidebar
 * lays it out: drag a row by its grip (or anywhere on it) up or down, or
 * right-click it to move it a step.
 */
export function ShowList({ places: given, setting }: { places: Place[]; setting: Shown }): React.JSX.Element {
  const shown = useShown(setting)
  // The sidebar's own places for this book, laid out as it lays them out.
  const sections = useSections()
  const places = setting === 'sidebarShown' ? sections : given
  const order = ORDER_OF[setting]
  const saved = useOrder(order)
  const ordered = inOrder(places, saved, (place) => place.id)
  const usual = places.map((place) => place.id)
  const what = setting === 'sidebarShown' ? 'The sidebar' : 'The tabs'
  // Read and written whole, so two quick flicks never lose one.
  const flip = async (id: string, on: boolean): Promise<void> => {
    const was = (await haligtree.settings())[setting] ?? SHOWN[setting]
    chime(on ? 'on' : 'off')
    await haligtree.setSettings({ [setting]: on ? [...was.filter((one) => one !== id), id] : was.filter((one) => one !== id) })
  }
  // Each part: what it is called in the DOM, and all its places, on or off, as the sidebar runs them, a gap between.
  const parts: [string, Place[]][] = setting === 'sidebarShown'
    ? sidebarParts(sections, ordered as typeof SECTIONS, places.map((place) => place.id)).map((part): [string, Place[]] => [part.key, part.list])
    : [['top', ordered]]
  // Every one switched on at once, said with Undo; the order stays yours.
  const hidden = places.filter((place) => !shown.includes(place.id))
  const showEvery = async (): Promise<void> => {
    const was = (await haligtree.settings())[setting] ?? SHOWN[setting]
    chime('on')
    await haligtree.setSettings({ [setting]: [...new Set([...was, ...hidden.map((place) => place.id)])] })
    toast(`${hidden.length === 1 ? `“${hidden[0].label}” shows` : `${num(hidden.length)} more show`} ${setting === 'sidebarShown' ? 'in the sidebar' : 'as tabs'} now`, () => void haligtree.setSettings({ [setting]: was }))
  }
  const row = (place: Place, among: string[]): React.JSX.Element => {
    const on = shown.includes(place.id)
    // A switch that cannot be turned off says why, pointed at.
    const why = on && shown.length === 1 ? 'One has to stay, so there is somewhere to be' : ''
    const control = <Switch checked={on} disabled={!!why} onCheckedChange={(next) => void flip(place.id, next)} aria-label={`Show ${place.label}`} />
    return (
      <SortableRow key={place.id} id={place.id} glide={`show-${setting}-${place.id}`}>
        <RowMenu items={[
          ...orderItems({ setting: order, usual, id: place.id, among, what, name: place.label }, saved.length > 0),
          'separator',
          !why && { label: setting === 'sidebarShown' ? showWords(place, on).label : on ? 'Hide this tab' : 'Show this tab', run: () => void flip(place.id, !on) }
        ]}>
          <label data-show-row={place.id}
            className={`group flex cursor-default items-center gap-2.5 rounded-md px-2 py-1.5 text-control text-foreground/80 hover:bg-accent/60 [&>:not(:last-child)]:transition-opacity ${on ? '' : '[&>:not(:last-child)]:opacity-45'}`}>
            <GripVertical aria-hidden className="-mx-1 size-3.5 shrink-0 cursor-grab text-muted-foreground/0 transition-colors group-hover:text-muted-foreground" />
            <PlaceIcon place={place} full={on} />
            <span className={`flex-1 truncate transition-colors ${on ? '' : 'text-muted-foreground'}`}>{place.label}</span>
            {place.key && <span className="flex gap-0.5 opacity-60"><Pressed keys={`G ${place.key.toUpperCase()}`} /></span>}
            {why ? <Tip label={why}><span className="inline-flex">{control}</span></Tip> : control}
          </label>
        </RowMenu>
      </SortableRow>
    )
  }
  return (
    <LayoutGroup id={`show-${setting}`}>
      <div className="flex flex-col gap-px">
        {hidden.length > 0 && (
          <button type="button" data-show-every onClick={() => void showEvery()}
            className="mb-1.5 flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-control font-medium text-foreground transition-colors hover:bg-accent/60 hover:text-foreground">
            <AliveIcon icon={EyeIcon} size={14} />
            {setting === 'sidebarShown' ? 'Show every page' : 'Show every tab'}
          </button>
        )}
        {parts.map(([part, list], at) => list.length > 0 && (
          <div key={part} data-show-part={part} className={`flex flex-col gap-px ${at ? 'mt-2.5' : ''}`}>
            <SortableList items={list} keyOf={(place) => place.id} onMove={dropOrder(order, usual, (id) => places.find((one) => one.id === id)?.label)}>
              {(items) => items.map((place) => row(place, items.map((one) => one.id)))}
            </SortableList>
          </div>
        ))}
        {saved.length > 0 && (
          <button type="button" onClick={() => void backToUsual(order, what)}
            className="mt-1.5 flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-control text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground">
            <AliveIcon icon={RefreshIcon} size={14} />
            Back to usual order
          </button>
        )}
      </div>
    </LayoutGroup>
  )
}

/** Which places a setting shows, the default until it has been changed. */
export function useShown(setting: Shown): string[] {
  const settings = useLive(haligtree.settings, null as Settings | null)
  const list = settings?.[setting] ?? SHOWN[setting]
  return list
}
