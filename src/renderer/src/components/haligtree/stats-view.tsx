import { YearOfAnswers } from './journal'
import { HabitGrid } from './habits'
import { Children, useState, type ReactNode } from 'react'

import { CAPTURE_TYPES, byKind } from '../capture-kinds/capture-kind-picker'
import { useFocusTools, useLive, haligtree, type Stats } from '@/lib/haligtree'
import { exampleStats } from '@/lib/examples'
import { GoalPreview, ReadyMoment, useReady } from './goal-preview'
import { DaysHeatmap } from './days-heatmap'
import { WritingSection } from './writing-stats'
import { Count, Island, Page, Rolling } from './ui'
import { Tip } from '@/components/haligtree/ui'
import { chime } from '@/lib/sound'
import { Recap } from './recap-view'
import { FocusSections, GoalSection, HabitSections, TagSection, timeSaid } from './focus-stats'
import { MonthReflect } from './reflect-view'
import { PracticeStats } from './practices-view'
import { PageContents } from './page-contents'
import { Chips } from './display'
import { ReadsIn } from '@/lib/reads-in'
import { UsageSections } from './usage-stats'
import { dayjs, monthName, num, plural } from '../../../../main/dates'

const readWords = (): Promise<{ daysWritten: number }> => window.api.haligtree('words:stats') as Promise<{ daysWritten: number }>
/** Writing days (a day you wrote words on) before Stats has a week to tell: a week of them, not in a row. */
const WRITING_DAYS = 7

const percent = (part: number, whole: number): string => (whole ? `${Math.round((part / whole) * 100)}%` : 'none')
/** Time spent: "40 minutes" under an hour, "1.5 hours" from one. */
// One way to say a length, as the focus sections do: "45 min", "9 h 30 min".
const spent = (minutes: number): string => (minutes < 0.5 ? 'under a minute' : timeSaid(minutes))
// Days said as Review says them: "under a day", "1 day", "3 days".
const daysSaid = (days: number): string => (days < 1 ? 'under a day' : days < 1.5 ? '1 day' : `${num(Math.round(days))} days`)

/** A number inside a sentence, set apart only by weight and even figures. It rolls into place. */
// Each figure is wrapped with the mark after it (whitespace-nowrap), so a comma never starts a line.
export function N({ children }: { children: ReactNode }): React.JSX.Element {
  return <strong className="font-semibold text-foreground proportional-nums">{typeof children === 'string' || typeof children === 'number' ? <Rolling text={children} /> : children}</strong>
}

/**
 * One island per section, led by its one number set large, then each
 * sentence or chart a row of its own; a row left out leaves no gap.
 */
export function Section({ title, big, children }: { title: string; big?: { value: string | number; label: string }; children: ReactNode }): React.JSX.Element {
  return (
    <Island title={title} group={title} className="mt-8 first:mt-6">
      {Children.toArray(children).map((row, index) => (
        <div key={index} className="space-y-3 px-4 py-3 leading-relaxed text-muted-foreground">
          {index === 0 && big && (
            <p className="flex items-baseline gap-2 pt-1">
              <span className="text-[2rem] leading-none font-semibold tracking-tight text-foreground tabular-nums"><Rolling text={big.value} /></span>
              <span className="text-sm">{big.label}</span>
            </p>
          )}
          {row}
        </div>
      ))}
    </Island>
  )
}

/**
 * The numbers, written as a scientist would and never as a judge: each card
 * leads with its one number, then sentences that set it beside something,
 * so nothing reads as a score. No streaks, no targets. The two the plan calls
 * load-bearing are here: days opened, the only one that notices the app being
 * abandoned, and time to first use, which says whether it works at all.
 */
type Part = 'now' | 'month' | 'year'

