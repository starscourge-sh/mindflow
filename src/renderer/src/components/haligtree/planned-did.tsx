import { useLive, haligtree, type SpanSession, type Task } from '@/lib/haligtree'
import { taskName } from '@/lib/tasks'
import { dayjs, dayKey, num } from '../../../../main/dates'

/**
 * Planned against what really happened: a task's length (its estimate)
 * beside the focus time its sessions took. Over in orange, under in green,
 * both from the theme. Shown on the Calendar's blocks and header, and in the
 * week's review as the biggest gaps.
 */

/** "45m", "2h", "1h 30m": short, for a block. */
export const shortSaid = (minutes: number): string => {
  const m = Math.max(0, Math.round(minutes))
  const [h, rest] = [Math.floor(m / 60), m % 60]
  return !h ? `${rest}m` : rest ? `${h}h ${rest}m` : `${h}h`
}
const OVER = 'var(--tt-color-text-orange)'
const UNDER = 'var(--tt-color-text-green)'
/** Past its length by more than a few minutes is over; anything else is under. */
export const overBy = (planned: number, did: number): boolean => did > planned + 5

const minutesOf = (one: SpanSession, now = Date.now()): number =>
  Math.max(0, ((one.endedAt ? Date.parse(one.endedAt) : one.pausedAt ? Date.parse(one.pausedAt) : now) - Date.parse(one.startedAt) - (one.pausedMs || 0)) / 60_000)

/** Focus minutes per task, from the sessions that started between two days (YYYY-MM-DD, both counted). */
export function useFocusOn(from: string, to: string): Map<string, number> {
  const sessions = useLive(() => haligtree.sessionsSpan(dayjs(from).startOf('day').toISOString(), dayjs(to).endOf('day').toISOString()), [] as SpanSession[], [from, to])
  const by = new Map<string, number>()
  for (const one of sessions) by.set(one.taskId, (by.get(one.taskId) ?? 0) + minutesOf(one))
  return by
}

type Gap = { task: Task; planned: number; did: number }
/** Every task with a length planned between two days, with the focus it took, and the totals. */
export function plannedVsDid(tasks: Task[], focus: Map<string, number>, from: string, to: string): { planned: number; did: number; rows: Gap[] } {
  const rows = tasks
    .filter((task) => task.status !== 'dropped' && !!task.estimate && !!task.dueAt && dayKey(task.dueAt) >= from && dayKey(task.dueAt) <= to)
    .map((task) => ({ task, planned: task.estimate!, did: Math.round(focus.get(task.id) ?? 0) }))
  return { planned: rows.reduce((sum, row) => sum + row.planned, 0), did: rows.reduce((sum, row) => sum + row.did, 0), rows }
}

/** "planned 2h · did 3h", the did part coloured by how it went. */
export function PlanDid({ planned, did, className = '' }: { planned: number; did: number; className?: string }): React.JSX.Element {
  return (
    <span data-plan-did data-over={overBy(planned, did) || undefined} className={`tabular-nums ${className}`}>
      planned {shortSaid(planned)} · <span className="font-semibold" style={{ color: overBy(planned, did) ? OVER : UNDER }}>did {shortSaid(did)}</span>
    </span>
  )
}

/** The header's small total: "Planned 14h · did 11h this week". Nothing when nothing had a length. */
export function PlannedTotal({ tasks, from, to, span }: { tasks: Task[]; from: string; to: string; span: string }): React.JSX.Element | null {
  const focus = useFocusOn(from, to)
  const { planned, did } = plannedVsDid(tasks, focus, from, to)
  if (!planned) return null
  return (
    <span data-plan-total className="shrink-0 px-2 text-body text-foreground tabular-nums">
      Planned {shortSaid(planned)} · <span className="font-semibold" style={{ color: overBy(planned, did) ? OVER : UNDER }}>did {shortSaid(did)}</span> {span}
    </span>
  )
}

/**
 * The week's review: planned against did, the biggest gaps first. With no
 * length on any task, a line on how to get one.
 */
export function PlannedVsDid({ monday, heading = 'text-body font-semibold text-foreground' }: { monday: string; heading?: string }): React.JSX.Element | null {
  const tasks = useLive(haligtree.tasks, [] as Task[])
  const sunday = dayKey(dayjs(monday).add(6, 'day'))
  const focus = useFocusOn(monday, sunday)
  const { planned, did, rows } = plannedVsDid(tasks, focus, monday, sunday)
  const gaps = rows.filter((row) => row.did !== row.planned).sort((a, b) => Math.abs(b.did - b.planned) - Math.abs(a.did - a.planned)).slice(0, 5)
  return (
    <section data-planned-vs-did>
      <h3 className={heading}>Planned vs did</h3>
      {!rows.length ? (
        <p className="mt-1 text-body text-foreground/85">No task this week had a length. Give one a length (type ~1h) and focus on it to see how the plan held.</p>
      ) : (
        <>
          <p className="mt-1 text-body text-foreground">
            <PlanDid planned={planned} did={did} className="font-medium" /> over {num(rows.length)} {rows.length === 1 ? 'task' : 'tasks'} with a length.
          </p>
          {gaps.length > 0 && (
            <ul className="mt-1.5 flex flex-col gap-1">
              {gaps.map(({ task, planned: plan, did: done }) => (
                <li key={task.id} data-gap={task.id} className="flex items-baseline gap-3 text-body">
                  <span className="min-w-0 flex-1 truncate text-foreground">{taskName(task.title).text}</span>
                  <PlanDid planned={plan} did={done} className="shrink-0 text-control text-foreground/85" />
                  <span className="w-16 shrink-0 text-right font-semibold tabular-nums" style={{ color: overBy(plan, done) ? OVER : UNDER }}>{done > plan ? '+' : '−'}{shortSaid(Math.abs(done - plan))}</span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  )
}
