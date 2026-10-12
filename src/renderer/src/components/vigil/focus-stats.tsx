import { useState, type ReactNode } from 'react'

import { useLive, vigil, when } from '@/lib/vigil'
import { chime } from '@/lib/sound'
import { cn } from '@/lib/cn'
import { focusStats, streaks, type FocusRow, type FocusStats, type Outcome, type TaskFocus } from '../../../../main/focus-numbers'
import { dayjs, num } from '../../../../main/dates'
import { Chips } from './display'
import { Island, Rolling, Tip } from './ui'
import { N, Section } from './stats-view'

/**
 * How focus sessions went, in two places: on a task's panel (how many, how
 * long, the last one, how they ended, a small row of bars) and in Stats (time
 * a day or a week, the streak, the usual length, the best time of day, how
 * sessions end, breaks, and where the time went). Worked out in
 * main/focus-numbers.ts; read here as it changes.
 */

const call = <T,>(channel: string, ...args: unknown[]): Promise<T> => window.api.vigil(channel, ...args) as Promise<T>

/** Time, said the way a person says it: 25 min, 1 h 20 min, 14 h. */
export const timeSaid = (minutes: number): string => {
  const m = Math.round(minutes)
  if (m < 60) return `${m} min`
  const h = Math.floor(m / 60)
  return h >= 10 || !(m % 60) ? `${num(Math.round(m / 60))} h` : `${h} h ${m % 60} min`
}
const plural = (n: number, one: string, many: string): string => `${num(n)} ${n === 1 ? one : many}`

/** One colour a way a session can end: the theme's own accent, a paler one, and the page's line colour. */
const TINT: Record<Outcome, string> = {
  finished: 'var(--tt-brand-color-400)',
  // Halfway to the page's grey ink, so it stays a paler accent on a dark page as on a light one.
  early: 'color-mix(in oklab, var(--tt-brand-color-400) 50%, var(--muted-foreground))',
  abandoned: 'color-mix(in oklab, var(--foreground) 30%, var(--background))'
}
const SAID: Record<Outcome, string> = { finished: 'ran its full length', early: 'ended early', abandoned: 'abandoned' }

/** A row of bars, bottom-aligned, each with its own tip; an empty one keeps a stub so the day is still there. */
function Bars({ values, tips, tint, className, highlight }: { values: number[]; tips: string[]; tint?: (index: number) => string; className?: string; highlight?: number }): React.JSX.Element {
  const max = Math.max(1, ...values)
  return (
    <div data-focus-bars className={cn('flex items-end gap-[3px]', className)}>
      {values.map((value, index) => (
        <Tip key={index} label={tips[index]}>
          <div
            className="flex-1 rounded-t-[3px] transition-[height] duration-300"
            style={{
              height: value ? `${Math.max(6, (value / max) * 100)}%` : '2px',
              background: value ? (tint?.(index) ?? 'var(--tt-brand-color-400)') : 'color-mix(in oklab, var(--foreground) 14%, var(--background))',
              opacity: highlight === undefined || highlight === index || !value ? 1 : 0.72
            }}
          />
        </Tip>
      ))}
    </div>
  )
}

/** The legend of how sessions end: a mark, the words, the count. */
function Ends({ counts, className }: { counts: Record<Outcome, number>; className?: string }): React.JSX.Element {
  return (
    <p className={cn('flex flex-wrap gap-x-4 gap-y-1', className)}>
      {(['finished', 'early', 'abandoned'] as const).filter((one) => counts[one]).map((one) => (
        <span key={one} className="inline-flex items-center gap-1.5 text-foreground">
          <span className="size-2.5 shrink-0 rounded-[2px]" style={{ background: TINT[one] }} />
          <strong className="font-semibold tabular-nums"><Rolling text={counts[one]} /></strong> {one === 'finished' ? 'finished' : SAID[one]}
        </span>
      ))}
    </p>
  )
}

/**
 * On a task's panel, under Sessions: what its sessions came to. Nothing until
 * the first one ends; the first says so plainly; from the second, the bars.
 */
