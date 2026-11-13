import { useLive, haligtree, type Task } from '@/lib/haligtree'
import { taskName } from '@/lib/tasks'
import { chime } from '@/lib/sound'
import { dayjs, dayKey } from '../../../../main/dates'
import { RepeatMark, TaskWhen, useTickOff } from './tasks-view'
import { Check } from '@/components/ui/icons'
import { Tags } from './ui'
import { MeetingItems } from './meeting-items'
import { DOT_IN_MARGIN, SessionDot, TaskSpent, useTaskTime } from './task-time'

/** The day a task is meant for, or due by: the one it shows under. */
const dayFor = (task: Task): string | null => (task.dueAt ? dayKey(task.dueAt) : task.deadline ? dayKey(task.deadline) : null)

/**
 * The week's tasks, under the week's writing: what is open with a day in the
 * week, a heading a day, each ticked where it is or opened by its name. The
 * Week page's other half, as today's tasks are the Day page's.
 */
export function WeekTasks({ monday, onOpen }: { monday: string; onOpen?: (type: string, id: string) => void }): React.JSX.Element {
  const tasks = useLive(haligtree.tasks, [] as Task[])
  // The time on the week's tasks and the session running on one (task-time.tsx).
  const time = useTaskTime()
  // Ticked here as anywhere else a task is ticked (Tasks, Today's panel): the sound, the tick and the line through it at
  // once, then it is done and goes. It used to go the moment it was pressed, as if it had vanished (the user, 13 Nov:
  // "how come ticking an item here just disappears it?").
  const { ticking, tickOff } = useTickOff(260)
  const days = Array.from({ length: 7 }, (_, at) => dayjs(monday).add(at, 'day').format('YYYY-MM-DD'))
  const open = tasks.filter((task) => task.status === 'open' && days.includes(dayFor(task) ?? ''))
  const byDay = days.map((day) => [day, open.filter((task) => dayFor(task) === day)] as const).filter(([, list]) => list.length)
  return (
    <section data-week-tasks className="mt-8">
      <h2 className="mb-1 text-body font-semibold text-foreground">This week’s tasks</h2>
      {!byDay.length && (
        <p className="text-body text-muted-foreground">
          Nothing planned for this week yet.{' '}
          <button type="button" onClick={() => (chime('open'), onOpen?.('view', 'upcoming'))} className="text-foreground underline decoration-foreground/25 underline-offset-4 hover:decoration-foreground/60">Plan it in Tasks</button>
        </p>
      )}
      {byDay.map(([day, list]) => (
        <div key={day} className="mt-3">
          <p className="text-meta font-medium text-muted-foreground">{dayjs(day).format('dddd D MMMM')}</p>
          <ul className="divide-y divide-border/50">
            {list.map((task) => (
              <li key={task.id} data-week-task={task.id} className="relative flex items-start gap-3 py-2">
                <SessionDot id={task.id} time={time} className={`${DOT_IN_MARGIN} top-2 h-[1.375rem]`} />
                <button type="button" data-task-tick aria-label={`Done: ${taskName(task.title).text}`} onClick={() => tickOff(task)}
                  className="group/tick mt-0.5 flex size-[1.125rem] shrink-0 items-center justify-center rounded-full border-[1.5px] border-muted-foreground/60 transition-colors hover:border-foreground hover:bg-foreground/10"
                  style={ticking(task.id) ? { background: 'var(--tt-color-text-green)', borderColor: 'var(--tt-color-text-green)' } : undefined}>
                  <Check className={`size-2.5 transition-opacity ${ticking(task.id) ? 'opacity-100' : 'opacity-0 group-hover/tick:opacity-60'}`} />
                </button>
                <button type="button" onClick={() => onOpen?.('task', task.id)} className="min-w-0 flex-1 text-left">
                  <span className="private-text flex items-center gap-1.5 text-[0.9375rem] text-foreground"><span data-task-title className={ticking(task.id) ? 'mf-strike' : undefined}>{taskName(task.title).text}</span><Tags tags={taskName(task.title).tags} /></span>
                  <span data-task-meta className="mt-0.5 flex flex-wrap items-center gap-x-3 text-xs text-muted-foreground"><TaskWhen task={task} /><RepeatMark task={task} /><TaskSpent task={task} time={time} /></span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}
      {/* The week's meetings' action items still open. */}
      <MeetingItems since={dayjs(monday).startOf('day').toISOString()} onOpen={(type, id) => onOpen?.(type, id)} className="mt-6" />
    </section>
  )
}
