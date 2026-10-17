import { useEffect, useRef, useState } from 'react'
import { DndContext, PointerSensor, pointerWithin, useDraggable, useDroppable, useSensor, useSensors } from '@dnd-kit/core'
import { Switch } from '@/components/ui/switch'
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover'
import { Timer as CalendarClock, Bookmark as Telescope } from '@/components/ui/icons'
import { Tip } from '@/components/vigil/ui'
import { Overlay, SETTLE } from './sortable'
import { DayFlags } from './milestones'
import { chime } from '@/lib/sound'
import { taskName } from '@/lib/tasks'
import { loud } from '@/lib/loud'
import { onDay as marksOn, useMilestones } from '@/lib/milestones'
import { byDay, moveToDay, caughtLevel, useCaptureMarks, type Back, type OnDay } from '@/lib/calendar'
import { DayDots, DotsKey, openedLevel } from './day-dots'
import { DaySide, type SideAsk } from './day-side'
import { useLive, vigil, type Settings, type Stats, type Task } from '@/lib/vigil'
import { dayjs, dayKey, type Dayjs } from '../../../../main/dates'

/** A day's line, one row high, and the room its date takes above them. */
const LINE = 20
const HEAD = 30


/** The week's number, as calendars count it: the week that holds the year's first Thursday is week 1. */
const weekNumber = (monday: Dayjs): number => {
  const thursday = monday.add(3, 'day')
  return Math.floor(thursday.diff(thursday.startOf('year'), 'day') / 7) + 1
}

/** One line in a day: a task planned, due, to get ready for, or something coming back. */
type Line = { kind: 'planned' | 'due' | 'ready'; task: Task } | { kind: 'back'; one: Back }
const linesOf = (held: OnDay | undefined): Line[] => !held ? [] : [
  ...held.due.map((task): Line => ({ kind: 'due', task })),
  ...held.planned.map((task): Line => ({ kind: 'planned', task })),
  ...held.ready.map((task): Line => ({ kind: 'ready', task })),
  ...held.back.map((one): Line => ({ kind: 'back', one }))
]
const lineKey = (line: Line): string => (line.kind === 'back' ? `back:${line.one.id}` : `${line.kind}:${line.task.id}`)

/**
 * A month on Home, the way a calendar app has it: each day with what is
 * planned for it, due by it (a deadline, with its own mark), to get ready
 * for, and coming back to sight. Click a day for its page, past or to come;
 * drag a task to another day; click a day's empty space or its + to add one.
 * The week numbers open the week's page, the month's name the month's.
 */
