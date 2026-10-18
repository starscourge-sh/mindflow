import { useEffect, useMemo, useRef, useState } from 'react'
import { Highlight, useFluidHover } from './glide'
import * as chrono from 'chrono-node'
import type { JSONContent } from '@tiptap/core'
import { CalendarDays, CircleX, Plus, RotateCw, Square, Ban, Tag } from 'lucide-react'
import { tagTint } from './tag-icon'

import { MindflowEditor } from '../mindflow'
import { chime, step } from '@/lib/sound'
import { noteLinkText, typeSaid } from '@/lib/capture-links'
import { call, splitTags, unloaded, useLastAsked, useLive, vigil, when, whenInLine, type Focus, type Made, type Session, type Settings, type Task, type TaskFull } from '@/lib/vigil'
import { useOpened } from '@/lib/nav'
import { readFresh, readNow } from '@/lib/early-read'
import { BUCKETS, READY_LEADS, bucket, closeTask, gettingReady, makeTask, onToday, placed, readySaid, setReady, snooze, snoozeDays, snoozeItems, snoozed, taskName, toNoteItem } from '@/lib/tasks'
import { PRIORITY_NAMES } from '../../../../main/task-words'
import { PriorityIcon, PriorityMark, TaskInput, markRoom, planFor, setPriority } from './task-input'
import { useArrivals } from './note-list'
import { TagRow } from './pass'
import { Empty, Island, Kbd, Page, Prop, PropInput, Props, Rolling, Tags, toast, useListKeys, typing, VirtualList, Stepper, quietly } from './ui'
import { Chips, Display, arrange, useView, type Facet } from './display'
import { DayList, writeOutDay } from './day-list'
import { MatrixView } from './matrix-view'
import { readLines, tasksOf, tasksSaid } from '../../../../main/day-lines'
import { DatePicker } from './date-picker'
import { Lineage } from './lineage'
import { TaskRemindBefore } from './calendar-events'
import { TomorrowBox } from './tomorrow-lines'
import { RowMenu, copy, type RowItem } from './row-menu'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Tip } from '@/components/vigil/ui'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { LateMenu } from './late-tasks'
import { Button } from '@/components/ui/button'
import { Rest } from './scenery'
import { OptionsMenu } from './options-menu'
import { deadlineLoud, loud, loudOf } from '@/lib/loud'
import { stickOnDesktop } from './sticky-note'
import { TaskLog } from './task-log'
import { SiteBlockField } from './site-block-field'
import { RoutineNumbers, TaskFocusNumbers } from './focus-stats'
import { GlossButton, GlossLine } from './gloss-line'
import { dayjs, dayKey, num, startOfDay } from '../../../../main/dates'
import { motion } from 'motion/react'
import { EASE, shift } from '@/lib/motion'
import { notes, type Day } from '@/lib/notes'
import { ProgressBar } from './progress-bar'
import { SessionFooter } from './session-footer'
import { Example } from './example'
import { exampleTasks } from '@/lib/examples'
import { GhostText } from './ghost'
import { asideItem, useHere } from '@/lib/split'
import { budgetSaid, frogOn, markFrog, hoursSaid, minutesLeft, plannedMinutes } from '@/lib/day-plan'
import { useMeetingsLeft } from './week-fit'
import { dayClosed, openCloseDay } from './close-day'
import { abandonNow, sessionLines } from '@/lib/abandon'
import { PICKED_ROW, useTaskPick } from './task-pick'
import { FitsButton } from './fits'
import { Bell, Timer as CalendarClock, Check, FileText, Gem, History, Timer as Hourglass, ListTodo as ListChecks, Repeat, Bookmark as Telescope, Timer, X } from '@/components/ui/icons'
import { SpanPill, sessionEnd } from './session-span'
import { useMinute } from '@/lib/clock'

// Counted on the calendar, so a clock change never moves a day by an hour.
/** The day a task shows on, as a number to compare: never, for one with no day. */
const dayOf = (task: Task): number => placed(task) ?? Infinity

/** Red if the day is past, orange if it is today, quiet otherwise: the Todoist colours, the same in every list. */
export const dayTone = (iso: string | null | undefined): string | undefined => {
  if (!iso) return undefined
  const day = new Date(iso).getTime()
  if (day < startOfDay()) return 'var(--tt-color-text-red)'
  if (day < startOfDay(1)) return 'var(--tt-color-text-orange)'
  return undefined
}

/**
 * When a task is meant for, when it must be done by, and whether it repeats:
 * drawn one way, with the same words, colours and tips, in Today, Upcoming,
 * the Matrix and quick capture's Tasks.
 */
export function TaskWhen({ task }: { task: Task }): React.JSX.Element {
  return (
    <>
      {task.dueAt && (
        <TaskDate task={task} tip={loudOf(task.dueAt) === 'late' ? 'Late: the day you meant to do it has passed' : 'When you mean to do it'}>
          {/* Late or today is never small and grey: larger, medium, in a red or orange that reads (lib/loud.ts), and late says so in words. */}
          <span data-task-when {...loud(loudOf(task.dueAt), 'flex items-center gap-1')}>
            <CalendarDays className="size-3" />
            {loudOf(task.dueAt) === 'late' ? 'Late · ' : ''}{when(task.dueAt, !!task.allDay)}
          </span>
        </TaskDate>
      )}
      {task.deadline && (
        <TaskDeadline task={task}>
          <span data-task-deadline {...loud(deadlineLoud(task.deadline), 'flex items-center gap-1')}>
            <CalendarClock className="size-3" />
            Due by {whenInLine(task.deadline, !task.deadlineTimed)}
          </span>
        </TaskDeadline>
      )}
      <RepeatMark task={task} />
      {/* Hidden until a day, shown anyway; or back from it today: quiet, as a note in the margin. */}
      {snoozed(task) ? <span data-snoozed className="flex items-center gap-1"><Telescope className="size-3" />Hidden until {whenInLine(task.snoozedUntil!)}</span>
        : task.snoozedUntil === dayKey() && <span data-came-back className="flex items-center gap-1"><Telescope className="size-3" />Back today</span>}
      {gettingReady(task) && <span data-get-ready {...loud('deadline', 'flex items-center gap-1')}><CalendarClock className="size-3" />Get ready: due {whenInLine(task.deadline, !task.deadlineTimed)}</span>}
    </>
  )
}

/**
 * Hidden until a day, in a task's or a note's details: the three quick days,
 * any day, and back now. Out of every list till then; back on Today (or Home) that day.
 */
export function ShowAgain({ kind, one }: { kind: 'task' | 'capture'; one: { id: string; snoozedUntil?: string | null } }): React.JSX.Element {
  return (
    <Island compact title="Show again on">
      <div className="grid grid-cols-[repeat(auto-fit,minmax(6.5rem,1fr))] gap-1 p-1">
        {snoozeDays().map(({ label, day }) => (
          <Button variant={one.snoozedUntil === day ? 'secondary' : 'ghost'} size="sm" key={label} onClick={() => snooze(kind, one, day)} className={plan}>{label}</Button>
        ))}
      </div>
      <div data-show-again>
        <DatePicker value={one.snoozedUntil ? `${one.snoozedUntil}T12:00` : null} onChange={(iso) => snooze(kind, one, iso ? dayKey(iso) : null)} placeholder="In sight now" />
      </div>
      {snoozed(one) && <Button variant="ghost" size="sm" className="m-1" onClick={() => snooze(kind, one, null)}>Show now</Button>}
    </Island>
  )
}

/** The one thing to try on each list while it shows its example. */
const TRY_TASKS = {
  today: "type ‘call Mum Friday 6pm’ in the line above. Vigil reads the day and the time.",
  upcoming: "type ‘book seats for Hamlet on the 14th’ above. It lands on that day.",
  tomorrow: "type ‘water the plants tomorrow’ above. It waits here for the morning.",
  routines: "type ‘bins every week’ above. It comes back each week on the same day.",
  later: "type ‘learn German someday’ above. It waits here until you give it a day."
}

/** The Scheduled island's buttons: one size, and a faint fill so each reads as a button on a light page too. */
const plan = 'min-w-0 truncate bg-foreground/[0.04] px-2 text-control hover:bg-accent data-[variant=secondary]:bg-secondary'

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

/** The frog: the task picked to do first today, last night or with “Do this first today”. */
export function FrogChip(): React.JSX.Element {
  return (
    <Tip label="Picked to do first today">
      <span data-frog className="shrink-0 rounded-md px-1.5 py-px text-xs font-semibold" style={{ background: 'var(--tt-color-highlight-green)', color: 'var(--tt-color-text-green)' }}>
        One big thing
      </span>
    </Tip>
  )
}

/**
 * A mark on a task row that says something you can change (its priority, its
 * length): pressable in place, with a small fill under the pointer, opening
 * the same choices the right-click menu has. Held to itself, so the row never
 * opens or starts a drag under it.
 */
