import { useEffect, useRef, useState } from 'react'
import { CalendarDays, Check, Plus, Repeat } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'

import { chime } from '@/lib/sound'
import { taskSaid, useLive, vigil, when, type Task } from '@/lib/vigil'
import { Empty, toast, typing, useListKeys, Strip } from './ui'
import { Chips, Display, arrange, useView } from './display'
import { taskFacets } from './tasks-view'
import { RowMenu, copy } from './row-menu'
import { Tip } from '@/components/vigil/ui'

const endOfToday = (): number => new Date().setHours(24, 0, 0, 0)
const startOfToday = (): number => new Date().setHours(0, 0, 0, 0)

type Scope = 'today' | 'upcoming' | 'routines' | 'backlog' | 'waiting'
const EMPTY: Record<Scope, { shape: [Parameters<typeof Empty>[0]['shape'][0], number]; title: string; text: string }> = {
  today: { shape: ['star', 6], title: 'Nothing due today', text: 'A clear day. Anything with a date lands here on the day, and anything late stays on top until it is done.' },
  upcoming: { shape: ['ellipse', 4], title: 'Nothing coming up', text: 'Put a day in the words, “friday” or “in 3 days”, and it waits here until then.' },
  routines: { shape: ['flower', 5], title: 'No routines', text: '“every week” follows the calendar; “every! 3 days” counts from when you last did it.' },
  backlog: { shape: ['wheel', 2], title: 'Nothing in the backlog', text: 'A task with no date goes here, out of the way until you give it one.' },
  waiting: { shape: ['moon', 3], title: 'Waiting on no one', text: 'Say who a task is waiting on and it comes here, with a day to chase them.' }
}
const SCOPES: Record<Scope, { label: string; test: (task: Task) => boolean }> = {
  today: { label: 'Today', test: (task) => !task.waitingOn && !!task.dueAt && new Date(task.dueAt).getTime() < endOfToday() },
  upcoming: { label: 'Upcoming', test: (task) => !task.waitingOn && !task.recurrence && !!task.dueAt && new Date(task.dueAt).getTime() >= endOfToday() },
  routines: { label: 'Routines', test: (task) => !!task.recurrence },
  backlog: { label: 'Backlog', test: (task) => !task.waitingOn && !task.dueAt },
  waiting: { label: 'Waiting', test: (task) => !!task.waitingOn }
}

/**
 * Today, sized for the prompt: what is due or late, a line to add one, and the
 * circle to tick it off. A task opens here in the prompt, notes and all, so
 * nothing about it needs the main window. The keys: j and k move, Enter opens,
 * e completes, t, m and w move it to today, tomorrow or next week, a adds.
 */
