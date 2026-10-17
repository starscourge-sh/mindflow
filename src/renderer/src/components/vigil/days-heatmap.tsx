import { Tip } from '@/components/vigil/ui'
import { dayjs } from '../../../../main/dates'

/**
 * The days you opened Vigil, twelve weeks of them, oldest first and ending
 * today: a column a week, a cell a day, lit on a day it was opened. Shared by
 * Stats and Home, so the two never draw it differently.
 */
export function DaysHeatmap({ opened, weeks = 12, className = '' }: { opened: Iterable<string>; weeks?: number; className?: string }): React.JSX.Element {
  const lit = new Set(opened)
  const length = weeks * 7
  const days = Array.from({ length }, (_, index) => dayjs().subtract(length - 1 - index, 'day').format('YYYY-MM-DD'))
  return (
    <div data-days-heatmap className={`grid w-fit grid-flow-col grid-rows-7 gap-[3px] ${className}`}>
      {days.map((day) => (
        <Tip key={day} label={`${dayjs(day).format('ddd D MMM')}${lit.has(day) ? ': opened' : ''}`}>
          <div data-on={lit.has(day) || undefined} className={`size-2.5 rounded-[2px] ${lit.has(day) ? 'bg-[var(--tt-brand-color-400)]' : 'bg-border/70'}`} />
        </Tip>
      ))}
    </div>
  )
}
