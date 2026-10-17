import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'motion/react'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { chime } from '@/lib/sound'
import { makeTask } from '@/lib/tasks'
import { vigil, whenInLine, type TaskFull } from '@/lib/vigil'
import { PRIORITY_NAMES } from '../../../../main/task-words'
import { dayjs } from '../../../../main/dates'
import { Chips } from './display'
import { DatePicker } from './date-picker'
import { TimeField } from './time-field'
import { TagRow } from './pass'
import { PriorityIcon, TaskInput } from './task-input'
import { TaskDetail } from './tasks-view'
import { Kbd, Tip, toast } from './ui'

/** What the side panel shows: a new task for a day (at a time, for a length), or a task as it is. */
export type SideAsk = { day: string; minute: number | null; length: number } | { task: string }

const LENGTHS = [['0', 'None'], ['15', '15m'], ['30', '30m'], ['60', '1h'], ['120', '2h']] as const
// Least pressing to most, as a row of choices reads.
const LEVELS = [0, 4, 3, 2, 1]

/**
 * The calendar's side panel, the way Notion Calendar and Google Calendar
 * keep theirs: over the right of the calendar, a new task for the day
 * clicked, with every way to say it (the words, the day, a time, a length,
 * tags, a priority, notes), or a task opened from its chip. ↵ adds it and
 * stays open for the next one; Esc closes it. The same panel on the month,
 * the week board and the Calendar page.
 */
