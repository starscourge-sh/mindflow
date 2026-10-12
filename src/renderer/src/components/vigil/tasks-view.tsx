import { useEffect, useMemo, useRef, useState } from 'react'
import * as chrono from 'chrono-node'
import type { JSONContent } from '@tiptap/core'
import { CalendarDays, CircleX, Plus, Square, Ban, Tag } from 'lucide-react'
import { tagTint } from './tag-icon'
import { alive } from '@/components/ui/alive-icon'
import FilledBellIcon from '@/components/ui/filled-bell-icon'
import ClockIcon from '@/components/ui/clock-icon'
import SimpleCheckedIcon from '@/components/ui/simple-checked-icon'
import FileDescriptionIcon from '@/components/ui/file-description-icon'
import LibraryIcon from '@/components/ui/library-icon'
import HashtagIcon from '@/components/ui/hashtag-icon'
import HistoryCircleIcon from '@/components/ui/history-circle-icon'
import CheckedIcon from '@/components/ui/checked-icon'
import RefreshIcon from '@/components/ui/refresh-icon'
import BookmarkIcon from '@/components/ui/bookmark-icon'
import XIcon from '@/components/ui/x-icon'


import { MindflowEditor } from '../mindflow'
import { chime, step } from '@/lib/sound'
import { captureKey, typeSaid } from '@/lib/capture-links'
import { splitTags, unloaded, useLive, vigil, when, whenInLine, type Made, type Session, type Task, type TaskFull } from '@/lib/vigil'
import { useOpened } from '@/lib/nav'
import { BUCKETS, bucket, closeTask, makeTask, placed } from '@/lib/tasks'
import { PRIORITY_NAMES } from '../../../../main/task-words'
import { PriorityIcon, TaskInput, planFor, setPriority } from './task-input'
import { useArrivals } from './note-list'
import { Empty, Island, Kbd, Page, Prop, PropInput, Props, Rolling, Tags, toast, useListKeys, typing, VirtualList, Stepper } from './ui'
import { Display, arrange, useView, type Facet } from './display'
import { DatePicker } from './date-picker'
import { Lineage } from './lineage'
import { RowMenu, copy } from './row-menu'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Tip } from '@/components/vigil/ui'
import { Button } from '@/components/ui/button'
import { Rest } from './scenery'
import { OptionsMenu } from './options-menu'
import { stickOnDesktop } from './sticky-note'
import { TaskLog } from './task-log'
import { RoutineNumbers, TaskFocusNumbers } from './focus-stats'
import { GlossButton, GlossLine } from './gloss-line'
import { dayjs, dayKey, num, startOfDay } from '../../../../main/dates'
import { motion } from 'motion/react'
import { EASE } from '@/lib/motion'
import { notes, type Day } from '@/lib/notes'
import { ProgressBar } from './progress-bar'
import { SessionFooter } from './session-footer'
import { Example } from './example'
import { exampleTasks } from '@/lib/examples'
import { GhostText } from './ghost'
import { useHere } from '@/lib/split'
import { budgetSaid, frogOn, markFrog, hoursSaid, minutesLeft, plannedMinutes } from '@/lib/day-plan'
import { dayClosed, openCloseDay } from './close-day'

// itshover drawings in lucide's place, moving when their control is pointed at.
const Bell = alive(FilledBellIcon)
const CalendarClock = alive(ClockIcon)
const Check = alive(SimpleCheckedIcon)
const FileText = alive(FileDescriptionIcon)
const Gem = alive(LibraryIcon)
const Hash = alive(HashtagIcon)
const History = alive(HistoryCircleIcon)
const ListChecks = alive(CheckedIcon)
const Repeat = alive(RefreshIcon)
const Telescope = alive(BookmarkIcon)
const X = alive(XIcon)
const Timer = alive(ClockIcon)
const Hourglass = alive(ClockIcon)

// Counted on the calendar, so a clock change never moves a day by an hour.
/** The day a task shows on, as a number to compare: never, for one with no day. */
const dayOf = (task: Task): number => placed(task) ?? Infinity

/** Red if it is late, orange if it is today, quiet otherwise: the Todoist colours. */
const tone = (task: Task): string | undefined => {
  if (!task.dueAt) return undefined
  const due = new Date(task.dueAt).getTime()
  if (due < startOfDay()) return 'var(--tt-color-text-red)'
  if (due < startOfDay(1)) return 'var(--tt-color-text-orange)'
  return undefined
}

/** The one thing to try on each list while it shows its example. */
const TRY_TASKS = {
  today: "type ‘call Mum Friday 6pm’ in the line above. Vigil reads the day and the time.",
  upcoming: "type ‘book seats for Hamlet on the 14th’ above. It lands on that day.",
  routines: "type ‘bins every week’ above. It comes back each week on the same day.",
  later: "type ‘learn German someday’ above. It waits here until you give it a day."
}

/** The Scheduled island's buttons: one size, and a faint fill so each reads as a button on a light page too. */
const plan = 'min-w-0 truncate bg-foreground/[0.04] px-1 text-control hover:bg-accent data-[variant=secondary]:bg-secondary'

/** A task's reminder level, or the setting's (null), with the words each goes by. */
const REMINDERS = [[null, 'Default'], ['pull', 'Pull'], ['quiet', 'Quiet'], ['alerts', 'Alert']] as const
const REMINDER_SAID = {
  default: 'As Settings says for every task.',
  pull: 'Rises to the top of Today at its time. No sound, no count.',
  quiet: 'Counted in the menu bar at its time.',
  alerts: 'A notification at its time.'
}
/** Set it, heard and undoable. */
const setReminder = (task: Pick<Task, 'id' | 'notify'>, level: Task['notify']): void => {
  if ((task.notify ?? null) === level) return chime('nope')
  const was = task.notify
  void vigil.saveTask(task.id, { notify: level }).then(() => {
    chime(level === 'alerts' ? 'on' : level ? 'tap' : 'off')
    toast(level ? `Reminder: ${level === 'alerts' ? 'alert' : level}` : 'Reminder: as Settings says', () => void vigil.saveTask(task.id, { notify: was }))
  })
}

/** How long a task should take, from "~30m": a small grey chip after its name. */
export function LengthChip({ minutes }: { minutes: number }): React.JSX.Element {
  return (
    <span data-length-chip className="shrink-0 rounded-md px-1.5 py-px text-xs tabular-nums" style={{ background: 'var(--tt-color-highlight-gray)', color: 'var(--tt-color-text-gray)' }}>
      ~{hoursSaid(minutes)}
    </span>
  )
}

/** The frog: the task picked to do first today, last night or with Eat the frog. */
export function FrogChip(): React.JSX.Element {
  return (
    <Tip label="Picked to do first today">
      <span data-frog className="shrink-0 rounded-md px-1.5 py-px text-xs font-medium" style={{ background: 'var(--tt-color-highlight-green)', color: 'var(--tt-color-text-green)' }}>
        First
      </span>
    </Tip>
  )
}

