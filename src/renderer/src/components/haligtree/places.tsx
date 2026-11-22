import { type ComponentType, type CSSProperties, type RefAttributes } from 'react'
import { Archive, Images, BookUser, Calendar, CalendarFold, CalendarRange, Compass, Flag, ListVideo, Newspaper, Bookmark, Sprout, type LucideIcon } from 'lucide-react'
import { AliveIcon } from '@/components/ui/alive-icon'
import { Switch } from '@/components/ui/switch'
import { chime } from '@/lib/sound'
import { useLive, haligtree, type Settings } from '@/lib/haligtree'
import { useEmojiIcons } from '@/lib/icon-style'
import { Pressed, Tip, toast } from './ui'
import { RowMenu, type RowItem } from './row-menu'
import { BlockList, SortableList, SortableRow } from './sortable'
import { LayoutGroup } from 'motion/react'
import { GripVertical } from 'lucide-react'
import { inOrder, isUsual, moved, stepped } from '@/lib/place-order'
import type { AnimatedIconHandle, AnimatedIconProps } from '@/components/ui/types'
import HomeIcon from '@/components/ui/home-icon'
import FileDescriptionIcon from '@/components/ui/file-description-icon'
import HashtagIcon from '@/components/ui/hashtag-icon'
import ChartBarIcon from '@/components/ui/chart-bar-icon'
import TrashIcon from '@/components/ui/trash-icon'
import RefreshIcon from '@/components/ui/refresh-icon'
import EyeIcon from '@/components/ui/eye-icon'
import HistoryCircleIcon from '@/components/ui/history-circle-icon'
import LinkIcon from '@/components/ui/link-icon'
import { BarChart3, Brain, FileText, Gem, History, House, Inbox, Link as Links, ListTodo as ListChecks, Orbit, Sun, Tag, Trash2 } from '@/components/ui/icons'
import { APP_NAME } from '../../../../main/name'
import { SIDEBAR_SHAPE } from '../../../../main/sidebar-shape'
import { num } from '../../../../main/dates'
import { quoted } from '../../../../main/clip'

/** A run of the sidebar's places with a gap before it and no heading: what you write and keep, then what you do. */
/** The sidebar's runs: what you use every day, then Library (what you keep and come back to, and Stats and the Map,
 * how it is going), folded under its heading; the Bin, Archived and the powers sit in the sidebar's foot. */
export type Group = 'Write' | 'Library'
/** A place the main window's sidebar or the box's tabs can show. */
export type Place = {
  id: string; label: string; icon: LucideIcon; tint: string; key?: string; group?: Group
  /** Its emoji, for "Icons: Emoji" (lib/icon-style.ts). */
  emoji?: string
  /** The same drawing, moving when its row is pointed at, where itshover has one. */
  alive?: ComponentType<AnimatedIconProps & RefAttributes<AnimatedIconHandle>>
}

/**
 * The main window's sections, each with the key that jumps to it after G, in
 * the order the sidebar lists them: writing first (Home, Inbox, Journal, Pages, Gems,
 * Review), then a gap, then doing (Tasks, Calendar), then the rest. Each has
 * its own colour from the theme. Which ones show is a setting
 * (`sidebarShown`), the same for every book to start: one switched off is
 * not in the sidebar at all, and is still a G and its letter, or ⌘K, away.
 * This is the usual order: dragged or moved from a row's right-click menu,
 * yours is kept as `sidebarOrder` (useInOrder).
 */