export function StatsView({ recap: asked }: { recap?: string }): React.JSX.Element {
  const real = useLive(haligtree.stats, null as Stats | null)
  // The focus timer turned off (Settings, Tasks): no focus sections.
  const focusTools = useFocusTools()
  // Until a week of writing days, the goal over the page told from a made-up few months, faded, so you can see what it will say.
  // Met once, the real page for good.
  const words = useLive(readWords, null)
  const { real: ready, moment } = useReady('stats', words ? words.daysWritten >= WRITING_DAYS : null)
  const example = ready === false
  const stats = example ? exampleStats() : real
  // The month or the year, Wrapped's way, over the page; from here or ⌘K.
  // The column, for the contents beside it to read.
  const [column, setColumn] = useState<HTMLDivElement | null>(null)
  const [recap, setRecap] = useState<'month' | 'year' | null>(asked === 'month' || asked === 'year' ? asked : null)
  // Which page of Stats: the few parts that matter most, or the rest by the month or the year. Asked for a recap, its page.
  const [part, setPart] = useState<Part>(asked === 'month' || asked === 'year' ? asked : 'now')
  const wrap = (period: 'month' | 'year'): void => {
    chime('slide')
    setRecap(period)
  }
  if (!stats || ready === null) return <Page title="Stats" waiting><div /></Page>

  const by = Object.fromEntries(stats.exits.map((row) => [row.status, row.n]))
  const total = stats.exits.reduce((sum, row) => sum + row.n, 0)
  const change = stats.lastWeek ? Math.round(((stats.week - stats.lastWeek) / stats.lastWeek) * 100) : null
  const busiest = [...stats.hours].sort((a, b) => b.n - a.n)[0]
  const maxHour = Math.max(1, ...stats.hours.map((row) => row.n))
  const opened = new Set(stats.days)
  // Only what happened today, each its own clause: tasks closed count as much as captures caught.
  const today = [
    stats.day.captured > 0 && <>noted down <N>{plural(stats.day.captured, 'thing', 'things')}</N></>,
    stats.day.exits > 0 && <>sorted <N>{plural(stats.day.exits, 'thing', 'things')}</N> from your Inbox</>,
    stats.day.tasks > 0 && <>closed <N>{plural(stats.day.tasks, 'task', 'tasks')}</N></>,
    stats.day.reviews > 0 && <>reviewed <N>{plural(stats.day.reviews, 'card', 'cards')}</N></>
  ].filter(Boolean)
  const exits = [
    { status: 'promoted', label: 'became gems', color: 'var(--tt-color-text-purple)' },
    { status: 'resolved', label: 'resolved', color: 'var(--tt-color-text-green)' },
    { status: 'discarded', label: 'moved to the Bin', color: 'var(--tt-color-text-gray)' }
  ]

  return (
    <>
    {/* The month is told back in sentences; the year keeps its pages, Wrapped's way. */}
    {recap === 'month' && <MonthReflect onClose={() => (chime('fold'), setRecap(null))} />}
    {recap === 'year' && <Recap period={recap} onClose={() => (chime('fold'), setRecap(null))} />}
    <Page title="Stats" beside={(box) => <PageContents key={part} page={column} scroller={box} label="Sections on this page" />} lead={
      // Four or five parts at a glance; the rest a chip away, by the month and by the year. On the
      // bar's left, where every page keeps its tabs, in one place whichever is picked.
      <Chips className="shrink-0" options={[{ id: 'now', label: 'At a glance' }, { id: 'month', label: 'Your month' }, { id: 'year', label: 'Your year' }]} on={(id) => id === part} pick={(id) => setPart(id as Part)} />
    }>
      <div ref={setColumn} className="max-w-[calc(62ch+2.5rem)] px-5 pb-20">
        {moment && <ReadyMoment className="mt-6" said="Your Stats are ready" more="A week of writing is in. From here this page tells you how each week went, in sentences." />}
        <GoalPreview on={example} className="pt-6" goal="Your Stats start once you have a week of writing days" heading="What your Stats will look like"
          counts="A writing day is any day you add words to a note, a page or your Journal. They need not be in a row."
          parts={[{ have: words?.daysWritten ?? 0, need: WRITING_DAYS, what: 'writing days' }]}>
        {/* Each page of Stats drawn whole once its parts are read, never a part popping in after the rest. */}
        <ReadsIn key={part} className="contents">
        {part === 'now' ? <>
        <WritingSection example={example} />

        <Section title="This week" big={{ value: stats.week, label: stats.week === 1 ? 'thing noted down' : 'things noted down' }}>
          <p>
            You noted down <N>{stats.week}</N> {stats.week === 1 ? 'thing' : 'things'} in the last seven days
            {change === null ? ', with nothing the week before to set it against.' : change === 0 ? ', the same as the week before.' : <>, {change > 0 ? 'up' : 'down'} <N>{`${Math.abs(change)}%`}</N> on the week before.</>}{' '}
            You closed <N>{plural(stats.tasksDone, 'task', 'tasks')}</N>.
          </p>
        </Section>

        <Section title="Days you opened it" big={{ value: opened.size, label: 'of the last 84 days' }}>
          {opened.size > 0 && <DaysHeatmap opened={opened} />}
          <p>
            <N>{opened.size}</N> of the last 84 days. This is the one number that notices if the app stops being opened at all, so it is the one to watch.
          </p>
        </Section>

        {!example && <UsageSections />}

        </> : part === 'month' ? <>
        {/* The month told back in sentences, over the page. */}
        <p data-stats-recap className="mt-6 text-body text-foreground/80">The last few weeks, part by part. <button type="button" className="font-medium text-foreground underline decoration-foreground/25 underline-offset-4 hover:decoration-foreground/60" onClick={() => wrap('month')}>Tell me my month</button></p>
        <Section title="Today" big={{ value: stats.day.captured, label: stats.day.captured === 1 ? 'thing noted down' : 'things noted down' }}>
          <p>
            {today.length ? (
              <>
                You {today.map((part, index) => (
                  <span key={index}>{part}{index < today.length - 2 ? ', ' : index === today.length - 2 ? ' and ' : '.'}</span>
                ))}
              </>
            ) : 'A quiet day here. That is allowed.'}
          </p>
        </Section>

        <Section title="Remembering, the last 30 days" big={stats.reviews.n ? { value: percent(stats.reviews.recalled ?? 0, stats.reviews.n), label: 'remembered' } : undefined}>
          <p>
            {stats.reviews.n ? (
              <>
                You remembered <N>{percent(stats.reviews.recalled ?? 0, stats.reviews.n)}</N> of <N>{plural(stats.reviews.n, 'review', 'reviews')}</N>, and you aim to remember <N>{Math.round(stats.retention * 100)}%</N>.
              </>
            ) : 'Nothing has been reviewed yet.'}
          </p>
        </Section>

        {/* Focus time has its own sections just below; this one is what the week gathered around. */}
        <Section title="The week, in the work">
          <p>
            {Object.keys(stats.tagsWeek).length ? (
              <>
                What you captured gathered around{' '}
                {Object.entries(stats.tagsWeek).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([tag], index, all) => (
                  <span key={tag}><N>#{tag}</N>{index < all.length - 2 ? ', ' : index === all.length - 2 ? ' and ' : '.'}</span>
                ))}
              </>
            ) : 'Nothing you captured carried a tag.'}
          </p>
          {focusTools && stats.estimates.estimated ? (
            <p>
              Tasks you estimated at <N>{spent(stats.estimates.estimated)}</N> took <N>{spent(stats.estimates.spent ?? 0)}</N> in sessions.
            </p>
          ) : null}
        </Section>

        {focusTools && <FocusSections example={example} />}

        <HabitSections example={example} />

        <HabitGrid example={example} />

        {!example && <PracticeStats />}

        <GoalSection example={example} />

        <Section title="The doing, this week" big={{ value: stats.lead.exits, label: stats.lead.exits === 1 ? 'thing sorted from your Inbox' : 'things sorted from your Inbox' }}>
          <p>
            No target here, only the trend. This week: <span className="whitespace-nowrap"><N>{`${plural(stats.lead.exits, 'thing', 'things')} sorted`}</N>,</span> <span className="whitespace-nowrap"><N>{`${plural(stats.lead.glosses, 'note', 'notes')} added`}</N>,</span>{' '}
            reviews on <N>{plural(stats.lead.reviewDays, 'day', 'days')}</N> and <N>{plural(stats.lead.articles, 'page', 'pages')}</N> started.
          </p>
          <p>
            <N>{stats.unprocessed.now}</N> captures still wait in your Inbox, against <N>{stats.unprocessed.weekAgo}</N> a week ago.
            {stats.leeches.length ? (
              <>
                {' '}<N>{plural(stats.leeches.length, 'card has', 'cards have')}</N> been forgotten four times or more, worth rewriting:{' '}
                {stats.leeches.slice(0, 5).map((title, index) => <span key={title}>{index ? ', ' : ''}“{title}”</span>)}{stats.leeches.length > 5 ? ` and ${num(stats.leeches.length - 5)} more, under “Struggling” in Review` : ''}.
              </>
            ) : ''}
          </p>
        </Section>

        <Section title="Is it working" big={stats.firstUse === null ? undefined : { value: daysSaid(stats.firstUse).replace(/^u/, 'U'), label: 'to first use' }}>
          <p>
            {stats.firstUse === null ? (
              'No capture has been opened, acted on or dealt with yet, so there is nothing to measure here yet.'
            ) : (
              <>
                A capture waits <N>{daysSaid(stats.firstUse)}</N> on average before it is first opened, acted on or dealt with. If that falls over the months, the app is doing what it is for.
              </>
            )}
          </p>
          <p>
            {stats.hints.shown ? (
              <>
                <N>{percent(stats.stopped, stats.hints.shown)}</N> of <N>{stats.hints.shown}</N> hints stopped you this month: voted up, or kept on screen four seconds or more. If that falls, show fewer, not more.
              </>
            ) : (
              'No hints yet: about one opening in ten shows one, from your gems and old captures.'
            )}
          </p>
          <p>
            You keep <span className="whitespace-nowrap"><N>{plural(stats.nuggets, 'gem', 'gems')}</N>,</span> <N>{stats.recall}</N> of them tested, and <N>{plural(stats.articles, 'page', 'pages')}</N> written from them.
          </p>
        </Section>

        </> : <>
        {/* The year, Wrapped's way, page by page over this one. */}
        <p data-stats-recap className="mt-6 text-body text-foreground/80">The whole year so far, part by part. <button type="button" className="font-medium text-foreground underline decoration-foreground/25 underline-offset-4 hover:decoration-foreground/60" onClick={() => wrap('year')}>Your year, page by page</button></p>
        <Section title={`${dayjs().year()} so far`} big={{ value: stats.year.captured, label: stats.year.captured === 1 ? 'capture' : 'captures' }}>
          <p>
            <span className="whitespace-nowrap"><N>{plural(stats.year.captured, 'capture', 'captures')}</N>,</span> <N>{plural(stats.year.nuggets, 'gem', 'gems')}</N> kept and{' '}
            <N>{plural(stats.year.articles, 'page', 'pages')}</N> written.
            {stats.year.month && <> Your busiest month was <span className="whitespace-nowrap"><N>{monthName(Number(stats.year.month) - 1)}</N>.</span></>}
          </p>
        </Section>

        <Section title="When you capture" big={busiest ? { value: `${busiest.hour}:00`, label: 'your busiest hour' } : undefined}>
          {busiest ? <>
          <div className="flex h-14 items-end gap-[3px]">
            {Array.from({ length: 24 }, (_, hour) => {
              const n = stats.hours.find((row) => row.hour === hour)?.n ?? 0
              return (
                <Tip key={hour} label={`${hour}:00 · ${n}`}>
                  <div className="flex-1 rounded-t-[2px] bg-muted-foreground/35" style={{ height: `${Math.max(3, (n / maxHour) * 100)}%` }} />
                </Tip>
              )
            })}
          </div>
          <div className="flex justify-between text-xs tabular-nums">
            <span>00</span><span>06</span><span>12</span><span>18</span><span>23</span>
          </div>
          <p>Most of it happens around <span className="whitespace-nowrap"><N>{`${busiest.hour}:00`}</N>.</span></p>
          </> : <p>Nothing captured yet, so no hours to show.</p>}
        </Section>

        <Section title="What you capture" big={stats.kinds[0] ? { value: stats.kinds[0].n, label: `${(CAPTURE_TYPES.find((one) => one.id === stats.kinds[0].kind) ?? CAPTURE_TYPES[0]).label.toLowerCase()}${stats.kinds[0].n === 1 ? '' : 's'}, the most of any kind` } : undefined}>
          <div className="space-y-2">
            {/* The bars in the one order of kinds, Note first (kindRank); the big number says which is most. */}
            {[...stats.kinds].sort((a, b) => byKind(a.kind, b.kind)).map(({ kind, n }) => {
              const type = CAPTURE_TYPES.find((one) => one.id === kind) ?? CAPTURE_TYPES[0]
              return (
                <div key={kind} className="flex items-center gap-3 text-sm">
                  <type.icon className="size-4 shrink-0" style={{ color: type.tint }} />
                  <span className="w-20 text-foreground">{type.label}</span>
                  <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-border/60">
                    <span className="block h-full rounded-full" style={{ width: percent(n, Math.max(...stats.kinds.map((one) => one.n))), background: type.tint }} />
                  </span>
                  <span className="min-w-10 shrink-0 text-right font-semibold text-foreground"><Count n={n} /></span>
                </div>
              )
            })}
          </div>
        </Section>
        {!example && <YearOfAnswers />}

        <Section title="Where captures go" big={total ? { value: percent(total - (by.open ?? 0), total), label: 'sorted' } : undefined}>
          {/* No bar until something has taken an exit: an empty one reads as a failing grade. */}
          {exits.some((exit) => by[exit.status]) && (
            <div className="flex h-2 overflow-hidden rounded-full bg-border/60">
              {exits.map((exit) => (
                <div key={exit.status} style={{ width: percent(by[exit.status] ?? 0, total), background: exit.color }} />
              ))}
            </div>
          )}
          <p>
            Of <N>{total}</N> captures,{' '}
            {exits.map((exit, index) => (
              <span key={exit.status}>
                <N>{by[exit.status] ?? 0}</N> {exit.label}
                {index === 0 ? ', ' : index === 1 ? ' and ' : '. '}
              </span>
            ))}
            <N>{by.open ?? 0}</N> still wait in your Inbox. Letting one go counts as much as saving it as a gem; the split is what it says about what you capture.
          </p>
        </Section>

        <TagSection example={example} />

        </>}
        </ReadsIn>
        </GoalPreview>
      </div>
    </Page>
    </>
  )
}
