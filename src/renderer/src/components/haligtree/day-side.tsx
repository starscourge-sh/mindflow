import { useEffect, useMemo, useRef, useState } from 'react'
import { heroBack, heroing } from '@/lib/hero'
import { EASE, byKeys, still } from '@/lib/motion'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'motion/react'
import { Plus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { chime } from '@/lib/sound'
import { atOn, makeTask, taskName, timeAlone } from '@/lib/tasks'
import { readTask } from '../../../../main/task-words'
import { sameTask } from '@/lib/calendar'
import { haligtree, whenInLine, type TaskFull } from '@/lib/haligtree'
import { clock, dayjs, plural } from '../../../../main/dates'
import { TaskInput } from './task-input'
import { TaskDetail } from './tasks-view'
import { Kbd, Tip, toast, untoast } from './ui'
import { EventDetail, NewEvent } from './calendar-events'
import { undoLastEvent } from '@/lib/events'
import { FLOAT } from '@/lib/float'

/** What the side panel shows: a new task for a day (at a time, for a length), or a task as it is. */
export type SideAsk = { day: string; minute: number | null; length: number; drag?: boolean } | { task: string } | { event: string }

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
 * The calendar's side panel, the way Notion Calendar and Google Calendar
 * keep theirs: a frosted sidebar (FLOAT), full height on the right, floating
 * over the page, sliding in from the right and back out the same way, so what
 * is under it never moves. On the Calendar page it floats over the days, inside
 * the page's own row (`inline`), and holds Upcoming (`rest`) while nothing is
 * open in it; on Home's month and the week board, over the right of the
 * window. For a day or a slot it asks
 * for the task's words first; ↵ adds it on that day and time, and the panel
 * turns into the task itself, the same task page as everywhere else (notes,
 * steps, tags, date, length, priority and the rest). "New task" or ⌘N starts
 * the next one, ⌘Z takes back the one just made, Esc closes it. A chip opens
 * its task in the same panel. The same panel on the month, the week board
 * and the Calendar page.
 */
export function DaySide({ ask, onClose, onOpen, inline = false, width, grip, rest }: {
  ask: SideAsk | null
  onClose: () => void
  onOpen?: (type: string, id: string) => void
  /** Over the page's own row (the Calendar's days and Upcoming), placed in it, rather than over the whole window. */
  inline?: boolean
  /** Its width, when the page keeps one (the Calendar's, dragged at its edge with `grip`). */
  width?: string
  grip?: React.ReactNode
  /** Inline: what the sidebar holds while nothing is being made or opened (the Calendar's Upcoming); none, it slides away. */
  rest?: React.ReactNode
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
    if (task) void haligtree.task(task).then((one) => live && setFull(one ?? null))
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
  // The words typed in a new event or task, kept when the panel is clicked away from or ⌘↵ pressed.
  const held = useRef<(() => Promise<void>) | null>(null)
  const keep = (): void => {
    const save = held.current
    held.current = null
    if (save) void save()
    chime('away')
    shut()
  }
  // A click anywhere else keeps what was typed and closes it, as Notion Calendar's and Apple's do. Menus and
  // popovers it opened, the toast, and the new slot it is about are part of it.
  useEffect(() => {
    if (!inline || !ask) return
    const away = (event: PointerEvent): void => {
      const at = event.target as Element | null
      if (!at || panel.current?.contains(at) || at.closest('[data-radix-popper-content-wrapper], [role="menu"], [role="dialog"], [role="status"], [data-cal-draft], [data-scope-ask]')) return
      keep()
    }
    window.addEventListener('pointerdown', away, true)
    return () => window.removeEventListener('pointerdown', away, true)
  }) // eslint-disable-line react-hooks/exhaustive-deps
  const shell = (
    <AnimatePresence custom={still()}>
      {(ask || (inline && rest)) && (
        <motion.div ref={panel} key="day-side" data-day-side={ask ? (asking ? 'new' : eventKey ? 'event' : 'task') : undefined} data-cal-right={inline || undefined} data-cal-right-holds={inline ? (ask ? 'editor' : 'upcoming') : undefined}
          role={ask ? 'dialog' : 'complementary'} data-beside={ask ? true : undefined} aria-label={!ask ? 'Upcoming' : asking ? (kind === 'event' ? 'A new event' : 'A new task') : eventKey ? 'The event' : 'The task'} tabIndex={-1}
          // Slid, never faded: a frosted surface fading in shows a dark wash before its blur (taste.md, 8 Nov). Reached by a key
          // or with Reduce motion, it is there at once and gone at once; grown out of an event (lib/hero.ts), it is already in place.
          initial={byKeys() || still() || heroing() ? false : OFF} animate={{ transform: 'translateX(0%)' }}
          variants={LEAVE} exit="gone"
          transition={IN}
          style={width ? { width } : undefined}
          onKeyDown={(event) => {
            if (!ask) return
            if (event.key === 'Escape') {
              event.preventDefault()
              event.stopPropagation()
              chime('away')
              return shut()
            }
            // ⌘↵: kept, and closed: the words of a new one made, a field being written in saved as it lets go.
            if (event.key === 'Enter' && event.metaKey && !event.shiftKey && !event.altKey && !event.ctrlKey) {
              event.preventDefault()
              event.stopPropagation()
              if (asking && !held.current) return chime('nope')
              return keep()
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
          // Inset from the row's edges as the map's and the queue's panels are; the days keep their whole width under it.
          className={`${inline ? 'absolute top-3 right-3 bottom-3 z-30 max-w-[calc(100%-1.5rem)]' : 'fixed top-12 right-3 bottom-3 z-40 w-[30rem] max-w-[calc(100vw-1.5rem)]'} flex flex-col rounded-xl outline-none ${FLOAT} transition-[box-shadow] duration-150 has-[[data-cal-grip]:hover]:ring-foreground/25 has-[[data-cal-grip]:focus-visible]:ring-foreground/40 has-[[data-cal-grip]:active]:ring-foreground/40`}>
          {grip}
          {/* The words clipped to the corners; the grip, on the edge, is not. */}
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl">
          {!ask ? <div className="mf-more flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-4 py-4">{rest}</div> : <>
          {/* The bar over the task, as the page's own top bar: the next one, and away. */}
          <div className="flex shrink-0 items-center gap-1 px-2 pt-2">
            {asking && <KindSwitch kind={kind} onKind={setKind} />}
            {!asking && !eventKey && (
              <Tip label="Start another task">
                <Button variant="ghost" size="sm" data-day-side-new onClick={() => (!day && setStart({ day: dayjs(full?.dueAt ?? undefined).format('YYYY-MM-DD'), minute: null, length: 0 }), fresh())}>
                  <Plus /> New task <Kbd>⌘N</Kbd>
                </Button>
              </Tip>
            )}
            <span className="flex-1" />
            <Tip label="Close (Esc)">
              <Button variant="ghost" size="icon-sm" data-day-side-close aria-label="Close" onClick={() => (chime('away'), heroBack(shut, () => panel.current))}><X /></Button>
            </Tip>
          </div>
          {asking && kind === 'event'
            ? <NewEvent key={`${asking.day}-${asking.minute}`} ask={asking} held={held} onMade={setMadeEvent} />
            : asking
            ? <NewTask key={`${asking.day}-${asking.minute}`} ask={asking} held={held} first={again} onMade={(id, undo) => setMade({ id, undo })} onBack={back} />
            : eventKey
            ? <div className="@container/page mf-more flex min-h-0 flex-1 flex-col overflow-y-auto"><EventDetail key={eventKey} eventKey={eventKey} onKey={setMadeEvent} onClose={onClose} onOpen={onOpen} /></div>
            : <div className="@container/page mf-more flex min-h-0 flex-1 flex-col overflow-y-auto">{full && <TaskDetail key={full.id} task={full} onClose={onClose} onOpen={onOpen} />}</div>}
          </>}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
  return inline ? shell : createPortal(shell, document.body)
}

/**
 * "Event | Task": which of the two is being made, the one control for it
 * wherever a new one is started (this panel, and the Calendar's popover
 * beside a slot, cal-add.tsx). It stays where it is as the form under it changes.
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
export function NewTask({ ask, first, held, onMade, onBack, pop = false, words, onName }: {
  ask: Extract<SideAsk, { day: string }>
  /** Set to its save while it holds words: the panel keeps them when clicked away from. */
  held: React.MutableRefObject<(() => Promise<void>) | null>
  first: string
  /** Made (or found already there): the panel shows it. `undo` takes it back, and the line comes back with its words. */
  onMade: (id: string, undo: (() => void) | null) => void
  onBack: (id: string, words: string) => void
  /** In the Calendar's popover beside a slot (cal-add.tsx): the same line and reading, with no heading and no page margins. */
  pop?: boolean
  /** The words, when what holds this form keeps them (the popover, so they stay as Event turns to Task). */
  words?: [string, (text: string) => void]
  /** Told the name read out of the words as it changes: the draft on the grid says it. */
  onName?: (name: string) => void
}): React.JSX.Element {
  const own = useState(first)
  const [text, setText] = words ?? own
  const name = useMemo(() => taskName(readTask(text).title).text.trim(), [text])
  useEffect(() => onName?.(name), [name]) // eslint-disable-line react-hooks/exhaustive-deps
  const field = useRef<HTMLInputElement>(null)
  useEffect(() => (requestAnimationFrame(() => (field.current?.focus(), field.current?.setSelectionRange(field.current.value.length, field.current.value.length))), () => void (held.current = null)), []) // eslint-disable-line react-hooks/exhaustive-deps
  const { day, minute } = ask
  const length = minute === null ? 0 : ask.length
  const at = minute === null ? dayjs(day).hour(9).minute(0).startOf('minute') : dayjs(day).startOf('day').add(minute, 'minute')
  const busy = useRef(false)
  // Kept as the panel goes (clicked away from, ⌘↵): made, said in the notice, not shown here.
  held.current = text.trim() ? () => save(false) : null
  const save = async (stay = true): Promise<void> => {
    const words = text.trim()
    if (!words) return chime('nope')
    if (busy.current) return
    busy.current = true
    const made = await makeTask({ text: words }, 'Added', { quiet: true })
    busy.current = false
    if (!made) return
    const got = (await haligtree.tasks()).find((one) => one.id === made.id)
    // The same task is already on the list: it stays on its own day unless asked to move here, and opens.
    if (made.existed && got) return (sameTask(got, { due: at.toISOString(), allDay: minute === null ? 1 : 0 }), onMade(made.id, null))
    // Words that named a day of their own ("call mum friday") keep it; otherwise it is for this day.
    // Only a time ("call the dentist 10am"): at that time on this day.
    const alone = !!got?.dueAt && timeAlone(words)
    const own = !!got?.dueAt && !alone
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
    <form data-day-side-draft className={pop ? 'flex flex-col px-3 pt-2.5 pb-3' : 'mf-more flex min-h-0 flex-1 flex-col overflow-y-auto pt-4 pb-4'} onSubmit={(event) => (event.preventDefault(), void save())}>
      {!pop && <h2 className="page-narrow mx-auto mb-3 w-full px-4 @[40rem]/page:px-12 font-heading text-title font-semibold tracking-[-0.018em] text-foreground">New task</h2>}
      <div className={pop ? 'flex w-full flex-col gap-2.5' : 'page-narrow mx-auto flex w-full flex-col gap-3 px-4 @[40rem]/page:px-12'}>
        <div className="flex min-h-10 items-center gap-2 rounded-lg border pr-1 pl-3 text-body focus-within:border-foreground/25">
          <TaskInput inputRef={field} value={text} onChange={setText} label={`A new task for ${dayjs(day).format('dddd D MMMM')}`}
            placeholder="Call the dentist 10am #home !!" />
          <Button type="submit" size="sm" data-day-side-add aria-label="Add">{!pop && 'Add '}<Kbd>↵</Kbd></Button>
        </div>
        {/* Where it lands, plain to read, before it is made. */}
        <p data-day-side-when className="text-body text-foreground">
          For <strong className="font-semibold">{at.format('dddd D MMMM')}</strong>{minute !== null && <> at <strong className="font-semibold">{clock(at)}</strong></>}{length ? <>, for <strong className="font-semibold">{lasting(length)}</strong></> : null}.
        </p>
        {/* One quiet line: in the panel the task opens here next; in the popover it is made and the popover goes, so the line says what the words can hold. */}
        <p data-day-side-hint className={`text-control text-muted-foreground ${pop ? '[@media(max-height:520px)]:hidden' : ''}`}>{pop ? 'Read from the words: a day or a time, #tags, and !! for priority.' : 'Notes, steps and tags come next, on the task.'}</p>
      </div>
    </form>
  )
}
