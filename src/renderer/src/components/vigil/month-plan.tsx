import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { DndContext, MeasuringStrategy, PointerSensor, pointerWithin, useDraggable, useDroppable, useSensor, useSensors } from '@dnd-kit/core'
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover'
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuLabel, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { AliveIcon } from '@/components/ui/alive-icon'
import DotsHorizontalIcon from '@/components/ui/dots-horizontal-icon'
import { Timer as CalendarClock, Bookmark as Telescope } from '@/components/ui/icons'
import { Tip } from '@/components/vigil/ui'
import { Overlay, SETTLE } from './sortable'
import { MarkChip } from './milestones'
import { chime } from '@/lib/sound'
import { taskName } from '@/lib/tasks'
import { loud } from '@/lib/loud'
import { useStill } from '@/lib/motion'
import { moveMark, onDay as marksOn, useMilestones, type Milestone } from '@/lib/milestones'
import { byDay, moveToDay, caughtLevel, useCaptureMarks, type Back, type OnDay } from '@/lib/calendar'
import { DayDots, DotsKey, openedLevel } from './day-dots'
import { DaySide, type SideAsk } from './day-side'
import { useLive, vigil, type Settings, type Stats, type Task } from '@/lib/vigil'
import { dayjs, dayKey, type Dayjs } from '../../../../main/dates'

/** A day's line, one row high, and the room its date takes above them. */
const LINE = 20
const HEAD = 30
/** Six weeks every month, as Apple Calendar shows them, so the box never changes height from one month to the next. */
const ROWS = 6
/** The slide from one month to the next. */
const SLIDE = { duration: 0.28, ease: [0.23, 1, 0.32, 1] as const }

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
 * What the month marks besides its tasks, picked in one small menu so the
 * heading stays quiet: the days you opened Vigil, and what you captured.
 * The Calendar page's heading has the same one.
 */
