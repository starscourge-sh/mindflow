import { useEffect, useRef, useState } from 'react'
import * as chrono from 'chrono-node'
import type { JSONContent } from '@tiptap/core'
import { Bell, CalendarDays, Check, FileText, Flag, Gem, Hash, History, Play, Plus, Repeat, Square, Trash2, X } from 'lucide-react'


import { MindflowEditor } from '../mindflow'
import { chime } from '@/lib/sound'
import { captureKey } from '@/lib/capture-links'
import { splitTags, taskSaid, useLive, vigil, when, type Session, type Task, type TaskFull } from '@/lib/vigil'
import { Empty, Kbd, Page, Prop, PropLabel, Props, Tags, toast, useListKeys, typing, VirtualList } from './ui'
import { Display, arrange, useView, type Facet } from './display'
import { DatePicker } from './date-picker'
import { Lineage } from './lineage'
import { RowMenu, copy } from './row-menu'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Tip } from '@/components/vigil/ui'
import { Button } from '@/components/ui/button'

const startOfDay = (offset = 0): number => new Date(new Date().setHours(0, 0, 0, 0) + offset * 86400000).getTime()

/** Red if it is late, orange if it is today, quiet otherwise: the Todoist colours. */
const tone = (task: Task): string | undefined => {
  if (!task.dueAt) return undefined
  const due = new Date(task.dueAt).getTime()
  if (due < startOfDay()) return 'var(--tt-color-text-red)'
  if (due < startOfDay(1)) return 'var(--tt-color-text-orange)'
  return undefined
}

/** Move a task to a day from now, and say where: one wording for keys, menus and buttons. */
const moveTo = (id: string, days: number): void =>
  void vigil.saveTask(id, { due: shiftTo(days) }).then(() => {
    chime('tap')
    toast(`Moved to ${when(shiftTo(days))}`)
  })

/**
 * Tasks, the way Todoist lists them: Today with what is late on top, Upcoming
 * by day, and a line at the top that reads the date and the repeat out of what
 * you type. A task is not a note with a tickbox: it has a when, a record of each
 * time it was done, and a way back to the capture it came from.
 */
