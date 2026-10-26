import { byKind } from '@/components/capture-kinds/capture-kind-picker'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { AlignJustify, Grid3x3, X } from 'lucide-react'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'

import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Count, Island, Rolling, Tip, typing } from './ui'
import { chime } from '@/lib/sound'
import { glideWay, spring, still } from '@/lib/motion'
import { Highlight, useChosen, useFluidHover, Weighted } from './glide'
import SlidersHorizontalIcon from '@/components/ui/sliders-horizontal-icon'
import { AliveIcon } from '@/components/ui/alive-icon'
import { dayjs, daysSince, num } from '../../../../main/dates'
import { useHere } from '@/lib/split'
import { Check, ChevronDown, LayoutGrid, List as LayoutList } from '@/components/ui/icons'

/**
 * Display, the way Todoist and Linear do it: one button on a list that holds
 * how it is grouped, how it is ordered, and what it shows. Within one filter
 * any chosen option will do; across filters, all must hold. Each list keeps
 * its own choices, in this browser only: they are how you look, not data.
 */
export type Choice = {
  id: string
  label: string
  /** Drawn beside it in Display's menus, in its tint: a kind's own icon. */
  icon?: React.ComponentType<{ className?: string; style?: React.CSSProperties }>
  /** A colour that means something here: a kind's or a tag's. */
  tint?: string
  /** What choosing it does, pointed at: for a word that does not say it alone. */
  tip?: string
}
export type Facet<T> = { key: string; label: string; options: Choice[]; test: (item: T, option: string) => boolean }
/** How a list is drawn, from the most rows on screen to the most picture. */
export type Density = 'compact' | 'list' | 'small' | 'grid'
export const DENSITIES: { id: Density; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'compact', label: 'Compact', icon: AlignJustify },
  { id: 'list', label: 'List', icon: LayoutList },
  { id: 'small', label: 'Small grid', icon: Grid3x3 },
  { id: 'grid', label: 'Grid', icon: LayoutGrid }
]
/** The list beside the open note, the whole page, or a thin rail of pictures. */
export type Pane = 'list' | 'wide' | 'rail'
export type View = {
  filter: Record<string, string[]>
  sort: string
  group: string
  density?: Density
  /** The density while the list fills the page: a grid unless you chose otherwise. */
  wideDensity?: Density
  pane?: Pane
  /** Groups drawn as islands that fold, a few rows each: on by default when grouped by kind (islands.tsx). */
  islands?: boolean
}

/** Whether a list's groups are drawn as islands: asked for, or grouped by kind and not turned off. */
export const islandsOn = (view: View): boolean => view.group !== 'none' && (view.islands ?? view.group === 'kind')

export function useView(name: string, initial: { sort: string; group: string; filter?: View['filter'] }): [View, (view: View) => void] {
  const key = `view:${name}`
  // A starting filter left out is no filter, never a missing one.
  const start = { ...initial, filter: initial.filter ?? {} }
  const read = (): View => {
    try {
      const kept = { ...start, ...JSON.parse(localStorage.getItem(key) ?? '{}') }
      // Oldest became Oldest untouched, the order things rot in.
      if (kept.sort === 'oldest') kept.sort = 'untouched'
      // The list or cards toggle that Display's View as replaced.
      if (!kept.density && localStorage.getItem(`layout:${name}`) === 'cards') kept.density = 'grid'
      return kept
    } catch {
      return start
    }
  }
  const [view, setView] = useState(read)
  // Another list under the same component keeps its own.
  useEffect(() => setView(read()), [name]) // eslint-disable-line react-hooks/exhaustive-deps
  return [
    view,
    (next) => {
      setView(next)
      try {
        localStorage.setItem(key, JSON.stringify(next))
      } catch {
        // Not kept, but still applied.
      }
    }
  ]
}