/** Move a task to a day from now, and say where: one wording for keys, menus and buttons. */
export const moveTo = (task: Pick<Task, 'id' | 'dueAt' | 'allDay' | 'planFor'>, days: number): void => {
  const due = shiftTo(days, task.dueAt)
  const was = { due: task.dueAt, plan: task.planFor }
  // Undone, the reschedule it counted and the reminder it reset go back too.
  void vigil.saveTask(task.id, { due }).then((before) => {
    chime('tap')
    toast(`Moved to ${whenInLine(due, !task.dueAt || !!task.allDay)}`, () => void vigil.saveTask(task.id, { ...was, ...(before === true ? {} : before) }))
  })
}

/**
 * Done, heard and seen first, then undoable from the notice: a routine goes
 * back to the date it had and the time it was done is struck off, the same
 * as a one-off is opened again.
 */
export function completeTask(task: Task): Promise<void> {
  chime('done')
  const today = onToday(task)
  return vigil.doneTask(task.id).then(async (was) => {
    const back = (): void => void vigil.undoneTask(task.id, was)
    // The last of today's, from any list or window: the day is clear, and it gets an ending.
    if (today && !(await vigil.tasks()).some(onToday)) return dayCleared(back)
    // A routine says when it is back.
    if (task.recurrence) return toast(`Done · next ${when((await vigil.task(task.id))?.dueAt ?? null)}`, back)
    toast('Done', back)
  })
}

