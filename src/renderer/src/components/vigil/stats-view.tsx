import type { ReactNode } from 'react'

import { CAPTURE_TYPES } from '../capture-kinds/capture-kind-picker'
import { useLive, vigil, type Stats } from '@/lib/vigil'
import { Page } from './ui'
import { Tip } from '@/components/vigil/ui'

const percent = (part: number, whole: number): string => (whole ? `${Math.round((part / whole) * 100)}%` : '–')
const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`

/** A number inside a sentence, set apart only by weight and even figures. */
function N({ children }: { children: ReactNode }): React.JSX.Element {
  return <strong className="font-semibold text-foreground proportional-nums">{children}</strong>
}

function Section({ title, children }: { title: string; children: ReactNode }): React.JSX.Element {
  return (
    <section className="mt-12 first:mt-8">
      <h2 className="mb-3 text-heading font-semibold">{title}</h2>
      <div className="space-y-3 leading-relaxed text-muted-foreground">{children}</div>
    </section>
  )
}

/**
 * The numbers, written as a scientist would and never as a judge: sentences
 * that set each one beside something, rather than a dashboard of big figures
 * that read as a score. No streaks, no targets. The two the plan calls
 * load-bearing are here: days opened, the only one that notices the app being
 * abandoned, and time to first use, which says whether it works at all.
 */
export function StatsView(): React.JSX.Element {
  const stats = useLive(vigil.stats, null as Stats | null)
  if (!stats) return <Page title="Stats"><div /></Page>

  const by = Object.fromEntries(stats.exits.map((row) => [row.status, row.n]))
  const total = stats.exits.reduce((sum, row) => sum + row.n, 0)
  const change = stats.lastWeek ? Math.round(((stats.week - stats.lastWeek) / stats.lastWeek) * 100) : null
  const busiest = [...stats.hours].sort((a, b) => b.n - a.n)[0]
  const maxHour = Math.max(1, ...stats.hours.map((row) => row.n))
  const opened = new Set(stats.days)
  // Twelve weeks of days, oldest first, ending today: the heatmap's cells.
  const days = Array.from({ length: 84 }, (_, index) => new Date(Date.now() - (83 - index) * 86400000).toISOString().slice(0, 10))
  const exits = [
    { status: 'promoted', label: 'became nuggets', color: 'var(--tt-color-text-purple)' },
    { status: 'resolved', label: 'dealt with elsewhere', color: 'var(--tt-color-text-green)' },
    { status: 'discarded', label: 'let go', color: 'var(--tt-color-text-gray)' }
  ]

  return (
    <Page title="Stats">
      <div className="px-5 pb-20 [&>section]:max-w-[62ch]">
        <Section title="Today">
          <p>
            {stats.day.captured + stats.day.exits + stats.day.reviews ? (
              <>
                You caught <N>{plural(stats.day.captured, 'thing', 'things')}</N>, saw <N>{stats.day.exits}</N> through to an exit and reviewed <N>{stats.day.reviews}</N>.
              </>
            ) : 'A quiet day here. That is allowed.'}
          </p>
        </Section>

        <Section title="This week">
          <p>
            You captured <N>{stats.week}</N> {stats.week === 1 ? 'thing' : 'things'}
            {change === null ? ', with nothing the week before to set it against.' : <>, {change >= 0 ? 'up' : 'down'} <N>{Math.abs(change)}%</N> on the week before.</>}{' '}
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
                You ran <N>{plural(stats.sessions.n, 'session', 'sessions')}</N> for <N>{Math.round((stats.sessions.minutes ?? 0) / 60 * 10) / 10} hours</N> of focus.{' '}
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
              You aim to remember <N>{Math.round(stats.retention * 100)}%</N> and actually remembered <N>{percent(stats.reviews.recalled ?? 0, stats.reviews.n)}</N>.
            </p>
          )}
          {stats.estimates.estimated ? (
            <p>
              Tasks you estimated at <N>{stats.estimates.estimated} minutes</N> took <N>{Math.round(stats.estimates.spent ?? 0)}</N> in sessions.
            </p>
          ) : null}
        </Section>

        <Section title="The doing, this week">
          <p>
            No target here, only the trend. You took <N>{plural(stats.lead.exits, 'exit', 'exits')}</N> on captures, wrote <N>{plural(stats.lead.glosses, 'gloss', 'glosses')}</N>,
            reviewed on <N>{plural(stats.lead.reviewDays, 'day', 'days')}</N> and started <N>{plural(stats.lead.articles, 'article', 'articles')}</N>.
            The article is the one that cannot be faked.
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
          <div className="flex h-2 overflow-hidden rounded-full bg-border/60">
            {exits.map((exit) => (
              <div key={exit.status} style={{ width: percent(by[exit.status] ?? 0, total), background: exit.color }} />
            ))}
          </div>
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
          <div className="grid w-fit grid-flow-col grid-rows-7 gap-[3px]">
            {days.map((day) => (
              <Tip key={day} label={day}>
              <div className={`size-2.5 rounded-[2px] ${opened.has(day) ? 'bg-[var(--tt-brand-color-400)]' : 'bg-border/70'}`} />
              </Tip>
            ))}
          </div>
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
            You keep <N>{plural(stats.nuggets, 'nugget', 'nuggets')}</N>, <N>{stats.recall}</N> of them tested, and <N>{plural(stats.articles, 'article', 'articles')}</N> written from them.
          </p>
        </Section>

        <Section title={`${new Date().getFullYear()} so far`}>
          <p>
            <N>{plural(stats.year.captured, 'capture', 'captures')}</N>, <N>{plural(stats.year.nuggets, 'nugget', 'nuggets')}</N> kept and{' '}
            <N>{plural(stats.year.articles, 'article', 'articles')}</N> written.
            {stats.year.month && <> Your busiest month was <N>{new Date(2000, Number(stats.year.month) - 1).toLocaleString('en', { month: 'long' })}</N>.</>}
          </p>
        </Section>

        <Section title="When you capture">
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
          {busiest && <p>Most of it happens around <N>{busiest.hour}:00</N>.</p>}
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
  )
}
