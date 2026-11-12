import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react'
import { animate, motion, useMotionValue, type MotionValue } from 'motion/react'
import { CalendarPlus, SquareCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PopoverAnchor, PopoverArrow, PopoverContent } from '@/components/ui/popover'
import { chime } from '@/lib/sound'
import { byKeys, spring, still } from '@/lib/motion'
import { taskName } from '@/lib/tasks'
import type { Task } from '@/lib/haligtree'
import { quoted } from '../../../../main/clip'
import { dayjs, dayKey } from '../../../../main/dates'
import { EventRows, NewEvent, tint, type Shown } from './calendar-events'
import { KindSwitch, NewTask } from './day-side'
import { TaskRows } from './tasks-view'
import { refuse, stage, toast } from './ui'
import type { RowItem } from './row-menu'

/**
 * What is being made on the Calendar, where it will be: a day, or a time on
 * it for a length, as an event or a task. `words` are the ones it opens
 * holding (an Undo brings them back); `calendar` the one picked for an event.
 */
export type Add = { day: string; minute: number | null; length: number; kind: 'event' | 'task'; words?: string; calendar?: string | null }

/** Kept clear of the window's edges, and of the traffic lights (DESIGN.md, The Room to Breathe Rule). */
const ROOM = { top: 52, right: 12, bottom: 12, left: 12 }
/** One width, for an event and for a task. */
const WIDE = 320
type Side = 'right' | 'left' | 'bottom' | 'top'
/** Beside the draft where there is room for it, on the right first; with none on either side, under it, or over it: never on top of it. */
const sideFor = (at: DOMRect): Side => {
  const need = WIDE + 7 + 6 + ROOM.right
  if (window.innerWidth - at.right >= need) return 'right'
  if (at.left >= need) return 'left'
  return window.innerHeight - at.bottom >= at.top - ROOM.top ? 'bottom' : 'top'
}

/**
 * A day's (or a time's) own right-click lines, the same two wherever a thing can be added to a day: the Calendar's
 * month, its hours and its all-day lane, Home's month and the Journal's.
 */
export const addLines = (open: (to: Add) => void, day: string, minute: number | null, taskLength = 30): RowItem[] => [
  { label: 'New event here', icon: <CalendarPlus />, run: () => open({ day, minute, length: minute === null ? 0 : 60, kind: 'event' }) },
  { label: 'New task here', icon: <SquareCheck />, run: () => open({ day, minute, length: minute === null ? 0 : taskLength, kind: 'task' }) }
]

// The draft's words as they are typed, for the draft on the grid alone: the page itself is not drawn again for a letter.
let said = ''
const heard = new Set<() => void>()
const say = (next: string): void => { if (next !== said) (said = next), heard.forEach((run) => run()) }
const useSaid = (): string => useSyncExternalStore((run) => (heard.add(run), () => void heard.delete(run)), () => said)

const TASK_INK = 'var(--tt-brand-color-400)'

/**
 * The thing being made, drawn where it will be before it is: an event a soft
 * fill in its calendar's colour, a task an outline with its round tick (the two
 * marks the grid already has for them), ringed as the one picked is, with the
 * words as they are typed. A line in a month's day, a chip in the all-day
 * lane, a block at its hours. The popover is tied to it.
 */
