import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { motion } from 'motion/react'
import { AlignJustify, Grid3x3 } from 'lucide-react'
import { alive } from '@/components/ui/alive-icon'
import SimpleCheckedIcon from '@/components/ui/simple-checked-icon'
import DownChevronIcon from '@/components/ui/down-chevron'
import LayoutDashboardIcon from '@/components/ui/layout-dashboard-icon'
import UnorderedListIcon from '@/components/ui/unordered-list-icon'
import XIcon from '@/components/ui/x-icon'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'

import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Island, Rolling, Tip, typing } from './ui'
import { chime } from '@/lib/sound'
import SlidersHorizontalIcon from '@/components/ui/sliders-horizontal-icon'
import { AliveIcon } from '@/components/vigil/alive-icon'
import { dayjs, daysSince } from '../../../../main/dates'

// itshover drawings in lucide's place, moving when their control is pointed at.
const Check = alive(SimpleCheckedIcon)
const ChevronDown = alive(DownChevronIcon)
const LayoutGrid = alive(LayoutDashboardIcon)
const LayoutList = alive(UnorderedListIcon)
const X = alive(XIcon)

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
}

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

/**
 * A row that scrolls sideways: no scrollbar either way, each edge faded only
 * while there is more past it, a wheel turned up or down moves it along, and
 * the chosen chip is brought wholly into view, never left cut mid-word.
 */