export function TodayPanel({ onOpen, open }: { onOpen: (id: string) => void; open?: string }): React.JSX.Element {
  const tasks = useLive(vigil.tasks, [] as Task[])
  const [draft, setDraft] = useState('')
  const [ticking, setTicking] = useState<string | null>(null)
  // Every task list, not only today's: the same cuts as the main window.
  const [scope, setScope] = useState<Scope>('today')
  // Narrowed as in the main window: marked, tag, where it came from.
  const [view, setView] = useView('prompt:tasks', { sort: 'manual', group: 'none' })
  const facets = taskFacets(tasks)
  const [[, narrowed]] = arrange(tasks, view, facets, {})
  const due = narrowed.filter((task) => task.status === 'open' && SCOPES[scope].test(task))

  const add = useRef<HTMLInputElement>(null)
  const [cursor] = useListKeys(due.length, { onOpen: (index) => onOpen(due[index].id) })
  const move = (task: Task, days: number): void => {
    const at = new Date()
    at.setDate(at.getDate() + days)
    at.setHours(9, 0, 0, 0)
    void vigil.saveTask(task.id, { due: at.toISOString() }).then(() => {
      chime('tap')
      toast(`Moved to ${when(at.toISOString())}`)
    })
  }
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (typing() || event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return
      if (event.key === 'a') {
        event.preventDefault()
        return add.current?.focus()
      }
      const task = due[cursor]
      if (!task) return
      const days = { t: 0, m: 1, w: 7 }[event.key]
      if (event.key === 'e') tick(task)
      else if (days !== undefined) move(task, days)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const tick = (task: Task): void => {
    setTicking(task.id)
    chime('done')
    setTimeout(() => void vigil.doneTask(task.id).then(async () => {
      setTicking(null)
      // A routine says when it is back; the last one for today says the day is done.
      if (task.recurrence) return toast(`Done · next ${when((await vigil.task(task.id))?.dueAt ?? null)}`)
      const last = scope === 'today' && due.length === 1
      toast(last ? 'Done. That is everything for today' : 'Done', () => void vigil.saveTask(task.id, { status: 'open' }))
    }), 260)
  }

  return (
    <div className="flex flex-col gap-1 text-sm">
      {/* Each list with how many it holds, so a task sent to the backlog is seen landing there. */}
      <Strip className="flex h-8 items-center gap-1 px-1">
      <Chips
        options={(Object.keys(SCOPES) as Scope[]).map((id) => {
          const n = tasks.filter((task) => task.status === 'open' && SCOPES[id].test(task)).length
          return { id, label: n ? `${SCOPES[id].label} ${n}` : SCOPES[id].label }
        })}
        on={(id) => id === scope}
        pick={(id) => setScope(id as Scope)}
        // One line that scrolls sideways, never wrapping under itself.
        // and fading at its end, so a cut-off chip reads as more to scroll to.
        className="min-w-0 flex-1 flex-nowrap overflow-x-auto pr-6 [mask-image:linear-gradient(to_right,black_calc(100%-1.5rem),transparent)] [scrollbar-width:none] [&>button]:shrink-0"
      />
      <span className="ml-auto shrink-0"><Display compact view={view} onChange={setView} facets={facets} sorts={[{ id: 'manual', label: 'Your order' }]} /></span>
      </Strip>
      <form
        className="mb-2 flex items-center gap-2 rounded-md border px-2 py-1.5 focus-within:border-ring"
        onSubmit={(event) => {
          event.preventDefault()
          if (!draft.trim()) return
          void vigil.addTask(draft, undefined, scope === 'today').then(async (made) => {
            chime(made.existed ? 'nope' : 'noted')
            if (made.existed) return void (setDraft(''), toast(taskSaid(made, '')))
            const task = await vigil.task(made.id)
            setDraft('')
            // Said where it went when it is not in this list: a later day, or a routine.
            if (task && !SCOPES[scope].test(task)) toast(task.recurrence ? 'Added to Routines' : task.dueAt ? `Added for ${when(task.dueAt, !!task.allDay)}` : 'Added to the backlog')
          })
        }}
      >
        <Plus className="size-4 text-muted-foreground" />
        <input
          ref={add}
          onKeyDown={(event) => event.key === 'Escape' && (event.preventDefault(), event.currentTarget.blur())}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Add a task, with the date in the words"
          className="flex-1 bg-transparent outline-none placeholder:text-muted-foreground"
        />
      </form>
      <AnimatePresence initial={false}>
        {due.map((task, index) => {
          const late = new Date(task.dueAt!).getTime() < startOfToday()
          return (
            <motion.div
              key={task.id}
              layout="position"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, x: 16, transition: { duration: 0.18 } }}
              className={`group flex items-start gap-2 rounded-sm px-2 py-1.5 hover:bg-accent/50 ${index === cursor ? "bg-accent/50" : ""}`}
            >
              <Tip label="Complete">
              <button
                type="button"
              
                onClick={() => tick(task)}
                // The tick shows only over the circle itself: the row opens the
                // task, and a tick there read as if a click would complete it.
                className="group/tick mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border-[1.5px] transition-colors"
                style={{
                  borderColor: late ? 'var(--tt-color-text-red)' : 'var(--tt-color-text-orange)',
                  background: ticking === task.id ? 'var(--tt-color-text-green)' : undefined
                }}
              >
                <Check className={`size-2.5 transition-opacity ${ticking === task.id ? 'opacity-100' : 'opacity-0 group-hover/tick:opacity-60'}`} />
              </button>
              </Tip>
              {/* The row opens the task where its notes and sessions are. */}
              <RowMenu items={[
                { label: 'Open', keys: '↵', run: () => onOpen(task.id) },
                { label: 'Complete', keys: 'E', run: () => tick(task) },
                'separator',
                { label: 'Today', keys: 'T', run: () => move(task, 0) },
                { label: 'Tomorrow', keys: 'M', run: () => move(task, 1) },
                { label: 'Next week', keys: 'W', run: () => move(task, 7) },
                'separator',
                { label: task.important ? 'Not important' : 'Mark important', run: () => void vigil.saveTask(task.id, { important: task.important ? 0 : 1 }).then(() => chime(task.important ? 'off' : 'on')) },
                { label: `Copy T-${task.number}`, run: () => copy(`T-${task.number}`, `Copied T-${task.number}`) },
                'separator',
                { label: 'Close without doing', danger: true, run: () => void vigil.saveTask(task.id, { status: 'dropped' }).then(() => (chime('away'), toast('Closed', () => void vigil.saveTask(task.id, { status: 'open' })))) }
              ]}>
              <button type="button" data-row data-cursor={index === cursor || undefined} className={`min-w-0 flex-1 text-left ${task.id === open ? 'font-medium' : ''}`} onClick={() => onOpen(task.id)}>
                <p className="truncate">{task.title}</p>
                <p className="flex items-center gap-1 text-xs" style={{ color: late ? 'var(--tt-color-text-red)' : 'var(--tt-color-text-orange)' }}>
                  <CalendarDays className="size-3" /> {when(task.dueAt, !!task.allDay)}
                  {task.recurrence && <Repeat className="ml-1 size-3 text-muted-foreground" />}
                </p>
              </button>
              </RowMenu>
            </motion.div>
          )
        })}
      </AnimatePresence>
      {!due.length && (
        <Empty compact shape={EMPTY[scope].shape} title={EMPTY[scope].title}>{EMPTY[scope].text}</Empty>
      )}
    </div>
  )
}