export function DraftMark({ kind, color, shape, time, style, ref }: {
  kind: 'event' | 'task'; color: string; shape: 'line' | 'chip' | 'block'
  /** A block's hours, under its name. */
  time?: string
  style?: React.CSSProperties
  ref?: React.Ref<HTMLDivElement>
}): React.JSX.Element {
  const words = useSaid()
  const look: React.CSSProperties = kind === 'event' ? tint(color) : { background: 'var(--background)', border: `1.5px solid color-mix(in oklab, ${TASK_INK} 75%, transparent)`, color: 'var(--foreground)' }
  const box = shape === 'block' ? 'absolute inset-x-1 z-20 flex-col rounded-[6px] px-1.5 pt-[3px]' : shape === 'chip' ? 'h-6 items-center gap-1 rounded-[5px] px-1.5' : 'mt-0.5 h-[calc(1.25rem-2px)] shrink-0 items-center gap-1 rounded-[5px] px-1.5'
  return (
    <div ref={ref} data-cal-draft={kind} className={`flex min-w-0 overflow-hidden text-left text-control leading-snug ${box}`} style={{ ...look, outline: '2px solid var(--ring)', outlineOffset: shape === 'block' ? 1 : -2, ...style }}>
      <span className="flex min-w-0 items-center gap-1">
        {kind === 'task' && <span aria-hidden className="size-3 shrink-0 rounded-full border-[1.5px]" style={{ borderColor: TASK_INK }} />}
        <span dir="auto" data-cal-draft-name className="truncate font-semibold">{words || (kind === 'event' ? 'New event' : 'New task')}</span>
      </span>
      {shape === 'block' && time && <span className="truncate text-meta tabular-nums opacity-80">{time}</span>}
    </div>
  )
}

/**
 * A box that takes its height from what it holds, and moves to a new one on the app's spring (at once with Motion off
 * or Reduce motion, and when a key made the change). The height is held here, in a value of the box's own, from its first measure. Left to Motion's
 * `animate` with `initial={false}`, the first height (known only a render after the box is made) was taken as the place
 * the box already was: noted, never written to it. So the box held no height, grew at once with what it holds, and the
 * first change of every popover (Event to Task, a row opening) had nothing left to move; only the second sprang.
 */
function Sized({ children }: { children: React.ReactNode }): React.JSX.Element {
  const inner = useRef<HTMLDivElement>(null)
  const height = useMotionValue<number | string>('auto')
  useLayoutEffect(() => {
    const el = inner.current
    if (!el) return
    let going: { stop: () => void } | null = null
    // Read as what it holds is laid out anew (a ResizeObserver runs once layout is done, so the read costs nothing).
    const fit = (): void => {
      const to = Math.ceil(el.getBoundingClientRect().height)
      const from = height.get()
      going?.stop()
      going = null
      // Its first height, or nothing may travel, or a key did it (words typed in the line change what is read back
      // under it at every letter; reached by a key, nothing moves): simply that tall.
      if (typeof from !== 'number' || still() || byKeys()) return height.set(to)
      if (from !== to) going = animate(height as MotionValue<number>, to, spring.slow)
    }
    fit()
    const watch = new ResizeObserver(fit)
    watch.observe(el)
    return () => (watch.disconnect(), going?.stop())
  }, [height])
  return (
    <motion.div data-cal-add-sized style={{ height }} className="mf-more min-h-0 shrink overflow-x-hidden overflow-y-auto [scrollbar-width:none]">
      <div ref={inner}>{children}</div>
    </motion.div>
  )
}

/**
 * The popover itself, the one a new event or task is written in and the one an
 * event or a task opens in: one width, its top row (which never moves), then
 * the line and what is under it, as tall as they are; tied by its point to what
 * it is about, beside it and never over it.
 */
