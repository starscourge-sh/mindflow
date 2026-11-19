import { TabChips } from './tab-chips'
import { askFolder } from '@/lib/folders'
import { LengthMark } from './length-mark'
import { DROP_LIT, SortableList, SortableRow } from './sortable'
import { Branches } from './branches'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { Editor } from '@tiptap/core'
import { showIn } from '@/lib/same-words'
import { remindersItem } from '@/lib/reminders'
import { useToday } from '@/lib/use-today'
import { PractiseIt } from './practise-it'
import { ReadsIn, useReading } from '@/lib/reads-in'
import { Highlight, useFluidHover } from './glide'
import type { JSONContent } from '@tiptap/core'
import { CalendarDays, ChevronRight, CircleX, Inbox as InboxIcon, ListTree, Plus, RotateCw, Square, Ban, Tag } from 'lucide-react'
import { tagTint } from './tag-icon'

import { HaligtreeEditor } from '../haligtree'
import { chime, step } from '@/lib/sound'
import { typeSaid } from '@/lib/capture-links'
import { call, focusToolsShown, useFocusTools, splitTags, unloaded, useLastAsked, useLive, haligtree, when, whenInLine, type Focus, type Made, type Session, type Settings, type Task, type TaskFull } from '@/lib/haligtree'
import { useOpened } from '@/lib/nav'
import { moveToBin, useCameBack } from '@/lib/to-bin'
import { ShowInListContext, useShowInList, useShowLine } from '@/lib/show-in-list'
import { readAhead, readFresh, readNow, useAfterFirstPaint } from '@/lib/early-read'
import { NoteComing } from './note-coming'
import { fromBefore, BUCKETS, READY_LEADS, bucket, closeTask, gettingReady, makeTask, renameTask, onToday, placed, readySaid, setReady, snooze, snoozeDays, snoozeItems, snoozed, taskName, taskToNote, toNoteItem, yourOrder } from '@/lib/tasks'
import { dateIn, PRIORITY_NAMES } from '../../../../main/task-words'
import { PriorityIcon, PriorityMark, TaskInput, keptIn, markRoom, planFor, setPriority, useKept } from './task-input'
import { useArrivals } from './note-list'
import { TagRow } from './pass'
import { Empty, Island, Kbd, Page, Prop, PropInput, Props, Rolling, Tags, sayNow, toast, refuse, whyFailed, useListKeys, typing, VirtualList, Stepper, quietly, CloseBeside } from './ui'
import { Display, arrange, openDisplay, useView, type Facet } from './display'
import { ThreeMark, takeWriteDay } from './day-list'
import { DayLine, type LineHandle } from './day-line'
import { type AtLink } from './at-notes'
import { MatrixView } from './matrix-view'
import { readLines, tasksOf, tasksSaid } from '../../../../main/day-lines'
import { DatePicker } from './date-picker'
import { Lineage } from './lineage'
import { TaskRemindBefore } from './calendar-events'
import { TomorrowBox } from './tomorrow-lines'
import { RowMenu, copy, copyLinkItem, type RowItem } from './row-menu'
import { Input } from '@/components/ui/input'
import { Command, CommandItem, CommandList } from '@/components/ui/command'
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover'
import { Textarea } from '@/components/ui/textarea'
import { Tip } from '@/components/haligtree/ui'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { LateMenu } from './late-tasks'
import { Button } from '@/components/ui/button'
import { Rest } from './scenery'
import { OptionsMenu } from './options-menu'
import { deadlineLoud, loud, loudOf } from '@/lib/loud'
import { stickOnDesktop } from './sticky-note'
import { TaskLog } from './task-log'
import { LiveDot, SessionDot, TaskSpent, heldStill, useTaskTime } from './task-time'
import { SiteBlockField } from './site-block-field'
import { RoutineNumbers, TaskFocusNumbers } from './focus-stats'
import { GlossButton, GlossLine } from './gloss-line'
import { dated, dayjs, dayKey, num, startOfDay } from '../../../../main/dates'
import { motion } from 'motion/react'
import { EASE, EASING, glideWay, shift } from '@/lib/motion'
import { notes, type Day } from '@/lib/notes'
import { ProgressBar } from './progress-bar'
import { SessionFooter } from './session-footer'
import { Example } from './example'
import { exampleTasks } from '@/lib/examples'
import { GHOST, GhostText } from './ghost'
import { cn } from '@/lib/cn'
import { openItems, useHere } from '@/lib/split'
import { budgetSaid, frogOn, markFrog, hoursSaid, minutesLeft, plannedMinutes } from '@/lib/day-plan'
import { useMeetingsLeft } from './week-fit'
import { dayClosed, openCloseDay } from './close-day'
import { abandonNow, sessionLines } from '@/lib/abandon'
import { PICKED_ROW, useTaskPick } from './task-pick'
import { openFits } from './fits'
import { Bell, Timer as CalendarClock, Check, FileText, Gem, History, Timer as Hourglass, ListTodo as ListChecks, Repeat, Bookmark as Telescope, Timer, X } from '@/components/ui/icons'
import { SpanPill, sessionEnd } from './session-span'
import { useMinute } from '@/lib/clock'
import { APP_NAME } from '../../../../main/name'
import { quoted } from '../../../../main/clip'

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
  const days = snoozeDays()
  const picked = !!one.snoozedUntil && !days.some(({ day }) => day === one.snoozedUntil)
  return (
    // Folded, its heading still says the day it comes back.
    <Island compact name="Hide until" title={snoozed(one) ? `Hidden until ${dated(dayjs(one.snoozedUntil!), 'ddd D MMM')}` : 'Hide until'}>
      {/* The four choices evenly, two by two: four across has no room for their words in the details column. */}
      <div data-show-again className="grid grid-cols-2 gap-1 p-1">
        {days.map(({ label, day }) => (
          <Button variant={one.snoozedUntil === day ? 'secondary' : 'ghost'} size="sm" key={label} onClick={() => snooze(kind, one, day)} className={plan}>{label}</Button>
        ))}
        <DatePicker value={one.snoozedUntil ? `${one.snoozedUntil}T12:00` : null} onChange={(iso) => snooze(kind, one, iso ? dayKey(iso) : null)}
          className={`h-6 justify-center py-0 ${plan} ${picked ? 'bg-secondary' : ''}`}>
          <span data-pick-day className="truncate text-foreground">Pick a day…</span>
        </DatePicker>
      </div>
      {/* Said only while it is hidden: shown, there is nothing to say. */}
      {snoozed(one) && (
        <div data-hidden-until className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 px-2.5 py-1.5">
          <span className="text-control font-medium text-foreground">Hidden until {dated(dayjs(one.snoozedUntil!), 'ddd D MMM')}</span>
          <Button variant="ghost" size="sm" className="h-7 shrink-0 px-2 text-control" onClick={() => snooze(kind, one, null)}>Show now</Button>
        </div>
      )}
    </Island>
  )
}

/** The one thing to try on each list while it shows its example. */
const TRY_TASKS = {
  today: `type ‘call Mum Friday 6pm’ in the line above. ${APP_NAME} reads the day and the time.`,
  upcoming: "type ‘book seats for Hamlet on the 14th’ above. It lands on that day.",
  tomorrow: "type ‘water the plants tomorrow’ above. It waits here for the morning.",
  routines: "type ‘bins every week’ above. It comes back each week on the same day.",
  later: "type ‘learn German someday’ above. It waits here until you give it a day.",
  alltasks: "type ‘pay the gas bill friday’ above. Every task still to do shows here, late ones first."
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
  void haligtree.saveTask(task.id, { notify: level }).then(() => {
    chime(level === 'alerts' ? 'on' : level ? 'tap' : 'off')
    toast(level ? `Reminder: ${level === 'alerts' ? 'alert' : level}` : 'Reminder: as Settings says', () => void haligtree.saveTask(task.id, { notify: was }))
  })
}

/** How long a task should take, from "~30m": a small grey chip after its name. */
export function LengthChip({ minutes }: { minutes: number }): React.JSX.Element {
  return <LengthMark data-length-chip>~{hoursSaid(minutes)}</LengthMark>
}