export const SECTIONS: (Place & { key: string })[] = [
  // On top, where you start: where things come back to you: shelves of what you opened and kept, and the card for the moment.
  { id: 'home', emoji: '🏠', label: 'Home', icon: House, alive: HomeIcon, key: 'y', tint: 'orange', group: 'Write' },
  // Where everything you catch lands first, under Home.
  { id: 'inbox', emoji: '📥', label: 'Inbox', icon: Inbox, key: 'i', tint: 'blue', group: 'Write' },
  // Journal, the Day page: the day's writing on top, today's tasks under it. The window opens here.
  // Its Week, Month and Year keep this row lit (litRow), unless that page is a row of its own.
  { id: 'day', emoji: '☀️', label: 'Journal', icon: Sun, key: 'p', tint: 'orange', group: 'Write' },
  { id: 'articles', emoji: '📝', label: 'Writing', icon: FileText, alive: FileDescriptionIcon, key: 'a', tint: 'brown', group: 'Write' },
  // What you keep wondering about, each collecting clues: a row of its own under Writing, never one of Writing's folders,
  // so it is not mistaken for a folder of the same name. Its Looked up tab lights it too (litRow).
  { id: 'questions', emoji: '🪐', label: 'Questions', icon: Orbit, key: 'h', tint: 'blue', group: 'Library' },
  { id: 'nuggets', emoji: '💎', label: 'Gems', icon: Gem, key: 'n', tint: 'pink', group: 'Library' },
  { id: 'review', emoji: '🧠', label: 'Review', icon: Brain, key: 'r', tint: 'purple', group: 'Write' },
  // One row for every task list: Today, Upcoming, Later and Routines are its tabs (tasks-view.tsx).
  { id: 'today', emoji: '✅', label: 'Tasks', icon: ListChecks, key: 't', tint: 'green', group: 'Write' },
  // Day, week and month by the hour, the way a calendar app has them (calendar-view.tsx).
  { id: 'calendar', emoji: '📅', label: 'Calendar', icon: Calendar, key: 'c', tint: 'red', group: 'Write' },
  // Goals: a day you are working toward, and the road there. Looks ahead, so it sits with Tasks and Calendar, not in
  // Library with Stats and the Map (they look at what you did).
  { id: 'goals', emoji: '🚩', label: 'Goals', icon: Flag, key: 'e', tint: 'orange', group: 'Write' },
  // The rest: off to start, a G and its letter or ⌘K away, each switched on in "Customize sidebar…".
  { id: 'weekpage', emoji: '🗓️', label: "Week's page", icon: CalendarFold, key: 'k', tint: 'yellow' },
  { id: 'monthpage', emoji: '🌱', label: "Month's page", icon: Sprout, key: 'm', tint: 'yellow' },
  // The day's twenty or so of your own things, as a timeline that ends (feed-view.tsx).
  // W, not G: G G is a list's first row, as in Vim.
  { id: 'feed', emoji: '📰', label: 'Feed', icon: Newspaper, key: 'w', tint: 'pink', group: 'Library' },
  // What you mean to read next, in order, Spotify's way.
  { id: 'queue', emoji: '🎞️', label: 'Queue', icon: ListVideo, key: 'b', tint: 'blue', group: 'Library' },
  { id: 'tags', emoji: '🏷️', label: 'Tags', icon: Tag, alive: HashtagIcon, key: '#', tint: 'red' },
  // Every person and source your notes are from, a page each (source-page.tsx).
  { id: 'sources', emoji: '👤', label: 'Sources', icon: BookUser, key: 'j', tint: 'blue', group: 'Library' },
  { id: 'stats', emoji: '📊', label: 'Stats', icon: BarChart3, alive: ChartBarIcon, key: 's', tint: 'blue', group: 'Library' },
  // Every note you have linked, as a map of dots and lines.
  { id: 'map', emoji: '🗺️', label: 'Map', icon: Links, alive: LinkIcon, key: 'x', tint: 'purple', group: 'Library' },
  // Every picture, GIF, PDF and recording your notes keep, as a grid (media-view.tsx). G and the comma: every letter is taken.
  { id: 'media', emoji: '🖼️', label: 'Files', icon: Images, key: ',', tint: 'purple', group: 'Library' },
  { id: 'discarded', emoji: '🗑️', label: 'Bin', icon: Trash2, alive: TrashIcon, key: 'd', tint: 'gray' },
  // Out of sight, not let go: apart from the exits.
  { id: 'archived', emoji: '🗄️', label: 'Archived', icon: Archive, key: 'v', tint: 'gray' },
  // Every power Haligtree keeps out of sight, a card each (powers-view.tsx).
  { id: 'powers', emoji: '🧭', label: `What ${APP_NAME} can do`, icon: Compass, key: 'f', tint: 'green' }
]

