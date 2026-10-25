import { useLive, haligtree, type Task } from '@/lib/haligtree'
import { taskName } from '@/lib/tasks'
import { chime } from '@/lib/sound'
import { dayjs, dayKey } from '../../../../main/dates'
import { RepeatMark, TaskWhen, completeTask } from './tasks-view'
import { Tags } from './ui'

/** The day a task is meant for, or due by: the one it shows under. */
const dayFor = (task: Task): string | null => (task.dueAt ? dayKey(task.dueAt) : task.deadline ? dayKey(task.deadline) : null)

/**
 * The week's tasks, under the week's writing: what is open with a day in the
 * week, a heading a day, each ticked where it is or opened by its name. The
 * Week page's other half, as today's tasks are the Day page's.
 */
export function WeekTasks({ monday, onOpen }: { monday: string; onOpen?: (type: string, id: string) => void }): React.JSX.Element {
  const tasks = useLive(haligtree.tasks, [] as Task[])
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
              <li key={task.id} data-week-task={task.id} className="flex items-start gap-3 py-2">
                <button type="button" aria-label={`Done: ${taskName(task.title).text}`} onClick={() => void completeTask(task)}
                  className="mt-0.5 size-[1.125rem] shrink-0 rounded-full border-[1.5px] border-muted-foreground/60 transition-colors hover:border-foreground hover:bg-foreground/10" />
                <button type="button" onClick={() => onOpen?.('task', task.id)} className="min-w-0 flex-1 text-left">
                  <span className="private-text flex items-center gap-1.5 text-[0.9375rem] text-foreground">{taskName(task.title).text}<Tags tags={taskName(task.title).tags} /></span>
                  <span className="mt-0.5 flex flex-wrap items-center gap-x-3 text-xs text-muted-foreground"><TaskWhen task={task} /><RepeatMark task={task} /></span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  )
}
