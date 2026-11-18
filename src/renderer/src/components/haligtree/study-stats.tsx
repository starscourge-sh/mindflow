import { haligtree, useLive } from '@/lib/haligtree'
import { useReading } from '@/lib/reads-in'
import { chime } from '@/lib/sound'
import { useLayoutEffect, useRef, useState } from 'react'
import { INK_STEPS, inkShade, Ends, Funnel, MonoCard, PillBars, Spline, Switch, ToneBar, Chip, useHover } from './mono-card'
import { N, Section } from './stats-view'
import { DotRule, SQUARE, SQUARE_GAP as GAP } from './time-dots'
import { dayMonth, dayjs, num, plural } from '../../../../main/dates'

/** What `study:stats` hands back (haligtree.ts). */
type Studied = { streak: { current: number; longest: number; /** Rest days in hand: one for each week in a row, three at most. */ banked?: number }; average: number; month: { day: string; reviews: number }[]; year: Record<string, number>; checked: number; recalled: number; due: number[]; known: number; cards: number; seconds: number | null; days: { reviewed: number; of: number }
  minutes: number[]; stages: { new: number; learning: number; learnt: number }; sources: { name: string; n: number }[]; growth: { end: string; known: number; made: number }[]; kept: { month: string; notes: number; gems: number }[] }

/** The made-up numbers for the example Stats page. */
const EXAMPLE: Studied = {
  streak: { current: 12, longest: 41, banked: 1 }, average: 18,
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
export function StudySection({ example, brief = false }: { example: boolean; /** On the Stats page: the number and its sentence, and the way to the charts, which live in Review's "Stats" alone. */ brief?: boolean }): React.JSX.Element | null {
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
      {/* One home per chart: the Stats page says the number, Review's "Stats" draws the charts behind it. */}
      {brief && (
        <p data-study-more>
          <button type="button" data-study-more-go onClick={() => (chime('open'), void window.api.openInHome('view', 'review', ':stats'))}
            className="cursor-pointer font-medium text-foreground underline decoration-foreground/25 underline-offset-4 hover:decoration-foreground/60">Every chart of your cards is in Review, under “Stats”</button>
        </p>
      )}
      {!brief && week > 0 && <p data-study-week={week}><N>{`${num(week)} of the last 7 days`}</N> reviewed: one day off cannot break that.</p>}
      {/* The honest ones: known means remembered across 15 days, not just seen. */}
      {!brief && <p data-study-honest>
        {studied.known ? <><N>{num(studied.known)}</N> of your <N>{plural(studied.cards, 'card', 'cards')}</N> {studied.known === 1 ? 'is' : 'are'} known: remembered after a gap of 15 days or more.</>
          : <>None of your <N>{plural(studied.cards, 'card', 'cards')}</N> is known yet: a card counts once you remember it after a gap of 15 days or more.</>}
        {studied.seconds !== null && <> A card takes you about <N>{plural(studied.seconds, 'second', 'seconds')}</N>.</>}
        {studied.days.of > 0 && <> You reviewed on <N>{`${Math.round((studied.days.reviewed / studied.days.of) * 100)}%`}</N> of days since you began ({num(studied.days.reviewed)} of {num(studied.days.of)}).</>}
      </p>}
    </Section>
    {/* The cards on the page itself, under the sentences, never a box inside a box. */}
    {!brief && <div className="mt-3"><StudyCards studied={studied} /></div>}
    </>
  )
}

const dayWords = (day: string): string => dayjs(day).format('ddd D MMM')
/** Days with something on them before a day chart draws: fewer and the chart is mostly empty frame. */
const DRAW_DAYS = 3

/** Today: a ring drawn inside its own square, so no edge of the grid can clip it. */
// Today in the theme's accent, so it never reads as the ink ring a pointed day wears.
const TODAY_RING = 'inset 0 0 0 1.5px var(--primary), inset 0 0 0 2.5px var(--background)'
/** The square pointed at: one hairline of ink inside it. */
const HOVER_RING = 'inset 0 0 0 1px color-mix(in oklab, var(--foreground) 85%, transparent)'
const stepOf = (n: number, most: number): number => (n ? Math.min(4, 1 + Math.floor((n / Math.max(1, most)) * 3.999)) : 0)
const shadeOf = inkShade

