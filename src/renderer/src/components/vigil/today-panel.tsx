import { useEffect, useRef, useState } from 'react'
import { CalendarDays, Check, Plus, Repeat } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'

import { chime } from '@/lib/sound'
import { useLive, vigil, when, type Task } from '@/lib/vigil'
import { toast, typing, useListKeys } from './ui'
import { Chips } from './display'
import { RowMenu, copy } from './row-menu'
import { Tip } from '@/components/vigil/ui'

const endOfToday = (): number => new Date().setHours(24, 0, 0, 0)
const startOfToday = (): number => new Date().setHours(0, 0, 0, 0)

type Scope = 'today' | 'upcoming' | 'routines' | 'backlog' | 'waiting'
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
  const due = tasks.filter((task) => task.status === 'open' && SCOPES[scope].test(task))

  const add = useRef<HTMLInputElement>(null)
  const [cursor] = useListKeys(due.length, { onOpen: (index) => onOpen(due[index].id) })
  const move = (task: Task, days: number): void => {
    const at = new Date()
    at.setDate(at.getDate() + days)
    at.setHours(9, 0, 0, 0)
    void vigil.saveTask(task.id, { due: at.toISOString() }).then(() => toast(`Moved to ${when(at.toISOString()).toLowerCase()}`))
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
    setTimeout(() => void vigil.doneTask(task.id).then(() => {
      setTicking(null)
      // The last one for today says so: the day is done, not only the task.
      const last = scope === 'today' && due.length === 1
      toast(last ? 'Done. That is everything for today' : 'Done', task.recurrence ? undefined : () => void vigil.saveTask(task.id, { status: 'open' }))
    }), 260)
  }

  return (
    <div className="flex flex-col gap-1 text-sm">
      <Chips options={(Object.keys(SCOPES) as Scope[]).map((id) => ({ id, label: SCOPES[id].label }))} on={(id) => id === scope} pick={(id) => setScope(id as Scope)} />
      <form
        className="mb-2 flex items-center gap-2 rounded-md border px-2 py-1.5 focus-within:border-ring"
        onSubmit={(event) => {
          event.preventDefault()
          if (!draft.trim()) return
          void vigil.addTask(draft, undefined, scope === 'today').then((id) => vigil.task(id)).then((task) => {
            setDraft('')
            // Said where it went when it is not in this list: a later day, or a routine.
            if (task && !SCOPES[scope].test(task)) toast(task.recurrence ? 'Added to Routines' : task.dueAt ? `Added for ${when(task.dueAt, !!task.allDay).toLowerCase()}` : 'Added to the backlog')
          })
        }}
      >
        <Plus className="size-3.5 text-muted-foreground" />
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
              className="group flex items-start gap-2.5 rounded-md px-1.5 py-1.5 hover:bg-accent/50"
            >
              <Tip label="Complete">
              <button
                type="button"
              
                onClick={() => tick(task)}
                className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border-[1.5px] transition-colors"
                style={{
                  borderColor: late ? 'var(--tt-color-text-red)' : 'var(--tt-color-text-orange)',
                  background: ticking === task.id ? 'var(--tt-color-text-green)' : undefined
                }}
              >
                <Check className={`size-2.5 transition-opacity ${ticking === task.id ? 'opacity-100' : 'opacity-0 group-hover:opacity-50'}`} />
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
                { label: task.important ? 'Not important' : 'Mark important', run: () => void vigil.saveTask(task.id, { important: task.important ? 0 : 1 }) },
                { label: `Copy T-${task.number}`, run: () => copy(`T-${task.number}`, `Copied T-${task.number}`) },
                'separator',
                { label: 'Close without doing', danger: true, run: () => void vigil.saveTask(task.id, { status: 'dropped' }).then(() => toast('Closed', () => void vigil.saveTask(task.id, { status: 'open' }))) }
              ]}>
              <button type="button" data-cursor={index === cursor || undefined} className={`min-w-0 flex-1 rounded text-left ${index === cursor ? 'ring-1 ring-border' : ''} ${task.id === open ? 'font-medium' : ''}`} onClick={() => onOpen(task.id)}>
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
        <p className="px-1.5 py-6 leading-relaxed text-muted-foreground">
          {scope === 'today' ? 'Nothing due today. Tasks with a date land here on the day, and late ones stay until they are done.' : `Nothing in ${SCOPES[scope].label.toLowerCase()}.`}
        </p>
      )}
    </div>
  )
}
