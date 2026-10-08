import { chime } from './sound'
import { taskSaid, vigil, type Made, type Task } from './vigil'
import { flying } from './capture-links'
import { ask, refuse, toast } from '@/components/vigil/ui'
import { bucketOf, monthKey } from '../../../main/task-words'
import { dayjs, num } from '../../../main/dates'

/**
 * Everything that becomes a task: words typed, a capture, several captures,
 * a nugget to study, a line picked out of a note.
 */
export type TaskSource =
  | { text: string; today?: boolean; origin?: string }
  | { capture: string }
  | { captures: string[]; text: string }
  | { item: string; text: string }

/**
 * The one way anything is made a task: the same sound, the same words when
 * it joined one already there, and the same undo, from every place that
 * offers it. `said` is what the notice says, worked out from the new task
 * when it depends on where it landed. Gives back what was made, or null.
 */
export async function makeTask(
  from: TaskSource,
  said: string | ((made: Made) => string | Promise<string>) = 'Now a task',
  { onUndo }: { onUndo?: () => void } = {}
): Promise<Made | null> {
  const [got, links] =
    'capture' in from ? [await flying(from.capture, 'task', () => vigil.toTask(from.capture)), [from.capture]]
    : 'captures' in from ? [await vigil.taskFrom(from.captures, from.text), from.captures]
    : 'item' in from ? [await vigil.study(from.item, from.text), [from.item]]
    : [await vigil.addTask(from.text, from.origin, from.today), from.origin ? [from.origin] : []]
  // A capture that already took an exit (promoted, resolved, let go) keeps it.
  if (got === 'not-open' || (!got && 'captures' in from)) {
    refuse(got === 'not-open' ? 'Only a capture still in the inbox can become a task' : 'None of those is still in the inbox, so there is nothing to make a task from')
    return null
  }
  const made = got
  if (!made) return null
  // Only what this took out of the inbox goes back there on undo.
  const reopen = made.resolved ?? []
  chime(made.existed ? 'nope' : 'noted')
  const words = typeof said === 'function' ? await said(made) : said
  toast(taskSaid(made, words), () => void vigil.unmakeTask(made.id, made.existed, links, reopen).then(() => onUndo?.()), 'success', { label: 'Open', key: 'O', run: () => window.api.openInHome('task', made.id) })
  return made
}

/**
 * Several captures made one task: its name asked, offered the first one's
 * title to start from. Each capture is linked from it and leaves the inbox.
 */
export async function oneTask(ids: string[], first = ''): Promise<Made | null> {
  const text = await ask(`One task from these ${num(ids.length)}. What is it?`, 'e.g. sort out the freight rules by Thursday', undefined, first)
  if (!text) return null
  return makeTask({ captures: ids, text }, `One task, from ${num(ids.length)} captures`)
}

/**
 * The captures selected in the list on screen now, for ⌘K's "Make one task":
 * the palette asks with `vigil:one-task`, and the list with them answers.
 */
export const picked = { ids: [] as string[] }

/**
 * The day a task shows on: when it is scheduled, or the day it is due by if
 * that is sooner, so a deadline never hides behind a later plan.
 */
export function placed(task: Pick<Task, 'dueAt' | 'deadline'>): number | null {
  const days = [task.dueAt, task.deadline].filter((one): one is string => !!one).map((one) => new Date(one).getTime())
  return days.length ? Math.min(...days) : null
}

/**
 * Which later list a task is in: This month, This year, Next year, Someday, or none once
 * it is scheduled. One with a due-by date shows on that day as well, so a
 * deadline never hides in Someday.
 */
export const bucket = (task: Pick<Task, 'planFor' | 'dueAt'>): ReturnType<typeof bucketOf> => (task.dueAt ? null : bucketOf(task.planFor))

/** The later lists, by what each is called. */
export const BUCKETS = { month: 'This month', year: 'This year', next: 'Next year', someday: 'Someday' } as const

/** A month or a year key for now, for putting a task in a later list. */
export function planKey(which: keyof typeof BUCKETS): string {
  const now = dayjs()
  return which === 'someday' ? 'someday' : which === 'year' ? String(now.year()) : which === 'next' ? String(now.year() + 1) : monthKey(now.toDate())
}