/** Days as square cells 3 px apart in the year's five steps of ink, today ringed: the 30 days and the year in Stats, drawn as the year above the decks is. */
function DayCells({ days, say, onHover, rows, cell, left, right }: { days: { day: string; n: number }[]; say: (day: { day: string; n: number }) => string; onHover: (said: string | null) => void; rows: number; cell: number; /** Said under the first cell and the last. */ left: string; right: string }): React.JSX.Element {
  const most = Math.max(1, ...days.map((one) => one.n))
  const today = dayjs().format('YYYY-MM-DD')
  const [on, setOn] = useState<string | null>(null)
  // One row (the 30 days): oldest on the left, today the last, the cells the year's own size, packed tight (never widened to fill the
  // well: spaced-out cells read as low effort, memory compact-dots), a faint tick under each Monday; a year in week columns, as the year
  // above the decks. The same chart at two zooms.
  const single = rows === 1
  const flow = single ? { gridTemplateColumns: `repeat(${days.length}, ${cell}px)`, gridTemplateRows: `${cell}px` } : { gridTemplateRows: `repeat(${rows}, ${cell}px)`, gridAutoColumns: `${cell}px`, gridAutoFlow: 'column' as const }
  return (
    <div className={`-m-1 flex ${single ? 'justify-start' : 'justify-center'} overflow-hidden p-1`}>
      {/* The labels share the cells' width, so "30 days ago" sits under the first cell and "today" under the last. */}
      <div className="grid shrink-0 gap-1">
        <div data-day-cells className="grid" style={{ ...flow, gap: 3 }} onPointerLeave={() => (setOn(null), onHover(null))}>
          {days.map((one) => <span key={one.day} data-day={one.day} data-n={one.n} {...(on === one.day ? { 'data-day-on': '' } : {})} onPointerEnter={() => (setOn(one.day), onHover(say(one)))}
            className={`${single ? '' : 'aspect-square'} rounded-[2px] ${on === one.day ? 'transition-none' : 'transition-[box-shadow] duration-[120ms]'}`} style={{ background: shadeOf(stepOf(one.n, most)), boxShadow: ringOf(one.day === today, on === one.day) }} />)}
        </div>
        {single && <div aria-hidden data-day-mondays className="grid h-1" style={{ gridTemplateColumns: `repeat(${days.length}, ${cell}px)`, gap: 3 }}>{days.map((day) => <span key={day.day} className={`mx-auto h-1 w-px ${dayjs(day.day).day() === 1 ? 'bg-foreground/35' : ''}`} />)}</div>}
        <Ends left={left} right={right} />
      </div>
    </div>
  )
}

