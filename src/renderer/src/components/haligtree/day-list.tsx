import { type Task } from '@/lib/haligtree'
import { yourOrder, dueToday, placed } from '@/lib/tasks'
import { dayKey, startOfDay } from '../../../../main/dates'
import { Tip } from './ui'

/**
 * Write out your day: Today's list itself is written in (tasks-view.tsx, the
 * written line). What is left here is shared with the other places Today shows:
 * the ask to start writing, and the day's three.
 */

/** Asked from ⌘K, a hint or the Powers page: Today's list with the caret on a new line at its end. Kept until Today is there to take it. */
let pending = false
export function writeOutDay(): void {
  pending = true
  window.dispatchEvent(new CustomEvent('haligtree:write-day'))
}
/** Today takes the ask once it is drawn: true when one was waiting. */
export const takeWriteDay = (): boolean => (pending ? ((pending = false), true) : false)

/** Whether a task is on today's list: open and for today, or ticked today. */
const inNow = (task: Task): boolean => {
  const day = placed(task)
  if (task.status === 'open') return !task.waitingOn && (dueToday(task) || (day !== null && day >= startOfDay() && day < startOfDay(1)))
  return task.status === 'done' && !!task.completedAt && dayKey(task.completedAt) === dayKey() && (day ?? 0) < startOfDay(1)
}

/** Today's three: the first three of today's tasks in your order, numbered 1 2 3 in quick capture's Today as in Today's list. */
export const dayThree = (tasks: Task[]): string[] =>
  tasks.filter(inNow).sort(yourOrder).slice(0, 3).map((task) => task.id)

/** A task's number among the day's three, quiet in the margin; green once it is done. */
export function ThreeMark({ n, done = false, className = '' }: { n: number; done?: boolean; className?: string }): React.JSX.Element {
  return (
    // Said on pointing, as a bare number beside a title read as nothing (the user, 23 Nov: "what is the 1").
    <Tip label={`${['First', 'Second', 'Third'][n - 1] ?? `Number ${n}`} of today's three`}>
      <span data-three={n} role="img" aria-label={`One of today's three, number ${n}`} className={`cursor-default text-control font-semibold tabular-nums ${className}`}
        style={{ color: done ? 'var(--tt-color-text-green)' : 'var(--foreground)' }}>{n}</span>
    </Tip>
  )
}
