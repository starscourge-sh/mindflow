import { useEffect, useState } from 'react'

import { chime } from '@/lib/sound'
import { num } from '../../../../main/dates'

/** How many more each press of "Show more" adds, at most: a log of 3,000 lines opens a page at a time, never all at once. */
export const MORE_STEP = 100

/**
 * The first `few` of a long list, and a press for the next lot. Back to the
 * first few when `reset` changes (another note opened).
 */
export function useShowMore<T>(list: T[], few: number, reset?: unknown): { shown: T[]; count: number; onMore: () => void; onFewer: () => void } {
  const [count, setCount] = useState(few)
  useEffect(() => setCount(few), [reset, few])
  return {
    shown: list.length > count ? list.slice(0, count) : list,
    count,
    onMore: () => (chime('open'), setCount((was) => was + MORE_STEP)),
    onFewer: () => (chime('fold'), setCount(few))
  }
}

/**
 * Under a list cut short: "Show 12 more", or "Show 100 more" with how many are
 * left when that is more than one press brings. "Show fewer" once all of it
 * is out. Nothing when the list fits.
 */
export function ShowMore({ total, shown, few, onMore, onFewer, className = '' }: { total: number; shown: number; few: number; onMore: () => void; onFewer: () => void; className?: string }): React.JSX.Element | null {
  if (total <= few) return null
  const left = total - shown
  const whole = left <= 0
  const next = Math.min(left, MORE_STEP)
  return (
    <button type="button" data-show-more aria-expanded={whole} onClick={whole ? onFewer : onMore}
      className={`flex h-8 items-center gap-1.5 rounded-md px-2 text-left text-control font-medium text-foreground/85 transition-colors hover:bg-accent/60 hover:text-foreground ${className}`}>
      {whole ? 'Show fewer' : `Show ${num(next)} more`}
      {!whole && left > next && <span className="font-normal text-foreground/70">of {num(left)}</span>}
    </button>
  )
}