export function TaskFocusNumbers({ taskId }: { taskId: string }): React.JSX.Element | null {
  const focus = useLive(() => call<TaskFocus>('focus:task', taskId), null as TaskFocus | null, [taskId])
  if (!focus || !focus.recent.length) return null
  const ran = focus.finished + focus.early + focus.abandoned
  const first = focus.recent.length === 1
  return (
    <Island compact title="Focus so far">
      <div data-task-focus className="space-y-2 px-2 py-2">
        <p className="flex items-baseline gap-2">
          <span className="text-2xl leading-none font-semibold tracking-tight text-foreground tabular-nums"><Rolling text={!focus.minutes && focus.sessions ? 'Under a minute' : timeSaid(focus.minutes)} /></span>
          <span className="text-control text-muted-foreground">{focus.sessions ? `in ${plural(focus.sessions, 'session', 'sessions')}` : 'kept so far'}</span>
        </p>
        {first ? (
          <p className="text-control leading-snug text-foreground">
            <strong className="font-semibold">Your first session here</strong> {SAID[focus.recent[0].outcome]}, {when(focus.lastAt!, false)}. The next one starts the comparisons.
          </p>
        ) : (
          <>
            <Bars
              className="h-10"
              values={focus.recent.map((one) => Math.max(1, one.minutes))}
              tips={focus.recent.map((one) => `${timeSaid(one.minutes)}, ${SAID[one.outcome]} · ${dayjs(one.at).format('ddd D MMM, H:mm')}`)}
              tint={(index) => TINT[focus.recent[index].outcome]}
            />
            <p className="text-control leading-snug text-foreground">
              <strong className="font-semibold">Last session</strong> {when(focus.lastAt!, false)}
            </p>
            <Ends counts={{ finished: focus.finished, early: focus.early, abandoned: focus.abandoned }} className="text-control" />
            {ran > focus.recent.length && <p className="text-xs text-muted-foreground">The bars are the last {focus.recent.length} of {ran}.</p>}
          </>
        )}
      </div>
    </Island>
  )
}

/** A number set large over its words, three to a row. */
function Tile({ value, label, note }: { value: ReactNode; label: string; note?: ReactNode }): React.JSX.Element {
  return (
    <div className="min-w-0 rounded-lg bg-accent/40 px-3 py-2.5">
      <p className="text-[1.375rem] leading-tight font-semibold tracking-tight text-foreground tabular-nums">{value}</p>
      <p className="text-sm text-foreground">{label}</p>
      {note && <p className="mt-0.5 text-xs leading-snug">{note}</p>}
    </div>
  )
}

const PART = { morning: 'Mornings', afternoon: 'Afternoons', evening: 'Evenings', night: 'Late at night' }

/** Made up, for Stats' example page: ten weeks of mornings, as the sandbox has. */
export function exampleFocus(): FocusStats {
  const rows: FocusRow[] = []
  for (let n = 60; n >= 1; n--) {
    if (n > 8 && (n % 7 === 3 || n % 11 === 5)) continue
    for (let i = 0; i < 1 + Number(n % 3 === 0); i++) {
      const start = dayjs().subtract(n, 'day').hour(9 + i * 2).minute(n % 4 * 10).startOf('minute')
      const planned = (n + i) % 3 === 0 ? 50 : 25
      const worked = (n + i) % 9 === 4 ? 15 : planned
      rows.push({ id: `${n}-${i}`, taskId: ['a', 'b', 'c'][(n + i) % 3], title: ['Write the budget', 'Draft the repair plan', 'Practise cuneiform'][(n + i) % 3], startedAt: start.toISOString(), endedAt: start.add(worked, 'minute').toISOString(), pausedMs: 0, plannedMs: planned * 60000, abandonedAt: (n * 7 + i) % 17 === 0 ? start.add(worked, 'minute').toISOString() : null })
    }
  }
  return focusStats(rows, rows.slice(0, 20).map((one) => ({ at: one.endedAt, ms: 300000 })))
}

