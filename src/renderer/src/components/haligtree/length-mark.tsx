import type { ReactNode } from 'react'

/**
 * How long something takes, as a mark of its own: the small grey chip a task's length wears on its row (“~25 min”)
 * and a practice's start wears on its offer (“5 min”). One look for a length, wherever it is said.
 */
export function LengthMark({ children, ...more }: { children: ReactNode } & Record<`data-${string}`, string | boolean | undefined>): React.JSX.Element {
  return (
    <span {...more} className="shrink-0 rounded-md px-1.5 py-px text-xs tabular-nums whitespace-nowrap" style={{ background: 'var(--mf-chip-bg-gray)', color: 'var(--mf-chip-ink-gray)' }}>
      {children}
    </span>
  )
}
