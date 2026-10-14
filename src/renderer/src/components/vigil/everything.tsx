import { useMemo, useState } from 'react'
import { CircleCheck } from 'lucide-react'
import { alive } from '@/components/ui/alive-icon'
import LinkIcon from '@/components/ui/link-icon'
import SimpleCheckedIcon from '@/components/ui/simple-checked-icon'
import CheckedIcon from '@/components/ui/checked-icon'
import { CAPTURE_TYPES } from '../capture-kinds/capture-kind-picker'
import type { CaptureMeta } from '../capture-list'
import { useLive, vigil, when, whenInLine, type Task } from '@/lib/vigil'
import { BUCKETS, bucket, placed, taskName } from '@/lib/tasks'
import { chime } from '@/lib/sound'
import { num, startOfDay } from '../../../../main/dates'
import { PriorityMark } from './task-input'
import { LengthChip, completeTask, notDone, taskMenu, type TaskNow } from './tasks-view'
import { Chips, type Choice } from './display'
import type { Entry } from './note-list'
import type { RowItem } from './row-menu'
import { Tip, toast, quietly } from './ui'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'

const Check = alive(SimpleCheckedIcon)
const Linked = alive(LinkIcon)

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

/** A choice kept in this browser, as every list keeps its Display: how you look, not data. */
function useKept<T extends string>(key: string, read: (kept: string | null) => T): [T, (next: T) => void] {
  const [state, setState] = useState<T>(() => {
    try {
      return read(localStorage.getItem(key))
    } catch {
      return read(null)
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

/** To do, Done or Both, kept. */
export const useTaskState = (): [TaskState, (state: TaskState) => void] =>
  useKept<TaskState>('view:everything:tasks', (kept) => (kept === 'done' || kept === 'all' ? kept : 'open'))

/**
 * Notes made into tasks: hidden at first, since the task stands for them and
 * the same thing twice in a row reads as a mistake; one chip shows them again.
 */
export const useMadeShown = (): [boolean, (on: boolean) => void] => {
  const [kept, keep] = useKept<'shown' | 'hidden'>('view:everything:made', (one) => (one === 'shown' ? 'shown' : 'hidden'))
  return [kept === 'shown', (on) => keep(on ? 'shown' : 'hidden')]
}

/** The chip that brings notes made into tasks back into the list, beside the kind chips. */
export function MadeChip({ on, hidden, onChange }: { on: boolean; hidden: number; onChange: (on: boolean) => void }): React.JSX.Element {
  const tip = on
    ? 'Showing notes you made into tasks, each beside the task it became. Click to hide them again'
    : `${num(hidden)} ${hidden === 1 ? 'note you made into a task is' : 'notes you made into tasks are'} hidden: the task shows instead. Click to show ${hidden === 1 ? 'it' : 'them'} too`
  return (
    <span data-made-chip className="flex shrink-0 items-center">
      <Chips options={[{ id: 'made', label: 'Made into tasks', tip }]} on={() => on} pick={() => onChange(!on)} className="flex-nowrap" />
    </span>
  )
}

/** What each task was made from, and what each capture became: one read for the whole list. */
export type Sources = { from: Map<string, string[]>; became: Map<string, string[]> }
export function useSources(on: boolean): Sources {
  const pairs = useLive(() => (on ? vigil.taskSources() : Promise.resolve([])), [] as { task: string; capture: string }[], [on])
  return useMemo(() => {
    const from = new Map<string, string[]>()
    const became = new Map<string, string[]>()
    for (const { task, capture } of pairs) {
      from.set(task, [...(from.get(task) ?? []), capture])
      became.set(capture, [...(became.get(capture) ?? []), task])
    }
    return { from, became }
  }, [pairs])
}

/** The words of the cue: where a task came from, or what a note became. */
export const fromSaid = (n: number): string => (n === 1 ? 'from a capture' : `from ${num(n)} captures`)
export const becameSaid = (n: number): string => (n === 1 ? 'became a task' : `became ${num(n)} tasks`)

/**
 * A quiet "this came from that" in a row's line: a task made from captures,
 * or a capture made into tasks. One opens it at a click; several list
 * themselves in a small menu, each opening at a click. Inside the row's own
 * button, so every press stops here and never opens the row as well.
 */
export function MadeCue({ kin, said, way, onOpen }: { kin: { id: string; title: string }[]; said: string; way: 'from' | 'became'; onOpen: (id: string) => void }): React.JSX.Element {
  const stop = (event: React.SyntheticEvent): void => event.stopPropagation()
  const lead = way === 'from' ? 'Made from' : 'Became'
  const quoted = (title: string): string => `“${title.length > 60 ? `${title.slice(0, 59)}…` : title}”`
  const face = (click?: () => void): React.JSX.Element => (
    <span role="button" data-made-cue={way} data-made-n={kin.length}
      onPointerDown={stop} onMouseDown={stop} onDoubleClick={stop}
      onClick={(event) => (stop(event), click?.())}
      className="inline-flex items-center gap-1 rounded-sm whitespace-nowrap text-muted-foreground decoration-muted-foreground/50 underline-offset-2 transition-colors hover:text-foreground hover:underline data-[state=open]:text-foreground">
      <Linked className="size-3 shrink-0" />{said}
    </span>
  )
  if (kin.length === 1) return <Tip label={`${lead} ${quoted(kin[0].title)}. Click to open it`}>{face(() => onOpen(kin[0].id))}</Tip>
  return (
    <DropdownMenu modal={false}>
      <Tip label={`${lead} ${kin.slice(0, 3).map((one) => quoted(one.title)).join(', ')}${kin.length > 3 ? ` and ${num(kin.length - 3)} more` : ''}`}>
        <DropdownMenuTrigger asChild>{face()}</DropdownMenuTrigger>
      </Tip>
      <DropdownMenuContent align="start" className="w-64" onClick={stop} onPointerDown={stop} onDoubleClick={stop} onContextMenu={stop}>
        <DropdownMenuLabel>{lead}</DropdownMenuLabel>
        {kin.map((one) => (
          <DropdownMenuItem key={one.id} data-made-pick={one.id} onSelect={() => onOpen(one.id)}>
            <span className="truncate">{one.title}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
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
export function emptyFor(kinds: string[], state: TaskState, filtered: boolean, made = 0): { title: string; body: string } {
  const onlyTasks = kinds.length === 1 && kinds[0] === 'task'
  // All that is left are notes made into tasks, hidden for their tasks: say so, and how to see them.
  if (made && !onlyTasks) return { title: 'Nothing else here', body: `${num(made)} ${made === 1 ? 'note you made into a task is' : 'notes you made into tasks are'} hidden, since the task shows instead. Choose “Made into tasks” above to see ${made === 1 ? 'it' : 'them'}.` }
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
  const undo = (): void => void Promise.all(tasks.map((task, at) => vigil.undoneTask(task.id, was[at])))
  // One tick shows itself; many at once are counted, with the way back.
  if (tasks.length === 1) quietly(undo)
  else toast(`${num(tasks.length)} done`, undo)
}
