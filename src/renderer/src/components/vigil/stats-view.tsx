import { Children, useState, type ReactNode } from 'react'
import { AliveIcon } from '@/components/ui/alive-icon'
import SparklesIcon from '@/components/ui/sparkles-icon'

import { CAPTURE_TYPES } from '../capture-kinds/capture-kind-picker'
import { useLive, vigil, type Stats } from '@/lib/vigil'
import { Island, Page, Rolling } from './ui'
import { Tip } from '@/components/vigil/ui'
import { Button } from '@/components/ui/button'
import { chime } from '@/lib/sound'
import { Recap } from './recap-view'
import { MonthReflect } from './reflect-view'
import { dayjs, monthName, num } from '../../../../main/dates'

const percent = (part: number, whole: number): string => (whole ? `${Math.round((part / whole) * 100)}%` : 'none')
const plural = (n: number, one: string, many: string): string => `${num(n)} ${n === 1 ? one : many}`
/** Time spent: "40 minutes" under an hour, "1.5 hours" from one. */
const spent = (minutes: number): string => (minutes < 60 ? plural(Math.round(minutes), 'minute', 'minutes') : plural(Math.round(minutes / 6) / 10, 'hour', 'hours'))

/** A number inside a sentence, set apart only by weight and even figures. It rolls into place. */
// Each figure is wrapped with the mark after it (whitespace-nowrap), so a comma never starts a line.
function N({ children }: { children: ReactNode }): React.JSX.Element {
  return <strong className="font-semibold text-foreground proportional-nums">{typeof children === 'string' || typeof children === 'number' ? <Rolling text={children} /> : children}</strong>
}

/** One island per section, each sentence or chart a row of its own; a row left out leaves no gap. */
function Section({ title, children }: { title: string; children: ReactNode }): React.JSX.Element {
  return (
    <Island title={title} className="mt-8 first:mt-6">
      {Children.toArray(children).map((row, index) => (
        <div key={index} className="space-y-3 px-4 py-3 leading-relaxed text-muted-foreground">{row}</div>
      ))}
    </Island>
  )
}

/**
 * The numbers, written as a scientist would and never as a judge: sentences
 * that set each one beside something, rather than a dashboard of big figures
 * that read as a score. No streaks, no targets. The two the plan calls
 * load-bearing are here: days opened, the only one that notices the app being
 * abandoned, and time to first use, which says whether it works at all.
 */