/** A day's square: today ringed (two rings, ink inside the page's colour), the one pointed at with one hairline of ink; both drawn inside the square, so nothing can clip them. */
const ringOf = (today: boolean, pointed: boolean): string | undefined =>
  [today ? TODAY_RING : '', pointed ? HOVER_RING : ''].filter(Boolean).join(', ') || undefined

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
  const reviewsSaid = (one: { day: string; n: number }): string => `${plural(one.n, 'review', 'reviews')}, ${dayWords(one.day)}`
  // Enough to draw: each chart shows once it has this much, and says its number and one sentence before then.
  const reviewDays = days.filter((one) => one.n).length
  const dueDays = studied.due.filter(Boolean).length
  const grew = new Set(studied.growth.map((one) => one.made)).size >= 2 || studied.growth.some((one) => one.known)
  return (
    <div className="grid gap-3 @[40rem]/page:grid-cols-2">
      <div data-study-month className="@[40rem]/page:col-span-2" {...(span === 'year' ? { 'data-study-year': '' } : {})}>
        <MonoCard name="reviews" title={span === 'month' ? 'Cards reviewed each day' : 'Days you reviewed'} value={span === 'month' ? reviews : yearTotal} unit={`${(span === 'month' ? reviews : yearTotal) === 1 ? 'review' : 'reviews'} in ${span === 'month' ? '30 days' : 'a year'}`}
          side={<Switch options={[{ id: 'month', label: '30 days' }, { id: 'year', label: 'Year' }]} value={span} pick={setSpan} />}
          hovered={onReviews} point="A square a day: the darker, the more cards." enough={reviewDays >= DRAW_DAYS}
          sparse={reviewDays ? `Reviewed on ${plural(reviewDays, 'day', 'days')} so far. Review on ${DRAW_DAYS} days to see each day here.` : `No reviews ${span === 'month' ? 'in 30 days' : 'this year'} yet: a review in Review shows here.`}>
          <DayCells key={span} days={days} say={reviewsSaid} onHover={sayReviews} rows={span === 'month' ? 1 : 7} cell={SQUARE} left={span === 'month' ? '30 days ago' : 'a year ago'} right="today" />
        </MonoCard>
      </div>
      <MonoCard name="minutes" title="Minutes reviewing each day" value={Math.round(shownMinutes.reduce((sum, one) => sum + one.n, 0))} unit={`${Math.round(shownMinutes.reduce((sum, one) => sum + one.n, 0)) === 1 ? 'minute' : 'minutes'} in ${range === 'week' ? '7' : '30'} days`} chips={studiedDays ? <Chip>{plural(studiedDays, 'day', 'days')}</Chip> : undefined}
        side={<Switch options={[{ id: 'week', label: '7 days' }, { id: 'month', label: '30 days' }]} value={range} pick={setRange} />}
        hovered={onMinutes} point={studied.seconds !== null ? `About ${plural(studied.seconds, 'second', 'seconds')} a card.` : 'Counted from your next review on.'} enough={studiedDays >= DRAW_DAYS}
        sparse={studiedDays ? `Time spent on ${plural(studiedDays, 'day', 'days')} so far. Review on ${DRAW_DAYS} days to see each day here.` : 'No time spent reviewing in these days yet.'}>
        <PillBars values={shownMinutes.map((one) => one.n)} keys={shownMinutes.map((one) => one.day)} say={(at) => `${shownMinutes[at].n ? `${num(Math.round(shownMinutes[at].n))} min` : 'No reviews'}, ${dayWords(shownMinutes[at].day)}`} onHover={sayMinutes} className="h-16" unit="min" />
        <Ends left={range === 'week' ? '7 days ago' : '30 days ago'} right="today" />
      </MonoCard>
      <MonoCard name="known" title="Cards you know" value={studied.known} unit={`of ${plural(studied.cards, 'card', 'cards')}`}
        hovered={onKnown} trend={last && last.known > firstKnown ? 'up' : undefined} point={last && last.known > firstKnown ? `Up ${num(last.known - firstKnown)} known in 12 weeks` : 'Known: remembered after 15 days or more'}
        note={last && last.known > firstKnown ? 'Known: remembered after 15 days or more. Dashed: every card made.' : 'Dashed: every card made.'} enough={grew}
        sparse={studied.cards ? 'Your cards have not changed in 12 weeks: the line starts once they grow.' : 'No cards yet: make one from any note and it counts here.'}>
        <Spline lines={[{ name: 'cards known', values: studied.growth.map((one) => one.known) }, { name: 'cards made', values: studied.growth.map((one) => one.made), dashed: true }]}
          say={(at) => `${num(studied.growth[at].known)} known of ${num(studied.growth[at].made)} made, week to ${dayWords(studied.growth[at].end)}`} onHover={sayKnown} />
        <Ends left="12 weeks ago" right="this week" />
      </MonoCard>
      <MonoCard name="stages" title="Where your cards stand" value={studied.cards} unit={studied.cards === 1 ? 'card' : 'cards'}
        point={studied.stages.learnt ? `${num(studied.stages.learnt)} learnt so far.` : 'Every card starts new, and is learnt once it sticks.'} enough={studied.cards > 0} sparse="No cards yet: each one starts new and is learnt once it sticks.">
        <ToneBar parts={[{ name: 'Learnt', n: studied.stages.learnt }, { name: 'Learning', n: studied.stages.learning }, { name: 'Not studied yet', n: studied.stages.new }]} />
      </MonoCard>
      <MonoCard name="sources" title="Cards by where they came from" value={studied.sources.length} unit={studied.sources.length === 1 ? 'source' : 'sources'}
        hovered={onSources} point={studied.sources[0] ? `Most from ${studied.sources[0].name}.` : 'Cards made from a book or a note show here.'} enough={studied.sources.length >= 2}
        sparse={studied.sources[0] ? `All from ${studied.sources[0].name}.` : 'Cards made from a book or a note show here.'}>
        <Funnel rows={studied.sources} say={(one) => `${plural(one.n, 'card', 'cards')} from ${one.name}`} onHover={saySources} />
      </MonoCard>
      <div data-study-due className="@[40rem]/page:col-span-2">
        <MonoCard name="due" title="Cards coming due" value={coming} unit="in two weeks" chips={<Chip>{`${num(studied.due[0])} today`}</Chip>}
          hovered={onDue} point={`${plural(studied.due[0], 'card is', 'cards are')} due today.`} enough={dueDays >= DRAW_DAYS}
          sparse={!coming ? 'Nothing falls due in the next two weeks.' : dueDays === 1 && studied.due[0] ? `${coming === 1 ? 'It is' : 'All are'} due today.` : `Due on ${plural(dueDays, 'day', 'days')} in the next two weeks.`}>
          <PillBars values={studied.due} say={(at) => `${plural(studied.due[at], 'card', 'cards')} due ${at === 0 ? 'today' : at === 1 ? 'tomorrow' : dayMonth(new Date(Date.now() + at * 86400000))}`} onHover={sayDue} className="h-16" />
          <Ends left="today" right="in two weeks" />
        </MonoCard>
      </div>
    </div>
  )
}

