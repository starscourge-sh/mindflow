import { useEffect, useState } from 'react'
import { SlidersHorizontal } from 'lucide-react'

import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Tip } from '@/components/vigil/ui'

/**
 * Display, the way Todoist and Linear do it: one button on a list that holds
 * how it is grouped, how it is ordered, and what it shows. Within one filter
 * any chosen option will do; across filters, all must hold. Each list keeps
 * its own choices, in this browser only: they are how you look, not data.
 */
export type Choice = { id: string; label: string }
export type Facet<T> = { key: string; label: string; options: Choice[]; test: (item: T, option: string) => boolean }
export type View = { filter: Record<string, string[]>; sort: string; group: string }

export function useView(name: string, initial: { sort: string; group: string }): [View, (view: View) => void] {
  const key = `view:${name}`
  const read = (): View => {
    try {
      return { filter: {}, ...initial, ...JSON.parse(localStorage.getItem(key) ?? '{}') }
    } catch {
      return { filter: {}, ...initial }
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

export function Chips({ options, on, pick }: { options: readonly Choice[]; on: (id: string) => boolean; pick: (id: string) => void }): React.JSX.Element {
  return (
    <div className="flex flex-wrap gap-1">
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          onClick={() => pick(option.id)}
          className={`rounded-md px-2 py-0.5 text-xs transition-colors ${on(option.id) ? 'bg-accent text-foreground' : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'}`}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

/** The Display button and its panel. F opens it from anywhere on the list. */
export function Display<T>({ view, onChange, facets, sorts, groups = [] }: {
  view: View
  onChange: (view: View) => void
  facets: Facet<T>[]
  sorts: Choice[]
  groups?: Choice[]
}): React.JSX.Element {
  const [open, setOpen] = useState(false)
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      const active = document.activeElement as HTMLElement | null
      if (event.key !== 'f' || event.metaKey || event.ctrlKey || event.altKey) return
      if (active?.isContentEditable || ['INPUT', 'TEXTAREA'].includes(active?.tagName ?? '')) return
      event.preventDefault()
      setOpen((was) => !was)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  const active = Object.values(view.filter).reduce((n, list) => n + list.length, 0)
  const toggle = (key: string, id: string): void => {
    const list = view.filter[key] ?? []
    onChange({ ...view, filter: { ...view.filter, [key]: list.includes(id) ? list.filter((one) => one !== id) : [...list, id] } })
  }
  const Label = ({ children }: { children: string }): React.JSX.Element => <div className="mb-1.5 text-xs text-muted-foreground">{children}</div>
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
      <PopoverContent align="end" className="w-80 space-y-4 p-3 text-sm">
        {groups.length > 0 && (
          <div>
            <Label>Grouping</Label>
            <Chips options={groups} on={(id) => view.group === id} pick={(group) => onChange({ ...view, group })} />
          </div>
        )}
        <div>
          <Label>Ordering</Label>
          <Chips options={sorts} on={(id) => view.sort === id} pick={(sort) => onChange({ ...view, sort })} />
        </div>
        {facets.filter((facet) => facet.options.length).map((facet) => (
          <div key={facet.key}>
            <Label>{facet.label}</Label>
            <Chips options={facet.options} on={(id) => (view.filter[facet.key] ?? []).includes(id)} pick={(id) => toggle(facet.key, id)} />
          </div>
        ))}
        {active > 0 && (
          <button type="button" onClick={() => onChange({ ...view, filter: {} })} className="text-xs text-muted-foreground hover:text-foreground">
            Clear filters
          </button>
        )}
      </PopoverContent>
    </Popover>
  )
}
