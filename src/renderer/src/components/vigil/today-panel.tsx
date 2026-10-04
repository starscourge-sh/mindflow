import { useState } from 'react'
import { CalendarDays, Check, Plus, Repeat } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'

import { chime } from '@/lib/sound'
import { useLive, vigil, when, type Task } from '@/lib/vigil'
import { toast } from './ui'

const endOfToday = (): number => new Date().setHours(24, 0, 0, 0)
const startOfToday = (): number => new Date().setHours(0, 0, 0, 0)

/**
 * Today, sized for the prompt: what is due or late, a line to add one, and the
 * circle to tick it off. The full list, with its notes and sessions, is in the
 * main window; this is the glance you get without leaving the capture box.
 */
export function TodayPanel(): React.JSX.Element {
  const tasks = useLive(vigil.tasks, [] as Task[])
  const [draft, setDraft] = useState('')
  const [ticking, setTicking] = useState<string | null>(null)
  const due = tasks.filter((task) => task.status === 'open' && task.dueAt && new Date(task.dueAt).getTime() < endOfToday())

  const tick = (task: Task): void => {
    setTicking(task.id)
    chime('done')
    setTimeout(() => void vigil.doneTask(task.id).then(() => {
      setTicking(null)
      toast('Done', task.recurrence ? undefined : () => void vigil.saveTask(task.id, { status: 'open' }))
    }), 260)
  }

  return (
    <div className="flex flex-col gap-1 text-sm">
      <form
        className="mb-2 flex items-center gap-2 rounded-md border px-2 py-1.5 focus-within:border-ring"
        onSubmit={(event) => {
          event.preventDefault()
          if (draft.trim()) void vigil.addTask(draft).then(() => setDraft(''))
        }}
      >
        <Plus className="size-3.5 text-muted-foreground" />
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Add a task, with the date in the words"
          className="flex-1 bg-transparent outline-none placeholder:text-muted-foreground"
        />
      </form>
      <AnimatePresence initial={false}>
        {due.map((task) => {
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
              <button
                type="button"
                title="Complete"
                onClick={() => tick(task)}
                className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border-[1.5px] transition-colors"
                style={{
                  borderColor: late ? 'var(--tt-color-text-red)' : 'var(--tt-color-text-orange)',
                  background: ticking === task.id ? 'var(--tt-color-text-green)' : undefined
                }}
              >
                <Check className={`size-2.5 transition-opacity ${ticking === task.id ? 'opacity-100' : 'opacity-0 group-hover:opacity-50'}`} />
              </button>
              <div className="min-w-0 flex-1">
                <p className="truncate">{task.title}</p>
                <p className="flex items-center gap-1 text-xs" style={{ color: late ? 'var(--tt-color-text-red)' : 'var(--tt-color-text-orange)' }}>
                  <CalendarDays className="size-3" /> {when(task.dueAt, !!task.allDay)}
                  {task.recurrence && <Repeat className="ml-1 size-3 text-muted-foreground" />}
                </p>
              </div>
            </motion.div>
          )
        })}
      </AnimatePresence>
      {!due.length && (
        <p className="px-1.5 py-6 leading-relaxed text-muted-foreground">
          Nothing due today. Tasks with a date land here on the day, and late ones stay until they are done.
        </p>
      )}
    </div>
  )
}
