import { Tip } from '@/components/vigil/ui'
import { dayjs, num } from '../../../../main/dates'

/**
 * Days as a grid, oldest first and ending today: a column a week, a cell a
 * day. Lit on the days in `opened` (the days you opened Vigil, twelve weeks
 * of them); or, given `amount`, each day shaded by how much it holds (words
 * written), in four steps, and named in its tip with `unit`. Shared by Stats
 * and Home, so they never draw it differently.
 */
export function DaysHeatmap({ opened = [], amount, unit = ['word', 'words'], weeks = 12, className = '' }: { opened?: Iterable<string>; amount?: Record<string, number>; unit?: [string, string]; weeks?: number; className?: string }): React.JSX.Element {
  const lit = new Set(opened)
  const length = weeks * 7
  const days = Array.from({ length }, (_, index) => dayjs().subtract(length - 1 - index, 'day').format('YYYY-MM-DD'))
  // Four steps, each a quarter of the busiest day, so one long day never washes the rest out to nothing.
  const most = amount ? Math.max(1, ...Object.values(amount)) : 1
  const step = (n: number): number => (n <= 0 ? 0 : Math.min(4, Math.ceil((n / most) * 4)))
  const SHADE = ['', '30%', '55%', '78%', '100%']
  return (
    <div data-days-heatmap className={`grid w-fit grid-flow-col grid-rows-7 gap-[3px] ${className}`}>
      {days.map((day) => {
        const n = amount?.[day] ?? 0
        const on = amount ? n > 0 : lit.has(day)
        const label = amount ? `${dayjs(day).format('ddd D MMM')}: ${n ? `${num(n)} ${n === 1 ? unit[0] : unit[1]}` : 'none'}` : `${dayjs(day).format('ddd D MMM')}${on ? ': opened' : ''}`
        return (
          <Tip key={day} label={label}>
            <div data-on={on || undefined} data-day={day} data-amount={amount ? n : undefined} className={`size-2.5 rounded-[2px] ${on ? '' : 'bg-border/70'}`}
              style={on ? { background: amount ? `color-mix(in oklab, var(--tt-brand-color-400) ${SHADE[step(n)]}, var(--background))` : 'var(--tt-brand-color-400)' } : undefined} />
          </Tip>
        )
      })}
    </div>
  )
}