/**
 * Stats' focus sections: the time, a day or a week at a glance; how sessions
 * end and when you work best; where the time went. With none yet, one
 * section that says what will be here and how to start.
 */
export function FocusSections({ example }: { example: boolean }): React.JSX.Element | null {
  const real = useLive(() => call<FocusStats>('focus:stats'), null as FocusStats | null)
  const [span, setSpan] = useState<'days' | 'weeks'>('days')
  const focus = example ? exampleFocus() : real
  if (!focus) return null
  const ran = focus.outcomes.finished + focus.outcomes.early + focus.outcomes.abandoned

  if (!focus.total.sessions && !ran)
    return (
      <Section title="Focus">
        <p data-focus-empty className="text-foreground">
          <strong className="font-semibold">No focus sessions yet.</strong> Open a task and choose “Start a focus session”. From the first one, this shows how long you focus each day, your streak, and when you work best.
        </p>
      </Section>
    )

  const days = span === 'days'
  const values = days ? focus.days.map((one) => one.minutes) : focus.weeks.map((one) => one.minutes)
  const tips = days
    ? focus.days.map((one, index) => `${index === 27 ? 'Today' : dayjs(one.day).format('ddd D MMM')} · ${one.minutes ? `${timeSaid(one.minutes)}, ${plural(one.sessions, 'session', 'sessions')}` : 'no focus'}`)
    : focus.weeks.map((one, index) => `${index === 11 ? 'This week' : `Week of ${dayjs(one.start).format('D MMM')}`} · ${one.minutes ? timeSaid(one.minutes) : 'no focus'}`)
  const change = focus.weekBefore ? Math.round(((focus.week - focus.weekBefore) / focus.weekBefore) * 100) : null
  const finishedShare = ran ? Math.round((focus.outcomes.finished / ran) * 100) : 0
  const peak = Math.max(1, ...focus.hours)
  const first = focus.total.sessions <= 1

  return (
    <>
      <Section title="Focus" big={{ value: timeSaid(focus.week), label: 'of focus in the last 7 days' }}>
        <div data-focus-chart>
          <div className="mb-2 flex items-center justify-between gap-3">
            <span className="text-sm text-foreground">{days ? 'Each day, the last four weeks' : 'Each week, the last twelve'}</span>
            <Chips options={[{ id: 'days', label: 'Days' }, { id: 'weeks', label: 'Weeks' }]} on={(id) => id === span} pick={(id) => (chime('tap'), setSpan(id as 'days' | 'weeks'))} className="" />
          </div>
          <Bars className="h-24" values={values} tips={tips} highlight={values.length - 1} />
          <div className="mt-1.5 flex justify-between text-xs tabular-nums">
            <span>{days ? dayjs(focus.days[0].day).format('D MMM') : dayjs(focus.weeks[0].start).format('D MMM')}</span>
            <span>{days ? 'Today' : 'This week'}</span>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <Tile value={<Rolling text={focus.streak.now ? plural(focus.streak.now, 'day', 'days') : 'None'} />} label={focus.streak.now ? 'in a row, so far' : 'running right now'} note={focus.streak.best > 1 ? <>Longest run: <N>{plural(focus.streak.best, 'day', 'days')}</N></> : undefined} />
          <Tile value={<Rolling text={timeSaid(focus.average)} />} label="a session, on average" note={focus.longest > focus.average ? <>Longest: <N>{timeSaid(focus.longest)}</N></> : undefined} />
          <Tile value={focus.best && focus.sessions >= 3 ? PART[focus.best.part] : 'Not yet'} label={focus.best && focus.sessions >= 3 ? `you focus best, around ${focus.best.hour}:00` : 'your best time of day'} note={focus.best && focus.sessions >= 3 ? undefined : 'Shown after three sessions'} />
        </div>
        <p>
          {first ? (
            <><strong className="font-semibold text-foreground">Your first session is in.</strong> From the next one, this sets each day and week beside the last.</>
          ) : (
            <>
              {focus.today ? <>Today so far, <N>{timeSaid(focus.today)}</N>. </> : ''}The seven days before these came to <N>{timeSaid(focus.weekBefore)}</N>
              {change === null || change === 0 ? '.' : <>, so this week is {change > 0 ? 'up' : 'down'} <N>{`${Math.abs(change)}%`}</N>.</>}{' '}
              <N>{timeSaid(focus.total.minutes)}</N> in <N>{plural(focus.total.sessions, 'session', 'sessions')}</N> since {dayjs(focus.total.since).format('D MMMM YYYY')}.
            </>
          )}
        </p>
      </Section>

      {ran > 0 && (
        <Section title="How sessions end" big={{ value: `${finishedShare}%`, label: 'ran their full length' }}>
          <div data-focus-ends className="flex h-2.5 gap-[2px] overflow-hidden rounded-full">
            {(['finished', 'early', 'abandoned'] as const).filter((one) => focus.outcomes[one]).map((one) => (
              <div key={one} style={{ width: `${(focus.outcomes[one] / ran) * 100}%`, background: TINT[one] }} />
            ))}
          </div>
          <Ends counts={focus.outcomes} />
          <p>
            Of <N>{plural(ran, 'session', 'sessions')}</N> in the last 12 weeks, <N>{focus.outcomes.finished}</N> ran as long as you planned.
            {focus.outcomes.early ? <> <N>{focus.outcomes.early}</N> ended early, which still counts as focus.</> : ''}
            {focus.outcomes.abandoned ? <> <N>{focus.outcomes.abandoned}</N> {focus.outcomes.abandoned === 1 ? 'was' : 'were'} abandoned and count in no total.</> : ''}
          </p>
          <p>
            {focus.breaks.n ? <>You took <N>{plural(focus.breaks.n, 'break', 'breaks')}</N>, <N>{timeSaid(focus.breaks.minutes)}</N> in all. </> : 'No breaks taken yet: “Break” on the pill starts five minutes away. '}
            {focus.pauses.sessions ? <>You paused <N>{plural(focus.pauses.sessions, 'session', 'sessions')}</N>, for <N>{timeSaid(focus.pauses.minutes)}</N>.</> : 'No session was paused.'}
          </p>
        </Section>
      )}

      {focus.sessions >= 3 && focus.best && (
        <Section title="When you focus" big={{ value: PART[focus.best.part], label: `around ${focus.best.hour}:00` }}>
          <div>
            <Bars className="h-14" values={focus.hours} tips={focus.hours.map((n, hour) => `${hour}:00 · ${n ? timeSaid(n) : 'none'}`)} highlight={focus.hours.indexOf(peak)} />
            <div className="mt-1.5 flex justify-between text-xs tabular-nums"><span>00</span><span>06</span><span>12</span><span>18</span><span>23</span></div>
          </div>
        </Section>
      )}

      {focus.top.length > 0 && (
        <Section title="Where your focus went" big={{ value: timeSaid(focus.top[0].minutes), label: `on “${focus.top[0].title}”` }}>
          <div data-focus-top className="space-y-2.5">
            {focus.top.map((one) => (
              <div key={one.taskId} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 text-sm">
                <span className="truncate text-foreground">{one.title}</span>
                <span className="text-right tabular-nums text-foreground"><strong className="font-semibold">{timeSaid(one.minutes)}</strong> · {plural(one.sessions, 'session', 'sessions')}</span>
                <span className="col-span-2 h-1.5 overflow-hidden rounded-full bg-border/60">
                  <span className="block h-full rounded-full" style={{ width: `${Math.max(2, (one.minutes / focus.top[0].minutes) * 100)}%`, background: 'var(--tt-brand-color-400)' }} />
                </span>
              </div>
            ))}
          </div>
          <p>Your tasks with the most focus in the last 12 weeks.</p>
        </Section>
      )}
    </>
  )
}