/** The frog: the task picked to do first today, last night or with “Do this first today”. */
function FrogChip(): React.JSX.Element {
  return (
    <Tip label="Picked to do first today">
      <span data-frog className="shrink-0 rounded-md px-1.5 py-px text-xs font-semibold" style={{ background: 'var(--mf-chip-bg-green)', color: 'var(--mf-chip-ink-green)' }}>
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
            className={`relative cursor-pointer rounded transition-colors after:absolute after:-inset-1 hover:bg-accent/70 data-[state=open]:bg-accent ${className}`}>
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

/** The repeats a task can be given from its menu or its repeat mark, in the words Haligtree reads when typed. */
const REPEATS = ['every day', 'every weekday', 'every week', 'every month', 'every year']
/** "every week" said as a choice: "Every week". */
const sayRepeat = (rule: string): string => rule.replace(/^every!?\s*/i, 'Every ')
/** A repeat given, changed or stopped, said with an Undo. */
export const setRepeat = (task: Pick<Task, 'id' | 'recurrence'>, rule: string | null): void => {
  if ((task.recurrence ?? null) === rule) return chime('nope')
  const was = task.recurrence ?? null
  void haligtree.saveTask(task.id, { recurrence: rule }).then(() => {
    chime(rule ? 'tap' : 'off')
    toast(rule ? `Repeats ${rule}` : 'No longer repeats', () => void haligtree.saveTask(task.id, { recurrence: was }))
  })
}
/** A repeat's last day set, changed or taken off, said with an Undo as the repeat itself is. The picker makes the sound. */
const setRepeatEnd = (task: Pick<Task, 'id' | 'repeatUntil'>, until: string | null): void => {
  const was = task.repeatUntil ?? null
  void haligtree.saveTask(task.id, { until }).then(() => {
    toast(until ? `Repeats until ${whenInLine(until, true)}` : 'Repeats with no end date', () => void haligtree.saveTask(task.id, { until: was }))
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
  return <DatePicker chip quick time={!task.allDay} value={task.dueAt} onChange={(due, timed) => setDue(task, due, timed)} tip={`${tip}. Click to change the date`} className={className}>{children}</DatePicker>
}

/**
 * A task's day picked, from wherever its date is shown: said with Undo, and a
 * time set gives it its hour on the calendar (no longer all day).
 */
export function setDue(task: Pick<Task, 'id' | 'dueAt' | 'allDay' | 'planFor'>, due: string | null, timed = false): void {
  const was = { due: task.dueAt, plan: task.planFor, allDay: task.allDay }
  const allDay = timed ? false : !!task.allDay
  void haligtree.saveTask(task.id, { due, ...(timed ? { allDay: 0 } : {}) }).then((before) => {
    toast(due ? `Moved to ${whenInLine(due, allDay)}` : 'No date now', () => void haligtree.saveTask(task.id, { ...was, ...(before === true ? {} : before) }))
  })
}

/** A task's must-be-done-by day, pressable where it shows, as its date is: changed or taken off, with an Undo. */
function TaskDeadline({ task, children }: { task: Pick<Task, 'id' | 'deadline' | 'deadlineTimed'>; children: React.ReactNode }): React.JSX.Element {
  return <DatePicker chip quick time allDay={!task.deadlineTimed} value={task.deadline} onChange={(deadline, timed) => setDeadline(task, deadline, timed)} tip="The day it must be done by. Click to change it">{children}</DatePicker>
}

/**
 * A task's must-be-done-by day, from a row's chip or its page: said with
 * Undo, and a time set makes it due at that hour (it alerts then). The picker
 * makes the sound.
 */
function setDeadline(task: Pick<Task, 'id' | 'deadline' | 'deadlineTimed'>, deadline: string | null, timed = false): void {
  const was = { deadline: task.deadline, deadlineTimed: task.deadlineTimed ? 1 : 0 }
  const keep = timed || (!!task.deadlineTimed && !!deadline)
  void haligtree.saveTask(task.id, { deadline, deadlineTimed: keep ? 1 : 0 }).then(() => {
    toast(deadline ? `Due by ${whenInLine(deadline, !keep)}` : 'No date it must be done by', () => void haligtree.saveTask(task.id, was))
  })
}

/** Move a task to a day from now, and say where: one wording for keys, menus and buttons. */
export const moveTo = (task: Pick<Task, 'id' | 'dueAt' | 'allDay' | 'planFor'>, days: number): Promise<unknown> => {
  const due = shiftTo(days, task.dueAt)
  const was = { due: task.dueAt, plan: task.planFor }
  // Undone, the reschedule it counted and the reminder it reset go back too.
  return haligtree.saveTask(task.id, { due }).then((before) => {
    chime('tap')
    toast(`Moved to ${whenInLine(due, !task.dueAt || !!task.allDay)}`, () => void haligtree.saveTask(task.id, { ...was, ...(before === true ? {} : before) }))
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
  return haligtree.doneTask(task.id).then(async (was) => {
    const back = (): void => void haligtree.undoneTask(task.id, was)
    // The last of today's, from any list or window: the day is clear, and it gets an ending.
    if (today && !(await haligtree.tasks()).some(onToday)) return dayCleared(back)
    // A routine says when it is back.
    if (task.recurrence) return toast(`Done · next ${whenInLine((await haligtree.task(task.id))?.dueAt ?? null)}`, back)
    quietly(back)
  })
}

/** A focus session on a task, as long as its estimate or 25 minutes: the timer floats over everything. */
export const startOn = (task: Pick<Task, 'id' | 'title' | 'estimate'>): void =>
  void haligtree.startSession(task.id, splitTags(task.title).text || task.title, (task.estimate ?? 25) * 60_000).then(() => {
    chime('slide')
    window.api.showFocus(true)
  })

/**
 * "Try it for 5 minutes": the smallest start there is. A focus round of five
 * minutes on the task; once it ends, carrying on is up to you.
 */
const TRY_MINUTES = 5
const tryFive = (task: Pick<Task, 'id' | 'title'>): void =>
  void haligtree.startSession(task.id, splitTags(task.title).text || task.title, TRY_MINUTES * 60_000).then(() => {
    chime('windup')
    window.api.showFocus(true)
  })

/** Not done after all: a done task opened again, as its tick was taken back, with Undo. */
export const notDone = (task: Pick<Task, 'id' | 'dueAt' | 'deadline' | 'completedAt'>): void =>
  void haligtree.undoneTask(task.id, { dueAt: task.dueAt, doneAt: task.completedAt ?? new Date().toISOString(), notifiedAt: new Date().toISOString(), deadlineAt: task.deadline })
    .then(() => (chime('back'), quietly(() => void haligtree.doneTask(task.id))))

/**
 * "Pick a date…" from a menu: the task opens, its Scheduled date picker open
 * on it. Kept for a few seconds, so a panel that mounts once the task loads
 * still finds it.
 */
let dateAsked: { id: string; at: number } | null = null
export const askDate = (id: string): void => {
  dateAsked = { id, at: Date.now() }
  window.dispatchEvent(new CustomEvent('haligtree:pick-date', { detail: id }))
}
const dateWanted = (id: string): boolean => !!dateAsked && dateAsked.id === id && Date.now() - dateAsked.at < 4000
/**
 * "Pick a date…" chosen anywhere: in the main window the task opens where the
 * list opens it; from the desktop sticky, a note's window or quick capture, the
 * main window comes up on the task with its calendar already open there.
 */
export const pickDate = (id: string, open: () => void): void => {
  if (new URLSearchParams(location.search).get('view') === 'home') return void (askDate(id), open())
  chime('open')
  window.api.openInHome('task-date', id)
}

/** What a task's menu needs to know about the day as it is now: the session running, and today's first task. */
export type TaskNow = { focus: Focus | null; frog: string | null }
/** Read once per list, so every row's menu offers the running session's own lines and the frog as they are. */
export function useTaskNow(): TaskNow {
  const focus = useLive(haligtree.focusNow, null as Focus | null)
  const settings = useLive(haligtree.settings, null as Awaited<ReturnType<typeof haligtree.settings>> | null)
  return { focus, frog: frogOn(settings) }
}

/**
 * A task's right-click menu, the same words in every list and page that shows
 * a task: the likely things first (a focus session, done), then when, then
 * where to open it, then copies, and closing it last.
 */
/** A routine passed over this once: on to its next date, nothing counted done, with Undo. */
export function skipTask(task: Pick<Task, 'id'>): void {
  void haligtree.skipTask(task.id).then(async (was) => {
    chime('later')
    toast(`Skipped · next ${whenInLine((await haligtree.task(task.id))?.dueAt ?? null)}`, () => void haligtree.undoneTask(task.id, was))
  })
}

/** How many times a task was carried over: each day left undone past its day, and each time it was pushed later. */
export const carried = (task: Pick<Task, 'rollovers' | 'reschedules'>): number => (task.rollovers ?? 0) + (task.reschedules ?? 0)
/** Skipped this many times in a row, a routine asks whether it is still wanted. */
const SKIP_ASK = 3

/** The way into Someday, with no count left over to ask again; Undo puts the day and the counts back. */
const toSomeday = (task: Task): void => {
  const was = { due: task.dueAt, plan: task.planFor, rollovers: task.rollovers ?? 0, reschedules: task.reschedules }
  void haligtree.saveTask(task.id, { plan: 'someday', rollovers: 0, reschedules: 0 }).then(() => {
    chime('later')
    toast('Moved to Someday', () => void haligtree.saveTask(task.id, { due: was.due, plan: was.plan, rollovers: was.rollovers, reschedules: was.reschedules }))
  })
}

/** The carried count cleared as the task is given a day or made smaller; ⌘Z puts it back. */
const freshCount = (task: Task): Promise<unknown> => {
  const was = { rollovers: task.rollovers ?? 0, reschedules: task.reschedules }
  return haligtree.saveTask(task.id, { rollovers: 0, reschedules: 0 }).then(() => quietly(() => void haligtree.saveTask(task.id, was)))
}

/**
 * The two questions a task asks of you, on its row and when it is open: after
 * being carried over too often, schedule it, drop it or move it to Someday;
 * after a routine is skipped again and again, is it still wanted? Never a
 * verdict, and every answer can be taken back.
 */
function TaskAsk({ task, ask, onPick, onClose, className = '' }: { task: Task; ask: number; onPick: () => void; onClose?: () => void; className?: string }): React.JSX.Element | null {
  if (task.status !== 'open') return null
  const times = carried(task)
  const skipped = !!task.recurrence && (task.skips ?? 0) >= SKIP_ASK
  if (!skipped && (task.recurrence || times < ask)) return null
  // The question on its own line, then the answers in one even row under it, so neither is squeezed beside the other.
  const box = `data-task-ask flex w-full flex-col gap-1 rounded-lg bg-foreground/[0.04] pt-2 pr-1 pb-1 pl-3 ${className}`
  const question = 'text-[0.9375rem] font-medium text-pretty text-foreground'
  const answers = '-ml-2 flex flex-wrap items-center gap-x-0.5 gap-y-0.5'
  if (skipped)
    return (
      <div data-task-ask="skips" className={box} onClick={(event) => event.stopPropagation()}>
        <span className={question}>Skipped {num(task.skips ?? 0)} times. Still want it?</span>
        <span className={answers}>
          <Button variant="ghost" size="sm" onClick={() => {
            const was = task.skips ?? 0
            void haligtree.saveTask(task.id, { skips: 0 }).then(() => (chime('settled'), toast('Kept', () => void haligtree.saveTask(task.id, { skips: was }))))
          }}>Keep it</Button>
          <Tip label="Moves it to the Bin, with Undo"><Button variant="ghost" size="sm" data-ask-drop onClick={() => closeTask(task.id, onClose)}>Let it go</Button></Tip>
        </span>
      </div>
    )
  return (
    <div data-task-ask="carried" className={box} onClick={(event) => event.stopPropagation()}>
      <span className={question}>Carried over {num(times)} times. What now?</span>
      <span className={answers}>
        <Button variant="ghost" size="sm" onClick={() => void freshCount(task).then(() => pickDate(task.id, onPick))}>Pick a date</Button>
        <Button variant="ghost" size="sm" onClick={() => toSomeday(task)}>Someday</Button>
        {/* The older answer, kept: smaller, by a new name. The name is selected to write over, wherever the task is open. */}
        <Button variant="ghost" size="sm" onClick={() => void freshCount(task).then(() => {
          onPick()
          setTimeout(() => document.querySelector<HTMLTextAreaElement>(`[data-open="${task.id}"] textarea`)?.select(), 300)
        })}>Make it smaller</Button>
        <Tip label="Moves it to the Bin, with Undo"><Button variant="ghost" size="sm" data-ask-drop onClick={() => closeTask(task.id, onClose)}>Drop it</Button></Tip>
      </span>
    </div>
  )
}

/** "Professional", "Digital admin": a tag said as the way a task gets done. */
const howSaid = (tag: string): string => (tag.charAt(0).toUpperCase() + tag.slice(1)).replace(/[-_]/g, ' ')
/** The ways of getting things done that Haligtree starts with, in this order, before any of your own tags. */
const HOW = ['professional', 'digital-admin', 'physical-admin', 'calls', 'orders']
/** Tasks grouped by how they get done (the first tag on each), not by how much they matter. */
const byHow = (list: Task[]): [string, Task[]][] => {
  const first = (task: Task): string => taskName(task.title).tags[0] ?? ''
  const tags = [...new Set(list.map(first).filter(Boolean))].sort((a, b) => (HOW.indexOf(a) + 1 || 99) - (HOW.indexOf(b) + 1 || 99) || a.localeCompare(b, undefined, { numeric: true }))
  return [...tags.map((tag): [string, Task[]] => [howSaid(tag), list.filter((task) => first(task) === tag)]), ['No tag yet', list.filter((task) => !first(task))]]
}

/** One task back from a fresh start's hold, asked for by name: said where it went, with Undo. */
export function bringBack(task: Pick<Task, 'id' | 'title'>): void {
  void call<string | null>('task:back', task.id).then((at) => {
    if (!at) return
    chime('unshelve')
    toast(`Brought back from on hold: ${quoted(splitTags(task.title).text, 48)}`, () => void call('task:hold', task.id, at).then(() => chime('away')))
  })
}

/** A fresh start: every open task on hold in one move, nothing deleted. Each comes back on its day, or when you bring it back. */
function freshStart(): void {
  void call<{ at: string; held: number }>('tasks:fresh-start').then(({ at, held }) => {
    if (!held) return void (chime('nope'), toast('Nothing open to put on hold'))
    chime('away')
    toast(held === 1 ? 'A fresh start: 1 task on hold, folded in its tab' : `A fresh start: ${num(held)} tasks on hold, folded in their tabs`, () => void call('tasks:fresh-undo', at).then(() => chime('unshelve')))
  })
}

/**
 * Who a task is waiting on, set or cleared, said with an Undo: with no day of
 * its own it is given one three days out, to chase them, and the notice says so.
 */
const setWaiting = (task: Pick<Task, 'id' | 'waitingOn' | 'dueAt' | 'allDay' | 'planFor'>, who: string | null): void => {
  if ((task.waitingOn ?? null) === who) return
  const was = { waitingOn: task.waitingOn ?? null, due: task.dueAt, allDay: task.allDay, plan: task.planFor }
  void haligtree.saveTask(task.id, { waitingOn: who }).then(async () => {
    chime(who ? 'tap' : 'off')
    const now = await haligtree.task(task.id)
    const chase = who && !task.dueAt && now?.dueAt ? `, to chase ${whenInLine(now.dueAt, true)}` : ''
    toast(who ? `Waiting on ${who}${chase}` : 'Not waiting on anyone', () => void haligtree.saveTask(task.id, was))
  })
}

/** The lengths a task can be given from its menu, as the day page offers them. */
const MENU_LENGTHS = [15, 30, 45, 60, 90, 120]
/** A length given or taken away, undoable. */
export const giveLength = (task: Task, minutes: number | null): void => {
  const was = task.estimate
  void haligtree.saveTask(task.id, { estimate: minutes }).then(() => {
    chime(minutes ? 'tap' : 'off')
    // The length shows on the row: no toast, ⌘Z takes it back (as the day page does).
    quietly(() => void haligtree.saveTask(task.id, { estimate: was }))
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
  // A session already on it: the pill's own lines, never a second start.
  // Pause in reach; showing, adding time and ending one line deeper, so the menu keeps its length.
  const session: RowItem[] = running
    ? [
        { label: paused ? 'Resume the session' : 'Pause the session', run: () => void (paused ? haligtree.resumeSession(running.id) : haligtree.pauseSession(running.id)).then(() => chime(paused ? 'on' : 'off')) },
        { label: 'The session', items: [
          { label: 'Show the session', run: () => (chime('open'), window.api.showFocus(true)) },
          ...sessionLines(running).map(({ label, keys, run }) => ({ label, keys, run }))
        ] },
        'separator'
      ]
    : !focusToolsShown() ? [] : [open_ && { label: `Start a focus session${task.estimate ? `, ${hoursSaid(task.estimate)}` : ', 25 min'}`, run: () => startOn(task) }, open_ && { label: `Try it for ${TRY_MINUTES} minutes`, run: () => tryFive(task) }]
  const finish: RowItem[] = [
    open_ ? { label: 'Mark it done', keys: 'E', run: complete } : task.status === 'done' && !task.recurrence && { label: 'Not done', run: () => notDone(task) },
    open_ && !!task.recurrence && { label: 'Skip this time', hint: 'On to the next date, not counted as done', run: () => skipTask(task) }
  ]
  // Every way of giving it a day in one line, as its date chip has them: the menu stays short, and T, M and W still work with it open.
  const date: RowItem[] = [open_ && { label: task.dueAt ? `Date: ${when(task.dueAt, !!task.allDay)}` : 'Date', items: [
    first !== undefined && { label: first === task.id ? 'No longer first today' : 'Do this first today', run: () => void (first === task.id ? markFrog(null, task.id) : ((placed(task) ?? Infinity) >= startOfDay(1) && move(task, 0), markFrog(task.id, first ?? null))) },
    { label: 'Do it today', keys: 'T', run: () => move(task, 0) },
    { label: 'Do it tomorrow', keys: 'M', run: () => move(task, 1) },
    { label: 'Do it next week', keys: 'W', run: () => move(task, 7) },
    { label: 'Pick a date…', run: () => pickDate(task.id, open) },
    'separator' as const,
    { heading: 'No day yet, for' },
    ...(Object.keys(BUCKETS) as (keyof typeof BUCKETS)[]).map((which) => ({ label: BUCKETS[which], run: () => planFor(task, which) })),
    'separator' as const,
    snoozeItems('task', task, open)
  ] }]
  const about: RowItem[] = [
    open_ && !!task.deadline && { label: task.getReady ? `Get ready ${readySaid(task.getReady)}` : 'Get ready…', items: [...READY_LEADS.map((days) => ({ label: readySaid(days), run: () => setReady(task, days) })), ...(task.getReady ? ['separator' as const, { label: 'No get-ready day', run: () => setReady(task, null) }] : [])] },
    open_ && { label: task.recurrence ? `Repeats: ${sayRepeat(task.recurrence).toLowerCase()}` : 'Repeat', items: repeatChoices(task) },
    open_ && { label: 'Priority', items: [1, 2, 3, 4, 0].map((level) => ({ label: PRIORITY_NAMES[level], keys: String(level), run: () => setPriority(task, level) })) },
    // The length the day page offers on pointing, here too, so it is found without hovering.
    open_ && { label: task.estimate ? `How long it takes: ~${hoursSaid(task.estimate)}` : 'How long it takes', items: [...MENU_LENGTHS.map((minutes) => ({ label: hoursSaid(minutes), run: () => giveLength(task, minutes) })), ...(task.estimate ? ['separator' as const, { label: 'No length', run: () => giveLength(task, null) }] : [])] }
  ]
  const opening: RowItem[] = [
    { label: 'Open', keys: '↵', run: open },
    open_ && !!task.heldAt && { label: 'Bring it back', hint: 'Out of “On hold”, to its own place in the list', run: () => bringBack(task) },
    ...openItems('task', task.id),
    // The note under its name, to read or change (the tracker: "so how do i edit that attached file here?").
    !!task.fromId && { label: `Open ${quoted(splitTags(task.fromTitle ?? '').text || 'New note', 80)}`, hint: 'The note it came from', run: () => (chime('open'), window.dispatchEvent(new CustomEvent('haligtree:open', { detail: { type: 'capture', id: task.fromId } }))) },
    thought && { label: 'Add a thought…', keys: ';', run: thought },
    { label: 'Keep in folder…', keys: '⇧⌘M', run: () => askFolder([{ type: 'task', id: task.id }]) }
  ]
  const leaving: RowItem[] = [
    copyLinkItem(`task:${task.id}`, splitTags(task.title).text || task.title),
    { label: 'Copy the task', run: () => copy(splitTags(task.title).text || task.title, 'Task copied') },
    remindersItem(task),
    'separator',
    // Said as every list says it, so a task picked with ⌘A reads the same as a note: ⌫ does it.
    open_ && toNoteItem([task.id]),
    open_ && { label: 'Move to the Bin', hint: 'Closed without doing; it can come back', keys: '⌫', danger: true, run: () => closeTask(task.id) },
    // A done one too: off the list and out of what counts as done, coming back done at its own time with Undo.
    task.status === 'done' && { label: 'Move to the Bin', hint: 'No longer counted as done; it can come back', keys: '⌫', danger: true, run: () => void moveToBin([{ type: 'task', id: task.id, status: 'done' }]) }
  ]
  return [...session, ...finish, 'separator', ...date, ...about, 'separator', ...opening, 'separator', ...leaving]
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
  window.dispatchEvent(new CustomEvent('haligtree:day-cleared'))
  const home = new URLSearchParams(location.search).get('view') === 'home'
  toast('That is everything for today', back, 'success',
    home && !dayClosed() ? { label: 'Close the day', key: 'c', run: () => openCloseDay() } : undefined)
}

/** The list a new task landed in, said only when it is not the one you are in. */
export async function landed(made: Made, here: string): Promise<string> {
  const task = await haligtree.task(made.id)
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
/** The one Tasks row's tabs: Tomorrow and This week are the top of Upcoming; routines due today are in Today too. */
/** Every order a Tasks tab offers; a later list leaves out Scheduled, a routine Due by. */
// "Priority" orders by priority and, among the same, the soonest day: one choice, not two near-twins.
const TASK_SORTS = [{ id: 'manual', label: 'Your order' }, { id: 'priority', label: 'Priority' }, { id: 'name', label: 'Name' }, { id: 'due', label: 'Scheduled' }, { id: 'deadline', label: 'Due by' }, { id: 'added', label: 'Date added' }]
const TASK_TABS = [{ id: 'today', label: 'Today' }, { id: 'upcoming', label: 'Upcoming' }, { id: 'later', label: 'Later' }, { id: 'routines', label: 'Routines' }, { id: 'alltasks', label: 'All' }] as const

/** Every open task in one list, by when: overdue, today, tomorrow, this week, later, no date. */
/**
 * The one tab an open task lives in, so each says what it holds: a routine in
 * Routines; with a day today or before (late ones too) in Today; with a day to
 * come in Upcoming; with no day at all (someday, a month, or none named) in Later.
 */
export const homeOf = (task: Task): 'today' | 'upcoming' | 'later' | 'routines' =>
  task.recurrence ? 'routines' : dayOf(task) < startOfDay(1) ? 'today' : dayOf(task) < Infinity ? 'upcoming' : 'later'

/** The fold a fresh start's tasks wait in, at the foot of the tab each belongs to. */
const ON_HOLD = 'On hold'

const byWhen = (list: Task[]): [string, Task[]][] => {
  const weekEnd = dayjs().startOf('week').add(1, 'week').valueOf()
  const after = list.filter((task) => dayOf(task) >= weekEnd)
  return [
    ['Overdue', list.filter((task) => dayOf(task) < startOfDay())],
    ['Today', list.filter((task) => dayOf(task) >= startOfDay() && dayOf(task) < startOfDay(1))],
    ['Tomorrow', list.filter((task) => dayOf(task) >= startOfDay(1) && dayOf(task) < startOfDay(2))],
    ['This week', list.filter((task) => dayOf(task) >= startOfDay(2) && dayOf(task) < weekEnd)],
    // A day after this week, or put off to a later list (this month, this year, someday).
    ['Later', after.filter((task) => dayOf(task) < Infinity || !!bucket(task))],
    ['No date', after.filter((task) => dayOf(task) === Infinity && !bucket(task))]
  ]
}

export function TasksView({ mode, focus, onOpen, keep, lead: givenLead, said }: { mode: 'today' | 'tomorrow' | 'upcoming' | 'routines' | 'later' | 'alltasks'; focus?: string; onOpen?: (type: string, id: string) => void
  /** Only these, as a folder's page shows its own tasks (folder-view.tsx): the same list, rows and keys. */
  keep?: (task: Task) => boolean
  /** In place of the tabs at the line's left: a folder's kinds. */
  lead?: React.ReactNode
  /** A line over the list: a folder's fact and its folders. */
  said?: React.ReactNode
}): React.JSX.Element {
  // Tomorrow is the top of Upcoming: its tasks live there.
  const home = mode === 'tomorrow' ? 'upcoming' : mode
  const every = useLive(haligtree.tasks, [] as Task[])
  const real = useMemo(() => (keep && !unloaded(every) ? every.filter(keep) : every), [every, keep])
  // Drawn again at midnight: Overdue, Today and Tomorrow are the new day's when the page is left open.
  useToday()
  // What a fresh start holds stays in its own tab, folded and dimmed under "On hold" at the foot: never moved out of sight.
  // Kept by name, as the lists are: Back to this page draws it at once from what was read last, and reads afresh.
  const allHeld = useLive(() => call<Task[]>('tasks:held'), [] as Task[], [], undefined, 'tasks-held')
  const held = allHeld.filter((task) => mode === 'alltasks' || homeOf(task) === home)
  const [heldOpen, setHeldOpen] = useState(false)
  // Grouped by tag, each tag folds on its own, kept per tab: a long Later reads as a few interests, not one pile.
  const [folds, setFoldsRaw] = useState<string[]>(() => { try { return JSON.parse(localStorage.getItem(`tasks.folds.${mode}`) ?? '[]') } catch { return [] } })
  const setFolds = (next: string[]): void => (setFoldsRaw(next), void (() => { try { localStorage.setItem(`tasks.folds.${mode}`, JSON.stringify(next)) } catch { /* Not kept: fine. */ } })())
  // Late ones on a tab not their own: open when a few, folded to their red heading when many, so they never bury the tab.
  // A fold just opened: its rows ease in one after another, as a few (useArrivals) already do, so a long one never pops in at once.
  const [unfolded, setUnfolded] = useState<{ ids: string[]; at: number } | null>(null)
  const unfold = (list: Task[]): void => setUnfolded({ ids: list.map((task) => task.id), at: performance.now() })
  // Nothing of this list's yet: a few made-up tasks show what it holds, dimmed and out of reach.
  // Written in, the list is yours from the first line: the made-up tasks give way to it.
  const [writing, setWriting] = useState<{ after: string | null; /** A line above this task (⇧O) rather than under `after`. */ before?: string; step?: string; text: string } | null>(null)
  const example = !keep && !writing && !unloaded(real) && !unloaded(held) && !real.some((task) => task.status === 'open' && (mode === 'routines' ? !!task.recurrence : mode === 'later' ? homeOf(task) === 'later' : mode === 'upcoming' ? !task.recurrence : true)) && !held.length
  const examples = useMemo(exampleTasks, [])
  // A drop's new places, drawn from the moment it is let go until the saved ones come back: the list switching to your
  // own order on that drop re-sorted it by the old places first, so the task stood back where it was picked up until
  // the save came back, then jumped (17 Nov 18; 58). Let go of once the tasks read back hold them, or once any read
  // after the save has come; a save that fails puts the rows back, and says why.
  const [placing, setPlacing] = useState<{ at: Map<string, Partial<Task>>; saved: boolean } | null>(null)
  useEffect(() => {
    if (placing && (placing.saved || [...placing.at].every(([id, patch]) => { const task = real.find((one) => one.id === id); return !!task && Object.entries(patch).every(([key, value]) => task[key as keyof Task] === value) }))) setPlacing(null)
  }, [real]) // eslint-disable-line react-hooks/exhaustive-deps
  const placed = useMemo(() => (placing ? real.map((task) => (placing.at.has(task.id) ? { ...task, ...placing.at.get(task.id) } : task)) : real), [real, placing])
  const tasks = example ? examples : placed
  // Opened from elsewhere with its words already read: on them from the first frame.
  const [open, setOpen] = useState<TaskFull | null>(() => (focus ? readNow<TaskFull>('task', focus) ?? null : null))
  const [draft, setDraft] = useState('')
  const kept = useKept()
  const { ticking: leaving, tickOff: complete } = useTickOff(280)
  // The row a thought is being written under, without opening the task.
  const [glossing, setGlossing] = useState<string | null>(null)
  /** Rows whose steps are unfolded under them, hung off a tree line. */
  const [stepsOpen, setStepsOpen] = useState<ReadonlySet<string>>(new Set())
  const foldSteps = (id: string, open = !stepsOpen.has(id)): void => setStepsOpen((all) => {
    const next = new Set(all)
    if (open) next.add(id)
    else next.delete(id)
    return next
  })

  // Later starts grouped by tag, its interests apart; every other tab by date.
  const [view, setView] = useView(`tasks:${mode}`, { sort: 'manual', group: mode === 'later' ? 'tag' : 'when' })
  const focusTools = useFocusTools()
  // Today's list is written in where it stands: a new line under a task (or at the end), or a step of one.
  // "Write out my day", from the bar, ⌘K, a hint or the Powers page, puts the caret on a new line at the end.
  // The line being written: an editor line, as the "For tomorrow" box's, so @ picks a note there too (day-line.tsx).
  const lineRef = useRef<LineHandle | null>(null)
  // Moved by a key (↵ after a task is made, ⇥, ⇧⇥): the line leaving its old place is not leaving the writing.
  const moving = useRef(false)
  const startWriting = (after: string | null): void => (chime('tap'), setWriting({ after, text: '' }))
  useEffect(() => {
    if (mode !== 'today') return
    const take = (): void => void (takeWriteDay() && (view.group === 'matrix' && setView({ ...view, group: 'when' }), startWriting(null)))
    take()
    window.addEventListener('haligtree:write-day', take)
    return () => window.removeEventListener('haligtree:write-day', take)
  })
  // The written page is gone: a Today last left on it opens as the list.
  useEffect(() => void (view.group === 'page' && setView({ ...view, group: 'when' })), [view.group]) // eslint-disable-line react-hooks/exhaustive-deps
  // The caret goes to the line wherever it now stands, as soon as it is drawn.
  // Wanted until the line has it: a line drawn a moment later (the list coming in, the made-up tasks giving way) takes it as it is drawn.
  const caretWanted = useRef(false)
  const takeCaret = (line: LineHandle): void => {
    if (!line.focused()) line.focus('end')
    if (line.focused()) (caretWanted.current = false), (moving.current = false)
  }
  useLayoutEffect(() => {
    if (!writing) return
    caretWanted.current = true
    const put = (): void => void (lineRef.current && takeCaret(lineRef.current))
    // A menu still closing hands the caret back to its row as it goes: the line waits for that, then takes it.
    if (!document.querySelector('[role="menu"]')) put()
    if (!caretWanted.current) return
    // Asked from ⌘K or a right-click menu: it holds the caret until it closes and hands it back, and then it comes to the line.
    const handed = (event: FocusEvent): void => {
      if ((event.target as HTMLElement | null)?.closest?.('[role="dialog"], [role="menu"]')) return
      document.removeEventListener('focusin', handed)
      put()
    }
    document.addEventListener('focusin', handed)
    return () => document.removeEventListener('focusin', handed)
  }, [writing?.after, writing?.before, writing?.step, !writing]) // eslint-disable-line react-hooks/exhaustive-deps
  // Or as the Matrix: only today's tasks, in its four boxes; the Matrix's own keys and drags take over.
  const matrixed = mode === 'today' && view.group === 'matrix'
  const facets = taskFacets(tasks)
  // Filtered and ordered first; the view's own groups are cut from what is left.
  const [[, chosenTasks]] = arrange(tasks, view, facets, {
    name: (a, b) => a.title.localeCompare(b.title, undefined, { numeric: true }),
    priority: (a, b) => (a.priority || 5) - (b.priority || 5) || dayOf(a) - dayOf(b) || yourOrder(a, b),
    due: (a, b) => (a.dueAt ?? '9').localeCompare(b.dueAt ?? '9'),
    deadline: (a, b) => (a.deadline ?? '9').localeCompare(b.deadline ?? '9'),
    // The most pressing first, and among the same priority, the soonest day; no day last.
    prioritydue: (a, b) => (a.priority || 5) - (b.priority || 5) || dayOf(a) - dayOf(b) || yourOrder(a, b),
    // Your order alone, the one Today keeps: priority never reorders it behind your back.
    manual: yourOrder,
    added: (a, b) => b.createdAt.localeCompare(a.createdAt)
  })
  // Routines live in a view of their own, or they flood Today; what was put
  // off to a later list waits there, out of the lists with days, except on the
  // day it comes back from hiding: then it is on Today too, saying "Back today",
  // as the sidebar's count (onToday) has it.
  // Each open task has one home tab (homeOf); All has every one. Waiting ones sit in their own group of that tab.
  const open_ = chosenTasks.filter((task) => task.status === 'open')
  const live = mode === 'alltasks' ? open_ : open_.filter((task) => !task.waitingOn && (homeOf(task) === home || (mode === 'today' && !!task.recurrence && dayOf(task) < startOfDay(1))))
  const waiting = mode === 'alltasks' ? [] : open_.filter((task) => task.waitingOn && homeOf(task) === home)
  // Late lives on Today alone: every other tab says it in one quiet line that leads there, never a red group of its own.
  const lateHere = mode === 'upcoming' || mode === 'later' || mode === 'routines' ? open_.filter((task) => dayOf(task) < startOfDay() && homeOf(task) !== home) : []
  const base = mode === 'today' ? live.filter((task) => dayOf(task) < startOfDay(1)) : mode === 'tomorrow' ? live.filter((task) => dayOf(task) >= startOfDay(1) && dayOf(task) < startOfDay(2)) : live
  // Pull, the gentlest of the three: a task whose time has come rises to the
  // top of Today instead of making a noise. Looked at again each minute.
  const settings = useLive(haligtree.settings, null as Awaited<ReturnType<typeof haligtree.settings>> | null)
  // Calendar meetings still to come today: the day's budget leaves them out of the time left.
  const meetingsLeft = useMeetingsLeft(settings?.dayEnd)
  const notify = settings?.notify
  const carryAsk = Math.max(2, settings?.carryAsk ?? 5)
  // Tomorrow's first task, picked when the day was closed: it leads Today on its day.
  const frog = mode === 'today' ? frogOn(settings) : null
  const now = useTaskNow()
  // The time spent on every task here, and the session running on one: read once for the list (task-time.tsx).
  const time = useTaskTime()
  const [, minute] = useState(0)
  useEffect(() => {
    const every = setInterval(() => minute((n) => n + 1), 60_000)
    return () => clearInterval(every)
  }, [])
  const come = (task: Task): boolean =>
    (task.notify ?? notify) === 'pull' &&
    ((!!task.dueAt && !task.allDay && Date.parse(task.dueAt) <= Date.now()) || (!!task.deadline && !!task.deadlineTimed && Date.parse(task.deadline) <= Date.now()))
  const today = base.filter((task) => dayOf(task) >= startOfDay())
  // With nothing else on the tab, the fold stands open: a fresh start never leaves a tab looking empty.
  const heldShown = heldOpen || !open_.some((task) => !task.heldAt && (mode === 'alltasks' || homeOf(task) === home))
  const heldGroup: [string, Task[], string?][] = !example && held.length ? [[ON_HOLD, heldShown ? held : [], 'held']] : []
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
      ? [['Every so often', live], ['Waiting on someone', waiting]]
      : mode === 'alltasks'
      ? byWhen(live)
      : mode === 'later'
      ? [
          ...(Object.keys(BUCKETS) as (keyof typeof BUCKETS)[]).map((which) => [BUCKETS[which], live.filter((task) => bucket(task) === which)]),
          // Put off with no list named: no day, no month, no someday.
          ['No date', live.filter((task) => !bucket(task))],
          ['Waiting on someone', waiting]
        ]
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
          ['Today', [...today.filter(come), ...today.filter((task) => !come(task))].filter((task) => task.id !== frog)],
          ['Waiting on someone', waiting]
        ]
      : [
          // By day, in the order of the days, whatever the order inside each.
          ...Object.entries(Object.groupBy(live.filter((task) => dayOf(task) >= startOfDay(1) && dayOf(task) < Infinity), (task) => startOfDay(0, dayOf(task))) as Record<string, Task[]>)
            .sort(([a], [b]) => Number(a) - Number(b))
            .map(([day, list]): [string, Task[]] => [when(new Date(Number(day)).toISOString()), list]),
          // Chasing is not doing: what you are waiting on gets its own place.
          ['Waiting on someone', waiting]
        ]) as [string, Task[], string?][], ...heldGroup]
  // A task waiting on another task gets a place of its own at the foot of the
  // day lists, so blocking one never makes it seem gone: the notice names it.
  if (view.group === 'when' && (mode === 'today' || mode === 'tomorrow' || mode === 'upcoming')) {
    const blocked = groups.flatMap(([, list]) => list.filter(waitsOnTask))
    if (blocked.length) {
      for (const group of groups) group[1] = group[1].filter((task) => !waitsOnTask(task))
      groups.push([WAITS_ON_TASK, blocked, 'blocked'])
    }
  }
  // By tag, a folded tag keeps its heading and count, its tasks out of the list until it is opened again.
  const tagCounts = new Map<string, number>()
  if (view.group === 'tag') for (const group of groups) if (group[2] === undefined && group[1].length) (tagCounts.set(group[0], group[1].length), (group[2] = `fold:${group[0]}`), folds.includes(group[0]) && (group[1] = []))
  const foldedCount = [...tagCounts].reduce((sum, [tag, n]) => sum + (folds.includes(tag) ? n : 0), 0)
  const shown = groups.flatMap(([, list]) => list)
  /** Where a row stands in a fold opened this moment, for its turn to ease in; -1 for any other. */
  const fresh = (id: string): number => (unfolded && performance.now() - unfolded.at < 600 ? unfolded.ids.indexOf(id) : -1)
  // The priority mark's room, kept when any open task has a mark, on every tab alike: Later's titles start where Today's do.
  const room = markRoom(open_)
  // A task just added (or put back by Undo) eases into its row.
  const arrived = useArrivals(shown.map((task) => task.id), mode)
  // One list for the virtual scroller: each group's heading, then its tasks.
  type Row = Task | { heading: string; count: number; key: string } | { writer: true }
  /**
   * The rows with each task's place taken, in turn, by the order the list holds from a drop until its save comes back
   * (SortableList's held order, as Writing's list reads its held layout): drawn from the view's own order, a task let go
   * down Today stood back where it was picked up until the save came back, then jumped (17 Nov 18; 58).
   */
  const inOrder = (order: Task[]): Row[] => {
    let at = 0
    return rows.map((row) => ('id' in row ? order[at++] ?? row : row))
  }
  const rows: Row[] = groups.flatMap(([heading, list, key]) => (key === 'held' ? [{ heading, count: held.length, key }, ...list] : key?.startsWith('fold:') ? [{ heading, count: tagCounts.get(heading) ?? 0, key }, ...list] : list.length ? [{ heading, count: list.length, key: key ?? heading }, ...list] : []))
  // The line being written, right under the task it follows (a step is written inside its task's row), or at the end of the day's own tasks.
  if (writing && !writing.step && !example) {
    const above = writing.before ? rows.findIndex((row) => 'id' in row && row.id === writing.before) : -1
    const after = writing.after ? rows.findIndex((row) => 'id' in row && row.id === writing.after) : -1
    const foot = rows.findIndex((row) => 'key' in row && (row.key === 'held' || row.key === 'blocked' || row.key === 'Waiting on someone'))
    rows.splice(above >= 0 ? above : after >= 0 ? after + 1 : foot >= 0 ? foot : rows.length, 0, { writer: true })
  }
  // The day's three: the first three of today's tasks as the list shows them, numbered in the margin.
  const three = mode === 'today' && view.group === 'when' && !example ? shown.filter((task) => dayOf(task) < startOfDay(1) && !task.waitingOn).slice(0, 3).map((task) => task.id) : []
  // Only the last pick lands: a late answer for the task before is dropped.
  const asked = useLastAsked()
  // The one asked for while it is read: its pane and name at once, never the task before (note-coming.tsx).
  const [coming, setComing] = useState<string | null>(() => (focus && !open ? focus : null))
  // A task open beside the list: the list stands flush in its own column, with no margin for the numbers.
  const beside = !!open || !!coming
  const pick = (id: string): void => {
    const ready = readNow<TaskFull>('task', id)
    if (ready) return (asked(), setComing(null), setOpen(ready))
    if (id !== open?.id) setComing(id)
    asked(readFresh('task', id, haligtree.task), (got) => (setComing(null), setOpen(got)))
  }
  // Sent here for one task, from search or a link: open it. Opening one is a step Back returns from.
  useOpened(open?.id, matrixed ? undefined : focus, pick, () => (asked(), setComing(null), setOpen(null)), { shown: shown.map((task) => task.id), kind: 'task' })
  // The ones either side, read ahead for the stepper's ↓ and ↑.
  useEffect(() => {
    const at = shown.findIndex((one) => one.id === open?.id)
    if (at >= 0 && !example) readAhead('task', [shown[at - 1]?.id, shown[at + 1]?.id])
  }, [open?.id]) // eslint-disable-line react-hooks/exhaustive-deps
  // ↵ opens the row, as on every list; on Today, O (or ⌘↵) starts a new line under it and ⇧O one above it.
  const [cursor, setCursor] = useListKeys(example ? 0 : shown.length, { onOpen: (index) => pick(shown[index].id), enabled: !matrixed, opened: shown.findIndex((one) => one.id === (coming ?? open?.id)), onExtend: (from, to) => several.extend(shown[from]?.id, shown[to].id),
    // Esc in the list puts the open task away, as its ✕ does: never while some are picked (Esc lets those go first) or a menu is up.
    onEscape: () => void (open && !several.chosen.length && !document.querySelector('[role="menu"], [role="dialog"]') && (chime('fold'), setOpen(null))) })
  // Back from the Bin by Undo: open again if a task was open, else the keyboard on its row.
  useCameBack(shown.map((one) => one.id), (id) => (open ? pick(id) : setCursor(shown.findIndex((one) => one.id === id))))
  // “Show in list” (⌥⌘L): every group here is open, so its row is only scrolled to and lit.
  const showOpen = useShowInList(open?.id, () => undefined)
  const addRef = useRef<HTMLInputElement>(null)

  // How far through the day: what was done today (routines too) against that and what is left.
  // Not read yet (undefined) is not none done (null): "2 of 7 done" waits with the list rather than pushing it down a beat later.
  const dayRead = useLive<Day | null | undefined>(() => (mode === 'today' ? notes.day(dayKey()) : Promise.resolve(null)), undefined, [mode, dayKey()], undefined, 'tasks-day')
  const dayDone = dayRead?.done.length ?? 0
  // Every read the list is drawn from: the tasks, those on hold, the settings (the frog, "One big thing") and the day's done.
  const reading = unloaded(real) || unloaded(held) || !settings || dayRead === undefined || time.reading
  // Sent here for one task, the list waits for the frame after the task is drawn (`sent`, below).
  const [listFirst] = useState(!focus)
  const listLater = useAfterFirstPaint()
  const listShown = listFirst || listLater
  const leftToday = mode === 'today' ? real.filter(onToday).length : 0
  // Of those, the ones from earlier days: named in the count, so "to go" is not a riddle.
  const lateToday = mode === 'today' ? real.filter((task) => onToday(task) && fromBefore(task)).length : 0
  const daySaid = `${num(dayDone)} done today, ${num(leftToday)} to go${lateToday ? ` (${num(lateToday)} from before)` : ''}`
  // "2 of 5 done", the day's hours and the short-day note: only when asked for in Settings.
  const hints = settings?.dayHints === true
  // Cleared just now, in front of you: the rest rises in rather than being there.
  const [cleared, setCleared] = useState(false)
  useEffect(() => {
    const heard = (): void => setCleared(true)
    window.addEventListener('haligtree:day-cleared', heard)
    return () => window.removeEventListener('haligtree:day-cleared', heard)
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
        return addRef.current?.focus()
      }
      const task = example ? undefined : shown[cursor]
      if (!task) return
      if (mode === 'today' && !event.ctrlKey && !event.altKey && ((event.key === 'Enter' && event.metaKey) || (!event.metaKey && (event.key === 'o' || event.key === 'O')))) {
        event.preventDefault()
        return event.key === 'O' ? (chime('tap'), setWriting({ after: shown[cursor - 1]?.id ?? null, before: task.id, text: '' })) : startWriting(task.id)
      }
      // ⌥J ⌥K, or ⌥↓ ⌥↑ as on every list: the same keys move a task wherever it is shown.
      if (event.altKey && !event.metaKey && ['KeyJ', 'KeyK', 'ArrowDown', 'ArrowUp'].includes(event.code)) {
        event.preventDefault()
        const to = cursor + (event.code === 'KeyJ' || event.code === 'ArrowDown' ? 1 : -1)
        // Your order is yours alone: priority never holds a task in place.
        if (to < 0 || to >= shown.length) return
        // Renumber the list as shown, with the two swapped.
        const order = [...shown]
        ;[order[cursor], order[to]] = [order[to], order[cursor]]
        // Moving a row is choosing your own order, as in captures and nuggets:
        // the list switches to it, numbered as you saw it.
        const was = view
        if (view.sort !== 'manual') setView({ ...view, sort: 'manual' })
        chime('shift')
        void place(order.map((one) => one.id)).then(() => {
          // Said once it switches, so the sort's label never lies; Undo puts both back.
          if (was.sort !== 'manual') toast('Now in your own order', () => (setView(was), void haligtree.saveTasks(shown.map((one) => ({ id: one.id, patch: { sortOrder: one.sortOrder } })))))
        }, () => undefined)
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
    void haligtree.saveTask(task.id, { subtasks: subtasks.map((one, index) => (index === at ? { ...one, done: !one.done } : one)) }).then(() =>
      quietly(() => void haligtree.saveTask(task.id, { subtasks })))
  }

  // --- dragging on Today ----------------------------------------------------
  const sortable = mode === 'today' && !example && view.group === 'when' && !several.chosen.length
  /** Your own order saved as these ids stand, drawn so at once (`placing`). */
  const place = (order: string[], also?: { id: string; patch: Partial<Task>; save: Promise<unknown> }): Promise<unknown> => {
    const at = new Map<string, Partial<Task>>(order.map((one, n) => [one, { sortOrder: n }]))
    if (also) at.set(also.id, { ...at.get(also.id), ...also.patch })
    setPlacing({ at, saved: false })
    const ordered = order.length ? haligtree.saveTasks(order.map((one, n) => ({ id: one, patch: { sortOrder: n } }))) : Promise.resolve()
    const saving = also ? Promise.all([ordered, also.save]) : ordered
    void saving.then(() => setPlacing((now) => (now?.at === at ? { at, saved: true } : now)), (error: unknown) => (setPlacing((now) => (now?.at === at ? null : now)), refuse(`Not moved: ${whyFailed(error)}.`, 'error')))
    return saving
  }
  /**
   * Carried out of Overdue onto Today's rows: moved to today, and drawn there at once (before the row it was let go on,
   * when it was let go on one). Saved by its date alone, it stood back in Overdue until the save came back, then jumped (58).
   */
  const dropInPart = (id: string, target: string): void => {
    const task = shown.find((one) => one.id === id)
    if (!task) return
    const rest = shown.map((one) => one.id).filter((one) => one !== id)
    const before = rest.indexOf(target)
    const order = before >= 0 ? [...rest.slice(0, before), id, ...rest.slice(before)] : []
    const due = shiftTo(0, task.dueAt)
    void place(order, { id, patch: { dueAt: due }, save: moveTo(task, 0) }).catch(() => undefined)
  }
  /** A row dropped among the rows: your own order from now on, with ⌘Z. */
  const moveRow = (id: string, target: string, after: boolean): void => {
    const was = shown.map((task) => ({ id: task.id, patch: { sortOrder: task.sortOrder } }))
    const order = shown.map((task) => task.id).filter((one) => one !== id)
    order.splice(order.indexOf(target) + (after ? 1 : 0), 0, id)
    if (view.sort !== 'manual') setView({ ...view, sort: 'manual' })
    chime('shift')
    const saving = place(order)
    // Said, as a drop in Writing is (“Moved”), with its Undo.
    sayNow(saving, 'Moved', () => void haligtree.saveTasks(was))
  }
  /** A row rested on another's middle: it may become its step, unless it has steps of its own, repeats, or the other is done. */
  const nests = (id: string, target: string): true | { refused: string } | false => {
    const [task, parent] = [tasks.find((one) => one.id === id), tasks.find((one) => one.id === target)]
    if (!task || !parent || parent.status !== 'open') return false
    if (task.subtasks?.length) return { refused: 'A task with steps of its own stays a task' }
    if (task.recurrence) return { refused: 'A repeating task stays a task' }
    return true
  }
  // The part of Today each row stands in (Overdue, Today), by its heading: a date or a state puts a task there, never where it is dropped.
  const partOf = new Map(groups.flatMap(([heading, list]) => list.map((task) => [task.id, heading] as const)))
  /**
   * A row carried over another part's rows: out of Overdue into Today it is moved to today. No other part is filled
   * by dragging, and the refusal says what does put a task there.
   */
  const takenBy = (id: string, part: string): { words: string } | { refused: string } =>
    part === 'Today' && partOf.get(id) === 'Overdue' ? { words: 'Move to Today' }
    : part === 'Overdue' ? { refused: 'Its date puts a task in “Overdue”: change the date to move it' }
    : part === 'Waiting on someone' ? { refused: 'Who it waits on puts a task there: change that to move it' }
    : { refused: `What a task is puts it in “${part}”, not where it is dropped` }
  /** A row let go on another's middle: its step now, last among its steps, unfolded so it is seen; said with Undo, and ⌘Z. */
  const nestRow = (id: string, target: string): void => {
    const [task, parent] = [tasks.find((one) => one.id === id), tasks.find((one) => one.id === target)]
    if (!task || !parent) return
    const steps = parent.subtasks ?? []
    chime('tuck')
    foldSteps(target, true)
    // Said at once, so a quick ⌘Z finds it; its Undo waits for the save it takes back.
    const saved = haligtree.saveTasks([{ id: target, patch: { subtasks: [...steps, { text: task.title, done: false }] } }, { id, patch: { status: 'dropped', stepOf: target } }])
    toast(`Now a step of ${taskName(parent.title).text}`, () => void saved.then(() => haligtree.saveTasks([{ id: target, patch: { subtasks: steps } }, { id, patch: { status: task.status, stepOf: null } }])))
  }
  /** A row dropped on the Upcoming tab goes to tomorrow; on Later, to someday. Said, with Undo. */
  const dropOnTab = (id: string, place: string): void => {
    const task = shown.find((one) => one.id === id)
    if (!task) return
    if (place === 'upcoming') return void moveTo(task, 1)
    const was = { due: task.dueAt ?? null, plan: task.planFor ?? null }
    chime('later')
    sayNow(haligtree.saveTask(id, { due: null, plan: 'someday' }), 'Moved to Later, someday', () => void haligtree.saveTask(id, was))
  }

  // --- writing in Today's list ---------------------------------------------
  /** A written line made a task on Today, right under the task it was written after, in your order. Gives back its id. */
  const writeTask = async (text: string, after: string | null, before?: string, link?: AtLink): Promise<string | null> => {
    const ids = shown.map((task) => task.id)
    // A note picked with @: the task is made from it, and its name in the words is never read as a date.
    const words = text.trim()
    const made = await haligtree.addTask(words, link?.id, true, link?.plain.map(({ from, to }) => ({ from: from - text.indexOf(words), to: to - text.indexOf(words) })))
    if (made.existed) {
      chime('nope')
      toast('Already on your list, so it was not added twice', undefined, 'info')
      return made.id
    }
    chime('noted')
    const order = ids.filter((id) => id !== made.id)
    const at = before ? order.indexOf(before) : after && order.includes(after) ? order.indexOf(after) + 1 : order.length
    order.splice(at >= 0 ? at : order.length, 0, made.id)
    if (view.sort === 'manual') await haligtree.saveTasks(order.map((id, n) => ({ id, patch: { sortOrder: n } })))
    // Seen being made, so no notice: ⌘Z takes it back.
    quietly(() => void haligtree.unmakeTask(made.id, false, [], []))
    return made.id
  }
  /** A written step, put at the end of its task's steps. */
  const writeStep = (id: string, text: string): void => {
    const owner = tasks.find((task) => task.id === id)
    if (!owner) return
    const steps = owner.subtasks ?? []
    chime('bead')
    void haligtree.saveTask(id, { subtasks: [...steps, { text, done: false }] }).then(() => quietly(() => void haligtree.saveTask(id, { subtasks: steps })))
  }
  /** Out of writing: words left in the line are kept first, so nothing typed is lost. */
  const stopWriting = (keep = true, read?: { text: string; link?: AtLink }): void => {
    if (!writing) return
    const text = (read?.text ?? writing.text).trim()
    setWriting(null)
    caretWanted.current = false
    if (keep && text) void (writing.step ? writeStep(writing.step, text) : writeTask(read?.text ?? text, writing.after, writing.before, read?.link))
    // The keyboard back on the row the line was under.
    const at = shown.findIndex((task) => task.id === (writing.step ?? writing.after))
    if (at >= 0) setCursor(at)
  }
  const writeKeys = (event: KeyboardEvent, line: LineHandle): boolean => {
    if (!writing) return false
    const read = line.read()
    const text = read.text.trim()
    const plain = !event.metaKey && !event.ctrlKey && !event.altKey
    const move = (next: NonNullable<typeof writing>): void => ((moving.current = true), setWriting(next))
    if (event.key === 'Enter' && plain && !event.shiftKey) {
      // An empty step comes out a level, as in any outline; an empty line ends the writing.
      if (!text) return writing.step ? (chime('untuck'), move({ after: writing.step, text: '' }), true) : (stopWriting(false), true)
      line.clear()
      setWriting((now) => (now ? { ...now, text: '' } : now))
      if (writing.step) return (writeStep(writing.step, text), true)
      void writeTask(read.text, writing.after, writing.before, read.link).then((id) => id && ((moving.current = true), setWriting((now) => (now && !now.step ? { after: id, text: now.text } : now))))
      return true
    }
    if (event.key === 'Tab' && plain) {
      if (event.shiftKey) return writing.step ? (chime('untuck'), move({ after: writing.step, text: read.text }), true) : (chime('nope'), true)
      // A step of the task above, its words going with it; a step is as deep as a line goes.
      const above = writing.after
      if (writing.step || !above) return (chime('nope'), true)
      chime('tuck')
      return (move({ after: above, step: above, text: read.text }), true)
    }
    if (event.key === 'Backspace' && !read.text) return (chime('off'), stopWriting(false), true)
    if (event.key === 'Escape') return (event.stopPropagation(), stopWriting(true, read), true)
    return false
  }
  /** The line itself, in the list's own words: a task line or a step under its task. */
  const writeLine = (step: boolean): React.JSX.Element => (
    <DayLine key={step ? `step:${writing?.step}` : `line:${writing?.after}:${writing?.before}`} lineKey={step ? 'write-step' : 'write'} value={writing?.text ?? ''}
      // Drawn again in a new place (the list coming in, the made-up tasks giving way), it takes the caret back unless something else holds it.
      register={(line, was) => {
        if (!line) return void (lineRef.current === was && (lineRef.current = null))
        lineRef.current = line
        if ((caretWanted.current || !document.activeElement || document.activeElement === document.body) && !document.querySelector('[role="menu"]')) takeCaret(line)
      }}
      onText={(text) => setWriting((now) => (now ? { ...now, text } : now))} onKey={writeKeys}
      onLeave={(read) => void (!moving.current && stopWriting(true, read))}
      attrs={{ 'data-write-field': true }}
      className="w-full [&_.tiptap]:!text-[length:inherit] [&_.tiptap]:!leading-[inherit] [&_p]:!text-[length:inherit] [&_p]:!leading-[inherit]"
      label={step ? 'A new step' : 'A new task on Today'} placeholder={step ? 'A step, then ↵ for the next' : 'A task, then ↵ for the next: “call Sam 3pm #work !!”, @ for a note'} />
  )

  // The one row of the bar (tasks-bar.mjs): the tabs on the left, the only choice always on show; then
  // the count; then, on Today alone, "Write out my day", which puts the caret on a new line at the end of
  // Today's list; then Display and ⋯ for the rest, at the right end, where they stay on every tab.
  // Nothing in it comes or goes after a click, so nothing moves under the pointer.
  // Their pill on the list's box edge and their words on its ink edge, as every row of tabs (qa/list-edges.mjs).
  const lead = (
    <div data-list-tabs className="flex" style={{ marginLeft: 'calc(var(--list-edge) - var(--list-ink) - 3px)' }}>
      <TabChips name="tasks" tabs={TASK_TABS.map((one) => ({ value: one.id as string, label: one.label }))} value={mode} onChange={(id) => onOpen?.('view', id)}
        // Today's rows, dragged onto a tab, go there.
        drops={mode === 'today' ? { upcoming: 'upcoming', later: 'later' } : undefined} />
    </div>
  )
  // On Today alone, where it writes; the controls after it sit at the bar's right end, so nothing moves without it.
  const writeOut = mode === 'today' && (
    <Tip label="A new line at the end of the list, to write a task a line">
      <Button data-write-day variant="ghost" size="sm"
        onClick={() => (matrixed && setView({ ...view, group: 'when' }), startWriting(null))}>
        Write out my day
      </Button>
    </Tip>
  )
  const actions = (
        <span className="flex items-center gap-1">
          {writeOut}
          {/* Sort, group and filter, on every tab: its button here, F, or from ⋯, in the same place on every tab. */}
          {(
            <Display
              view={view}
              onChange={setView}
              facets={facets}
              items={tasks}
              // Only what applies on this tab: a later list has no day to sort by, a routine no due-by.
              // In the Matrix each box keeps your own order (matrix-view.tsx inBox), so that is the one it names.
              sorts={matrixed ? [{ id: view.sort, label: 'Your order' }] : TASK_SORTS.filter((one) => !(mode === 'later' && one.id === 'due') && !(mode === 'routines' && one.id === 'deadline'))}
              room={TASK_SORTS.map((one) => one.label)}
              groups={matrixed ? [] : [{ id: 'when', label: mode === 'later' ? 'By list' : mode === 'routines' ? 'Together' : 'By date' }, ...(mode === 'today' ? [{ id: '135', label: '1-3-5' }] : []), { id: 'tag', label: 'By tag' }, { id: 'note', label: 'By note' }, { id: 'none', label: 'None' }]}
            />
          )}
          <OptionsMenu label="More" side="bottom" align="end" sections={[
            { items: [
              // Today's tasks in four boxes; from another tab, every task's.
              { label: 'Urgent and important', hint: 'Your tasks in four boxes: urgent by date, important by the flag', on: matrixed, set: (on) => (mode === 'today' ? setView({ ...view, group: on ? 'matrix' : 'when' }) : onOpen?.('view', 'matrix')) },
              { label: 'Your order', hint: 'In the order you set with ⌥J and ⌥K, not by date', on: view.sort === 'manual', set: (on) => setView({ ...view, sort: on ? 'manual' : 'due' }) },
              { label: 'Sort, group and filter…', keys: 'F', run: () => void setTimeout(openDisplay, 0) }
            ] },
            // Things to do, apart from the ways to see the list above: never one more tick among them.
            { items: [
              ...(focusTools ? [{ label: 'I have 15 min', hint: 'What fits in the time you have, to start one', run: () => openFits() }] : []),
              { label: 'Stick Today on the desktop', run: () => stickOnDesktop('today', 'today') },
              { label: 'Fresh start: put every open task on hold', run: freshStart }
            ] }
          ]} />
        </span>
  )
  // The Matrix's own page, kept to the tasks the list would show: the same set, late ones too.
  // Sent here for one task: the task is drawn first and the list beside it
  // the frame after, whole (Page's `apart`), so it never waits behind every row.
  const sent = !!focus && !matrixed && (coming ?? open?.id) === focus
  if (matrixed) return <MatrixView focus={focus} onOpen={onOpen} today={{ ids: base.map((task) => task.id), done: dayDone, actions, lead, onAll: () => onOpen?.('view', 'matrix') }} />
  return (
    // The list and the task open beside it come in together, once both are read (lib/reads-in.tsx).
    <ReadsIn className="contents">
      {/* Sent here for one task: the page waits for it too, so it opens on the task beside the list, not on the list alone first;
          the task never waits for the list, which comes in whole beside it once drawn. */}
      <Page aside={!!open || !!coming} waiting={(reading && !example) || (!!focus && !matrixed && (coming ?? open?.id) !== focus) || !listShown} apart={sent}
 title={mode} lead={several.bar ? undefined : givenLead ?? lead} count={example ? undefined : several.chosen.length || shown.length + (heldShown ? 0 : held.length) + foldedCount} unit={several.chosen.length ? ['selected', 'selected'] : ['open', 'open']} actions={several.bar ?? actions}>
        {said}

        <form
          className="list-box mt-8 flex items-center gap-2 rounded-md border py-1.5 pr-2 focus-within:border-foreground/25"
          // A pasted list is a task a line, its indented lines their steps; one Undo for all.
          onPasteCapture={(event) => {
            const lines = tasksOf(readLines(event.clipboardData.getData('text/plain')))
            if (lines.length < 2 && !lines[0]?.steps.length) return
            event.preventDefault()
            void (async () => {
              const made: Made[] = []
              for (const line of lines) {
                const one = await haligtree.addTask(line.text, undefined, mode === 'today')
                made.push(one)
                if (one.existed) continue
                if (line.steps.length) await haligtree.saveTask(one.id, { subtasks: line.steps })
                if (line.done) await haligtree.saveTask(one.id, { status: 'done' })
              }
              chime('promote')
              toast(`Made ${tasksSaid(lines)}`, () => void Promise.all(made.map((one) => haligtree.unmakeTask(one.id, one.existed, [], []))))
            })()
          }}
          onSubmit={(event) => {
            event.preventDefault()
            if (!draft.trim()) return
            const text = draft
            const plain = keptIn(kept.list, text)
            setDraft('')
            kept.set([])
            // Taken back, the words are in the line again, ahead of anything typed since.
            void makeTask({ text, today: mode === 'today', plain }, (made) => landed(made, mode), { onUndo: () => {
              setDraft((now) => (now.trim() ? `${text} ${now}` : text))
              requestAnimationFrame(() => (addRef.current?.focus(), addRef.current?.setSelectionRange(text.length, text.length)))
            } })
          }}
        >
          <Plus className="list-plus size-4 text-muted-foreground" />
          <TaskInput
            inputRef={addRef}
            value={draft}
            onChange={setDraft}
            kept={kept}
            placeholder={mode === 'later' ? 'Add a task: “learn Spanish someday”, “book the holiday this year”' : 'Add a task: “call the accountant tomorrow 10am”, “file taxes by friday !!”'}
          />
          <Kbd>↵</Kbd>
        </form>
        {/* How far through the day: "2 of 5 done" and a thin bar, which reaches its end on the last one. */}
        {mode === 'today' && hints && !example && !reading && dayDone > 0 && (
          <div data-day-progress data-said={daySaid} className="list-words mt-3 flex items-center gap-3">
            <span className="shrink-0 text-[0.9375rem] font-medium tabular-nums text-foreground"><Rolling text={daySaid} by="word" /></span>
            <ProgressBar value={dayDone / (dayDone + leftToday)} label="Today's tasks done" thick={3} className="min-w-16 flex-1" />
          </div>
        )}
        {/* The day as a budget: what today's tasks are planned to take, and the time left before the day ends. */}
        {/* Nothing left to plan once the list is done: the ending below says the rest. */}
        {mode === 'today' && hints && !example && !reading && !(dayDone > 0 && !leftToday) && (() => {
          const planned = plannedMinutes(base)
          const left = Math.max(0, minutesLeft(settings?.dayEnd) - meetingsLeft)
          const over = planned > left
          return (
            <p data-day-budget data-said={budgetSaid(planned, left)} className="list-words mt-3 text-[0.9375rem] font-medium tabular-nums" style={{ color: over ? 'var(--tt-color-text-orange)' : 'var(--foreground)' }}>
              <Rolling text={budgetSaid(planned, left)} by="word" />
              {meetingsLeft > 0 && <span className="font-normal text-muted-foreground"> after {hoursSaid(meetingsLeft)} of meetings</span>}
              {over && <span className="font-normal text-muted-foreground"> · {hoursSaid(planned - left)} more than is left of today</span>}
              {!planned && <span className="font-normal text-muted-foreground"> · write ~30m on a task to give it a length</span>}
            </p>
          )
        })()}

        {/* Today kept short: the one big thing and a few more. Past that it says so, plainly, and lets you carry on. */}
        {mode === 'today' && hints && !example && !reading && (() => {
          const more = Math.min(6, Math.max(3, settings?.todayCap ?? 3))
          const over = base.length - (more + 1)
          if (over <= 0) return null
          return (
            <p data-today-cap className="list-words mt-2 text-[0.9375rem] font-medium text-pretty" style={{ color: 'var(--tt-color-text-orange)' }}>
              {num(base.length)} on Today: {over === 1 ? 'one more' : `${num(over)} more`} than a short day holds (one big thing and {num(more)} others).{' '}
              <span className="text-foreground">A short day gets done; the rest can wait for tomorrow or Later.</span>
            </p>
          )
        })()}

        {/* What is late, said once on every tab but Today, where it is dealt with: in the ink, as a key fact is. */}
        {lateHere.length > 0 && !example && (
          <p data-late-line className="list-words mt-3 text-[0.9375rem] text-foreground">
            <button type="button" onClick={() => (chime('page'), onOpen?.('view', 'today'))} className="mf-hit relative cursor-pointer rounded-sm underline decoration-foreground/30 underline-offset-[3px] outline-none hover:decoration-foreground/60 focus-visible:ring-2 focus-visible:ring-ring">
              {num(lateHere.length)} late, on Today
            </button>
          </p>
        )}
        {!listShown ? null : rows.length ? (
          <Example on={example} tryIt={TRY_TASKS[mode]}>
          <div ref={rowsBox} {...rowsHover.handlers} className="relative isolate">
          <Highlight light={rowsHover.light} className="bg-accent/25" />
          {/* On Today, a row is dragged into your own order, or onto the Upcoming or Later tab. */}
          {/* On every list, a row rested on another's middle becomes its step. */}
          <SortableList items={shown} keyOf={(task) => task.id} onMove={sortable ? moveRow : undefined} onNest={example || several.chosen.length ? undefined : nestRow} nests={nests}
            places={sortable ? { drop: dropOnTab, said: (place) => (place === 'upcoming' ? 'Move to tomorrow' : 'Move to Later, someday') } : undefined}
            parts={sortable ? { of: (id) => partOf.get(id), take: takenBy, drop: dropInPart } : undefined}>
          {(order) => (
          <VirtualList
            items={inOrder(order)}
            keyOf={(row) => ('writer' in row ? 'writer' : 'id' in row ? row.id : `heading-${row.key}`)}
            cursor={shown[cursor] ? rows.indexOf(shown[cursor]) : undefined}
            className="list-edge mb-6"
          >
            {(row) => {
              if ('writer' in row)
                return (
                  // A row like every row: the circle its tick will be, the words where a title's are.
                  <div data-write-line className="relative flex items-start gap-3 rounded-md list-ink py-2">
                    <span aria-hidden className="mt-0.5 size-[18px] shrink-0 rounded-full border-[1.5px] border-dashed border-muted-foreground/60" />
                    {room && <span aria-hidden className="-mx-1 w-3.5 shrink-0" />}
                    <div className="flex min-w-0 flex-1">{writeLine(false)}</div>
                  </div>
                )
              if (!('id' in row))
                return row.key === 'held' ? (
                  // A fresh start's tasks, folded and quiet at the foot of their own tab: one click (or opening one) brings them out.
                  <h2 className="list-ink mt-6 mb-1 border-b pb-1.5 text-meta font-medium text-muted-foreground">
                    {/* The words on the same edge as every heading; the fold's chevron after the count. */}
                    <button type="button" data-on-hold aria-expanded={heldShown} onClick={() => (chime(heldShown ? 'off' : 'tap'), heldShown || unfold(held), setHeldOpen(!heldShown))} className="flex w-full cursor-pointer items-center gap-1 text-left">
                      {row.heading} <span className="font-normal"><Rolling text={row.count} /></span>
                      <ChevronRight className={`size-3.5 transition-transform duration-150 motion-reduce:transition-none ${heldShown ? 'rotate-90' : ''}`} style={{ transitionTimingFunction: EASING }} />
                      <span className="ml-auto font-normal text-(--mf-muted-strong)">From a fresh start · right-click one to bring it back</span>
                    </button>
                  </h2>
                ) : row.key.startsWith('fold:') ? (
                  // A tag's heading folds its tasks away and back, as the box's islands do.
                  <h2 className="list-ink mt-6 mb-1 border-b pb-1.5 text-meta font-medium text-muted-foreground">
                    <button type="button" data-tag-fold={row.heading} aria-expanded={!folds.includes(row.heading)}
                      onClick={() => (chime(folds.includes(row.heading) ? 'tap' : 'fold'), setFolds(folds.includes(row.heading) ? folds.filter((one) => one !== row.heading) : [...folds, row.heading]))}
                      className="mf-hit relative flex w-full cursor-pointer items-center gap-1 text-left">
                      {row.heading} <span className="font-normal"><Rolling text={row.count} /></span>
                      <ChevronRight className={`size-3.5 transition-transform duration-150 motion-reduce:transition-none ${folds.includes(row.heading) ? '' : 'rotate-90'}`} style={{ transitionTimingFunction: EASING }} />
                    </button>
                  </h2>
                ) : row.heading ? (
                  // A row carried over this part's rows from another part: its heading lights, and the card says what letting go does.
                  <h2 data-row-part={row.heading} {...loud(row.heading === 'Overdue' && mode === 'today' ? 'late' : undefined, `list-ink mt-6 mb-1 truncate border-b pb-1.5 text-meta font-medium ${DROP_LIT} data-[drop-hot]:rounded-md data-[drop-hot]:border-transparent`)}>
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
                      <SortableRow key={task.id} id={task.id}>
                      <RowMenu items={() => several.menu(task) ?? [
                        ...taskMenu(task, { open: () => pick(task.id), complete: () => complete(task), frog: frogOn(settings), now, thought: () => setGlossing(task.id) }),
                        // On Today, a step written in place under it, as a line is.
                        ...(mode === 'today' && task.status === 'open' ? ['separator' as const, { label: 'Add a step', hint: 'Something to do as part of it', run: () => (chime('tuck'), setWriting({ after: task.id, step: task.id, text: '' })) }] : []),
                        ...several.rowItems(task.id)
                      ]}>
                      <div
                        data-id={task.id}
                        data-task-row
                        // Sorted by a drag on Today, but its side-by-side places still wait for the page's very edge (split-drop.tsx).
                        data-split-edge={sortable || undefined}
                        data-open={task.id === (coming ?? open?.id) || undefined}
                        data-cursor={index === cursor || undefined}
                        data-set-aside={task.heldAt ? '' : undefined}
                        className={`group group/item relative flex items-start gap-3 rounded-md list-ink py-2 transition-colors ${several.chosen.includes(task.id) ? PICKED_ROW : task.id === (coming ?? open?.id) ? 'bg-accent' : index === cursor ? 'bg-accent/40' : ''} ${arrived(task.id) || fresh(task.id) >= 0 ? 'mf-arrive' : ''}`}
                        style={fresh(task.id) > 0 ? { animationDelay: `${Math.min(fresh(task.id), 8) * 30}ms` } : undefined}
                      >
                        {/* One of the day's three: its number in the margin before the circle. */}
                        {/* A focus session running on it: the dot stands there instead while it runs, and nothing in the row moves (task-time.tsx). */}
                        {time.running?.taskId === task.id
                          ? <SessionDot id={task.id} time={time} className="absolute right-full mr-1 flex w-3 items-center justify-end top-2 h-5" />
                          : three.includes(task.id) && <ThreeMark n={three.indexOf(task.id) + 1} className={`absolute top-2 right-full mr-1 h-5 w-3 items-center justify-end @max-[61rem]/page:hidden ${beside ? 'hidden' : 'flex'}`} />}
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
                        <button type="button" data-row data-id={task.id} data-picked={several.chosen.includes(task.id) || undefined} onClick={(event) => several.click(event, task.id) || (setCursor(index), pick(task.id))} className="-my-2 flex w-full min-w-0 flex-col items-start gap-1 py-2 text-left">
                          <span data-task-title className="flex max-w-full items-center gap-2">
                            {task.id === frog && <FrogChip />}
                            <span dir="auto" data-title className={`truncate ${leaving(task.id) ? 'mf-strike' : ''}`}>{taskName(task.title).text}</span>
                            <Tags tags={taskName(task.title).tags} />
                            <TaskLength task={task} />
                            {/* Narrow, with no margin to stand in, the day's number follows the title instead of going: every title keeps one left edge.
                                A task open beside the list leaves the list no margin either: there the numbers stood against the pane's edge (16 Nov). */}
                            {three.includes(task.id) && <ThreeMark n={three.indexOf(task.id) + 1} className={`shrink-0 rounded bg-accent px-1.5 text-meta @max-[61rem]/page:inline ${beside ? 'inline' : 'hidden'}`} />}
                          </span>
                          {(task.dueAt || task.recurrence || task.waitingOn || task.deadline || task.blocker || later || subtasks.length > 0 || task.snoozedUntil || carried(task) > 0 || time.of(task.id)) && (
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
                                // Its steps fold out under it, hung off a tree line: the count is the fold, its chevron turning.
                                <span role="button" tabIndex={-1} data-steps-fold={task.id} aria-expanded={stepsOpen.has(task.id)} aria-label={stepsOpen.has(task.id) ? 'Fold its steps' : 'Show its steps'}
                                  onClick={(event) => (event.stopPropagation(), chime(stepsOpen.has(task.id) ? 'fold' : 'slide'), foldSteps(task.id))}
                                  className="-mx-1 flex cursor-pointer items-center gap-1 rounded px-1 tabular-nums hover:bg-accent hover:text-foreground">
                                  <ListChecks className="size-3" /><Rolling text={`${num(subtasks.filter((one) => one.done).length)}/${num(subtasks.length)}`} />
                                  <ChevronRight aria-hidden className={`size-3 transition-transform duration-150 motion-reduce:transition-none ${stepsOpen.has(task.id) ? 'rotate-90' : ''}`} style={{ transitionTimingFunction: EASING }} />
                                </span>
                              )}
                              {task.blocker && (freed(task)
                                ? <span data-freed className="truncate" style={{ color: 'var(--tt-color-text-green)' }}>Free now: {taskName(task.blockedByTitle ?? task.blocker).text} is done</span>
                                : <span className="truncate">Blocked: {task.blockedByTitle ? taskName(task.blockedByTitle).text : task.blocker}</span>)}
                              {/* The time spent on it so far, last: it wraps to a line of its own before it pushes anything. */}
                              <TaskSpent task={task} time={time} />
                            </span>
                          )}
                        </button>
                        {/* Grouped by note, the subtasks show under their task, tickable where they are. */}
                        {/* Grouped by note, or getting ready for its due-by day, the subtasks show under their task, tickable where they are. */}
                        {/* Or while a step is being written into it, the new one last. */}
                        {((view.group === 'note' || gettingReady(task) || stepsOpen.has(task.id)) && subtasks.length > 0 || writing?.step === task.id) && (
                          <Branches current={-1} rows="li" className="mf-held-folds w-full pt-0.5">
                          <ul data-steps-of={task.id} className="w-full space-y-0.5 pl-3">
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
                            {writing?.step === task.id && (
                              <li data-write-line data-step className="flex items-center gap-2 text-control">
                                <span aria-hidden className="size-3.5 shrink-0 rounded border border-dashed border-muted-foreground/60" />
                                {writeLine(true)}
                              </li>
                            )}
                          </ul>
                          </Branches>
                        )}
                        {/* In the hand a task is its own row: its steps above, this question and a thought being written fold away (.mf-held-folds). */}
                        <TaskAsk task={task} ask={carryAsk} onPick={() => pick(task.id)} className="mf-held-folds mt-1" />
                        {glossing === task.id && <GlossLine id={task.id} open onDone={() => setGlossing(null)} placeholder="A thought on it, kept with its logs" className="mf-held-folds w-full" />}
                        </div>
                        {/* A thought without opening it: on hover, in the row's own line, so it never lands on the title. */}
                        <GlossButton className="static -mt-0.5 shrink-0" onClick={() => setGlossing(task.id)} />
                      </div>
                      </RowMenu>
                      </SortableRow>
              )
            }}
          </VirtualList>
          )}
          </SortableList>
          </div>
          </Example>
        ) : reading ? null : mode === 'today' && dayDone > 0 ? (
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
          <Empty title={mode === 'today' ? 'Nothing due today' : mode === 'tomorrow' ? 'Nothing for tomorrow yet' : mode === 'routines' ? 'No routines' : mode === 'later' ? 'Nothing put off' : mode === 'alltasks' ? 'No open tasks' : 'Nothing coming up'}>
            {mode === 'routines'
              ? 'A routine is a task that repeats, kept here so it does not crowd Today. To make one, type it in the line above with how often: “bins every week”, or “water the plants every! 3 days” to count from when you last did it.'
              : mode === 'today'
              ? 'A clear day. Anything with a date lands here on the day, and anything late stays on top until it is done.'
              : mode === 'tomorrow'
              ? 'Type a task above with “tomorrow” in the words, or press M on a task to move it here.'
              : mode === 'alltasks'
              ? 'Every task still to do shows here, late ones first, then by when it is due. Type one in the line above.'
              : mode === 'later'
              ? 'For what has no day yet: say “this month”, “this year” or “someday” in the words, and it waits here, out of the way.'
              : 'Tasks with a date further out show here, grouped by day. Type one above with the date in the words.'}
          </Empty>
          </Rest>
        )}
        {/* In the evening: tomorrow written down before bed, a task a line (tomorrow-lines.tsx). */}
        {/* The empty space under the day is paper: a click there starts a new line at the end, as in Reminders. */}
        {mode === 'today' && !example && !reading && !writing && (
          <button type="button" tabIndex={-1} data-write-here aria-label="Write a new task at the end of Today" onClick={() => startWriting(null)}
            className={`list-edge block h-14 w-[calc(100%-2*var(--list-edge))] cursor-text ${rows.length ? '-mt-6' : ''}`} />
        )}
        {mode === 'today' && !example && <TomorrowBox className="list-edge mt-6 mb-10" />}
      </Page>
      {coming && coming !== open?.id && !matrixed ? <NoteComing id={coming} title={tasks.find((one) => one.id === coming)?.title} /> : open && <ShowInListContext.Provider value={showOpen}><TaskDetail top={<ReadsIn apart reading={reading && !example} className="contents" data-apart="stepper"><Stepper at={shown.findIndex((one) => one.id === open.id)} total={shown.length} onStep={(to) => pick(shown[to].id)} /></ReadsIn>} key={open.id} task={open} onClose={() => setOpen(null)} onOpen={onOpen} /></ShowInListContext.Provider>}
    </ReadsIn>
  )
}

/**
 * The quiet rows under an open task's line in its popover (cal-add.tsx): its day and time, and its tags, each the
 * control its page has (the Scheduled date, the tags under its name). A change is kept as it is made, said with Undo.
 */
export function TaskRows({ task }: { task: Task }): React.JSX.Element {
  const tagField = useRef<HTMLInputElement>(null)
  const named = splitTags(task.title)
  const retag = (tags: string[], said: string): void => {
    const was = task.title
    void haligtree.saveTask(task.id, { title: [named.text.trim(), ...[...new Set(tags)].map((tag) => `#${tag}`)].filter(Boolean).join(' ') || task.title })
      .then(() => (chime('tap'), toast(said, () => void haligtree.saveTask(task.id, { title: was }))))
  }
  return (
    <div data-task-rows className="flex flex-col px-1 pb-2">
      <DatePicker time allDay={!!task.allDay} value={task.dueAt} onChange={(due, timed) => setDue(task, due, timed)} placeholder="Not scheduled" />
      {/* Its tags in a row shaped as an event's people are: the mark on the rows' one left edge, the words on the date's
          words' edge, the tags it offers listed under the field; a press anywhere on the row puts the caret in it. */}
      <div data-task-tags onClick={(event) => !(event.target as Element).closest('input, button') && tagField.current?.focus()}
        className="flex cursor-text items-start gap-2 px-2 py-1.5">
        <Tag aria-hidden className="mt-px size-4 shrink-0" />
        <TagRow bare tags={named.tags} field={tagField} onAdd={(tag) => retag([...named.tags, tag], `Tagged #${tag}`)} onRemove={(tag) => retag(named.tags.filter((one) => one !== tag), `#${tag} taken off`)} onDone={() => tagField.current?.blur()} />
      </div>
    </div>
  )
}

/** The open task: its notes, and down the right when it is and what it has been. */
export function TaskDetail({ task: first, onClose, onOpen, top }: { task: TaskFull; onClose: () => void; onOpen?: (type: string, id: string) => void; top?: React.ReactNode }): React.JSX.Element {
  // Read again on every change, so a toggle shows what it now is.
  const task = useLive(async () => (await haligtree.task(first.id)) ?? first, first, [first.id])
  const title = useRef<HTMLTextAreaElement>(null)
  const tagField = useRef<HTMLInputElement>(null)
  // The name as typed, and its #tags apart: saved back together, so a tag still files and routes the task.
  const named = splitTags(task.title)
  const saveName = (text: string, tags: string[]): Promise<unknown> =>
    haligtree.saveTask(task.id, { title: [text.trim(), ...[...new Set(tags)].map((tag) => `#${tag}`)].filter(Boolean).join(' ') || task.title })
  // A day, a time or a priority written into the name is read as everywhere else a task is typed, and said with Undo.
  const rename = (text: string): Promise<unknown> =>
    renameTask(task, [text.trim(), ...[...new Set(named.tags)].map((tag) => `#${tag}`)].filter(Boolean).join(' ')).then((set) => {
      if (!set) return
      chime('tap')
      toast(set.said, set.undo)
    })
  // Its description written elsewhere while this page is open (a long name moved into it, long-names.ts; the other
  // window): shown here in place, the caret kept, so this editor's next save builds on it instead of writing over it.
  // Its own saves come back the same as they went and are let be.
  const notesEditor = useRef<Editor | null>(null)
  const sentNotes = useRef(JSON.stringify(task.notes ?? null))
  useEffect(() => {
    const now = JSON.stringify(task.notes ?? null)
    if (now === sentNotes.current) return
    sentNotes.current = now
    if (notesEditor.current && !notesEditor.current.isDestroyed) showIn(notesEditor.current, task.notes ?? { type: 'doc', content: [] })
  }, [task.notes])
  // "Pick a date…" from a task's menu: the Scheduled picker opens, here or as this panel first shows.
  const [dating, setDating] = useState(() => (dateWanted(first.id) ? 1 : 0))
  const settings = useLive(haligtree.settings, null as Settings | null)
  const focusTools = settings?.focusTools === true
  const show = useShowLine()
  useEffect(() => {
    const ask = (event: Event): void => void ((event as CustomEvent<string>).detail === first.id && setDating((n) => n + 1))
    window.addEventListener('haligtree:pick-date', ask)
    return () => window.removeEventListener('haligtree:pick-date', ask)
  }, [first.id])
  return (
    <div data-open={first.id} className="note-pane flex min-w-0 flex-[1.4] flex-col overflow-y-auto [--mf-padding:1rem_3.25rem] @[40rem]/page:flex-row @[40rem]/page:overflow-visible @[40rem]/page:[--mf-padding:1rem_4.75rem] @[56rem]/page:border-l [&>*:first-child]:min-h-[16rem] [&>*:first-child]:shrink-0 @[40rem]/page:[&>*:first-child]:min-h-0 @[40rem]/page:[&>*:first-child]:shrink">
      {/* Its own words, cards and subtasks scroll as one beside the details, never a short box of notes. */}
      <div data-grow className="flex min-h-0 min-w-0 flex-1 flex-col pt-6 @[40rem]/page:overflow-y-auto">
        {/* Where it sits in the list, and on the right the ✕ that puts it away, as a split pane has. */}
        <div className="-mt-3 mb-1 flex items-center px-3 @[40rem]/page:px-[4.25rem]">{top}<CloseBeside className="ml-auto" onClose={onClose} /></div>
        {/* Where you said you would pick up, as the last session ended: on its own line, plain to see. */}
        {task.pickup && task.status === 'open' && (
          <div data-pickup-note className="page-narrow mx-auto mb-3 flex w-full items-start gap-3 px-12">
            <p className="min-w-0 flex-1 text-[0.9375rem] leading-snug text-foreground"><strong className="font-semibold">Pick up here.</strong> {task.pickup}</p>
            <Button variant="ghost" size="sm" onClick={() => void haligtree.clearPickUp(task.id).then(() => chime('away'))}>Done with it</Button>
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
          key={task.title}
          defaultValue={named.text}
          onKeyDown={(event) => event.key === 'Enter' && (event.preventDefault(), event.currentTarget.blur())}
          onBlur={(event) => void rename(event.target.value.replace(/\s*\n\s*/g, ' '))}
        />
        {/* A #tag typed with the task is kept here, as a tag, never left in its name. */}
        <div data-task-tags className="page-narrow mx-auto w-full px-12">
          <TagRow tags={named.tags} field={tagField} onAdd={(tag) => void saveName(title.current?.value ?? named.text, [...named.tags, tag])}
            onRemove={(tag) => void saveName(title.current?.value ?? named.text, named.tags.filter((one) => one !== tag))} onDone={() => tagField.current?.blur()} />
        </div>
        {/* Held by a fresh start: opening it leaves it there, and this says so, with the one press that brings it back. */}
        {task.heldAt && task.status === 'open' && (
          <p data-task-held className="page-narrow mx-auto mt-1 flex w-full items-center gap-2 px-12 text-body text-foreground">
            <span><strong className="font-semibold">On hold</strong> since a fresh start.</span>
            <Button size="sm" variant="outline" data-bring-back className="h-7 cursor-pointer px-2.5" onClick={() => bringBack(task)}>Bring it back</Button>
          </p>
        )}
        <HaligtreeEditor
          toolbar={{ fixed: false }}
          // A task's details, not a note: no line numbers.
          lineNumbers={false}
          placeholder="Add a description: the details, links and steps that do not fit in the name"
          documentId={`task-${task.id}`}
          defaultContent={(task.notes as JSONContent | null) ?? ''}
          onReady={(editor) => void (notesEditor.current = editor)}
          onChange={(notes) => ((sentNotes.current = JSON.stringify(notes)), void haligtree.saveTask(task.id, { notes }))}
          foot={(editor) => <SessionFooter editor={editor} note={`task-${task.id}`} />}
        />
        {/* Keyed by the list itself, so a change made elsewhere (the other window, an undo) shows. */}
        <Checklist key={JSON.stringify(task.subtasks)} task={task} onOpen={onOpen} />
      </div>
      <Props>
        {/* The focus timer turned off (Settings, Tasks): no sessions to start or count. */}
        {focusTools && <Sessions taskId={task.id} title={taskName(task.title).text} />}
        {/* What its sessions came to: time, the last one, how they ended. */}
        {focusTools && <TaskFocusNumbers taskId={task.id} estimate={task.estimate} />}
        {/* What happened to it, session by session and thought by thought: never written over. */}
        <TaskLog taskId={task.id} />
        {/* When you mean to do it, Todoist's date: the day it shows on. */}
        <Island compact title="Scheduled">
          {/* Equal columns that may shrink: a narrow panel squeezes the words rather than pushing a button past its edge.
              One look for every choice here, a day or a later list; the one it is on now is lit. */}
          <div className="grid grid-cols-[repeat(auto-fit,minmax(5.25rem,1fr))] gap-1 p-1">
            {([['Today', 0], ['Tomorrow', 1], ['Next week', 7]] as const).map(([label, days]) => (
              <Button variant={days < 7 && when(task.dueAt) === label ? 'secondary' : 'ghost'} size="sm" key={label} onClick={() => moveTo(task, days)} className={plan}>
                {label}
              </Button>
            ))}
          </div>
          <DatePicker key={dating} startOpen={dating > 0} time allDay={!!task.allDay} value={task.dueAt} onChange={(due, timed) => setDue(task, due, timed)} placeholder="Not scheduled" />
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
          <DatePicker time allDay={!task.deadlineTimed} value={task.deadline} onChange={(deadline, timed) => setDeadline(task, deadline, timed)} placeholder="No due date" />
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
          {/* Four in a row in a wide panel, two by two in the usual one: four squeezed "Default" to "Defau…". */}
          <div className="@container">
          <div className="grid grid-cols-2 gap-1 p-1 @[22rem]:grid-cols-4">
            {REMINDERS.map(([level, label]) => (
              <Tip key={label} label={REMINDER_SAID[level ?? 'default']}>
                <Button variant={(task.notify ?? null) === level ? 'secondary' : 'ghost'} size="sm" className={plan}
                  onClick={() => setReminder(task, level)}>{label}</Button>
              </Tip>
            ))}
          </div>
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
          <BlockedBy task={task} onOpen={onOpen} />
          <PropInput key={`estimate-${task.estimate ?? ''}`} icon={Timer} type="number" value={task.estimate ? String(task.estimate) : ''} placeholder="Estimate" ghost="Estimate: 45" does="How long you think it will take. Stats sets it beside the time your focus sessions took" suffix="minutes" onSave={(minutes) => giveLength(task, minutes ? Number(minutes) : null)} />
          <PropInput key={`waiting-${task.waitingOn ?? ''}`} icon={Hourglass} value={task.waitingOn ?? ''} placeholder="Waiting on…" lead="Waiting on" ghost="Waiting on: Jane's letter" does="Someone else has the next move. It leaves your lists and waits under “Waiting on someone” in Upcoming" onSave={(waitingOn) => setWaiting(task, waitingOn.trim() || null)} />
          <PropInput key={`repeat-${task.recurrence ?? ''}`} icon={Repeat} value={task.recurrence ?? ''} placeholder="Repeats" lead="Repeats" ghost="Repeats: every monday" does="Comes back on its own once you tick it off, and moves to Routines" onSave={(recurrence) => setRepeat(task, recurrence.trim() || null)} />
          {/* A repeating task's last day, set or changed here as well as typed with “until”. */}
          {task.recurrence && <div data-repeat-until><DatePicker lead={task.repeatUntil ? 'Ends' : undefined} value={task.repeatUntil} onChange={(until) => setRepeatEnd(task, until)} placeholder="Repeats with no end date" /></div>}
          <p className="px-2 py-1.5 text-xs leading-relaxed">
            “every monday” keeps to the calendar. “every! 3 days” counts from the last time you did it.
          </p>
        </Island>

        {/* A repeating task can be practised: offered at its time, with its material, and asked what stuck. */}
        {task.recurrence && task.status === 'open' && <PractiseIt taskId={task.id} />}
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
          {show && <Prop icon={ListTree} onClick={show.run}>{show.label} <span className="font-normal text-muted-foreground">{show.keys}</span></Prop>}
          {/* Made a task by mistake: back in the Inbox as the note it was, the task gone, with Undo. */}
          {task.status === 'open' && <Prop icon={InboxIcon} onClick={() => void taskToNote([task.id], onClose)}>Turn back into a note</Prop>}
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
    const at = dateIn(said.replace(/^until\s*/, '').replace('noon', '12pm'))
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
    void haligtree.startSession(taskId, goal, planned).then(() => {
      chime('slide')
      window.api.showFocus(true)
      setOpen(false)
    })
  }
  // Opening the form winds up; each length has a note of its own, so the
  // choice is heard as well as seen.
  // The last session kept was on this task: go again, same goal and length, in one click.
  // Not read yet (undefined) is not none (null): "Go again" comes with the rest of the pane.
  const last = useLive<Awaited<ReturnType<typeof haligtree.lastSession>> | undefined>(haligtree.lastSession, undefined)
  useReading(last === undefined)
  const again = last?.taskId === taskId ? last : null
  const settings = useLive(haligtree.settings, null as Settings | null)
  if (!open) return (
    <>
      {again && <Prop icon={RotateCw} onClick={() => void haligtree.againSession().then((id) => (id ? (chime('anew'), window.api.showFocus(true)) : chime('nope')))}>
        Go again{again.plannedMs ? `, ${Math.max(1, Math.round(again.plannedMs / 60_000))} min` : ''}
      </Prop>}
      <Prop icon={Timer} onClick={() => {
        chime('windup')
        setOpen(true)
      }}>{again ? 'Start a new focus session' : 'Start a focus session'}</Prop>
      <Prop icon={Timer} tip="A five minute focus round: just begin, then see" onClick={() => tryFive({ id: taskId, title })}>Try it for {TRY_MINUTES} minutes</Prop>
    </>
  )
  return (
    // Its own room inside the Sessions island, as the other panels have: the
    // parts apart, and nothing pressed against the island's edge.
    <form
      data-start-focus
      className="flex flex-col gap-3 px-2.5 pt-2.5 pb-3"
      onSubmit={(event) => {
        event.preventDefault()
        start()
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.stopPropagation()
          setOpen(false)
        }
        // Start says ↵: a length just clicked keeps the focus, and ↵ there starts too, not that length again.
        if (event.key === 'Enter' && event.target instanceof HTMLButtonElement && event.target.type === 'button' && planned !== undefined) {
          event.preventDefault()
          start()
        }
      }}
    >
      {/* The goal and the length each an island, the way Settings groups its rows. */}
      <Island compact title="Goal">
        <Input autoFocus aria-label="Goal" value={goal} onChange={(event) => setGoal(event.target.value)} className="h-8 px-2.5 text-control" />
      </Island>
      <Island compact title="How long" className="mt-0">
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
      {/* On or only offered, said in the heading: “Blocking” over what is blocked, “Sites to block” over the offers. */}
      {settings?.siteBlock && (
        <Island compact title={settings.alwaysBlock || settings.blockSites.some((one) => !one.startsWith('-')) ? 'Blocking' : 'Sites to block'} className="mt-0" actions={<ManageBlocking />}>
          <SiteBlockField settings={settings} compact />
        </Island>
      )}
      <Button type="submit" size="sm" variant="secondary" disabled={planned === undefined} className="mt-0.5">Start <Kbd>↵</Kbd></Button>
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
  const sessions = useLive(() => haligtree.sessions(taskId), [] as Session[], [taskId])
  // The task's pane waits for its sessions: drawn before, the list came in and pushed its dates down.
  useReading(unloaded(sessions))
  const running = sessions.find((session) => !session.endedAt)
  // Abandoned ones stay in the Log below, but are not counted here; nor are its practice's, which “Focus so far”
  // under this does not count either: “Sessions · 3” and “in 3 sessions” are one number.
  const kept = sessions.filter((session) => !session.abandonedAt && !session.practice).length
  const [recap, setRecap] = useState('')
  const [tick, setTick] = useState(Date.now())
  useEffect(() => {
    if (!running) return
    const timer = setInterval(() => setTick(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [running])
  const end = (keep: boolean, close = false): void =>
    void haligtree.endSession(running!.id, recap, keep, close).then(() => {
      setRecap('')
      // Every ending is heard: done, or kept as a nugget, or simply finished.
      chime(close ? 'done' : keep && recap.trim() ? 'promote' : 'resolve')
      // And the edge of the screen lights, as when the floating timer ends one.
      window.api.glow('done')
      toast(close ? 'Done, with this session as how' : keep && recap.trim() ? 'Session saved, and the recap saved as a gem' : 'Session saved')
    })

  // Sent here from the bubble (its task's name clicked): the panel scrolls to this part.
  const here = useRef<HTMLDivElement>(null)
  useEffect(() => sessionsAsked(taskId, () => here.current?.scrollIntoView({ block: 'start', behavior: glideWay() })), [taskId])
  return (
    <div ref={here} data-task-sessions className="scroll-mt-3">
    <Island compact title={<>Sessions {kept ? <>· <Rolling text={kept} /></> : ''}</>}>
      {running ? (
        <div className="space-y-1 p-1">
          <div className="flex items-center gap-2 px-1 text-foreground">
            {/* The same dot the task's row has in every list: breathing while it runs, still and dimmed while paused. */}
            <LiveDot paused={heldStill(running)} />
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
    </div>
  )
}

/**
 * The bubble asking for a task's Sessions part (main window, `home:open` with
 * heading 'sessions'): kept a moment, so a panel still opening finds it too.
 */
let sessionsWanted: { id: string; at: number } | null = null
const sessionsHeard = new Set<(id: string) => void>()
export const askSessions = (taskId: string): void => {
  sessionsWanted = { id: taskId, at: Date.now() }
  sessionsHeard.forEach((one) => one(taskId))
}
function sessionsAsked(taskId: string, go: () => void): () => void {
  const hear = (id: string): void => void (id === taskId && (sessionsWanted = null, setTimeout(go, 250)))
  if (sessionsWanted && Date.now() - sessionsWanted.at < 4000) hear(sessionsWanted.id)
  sessionsHeard.add(hear)
  return () => void sessionsHeard.delete(hear)
}

/** “Manage”: Settings' Blocking websites, where the sites and “Always block” are kept. */
function ManageBlocking(): React.JSX.Element {
  return (
    <Tip label="Blocked in every session: change which, in Settings">
      <button type="button" data-manage-blocking onClick={() => (chime('open'), window.api.openInHome('view', 'settings', 'Blocking websites'))}
        className="rounded-md px-1.5 py-0.5 text-meta font-medium text-foreground transition-colors hover:bg-accent">
        Manage
      </button>
    </Tip>
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
/** Whether a task's blocker is one of your tasks that is done now: it is free to go. */
export const freed = (task: Pick<Task, 'blockedBy' | 'blockedByStatus'>): boolean => !!task.blockedBy && task.blockedByStatus === 'done'
/** Open and held up by another task that is not done yet: it waits under “Waiting on another task”. */
export const waitsOnTask = (task: Pick<Task, 'status' | 'blockedBy' | 'blockedByStatus'>): boolean => task.status === 'open' && !!task.blockedBy && task.blockedByStatus === 'open'
export const WAITS_ON_TASK = 'Waiting on another task'

/**
 * "Blocked by", in a task's details: type and your open tasks whose names
 * match come up under it, as the other pickers show them. Up and down choose,
 * Enter or a click links one, Esc closes the list and keeps your words. Words
 * that match none stay as a plain note. A linked one opens with a click, and
 * says the task is free once it is done.
 */
function BlockedBy({ task, onOpen }: { task: TaskFull; onOpen?: (type: string, id: string) => void }): React.JSX.Element {
  const all = useLive(haligtree.tasks, [] as Task[])
  const [typed, setTyped] = useState(task.blocker ?? '')
  const [listed, setListed] = useState(false)
  const [chosen, setChosen] = useState('')
  const picked = useRef(false)
  const row = useRef<HTMLLabelElement>(null)
  useEffect(() => void ((picked.current = false), setTyped(task.blocker ?? '')), [task.blocker, task.blockedBy])
  const linked = task.blockedBy && task.blockedByTitle ? { id: task.blockedBy, title: taskName(task.blockedByTitle).text } : null
  if (linked) {
    const done = freed(task)
    const open = (): void => (onOpen ? onOpen('task', linked.id) : window.api.openInHome('task', linked.id))
    return (
      <div data-blocked-by={linked.id} data-freed={done || undefined} className="flex items-center">
        <div className="min-w-0 flex-1">
          <Prop icon={done ? Check : Ban} tint={done ? 'green' : undefined} onClick={open} active tip="Open the task in the way">
            {done ? <>Free now: {quoted(linked.title, 80)} is done</> : <>Blocked by {quoted(linked.title, 80)}</>}
          </Prop>
        </div>
        <Tip label="Not blocked by it">
          <button type="button" data-blocked-unlink aria-label="Not blocked by it" onClick={() => (chime('off'), void haligtree.saveTask(task.id, { blockedBy: null, blocker: null }))}
            className="mr-1 flex size-6 shrink-0 items-center justify-center rounded-md hover:bg-accent hover:text-foreground"><X className="size-3.5" /></button>
        </Tip>
      </div>
    )
  }
  // Following each one's own blocker: one that comes back round to this task would be a loop.
  const byId = new Map(all.map((one) => [one.id, one]))
  const loops = (from: string): boolean => {
    const seen = new Set<string>()
    for (let at: string | null | undefined = from; at && !seen.has(at); at = byId.get(at)?.blockedBy) {
      if (at === task.id) return true
      seen.add(at)
    }
    return false
  }
  const words = typed.trim()
  // Every word typed somewhere in the name, in any order and any case ("chip wall", "Chip at th");
  // a name that starts with the first word, or has a word that does, comes first.
  const asked = words.toLowerCase().split(/\s+/).filter(Boolean)
  const score = (title: string): number => {
    const said = title.toLowerCase()
    if (!asked.every((word) => said.includes(word))) return 0
    return said.startsWith(asked[0]) ? 3 : said.split(/\W+/).some((part) => part.startsWith(asked[0])) ? 2 : 1
  }
  const found = words
    ? all.filter((one) => one.status === 'open' && one.id !== task.id && !loops(one.id))
      .map((one) => ({ one, score: score(taskName(one.title).text) }))
      .filter((hit) => hit.score > 0).sort((a, b) => b.score - a.score).slice(0, 8).map((hit) => hit.one)
    : []
  const shown = listed && found.length > 0
  const selected = found.some((one) => one.id === chosen) ? chosen : found[0]?.id ?? ''
  const link = (one: Task): void => {
    picked.current = true
    chime('tap')
    setListed(false)
    const was = { blockedBy: task.blockedBy ?? null, blocker: task.blocker ?? null }
    const name = taskName(one.title).text
    // Said where it is now, so a task blocked is never simply gone: on Today still, or where it went.
    void haligtree.saveTask(task.id, { blockedBy: one.id, blocker: name }).then(async () => {
      const now = await haligtree.task(task.id)
      const left = onToday(task) && !!now && !onToday(now)
      const where = left ? 'It moved off Today, to “Waiting on another task” in Upcoming.' : onToday(task) ? 'It waits under “Waiting on another task” at the foot of Today.' : bucket(task) || task.recurrence ? 'Its row says Blocked.' : 'It waits under “Waiting on another task” in Upcoming.'
      toast(`Blocked by “${name.length > 40 ? `${name.slice(0, 39)}…` : name}”. ${where}`,
        () => void haligtree.saveTask(task.id, was).then(() => chime('undo')))
    })
  }
  const field = (
    <Command shouldFilter={false} loop value={selected} onValueChange={setChosen} className="h-auto overflow-visible rounded-none bg-transparent">
      <Popover open={shown} onOpenChange={(open) => !open && setListed(false)}>
        <PopoverAnchor asChild>
          <label ref={row} data-ghost-field={!typed ? '' : undefined} className="flex w-full cursor-text items-center gap-2 rounded-md px-2 py-1.5 hover:bg-accent focus-within:bg-accent">
            <Ban className="size-4 shrink-0" />
            <input
              data-blocked-input
              value={typed}
              placeholder="Blocked by: a thing or a task"
              aria-label="Blocked by…"
              role="combobox"
              aria-expanded={shown}
              aria-autocomplete="list"
              onChange={(event) => (setTyped(event.target.value), setListed(true))}
              onKeyDown={(event) => {
                if (event.key === 'Escape' && shown) return void (event.preventDefault(), event.stopPropagation(), setListed(false))
                if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && !shown && found.length) return void (event.preventDefault(), setListed(true))
                // With the list up, Enter is the list's: it links the one chosen.
                if (event.key === 'Enter' && !shown) event.currentTarget.blur()
              }}
              onBlur={() => {
                setListed(false)
                if (picked.current) return
                // Words that are none of your tasks: kept as a plain note, as before.
                if (words !== (task.blocker ?? '')) void haligtree.saveTask(task.id, { blocker: words || null, blockedBy: null })
              }}
              className={cn('min-w-0 flex-1 bg-transparent text-control text-foreground outline-none placeholder:text-muted-foreground', !typed && GHOST)}
            />
          </label>
        </PopoverAnchor>
        <PopoverContent align="start" data-blocked-list className="w-(--radix-popover-trigger-width) min-w-64 gap-0 p-0"
          onOpenAutoFocus={(event) => event.preventDefault()}
          onCloseAutoFocus={(event) => event.preventDefault()}
          onInteractOutside={(event) => row.current?.contains(event.target as Node) && event.preventDefault()}
          onMouseDown={(event) => event.preventDefault()}>
          <CommandList>
            {found.map((one) => (
              <CommandItem key={one.id} value={one.id} data-blocked-option={one.id} onSelect={() => link(one)}>
                <Square className="text-muted-foreground" />
                <span dir="auto" className="min-w-0 flex-1 truncate">{taskName(one.title).text}</span>
                {one.dueAt && <span className="shrink-0 text-xs text-muted-foreground">{when(one.dueAt)}</span>}
              </CommandItem>
            ))}
          </CommandList>
        </PopoverContent>
      </Popover>
    </Command>
  )
  // Keyed to what is saved, never what is typed: a tip coming or going as you type would remount the field and drop your words.
  return !task.blocker ? <Tip label="What is in the way: one of your tasks, or a few words. It shows on the row, and “Blocked” in the filter finds it">{field}</Tip> : field
}

function Checklist({ task, onOpen }: { task: TaskFull; onOpen?: (type: string, id: string) => void }): React.JSX.Element {
  const [items, setItems] = useState(task.subtasks)
  const [draft, setDraft] = useState('')
  const save = (next: typeof items): void => {
    setItems(next)
    void haligtree.saveTask(task.id, { subtasks: next })
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
                  <span className="truncate">{item.title || 'New note'}</span>
                  <span className="text-xs text-muted-foreground">{typeSaid(item.tier)}</span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
      <h3 className="mb-2 text-control font-semibold">
        Subtasks {items.length ? <span className="font-normal text-muted-foreground tabular-nums"><Rolling text={`${num(items.filter((one) => one.done).length)}/${num(items.length)}`} /></span> : null}
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
            {/* Its words written straight into, as a new line in Today's list is; ⌥↑ ⌥↓ move it. */}
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
            <button type="button" aria-label={`Remove ${quoted(item.text, 80)}`} onClick={() => {
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
        className="mt-1 w-full bg-transparent py-1 outline-none placeholder:text-muted-foreground"
      />
    </section>
  )
}

/** What a task list can be narrowed by: the same in the main window and the prompt. */
export function taskFacets(tasks: Task[]): Facet<Task>[] {
  return [
    { key: 'marked', label: 'Marked', options: [{ id: 'important', label: 'Urgent or High' }, { id: 'deadline', label: 'Has a deadline' }, { id: 'blocked', label: 'Blocked' }, { id: 'estimate', label: 'Estimated' }],
      test: (task, mark) => (mark === 'important' ? !!task.important : mark === 'deadline' ? !!task.deadline : mark === 'blocked' ? !!task.blocker && !freed(task) : task.estimate !== null) },
    { key: 'priority', label: 'Priority', options: [1, 2, 3, 4, 0].map((level) => ({ id: String(level), label: PRIORITY_NAMES[level] })), test: (task, level) => task.priority === Number(level) },
    { key: 'tag', label: 'Tag', options: [...new Set(tasks.flatMap((task) => splitTags(task.title).tags))].sort().map((tag) => ({ id: tag, label: `#${tag}`, icon: Tag, tint: tagTint(tag) })), test: (task, tag) => splitTags(task.title).tags.includes(tag) },
    { key: 'from', label: 'Came from', options: [{ id: 'capture', label: 'A note' }, { id: 'typed', label: 'Typed here' }], test: (task, from) => (task.fromId ? 'capture' : 'typed') === from }
  ]
}
