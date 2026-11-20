import { useState, type ReactNode } from 'react'
import { useReading } from '@/lib/reads-in'

import { call, unloaded, useLive, haligtree, when, whenInLine } from '@/lib/haligtree'
import { chime } from '@/lib/sound'
import { cn } from '@/lib/cn'
import { streaks, type FocusStats, type Outcome, type TaskFocus } from '../../../../main/focus-numbers'
import { dated, dayjs, howLong, num, plural } from '../../../../main/dates'
import { moment } from '@/lib/clock'
import { Chips } from './display'
import { Island, Rolling, Tags, Tip } from './ui'
import { RowMenu } from './row-menu'
import { taskMenu, useTaskNow } from './tasks-view'
import { DOT_IN_MARGIN, SessionDot, useTaskTime } from './task-time'
import { taskName } from '@/lib/tasks'
import type { Task } from '@/lib/haligtree'
import { N, Section } from './stats-view'
import { TONES } from './mono-card'
import { quoted } from '../../../../main/clip'
import { SiteIcon, bySite, sentAwaySince, timesSaid, type SentAway } from './site-block-field'

/**
 * How focus sessions went, in two places: on a task's panel (how many, how
 * long, the last one, how they ended, a small row of bars) and in Stats (time
 * a day or a week, the streak, the usual length, the best time of day, how
 * sessions end, breaks, and where the time went). Worked out in
 * main/focus-numbers.ts; read here as it changes.
 */

/** Time, said the way a person says it: 25 min, 11 h 20 min, 2,300 h; a session cut short is "Under a minute", never "0 min". */
export const timeSaid = (minutes: number): string => (Math.round(minutes) < 1 ? 'Under a minute' : howLong(minutes))

/** One colour a way a session can end: the theme's own accent, a paler one, and the page's line colour. */
/**
 * Every focus chart in the one ink of the app's charts (mono-card): full, and two lighter tones that still pass 3:1
 * on the card, so a part reads by its tone and its name in the key, never by a colour alone.
 */
const INK = 'var(--foreground)'
const INK_MID = `color-mix(in oklab, var(--foreground) ${TONES[1] * 100}%, transparent)`
const INK_LOW = `color-mix(in oklab, var(--foreground) ${TONES[2] * 100}%, transparent)`
/** What is not data (a day with none): faint. */
const INK_NONE = 'color-mix(in oklab, var(--foreground) 10%, transparent)'
const TINT: Record<Outcome, string> = { finished: INK, early: INK_MID, abandoned: INK_LOW }
const SAID: Record<Outcome, string> = { finished: 'ran its full length', early: 'ended early', abandoned: 'abandoned' }

/**
 * A row of bars, bottom-aligned, each with its own tip; an empty one keeps a
 * stub so the day is still there. `peak` labels the tallest bar with how much
 * it stands for, so the heights read without pointing at each one; with
 * `every`, each bar that has any wears its own (a short row: weeks, months).
 */