/** The list as the view asks: filtered, ordered, then cut into groups. */
export function arrange<T>(
  items: T[],
  view: View,
  facets: Facet<T>[],
  sorts: Record<string, (a: T, b: T) => number>,
  groups: Record<string, (item: T) => string> = {}
): [string, T[]][] {
  const kept = items.filter((item) =>
    facets.every((facet) => {
      const chosen = view.filter[facet.key] ?? []
      return !chosen.length || chosen.some((option) => facet.test(item, option))
    })
  )
  const ordered = sorts[view.sort] ? [...kept].sort(sorts[view.sort]) : kept
  const by = groups[view.group]
  if (!by) return [['', ordered]]
  const out = new Map<string, T[]>()
  for (const item of ordered) out.set(by(item), [...(out.get(by(item)) ?? []), item])
  // Every one the same kind is no grouping: one island would only frame the list.
  if (view.group === 'kind' && out.size < 2) return [['', ordered]]
  // Kinds in the one order, Note first (kindRank); dates newest first, whatever the sort inside each.
  if (view.group === 'kind') return [...out].sort(([a], [b]) => byKind(a, b))
  if (view.group === 'date') return [...out].sort(([a], [b]) => ageRank(a) - ageRank(b))
  return [...out]
}

/** When a date falls, in the words the date filters and groups use. */
export function period(iso: string | null): string {
  if (!iso) return 'No date'
  const days = daysSince(iso)
  if (dayjs(iso).isSame(dayjs(), 'day')) return 'Today'
  return days <= 7 ? 'This week' : days <= 30 ? 'This month' : days <= 365 ? 'This year' : 'Older'
}
export const AGES: Choice[] = ['Today', 'This week', 'This month', 'This year', 'Older'].map((id) => ({ id, label: id }))
const ageRank = (name: string): number => { const at = AGES.findIndex((one) => one.id === name); return at < 0 ? AGES.length : at }

/**
 * A row that scrolls sideways: no scrollbar either way, each edge faded only
 * while there is more past it (a sideways swipe moves it along; up and down
 * always scroll the page), and the chosen chip is brought wholly into view, never left cut mid-word.
 */
export function useSideways(): { ref: (node: HTMLElement | null) => void; style: React.CSSProperties; className: string; /** Whether there is more past each edge. */ edges: { left: boolean; right: boolean } } {
  const [row, setRow] = useState<HTMLElement | null>(null)
  const [edges, setEdges] = useState({ left: false, right: false })
  useEffect(() => {
    if (!row) return
    const measure = (): void => {
      const left = row.scrollLeft > 2
      const right = row.scrollLeft + row.clientWidth < row.scrollWidth - 2
      setEdges((was) => (was.left === left && was.right === right ? was : { left, right }))
    }
    // Clear of the fade, so the chosen one reads whole.
    const reveal = (): void => {
      const on = row.querySelector<HTMLElement>('[aria-pressed="true"]')
      if (!on) return
      const room = 24
      const to = on.offsetLeft < row.scrollLeft + room ? on.offsetLeft - room : on.offsetLeft + on.offsetWidth > row.scrollLeft + row.clientWidth - room ? on.offsetLeft + on.offsetWidth - row.clientWidth + room : null
      if (to !== null) row.scrollTo({ left: to, behavior: still() ? 'auto' : 'smooth' })
    }
    measure()
    reveal()
    const sized = new ResizeObserver(measure)
    sized.observe(row)
    const changed = new MutationObserver((records) => {
      measure()
      if (records.some((record) => record.type === 'attributes')) reveal()
    })
    changed.observe(row, { childList: true, subtree: true, attributes: true, attributeFilter: ['aria-pressed'] })
    row.addEventListener('scroll', measure, { passive: true })
    return () => {
      sized.disconnect()
      changed.disconnect()
      row.removeEventListener('scroll', measure)
    }
  }, [row])
  const fade = `linear-gradient(to right, ${edges.left ? 'transparent, black 1.5rem' : 'black, black'}, ${edges.right ? 'black calc(100% - 1.5rem), transparent' : 'black, black'})`
  return {
    ref: setRow,
    style: { maskImage: fade, WebkitMaskImage: fade },
    edges,
    className: 'relative flex-nowrap overflow-x-auto overflow-y-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden [&>*]:shrink-0'
  }
}

