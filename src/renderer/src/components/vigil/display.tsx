import { useEffect, useState, type ReactNode } from 'react'
import { Check, ChevronDown, SlidersHorizontal } from 'lucide-react'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'

import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Rolling, Tip, typing } from './ui'
import { chime } from '@/lib/sound'

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
export type View = { filter: Record<string, string[]>; sort: string; group: string }

export function useView(name: string, initial: { sort: string; group: string; filter?: View['filter'] }): [View, (view: View) => void] {
  const key = `view:${name}`
  // A starting filter left out is no filter, never a missing one.
  const start = { ...initial, filter: initial.filter ?? {} }
  const read = (): View => {
    try {
      return { ...start, ...JSON.parse(localStorage.getItem(key) ?? '{}') }
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
  const days = (Date.now() - new Date(iso).getTime()) / 86400000
  if (new Date(iso).toDateString() === new Date().toDateString()) return 'Today'
  return days <= 7 ? 'This week' : days <= 30 ? 'This month' : days <= 365 ? 'This year' : 'Older'
}
export const AGES: Choice[] = ['Today', 'This week', 'This month', 'This year', 'Older'].map((id) => ({ id, label: id }))

export function Chips({ options, on, pick, className = 'flex-wrap' }: { options: readonly Choice[]; on: (id: string) => boolean; pick: (id: string) => void; className?: string }): React.JSX.Element {
  return (
    <div data-hover-quiet className={`flex gap-x-1 gap-y-0.5 ${className}`}>
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          onClick={() => {
            chime('tap')
            pick(option.id)
          }}
          className={`rounded-md px-2 py-0.5 text-xs transition-colors ${on(option.id) ? 'bg-accent text-foreground' : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'}`}
        >
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
      <DropdownMenuContent align="start" className="max-h-72 w-(--radix-dropdown-menu-trigger-width) min-w-44 overflow-y-auto">
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
            <DropdownMenuItem key={one.id} onSelect={() => onPick(one.id)} className="gap-2 text-control">
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
const Section = ({ title, count, children }: { title: string; count: number; children: ReactNode }): React.JSX.Element => (
  <section className="border-t px-3 py-2.5 first:border-t-0">
    <h3 className="mb-2 flex items-center gap-1.5 font-semibold text-foreground">
      {title}
      {count > 0 && <span className="rounded bg-accent px-1 text-meta tabular-nums text-muted-foreground">{count}</span>}
    </h3>
    <div className="grid grid-cols-[6rem_1fr] items-center gap-x-3 gap-y-1.5">{children}</div>
  </section>
)
const Row = ({ label, changed, children }: { label: string; changed: boolean; children: ReactNode }): React.JSX.Element => (
  <>
    <div className="flex items-center gap-1.5 text-muted-foreground">
      {label}
      {changed && <span className="size-1.5 rounded-full bg-[var(--tt-brand-color-400)]" aria-label="changed" />}
    </div>
    {children}
  </>
)

/**
 * The Display button and its panel, the way Todoist lays it out: Sort, then
 * Filter, each setting a name and a field. A changed setting carries a dot,
 * each section counts its changes, and Reset all puts everything back. F opens
 * it from anywhere on the list.
 */
export function Display<T>({ view, onChange, facets, sorts, groups = [], defaults = {} }: {
  view: View
  /** Filters the list starts with: not counted as chosen, and what Reset goes back to. */
  defaults?: View['filter']
  onChange: (view: View) => void
  facets: Facet<T>[]
  /** The first of each is the list's own default. */
  sorts: Choice[]
  groups?: Choice[]
}): React.JSX.Element {
  const [open, setOpen] = useState(false)
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== 'f' || event.metaKey || event.ctrlKey || event.altKey) return
      if (typing()) return
      event.preventDefault()
      setOpen((was) => !was)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
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
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tip label="Display  F">
      <PopoverTrigger asChild>
        <button type="button" className={`flex items-center gap-1.5 rounded-md px-2 py-1 text-control hover:bg-accent hover:text-foreground ${active ? 'text-foreground' : ''}`}>
          <SlidersHorizontal className="size-3.5" />
          Display{active ? `: ${active}` : ''}
        </button>
        </PopoverTrigger>
      </Tip>
      <PopoverContent
        align="end"
        // Kept 12px clear of the window's edge, rounded corner and all.
        collisionPadding={12}
        tabIndex={-1}
        className="max-h-[calc(var(--radix-popover-content-available-height)-12px)] w-80 gap-0 overflow-y-auto p-0 text-control"
        // A choice in one of its menus is inside Display, not a click away.
        onInteractOutside={(event) => void ((event.target as Element | null)?.closest?.('[data-slot="dropdown-menu-content"]') && event.preventDefault())}
      >
        {(groups.length > 1 || sorts.length > 1) && (
          <Section title="Sort" count={sorted}>
            {groups.length > 1 && (
              <Row label="Grouping" changed={regrouped}>
                <Pick options={groups} chosen={[view.group]} many={false} onPick={(group) => onChange({ ...view, group })} />
              </Row>
            )}
            {sorts.length > 1 && (
              <Row label="Ordering" changed={reordered}>
                <Pick options={sorts} chosen={[view.sort]} many={false} onPick={(sort) => onChange({ ...view, sort })} />
              </Row>
            )}
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
          <div className="border-t p-1">
            <button
              type="button"
              onClick={(event) => {
                // The button goes with the changes it undid; the focus stays in the panel.
                event.currentTarget.closest<HTMLElement>('[data-slot="popover-content"]')?.focus()
                onChange({ ...view, filter: { ...defaults }, group: groups[0]?.id ?? view.group, sort: sorts[0]?.id ?? view.sort })
              }}
              className="w-full rounded-md py-2 font-medium text-[var(--tt-color-text-red)] hover:bg-accent/50"
            >
              Reset all
            </button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}
