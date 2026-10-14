import { useState } from 'react'
import { CircleCheck } from 'lucide-react'
import { alive } from '@/components/ui/alive-icon'
import SimpleCheckedIcon from '@/components/ui/simple-checked-icon'
import CheckedIcon from '@/components/ui/checked-icon'
import { CAPTURE_TYPES } from '../capture-kinds/capture-kind-picker'
import type { CaptureMeta } from '../capture-list'
import { vigil, when, whenInLine, type Task } from '@/lib/vigil'
import { BUCKETS, bucket, placed, taskName } from '@/lib/tasks'
import { chime } from '@/lib/sound'
import { num, startOfDay } from '../../../../main/dates'
import { PriorityMark } from './task-input'
import { LengthChip, completeTask, notDone, taskMenu, type TaskNow } from './tasks-view'
import { Chips, type Choice } from './display'
import type { Entry } from './note-list'
import type { RowItem } from './row-menu'
import { Tip, toast } from './ui'

const Check = alive(SimpleCheckedIcon)

/**
 * Everything (the page at G L): every capture and every task in one list, a
 * filter over it to choose what shows. A task rides in the captures' list as
 * a row of its own kind, `task`, so the kind chips, the tag and date filters,
 * the sorts and the groups all take it as they take a note.
 */
export type Row = CaptureMeta & { task?: Task }

/** The kind a task goes by in the chips and the Display menu: first, before the kinds of note. */
export const TASK_KIND: Choice = { id: 'task', label: 'Task', icon: alive(CheckedIcon), tint: 'var(--tt-color-text-green)' }

/** A task as a row of the list: its words, when it was made, and done or not. */
export const taskRow = (task: Task): Row => ({
  id: task.id, number: task.number, title: task.title, label: task.title, kind: 'task',
  status: task.status, source: '', private: 0, pinnedAt: null, remindAt: null,
  capturedAt: task.createdAt, editedAt: task.completedAt, attribution: null, device: null, elapsedMs: null,
  weather: null, medium: null, closedAt: task.completedAt, archivedAt: null, importedAt: null, task
} as unknown as Row)

/** Which tasks show: the ones still to do, the done ones, or both. */
export type TaskState = 'open' | 'done' | 'all'
const STATES: Choice[] = [
  { id: 'open', label: 'To do', tip: 'Tasks not done yet' },
  { id: 'done', label: 'Done', tip: 'Tasks you have ticked off' },
  { id: 'all', label: 'Both', tip: 'Tasks to do and done' }
]
export const showsTask = (state: TaskState) => (task: Task): boolean =>
  task.status !== 'dropped' && (state === 'all' || (state === 'done' ? task.status === 'done' : task.status === 'open'))

/** The choice kept in this browser, as every list keeps its Display: how you look, not data. */
export function useTaskState(): [TaskState, (state: TaskState) => void] {
  const key = 'view:everything:tasks'
  const [state, setState] = useState<TaskState>(() => {
    try {
      const kept = localStorage.getItem(key)
      return kept === 'done' || kept === 'all' ? kept : 'open'
    } catch {
      return 'open'
    }
  })
  return [state, (next) => {
    setState(next)
    try {
      localStorage.setItem(key, next)
    } catch {
      // Not kept, but still applied.
    }
  }]
}

/** To do, Done or Both: beside the kind chips while tasks are on show. */
export function TaskStateChips({ state, onState }: { state: TaskState; onState: (state: TaskState) => void }): React.JSX.Element {
  return (
    <span data-task-state className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
      <span className="font-medium text-foreground/80">Tasks</span>
      <Chips options={STATES} on={(id) => id === state} pick={(id) => onState(id as TaskState)} className="flex-nowrap" />
    </span>
  )
}

/** Red if it is late, orange if it is today: the colours Today and Upcoming use. */
const tone = (at: string | null): string | undefined => {
  if (!at) return undefined
  const day = new Date(at).getTime()
  return day < startOfDay() ? 'var(--tt-color-text-red)' : day < startOfDay(1) ? 'var(--tt-color-text-orange)' : undefined
}

/** The circle a task is ticked with, the same as Today's; a done one filled, a click opens it again. */
function TaskTick({ task }: { task: Task }): React.JSX.Element {
  const [going, setGoing] = useState(false)
  const done = task.status === 'done'
  const still = document.documentElement.dataset.motion === 'off' || matchMedia('(prefers-reduced-motion: reduce)').matches
  return (
    <Tip label={done ? 'Not done after all: back on your list' : 'Mark it done  E'}>
      <button type="button" data-task-tick aria-label={done ? 'Not done' : 'Complete'}
        onClick={(event) => {
          event.stopPropagation()
          if (done) return notDone(task)
          // The circle fills first, then the row goes: the click is answered before the list changes.
          setGoing(true)
          setTimeout(() => void completeTask(task).finally(() => setGoing(false)), still ? 0 : 280)
        }}
        className="group/tick flex size-[18px] shrink-0 items-center justify-center rounded-full border-[1.5px] border-muted-foreground/60 transition-colors hover:bg-accent"
        style={going || done ? { background: 'var(--tt-color-text-green)', borderColor: 'var(--tt-color-text-green)' } : { borderColor: tone(task.dueAt) }}>
        <Check className={`size-3 transition-opacity ${going || done ? 'text-background opacity-100' : 'opacity-0 group-hover/tick:opacity-60'}`} />
      </button>
    </Tip>
  )
}