/** Small counts said in words: "All five done". */
const WORDS = ['none', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine']

/** On Today's list, as every list counts it: open, not waiting on anyone, and today's or late. */
export const onToday = (task: Task): boolean => task.status === 'open' && !task.waitingOn && (placed(task) ?? Infinity) < startOfDay(1)

/**
 * Today's list just cleared: a soft open chord after the tick's own sound,
 * the words, and one next step, Close the day, where that sheet lives and the
 * day is not closed yet. Today's page hears it too, and rises into its rest.
 */
function dayCleared(back: () => void): void {
  setTimeout(() => chime('clear'), 240)
  window.dispatchEvent(new CustomEvent('vigil:day-cleared'))
  const home = new URLSearchParams(location.search).get('view') === 'home'
  toast('That is everything for today', back, 'success',
    home && !dayClosed() ? { label: 'Close the day', key: 'c', run: () => (chime('open'), openCloseDay()) } : undefined)
}

/** The list a new task landed in, said only when it is not the one you are in. */
export async function landed(made: Made, here: string): Promise<string> {
  const task = await vigil.task(made.id)
  const later = task && bucket(task)
  const day = task && placed(task)
  const where = !task ? here : task.recurrence ? 'routines' : later ? 'later' : task.waitingOn ? 'waiting' : day === null ? 'backlog' : day < startOfDay(1) ? 'today' : 'upcoming'
  if (where === here) return 'Task added'
  if (later) return `Added to ${BUCKETS[later]}`
  return where === 'routines' ? 'Added to Routines'
    : where === 'today' ? 'Added to Today'
    : day !== null && day !== undefined ? `Added to Upcoming, ${whenInLine(new Date(day).toISOString())}`
    : 'Added to the backlog in Upcoming: put a day in the words to date it'
}

/** Open tasks under the note each came from, the ones typed straight in last. */
const byNote = (list: Task[]): [string, Task[], string][] =>
  Object.entries(Object.groupBy(list, (task) => task.fromId ?? '') as Record<string, Task[]>)
    .sort(([a], [b]) => (a ? 0 : 1) - (b ? 0 : 1))
    .map(([id, tasks]) => [tasks[0].fromTitle || (id ? 'Untitled' : 'Typed here'), tasks, id])

/**
 * Tasks, the way Todoist lists them: Today with what is late on top, Upcoming
 * by day, and a line at the top that reads the date and the repeat out of what
 * you type. A task is not a note with a tickbox: it has a when, a record of each
 * time it was done, and a way back to the capture it came from.
 */
export function TasksView({ mode, focus, onOpen }: { mode: 'today' | 'upcoming' | 'routines' | 'later'; focus?: string; onOpen?: (type: string, id: string) => void }): React.JSX.Element {
  const real = useLive(vigil.tasks, [] as Task[])
  // Nothing of this list's yet: a few made-up tasks show what it holds, dimmed and out of reach.
  const example = !unloaded(real) && !real.some((task) => task.status === 'open' && (mode === 'routines' ? !!task.recurrence : mode === 'later' ? !!bucket(task) : mode === 'upcoming' ? !task.recurrence : true))
  const examples = useMemo(exampleTasks, [])
  const tasks = example ? examples : real
  const [open, setOpen] = useState<TaskFull | null>(null)
  const [draft, setDraft] = useState('')
  const [leaving, setLeaving] = useState<string | null>(null)
  // The row a thought is being written under, without opening the task.
  const [glossing, setGlossing] = useState<string | null>(null)

  const [view, setView] = useView(`tasks:${mode}`, { sort: 'manual', group: 'when' })
  const facets = taskFacets(tasks)
  // Filtered and ordered first; the view's own groups are cut from what is left.
  const [[, chosenTasks]] = arrange(tasks, view, facets, {
    name: (a, b) => a.title.localeCompare(b.title),
    priority: (a, b) => (a.priority || 5) - (b.priority || 5),
    due: (a, b) => (a.dueAt ?? '9').localeCompare(b.dueAt ?? '9'),
    deadline: (a, b) => (a.deadline ?? '9').localeCompare(b.deadline ?? '9'),
    added: (a, b) => b.createdAt.localeCompare(a.createdAt)
  })
  // Routines live in a view of their own, or they flood Today; what was put
  // off to a later list waits there, out of the lists with days.
  const live = chosenTasks.filter((task) => task.status === 'open' && !task.waitingOn && (mode === 'later' ? !!bucket(task) : !bucket(task) || !!task.deadline) && (mode === 'routines' ? task.recurrence : !task.recurrence || mode === 'today'))
  const waiting = mode === 'upcoming' ? chosenTasks.filter((task) => task.status === 'open' && task.waitingOn) : []
  const base = mode === 'today' ? live.filter((task) => dayOf(task) < startOfDay(1)) : live
  // Pull, the gentlest of the three: a task whose time has come rises to the
  // top of Today instead of making a noise. Looked at again each minute.
  const settings = useLive(vigil.settings, null as Awaited<ReturnType<typeof vigil.settings>> | null)
  const notify = settings?.notify
  // Tomorrow's first task, picked when the day was closed: it leads Today on its day.
  const frog = mode === 'today' ? frogOn(settings) : null
  const [, minute] = useState(0)
  useEffect(() => {
    const every = setInterval(() => minute((n) => n + 1), 60_000)
    return () => clearInterval(every)
  }, [])
  const come = (task: Task): boolean =>
    (task.notify ?? notify) === 'pull' &&
    ((!!task.dueAt && !task.allDay && Date.parse(task.dueAt) <= Date.now()) || (!!task.deadline && !!task.deadlineTimed && Date.parse(task.deadline) <= Date.now()))
  const today = base.filter((task) => dayOf(task) >= startOfDay())
  const groups: [string, Task[], string?][] =
    view.group === 'none'
      ? [['', [...base, ...waiting]]]
      : view.group === 'note'
      ? byNote([...base, ...waiting])
      : mode === 'routines'
      ? [['Every so often', live]]
      : mode === 'later'
      ? (Object.keys(BUCKETS) as (keyof typeof BUCKETS)[]).map((which) => [BUCKETS[which], live.filter((task) => bucket(task) === which)])
      : mode === 'today' && view.group === '135'
      ? (() => {
          // 1-3-5: one big thing, three medium, five small, in the order shown; the rest if there is time.
          const order = [...base.filter((task) => task.id === frog), ...base.filter((task) => task.id !== frog)]
          const slot = (name: string, from: number, size: number): [string, Task[]] => [name, order.slice(from, from + size)]
          return [slot('One big thing', 0, 1), slot('Three medium', 1, 3), slot('Five small', 4, 5), ['If there is time', order.slice(9)]] as [string, Task[]][]
        })()
      : mode === 'today'
      ? [
          // The frog, picked last night, above everything, late or not.
          ['First', base.filter((task) => task.id === frog)],
          ['Overdue', base.filter((task) => dayOf(task) < startOfDay() && task.id !== frog)],
          ['Today', [...today.filter(come), ...today.filter((task) => !come(task))].filter((task) => task.id !== frog)]
        ]
      : [
          // By day, in the order of the days, whatever the order inside each.
          ...Object.entries(Object.groupBy(live.filter((task) => dayOf(task) >= startOfDay(1) && dayOf(task) < Infinity), (task) => startOfDay(0, dayOf(task))) as Record<string, Task[]>)
            .sort(([a], [b]) => Number(a) - Number(b))
            .map(([day, list]): [string, Task[]] => [when(new Date(Number(day)).toISOString()), list]),
          ['Backlog, no date', live.filter((task) => dayOf(task) === Infinity)],
          // Chasing is not doing: what you are waiting on gets its own place.
          ['Waiting on someone', waiting]
        ]
  const shown = groups.flatMap(([, list]) => list)
  // A task just added (or put back by Undo) eases into its row.
  const arrived = useArrivals(shown.map((task) => task.id), mode)
  // One list for the virtual scroller: each group's heading, then its tasks.
  const rows: (Task | { heading: string; count: number; key: string })[] = groups.flatMap(([heading, list, key]) => (list.length ? [{ heading, count: list.length, key: key ?? heading }, ...list] : []))
  const pick = (id: string): void => void vigil.task(id).then(setOpen)
  // Sent here for one task, from search or a link: open it. Opening one is a step Back returns from.
  useOpened(open?.id, focus, pick, () => setOpen(null))
  const [cursor, setCursor] = useListKeys(example ? 0 : shown.length, { onOpen: (index) => pick(shown[index].id) })
  const addRef = useRef<HTMLInputElement>(null)

  // How far through the day: what was done today (routines too) against that and what is left.
  const dayDone = useLive(() => (mode === 'today' ? notes.day(dayKey()) : Promise.resolve(null)), null as Day | null, [mode])?.done.length ?? 0
  const leftToday = mode === 'today' ? real.filter(onToday).length : 0
  // Cleared just now, in front of you: the rest rises in rather than being there.
  const [cleared, setCleared] = useState(false)
  useEffect(() => {
    const heard = (): void => setCleared(true)
    window.addEventListener('vigil:day-cleared', heard)
    return () => window.removeEventListener('vigil:day-cleared', heard)
  }, [])

  // On the row the keyboard is on: Alt-J and Alt-K move it (dates say what is
  // due, order says what is next), T, M and W put it on today, tomorrow or
  // next week in one press, and 1 to 4 give it a priority, 0 none.
  // Split, only the pane in front answers keys.
  const here = useHere()
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (!here()) return
      if (typing() || event.defaultPrevented) return
      // A goes to the add-a-task field, as it does in the box's Today.
      if (event.key === 'a' && !event.metaKey && !event.ctrlKey && !event.altKey) {
        event.preventDefault()
        return addRef.current?.focus()
      }
      const task = example ? undefined : shown[cursor]
      if (!task) return
      if (event.altKey && (event.code === 'KeyJ' || event.code === 'KeyK')) {
        event.preventDefault()
        const to = cursor + (event.code === 'KeyJ' ? 1 : -1)
        // A higher priority sorts first, so a task moves only among its own level.
        if (to < 0 || to >= shown.length || shown[to].priority !== task.priority) return
        // Renumber the list as shown, with the two swapped.
        const order = [...shown]
        ;[order[cursor], order[to]] = [order[to], order[cursor]]
        // Moving a row is choosing your own order, as in captures and nuggets:
        // the list switches to it, numbered as you saw it.
        const was = view
        if (view.sort !== 'manual') setView({ ...view, sort: 'manual' })
        chime('shift')
        void Promise.all(order.map((one, index) => vigil.saveTask(one.id, { sortOrder: index }))).then(() => {
          // Said once it switches, so the sort's label never lies; Undo puts both back.
          if (was.sort !== 'manual') toast('Now in your own order', () => (setView(was), void Promise.all(shown.map((one) => vigil.saveTask(one.id, { sortOrder: one.sortOrder })))))
        })
        setCursor(to)
        return
      }
      if (event.metaKey || event.ctrlKey || event.altKey) return
      if (/^[0-4]$/.test(event.key)) return setPriority(task, Number(event.key))
      // ; a thought on the row, into the task's log; with the task open, its log takes the key.
      if (event.key === ';' && !open) return (event.preventDefault(), chime('tap'), setGlossing(task.id))
      // e completes, as in Todoist.
      if (event.key === 'e') return complete(task)
      const days = { t: 0, m: 1, w: 7 }[event.key]
      if (days === undefined) return
      moveTo(task, days)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  // The circle fills first, then the row goes: the click is answered before
  // the list changes under you.
  const complete = (task: Task): void => {
    setLeaving(task.id)
    setTimeout(() => void completeTask(task).then(() => setLeaving(null)), 280)
  }
  const tick = (task: Task, at: number): void => {
    const subtasks = task.subtasks ?? []
    // Unticked sounds like a switch off, as a to-do in a note does.
    chime(subtasks[at].done ? 'off' : 'done')
    void vigil.saveTask(task.id, { subtasks: subtasks.map((one, index) => (index === at ? { ...one, done: !one.done } : one)) }).then(() =>
      toast(subtasks[at].done ? 'Step open again' : 'Step done', () => void vigil.saveTask(task.id, { subtasks })))
  }

  return (
    <>
      <Page aside={!!open}
 title={mode} count={example ? undefined : shown.length} unit={mode === 'today' ? ['to do', 'to do'] : undefined} actions={
        <span className="flex items-center gap-2">
          <Display
            view={view}
            onChange={setView}
            facets={facets}
            sorts={[{ id: 'manual', label: 'Your order' }, { id: 'priority', label: 'Priority' }, { id: 'name', label: 'Name' }, { id: 'due', label: 'Scheduled' }, { id: 'deadline', label: 'Due by' }, { id: 'added', label: 'Date added' }]}
            groups={[{ id: 'when', label: mode === 'later' ? 'By list' : 'By date' }, ...(mode === 'today' ? [{ id: '135', label: '1-3-5' }] : []), { id: 'note', label: 'By note' }, { id: 'none', label: 'None' }]}
          />
          {/* Today's list on the desktop, ticked off there through the day. */}
          {mode === 'today' && <OptionsMenu label="More" side="bottom" align="end" options={[]} actions={[{ label: 'Keep today on screen', run: () => stickOnDesktop('today', 'today') }]} />}
        </span>
      }>

        <form
          className="mx-3 mt-3 flex items-center gap-2 rounded-md border px-2 py-1.5 focus-within:border-ring"
          onSubmit={(event) => {
            event.preventDefault()
            if (!draft.trim()) return
            const text = draft
            setDraft('')
            void makeTask({ text, today: mode === 'today' }, (made) => landed(made, mode))
          }}
        >
          <Plus className="size-4 text-muted-foreground" />
          <TaskInput
            inputRef={addRef}
            value={draft}
            onChange={setDraft}
            placeholder={mode === 'later' ? 'Add a task: “learn Welsh someday”, “book the holiday this year”' : 'Add a task: “call the accountant tomorrow 10am”, “file taxes by friday !!”'}
          />
          <Kbd>↵</Kbd>
        </form>
        {/* How far through the day: "2 of 5 done" and a thin bar, which reaches its end on the last one. */}
        {mode === 'today' && !example && !unloaded(tasks) && dayDone > 0 && (
          <div data-day-progress data-said={`${dayDone} of ${dayDone + leftToday} done`} className="mx-3 mt-3 flex items-center gap-3 px-2">
            <span className="shrink-0 text-[0.9375rem] font-medium tabular-nums text-foreground"><Rolling text={`${num(dayDone)} of ${num(dayDone + leftToday)} done`} by="word" /></span>
            <ProgressBar value={dayDone / (dayDone + leftToday)} label="Today's tasks done" thick={3} className="min-w-16 flex-1" />
          </div>
        )}
        {/* The day as a budget: what today's tasks are planned to take, and the time left before the day ends. */}
        {/* Nothing left to plan once the list is done: the ending below says the rest. */}
        {mode === 'today' && !example && !unloaded(tasks) && !(dayDone > 0 && !leftToday) && (() => {
          const planned = plannedMinutes(base)
          const left = minutesLeft(settings?.dayEnd)
          const over = planned > left
          return (
            <p data-day-budget data-said={budgetSaid(planned, left)} className="mx-3 mt-3 px-2 text-[0.9375rem] font-medium tabular-nums" style={{ color: over ? 'var(--tt-color-text-orange)' : 'var(--foreground)' }}>
              <Rolling text={budgetSaid(planned, left)} by="word" />
              {over && <span className="font-normal text-muted-foreground"> · {hoursSaid(planned - left)} more than the day holds</span>}
              {!planned && <span className="font-normal text-muted-foreground"> · write ~30m on a task to plan it</span>}
            </p>
          )
        })()}

        {shown.length ? (
          <Example on={example} tryIt={TRY_TASKS[mode]}>
          <VirtualList
            items={rows}
            keyOf={(row) => ('id' in row ? row.id : `heading-${row.key}`)}
            cursor={shown[cursor] ? rows.indexOf(shown[cursor]) : undefined}
            className="mx-3 mb-6"
          >
            {(row) => {
              if (!('id' in row))
                return row.heading ? (
                  <h3 className="mt-6 mb-1 truncate border-b px-2 pb-1.5 text-meta font-medium" style={{ color: row.heading === 'Overdue' ? 'var(--tt-color-text-red)' : undefined }}>
                    {row.heading} <span className="font-normal text-muted-foreground"><Rolling text={row.count} /></span>
                  </h3>
                ) : <div className="h-3" />
              const task = row
              const index = shown.indexOf(task)
              const later = bucket(task)
              const subtasks = task.subtasks ?? []
              return (
                      <RowMenu items={[
                        { label: 'Open', keys: '↵', run: () => pick(task.id) },
                        { label: 'Complete', keys: 'E', run: () => complete(task) },
                        'separator',
                        { label: frogOn(settings) === task.id ? 'Not the frog after all' : 'Eat the frog: do this first today', run: () => void (frogOn(settings) === task.id ? markFrog(null, task.id) : ((placed(task) ?? Infinity) >= startOfDay(1) && moveTo(task, 0), markFrog(task.id, frogOn(settings)))) },
                        { label: 'Today', keys: 'T', run: () => moveTo(task, 0) },
                        { label: 'Tomorrow', keys: 'M', run: () => moveTo(task, 1) },
                        { label: 'Next week', keys: 'W', run: () => moveTo(task, 7) },
                        ...(Object.keys(BUCKETS) as (keyof typeof BUCKETS)[]).map((which) => ({ label: BUCKETS[which], run: () => planFor(task, which) })),
                        'separator',
                        ...[1, 2, 3, 4, 0].map((level) => ({ label: PRIORITY_NAMES[level], keys: String(level), run: () => setPriority(task, level) })),
                        'separator',
                        { label: `Copy T-${task.number}`, run: () => copy(`T-${task.number}`, `Copied T-${task.number}`) },
                        'separator',
                        { label: 'Close without doing', danger: true, run: () => closeTask(task.id) }
                      ]}>
                      <div
                        data-id={task.id}
                        data-cursor={index === cursor || undefined}
                        className={`group group/item relative flex items-start gap-3 rounded-md px-2 py-2 transition-colors ${task.id === open?.id ? 'bg-accent' : index === cursor ? 'bg-accent/40' : 'hover:bg-accent/50'} ${arrived(task.id) ? 'mf-arrive' : ''}`}
                      >
                        <Tip label="Complete">
                        <button
                          type="button"
                        
                          onClick={() => complete(task)}
                          // The tick shows only over the circle, never the row.
                          className="group/tick mt-0.5 flex size-[18px] shrink-0 items-center justify-center rounded-full border-[1.5px] transition-colors hover:bg-accent"
                          style={{ borderColor: tone(task), background: leaving === task.id ? 'var(--tt-color-text-green)' : undefined }}
                        >
                          <Check className={`size-3 transition-opacity ${leaving === task.id ? 'opacity-100' : 'opacity-0 group-hover/tick:opacity-60'}`} />
                        </button>
                        </Tip>
                        <div className="flex min-w-0 flex-1 flex-col items-start gap-1">
                        <button type="button" data-row data-id={task.id} onClick={() => pick(task.id)} className="flex w-full min-w-0 flex-col items-start gap-1 text-left">
                          <span className="flex max-w-full items-center gap-2">
                            {task.priority ? <PriorityIcon level={task.priority} className="size-3.5 shrink-0" /> : null}
                            {task.id === frog && <FrogChip />}
                            <span className="truncate">{splitTags(task.title).text}</span>
                            <Tags tags={splitTags(task.title).tags} />
                            {task.estimate ? <LengthChip minutes={task.estimate} /> : null}
                          </span>
                          {(task.dueAt || task.recurrence || task.waitingOn || task.deadline || task.blocker || later || subtasks.length > 0) && (
                            <span className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                              {task.dueAt && (
                                <Tip label="Scheduled: when you mean to do it">
                                <span className="flex items-center gap-1" style={{ color: tone(task) }}>
                                  <CalendarDays className="size-3" />
                                  {when(task.dueAt, !!task.allDay)}
                                </span>
                                </Tip>
                              )}
                              {task.deadline && (
                                <span className="flex items-center gap-1" style={{ color: tone({ ...task, dueAt: task.deadline }) }}>
                                  <CalendarClock className="size-3" />
                                  Due by {whenInLine(task.deadline, !task.deadlineTimed)}
                                </span>
                              )}
                              {later && mode !== 'later' && <span className="flex items-center gap-1"><Telescope className="size-3" />{BUCKETS[later]}</span>}
                              {task.recurrence && <Repeat className="size-3" />}
                              {task.waitingOn && <span>Waiting on {task.waitingOn}</span>}
                              {subtasks.length > 0 && (
                                <span className="flex items-center gap-1 tabular-nums"><ListChecks className="size-3" /><Rolling text={`${subtasks.filter((one) => one.done).length}/${subtasks.length}`} /></span>
                              )}
                              {task.blocker && <span className="truncate">Blocked: {task.blocker}</span>}
                            </span>
                          )}
                        </button>
                        {/* Grouped by note, the subtasks show under their task, tickable where they are. */}
                        {view.group === 'note' && subtasks.length > 0 && (
                          <ul className="w-full space-y-0.5 pt-0.5">
                            {subtasks.map((one, at) => (
                              <li key={at} className="flex items-center gap-2 text-control">
                                <button type="button" role="checkbox" aria-checked={one.done} aria-label={one.text} onClick={() => tick(task, at)}
                                  className="flex size-3.5 shrink-0 items-center justify-center rounded border transition-colors"
                                  style={{ background: one.done ? 'var(--tt-brand-color-400)' : undefined, borderColor: one.done ? 'var(--tt-brand-color-400)' : undefined }}>
                                  {one.done && <Check className="size-2.5 text-primary-foreground" />}
                                </button>
                                <span className={`truncate ${one.done ? 'text-muted-foreground line-through' : ''}`}>{one.text}</span>
                              </li>
                            ))}
                          </ul>
                        )}
                        {glossing === task.id && <GlossLine id={task.id} open onDone={() => setGlossing(null)} placeholder="A thought on it, kept in its log" className="w-full" />}
                        </div>
                        {/* A thought without opening it: on hover, in the row's own line, so it never lands on the title. */}
                        <GlossButton className="static -mt-0.5 shrink-0" onClick={() => setGlossing(task.id)} />
                      </div>
                      </RowMenu>
              )
            }}
          </VirtualList>
          </Example>
        ) : unloaded(tasks) ? null : mode === 'today' && dayDone > 0 ? (
          // Everything for today done: not an empty list but the end of the day's list, said as one.
          <Rest seed="today">
            <motion.div data-day-cleared initial={cleared ? { opacity: 0, y: 18 } : false} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: EASE, delay: 0.12 }}>
              <Empty shape={['star', 6]} shaped title={dayDone === 1 ? 'The one task, done' : dayDone === 2 ? 'Both done' : `All ${dayDone < WORDS.length ? WORDS[dayDone] : num(dayDone)} done`}
                action={dayClosed()
                  ? <Button variant="secondary" size="sm" onClick={() => (chime('open'), onOpen?.('view', 'upcoming'))}>See what is coming up</Button>
                  : <Button variant="secondary" size="sm" onClick={() => (chime('open'), openCloseDay())}>Close the day</Button>}>
                The rest of the day is yours.
              </Empty>
            </motion.div>
          </Rest>
        ) : (
          <Rest seed="today" off={mode !== 'today'}>
          <Empty shape={mode === 'today' ? ['star', 6] : mode === 'routines' ? ['flower', 5] : mode === 'later' ? ['moon', 3] : ['ellipse', 4]} title={mode === 'today' ? 'Nothing due today' : mode === 'routines' ? 'No routines' : mode === 'later' ? 'Nothing put off' : 'Nothing coming up'}>
            {mode === 'routines'
              ? 'A routine is a task that repeats, kept here so it does not crowd Today. To make one, type it in quick capture with how often: “bins every week”, or “water the plants every! 3 days” to count from when you last did it.'
              : mode === 'today'
              ? 'A clear day. Anything with a date lands here on the day, and anything late stays on top until it is done.'
              : mode === 'later'
              ? 'For what has no day yet: say “this month”, “this year” or “someday” in the words, and it waits here, out of the way.'
              : 'Tasks with a date further out show here, grouped by day. Type one above with the date in the words.'}
          </Empty>
          </Rest>
        )}
      </Page>
      {open && <TaskDetail top={<Stepper at={shown.findIndex((one) => one.id === open.id)} total={shown.length} onStep={(to) => pick(shown[to].id)} />} key={open.id} task={open} onClose={() => setOpen(null)} onOpen={onOpen} />}
    </>
  )
}

