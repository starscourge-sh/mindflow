import { chime } from './sound'
import { crumple } from './fly-home'
import { taskSaid, vigil, type Made, type Task } from './vigil'
import { flying } from './capture-links'
import { ask, refuse, toast } from '@/components/vigil/ui'
import { bucketOf, monthKey } from '../../../main/task-words'
import { dayjs, num } from '../../../main/dates'
import { tasksSaid, type ListTask } from '../../../main/day-lines'

/**
 * Everything that becomes a task: words typed, a capture, several captures,
 * a nugget to study, a line picked out of a note.
 */
export type TaskSource =
  | { text: string; today?: boolean; origin?: string }
  | { capture: string; /** Words in its first line kept as plain text, not read as a date or a priority. */ plain?: { from: number; to: number; text: string }[] }
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
  { onUndo, quiet = false }: { onUndo?: () => void; /** Made without a word: something else on screen already shows it. */ quiet?: boolean } = {}
): Promise<Made | null> {
  const [got, links] =
    'capture' in from ? [await flying(from.capture, 'task', () => vigil.toTask(from.capture, from.plain)), [from.capture]]
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
  if (quiet) return made
  chime(made.existed ? 'nope' : 'noted')
  const words = typeof said === 'function' ? await said(made) : said
  toast(taskSaid(made, words), () => void vigil.unmakeTask(made.id, made.existed, links, reopen).then(() => onUndo?.()), 'success', { label: 'Open', key: 'O', run: () => window.api.openInHome('task', made.id) })
  return made
}

/**
 * A written list made tasks: each top line a task, the lines indented under
 * it its steps, a ticked line done, a #tag in a line that line's own. A line
 * named like an open task joins it rather than making it twice. One notice
 * for the lot, and its Undo takes every one back. Gives back what was made.
 */
export async function makeListTasks(list: ListTask[], { today = false, onUndo }: { today?: boolean; onUndo?: () => void } = {}): Promise<Made[]> {
  const made: Made[] = []
  for (const line of list) {
    const one = await vigil.addTask(line.text, undefined, today)
    made.push(one)
    if (one.existed) continue
    if (line.steps.length) await vigil.saveTask(one.id, { subtasks: line.steps })
    if (line.done) await vigil.saveTask(one.id, { status: 'done' })
  }
  const joined = made.filter((one) => one.existed).length
  chime(made.length === 1 ? 'noted' : 'promote')
  toast(`Made ${tasksSaid(list)}${joined ? `. ${num(joined)} ${joined === 1 ? 'was already on your list, so it joined that task' : 'were already on your list, so they joined those tasks'}` : ''}`,
    () => void Promise.all(made.map((one) => vigil.unmakeTask(one.id, one.existed, [], []))).then(() => onUndo?.()),
    'success', made.length === 1 ? { label: 'Open', key: 'O', run: () => window.api.openInHome('task', made[0].id) } : undefined)
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

/** A note picked in a list, for "Make tasks": a capture, or a gem or piece of writing. */
export type TaskNote = { id: string; title: string; private?: boolean } & ({ capture: true; open: boolean } | { capture?: false })

/**
 * Several picked notes, a task each, made the way one is ("Make it a task" on
 * a capture, "Study this" on a gem) and linked to its note the same way. A
 * note that is a task already, or a capture already out of the inbox, is left
 * as it is and the notice says so. One undo takes back every task this made.
 * Gives back how many were made.
 */
export async function makeTasks(notes: TaskNote[]): Promise<number> {
  if (!notes.length) return 0
  // A task already open for a note, made from it before: that note is skipped.
  const tasked = new Set((await vigil.tasks()).filter((task) => task.status === 'open' && task.fromId).map((task) => task.fromId!))
  const already = notes.filter((note) => tasked.has(note.id))
  const closed = notes.filter((note) => !tasked.has(note.id) && note.capture && !note.open)
  const todo = notes.filter((note) => !already.includes(note) && !closed.includes(note))
  // Why some were left: "Skipped 2, already tasks", or both reasons counted.
  const reason = (n: number, why: 'task' | 'out'): string => (why === 'task' ? `already ${n === 1 ? 'a task' : 'tasks'}` : 'out of the inbox')
  const left = already.length + closed.length
  const skipped = !left ? '' : already.length && closed.length
    ? `Skipped ${num(left)}: ${num(already.length)} ${reason(already.length, 'task')}, ${num(closed.length)} ${reason(closed.length, 'out')}`
    : `Skipped ${num(left)}, ${reason(left, already.length ? 'task' : 'out')}`
  if (!todo.length) {
    refuse(notes.length === 1 ? (already.length ? 'That one is a task already' : 'Only a capture still in the inbox can become a task')
      : already.length && closed.length ? `Nothing to make. ${skipped}` : `Nothing to make: all ${num(left)} are ${already.length ? 'tasks already' : 'out of the inbox'}`)
    return 0
  }
  // The first few fly to Today, as one does on its own; a long run just lands.
  const made = (await Promise.all(todo.map(async (note, at) => {
    const work = (): Promise<Made | null | 'not-open'> => (note.capture ? vigil.toTask(note.id) : vigil.study(note.id, `Study “${note.title}”`, { from: 7, to: 7 + note.title.length }))
    const got = note.capture && at < 6 ? await flying(note.id, 'task', work) : await work()
    return got && got !== 'not-open' ? { made: got, note: note.id } : null
  }))).filter((one): one is { made: Made; note: string } => !!one)
  if (!made.length) {
    refuse('None of those could become a task')
    return 0
  }
  // Only counts in the notice, never a note's words, so a private one stays private.
  const joined = made.filter((one) => one.made.existed).length
  const lead = made.length === 1 ? taskSaid(made[0].made, 'Now a task')
    : `${num(made.length)} tasks made${joined ? ` (${num(joined)} joined ${joined === 1 ? 'one' : 'ones'} with the same name)` : ''}`
  // Bigger runs sound bigger: two knocks for one, the ringing "kept" for many.
  chime(made.length === 1 ? 'noted' : 'promote')
  toast(skipped ? `${lead}. ${skipped}` : lead,
    () => void Promise.all(made.map(({ made, note }) => vigil.unmakeTask(made.id, made.existed, [note], made.resolved ?? []))),
    'success',
    made.length === 1 ? { label: 'Open', key: 'O', run: () => window.api.openInHome('task', made[0].made.id) } : undefined)
  return made.length
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

/**
 * Closed without doing: its row crumples and is tossed away, and it can be
 * taken back. One way for every list and page, so it always reads the same.
 */
export function closeTask(id: string, then?: () => void): void {
  const land = crumple(id)
  void vigil.saveTask(id, { status: 'dropped' }).then(() => {
    land?.()
    then?.()
    chime('away')
    toast('Closed', () => void vigil.saveTask(id, { status: 'open' }))
  })
}

/**
 * Today counted one way everywhere: the sidebar, the Today list, the sticky
 * and today's page all lead with what is left to do, and say what is done
 * beside it.
 */
export function todaySaid(left: number, done: number): string {
  if (!left) return done ? 'All done' : 'Nothing to do'
  return done ? `${num(left)} to do · ${num(done)} done` : `${num(left)} to do`
}