export function Bars({ values, tips, tint, className, highlight, peak, every }: { values: number[]; tips: string[]; tint?: (index: number) => string; className?: string; highlight?: number; peak?: (value: number) => string; every?: boolean }): React.JSX.Element {
  const max = Math.max(1, ...values)
  const top = values.indexOf(Math.max(...values))
  const at = ((top + 0.5) / Math.max(1, values.length)) * 100
  return (
    <div className={cn('relative', peak && values[top] > 0 && 'pt-5')}>
    {peak && !every && values[top] > 0 && (
      <span data-focus-peak className="pointer-events-none absolute top-0 text-xs font-medium whitespace-nowrap text-foreground tabular-nums"
        style={{ left: `${at}%`, transform: `translateX(${at < 12 ? '-10%' : at > 88 ? '-90%' : '-50%'})` }}>{peak(values[top])}</span>
    )}
    <div data-focus-bars data-chart="focus-bars" className={cn('flex items-end gap-[3px]', className)}>
      {values.map((value, index) => (
        <Tip key={index} label={tips[index]}>
          {/* Full height, scaled from the foot: a change grows on the compositor, not by laying the row out again each frame. */}
          {/* A pill of the ink, round at both ends, at most 10 px wide so a short row never turns into blocks; a day with none keeps a faint stub. */}
          <div className="relative flex h-full flex-1 items-end justify-center">
            {every && peak && value > 0 && (
              <span data-bar-label className="pointer-events-none absolute left-1/2 -translate-x-1/2 text-xs font-medium whitespace-nowrap text-foreground tabular-nums"
                style={{ bottom: `calc(max(6px, ${(value / max) * 100}%) + 4px)` }}>{peak(value)}</span>
            )}
            <div {...(value ? { 'data-mark': '' } : {})}
              className="w-full max-w-2.5 rounded-none transition-[height] duration-240"
              style={{
                height: value ? `max(6px, ${(value / max) * 100}%)` : '2px',
                background: value ? (tint?.(index) ?? INK) : INK_NONE,
                opacity: highlight === undefined || highlight === index || !value ? 1 : 0.72
              }}
            />
          </div>
        </Tip>
      ))}
    </div>
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
export function TaskFocusNumbers({ taskId, estimate }: { taskId: string; estimate?: number | null }): React.JSX.Element | null {
  const focus = useLive(() => call<TaskFocus>('focus:task', taskId), null as TaskFocus | null, [taskId])
  // The number its row says in every list, the whole minutes of a session running on it among them (task-time.tsx):
  // a row and its page never say two times.
  const spent = useTaskTime().of(taskId)
  if (!focus || !focus.recent.length) return null
  const minutes = spent?.minutes ?? focus.minutes
  const sessions = spent?.sessions ?? focus.sessions
  const ran = focus.finished + focus.early + focus.abandoned
  const first = focus.recent.length === 1
  return (
    <Island compact title="Focus so far">
      <div data-task-focus className="space-y-2 px-2 py-2">
        <p className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <span className="text-2xl leading-none font-semibold tracking-tight text-foreground tabular-nums"><Rolling text={!minutes && sessions ? 'Under a minute' : timeSaid(minutes)} /></span>
          <span className="whitespace-nowrap text-control text-muted-foreground">{sessions ? `in ${plural(sessions, 'session', 'sessions')}` : 'kept so far'}</span>
        </p>
        {/* What it was meant to take, beside what the sessions took: said plainly, on its own line. */}
        {!!estimate && (
          <p data-vs-estimate className="text-[0.9375rem] leading-snug font-medium text-foreground">
            {timeSaid(minutes)} of ~{timeSaid(estimate)} planned
            {minutes > estimate ? `, ${timeSaid(minutes - estimate)} over` : minutes < estimate ? `, ${timeSaid(estimate - minutes)} to go` : ', right on it'}
          </p>
        )}
        {first ? (
          <p className="text-control leading-snug text-foreground">
            <strong className="font-semibold">Your first session on this task</strong> {SAID[focus.recent[0].outcome]}, {whenInLine(focus.lastAt!, false)}. From the next one, each session shows here as a bar, so you can see how they compare.
          </p>
        ) : (
          <>
            <Bars
              className="h-10"
              values={focus.recent.map((one) => Math.max(1, one.minutes))}
              tips={focus.recent.map((one) => `${timeSaid(one.minutes)}, ${SAID[one.outcome]} · ${moment(one.at)}`)}
              tint={(index) => TINT[focus.recent[index].outcome]}
              peak={timeSaid}
            />
            <p className="text-control leading-snug text-foreground">
              <strong className="font-semibold">Last session</strong> {when(focus.lastAt!, false)}
            </p>
            <Ends counts={{ finished: focus.finished, early: focus.early, abandoned: focus.abandoned }} className="text-control" />
            {ran > focus.recent.length && <p className="text-xs text-muted-foreground">The bars are the last {num(focus.recent.length)} of {num(ran)}.</p>}
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

/**
 * Stats' focus sections: the time, a day or a week at a glance; how sessions
 * end and when you work best; where the time went. With none yet, one
 * section that says what will be here and how to start.
 */
export function FocusSections(): React.JSX.Element | null {
  const focus = useLive(() => call<FocusStats>('focus:stats'), null as FocusStats | null)
  const [span, setSpan] = useState<'days' | 'weeks'>('days')
  // Where the focus went: each task opens, and right-clicks with its own menu, as in every list.
  const tasks = useLive(haligtree.tasks, [] as Task[])
  const taskNow = useTaskNow()
  // The session running on a task, for its dot in the lists of tasks here (each row says its own time already).
  const taskTime = useTaskTime()
  // Stats is drawn once every section's read is in (lib/reads-in.tsx), never a section popping in between two others.
  useReading(!focus || unloaded(tasks))
  if (!focus) return null
  const openTask = (id: string): void => (chime('open'), window.api.openInHome('task', id))
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
    ? focus.days.map((one, index) => `${index === 27 ? 'Today' : dated(one.day, 'ddd D MMM')} · ${one.minutes ? `${timeSaid(one.minutes)}, ${plural(one.sessions, 'session', 'sessions')}` : 'no focus'}`)
    : focus.weeks.map((one, index) => `${index === 11 ? 'This week' : `Week of ${dated(one.start)}`} · ${one.minutes ? timeSaid(one.minutes) : 'no focus'}`)
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
          <Bars className="h-24" values={values} tips={tips} highlight={values.length - 1} peak={timeSaid} />
          <div className="mt-1.5 flex justify-between text-xs tabular-nums">
            <span>{days ? dated(focus.days[0].day) : dated(focus.weeks[0].start)}</span>
            <span>{days ? 'Today' : 'This week'}</span>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-2 @[40rem]/page:grid-cols-3">
          <Tile value={<Rolling text={focus.streak.now ? plural(focus.streak.now, 'day', 'days') : 'None'} />} label={focus.streak.now ? 'in a row, so far' : 'running right now'} note={focus.streak.best > 1 ? <>Longest run: <N>{plural(focus.streak.best, 'day', 'days')}</N></> : undefined} />
          <Tile value={<Rolling text={timeSaid(focus.average)} />} label="a session, on average" note={focus.longest > focus.average ? <>Longest: <N>{timeSaid(focus.longest)}</N></> : undefined} />
          <Tile value={focus.best && focus.sessions >= 3 ? PART[focus.best.part] : 'Not yet'} label={focus.best && focus.sessions >= 3 ? `you focus best, around ${focus.best.hour}:00` : 'your best time of day'} note={focus.best && focus.sessions >= 3 ? undefined : 'Shown after three sessions'} />
        </div>
        <p>
          {first ? (
            <><strong className="font-semibold text-foreground">Your first session is in.</strong> From the next one, this compares each day and week with the one before.</>
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
          <div data-focus-ends data-chart="focus-ends" className="flex h-2.5 gap-[2px] overflow-hidden rounded-none">
            {(['finished', 'early', 'abandoned'] as const).filter((one) => focus.outcomes[one]).map((one) => (
              <div key={one} data-mark style={{ width: `${(focus.outcomes[one] / ran) * 100}%`, background: TINT[one] }} />
            ))}
          </div>
          <Ends counts={focus.outcomes} />
          <p>
            Of <N>{plural(ran, 'session', 'sessions')}</N> in the last 12 weeks, <N>{focus.outcomes.finished}</N> ran as long as you planned.
            {focus.outcomes.early ? <> <N>{focus.outcomes.early}</N> ended early, which still counts as focus.</> : ''}
            {focus.outcomes.abandoned ? <> <N>{focus.outcomes.abandoned}</N> {focus.outcomes.abandoned === 1 ? 'was' : 'were'} abandoned and count in no total.</> : ''}
          </p>
          <p>
            {focus.breaks.n ? <>You took <N>{plural(focus.breaks.n, 'break', 'breaks')}</N>, <N>{timeSaid(focus.breaks.minutes)}</N> in all. </> : 'No breaks taken yet: “Break” on the session bubble starts five minutes away. '}
            {focus.pauses.sessions ? <>You paused <N>{plural(focus.pauses.sessions, 'session', 'sessions')}</N>, for <N>{timeSaid(focus.pauses.minutes)}</N>.</> : 'No session was paused.'}
          </p>
        </Section>
      )}

      <SitesKeptOff />

      {focus.sessions >= 3 && focus.best && (
        <Section title="When you focus" big={{ value: PART[focus.best.part], label: `around ${focus.best.hour}:00` }}>
          <div>
            <Bars className="h-14" values={focus.hours} tips={focus.hours.map((n, hour) => `${hour}:00 · ${n ? timeSaid(n) : 'none'}`)} highlight={focus.hours.indexOf(peak)} peak={timeSaid} />
            <div className="mt-1.5 flex justify-between text-xs tabular-nums"><span>00</span><span>06</span><span>12</span><span>18</span><span>23</span></div>
          </div>
        </Section>
      )}

      {focus.top.length > 0 && (
        <Section title="Where your focus went" big={{ value: timeSaid(focus.top[0].minutes), label: `on ${quoted(taskName(focus.top[0].title).text, 80)}` }}>
          <div data-focus-top className="space-y-2.5">
            {focus.top.map((one) => {
              const task = tasks.find((t) => t.id === one.taskId)
              return (
              <RowMenu key={one.taskId} items={!task ? [] : taskMenu(task, { open: () => openTask(task.id), now: taskNow })}>
              <div className="relative grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 text-sm">
                <SessionDot id={one.taskId} time={taskTime} className={`${DOT_IN_MARGIN} top-0 h-6`} />
                <button type="button" onClick={() => openTask(one.taskId)} className="flex min-h-6 min-w-0 items-center gap-1.5 text-left text-foreground hover:underline decoration-foreground/30 underline-offset-2">
                  <span dir="auto" className="truncate">{taskName(one.title).text}</span>
                  <Tags tags={taskName(one.title).tags} />
                </button>
                <span className="text-right tabular-nums text-foreground"><strong className="font-semibold">{timeSaid(one.minutes)}</strong> · {plural(one.sessions, 'session', 'sessions')}</span>
                <span className="col-span-2 h-1.5">
                  <span data-mark className="block h-full min-w-1.5 rounded-none" style={{ width: `${Math.max(2, (one.minutes / focus.top[0].minutes) * 100)}%`, background: INK }} />
                </span>
              </div>
              </RowMenu>
              )
            })}
          </div>
          <p>Your tasks with the most focus in the last 12 weeks.</p>
        </Section>
      )}

      {focus.taskTimes.tasks.length > 0 && (() => {
        const most = Math.max(focus.taskTimes.average, ...focus.taskTimes.tasks.map((one) => one.minutes))
        const grew = focus.taskTimes.tasks.filter((one) => one.grew).length
        return (
          <Section title="How long each task took" big={{ value: timeSaid(focus.taskTimes.average), label: 'a task, on average' }}>
            {/* One bar a task, the average a line down them all; a task whose sessions got longer says so in words beside it. */}
            <div data-task-times className="relative space-y-2.5">
              {focus.taskTimes.tasks.map((one) => (
                <div key={one.taskId} data-task-time={one.taskId} className="relative grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 text-sm">
                  <SessionDot id={one.taskId} time={taskTime} className={`${DOT_IN_MARGIN} top-0 h-6`} />
                  <button type="button" onClick={() => openTask(one.taskId)} className="flex min-h-6 min-w-0 items-center gap-1.5 text-left text-foreground hover:underline decoration-foreground/30 underline-offset-2">
                    <span dir="auto" className="truncate">{taskName(one.title).text}</span>
                  </button>
                  <span className="text-right tabular-nums text-foreground">
                    <strong className="font-semibold">{timeSaid(one.minutes)}</strong>
                    {one.grew && <span data-grew className="ml-2 font-medium text-foreground">Grew: {timeSaid(one.first)} to {timeSaid(one.last)} a session</span>}
                  </span>
                  <span className="relative col-span-2 h-2">
                    <span data-mark className="block h-full min-w-2 rounded-none" style={{ width: `${Math.max(2, (one.minutes / most) * 100)}%`, background: one.minutes > focus.taskTimes.average ? INK : INK_LOW }} />
                    <span aria-hidden className="absolute -top-1 -bottom-1 w-0.5 rounded-none bg-foreground/70" style={{ left: `${(focus.taskTimes.average / most) * 100}%` }} />
                  </span>
                </div>
              ))}
            </div>
            {/* Said by where a bar ends and by its tone: past the average in the full ink, under it lighter. */}
            <p className="text-foreground">The line is the average: a bar past it took longer, and is drawn deeper{grew ? `; ${plural(grew, 'task', 'tasks')} grew, each session longer than the first` : ''}.</p>
          </Section>
        )
      })()}
    </>
  )
}

/**
 * The sites focus sessions sent away (site-block.ts keeps how often, per
 * session): the last eight weeks or six months as bars, each wearing its
 * count, then this week's or this month's sites ranked, each with its own
 * picture and its count, and one line saying it. Nothing until a session
 * first sends one away; a period with none says so.
 */
function SitesKeptOff(): React.JSX.Element | null {
  const [span, setSpan] = useState<'weeks' | 'months'>('weeks')
  // From the earlier of eight weeks and six months back, so the switch reads nothing more.
  const since = dayjs().startOf('month').subtract(5, 'month').startOf('week').subtract(1, 'week')
  const rows = useLive(() => sentAwaySince(since.toISOString()), null as SentAway[] | null, [since.format('YYYY-MM-DD')])
  useReading(!rows)
  if (!rows?.length) return null
  const weeks = span === 'weeks'
  const unit = weeks ? 'week' : 'month'
  const count = weeks ? 8 : 6
  const periods = Array.from({ length: count }, (_, i) => dayjs().startOf(unit).subtract(count - 1 - i, unit))
  const sums = periods.map((start) => bySite(rows, start.toISOString(), start.add(1, unit).toISOString()))
  const totals = sums.map((sites) => sites.reduce((n, one) => n + one.count, 0))
  const now = sums[count - 1]
  const [total, before] = [totals[count - 1], totals[count - 2]]
  const name = `this ${unit}`
  const label = (i: number): string => (i === count - 1 ? `This ${unit}` : weeks ? `Week of ${dated(periods[i])}` : periods[i].format('MMMM YYYY'))
  const most = Math.max(1, ...now.map((one) => one.count))
  return (
    <Section title="Sites it kept you off" big={{ value: num(total), label: `${total === 1 ? 'time' : 'times'} a site was sent away ${name}` }}>
      <div data-sites-chart data-chart="sites">
        <div className="mb-2 flex items-center justify-between gap-3">
          <span className="text-sm text-foreground">{weeks ? 'Each week, the last eight' : 'Each month, the last six'}</span>
          <Chips options={[{ id: 'weeks', label: 'Weeks' }, { id: 'months', label: 'Months' }]} on={(id) => id === span} pick={(id) => (chime('tap'), setSpan(id as 'weeks' | 'months'))} className="" />
        </div>
        <Bars className="h-16" values={totals} tips={totals.map((n, i) => `${label(i)} · ${n ? sums[i].map((one) => `${one.site} ${timesSaid(one.count)}`).join(', ') : 'none sent away'}`)} highlight={count - 1} peak={num} every />
        <div className="mt-1.5 flex justify-between text-xs tabular-nums">
          <span>{weeks ? `Week of ${dated(periods[0])}` : periods[0].format('MMMM')}</span>
          <span>{`This ${unit}`}</span>
        </div>
      </div>
      {now.length > 0 && (
        <div data-sites-ranked className="space-y-2">
          {now.slice(0, 5).map((one) => (
            <div key={one.site} data-site-row={one.site} className="flex items-center gap-3 text-sm">
              <SiteIcon site={one.site} size={16} />
              <span className="w-40 min-w-0 truncate text-foreground">{one.site}</span>
              <span className="h-1.5 flex-1"><span data-mark className="block h-full min-w-1.5 rounded-none" style={{ width: `${(one.count / most) * 100}%`, background: INK }} /></span>
              <span className="min-w-16 shrink-0 text-right font-semibold text-foreground tabular-nums">{timesSaid(one.count)}</span>
            </div>
          ))}
        </div>
      )}
      <p data-sites-said className="text-foreground">
        {now.length
          ? <>{weeks ? 'This week' : 'This month'} it kept you off {now.slice(0, 3).map((one, i, all) => <span key={one.site}><strong className="font-semibold">{one.site}</strong> {timesSaid(one.count)}{i < all.length - 2 ? ', ' : i === all.length - 2 ? ' and ' : ''}</span>)}{now.length > 3 ? `, and ${plural(now.length - 3, 'more site', 'more sites')}` : ''}.</>
          : <>Nothing was sent away {name}.</>}
        {' '}{before ? <>The {unit} before, <N>{plural(before, 'time', 'times')}</N>.</> : `None the ${unit} before.`}
      </p>
    </Section>
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
          <div data-chart="kept-up" className="grid w-fit grid-flow-col grid-rows-1 gap-[3px]" role="img" aria-label="The last four weeks">
            {grid.map((day) => (
              <Tip key={day} label={`${dated(day, 'ddd D MMM')} · ${days.has(day) ? 'done' : 'not done'}`}>
                <div {...(days.has(day) ? { 'data-mark': '' } : {})} className="size-2.5 rounded-[2px]" style={{ background: days.has(day) ? INK : INK_NONE }} />
              </Tip>
            ))}
          </div>
        )}
      </div>
    </Island>
  )
}

type Habits = { goals: { made: number; missed: number; letGo: number; open: number }; tags: { tag: string; dealt: number; waiting: number }[]; routines: number; doneWeek: number; best: { title: string; run: number } | null; read30: number; readAll: number }

/**
 * Stats' "Kept up": what is done again and again besides focus, each led by
 * its number. Routines this week and the longest run going, reviews on days
 * in a row, and what was read from the queue. Shown once any of it has begun.
 */
export function HabitSections(): React.JSX.Element | null {
  const habits = useHabits()
  const days = useLive(haligtree.daysInARow, null as { run: number; banked: number } | null, [], ['item'])
  const reviewRun = days?.run ?? 0
  useReading(!habits || !days)
  if (!habits || (!habits.routines && !habits.readAll && reviewRun < 2)) return null
  return (
    <Section title="Kept up" big={habits.routines ? { value: habits.doneWeek, label: `${habits.doneWeek === 1 ? 'routine' : 'routines'} done in the last 7 days` } : undefined}>
      <p data-habits>
        {habits.routines ? (
          <>
            You keep <N>{plural(habits.routines, 'routine', 'routines')}</N>
            {habits.best ? <>; {quoted(taskName(habits.best.title).text, 80)} is on a run of <N>{plural(habits.best.run, 'day', 'days')}</N>.</> : '.'}{' '}
          </>
        ) : ''}
        {reviewRun >= 2 ? <>You have reviewed <N>{plural(reviewRun, 'day', 'days')}</N> in a row. </> : ''}
        {habits.readAll ? <>From your reading queue you read <N>{num(habits.read30)}</N> in the last 30 days, <N>{num(habits.readAll)}</N> in all.</> : ''}
      </p>
    </Section>
  )
}

/** One read for the goal and tag sections both. */
const useHabits = (): Habits | null => useLive(() => call<Habits>('habits:stats'), null as Habits | null)

/** How goals have ended: made it, missed, let go, with those still under way. */
export function GoalSection(): React.JSX.Element | null {
  const habits = useHabits()
  useReading(!habits)
  if (!habits) return null
  const { made, missed, letGo, open } = habits.goals
  const ended = made + missed + letGo
  if (!ended && !open) return null
  const parts = [
    { n: made, label: 'made it', tint: INK },
    { n: missed, label: 'missed', tint: INK_MID },
    { n: letGo, label: 'given up', tint: INK_LOW }
  ]
  return (
    <Section title="Goals" big={ended ? { value: made, label: `made it, of ${plural(ended, 'goal', 'goals')} ended` } : { value: open, label: open === 1 ? 'goal under way' : 'goals under way' }}>
      {ended > 0 && (
        <div data-goal-tally data-chart="goal-tally" className="flex h-2.5 gap-[2px] overflow-hidden rounded-none">
          {parts.filter((one) => one.n).map((one) => <div key={one.label} data-mark style={{ width: `${(one.n / ended) * 100}%`, background: one.tint }} />)}
        </div>
      )}
      <p>
        {ended ? (
          <>{parts.filter((one) => one.n).map((one, index, all) => <span key={one.label}><N>{one.n}</N> {one.label}{index < all.length - 2 ? ', ' : index === all.length - 2 ? ' and ' : '. '}</span>)}</>
        ) : 'None has ended yet. '}
        {open ? <><N>{plural(open, 'goal is', 'goals are')}</N> still under way.</> : ''} Missing one says as much as making it: what you aim at, and how far.
      </p>
    </Section>
  )
}

/** Each tag's captures: how many are dealt with, how many still wait in the Inbox. */
export function TagSection(): React.JSX.Element | null {
  const habits = useHabits()
  if (!habits?.tags.length) return null
  const top = Math.max(...habits.tags.map((one) => one.dealt + one.waiting))
  const most = [...habits.tags].sort((a, b) => b.waiting - a.waiting)[0]
  return (
    <Section title="By tag" big={{ value: `#${habits.tags[0].tag}`, label: 'your most used tag' }}>
      <div data-tag-split data-chart="tag-split" className="space-y-2.5">
        {habits.tags.map((one) => (
          <div key={one.tag} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 text-sm">
            <span className="truncate font-medium text-foreground">#{one.tag}</span>
            <span className="text-right text-foreground tabular-nums"><strong className="font-semibold">{num(one.dealt)}</strong> dealt with · <strong className="font-semibold">{num(one.waiting)}</strong> waiting</span>
            <span className="col-span-2 flex h-1.5 gap-[2px] overflow-hidden rounded-none" style={{ width: `${Math.max(4, ((one.dealt + one.waiting) / top) * 100)}%` }}>
              {one.dealt > 0 && <span data-mark className="h-full" style={{ flex: one.dealt, background: INK }} />}
              {one.waiting > 0 && <span data-mark className="h-full" style={{ flex: one.waiting, background: INK_LOW }} />}
            </span>
          </div>
        ))}
      </div>
      <p>
        Captures carrying each of your most used tags, dealt with (the accent) or still waiting in your Inbox (grey).
        {most.waiting ? <> Most are waiting under <N>#{most.tag}</N>.</> : ''}
      </p>
    </Section>
  )
}