/** The open task: its notes, and down the right when it is and what it has been. */
export function TaskDetail({ task: first, onClose, onOpen, top }: { task: TaskFull; onClose: () => void; onOpen?: (type: string, id: string) => void; top?: React.ReactNode }): React.JSX.Element {
  // Read again on every change, so a toggle shows what it now is.
  const task = useLive(async () => (await vigil.task(first.id)) ?? first, first, [first.id])
  const title = useRef<HTMLTextAreaElement>(null)
  return (
    <div className="note-pane flex min-w-0 flex-[1.4] flex-col overflow-y-auto [--mf-padding:1rem_3.25rem] @[40rem]/page:flex-row @[40rem]/page:overflow-visible @[40rem]/page:[--mf-padding:1rem_4.75rem] @[56rem]/page:border-l [&>*:first-child]:min-h-[22rem] [&>*:first-child]:shrink-0 @[40rem]/page:[&>*:first-child]:min-h-0 @[40rem]/page:[&>*:first-child]:shrink">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col pt-6">
        {top && <div className="-mt-3 mb-1 flex px-3 @[40rem]/page:px-[4.25rem]">{top}</div>}
        {/* Where you said you would pick up, as the last session ended: on its own line, plain to see. */}
        {task.pickup && task.status === 'open' && (
          <div data-pickup-note className="page-narrow mx-auto mb-3 flex w-full items-start gap-3 px-12">
            <p className="min-w-0 flex-1 text-[0.9375rem] leading-snug text-foreground"><strong className="font-semibold">Pick up here.</strong> {task.pickup}</p>
            <Button variant="ghost" size="sm" onClick={() => void vigil.clearPickUp(task.id).then(() => chime('away'))}>Done with it</Button>
          </div>
        )}
        {/* Pushed back three times: the plan's question, once, without a verdict. */}
        {task.reschedules >= 3 && task.status === 'open' && (
          <div className="page-narrow mx-auto mb-3 flex w-full flex-wrap items-center gap-x-1 gap-y-1 px-12 text-sm text-muted-foreground">
            {/* The question keeps its line; the answers sit after it, or wrap below when there is no room. */}
            <span className="mr-auto min-w-[14rem] flex-1 whitespace-nowrap">Moved {task.reschedules} times. Smaller, or let it go?</span>
            <Button variant="ghost" size="sm" onClick={() => {
              void vigil.saveTask(task.id, { reschedules: 0 })
              title.current?.select()
            }}>Make it smaller</Button>
            <Button variant="ghost" size="sm" onClick={() => closeTask(task.id, onClose)
            }>Close without doing</Button>
          </div>
        )}
        {/* Wraps as the page's heading does, so a long task is never cut off at the edge; Enter ends it. */}
        <textarea
          ref={title}
          rows={1}
          className="page-narrow mx-auto mb-2 block w-full shrink-0 resize-none overflow-hidden bg-transparent px-12 font-heading text-title font-semibold tracking-[-0.018em] text-balance outline-none [field-sizing:content]"
          defaultValue={task.title}
          onKeyDown={(event) => event.key === 'Enter' && (event.preventDefault(), event.currentTarget.blur())}
          onBlur={(event) => void vigil.saveTask(task.id, { title: event.target.value.replace(/\s*\n\s*/g, ' ') })}
        />
        <MindflowEditor
          toolbar={{ fixed: false }}
          placeholder="Notes…"
          documentId={`task-${task.id}`}
          defaultContent={(task.notes as JSONContent | null) ?? ''}
          onChange={(notes) => void vigil.saveTask(task.id, { notes })}
          foot={(editor) => <SessionFooter editor={editor} note={`task-${task.id}`} />}
        />
        {/* Keyed by the list itself, so a change made elsewhere (the other window, an undo) shows. */}
        <Checklist key={JSON.stringify(task.subtasks)} task={task} />
      </div>
      <Props>
        <Sessions taskId={task.id} title={task.title} />
        {/* What its sessions came to: time, the last one, how they ended. */}
        <TaskFocusNumbers taskId={task.id} />
        {/* What happened to it, session by session and thought by thought: never written over. */}
        <TaskLog taskId={task.id} />
        {/* When you mean to do it, Todoist's date: the day it shows on. */}
        <Island compact title="Scheduled">
          {/* Equal columns that may shrink: a narrow panel squeezes the words rather than pushing a button past its edge.
              One look for every choice here, a day or a later list; the one it is on now is lit. */}
          <div className="grid grid-cols-3 gap-1 p-1">
            {([['Today', 0], ['Tomorrow', 1], ['Next week', 7]] as const).map(([label, days]) => (
              <Button variant={days < 7 && when(task.dueAt) === label ? 'secondary' : 'ghost'} size="sm" key={label} onClick={() => moveTo(task, days)} className={plan}>
                {label}
              </Button>
            ))}
          </div>
          <DatePicker time value={task.dueAt} onChange={(due) => void vigil.saveTask(task.id, { due })} placeholder="Not scheduled" />
          {/* Or no day yet: one of the later lists, two by two. */}
          <div className="grid grid-cols-2 gap-1 p-1">
            {(Object.keys(BUCKETS) as (keyof typeof BUCKETS)[]).map((which) => (
              <Button variant={bucket(task) === which ? 'secondary' : 'ghost'} size="sm" key={which} onClick={() => planFor(task, which)} className={plan}>
                {BUCKETS[which]}
              </Button>
            ))}
          </div>
        </Island>
        {/* When it must be done by, apart from when you mean to do it: Todoist's deadline. */}
        <Island compact title="Due by">
          <DatePicker value={task.deadline} onChange={(deadline) => void vigil.saveTask(task.id, { deadline })} placeholder="No due date" />
        </Island>
        {/* Linear's four, each with its key; important is High or Urgent. */}
        <Island compact title="Priority">
          <div className="grid grid-cols-5 gap-1 p-1">
            {[1, 2, 3, 4, 0].map((level) => (
              <Tip key={level} label={<>{PRIORITY_NAMES[level]} <Kbd>{level}</Kbd></>}>
                <Button variant={task.priority === level ? 'secondary' : 'ghost'} size="sm" className="min-w-0 px-0" onClick={() => setPriority(task, level)} aria-label={PRIORITY_NAMES[level]}>
                  <PriorityIcon level={level} />
                </Button>
              </Tip>
            ))}
          </div>
        </Island>
        {/* Its own reminder level over the setting's: "!alert", "!quiet" or "!pull" in the words does the same. */}
        <Island compact title="Reminder">
          <div className="grid grid-cols-4 gap-1 p-1">
            {REMINDERS.map(([level, label]) => (
              <Button key={label} variant={(task.notify ?? null) === level ? 'secondary' : 'ghost'} size="sm" className={plan}
                onClick={() => setReminder(task, level)}>{label}</Button>
            ))}
          </div>
          <p className="flex items-start gap-2 px-2 py-1.5 text-xs leading-relaxed"><Bell className="mt-0.5 size-3 shrink-0" />{REMINDER_SAID[task.notify ?? 'default']}</p>
          {/* Unset, the way to set it in the words, as an example: never a value. */}
          {!task.notify && (
            <Tip label="How this task tells you when its time comes. Typed in the words, it is set as you add the task">
              <p className="px-2 pb-1.5 pl-7 text-xs"><GhostText>e.g. “call the vet friday 9am !alert”</GhostText></p>
            </Tip>
          )}
        </Island>
        {/* The rest of what a task can carry, each one row like the rest. */}
        <Island compact title="Details">
          <PropInput icon={Ban} value={task.blocker ?? ''} placeholder="Blocked by…" ghost="Blocked by: the spare key" does="What is in the way. It shows on the row, and “Blocked” in the filter finds it" onSave={(blocker) => void vigil.saveTask(task.id, { blocker: blocker || null })} />
          <PropInput icon={Timer} type="number" value={task.estimate ? String(task.estimate) : ''} placeholder="Estimate" ghost="Estimate: 45" does="How long you think it will take. Stats sets it beside the time your focus sessions took" suffix="minutes" onSave={(minutes) => void vigil.saveTask(task.id, { estimate: minutes ? Number(minutes) : null })} />
          <PropInput icon={Hourglass} value={task.waitingOn ?? ''} placeholder="Waiting on…" ghost="Waiting on: Jane's letter" does="Someone else has the next move. It leaves your lists and waits under “Waiting on someone” in Upcoming" onSave={(waitingOn) => void vigil.saveTask(task.id, { waitingOn: waitingOn || null })} />
          <PropInput icon={Repeat} value={task.recurrence ?? ''} placeholder="Repeats" ghost="Repeats: every monday" does="Comes back on its own once you tick it off, and moves to Routines" onSave={(recurrence) => void vigil.saveTask(task.id, { recurrence: recurrence || null })} />
          <p className="px-2 py-1.5 text-xs leading-relaxed">
            “every” follows the calendar. “every!” counts from when you last did it. Add “until” and a date when you type a task to end the series.
            {task.repeatUntil ? ` This one ends ${whenInLine(task.repeatUntil)}.` : ''}
          </p>
        </Island>

        {/* Why it exists: the capture it came from, one click away. */}
        <Lineage id={task.id} onOpen={onOpen} />
        {/* A routine's count, run and last four weeks, over the dates themselves. */}
        {(task.recurrence || task.done.length > 1) && <RoutineNumbers done={task.done} recurrence={task.recurrence} />}
        {task.done.length > 0 && (
          <Island compact title="History">
            {task.done.slice(0, 6).map((one) => (
              <div key={one.at}>
                <Prop icon={History}>{when(one.at, false)}</Prop>
                {one.recap && <p className="mx-2 -mt-1 mb-1.5 line-clamp-3 pl-6 text-control text-foreground">{one.recap}</p>}
              </div>
            ))}
          </Island>
        )}
        <Island compact title="Task">
          <Prop icon={Hash}>{captureKey(task.number).replace('V', 'T')}</Prop>
          {/* Closed, not deleted (it comes back with Undo), so no bin. */}
          <Prop
            icon={CircleX}
            onClick={() => closeTask(task.id, onClose)
            }
          >
            Close without doing
          </Prop>
        </Island>
      </Props>
    </div>
  )
}

