import { useEffect, useRef, useState } from 'react'
import * as chrono from 'chrono-node'
import type { JSONContent } from '@tiptap/core'
import { CalendarDays, CircleX, Plus, Square, Ban } from 'lucide-react'
import { alive } from '@/components/ui/alive-icon'
import FilledBellIcon from '@/components/ui/filled-bell-icon'
import ClockIcon from '@/components/ui/clock-icon'
import SimpleCheckedIcon from '@/components/ui/simple-checked-icon'
import FileDescriptionIcon from '@/components/ui/file-description-icon'
import LibraryIcon from '@/components/ui/library-icon'
import HashtagIcon from '@/components/ui/hashtag-icon'
import HistoryCircleIcon from '@/components/ui/history-circle-icon'
import CheckedIcon from '@/components/ui/checked-icon'
import PlayerIcon from '@/components/ui/player-icon'
import RefreshIcon from '@/components/ui/refresh-icon'
import BookmarkIcon from '@/components/ui/bookmark-icon'
import XIcon from '@/components/ui/x-icon'


import { MindflowEditor } from '../mindflow'
import { chime, step } from '@/lib/sound'
import { captureKey } from '@/lib/capture-links'
import { splitTags, unloaded, useLive, vigil, when, whenInLine, type Made, type Session, type Task, type TaskFull } from '@/lib/vigil'
import { BUCKETS, bucket, makeTask, placed } from '@/lib/tasks'
import { PRIORITY_NAMES } from '../../../../main/task-words'
import { PriorityIcon, TaskInput, planFor, setPriority } from './task-input'
import { useArrivals } from './note-list'
import { Empty, Island, Kbd, Page, Prop, PropInput, Props, Rolling, Tags, toast, useListKeys, typing, VirtualList, Stepper, Pressed } from './ui'
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
import { GlossButton, GlossLine } from './gloss-line'
import { dayjs, startOfDay } from '../../../../main/dates'