export function StatsView({ recap: asked }: { recap?: string }): React.JSX.Element {
  const stats = useLive(vigil.stats, null as Stats | null)
  // The month or the year, Wrapped's way, over the page; from here or ⌘K.
  const [recap, setRecap] = useState<'month' | 'year' | null>(asked === 'month' || asked === 'year' ? asked : null)
  const wrap = (period: 'month' | 'year'): void => {
    chime('slide')
    setRecap(period)
  }
  if (!stats) return <Page title="Stats"><div /></Page>

  const by = Object.fromEntries(stats.exits.map((row) => [row.status, row.n]))
  const total = stats.exits.reduce((sum, row) => sum + row.n, 0)
  const change = stats.lastWeek ? Math.round(((stats.week - stats.lastWeek) / stats.lastWeek) * 100) : null
  const busiest = [...stats.hours].sort((a, b) => b.n - a.n)[0]
  const maxHour = Math.max(1, ...stats.hours.map((row) => row.n))
  const opened = new Set(stats.days)
  // Twelve weeks of days, oldest first, ending today: the heatmap's cells.
  const days = Array.from({ length: 84 }, (_, index) => dayjs().subtract(83 - index, 'day').format('YYYY-MM-DD'))
  // Only what happened today, each its own clause: tasks closed count as much as captures caught.
  const today = [
    stats.day.captured > 0 && <>caught <N>{plural(stats.day.captured, 'thing', 'things')}</N></>,
    stats.day.exits > 0 && <>saw <N>{num(stats.day.exits)}</N> through to an exit</>,
    stats.day.tasks > 0 && <>closed <N>{plural(stats.day.tasks, 'task', 'tasks')}</N></>,
    stats.day.reviews > 0 && <>reviewed <N>{plural(stats.day.reviews, 'card', 'cards')}</N></>
  ].filter(Boolean)
  const exits = [
    { status: 'promoted', label: 'became nuggets', color: 'var(--tt-color-text-purple)' },
    { status: 'resolved', label: 'dealt with elsewhere', color: 'var(--tt-color-text-green)' },
    { status: 'discarded', label: 'let go', color: 'var(--tt-color-text-gray)' }
  ]

  return (
    <>
    {/* The month is told back in sentences; the year keeps its pages, Wrapped's way. */}
    {recap === 'month' && <MonthReflect onClose={() => (chime('fold'), setRecap(null))} />}
    {recap === 'year' && <Recap period={recap} onClose={() => (chime('fold'), setRecap(null))} />}
    <Page title="Stats" actions={
      <>
        <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => wrap('month')}><AliveIcon icon={SparklesIcon} size={16} /> Your month</Button>
        <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => wrap('year')}>Your year</Button>
      </>
    }>
      <div className="px-5 pb-20 [&>section]:max-w-[62ch]">
        <Section title="Today">
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

        <Section title="This week">
          <p>
            You captured <N>{stats.week}</N> {stats.week === 1 ? 'thing' : 'things'}
            {change === null ? ', with nothing the week before to set it against.' : change === 0 ? ', the same as the week before.' : <>, {change > 0 ? 'up' : 'down'} <N>{`${Math.abs(change)}%`}</N> on the week before.</>}{' '}
            You closed <N>{plural(stats.tasksDone, 'task', 'tasks')}</N>
            {stats.reviews.n ? (
              <>
                {' '}and recalled <N>{percent(stats.reviews.recalled ?? 0, stats.reviews.n)}</N> of <N>{plural(stats.reviews.n, 'review', 'reviews')}</N> over the last 30 days.
              </>
            ) : (
              '. Nothing has been reviewed yet.'
            )}
          </p>
        </Section>

        <Section title="The week, in the work">
          <p>
            {stats.sessions.n ? (
              <>
                You ran <N>{plural(stats.sessions.n, 'session', 'sessions')}</N> for <N>{spent(stats.sessions.minutes ?? 0)}</N> of focus.{' '}
              </>
            ) : 'No sessions this week. '}
            {Object.keys(stats.tagsWeek).length ? (
              <>
                What you captured gathered around{' '}
                {Object.entries(stats.tagsWeek).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([tag], index, all) => (
                  <span key={tag}><N>#{tag}</N>{index < all.length - 2 ? ', ' : index === all.length - 2 ? ' and ' : '.'}</span>
                ))}
              </>
            ) : 'Nothing you captured carried a tag.'}
          </p>
          {stats.reviews.n > 0 && (
            <p>
              You aim to remember <N>{Math.round(stats.retention * 100)}%</N> and actually remembered <span className="whitespace-nowrap"><N>{percent(stats.reviews.recalled ?? 0, stats.reviews.n)}</N>.</span>
            </p>
          )}
          {stats.estimates.estimated ? (
            <p>
              Tasks you estimated at <N>{`${num(stats.estimates.estimated)} minutes`}</N> took <N>{spent(stats.estimates.spent ?? 0)}</N> in sessions.
            </p>
          ) : null}
        </Section>

        <Section title="The doing, this week">
          <p>
            No target here, only the trend. This week: <span className="whitespace-nowrap"><N>{`${plural(stats.lead.exits, 'capture', 'captures')} dealt with`}</N>,</span> <span className="whitespace-nowrap"><N>{`${plural(stats.lead.glosses, 'note', 'notes')} added`}</N>,</span>{' '}
            reviews on <N>{plural(stats.lead.reviewDays, 'day', 'days')}</N> and <N>{plural(stats.lead.articles, 'article', 'articles')}</N> started.
          </p>
          <p>
            <N>{stats.unprocessed.now}</N> captures have taken no exit, against <N>{stats.unprocessed.weekAgo}</N> a week ago.
            {stats.leeches.length ? (
              <>
                {' '}<N>{plural(stats.leeches.length, 'card has', 'cards have')}</N> been forgotten four times or more, worth rewriting:{' '}
                {stats.leeches.slice(0, 5).map((title, index) => <span key={title}>{index ? ', ' : ''}“{title}”</span>)}.
              </>
            ) : ''}
          </p>
        </Section>

        <Section title="Where captures go">
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
            <N>{by.open ?? 0}</N> have taken no exit yet. A discard keeps the promise as well as a promotion does; the split is what it says about what you capture.
          </p>
        </Section>

        <Section title="Days you opened it">
          {opened.size > 0 && <div className="grid w-fit grid-flow-col grid-rows-7 gap-[3px]">
            {days.map((day) => (
              <Tip key={day} label={day}>
              <div className={`size-2.5 rounded-[2px] ${opened.has(day) ? 'bg-[var(--tt-brand-color-400)]' : 'bg-border/70'}`} />
              </Tip>
            ))}
          </div>}
          <p>
            <N>{opened.size}</N> of the last 84 days. This is the one number that notices if the app stops being opened at all, so it is the one to watch.
          </p>
        </Section>

        <Section title="Is it working">
          <p>
            {stats.firstUse === null ? (
              'Nothing has been opened, acted on or given an exit since it was captured, so there is no time to first use to measure yet.'
            ) : (
              <>
                A capture waits <N>{stats.firstUse.toFixed(1)} days</N> on average before it is first opened, acted on or given an exit. If that falls over the months, the app is doing what it is for.
              </>
            )}
          </p>
          <p>
            {stats.hints.shown ? (
              <>
                <N>{percent(stats.stopped, stats.hints.shown)}</N> of <N>{stats.hints.shown}</N> hints stopped you this month: voted up, or kept on screen four seconds or more. If that falls, show fewer, not more.
              </>
            ) : (
              'No hints yet: about one opening in ten shows one, from your nuggets and old captures.'
            )}
          </p>
          <p>
            You keep <span className="whitespace-nowrap"><N>{plural(stats.nuggets, 'nugget', 'nuggets')}</N>,</span> <N>{stats.recall}</N> of them tested, and <N>{plural(stats.articles, 'article', 'articles')}</N> written from them.
          </p>
        </Section>

        <Section title={`${dayjs().year()} so far`}>
          <p>
            <span className="whitespace-nowrap"><N>{plural(stats.year.captured, 'capture', 'captures')}</N>,</span> <N>{plural(stats.year.nuggets, 'nugget', 'nuggets')}</N> kept and{' '}
            <N>{plural(stats.year.articles, 'article', 'articles')}</N> written.
            {stats.year.month && <> Your busiest month was <span className="whitespace-nowrap"><N>{monthName(Number(stats.year.month) - 1)}</N>.</span></>}
          </p>
        </Section>

        <Section title="When you capture">
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

        <Section title="What you capture">
          <div className="space-y-2">
            {stats.kinds.map(({ kind, n }) => {
              const type = CAPTURE_TYPES.find((one) => one.id === kind) ?? CAPTURE_TYPES[0]
              return (
                <div key={kind} className="flex items-center gap-3 text-sm">
                  <type.icon className="size-4 shrink-0" style={{ color: type.tint }} />
                  <span className="w-20 text-foreground">{type.label}</span>
                  <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-border/60">
                    <span className="block h-full rounded-full" style={{ width: percent(n, stats.kinds[0].n), background: type.tint }} />
                  </span>
                  <span className="w-10 text-right text-xs tabular-nums">{n}</span>
                </div>
              )
            })}
          </div>
        </Section>
      </div>
    </Page>
    </>
  )
}
