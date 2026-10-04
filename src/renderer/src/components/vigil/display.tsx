import { useEffect, useState, type ReactNode } from 'react'
import { SlidersHorizontal } from 'lucide-react'

import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Rolling, Tip, typing } from './ui'
import { chime } from '@/lib/sound'

/**
 * Display, the way Todoist and Linear do it: one button on a list that holds
 * how it is grouped, how it is ordered, and what it shows. Within one filter
 * any chosen option will do; across filters, all must hold. Each list keeps
 * its own choices, in this browser only: they are how you look, not data.
 */
export type Choice = { id: string; label: string }
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
    <div data-hover-quiet className={`flex gap-1 ${className}`}>
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

/** The Display button and its panel. F opens it from anywhere on the list. */
export function Display<T>({ view, onChange, facets, sorts, groups = [], defaults = {} }: {
  view: View
  /** Filters the list starts with: not counted as chosen, and what Clear goes back to. */
  defaults?: View['filter']
  onChange: (view: View) => void
  facets: Facet<T>[]
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
  const active = Object.entries(view.filter).reduce((n, [key, list]) => n + (same(key) ? 0 : list.length), 0)
  const toggle = (key: string, id: string): void => {
    const list = view.filter[key] ?? []
    onChange({ ...view, filter: { ...view.filter, [key]: list.includes(id) ? list.filter((one) => one !== id) : [...list, id] } })
  }
  // One row per setting, its name beside its choices: denser than stacked
  // headings, and a setting with nothing to choose between is left out.
  const Row = ({ label, children }: { label: string; children: ReactNode }): React.JSX.Element => (
    <>
      <div className="pt-1 text-xs text-muted-foreground">{label}</div>
      {children}
    </>
  )
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tip label="Display  F">
      <PopoverTrigger asChild>
        <button type="button" className={`flex items-center gap-1.5 rounded-md px-2 py-1 text-[13px] hover:bg-accent hover:text-foreground ${active ? 'text-foreground' : ''}`}>
          <SlidersHorizontal className="size-3.5" />
          Display{active ? ` · ${active}` : ''}
        </button>
        </PopoverTrigger>
      </Tip>
      <PopoverContent align="end" className="w-96 p-3 text-sm">
        <div className="grid grid-cols-[5.5rem_1fr] items-start gap-x-2 gap-y-2.5">
          {groups.length > 1 && (
            <Row label="Grouping">
              <Chips options={groups} on={(id) => view.group === id} pick={(group) => onChange({ ...view, group })} />
            </Row>
          )}
          {sorts.length > 1 && (
            <Row label="Ordering">
              <Chips options={sorts} on={(id) => view.sort === id} pick={(sort) => onChange({ ...view, sort })} />
            </Row>
          )}
          {facets.filter((facet) => facet.options.length > 1 || (view.filter[facet.key] ?? []).length > 0).map((facet) => (
            <Row key={facet.key} label={facet.label}>
              <Chips options={facet.options} on={(id) => (view.filter[facet.key] ?? []).includes(id)} pick={(id) => toggle(facet.key, id)} />
            </Row>
          ))}
        </div>
        {active > 0 && (
          <button type="button" onClick={() => onChange({ ...view, filter: { ...defaults } })} className="mt-3 text-xs text-muted-foreground hover:text-foreground">
            Clear filters
          </button>
        )}
      </PopoverContent>
    </Popover>
  )
}
