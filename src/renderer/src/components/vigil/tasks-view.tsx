import { Fragment, useEffect, useRef, useState } from 'react'
import type { JSONContent } from '@tiptap/core'
import { CalendarDays, Check, FileText, Flag, Gem, Hash, History, Play, Plus, Repeat, Square, Trash2, X } from 'lucide-react'

import { AnimatePresence, motion } from 'motion/react'

import { MindflowEditor } from '../mindflow'
import { chime } from '@/lib/sound'
import { captureKey } from '@/lib/capture-links'
import { splitTags, useLive, vigil, when, type Session, type Task, type TaskFull } from '@/lib/vigil'
import { Empty, Kbd, Page, Prop, PropLabel, Props, Tags, toast, useListKeys } from './ui'
import { Display, arrange, useView, type Facet } from './display'

const startOfDay = (offset = 0): number => new Date(new Date().setHours(0, 0, 0, 0) + offset * 86400000).getTime()

/** Red if it is late, orange if it is today, quiet otherwise: the Todoist colours. */
const tone = (task: Task): string | undefined => {
  if (!task.dueAt) return undefined
  const due = new Date(task.dueAt).getTime()
  if (due < startOfDay()) return 'var(--tt-color-text-red)'
  if (due < startOfDay(1)) return 'var(--tt-color-text-orange)'
  return undefined
}

/**
 * Tasks, the way Todoist lists them: Today with what is late on top, Upcoming
 * by day, and a line at the top that reads the date and the repeat out of what
 * you type. A task is not a note with a tickbox: it has a when, a record of each
 * time it was done, and a way back to the capture it came from.
 */
