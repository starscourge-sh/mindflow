import { haligtree, useLive } from '@/lib/haligtree'
import { useReading } from '@/lib/reads-in'
import { useState } from 'react'
import { Arc, DotMatrix, Ends, Funnel, MonoCard, PillBars, Spline, Switch, ToneBar, Chip, useHover } from './mono-card'
import { N, Section } from './stats-view'
import { dayMonth, dayjs, num, plural } from '../../../../main/dates'

/** What `study:stats` hands back (haligtree.ts). */
type Studied = { streak: { current: number; longest: number }; average: number; month: { day: string; reviews: number }[]; year: Record<string, number>; checked: number; recalled: number; due: number[]; known: number; cards: number; seconds: number | null; days: { reviewed: number; of: number }
  minutes: number[]; stages: { new: number; learning: number; learnt: number }; sources: { name: string; n: number }[]; growth: { end: string; known: number; made: number }[]; kept: { month: string; notes: number; gems: number }[] }

/** The made-up numbers for the example Stats page. */
const EXAMPLE: Studied = {
  streak: { current: 12, longest: 41 }, average: 18,
  month: Array.from({ length: 30 }, (_, at) => ({ day: new Date(Date.now() - (29 - at) * 86400000).toISOString().slice(0, 10), reviews: (at * 7) % 5 === 0 ? 0 : ((at * 13) % 30) + 4 })),
  year: Object.fromEntries(Array.from({ length: 200 }, (_, at) => [new Date(Date.now() - at * 86400000).toISOString().slice(0, 10), (at * 11) % 4 === 0 ? 0 : (at * 17) % 40])),
  checked: 412, recalled: 361, due: [14, 9, 11, 6, 8, 4, 7, 5, 3, 6, 2, 4, 3, 2], known: 238, cards: 540, seconds: 9, days: { reviewed: 148, of: 200 },
  minutes: Array.from({ length: 30 }, (_, at) => ((at * 7) % 5 === 0 ? 0 : ((at * 13) % 30) / 4 + 1)),
  stages: { new: 120, learning: 64, learnt: 356 }, sources: [{ name: 'Thinking, Fast and Slow', n: 140 }, { name: 'Biology notes', n: 96 }, { name: 'Typed in', n: 61 }],
  growth: Array.from({ length: 12 }, (_, at) => ({ end: new Date(Date.now() - (11 - at) * 7 * 86400000).toISOString().slice(0, 10), known: 120 + at * 11, made: 330 + at * 18 })),
  kept: Array.from({ length: 6 }, (_, at) => ({ month: dayjs().subtract(5 - at, 'month').format('YYYY-MM'), notes: 30 + ((at * 17) % 25), gems: 6 + ((at * 7) % 9) }))
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
    <>
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
    </Section>
    {/* The cards on the page itself, under the sentences, never a box inside a box. */}
    <div className="mt-3"><StudyCards studied={studied} week={week} /></div>
    </>
  )
}

const dayWords = (day: string): string => dayjs(day).format('ddd D MMM')

/**
 * The study numbers as cards, in the look of Amicro's Mono Charts: each
 * leads with its number, says its point in one line, and shows the value of
 * the mark under the pointer.
 */
