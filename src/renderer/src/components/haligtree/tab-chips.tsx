import { motion } from 'motion/react'
import { chime } from '@/lib/sound'
import { cn } from '@/lib/cn'
import { num } from '../../../../main/dates'
import { DROP_LIT } from './sortable'
import { Rolling, Tip } from './ui'
import { haligtree, useLive, type Settings } from '@/lib/haligtree'

/** One tab: its words, and, where a tab is a list, how many are in it. */
export type TabChip<T extends string> = { value: T; label: string; count?: number; tip?: string }

/**
 * A page's own tabs, the one switch every page uses (Review, Stats, Goals,
 * Tasks, Questions, the Feed): a 32px track of quiet ink holding 28px tabs, the
 * chosen one a raised pill of the page's colour that slides under its word.
 * Fixed at the left of the page's line, where they stay put (DESIGN.md, Chip tabs).
 */
export function TabChips<T extends string>({ name, tabs, value, onChange, className, drops, data, quiet = false }: {
  name: string
  tabs: readonly TabChip<T>[]
  value: T | null
  onChange: (value: T) => void
  className?: string
  /** Tabs a dragged row can be dropped on (sortable.tsx's places), by the place each one is. */
  drops?: Partial<Record<string, string>>
  /** Each tab also named as `data-<data>="<value>"`, for a page whose own words for its tabs came first (data-review-tab). */
  data?: string
  /** The page decides and sounds every press itself, the chosen tab's too (Review: pressed again, it shuts a form open over it). */
  quiet?: boolean
}): React.JSX.Element {
  // Two looks, one switch (Settings › Appearance › Page tabs): plain pills, the Journal's compact row, to start; or a
  // boxed bar with a raised pill.
  const boxed = useLive(haligtree.settings, null as Settings | null)?.tabLook === 'boxed'
  return (
    <span role="tablist" data-chips={name} data-tab-look={boxed ? 'boxed' : 'plain'} className={cn('flex h-8 w-fit shrink-0 items-center text-control', boxed ? 'rounded-lg border border-foreground/10 bg-accent/40 p-0.5' : 'gap-0.5', className)}>
      {tabs.map((one) => (
        <Tip key={one.value} label={one.tip ?? ''}>
          <button type="button" role="tab" data-chip={one.value} {...(data ? { [`data-${data}`]: one.value } : {})} aria-selected={value === one.value}
            aria-label={one.count === undefined ? one.label : `${one.label} ${num(one.count)}`} data-row-drop={drops?.[one.value]}
            onClick={() => void (quiet ? onChange(one.value) : value !== one.value && (chime('tap'), onChange(one.value)))}
            className={cn('relative h-7 cursor-pointer px-3 whitespace-nowrap', boxed ? 'rounded-md' : 'rounded-full', ' transition-[color,transform] duration-[120ms] ease-out active:scale-[0.97]', drops?.[one.value] && DROP_LIT, value === one.value ? 'text-foreground' : 'text-muted-foreground hover:text-foreground')}>
            {value === one.value && <motion.span layoutId={`${name}-tab`} className={cn('absolute inset-0 -z-10', boxed ? 'rounded-md border border-foreground/15 bg-background shadow-sm' : 'rounded-full bg-accent')} transition={{ type: 'spring', stiffness: 500, damping: 38 }} />}
            {one.label}
            {one.count !== undefined && <span data-chip-count className="ml-1.5 text-muted-foreground tabular-nums"><Rolling text={num(one.count)} /></span>}
          </button>
        </Tip>
      ))}
    </span>
  )
}