export function Chips({ options, on, pick, className = 'flex-wrap', sideways = false }: {
  options: readonly Choice[]
  on: (id: string) => boolean
  pick: (id: string) => void
  className?: string
  /** One line that scrolls along, never wrapping under itself. */
  sideways?: boolean
}): React.JSX.Element {
  // Where one chip is chosen at a time, its pill travels to the next one, as
  // the box's tabs do; pointing lights the chip nearest, never the gap.
  const single = options.filter((option) => on(option.id)).length === 1
  const row = useSideways()
  const box = useRef<HTMLDivElement | null>(null)
  const hover = useFluidHover(box, { items: ':scope > button', axis: sideways ? 'x' : 'xy' })
  const chosen = useChosen(box, ':scope > button[aria-pressed="true"]', options.map((option) => on(option.id)).join())
  return (
    <div data-hover-quiet ref={(node) => { box.current = node; if (sideways) row.ref(node) }} {...hover.handlers} style={sideways ? row.style : undefined}
      className={`relative isolate flex gap-x-1 gap-y-0.5 ${sideways ? row.className : ''} ${className}`}>
      {single && <Highlight spot={chosen.spot} snap={chosen.snap} travel={spring.moderate} className="bg-accent" />}
      <Highlight spot={hover.spot} session={hover.session} snap={hover.snap} from={single ? chosen.spot : null} className="bg-accent/50" />
      {options.map((option) => (
        <Tip key={option.id} label={option.tip ?? ''}>
        <button
          type="button"
          // Named plainly: the label is drawn twice over and letter by letter as it rolls.
          aria-label={option.label}
          aria-pressed={on(option.id)}
          onClick={() => {
            chime('tap')
            pick(option.id)
          }}
          className={`rounded-md px-2 py-1 text-xs transition-colors duration-80 ${on(option.id) ? `${single ? '' : 'bg-accent'} text-foreground` : 'text-muted-foreground hover:text-foreground data-[fluid-hover-active]:text-foreground'}`}
        >
          <Weighted on={on(option.id)}><Rolling text={option.label} /></Weighted>
        </button>
        </Tip>
      ))}
    </div>
  )
}

/**
 * One setting's control in Display: a field showing what is chosen, opening
 * a menu of the choices with their icons. Ticks for several, one tick for one;
 * a menu of several stays open while you pick.
 */
