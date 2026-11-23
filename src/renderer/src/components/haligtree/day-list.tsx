import { type Task } from '@/lib/haligtree'
import { yourOrder, placed } from '@/lib/tasks'
import { startOfDay } from '../../../../main/dates'
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

/** Today's three: the first three of today's tasks in your order, numbered 1 2 3 in quick capture's Today as in Today's list. */
export const dayThree = (tasks: Task[]): string[] =>
  // The same three as Today's page (tasks-view.tsx \`three\`): open, not waiting or on hold, for today or late.
  tasks.filter((task) => task.status === 'open' && !task.waitingOn && !task.heldAt && (placed(task) ?? Infinity) < startOfDay(1)).sort(dayOrder).slice(0, 3).map((task) => task.id)

/** Today's order, as Today's page lists it: what is late first, then the rest, each in your own order. */
export const dayOrder = (a: Task, b: Task): number => Number(!late(a)) - Number(!late(b)) || yourOrder(a, b)
const late = (task: Task): boolean => { const day = placed(task); return day !== null && day < startOfDay() }

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