function Shell({ kind, label, side, opened, head, children, onEscape, onKeep, onOutside }: {
  kind: 'event' | 'task'; label: string; side: Side
  /** The event's key or the task's id, when it is open on one that exists. */
  opened?: string
  head: React.ReactNode
  children: React.ReactNode
  onEscape: () => void
  /** ⌘↵: kept (or made), and closed. */
  onKeep: () => void
  onOutside: () => void
}): React.JSX.Element {
  const beside = side === 'right' || side === 'left'
  // While it is up, no tip comes up beside or over it from the page (ui.tsx, `stage`): one floating thing at a time.
  useEffect(() => stage(), [])
  return (
    <PopoverContent data-cal-add={kind} data-cal-open={opened} data-takes-keys role="dialog" aria-label={label}
      // Open on a thing that exists, it is beside the page as its side panel is (ui.tsx, `typing`): a change made in its rows
      // is taken back by ⌘Z while it is still open, and a plain key typed in it stays in it. A new one being written
      // holds every key, as before.
      data-beside={opened ? '' : undefined}
      // A field in it that lets go of the keys (↵ in the place, a tag kept) hands them to the popover itself, never to the
      // page under it: there, the next ↵ started a new event on the day picked.
      onBlurCapture={(event) => void (opened && !event.relatedTarget && event.currentTarget.focus({ preventScroll: true }))} side={side} align={beside ? 'start' : 'center'} alignOffset={beside ? -14 : 0} sideOffset={6} arrowPadding={14} collisionPadding={ROOM}
      style={{ width: WIDE }} className="max-w-[calc(100vw-1.5rem)] gap-0 overflow-visible rounded-xl p-0 text-control"
      onOpenAutoFocus={(event) => event.preventDefault()}
      // Esc in a "which times" asked over it answers the ask alone: the popover stays, with its words.
      onEscapeKeyDown={(event) => (event.preventDefault(), !document.querySelector('[data-scope-ask]') && onEscape())}
      // ⌘↵ keeps it too, as ↵ does (the key the side panel kept for "keep and close").
      onKeyDown={(event) => {
        if (event.key !== 'Enter' || !event.metaKey || event.shiftKey || event.altKey || event.ctrlKey) return
        event.preventDefault()
        event.stopPropagation()
        onKeep()
      }}
      onFocusOutside={(event) => event.preventDefault()}
      onPointerDownOutside={(event) => {
        event.preventDefault()
        // The draft is part of it, and so are a notice (its Undo is the notice's own act, not a click away), any menu over it and a "which times" asked.
        if ((event.target as Element | null)?.closest?.('[data-cal-draft], [role="status"], [role="menu"], [data-scope-ask], [data-radix-popper-content-wrapper]')) return
        onOutside()
      }}>
      {/* On the one left edge the line and the reading under it keep. */}
      <div className="flex shrink-0 items-center px-3 pt-3">{head}</div>
      <Sized>{children}</Sized>
      <PopoverArrow />
    </PopoverContent>
  )
}

/**
 * The popover a new event or task is written in, tied by its point to the
 * draft on the grid, as Calendar on the Mac ties its own: "Event | Task" at
 * the top (it never moves), then the one line to type in with what it
 * understood read back under it, at one width for both; the height follows
 * what it holds. ↵ makes it. Esc takes the draft away (with words typed, a
 * notice whose Undo brings them back); a click anywhere else makes it when
 * there are words, and takes the draft away when there are none.
 */