export function useSideways(): { ref: (node: HTMLElement | null) => void; style: React.CSSProperties; className: string } {
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
      if (to !== null) row.scrollTo({ left: to, behavior: document.documentElement.dataset.motion === 'off' || matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
    }
    const wheel = (event: WheelEvent): void => {
      if (Math.abs(event.deltaY) <= Math.abs(event.deltaX) || row.scrollWidth <= row.clientWidth) return
      event.preventDefault()
      row.scrollLeft += event.deltaY
    }
    measure()
    reveal()
    // The list's smooth scrolling leaves this row's wheel alone.
    row.setAttribute('data-lenis-prevent-wheel', '')
    const sized = new ResizeObserver(measure)
    sized.observe(row)
    const changed = new MutationObserver((records) => {
      measure()
      if (records.some((record) => record.type === 'attributes')) reveal()
    })
    changed.observe(row, { childList: true, subtree: true, attributes: true, attributeFilter: ['aria-pressed'] })
    row.addEventListener('scroll', measure, { passive: true })
    row.addEventListener('wheel', wheel, { passive: false })
    return () => {
      sized.disconnect()
      changed.disconnect()
      row.removeEventListener('scroll', measure)
      row.removeEventListener('wheel', wheel)
    }
  }, [row])
  const fade = `linear-gradient(to right, ${edges.left ? 'transparent, black 1.5rem' : 'black, black'}, ${edges.right ? 'black calc(100% - 1.5rem), transparent' : 'black, black'})`
  return {
    ref: setRow,
    style: { maskImage: fade, WebkitMaskImage: fade },
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
  // Where one chip is chosen at a time, its pill slides to the next one, as the box's tabs do.
  const group = useId()
  const single = options.filter((option) => on(option.id)).length === 1
  const row = useSideways()
  return (
    <div data-hover-quiet ref={sideways ? row.ref : undefined} style={sideways ? row.style : undefined} className={`flex gap-x-1 gap-y-0.5 ${sideways ? row.className : ''} ${className}`}>
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          aria-pressed={on(option.id)}
          onClick={() => {
            chime('tap')
            pick(option.id)
          }}
          className={`relative isolate rounded-md px-2 py-0.5 text-xs transition-colors ${on(option.id) ? `${single ? '' : 'bg-accent'} text-foreground` : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'}`}
        >
          {single && on(option.id) && <motion.span layoutId={`${group}-chip`} className="absolute inset-0 -z-10 rounded-md bg-accent" transition={{ type: 'spring', stiffness: 500, damping: 38 }} />}
          <Rolling text={option.label} />
        </button>
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
  const shown = !names.length ? 'All' : names.length > 2 ? `${names.length} chosen` : names.join(', ')
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
              <span className={`flex size-4 shrink-0 items-center justify-center rounded-sm border ${on ? 'border-[var(--tt-brand-color-400)] bg-[var(--tt-brand-color-400)] text-primary-foreground' : 'border-input'}`}>
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
  <Island compact title={<span className="flex items-center gap-1.5">{title}{count > 0 && <span className="rounded bg-accent px-1 font-normal tabular-nums text-muted-foreground"><Rolling text={count} /></span>}</span>}>
    {children}
  </Island>
)
const Row = ({ label, changed, children }: { label: string; changed: boolean; children: ReactNode }): React.JSX.Element => (
  <div className="grid grid-cols-[5.5rem_1fr] items-center gap-x-2 px-2.5 py-1">
    <div className="flex items-center gap-1.5 text-muted-foreground">
      {label}
      {changed && <span className="size-1.5 rounded-full bg-[var(--tt-brand-color-400)]" aria-label="changed" />}
    </div>
    {children}
  </div>
)

/**
 * What the list is filtered by, as chips over it, Spotify's way: each one
 * set shows filled, with one × in front that clears them all, and the kinds
 * the list holds sit beside them a click away. Defaults a list starts with
 * are not shown: they are where it is, not a filter you chose.
 */
export function FilterChips<T>({ view, onChange, facets, defaults = {}, quick = 'kind', className = '' }: {
  view: View
  onChange: (view: View) => void
  facets: Facet<T>[]
  defaults?: View['filter']
  /** The facet whose options are offered as chips before any is chosen. */
  quick?: string
  className?: string
}): React.JSX.Element | null {
  const set = facets.flatMap((facet) =>
    (view.filter[facet.key] ?? []).filter((id) => !(defaults[facet.key] ?? []).includes(id)).map((id) => ({ facet, option: facet.options.find((one) => one.id === id) ?? { id, label: id } }))
  )
  const row = useSideways()
  const offered = facets.find((facet) => facet.key === quick)
  const more = offered && offered.options.length > 1 ? offered.options.filter((one) => !(view.filter[offered.key] ?? []).includes(one.id)) : []
  if (!set.length && !more.length) return null
  const toggle = (key: string, id: string): void => {
    const list = view.filter[key] ?? []
    chime(list.includes(id) ? 'off' : 'on')
    onChange({ ...view, filter: { ...view.filter, [key]: list.includes(id) ? list.filter((one) => one !== id) : [...list, id] } })
  }
  const icon = (one: Choice): ReactNode => (one.icon ? <one.icon className="size-3.5" style={{ color: one.tint }} /> : one.tint ? <span className="size-2 rounded-full" style={{ background: one.tint }} /> : null)
  return (
    // One line that scrolls sideways, fading where there is more, never wrapping under itself.
    <div data-hover-quiet ref={row.ref} style={row.style} className={`flex min-w-0 items-center gap-1 text-xs ${row.className} ${className}`}>
      {set.length > 0 && (
        <Tip label="Clear the filters">
          <button
            type="button"
            onClick={() => {
              chime('undo')
              onChange({ ...view, filter: { ...defaults } })
            }}
            className="flex size-6 items-center justify-center rounded-full bg-accent text-muted-foreground hover:text-foreground"
          >
            <X className="size-3.5" />
          </button>
        </Tip>
      )}
      {set.map(({ facet, option }) => (
        <button key={`${facet.key}:${option.id}`} type="button" aria-pressed onClick={() => toggle(facet.key, option.id)}
          className="flex h-6 items-center gap-1.5 rounded-full bg-[color-mix(in_srgb,var(--tt-brand-color-400)_18%,transparent)] px-2.5 text-foreground">
          {icon(option)}
          {option.label}
        </button>
      ))}
      {more.map((option) => (
        <button key={option.id} type="button" aria-pressed={false} onClick={() => toggle(offered!.key, option.id)}
          className="flex h-6 items-center gap-1.5 rounded-full bg-accent/60 px-2.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
          {icon(option)}
          {option.label}
        </button>
      ))}
    </div>
  )
}

/**
 * The Display button and its panel, Spotify's library menu in Vigil's look:
 * Sort by as a list to tick, then how it is grouped, View as in four sizes,
 * and Filter. The button itself says how the list is ordered and drawn
 * ("Newest" and the view's icon), so it needs no name. A changed setting
 * carries a dot, each section counts its changes, and Reset all puts them
 * back. F opens it from anywhere on the list; 1 to 4 pick a view while open.
 */
export function Display<T>({ view, onChange, facets, sorts, groups = [], defaults = {}, compact = false, density, onDensity }: {
  /** Icon only, where the row beside it needs the room. */
  compact?: boolean
  view: View
  /** Filters the list starts with: not counted as chosen, and what Reset goes back to. */
  defaults?: View['filter']
  onChange: (view: View) => void
  facets: Facet<T>[]
  /** The first of each is the list's own default. */
  sorts: Choice[]
  groups?: Choice[]
  /** How the list is drawn now, and how to change it: offered as View as. */
  density?: Density
  onDensity?: (density: Density) => void
}): React.JSX.Element {
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
    if (next) setSheet(false)
    setOpen(next)
  }
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== 'f' || event.metaKey || event.ctrlKey || event.altKey) return
      if (typing()) return
      event.preventDefault()
      show(!openNow.current)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
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
  const regrouped = groups.length > 1 && view.group !== groups[0].id
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
    if (!onDensity || event.metaKey || event.ctrlKey || event.altKey || !DENSITIES[at]) return
    if ((event.target as Element).closest('input, textarea')) return
    event.preventDefault()
    pickDensity(DENSITIES[at].id)
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
          </div>
        )}
        {groups.length > 1 && (
          <Row label="Grouping" changed={regrouped}>
            <Pick options={groups} chosen={[view.group]} many={false} onPick={(group) => onChange({ ...view, group })} />
          </Row>
        )}
      </Section>
    )}
    {onDensity && (
      <Section title="View as" count={0}>
        <div className="grid grid-cols-4 gap-1 p-1">
          {DENSITIES.map((one, at) => (
            <Tip key={one.id} label={`${one.label}  ${at + 1}`}>
              <button
                type="button"
                aria-pressed={one.id === density}
                onClick={() => pickDensity(one.id)}
                className={`flex h-7 items-center justify-center rounded-md transition-colors ${one.id === density ? 'bg-accent text-foreground' : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'}`}
              >
                <one.icon className="size-4" />
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
  return (
    <>
    <Popover open={open && !sheet} onOpenChange={show}>
      <Tip label={`${onDensity ? 'Sort and view' : 'Sort and filter'}  F`}>
      <PopoverTrigger asChild>
        <button ref={button} type="button" className={`flex h-7 items-center gap-1.5 rounded-md px-2 text-control whitespace-nowrap hover:bg-accent hover:text-foreground ${open ? 'bg-accent text-foreground' : ''} ${active ? 'text-foreground' : ''}`}>
          {!compact && sorts.length > 1 && <Rolling by="word" text={sortName} />}
          {filtered > 0 && <span className="rounded bg-accent px-1 text-xs tabular-nums text-muted-foreground"><Rolling text={filtered} /></span>}
          {Shown ? <Shown className="size-3.5" /> : <AliveIcon icon={SlidersHorizontalIcon} size={14} />}
        </button>
        </PopoverTrigger>
      </Tip>
      <PopoverContent
        align="end"
        // Kept 12px clear of the window's edge, rounded corner and all.
        collisionPadding={12}
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
    </Popover>
    <Sheet open={open && sheet} onOpenChange={show}>
      <SheetContent side="right" className="w-80 max-w-[85vw] gap-0 p-0 text-control sm:max-w-80" tabIndex={-1}
        onCloseAutoFocus={(event) => event.preventDefault()}
        onKeyDown={onKeyDown}
        onInteractOutside={inside}
      >
        <SheetHeader className="border-b p-4">
          <SheetTitle className="text-sm">{onDensity ? 'Sort and view' : 'Sort and filter'}</SheetTitle>
          <SheetDescription className="sr-only">How this list is ordered, grouped, drawn and filtered.</SheetDescription>
        </SheetHeader>
        <div className="mf-more min-h-0 flex-1 overflow-y-auto p-2">{panel}</div>
      </SheetContent>
    </Sheet>
    </>
  )
}
