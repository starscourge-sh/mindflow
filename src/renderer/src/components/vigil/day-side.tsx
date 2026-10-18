import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'motion/react'
import { Plus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { chime } from '@/lib/sound'
import { makeTask } from '@/lib/tasks'
import { sameTask } from '@/lib/calendar'
import { vigil, whenInLine, type TaskFull } from '@/lib/vigil'
import { clock, dayjs } from '../../../../main/dates'
import { TaskInput } from './task-input'
import { TaskDetail } from './tasks-view'
import { Kbd, Tip, toast, untoast } from './ui'
import { EventDetail, NewEvent } from './calendar-events'
import { undoLastEvent } from '@/lib/events'

/** What the side panel shows: a new task for a day (at a time, for a length), or a task as it is. */
export type SideAsk = { day: string; minute: number | null; length: number; drag?: boolean } | { task: string } | { event: string }

/** How long, as the panel says it: 30 minutes, 1 hour, 1 hour 30 minutes. */
const lasting = (minutes: number): string => {
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return [hours && `${hours} ${hours === 1 ? 'hour' : 'hours'}`, rest && `${rest} minutes`].filter(Boolean).join(' ')
}

/** Keys that go to the field or editor under the caret, not to the panel. */
const writing = (): boolean => {
  const active = document.activeElement as HTMLElement | null
  return !!active && (active.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(active.tagName))
}

/**
 * The calendar's side panel, the way Notion Calendar and Google Calendar
 * keep theirs: on the Calendar page it takes the place of the right panel's
 * Upcoming (`inline`); on Home's month and the week board, which have no
 * panel of their own, it sits over the right of the page. For a day or a slot it asks
 * for the task's words first; ↵ adds it on that day and time, and the panel
 * turns into the task itself, the same task page as everywhere else (notes,
 * steps, tags, date, length, priority and the rest). "New task" or ⌘N starts
 * the next one, ⌘Z takes back the one just made, Esc closes it. A chip opens
 * its task in the same panel. The same panel on the month, the week board
 * and the Calendar page.
 */
export function DaySide({ ask, onClose, onOpen, inline = false }: {
  ask: SideAsk | null
  onClose: () => void
  onOpen?: (type: string, id: string) => void
  /** In a panel of the page's own (the Calendar's right panel, as Notion Calendar has it), in place of what it held; not over the page. */
  inline?: boolean
}): React.JSX.Element {
  // The task just made here: the panel shows it, as a chip's task is shown.
  const [made, setMade] = useState<{ id: string; undo: (() => void) | null } | null>(null)
  // Another day, slot or chip asked for: a fresh start there.
  useEffect(() => setMade(null), [ask])
  // An event (calendar-events.tsx): one opened, or one just made here.
  const [madeEvent, setMadeEvent] = useState<string | null>(null)
  useEffect(() => setMadeEvent(null), [ask])
  const eventKey = madeEvent ?? (ask && 'event' in ask ? ask.event : null)
  // A slot dragged across is an event to start with; a click, a task. Either can be switched.
  const [kind, setKind] = useState<'event' | 'task'>('task')
  useEffect(() => setKind(ask && 'day' in ask && ask.drag ? 'event' : 'task'), [ask])
  const task = eventKey ? null : made?.id ?? (ask && 'task' in ask ? ask.task : null)
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
  // Showing a task, the panel holds the keys, so Esc, ⌘N and ⌘Z reach it.
  useEffect(() => void (task && full && requestAnimationFrame(() => panel.current?.focus())), [task, full])
  useEffect(() => void (eventKey && requestAnimationFrame(() => !panel.current?.contains(document.activeElement) && panel.current?.focus())), [eventKey])
  // ⌘Z with an event open, outside its fields: its newest change taken back.
  useEffect(() => {
    if (!eventKey) return
    const onKey = (event: KeyboardEvent): void => {
      // Esc with the keys let go (after a name is kept, or a "which times" asked): the panel closes, as from inside it.
      if (event.key === 'Escape' && !event.defaultPrevented && (document.activeElement === document.body || !document.activeElement) && !document.querySelector('[data-scope-ask], [role="menu"]')) {
        event.preventDefault()
        chime('away')
        return onClose()
      }
      if (!event.metaKey || event.shiftKey || event.altKey || event.key !== 'z' || writing() || document.querySelector('[data-scope-ask]')) return
      if (!undoLastEvent()) return
      event.preventDefault()
      event.stopPropagation()
      untoast()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [eventKey, onClose])
  // The words typed for a task taken back with ⌘Z or Undo: back in the line, to fix and add again.
  const [again, setAgain] = useState('')
  const fresh = (): void => (chime('open'), setAgain(''), setMade(null))
  // Taken back while still showing here: the line again, holding its words.
  const back = (id: string, words: string): void => setMade((now) => (now?.id === id ? (setAgain(words), null) : now))
  const day = ask && 'day' in ask ? ask : null
  // A chip's task opened from the panel's own "New task" asks for a day: the day it is on, or today.
  const [start, setStart] = useState<Extract<SideAsk, { day: string }> | null>(null)
  useEffect(() => setStart(null), [ask])
  const asking = !task && !eventKey && (day ?? start)
  const shell = (
    <AnimatePresence initial={!inline}>
      {ask && (
        <motion.div ref={panel} key="day-side" data-day-side={asking ? 'new' : eventKey ? 'event' : 'task'} role="dialog" data-beside aria-label={asking ? (kind === 'event' ? 'A new event' : 'A new task') : eventKey ? 'The event' : 'The task'} tabIndex={-1}
          initial={inline ? { opacity: 0 } : { x: 32, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={inline ? { opacity: 0, transition: { duration: 0 } } : { x: 32, opacity: 0, transition: { duration: 0.14 } }} transition={inline ? { duration: 0.16 } : { type: 'spring', stiffness: 520, damping: 44 }}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault()
              event.stopPropagation()
              chime('away')
              return shut()
            }
            if (!event.metaKey || event.altKey || event.ctrlKey) return
            // ⌘N: the next new task, on the same day.
            if (event.key === 'n' && !event.shiftKey && !asking) {
              event.preventDefault()
              event.stopPropagation()
              if (!day) setStart({ day: dayjs(full?.dueAt ?? undefined).format('YYYY-MM-DD'), minute: null, length: 0 })
              return fresh()
            }
            // ⌘Z: the task just made goes again, outside its fields and notes, which keep their own undo.
            if (event.key === 'z' && !event.shiftKey && made?.undo && !writing()) {
              event.preventDefault()
              event.stopPropagation()
              chime('undo')
              untoast()
              made.undo()
            }
          }}
          className={inline ? 'flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-background outline-none' : 'fixed top-12 right-3 bottom-3 z-40 flex w-[30rem] max-w-[calc(100vw-1.5rem)] flex-col overflow-hidden rounded-xl border bg-background shadow-(--mf-panel-shadow) outline-none'}>
          {/* The bar over the task, as the page's own top bar: the next one, and away. */}
          <div className="flex shrink-0 items-center gap-1 px-2 pt-2">
            {asking && (
              <div role="radiogroup" aria-label="An event or a task" className="flex gap-0.5 rounded-full bg-accent/60 p-0.5">
                {([['event', 'Event', 'Something at a time: a meeting, a class, lunch'], ['task', 'Task', 'Something to do, with a tick']] as const).map(([id, label, tip]) => (
                  <Tip key={id} label={tip}>
                    <button type="button" role="radio" aria-checked={kind === id} data-day-side-kind={id} onClick={() => kind !== id && (chime('tap'), setKind(id))}
                      className="h-7 rounded-full px-3 text-control text-foreground transition-colors duration-150 aria-checked:bg-background aria-checked:font-medium aria-checked:shadow-sm motion-reduce:transition-none">{label}</button>
                  </Tip>
                ))}
              </div>
            )}
            {!asking && !eventKey && (
              <Tip label="Start another task">
                <Button variant="ghost" size="sm" data-day-side-new onClick={() => (!day && setStart({ day: dayjs(full?.dueAt ?? undefined).format('YYYY-MM-DD'), minute: null, length: 0 }), fresh())}>
                  <Plus /> New task <Kbd>⌘N</Kbd>
                </Button>
              </Tip>
            )}
            <span className="flex-1" />
            <Tip label="Close (Esc)">
              <Button variant="ghost" size="icon-sm" data-day-side-close aria-label="Close" onClick={() => (chime('away'), shut())}><X /></Button>
            </Tip>
          </div>
          {asking && kind === 'event'
            ? <NewEvent key={`${asking.day}-${asking.minute}`} ask={asking} onMade={setMadeEvent} />
            : asking
            ? <NewTask key={`${asking.day}-${asking.minute}`} ask={asking} first={again} onMade={(id, undo) => setMade({ id, undo })} onBack={back} />
            : eventKey
            ? <div className="@container/page flex min-h-0 flex-1 flex-col overflow-y-auto"><EventDetail key={eventKey} eventKey={eventKey} onKey={setMadeEvent} onClose={onClose} onOpen={onOpen} /></div>
            : <div className="@container/page flex min-h-0 flex-1 flex-col overflow-y-auto">{full && <TaskDetail key={full.id} task={full} onClose={onClose} onOpen={onOpen} />}</div>}
        </motion.div>
      )}
    </AnimatePresence>
  )
  return inline ? shell : createPortal(shell, document.body)
}

/**
 * The new task's first line, where the task page has its name: the words
 * say the rest (a day, a time, #tags, !! for priority) as everywhere else,
 * and the day or slot clicked fills in what they leave out.
 */
function NewTask({ ask, first, onMade, onBack }: {
  ask: Extract<SideAsk, { day: string }>
  first: string
  /** Made (or found already there): the panel shows it. `undo` takes it back, and the line comes back with its words. */
  onMade: (id: string, undo: (() => void) | null) => void
  onBack: (id: string, words: string) => void
}): React.JSX.Element {
  const [text, setText] = useState(first)
  const field = useRef<HTMLInputElement>(null)
  useEffect(() => void requestAnimationFrame(() => field.current?.focus()), [])
  const { day, minute } = ask
  const length = minute === null ? 0 : ask.length
  const at = minute === null ? dayjs(day).hour(9).minute(0).startOf('minute') : dayjs(day).startOf('day').add(minute, 'minute')
  const busy = useRef(false)
  const save = async (): Promise<void> => {
    const words = text.trim()
    if (!words) return chime('nope')
    if (busy.current) return
    busy.current = true
    const made = await makeTask({ text: words }, 'Added', { quiet: true })
    busy.current = false
    if (!made) return
    const got = (await vigil.tasks()).find((one) => one.id === made.id)
    // The same task is already on the list: it stays on its own day unless asked to move here, and opens.
    if (made.existed && got) return (sameTask(got, { due: at.toISOString(), allDay: minute === null ? 1 : 0 }), onMade(made.id, null))
    // Words that named a day of their own ("call mum friday") keep it; otherwise it is for this day.
    const own = !!got?.dueAt
    await vigil.saveTask(made.id, {
      ...(own ? {} : { due: at.toISOString(), allDay: minute === null ? 1 : 0 }),
      ...(length && !got?.estimate ? { estimate: length } : {})
    })
    chime('noted')
    const undo = (): void => (void vigil.unmakeTask(made.id, made.existed, [], []), onBack(made.id, words))
    toast(`Added for ${whenInLine(own ? got!.dueAt! : at.toISOString(), own ? !!got!.allDay : minute === null)}`, undo)
    onMade(made.id, undo)
  }
  return (
    <form data-day-side-draft className="flex min-h-0 flex-1 flex-col overflow-y-auto pt-4 pb-4" onSubmit={(event) => (event.preventDefault(), void save())}>
      <h2 className="page-narrow mx-auto mb-3 w-full px-12 font-heading text-title font-semibold tracking-[-0.018em] text-foreground">New task</h2>
      <div className="page-narrow mx-auto flex w-full flex-col gap-3 px-12">
        <div className="flex min-h-10 items-center gap-2 rounded-lg border pr-1 pl-3 text-body focus-within:ring-1 focus-within:ring-ring">
          <TaskInput inputRef={field} value={text} onChange={setText} label={`A new task for ${dayjs(day).format('dddd D MMMM')}`}
            placeholder="Add a task: “call the dentist 10am #home !!”" />
          <Button type="submit" size="sm" data-day-side-add>Add <Kbd>↵</Kbd></Button>
        </div>
        {/* Where it lands, plain to read, before it is made. */}
        <p data-day-side-when className="text-body text-foreground">
          For <strong className="font-semibold">{at.format('dddd D MMMM')}</strong>{minute !== null && <> at <strong className="font-semibold">{clock(at)}</strong></>}{length ? <>, for <strong className="font-semibold">{lasting(length)}</strong></> : null}.
        </p>
        <p className="text-body text-foreground/85">Then the notes, steps, tags, priority and the rest are on the task as it opens here. A day or time in the words wins.</p>
      </div>
    </form>
  )
}