export function MonthShowMenu(): React.JSX.Element {
  const settings = useLive(vigil.settings, null as Settings | null)
  const set = (patch: Partial<Settings>): void => (chime('tap'), void vigil.setSettings(patch))
  return (
    <DropdownMenu modal={false}>
      <Tip label="What the month shows">
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" data-month-show aria-label="What the month shows"><AliveIcon icon={DotsHorizontalIcon} size={16} /></Button>
        </DropdownMenuTrigger>
      </Tip>
      <DropdownMenuContent align="end" className="w-56 text-control">
        <DropdownMenuLabel>Show</DropdownMenuLabel>
        <DropdownMenuCheckboxItem data-month-opened-switch checked={settings?.monthOpened === true} onCheckedChange={(on) => set({ monthOpened: on })} onSelect={(event) => event.preventDefault()}>Days I opened Vigil</DropdownMenuCheckboxItem>
        <DropdownMenuCheckboxItem data-month-captures-switch checked={settings?.monthCaptures === true} onCheckedChange={(on) => set({ monthCaptures: on })} onSelect={(event) => event.preventDefault()}>Captures</DropdownMenuCheckboxItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/**
 * A month on Home, the way a calendar app has it: each day with what is
 * planned for it, due by it (a deadline, with its own mark), to get ready
 * for, and coming back to sight. Click a day for its page, past or to come;
 * drag a task to another day; click a day's empty space or its + to add one.
 * The week numbers open the week's page, the month's name the month's.
 *
 * Months go sideways: a swipe left or right on a trackpad, or ⇧ and the
 * wheel, slides to the next or the one before, one month a swipe. A plain
 * wheel scrolls the page, so the calendar never holds it.
 */
export function MonthPlan({ tasks, onDay, onSide, onOpen, onWeek, onMonth, onShown, month: held, bare = false }: {
  tasks: Task[]
  /** The month shown, when the page above steps it (the Calendar); left out, it steps itself. */
  month?: Dayjs
  /** Told the month when a swipe here brings another one. */
  onShown?: (month: Dayjs) => void
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
  const [month, setShown] = useState(() => (held ?? dayjs()).startOf('month'))
  // Which way the last move went: the new month comes in from that side.
  const [way, setWay] = useState(1)
  const first = month.startOf('week')
  const days = Array.from({ length: ROWS * 7 }, (_, index) => first.add(index, 'day'))
  const today = dayKey()
  // The days you opened Vigil, and what was captured each day: shown when picked in the Show menu.
  const settings = useLive(vigil.settings, null as Settings | null)
  const stats = useLive(vigil.stats, null as Stats | null)
  const back = useLive(vigil.snoozedBack, [] as Back[])
  const marks = useMilestones(dayKey(days[0]), dayKey(days[days.length - 1]))
  const marking = settings?.monthOpened === true
  const opens = new Map((stats?.opens ?? []).map((one) => [one.day, one.n]))
  const counting = settings?.monthCaptures === true
  const caught = useCaptureMarks(dayKey(days[0]), dayKey(days[days.length - 1]), counting)
  const on = byDay(tasks, back)
  const inMonth = days.filter((day) => day.isSame(month, 'month')).reduce((sum, day) => sum + linesOf(on.get(dayKey(day))).length, 0)
  const still = useStill()

  /** To another month, from this side. */
  const goTo = (to: Dayjs): void => {
    const target = to.startOf('month')
    if (target.isSame(month, 'month')) return
    setWay(target.isAfter(month) ? 1 : -1)
    setShown(target)
  }
  /** A month on or back, said to the page above too. */
  const move = (to: Dayjs): void => (goTo(to), onShown?.(to.startOf('month')))
  const step = (by: number): void => (chime('tap'), move(month.add(by, 'month')))
  // The page above steps it: go there, unless a swipe here already did.
  const heldKey = held?.format('YYYY-MM')
  useEffect(() => void (held && goTo(held)), [heldKey]) // eslint-disable-line react-hooks/exhaustive-deps

  // A week's height, for how many chips a day holds.
  const body = useRef<HTMLDivElement>(null)
  const [row, setRow] = useState(0)
  useEffect(() => {
    const el = body.current
    if (!el) return
    const fit = (): void => setRow(el.clientHeight / ROWS)
    fit()
    const watch = new ResizeObserver(fit)
    watch.observe(el)
    return () => watch.disconnect()
  }, [])
  const room = Math.max(1, Math.floor((row - 1 - HEAD) / LINE))
  const [carried, setCarried] = useState<Line | { kind: 'mark'; one: Milestone } | null>(null)
  const holding = useRef<{ line?: Line; mark?: Milestone } | null>(null)

  // A sideways swipe, or ⇧ and the wheel, is one month however long it runs
  // on: a swipe's glide keeps sending, so the next month waits for a short
  // quiet. Up and down are left to the page. A task held goes along.
  const frame = useRef<HTMLDivElement>(null)
  const gesture = useRef({ sum: 0, done: false, quiet: 0 })
  const wheeled = (event: WheelEvent): void => {
    const sideways = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.shiftKey ? event.deltaY : 0
    if (!sideways) return
    event.preventDefault()
    const now = gesture.current
    window.clearTimeout(now.quiet)
    now.quiet = window.setTimeout(() => ((now.sum = 0), (now.done = false)), 150)
    if (now.done) return
    now.sum += sideways * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 400 : 1)
    if (Math.abs(now.sum) < 24) return
    now.done = true
    chime('page')
    move(month.add(Math.sign(now.sum), 'month'))
  }
  const onWheel = useRef(wheeled)
  onWheel.current = wheeled
  useEffect(() => {
    const el = frame.current
    if (!el) return
    const turned = (event: WheelEvent): void => onWheel.current(event)
    el.addEventListener('wheel', turned, { passive: false })
    return () => el.removeEventListener('wheel', turned)
  }, [])
  // While a task is held the pointer is over the task carried, not the calendar: its swipes are heard there too.
  useEffect(() => {
    if (!carried) return
    const turned = (event: WheelEvent): void => void (!frame.current?.contains(event.target as Node) && onWheel.current(event))
    window.addEventListener('wheel', turned, { passive: false })
    return () => window.removeEventListener('wheel', turned)
  }, [carried])

  // What the side panel holds (a new task for a day, or a task), and what is being carried.
  const [mine, setMine] = useState<SideAsk | null>(null)
  const side = onSide ?? setMine
  const adding = mine && 'day' in mine ? mine.day : null
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))
  const item = onOpen ?? ((type: string, id: string): void => window.api.openInHome(type, id))
  const open = (line: Line): void => (chime('open'), line.kind === 'back' ? window.api.openInHome(line.one.type, line.one.id) : side({ task: line.task.id }))
  const COLS = 'grid grid-cols-[2rem_repeat(7,minmax(0,1fr))] gap-px'
  const isThis = month.isSame(dayjs(), 'month')
  return (
    <section data-month-plan data-month-shown={month.format('YYYY-MM')} className={`flex flex-col gap-2 ${bare ? 'min-h-0 flex-1' : ''}`}>
      {!bare && <div className="flex items-center gap-1">
        <h2 className="min-w-0 truncate">
          <Tip label="Open the month's page">
            <button type="button" data-month-name onClick={() => (chime('open'), onMonth?.(month.format('YYYY-MM')))}
              className="-mx-1 rounded-md px-1 text-left font-heading text-heading font-semibold tracking-[-0.01em] text-foreground transition-colors hover:bg-accent">
              {month.format('MMMM YYYY')}
            </button>
          </Tip>
        </h2>
        <Button variant="outline" size="sm" data-month-this disabled={isThis} className="ml-2" onClick={() => (chime('tap'), move(dayjs()))}>Today</Button>
        <Tip label="The month before"><Button variant="ghost" size="icon-sm" aria-label="The month before" data-month-prev onClick={() => step(-1)}><ChevronLeft /></Button></Tip>
        <Tip label="The month after"><Button variant="ghost" size="icon-sm" aria-label="The month after" data-month-next onClick={() => step(1)}><ChevronRight /></Button></Tip>
        <span className="flex-1" />
        <MonthShowMenu />
      </div>}
      <DndContext sensors={sensors} collisionDetection={pointerWithin} autoScroll={false} measuring={{ droppable: { strategy: MeasuringStrategy.Always, frequency: 120 } }}
        onDragStart={({ active }) => { chime('lift'); holding.current = active.data.current as { line?: Line; mark?: Milestone }; setCarried(holding.current.mark ? { kind: 'mark', one: holding.current.mark } : holding.current.line!) }}
        onDragCancel={() => setCarried(null)}
        onDragEnd={({ over }) => {
          setCarried(null)
          // Kept from the lift: a swipe to another month takes the chip's own day, and its data, off the screen.
          const { line, mark } = holding.current ?? {}
          holding.current = null
          if (mark) return over ? void moveMark(mark, String(over.id)) : chime('stay')
          if (!line) return
          if (!over || line.kind === 'back' || line.kind === 'ready') return chime('stay')
          moveToDay(line.task, String(over.id), line.kind)
        }}>
      <div ref={frame} className={`flex flex-col overflow-hidden rounded-xl border bg-border ${bare ? 'min-h-0 flex-1' : ''}`}>
        <div className={COLS} aria-hidden>
          <div className="bg-background px-1 py-1 text-center text-control font-medium text-muted-foreground">Wk</div>
          {days.slice(0, 7).map((day) => (
            <div key={day.format('d')} data-month-weekday={day.day() === 0 || day.day() === 6 ? 'weekend' : 'weekday'} className={`bg-background px-2 py-1 text-control font-medium ${day.day() === 0 || day.day() === 6 ? 'text-foreground/60' : 'text-foreground/85'}`}>{day.format('ddd')}</div>
          ))}
        </div>
        <div ref={body} data-month-scroll className={`relative min-h-0 overflow-hidden ${bare ? 'flex-1' : ''}`}
          style={bare ? undefined : { height: 'max(40.5rem, calc(100vh - 22rem))' }}>
          <AnimatePresence initial={false} custom={way}>
            <motion.div key={month.format('YYYY-MM')} data-month-grid={month.format('YYYY-MM')} custom={way}
              variants={{ in: (dir: number) => ({ x: `${dir * 100}%` }), at: { x: 0 }, out: (dir: number) => ({ x: `${dir * -100}%` }) }}
              initial={still ? false : 'in'} animate="at" exit="out" transition={still ? { duration: 0 } : SLIDE}
              className="absolute inset-0 grid gap-px" style={{ gridTemplateRows: `repeat(${ROWS}, minmax(0, 1fr))` }}>
              {Array.from({ length: ROWS }, (_, at) => {
                const monday = days[at * 7]
                return (
                  <div key={dayKey(monday)} data-month-week={dayKey(monday)} className={`${COLS} min-h-0 ${at ? '' : 'pt-px'}`}>
                    <Tip label={`Open the week's page for week ${weekNumber(monday)}`}>
                      <button type="button" data-week-number={dayKey(monday)} onClick={() => (chime('open'), onWeek?.(dayKey(monday)))} aria-label={`Open week ${weekNumber(monday)}`}
                        className="flex justify-center bg-background pt-1.5 text-control text-foreground/70 tabular-nums transition-colors hover:bg-accent hover:text-foreground">
                        {weekNumber(monday)}
                      </button>
                    </Tip>
                    {days.slice(at * 7, at * 7 + 7).map((day) => {
                      const key = dayKey(day)
                      return <Cell key={key} day={day} lines={linesOf(on.get(key))} today={today} outside={!day.isSame(month, 'month')} count={marking ? (opens.get(key) ?? 0) : 0} caught={caught.get(key)} flags={marksOn(marks, key)}
                        room={room} adding={adding === key} onAdd={() => side({ day: key, minute: null, length: 0 })} onDay={onDay} onLine={open} onItem={item} />
                    })}
                  </div>
                )
              })}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
      <Overlay dropAnimation={SETTLE}>
        {carried && carried.kind !== 'back' && <span className="block rounded-sm bg-popover px-1.5 py-0.5 text-control text-foreground shadow-(--mf-panel-shadow) ring-1 ring-foreground/10">{carried.kind === 'mark' ? `${carried.one.icon ? `${carried.one.icon} ` : ''}${carried.one.title}` : taskName(carried.task.title).text}</span>}
      </Overlay>
      </DndContext>
      <DotsKey opened={marking} captures={counting} />
      {!onSide && <DaySide ask={mine} onClose={() => setMine(null)} onOpen={onOpen} />}
      {/* On the Calendar its line is always kept, so the days do not change height from month to month. */}
      {(!inMonth || bare) && <p data-month-empty={!inMonth || undefined} aria-hidden={inMonth > 0 || undefined} className={`px-1 text-body text-foreground/85 ${inMonth ? 'invisible' : ''}`}>Nothing planned in {month.format('MMMM')}. Give a task a day, like “call the dentist friday”, or click a day to add one.</p>}
    </section>
  )
}

