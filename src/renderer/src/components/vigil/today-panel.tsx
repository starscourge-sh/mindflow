import { useEffect, useMemo, useRef, useState } from 'react'
import { CalendarDays, Plus } from 'lucide-react'
import { alive } from '@/components/ui/alive-icon'
import ClockIcon from '@/components/ui/clock-icon'
import SimpleCheckedIcon from '@/components/ui/simple-checked-icon'
import RefreshIcon from '@/components/ui/refresh-icon'
import { AnimatePresence, motion } from 'motion/react'
import { EASE } from '@/lib/motion'

import { chime } from '@/lib/sound'
import { unloaded, useLive, vigil, when, whenInLine, type Task } from '@/lib/vigil'
import { exampleTasks } from '@/lib/examples'
import { Example } from './example'
import { BUCKETS, bucket, makeListTasks, makeTask, placed } from '@/lib/tasks'
import { readLines, tasksOf } from '../../../../main/day-lines'
import { Empty, typing, useListKeys, Strip } from './ui'
import { Chips, Display, arrange, useView } from './display'
import { completeTask, landed, moveTo, taskFacets, taskMenu, useTaskNow } from './tasks-view'
import { frogOn } from '@/lib/day-plan'
import { PriorityMark, TaskInput, setPriority } from './task-input'
import { RowMenu } from './row-menu'
import { Tip } from '@/components/vigil/ui'
import { Rest } from './scenery'
import { GlossButton, GlossLine } from './gloss-line'
import { num, startOfDay } from '../../../../main/dates'
import { useHere } from '@/lib/split'

// itshover drawings in lucide's place, moving when their control is pointed at.
const CalendarClock = alive(ClockIcon)
const Check = alive(SimpleCheckedIcon)
const Repeat = alive(RefreshIcon)

const endOfToday = (): number => startOfDay(1)
const startOfToday = (): number => startOfDay()

type Scope = 'today' | 'upcoming' | 'routines' | keyof typeof BUCKETS | 'backlog' | 'waiting'
const EMPTY: Record<Scope, { shape: [Parameters<typeof Empty>[0]['shape'][0], number]; title: string; text: string }> = {
  today: { shape: ['star', 6], title: 'Nothing due today', text: 'A clear day. Anything with a date lands here on the day, and anything late stays on top until it is done.' },
  upcoming: { shape: ['ellipse', 4], title: 'Nothing coming up', text: 'Put a day in the words, “friday” or “in 3 days”, and it waits here until then.' },
  routines: { shape: ['flower', 5], title: 'No routines', text: '“bins every week” comes back each week on the same day. “every! 3 days” counts from when you last did it.' },
  month: { shape: ['polygon', 4], title: 'Nothing this month', text: 'Say “this month” in the words for something with no day yet that should still happen soon.' },
  year: { shape: ['flower', 3], title: 'Nothing this year', text: '“this year” or “next month” keeps a task here, without a day, until you give it one.' },
  next: { shape: ['polygon', 5], title: 'Nothing next year', text: '“next year” keeps a task here, without a day, until the year comes round.' },
  someday: { shape: ['moon', 2], title: 'Nothing for someday', text: '“learn Welsh someday”: the things you might do, kept where they do not nag.' },
  backlog: { shape: ['wheel', 2], title: 'Nothing without a date', text: 'A task with no date goes here, out of the way until you give it one.' },
  waiting: { shape: ['moon', 3], title: 'Waiting on no one', text: 'Say who a task is waiting on and it comes here, with a day to chase them.' }
}
// A task shows on the day it is scheduled, or the day it is due by if that is sooner.
const SCOPES: Record<Scope, { label: string; test: (task: Task) => boolean }> = {
  today: { label: 'Today', test: (task) => !task.waitingOn && (placed(task) ?? Infinity) < endOfToday() },
  upcoming: { label: 'Upcoming', test: (task) => !task.waitingOn && !task.recurrence && (placed(task) ?? -Infinity) >= endOfToday() },
  routines: { label: 'Routines', test: (task) => !!task.recurrence },
  month: { label: BUCKETS.month, test: (task) => !task.waitingOn && bucket(task) === 'month' },
  year: { label: BUCKETS.year, test: (task) => !task.waitingOn && bucket(task) === 'year' },
  next: { label: BUCKETS.next, test: (task) => !task.waitingOn && bucket(task) === 'next' },
  someday: { label: BUCKETS.someday, test: (task) => !task.waitingOn && bucket(task) === 'someday' },
  backlog: { label: 'No date', test: (task) => !task.waitingOn && placed(task) === null && !bucket(task) },
  waiting: { label: 'Waiting', test: (task) => !!task.waitingOn }
}

