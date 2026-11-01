import { haligtree, useLive } from '@/lib/haligtree'
import { useReading } from '@/lib/reads-in'
import { useState } from 'react'
import { Ends, Funnel, MonoCard, PillBars, Spline, Switch, ToneBar, Chip, useHover } from './mono-card'
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
        {retention === null ? 'None of the cards you reviewed in the last 30 days had been seen before, so there is nothing yet to say how well they stay.' : <>Of the cards you had seen before, you remembered {num(studied.recalled)} of {num(studied.checked)} in the last 30 days.</>}{' '}
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
    <div className="mt-3"><StudyCards studied={studied} /></div>
    </>
  )
}

const dayWords = (day: string): string => dayjs(day).format('ddd D MMM')

/** Five steps of ink, as GitHub's and Anki's heatmaps have: none, then four by share of the busiest day. */
const INK_STEPS = [7, 30, 50, 70, 92]
const stepOf = (n: number, most: number): number => (n ? Math.min(4, 1 + Math.floor((n / Math.max(1, most)) * 3.999)) : 0)
const shadeOf = (step: number): string => `color-mix(in oklab, var(--foreground) ${INK_STEPS[step]}%, transparent)`

/** Days as square cells 3 px apart in the year's five steps of ink, today ringed: the 30 days and the year in Stats, drawn as the year above the decks is. */
function DayCells({ days, say, onHover, rows, cell }: { days: { day: string; n: number }[]; say: (day: { day: string; n: number }) => string; onHover: (said: string | null) => void; rows: number; cell: number }): React.JSX.Element {
  const most = Math.max(1, ...days.map((one) => one.n))
  const today = dayjs().format('YYYY-MM-DD')
  return (
    <div className="flex justify-center overflow-hidden">
      <div data-day-cells className="grid shrink-0" style={{ gridTemplateRows: `repeat(${rows}, ${cell}px)`, gridAutoColumns: `${cell}px`, gridAutoFlow: 'column', gap: 3 }} onPointerLeave={() => onHover(null)}>
        {days.map((one) => <span key={one.day} data-day={one.day} data-n={one.n} onPointerEnter={() => onHover(say(one))} className={`rounded-[2px] ${one.day === today ? 'outline outline-1 outline-offset-1 outline-foreground' : ''}`} style={{ background: shadeOf(stepOf(one.n, most)) }} />)}
      </div>
    </div>
  )
}

/**
 * The study numbers as cards, in the look of Amicro's Mono Charts: each
 * leads with its number, says its point in one line, and shows the value of
 * the mark under the pointer.
 */
