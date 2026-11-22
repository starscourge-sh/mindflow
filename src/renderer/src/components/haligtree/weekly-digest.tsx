import { useEffect, useState } from 'react'
import { eveningAt } from '@/lib/sun'
import { useReading } from '@/lib/reads-in'
import { X } from 'lucide-react'
import { chime } from '@/lib/sound'
import { useLive, haligtree, type Settings } from '@/lib/haligtree'
import { Button } from '@/components/ui/button'
import { dayjs, dayKey, num, plural } from '../../../../main/dates'
import { openCloseWeek, weekDue } from './close-week'
import { Rolling } from './ui'
import { openWrap, worthWrapping } from './wrap-story'

/**
 * The weekly digest, on Home on Sundays: the seven days to now as four
 * numbers (caught, kept, reviewed, finished) and the week's page a click
 * away. Put away until next Sunday with its ×. Nothing is sent anywhere.
 */
type Week = { caught: number; kept: number; reviewed: number; finished: number; /** Of those kept, the pages. */ pages?: number }
type Label = 'caught' | 'kept' | 'reviewed' | 'finished'
const AWAY ='weekly-digest:away'

/** What moved most against the week before, said plainly: "12 finished, 4 more than last week". */
function weekChange(week: Week, last: Week | null): string | null {
  if (!last) return null
  const labels: Label[] =['finished', 'reviewed', 'kept', 'caught']
  const moved = labels.map((label) => ({ label, now: week[label], by: week[label] - last[label] })).sort((a, b) => Math.abs(b.by) - Math.abs(a.by))[0]
  if (!moved || !moved.by) return 'Much the same as the week before.'
  return `${num(moved.now)} ${moved.label}, ${num(Math.abs(moved.by))} ${moved.by > 0 ? 'more' : 'fewer'} than the week before.`
}

export function WeeklyDigest({ onView, force = false }: { onView: (id: string) => void; force?: boolean }): React.JSX.Element | null {
  const settings = useLive(haligtree.settings, null as Settings | null)
  const week = useLive(() => window.api.haligtree<Week>('digest:week'), null as Week | null)
  const last = useLive(() => window.api.haligtree<Week>('digest:last'), null as Week | null)
  useReading(!settings || !week || !last)
  const wrapId = `week:${dayKey(dayjs().startOf('week'))}`
  // Asked once for this week's figures, never on every save: it reads what the whole story reads.
  const [worth, setWorth] = useState(false)
  const shows = !!week && week.caught + week.kept + week.reviewed + week.finished > 0
  useEffect(() => {
    if (!shows) return
    let live = true
    void worthWrapping(wrapId).then((yes) => live && setWorth(yes))
    return () => void (live = false)
  }, [wrapId, shows, week?.caught, week?.kept, week?.reviewed, week?.finished])
  // Closed this week: the offer to close it goes.
  const [, heard] = useState(0)
  useEffect(() => {
    const again = (): void => heard((n) => n + 1)
    window.addEventListener('haligtree:week-closed', again)
    return () => window.removeEventListener('haligtree:week-closed', again)
  }, [])
  const [away, setAway] = useState(() => {
    try {
      return localStorage.getItem(AWAY) === dayKey()
    } catch {
      return false
    }
  })
  const sunday = new Date().getDay() === 0
  // A week with nothing in it has nothing to say: a new book's first Sunday showed four zeros, "Much the same as the week before."
  const empty = week && week.caught + week.kept + week.reviewed + week.finished === 0
  if (!settings || settings.weeklyDigest === false || !week || away || !(sunday || force) || (empty && !force)) return null
  const hide = (): void => {
    chime('fold')
    setAway(true)
    try {
      localStorage.setItem(AWAY, dayKey())
    } catch {
      // Back on the next look, then.
    }
  }
  // Only the figures that are not nought: a row of zeros says nothing (the user, 22 Nov: "0 caught · 1 kept · 0 reviewed · 0 finished").
  const parts = ([['caught', week.caught], ['kept', week.kept], ['reviewed', week.reviewed], ['finished', week.finished]] as [Label, number][]).filter(([, n]) => n > 0)
  // One figure alone is a sentence, not a tile: "1 page kept this week".
  const pages = week.pages ?? 0
  const keptSaid = (): string => (pages === week.kept ? plural(pages, 'page') : pages ? `${plural(week.kept - pages, 'gem')} and ${plural(pages, 'page')}` : plural(week.kept, 'gem')) + ' kept'
  const said: Record<Label, () => string> = {
    caught: () => `${plural(week.caught, 'thing')} caught`, kept: keptSaid,
    reviewed: () => `${plural(week.reviewed, 'card')} reviewed`, finished: () => `${plural(week.finished, 'task')} finished`
  }
  const one = parts.length === 1 ? `${said[parts[0][0]]()} this week.` : null
  return (
    <section data-weekly-digest aria-label="Your week" className="rounded-xl border bg-background p-4">
      <div className="mb-3 flex items-center gap-2">
        <h2 className="font-heading text-heading font-semibold text-foreground">Your week</h2>
        <span className="text-meta text-muted-foreground">the last seven days</span>
        <span className="flex-1" />
        {/* Offered only when the week has a story to tell (wrap-story.tsx `enough`): never a Wrapped about nothing. */}
        {worth && <Button size="sm" variant="ghost" className="h-7 px-2 text-control" data-digest-wrap onClick={() => openWrap(wrapId)}>Your week, wrapped</Button>}
        <Button size="sm" variant="ghost" className="h-7 px-2 text-control" onClick={() => (chime('season'), onView('weekpage'))}>The week's page</Button>
        {/* Sunday evening: the week's own ending, as the evening has Close the day. */}
        {weekDue(eveningAt(settings)) && <Button size="sm" className="h-7 px-2.5 text-control" onClick={openCloseWeek}>Close the week</Button>}
        <button type="button" aria-label="Put this away" onClick={hide} className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-foreground/[0.05] hover:text-foreground">
          <X className="size-3.5" />
        </button>
      </div>
      {one ? (
        <p data-digest-line className="font-heading text-lead font-semibold text-foreground">{one}</p>
      ) : (
        <div className="grid grid-cols-2 gap-3 @[30rem]/page:grid-cols-4">
          {parts.map(([label, n]) => (
            <p key={label} data-digest={label} className="flex flex-col">
              <span className="font-heading text-[1.75rem] leading-none font-semibold text-foreground tabular-nums">{/* Written as the page paints; a figure rolls only when it changes in front of you (lib/motion.ts, rule 3). */}<Rolling text={num(n)} /></span>
              <span className="mt-1 text-control text-muted-foreground">{label}</span>
            </p>
          ))}
        </div>
      )}
      {/* The change against last week, unless the one line already says the week's only figure. */}
      {!one && weekChange(week, last) && <p data-digest-change className="mt-3 text-body font-medium text-foreground">{weekChange(week, last)}</p>}
    </section>
  )
}