/**
 * Notes and gems kept, month by month: writing, not remembering, so it lives
 * on the Stats page beside the writing, never in Review.
 */
export function KeptCard({ example }: { example: boolean }): React.JSX.Element | null {
  const real = useLive(() => window.api.haligtree('study:stats') as Promise<Studied>, null as Studied | null, [], ['item'])
  const studied = example ? EXAMPLE : real
  const [onKept, sayKept] = useHover()
  // Stats waits for it: drawn late, it pushed Remembering and all under it down a card's height.
  useReading(!studied)
  if (!studied) return null
  const keptNow = studied.kept[studied.kept.length - 1]
  const keptMonths = studied.kept.filter((one) => one.notes + one.gems).length
  const keptBefore = studied.kept[studied.kept.length - 2]
  // This month against the last, said as shadcn's footer says it ("Up 12% on last month") with its arrow.
  const keptAll = (one: { notes: number; gems: number } | undefined): number => (one ? one.notes + one.gems : 0)
  const keptChange = keptBefore && keptAll(keptBefore) ? Math.round(((keptAll(keptNow) - keptAll(keptBefore)) / keptAll(keptBefore)) * 100) : null
  const keptTrend = keptChange ? (keptChange > 0 ? 'up' : 'down') : undefined
  return (
    <div data-kept-card className="mt-8">
      <MonoCard name="kept" title="Notes and gems kept" value={keptNow ? keptNow.notes + keptNow.gems : 0} unit="this month" chips={keptNow ? <><Chip>{plural(keptNow.notes, 'note', 'notes')}</Chip><Chip>{plural(keptNow.gems, 'gem', 'gems')}</Chip></> : undefined}
        hovered={onKept} trend={keptTrend} point={keptChange ? `${keptChange > 0 ? 'Up' : 'Down'} ${Math.abs(keptChange)}% on last month` : keptChange === 0 ? 'The same as last month' : 'Notes and gems, month by month'} note="Full line: notes. Dashed: gems." enough={keptMonths >= 2}
        sparse={keptMonths ? 'Only this month so far: the line starts with a second.' : 'Nothing kept in six months yet.'}>
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
 * days in a row now (with the rest days in hand, so a day off is never a
 * loss), your longest run, cards on an average day, and the share of days
 * studied. Drawn at once, never grown in, so the page is still when it
 * shows; the day pointed at is said in a line whose room is kept.
 */
export function StudyYear({ compact = false }: { /** Above the decks: the same year, its squares a little smaller. */ compact?: boolean }): React.JSX.Element {
  const studied = useLive(() => window.api.haligtree('study:stats') as Promise<Studied>, null as Studied | null, [], ['item'])
  // Its numbers come with the page, never "0 days" a beat before the real count.
  useReading(!studied)
  const [on, setOn] = useState<string | null>(null)
  const [point, setPoint] = useState<number | null>(null)
  const cell = SQUARE
  // As many whole weeks as its card has room for, up to a year: on a narrow window the oldest weeks are left out,
  // not cut through at the card's edge with their month names ("Jan" in half).
  const box = useRef<HTMLDivElement>(null)
  const [room, setRoom] = useState(0)
  useLayoutEffect(() => {
    const el = box.current
    if (!el) return
    const watch = new ResizeObserver(() => setRoom(el.clientWidth))
    watch.observe(el)
    setRoom(el.clientWidth)
    return () => watch.disconnect()
  }, [])
  // The weekday names' column (about 28px and its gap) comes off the room first.
  const weeks = room ? Math.max(8, Math.min(53, Math.floor((room - 8 - 34 + GAP) / (cell + GAP)))) : 53
  // Whole weeks, Monday at the top, ending on this week: today sits in the last column.
  const start = dayjs().startOf('day').subtract((dayjs().day() + 6) % 7, 'day').subtract(weeks - 1, 'week')
  const todayKey = dayjs().format('YYYY-MM-DD')
  const days = Array.from({ length: weeks * 7 }, (_, at) => start.add(at, 'day')).map((at) => ({ day: at.format('YYYY-MM-DD'), later: at.isAfter(dayjs(), 'day') }))
  const most = Math.max(1, ...Object.values(studied?.year ?? {}))
  const share = studied && studied.days.of ? Math.round((studied.days.reviewed / studied.days.of) * 100) : 0
  const numbers: [string, string][] = [
    // Days in a row, as Review's end counts them: a week in a row banks a rest day, so a day off is never a loss.
    [plural(studied?.streak.current ?? 0, 'day', 'days'), studied?.streak.banked ? `in a row now · ${plural(studied.streak.banked, 'rest day', 'rest days')} in hand` : 'in a row now'],
    [plural(studied?.streak.longest ?? 0, 'day', 'days'), 'longest run'],
    [plural(studied?.average ?? 0, 'card', 'cards'), 'a day when studying'],
    [`${share}%`, 'of days studied']
  ]
  // Five steps of ink, as GitHub's and Anki's heatmaps have: none, then four by share of the busiest day.
  const INK = INK_STEPS
  const level = (n: number): number => (n ? Math.min(4, 1 + Math.floor((n / most) * 3.999)) : 0)
  const shade = inkShade
  // A month's name over the first week that starts in it; the year's first column only when its month has room before the next.
  const months = Array.from({ length: weeks }, (_, week) => {
    const first = start.add(week, 'week')
    if (week === 0) return start.add(3, 'week').month() === first.month() ? first.format('MMM') : ''
    // A month begun in the last two weeks has no room for its name: it would be cut at the edge ("No"), so it waits.
    if (week > weeks - 3) return ''
    return first.month() !== first.subtract(1, 'week').month() ? first.format('MMM') : ''
  })
  const cells = days.map((one, at) => {
    const n = studied?.year[one.day] ?? 0
    const pointed = point === at
    return (
      <span key={one.day} data-day={one.day} data-n={n} {...(one.day === todayKey ? { 'data-today': '' } : {})} {...(pointed ? { 'data-day-on': '' } : {})}
        onPointerEnter={() => one.later ? (setPoint(null), setOn(null)) : (setPoint(at), setOn(`${plural(n, 'review', 'reviews')}, ${dayWords(one.day)}${one.day === todayKey ? ' (today)' : ''}`))}
        className={`rounded-[2px] ${pointed ? 'transition-none' : 'transition-[box-shadow] duration-[120ms]'}`}
        style={{ width: cell, height: cell, background: one.later ? 'transparent' : shade(level(n)), boxShadow: ringOf(one.day === todayKey, pointed) }} />
    )
  })
  // The month over the pointed week and the weekday of its row brighten, as GitHub's graph does.
  const pointWeek = point === null ? -1 : Math.floor(point / 7)
  const pointMonth = pointWeek < 0 ? -1 : months.slice(0, pointWeek + 1).map((name, at) => (name ? at : -1)).filter((at) => at >= 0).at(-1) ?? -1
  const pointRow = point === null ? -1 : point % 7
  const total = plural(Object.values(studied?.year ?? {}).reduce((sum, n) => sum + n, 0), 'review', 'reviews')
  const grid = { gridTemplateColumns: `repeat(${weeks}, ${cell}px)`, columnGap: GAP }
  return (
    <section data-study-year-map {...(compact ? { 'data-compact': '' } : {})} aria-label="A year of study" className="grid gap-3 rounded-[6px] mf-metal px-4 py-3">
      {/* Four across when they fit, else two and two: never three and one left alone. */}
      <div className="@container"><div data-year-numbers className="grid grid-cols-2 gap-x-4 gap-y-2 @[38rem]:grid-cols-4">
        {numbers.map(([value, label]) => (
          <p key={label} data-year-number={label} className="grid min-w-0">
            <span className="mf-big-number text-xl leading-tight text-foreground">{value}</span>
            <span className="text-sm text-muted-foreground">{label}</span>
          </p>
        ))}
      </div></div>
      {/* What a square is, in one line, its key drawn as the squares themselves. */}
      <DotRule className="flex flex-wrap items-center gap-x-1.5">Each square is a day, the darker the more cards you reviewed
        <span aria-hidden data-year-key className="inline-flex items-center gap-[3px]">{INK.map((_, step) => <span key={step} className="rounded-[2px]" style={{ width: cell, height: cell, background: shade(step) }} />)}</span>
      </DotRule>
      {/* The latest weeks always show: on a narrow window the oldest are cut on the left. The months under the squares. */}
      <div ref={box} className="-mx-1 -mt-2 -mb-1 flex overflow-hidden p-1">
        <div className="grid shrink-0 grid-cols-[auto_auto] gap-x-1.5 gap-y-1 text-[11px] leading-none text-muted-foreground">
          <div aria-hidden className="grid" style={{ gridTemplateRows: `repeat(7, ${cell}px)`, rowGap: GAP }}>{['Mon', '', 'Wed', '', 'Fri', '', ''].map((name, at) => <span key={at} className={`${at === pointRow ? 'text-foreground transition-none' : 'transition-colors duration-[120ms]'} flex items-center text-[10px]`}>{name}</span>)}</div>
          <div data-year-grid className="grid" style={{ ...grid, gridTemplateRows: `repeat(7, ${cell}px)`, rowGap: GAP, gridAutoFlow: 'column' }} onPointerLeave={() => (setOn(null), setPoint(null))}>{cells}</div>
          <span />
          <div aria-hidden data-year-months className="grid" style={grid}>{months.map((name, week) => <span key={week} className={`overflow-visible whitespace-nowrap ${week === pointMonth ? 'text-foreground transition-none' : 'transition-colors duration-[120ms]'}`}>{name}</span>)}</div>
        </div>
      </div>
      <p data-year-said className="flex h-5 items-center gap-3 text-sm text-muted-foreground tabular-nums">
        <span className="min-w-0 truncate">{on ?? `${total} this year`}</span>
      </p>
    </section>
  )
}
