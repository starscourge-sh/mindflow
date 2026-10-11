import { useEffect, useRef, useState } from 'react'
import { animate, motion, useMotionValue, useTransform } from 'motion/react'
import { X } from 'lucide-react'
import { chime } from '@/lib/sound'
import { useLive, vigil, type Settings } from '@/lib/vigil'
import { Button } from '@/components/ui/button'
import { dayKey, num } from '../../../../main/dates'
import { openCloseWeek, weekDue } from './close-week'

/**
 * The weekly digest, on Home on Sundays: the seven days to now as four
 * numbers (caught, kept, reviewed, finished) and the week's page a click
 * away. Put away until next Sunday with its ×. Nothing is sent anywhere.
 */
type Week = { caught: number; kept: number; reviewed: number; finished: number }
const AWAY = 'weekly-digest:away'
/** The day the numbers last counted up: once a day, on the first look, and written after that. */
const COUNTED = 'weekly-digest:counted'

/** A number added up in front of you, quick then easing into place; figures of one width, so nothing shifts. */
function CountUp({ n }: { n: number }): React.JSX.Element {
  const value = useMotionValue(0)
  const shown = useTransform(value, (at) => num(Math.round(at)))
  useEffect(() => {
    const run = animate(value, n, { duration: Math.min(1.4, 0.5 + Math.log10(n + 1) * 0.3), delay: 0.2, ease: [0.16, 1, 0.3, 1] })
    return () => run.stop()
  }, [n, value])
  return <motion.span aria-label={num(n)}>{shown}</motion.span>
}

/** What moved most against the week before, said plainly: "12 finished, 4 more than last week". */
export function weekChange(week: Week, last: Week | null): string | null {
  if (!last) return null
  const labels: (keyof Week)[] = ['finished', 'reviewed', 'kept', 'caught']
  const moved = labels.map((label) => ({ label, now: week[label], by: week[label] - last[label] })).sort((a, b) => Math.abs(b.by) - Math.abs(a.by))[0]
  if (!moved || !moved.by) return 'Much the same as the week before.'
  return `${num(moved.now)} ${moved.label}, ${num(Math.abs(moved.by))} ${moved.by > 0 ? 'more' : 'fewer'} than the week before.`
}

export function WeeklyDigest({ onView, force = false }: { onView: (id: string) => void; force?: boolean }): React.JSX.Element | null {
  const settings = useLive(vigil.settings, null as Settings | null)
  const week = useLive(() => window.api.vigil('digest:week') as Promise<Week>, null as Week | null)
  const last = useLive(() => window.api.vigil('digest:last') as Promise<Week>, null as Week | null)
  // Counted up on the day's first look only (decided the first time it is
  // really on screen); a page painted again shows them still.
  const counted = useRef<boolean | null>(null)
  // Closed this week: the offer to close it goes.
  const [, heard] = useState(0)
  useEffect(() => {
    const again = (): void => heard((n) => n + 1)
    window.addEventListener('vigil:week-closed', again)
    return () => window.removeEventListener('vigil:week-closed', again)
  }, [])
  const [away, setAway] = useState(() => {
    try {
      return localStorage.getItem(AWAY) === dayKey()
    } catch {
      return false
    }
  })
  const sunday = new Date().getDay() === 0
  if (!settings || settings.weeklyDigest === false || !week || away || !(sunday || force)) return null
  const hide = (): void => {
    chime('fold')
    setAway(true)
    try {
      localStorage.setItem(AWAY, dayKey())
    } catch {
      // Back on the next look, then.
    }
  }
  if (counted.current === null) {
    try {
      counted.current = localStorage.getItem(COUNTED) !== dayKey()
      localStorage.setItem(COUNTED, dayKey())
    } catch {
      counted.current = false
    }
  }
  const counts = counted.current
  const parts: [string, number][] = [['caught', week.caught], ['kept', week.kept], ['reviewed', week.reviewed], ['finished', week.finished]]
  return (
    <section data-weekly-digest aria-label="Your week" className="mx-3 rounded-xl border bg-background p-4 @[44rem]/page:mx-6">
      <div className="mb-3 flex items-center gap-2">
        <h2 className="font-heading text-heading font-semibold text-foreground">Your week</h2>
        <span className="text-meta text-muted-foreground">the last seven days</span>
        <span className="flex-1" />
        <Button size="sm" variant="ghost" className="h-7 px-2 text-control" onClick={() => (chime('season'), onView('weekpage'))}>The week's page</Button>
        {/* Sunday evening: the week's own ending, as the evening has Close the day. */}
        {weekDue(settings.closeDayAt) && <Button size="sm" className="h-7 px-2.5 text-control" onClick={openCloseWeek}>Close the week</Button>}
        <button type="button" aria-label="Put this away" onClick={hide} className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-foreground/[0.05] hover:text-foreground">
          <X className="size-3.5" />
        </button>
      </div>
      <div className="grid grid-cols-2 gap-3 @[30rem]/page:grid-cols-4">
        {parts.map(([label, n]) => (
          <p key={label} data-digest={label} className="flex flex-col">
            <span className="font-heading text-[1.75rem] leading-none font-semibold text-foreground tabular-nums">{counts ? <CountUp n={n} /> : num(n)}</span>
            <span className="mt-1 text-control text-muted-foreground">{label}</span>
          </p>
        ))}
      </div>
      {weekChange(week, last) && <p data-digest-change className="mt-3 text-body font-medium text-foreground">{weekChange(week, last)}</p>}
    </section>
  )
}
