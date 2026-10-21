import { useState, type ReactNode } from 'react'
import { ChevronRight } from 'lucide-react'

import { chime } from '@/lib/sound'
import { num } from '../../../../main/dates'
import { CAPTURE_TYPES } from '../capture-kinds/capture-kind-picker'
import { Rolling } from './ui'
import { MORE_STEP } from './show-more'

/** How many of a kind show before "Show 12 more". */
export const ISLAND_FEW = 5

/** One island's state, as the list draws it. */
export type IslandState = {
  /** How many it holds in all, not only those showing. */
  total: number
  folded: boolean
  /** All of it showing, past the first few. */
  whole: boolean
  onFold: () => void
  /** The next lot under it: a kind of thousands opens a page at a time, never all at once. */
  onWhole: () => void
  /** Back to the first few. */
  onFewer: () => void
}

/** A kind's icon and colour, by the name its group is given (Tasks, Note, Quote...). */
export function kindOfGroup(name: string): (typeof CAPTURE_TYPES)[number] | undefined {
  return CAPTURE_TYPES.find((type) => type.label === name || type.id === name || (name === 'Tasks' && type.id === 'todo'))
}

/**
 * A grouped list drawn as islands, one a kind: each folds, shows its newest
 * few, and says how many more wait under it. Folds and "Show more" are kept
 * per list (`key`), so the Inbox and the box each keep their own. It gives
 * back only the rows that show, so the arrow keys and the cursor see what you
 * see; ⌘A and "Select all" take the groups as they came, the whole list.
 */
export function useIslands(key: string, on: boolean): <T>(groups: [string, T[]][]) => { groups: [string, T[]][]; islands?: Record<string, IslandState> } {
  const store = `islands:${key}`
  type Kept = { folded: string[]; whole: string[]; more?: Record<string, number> }
  const read = (): Kept => {
    try {
      return { folded: [], whole: [], ...JSON.parse(localStorage.getItem(store) ?? '{}') }
    } catch {
      return { folded: [], whole: [] }
    }
  }
  const [kept, setKept] = useState(read)
  const save = (next: Kept): void => {
    setKept(next)
    try {
      localStorage.setItem(store, JSON.stringify(next))
    } catch {
      // Applied, not kept.
    }
  }
  const flip = (list: string[], name: string): string[] => (list.includes(name) ? list.filter((one) => one !== name) : [...list, name])
  return <T,>(groups: [string, T[]][]): { groups: [string, T[]][]; islands?: Record<string, IslandState> } => {
    // One unnamed group is a plain list, not an island.
    if (!on || (groups.length === 1 && !groups[0][0])) return { groups }
    const islands: Record<string, IslandState> = {}
    // An empty kind is left out.
    const shown = groups.filter(([, list]) => list.length > 0).map(([name, list]) => {
      const folded = kept.folded.includes(name)
      // How many show: the first few, and a lot more for each "Show more" (one kept "whole" before this counts as one).
      const count = kept.more?.[name] ?? (kept.whole.includes(name) ? ISLAND_FEW + MORE_STEP : ISLAND_FEW)
      const whole = count >= list.length
      const set = (to: number): void => save({ ...kept, whole: kept.whole.filter((one) => one !== name), more: { ...kept.more, [name]: to } })
      islands[name] = {
        total: list.length,
        folded,
        whole,
        onFold: () => (chime(folded ? 'open' : 'fold'), save({ ...kept, folded: flip(kept.folded, name) })),
        onWhole: () => (chime('open'), set(count + MORE_STEP)),
        onFewer: () => (chime('fold'), set(ISLAND_FEW))
      }
      return [name, folded ? [] : list.slice(0, count)] as [string, T[]]
    })
    return { groups: shown, islands }
  }
}

/** The top of an island: the kind's icon, its name and how many, and the fold. */
export function IslandHead({ name, island, icon }: { name: string; island: IslandState; /** Where the group is not a capture's kind (a Gem, an Article). */ icon?: ReactNode }): React.JSX.Element {
  const kind = kindOfGroup(name)
  const Icon = icon ? null : kind?.icon
  return (
    <button type="button" data-island-head={name} aria-expanded={!island.folded} onClick={island.onFold}
      className="group/head flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-control font-semibold text-foreground transition-colors hover:bg-accent/50">
      {icon}
      {Icon && <Icon aria-hidden className="size-4 shrink-0" style={{ color: kind?.tint }} />}
      <span className="min-w-0 truncate">{name}</span>
      <span className="shrink-0 font-normal text-muted-foreground tabular-nums"><Rolling text={island.total} /></span>
      <ChevronRight aria-hidden className={`ml-auto size-3.5 shrink-0 text-muted-foreground transition-transform duration-150 ease-(--mf-ease) group-hover/head:text-foreground ${island.folded ? '' : 'rotate-90'}`} />
    </button>
  )
}

/** "Show 12 more" under an island's first few (a hundred at a time, for a kind of thousands), or "Show fewer" once it is whole. */
export function IslandMore({ island, shown }: { island: IslandState; shown: number }): React.JSX.Element | null {
  const more = island.total - shown
  if (!island.whole && more <= 0) return null
  if (island.whole && island.total <= ISLAND_FEW) return null
  const next = Math.min(more, MORE_STEP)
  return (
    <button type="button" data-island-more onClick={island.whole ? island.onFewer : island.onWhole}
      className="mt-0.5 flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-left text-control font-medium text-foreground/80 transition-colors hover:bg-accent/50 hover:text-foreground">
      {island.whole ? 'Show fewer' : `Show ${num(next)} more`}
      {!island.whole && more > next && <span className="font-normal text-foreground/70">of {num(more)}</span>}
    </button>
  )
}

/** One island whole: its head, then its rows in a rounded panel, as the details sidebar draws its groups. */
export function IslandBox({ name, island, shown, icon, children }: { name: string; island: IslandState; shown: number; icon?: ReactNode; children: ReactNode }): React.JSX.Element {
  return (
    <section data-island={name} className="mt-2 first:mt-0">
      <IslandHead name={name} island={island} icon={icon} />
      {!island.folded && (
        <div className="mf-island rounded-lg border bg-accent/25 p-1">
          {children}
          <IslandMore island={island} shown={shown} />
        </div>
      )}
    </section>
  )
}