/** Library's heading in the sidebar: what you keep and come back to, under one fold. Not a page. */
export const LIBRARY: Place = { id: 'library', emoji: '📚', label: 'Library', icon: Gem, tint: 'pink' }
/** Kept in the sidebar's foot as small icons beside the book's menu, out of the list: places you go to now and then. */
export const FOOT = ['discarded', 'archived', 'powers'] as const

/** Journal's Week, Month and Year, hung under its row in the sidebar as Writing's folders are (home.tsx). */
export const JOURNAL_SCALES: Place[] = [
  { id: 'weekpage', emoji: '🗓️', label: 'Week', icon: CalendarFold, tint: 'yellow' },
  { id: 'monthpage', emoji: '🌱', label: 'Month', icon: Sprout, tint: 'yellow' },
  { id: 'yearpage', emoji: '🗺️', label: 'Year', icon: CalendarRange, tint: 'yellow' }
]

/**
 * The sidebar's two lists of notes, not pages: Favorites (what you added) and
 * Recent (the last few you opened), under the first run of pages. Each has a
 * switch beside the pages', kept apart as the ones switched off
 * (`sidebarGroupsOff`), so every book shows both until one is switched off.
 * No G key, no ⌘K line and nothing to open: switched off, its heading and its
 * notes are gone from the sidebar. They sit where the sidebar draws them, so they do not drag.
 */
export const SIDE_GROUPS: Place[] = [
  { id: 'pinned', emoji: '🔖', label: 'Favorites', icon: Bookmark, tint: 'yellow' },
  { id: 'recent', emoji: '🕰️', label: 'Recent', icon: History, alive: HistoryCircleIcon, tint: 'gray' }
]
const isGroup = (id: string): boolean => SIDE_GROUPS.some((one) => one.id === id)
/** Pinned or Recent switched on or off, read and written whole; answers with what was switched off before, for Undo. */
export async function showGroup(id: string, on: boolean): Promise<string[]> {
  const was = (await haligtree.settings()).sidebarGroupsOff ?? []
  chime(on ? 'on' : 'off')
  await haligtree.setSettings({ sidebarGroupsOff: on ? was.filter((one) => one !== id) : [...was.filter((one) => one !== id), id] })
  return was
}

/** What every book's sidebar shows to start: the two runs, then Tags and the Bin (main/sidebar-shape.ts). */
export const SHAPE = SIDEBAR_SHAPE

/**
 * G and a letter for pages that are not rows of their own any more: the task
 * lists are tabs of one row now, and still a G away.
 */
export const G_ALIASES: Record<string, string> = { u: 'upcoming', '+': 'upcoming', z: 'later', o: 'routines', '*': 'alltasks', q: 'matrix', l: 'all', '.': 'lookups' }

/** The task lists that are tabs of the one Tasks row: on any of them, its row is lit. */
export const TASK_PAGES = ['today', 'tomorrow', 'week', 'upcoming', 'later', 'routines', 'alltasks', 'matrix', 'projects', 'project']

/**
 * The row a page lights, the one rule: a page opened from a row lights that
 * row, whichever tab, mode or date it is on. A task list lights Tasks, Looked up
 * lights Questions, every capture list the Inbox, and Day, Week, Month and Year
 * light Journal on any date; Week's or Month's page lights its own row while
 * that row is in the sidebar (`shown`).
 */
export const litRow = (id: string, shown: string[] = []): string =>
  TASK_PAGES.includes(id) ? 'today' : id === 'folders' ? 'articles' : id === 'lookups' ? 'questions' : id === 'all' || id.startsWith('kind:') ? 'inbox' : id === 'pdf' ? 'media' : id === 'web' ? 'queue' : id === 'source' ? 'sources'
    : (id === 'weekpage' || id === 'monthpage') && shown.includes(id) ? id : id === 'weekpage' || id === 'monthpage' || id === 'yearpage' ? 'day' : id

/** The sidebar's places, in their usual order: the same in every book. */
/** Pages reached under Journal only, never sidebar rows: no menu or switch offers to put them there. */
export const OFF_SIDEBAR = ['weekpage', 'monthpage']

export function useSections(): typeof SECTIONS {
  return SECTIONS
}