/**
 * A routine's own numbers, over its History on the task's panel: how many
 * times it was done, the run of days (for a daily one), and the last four
 * weeks as a row of squares, a filled one for each day it was done.
 */
export function RoutineNumbers({ done, recurrence }: { done: { at: string }[]; recurrence: string | null }): React.JSX.Element | null {
  if (!done.length) return null
  const days = new Set(done.map((one) => dayjs(one.at).format('YYYY-MM-DD')))
  const daily = /\b(every!?\s*day|daily|everyday)\b/i.test(recurrence ?? '')
  const run = streaks(days, dayjs().format('YYYY-MM-DD'))
  const month = done.filter((one) => dayjs(one.at).isAfter(dayjs().subtract(30, 'day'))).length
  const grid = Array.from({ length: 28 }, (_, index) => dayjs().subtract(27 - index, 'day').format('YYYY-MM-DD'))
  return (
    <Island compact title="Done so far">
      <div data-routine-numbers className="space-y-2 px-2 py-2">
        <p className="flex items-baseline gap-2">
          <span className="text-2xl leading-none font-semibold tracking-tight text-foreground tabular-nums"><Rolling text={done.length === 1 ? 'Once' : `${num(done.length)} times`} /></span>
          <span className="text-control text-muted-foreground">{month && month !== done.length ? `${num(month)} in the last 30 days` : ''}</span>
        </p>
        {daily && run.best > 1 && (
          <p className="text-control leading-snug text-foreground">
            {run.now > 1 ? <><strong className="font-semibold">{num(run.now)} days in a row</strong>{run.best > run.now ? `, the longest run ${num(run.best)}` : ', your longest yet'}</> : <>Longest run: <strong className="font-semibold">{num(run.best)} days</strong></>}
          </p>
        )}
        {recurrence && (
          <div className="grid w-fit grid-flow-col grid-rows-1 gap-[3px]" aria-label="The last four weeks">
            {grid.map((day) => (
              <Tip key={day} label={`${dayjs(day).format('ddd D MMM')} · ${days.has(day) ? 'done' : 'not done'}`}>
                <div className="h-3 w-[7px] rounded-[2px]" style={{ background: days.has(day) ? 'var(--tt-brand-color-400)' : 'color-mix(in oklab, var(--foreground) 14%, var(--background))' }} />
              </Tip>
            ))}
          </div>
        )}
      </div>
    </Island>
  )
}

