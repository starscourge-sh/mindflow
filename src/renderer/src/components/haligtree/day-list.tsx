import { type Task } from '@/lib/haligtree'
import { yourOrder, dueToday, placed } from '@/lib/tasks'
import { dayKey, startOfDay } from '../../../../main/dates'

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

/**
 * The day's three, the way Arc keeps pinned tabs while the day's tabs come and
 * go: the first three of today's tasks in your order, numbered 1 2 3. Until one
 * of them is ticked they follow the list; once one is ticked they are kept for
 * the day, here.
 */
const THREE = (day: string): string => `day-list:three:${day}`
const readKept = (day: string): string[] | null => {
  try {
    const ids = JSON.parse(localStorage.getItem(THREE(day)) ?? 'null')
    return Array.isArray(ids) ? ids : null
  } catch {
    return null
  }
}
/** Kept for the day once one of the three is ticked. */
export const keepThree = (day: string, ids: string[]): void => {
  try {
    localStorage.setItem(THREE(day), JSON.stringify(ids))
  } catch {
    // They go on following the list until kept.
  }
}
/** Today's three, kept or still following the list: read by Today's list and quick capture's Today, which mark them the same way. */
export const dayThree = (tasks: Task[], day = dayKey()): string[] =>
  readKept(day) ?? tasks.filter(inNow).sort(yourOrder).slice(0, 3).map((task) => task.id)

/** A task's number among the day's three, quiet in the margin; green once it is done. */
export function ThreeMark({ n, done = false, className = '' }: { n: number; done?: boolean; className?: string }): React.JSX.Element {
  return (
    <span data-three={n} aria-label={`One of today's three, number ${n}`} className={`text-control font-semibold tabular-nums ${className}`}
      style={{ color: done ? 'var(--tt-color-text-green)' : 'var(--foreground)' }}>{n}</span>
  )
}