/** Rows that just joined the sidebar: each rises in once, the first time it is drawn. */
export const risen = new Set<string>()
/** The box's tabs, in their row's order; ⌃1 to ⌃5 reach each, shown or not. */
export const BOX_TABS: Place[] = [
  { id: 'inbox', emoji: '📥', label: 'Inbox', icon: Inbox, tint: 'blue' },
  { id: 'today', emoji: '✅', label: 'Tasks', icon: ListChecks, tint: 'green' },
  { id: 'review', emoji: '🧠', label: 'Review', icon: Brain, tint: 'purple' },
  { id: 'kept', label: 'Saved', icon: Gem, tint: 'pink' },
  { id: 'recent', emoji: '🕰️', label: 'Recent', icon: History, alive: HistoryCircleIcon, tint: 'gray' }
]

/** Every page in the sidebar from the start, to hide the ones you never use; the box keeps its few tabs. */
type Shown = 'sidebarShown' | 'boxTabs'
const SHOWN: Record<Shown, string[]> = {
  sidebarShown: SHAPE,
  boxTabs: ['inbox', 'today', 'review', 'kept']
}

/** The pages the sidebar shows, in its order (yours, if you moved them): what "Open Haligtree to" may offer. */
export const shownPages = (settings: Settings | null): string[] => {
  const shown = (settings?.sidebarShown ?? SHOWN.sidebarShown).filter((id) => !OFF_SIDEBAR.includes(id))
  const order = settings?.sidebarOrder ?? []
  const at = (id: string): number => (order.includes(id) ? order.indexOf(id) : order.length + SECTIONS.findIndex((one) => one.id === id))
  return SECTIONS.map((one) => one.id).filter((id) => shown.includes(id)).sort((a, b) => at(a) - at(b))
}

/** The page Haligtree opens on: the one chosen, or, hidden from the sidebar since, the first page it shows. */
export const startPageOf = (settings: Settings | null, offered: string[] = SECTIONS.map((one) => one.id)): string => {
  const shown = shownPages(settings)
  const chosen = settings?.startPage || 'day'
  return shown.includes(chosen) ? chosen : shown.find((id) => offered.includes(id)) ?? shown[0] ?? 'day'
}

/** A list kept in your own order, and which list's order each show-setting goes with. */
export type Ordered = 'sidebarOrder' | 'boxTabsOrder' | 'pinOrder' | 'tagOrder'
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
  if (said) toast(said, () => void haligtree.setSettings({ [setting]: was }).then(() => chime('shift')))
  return true
}
/** A row dropped on another: before it going up, after it going down. `nameOf` names it in what is said. */
export const dropOrder = (setting: Ordered, usual: string[], nameOf?: (id: string) => string | undefined) => (id: string, target: string, after: boolean): void =>
  void reorder(setting, usual, (order) => moved(order, id, target, after), `Moved${nameOf?.(id) ? ` ${quoted(nameOf(id), 80)}` : ''}`)

/** The usual order back, said, with Undo. */
async function backToUsual(setting: Ordered, what: string): Promise<void> {
  const settings = await haligtree.settings()
  const was = settings[setting] ?? []
  // The sidebar's blocks go back with its order: every page in its own again.
  const groups = setting === 'sidebarOrder' ? settings.sidebarGroups ?? {} : {}
  if (!was.length && !Object.keys(groups).length) return
  chime('settled')
  await haligtree.setSettings({ [setting]: [], ...(setting === 'sidebarOrder' ? { sidebarGroups: {} } : {}) })
  toast(`${what} back in the usual order`, () => void haligtree.setSettings({ [setting]: was, ...(setting === 'sidebarOrder' ? { sidebarGroups: groups } : {}) }).then(() => chime('shift')))
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
    at > 0 && { label: `Move ${back}`, run: () => void reorder(setting, usual, (order) => stepped(order, id, -1, among), `Moved ${quoted(name, 80)} ${back}`) },
    at >= 0 && at < among.length - 1 && { label: `Move ${on}`, run: () => void reorder(setting, usual, (order) => stepped(order, id, 1, among), `Moved ${quoted(name, 80)} ${on}`) },
    custom && { label: 'Back to usual order', run: () => void backToUsual(setting, what) }
  ]
}

