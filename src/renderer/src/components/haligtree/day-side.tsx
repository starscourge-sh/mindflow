import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { heroBack, heroing } from '@/lib/hero'
import { EASE, byKeys, still } from '@/lib/motion'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'motion/react'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { chime } from '@/lib/sound'
import { atOn, makeTask, renameTask, repeatAlone, taskName, timeAlone } from '@/lib/tasks'
import { readTask } from '../../../../main/task-words'
import { sameTask } from '@/lib/calendar'
import { haligtree, whenInLine, type Task, type TaskFull } from '@/lib/haligtree'
import { clock, dayjs, dayKey, plural } from '../../../../main/dates'
import { TaskInput, keptIn, useKept } from './task-input'
import { TaskDetail } from './tasks-view'
import { Kbd, MoreBelow, Tip, refuse, toast, untoast } from './ui'
import { EventDetail } from './calendar-events'
import { undoLastEvent } from '@/lib/events'
import { FLOAT } from '@/lib/float'

/** What the side panel shows: a task as it is, or an event. */
export type SideAsk = { task: string } | { event: string }
/** Where something new goes: a day, and a time on it for a length (the Calendar's draft, cal-add.tsx). */
type Slot = { day: string; minute: number | null; length: number }

/** How long, as the panel says it: 30 minutes, 1 hour, 1 hour 30 minutes. */
const lasting = (minutes: number): string => {
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return [hours && `${plural(hours, 'hour')}`, rest && `${rest} minutes`].filter(Boolean).join(' ')
}

/** Keys that go to the field or editor under the caret, not to the panel. */
const writing = (): boolean => {
  const active = document.activeElement as HTMLElement | null
  return !!active && (active.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(active.tagName))
}

/** Off to the right, where the panel slides in from and back out to: past its own width and the gap it keeps from the edge. */
const OFF = { transform: 'translateX(112%)' }
/** In on a spring that settles without bouncing back; out faster, on the app's curve, so it starts going at once. */
const IN = { type: 'spring', duration: 0.24, bounce: 0 } as const
const OUT = { duration: 0.16, ease: EASE } as const
/**
 * How it goes, read as it goes (AnimatePresence's `custom`), not when it last drew: with Reduce motion or Motion off,
 * gone at once; otherwise slid out, by Esc too, quicker than it came. (Read at its last draw, it went at once or slid
 * by whatever was pressed before.)
 */
const LEAVE = { gone: (now: boolean) => (now ? { opacity: 0, transition: { duration: 0 } } : { ...OFF, transition: OUT }) }

/**
 * The side panel an event or a task opens in, the way Notion Calendar and
 * Google Calendar keep theirs: a frosted sidebar (FLOAT), full height on the
 * right, floating over the page, sliding in from the right and back out the
 * same way, so what is under it never moves. On the Calendar page it floats
 * over the days, inside the page's own row (`inline`); on Home's month and
 * the Journal's, over the right of the window. It holds the task itself, the
 * same task page as everywhere else, or the event; Esc closes it, and ⌘Z
 * takes back an event's newest change. Nothing new is written here: a new
 * one is written beside its draft on the day (cal-add.tsx).
 */