function StudyCards({ studied }: { studied: Studied }): React.JSX.Element {
  const [span, setSpan] = useState<'month' | 'year'>('month')
  const [onReviews, sayReviews] = useHover()
  const [onMinutes, sayMinutes] = useHover()
  const [onDue, sayDue] = useHover()
  const [onKnown, sayKnown] = useHover()
  const [onSources, saySources] = useHover()
  const [onKept, sayKept] = useHover()
  const reviews = studied.month.reduce((sum, one) => sum + one.reviews, 0)
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
          side={<Switch options={[{ id: 'month', label: '30 days' }, { id: 'year', label: 'Year' }]} value={span} pick={setSpan} />}
          hovered={onReviews} point="Each square is a day, the darker the more cards, as in the year above the decks.">
          <DayCells key={span} days={days} say={reviewsSaid} onHover={sayReviews} rows={span === 'month' ? 2 : 7} cell={span === 'month' ? 22 : 10} />
          <Ends left={span === 'month' ? '30 days ago' : 'a year ago'} right="today" />
        </MonoCard>
      </div>
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
 * square a day, close together, the darker the more cards, the months named
 * along the top and Monday, Wednesday and Friday down the side, today ringed.
 * Above it the four numbers people quote (Ray's frame), set as a row: the
 * streak now, the longest, cards on an average day, and the share of days
 * studied. Drawn at once, never grown in, so the page is still when it
 * shows; the day pointed at is said in a line whose room is kept.
 */
export function StudyYear({ compact = false }: { /** Above the decks: the same year, its squares a little smaller. */ compact?: boolean }): React.JSX.Element {
  const studied = useLive(() => window.api.haligtree('study:stats') as Promise<Studied>, null as Studied | null, [], ['item'])
  const [on, setOn] = useState<string | null>(null)
  const weeks = 53
  const cell = compact ? 10 : 11
  // Whole weeks, Monday at the top, ending on this week: today sits in the last column.
  const start = dayjs().startOf('day').subtract((dayjs().day() + 6) % 7, 'day').subtract(weeks - 1, 'week')
  const todayKey = dayjs().format('YYYY-MM-DD')
  const days = Array.from({ length: weeks * 7 }, (_, at) => start.add(at, 'day')).map((at) => ({ day: at.format('YYYY-MM-DD'), later: at.isAfter(dayjs(), 'day') }))
  const most = Math.max(1, ...Object.values(studied?.year ?? {}))
  const share = studied && studied.days.of ? Math.round((studied.days.reviewed / studied.days.of) * 100) : 0
  const numbers: [string, string][] = [
    [plural(studied?.streak.current ?? 0, 'day', 'days'), 'streak now'],
    [plural(studied?.streak.longest ?? 0, 'day', 'days'), 'longest streak'],
    [plural(studied?.average ?? 0, 'card', 'cards'), 'a day, on days studied'],
    [`${share}%`, 'of days studied']
  ]
  // Five steps of ink, as GitHub's and Anki's heatmaps have: none, then four by share of the busiest day.
  const INK = [7, 30, 50, 70, 92]
  const level = (n: number): number => (n ? Math.min(4, 1 + Math.floor((n / most) * 3.999)) : 0)
  const shade = (step: number): string => `color-mix(in oklab, var(--foreground) ${INK[step]}%, transparent)`
  // A month's name over the first week that starts in it; the year's first column only when its month has room before the next.
  const months = Array.from({ length: weeks }, (_, week) => {
    const first = start.add(week, 'week')
    if (week === 0) return start.add(3, 'week').month() === first.month() ? first.format('MMM') : ''
    return first.month() !== first.subtract(1, 'week').month() ? first.format('MMM') : ''
  })
  const cells = days.map((one) => {
    const n = studied?.year[one.day] ?? 0
    return (
      <span key={one.day} data-day={one.day} data-n={n} {...(one.day === todayKey ? { 'data-today': '' } : {})} onPointerEnter={() => setOn(one.later ? null : `${plural(n, 'review', 'reviews')}, ${dayWords(one.day)}${one.day === todayKey ? ' (today)' : ''}`)}
        className={`rounded-[2px] ${one.day === todayKey ? 'outline outline-1 outline-offset-1 outline-foreground' : ''}`}
        style={{ width: cell, height: cell, background: one.later ? 'transparent' : shade(level(n)) }} />
    )
  })
  const total = plural(Object.values(studied?.year ?? {}).reduce((sum, n) => sum + n, 0), 'review', 'reviews')
  const grid = { gridTemplateColumns: `repeat(${weeks}, ${cell}px)`, columnGap: 3 }
  return (
    <section data-study-year-map {...(compact ? { 'data-compact': '' } : {})} aria-label="A year of study" className="grid gap-3 rounded-[5px] mf-metal px-4 py-3">
      <div data-year-numbers className="grid grid-cols-4 gap-x-4 gap-y-2 max-sm:grid-cols-2">
        {numbers.map(([value, label]) => (
          <p key={label} data-year-number={label} className="grid min-w-0">
            <span className="font-serif text-xl leading-tight text-foreground tabular-nums">{value}</span>
            <span className="truncate text-sm text-muted-foreground">{label}</span>
          </p>
        ))}
      </div>
      {/* The latest weeks always show: on a narrow window the oldest are cut on the left. */}
      <div className="flex justify-end overflow-hidden">
        <div className="grid shrink-0 grid-cols-[auto_auto] gap-x-1.5 gap-y-1 text-[10px] leading-none text-muted-foreground">
          <span />
          <div aria-hidden data-year-months className="grid" style={grid}>{months.map((name, week) => <span key={week} className="overflow-visible whitespace-nowrap">{name}</span>)}</div>
          <div aria-hidden className="grid" style={{ gridTemplateRows: `repeat(7, ${cell}px)`, rowGap: 3 }}>{['Mon', '', 'Wed', '', 'Fri', '', ''].map((name, at) => <span key={at} className="flex items-center">{name}</span>)}</div>
          <div data-year-grid className="grid" style={{ ...grid, gridTemplateRows: `repeat(7, ${cell}px)`, rowGap: 3, gridAutoFlow: 'column' }} onPointerLeave={() => setOn(null)}>{cells}</div>
        </div>
      </div>
      <p data-year-said className="flex h-5 items-center justify-between gap-3 text-sm text-muted-foreground tabular-nums">
        <span className="min-w-0 truncate">{on ?? `${total} this year`}</span>
        <span aria-hidden data-year-key className="flex shrink-0 items-center gap-[3px] text-xs">Less{INK.map((_, step) => <span key={step} className="rounded-[2px]" style={{ width: cell, height: cell, background: shade(step) }} />)}More</span>
      </p>
    </section>
  )
}