export function MonthPlan({ tasks, onDay, onSide, onOpen, onWeek, onMonth, month: held, bare = false }: {
  tasks: Task[]
  /** The month shown, when the page above steps it (the Calendar); left out, it steps itself. */
  month?: Dayjs
  /** No heading line of its own, and the days fill the room there is. */
  bare?: boolean
  onDay: (day: string) => void
  /** The side panel of the page above, when it keeps one (the Calendar); left out, the month keeps its own. */
  onSide?: (ask: SideAsk) => void
  /** Where a link inside a task opened in the panel goes. */
  onOpen?: (type: string, id: string) => void
  onWeek?: (monday: string) => void
  onMonth?: (month: string) => void
}): React.JSX.Element {
  const [own, setMonth] = useState(() => dayjs().startOf('month'))
  const month = held ? held.startOf('month') : own
  const first = month.startOf('week')
  const weeks = Math.ceil((month.endOf('month').diff(first, 'day') + 1) / 7)
  const days = Array.from({ length: weeks * 7 }, (_, index) => first.add(index, 'day'))
  const today = dayKey()
  // The days you opened Vigil, marked beside the date when the switch is on.
  const settings = useLive(vigil.settings, null as Settings | null)
  const stats = useLive(vigil.stats, null as Stats | null)
  const back = useLive(vigil.snoozedBack, [] as Back[])
  const marks = useMilestones(dayKey(days[0]), dayKey(days[days.length - 1]))
  const [shown, setShown] = useState<boolean | null>(null)
  const marking = shown ?? settings?.monthOpened === true
  const toggle = (on: boolean): void => (chime('tap'), setShown(on), void vigil.setSettings({ monthOpened: on }))
  const opens = new Map((stats?.opens ?? []).map((one) => [one.day, one.n]))
  // The other mark: how much was captured each day, and the days with none.
  const [counted, setCounted] = useState<boolean | null>(null)
  const counting = counted ?? settings?.monthCaptures === true
  const caught = useCaptureMarks(dayKey(days[0]), dayKey(days[days.length - 1]), counting)
  const on = byDay(tasks, back)
  const inMonth = days.filter((day) => day.month() === month.month()).reduce((sum, day) => sum + linesOf(on.get(dayKey(day))).length, 0)
  const step = (by: number): void => (chime('tap'), setMonth((now) => now.add(by, 'month')))
  // What the side panel holds (a new task for a day, or a task), and what is being carried.
  const [mine, setMine] = useState<SideAsk | null>(null)
  const side = onSide ?? setMine
  const adding = mine && 'day' in mine ? mine.day : null
  const [carried, setCarried] = useState<Line | null>(null)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))
  const open = (line: Line): void => (chime('open'), line.kind === 'back' ? window.api.openInHome(line.one.type, line.one.id) : side({ task: line.task.id }))
  return (
    <section data-month-plan className={`flex flex-col gap-2 ${bare ? 'min-h-0 flex-1' : ''}`}>
      {!bare && <div className="flex items-center gap-1">
        <h2 className="min-w-0 flex-1 truncate">
          <Tip label="Open the month's page">
            <button type="button" data-month-name onClick={() => (chime('open'), onMonth?.(month.format('YYYY-MM')))}
              className="-mx-1 rounded-md px-1 text-left font-heading text-heading font-semibold tracking-[-0.01em] text-foreground transition-colors hover:bg-accent">
              {month.format('MMMM YYYY')}
            </button>
          </Tip>
        </h2>
        <label className="mr-2 flex cursor-pointer items-center gap-2 text-control text-foreground">
          <Switch data-month-opened-switch checked={marking} onCheckedChange={toggle} aria-label="Show the days I opened Vigil" />
          <span>Show the days I opened Vigil</span>
        </label>
        <label className="mr-2 flex cursor-pointer items-center gap-2 text-control text-foreground">
          <Switch data-month-captures-switch checked={counting} onCheckedChange={(on) => (chime('tap'), setCounted(on), void vigil.setSettings({ monthCaptures: on }))} aria-label="Show what I captured each day" />
          <span>Captures</span>
        </label>
        {!month.isSame(dayjs(), 'month') && <Button variant="ghost" size="sm" onClick={() => (chime('tap'), setMonth(dayjs().startOf('month')))}>This month</Button>}
        <Tip label="The month before"><Button variant="ghost" size="icon-sm" aria-label="The month before" data-month-prev onClick={() => step(-1)}><ChevronLeft /></Button></Tip>
        <Tip label="The month after"><Button variant="ghost" size="icon-sm" aria-label="The month after" data-month-next onClick={() => step(1)}><ChevronRight /></Button></Tip>
      </div>}
      <DndContext sensors={sensors} collisionDetection={pointerWithin}
        onDragStart={({ active }) => (chime('lift'), setCarried((active.data.current as { line: Line }).line))}
        onDragCancel={() => setCarried(null)}
        onDragEnd={({ active, over }) => {
          setCarried(null)
          const line = (active.data.current as { line: Line }).line
          if (!over || line.kind === 'back' || line.kind === 'ready') return chime('stay')
          moveToDay(line.task, String(over.id), line.kind)
        }}>
      <div className={`grid grid-cols-[2rem_repeat(7,minmax(0,1fr))] gap-px overflow-hidden rounded-xl border bg-border ${bare ? 'min-h-0 flex-1' : ''}`}
        style={bare ? { gridTemplateRows: `auto repeat(${weeks}, minmax(0, 1fr))` } : undefined}>
        <div className="bg-background px-1 py-1 text-center text-control font-medium text-muted-foreground" aria-hidden>Wk</div>
        {days.slice(0, 7).map((day) => (
          <div key={day.format('d')} className={`bg-background px-2 py-1 text-control font-medium ${day.day() === 0 || day.day() === 6 ? 'text-muted-foreground' : 'text-foreground/85'}`}>{day.format('ddd')}</div>
        ))}
        {days.map((day, at) => {
          const key = dayKey(day)
          const lines = linesOf(on.get(key))
          const count = marking ? (opens.get(key) ?? 0) : 0
          return [
            at % 7 === 0 && (
              <Tip key={`week-${key}`} label={`Open the week's page for week ${weekNumber(day)}`}>
                <button type="button" data-week-number={key} onClick={() => (chime('open'), onWeek?.(key))} aria-label={`Open week ${weekNumber(day)}`}
                  className="flex justify-center bg-background pt-1.5 text-control text-foreground/70 tabular-nums transition-colors hover:bg-accent hover:text-foreground">
                  {weekNumber(day)}
                </button>
              </Tip>
            ),
            <Cell key={key} day={day} lines={lines} today={today} outside={day.month() !== month.month()} count={count} caught={caught.get(key)} flags={marksOn(marks, key)}
              bare={bare} adding={adding === key} onAdd={() => side({ day: key, minute: null, length: 0 })} onDay={onDay} onLine={open} />
          ]
        })}
      </div>
      <Overlay dropAnimation={SETTLE}>
        {carried && carried.kind !== 'back' && <span className="block rounded-sm bg-popover px-1.5 py-0.5 text-control text-foreground shadow-(--mf-panel-shadow) ring-1 ring-foreground/10">{taskName(carried.task.title).text}</span>}
      </Overlay>
      </DndContext>
      <DotsKey opened={marking} captures={counting} />
      {!onSide && <DaySide ask={mine} onClose={() => setMine(null)} onOpen={onOpen} />}
      {!inMonth && <p data-month-empty className="px-1 text-body text-foreground/85">Nothing planned in {month.format('MMMM')}. Give a task a day, like “call the dentist friday”, or click a day to add one.</p>}
    </section>
  )
}

