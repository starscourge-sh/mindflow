import { useEffect, useState } from 'react'

import { percent, tempus } from '../../../../main/goal-days'
import { ProgressBar } from './progress-bar'
import { Rolling } from './ui'

const UNITS = [
  { id: 'day', label: 'Today' },
  { id: 'week', label: 'This week' },
  { id: 'month', label: 'This month' },
  { id: 'year', label: 'This year' }
] as const

/**
 * How much of the day, the week, the month and the year has gone, on Home
 * once turned on in Settings: the menu bar's "Time gone", as four thin bars
 * that line up, each with its percent beside it. Moves on once a minute.
 */
export function TimeGone({ heading }: { /** Home's own heading, so it reads as one of Home's parts. */ heading: React.ReactNode }): React.JSX.Element {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(timer)
  }, [])
  const time = tempus(now)
  return (
    <section data-time-gone aria-label="Time gone" className="flex flex-col gap-2">
      {heading}
      <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2.5">
        {UNITS.map(({ id, label }) => (
          <div key={id} data-time-unit={id} className="contents">
            <span data-time-label className="text-control whitespace-nowrap text-foreground">{label}</span>
            <ProgressBar value={time[id]} label={`${label}: ${percent(time[id])} gone`} thick={3} silent />
            <span data-time-said={`${percent(time[id])} gone`} className="text-control whitespace-nowrap text-foreground tabular-nums"><Rolling text={percent(time[id])} /> gone</span>
          </div>
        ))}
      </div>
    </section>
  )
}