/** A task as the list draws it: its tick, its words and tags, when, its priority and its steps, and its usual menu. */
export function taskEntry(task: Task, { open, now, done }: { open: () => void; now: TaskNow; done?: () => void }): Entry {
  const { text, tags } = taskName(task.title)
  const steps = task.subtasks ?? []
  const later = bucket(task)
  const finished = task.status === 'done'
  return {
    id: task.id,
    type: 'task',
    title: text || task.title,
    tags,
    icon: CircleCheck,
    tint: 'var(--tt-color-text-green)',
    lead: <TaskTick task={task} />,
    // When it is to be done, in Today's colours; a done one says when it was.
    age: finished ? (task.completedAt ? `Done ${whenInLine(task.completedAt)}` : 'Done') : task.dueAt ? when(task.dueAt, !!task.allDay) : undefined,
    ageTint: finished ? undefined : tone(task.dueAt),
    sub: finished ? undefined : [
      task.deadline && `Due by ${whenInLine(task.deadline, !task.deadlineTimed)}`,
      later && BUCKETS[later],
      !task.dueAt && !task.deadline && !later && 'No date',
      task.recurrence && `Repeats ${task.recurrence}`,
      task.waitingOn && `Waiting on ${task.waitingOn}`,
      steps.length > 0 && `${steps.filter((one) => one.done).length}/${steps.length} steps`
    ].filter(Boolean).join(' · ') || undefined,
    marks: (
      <>
        <PriorityMark level={task.priority} className="size-3.5 shrink-0" />
        {task.estimate ? <LengthChip minutes={task.estimate} /> : null}
      </>
    ),
    dim: finished,
    menu: taskMenu(task, { open, now, ...(done ? { complete: done } : {}) }) as RowItem[]
  }
}

/**
 * Tasks alone, grouped as Today and Upcoming group them: what is late, today,
 * the days ahead, the later lists, what has no date, and what is done.
 */
export function taskGroups(rows: Row[]): [string, Row[]][] {
  const open = rows.filter((one) => one.task?.status === 'open')
  const day = (one: Row): number => placed(one.task!) ?? Infinity
  const byDay = (a: Row, b: Row): number => day(a) - day(b) || (a.task!.priority || 5) - (b.task!.priority || 5)
  const later = (one: Row): boolean => !!bucket(one.task!) && !one.task!.deadline
  return ([
    ['Overdue', open.filter((one) => day(one) < startOfDay()).sort(byDay)],
    ['Today', open.filter((one) => day(one) >= startOfDay() && day(one) < startOfDay(1)).sort(byDay)],
    ['Upcoming', open.filter((one) => day(one) >= startOfDay(1) && day(one) < Infinity).sort(byDay)],
    ['Later', open.filter((one) => day(one) === Infinity && later(one))],
    ['No date', open.filter((one) => day(one) === Infinity && !later(one))],
    ['Done', rows.filter((one) => one.task?.status === 'done').sort((a, b) => (b.task!.completedAt ?? '').localeCompare(a.task!.completedAt ?? ''))]
  ] as [string, Row[]][]).filter(([, list]) => list.length)
}

/** What a kind is called, many of it: for the empty page of a filter. */
const many = (id: string): string => (id === 'task' ? 'tasks' : `${(CAPTURE_TYPES.find((type) => type.id === id)?.label ?? 'note').toLowerCase()}s`)

/** The empty page for what the filter chose: what it would hold, and how to get some. */
export function emptyFor(kinds: string[], state: TaskState, filtered: boolean): { title: string; body: string } {
  const onlyTasks = kinds.length === 1 && kinds[0] === 'task'
  if (onlyTasks && state === 'done') return { title: 'Nothing done yet', body: 'Tick a task off, here or on Today, and it shows here with the day you did it.' }
  if (onlyTasks && state === 'open') return { title: 'Nothing to do', body: 'Every task is done. Choose “Done” above to see them, or add one in Today or Upcoming.' }
  if (onlyTasks) return { title: 'No tasks yet', body: 'Add one in Today or Upcoming, or press ⌘. anywhere and write it with a day: “call the dentist Friday”.' }
  if (filtered) return { title: 'Nothing matches', body: 'The other filters hide everything here. Clear them in Display (F), or choose another kind above.' }
  if (kinds.length) {
    const names = kinds.map(many)
    const said = names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} or ${names.at(-1)}`
    return { title: `No ${said} yet`, body: `${kinds.includes('task') ? 'Add a task in Today or Upcoming. ' : ''}Press ⌘. in any app to catch a thought; change its kind in the box. Click a chosen kind above to show the rest again.` }
  }
  return { title: 'Nothing here yet', body: 'Press ⌘. in any app to catch a thought, or add a task in Today. Everything you keep shows here.' }
}

/** Done, many at once: one notice, one sound and one Undo for the lot. */
export async function doneTasks(tasks: Task[]): Promise<void> {
  if (!tasks.length) return
  const was = await Promise.all(tasks.map((task) => vigil.doneTask(task.id)))
  chime('done')
  toast(tasks.length === 1 ? 'Done' : `${num(tasks.length)} done`, () => void Promise.all(tasks.map((task, at) => vigil.undoneTask(task.id, was[at]))))
}