function ChipChoices({ tip, choices, children, className = '' }: { tip: string; choices: { label: string; keys?: string; on?: boolean; run: () => void }[]; children: React.ReactNode; className?: string }): React.JSX.Element {
  return (
    <DropdownMenu modal={false} onOpenChange={(open) => open && chime('open')}>
      <Tip label={tip}>
        <DropdownMenuTrigger asChild>
          <span role="button" tabIndex={0} aria-label={tip} data-chip-choices
            onClick={(event) => event.stopPropagation()} onPointerDown={(event) => event.stopPropagation()}
            onKeyDown={(event) => (event.key === 'Enter' || event.key === ' ') && event.stopPropagation()}
            className={`cursor-pointer rounded transition-colors hover:bg-accent/70 data-[state=open]:bg-accent ${className}`}>
            {children}
          </span>
        </DropdownMenuTrigger>
      </Tip>
      <DropdownMenuContent align="start" className="text-control" onClick={(event) => event.stopPropagation()}>
        {choices.map((one) => (
          <DropdownMenuItem key={one.label} onSelect={one.run} className={one.on ? 'font-semibold' : ''}>
            <span className="flex-1">{one.label}</span>
            {one.keys && <span className="text-xs text-muted-foreground">{one.keys}</span>}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** A task's priority mark, pressable: Urgent to None, with their keys. */
export function TaskPriority({ task, room = false, className }: { task: Pick<Task, 'id' | 'priority'>; room?: boolean; className?: string }): React.JSX.Element | null {
  if (!task.priority) return <PriorityMark level={0} room={room} className={className} />
  return (
    <ChipChoices tip={`Priority: ${PRIORITY_NAMES[task.priority]}. Click to change it`} className="flex p-0.5 -m-0.5"
      choices={[1, 2, 3, 4, 0].map((level) => ({ label: PRIORITY_NAMES[level], keys: String(level), on: task.priority === level, run: () => setPriority(task, level) }))}>
      <span role="img" aria-label={`Priority: ${PRIORITY_NAMES[task.priority]}`} data-mark data-priority={task.priority} className="flex shrink-0"><PriorityIcon level={task.priority} className={className ?? 'size-3 shrink-0'} /></span>
    </ChipChoices>
  )
}

/** The repeats a task can be given from its menu or its repeat mark, in the words Vigil reads when typed. */
const REPEATS = ['every day', 'every weekday', 'every week', 'every month', 'every year']
/** "every week" said as a choice: "Every week". */
const sayRepeat = (rule: string): string => rule.replace(/^every!?\s*/i, 'Every ')
/** A repeat given, changed or stopped, said with an Undo. */
export const setRepeat = (task: Pick<Task, 'id' | 'recurrence'>, rule: string | null): void => {
  if ((task.recurrence ?? null) === rule) return chime('nope')
  const was = task.recurrence ?? null
  void vigil.saveTask(task.id, { recurrence: rule }).then(() => {
    chime(rule ? 'tap' : 'off')
    toast(rule ? `Repeats ${rule}` : 'No longer repeats', () => void vigil.saveTask(task.id, { recurrence: was }))
  })
}
/** The repeat choices, with the task's own first when it is one of its own making ("every 3 days"). */
const repeatChoices = (task: Pick<Task, 'id' | 'recurrence'>): { label: string; on?: boolean; run: () => void }[] => [
  ...(task.recurrence && !REPEATS.includes(task.recurrence) ? [{ label: sayRepeat(task.recurrence), on: true, run: () => setRepeat(task, task.recurrence ?? null) }] : []),
  ...REPEATS.map((rule) => ({ label: sayRepeat(rule), on: task.recurrence === rule, run: () => setRepeat(task, rule) })),
  ...(task.recurrence ? [{ label: 'Stop repeating', run: () => setRepeat(task, null) }] : [])
]

/** A task's repeat mark, pressable: how often it comes back, changed in place. */
export function RepeatMark({ task }: { task: Pick<Task, 'id' | 'recurrence'> }): React.JSX.Element | null {
  if (!task.recurrence) return null
  return (
    <ChipChoices tip={`${sayRepeat(task.recurrence)}. Click to change how often it repeats`} className="-m-0.5 flex p-0.5" choices={repeatChoices(task)}>
      <span data-repeat-mark className="flex"><Repeat className="size-3" /></span>
    </ChipChoices>
  )
}

/** A task's length chip, pressable: the lengths its menu offers, or none. */
export function TaskLength({ task }: { task: Task }): React.JSX.Element | null {
  if (!task.estimate) return null
  return (
    <ChipChoices tip={`About ${hoursSaid(task.estimate)}. Click to change how long it takes`} className="flex shrink-0"
      choices={[...MENU_LENGTHS.map((minutes) => ({ label: hoursSaid(minutes), on: task.estimate === minutes, run: () => giveLength(task, minutes) })), { label: 'No length', run: () => giveLength(task, null) }]}>
      <LengthChip minutes={task.estimate} />
    </ChipChoices>
  )
}

/**
 * A task's date, pressable wherever it shows (a row, a card, Home's Next up):
 * the calendar opens on it with Today, Tomorrow, Next week and No date on
 * top; the change is said with an Undo (⌘Z), as a move by key is.
 */
export function TaskDate({ task, tip, children, className }: { task: Pick<Task, 'id' | 'dueAt' | 'allDay' | 'planFor'>; tip: string; children: React.ReactNode; className?: string }): React.JSX.Element {
  const change = (due: string | null): void => {
    const was = { due: task.dueAt, plan: task.planFor }
    void vigil.saveTask(task.id, { due }).then((before) => {
      toast(due ? `Moved to ${whenInLine(due, !!task.allDay)}` : 'No date now', () => void vigil.saveTask(task.id, { ...was, ...(before === true ? {} : before) }))
    })
  }
  return <DatePicker chip quick time={!task.allDay} value={task.dueAt} onChange={change} tip={`${tip}. Click to change the date`} className={className}>{children}</DatePicker>
}

/** A task's must-be-done-by day, pressable where it shows, as its date is: changed or taken off, with an Undo. */
export function TaskDeadline({ task, children }: { task: Pick<Task, 'id' | 'deadline' | 'deadlineTimed'>; children: React.ReactNode }): React.JSX.Element {
  const change = (deadline: string | null): void => {
    const was = task.deadline
    void vigil.saveTask(task.id, { deadline }).then(() => {
      chime(deadline ? 'tap' : 'off')
      toast(deadline ? `Due by ${whenInLine(deadline, !task.deadlineTimed)}` : 'No date it must be done by', () => void vigil.saveTask(task.id, { deadline: was }))
    })
  }
  return <DatePicker chip quick time={!!task.deadlineTimed} value={task.deadline} onChange={change} tip="The day it must be done by. Click to change it">{children}</DatePicker>
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
/**
 * Ticking a task off: the sound and the line through it at once, then after
 * `ms` it is done and goes. Each task ticked keeps its own line, so a second
 * tick before the first has gone never wipes the first one's.
 */
export function useTickOff(ms: number): { ticking: (id: string) => boolean; tickOff: (task: Task) => void } {
  const [ids, setIds] = useState<ReadonlySet<string>>(() => new Set())
  const tickOff = (task: Task): void => {
    if (ids.has(task.id)) return
    chime('done')
    setIds((now) => new Set(now).add(task.id))
    setTimeout(() => void completeTask(task, true).finally(() => setIds((now) => {
      const next = new Set(now)
      next.delete(task.id)
      return next
    })), ms)
  }
  return { ticking: (id) => ids.has(id), tickOff }
}

export function completeTask(task: Task, heard = false): Promise<void> {
  if (!heard) chime('done')
  const today = onToday(task)
  return vigil.doneTask(task.id).then(async (was) => {
    const back = (): void => void vigil.undoneTask(task.id, was)
    // The last of today's, from any list or window: the day is clear, and it gets an ending.
    if (today && !(await vigil.tasks()).some(onToday)) return dayCleared(back)
    // A routine says when it is back.
    if (task.recurrence) return toast(`Done · next ${whenInLine((await vigil.task(task.id))?.dueAt ?? null)}`, back)
    quietly(back)
  })
}

/** A focus session on a task, as long as its estimate or 25 minutes: the timer floats over everything. */
export const startOn = (task: Pick<Task, 'id' | 'title' | 'estimate'>): void =>
  void vigil.startSession(task.id, splitTags(task.title).text || task.title, (task.estimate ?? 25) * 60_000).then(() => {
    chime('slide')
    window.api.showFocus(true)
  })

/**
 * "Try it for 2 minutes": the smallest start there is. A focus round of two
 * minutes on the task; once it ends, carrying on is up to you.
 */
export const tryTwo = (task: Pick<Task, 'id' | 'title'>): void =>
  void vigil.startSession(task.id, splitTags(task.title).text || task.title, 2 * 60_000).then(() => {
    chime('windup')
    window.api.showFocus(true)
  })

/** Not done after all: a done task opened again, as its tick was taken back, with Undo. */
export const notDone = (task: Pick<Task, 'id' | 'dueAt' | 'deadline' | 'completedAt'>): void =>
  void vigil.undoneTask(task.id, { dueAt: task.dueAt, doneAt: task.completedAt ?? new Date().toISOString(), notifiedAt: new Date().toISOString(), deadlineAt: task.deadline })
    .then(() => (chime('back'), quietly(() => void vigil.doneTask(task.id))))

/**
 * "Pick a date…" from a menu: the task opens, its Scheduled date picker open
 * on it. Kept for a few seconds, so a panel that mounts once the task loads
 * still finds it.
 */
let dateAsked: { id: string; at: number } | null = null
export const askDate = (id: string): void => {
  dateAsked = { id, at: Date.now() }
  window.dispatchEvent(new CustomEvent('vigil:pick-date', { detail: id }))
}
const dateWanted = (id: string): boolean => !!dateAsked && dateAsked.id === id && Date.now() - dateAsked.at < 4000
/**
 * "Pick a date…" chosen anywhere: in the main window the task opens where the
 * list opens it; from the desktop sticky, a note's window or quick capture, the
 * main window comes up on the task with its calendar already open there.
 */
const pickDate = (id: string, open: () => void): void => {
  if (new URLSearchParams(location.search).get('view') === 'home') return void (askDate(id), open())
  chime('open')
  window.api.openInHome('task-date', id)
}

/** What a task's menu needs to know about the day as it is now: the session running, and today's first task. */
export type TaskNow = { focus: Focus | null; frog: string | null }
/** Read once per list, so every row's menu offers the running session's own lines and the frog as they are. */
export function useTaskNow(): TaskNow {
  const focus = useLive(vigil.focusNow, null as Focus | null)
  const settings = useLive(vigil.settings, null as Awaited<ReturnType<typeof vigil.settings>> | null)
  return { focus, frog: frogOn(settings) }
}

/**
 * A task's right-click menu, the same words in every list and page that shows
 * a task: the likely things first (a focus session, done), then when, then
 * where to open it, then copies, and closing it last.
 */
/** A routine passed over this once: on to its next date, nothing counted done, with Undo. */
export function skipTask(task: Pick<Task, 'id'>): void {
  void vigil.skipTask(task.id).then(async (was) => {
    chime('later')
    toast(`Skipped · next ${whenInLine((await vigil.task(task.id))?.dueAt ?? null)}`, () => void vigil.undoneTask(task.id, was))
  })
}

/** How many times a task was carried over: each day left undone past its day, and each time it was pushed later. */
export const carried = (task: Pick<Task, 'rollovers' | 'reschedules'>): number => (task.rollovers ?? 0) + (task.reschedules ?? 0)
/** Skipped this many times in a row, a routine asks whether it is still wanted. */
export const SKIP_ASK = 3

/** The way into Someday, with no count left over to ask again; Undo puts the day and the counts back. */
const toSomeday = (task: Task): void => {
  const was = { due: task.dueAt, plan: task.planFor, rollovers: task.rollovers ?? 0, reschedules: task.reschedules }
  void vigil.saveTask(task.id, { plan: 'someday', rollovers: 0, reschedules: 0 }).then(() => {
    chime('later')
    toast('Moved to Someday', () => void vigil.saveTask(task.id, { due: was.due, plan: was.plan, rollovers: was.rollovers, reschedules: was.reschedules }))
  })
}

/** The carried count cleared as the task is given a day or made smaller; ⌘Z puts it back. */
const freshCount = (task: Task): Promise<unknown> => {
  const was = { rollovers: task.rollovers ?? 0, reschedules: task.reschedules }
  return vigil.saveTask(task.id, { rollovers: 0, reschedules: 0 }).then(() => quietly(() => void vigil.saveTask(task.id, was)))
}

/**
 * The two questions a task asks of you, on its row and when it is open: after
 * being carried over too often, schedule it, drop it or move it to Someday;
 * after a routine is skipped again and again, is it still wanted? Never a
 * verdict, and every answer can be taken back.
 */
export function TaskAsk({ task, ask, onPick, onClose, className = '' }: { task: Task; ask: number; onPick: () => void; onClose?: () => void; className?: string }): React.JSX.Element | null {
  if (task.status !== 'open') return null
  const times = carried(task)
  const skipped = !!task.recurrence && (task.skips ?? 0) >= SKIP_ASK
  if (!skipped && (task.recurrence || times < ask)) return null
  const box = `data-task-ask flex w-full flex-wrap items-center gap-x-1 gap-y-1 rounded-lg bg-foreground/[0.04] py-1 pr-1 pl-3 ${className}`
  if (skipped)
    return (
      <div data-task-ask="skips" className={box} onClick={(event) => event.stopPropagation()}>
        <span className="mr-auto min-w-[min(14rem,100%)] flex-1 text-[0.9375rem] font-medium text-pretty text-foreground">Skipped {num(task.skips ?? 0)} times. Still want this, or was it only the idea?</span>
        <Button variant="ghost" size="sm" onClick={() => {
          const was = task.skips ?? 0
          void vigil.saveTask(task.id, { skips: 0 }).then(() => (chime('settled'), toast('Kept', () => void vigil.saveTask(task.id, { skips: was }))))
        }}>Keep it</Button>
        <Button variant="ghost" size="sm" onClick={() => closeTask(task.id, onClose)}>Let it go <span className="font-normal">(to the Bin)</span></Button>
      </div>
    )
  return (
    <div data-task-ask="carried" className={box} onClick={(event) => event.stopPropagation()}>
      <span className="mr-auto min-w-[min(14rem,100%)] flex-1 text-[0.9375rem] font-medium text-pretty text-foreground">Carried over {num(times)} times. Give it a real day, drop it, or move it to Someday?</span>
      <Button variant="ghost" size="sm" onClick={() => void freshCount(task).then(() => pickDate(task.id, onPick))}>Pick a date</Button>
      <Button variant="ghost" size="sm" onClick={() => toSomeday(task)}>Someday</Button>
      {/* The older answer, kept: smaller, by a new name. The name is selected to write over, wherever the task is open. */}
      <Button variant="ghost" size="sm" onClick={() => void freshCount(task).then(() => {
        onPick()
        setTimeout(() => document.querySelector<HTMLTextAreaElement>(`[data-open="${task.id}"] textarea`)?.select(), 300)
      })}>Make it smaller</Button>
      <Button variant="ghost" size="sm" onClick={() => closeTask(task.id, onClose)}>Drop it <span className="font-normal">(to the Bin)</span></Button>
    </div>
  )
}

/** "Professional", "Digital admin": a tag said as the way a task gets done. */
const howSaid = (tag: string): string => (tag.charAt(0).toUpperCase() + tag.slice(1)).replace(/[-_]/g, ' ')
/** The ways of getting things done that Vigil starts with, in this order, before any of your own tags. */
const HOW = ['professional', 'digital-admin', 'physical-admin', 'calls', 'orders']
/** Tasks grouped by how they get done (the first tag on each), not by how much they matter. */
const byHow = (list: Task[]): [string, Task[]][] => {
  const first = (task: Task): string => taskName(task.title).tags[0] ?? ''
  const tags = [...new Set(list.map(first).filter(Boolean))].sort((a, b) => (HOW.indexOf(a) + 1 || 99) - (HOW.indexOf(b) + 1 || 99) || a.localeCompare(b))
  return [...tags.map((tag): [string, Task[]] => [howSaid(tag), list.filter((task) => first(task) === tag)]), ['No tag yet', list.filter((task) => !first(task))]]
}

/** A fresh start: every open task on hold in one move, nothing deleted. Each comes back on its day, or when you open it. */
export function freshStart(): void {
  void call<{ at: string; held: number }>('tasks:fresh-start').then(({ at, held }) => {
    if (!held) return void (chime('nope'), toast('Nothing open to put on hold'))
    chime('away')
    toast(held === 1 ? 'A fresh start: 1 task on hold, in Later' : `A fresh start: ${num(held)} tasks on hold, in Later`, () => void call('tasks:fresh-undo', at).then(() => chime('unshelve')))
  })
}

/** The lengths a task can be given from its menu, as the day page offers them. */
const MENU_LENGTHS = [15, 30, 45, 60, 90, 120]
/** A length given or taken away, undoable. */
export const giveLength = (task: Task, minutes: number | null): void => {
  const was = task.estimate
  void vigil.saveTask(task.id, { estimate: minutes }).then(() => {
    chime(minutes ? 'tap' : 'off')
    // The length shows on the row: no toast, ⌘Z takes it back (as the day page does).
    quietly(() => void vigil.saveTask(task.id, { estimate: was }))
  })
}

export function taskMenu(task: Task, { open, complete = () => void completeTask(task), move = moveTo, frog, now, thought }: {
  open: () => void
  /** Opens the list's own line for a thought on it, where the list has one (the button that shows on pointing, or ;). */
  thought?: () => void
  complete?: () => void
  move?: (task: Task, days: number) => void
  /** Today's first task, where the list knows it; left out, `now`'s is used, and with neither the menu has no line for it. */
  frog?: string | null
  /** The running session and the frog, from `useTaskNow`. */
  now?: TaskNow
}): RowItem[] {
  const first = frog !== undefined ? frog : now?.frog
  const running = now?.focus && now.focus.taskId === task.id ? now.focus : null
  const open_ = task.status === 'open'
  const paused = !!running?.pausedAt
  return [
    // A session already on it: the pill's own lines, never a second start.
    // Pause in reach; showing, adding time and ending one line deeper, so the menu keeps its length.
    ...(running
      ? [
          { label: paused ? 'Resume the session' : 'Pause the session', run: () => void (paused ? vigil.resumeSession(running.id) : vigil.pauseSession(running.id)).then(() => chime(paused ? 'on' : 'off')) },
          { label: 'The session', items: [
            { label: 'Show the session', run: () => (chime('open'), window.api.showFocus(true)) },
            ...sessionLines(running).map(({ label, keys, run }) => ({ label, keys, run }))
          ] },
          'separator' as const
        ]
      : [open_ && { label: `Start a focus session${task.estimate ? `, ${hoursSaid(task.estimate)}` : ', 25 min'}`, run: () => startOn(task) }, open_ && { label: 'Try it for 2 minutes', run: () => tryTwo(task) }]),
    open_ ? { label: 'Mark it done', keys: 'E', run: complete } : task.status === 'done' && !task.recurrence && { label: 'Not done', run: () => notDone(task) },
    open_ && !!task.recurrence && { label: 'Skip this time', hint: 'On to the next date, not counted as done', run: () => skipTask(task) },
    'separator',
    open_ && first !== undefined && { label: first === task.id ? 'No longer first today' : 'Do this first today', run: () => void (first === task.id ? markFrog(null, task.id) : ((placed(task) ?? Infinity) >= startOfDay(1) && move(task, 0), markFrog(task.id, first ?? null))) },
    open_ && { label: 'Do it today', keys: 'T', run: () => move(task, 0) },
    open_ && { label: 'Do it tomorrow', keys: 'M', run: () => move(task, 1) },
    open_ && { label: 'Pick a date…', run: () => pickDate(task.id, open) },
    // Further off in one line: next week, or no day yet in a later list.
    open_ && { label: 'Later', items: [
      { label: 'Do it next week', keys: 'W', run: () => move(task, 7) },
      'separator' as const,
      { heading: 'No day yet, for' },
      ...(Object.keys(BUCKETS) as (keyof typeof BUCKETS)[]).map((which) => ({ label: BUCKETS[which], run: () => planFor(task, which) }))
    ] },
    open_ && snoozeItems('task', task, open),
    open_ && !!task.deadline && { label: task.getReady ? `Get ready ${readySaid(task.getReady)}` : 'Get ready…', items: [...READY_LEADS.map((days) => ({ label: readySaid(days), run: () => setReady(task, days) })), ...(task.getReady ? ['separator' as const, { label: 'No get-ready day', run: () => setReady(task, null) }] : [])] },
    open_ && { label: task.recurrence ? `Repeats: ${sayRepeat(task.recurrence).toLowerCase()}` : 'Repeat', items: repeatChoices(task) },
    open_ && { label: 'Priority', items: [1, 2, 3, 4, 0].map((level) => ({ label: PRIORITY_NAMES[level], keys: String(level), run: () => setPriority(task, level) })) },
    // The length the day page offers on pointing, here too, so it is found without hovering.
    open_ && { label: task.estimate ? `How long it takes: ~${hoursSaid(task.estimate)}` : 'How long it takes', items: [...MENU_LENGTHS.map((minutes) => ({ label: hoursSaid(minutes), run: () => giveLength(task, minutes) })), ...(task.estimate ? ['separator' as const, { label: 'No length', run: () => giveLength(task, null) }] : [])] },
    'separator',
    { label: 'Open', keys: '↵', run: open },
    asideItem('task', task.id),
    thought && { label: 'Add a thought…', keys: ';', run: thought },
    'separator',
    { label: 'Copy link', hint: 'Paste it into any note to link here', run: () => copy(noteLinkText(`task:${task.id}`, splitTags(task.title).text || task.title), 'Copied a link: paste it into any note') },
    { label: 'Copy the task', run: () => copy(splitTags(task.title).text || task.title, 'Task copied') },
    'separator',
    // Said as every list says it, so a task picked with ⌘A reads the same as a note: ⌫ does it.
    open_ && toNoteItem([task.id]),
    open_ && { label: 'Move to the Bin', hint: 'Closed without doing; it can come back', keys: '⌫', danger: true, run: () => closeTask(task.id) }
  ]
}

/** Small counts said in words: "All five done". */
const WORDS = ['none', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine']

/** On Today's list, as every list counts it: open, not waiting on anyone, and today's or late. */
export { onToday }

/**
 * Today's list just cleared: a soft open chord after the tick's own sound,
 * the words, and one next step, Close the day, where that sheet lives and the
 * day is not closed yet. Today's page hears it too, and rises into its rest.
 */
export function dayCleared(back: () => void): void {
  setTimeout(() => chime('clear'), 240)
  window.dispatchEvent(new CustomEvent('vigil:day-cleared'))
  const home = new URLSearchParams(location.search).get('view') === 'home'
  toast('That is everything for today', back, 'success',
    home && !dayClosed() ? { label: 'Close the day', key: 'c', run: () => openCloseDay() } : undefined)
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
    : 'Added to Upcoming, with no day yet: put a day in the words to date it'
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
export function TasksView({ mode, focus, onOpen }: { mode: 'today' | 'tomorrow' | 'upcoming' | 'routines' | 'later'; focus?: string; onOpen?: (type: string, id: string) => void }): React.JSX.Element {
  const real = useLive(vigil.tasks, [] as Task[])
  // What a fresh start holds: its own list at the foot of Later, each one back the moment it is opened.
  const held = useLive(() => (mode === 'later' ? call<Task[]>('tasks:held') : Promise.resolve([] as Task[])), [] as Task[], [mode])
  // Nothing of this list's yet: a few made-up tasks show what it holds, dimmed and out of reach.
  const example = !unloaded(real) && !real.some((task) => task.status === 'open' && (mode === 'routines' ? !!task.recurrence : mode === 'later' ? !!bucket(task) : mode === 'upcoming' ? !task.recurrence : true)) && !held.length
  const examples = useMemo(exampleTasks, [])
  const tasks = example ? examples : real
  // Opened from elsewhere with its words already read: on them from the first frame.
  const [open, setOpen] = useState<TaskFull | null>(() => (focus ? readNow<TaskFull>('task', focus) ?? null : null))
  const [draft, setDraft] = useState('')
  const { ticking: leaving, tickOff: complete } = useTickOff(280)
  // The row a thought is being written under, without opening the task.
  const [glossing, setGlossing] = useState<string | null>(null)

  const [view, setView] = useView(`tasks:${mode}`, { sort: 'manual', group: 'when' })
  // Written out: Today as a page you write (day-list.tsx), chosen here, from ⌘K, or by writing on an empty day.
  const written = mode === 'today' && view.group === 'page'
  const writeIt = (): void => void (view.group !== 'page' && setView({ ...view, group: 'page' }))
  // Or as the Matrix: only today's tasks, in its four boxes; the Matrix's own keys and drags take over.
  const matrixed = mode === 'today' && view.group === 'matrix'
  useEffect(() => {
    if (mode !== 'today') return
    window.addEventListener('vigil:write-day', writeIt)
    return () => window.removeEventListener('vigil:write-day', writeIt)
  })
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
  // off to a later list waits there, out of the lists with days, except on the
  // day it comes back from hiding: then it is on Today too, saying "Back today",
  // as the sidebar's count (onToday) has it.
  const live = chosenTasks.filter((task) => task.status === 'open' && !task.waitingOn && (mode === 'later' ? !!bucket(task) : !bucket(task) || !!task.deadline || (mode === 'today' && task.snoozedUntil === dayKey())) && (mode === 'routines' ? task.recurrence : !task.recurrence || mode === 'today'))
  const waiting = mode === 'upcoming' ? chosenTasks.filter((task) => task.status === 'open' && task.waitingOn) : []
  const base = mode === 'today' ? live.filter((task) => dayOf(task) < startOfDay(1)) : mode === 'tomorrow' ? live.filter((task) => dayOf(task) >= startOfDay(1) && dayOf(task) < startOfDay(2)) : live
  // Pull, the gentlest of the three: a task whose time has come rises to the
  // top of Today instead of making a noise. Looked at again each minute.
  const settings = useLive(vigil.settings, null as Awaited<ReturnType<typeof vigil.settings>> | null)
  // Calendar meetings still to come today: the day's budget leaves them out of the time left.
  const meetingsLeft = useMeetingsLeft(settings?.dayEnd)
  const notify = settings?.notify
  const carryAsk = Math.max(2, settings?.carryAsk ?? 5)
  // Tomorrow's first task, picked when the day was closed: it leads Today on its day.
  const frog = mode === 'today' ? frogOn(settings) : null
  const now = useTaskNow()
  const [, minute] = useState(0)
  useEffect(() => {
    const every = setInterval(() => minute((n) => n + 1), 60_000)
    return () => clearInterval(every)
  }, [])
  const come = (task: Task): boolean =>
    (task.notify ?? notify) === 'pull' &&
    ((!!task.dueAt && !task.allDay && Date.parse(task.dueAt) <= Date.now()) || (!!task.deadline && !!task.deadlineTimed && Date.parse(task.deadline) <= Date.now()))
  const today = base.filter((task) => dayOf(task) >= startOfDay())
  const heldGroup: [string, Task[], string?][] = mode === 'later' && !example && held.length ? [['Fresh start: on hold', held, 'held']] : []
  const groups: [string, Task[], string?][] = [...(
    view.group === 'none'
      ? [['', [...base, ...waiting]]]
      : view.group === 'note'
      ? byNote([...base, ...waiting])
      : view.group === 'tag'
      ? byHow([...base, ...waiting])
      : mode === 'tomorrow'
      ? [['Tomorrow', base]]
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
          ['One big thing', base.filter((task) => task.id === frog)],
          ['Overdue', base.filter((task) => dayOf(task) < startOfDay() && task.id !== frog)],
          ['Today', [...today.filter(come), ...today.filter((task) => !come(task))].filter((task) => task.id !== frog)]
        ]
      : [
          // By day, in the order of the days, whatever the order inside each.
          ...Object.entries(Object.groupBy(live.filter((task) => dayOf(task) >= startOfDay(1) && dayOf(task) < Infinity), (task) => startOfDay(0, dayOf(task))) as Record<string, Task[]>)
            .sort(([a], [b]) => Number(a) - Number(b))
            .map(([day, list]): [string, Task[]] => [when(new Date(Number(day)).toISOString()), list]),
          ['No date', live.filter((task) => dayOf(task) === Infinity)],
          // Chasing is not doing: what you are waiting on gets its own place.
          ['Waiting on someone', waiting]
        ]) as [string, Task[], string?][], ...heldGroup]
  const shown = groups.flatMap(([, list]) => list)
  // The priority mark's room, kept only when some task here has a mark.
  const room = markRoom(shown)
  // A task just added (or put back by Undo) eases into its row.
  const arrived = useArrivals(shown.map((task) => task.id), mode)
  // One list for the virtual scroller: each group's heading, then its tasks.
  const rows: (Task | { heading: string; count: number; key: string })[] = groups.flatMap(([heading, list, key]) => (list.length ? [{ heading, count: list.length, key: key ?? heading }, ...list] : []))
  // Only the last pick lands: a late answer for the task before is dropped.
  const asked = useLastAsked()
  const pick = (id: string): void => {
    const ready = readNow<TaskFull>('task', id)
    if (ready) return (asked(), setOpen(ready))
    asked(readFresh('task', id, vigil.task), setOpen)
  }
  // Sent here for one task, from search or a link: open it. Opening one is a step Back returns from.
  useOpened(open?.id, matrixed ? undefined : focus, pick, () => (asked(), setOpen(null)), { shown: shown.map((task) => task.id), kind: 'task' })
  const [cursor, setCursor] = useListKeys(example ? 0 : shown.length, { onOpen: (index) => pick(shown[index].id), enabled: !matrixed })
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
  // x, ⇧-click and ⌘A pick several, to do, move or close together.
  const several = useTaskPick(example || matrixed ? [] : shown, cursor, { here, off: example || matrixed })
  // One light over the rows, gliding to the nearest, as the sidebar's does: the gap between two tasks never goes dark.
  const rowsBox = useRef<HTMLDivElement>(null)
  const rowsHover = useFluidHover(rowsBox, { items: '[data-task-row]' })
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (!here() || matrixed) return
      if (typing() || event.defaultPrevented) return
      // A goes to the add-a-task field, as it does in the box's Today.
      if (event.key === 'a' && !event.metaKey && !event.ctrlKey && !event.altKey) {
        event.preventDefault()
        // Written out, A starts a new line on the page instead.
        return written ? writeOutDay() : addRef.current?.focus()
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
  // One tap, no asking: the sound and the line through it at once, then it goes (useTickOff).
  const tick = (task: Task, at: number): void => {
    const subtasks = task.subtasks ?? []
    // Unticked sounds like a switch off, as a to-do in a note does.
    chime(subtasks[at].done ? 'off' : 'done')
    void vigil.saveTask(task.id, { subtasks: subtasks.map((one, index) => (index === at ? { ...one, done: !one.done } : one)) }).then(() =>
      quietly(() => void vigil.saveTask(task.id, { subtasks })))
  }

  const actions = (
        <span className="flex items-center gap-2">
          {/* What fits in the time there is: a click from a focus session. */}
          {mode === 'today' && <FitsButton />}
          {/* Today as a list, or as a page you write: one set of tasks either way. */}
          {mode === 'today' && <Chips options={[{ id: 'list', label: 'List' }, { id: 'page', label: 'Page' }, { id: 'matrix', label: 'Matrix' }]} on={(id) => id === (written ? 'page' : matrixed ? 'matrix' : 'list')} pick={(id) => setView({ ...view, group: id === 'list' ? 'when' : id })} className="flex-nowrap" />}
          {/* The page you write on keeps its own order and shows every task: nothing in Display reaches it, so no Display.
              The Matrix places each task by itself: only the filters apply, so only they are offered.
              Page and Matrix are chosen by the chips beside it, never again as a grouping. */}
          {!written && (
            <Display
              view={view}
              onChange={setView}
              facets={facets}
              sorts={matrixed ? [{ id: view.sort, label: '' }] : [{ id: 'manual', label: 'Your order' }, { id: 'priority', label: 'Priority' }, { id: 'name', label: 'Name' }, { id: 'due', label: 'Scheduled' }, { id: 'deadline', label: 'Due by' }, { id: 'added', label: 'Date added' }]}
              groups={matrixed ? [] : [{ id: 'when', label: mode === 'later' ? 'By list' : 'By date' }, ...(mode === 'today' ? [{ id: '135', label: '1-3-5' }] : []), { id: 'tag', label: 'By how it’s done' }, { id: 'note', label: 'By note' }, { id: 'none', label: 'None' }]}
            />
          )}
          {/* Today's list on the desktop, ticked off there through the day. */}
          {mode === 'today' && <OptionsMenu label="More" side="bottom" align="end" options={[]} actions={[{ label: 'Keep Today on screen', run: () => stickOnDesktop('today', 'today') }, { label: 'Fresh start: put every open task on hold', run: freshStart }]} />}
        </span>
  )
  // The Matrix's own page, kept to the tasks the list would show: the same set, late ones too.
  if (matrixed) return <MatrixView focus={focus} onOpen={onOpen} today={{ ids: base.map((task) => task.id), done: dayDone, actions, onAll: () => onOpen?.('view', 'matrix') }} />
  return (
    <>
      <Page aside={!!open}
 title={mode} count={example ? undefined : several.chosen.length || shown.length} unit={several.chosen.length ? ['selected', 'selected'] : ['open', 'open']} actions={several.bar ?? actions}>
        {/* Today, Tomorrow and Later side by side, at the top of each: one click between the three lists. */}
        {(mode === 'today' || mode === 'tomorrow' || mode === 'later') && (
          <div data-task-lists className="mx-3 mt-2 flex @[44rem]/page:mx-6">
            <Chips options={[{ id: 'today', label: 'Today' }, { id: 'tomorrow', label: 'Tomorrow' }, { id: 'later', label: 'Later' }]} on={(id) => id === mode} pick={(id) => onOpen?.('view', id)} className="flex-nowrap text-sm" />
          </div>
        )}

        {/* Nothing on today yet, in either layout: the page to write it on. */}
        {written || (mode === 'today' && !example && !unloaded(tasks) && !shown.length && dayDone === 0) ? (
          <div className="mx-3 mt-5 mb-10 @[44rem]/page:mx-6"><DayList onWrite={writeIt} onOpenTask={pick} openId={open?.id} /></div>
        ) : (<>
        <form
          className="mx-3 mt-3 flex items-center gap-2 rounded-md border px-2 py-1.5 focus-within:border-ring"
          // A pasted list is a task a line, its indented lines their steps; one Undo for all.
          onPasteCapture={(event) => {
            const lines = tasksOf(readLines(event.clipboardData.getData('text/plain')))
            if (lines.length < 2 && !lines[0]?.steps.length) return
            event.preventDefault()
            void (async () => {
              const made: Made[] = []
              for (const line of lines) {
                const one = await vigil.addTask(line.text, undefined, mode === 'today')
                made.push(one)
                if (one.existed) continue
                if (line.steps.length) await vigil.saveTask(one.id, { subtasks: line.steps })
                if (line.done) await vigil.saveTask(one.id, { status: 'done' })
              }
              chime('promote')
              toast(`Made ${tasksSaid(lines)}`, () => void Promise.all(made.map((one) => vigil.unmakeTask(one.id, one.existed, [], []))))
            })()
          }}
          onSubmit={(event) => {
            event.preventDefault()
            if (!draft.trim()) return
            const text = draft
            setDraft('')
            // Taken back, the words are in the line again, ahead of anything typed since.
            void makeTask({ text, today: mode === 'today' }, (made) => landed(made, mode), { onUndo: () => {
              setDraft((now) => (now.trim() ? `${text} ${now}` : text))
              requestAnimationFrame(() => (addRef.current?.focus(), addRef.current?.setSelectionRange(text.length, text.length)))
            } })
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
          const left = Math.max(0, minutesLeft(settings?.dayEnd) - meetingsLeft)
          const over = planned > left
          return (
            <p data-day-budget data-said={budgetSaid(planned, left)} className="mx-3 mt-3 px-2 text-[0.9375rem] font-medium tabular-nums" style={{ color: over ? 'var(--tt-color-text-orange)' : 'var(--foreground)' }}>
              <Rolling text={budgetSaid(planned, left)} by="word" />
              {meetingsLeft > 0 && <span className="font-normal text-muted-foreground"> after {hoursSaid(meetingsLeft)} of meetings</span>}
              {over && <span className="font-normal text-muted-foreground"> · {hoursSaid(planned - left)} more than is left of today</span>}
              {!planned && <span className="font-normal text-muted-foreground"> · write ~30m on a task to give it a length</span>}
            </p>
          )
        })()}

        {/* Today kept short: the one big thing and a few more. Past that it says so, plainly, and lets you carry on. */}
        {mode === 'today' && !example && !unloaded(tasks) && (() => {
          const more = Math.min(6, Math.max(3, settings?.todayCap ?? 3))
          const over = base.length - (more + 1)
          if (over <= 0) return null
          return (
            <p data-today-cap className="mx-3 mt-2 px-2 text-[0.9375rem] font-medium text-pretty" style={{ color: 'var(--tt-color-text-orange)' }}>
              {num(base.length)} on Today: {over === 1 ? 'one more' : `${num(over)} more`} than a short day holds (one big thing and {num(more)} others).{' '}
              <span className="text-foreground">A short day gets done; the rest can wait for tomorrow or Later.</span>
            </p>
          )
        })()}

        {shown.length ? (
          <Example on={example} tryIt={TRY_TASKS[mode]}>
          <div ref={rowsBox} {...rowsHover.handlers} className="relative isolate">
          <Highlight spot={rowsHover.spot} session={rowsHover.session} snap={rowsHover.snap} className="bg-accent/50" />
          <VirtualList
            items={rows}
            keyOf={(row) => ('id' in row ? row.id : `heading-${row.key}`)}
            cursor={shown[cursor] ? rows.indexOf(shown[cursor]) : undefined}
            className="mx-3 mb-6"
          >
            {(row) => {
              if (!('id' in row))
                return row.heading ? (
                  <h2 {...loud(row.heading === 'Overdue' ? 'late' : undefined, 'mt-6 mb-1 truncate border-b px-2 pb-1.5 text-meta font-medium')}>
                    {row.heading} <span className="font-normal text-muted-foreground"><Rolling text={row.count} /></span>
                    {/* Every late one moved at once, with one Undo. */}
                    {row.heading === 'Overdue' && mode === 'today' && <LateMenu tasks={base} className="float-right -my-1.5" />}
                  </h2>
                ) : <div className="h-3" />
              const task = row
              const index = shown.indexOf(task)
              const later = bucket(task)
              const subtasks = task.subtasks ?? []
              return (
                      <RowMenu items={several.menu(task) ?? [
                        ...taskMenu(task, { open: () => pick(task.id), complete: () => complete(task), frog: frogOn(settings), now, thought: () => setGlossing(task.id) }),
                        { label: several.chosen.includes(task.id) ? 'Unselect' : 'Select', keys: 'X', run: () => several.toggle(task.id) }
                      ]}>
                      <div
                        data-id={task.id}
                        data-task-row
                        data-cursor={index === cursor || undefined}
                        className={`group group/item relative flex items-start gap-3 rounded-md px-2 py-2 transition-colors ${several.chosen.includes(task.id) ? PICKED_ROW : task.id === open?.id ? 'bg-accent' : index === cursor ? 'bg-accent/40' : ''} ${arrived(task.id) ? 'mf-arrive' : ''}`}
                      >
                        <Tip label="Complete">
                        <button
                          type="button"
                        
                          onClick={() => complete(task)}
                          // The tick shows only over the circle, never the row.
                          data-task-tick
                          className="group/tick relative mt-0.5 flex size-[18px] shrink-0 after:absolute after:-inset-[3px] after:rounded-full items-center justify-center rounded-full border-[1.5px] border-muted-foreground/60 transition-colors hover:bg-accent"
                          style={{ borderColor: dayTone(task.dueAt), background: leaving(task.id) ? 'var(--tt-color-text-green)' : undefined }}
                        >
                          <Check className={`size-3 transition-opacity ${leaving(task.id) ? 'opacity-100' : 'opacity-0 group-hover/tick:opacity-60'}`} />
                        </button>
                        </Tip>
                        {/* Its own column beside the circle, so the title and the line under it start in one place. */}
                        {room && <span className="-mx-1 mt-[3px] flex shrink-0"><TaskPriority task={task} room className="size-3.5 shrink-0" /></span>}
                        <div className="flex min-w-0 flex-1 flex-col items-start gap-1">
                        <button type="button" data-row data-id={task.id} data-picked={several.chosen.includes(task.id) || undefined} onClick={(event) => (event.shiftKey || event.metaKey ? several.toggle(task.id) : pick(task.id))} className="flex w-full min-w-0 flex-col items-start gap-1 text-left">
                          <span data-task-title className="flex max-w-full items-center gap-2">
                            {task.id === frog && <FrogChip />}
                            <span className={`truncate ${leaving(task.id) ? 'mf-strike' : ''}`}>{taskName(task.title).text}</span>
                            <Tags tags={taskName(task.title).tags} />
                            <TaskLength task={task} />
                          </span>
                          {(task.dueAt || task.recurrence || task.waitingOn || task.deadline || task.blocker || later || subtasks.length > 0 || task.snoozedUntil || carried(task) > 0) && (
                            <span data-task-meta className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                              <TaskWhen task={task} />
                              {carried(task) > 0 && !task.recurrence && (
                                <Tip label="Times it was carried over: left undone past its day, or moved later">
                                  <span data-carried={carried(task)} className="flex items-center gap-1 tabular-nums" style={carried(task) >= carryAsk ? { color: 'var(--tt-color-text-orange)', fontWeight: 500 } : undefined}>
                                    <RotateCw className="size-3" />Carried {num(carried(task))}×
                                  </span>
                                </Tip>
                              )}
                              {later && mode !== 'later' && <Tip label="No day yet: waiting in a later list"><span className="flex items-center gap-1"><Telescope className="size-3" />{BUCKETS[later]}</span></Tip>}
                              {task.waitingOn && <span>Waiting on {task.waitingOn}</span>}
                              {subtasks.length > 0 && (
                                <span className="flex items-center gap-1 tabular-nums"><ListChecks className="size-3" /><Rolling text={`${subtasks.filter((one) => one.done).length}/${subtasks.length}`} /></span>
                              )}
                              {task.blocker && <span className="truncate">Blocked: {task.blocker}</span>}
                            </span>
                          )}
                        </button>
                        {/* Grouped by note, the subtasks show under their task, tickable where they are. */}
                        {/* Grouped by note, or getting ready for its due-by day, the subtasks show under their task, tickable where they are. */}
                        {(view.group === 'note' || gettingReady(task)) && subtasks.length > 0 && (
                          <ul className="w-full space-y-0.5 pt-0.5">
                            {subtasks.map((one, at) => (
                              <li key={at} className="flex items-center gap-2 text-control">
                                <button type="button" role="checkbox" aria-checked={one.done} aria-label={one.text} onClick={() => tick(task, at)}
                                  className="relative after:absolute after:-inset-[5px] after:rounded-full flex size-3.5 shrink-0 items-center justify-center rounded border transition-colors"
                                  style={{ background: one.done ? 'var(--tt-brand-color-400)' : undefined, borderColor: one.done ? 'var(--tt-brand-color-400)' : undefined }}>
                                  {one.done && <Check className="size-2.5 mf-on-accent" />}
                                </button>
                                <span className={`truncate ${one.done ? 'text-muted-foreground line-through' : ''}`}>{one.text}</span>
                              </li>
                            ))}
                          </ul>
                        )}
                        <TaskAsk task={task} ask={carryAsk} onPick={() => pick(task.id)} className="mt-1" />
                        {glossing === task.id && <GlossLine id={task.id} open onDone={() => setGlossing(null)} placeholder="A thought on it, kept with its logs" className="w-full" />}
                        </div>
                        {/* A thought without opening it: on hover, in the row's own line, so it never lands on the title. */}
                        <GlossButton className="static -mt-0.5 shrink-0" onClick={() => setGlossing(task.id)} />
                      </div>
                      </RowMenu>
              )
            }}
          </VirtualList>
          </div>
          </Example>
        ) : unloaded(tasks) ? null : mode === 'today' && dayDone > 0 ? (
          // Everything for today done: not an empty list but the end of the day's list, said as one.
          <Rest seed="today">
            <motion.div data-day-cleared initial={cleared ? { opacity: 0, transform: shift('translateY(8px)') } : false} animate={{ opacity: 1, transform: shift('translateY(0px)') }} transition={{ duration: 0.3, ease: EASE, delay: 0.12 }}>
              <Empty shaped title={dayDone === 1 ? 'The one task, done' : dayDone === 2 ? 'Both done' : `All ${dayDone < WORDS.length ? WORDS[dayDone] : num(dayDone)} done`}
                action={dayClosed()
                  ? <Button variant="secondary" size="sm" onClick={() => (chime('open'), onOpen?.('view', 'upcoming'))}>See what is next</Button>
                  : <Button variant="secondary" size="sm" onClick={() => openCloseDay()}>Close the day</Button>}>
                The rest of the day is yours.
              </Empty>
            </motion.div>
          </Rest>
        ) : (
          <Rest seed="today" off={mode !== 'today'}>
          <Empty title={mode === 'today' ? 'Nothing due today' : mode === 'tomorrow' ? 'Nothing for tomorrow yet' : mode === 'routines' ? 'No routines' : mode === 'later' ? 'Nothing put off' : 'Nothing coming up'}>
            {mode === 'routines'
              ? 'A routine is a task that repeats, kept here so it does not crowd Today. To make one, type it in the line above with how often: “bins every week”, or “water the plants every! 3 days” to count from when you last did it.'
              : mode === 'today'
              ? 'A clear day. Anything with a date lands here on the day, and anything late stays on top until it is done.'
              : mode === 'tomorrow'
              ? 'Type a task above with “tomorrow” in the words, or press M on a task to move it here.'
              : mode === 'later'
              ? 'For what has no day yet: say “this month”, “this year” or “someday” in the words, and it waits here, out of the way.'
              : 'Tasks with a date further out show here, grouped by day. Type one above with the date in the words.'}
          </Empty>
          </Rest>
        )}
        {/* In the evening: tomorrow written down before bed, a task a line (tomorrow-lines.tsx). */}
        {mode === 'today' && !example && <TomorrowBox className="mx-3 mt-6 mb-10 @[44rem]/page:mx-6" />}
        </>)}
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
  const tagField = useRef<HTMLInputElement>(null)
  // The name as typed, and its #tags apart: saved back together, so a tag still files and routes the task.
  const named = splitTags(task.title)
  const saveName = (text: string, tags: string[]): Promise<unknown> =>
    vigil.saveTask(task.id, { title: [text.trim(), ...[...new Set(tags)].map((tag) => `#${tag}`)].filter(Boolean).join(' ') || task.title })
  // "Pick a date…" from a task's menu: the Scheduled picker opens, here or as this panel first shows.
  const [dating, setDating] = useState(() => (dateWanted(first.id) ? 1 : 0))
  const settings = useLive(vigil.settings, null as Settings | null)
  useEffect(() => {
    const ask = (event: Event): void => void ((event as CustomEvent<string>).detail === first.id && setDating((n) => n + 1))
    window.addEventListener('vigil:pick-date', ask)
    return () => window.removeEventListener('vigil:pick-date', ask)
  }, [first.id])
  return (
    <div data-open={first.id} className="note-pane flex min-w-0 flex-[1.4] flex-col overflow-y-auto [--mf-padding:1rem_3.25rem] @[40rem]/page:flex-row @[40rem]/page:overflow-visible @[40rem]/page:[--mf-padding:1rem_4.75rem] @[56rem]/page:border-l [&>*:first-child]:min-h-[22rem] [&>*:first-child]:shrink-0 @[40rem]/page:[&>*:first-child]:min-h-0 @[40rem]/page:[&>*:first-child]:shrink">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col pt-6">
        {top && <div className="-mt-3 mb-1 flex px-3 @[40rem]/page:px-[4.25rem]">{top}</div>}
        {/* Where you said you would pick up, as the last session ended: on its own line, plain to see. */}
        {task.pickup && task.status === 'open' && (
          <div data-pickup-note className="page-narrow mx-auto mb-3 flex w-full items-start gap-3 px-12">
            <p className="min-w-0 flex-1 text-[0.9375rem] leading-snug text-foreground"><strong className="font-semibold">Pick up here.</strong> {task.pickup}</p>
            <Button variant="ghost" size="sm" onClick={() => void vigil.clearPickUp(task.id).then(() => chime('away'))}>Done with it</Button>
          </div>
        )}
        {/* Carried over too often, or a routine skipped again and again: the question, without a verdict. */}
        <div className="page-narrow mx-auto mb-3 w-full px-12 empty:hidden">
          <TaskAsk task={task} ask={Math.max(2, settings?.carryAsk ?? 5)} onPick={() => undefined} onClose={onClose} />
        </div>
        {/* Wraps as the page's heading does, so a long task is never cut off at the edge; Enter ends it. */}
        <textarea
          ref={title}
          rows={1}
          className="page-narrow mx-auto mb-2 block w-full shrink-0 resize-none overflow-hidden bg-transparent px-12 font-heading text-title font-semibold tracking-[-0.018em] text-balance outline-none [field-sizing:content]"
          defaultValue={named.text}
          onKeyDown={(event) => event.key === 'Enter' && (event.preventDefault(), event.currentTarget.blur())}
          onBlur={(event) => void saveName(event.target.value.replace(/\s*\n\s*/g, ' '), named.tags)}
        />
        {/* A #tag typed with the task is kept here, as a tag, never left in its name. */}
        <div data-task-tags className="page-narrow mx-auto w-full px-12">
          <TagRow tags={named.tags} field={tagField} onAdd={(tag) => void saveName(title.current?.value ?? named.text, [...named.tags, tag])}
            onRemove={(tag) => void saveName(title.current?.value ?? named.text, named.tags.filter((one) => one !== tag))} onDone={() => tagField.current?.blur()} />
        </div>
        <MindflowEditor
          toolbar={{ fixed: false }}
          placeholder="Add a description: the details, links and steps that do not fit in the name"
          documentId={`task-${task.id}`}
          defaultContent={(task.notes as JSONContent | null) ?? ''}
          onChange={(notes) => void vigil.saveTask(task.id, { notes })}
          foot={(editor) => <SessionFooter editor={editor} note={`task-${task.id}`} />}
        />
        {/* Keyed by the list itself, so a change made elsewhere (the other window, an undo) shows. */}
        <Checklist key={JSON.stringify(task.subtasks)} task={task} onOpen={onOpen} />
      </div>
      <Props>
        <Sessions taskId={task.id} title={taskName(task.title).text} />
        {/* What its sessions came to: time, the last one, how they ended. */}
        <TaskFocusNumbers taskId={task.id} estimate={task.estimate} />
        {/* What happened to it, session by session and thought by thought: never written over. */}
        <TaskLog taskId={task.id} />
        {/* When you mean to do it, Todoist's date: the day it shows on. */}
        <Island compact title="Scheduled">
          {/* Equal columns that may shrink: a narrow panel squeezes the words rather than pushing a button past its edge.
              One look for every choice here, a day or a later list; the one it is on now is lit. */}
          <div className="grid grid-cols-[repeat(auto-fit,minmax(6.5rem,1fr))] gap-1 p-1">
            {([['Today', 0], ['Tomorrow', 1], ['Next week', 7]] as const).map(([label, days]) => (
              <Button variant={days < 7 && when(task.dueAt) === label ? 'secondary' : 'ghost'} size="sm" key={label} onClick={() => moveTo(task, days)} className={plan}>
                {label}
              </Button>
            ))}
          </div>
          <DatePicker key={dating} startOpen={dating > 0} time value={task.dueAt} onChange={(due) => void vigil.saveTask(task.id, { due })} placeholder="Not scheduled" />
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
          {/* How long before it to start: it comes up on Today with its steps, "Get ready: due Friday". */}
          {task.deadline && <p className="px-2 pt-1.5 text-xs">Get ready before it</p>}
          {task.deadline && (
            <div data-get-ready-leads className="grid grid-cols-4 gap-1 p-1">
              {[null, ...READY_LEADS].map((days) => (
                <Tip key={days ?? 0} label={days ? `On Today ${readySaid(days)} it is due, with its steps` : 'No get-ready day'}>
                  <Button variant={(task.getReady ?? null) === days ? 'secondary' : 'ghost'} size="sm" className={plan} onClick={() => setReady(task, days)}>
                    {days ? (days % 7 ? `${days} days` : `${days / 7} ${days === 7 ? 'week' : 'weeks'}`) : 'None'}
                  </Button>
                </Tip>
              ))}
            </div>
          )}
        </Island>
        {task.status === 'open' && <ShowAgain kind="task" one={task} />}
        {/* Linear's four, each with its key; important is High or Urgent. */}
        {/* The chosen level said in words beside the heading: the five marks alone are a code to learn. */}
        <Island compact title="Priority" actions={<span data-priority-said className="text-control font-medium text-foreground">{PRIORITY_NAMES[task.priority ?? 0]}</span>}>
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
        {/* A timed task can remind you a while before its time too, as an event does. */}
        {task.status === 'open' && <TaskRemindBefore id={task.id} due={task.dueAt} allDay={!!task.allDay} />}
        <Island compact title="Reminder">
          <div className="grid grid-cols-4 gap-1 p-1">
            {REMINDERS.map(([level, label]) => (
              <Tip key={label} label={REMINDER_SAID[level ?? 'default']}>
                <Button variant={(task.notify ?? null) === level ? 'secondary' : 'ghost'} size="sm" className={plan}
                  onClick={() => setReminder(task, level)}>{label}</Button>
              </Tip>
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
          {/* A repeating task's last day, set or changed here as well as typed with “until”. */}
          {task.recurrence && <div data-repeat-until><DatePicker lead={task.repeatUntil ? 'Ends' : undefined} value={task.repeatUntil} onChange={(until) => void vigil.saveTask(task.id, { until })} placeholder="Repeats with no end date" /></div>}
          <p className="px-2 py-1.5 text-xs leading-relaxed">
            “every monday” keeps to the calendar. “every! 3 days” counts from the last time you did it.
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
          {/* Closed, not deleted: it waits in the Bin, and comes back with Undo or Restore. */}
          <Prop
            icon={CircleX}
            onClick={() => closeTask(task.id, onClose)
            }
          >
            Close without doing <span className="font-normal">(goes to the Bin)</span>
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

const LENGTHS = ['25 min', '45 min', '1 h', '1 h 30 min', 'until noon', 'until 6pm', 'No limit']

/**
 * Starting a focus session, the way Raycast Focus asks: a goal and how long,
 * said in words, then a timer that floats over everything until you are done.
 */
function StartFocus({ taskId, title }: { taskId: string; title: string }): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const [goal, setGoal] = useState(title)
  const [length, setLength] = useState('25 min')
  const planned = duration(length)
  // From now to when it would end, as the length is chosen: "21:24 → 21:49".
  const minute = useMinute().getTime()
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
  // The last session kept was on this task: go again, same goal and length, in one click.
  const last = useLive(vigil.lastSession, null as Awaited<ReturnType<typeof vigil.lastSession>>)
  const again = last?.taskId === taskId ? last : null
  const settings = useLive(vigil.settings, null as Settings | null)
  if (!open) return (
    <>
      {again && <Prop icon={RotateCw} onClick={() => void vigil.againSession().then((id) => (id ? (chime('anew'), window.api.showFocus(true)) : chime('nope')))}>
        Go again{again.plannedMs ? `, ${Math.max(1, Math.round(again.plannedMs / 60_000))} min` : ''}
      </Prop>}
      <Prop icon={Timer} onClick={() => {
        chime('windup')
        setOpen(true)
      }}>{again ? 'Start a new focus session' : 'Start a focus session'}</Prop>
      <Prop icon={Timer} tip="A two minute focus round: just begin, then see" onClick={() => tryTwo({ id: taskId, title })}>Try it for 2 minutes</Prop>
    </>
  )
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
        {planned !== undefined && <div data-start-span className="flex flex-wrap items-center gap-x-2 gap-y-1 px-2 pb-1.5 text-control font-medium text-foreground"><span className="whitespace-nowrap">If you start now</span><SpanPill from={minute} to={planned === null ? null : minute + planned} /></div>}
      </Island>
      {/* The sites this session keeps you off, changed here as in Settings; with blocking off, not offered. */}
      {settings?.siteBlock && (
        <Island compact title="Sites to block" className="mt-1">
          <SiteBlockField settings={settings} compact />
        </Island>
      )}
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
            {/* From when to when, moved on by a pause or ten more minutes. */}
            <SpanPill className="ml-auto" from={Date.parse(running.startedAt)} to={sessionEnd({ ...running, plannedMs: running.plannedMs ?? null }, Math.floor(tick / 60_000) * 60_000)} />
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
          {/* Given up: kept in the log below, counted toward nothing; Undo puts it back running. */}
          <Prop icon={CircleX} onClick={() => void abandonNow({ id: running.id, kind: null } as Parameters<typeof abandonNow>[0])}>Abandon, don't count it</Prop>
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
function Checklist({ task, onOpen }: { task: TaskFull; onOpen?: (type: string, id: string) => void }): React.JSX.Element {
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
              <li key={item.id}>
                {/* Each one opens, as everything listed in a panel does. */}
                <button type="button" data-for-this={item.id} disabled={!onOpen} onClick={() => onOpen?.(item.tier, item.id)} className="-mx-1.5 flex w-[calc(100%+0.75rem)] items-center gap-2 rounded-md px-1.5 py-0.5 text-left enabled:hover:bg-accent">
                  <FileText className="size-4 text-muted-foreground" />
                  <span className="truncate">{item.title || 'Untitled'}</span>
                  <span className="text-xs text-muted-foreground">{typeSaid(item.tier)}</span>
                </button>
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
          <li key={`${index}:${item.text}`} className="group flex items-center gap-2">
            <button
              type="button"
              role="checkbox"
              aria-checked={item.done}
              aria-label={item.text}
              onClick={() => {
                if (!item.done) chime('done')
                save(items.map((one, at) => (at === index ? { ...one, done: !one.done } : one)))
              }}
              className="relative after:absolute after:-inset-1 after:rounded-full flex size-4 shrink-0 items-center justify-center rounded border transition-colors"
              style={{ background: item.done ? 'var(--tt-brand-color-400)' : undefined, borderColor: item.done ? 'var(--tt-brand-color-400)' : undefined }}
            >
              {item.done && <Check className="size-3 mf-on-accent" />}
            </button>
            {/* Its words written straight into, as a line on Today's page is; ⌥↑ ⌥↓ move it. */}
            <input data-subtask={index} defaultValue={item.text} aria-label={`Step: ${item.text}`} title={item.text}
              onKeyDown={(event) => {
                if (event.key === 'Enter') return event.currentTarget.blur()
                if (!event.altKey || (event.key !== 'ArrowUp' && event.key !== 'ArrowDown')) return
                event.preventDefault()
                const to = index + (event.key === 'ArrowUp' ? -1 : 1)
                if (to < 0 || to >= items.length) return chime('nope')
                const moved = [...items]
                ;[moved[index], moved[to]] = [moved[to], moved[index]]
                chime('shift')
                save(moved)
                // The list is drawn again once saved: the caret follows the step to its new place.
                let tries = 0
                const follow = (): void => {
                  const field = document.querySelector<HTMLInputElement>(`[data-subtask="${to}"]`)
                  if (field && field.value === item.text) return field.focus()
                  if (++tries < 30) requestAnimationFrame(follow)
                }
                requestAnimationFrame(follow)
              }}
              onBlur={(event) => {
                const words = event.currentTarget.value.trim()
                if (!words) return void (event.currentTarget.value = item.text)
                if (words !== item.text) save(items.map((one, at) => (at === index ? { ...one, text: words } : one)))
              }}
              className={`min-w-0 flex-1 bg-transparent text-ellipsis outline-none focus:text-clip ${item.done ? 'text-muted-foreground line-through' : ''}`} />
            <Tip label="Remove">
            <button type="button" aria-label={`Remove “${item.text}”`} onClick={() => {
              chime('away')
              save(items.filter((_, at) => at !== index))
              quietly(() => save(items))
            }} className="rounded p-0.5 text-muted-foreground opacity-0 group-hover:opacity-100 focus-visible:opacity-100 hover:text-foreground">
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
        // A pasted list is a subtask a line, ticked ones done; one line pastes as words.
        onPaste={(event) => {
          const lines = readLines(event.clipboardData.getData('text/plain'))
          if (lines.length < 2) return
          event.preventDefault()
          chime('gather')
          save([...items, ...lines.map((line) => ({ text: line.text, done: line.done }))])
          quietly(() => save(items))
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