export function TasksView({ mode }: { mode: 'today' | 'upcoming' | 'routines' }): React.JSX.Element {
  const tasks = useLive(vigil.tasks, [] as Task[])
  const [open, setOpen] = useState<TaskFull | null>(null)
  const [draft, setDraft] = useState('')
  const [leaving, setLeaving] = useState<string | null>(null)

  const [view, setView] = useView(`tasks:${mode}`, { sort: 'manual', group: 'when' })
  const facets: Facet<Task>[] = [
    { key: 'marked', label: 'Marked', options: [{ id: 'important', label: 'Important' }, { id: 'deadline', label: 'Has a deadline' }, { id: 'blocked', label: 'Blocked' }, { id: 'estimate', label: 'Estimated' }],
      test: (task, mark) => (mark === 'important' ? !!task.important : mark === 'deadline' ? !!task.deadline : mark === 'blocked' ? !!task.blocker : task.estimate !== null) },
    { key: 'tag', label: 'Tag', options: [...new Set(tasks.flatMap((task) => splitTags(task.title).tags))].sort().map((tag) => ({ id: tag, label: `#${tag}` })), test: (task, tag) => splitTags(task.title).tags.includes(tag) },
    { key: 'from', label: 'Came from', options: [{ id: 'capture', label: 'A capture' }, { id: 'typed', label: 'Typed here' }], test: (task, from) => (task.captureId ? 'capture' : 'typed') === from }
  ]
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
  const pick = (id: string): void => void vigil.task(id).then(setOpen)
  const [cursor, setCursor] = useListKeys(shown.length, { onOpen: (index) => pick(shown[index].id), onBack: () => setOpen(null) })

  // On the row the keyboard is on: Alt-J and Alt-K move it (dates say what is
  // due, order says what is next), and T, M and W put it on today, tomorrow
  // or next week in one press.
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      const active = document.activeElement as HTMLElement | null
      if (active?.isContentEditable || ['INPUT', 'TEXTAREA'].includes(active?.tagName ?? '')) return
      const task = shown[cursor]
      if (!task) return
      if (event.altKey && (event.code === 'KeyJ' || event.code === 'KeyK')) {
        event.preventDefault()
        const to = cursor + (event.code === 'KeyJ' ? 1 : -1)
        if (to < 0 || to >= shown.length) return
        // Renumber the list as shown, with the two swapped.
        const order = [...shown]
        ;[order[cursor], order[to]] = [order[to], order[cursor]]
        void Promise.all(order.map((one, index) => vigil.saveTask(one.id, { sortOrder: index })))
        setCursor(to)
        return
      }
      const days = { t: 0, m: 1, w: 7 }[event.key]
      if (days === undefined || event.metaKey || event.ctrlKey || event.altKey) return
      void vigil.saveTask(task.id, { due: shiftTo(days) }).then(() => toast(`Moved to ${when(shiftTo(days)).toLowerCase()}`))
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
        if (task.recurrence) toast(`Done · next ${when((await vigil.task(task.id))?.dueAt ?? null).toLowerCase()}`)
        else toast('Done', () => void vigil.saveTask(task.id, { status: 'open' }))
      })
    }, 280)
  }

  return (
    <>
      <Page title={mode} count={shown.length} actions={
        <span className="flex items-center gap-2">
          {shown.length > 0 && <span className="text-xs"><Kbd>T</Kbd> <Kbd>M</Kbd> <Kbd>W</Kbd> today, tomorrow, next week · <Kbd>⌥J</Kbd> <Kbd>⌥K</Kbd> reorder</span>}
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
          className="mx-3 mt-3 flex items-center gap-3 rounded-lg border px-2 py-2 focus-within:border-ring"
          onSubmit={(event) => {
            event.preventDefault()
            if (!draft.trim()) return
            void vigil.addTask(draft).then(() => {
              setDraft('')
              toast('Task added')
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
          <div className="px-3 pb-6">
            {groups.map(([label, list]) =>
              list.length ? (
                <Fragment key={label || 'all'}>
                  {label ? (
                    <h3 className="mt-6 mb-1 border-b px-2 pb-1.5 text-[13px] font-semibold" style={{ color: label === 'Overdue' ? 'var(--tt-color-text-red)' : undefined }}>
                      {label} <span className="font-normal text-muted-foreground">{list.length}</span>
                    </h3>
                  ) : <div className="mt-3" />}
                  <AnimatePresence initial={false}>
                  {list.map((task) => {
                    const index = shown.indexOf(task)
                    return (
                      <motion.div
                        key={task.id}
                        layout="position"
                        initial={{ opacity: 0, y: -4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, x: 24, transition: { duration: 0.2 } }}
                        ref={index === cursor ? (element) => element?.scrollIntoView({ block: 'nearest' }) : undefined}
                        className={`group flex items-start gap-3 border-b border-border/50 px-2 py-2 transition-colors ${task.id === open?.id ? 'bg-accent/60' : ''} ${index === cursor ? 'ring-1 ring-border' : ''}`}
                      >
                        <button
                          type="button"
                          title="Complete"
                          onClick={() => complete(task)}
                          className="mt-0.5 flex size-[18px] shrink-0 items-center justify-center rounded-full border-[1.5px] transition-colors hover:bg-accent"
                          style={{ borderColor: tone(task), background: leaving === task.id ? 'var(--tt-color-text-green)' : undefined }}
                        >
                          <Check className={`size-3 transition-opacity ${leaving === task.id ? 'opacity-100' : 'opacity-0 group-hover:opacity-50'}`} />
                        </button>
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
                      </motion.div>
                    )
                  })}
                  </AnimatePresence>
                </Fragment>
              ) : null
            )}
          </div>
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
      {open && <TaskDetail key={open.id} task={open} onClose={() => setOpen(null)} />}
    </>
  )
}

/** The open task: its notes, and down the right when it is and what it has been. */
function TaskDetail({ task: first, onClose }: { task: TaskFull; onClose: () => void }): React.JSX.Element {
  // Read again on every change, so a toggle shows what it now is.
  const task = useLive(async () => (await vigil.task(first.id)) ?? first, first, [first.id])
  const local = (iso: string | null): string => (iso ? new Date(new Date(iso).getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) : '')
  const title = useRef<HTMLInputElement>(null)
  return (
    <div className="flex min-w-0 flex-[1.4] border-l">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col pt-6">
        {/* Pushed back three times: the plan's question, once, without a verdict. */}
        {task.reschedules >= 3 && task.status === 'open' && (
          <div className="mx-auto mb-3 flex w-full max-w-[44rem] items-center gap-2 px-12 text-sm text-muted-foreground">
            <span className="mr-auto">Moved {task.reschedules} times. Smaller, or let it go?</span>
            <button type="button" className="rounded-md px-2 py-1 hover:bg-accent hover:text-foreground" onClick={() => {
              void vigil.saveTask(task.id, { reschedules: 0 })
              title.current?.select()
            }}>Make it smaller</button>
            <button type="button" className="rounded-md px-2 py-1 hover:bg-accent hover:text-foreground" onClick={() =>
              void vigil.saveTask(task.id, { status: 'done' }).then(() => {
                onClose()
                toast('Let go', () => void vigil.saveTask(task.id, { status: 'open' }))
              })
            }>Let it go</button>
          </div>
        )}
        <input
          ref={title}
          className="mx-auto mb-2 block w-full max-w-[44rem] bg-transparent px-12 text-2xl font-semibold outline-none"
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
        <Sessions taskId={task.id} />
        <PropLabel>Due</PropLabel>
        <div className="mx-1 mb-1 flex gap-1">
          {([['Today', 0], ['Tomorrow', 1], ['Next week', 7]] as const).map(([label, days]) => (
            <button key={label} type="button" onClick={() => void vigil.saveTask(task.id, { due: shiftTo(days) })} className="flex-1 rounded-md border px-1.5 py-1 text-xs hover:bg-accent hover:text-foreground">
              {label}
            </button>
          ))}
        </div>
        <input
          type="datetime-local"
          defaultValue={local(task.dueAt)}
          onChange={(event) => void vigil.saveTask(task.id, { due: event.target.value ? new Date(event.target.value).toISOString() : null })}
          className="mx-1 rounded-md border bg-transparent px-2 py-1 text-foreground"
        />
        <Prop icon={Flag} active={!!task.important} onClick={() => void vigil.saveTask(task.id, { important: task.important ? 0 : 1 })}>
          {task.important ? 'Important: sorts first' : 'Mark important'}
        </Prop>
        {/* When you mean to do it is the due date; when it must be done by is this. */}
        <PropLabel>Deadline</PropLabel>
        <input
          type="date"
          defaultValue={task.deadline?.slice(0, 10) ?? ''}
          onChange={(event) => void vigil.saveTask(task.id, { deadline: event.target.value ? new Date(`${event.target.value}T23:59:00`).toISOString() : null })}
          className="mx-1 rounded-md border bg-transparent px-2 py-1 text-foreground"
        />
        <PropLabel>Blocked by</PropLabel>
        <input
          defaultValue={task.blocker ?? ''}
          placeholder="What is in the way"
          onBlur={(event) => void vigil.saveTask(task.id, { blocker: event.target.value.trim() || null })}
          className="mx-1 rounded-md border bg-transparent px-2 py-1 text-foreground placeholder:text-muted-foreground"
        />
        <PropLabel>Estimate</PropLabel>
        <label className="mx-1 flex items-center gap-2 rounded-md border px-2 py-1">
          <input
            type="number"
            min={0}
            step={5}
            defaultValue={task.estimate ?? ''}
            placeholder="–"
            onBlur={(event) => void vigil.saveTask(task.id, { estimate: event.target.value ? Number(event.target.value) : null })}
            className="w-16 bg-transparent text-foreground tabular-nums outline-none"
          />
          <span className="text-xs">minutes</span>
        </label>
        <PropLabel>Waiting on</PropLabel>
        <input
          defaultValue={task.waitingOn ?? ''}
          placeholder="Someone's name"
          onBlur={(event) => void vigil.saveTask(task.id, { waitingOn: event.target.value.trim() || null })}
          className="mx-1 rounded-md border bg-transparent px-2 py-1 text-foreground placeholder:text-muted-foreground"
        />
        <PropLabel>Repeats</PropLabel>
        <input
          defaultValue={task.recurrence ?? ''}
          placeholder="e.g. every week"
          onBlur={(event) => void vigil.saveTask(task.id, { recurrence: event.target.value.trim() || null })}
          className="mx-1 rounded-md border bg-transparent px-2 py-1 text-foreground placeholder:text-muted-foreground"
        />
        <p className="mx-2 mt-1 text-xs leading-relaxed">
          “every” follows the calendar. “every!” counts from when you last did it. Add “until” and a date when you type a task to end the series.
          {task.repeatUntil ? ` This one ends ${when(task.repeatUntil).toLowerCase()}.` : ''}
        </p>

        {task.captureId && (
          <>
            <PropLabel>From</PropLabel>
            <Prop icon={Hash}>A capture</Prop>
          </>
        )}
        {task.done.length > 0 && (
          <>
            <PropLabel>Done</PropLabel>
            {task.done.slice(0, 6).map((one) => (
              <Prop key={one.at} icon={History}>{when(one.at, false)}</Prop>
            ))}
          </>
        )}
        <PropLabel>Task</PropLabel>
        <Prop icon={Hash}>{captureKey(task.number).replace('MF', 'T')}</Prop>
        <Prop
          icon={Trash2}
          onClick={() =>
            void vigil.saveTask(task.id, { status: 'done' }).then(() => {
              onClose()
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

/**
 * Sessions: effort against a task, counted, with a record of what happened.
 * The recap does not ask for a summary, which gets "worked on freight rules";
 * it asks what surprised you, which is already shaped like something worth
 * keeping, and it can be kept as a nugget in the same breath.
 */
function Sessions({ taskId }: { taskId: string }): React.JSX.Element {
  const sessions = useLive(() => vigil.sessions(taskId), [] as Session[], [taskId])
  const running = sessions.find((session) => !session.endedAt)
  const [recap, setRecap] = useState('')
  const [tick, setTick] = useState(Date.now())
  useEffect(() => {
    if (!running) return
    const timer = setInterval(() => setTick(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [running])
  const end = (keep: boolean): void =>
    void vigil.endSession(running!.id, recap, keep).then(() => {
      setRecap('')
      toast(keep && recap.trim() ? 'Session saved, and the recap kept as a nugget' : 'Session saved')
    })

  return (
    <>
      <PropLabel>Sessions {sessions.length ? `· ${sessions.length}` : ''}</PropLabel>
      {running ? (
        <div className="mx-1 space-y-2">
          <div className="flex items-center gap-2 px-1 text-foreground">
            <span className="size-1.5 animate-pulse rounded-full bg-[var(--tt-color-text-red)]" />
            <span className="text-lg font-semibold tabular-nums">{clock(tick - new Date(running.startedAt).getTime())}</span>
          </div>
          <textarea
            value={recap}
            onChange={(event) => setRecap(event.target.value)}
            rows={3}
            placeholder="What surprised you?"
            className="w-full resize-none rounded-md border bg-transparent px-2 py-1.5 text-[13px] text-foreground outline-none placeholder:text-muted-foreground focus:border-ring"
          />
          <Prop icon={Square} onClick={() => end(false)}>End session</Prop>
          {recap.trim() && <Prop icon={Gem} onClick={() => end(true)}>End, and keep the recap</Prop>}
        </div>
      ) : (
        <Prop icon={Play} onClick={() => void vigil.startSession(taskId)}>Start a session</Prop>
      )}
      {sessions.filter((session) => session.endedAt).slice(0, 4).map((session) => (
        <div key={session.id} className="mx-2 mb-1.5">
          <p className="text-xs tabular-nums">
            {when(session.startedAt, false)} · {clock(new Date(session.endedAt!).getTime() - new Date(session.startedAt).getTime())}
          </p>
          {session.recap && <p className="mt-0.5 line-clamp-3 text-[13px] text-foreground">{session.recap}</p>}
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
          <h3 className="mb-2 text-[13px] font-semibold">For this</h3>
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
      <h3 className="mb-2 text-[13px] font-semibold">
        Subtasks {items.length ? <span className="font-normal text-muted-foreground">{items.filter((one) => one.done).length}/{items.length}</span> : null}
      </h3>
      <ul className="space-y-1">
        {items.map((item, index) => (
          <li key={index} className="group flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                if (!item.done) chime('done')
                save(items.map((one, at) => (at === index ? { ...one, done: !one.done } : one)))
              }}
              className="flex size-4 shrink-0 items-center justify-center rounded border transition-colors"
              style={{ background: item.done ? 'var(--tt-brand-color-400)' : undefined, borderColor: item.done ? 'var(--tt-brand-color-400)' : undefined }}
            >
              {item.done && <Check className="size-3 text-white" />}
            </button>
            <span className={`flex-1 ${item.done ? 'text-muted-foreground line-through' : ''}`}>{item.text}</span>
            <button type="button" title="Remove" onClick={() => save(items.filter((_, at) => at !== index))} className="rounded p-0.5 text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-foreground">
              <X className="size-3.5" />
            </button>
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
