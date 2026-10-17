import { toast } from '@/components/vigil/ui'
import { chime } from './sound'
import { makeTask } from './tasks'
import { vigil, whenInLine, type Task } from './vigil'
import { dayjs, dayKey } from '../../../main/dates'

/** A task or note hidden until a later day, and that day. */
export type Back = Awaited<ReturnType<typeof vigil.snoozedBack>>[number]
/** What a day holds: planned for it, due by it, getting ready from it, and coming back on it. */
export type OnDay = { planned: Task[]; due: Task[]; ready: Task[]; back: Back[] }

const empty = (): OnDay => ({ planned: [], due: [], ready: [], back: [] })

/**
 * Every open task and returning note by the day it falls on: planned on its
 * date, due on its due-by day (once, when that is the same day it is planned
 * for), getting ready on its due-by day less the lead, back on its snooze day.
 */
export function byDay(tasks: Task[], back: Back[]): Map<string, OnDay> {
  const days = new Map<string, OnDay>()
  const at = (day: string): OnDay => days.get(day) ?? (days.set(day, empty()), days.get(day)!)
  for (const task of tasks) {
    if (task.status !== 'open') continue
    const planned = task.dueAt ? dayKey(task.dueAt) : null
    if (planned) at(planned).planned.push(task)
    if (task.deadline && dayKey(task.deadline) !== planned) at(dayKey(task.deadline)).due.push(task)
    if (task.deadline && task.getReady) at(dayKey(dayjs(task.deadline).subtract(task.getReady, 'day'))).ready.push(task)
  }
  for (const one of back) at(one.day).back.push(one)
  return days
}

/** A planned task moved to another day at the time it had (nine with none), said with an Undo. */
export function moveToDay(task: Pick<Task, 'id' | 'dueAt' | 'allDay' | 'planFor' | 'deadline'>, day: string, which: 'planned' | 'due' = 'planned'): void {
  const from = which === 'due' ? task.deadline : task.dueAt
  if (from && dayKey(from) === day) return chime('stay')
  const time = from ? dayjs(from) : dayjs().hour(9).minute(0)
  const to = dayjs(day).hour(time.hour()).minute(time.minute()).startOf('minute').toISOString()
  if (which === 'due') {
    const was = task.deadline
    void vigil.saveTask(task.id, { deadline: to }).then(() => (chime('tap'), toast(`Due by ${whenInLine(to)}`, () => void vigil.saveTask(task.id, { deadline: was }))))
    return
  }
  const was = { due: task.dueAt, plan: task.planFor }
  void vigil.saveTask(task.id, { due: to }).then((before) => {
    chime('tap')
    toast(`Moved to ${whenInLine(to, !task.dueAt || !!task.allDay)}`, () => void vigil.saveTask(task.id, { ...was, ...(before === true ? {} : before) }))
  })
}

/** A new task for a day: made from the words, then given that day, with one Undo for both. */
export async function addForDay(text: string, day: string): Promise<boolean> {
  if (!text.trim()) return false
  const made = await makeTask({ text: text.trim() }, 'Added', { quiet: true })
  if (!made) return false
  const task = (await vigil.tasks()).find((one) => one.id === made.id)
  // Words that named a day of their own ("call mum friday") keep it; otherwise it is for this day.
  if (!task?.dueAt) await vigil.saveTask(made.id, { due: dayjs(day).hour(9).minute(0).startOf('minute').toISOString() })
  chime('noted')
  toast(`Added for ${whenInLine(task?.dueAt ?? dayjs(day).hour(9).toISOString())}`, () => void vigil.unmakeTask(made.id, made.existed, [], []))
  return true
}

/** Where a task sits on the calendar: its day and time, whether it has a time, and how long it takes. */
export type Placed = { due: string | null; allDay: number; estimate: number | null }

/**
 * A task put somewhere on the calendar: a time and a length on the hour
 * grid, or a day with no time on the all-day line. Said with an Undo, which
 * ⌘Z also reaches, putting back exactly where it was.
 */
export function placeTask(task: Pick<Task, 'id' | 'dueAt' | 'allDay' | 'estimate' | 'planFor'>, to: Placed, said: string): void {
  const was = { due: task.dueAt, allDay: task.allDay, estimate: task.estimate, plan: task.planFor }
  if (was.due === to.due && was.allDay === to.allDay && was.estimate === to.estimate) return chime('stay')
  void vigil.saveTask(task.id, to).then((before) => {
    chime('tap')
    toast(said, () => void vigil.saveTask(task.id, { ...was, ...(before === true ? {} : before) }).then(() => chime('undo')))
  })
}

/** A new task written into a slot: at that time and for that long, or on that day with no time. */
export async function addAt(text: string, day: string, slot: { minute: number; length: number } | null): Promise<boolean> {
  if (!text.trim()) return false
  const made = await makeTask({ text: text.trim() }, 'Added', { quiet: true })
  if (!made) return false
  const task = (await vigil.tasks()).find((one) => one.id === made.id)
  const at = slot ? dayjs(day).startOf('day').add(slot.minute, 'minute') : dayjs(day).hour(9).minute(0).startOf('minute')
  // Words that named a day of their own ("call mum friday") keep it, unless a time slot was picked.
  const own = !!task?.dueAt && !slot
  if (!own) await vigil.saveTask(made.id, slot ? { due: at.toISOString(), allDay: 0, estimate: slot.length } : { due: at.toISOString(), allDay: 1 })
  chime('noted')
  toast(`Added for ${whenInLine(own ? task!.dueAt! : at.toISOString(), !slot)}`, () => void vigil.unmakeTask(made.id, made.existed, [], []))
  return true
}