/**
 * Today, sized for the prompt: what is due or late, a line to add one, and the
 * circle to tick it off. A task opens here in the prompt, notes and all, so
 * nothing about it needs the main window. The keys: j and k move, Enter opens,
 * e completes, t, m and w move it to today, tomorrow or next week, 1 to 4
 * give it a priority and 0 none, a adds.
 */
export function TodayPanel({ onOpen, open }: { onOpen: (id: string) => void; open?: string }): React.JSX.Element {
  const real = useLive(vigil.tasks, [] as Task[])
  // No open tasks yet: each list shows a few made-up ones, dimmed and out of reach.
  const example = !unloaded(real) && !real.some((task) => task.status === 'open')
  const examples = useMemo(exampleTasks, [])
  const tasks = example ? examples : real
  const [draft, setDraft] = useState('')
  const [ticking, setTicking] = useState<string | null>(null)
  // The row a thought is being written under, without opening the task.
  const [glossing, setGlossing] = useState<string | null>(null)
  // Every task list, not only today's: the same cuts as the main window.
  const [scope, setScope] = useState<Scope>('today')
  // Narrowed as in the main window: marked, tag, where it came from.
  const [view, setView] = useView('prompt:tasks', { sort: 'manual', group: 'none' })
  const facets = taskFacets(tasks)
  const [[, narrowed]] = arrange(tasks, view, facets, {})
  const due = narrowed.filter((task) => task.status === 'open' && SCOPES[scope].test(task))

  const add = useRef<HTMLInputElement>(null)
  const [cursor] = useListKeys(example ? 0 : due.length, { onOpen: (index) => onOpen(due[index].id) })
  // The main window's wording, time kept and undo and all.
  const move = moveTo
  // Today's first task, so the menu can offer it or take it back.
  const frog = frogOn(useLive(vigil.settings, null as Awaited<ReturnType<typeof vigil.settings>> | null))
  const now = useTaskNow()
  // Split, only the pane in front answers keys.
  const here = useHere()
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (!here()) return
      if (typing() || event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return
      if (event.key === 'a') {
        event.preventDefault()
        return add.current?.focus()
      }
      const task = example ? undefined : due[cursor]
      if (!task) return
      const days = { t: 0, m: 1, w: 7 }[event.key]
      if (/^[0-4]$/.test(event.key)) setPriority(task, Number(event.key))
      // ; a thought on the row, into the task's log; with the task open, its log takes the key.
      else if (event.key === ';' && !open) (event.preventDefault(), chime('tap'), setGlossing(task.id))
      else if (event.key === 'e') tick(task)
      else if (days !== undefined) move(task, days)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const tick = (task: Task): void => {
    setTicking(task.id)
    setTimeout(() => void completeTask(task).then(() => setTicking(null)), 260)
  }

  return (
    <div className="flex flex-col gap-1 text-sm">
      {/* Each list with how many it holds, so a task sent to the backlog is seen landing there. */}
      <Strip className="flex h-8 items-center gap-1 px-1">
      <Chips
        options={(Object.keys(SCOPES) as Scope[]).map((id) => {
          // Counted from yours only: an example never adds to a number.
          const n = real.filter((task) => task.status === 'open' && SCOPES[id].test(task)).length
          return { id, label: n ? `${SCOPES[id].label} ${num(n)}` : SCOPES[id].label }
        })}
        on={(id) => id === scope}
        pick={(id) => setScope(id as Scope)}
        // One line that scrolls sideways, faded where there is more, the chosen list always whole.
        sideways
        className="min-w-0 flex-1"
      />
      <span className="ml-auto shrink-0"><Display compact view={view} onChange={setView} facets={facets} sorts={[{ id: 'manual', label: 'Your order' }]} /></span>
      </Strip>
      <form
        className="mb-2 flex items-center gap-2 rounded-md border px-2 py-1.5 focus-within:border-ring"
        // A pasted list is a task a line, its indented lines their steps; one Undo for all.
        onPasteCapture={(event) => {
          const list = tasksOf(readLines(event.clipboardData.getData('text/plain')))
          if (list.length < 2 && !list[0]?.steps.length) return
          event.preventDefault()
          void makeListTasks(list, { today: scope === 'today' })
        }}
        onSubmit={(event) => {
          event.preventDefault()
          if (!draft.trim()) return
          const text = draft
          setDraft('')
          // Said where it went when it is not in this list: a later day, a later list, or a routine.
          void makeTask({ text, today: scope === 'today' }, async (made) => {
            const task = await vigil.task(made.id)
            return task && SCOPES[scope].test(task) ? 'Task added' : landed(made, scope)
          // Taken back, the words are in the field again, ahead of anything typed since.
          }, { onUndo: () => {
            setDraft((now) => (now.trim() ? `${text} ${now}` : text))
            requestAnimationFrame(() => (add.current?.focus(), add.current?.setSelectionRange(text.length, text.length)))
          } })
        }}
      >
        <Plus className="size-4 text-muted-foreground" />
        <TaskInput
          inputRef={add}
          onKeyDown={(event) => event.key === 'Escape' && (event.preventDefault(), event.currentTarget.blur())}
          value={draft}
          onChange={setDraft}
          placeholder="Add a task, with the date in the words"
        />
      </form>
      <Example on={example && due.length > 0} compact tryIt="type a task in the line above with the day in the words, like ‘call Mum Friday 6pm’.">
      <AnimatePresence initial={false}>
        {due.map((task, index) => {
          const late = (placed(task) ?? Infinity) < startOfToday()
          const later = bucket(task)
          return (
            <motion.div
              key={task.id}
              layout="position"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, x: 16, transition: { duration: 0.16, ease: EASE } }}
              className={`group group/item relative flex flex-wrap items-start gap-2 rounded-sm px-2 py-1.5 pr-8 hover:bg-accent/50 ${index === cursor ? "bg-accent/50" : ""}`}
            >
              <Tip label="Complete">
              <button
                type="button"
              
                onClick={() => tick(task)}
                // The tick shows only over the circle itself: the row opens the
                // task, and a tick there read as if a click would complete it.
                className="group/tick mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border-[1.5px] transition-colors"
                style={{
                  // Red only for late, amber for today's, plain for later days: an
                  // amber ring on a task weeks off read as if it were already pressing.
                  borderColor: late ? 'var(--tt-color-text-red)' : scope === 'today' ? 'var(--tt-color-text-orange)' : 'var(--muted-foreground)',
                  background: ticking === task.id ? 'var(--tt-color-text-green)' : undefined
                }}
              >
                <Check className={`size-2.5 transition-opacity ${ticking === task.id ? 'opacity-100' : 'opacity-0 group-hover/tick:opacity-60'}`} />
              </button>
              </Tip>
              {/* The row opens the task where its notes and sessions are. */}
              <RowMenu items={taskMenu(task, { open: () => onOpen(task.id), complete: () => tick(task), move, frog, now })}>
              <button type="button" data-row data-id={task.id} data-cursor={index === cursor || undefined} className={`min-w-0 flex-1 text-left ${task.id === open ? 'font-medium' : ''}`} onClick={() => onOpen(task.id)}>
                <p className="flex items-center gap-1.5">
                  <PriorityMark level={task.priority} />
                  <span className="truncate">{task.title}</span>
                </p>
                <p className="flex items-center gap-2 text-xs" style={{ color: late ? 'var(--tt-color-text-red)' : scope === 'today' ? 'var(--tt-color-text-orange)' : 'var(--muted-foreground)' }}>
                  {task.dueAt && <Tip label={late ? 'Late: the day you meant to do it has passed' : 'When you mean to do it'}><span className="flex items-center gap-1"><CalendarDays className="size-3" /> {when(task.dueAt, !!task.allDay)}</span></Tip>}
                  {task.deadline && <span className="flex items-center gap-1"><CalendarClock className="size-3" /> Due by {whenInLine(task.deadline, !task.deadlineTimed)}</span>}
                  {later && !task.dueAt && <span>{BUCKETS[later]}</span>}
                  {task.recurrence && <Tip label={`Repeats: ${task.recurrence}`}><span className="flex"><Repeat className="size-3 text-muted-foreground" /></span></Tip>}
                </p>
              </button>
              </RowMenu>
              {/* A thought without opening it: on hover, top right, or ; on the row. */}
              <GlossButton onClick={() => setGlossing(task.id)} />
              {glossing === task.id && <GlossLine id={task.id} open onDone={() => setGlossing(null)} placeholder="A thought on it, kept in its log" className="basis-full pl-6" />}
            </motion.div>
          )
        })}
      </AnimatePresence>
      </Example>
      {!due.length && !unloaded(tasks) && (
        <Rest compact seed="today" off={scope !== 'today'}><Empty compact shape={EMPTY[scope].shape} title={EMPTY[scope].title}>{EMPTY[scope].text}</Empty></Rest>
      )}
    </div>
  )
}