/** How long, as a timer reads: 4:07, 1:02:30. */
const clock = (ms: number): string => {
  const seconds = Math.floor(ms / 1000)
  const parts = [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60]
  return (parts[0] ? parts : parts.slice(1)).map((part, index) => (index ? String(part).padStart(2, '0') : part)).join(':')
}

/** How long, from what you would say: 45 min, 1:30, 1h30, 2 hours, until 6pm. */
export function duration(text: string): number | null | undefined {
  const said = text.trim().toLowerCase()
  if (!said || /^no ?limit$/.test(said)) return null
  if (said.startsWith('until')) {
    const at = chrono.parseDate(said.replace(/^until\s*/, '').replace('noon', '12pm'), new Date(), { forwardDate: true })
    return at ? Math.max(0, at.getTime() - Date.now()) : undefined
  }
  const clock = said.match(/^(\d+):(\d{2})$/)
  if (clock) return (Number(clock[1]) * 60 + Number(clock[2])) * 60000
  if (/^\d+$/.test(said)) return Number(said) * 60000
  const parts = said.match(/^(?:(\d+(?:\.\d+)?)\s*h\w*)?\s*(?:(\d+)\s*m\w*)?$/)
  if (parts && (parts[1] || parts[2])) return (Number(parts[1] ?? 0) * 60 + Number(parts[2] ?? 0)) * 60000
  return undefined
}