export function DaySide({ ask, onClose, onOpen, inline = false, width, grip }: {
  ask: SideAsk | null
  onClose: () => void
  onOpen?: (type: string, id: string) => void
  /** Over the page's own row (the Calendar's days), placed in it, rather than over the whole window. */
  inline?: boolean
  /** Its width, when the page keeps one (the Calendar's, dragged at its edge with `grip`). */
  width?: string
  grip?: React.ReactNode
}): React.JSX.Element {
  // An event whose change made it another one (one time of a repeating event, cut loose): the panel follows it.
  const [madeEvent, setMadeEvent] = useState<string | null>(null)
  // The task's or the event's details, scrolling under the close button: their "more below" pill watches it.
  const [detailBox, setDetailBox] = useState<HTMLDivElement | null>(null)
  useEffect(() => setMadeEvent(null), [ask])
  const eventKey = madeEvent ?? (ask && 'event' in ask ? ask.event : null)
  const task = eventKey ? null : ask && 'task' in ask ? ask.task : null
  const [full, setFull] = useState<TaskFull | null>(null)
  useEffect(() => {
    let live = true
    setFull(null)
    if (task) void haligtree.task(task).then((one) => live && setFull(one ?? null))
    return () => void (live = false)
  }, [task])
  const panel = useRef<HTMLDivElement>(null)
  // Let go of the keys at once: while it slides away, nothing typed lands in it.
  const shut = (): void => (panel.current?.contains(document.activeElement) && (document.activeElement as HTMLElement).blur(), onClose())
  // Showing a task, the panel holds the keys, so Esc reaches it.
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
  // A click anywhere else closes it, as Notion Calendar's and Apple's do (a field being written in is kept as it lets
  // go). Menus and popovers it opened, a notice, a draft on the grid and a "which times" asked are part of it.
  useEffect(() => {
    if (!inline || !ask) return
    const away = (event: PointerEvent): void => {
      const at = event.target as Element | null
      if (!at || panel.current?.contains(at) || at.closest('[data-radix-popper-content-wrapper], [role="menu"], [role="dialog"], [role="status"], [data-cal-draft], [data-scope-ask]')) return
      chime('away')
      shut()
    }
    window.addEventListener('pointerdown', away, true)
    return () => window.removeEventListener('pointerdown', away, true)
  }) // eslint-disable-line react-hooks/exhaustive-deps
  const shell = (
    <AnimatePresence custom={still()}>
      {ask && (
        <motion.div ref={panel} key="day-side" data-day-side={eventKey ? 'event' : 'task'} data-cal-right={inline || undefined}
          role="dialog" data-beside aria-label={eventKey ? 'The event' : 'The task'} tabIndex={-1}
          // Slid, never faded: a frosted surface fading in shows a dark wash before its blur (taste.md, 8 Nov). Reached by a key
          // or with Reduce motion, it is there at once and gone at once; grown out of an event (lib/hero.ts), it is already in place.
          initial={byKeys() || still() || heroing() ? false : OFF} animate={{ transform: 'translateX(0%)' }}
          variants={LEAVE} exit="gone"
          transition={IN}
          style={width ? { width } : undefined}
          onKeyDown={(event) => {
            // Esc, and ⌘↵ (a field being written in is kept as it lets go): closed.
            if (event.key !== 'Escape' && !(event.key === 'Enter' && event.metaKey && !event.shiftKey && !event.altKey && !event.ctrlKey)) return
            event.preventDefault()
            event.stopPropagation()
            chime('away')
            shut()
          }}
          // Inset from the row's edges as the map's and the queue's panels are; the days keep their whole width under it.
          className={`${inline ? 'absolute top-3 right-3 bottom-3 z-30 max-w-[calc(100%-1.5rem)]' : 'fixed top-12 right-3 bottom-3 z-40 w-[30rem] max-w-[calc(100vw-1.5rem)]'} flex flex-col rounded-xl outline-none ${FLOAT} transition-[box-shadow] duration-150 has-[[data-cal-grip]:hover]:ring-foreground/25 has-[[data-cal-grip]:focus-visible]:ring-foreground/40 has-[[data-cal-grip]:active]:ring-foreground/40`}>
          {grip}
          {/* The words clipped to the corners; the grip, on the edge, is not. */}
          <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl">
            <div className="flex shrink-0 items-center gap-1 px-2 pt-2">
              <span className="flex-1" />
              <Tip label="Close (Esc)">
                <Button variant="ghost" size="icon-sm" data-day-side-close aria-label="Close" onClick={() => (chime('away'), heroBack(shut, () => panel.current))}><X /></Button>
              </Tip>
            </div>
            {eventKey
              ? <div key="event" ref={setDetailBox} className="@container/page mf-more flex min-h-0 flex-1 flex-col overflow-y-auto"><EventDetail key={eventKey} eventKey={eventKey} onKey={setMadeEvent} onClose={onClose} onOpen={onOpen} /></div>
              : <div key="task" ref={setDetailBox} className="@container/page mf-more flex min-h-0 flex-1 flex-col overflow-y-auto">{full && <TaskDetail key={full.id} task={full} onClose={onClose} onOpen={onOpen} />}</div>}
            <MoreBelow target={detailBox} />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
  return inline ? shell : createPortal(shell, document.body)
}

/**
 * "Event | Task": which of the two is being made, at the top of the popover a
 * new one is written in (cal-add.tsx). It stays where it is as the form under
 * it changes.
 */
export function KindSwitch({ kind, onKind }: { kind: 'event' | 'task'; onKind: (kind: 'event' | 'task') => void }): React.JSX.Element {
  return (
    <div role="radiogroup" aria-label="An event or a task" className="flex gap-0.5 rounded-full bg-accent/60 p-0.5">
      {([['event', 'Event', 'Something at a time: a meeting, a class, lunch'], ['task', 'Task', 'Something to do, with a tick']] as const).map(([id, label, tip]) => (
        <Tip key={id} label={tip}>
          <button type="button" role="radio" aria-checked={kind === id} data-day-side-kind={id} onClick={() => kind !== id && (chime('tap'), onKind(id))}
            className="h-7 cursor-pointer rounded-full px-3 text-control text-foreground transition-colors duration-150 aria-checked:bg-background aria-checked:font-medium aria-checked:shadow-sm motion-reduce:transition-none">{label}</button>
        </Tip>
      ))}
    </div>
  )
}

/**
 * The new task's first line, where the task page has its name: the words
 * say the rest (a day, a time, #tags, !! for priority) as everywhere else,
 * and the day or slot clicked fills in what they leave out.
 */
export function NewTask({ ask, first, held, onMade, onBack, words, onName, onPlace, task }: {
  /** The task the line is open on: its name to write over, read as a new one's words are; ↵ keeps the change, said with Undo. */
  task?: Task
  ask: Slot
  /** Set to its save while it holds words: the popover makes them when clicked away from. */
  held: React.MutableRefObject<(() => Promise<void>) | null>
  first: string
  /** Made (or found already there): the panel shows it. `undo` takes it back, and the line comes back with its words. */
  onMade: (id: string, undo: (() => void) | null) => void
  onBack: (id: string, words: string) => void
  /** The words, when what holds this form keeps them (the popover, so they stay as Event turns to Task). */
  words?: [string, (text: string) => void]
  /** Told the name read out of the words as it changes: the draft on the grid says it. */
  onName?: (name: string) => void
  /** Told where it will be as its words are read: its draft on the grid is drawn there. */
  onPlace?: (to: Slot) => void
}): React.JSX.Element {
  const own = useState(first)
  const [text, setText] = words ?? own
  const kept = useKept()
  const read = useMemo(() => readTask(text, new Date(), keptIn(kept.list, text)), [text, kept.list])
  const name = taskName(read.title).text.trim()
  useEffect(() => onName?.(name), [name]) // eslint-disable-line react-hooks/exhaustive-deps
  const field = useRef<HTMLInputElement>(null)
  useEffect(() => (requestAnimationFrame(() => {
    // The caret at the end of the whole name, wrapped onto a second line where it is long, never cut.
    const el = field.current
    if (!el) return
    el.focus()
    el.setSelectionRange(el.value.length, el.value.length)
  }), () => void (held.current = null)), []) // eslint-disable-line react-hooks/exhaustive-deps
  const { day, minute } = ask
  const length = minute === null ? 0 : ask.length
  const at = minute === null ? dayjs(day).hour(9).minute(0).startOf('minute') : dayjs(day).startOf('day').add(minute, 'minute')
  // Where it will be kept, read from the words the way `save` keeps it: a day of their own ("call mum friday", with its
  // time when they say one), a time alone on this day, otherwise the slot. Said under the line, and its draft drawn there.
  const alone = !!read.due && timeAlone(text)
  const ownDay = !!read.due && !alone && !repeatAlone(text)
  const shownAt = alone ? dayjs(atOn(read.due!, day)) : ownDay ? dayjs(read.due!) : at
  const shownMinute = alone || (ownDay && !read.allDay) ? shownAt.hour() * 60 + shownAt.minute() : ownDay ? null : minute
  const shownLength = shownMinute === null ? 0 : (read.estimate ?? (length || 30))
  useLayoutEffect(() => void (!task && onPlace?.({ day: dayKey(shownAt), minute: shownMinute, length: shownLength })), [dayKey(shownAt), shownMinute, shownLength]) // eslint-disable-line react-hooks/exhaustive-deps
  const busy = useRef(false)
  // Open on a task: its name without its #tags, as its page shows it; they are kept as the name changes.
  const named = task ? taskName(task.title) : null
  const changed = !!named && !!text.trim() && text.trim() !== named.text.trim()
  // Kept as the panel goes (clicked away from, ⌘↵): made, said in the notice, not shown here.
  held.current = (task ? changed : text.trim()) ? () => save(false) : null
  const save = async (stay = true): Promise<void> => {
    const words = text.trim()
    // Words kept as words (the chips' ×, ⌫ just after them), as on every task line (task-input.tsx).
    const plain = keptIn(kept.list, words)
    if (task) {
      if (!words) return refuse('A task needs a name: type one')
      // Nothing changed: ↵ only closes it.
      if (!changed) return void (stay && onMade(task.id, null))
      if (busy.current) return
      busy.current = true
      const was = task.title
      // A day, a time or a priority written into the name is read as everywhere else a task is typed, and said with Undo.
      const set = await renameTask(task, [words, ...[...new Set(named!.tags)].map((tag) => `#${tag}`)].join(' '), plain)
      busy.current = false
      chime('tap')
      toast(set ? set.said : 'Renamed', set ? set.undo : () => void haligtree.saveTask(task.id, { title: was }))
      if (stay) onMade(task.id, null)
      return
    }
    if (!words) return refuse('Nothing to add yet: type the task')
    if (busy.current) return
    busy.current = true
    const made = await makeTask({ text: words, plain }, 'Added', { quiet: true })
    busy.current = false
    if (!made) return
    const got = (await haligtree.tasks()).find((one) => one.id === made.id)
    // The same task is already on the list: it stays on its own day unless asked to move here, and opens.
    if (made.existed && got) return (sameTask(got, { due: at.toISOString(), allDay: minute === null ? 1 : 0 }), onMade(made.id, null))
    // Words that named a day of their own ("call mum friday") keep it; otherwise it is for this day.
    // Only a time ("call the dentist 10am"): at that time on this day. Only a repeat that names no day ("every week"): from this day.
    const alone = !!got?.dueAt && timeAlone(words)
    const own = !!got?.dueAt && !alone && !repeatAlone(words)
    const due = alone ? atOn(got!.dueAt!, day) : at.toISOString()
    const allDay = !alone && minute === null
    await haligtree.saveTask(made.id, {
      ...(own ? {} : { due, allDay: allDay ? 1 : 0 }),
      ...(length && !got?.estimate ? { estimate: length } : {})
    })
    chime('noted')
    const undo = (): void => (void haligtree.unmakeTask(made.id, made.existed, [], []), onBack(made.id, words))
    toast(`Added for ${whenInLine(own ? got!.dueAt! : due, own ? !!got!.allDay : allDay)}`, undo)
    if (stay) onMade(made.id, undo)
  }
  return (
    <form data-day-side-draft data-task-open={task?.id} className="flex flex-col px-3 pt-2.5 pb-3" onSubmit={(event) => (event.preventDefault(), void save())}>
      <div className="flex w-full flex-col gap-2.5">
        <div className="flex min-h-10 items-center gap-2 rounded-lg border pr-1 pl-3 text-body focus-within:border-foreground/25">
          <TaskInput grows inputRef={field} value={text} onChange={setText} kept={kept} label={task ? 'The task’s name' : `A new task for ${dayjs(day).format('dddd D MMMM')}`}
            placeholder="Call the dentist 10am #home !!" />
          <Button type="submit" size="sm" variant={task ? 'ghost' : undefined} data-day-side-add aria-label={task ? 'Keep' : 'Add'}><Kbd>↵</Kbd></Button>
        </div>
        {/* Where it lands (or, open on a task, where it is), plain to read. */}
        {task && !task.dueAt
          ? <p data-day-side-when className="text-body text-foreground">No day yet.</p>
          : <p data-day-side-when className="text-body text-foreground [overflow-wrap:anywhere]">
              For <strong className="font-semibold">{shownAt.format('dddd D MMMM')}</strong>{shownMinute !== null && <> at <strong className="font-semibold">{clock(shownAt)}</strong></>}{shownLength ? <>, for <strong className="font-semibold">{lasting(shownLength)}</strong></> : null}.
            </p>}
        {/* One quiet line, never a paragraph, saying by example what the words can hold, wrapped where it is long; it gives
            way in a short window, so nothing in the popover is cut. */}
        <p data-day-side-hint className="text-control text-muted-foreground [@media(max-height:520px)]:hidden">{task ? 'Type fri 1pm or !! to change it.' : 'Reads fri 1pm, #home, and !! for priority.'}</p>
      </div>
    </form>
  )
}