function Cell({ day, lines, today, outside, count, caught, flags, adding, onAdd, onDay, onLine, bare }: {
  day: Dayjs
  bare: boolean
  lines: Line[]
  today: string
  outside: boolean
  count: number
  /** Captures that day; 0 a day with none, undefined no mark. */
  caught?: number
  flags: ReturnType<typeof marksOn>
  adding: boolean
  onAdd: () => void
  onDay: (day: string) => void
  onLine: (line: Line) => void
}): React.JSX.Element {
  const key = dayKey(day)
  const { setNodeRef, isOver } = useDroppable({ id: key })
  // As many one-line chips as the day has room for; past that, "+N more".
  const box = useRef<HTMLDivElement | null>(null)
  const [room, setRoom] = useState(3)
  useEffect(() => {
    const el = box.current
    if (!el) return
    const fit = (): void => setRoom(Math.max(1, Math.floor((el.clientHeight - HEAD - (flags.length ? LINE : 0)) / LINE)))
    fit()
    const watch = new ResizeObserver(fit)
    watch.observe(el)
    return () => watch.disconnect()
  }, [flags.length])
  const shown = lines.length > room ? Math.max(0, room - 1) : lines.length
  const weekend = day.day() === 0 || day.day() === 6
  const gone = key < today
  const late = gone && lines.some((line) => line.kind === 'planned' || line.kind === 'due')
  return (
    <div ref={(node) => (setNodeRef(node), void (box.current = node))} data-day={key} data-shown={shown} data-planned={lines.length || undefined} data-opened={count ? openedLevel(count) : undefined} data-captured={caught === undefined ? undefined : caught && caughtLevel(caught)} data-late={late || undefined} data-weekend={weekend || undefined}
      onClick={(event) => event.target === event.currentTarget && (chime('tap'), onAdd())}
      className={`group/day relative flex ${bare ? 'min-h-0' : 'min-h-[max(6.75rem,calc((100vh-22rem)/6))]'} min-w-0 cursor-text flex-col overflow-hidden p-1 transition-colors ${isOver || adding ? 'bg-accent ring-1 ring-foreground/25 ring-inset' : weekend ? 'bg-[color-mix(in_oklab,var(--background)_95%,var(--foreground))]' : 'bg-background'} ${outside ? 'opacity-55' : ''}`}>
      <div className="flex items-center gap-1.5">
        <button type="button" onClick={() => (chime('open'), onDay(key))} aria-label={`Open ${day.format('dddd D MMMM')}${count ? `. Opened Vigil${count > 1 ? ` ${count} times` : ''}` : ''}${caught ? `. ${caught} ${caught === 1 ? 'capture' : 'captures'}` : caught === 0 ? '. Nothing captured' : ''}`}
          aria-current={key === today ? 'date' : undefined}
          className={`flex size-6 shrink-0 items-center justify-center rounded-full text-control tabular-nums transition-colors hover:bg-accent ${key === today ? 'bg-foreground font-semibold text-background hover:bg-foreground/85' : weekend ? 'text-foreground/70' : 'text-foreground'}`}>
          {day.date()}
        </button>
        <DayDots opened={count} caught={caught} />
        <span className="min-w-0 flex-1" onClick={() => (chime('tap'), onAdd())} />
        <Tip label={`Add a task for ${day.format('ddd D MMM')}`}>
          <button type="button" data-day-add aria-label={`Add a task for ${day.format('dddd D MMMM')}`} onClick={() => (chime('tap'), onAdd())}
            className="flex size-5 shrink-0 items-center justify-center rounded-sm text-foreground opacity-0 transition-opacity group-hover/day:opacity-100 hover:bg-accent focus-visible:opacity-100">
            <Plus className="size-3.5" />
          </button>
        </Tip>
      </div>
      {flags.length > 0 && <DayFlags marks={flags} named className="max-w-full px-1" />}
      {lines.slice(0, shown).map((line) => <LineChip key={lineKey(line)} line={line} late={gone} onOpen={onLine} />)}
      {lines.length > shown && <More day={day} lines={lines} hidden={lines.length - shown} gone={gone} onDay={onDay} onLine={onLine} />}
    </div>
  )
}