const LENGTHS = ['25 min', '45 min', '1 hour', '1:30', 'until noon', 'until 6pm', 'No limit']

/**
 * Starting a focus session, the way Raycast Focus asks: a goal and how long,
 * said in words, then a timer that floats over everything until you are done.
 */
function StartFocus({ taskId, title }: { taskId: string; title: string }): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const [goal, setGoal] = useState(title)
  const [length, setLength] = useState('25 min')
  const planned = duration(length)
  const start = (): void => {
    if (planned === undefined) return
    void vigil.startSession(taskId, goal, planned).then(() => {
      chime('slide')
      window.api.showFocus(true)
      setOpen(false)
    })
  }
  // Opening the form winds up; each length has a note of its own, so the
  // choice is heard as well as seen.
  if (!open) return <Prop icon={Timer} onClick={() => {
    chime('windup')
    setOpen(true)
  }}>Start a focus session</Prop>
  return (
    <form
      className="mx-1 flex flex-col gap-2"
      onSubmit={(event) => {
        event.preventDefault()
        start()
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.stopPropagation()
          setOpen(false)
        }
      }}
    >
      {/* The goal and the length each an island, the way Settings groups its rows. */}
      <Island compact title="Goal">
        <Input autoFocus aria-label="Goal" value={goal} onChange={(event) => setGoal(event.target.value)} className="h-8 px-2.5 text-control" />
      </Island>
      <Island compact title="How long" className="mt-1">
        <Input aria-label="How long" value={length} onChange={(event) => setLength(event.target.value)} placeholder="45 min, 1:30, until 6pm" className={`h-8 px-2.5 text-control ${planned === undefined ? 'text-[var(--tt-color-text-red)]' : ''}`} />
        <div className="flex flex-wrap gap-1 p-1.5">
          {LENGTHS.map((one, index) => (
            <button key={one} type="button" onClick={() => {
              step(index)
              setLength(one)
            }} className={`rounded-md px-1.5 py-0.5 text-xs ${length === one ? 'bg-accent text-foreground' : 'hover:bg-accent/60'}`}>{one}</button>
          ))}
        </div>
      </Island>
      <Button type="submit" size="sm" variant="secondary" disabled={planned === undefined}>Start <Kbd>↵</Kbd></Button>
    </form>
  )
}