export function AddPopover({ add, level, onChange, onClose, onAgain }: {
  add: Add
  /** The level of the Calendar in front, where the draft is drawn. */
  level: React.RefObject<HTMLElement | null>
  onChange: (patch: Partial<Add>) => void
  onClose: () => void
  /** The same draft again, holding its words: what an Undo asks for. */
  onAgain: (add: Add) => void
}): React.JSX.Element {
  const words = useState(add.words ?? '')
  const [text] = words
  useEffect(() => () => say(''), [])
  const held = useRef<(() => Promise<void>) | null>(null)
  // Where it goes, read once as it opens, from the draft it is tied to; a day with no room to draw its draft (a narrow
  // month's dots) ties it to the day itself.
  const [side, setSide] = useState<Side>('right')
  const [bare, setBare] = useState<HTMLElement | null>(null)
  useLayoutEffect(() => {
    const draft = level.current?.querySelector<HTMLElement>('[data-cal-draft]')
    const at = draft ?? level.current?.querySelector<HTMLElement>(`[data-day="${add.day}"], [data-cal-col="${add.day}"]`) ?? null
    setBare(draft ? null : at)
    if (!at) return
    at.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    setSide(sideFor(at.getBoundingClientRect()))
  }, [add.day, add.minute, level])
  const away = (): void => {
    const typed = text.trim()
    chime('away')
    onClose()
    if (typed) toast(`Not added: ${quoted(typed, 60)}`, () => onAgain({ ...add, words: typed }), 'info')
  }
  const outside = (): void => {
    const save = held.current
    held.current = null
    if (save) void save()
    else chime('away')
    onClose()
  }
  const keep = (): void => {
    const save = held.current
    // With nothing typed it says why not.
    if (!save) return refuse(add.kind === 'event' ? 'Nothing to add yet: type a name for the event' : 'Nothing to add yet: type the task')
    held.current = null
    void save()
    onClose()
  }
  return (
    <>
      {bare && <PopoverAnchor virtualRef={{ current: bare }} />}
      <Shell kind={add.kind} label={add.kind === 'event' ? 'A new event' : 'A new task'} side={side} onEscape={away} onKeep={keep} onOutside={outside}
        head={<KindSwitch kind={add.kind} onKind={(kind) => onChange({ kind })} />}>
        {add.kind === 'event'
          ? <NewEvent ask={add} held={held} words={words} picked={[add.calendar ?? null, (calendar) => onChange({ calendar })]} onMade={onClose} onName={say} />
          : <NewTask ask={add} held={held} words={words} first="" onMade={onClose} onBack={(_id, typed) => onAgain({ ...add, words: typed })} onName={say} />}
      </Shell>
    </>
  )
}

/** An event or a task that is open in the popover, and the thing on the page it was opened from (a block, a chip, a row). */
export type Opened = ({ kind: 'event'; key: string } | { kind: 'task'; id: string }) & {
  at: HTMLElement | null
  /** The words its line opens holding, when they are not its name: a name typed and not kept, brought back by a notice's Undo. */
  words?: string
}

/**
 * The same popover, open on an event or a task that exists: tied to it where
 * it is on the page, its name in the line (typed over and read as a new one's
 * words are: "fri 1pm" moves it), where it is read back under it, and “Open”
 * for its whole page. Each change is kept as it is made and said with Undo.
 * ↵ keeps the line and closes; so does a click anywhere else; Esc closes and
 * leaves the name as it was, and with a name typed and not kept a notice says
 * so, whose Undo brings the popover back holding the words, as a new one's does.
 */
