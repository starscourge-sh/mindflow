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