function Cell({ day, lines, today, outside, count, caught, flags, adding, onAdd, onDay, onLine, onItem, room }: {
  day: Dayjs
  /** The chip lines a day's height holds. */
  room: number
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
  /** Where what a marked day points at opens. */
  onItem: (type: string, id: string) => void
}): React.JSX.Element {
  const key = dayKey(day)
  const { setNodeRef, isOver } = useDroppable({ id: key })
  // As many one-line chips as the day has room for (each marked day takes one); past that, "+N more".
  const fits = Math.max(1, room - flags.length)
  const shown = lines.length > fits ? Math.max(0, fits - 1) : lines.length
  const weekend = day.day() === 0 || day.day() === 6
  const gone = key < today
  const late = gone && lines.some((line) => line.kind === 'planned' || line.kind === 'due')
  return (
    <div ref={setNodeRef} data-day={key} data-outside={outside || undefined} data-shown={shown} data-planned={lines.length || undefined} data-opened={count ? openedLevel(count) : undefined} data-captured={caught === undefined ? undefined : caught && caughtLevel(caught)} data-late={late || undefined} data-weekend={weekend || undefined}
      onClick={(event) => event.target === event.currentTarget && (chime('tap'), onAdd())}
      className={`group/day relative flex min-h-0 min-w-0 cursor-default flex-col overflow-hidden p-1 transition-colors ${isOver || adding ? 'bg-accent ring-1 ring-foreground/25 ring-inset' : weekend && !outside ? 'bg-[color-mix(in_oklab,var(--background)_98%,var(--foreground))]' : 'bg-background'} ${outside ? '[&_[data-plan-more]]:opacity-60 [&_[data-plan-task]]:opacity-60' : ''}`}>
      <div className="flex items-center gap-1.5">
        <button type="button" onClick={() => (chime('open'), onDay(key))} aria-label={`Open ${day.format('dddd D MMMM')}${count ? `. Opened Vigil${count > 1 ? ` ${count} times` : ''}` : ''}${caught ? `. ${caught} ${caught === 1 ? 'capture' : 'captures'}` : caught === 0 ? '. Nothing captured' : ''}`}
          aria-current={key === today ? 'date' : undefined}
          data-day-number className={`flex h-6 min-w-6 shrink-0 items-center justify-center rounded-full px-1 text-control tabular-nums transition-colors hover:bg-accent ${key === today ? 'bg-foreground font-semibold text-background hover:bg-foreground/85' : outside ? 'text-foreground/40' : day.date() === 1 ? 'font-semibold text-foreground' : 'text-foreground'}`}>
          {day.date() === 1 ? day.format('D MMM') : day.date()}
        </button>
        {/* The dots say what the day held: a click opens the day's page, where it is. */}
        {(count > 0 || caught !== undefined) && (
          <Tip label={`${[count ? `Opened Vigil${count > 1 ? ` ${count} times` : ''}` : '', caught ? `${caught} ${caught === 1 ? 'capture' : 'captures'}` : caught === 0 ? 'Nothing captured' : ''].filter(Boolean).join(', ')}. Click to open the day`}>
            <button type="button" data-day-dots tabIndex={-1} onClick={() => (chime('open'), onDay(key))} className="flex h-5 items-center rounded-sm px-1 transition-colors hover:bg-accent"><DayDots opened={count} caught={caught} /></button>
          </Tip>
        )}
        <span className="min-w-0 flex-1" onClick={() => (chime('tap'), onAdd())} />
        <Tip label={`Add a task for ${day.format('ddd D MMM')}`}>
          <button type="button" data-day-add aria-label={`Add a task for ${day.format('dddd D MMMM')}`} onClick={() => (chime('tap'), onAdd())}
            className="flex size-5 shrink-0 items-center justify-center rounded-sm text-foreground opacity-0 transition-opacity group-hover/day:opacity-100 hover:bg-accent focus-visible:opacity-100">
            <Plus className="size-3.5" />
          </button>
        </Tip>
      </div>
      {flags.map((one) => <MarkLine key={one.id} one={one} outside={outside} onItem={onItem} onDay={onDay} />)}
      {lines.slice(0, shown).map((line) => <LineChip key={lineKey(line)} line={line} late={gone} onOpen={onLine} />)}
      {lines.length > shown && <More day={day} lines={lines} hidden={lines.length - shown} gone={gone} onDay={onDay} onLine={onLine} />}
    </div>
  )
}

/** A marked day's line in a day: clicked to open what it belongs to, right-clicked for its menu, dragged to another day. */
function MarkLine({ one, outside, onItem, onDay }: { one: Milestone; outside: boolean; onItem: (type: string, id: string) => void; onDay: (day: string) => void }): React.JSX.Element {
  const { setNodeRef, listeners, attributes, isDragging } = useDraggable({ id: `mark:${one.id}`, data: { mark: one } })
  return <MarkChip ref={setNodeRef} one={one} open={onItem} onOpenDay={(day) => (chime('open'), onDay(day))} {...attributes} {...listeners}
    className={`touch-none ${isDragging ? 'opacity-40' : outside ? 'opacity-60' : ''}`} />
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
