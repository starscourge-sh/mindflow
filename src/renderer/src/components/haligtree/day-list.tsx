import { type Task } from '@/lib/haligtree'
import { yourOrder, placed } from '@/lib/tasks'
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

/**
 * Today's three, kept for the day: the first three in Today's order the first time the day is looked at, and the same
 * three after. One ticked off stays one of them (its number with it); nothing moves up to take its place, so the three
 * can be finished (the user, 24 Nov: "they are just replaced by new top three, which makes the list endless"). One moved
 * off today (to tomorrow, on hold) gives its place to the next; your own reordering picks them afresh (`pickThreeAgain`).
 */
export const dayThree = (tasks: Task[]): string[] =>
  keptThree(tasks.filter((task) => task.status === 'open' && !task.waitingOn && !task.heldAt && (placed(task) ?? Infinity) < startOfDay(1)).sort(dayOrder).map((task) => task.id), tasks)

const threeKey = (): string => `three:${dayKey()}`
/** The day's three, from the open tasks for today in order (`open`) and every task (to know which were ticked today). */
export function keptThree(open: string[], tasks: Task[]): string[] {
  let saved: string[] = []
  try {
    saved = JSON.parse(localStorage.getItem(threeKey()) ?? '[]')
  } catch {
    // Unreadable: picked afresh.
  }
  const byId = new Map(tasks.map((task) => [task.id, task]))
  const kept = saved.filter((id) => {
    const task = byId.get(id)
    if (!task) return false
    if (task.status === 'done') return !!task.completedAt && dayKey(task.completedAt) === dayKey()
    return open.includes(id)
  })
  for (const id of open) if (kept.length < 3 && !kept.includes(id)) kept.push(id)
  if (kept.join() !== saved.join()) try { localStorage.setItem(threeKey(), JSON.stringify(kept)) } catch { /* kept for this look only */ }
  return kept
}
/** Your own reordering of today's list chooses the three again, from the top. */
export const pickThreeAgain = (): void => { try { localStorage.removeItem(threeKey()) } catch { /* nothing kept */ } }

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
