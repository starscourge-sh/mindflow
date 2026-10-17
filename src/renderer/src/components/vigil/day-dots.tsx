import { caughtLevel } from '@/lib/calendar'

/** Each mark's one colour at three strengths; both read on light and dark paper. */
const SHADE = { 1: 'opacity-55', 2: 'opacity-80', 3: 'opacity-100' } as const
const GREEN = 'var(--tt-color-text-green,#3c8a5c)'
const BLUE = 'var(--tt-color-text-blue,#2f6fb5)'
/** How strong an opened mark is: 1 for one open, 2 for two or three, 3 for four or more. */
export const openedLevel = (n: number): 1 | 2 | 3 => (n >= 4 ? 3 : n >= 2 ? 2 : 1)

/**
 * A day's small, quiet dots beside its date: green for the days you opened
 * Vigil, blue for how much you captured, an empty ring for a day with none.
 * `caught` undefined is no captures mark; 0 is a gap.
 */
export function DayDots({ opened = 0, caught }: { opened?: number; caught?: number }): React.JSX.Element | null {
  if (!opened && caught === undefined) return null
  return (
    <span aria-hidden className="flex items-center gap-1">
      {opened > 0 && <span data-opened-mark className={`size-1.5 rounded-full ${SHADE[openedLevel(opened)]}`} style={{ background: GREEN }} />}
      {caught !== undefined && caught > 0 && <span data-captured-mark className={`size-1.5 rounded-full ${SHADE[caughtLevel(caught)]}`} style={{ background: BLUE }} />}
      {caught === 0 && <span data-gap-mark className="size-1.5 rounded-full border border-foreground/45" />}
    </span>
  )
}

/** The key under a calendar: what each dot means. */
export function DotsKey({ opened, captures }: { opened: boolean; captures: boolean }): React.JSX.Element | null {
  if (!opened && !captures) return null
  const dot = (style: React.CSSProperties, className = ''): React.JSX.Element => <span aria-hidden className={`size-1.5 rounded-full ${className}`} style={style} />
  return (
    <p data-month-key className="flex flex-wrap items-center gap-x-4 gap-y-1 px-1 text-control text-foreground">
      {opened && <span className="flex items-center gap-1.5">{dot({ background: GREEN })}Opened Vigil</span>}
      {captures && <span className="flex items-center gap-1.5"><span className="flex gap-0.5">{([1, 2, 3] as const).map((n) => <span key={n} aria-hidden className={`size-1.5 rounded-full ${SHADE[n]}`} style={{ background: BLUE }} />)}</span>Captured: 1 to 2, 3 to 5, 6 or more</span>}
      {captures && <span className="flex items-center gap-1.5">{dot({}, 'border border-foreground/45')}Nothing captured</span>}
    </p>
  )
}
