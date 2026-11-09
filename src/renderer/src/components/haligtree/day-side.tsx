import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { byKeys, still } from '@/lib/motion'
import { createPortal } from 'react-dom'
import { AnimatePresence, animate, motion } from 'motion/react'
import { Plus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { chime } from '@/lib/sound'
import { atOn, makeTask, timeAlone } from '@/lib/tasks'
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

/**
 * Where a floating panel sits in its row, and the point it grows from and goes back to (the slot, the event, the button).
 * Under or over its slot (a row too narrow to have it beside), `edge` is the slot's edge it keeps clear of, `down` says
 * which side, and `room` is the most it may be tall there.
 */
type Spot = { left: number; top: number; w: number; h: number; ox: number; oy: number; edge?: number; down?: boolean; room?: number }
const GAP = 8
/** The panel shut to its point: a clip, never a fade, so the frost never shows a dark wash on its way in (taste.md, 8 Nov). */
const shutAt = (at: Spot): string => `inset(${at.oy}px ${at.w - at.ox}px ${at.h - at.oy}px ${at.ox}px round 12px)`
const OPEN_CLIP = 'inset(0px 0px 0px 0px round 12px)'
const clamp = (n: number, lo: number, hi: number): number => Math.min(Math.max(lo, n), Math.max(lo, hi))

/**
 * Beside what it came from, inside its row: to the right of it where it fits, else to its left, level with its top,
 * held inside the row. A row too narrow for either (a 560px window) has it under the slot where it fits, else over it,
 * else on the side with more room and no taller than that, so it never covers the slot it is about. The point it grows
 * from is the near edge.
 */
function placeBeside(panel: HTMLElement, from: DOMRect | null): Spot | null {
  const row = (panel.offsetParent as HTMLElement | null)?.getBoundingClientRect()
  if (!row) return null
  const [w, h] = [panel.offsetWidth, panel.offsetHeight]
  const at = from ?? new DOMRect(row.right - GAP, row.top, 0, 0)
  const [l, r, t, b] = [at.left - row.left, at.right - row.left, at.top - row.top, at.bottom - row.top]
  const side = r + GAP + w <= row.width - GAP ? r + GAP : l - GAP - w >= GAP ? l - GAP - w : null
  if (side !== null) {
    const top = clamp(t, GAP, row.height - h - GAP)
    return { left: side, top, w, h, ox: clamp((l + r) / 2 - side, 0, w), oy: clamp(t + Math.min(at.height, 40) / 2 - top, 0, h) }
  }
  const [below, above] = [row.height - GAP - Math.max(GAP, b + GAP), t - 2 * GAP]
  const down = below >= h || below >= above
  const room = Math.max(0, down ? below : above)
  const tall = Math.min(h, room)
  const left = clamp((l + r) / 2 - w / 2, GAP, row.width - w - GAP)
  const top = down ? Math.max(GAP, b + GAP) : t - GAP - tall
  return { left, top, w, h: tall, ox: clamp((l + r) / 2 - left, 0, w), oy: down ? 0 : tall, edge: down ? b : t, down, room }
}

/**
 * The calendar's side panel, the way Notion Calendar and Google Calendar
 * keep theirs: a frosted panel (FLOAT) floating over the right of the page,
 * sliding in from the right and back out the same way, so what is under it
 * never moves. On the Calendar page it floats over the days' right edge,
 * inside the page's own row (`inline`); on Home's month and the week board,
 * over the right of the window. For a day or a slot it asks
 * for the task's words first; ↵ adds it on that day and time, and the panel
 * turns into the task itself, the same task page as everywhere else (notes,
 * steps, tags, date, length, priority and the rest). "New task" or ⌘N starts
 * the next one, ⌘Z takes back the one just made, Esc closes it. A chip opens
 * its task in the same panel. The same panel on the month, the week board
 * and the Calendar page.
 */
export function DaySide({ ask, onClose, onOpen, inline = false, width, grip, from }: {
  ask: SideAsk | null
  onClose: () => void
  onOpen?: (type: string, id: string) => void
  /** Over the page's own row (the Calendar's days and Upcoming), placed in it, rather than over the whole window. */
  inline?: boolean
  /** Its width, when the page keeps one (the Calendar's, dragged at its edge with `grip`). */
  width?: string
  grip?: React.ReactNode
  /** Inline: what it was opened from (a slot, an event, a task, the button), to float beside and grow out of. */
  from?: () => DOMRect | null
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
  // Inline, it floats beside what it came from, grows out of it, and goes back into it.
  const [spot, setSpot] = useState<Spot | null>(null)
  const spotNow = useRef<Spot | null>(null)
  useLayoutEffect(() => {
    const el = panel.current
    if (!inline || !el || !ask) return void (spotNow.current = null)
    const first = !spotNow.current
    // Fresh, beside what it was opened from; grown or shrunk after (a new task turning into the task), it keeps its place inside the row.
    const put = (fresh: boolean): void => {
      const was = fresh ? null : spotNow.current
      if (!was) el.style.removeProperty('max-height')
      const next = placeBeside(el, was ? null : from?.() ?? null)
      if (!next) return
      const room = (el.offsetParent as HTMLElement).clientHeight
      const h = el.offsetHeight
      // Grown or shrunk under or over its slot, it keeps clear of the slot's edge; beside it, it stays inside the row.
      const top = !was ? next.top : was.edge === undefined ? Math.max(GAP, Math.min(was.top, room - h - GAP)) : was.down ? was.top : Math.max(GAP, was.edge - GAP - h)
      const at = was ? { ...was, top, w: next.w, h, ox: Math.min(was.ox, next.w), oy: was.edge !== undefined && !was.down ? h : Math.min(was.oy, h) } : next
      spotNow.current = at
      el.style.left = `${at.left}px`
      el.style.top = `${at.top}px`
      if (!was && at.room !== undefined) el.style.maxHeight = `${at.room}px`
      setSpot(at)
    }
    put(true)
    if (first && !byKeys() && !still()) void animate(el, { clipPath: [shutAt(spotNow.current!), OPEN_CLIP], scale: [0.96, 1] }, { type: 'spring', stiffness: 520, damping: 42, mass: 0.9 })
    const watch = new ResizeObserver(() => put(false))
    watch.observe(el)
    return () => watch.disconnect()
  }, [ask, inline]) // eslint-disable-line react-hooks/exhaustive-deps
  // A click anywhere else keeps what was typed and closes it, as Notion Calendar's and Apple's do. Menus and
  // popovers it opened, the toast, and the new slot it is about are part of it.
  useEffect(() => {
    if (!inline || !ask) return
    const away = (event: PointerEvent): void => {
      const at = event.target as Element | null
      if (!at || panel.current?.contains(at) || at.closest('[data-radix-popper-content-wrapper], [role="menu"], [role="dialog"], [data-sonner-toaster], [data-cal-draft], [data-scope-ask]')) return
      keep()
    }
    window.addEventListener('pointerdown', away, true)
    return () => window.removeEventListener('pointerdown', away, true)
  }) // eslint-disable-line react-hooks/exhaustive-deps
  const shell = (
    <AnimatePresence>
      {ask && (
        <motion.div ref={panel} key="day-side" data-day-side={asking ? 'new' : eventKey ? 'event' : 'task'} role="dialog" data-beside aria-label={asking ? (kind === 'event' ? 'A new event' : 'A new task') : eventKey ? 'The event' : 'The task'} tabIndex={-1}
          // Slid, never faded: a frosted surface fading in shows a dark wash before its blur (taste.md, 8 Nov).
          // Inline, it grows out of its slot by a clip instead (the layout effect above) and goes back into it the same way.
          initial={inline || byKeys() || still() ? false : OFF} animate={inline ? undefined : { transform: 'translateX(0%)' }}
          exit={byKeys() || still() ? { opacity: 0, transition: { duration: 0 } } : inline && spot ? { clipPath: shutAt(spot), scale: 0.96, transition: { duration: 0.16, ease: [0.4, 0, 1, 1] } } : { ...OFF, transition: { duration: 0.2, ease: [0.4, 0, 1, 1] } }}
          transition={{ duration: 0.3, ease: [0.32, 0.72, 0, 1] }}
          style={{ ...(width ? { width } : {}), ...(inline && spot ? { transformOrigin: `${spot.ox}px ${spot.oy}px` } : {}) }}
          onKeyDown={(event) => {
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
          className={`${inline ? `absolute z-30 max-h-[calc(100%-1rem)] w-[26rem] max-w-[calc(100%-1rem)] ${spot ? '' : 'invisible'}` : 'fixed top-12 right-3 bottom-3 z-40 w-[30rem] max-w-[calc(100vw-1.5rem)]'} flex flex-col rounded-xl outline-none ${FLOAT}`}>
          {!inline && grip}
          {/* The words clipped to the corners; the grip, on the edge, is not. */}
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl">
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
            ? <NewEvent key={`${asking.day}-${asking.minute}`} ask={asking} held={held} onMade={setMadeEvent} />
            : asking
            ? <NewTask key={`${asking.day}-${asking.minute}`} ask={asking} held={held} first={again} onMade={(id, undo) => setMade({ id, undo })} onBack={back} />
            : eventKey
            ? <div className="@container/page flex min-h-0 flex-1 flex-col overflow-y-auto"><EventDetail key={eventKey} eventKey={eventKey} onKey={setMadeEvent} onClose={onClose} onOpen={onOpen} /></div>
            : <div className="@container/page flex min-h-0 flex-1 flex-col overflow-y-auto">{full && <TaskDetail key={full.id} task={full} onClose={onClose} onOpen={onOpen} />}</div>}
          </div>
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
function NewTask({ ask, first, held, onMade, onBack }: {
  ask: Extract<SideAsk, { day: string }>
  /** Set to its save while it holds words: the panel keeps them when clicked away from. */
  held: React.MutableRefObject<(() => Promise<void>) | null>
  first: string
  /** Made (or found already there): the panel shows it. `undo` takes it back, and the line comes back with its words. */
  onMade: (id: string, undo: (() => void) | null) => void
  onBack: (id: string, words: string) => void
}): React.JSX.Element {
  const [text, setText] = useState(first)
  const field = useRef<HTMLInputElement>(null)
  useEffect(() => (requestAnimationFrame(() => field.current?.focus()), () => void (held.current = null)), []) // eslint-disable-line react-hooks/exhaustive-deps
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
    <form data-day-side-draft className="mf-more flex min-h-0 flex-1 flex-col overflow-y-auto pt-4 pb-4" onSubmit={(event) => (event.preventDefault(), void save())}>
      <h2 className="page-narrow mx-auto mb-3 w-full px-4 @[40rem]/page:px-12 font-heading text-title font-semibold tracking-[-0.018em] text-foreground">New task</h2>
      <div className="page-narrow mx-auto flex w-full flex-col gap-3 px-4 @[40rem]/page:px-12">
        <div className="flex min-h-10 items-center gap-2 rounded-lg border pr-1 pl-3 text-body focus-within:ring-1 focus-within:ring-ring">
          <TaskInput inputRef={field} value={text} onChange={setText} label={`A new task for ${dayjs(day).format('dddd D MMMM')}`}
            placeholder="Call the dentist 10am #home !!" />
          <Button type="submit" size="sm" data-day-side-add>Add <Kbd>↵</Kbd></Button>
        </div>
        {/* Where it lands, plain to read, before it is made. */}
        <p data-day-side-when className="text-body text-foreground">
          For <strong className="font-semibold">{at.format('dddd D MMMM')}</strong>{minute !== null && <> at <strong className="font-semibold">{clock(at)}</strong></>}{length ? <>, for <strong className="font-semibold">{lasting(length)}</strong></> : null}.
        </p>
        {/* One quiet line, as New event's: the rest is set on the task once it opens here. */}
        <p data-day-side-hint className="text-control text-muted-foreground">Notes, steps and tags come next, on the task.</p>
      </div>
    </form>
  )
}