/**
 * Sessions: effort against a task, counted, with a record of what happened.
 * The recap does not ask for a summary, which gets "worked on freight rules";
 * it asks what surprised you, which is already shaped like something worth
 * keeping, and it can be kept as a nugget in the same breath.
 */
function Sessions({ taskId, title }: { taskId: string; title: string }): React.JSX.Element {
  const sessions = useLive(() => vigil.sessions(taskId), [] as Session[], [taskId])
  const running = sessions.find((session) => !session.endedAt)
  // Abandoned ones stay in the Log below, but are not counted here.
  const kept = sessions.filter((session) => !session.abandonedAt).length
  const [recap, setRecap] = useState('')
  const [tick, setTick] = useState(Date.now())
  useEffect(() => {
    if (!running) return
    const timer = setInterval(() => setTick(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [running])
  const end = (keep: boolean, close = false): void =>
    void vigil.endSession(running!.id, recap, keep, close).then(() => {
      setRecap('')
      // Every ending is heard: done, or kept as a nugget, or simply finished.
      chime(close ? 'done' : keep && recap.trim() ? 'promote' : 'resolve')
      // And the edge of the screen lights, as when the floating timer ends one.
      window.api.glow('done')
      toast(close ? 'Done, with this session as how' : keep && recap.trim() ? 'Session saved, and the recap saved as a gem' : 'Session saved')
    })

  return (
    <Island compact title={<>Sessions {kept ? <>· <Rolling text={kept} /></> : ''}</>}>
      {running ? (
        <div className="space-y-1 p-1">
          <div className="flex items-center gap-2 px-1 text-foreground">
            <span className="size-1.5 motion-safe:animate-pulse rounded-full bg-[var(--tt-color-text-red)]" />
            <span className="text-lg font-semibold tabular-nums">{clock(Math.max(0, tick - new Date(running.startedAt).getTime() - running.pausedMs - (running.pausedAt ? tick - new Date(running.pausedAt).getTime() : 0)))}</span>
          </div>
          <Textarea
            value={recap}
            onChange={(event) => setRecap(event.target.value)}
            rows={3}
            placeholder="What surprised you?"
            className="w-full resize-none text-control"
          />
          <Prop icon={Square} onClick={() => end(false)}>End session</Prop>
          <Prop icon={Check} onClick={() => end(false, true)}>End, and the task is done</Prop>
          {recap.trim() && <Prop icon={Gem} onClick={() => end(true)}>End, and keep the recap</Prop>}
        </div>
      ) : (
        <StartFocus taskId={taskId} title={title} />
      )}
      {/* The ended ones, recaps and all, are in the Log just below. */}
    </Island>
  )
}

/** A date that many days from today, at the time it had, or nine with none. */
export function shiftTo(days: number, from?: string | null): string {
  const time = from ? dayjs(from) : null
  return dayjs().add(days, 'day').hour(time ? time.hour() : 9).minute(time ? time.minute() : 0).startOf('minute').toISOString()
}

/**
 * Below the notes: what the task is about, linked from nuggets and articles,
 * then its subtasks. The linked material comes first, so opening the task is
 * looking at what it is for: review before performance, without asking.
 */
function Checklist({ task }: { task: TaskFull }): React.JSX.Element {
  const [items, setItems] = useState(task.subtasks)
  const [draft, setDraft] = useState('')
  const save = (next: typeof items): void => {
    setItems(next)
    void vigil.saveTask(task.id, { subtasks: next })
  }
  return (
    <section className="page-narrow mx-auto w-full px-12 pb-10">
      {task.linked.length > 0 && (
        <>
          <h3 className="mb-2 text-control font-semibold">For this</h3>
          <ul className="mb-6 space-y-1">
            {task.linked.map((item) => (
              <li key={item.id} className="flex items-center gap-2">
                <FileText className="size-4 text-muted-foreground" />
                <span className="truncate">{item.title || 'Untitled'}</span>
                <span className="text-xs text-muted-foreground">{typeSaid(item.tier)}</span>
              </li>
            ))}
          </ul>
        </>
      )}
      <h3 className="mb-2 text-control font-semibold">
        Subtasks {items.length ? <span className="font-normal text-muted-foreground tabular-nums"><Rolling text={`${items.filter((one) => one.done).length}/${items.length}`} /></span> : null}
      </h3>
      <ul className="space-y-1">
        {items.map((item, index) => (
          <li key={index} className="group flex items-center gap-2">
            <button
              type="button"
              role="checkbox"
              aria-checked={item.done}
              aria-label={item.text}
              onClick={() => {
                if (!item.done) chime('done')
                save(items.map((one, at) => (at === index ? { ...one, done: !one.done } : one)))
              }}
              className="flex size-4 shrink-0 items-center justify-center rounded border transition-colors"
              style={{ background: item.done ? 'var(--tt-brand-color-400)' : undefined, borderColor: item.done ? 'var(--tt-brand-color-400)' : undefined }}
            >
              {item.done && <Check className="size-3 text-primary-foreground" />}
            </button>
            <span className={`flex-1 ${item.done ? 'text-muted-foreground line-through' : ''}`}>{item.text}</span>
            <Tip label="Remove">
            <button type="button" onClick={() => save(items.filter((_, at) => at !== index))} className="rounded p-0.5 text-muted-foreground opacity-0 group-hover:opacity-100 focus-visible:opacity-100 hover:text-foreground">
              <X className="size-3.5" />
            </button>
            </Tip>
          </li>
        ))}
      </ul>
      <input
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key !== 'Enter' || !draft.trim()) return
          save([...items, { text: draft.trim(), done: false }])
          setDraft('')
        }}
        placeholder="Add a subtask"
        className="mt-1 w-full bg-transparent py-1 outline-none placeholder:text-foreground/70"
      />
    </section>
  )
}

