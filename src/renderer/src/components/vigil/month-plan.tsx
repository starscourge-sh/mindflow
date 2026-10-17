import { useEffect, useLayoutEffect, useRef, useState } from 'react'
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
import { glideWay } from '@/lib/motion'
import { onDay as marksOn, useMilestones } from '@/lib/milestones'
import { byDay, moveToDay, caughtLevel, useCaptureMarks, type Back, type OnDay } from '@/lib/calendar'
import { DayDots, DotsKey, openedLevel } from './day-dots'
import { DaySide, type SideAsk } from './day-side'
import { useLive, vigil, type Settings, type Stats, type Task } from '@/lib/vigil'
import { dayjs, dayKey, type Dayjs } from '../../../../main/dates'

/** A day's line, one row high, and the room its date takes above them. */
const LINE = 20
const HEAD = 30
/** Weeks in view at once, and the months drawn either side of the one in view (more are added as you scroll near the end). */
const ROWS = 6
const AROUND = 6

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
const weeksBetween = (from: Dayjs, to: Dayjs): number => Math.round(to.diff(from, 'day', true) / 7)

/**
 * A month on Home, the way a calendar app has it: each day with what is
 * planned for it, due by it (a deadline, with its own mark), to get ready
 * for, and coming back to sight. Click a day for its page, past or to come;
 * drag a task to another day; click a day's empty space or its + to add one.
 * The week numbers open the week's page, the month's name the month's.
 *
 * The weeks run on as one list, as in Apple Calendar: a scroll moves a month
 * and stops on its first week, and the days of the month in view are the
 * strong ones. On Home the page keeps the wheel until the whole calendar is
 * in view, so scrolling down Home never gets caught in it.
 */