export function OpenPopover({ opened, event, task, level, onClose, onPage, onKey, onAgain }: {
  opened: Opened
  /** The event, as the page has it now. */
  event?: Shown
  task?: Task
  /** Where its block or chip is looked for when the thing it was opened from is gone (it moved to another day). */
  level: React.RefObject<HTMLElement | null>
  onClose: () => void
  /** Its whole page (the side panel). */
  onPage: () => void
  /** A change made it another one (one time of a repeating event, cut loose): the popover follows it. */
  onKey: (key: string) => void
  /** Open on it again, its line holding these words: what the Undo of "Not kept" asks for. */
  onAgain: (words: string) => void
}): React.JSX.Element | null {
  const held = useRef<(() => Promise<void>) | null>(null)
  // Its name as its line shows it (a task's without its #tags), and the words in the line, kept here so Esc knows them.
  const name = event ? event.title : task ? taskName(task.title).text : ''
  const words = useState(opened.words ?? name)
  const id = opened.kind === 'event' ? opened.key : opened.id
  const day = event ? dayKey(event.start) : task?.dueAt ? dayKey(task.dueAt) : null
  // What it is tied to: the thing it was opened from while that is on the page; then its block or chip on the level in
  // front (after "fri 1pm" moved it); with neither drawn (a crowded day's "+3 more"), its day.
  const [at, setAt] = useState<HTMLElement | null>(null)
  const [side, setSide] = useState<Side>('right')
  const looked = useRef(false)
  useLayoutEffect(() => {
    const mark = CSS.escape(id)
    const found = opened.at?.isConnected ? opened.at
      : level.current?.querySelector<HTMLElement>(opened.kind === 'event' ? `[data-cal-event="${mark}"], [data-cal-event-chip="${mark}"]` : `[data-cal-block="${mark}"], [data-cal-untimed="${mark}"], [data-plan-task="${mark}"]`)
        ?? (day ? level.current?.querySelector<HTMLElement>(`[data-day="${day}"], [data-cal-col="${day}"]`) : null) ?? null
    // Nowhere on the page to tie it to (a crowded day's "+3 more", a month too narrow to name its things): its page
    // instead, never a click that does nothing. Gone from the page later (binned, moved out of sight): closed.
    if (!found) (looked.current ? onClose : onPage)()
    looked.current = true
    setAt((was) => (was === found ? was : found))
  })
  useLayoutEffect(() => {
    if (!at) return
    at.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    setSide(sideFor(at.getBoundingClientRect()))
  }, [at])
  if (!at || !(event || task)) return null
  const close = (): void => {
    const typed = words[0].trim()
    chime('away')
    onClose()
    // A name typed and not kept: said, with the way back to it.
    if (typed && typed !== name.trim() && !event?.readOnly) toast(`Not kept: ${quoted(typed, 60)}`, () => onAgain(typed), 'info')
  }
  const keep = (): void => {
    // A field of its rows being written in (the place) is kept as it lets go of the keys, as on its page.
    const active = document.activeElement as HTMLElement | null
    if (active?.closest('[data-event-rows], [data-task-rows]')) active.blur()
    const save = held.current
    held.current = null
    if (save) void save()
    onClose()
  }
  const kind = opened.kind
  const mark = event
    ? <span aria-hidden className="size-3 shrink-0 rounded-[4px]" style={{ background: event.color }} />
    : <span aria-hidden className="size-3 shrink-0 rounded-full border-[1.5px]" style={{ borderColor: TASK_INK }} />
  const slot = event
    ? { day: dayKey(event.start), minute: event.allDay ? null : dayjs(event.start).hour() * 60 + dayjs(event.start).minute(), length: Math.max(15, dayjs(event.end).diff(dayjs(event.start), 'minute')) }
    : { day: day ?? dayKey(), minute: !task!.dueAt || task!.allDay ? null : dayjs(task!.dueAt).hour() * 60 + dayjs(task!.dueAt).minute(), length: task!.estimate ?? 0 }
  return (
    <>
      <PopoverAnchor virtualRef={{ current: at }} />
      <Shell kind={kind} opened={id} label={kind === 'event' ? 'The event' : 'The task'} side={side} onEscape={close} onKeep={keep} onOutside={keep}
        head={
          <div className="flex h-8 min-w-0 flex-1 items-center gap-2 pl-0.5">
            {mark}
            {/* One of your Mac's says whose it is and that it is read only, where the others say what they are. */}
            <span data-cal-open-kind className="min-w-0 flex-1 truncate text-control font-medium text-foreground">{event?.readOnly ? `${event.calendarId.replace(/^mac:/, '')}, read only` : kind === 'event' ? 'Event' : 'Task'}</span>
            {/* No tip on it: nothing floats over the popover, and its word says what it does. */}
            {!event?.readOnly && <Button type="button" variant="ghost" size="sm" data-cal-open-page aria-label={kind === 'event' ? 'Open the event’s page' : 'Open the task’s page'} className="-mr-1.5" onClick={onPage}>Open</Button>}
          </div>
        }>
        {event
          ? <>
              <NewEvent key={event.key} one={event} ask={slot} held={held} words={words} onMade={(key) => (key !== event.key ? onKey(key) : undefined, onClose())} />
              {!event.readOnly && <EventRows one={event} onKey={onKey} />}
            </>
          : <>
              <NewTask key={task!.id} task={task} ask={slot} held={held} words={words} first="" onMade={onClose} onBack={() => undefined} />
              <TaskRows task={task!} />
            </>}
      </Shell>
    </>
  )
}