export function DaySide({ ask, onClose, onOpen }: { ask: SideAsk | null; onClose: () => void; onOpen?: (type: string, id: string) => void }): React.JSX.Element {
  const task = ask && 'task' in ask ? ask.task : null
  const [full, setFull] = useState<TaskFull | null>(null)
  useEffect(() => {
    let live = true
    setFull(null)
    if (task) void vigil.task(task).then((one) => live && setFull(one ?? null))
    return () => void (live = false)
  }, [task])
  const panel = useRef<HTMLDivElement>(null)
  // Let go of the keys at once: while it slides away, nothing typed lands in it.
  const shut = (): void => (panel.current?.contains(document.activeElement) && (document.activeElement as HTMLElement).blur(), onClose())
  // Opened on a task, the panel holds the keys, so Esc reaches it.
  useEffect(() => void (task && full && requestAnimationFrame(() => panel.current?.focus())), [task, full])
  return createPortal(
    <AnimatePresence>
      {ask && (
        <motion.div ref={panel} key="day-side" data-day-side={task ? 'task' : 'new'} role="dialog" aria-label={task ? 'The task' : 'A new task'} tabIndex={-1}
          initial={{ x: 32, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: 32, opacity: 0, transition: { duration: 0.14 } }} transition={{ type: 'spring', stiffness: 520, damping: 44 }}
          onKeyDown={(event) => {
            if (event.key !== 'Escape') return
            event.preventDefault()
            event.stopPropagation()
            chime('away')
            shut()
          }}
          className="fixed top-12 right-3 bottom-3 z-40 flex w-[30rem] max-w-[calc(100vw-1.5rem)] flex-col overflow-hidden rounded-xl border bg-background shadow-(--mf-panel-shadow) outline-none">
          <div className="flex shrink-0 items-center gap-2 px-4 pt-3">
            <h2 className="min-w-0 flex-1 truncate font-heading text-heading font-semibold text-foreground">{task ? 'Task' : 'New task'}</h2>
            <Tip label="Close (Esc)">
              <Button variant="ghost" size="icon-sm" data-day-side-close aria-label="Close" onClick={() => (chime('away'), shut())}><X /></Button>
            </Tip>
          </div>
          {task
            ? <div className="@container/page flex min-h-0 flex-1 flex-col overflow-y-auto">{full && <TaskDetail key={full.id} task={full} onClose={onClose} onOpen={onOpen} />}</div>
            : <NewTask ask={ask as Extract<SideAsk, { day: string }>} />}
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  )
}

/** The new task's fields. The words win: a day, a length or a priority said in them is kept over the ones picked here. */
function NewTask({ ask }: { ask: Extract<SideAsk, { day: string }> }): React.JSX.Element {
  const [text, setText] = useState('')
  const [day, setDay] = useState(ask.day)
  const [minute, setMinute] = useState<number | null>(ask.minute)
  const [length, setLength] = useState(ask.minute === null ? 0 : ask.length)
  const [tags, setTags] = useState<string[]>([])
  const [priority, setPriority] = useState(0)
  const [notes, setNotes] = useState('')
  const field = useRef<HTMLInputElement>(null)
  const tagField = useRef<HTMLInputElement>(null)
  // Another day or slot clicked while open: the panel moves to it, keeping what is typed.
  useEffect(() => {
    setDay(ask.day)
    setMinute(ask.minute)
    if (ask.minute !== null) setLength(ask.length)
    requestAnimationFrame(() => field.current?.focus())
  }, [ask.day, ask.minute, ask.length])
  const hhmm = minute === null ? '09:00' : `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`
  const save = async (): Promise<void> => {
    if (!text.trim()) return chime('nope')
    const words = [text.trim(), ...tags.map((tag) => `#${tag}`)].join(' ')
    const typed = notes
    setText('')
    setTags([])
    setNotes('')
    setPriority(0)
    requestAnimationFrame(() => field.current?.focus())
    const made = await makeTask({ text: words }, 'Added', { quiet: true })
    if (!made) return
    const got = (await vigil.tasks()).find((one) => one.id === made.id)
    const at = minute === null ? dayjs(day).hour(9).minute(0).startOf('minute') : dayjs(day).startOf('day').add(minute, 'minute')
    const own = !!got?.dueAt
    await vigil.saveTask(made.id, {
      ...(own ? {} : minute === null ? { due: at.toISOString(), allDay: 1 } : { due: at.toISOString(), allDay: 0 }),
      ...(length && !got?.estimate ? { estimate: length } : {}),
      ...(priority && !got?.priority ? { priority } : {}),
      ...(typed.trim() ? { notes: { type: 'doc', content: typed.split('\n').map((line) => (line ? { type: 'paragraph', content: [{ type: 'text', text: line }] } : { type: 'paragraph' })) } } : {})
    })
    chime('noted')
    toast(`Added for ${whenInLine(own ? got!.dueAt! : at.toISOString(), own ? !!got!.allDay : minute === null)}`, () => void vigil.unmakeTask(made.id, made.existed, [], []))
  }
  const row = 'flex min-h-8 items-center gap-3'
  const name = 'w-20 shrink-0 text-control font-medium text-foreground'
  return (
    <form className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 pt-3 pb-4" onSubmit={(event) => (event.preventDefault(), void save())}>
      <div className="flex min-h-10 items-center rounded-lg border px-3 text-body focus-within:ring-1 focus-within:ring-ring">
        <TaskInput inputRef={field} autoFocus value={text} onChange={setText} label={`A new task for ${dayjs(day).format('dddd D MMMM')}`}
          placeholder="Add a task: “call the dentist 10am #home !!”" />
      </div>
      <div className={row}>
        <span className={name}>Day</span>
        <DatePicker value={dayjs(day).hour(12).toISOString()} onChange={(iso) => iso && setDay(dayjs(iso).format('YYYY-MM-DD'))} className="-ml-2 text-foreground" />
      </div>
      <div className={row}>
        <span className={name}>Time</span>
        <Chips options={[{ id: 'none', label: 'No time' }, { id: 'at', label: 'At a time' }]} on={(id) => (id === 'at') === (minute !== null)}
          pick={(id) => (chime('tap'), setMinute(id === 'at' ? (minute ?? 9 * 60) : null))} />
        {minute !== null && <TimeField label="Time" className="h-7 w-24" value={hhmm} onChange={(to) => { const [h, m] = to.split(':').map(Number); setMinute(h * 60 + m) }} />}
      </div>
      <div className={row}>
        <span className={name}>Takes</span>
        <Chips options={LENGTHS.map(([id, label]) => ({ id, label }))} on={(id) => Number(id) === length} pick={(id) => (chime('tap'), setLength(Number(id)))} />
      </div>
      <div className={row}>
        <span className={name}>Priority</span>
        <Chips options={LEVELS.map((level) => ({ id: String(level), label: level ? PRIORITY_NAMES[level] : 'None' }))} on={(id) => Number(id) === priority}
          pick={(id) => (Number(id) ? chime('tap') : chime('off'), setPriority(Number(id)))} />
        {priority > 0 && <PriorityIcon level={priority} className="size-3.5 shrink-0" />}
      </div>
      <div className="flex items-start gap-3">
        <span className={`${name} pt-1`}>Tags</span>
        <div data-day-side-tags className="min-w-0 flex-1 [&>div]:mb-0">
          <TagRow tags={tags} field={tagField} onAdd={(tag) => setTags((now) => [...new Set([...now, tag])])} onRemove={(tag) => setTags((now) => now.filter((one) => one !== tag))}
            onDone={() => field.current?.focus()} />
        </div>
      </div>
      <div className="flex min-h-0 flex-col gap-1.5">
        <span className={name}>Notes</span>
        <textarea data-day-side-notes value={notes} onChange={(event) => setNotes(event.target.value)} rows={4} placeholder="The details, links and steps"
          className="min-h-24 resize-none rounded-lg border bg-transparent px-3 py-2 text-body text-foreground outline-none placeholder:text-foreground/70 focus:ring-1 focus:ring-ring" />
      </div>
      <div className="mt-auto flex items-center gap-3 pt-2">
        <Button type="submit" data-day-side-add>Add task <Kbd>↵</Kbd></Button>
        <p className="text-body text-foreground/85">Stays open for the next one. Esc closes it.</p>
      </div>
    </form>
  )
}