function Pick({ options, chosen, many, onPick }: { options: Choice[]; chosen: string[]; many: boolean; onPick: (id: string) => void }): React.JSX.Element {
  const names = options.filter((one) => chosen.includes(one.id)).map((one) => one.label)
  const shown = !names.length ? 'All' : names.length > 2 ? `${num(names.length)} chosen` : names.join(', ')
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <button type="button" className="flex h-7 w-full min-w-0 items-center justify-between gap-2 rounded-md border border-input px-2.5 text-left hover:bg-accent/50 data-[state=open]:border-ring">
          <span className={`truncate ${names.length ? 'text-foreground' : 'text-muted-foreground'}`}>{shown}</span>
          <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-(--radix-dropdown-menu-trigger-width) min-w-44">
        {options.map((one) => {
          const icon = one.icon ? <one.icon className="size-4" style={{ color: one.tint }} /> : one.tint ? <span className="size-2.5 rounded-full" style={{ background: one.tint }} /> : null
          const on = chosen.includes(one.id)
          return many ? (
            // A box drawn for every option, ticked or not, so it reads as a
            // list to tick rather than a menu to leave.
            <DropdownMenuItem
              key={one.id}
              role="menuitemcheckbox"
              aria-checked={on}
              onSelect={(event) => {
                event.preventDefault()
                // A box ticked climbs, untick it and it comes back down.
                chime(on ? 'off' : 'on')
                onPick(one.id)
              }}
              className="gap-2 text-control"
            >
              <span className={`flex size-4 shrink-0 items-center justify-center rounded-sm border ${on ? 'border-[var(--tt-brand-color-400)] bg-[var(--tt-brand-color-400)] mf-on-accent' : 'border-input'}`}>
                {on && <Check className="size-3" />}
              </span>
              {icon}
              {one.label}
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem key={one.id} onSelect={() => {
              chime('tap')
              onPick(one.id)
            }} className="gap-2 text-control">
              <Check className={`size-3.5 ${chosen.includes(one.id) ? '' : 'invisible'}`} />
              {icon}
              {one.label}
            </DropdownMenuItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** Defined once, out here: made inside Display, every change rebuilt them and closed the open menu. */
// Each section an island, the way Settings groups its rows.
const Section = ({ title, count, children }: { title: string; count: number; children: ReactNode }): React.JSX.Element => (
  <Island compact name={title} title={<span className="flex items-center gap-1.5">{title}{count > 0 && <Count n={count} className="rounded bg-accent px-1 font-normal text-muted-foreground" />}</span>}>
    {children}
  </Island>
)
const Row = ({ label, changed, children }: { label: string; changed: boolean; children: ReactNode }): React.JSX.Element => (
  <div className="grid grid-cols-[5.5rem_1fr] items-center gap-x-2 px-2.5 py-1">
    <div className="flex items-center gap-1.5 text-muted-foreground">
      {label}
      {changed && <Tip label="Changed from how it starts"><span className="size-1.5 rounded-full bg-[var(--tt-brand-color-400)]" /></Tip>}
    </div>
    {children}
  </div>
)

/**
 * A filter chip that says plainly whether it is on: off, a hairline outline
 * on the page; on, filled in the accent with a tick, the outline darkened.
 * Borders on both, since the fills alone are too faint to tell apart. Its
 * mark (a kind's icon or colour) and the tick share one box of one size, the
 * tick in the mark's place while on, so a chip is one width on or off and
 * never shoves the chips beside it out from under the pointer.
 */
export function Chip({ on, onClick, children, addon, mark }: {
  on: boolean; onClick: () => void; children: ReactNode
  /** A choice that belongs to this option, in the same pill after its name: a task's Open, Done or Both. */
  addon?: ReactNode
  /** Its icon or colour dot, before its name. */
  mark?: ReactNode
}): React.JSX.Element {
  const look = on
    ? 'border-[color-mix(in_srgb,var(--tt-brand-color-400)_55%,transparent)] bg-[color-mix(in_srgb,var(--tt-brand-color-400)_18%,transparent)] text-foreground'
    : 'border-border bg-transparent text-muted-foreground hover:border-foreground/25 hover:text-foreground data-[fluid-hover-active]:border-foreground/25 data-[fluid-hover-active]:text-foreground'
  const press = (event: React.MouseEvent<HTMLElement>): void => (onClick(), event.currentTarget.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: glideWay() }))
  const face = (
    <>
      <span className="grid size-3.5 shrink-0 place-items-center">{on ? <Check className="size-3 text-[var(--tt-brand-color-400)]" /> : mark}</span>
      {children}
    </>
  )
  // With a choice of its own: one pill, one outline, two places to press.
  if (addon) return (
    <span data-chip-split className={`flex h-6 shrink-0 items-center rounded-full border transition-[background-color,border-color,color] duration-80 ${look}`}>
      <button type="button" aria-pressed={on} onClick={press} className="mf-hit relative flex h-full items-center gap-1.5 rounded-full pr-1 pl-2.5">{face}</button>
      {addon}
    </span>
  )
  return (
    <button type="button" aria-pressed={on} onClick={press}
      className={`flex h-6 shrink-0 items-center gap-1.5 rounded-full border px-2.5 transition-[background-color,border-color,color] duration-80 ${look}`}>
      {face}
    </button>
  )
}

/**
 * What the list is filtered by, as chips over it, Spotify's way: each one
 * set shows filled, with one × in front that clears them all, and the kinds
 * the list holds sit beside them a click away. Defaults a list starts with
 * are not shown: they are where it is, not a filter you chose.
 */
export function FilterChips<T>({ view, onChange, facets, defaults = {}, quick = 'kind', className = '', wrap = false, addons = {}, extra }: {
  view: View
  /** A chip of another sort at the row's far right: the Inbox's Graph. */
  extra?: ReactNode
  /** A choice that belongs to one quick option, drawn inside that option's chip. */
  addons?: Record<string, ReactNode>
  onChange: (view: View) => void
  facets: Facet<T>[]
  defaults?: View['filter']
  /** The facet whose options are offered as chips before any is chosen. */
  quick?: string
  className?: string
  /** Onto a second line where they do not fit, rather than one line that scrolls: every kind in sight, none cut in half. */
  wrap?: boolean
}): React.JSX.Element | null {
  const set = facets.flatMap((facet) =>
    (view.filter[facet.key] ?? []).filter((id) => !(defaults[facet.key] ?? []).includes(id)).map((id) => ({ facet, option: facet.options.find((one) => one.id === id) ?? { id, label: id } }))
  )
  const row = useSideways()
  const box = useRef<HTMLDivElement | null>(null)
  const hover = useFluidHover(box, { items: ':scope > button[aria-pressed], :scope > [data-chip-split]', axis: wrap ? 'xy' : 'x' })
  const offered = facets.find((facet) => facet.key === quick)
  // One option alone is no choice, unless it carries one of its own.
  const offers = !!offered && (offered.options.length > 1 || offered.options.some((option) => addons[option.id]))
  if (!set.length && !offers && !extra) return null
  const toggle = (key: string, id: string): void => {
    const list = view.filter[key] ?? []
    chime(list.includes(id) ? 'off' : 'on')
    onChange({ ...view, filter: { ...view.filter, [key]: list.includes(id) ? list.filter((one) => one !== id) : [...list, id] } })
  }
  const icon = (one: Choice): ReactNode => (one.icon ? <one.icon className="size-3.5" style={{ color: one.tint }} /> : one.tint ? <span className="size-2 rounded-full" style={{ background: one.tint }} /> : null)
  const chips = (
    // One line that scrolls sideways, fading where there is more, never wrapping under itself.
    // Only a chip itself toggles: a click in the space beside one does nothing (the light's own click-through is left out here).
    <div data-hover-quiet data-filter-chips ref={(node) => { box.current = node; if (!wrap) row.ref(node) }} {...hover.handlers} onClick={undefined} style={wrap ? undefined : row.style} className={`isolate flex min-w-0 items-center gap-1 text-xs ${extra ? 'flex-1' : ''} ${wrap ? 'relative flex-wrap gap-y-1' : row.className} ${extra ? '' : className}`}>
      <Highlight spot={hover.spot} session={hover.session} snap={hover.snap} className="rounded-full bg-accent/60" />
      {/* Chosen filters from other facets first; the quick facet's options
          stay in their own order whether on or off, so a click never moves
          the chip out from under the pointer. */}
      {set.filter(({ facet }) => facet.key !== offered?.key).map(({ facet, option }) => (
        <Chip key={`${facet.key}:${option.id}`} on onClick={() => toggle(facet.key, option.id)} mark={icon(option)}>{option.label}</Chip>
      ))}
      {offered && offers && offered.options.map((option) => (
        <Chip key={option.id} on={(view.filter[offered.key] ?? []).includes(option.id) && !(defaults[offered.key] ?? []).includes(option.id)}
          onClick={() => toggle(offered.key, option.id)} addon={addons[option.id]} mark={icon(option)}>{option.label}</Chip>
      ))}
      {/* A chosen chip shows its ✓ and a click takes it off; with two or more on, one × clears them all. */}
      {set.length >= 2 && (
        <Tip label="Clear the filters">
          <button type="button" data-clear-filters aria-label="Clear the filters"
            onClick={() => (chime('off'), onChange({ ...view, filter: Object.fromEntries(facets.map((facet) => [facet.key, defaults[facet.key] ?? []])) }))}
            className="grid size-6 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
            <X className="size-3.5" />
          </button>
        </Tip>
      )}
    </div>
  )
  if (!extra) return chips
  return (
    // A view, not a filter: in its own group at the first line's far end, so it never reads as one more kind,
    // and the kinds wrap under their own group while it stays put.
    <div data-chip-row className={`flex w-full min-w-0 items-start gap-3 ${className}`}>
      {chips}
      <span data-chip-row-action className="flex shrink-0">{extra}</span>
    </div>
  )
}

/**
 * The Display button and its panel, Spotify's library menu in Haligtree's look:
 * Sort by as a list to tick, then how it is grouped, View as in four sizes,
 * and Filter. The button itself says how the list is ordered and drawn
 * ("Newest" and the view's icon), so it needs no name. A changed setting
 * carries a dot, each section counts its changes, and Reset all puts them
 * back. F opens it from anywhere on the list; 1 to 4 pick a view while open.
 */
const DISPLAY_ASKED = 'haligtree:display'
/** Open the Display of the page in front, from a menu line where it has no button of its own. */
export const openDisplay = (): void => void window.dispatchEvent(new CustomEvent(DISPLAY_ASKED))

export function Display<T>({ view, onChange, facets, sorts: given, groups: offered = [], defaults = {}, compact = false, density, onDensity, densities = DENSITIES.map((one) => one.id), count, hidden = false, sortNote }: {
  /** No button of its own: opened by F, or from a page's ⋯ (openDisplay), as a sheet from the right. */
  hidden?: boolean
  /** Icon only, where the row beside it needs the room. */
  compact?: boolean
  /** How many the whole list holds, filters aside: with one or none there is nothing to order, so no order is offered or named. */
  count?: number
  view: View
  /** Filters the list starts with: not counted as chosen, and what Reset goes back to. */
  defaults?: View['filter']
  onChange: (view: View) => void
  facets: Facet<T>[]
  /** The first of each is the list's own default. */
  sorts: Choice[]
  /** What the chosen order does with the list's groups, on its own line under the choices. */
  sortNote?: string
  groups?: Choice[]
  /** How the list is drawn now, and how to change it: offered as View as. */
  density?: Density
  onDensity?: (density: Density) => void
  /** Which views this list can be drawn as, when not all four. */
  densities?: Density[]
}): React.JSX.Element | null {
  const views = DENSITIES.filter((one) => densities.includes(one.id))
  const few = count !== undefined && count < 2
  const sorts = few ? [] : given
  const groups = few ? [] : offered
  const [open, setOpen] = useState(false)
  // Where the whole panel cannot fit beside its button (the box, a short
  // window), it comes in as a sheet from the right instead, full height,
  // scrolling inside: never a menu cut off with its last rows out of reach.
  const [sheet, setSheet] = useState(false)
  const openNow = useRef(open)
  openNow.current = open
  const sheetNow = useRef(sheet)
  sheetNow.current = sheet
  const button = useRef<HTMLButtonElement>(null)
  // Each opening starts as a popover and measures again: the window may have changed size.
  const show = (next: boolean): void => {
    // Its button out of sight (folded into ⋯ beside an open task), a popover
    // had nothing to sit by and opened in the window's corner: the sheet then.
    if (next) setSheet(!button.current?.getClientRects().length || !button.current.offsetParent)
    setOpen(next)
  }
  // Split, only the pane in front answers keys.
  const here = useHere()
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (!here()) return
      if (event.key !== 'f' || event.metaKey || event.ctrlKey || event.altKey) return
      // Already taken by what had the keys (a rot card's F tidies it).
      if (typing() || event.defaultPrevented) return
      event.preventDefault()
      show(!openNow.current)
    }
    // Asked for from a menu (a page's ⋯), in the pane in front.
    const onAsk = (): void => void (here() && show(true))
    window.addEventListener('keydown', onKey)
    window.addEventListener(DISPLAY_ASKED, onAsk)
    return () => (window.removeEventListener('keydown', onKey), window.removeEventListener(DISPLAY_ASKED, onAsk))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  // Opening is heard, by F or a click, as every other panel is; a sheet
  // slides in with its own sound instead. Checked a frame later, once the
  // panel has measured itself and chosen which it is.
  useEffect(() => {
    if (!open) return
    const frame = requestAnimationFrame(() => void (!sheetNow.current && chime('open')))
    return () => cancelAnimationFrame(frame)
  }, [open])
  // The room above or below the button, whichever is more, less the gaps Radix keeps.
  const fit = (panel: HTMLElement | null): void => {
    const at = button.current?.getBoundingClientRect()
    if (!panel || !at || sheetNow.current) return
    const room = Math.max(innerHeight - at.bottom, at.top) - 4 - 12 - 4
    if (panel.scrollHeight > room) setSheet(true)
  }
  const same = (key: string): boolean => JSON.stringify([...(view.filter[key] ?? [])].sort()) === JSON.stringify([...(defaults[key] ?? [])].sort())
  const filtered = Object.entries(view.filter).reduce((n, [key, list]) => n + (same(key) ? 0 : Math.max(list.length, 1)), 0)
  const regrouped = groups.length > 1 && view.group !== groups[0].id && groups.some((one) => one.id === view.group)
  const reordered = sorts.length > 1 && view.sort !== sorts[0].id
  const sorted = Number(regrouped) + Number(reordered)
  const active = filtered + sorted
  const toggle = (key: string, id: string): void => {
    const list = view.filter[key] ?? []
    onChange({ ...view, filter: { ...view.filter, [key]: list.includes(id) ? list.filter((one) => one !== id) : [...list, id] } })
  }
  const shownFacets = facets.filter((facet) => facet.options.length > 1 || (view.filter[facet.key] ?? []).length > 0)
  const sortName = (sorts.find((one) => one.id === view.sort) ?? sorts[0])?.label ?? ''
  const Shown = DENSITIES.find((one) => one.id === density)?.icon
  const pickDensity = (next: Density): void => {
    if (next === density) return
    chime('tap')
    onDensity?.(next)
  }
  // 1 to 4 pick a view while it is open, in either shape.
  const onKeyDown = (event: React.KeyboardEvent): void => {
    const at = Number(event.key) - 1
    if (!onDensity || event.metaKey || event.ctrlKey || event.altKey || !views[at]) return
    if ((event.target as Element).closest('input, textarea')) return
    event.preventDefault()
    pickDensity(views[at].id)
  }
  // A choice in one of its menus is inside Display, not a click away.
  const inside = (event: Event): void => void ((event.target as Element | null)?.closest?.('[data-slot="dropdown-menu-content"]') && event.preventDefault())
  const panel = (
    <>
    {(groups.length > 1 || sorts.length > 1) && (
      <Section title="Sort by" count={sorted}>
        {sorts.length > 1 && (
          <div role="menu" className="flex flex-col p-1">
            {sorts.map((one) => (
              <button
                key={one.id}
                type="button"
                role="menuitemradio"
                aria-checked={one.id === view.sort}
                onClick={() => {
                  if (one.id === view.sort) return
                  chime('tap')
                  onChange({ ...view, sort: one.id })
                }}
                className={`flex h-6.5 items-center gap-2 rounded-md px-1.5 text-left hover:bg-accent/60 ${one.id === view.sort ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
              >
                <span className="flex-1 truncate">{one.label}</span>
                {one.id === view.sort && <Check className="size-3.5 text-[var(--tt-brand-color-400)]" />}
              </button>
            ))}
            {sortNote && <p data-sort-note className="px-1.5 pt-1 pb-0.5 text-control leading-snug text-foreground/80">{sortNote}</p>}
          </div>
        )}
        {groups.length > 1 && (
          <Row label="Grouping" changed={regrouped}>
            <Pick options={groups} chosen={[view.group]} many={false} onPick={(group) => onChange({ ...view, group })} />
          </Row>
        )}
        {/* Grouped, each group can be its own island: a few rows each, folding, so a long list reads as a few short ones. */}
        {groups.length > 1 && view.group !== 'none' && (
          <Row label="Sections as" changed={false}>
            <Pick options={[{ id: 'islands', label: 'Islands' }, { id: 'plain', label: 'One list' }]} chosen={[islandsOn(view) ? 'islands' : 'plain']} many={false}
              onPick={(as) => (chime('tap'), onChange({ ...view, islands: as === 'islands' }))} />
          </Row>
        )}
      </Section>
    )}
    {onDensity && (
      <Section title="View as" count={0}>
        <div className="grid gap-1 p-1" style={{ gridTemplateColumns: `repeat(${views.length}, minmax(0, 1fr))` }}>
          {views.map((one, at) => (
            <Tip key={one.id} label={`${one.label}  ${at + 1}`}>
              <button
                type="button"
                aria-pressed={one.id === density}
                onClick={() => pickDensity(one.id)}
                className={`flex flex-col items-center justify-center gap-1 rounded-md px-0.5 pt-1.5 pb-1 transition-colors ${one.id === density ? 'bg-accent text-foreground' : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'}`}
              >
                <one.icon className="size-4" />
                {/* Named under its picture: four icons alone were guessed at. */}
                <span className="text-[11px] leading-none whitespace-nowrap">{one.label}</span>
              </button>
            </Tip>
          ))}
        </div>
      </Section>
    )}
    {shownFacets.length > 0 && (
      <Section title="Filter" count={filtered}>
        {shownFacets.map((facet) => (
          <Row key={facet.key} label={facet.label} changed={!same(facet.key)}>
            <Pick options={facet.options} chosen={view.filter[facet.key] ?? []} many onPick={(id) => toggle(facet.key, id)} />
          </Row>
        ))}
      </Section>
    )}
    {active > 0 && (
      <div className="mt-2">
        <button
          type="button"
          onClick={(event) => {
            // The button goes with the changes it undid; the focus stays in the panel.
            chime('undo')
            event.currentTarget.closest<HTMLElement>('[data-slot="popover-content"], [data-slot="sheet-content"]')?.focus()
            onChange({ ...view, filter: { ...defaults }, group: groups[0]?.id ?? view.group, sort: sorts[0]?.id ?? view.sort })
          }}
          className="w-full rounded-md py-2 font-medium text-muted-foreground hover:bg-accent/50 hover:text-foreground"
        >
          Reset all
        </button>
      </div>
    )}
    </>
  )
  // Nothing to order, filter or draw another way: no button that opens onto nothing.
  if (few && !onDensity && !shownFacets.length && !active) return null
  return (
    <>
    {!hidden && <Popover open={open && !sheet} onOpenChange={show}>
      <Tip label="Display  F">
      <PopoverTrigger asChild>
        <button ref={button} type="button" data-display className={`flex h-7 items-center gap-1.5 rounded-md px-2 text-control whitespace-nowrap hover:bg-accent hover:text-foreground ${open ? 'bg-accent text-foreground' : ''} ${active ? 'text-foreground' : ''}`}>
          {!compact && sorts.length > 1 && <Rolling by="word" text={sortName} />}
          {filtered > 0 && <Count n={filtered} className="rounded bg-accent px-1 text-xs text-muted-foreground" />}
          {Shown ? <Shown className="size-3.5" /> : <AliveIcon icon={SlidersHorizontalIcon} size={14} />}
        </button>
        </PopoverTrigger>
      </Tip>
      <PopoverContent
        align="end"
        // Kept 12px clear of the window's edge, rounded corner and all.
        collisionPadding={{ top: 52, right: 12, bottom: 12, left: 12 }}
        tabIndex={-1}
        // Opened, the panel holds the keys, not its first control: a ring on
        // the first sort before you have pressed anything reads as a mistake.
        onOpenAutoFocus={(event) => {
          event.preventDefault()
          ;(event.currentTarget as HTMLElement | null)?.focus()
        }}
        // Closed, the keys go back to the list, not to this button: Enter then opens a note, not the menu again.
        onCloseAutoFocus={(event) => event.preventDefault()}
        onKeyDown={onKeyDown}
        className="w-72 gap-0 p-2 text-control"
        ref={fit}
        onInteractOutside={inside}
      >
        {panel}
      </PopoverContent>
    </Popover>}
    <Sheet open={open && sheet} onOpenChange={show}>
      <SheetContent side="right" className="w-80 max-w-[85vw] gap-0 p-0 text-control sm:max-w-80" tabIndex={-1}
        onCloseAutoFocus={(event) => event.preventDefault()}
        onKeyDown={onKeyDown}
        onInteractOutside={inside}
      >
        <SheetHeader className="border-b p-4">
          <SheetTitle className="text-sm">Display</SheetTitle>
          <SheetDescription className="sr-only">How this list is ordered, grouped, drawn and filtered.</SheetDescription>
        </SheetHeader>
        <div className="mf-more min-h-0 flex-1 overflow-y-auto p-2">{panel}</div>
      </SheetContent>
    </Sheet>
    </>
  )
}
