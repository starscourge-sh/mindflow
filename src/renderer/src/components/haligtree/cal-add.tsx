import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react'
import { motion } from 'motion/react'
import { PopoverAnchor, PopoverArrow, PopoverContent } from '@/components/ui/popover'
import { chime } from '@/lib/sound'
import { spring, still } from '@/lib/motion'
import { quoted } from '../../../../main/clip'
import { NewEvent, tint } from './calendar-events'
import { KindSwitch, NewTask } from './day-side'
import { toast } from './ui'

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

/** A box that takes its height from what it holds, and moves to a new one on the app's spring (at once with Motion off or Reduce motion). */
function Sized({ children }: { children: React.ReactNode }): React.JSX.Element {
  const inner = useRef<HTMLDivElement>(null)
  const [height, setHeight] = useState<number | null>(null)
  useLayoutEffect(() => {
    const el = inner.current
    if (!el) return
    setHeight(el.offsetHeight)
    const watch = new ResizeObserver(() => setHeight(el.offsetHeight))
    watch.observe(el)
    return () => watch.disconnect()
  }, [])
  return (
    <motion.div data-cal-add-sized initial={false} animate={height === null ? undefined : { height }} transition={still() ? { duration: 0 } : spring.slow} className="min-h-0 shrink overflow-x-hidden overflow-y-auto [scrollbar-width:none]">
      <div ref={inner}>{children}</div>
    </motion.div>
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
  const beside = side === 'right' || side === 'left'
  return (
    <>
      {bare && <PopoverAnchor virtualRef={{ current: bare }} />}
      <PopoverContent data-cal-add={add.kind} data-takes-keys role="dialog" aria-label={add.kind === 'event' ? 'A new event' : 'A new task'} side={side} align={beside ? 'start' : 'center'} alignOffset={beside ? -14 : 0} sideOffset={6} arrowPadding={14} collisionPadding={ROOM}
        style={{ width: WIDE }} className="max-w-[calc(100vw-1.5rem)] gap-0 overflow-visible rounded-xl p-0 text-control"
        onOpenAutoFocus={(event) => event.preventDefault()}
        onEscapeKeyDown={(event) => (event.preventDefault(), away())}
        onFocusOutside={(event) => event.preventDefault()}
        onPointerDownOutside={(event) => {
          event.preventDefault()
          // The draft is part of it, and so are the notices and any menu over it.
          if ((event.target as Element | null)?.closest?.('[data-cal-draft], [data-sonner-toaster], [role="menu"]')) return
          outside()
        }}>
        {/* On the one left edge the line and the reading under it keep. */}
        <div className="flex shrink-0 items-center px-3 pt-3">
          <KindSwitch kind={add.kind} onKind={(kind) => onChange({ kind })} />
        </div>
        <Sized>
          {add.kind === 'event'
            ? <NewEvent pop ask={add} held={held} words={words} picked={[add.calendar ?? null, (calendar) => onChange({ calendar })]} onMade={onClose} onName={say} />
            : <NewTask pop ask={add} held={held} words={words} first="" onMade={onClose} onBack={(_id, typed) => onAgain({ ...add, words: typed })} onName={say} />}
        </Sized>
        <PopoverArrow />
      </PopoverContent>
    </>
  )
}