/** A task's or a note's line in a day: dragged to move it, clicked to open it. */
function LineChip({ line, late, onOpen, drag = true }: { line: Line; late: boolean; onOpen: (line: Line) => void; drag?: boolean }): React.JSX.Element {
  const movable = drag && (line.kind === 'planned' || line.kind === 'due')
  const { setNodeRef, listeners, attributes, isDragging } = useDraggable({ id: `${lineKey(line)}${drag ? '' : ':more'}`, data: { line }, disabled: !movable })
  const title = line.kind === 'back' ? line.one.title : taskName(line.task.title).text
  // Due is a deadline: its mark and colour. Late on a day gone by says so; getting ready and coming back say what they are.
  const tone = line.kind === 'due' ? (late ? 'late' : 'deadline') : line.kind === 'planned' && late ? 'late' : undefined
  const said = line.kind === 'due' ? 'Due: ' : line.kind === 'ready' ? 'Get ready: ' : line.kind === 'back' ? 'Back: ' : late ? 'Late: ' : ''
  const Icon = line.kind === 'due' || line.kind === 'ready' ? CalendarClock : line.kind === 'back' ? Telescope : null
  return (
    <Tip label={isDragging ? '' : `${said}${title}`}>
    <button ref={setNodeRef} type="button" data-plan-task data-plan-kind={line.kind} {...(movable ? attributes : {})} {...(movable ? listeners : {})}
      onClick={() => onOpen(line)}
      {...loud(tone, `flex h-5 min-w-0 shrink-0 items-center gap-1 rounded-sm px-1 text-left text-control leading-snug transition-colors hover:bg-accent ${tone ? '' : line.kind === 'planned' ? 'text-foreground' : 'text-foreground/85'} ${isDragging ? 'opacity-40' : ''} ${movable ? 'touch-none' : ''}`)}>
      {Icon ? <Icon className="size-3 shrink-0" /> : <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-current opacity-70" />}
      <span className="truncate">{title}</span>
    </button>
    </Tip>
  )
}

/** "+N more": click it, or rest the pointer on it, to see everything the day holds; its date there opens the day's page. */
function More({ day, lines, hidden, gone, onDay, onLine }: { day: Dayjs; lines: Line[]; hidden: number; gone: boolean; onDay: (day: string) => void; onLine: (line: Line) => void }): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const timer = useRef<number | undefined>(undefined)
  const later = (to: boolean, ms: number): void => (window.clearTimeout(timer.current), void (timer.current = window.setTimeout(() => setOpen(to), ms)))
  const hover = { onPointerEnter: () => later(true, 250), onPointerLeave: () => later(false, 180) }
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <button type="button" data-plan-more {...hover} onClick={() => (chime('open'), window.clearTimeout(timer.current), setOpen(true))} className="h-5 shrink-0 rounded-sm px-1 text-left text-control font-medium text-foreground hover:bg-accent">
          +{hidden} more
        </button>
      </PopoverAnchor>
      <PopoverContent data-plan-popover side="right" align="start" className="w-64 gap-1" {...hover} onOpenAutoFocus={(event) => event.preventDefault()}>
        <button type="button" onClick={() => (chime('open'), setOpen(false), onDay(dayKey(day)))} className="rounded-sm px-1 py-0.5 text-left text-body font-semibold text-foreground hover:bg-accent">{day.format('dddd D MMMM')}</button>
        {lines.map((line) => <LineChip key={lineKey(line)} line={line} late={gone} drag={false} onOpen={(one) => (setOpen(false), onLine(one))} />)}
      </PopoverContent>
    </Popover>
  )
}
