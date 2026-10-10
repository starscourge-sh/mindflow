import { useState } from 'react'
import { X } from 'lucide-react'
import { chime } from '@/lib/sound'
import { useLive, vigil, type Settings } from '@/lib/vigil'
import { Button } from '@/components/ui/button'
import { dayKey, num } from '../../../../main/dates'

/**
 * The weekly digest, on Home on Sundays: the seven days to now as four
 * numbers (caught, kept, reviewed, finished) and the week's page a click
 * away. Put away until next Sunday with its ×. Nothing is sent anywhere.
 */
type Week = { caught: number; kept: number; reviewed: number; finished: number }
const AWAY = 'weekly-digest:away'

export function WeeklyDigest({ onView, force = false }: { onView: (id: string) => void; force?: boolean }): React.JSX.Element | null {
  const settings = useLive(vigil.settings, null as Settings | null)
  const week = useLive(() => window.api.vigil('digest:week') as Promise<Week>, null as Week | null)
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
  const parts: [string, number][] = [['caught', week.caught], ['kept', week.kept], ['reviewed', week.reviewed], ['finished', week.finished]]
  return (
    <section data-weekly-digest aria-label="Your week" className="mx-3 rounded-xl border bg-background p-4 @[44rem]/page:mx-6">
      <div className="mb-3 flex items-center gap-2">
        <h2 className="font-heading text-heading font-semibold text-foreground">Your week</h2>
        <span className="text-meta text-muted-foreground">the last seven days</span>
        <span className="flex-1" />
        <Button size="sm" variant="ghost" className="h-7 px-2 text-control" onClick={() => (chime('season'), onView('weekpage'))}>The week's page</Button>
        <button type="button" aria-label="Put this away" onClick={hide} className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-foreground/[0.05] hover:text-foreground">
          <X className="size-3.5" />
        </button>
      </div>
      <div className="grid grid-cols-2 gap-3 @[30rem]/page:grid-cols-4">
        {parts.map(([label, n]) => (
          <p key={label} data-digest={label} className="flex flex-col">
            <span className="font-heading text-[1.75rem] leading-none font-semibold text-foreground tabular-nums">{num(n)}</span>
            <span className="mt-1 text-control text-muted-foreground">{label}</span>
          </p>
        ))}
      </div>
    </section>
  )
}