/** What a task list can be narrowed by: the same in the main window and the prompt. */
export function taskFacets(tasks: Task[]): Facet<Task>[] {
  return [
    { key: 'marked', label: 'Marked', options: [{ id: 'important', label: 'Urgent or High' }, { id: 'deadline', label: 'Has a deadline' }, { id: 'blocked', label: 'Blocked' }, { id: 'estimate', label: 'Estimated' }],
      test: (task, mark) => (mark === 'important' ? !!task.important : mark === 'deadline' ? !!task.deadline : mark === 'blocked' ? !!task.blocker : task.estimate !== null) },
    { key: 'priority', label: 'Priority', options: [1, 2, 3, 4, 0].map((level) => ({ id: String(level), label: PRIORITY_NAMES[level] })), test: (task, level) => task.priority === Number(level) },
    { key: 'tag', label: 'Tag', options: [...new Set(tasks.flatMap((task) => splitTags(task.title).tags))].sort().map((tag) => ({ id: tag, label: `#${tag}`, icon: Tag, tint: tagTint(tag) })), test: (task, tag) => splitTags(task.title).tags.includes(tag) },
    { key: 'from', label: 'Came from', options: [{ id: 'capture', label: 'A note' }, { id: 'typed', label: 'Typed here' }], test: (task, from) => (task.fromId ? 'capture' : 'typed') === from }
  ]
}