type Habits = { routines: number; doneWeek: number; best: { title: string; run: number } | null; read30: number; readAll: number }

/**
 * Stats' "Kept up": what is done again and again besides focus, each led by
 * its number. Routines this week and the longest run going, reviews on days
 * in a row, and what was read from the queue. Shown once any of it has begun.
 */
export function HabitSections({ example }: { example: boolean }): React.JSX.Element | null {
  const real = useLive(() => call<Habits>('habits:stats'), null as Habits | null)
  const days = useLive(vigil.daysInARow, null as { run: number; banked: number } | null, [], ['item'])
  const habits: Habits | null = example ? { routines: 3, doneWeek: 12, best: { title: 'Read twenty pages before bed', run: 9 }, read30: 6, readAll: 23 } : real
  const reviewRun = example ? 14 : days?.run ?? 0
  if (!habits || (!habits.routines && !habits.readAll && reviewRun < 2)) return null
  return (
    <Section title="Kept up" big={habits.routines ? { value: habits.doneWeek, label: `${habits.doneWeek === 1 ? 'routine' : 'routines'} done in the last 7 days` } : undefined}>
      <p data-habits>
        {habits.routines ? (
          <>
            You keep <N>{plural(habits.routines, 'routine', 'routines')}</N>
            {habits.best ? <>; “{habits.best.title}” is on a run of <N>{plural(habits.best.run, 'day', 'days')}</N>.</> : '.'}{' '}
          </>
        ) : ''}
        {reviewRun >= 2 ? <>You have reviewed <N>{plural(reviewRun, 'day', 'days')}</N> in a row. </> : ''}
        {habits.readAll ? <>From your reading queue you read <N>{num(habits.read30)}</N> in the last 30 days, <N>{num(habits.readAll)}</N> in all.</> : ''}
      </p>
    </Section>
  )
}