export function TasksView({ mode, focus, onOpen }: { mode: 'today' | 'upcoming' | 'routines'; focus?: string; onOpen?: (type: string, id: string) => void }): React.JSX.Element {
  const tasks = useLive(vigil.tasks, [] as Task[])
  const [open, setOpen] = useState<TaskFull | null>(null)
  const [draft, setDraft] = useState('')
  const [leaving, setLeaving] = useState<string | null>(null)

  const [view, setView] = useView(`tasks:${mode}`, { sort: 'manual', group: 'when' })
  const facets = taskFacets(tasks)
  // Filtered and ordered first; the view's own groups are cut from what is left.
  const [[, chosenTasks]] = arrange(tasks, view, facets, {
    name: (a, b) => a.title.localeCompare(b.title),
    due: (a, b) => (a.dueAt ?? '9').localeCompare(b.dueAt ?? '9'),
    deadline: (a, b) => (a.deadline ?? '9').localeCompare(b.deadline ?? '9'),
    added: (a, b) => b.createdAt.localeCompare(a.createdAt)
  })
  // Routines live in a view of their own, or they flood Today.
  const live = chosenTasks.filter((task) => task.status === 'open' && !task.waitingOn && (mode === 'routines' ? task.recurrence : !task.recurrence || mode === 'today'))
  const waiting = chosenTasks.filter((task) => task.status === 'open' && task.waitingOn)
  const groups: [string, Task[]][] =
    view.group === 'none'
      ? [['', [...live.filter((task) => mode !== 'today' || (task.dueAt && new Date(task.dueAt).getTime() < startOfDay(1))), ...(mode === 'upcoming' ? waiting : [])]]]
      : mode === 'routines'
      ? [['Every so often', live]]
      : mode === 'today'
      ? [
          ['Overdue', live.filter((task) => task.dueAt && new Date(task.dueAt).getTime() < startOfDay())],
          ['Today', live.filter((task) => task.dueAt && new Date(task.dueAt).getTime() >= startOfDay() && new Date(task.dueAt).getTime() < startOfDay(1))]
        ]
      : [
          ...Object.entries(
            Object.groupBy(
              live.filter((task) => task.dueAt && new Date(task.dueAt).getTime() >= startOfDay(1)),
              (task) => when(task.dueAt)
            ) as Record<string, Task[]>
          ),
          ['Backlog, no date', live.filter((task) => !task.dueAt)],
          // Chasing is not doing: what you are waiting on gets its own place.
          ['Waiting on someone', waiting]
        ]
  const shown = groups.flatMap(([, list]) => list)
  // One list for the virtual scroller: each group's heading, then its tasks.
  const rows: (Task | { heading: string; count: number })[] = groups.flatMap(([heading, list]) => (list.length ? [{ heading, count: list.length }, ...list] : []))
  const pick = (id: string): void => void vigil.task(id).then(setOpen)
  // Sent here for one task, from search or a link: open it.
  useEffect(() => {
    if (focus) pick(focus)
  }, [focus])
  const [cursor, setCursor] = useListKeys(shown.length, { onOpen: (index) => pick(shown[index].id), onBack: () => setOpen(null) })

  // On the row the keyboard is on: Alt-J and Alt-K move it (dates say what is
  // due, order says what is next), and T, M and W put it on today, tomorrow
  // or next week in one press.
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (typing() || event.defaultPrevented) return
      const task = shown[cursor]
      if (!task) return
      if (event.altKey && (event.code === 'KeyJ' || event.code === 'KeyK')) {
        event.preventDefault()
        const to = cursor + (event.code === 'KeyJ' ? 1 : -1)
        // Important ones sort first, so a task moves only among its own kind.
        if (to < 0 || to >= shown.length || shown[to].important !== task.important) return
        // Renumber the list as shown, with the two swapped.
        const order = [...shown]
        ;[order[cursor], order[to]] = [order[to], order[cursor]]
        void Promise.all(order.map((one, index) => vigil.saveTask(one.id, { sortOrder: index })))
        setCursor(to)
        return
      }
      if (event.metaKey || event.ctrlKey || event.altKey) return
      // e completes, as in Todoist.
      if (event.key === 'e') return complete(task)
      const days = { t: 0, m: 1, w: 7 }[event.key]
      if (days === undefined) return
      moveTo(task.id, days)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  // The circle fills first, then the row goes: the click is answered before
  // the list changes under you.
  const complete = (task: Task): void => {
    setLeaving(task.id)
    chime('done')
    setTimeout(() => {
      void vigil.doneTask(task.id).then(async () => {
        setLeaving(null)
        // A routine says when it is back; a one-off can be taken back.
        if (task.recurrence) toast(`Done · next ${when((await vigil.task(task.id))?.dueAt ?? null)}`)
        else toast('Done', () => void vigil.saveTask(task.id, { status: 'open' }))
      })
    }, 280)
  }

  return (
    <>
      <Page aside={!!open}
 title={mode} count={shown.length} actions={
        <span className="flex items-center gap-2">
          {shown.length > 0 && <span className="hidden text-xs whitespace-nowrap @[60rem]/page:inline"><Kbd>T</Kbd> <Kbd>M</Kbd> <Kbd>W</Kbd> today, tomorrow, next week · <Kbd>⌥J</Kbd> <Kbd>⌥K</Kbd> reorder</span>}
          <Display
            view={view}
            onChange={setView}
            facets={facets}
            sorts={[{ id: 'manual', label: 'Your order' }, { id: 'name', label: 'Name' }, { id: 'due', label: 'Date' }, { id: 'deadline', label: 'Deadline' }, { id: 'added', label: 'Date added' }]}
            groups={[{ id: 'when', label: 'By date' }, { id: 'none', label: 'None' }]}
          />
        </span>
      }>

        <form
          className="mx-3 mt-3 flex items-center gap-2 rounded-md border px-2 py-1.5 focus-within:border-ring"
          onSubmit={(event) => {
            event.preventDefault()
            if (!draft.trim()) return
            void vigil.addTask(draft, undefined, mode === 'today').then(async (made) => {
              chime(made.existed ? 'nope' : 'noted')
              if (made.existed) return void (setDraft(''), toast(taskSaid(made, '')))
              const task = await vigil.task(made.id)
              setDraft('')
              // Said where it went when that is not the list in front of you.
              const where = !task ? mode
                : task.recurrence ? 'routines'
                : task.dueAt && new Date(task.dueAt).getTime() < startOfDay(1) ? 'today'
                : 'upcoming'
              toast(where === mode ? 'Task added'
                : where === 'routines' ? 'Added to Routines'
                : where === 'today' ? 'Added to Today'
                : task?.dueAt ? `Added to Upcoming, ${when(task.dueAt).toLowerCase()}`
                : 'Added to the backlog in Upcoming: put a day in the words to date it')
            })
          }}
        >
          <Plus className="size-4 text-muted-foreground" />
          <input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Add a task: “call the accountant tomorrow 10am”, “water the plants every! 3 days”"
            className="flex-1 bg-transparent outline-none placeholder:text-muted-foreground"
          />
          <Kbd>↵</Kbd>
        </form>

        {shown.length ? (
          <VirtualList
            items={rows}
            keyOf={(row) => ('id' in row ? row.id : `heading-${row.heading}`)}
            cursor={shown[cursor] ? rows.indexOf(shown[cursor]) : undefined}
            className="mx-3 mb-6"
          >
            {(row) => {
              if (!('id' in row))
                return row.heading ? (
                  <h3 className="mt-6 mb-1 border-b px-2 pb-1.5 text-meta font-medium" style={{ color: row.heading === 'Overdue' ? 'var(--tt-color-text-red)' : undefined }}>
                    {row.heading} <span className="font-normal text-muted-foreground">{row.count}</span>
                  </h3>
                ) : <div className="h-3" />
              const task = row
              const index = shown.indexOf(task)
              return (
                      <RowMenu items={[
                        { label: 'Open', keys: '↵', run: () => pick(task.id) },
                        { label: 'Complete', keys: 'E', run: () => complete(task) },
                        'separator',
                        { label: 'Today', keys: 'T', run: () => moveTo(task.id, 0) },
                        { label: 'Tomorrow', keys: 'M', run: () => moveTo(task.id, 1) },
                        { label: 'Next week', keys: 'W', run: () => moveTo(task.id, 7) },
                        'separator',
                        { label: task.important ? 'Not important' : 'Mark important', run: () => void vigil.saveTask(task.id, { important: task.important ? 0 : 1 }).then(() => chime(task.important ? 'off' : 'on')) },
                        { label: `Copy T-${task.number}`, run: () => copy(`T-${task.number}`, `Copied T-${task.number}`) },
                        'separator',
                        { label: 'Close without doing', danger: true, run: () => void vigil.saveTask(task.id, { status: 'dropped' }).then(() => (chime('away'), toast('Closed', () => void vigil.saveTask(task.id, { status: 'open' })))) }
                      ]}>
                      <div
                        data-cursor={index === cursor || undefined}
                        className={`group flex items-start gap-3 rounded-sm px-2 py-2 transition-colors ${task.id === open?.id ? 'bg-accent' : index === cursor ? 'bg-accent/40' : 'hover:bg-accent/50'}`}
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
                        <button type="button" data-row onClick={() => pick(task.id)} className="flex min-w-0 flex-1 flex-col items-start gap-1 text-left">
                          <span className="flex max-w-full items-center gap-2">
                            <span className="truncate">{splitTags(task.title).text}</span>
                            <Tags tags={splitTags(task.title).tags} />
                          </span>
                          {(task.dueAt || task.recurrence || task.waitingOn || task.important || task.deadline || task.blocker) && (
                            <span className="flex items-center gap-3 text-xs text-muted-foreground">
                              {task.important ? <Flag className="size-3 text-[var(--tt-color-text-red)]" /> : null}
                              {task.dueAt && (
                                <span className="flex items-center gap-1" style={{ color: tone(task) }}>
                                  <CalendarDays className="size-3" />
                                  {when(task.dueAt, !!task.allDay)}
                                </span>
                              )}
                              {task.recurrence && <Repeat className="size-3" />}
                              {task.waitingOn && <span>Waiting on {task.waitingOn}</span>}
                              {task.deadline && (
                                <span style={{ color: new Date(task.deadline).getTime() < startOfDay(1) ? 'var(--tt-color-text-red)' : undefined }}>
                                  By {when(task.deadline).toLowerCase()}
                                </span>
                              )}
                              {task.blocker && <span className="truncate">Blocked: {task.blocker}</span>}
                            </span>
                          )}
                        </button>
                      </div>
                      </RowMenu>
              )
            }}
          </VirtualList>
        ) : (
          <Empty shape={mode === 'today' ? ['star', 6] : mode === 'routines' ? ['flower', 5] : ['ellipse', 4]} title={mode === 'today' ? 'Nothing due today' : mode === 'routines' ? 'No routines' : 'Nothing coming up'}>
            {mode === 'routines'
              ? 'A routine is a task that repeats: “water the plants every! 3 days”, “bins every week”. They live here so they do not crowd Today.'
              : mode === 'today'
              ? 'A clear day. Anything with a date lands here on the day, and anything late stays on top until it is done.'
              : 'Tasks with a date further out show here, grouped by day. Type one above with the date in the words.'}
          </Empty>
        )}
      </Page>
      {open && <TaskDetail key={open.id} task={open} onClose={() => setOpen(null)} onOpen={onOpen} />}
    </>
  )
}