/**
 * The sidebar's places as it draws them, in your order: runs of places in the
 * usual order (the places, then the rest), each holding only the places in
 * `shown` (Customize passes every place, to list them all with a switch). No
 * run has a heading: a gap sits between them. A row dragged into another run
 * stays in it (`groups`, saved as `sidebarGroups`). A part with nothing shown is gone.
 */
type SidebarPart = { key: string; group?: Group; list: (typeof SECTIONS)[number][] }
/** Which block a place is in: the one it was dragged into, else its own ("rest" for the ungrouped). */
export const blockOf = (place: Place, groups: Record<string, string> = {}): string => {
  const block = groups[place.id] ?? place.group ?? 'rest'
  // Tasks and Calendar were a block of their own ('Do'); a row dragged into it then is in the one list now. Look back
  // (Stats, the Map) went into Library (the user, 20 Nov: one heading fewer), and a row once dragged there with it.
  return block === 'Do' ? 'Write' : block === 'Look' ? 'Library' : block
}
export function sidebarParts(usual: typeof SECTIONS, ordered: typeof SECTIONS, shown: string[], groups: Record<string, string> = {}): SidebarPart[] {
  const runs: { group?: Group; key: string }[] = []
  for (const one of usual) if (!runs.some((run) => run.group === one.group)) runs.push({ group: one.group, key: one.group ?? 'rest' })
  return runs.map((run) => ({
    key: run.key,
    group: run.group,
    list: ordered.filter((one) => blockOf(one, groups) === run.key && shown.includes(one.id) && !(FOOT as readonly string[]).includes(one.id))
  }))
}

/**
 * A sidebar row dropped into a block, before one of its rows or at its end:
 * the order and the block saved together, read whole from the latest saved
 * ones, said with Undo. `shown` is what the sidebar shows, to find a block's end.
 */
export async function dropInBlock(id: string, block: string, before: string | null, shown: string[]): Promise<void> {
  const settings = await haligtree.settings()
  const was = { sidebarOrder: settings.sidebarOrder ?? [], sidebarGroups: settings.sidebarGroups ?? {} }
  const place = SECTIONS.find((one) => one.id === id)
  if (!place) return
  const groups = { ...was.sidebarGroups }
  if ((place.group ?? 'rest') === block) delete groups[id]
  else groups[id] = block
  const order = inOrder(SECTIONS, was.sidebarOrder, (one) => one.id).filter((one) => one.id !== id)
  const inBlock = order.filter((one) => blockOf(one, groups) === block && shown.includes(one.id))
  const at = before ? order.findIndex((one) => one.id === before) : inBlock.length ? order.indexOf(inBlock[inBlock.length - 1]) + 1 : order.length
  const next = order.map((one) => one.id)
  next.splice(at < 0 ? next.length : at, 0, id)
  const usual = SECTIONS.map((one) => one.id)
  chime('shift')
  await haligtree.setSettings({ sidebarOrder: isUsual(next, usual) ? [] : next, sidebarGroups: groups })
  // Said, as every drop is, with Undo (and so ⌘Z) to put it back where it was.
  toast(`Moved ${quoted(place.label, 80)}`, () => void haligtree.setSettings(was).then(() => chime('shift')))
}

/**
 * The words for showing or hiding a sidebar place, the same in the sidebar's
 * right click and in Customize: the menu line, and what is said once it has
 * changed. Hidden is gone from the sidebar, so the toast says how to reach it.
 */
export function showWords(place: Place, on: boolean): { label: string; said: string } {
  const where = place.group ? `in ${place.group}` : 'in the sidebar'
  // Pinned and Recent are no page to open: Customize is the way back.
  const back = isGroup(place.id) ? '“Customize sidebar…” shows it again' : `${place.key ? `G ${place.key.toUpperCase()} or ` : ''}⌘K still opens it`
  return on
    ? { label: 'Hide from the sidebar', said: `${quoted(place.label, 80)} hidden. ${back}` }
    : { label: 'Show in the sidebar', said: `${quoted(place.label, 80)} shows ${where} now` }
}