function StudyCards({ studied, week }: { studied: Studied; week: number }): React.JSX.Element {
  const [span, setSpan] = useState<'month' | 'year'>('month')
  const [onReviews, sayReviews] = useHover()
  const [onMinutes, sayMinutes] = useHover()
  const [onDue, sayDue] = useHover()
  const [onKnown, sayKnown] = useHover()
  const [onSources, saySources] = useHover()
  const [onKept, sayKept] = useHover()
  const reviews = studied.month.reduce((sum, one) => sum + one.reviews, 0)
  const retention = studied.checked ? Math.round((studied.recalled / studied.checked) * 100) : null
  const yearDays = Array.from({ length: 52 * 7 }, (_, at) => { const day = dayjs().subtract(52 * 7 - 1 - at, 'day').format('YYYY-MM-DD'); return { day, n: studied.year[day] ?? 0 } })
  const days = span === 'month' ? studied.month.map((one) => ({ day: one.day, n: one.reviews })) : yearDays
  const yearTotal = yearDays.reduce((sum, one) => sum + one.n, 0)
  const [range, setRange] = useState<'week' | 'month'>('month')
  const shownMinutes = studied.minutes.map((n, at) => ({ day: studied.month[at].day, n })).slice(range === 'week' ? -7 : 0)
  const studiedDays = shownMinutes.filter((one) => one.n).length
  const coming = studied.due.reduce((sum, one) => sum + one, 0)
  const last = studied.growth[studied.growth.length - 1]
  const firstKnown = studied.growth[0]?.known ?? 0
  const keptNow = studied.kept[studied.kept.length - 1]
  const reviewsSaid = (one: { day: string; n: number }): string => `${plural(one.n, 'review', 'reviews')}, ${dayWords(one.day)}`
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div data-study-month className="sm:col-span-2" {...(span === 'year' ? { 'data-study-year': '' } : {})}>
        <MonoCard name="reviews" title={span === 'month' ? 'Cards reviewed each day' : 'Days you reviewed, the darker the more cards'} value={span === 'month' ? reviews : yearTotal} unit={span === 'month' ? 'reviews in 30 days' : 'reviews in a year'}
          chips={week > 0 ? <Chip>{`${num(week)} of the last 7 days`}</Chip> : undefined}
          side={<Switch options={[{ id: 'month', label: '30 days' }, { id: 'year', label: 'Year' }]} value={span} pick={setSpan} />}
          hovered={onReviews} point={week > 0 ? `You reviewed on ${num(week)} of the last 7 days.` : 'Each dot is a day, the darker the more cards.'}>
          <DotMatrix key={span} days={days} say={reviewsSaid} onHover={sayReviews} columns={span === 'month' ? 2 : 7} dot={span === 'month' ? 26 : 14} />
          <Ends left={span === 'month' ? '30 days ago' : 'a year ago'} right="today" />
        </MonoCard>
      </div>
      <MonoCard name="retention" title="Remembered" value={retention === null ? 'None yet' : `${retention}%`} unit={retention === null ? undefined : 'of cards seen before'}
        point={retention === null ? 'Once you see a card a second time, this says how well it stays.' : `You remembered ${num(studied.recalled)} of ${num(studied.checked)} cards you had seen before, in 30 days.`}>
        <Arc percent={retention ?? 0} label={retention === null ? 'nothing to measure yet' : `${num(studied.recalled)} of ${num(studied.checked)}`} />
      </MonoCard>
      <MonoCard name="minutes" title="Minutes reviewing each day" value={Math.round(shownMinutes.reduce((sum, one) => sum + one.n, 0))} unit={`minutes in ${range === 'week' ? '7' : '30'} days`} chips={studiedDays ? <Chip>{plural(studiedDays, 'day', 'days')}</Chip> : undefined}
        side={<Switch options={[{ id: 'week', label: '7 days' }, { id: 'month', label: '30 days' }]} value={range} pick={setRange} />}
        hovered={onMinutes} point={studied.seconds !== null ? `A card takes you about ${plural(studied.seconds, 'second', 'seconds')}.` : 'Time is counted from the next review on.'}>
        <PillBars values={shownMinutes.map((one) => one.n)} keys={shownMinutes.map((one) => one.day)} say={(at) => `${shownMinutes[at].n ? `${num(Math.round(shownMinutes[at].n))} min` : 'No reviews'}, ${dayWords(shownMinutes[at].day)}`} onHover={sayMinutes} className="h-16" />
        <Ends left={range === 'week' ? '7 days ago' : '30 days ago'} right="today" />
      </MonoCard>
      <MonoCard name="known" title="Cards you know" value={studied.known} unit={`of ${plural(studied.cards, 'card', 'cards')}`} chips={last && last.known > firstKnown ? <Chip>{`+${num(last.known - firstKnown)} in 12 weeks`}</Chip> : undefined}
        hovered={onKnown} point="Known means remembered after a gap of 15 days or more. The dashed line is every card you have made.">
        <Spline lines={[{ name: 'cards known', values: studied.growth.map((one) => one.known) }, { name: 'cards made', values: studied.growth.map((one) => one.made), dashed: true }]}
          say={(at) => `${num(studied.growth[at].known)} known of ${num(studied.growth[at].made)} made, week to ${dayWords(studied.growth[at].end)}`} onHover={sayKnown} />
        <Ends left="12 weeks ago" right="this week" />
      </MonoCard>
      <MonoCard name="stages" title="Where your cards stand" value={studied.cards} unit="cards"
        point={studied.stages.learnt ? `${num(studied.stages.learnt)} learnt, ${num(studied.stages.learning)} still being learnt, ${num(studied.stages.new)} not yet seen.` : 'Every card starts new, and is learnt once it sticks.'}>
        <ToneBar parts={[{ name: 'Learnt', n: studied.stages.learnt }, { name: 'Learning', n: studied.stages.learning }, { name: 'New', n: studied.stages.new }]} />
      </MonoCard>
      <MonoCard name="sources" title="Cards by where they came from" value={studied.sources.length} unit={studied.sources.length === 1 ? 'source' : 'sources'}
        hovered={onSources} point={studied.sources[0] ? `Most come from ${studied.sources[0].name}.` : 'Cards made from a book or a note show here.'}>
        <Funnel rows={studied.sources} say={(one) => `${plural(one.n, 'card', 'cards')} from ${one.name}`} onHover={saySources} />
      </MonoCard>
      <div data-study-due>
        <MonoCard name="due" title="Cards coming due" value={coming} unit="in two weeks" chips={<Chip>{`${num(studied.due[0])} today`}</Chip>}
          hovered={onDue} point={`${plural(studied.due[0], 'card is', 'cards are')} due today.`}>
          <PillBars values={studied.due} say={(at) => `${plural(studied.due[at], 'card', 'cards')} due ${at === 0 ? 'today' : at === 1 ? 'tomorrow' : dayMonth(new Date(Date.now() + at * 86400000))}`} onHover={sayDue} className="h-16" />
          <Ends left="today" right="in two weeks" />
        </MonoCard>
      </div>
      <MonoCard name="kept" title="Notes and gems kept" value={keptNow ? keptNow.notes + keptNow.gems : 0} unit="this month" chips={keptNow ? <><Chip>{plural(keptNow.notes, 'note', 'notes')}</Chip><Chip>{plural(keptNow.gems, 'gem', 'gems')}</Chip></> : undefined}
        hovered={onKept} point="The full line is notes, the dashed line gems, month by month.">
        <Spline lines={[{ name: 'notes', values: studied.kept.map((one) => one.notes) }, { name: 'gems', values: studied.kept.map((one) => one.gems), dashed: true }]}
          say={(at) => `${dayjs(`${studied.kept[at].month}-01`).format('MMMM')}: ${plural(studied.kept[at].notes, 'note', 'notes')}, ${plural(studied.kept[at].gems, 'gem', 'gems')}`} onHover={sayKept} />
        <Ends left="six months ago" right="this month" />
      </MonoCard>
    </div>
  )
}