export function MonthPlan({ tasks, onDay, onSide, onOpen, onWeek, onMonth, onShown, month: held, bare = false }: {
  tasks: Task[]
  /** The month shown, when the page above steps it (the Calendar); left out, it steps itself. */
  month?: Dayjs
  /** Told the month in view when a scroll brings another one there. */
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
  // The months drawn: from `base` plus `span.from` to `base` plus `span.to`.
  const [base, setBase] = useState(month)
  const [span, setSpan] = useState({ from: -AROUND, to: AROUND })
  const start = base.add(span.from, 'month').startOf('week')
  const weeks = weeksBetween(start, base.add(span.to, 'month').endOf('month').startOf('week')) + 1
  const days = Array.from({ length: weeks * 7 }, (_, index) => start.add(index, 'day'))
  const rowOf = (one: Dayjs): number => weeksBetween(start, one.startOf('month').startOf('week'))
  const today = dayKey()
  // The days you opened Vigil, marked beside the date when the switch is on.
  const settings = useLive(vigil.settings, null as Settings | null)
  const stats = useLive(vigil.stats, null as Stats | null)
  const back = useLive(vigil.snoozedBack, [] as Back[])
  const marks = useMilestones(dayKey(days[0]), dayKey(days[days.length - 1]))
  const [shown, setShownSwitch] = useState<boolean | null>(null)
  const marking = shown ?? settings?.monthOpened === true
  const toggle = (on: boolean): void => (chime('tap'), setShownSwitch(on), void vigil.setSettings({ monthOpened: on }))
  const opens = new Map((stats?.opens ?? []).map((one) => [one.day, one.n]))
  // The other mark: how much was captured each day, and the days with none.
  const [counted, setCounted] = useState<boolean | null>(null)
  const counting = counted ?? settings?.monthCaptures === true
  const caught = useCaptureMarks(dayKey(days[0]), dayKey(days[days.length - 1]), counting)
  const on = byDay(tasks, back)
  const inMonth = days.filter((day) => day.isSame(month, 'month')).reduce((sum, day) => sum + linesOf(on.get(dayKey(day))).length, 0)

  // The scroll: a week's height, the move asked for, and the month being glided to (its own scroll says nothing till it lands).
  const box = useRef<HTMLDivElement>(null)
  const frame = useRef<HTMLDivElement>(null)
  const [row, setRow] = useState(0)
  const want = useRef<{ month: Dayjs; how: ScrollBehavior } | null>({ month, how: 'instant' })
  const aim = useRef(0)
  const glides = useRef(0)
  const firstDay = useRef(dayKey(start))
  useLayoutEffect(() => {
    const el = box.current
    if (!el) return
    const fit = (): void => setRow(el.clientHeight / ROWS)
    fit()
    const watch = new ResizeObserver(fit)
    watch.observe(el)
    return () => watch.disconnect()
  }, [])
  // A new height keeps the same month at the top.
  useLayoutEffect(() => void (want.current ??= { month, how: 'instant' }), [row]) // eslint-disable-line react-hooks/exhaustive-deps
  useLayoutEffect(() => {
    const el = box.current
    if (!el || !row) return
    // Months added above: the ones in view stay put.
    const was = firstDay.current
    firstDay.current = dayKey(start)
    if (was !== firstDay.current) el.scrollTop += weeksBetween(start, dayjs(was)) * row
    const ask = want.current
    if (!ask) return
    want.current = null
    const top = rowOf(ask.month) * row
    if (Math.abs(el.scrollTop - top) < 1) return
    aim.current = ask.how === 'smooth' ? ++glides.current : 0
    // From far off, jump to the month beside it and glide only the last month, as Apple Calendar does.
    const near = 5 * row
    if (aim.current && Math.abs(el.scrollTop - top) > 2 * near) el.scrollTop = top + (el.scrollTop > top ? near : -near)
    el.scrollTo({ top, behavior: ask.how })
    // Should its end go unsaid, the scroll speaks for itself again soon after.
    const mine = aim.current
    if (mine) window.setTimeout(() => void (aim.current === mine && (aim.current = 0)), 1500)
  })
  const goTo = (to: Dayjs, how: ScrollBehavior = glideWay()): void => {
    const target = to.startOf('month')
    setShown(target)
    // Far off: draw the months around it afresh and go there at once.
    if (target.isBefore(base.add(span.from + 1, 'month')) || target.isAfter(base.add(span.to - 1, 'month'))) {
      setBase(target)
      setSpan({ from: -AROUND, to: AROUND })
      want.current = { month: target, how: 'instant' }
    } else want.current = { month: target, how }
  }
  const scrolled = (): void => {
    const el = box.current
    if (!el || !row || aim.current) return
    const top = Math.round(el.scrollTop / row)
    // The month in view: the one the third week shown is in.
    const now = start.add(top + 2, 'week').add(3, 'day').startOf('month')
    if (!now.isSame(month, 'month')) (setShown(now), onShown?.(now))
    if (top < 8) setSpan((was) => ({ ...was, from: was.from - AROUND }))
    else if (top > weeks - ROWS - 8) setSpan((was) => ({ ...was, to: was.to + AROUND }))
  }
  // The page above steps it: go there, unless a scroll here already did.
  const heldKey = held?.format('YYYY-MM')
  useEffect(() => void (held && !held.isSame(month, 'month') && goTo(held)), [heldKey]) // eslint-disable-line react-hooks/exhaustive-deps
  // On Home, the wheel is the page's until the whole calendar is in view.
  const [free, setFree] = useState(bare)
  useEffect(() => {
    const el = frame.current
    if (bare || !el) return
    const watch = new IntersectionObserver(([one]) => setFree(one.intersectionRatio >= 0.97), { threshold: [0, 0.25, 0.5, 0.75, 0.9, 0.97, 1] })
    watch.observe(el)
    return () => watch.disconnect()
  }, [bare])
  const room = Math.max(1, Math.floor((row - 1 - HEAD) / LINE))
  const [carried, setCarried] = useState<Line | null>(null)
  /** A month on or back, said to the page above too. */
  const move = (to: Dayjs): void => (goTo(to), onShown?.(to.startOf('month')))
  const step = (by: number): void => (chime('tap'), move(month.add(by, 'month')))
  // A wheel or a trackpad swipe is one month, however long it runs on: a
  // swipe's glide keeps sending, so the next month waits for a short quiet.
  // While a task is carried the scroll is free, to carry it on further.
  const gesture = useRef({ sum: 0, done: false, quiet: 0 })
  const wheeled = (event: WheelEvent): void => {
    if (!free || carried || Math.abs(event.deltaX) > Math.abs(event.deltaY)) return
    event.preventDefault()
    const now = gesture.current
    window.clearTimeout(now.quiet)
    now.quiet = window.setTimeout(() => ((now.sum = 0), (now.done = false)), 150)
    if (now.done) return
    now.sum += event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 400 : 1)
    if (Math.abs(now.sum) < 24) return
    now.done = true
    chime('page')
    move(month.add(Math.sign(now.sum), 'month'))
  }
  const onScroll = useRef(scrolled)
  onScroll.current = scrolled
  const onWheel = useRef(wheeled)
  onWheel.current = wheeled
  useEffect(() => {
    const el = box.current
    if (!el) return
    const landed = (): void => ((aim.current = 0), onScroll.current())
    const turned = (event: WheelEvent): void => onWheel.current(event)
    el.addEventListener('scrollend', landed)
    el.addEventListener('wheel', turned, { passive: false })
    return () => (el.removeEventListener('scrollend', landed), el.removeEventListener('wheel', turned))
  }, [])
  // What the side panel holds (a new task for a day, or a task), and what is being carried.
  const [mine, setMine] = useState<SideAsk | null>(null)
  const side = onSide ?? setMine
  const adding = mine && 'day' in mine ? mine.day : null
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))
  const open = (line: Line): void => (chime('open'), line.kind === 'back' ? window.api.openInHome(line.one.type, line.one.id) : side({ task: line.task.id }))
  const COLS = 'grid grid-cols-[2rem_repeat(7,minmax(0,1fr))] gap-px'
  return (
    <section data-month-plan data-month-shown={month.format('YYYY-MM')} className={`flex flex-col gap-2 ${bare ? 'min-h-0 flex-1' : ''}`}>
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
        {!month.isSame(dayjs(), 'month') && <Button variant="ghost" size="sm" data-month-this onClick={() => (chime('tap'), move(dayjs()))}>This month</Button>}
        <Tip label="The month before"><Button variant="ghost" size="icon-sm" aria-label="The month before" data-month-prev onClick={() => step(-1)}><ChevronLeft /></Button></Tip>
        <Tip label="The month after"><Button variant="ghost" size="icon-sm" aria-label="The month after" data-month-next onClick={() => step(1)}><ChevronRight /></Button></Tip>
      </div>}
      <DndContext sensors={sensors} collisionDetection={pointerWithin} autoScroll={{ threshold: { x: 0, y: 0.06 }, acceleration: 6 }}
        onDragStart={({ active }) => (chime('lift'), setCarried((active.data.current as { line: Line }).line))}
        onDragCancel={() => setCarried(null)}
        onDragEnd={({ active, over }) => {
          setCarried(null)
          const line = (active.data.current as { line: Line }).line
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
        {/* Snapping is let go while a task is carried, so the edge of the box can scroll it on to another month. */}
        <div ref={box} data-month-scroll onScroll={() => onScroll.current()}
          className={`relative min-h-0 [overflow-anchor:none] [scrollbar-width:none] ${free ? 'overflow-y-auto' : 'overflow-y-hidden'} ${carried ? '' : 'snap-y snap-mandatory'} ${bare ? 'flex-1' : ''}`}
          style={bare ? undefined : { height: 'min(max(40.5rem, calc(100vh - 22rem)), calc(100vh - 10rem))' }}>
          {Array.from({ length: weeks }, (_, at) => {
            const monday = days[at * 7]
            const week = days.slice(at * 7, at * 7 + 7)
            const starts = week.some((day) => day.date() === 1)
            return (
              <div key={dayKey(monday)} data-month-week={dayKey(monday)} className={`${COLS} pt-px ${starts ? 'snap-start snap-always' : ''}`} style={{ height: row || undefined }}>
                <Tip label={`Open the week's page for week ${weekNumber(monday)}`}>
                  <button type="button" data-week-number={dayKey(monday)} onClick={() => (chime('open'), onWeek?.(dayKey(monday)))} aria-label={`Open week ${weekNumber(monday)}`}
                    className="flex justify-center bg-background pt-1.5 text-control text-foreground/70 tabular-nums transition-colors hover:bg-accent hover:text-foreground">
                    {weekNumber(monday)}
                  </button>
                </Tip>
                {week.map((day) => {
                  const key = dayKey(day)
                  return <Cell key={key} day={day} lines={linesOf(on.get(key))} today={today} outside={!day.isSame(month, 'month')} count={marking ? (opens.get(key) ?? 0) : 0} caught={caught.get(key)} flags={marksOn(marks, key)}
                    room={room} adding={adding === key} onAdd={() => side({ day: key, minute: null, length: 0 })} onDay={onDay} onLine={open} />
                })}
              </div>
            )
          })}
        </div>
      </div>
      <Overlay dropAnimation={SETTLE}>
        {carried && carried.kind !== 'back' && <span className="block rounded-sm bg-popover px-1.5 py-0.5 text-control text-foreground shadow-(--mf-panel-shadow) ring-1 ring-foreground/10">{taskName(carried.task.title).text}</span>}
      </Overlay>
      </DndContext>
      <DotsKey opened={marking} captures={counting} />
      {!onSide && <DaySide ask={mine} onClose={() => setMine(null)} onOpen={onOpen} />}
      {/* On the Calendar its line is always kept, so the days do not change height from month to month. */}
      {(!inMonth || bare) && <p data-month-empty={!inMonth || undefined} aria-hidden={inMonth > 0 || undefined} className={`px-1 text-body text-foreground/85 ${inMonth ? 'invisible' : ''}`}>Nothing planned in {month.format('MMMM')}. Give a task a day, like “call the dentist friday”, or click a day to add one.</p>}
    </section>
  )
}

function Cell({ day, lines, today, outside, count, caught, flags, adding, onAdd, onDay, onLine, room }: {
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
}): React.JSX.Element {
  const key = dayKey(day)
  const { setNodeRef, isOver } = useDroppable({ id: key })
  // As many one-line chips as the day has room for (a marked day's name takes one); past that, "+N more".
  const fits = Math.max(1, room - (flags.length ? 1 : 0))
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
        <DayDots opened={count} caught={caught} />
        <span className="min-w-0 flex-1" onClick={() => (chime('tap'), onAdd())} />
        <Tip label={`Add a task for ${day.format('ddd D MMM')}`}>
          <button type="button" data-day-add aria-label={`Add a task for ${day.format('dddd D MMMM')}`} onClick={() => (chime('tap'), onAdd())}
            className="flex size-5 shrink-0 items-center justify-center rounded-sm text-foreground opacity-0 transition-opacity group-hover/day:opacity-100 hover:bg-accent focus-visible:opacity-100">
            <Plus className="size-3.5" />
          </button>
        </Tip>
      </div>
      {flags.length > 0 && <DayFlags marks={flags} named className={`max-w-full px-1 ${outside ? 'opacity-60' : ''}`} />}
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