/** The open task: its notes, and down the right when it is and what it has been. */
export function TaskDetail({ task: first, onClose, onOpen }: { task: TaskFull; onClose: () => void; onOpen?: (type: string, id: string) => void }): React.JSX.Element {
  // Read again on every change, so a toggle shows what it now is.
  const task = useLive(async () => (await vigil.task(first.id)) ?? first, first, [first.id])
  const title = useRef<HTMLInputElement>(null)
  return (
    <div className="flex min-w-0 flex-[1.4] flex-col overflow-y-auto [--mf-padding:1rem_1.5rem_1rem_3.25rem] @[40rem]/page:flex-row @[40rem]/page:overflow-visible @[40rem]/page:[--mf-padding:1rem_4.75rem] @[56rem]/page:border-l [&>*:first-child]:min-h-[22rem] [&>*:first-child]:shrink-0 @[40rem]/page:[&>*:first-child]:min-h-0 @[40rem]/page:[&>*:first-child]:shrink">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col pt-6">
        {/* Pushed back three times: the plan's question, once, without a verdict. */}
        {task.reschedules >= 3 && task.status === 'open' && (
          <div className="mx-auto mb-3 flex w-full max-w-[44rem] items-center gap-2 px-12 text-sm text-muted-foreground">
            <span className="mr-auto">Moved {task.reschedules} times. Smaller, or let it go?</span>
            <Button variant="ghost" size="sm" onClick={() => {
              void vigil.saveTask(task.id, { reschedules: 0 })
              title.current?.select()
            }}>Make it smaller</Button>
            <Button variant="ghost" size="sm" onClick={() =>
              void vigil.saveTask(task.id, { status: 'dropped' }).then(() => {
                onClose()
                chime('away')
                toast('Let go', () => void vigil.saveTask(task.id, { status: 'open' }))
              })
            }>Let it go</Button>
          </div>
        )}
        <input
          ref={title}
          className="mx-auto mb-2 block w-full max-w-[44rem] bg-transparent px-12 text-title font-semibold text-balance outline-none"
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
        <Checklist task={task} />
      </div>
      <Props>
        <Sessions taskId={task.id} title={task.title} />
        <PropLabel>Due</PropLabel>
        <div className="mb-1 flex gap-1">
          {([['Today', 0], ['Tomorrow', 1], ['Next week', 7]] as const).map(([label, days]) => (
            <Button variant="outline" size="sm" key={label} onClick={() => moveTo(task.id, days)} className="flex-1">
              {label}
            </Button>
          ))}
        </div>
        <DatePicker time value={task.dueAt} onChange={(due) => void vigil.saveTask(task.id, { due })} placeholder="No date" />
        <Prop icon={Flag} active={!!task.important} onClick={() => void vigil.saveTask(task.id, { important: task.important ? 0 : 1 }).then(() => chime(task.important ? 'off' : 'on'))}>
          {task.important ? 'Important: sorts first' : 'Mark important'}
        </Prop>
        {/* Its own alert level, for the one task that must interrupt you. */}
        <Prop icon={Bell} active={task.notify === 'alerts'} onClick={() => void vigil.saveTask(task.id, { notify: task.notify === 'alerts' ? null : 'alerts' }).then(() => chime(task.notify === 'alerts' ? 'off' : 'on'))}>
          {task.notify === 'alerts' ? 'Alerts you at its time' : 'Alert me at its time'}
        </Prop>
        {/* When you mean to do it is the due date; when it must be done by is this. */}
        <PropLabel>Deadline</PropLabel>
        <DatePicker value={task.deadline} onChange={(deadline) => void vigil.saveTask(task.id, { deadline })} placeholder="No deadline" />
        <PropLabel>Blocked by</PropLabel>
        <Input
          defaultValue={task.blocker ?? ''}
          placeholder="What is in the way"
          // Enter keeps it, the way it does in every other field here.
          onKeyDown={(event) => event.key === 'Enter' && event.currentTarget.blur()}
          onBlur={(event) => void vigil.saveTask(task.id, { blocker: event.target.value.trim() || null })}
          className="h-8 w-auto"
        />
        <PropLabel>Estimate</PropLabel>
        <label className="flex items-center gap-2">
          <Input
            type="number"
            min={0}
            step={5}
            defaultValue={task.estimate ?? ''}
            placeholder="–"
            onBlur={(event) => void vigil.saveTask(task.id, { estimate: event.target.value ? Number(event.target.value) : null })}
            className="h-8 w-20 tabular-nums"
          />
          <span className="text-xs">minutes</span>
        </label>
        <PropLabel>Waiting on</PropLabel>
        <Input
          defaultValue={task.waitingOn ?? ''}
          placeholder="Someone's name"
          // Enter keeps it, the way it does in every other field here.
          onKeyDown={(event) => event.key === 'Enter' && event.currentTarget.blur()}
          onBlur={(event) => void vigil.saveTask(task.id, { waitingOn: event.target.value.trim() || null })}
          className="h-8 w-auto"
        />
        <PropLabel>Repeats</PropLabel>
        <Input
          defaultValue={task.recurrence ?? ''}
          placeholder="e.g. every week"
          // Enter keeps it, the way it does in every other field here.
          onKeyDown={(event) => event.key === 'Enter' && event.currentTarget.blur()}
          onBlur={(event) => void vigil.saveTask(task.id, { recurrence: event.target.value.trim() || null })}
          className="h-8 w-auto"
        />
        <p className="mx-2 mt-1 text-xs leading-relaxed">
          “every” follows the calendar. “every!” counts from when you last did it. Add “until” and a date when you type a task to end the series.
          {task.repeatUntil ? ` This one ends ${when(task.repeatUntil).toLowerCase()}.` : ''}
        </p>

        {/* Why it exists: the capture it came from, one click away. */}
        <Lineage id={task.id} onOpen={onOpen} />
        {task.done.length > 0 && (
          <>
            <PropLabel>Done</PropLabel>
            {task.done.slice(0, 6).map((one) => (
              <div key={one.at}>
                <Prop icon={History}>{when(one.at, false)}</Prop>
                {one.recap && <p className="mx-2 -mt-1 mb-1.5 line-clamp-3 pl-6 text-control text-foreground">{one.recap}</p>}
              </div>
            ))}
          </>
        )}
        <PropLabel>Task</PropLabel>
        <Prop icon={Hash}>{captureKey(task.number).replace('MF', 'T')}</Prop>
        <Prop
          icon={Trash2}
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
  if (!open) return <Prop icon={Play} onClick={() => setOpen(true)}>Start a focus session</Prop>
  return (
    <form
      className="mx-1 flex flex-col gap-2 rounded-lg border p-2"
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
      <label className="grid gap-1 text-xs">Goal
        <Input autoFocus value={goal} onChange={(event) => setGoal(event.target.value)} className="h-8 text-control" />
      </label>
      <label className="grid gap-1 text-xs">How long
        <Input value={length} onChange={(event) => setLength(event.target.value)} placeholder="45 min, 1:30, until 6pm" className={`h-8 text-control ${planned === undefined ? 'border-[var(--tt-color-text-red)]' : ''}`} />
      </label>
      <div className="flex flex-wrap gap-1">
        {LENGTHS.map((one) => (
          <button key={one} type="button" onClick={() => setLength(one)} className={`rounded-md px-1.5 py-0.5 text-xs ${length === one ? 'bg-accent text-foreground' : 'hover:bg-accent/60'}`}>{one}</button>
        ))}
      </div>
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
      toast(close ? 'Done, with this session as how' : keep && recap.trim() ? 'Session saved, and the recap kept as a nugget' : 'Session saved')
    })

  return (
    <>
      <PropLabel>Sessions {sessions.length ? `· ${sessions.length}` : ''}</PropLabel>
      {running ? (
        <div className="space-y-2">
          <div className="flex items-center gap-2 px-1 text-foreground">
            <span className="size-1.5 animate-pulse rounded-full bg-[var(--tt-color-text-red)]" />
            <span className="text-lg font-semibold tabular-nums">{clock(Math.max(0, tick - new Date(running.startedAt).getTime()))}</span>
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
      {sessions.filter((session) => session.endedAt).slice(0, 4).map((session) => (
        <div key={session.id} className="mx-2 mb-1.5">
          <p className="text-xs tabular-nums">
            {when(session.startedAt, false)} · {clock(new Date(session.endedAt!).getTime() - new Date(session.startedAt).getTime())}
          </p>
          {session.recap && <p className="mt-0.5 line-clamp-3 text-control text-foreground">{session.recap}</p>}
        </div>
      ))}
    </>
  )
}

/** A date that many days from today, at nine unless the time is kept. */
function shiftTo(days: number): string {
  const date = new Date()
  date.setDate(date.getDate() + days)
  date.setHours(9, 0, 0, 0)
  return date.toISOString()
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
    <section className="mx-auto w-full max-w-[44rem] px-12 pb-10">
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
        Subtasks {items.length ? <span className="font-normal text-muted-foreground">{items.filter((one) => one.done).length}/{items.length}</span> : null}
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
        className="mt-1 w-full bg-transparent py-1 outline-none placeholder:text-muted-foreground"
      />
    </section>
  )
}

/** What a task list can be narrowed by: the same in the main window and the prompt. */
export function taskFacets(tasks: Task[]): Facet<Task>[] {
  return [
    { key: 'marked', label: 'Marked', options: [{ id: 'important', label: 'Important' }, { id: 'deadline', label: 'Has a deadline' }, { id: 'blocked', label: 'Blocked' }, { id: 'estimate', label: 'Estimated' }],
      test: (task, mark) => (mark === 'important' ? !!task.important : mark === 'deadline' ? !!task.deadline : mark === 'blocked' ? !!task.blocker : task.estimate !== null) },
    { key: 'tag', label: 'Tag', options: [...new Set(tasks.flatMap((task) => splitTags(task.title).tags))].sort().map((tag) => ({ id: tag, label: `#${tag}` })), test: (task, tag) => splitTags(task.title).tags.includes(tag) },
    { key: 'from', label: 'Came from', options: [{ id: 'capture', label: 'A capture' }, { id: 'typed', label: 'Typed here' }], test: (task, from) => (task.captureId ? 'capture' : 'typed') === from }
  ]
}