/**
 * The year under the decks, as every Anki heatmap in the videos sits: a
 * square a day, the darker the more cards, and above it the four numbers
 * people quote (Ray's frame): the streak now, the longest, reviews on an
 * average day, and the share of days studied. Drawn at once, never grown in,
 * so the page is still when it shows; the day pointed at is said in a line
 * whose room is kept.
 */
export function StudyYear(): React.JSX.Element {
  const studied = useLive(() => window.api.haligtree('study:stats') as Promise<Studied>, null as Studied | null, [], ['item'])
  const [on, setOn] = useState<string | null>(null)
  const weeks = 53
  // Whole weeks, Monday at the top, ending on this week: today sits in the last column.
  const start = dayjs().startOf('day').subtract((dayjs().day() + 6) % 7, 'day').subtract(weeks - 1, 'week')
  const days = Array.from({ length: weeks * 7 }, (_, at) => start.add(at, 'day')).map((at) => ({ day: at.format('YYYY-MM-DD'), later: at.isAfter(dayjs(), 'day') }))
  const most = Math.max(1, ...Object.values(studied?.year ?? {}))
  const share = studied && studied.days.of ? Math.round((studied.days.reviewed / studied.days.of) * 100) : 0
  const numbers: [string, string][] = [
    [plural(studied?.streak.current ?? 0, 'day', 'days'), 'streak now'],
    [plural(studied?.streak.longest ?? 0, 'day', 'days'), 'longest streak'],
    [plural(studied?.average ?? 0, 'card', 'cards'), 'a day, on days studied'],
    [`${share}%`, 'of days studied']
  ]
  return (
    <section data-study-year-map aria-label="A year of study" className="grid gap-3 rounded-[5px] border border-foreground/10 bg-accent/25 p-4">
      <div data-year-numbers className="grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-4">
        {numbers.map(([value, label]) => (
          <p key={label} data-year-number={label} className="grid">
            <span className="font-serif text-xl leading-tight text-foreground tabular-nums">{value}</span>
            <span className="text-sm text-muted-foreground">{label}</span>
          </p>
        ))}
      </div>
      <div data-year-grid className="grid gap-[2px]" style={{ gridTemplateColumns: `repeat(${weeks}, minmax(0, 1fr))`, gridTemplateRows: 'repeat(7, auto)', gridAutoFlow: 'column' }} onPointerLeave={() => setOn(null)}>
        {days.map((one) => {
          const n = studied?.year[one.day] ?? 0
          return (
            <span key={one.day} data-day={one.day} data-n={n} onPointerEnter={() => setOn(one.later ? null : `${plural(n, 'review', 'reviews')}, ${dayWords(one.day)}`)}
              className="aspect-square w-full rounded-[2px]"
              style={{ background: one.later ? 'transparent' : n ? `color-mix(in oklab, var(--foreground) ${Math.round(25 + 70 * Math.min(1, n / most))}%, transparent)` : 'color-mix(in oklab, var(--foreground) 7%, transparent)' }} />
          )
        })}
      </div>
      <p data-year-said className="flex h-5 items-center justify-between gap-3 text-sm text-muted-foreground tabular-nums">
        <span className="min-w-0 truncate">{on ?? 'A square a day, the darker the more cards.'}</span>
        <span className="shrink-0">{plural(Object.values(studied?.year ?? {}).reduce((sum, n) => sum + n, 0), 'review', 'reviews')} this year</span>
      </p>
    </section>
  )
}