/** A place's icon in its theme colour, softened unless `full`. */
export function PlaceIcon({ place, full }: { place: Place; full?: boolean }): React.JSX.Element {
  const emoji = useEmojiIcons()
  if (emoji && place.emoji) return <span aria-hidden className={`mf-emoji-icon flex size-4 shrink-0 items-center justify-center text-[0.875rem] leading-none`}>{place.emoji}</span>
  const className = `size-4 shrink-0 transition-colors duration-80 ${full ? 'text-[var(--tint)]' : 'text-[color-mix(in_oklab,var(--tint)_55%,var(--muted-foreground))] group-hover:text-[var(--tint)] group-data-[fluid-hover-active]:text-[var(--tint)]'}`
  // Its own colour, unless "Coloured icons" is off: then the one colour the root gives (main.css).
  const style = { '--tint': `var(--mf-icon-tint, var(--tt-color-text-${place.tint}))` } as CSSProperties
  return place.alive ? <AliveIcon icon={place.alive} size={16} className={className} style={style} /> : <place.icon className={className} style={style} />
}

type Drawing = ComponentType<{ className?: string; style?: CSSProperties }>
const drawings = new Map<string, Drawing>()
/**
 * A place's drawing as a plain icon, sized and coloured by whoever draws it: the
 * one its sidebar row shows (its emoji under "Icons: Emoji", its moving drawing
 * where it has one), for a page named among notes (a split's panes). One per place, so it is never drawn anew.
 */
export const placeDrawing = (place: Place): Drawing => {
  const made = drawings.get(place.id)
  if (made) return made
  const Drawn: Drawing = ({ className, style }) => {
    const emoji = useEmojiIcons()
    if (emoji && place.emoji) return <span aria-hidden style={style} className={`mf-emoji-icon flex items-center justify-center text-[0.8125rem] leading-none ${className ?? ''}`}>{place.emoji}</span>
    return place.alive ? <AliveIcon icon={place.alive} size={/\bsize-4\b/.test(className ?? '') ? 16 : 14} className={className} style={style} /> : <place.icon className={className} style={style} />
  }
  drawings.set(place.id, Drawn)
  return Drawn
}

/**
 * Each place with a switch to show or hide it, saved as you flick it: the
 * sidebar's Customize and Settings both use this. Off means not in the
 * sidebar at all; its row here stays, so it can come back. The last one shown stays,
 * so there is always somewhere to be. In your order, laid out as the sidebar
 * lays it out: drag a row by its grip (or anywhere on it) up or down, or
 * right-click it to move it a step.
 */
/** The sidebar's pages that carry a count beside them (home.tsx, counts); the rest only show something, or are a place to set things down. */
const COUNTED = ['review', 'today', 'nuggets', 'articles', 'questions', 'goals', 'queue', 'lookups', 'sources']

