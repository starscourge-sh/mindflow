import type { ReactNode } from 'react'

import { CAPTURE_TYPES } from '../capture-kinds/capture-kind-picker'
import { useLive, vigil, type Stats } from '@/lib/vigil'
import { Page } from './ui'

const percent = (part: number, whole: number): string => (whole ? `${Math.round((part / whole) * 100)}%` : '–')
const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`

/** A number inside a sentence, set apart only by weight and even figures. */
function N({ children }: { children: ReactNode }): React.JSX.Element {
  return <strong className="font-semibold text-foreground tabular-nums">{children}</strong>
}

function Section({ title, children }: { title: string; children: ReactNode }): React.JSX.Element {
  return (
    <section className="mt-12 first:mt-8">
      <h2 className="mb-3 text-[15px] font-semibold">{title}</h2>
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
      <div className="mx-auto max-w-[62ch] px-6 pb-20">
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
              <div key={day} title={day} className={`size-2.5 rounded-[2px] ${opened.has(day) ? 'bg-[var(--tt-brand-color-400)]' : 'bg-border/70'}`} />
            ))}
          </div>
          <p>
            <N>{opened.size}</N> of the last 84 days. This is the one number that notices if the app stops being opened at all, so it is the one to watch.
          </p>
        </Section>

        <Section title="Is it working">
          <p>
            {stats.firstUse === null ? (
              'Nothing has been promoted yet, so there is no time from capture to first use to measure.'
            ) : (
              <>
                A capture waits <N>{stats.firstUse.toFixed(1)} days</N> on average before it is first used. If that falls over the months, the app is doing what it is for.
              </>
            )}
          </p>
          <p>
            {stats.hints.shown ? (
              <>
                <N>{percent(stats.hints.up ?? 0, stats.hints.shown)}</N> of <N>{stats.hints.shown}</N> hints stopped you this month. If that falls, fewer get shown, not more.
              </>
            ) : (
              'No hints yet: they draw from nuggets, so they start once something is promoted.'
            )}
          </p>
          <p>
            You keep <N>{plural(stats.nuggets, 'nugget', 'nuggets')}</N>, <N>{stats.recall}</N> of them tested, and <N>{plural(stats.articles, 'article', 'articles')}</N> written from them.
          </p>
        </Section>

        <Section title="When you capture">
          <div className="flex h-14 items-end gap-[3px]">
            {Array.from({ length: 24 }, (_, hour) => {
              const n = stats.hours.find((row) => row.hour === hour)?.n ?? 0
              return <div key={hour} title={`${hour}:00 · ${n}`} className="flex-1 rounded-t-[2px] bg-muted-foreground/35" style={{ height: `${Math.max(3, (n / maxHour) * 100)}%` }} />
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
