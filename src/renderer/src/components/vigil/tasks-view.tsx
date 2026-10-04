import { Fragment, useEffect, useState } from 'react'
import type { JSONContent } from '@tiptap/core'
import { CalendarDays, Check, Gem, Hash, History, Play, Plus, Repeat, Square, Trash2 } from 'lucide-react'

import { AnimatePresence, motion } from 'motion/react'

import { MindflowEditor } from '../mindflow'
import { chime } from '@/lib/sound'
import { captureKey } from '@/lib/capture-links'
import { useLive, vigil, when, type Session, type Task, type TaskFull } from '@/lib/vigil'
import { Empty, Kbd, Page, Prop, PropLabel, Props, toast, useListKeys } from './ui'

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
export function TasksView({ mode }: { mode: 'today' | 'upcoming' }): React.JSX.Element {
  const tasks = useLive(vigil.tasks, [] as Task[])
  const [open, setOpen] = useState<TaskFull | null>(null)
  const [draft, setDraft] = useState('')
  const [leaving, setLeaving] = useState<string | null>(null)

  const live = tasks.filter((task) => task.status === 'open' && !task.waitingOn)
  const waiting = tasks.filter((task) => task.status === 'open' && task.waitingOn)
  const groups: [string, Task[]][] =
    mode === 'today'
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
          ['No date', live.filter((task) => !task.dueAt)],
          // Chasing is not doing: what you are waiting on gets its own place.
          ['Waiting on someone', waiting]
        ]
  const shown = groups.flatMap(([, list]) => list)
  const pick = (id: string): void => void vigil.task(id).then(setOpen)
  const [cursor] = useListKeys(shown.length, { onOpen: (index) => pick(shown[index].id), onBack: () => setOpen(null) })

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
      <Page title={mode === 'today' ? 'Today' : 'Upcoming'} count={shown.length}>
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
                <Fragment key={label}>
                  <h3 className="mt-6 mb-1 border-b px-2 pb-1.5 text-[13px] font-semibold" style={{ color: label === 'Overdue' ? 'var(--tt-color-text-red)' : undefined }}>
                    {label} <span className="font-normal text-muted-foreground">{list.length}</span>
                  </h3>
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
                        <button type="button" onClick={() => pick(task.id)} className="flex min-w-0 flex-1 flex-col items-start gap-1 text-left">
                          <span className="truncate">{task.title}</span>
                          {(task.dueAt || task.recurrence || task.waitingOn) && (
                            <span className="flex items-center gap-3 text-xs text-muted-foreground">
                              {task.dueAt && (
                                <span className="flex items-center gap-1" style={{ color: tone(task) }}>
                                  <CalendarDays className="size-3" />
                                  {when(task.dueAt, !!task.allDay)}
                                </span>
                              )}
                              {task.recurrence && <Repeat className="size-3" />}
                              {task.waitingOn && <span>Waiting on {task.waitingOn}</span>}
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
          <Empty shape={mode === 'today' ? ['star', 6] : ['ellipse', 4]} title={mode === 'today' ? 'Nothing due today' : 'Nothing coming up'}>
            {mode === 'today'
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
function TaskDetail({ task, onClose }: { task: TaskFull; onClose: () => void }): React.JSX.Element {
  const local = (iso: string | null): string => (iso ? new Date(new Date(iso).getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) : '')
  return (
    <div className="flex min-w-0 flex-[1.4] border-l">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col pt-6">
        <input
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
      </div>
      <Props>
        <Sessions taskId={task.id} />
        <PropLabel>Due</PropLabel>
        <input
          type="datetime-local"
          defaultValue={local(task.dueAt)}
          onChange={(event) => void vigil.saveTask(task.id, { due: event.target.value ? new Date(event.target.value).toISOString() : null })}
          className="mx-1 rounded-md border bg-transparent px-2 py-1 text-foreground"
        />
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
        <p className="mx-2 mt-1 text-xs leading-relaxed">“every” follows the calendar. “every!” counts from when you last did it.</p>

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