export function ShowList({ places: every, setting, counts }: { places: Place[]; setting: Shown; counts?: Record<string, number> }): React.JSX.Element {
  const given = setting === 'sidebarShown' ? every.filter((one) => !OFF_SIDEBAR.includes(one.id)) : every
  const shown = useShown(setting)
  // The sidebar's own places for this book, laid out as it lays them out.
  const sections = useSections()
  const places = setting === 'sidebarShown' ? sections : given
  const order = ORDER_OF[setting]
  const saved = useOrder(order)
  // The blocks rows were dragged into, so this lists them where the sidebar has them.
  const settings = useLive(haligtree.settings, null as Settings | null)
  const groups = settings?.sidebarGroups ?? {}
  // The sidebar's counts: all of them on or off here, and each page's own beside its switch.
  const countsOn = settings?.sidebarCounts !== false
  const countsOff = settings?.sidebarCountsOff ?? []
  const flipCount = async (id: string): Promise<void> => {
    const was = (await haligtree.settings()).sidebarCountsOff ?? []
    chime(was.includes(id) ? 'on' : 'off')
    await haligtree.setSettings({ sidebarCountsOff: was.includes(id) ? was.filter((one) => one !== id) : [...was, id] })
  }
  const ordered = inOrder(places, saved, (place) => place.id)
  const custom = saved.length > 0 || (setting === 'sidebarShown' && Object.keys(groups).length > 0)
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
    ? sidebarParts(sections, ordered as typeof SECTIONS, places.map((place) => place.id), groups).map((part): [string, Place[]] => [part.key, part.list])
    : [['top', ordered]]
  // Every one switched on at once, said with Undo; the order stays yours.
  const hiddenPages = places.filter((place) => !shown.includes(place.id))
  // Pinned and Recent switched off, kept apart from the pages (SIDE_GROUPS).
  const groupsOff = settings?.sidebarGroupsOff ?? []
  const hiddenGroups = setting === 'sidebarShown' ? SIDE_GROUPS.filter((group) => groupsOff.includes(group.id)) : []
  const hidden = [...hiddenPages, ...hiddenGroups]
  const showEvery = async (): Promise<void> => {
    const now = await haligtree.settings()
    const shownWas = now[setting] ?? SHOWN[setting]
    const was = { [setting]: shownWas, ...(hiddenGroups.length ? { sidebarGroupsOff: now.sidebarGroupsOff ?? [] } : {}) }
    chime('on')
    await haligtree.setSettings({ [setting]: [...new Set([...shownWas, ...hiddenPages.map((place) => place.id)])], ...(hiddenGroups.length ? { sidebarGroupsOff: [] } : {}) })
    toast(`${hidden.length === 1 ? `${quoted(hidden[0].label, 80)} shows` : `${num(hidden.length)} more show`} ${setting === 'sidebarShown' ? 'in the sidebar' : 'as tabs'} now`, () => void haligtree.setSettings(was))
  }
  // `fixed`: Pinned and Recent, where the sidebar draws them, with no grip and no moves.
  const row = (place: Place, among: string[], fixed = false): React.JSX.Element => {
    const on = fixed ? !groupsOff.includes(place.id) : shown.includes(place.id)
    // A switch that cannot be turned off says why, pointed at.
    const why = on && !fixed && shown.length === 1 ? 'One has to stay, so there is somewhere to be' : ''
    const set = (next: boolean): void => void (fixed ? showGroup(place.id, next) : flip(place.id, next))
    const control = <Switch checked={on} disabled={!!why} onCheckedChange={set} aria-label={`Show ${place.label}`} />
    const line = (
        <RowMenu items={[
          ...(fixed ? [] : orderItems({ setting: order, usual, id: place.id, among, what, name: place.label }, custom)),
          'separator',
          !why && { label: setting === 'sidebarShown' ? showWords(place, on).label : on ? 'Hide this tab' : 'Show this tab', run: () => set(!on) }
        ]}>
          <label data-show-row={place.id} data-set-aside={on ? undefined : ''}
            className="group flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-control text-(--mf-muted-strong) hover:bg-accent/60">
            {fixed ? <span aria-hidden className="-mx-1 size-3.5 shrink-0" /> : <GripVertical aria-hidden className="-mx-1 size-3.5 shrink-0 cursor-grab text-muted-foreground/0 transition-colors group-hover:text-muted-foreground" />}
            <PlaceIcon place={place} full={on} />
            <span className={`flex-1 truncate transition-colors ${on ? '' : 'text-muted-foreground'}`}>{place.label}</span>
            {place.key && <span className="flex gap-0.5"><Pressed keys={`G ${place.key.toUpperCase()}`} /></span>}
            {/* Every row keeps the chip's room, so the letters and switches stand in one column; room for the whole word "Count" (it was cut to "Co..."). */}
            {setting === 'sidebarShown' && !COUNTED.includes(place.id) && <span aria-hidden className="w-14 shrink-0" />}
            {setting === 'sidebarShown' && COUNTED.includes(place.id) && (
              // Its count, as a quiet chip that dims when off; a click here is the chip's, never the row's switch.
              <Tip label={countsOff.includes(place.id) ? 'Show its count' : 'Hide its count'}>
                <span role="switch" tabIndex={countsOn ? 0 : -1} aria-disabled={!countsOn || undefined} aria-checked={!countsOff.includes(place.id)} aria-label={`${place.label}'s count`} data-count-chip={place.id}
                  onClick={(event) => (event.preventDefault(), void flipCount(place.id))}
                  onKeyDown={(event) => (event.key === ' ' || event.key === 'Enter') && (event.preventDefault(), void flipCount(place.id))}
                  className={`w-14 shrink-0 cursor-pointer whitespace-nowrap rounded-md bg-accent/70 px-1.5 py-px text-center text-xs tabular-nums transition-opacity hover:bg-accent ${!countsOn ? 'pointer-events-none opacity-30' : countsOff.includes(place.id) ? 'bg-transparent! text-muted-foreground ring-1 ring-inset ring-border' : 'text-(--mf-muted-strong)'}`}>
                  {counts ? num(counts[place.id] ?? 0) : 'Count'}
                </span>
              </Tip>
            )}
            {why ? <Tip label={why}><span className="inline-flex">{control}</span></Tip> : control}
          </label>
        </RowMenu>
    )
    return fixed ? <div key={place.id}>{line}</div> : <SortableRow key={place.id} id={place.id} glide={`show-${setting}-${place.id}`}>{line}</SortableRow>
  }
  return (
    <LayoutGroup id={`show-${setting}`}>
      <div className="flex flex-col gap-px">
        {setting === 'sidebarShown' && (
          <label data-show-counts className="mb-1.5 flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-control font-medium text-foreground hover:bg-accent/60">
            <span className="flex-1">Show counts</span>
            <Switch checked={countsOn} onCheckedChange={(sidebarCounts) => (chime(sidebarCounts ? 'on' : 'off'), void haligtree.setSettings({ sidebarCounts }))} aria-label="Show counts" />
          </label>
        )}
        {hidden.length > 0 && (
          <button type="button" data-show-every onClick={() => void showEvery()}
            className="mb-1.5 flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-control font-medium text-foreground transition-colors hover:bg-accent/60 hover:text-foreground">
            <AliveIcon icon={EyeIcon} size={14} />
            {setting === 'sidebarShown' ? (hidden.some((place) => isGroup(place.id)) ? 'Show everything' : 'Show every page') : 'Show every tab'}
          </button>
        )}
        {setting === 'sidebarShown' ? (
          // The sidebar's blocks, with the sidebar's own gap between: a row goes anywhere, into whichever block the line is in.
          <BlockList
            blocks={parts.map(([key, items]) => ({ key, items }))}
            keyOf={(place) => place.id}
            onMove={(id, drop) => void dropInBlock(id, drop.block, drop.before, usual)}
            row={(place, among) => row(place, among)}
            around={(block, at, box, items) => (
              <div key={block} data-show-part={block} className="flex flex-col">
                {block === 'Library' && items.length > 0
                  ? <div data-show-heading="library" className="mt-2.5 mb-0.5 px-2 py-0.5 text-meta text-muted-foreground">{LIBRARY.label}</div>
                  : at > 0 && items.length > 0 && <div data-side-gap aria-hidden className="mt-2.5 mb-0.5 min-h-1" />}
                {box}
                {/* Pinned and Recent, under the first run, as the sidebar has them. */}
                {block === 'Write' && <div data-show-groups className="mt-2.5 flex flex-col gap-px">{SIDE_GROUPS.map((group) => row(group, [], true))}</div>}
              </div>
            )}
          />
        ) : parts.map(([part, list]) => list.length > 0 && (
          <div key={part} data-show-part={part} className="flex flex-col gap-px">
            <SortableList items={list} keyOf={(place) => place.id} onMove={dropOrder(order, usual, (id) => places.find((one) => one.id === id)?.label)}>
              {(items) => items.map((place) => row(place, items.map((one) => one.id)))}
            </SortableList>
          </div>
        ))}
        {custom && (
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

/** Whether a place is in the sidebar now, read once (not as a hook): a hidden page is not somewhere to land. */
export const inSidebar = async (id: string): Promise<boolean> => ((await haligtree.settings()).sidebarShown ?? SHOWN.sidebarShown).includes(id)

/** Which places a setting shows, the default until it has been changed. */
export function useShown(setting: Shown): string[] {
  const settings = useLive(haligtree.settings, null as Settings | null)
  const list = settings?.[setting] ?? SHOWN[setting]
  return list
}
