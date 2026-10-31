import { haligtree, useLive } from '@/lib/haligtree'
import { useReading } from '@/lib/reads-in'
import { DaysHeatmap } from './days-heatmap'
import { Bars } from './focus-stats'
import { N, Section } from './stats-view'
import { dayMonth, num, plural } from '../../../../main/dates'

/** What `study:stats` hands back (haligtree.ts). */
type Studied = { month: { day: string; reviews: number }[]; year: Record<string, number>; checked: number; recalled: number; due: number[]; known: number; cards: number; seconds: number | null; days: { reviewed: number; of: number } }

/** The made-up numbers for the example Stats page. */
const EXAMPLE: Studied = {
  month: Array.from({ length: 30 }, (_, at) => ({ day: new Date(Date.now() - (29 - at) * 86400000).toISOString().slice(0, 10), reviews: (at * 7) % 5 === 0 ? 0 : ((at * 13) % 30) + 4 })),
  year: Object.fromEntries(Array.from({ length: 200 }, (_, at) => [new Date(Date.now() - at * 86400000).toISOString().slice(0, 10), (at * 11) % 4 === 0 ? 0 : (at * 17) % 40])),
  checked: 412, recalled: 361, due: [14, 9, 11, 6, 8, 4, 7, 5, 3, 6, 2, 4, 3, 2], known: 238, cards: 540, seconds: 9, days: { reviewed: 148, of: 200 }
}

/** A small caption under a chart, its axis in words: what each bar is and what its height counts. */
function Axis({ left, right }: { left: string; right: string }): React.JSX.Element {
  return (
    <p className="mt-1 flex justify-between text-xs text-muted-foreground">
      <span>{left}</span>
      <span>{right}</span>
    </p>
  )
}

/**
 * Remembering, as sentences first and then the charts behind them: how many
 * cards you reviewed in 30 days, how often you remembered one you had seen
 * before, how many fall due in the next two weeks, and a year of review days.
 * Each chart says in a line what it shows, its bars named in their tips.
 */
export function StudySection({ example }: { example: boolean }): React.JSX.Element | null {
  const real = useLive(() => window.api.haligtree('study:stats') as Promise<Studied>, null as Studied | null, [], ['item'])
  const studied = example ? EXAMPLE : real
  // Days reviewed of the last seven, today included: the week first, which one day off cannot break.
  const today = useLive(haligtree.reviewToday, null as Awaited<ReturnType<typeof haligtree.reviewToday>> | null, [], ['item'])
  const week = example ? 5 : today?.week ?? 0
  useReading(!studied)
  if (!studied) return null
  const reviews = studied.month.reduce((sum, one) => sum + one.reviews, 0)
  const retention = studied.checked ? Math.round((studied.recalled / studied.checked) * 100) : null
  const coming = studied.due.reduce((sum, one) => sum + one, 0)
  return (
    <Section title="Remembering" big={{ value: retention === null ? '–' : `${retention}%`, label: 'of cards remembered, last 30 days' }}>
      <p data-study-said data-reviews={reviews}>
        In the last 30 days you reviewed <N>{plural(reviews, 'card', 'cards')}</N>
        {retention === null ? ', none of them seen before, so there is nothing yet to say how well they stay.' : <> and remembered <N>{`${retention}%`}</N> of those you had seen before ({num(studied.recalled)} of {num(studied.checked)}).</>}{' '}
        <N>{plural(studied.due[0], 'card is', 'cards are')}</N> due today, and <N>{num(coming)}</N> in all over the next two weeks.
      </p>
      {week > 0 && <p data-study-week={week}><N>{`${num(week)} of the last 7 days`}</N> reviewed: one day off cannot break that.</p>}
      {/* The honest ones: known means remembered across 15 days, not just seen. */}
      <p data-study-honest>
        {studied.known ? <><N>{num(studied.known)}</N> of your <N>{plural(studied.cards, 'card', 'cards')}</N> {studied.known === 1 ? 'is' : 'are'} known: remembered after a gap of 15 days or more.</>
          : <>None of your <N>{plural(studied.cards, 'card', 'cards')}</N> is known yet: a card counts once you remember it after a gap of 15 days or more.</>}
        {studied.seconds !== null && <> A card takes you about <N>{plural(studied.seconds, 'second', 'seconds')}</N>.</>}
        {studied.days.of > 0 && <> You reviewed on <N>{`${Math.round((studied.days.reviewed / studied.days.of) * 100)}%`}</N> of days since you began ({num(studied.days.reviewed)} of {num(studied.days.of)}).</>}
      </p>
      <figure data-study-month>
        <figcaption className="mb-2 text-control font-medium text-foreground">Cards reviewed each day</figcaption>
        <Bars values={studied.month.map((one) => one.reviews)} tips={studied.month.map((one) => `${dayMonth(one.day)}: ${plural(one.reviews, 'card', 'cards')}`)} className="h-20" peak={(most) => `most: ${num(most)}`} />
        <Axis left="30 days ago" right="today" />
      </figure>
      <figure data-study-due>
        <figcaption className="mb-2 text-control font-medium text-foreground">Cards coming due</figcaption>
        <Bars values={studied.due} tips={studied.due.map((n, at) => `${at === 0 ? 'Today' : at === 1 ? 'Tomorrow' : dayMonth(new Date(Date.now() + at * 86400000))}: ${plural(n, 'card', 'cards')}`)} className="h-20" peak={(most) => `busiest: ${num(most)}`} />
        <Axis left="today" right="in two weeks" />
      </figure>
      <figure data-study-year>
        <figcaption className="mb-2 text-control font-medium text-foreground">Days you reviewed, the darker the more cards</figcaption>
        <div className="flex justify-end overflow-hidden"><DaysHeatmap amount={studied.year} unit={['card reviewed', 'cards reviewed']} weeks={52} className="shrink-0" /></div>
      </figure>
    </Section>
  )
}
