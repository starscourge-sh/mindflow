import { useLive } from '@/lib/haligtree'
import { useReading } from '@/lib/reads-in'
import { chime } from '@/lib/sound'
import { taskName } from '@/lib/tasks'
import { N, Section } from './stats-view'
import { num, plural } from '../../../../main/dates'

type TaskStats = { done: number; dated: number; onTime: number; late: number; waitedDays: number | null; moved: { id: string; title: string; reschedules: number; rollovers: number }[] }

const daysSaid = (days: number): string => (days < 1 ? 'under a day' : days < 1.5 ? 'a day' : `${num(Math.round(days))} days`)

/**
 * Tasks, from what each one keeps (main/stats-more.ts): its day, when it was done and made, how often its day was
 * changed and how many days it was carried past it. Done on time or late (on time: done on its day or before), how
 * long done ones waited from being made, and the open ones moved most.
 */
export function TaskTimingSection(): React.JSX.Element | null {
  const stats = useLive(() => window.api.haligtree('stats:tasks') as Promise<TaskStats>, null as TaskStats | null)
  useReading(!stats)
  if (!stats) return null
  return (
    <Section title="Tasks, on time or late" big={stats.dated ? { value: `${num(stats.onTime)} of ${num(stats.dated)}`, label: 'done on their day or before' } : undefined}>
      {stats.done ? (
        <p data-tasks-timing>
          In the last 30 days you did <N>{plural(stats.done, 'task')}</N>.{' '}
          {stats.dated ? <>Of the <N>{num(stats.dated)}</N> with a day, <N>{num(stats.onTime)}</N> {stats.onTime === 1 ? 'was' : 'were'} done on it or before and <N>{num(stats.late)}</N> after.</> : 'None of them had a day, so none was on time or late.'}{' '}
          {stats.waitedDays !== null && <>Half waited <N>{daysSaid(stats.waitedDays)}</N> or less from being written down to being done.</>}
        </p>
      ) : <p data-tasks-timing>No task done in the last 30 days.</p>}
      {stats.moved.length > 0 && (
        <div data-tasks-moved>
          <p className="mb-1 font-semibold text-foreground">Moved most</p>
          <p className="mb-1 text-meta text-(--mf-muted-strong)">Open tasks whose day you changed, or that were carried past their day, twice or more.</p>
          <ul className="flex flex-col">
            {stats.moved.map((one) => (
              <li key={one.id}>
                <button type="button" onClick={() => (chime('open'), window.api.openInHome('task', one.id))} className="flex w-full cursor-pointer flex-col items-start rounded-md px-2 py-1.5 text-left transition-colors hover:bg-accent/60">
                  <span className="max-w-full truncate text-foreground">{taskName(one.title).text || one.title}</span>
                  <span className="text-meta text-muted-foreground">{[one.reschedules && `its day changed ${one.reschedules === 1 ? 'once' : `${num(one.reschedules)} times`}`, one.rollovers && `carried over ${plural(one.rollovers, 'day')}`].filter(Boolean).join(' · ')}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Section>
  )
}

type Captured = { waiting: number; old: number; sorted: number; waitedDays: number | null }
/** Captures left unsorted, and how long the sorted ones waited (main/stats-more.ts: from caught to leaving the Inbox). */
export function UnsortedSection(): React.JSX.Element | null {
  const stats = useLive(() => window.api.haligtree('stats:captures') as Promise<Captured>, null as Captured | null)
  useReading(!stats)
  if (!stats) return null
  return (
    <Section title="Left unsorted" big={{ value: num(stats.waiting), label: stats.waiting === 1 ? 'capture still in your Inbox' : 'captures still in your Inbox' }}>
      <p data-unsorted>
        <N>{num(stats.waiting)}</N> {stats.waiting === 1 ? 'capture is' : 'captures are'} still in your Inbox, <N>{num(stats.old)}</N> of them for over a week.{' '}
        {stats.sorted ? <>Of the <N>{num(stats.sorted)}</N> dealt with in the last 30 days, half left the Inbox within <N>{daysSaid(stats.waitedDays ?? 0)}</N> of being caught.</> : 'None was dealt with in the last 30 days.'}
      </p>
      <p className="text-meta text-(--mf-muted-strong)">Dealt with: made a gem, a page, a task or a question, resolved, or moved to the Bin. Archived ones are not counted as waiting.</p>
    </Section>
  )
}

type Remembering = { cards: number; heldDays: number | null; missed: { id: string; name: string; lapses: number }[] }
/** Cards forgotten most, and how long cards are held, from each card's own memory (its lapses and stability). */
export function ForgottenSection(): React.JSX.Element | null {
  const stats = useLive(() => window.api.haligtree('stats:remembering') as Promise<Remembering>, null as Remembering | null)
  useReading(!stats)
  if (!stats || !stats.cards) return null
  return (
    <Section title="Cards you keep forgetting" big={stats.heldDays !== null ? { value: daysSaid(stats.heldDays), label: 'half your cards are held for, or longer' } : undefined}>
      <p data-held>Of your <N>{plural(stats.cards, 'card')}</N> reviewed at least once, half are held for <N>{daysSaid(stats.heldDays ?? 0)}</N> or longer before the chance of remembering one falls to 9 in 10.</p>
      {stats.missed.length ? (
        <ul data-missed className="flex flex-col">
          {stats.missed.map((one) => (
            <li key={one.id}>
              <button type="button" onClick={() => (chime('open'), window.api.openInHome('nugget', one.id))} className="flex w-full cursor-pointer flex-col items-start rounded-md px-2 py-1.5 text-left transition-colors hover:bg-accent/60">
                <span className="max-w-full truncate text-foreground">{one.name}</span>
                <span className="text-meta text-muted-foreground">forgotten {num(one.lapses)} times after you had learnt it</span>
              </button>
            </li>
          ))}
        </ul>
      ) : <p>No card has been forgotten twice after you learnt it.</p>}
    </Section>
  )
}

type Untouched = { all: number; untouched: number; pages: { id: string; title: string; at: string }[] }
/** Pages started and never changed again after their first day, two weeks on. */
export function UntouchedSection(): React.JSX.Element | null {
  const stats = useLive(() => window.api.haligtree('stats:untouched') as Promise<Untouched>, null as Untouched | null)
  useReading(!stats)
  if (!stats || !stats.all) return null
  return (
    <Section title="Pages started, never touched again" big={{ value: `${num(stats.untouched)} of ${num(stats.all)}`, label: 'pages two weeks old or more' }}>
      <p data-untouched>Of your <N>{plural(stats.all, 'page')}</N> two weeks old or more, <N>{num(stats.untouched)}</N> {stats.untouched === 1 ? 'was' : 'were'} never changed after the day {stats.untouched === 1 ? 'it was' : 'they were'} started.</p>
      {stats.pages.length > 0 && (
        <ul className="flex flex-col">
          {stats.pages.map((one) => (
            <li key={one.id}>
              <button type="button" onClick={() => (chime('open'), window.api.openInHome('article', one.id))} className="flex w-full cursor-pointer rounded-md px-2 py-1.5 text-left transition-colors hover:bg-accent/60">
                <span className="max-w-full truncate text-foreground">{one.title || 'New page'}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Section>
  )
}

type GoalSteps = { id: string; title: string; day: string | null; weeks: number[] }[]
/** Each open goal's steps (its logs) in each of the last four weeks, and the weeks left to its day. */
export function GoalStepsSection(): React.JSX.Element | null {
  const goals = useLive(() => window.api.haligtree('stats:goals') as Promise<GoalSteps>, null as GoalSteps | null)
  useReading(!goals)
  if (!goals || !goals.length) return null
  const weeksLeft = (day: string | null): string => {
    if (!day) return 'no day set'
    const n = Math.ceil((Date.parse(`${day}T12:00`) - Date.now()) / (7 * 86_400_000))
    return n < 0 ? 'its day has passed' : n === 0 ? 'its day is this week' : `${plural(n, 'week')} to its day`
  }
  return (
    <Section title="Steps toward your goals">
      <p data-goal-rule className="text-meta text-(--mf-muted-strong)">A step is a log written on a goal. A goal does not say how many steps it needs, so each is set beside the weeks left to its day, not against a number made up for it.</p>
      <ul data-goal-steps className="flex flex-col gap-1">
        {goals.slice(0, 8).map((one) => (
          <li key={one.id}>
            <button type="button" onClick={() => (chime('open'), window.api.openInHome('goal', one.id))} className="flex w-full cursor-pointer flex-col items-start rounded-md px-2 py-1.5 text-left transition-colors hover:bg-accent/60">
              <span className="max-w-full truncate text-foreground">{one.title}</span>
              <span className="text-meta text-muted-foreground">{`${one.weeks.map((n) => num(n)).join(', ')} steps in each of the last four weeks, oldest first · ${weeksLeft(one.day)}`}</span>
            </button>
          </li>
        ))}
      </ul>
    </Section>
  )
}