// itshover drawings in lucide's place, moving when their control is pointed at.
const Bell = alive(FilledBellIcon)
const CalendarClock = alive(ClockIcon)
const Check = alive(SimpleCheckedIcon)
const FileText = alive(FileDescriptionIcon)
const Gem = alive(LibraryIcon)
const Hash = alive(HashtagIcon)
const History = alive(HistoryCircleIcon)
const ListChecks = alive(CheckedIcon)
const Play = alive(PlayerIcon)
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
export function completeTask(task: Task, last = false): Promise<void> {
  chime('done')
  return vigil.doneTask(task.id).then(async (was) => {
    const back = (): void => void vigil.undoneTask(task.id, was)
    // A routine says when it is back; the last one for today says the day is done.
    if (task.recurrence) return toast(`Done · next ${when((await vigil.task(task.id))?.dueAt ?? null)}`, back)
    toast(last ? 'Done. That is everything for today' : 'Done', back)
  })
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
  const tasks = useLive(vigil.tasks, [] as Task[])
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
  const notify = useLive(vigil.settings, null as Awaited<ReturnType<typeof vigil.settings>> | null)?.notify
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
      : mode === 'today'
      ? [
          ['Overdue', base.filter((task) => dayOf(task) < startOfDay())],
          ['Today', [...today.filter(come), ...today.filter((task) => !come(task))]]
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
  // Sent here for one task, from search or a link: open it.
  useEffect(() => {
    if (focus) pick(focus)
  }, [focus])
  const [cursor, setCursor] = useListKeys(shown.length, { onOpen: (index) => pick(shown[index].id), onBack: () => setOpen(null) })
  const addRef = useRef<HTMLInputElement>(null)

  // On the row the keyboard is on: Alt-J and Alt-K move it (dates say what is
  // due, order says what is next), T, M and W put it on today, tomorrow or
  // next week in one press, and 1 to 4 give it a priority, 0 none.
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (typing() || event.defaultPrevented) return
      // A goes to the add-a-task field, as it does in the box's Today.
      if (event.key === 'a' && !event.metaKey && !event.ctrlKey && !event.altKey) {
        event.preventDefault()
        return addRef.current?.focus()
      }
      const task = shown[cursor]
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
 title={mode} count={shown.length} actions={
        <span className="flex items-center gap-2">
          {shown.length > 0 && <span className="hidden text-xs whitespace-nowrap @[48rem]/page:inline"><Pressed keys="?" /> or <Pressed keys="⌘/" /> for keys</span>}
          <Display
            view={view}
            onChange={setView}
            facets={facets}
            sorts={[{ id: 'manual', label: 'Your order' }, { id: 'priority', label: 'Priority' }, { id: 'name', label: 'Name' }, { id: 'due', label: 'Scheduled' }, { id: 'deadline', label: 'Due by' }, { id: 'added', label: 'Date added' }]}
            groups={[{ id: 'when', label: mode === 'later' ? 'By list' : 'By date' }, { id: 'note', label: 'By note' }, { id: 'none', label: 'None' }]}
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

        {shown.length ? (
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
                        { label: 'Today', keys: 'T', run: () => moveTo(task, 0) },
                        { label: 'Tomorrow', keys: 'M', run: () => moveTo(task, 1) },
                        { label: 'Next week', keys: 'W', run: () => moveTo(task, 7) },
                        ...(Object.keys(BUCKETS) as (keyof typeof BUCKETS)[]).map((which) => ({ label: BUCKETS[which], run: () => planFor(task, which) })),
                        'separator',
                        ...[1, 2, 3, 4, 0].map((level) => ({ label: PRIORITY_NAMES[level], keys: String(level), run: () => setPriority(task, level) })),
                        'separator',
                        { label: `Copy T-${task.number}`, run: () => copy(`T-${task.number}`, `Copied T-${task.number}`) },
                        'separator',
                        { label: 'Close without doing', danger: true, run: () => void vigil.saveTask(task.id, { status: 'dropped' }).then(() => (chime('away'), toast('Closed', () => void vigil.saveTask(task.id, { status: 'open' })))) }
                      ]}>
                      <div
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
                        <button type="button" data-row onClick={() => pick(task.id)} className="flex w-full min-w-0 flex-col items-start gap-1 text-left">
                          <span className="flex max-w-full items-center gap-2">
                            {task.priority ? <PriorityIcon level={task.priority} className="size-3.5 shrink-0" /> : null}
                            <span className="truncate">{splitTags(task.title).text}</span>
                            <Tags tags={splitTags(task.title).tags} />
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
        ) : unloaded(tasks) ? null : (
          <Rest seed="today" off={mode !== 'today'}>
          <Empty shape={mode === 'today' ? ['star', 6] : mode === 'routines' ? ['flower', 5] : mode === 'later' ? ['moon', 3] : ['ellipse', 4]} title={mode === 'today' ? 'Nothing due today' : mode === 'routines' ? 'No routines' : mode === 'later' ? 'Nothing put off' : 'Nothing coming up'}>
            {mode === 'routines'
              ? 'A routine is a task that repeats, kept here so it does not crowd Today. To make one, type it in the box above with how often: “water the plants every! 3 days”, “bins every week”.'
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
  const title = useRef<HTMLInputElement>(null)
  return (
    <div className="note-pane flex min-w-0 flex-[1.4] flex-col overflow-y-auto [--mf-padding:1rem_1.5rem_1rem_3.25rem] @[40rem]/page:flex-row @[40rem]/page:overflow-visible @[40rem]/page:[--mf-padding:1rem_4.75rem] @[56rem]/page:border-l [&>*:first-child]:min-h-[22rem] [&>*:first-child]:shrink-0 @[40rem]/page:[&>*:first-child]:min-h-0 @[40rem]/page:[&>*:first-child]:shrink">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col pt-6">
        {top && <div className="-mt-3 mb-1 flex px-3 @[40rem]/page:px-[4.25rem]">{top}</div>}
        {/* Pushed back three times: the plan's question, once, without a verdict. */}
        {task.reschedules >= 3 && task.status === 'open' && (
          <div className="page-narrow mx-auto mb-3 flex w-full items-center gap-2 px-12 text-sm text-muted-foreground">
            <span className="mr-auto">Moved {task.reschedules} times. Smaller, or let it go?</span>
            <Button variant="ghost" size="sm" onClick={() => {
              void vigil.saveTask(task.id, { reschedules: 0 })
              title.current?.select()
            }}>Make it smaller</Button>
            <Button variant="ghost" size="sm" onClick={() =>
              void vigil.saveTask(task.id, { status: 'dropped' }).then(() => {
                onClose()
                chime('away')
                toast('Closed', () => void vigil.saveTask(task.id, { status: 'open' }))
              })
            }>Close without doing</Button>
          </div>
        )}
        <input
          ref={title}
          className="page-narrow mx-auto mb-2 block w-full bg-transparent px-12 font-heading text-title font-semibold tracking-[-0.018em] text-balance outline-none"
          defaultValue={task.title}
          onBlur={(event) => void vigil.saveTask(task.id, { title: event.target.value })}
        />
        <MindflowEditor
          toolbar={{ fixed: false }}
          placeholder="Notes…"
          documentId={`task-${task.id}`}
          defaultContent={(task.notes as JSONContent | null) ?? ''}
          onChange={(notes) => void vigil.saveTask(task.id, { notes })}
        />
        {/* Keyed by the list itself, so a change made elsewhere (the other window, an undo) shows. */}
        <Checklist key={JSON.stringify(task.subtasks)} task={task} />
      </div>
      <Props>
        <Sessions taskId={task.id} title={task.title} />
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
        </Island>
        {/* The rest of what a task can carry, each one row like the rest. */}
        <Island compact title="Details">
          <PropInput icon={Ban} value={task.blocker ?? ''} placeholder="Blocked by…" onSave={(blocker) => void vigil.saveTask(task.id, { blocker: blocker || null })} />
          <PropInput icon={Timer} type="number" value={task.estimate ? String(task.estimate) : ''} placeholder="Estimate" suffix="minutes" onSave={(minutes) => void vigil.saveTask(task.id, { estimate: minutes ? Number(minutes) : null })} />
          <PropInput icon={Hourglass} value={task.waitingOn ?? ''} placeholder="Waiting on…" onSave={(waitingOn) => void vigil.saveTask(task.id, { waitingOn: waitingOn || null })} />
          <PropInput icon={Repeat} value={task.recurrence ?? ''} placeholder="Repeats, e.g. every week" onSave={(recurrence) => void vigil.saveTask(task.id, { recurrence: recurrence || null })} />
          <p className="px-2 py-1.5 text-xs leading-relaxed">
            “every” follows the calendar. “every!” counts from when you last did it. Add “until” and a date when you type a task to end the series.
            {task.repeatUntil ? ` This one ends ${whenInLine(task.repeatUntil)}.` : ''}
          </p>
        </Island>

        {/* Why it exists: the capture it came from, one click away. */}
        <Lineage id={task.id} onOpen={onOpen} />
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
          <Prop icon={Hash}>{captureKey(task.number).replace('MF', 'T')}</Prop>
          {/* Closed, not deleted (it comes back with Undo), so no bin. */}
          <Prop
            icon={CircleX}
            onClick={() =>
              void vigil.saveTask(task.id, { status: 'dropped' }).then(() => {
                onClose()
                chime('away')
                toast('Closed', () => void vigil.saveTask(task.id, { status: 'open' }))
              })
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
  if (!open) return <Prop icon={Play} onClick={() => {
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
      toast(close ? 'Done, with this session as how' : keep && recap.trim() ? 'Session saved, and the recap kept as a nugget' : 'Session saved')
    })

  return (
    <Island compact title={<>Sessions {sessions.length ? <>· <Rolling text={sessions.length} /></> : ''}</>}>
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
function shiftTo(days: number, from?: string | null): string {
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
                <span className="text-xs text-muted-foreground capitalize">{item.tier}</span>
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
    { key: 'tag', label: 'Tag', options: [...new Set(tasks.flatMap((task) => splitTags(task.title).tags))].sort().map((tag) => ({ id: tag, label: `#${tag}` })), test: (task, tag) => splitTags(task.title).tags.includes(tag) },
    { key: 'from', label: 'Came from', options: [{ id: 'capture', label: 'A note' }, { id: 'typed', label: 'Typed here' }], test: (task, from) => (task.fromId ? 'capture' : 'typed') === from }
  ]
}
