import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { dragWords } from '@/lib/drag-words'
import { useReading } from '@/lib/reads-in'
import { AnimatePresence, motion } from 'motion/react'
import { DndContext, MeasuringStrategy, PointerSensor, pointerWithin, useDraggable, useDroppable, useSensor, useSensors } from '@dnd-kit/core'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover'
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuLabel, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { AliveIcon } from '@/components/ui/alive-icon'
import DotsHorizontalIcon from '@/components/ui/dots-horizontal-icon'
import { Timer as CalendarClock, Bookmark as Telescope } from '@/components/ui/icons'
import { Tip, stage } from '@/components/haligtree/ui'
import { slotTicker } from '@/lib/proximity'
import { CarriedCard } from './carry'
import { Overlay, SETTLE } from './sortable'
import { MarkChip } from './milestones'
import { chime, quietFor } from '@/lib/sound'
import { taskName } from '@/lib/tasks'
import { edgeScroll } from '@/lib/edge-scroll'
import { loud } from '@/lib/loud'
import { detent, edge } from '@/lib/haptics'
import { CALM, land, stopFor, type Landing } from '@/lib/snap'
import { EASE, byKeys, glideWay, useStill } from '@/lib/motion'
import { moveMark, onDay as marksOn, useMilestones, type Milestone } from '@/lib/milestones'
import { byDay, moveToDay, caughtLevel, useCaptureMarks, type Back, type OnDay } from '@/lib/calendar'
import { DayDots, DotsKey, openedLevel } from './day-dots'
import { DaySide, type SideAsk } from './day-side'
import { RowMenu, type RowItem } from './row-menu'
import { AddPopover, DraftMark, OpenPopover, addLines, placeKey, placeOf, stayPut, useLeaving, type Add } from './cal-add'
import { monthHere } from '@/lib/calendar-scope'
import { useHere } from '@/lib/split'
import { taskMenu, useTaskNow } from './tasks-view'
import { calendarInk, useCalendars } from '@/lib/events'
import { unloaded, useLive, haligtree, type Settings, type Stats, type Task } from '@/lib/haligtree'
import { dayjs, type Dayjs, dayKey, num, plural } from '../../../../main/dates'
import { APP_NAME } from '../../../../main/name'

/** A day's line (h-5) and the room above the lines: the cell's top padding (6px) and its date (h-6), read in the app's own
 * text size: counted in fixed pixels at a larger size, one line too many was laid out and showed cut in half (10 Nov). A tinted
 * chip keeps its own 2px under the line above it. */
let remSize = 16
/** The app's text size, read again only when a month's box is measured (its size changes with the app size): read in each
 * draw, it made the page restyle on every week a fling brought in, most of its long frames. */
const readRem = (): void => void (remSize = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16)
const rem = (): number => remSize
const LINE = (): number => 1.25 * rem()
const HEAD = (): number => 1.5 * rem() + 6
/** The cell's padding under its last line. */
const FOOT = 6
/** Six weeks every month, as Apple Calendar shows them, so the box never changes height from one month to the next. */
const ROWS = 6
/** Weeks to a screen on the Calendar's run: five, so even a busy week keeps room for a few whole lines. */
const SCREEN = 5
/** The slide from one month to the next. */
const SLIDE = { duration: 0.28, ease: EASE }

/** The week's number, as calendars count it: the week that holds the year's first Thursday is week 1. */
const weekNumber = (monday: Dayjs): number => {
  const thursday = monday.add(3, 'day')
  return Math.floor(thursday.diff(thursday.startOf('year'), 'day') / 7) + 1
}

/** The Calendar's run as it last fitted its box: a week's height, and whether a day has room for names. */
let lastFit: { row: number; wide: boolean } | null = null

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
 * heading stays quiet: the days you opened Haligtree, and what you captured.
 * The Calendar page's heading has the same one.
 */
export function MonthShowMenu({ children }: { /** More lines under the switches: the panels, when the Calendar's bar has no room for their buttons. */ children?: React.ReactNode }): React.JSX.Element {
  const settings = useLive(haligtree.settings, null as Settings | null)
  const set = (patch: Partial<Settings>): void => (chime('tap'), void haligtree.setSettings(patch))
  return (
    <DropdownMenu modal={false}>
      <Tip label="What the month shows">
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" data-month-show aria-label="What the month shows"><AliveIcon icon={DotsHorizontalIcon} size={16} /></Button>
        </DropdownMenuTrigger>
      </Tip>
      <DropdownMenuContent align="end" className="w-56 text-control">
        <DropdownMenuLabel>Show</DropdownMenuLabel>
        <DropdownMenuCheckboxItem data-month-opened-switch checked={settings?.monthOpened === true} onCheckedChange={(on) => set({ monthOpened: on })} onSelect={(event) => event.preventDefault()}>Days I opened {APP_NAME}</DropdownMenuCheckboxItem>
        <DropdownMenuCheckboxItem data-month-captures-switch checked={settings?.monthCaptures === true} onCheckedChange={(on) => set({ monthCaptures: on })} onSelect={(event) => event.preventDefault()}>Captures</DropdownMenuCheckboxItem>
        {children}
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
 * On Home it is six weeks a month, stepped by its arrows. On the Calendar
 * (`bare`) the weeks run on as Apple Calendar's do: one column of weeks that
 * scrolls up and down with the trackpad's glide and comes to rest on a week,
 * the month named above changing as a month's first week reaches the top.
 * Sideways swipes are never the month's: they are Back and Forward.
 */
export function MonthPlan({ tasks, onDay, onSide, onTask, onAddDay, onOpen, onWeek, onMonth, onShown, month: held, bare = false, dayExtra, extraSaid = [], bars = [], onPickDay, dayMenu, onDrawDays }: {
  /** A press on a day's empty part, which dragged across days draws one event over them (the Calendar's). */
  onDrawDays?: (event: React.PointerEvent, day: string) => void
  /** A task opened from a day (a click on its line, ↵): the page's own popover, tied to `at`. Left out, the month opens it in its own. */
  onTask?: (id: string, at: HTMLElement | null) => void
  tasks: Task[]
  /** The page above keeps a picked day (the Calendar): a click on a day's empty part picks it, and a double-click starts something new there. Left out, a click starts it. */
  onPickDay?: (day: string) => void
  /** A day's own right-click menu, on its empty part (the Calendar's “New event here”, “New task here”). */
  dayMenu?: (day: string) => RowItem[]
  /** More chips for a day, before its tasks: the Calendar's events. */
  dayExtra?: (day: string) => React.ReactNode[]
  /** What `dayExtra` and `bars` are drawn from, compared item by item: a week of the run is drawn again only when it changed. */
  extraSaid?: unknown[]
  /** Things that run over several days (the Calendar's multi-day events): one bar across the days each covers, as in Week. */
  bars?: Bar[]
  /** The month shown, when the page above steps it (the Calendar); left out, it steps itself. */
  month?: Dayjs
  /** Told the month when scrolling here brings another one to the top. */
  onShown?: (month: Dayjs) => void
  /** The Calendar's run of weeks: no heading line of its own, and the weeks fill the room there is. */
  bare?: boolean
  onDay: (day: string) => void
  /** The side panel of the page above, when it keeps one (the Calendar), for a task opened from a day; left out, the month keeps its own. */
  onSide?: (ask: SideAsk) => void
  /** The page above's own way of adding to a day (the Calendar's draft and popover); left out, the month keeps its own. */
  onAddDay?: (day: string) => void
  /** Where a link inside a task opened in the panel goes. */
  onOpen?: (type: string, id: string) => void
  onWeek?: (monday: string) => void
  onMonth?: (month: string) => void
}): React.JSX.Element {
  const [month, setShown] = useState(() => (held ?? dayjs()).startOf('month'))
  // Which way the last move went: the new month comes in from that side. A
  // move made by a key arrives at once (lib/motion rule 5); a click slides.
  const [way, setWay] = useState({ dir: 1, instant: false })
  const first = month.startOf('week')
  const days = Array.from({ length: ROWS * 7 }, (_, index) => first.add(index, 'day'))
  const today = dayKey()
  // What is read for marks and captures: the six weeks shown, or on the run the quarter named and one either side of it,
  // so a fling reads afresh once every three months, never a week or a month at a time.
  const quarter = month.subtract(month.month() % 3, 'month')
  const [from, to] = bare ? [dayKey(quarter.subtract(3, 'month').startOf('week')), dayKey(quarter.add(5, 'month').endOf('month'))] : [dayKey(days[0]), dayKey(days[days.length - 1])]
  // The days you opened Haligtree, and what was captured each day: shown when picked in the Show menu.
  const settings = useLive(haligtree.settings, null as Settings | null)
  const stats = useLive(haligtree.stats, null as Stats | null)
  const back = useLive(haligtree.snoozedBack, [] as Back[])
  const marks = useMilestones(from, to)
  // Its page waits for these too: the marked days, the days opened and those coming back, never a day at a time.
  useReading(!settings || !stats || unloaded(back) || unloaded(marks))
  const marking = settings?.monthOpened === true
  const opens = useMemo(() => new Map((stats?.opens ?? []).map((one) => [one.day, one.n])), [stats])
  const counting = settings?.monthCaptures === true
  const caught = useCaptureMarks(from, to, counting)
  const on = useMemo(() => byDay(tasks, back), [tasks, back])
  const inMonth = Array.from({ length: month.daysInMonth() }, (_, at) => month.add(at, 'day')).reduce((sum, day) => sum + linesOf(on.get(dayKey(day))).length, 0)
  const still = useStill()

  /** To another month, from this side. */
  const goTo = (to: Dayjs, instant = byKeys()): void => {
    const target = to.startOf('month')
    if (target.isSame(month, 'month')) return
    setWay({ dir: target.isAfter(month) ? 1 : -1, instant })
    setShown(target)
  }
  /** A month on or back, said to the page above too. */
  const move = (to: Dayjs, instant?: boolean): void => (goTo(to, instant), onShown?.(to.startOf('month')))
  const step = (by: number): void => (chime('tap'), move(month.add(by, 'month')))
  // The page above steps it (Home's month steps itself; the run glides there itself, below).
  const heldKey = held?.format('YYYY-MM')
  useEffect(() => void (held && !bare && goTo(held)), [heldKey]) // eslint-disable-line react-hooks/exhaustive-deps

  // A week's height, for how many chips a day holds.
  const body = useRef<HTMLDivElement>(null)
  // On the run it starts from the last fit (the pane is the size it was): measured afresh from nothing, the weeks were
  // drawn a second time in the frame the month came in, all at once.
  const [row, setRow] = useState(() => (bare ? (lastFit?.row ?? 0) : 0))
  // Whether a day is wide enough for its things by name (5.5rem), worked out here from the box's width, once a resize:
  // a container query on each day made every week coming into sight restyle its seven days as it was laid out.
  const [wide, setWide] = useState(() => (bare ? (lastFit?.wide ?? true) : true))
  useLayoutEffect(() => {
    const el = body.current
    if (!el) return
    const fit = (): void => {
      readRem()
      // On the run, a whole number of pixels a week, so every week's lines fall on whole pixels as it scrolls.
      const fitted = { row: bare ? Math.floor(el.clientHeight / SCREEN) : el.clientHeight / ROWS, wide: (el.clientWidth - 2 * rem() - 8) / 7 >= 5.5 * rem() }
      setRow(fitted.row)
      setWide(fitted.wide)
      if (bare && fitted.row > 0) lastFit = fitted
    }
    fit()
    const watch = new ResizeObserver(fit)
    watch.observe(el)
    return () => watch.disconnect()
  }, [])
  const [carried, setCarried] = useState<Line | { kind: 'mark'; one: Milestone } | null>(null)
  const holding = useRef<{ line?: Line; mark?: Milestone } | null>(null)
  // A tick and a trackpad tap for each new day a carried task comes over; the day it was lifted from is no arrival.
  const ticks = useRef(slotTicker()).current
  const fromDay = useRef(true)
  // The day a carried line was lifted from, and the day it is over now: its card says where letting go puts it.
  const liftedFrom = useRef<string | null>(null)
  const [overDay, setOverDay] = useState<string | null>(null)
  // While a line is carried no tip comes up from what passes under it: the card is the one floating thing (ui.tsx, `stage`).
  const carrying = !!carried
  useEffect(() => (carrying ? stage() : undefined), [carrying])

  // What the side panel holds (a task opened from a day), and what is being carried.
  const [mine, setMine] = useState<SideAsk | null>(null)
  // A month that keeps its own adding (Home's, the Journal's; the Calendar keeps its own above, `onSide`): a click picks
  // a day, a double-click starts a task there, drawn on the day and written in the popover beside it (cal-add.tsx), the
  // way the Calendar adds. These months show tasks, so a task is what a double-click starts; "Event" is one press away.
  const own = !onAddDay
  const [add, setAdd] = useState<Add | null>(null)
  const [pickedOwn, setPickedOwn] = useState<string | null>(null)
  const openAdd = (to: Add): void => (setMine(null), setOpenedOwn(null), setPickedOwn(to.day), setAdd(to))
  const frame = useRef<HTMLElement>(null)
  // A task picked by a ⇧- or ⌘-click on its line (ringed), and the one open in the popover a new one is written in, tied to its
  // line: a click or ↵. “Open” there is its whole page, in the side panel.
  const [pickedTask, setPickedTask] = useState<string | null>(null)
  const [openedOwn, setOpenedOwn] = useState<{ id: string; at: HTMLElement | null; words?: string } | null>(null)
  // A task's own right-click menu on its line, the one every list has; kept in hand so a week drawn before it changed reads it as it is now.
  const nowTask = useTaskNow()
  const taskNow = useRef(nowTask)
  taskNow.current = nowTask
  const openedTask = openedOwn ? tasks.find((task) => task.id === openedOwn.id) ?? null : null
  // Let go, its popover leaves by its clip, as it came (cal-add.tsx, `useLeaving`): until it has gone it is still
  // drawn on its draft, or on the task it was open on. `drawn` is for drawing alone.
  const openOwn = openedOwn && openedTask ? openedOwn : null
  const leftAdd = useLeaving(own ? add : null, !!openOwn)
  const leftOpen = useLeaving(add ? null : openOwn, !!add)
  const drawn = own ? add ?? leftAdd.kept : null
  // Where its draft is drawn: where its words put it ("fri"), or where it was put (cal-add.tsx).
  const draftAt = drawn && placeOf(drawn)
  // Its words name a day outside the six weeks shown: the month turns to it (and back), and the draft is simply there.
  const changeAdd = (patch: Partial<Add>): void => {
    const now = add && 'at' in patch ? placeOf({ ...add, ...patch }) : null
    if (now && (now.day < dayKey(days[0]) || now.day > dayKey(days[days.length - 1]))) (stayPut(), move(dayjs(now.day), true))
    setAdd((was) => was && { ...was, ...patch })
  }
  const drawnOpen = add ? null : openOwn ?? (drawn ? null : leftOpen.kept)
  const lastTask = useRef<Task | null>(null)
  if (openOwn) lastTask.current = openedTask
  const drawnTask = openOwn ? openedTask : lastTask.current
  const calendars = useCalendars()
  const draftColor = calendarInk(calendars.find((one) => one.id === add?.calendar) ?? calendars.find((one) => !one.hidden) ?? calendars[0])
  const adding = own ? (draftAt?.day ?? null) : null
  // ⌘K is about the task picked here, as on the Calendar's own page (lib/calendar-scope.ts): “Open” opens it in the
  // popover tied to its line, and a thing done to it leaves it picked.
  const here = useHere()
  const mineNow = useRef({ tasks, pickedTask })
  mineNow.current = { tasks, pickedTask }
  useEffect(() => own ? monthHere(here, {
    chosen: () => mineNow.current.tasks.find((task) => task.id === mineNow.current.pickedTask && task.status === 'open') ?? null,
    open: (id) => (setAdd(null), setMine(null), setPickedTask(id), setOpenedOwn({ id, at: frame.current?.querySelector<HTMLElement>(`[data-plan-task="${CSS.escape(id)}"]`) ?? null })),
    settle: (id) => setPickedTask(id),
    go: () => undefined
  }) : undefined, [own]) // eslint-disable-line react-hooks/exhaustive-deps
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))
  // A task carried past the weeks' top or bottom edge scrolls them (lib/edge-scroll.ts, as the Calendar's bars and a
  // note's blocks do), so a day out of view is reached in one drag; dnd-kit's own scrolling is off. The pointer's own
  // place, read from its moves: dnd-kit's move counts the scroll in.
  const heldAtEdge = useRef<(() => void) | null>(null)
  const holdEdges = (): void => {
    const run = frame.current?.querySelector<HTMLElement>('[data-month-run]')
    if (!run) return
    const scroll = edgeScroll(run, 0)
    const move = (event: PointerEvent): void => scroll.follow(event.clientY)
    window.addEventListener('pointermove', move)
    heldAtEdge.current = () => (window.removeEventListener('pointermove', move), scroll.stop())
  }
  const letEdges = (): void => void (heldAtEdge.current?.(), (heldAtEdge.current = null))
  useEffect(() => () => heldAtEdge.current?.(), [])
  const item = onOpen ?? ((type: string, id: string): void => window.api.openInHome(type, id))
  const open = (line: Line, at: HTMLElement | null = null): void => line.kind === 'back' ? (chime('open'), window.api.openInHome(line.one.type, line.one.id))
    : onTask ? onTask(line.task.id, at) : (setAdd(null), setMine(null), setPickedTask(line.task.id), setOpenedOwn({ id: line.task.id, at }))
  const COLS = 'grid grid-cols-[2rem_repeat(7,minmax(0,1fr))] gap-px'
  const isThis = month.isSame(dayjs(), 'month')

  /** Everything a week of the run is drawn from, for it to be drawn again only when one of them changed. */
  const sign = (monday: Dayjs): unknown[] => {
    const said: unknown[] = [today, marks, adding, drawn?.kind, draftColor, marking, counting, wide, !onTask, ...extraSaid]
    for (let at = 0; at < 7; at++) {
      const key = dayKey(monday.add(at, 'day'))
      said.push(on.get(key), caught.get(key), opens.get(key))
    }
    return said
  }
  /** How many lines a day in a week `height` tall holds, before its bars. */
  const linesIn = (height: number): number => Math.max(1, Math.floor((height - 1 - HEAD() - FOOT) / LINE()))
  /** One week: its number, its seven days and the bars across them; `place` puts it in the run. */
  const week = (monday: Dayjs, room: number, laid: ReturnType<typeof layBars>, shown: Dayjs | null, edge: boolean, place?: React.CSSProperties): React.JSX.Element => {
    const weekDays = Array.from({ length: 7 }, (_, at) => monday.add(at, 'day'))
    return (
      <div key={dayKey(monday)} data-month-week={dayKey(monday)} style={place} className={`${COLS} min-h-0 ${edge ? 'pt-px' : ''} ${place ? 'absolute inset-x-0' : 'relative'}`}>
        <Tip label={`Open the week's page for week ${weekNumber(monday)}`}>
          <button type="button" data-week-number={dayKey(monday)} onClick={() => (chime('open'), onWeek?.(dayKey(monday)))} aria-label={`Open week ${weekNumber(monday)}`}
            className="flex justify-center bg-background pt-1.5 text-control text-muted-foreground tabular-nums transition-colors hover:bg-accent hover:text-foreground">
            {weekNumber(monday)}
          </button>
        </Tip>
        {weekDays.map((day) => {
          const key = dayKey(day)
          return <Cell key={key} wide={wide} day={day} lines={linesOf(on.get(key))} today={today} outside={!!shown && !day.isSame(shown, 'month')} count={marking ? (opens.get(key) ?? 0) : 0} caught={caught.get(key)} flags={marksOn(marks, key)}
            room={room - laid.lanes} reserve={laid.lanes} adding={adding === key} onDay={onDay} onLine={open} onPickLine={onTask ? undefined : (line) => line.kind !== 'back' && setPickedTask(line.task.id)} lineMenu={(line) => (line.kind === 'back' ? [] : taskMenu(line.task, { open: () => open(line), now: taskNow.current }))} onItem={item}
            // The draft of what is being made here leads the day's things, and the popover is tied to it.
            extra={draftAt && draftAt.day === key ? [<DraftMark key="draft" shape="line" kind={draftAt.kind} color={draftColor} at={placeKey(draftAt)} />, ...(dayExtra?.(key) ?? [])] : dayExtra?.(key)}
            onAdd={() => (onAddDay ? onAddDay(key) : openAdd({ day: key, minute: null, length: 0, kind: 'task' }))}
            onPress={onDrawDays && ((event) => onDrawDays(event, key))}
            onPick={onPickDay ? () => onPickDay(key) : own ? () => setPickedOwn(key) : undefined}
            menu={dayMenu ? () => dayMenu(key) : own ? () => addLines(openAdd, key, null) : undefined} />
        })}
        {/* The week's bars, each one piece across the days it covers, under the dates. */}
        {laid.placed.length > 0 && (
          <div data-month-bars className="pointer-events-none absolute inset-x-0 grid gap-x-px px-px" style={{ top: HEAD() + (edge ? 1 : 0), gridTemplateColumns: '2rem repeat(7, minmax(0, 1fr))', gridAutoRows: `${LINE()}px`, rowGap: 0 }}>
            {laid.placed.map(({ bar, from, to, lane }) => (
              <div key={`${bar.key}:${dayKey(monday)}`} className="pointer-events-auto grid min-w-0 px-1" style={{ gridColumn: `${from + 2} / ${to + 3}`, gridRow: lane + 1 }}>{bar.render(dayKey(weekDays[from]))}</div>
            ))}
          </div>
        )}
      </div>
    )
  }

  // Home's six weeks: each week as tall as its busiest day asks, within limits: a busy week grows, a quiet one gives up its room.
  const sixWeeks = (): React.JSX.Element => {
    const mondays = Array.from({ length: ROWS }, (_, at) => days[at * 7])
    const laid = mondays.map((monday) => layBars(bars, dayKey(monday), dayKey(monday.add(6, 'day'))))
    const busiest = mondays.map((monday, at) => Math.max(...Array.from({ length: 7 }, (_, d) => {
      const key = dayKey(monday.add(d, 'day'))
      return linesOf(on.get(key)).length + (dayExtra?.(key).length ?? 0) + marksOn(marks, key).length
    })) + laid[at].lanes)
    // A quiet week keeps room for a line or two; a busy one grows up to about three times that.
    const weights = busiest.map((most) => 1 + Math.min(6, most) * 0.3)
    const whole = weights.reduce((sum, one) => sum + one, 0)
    return (
      <AnimatePresence initial={false} custom={way}>
        <motion.div key={month.format('YYYY-MM')} data-month-grid={month.format('YYYY-MM')} custom={way}
          variants={{
            in: ({ dir }: typeof way) => ({ transform: `translateX(${dir * 100}%)` }),
            at: { transform: 'translateX(0%)' },
            out: ({ dir, instant }: typeof way) => ({ transform: `translateX(${dir * -100}%)`, transition: still || instant ? { duration: 0 } : SLIDE }),
          }}
          initial={still || way.instant ? false : 'in'} animate="at" exit="out" transition={still || way.instant ? { duration: 0 } : SLIDE}
          className="absolute inset-0 grid gap-px" style={{ gridTemplateRows: weights.map((one) => `minmax(0, ${one}fr)`).join(' ') }}>
          {mondays.map((monday, at) => week(monday, linesIn(row * ROWS * (weights[at] / whole)), laid[at], month, at === 0))}
        </motion.div>
      </AnimatePresence>
    )
  }

  const plan = (
    <section ref={frame} data-month-plan data-month-own={own || undefined} data-month-shown={month.format('YYYY-MM')} className={`flex flex-col gap-2 ${bare ? 'min-h-0 flex-1' : ''}`}>
      {/* The day picked wears the small month's mark: a quiet band of the accent behind its date. */}
      {own && pickedTask && <style>{`[data-month-own] [data-plan-task="${CSS.escape(pickedTask)}"] { outline: 2px solid ${openedOwn && openedTask ? 'var(--ring)' : 'color-mix(in oklab, var(--ring) 45%, transparent)'} !important; outline-offset: -2px !important }`}</style>}
      {own && pickedOwn && <style>{`[data-month-own] [data-day="${pickedOwn}"] [data-day-number] { box-shadow: 0 0 0 3px var(--accent) } [data-month-own] [data-day="${pickedOwn}"] [data-day-number]:not([aria-current]) { background: var(--accent) }`}</style>}
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
      {/* The days are measured while a task is carried. On the run never before: every week coming into sight measured all
          84 days again (a getBoundingClientRect each, with a restyle), most of a fling's long frames. */}
      <DndContext accessibility={dragWords} sensors={sensors} collisionDetection={pointerWithin} autoScroll={false} measuring={{ droppable: { strategy: bare ? MeasuringStrategy.WhileDragging : MeasuringStrategy.Always, frequency: 120 } }}
        onDragStart={({ active, activatorEvent }) => { chime('lift'); holdEdges(); fromDay.current = true; liftedFrom.current = (activatorEvent.target as Element | null)?.closest<HTMLElement>('[data-day]')?.dataset.day ?? null; setOverDay(null); holding.current = active.data.current as { line?: Line; mark?: Milestone }; setCarried(holding.current.mark ? { kind: 'mark', one: holding.current.mark } : holding.current.line!) }}
        onDragOver={({ over }) => (fromDay.current ? ticks.start(over?.id) : ticks(over?.id), (fromDay.current = false), setOverDay(over ? String(over.id) : null))}
        onDragCancel={() => (letEdges(), setCarried(null))}
        onDragEnd={({ over }) => {
          letEdges()
          setCarried(null)
          // Kept from the lift: scrolling to another month takes the chip's own day, and its data, off the screen.
          const { line, mark } = holding.current ?? {}
          holding.current = null
          if (mark) return over ? void moveMark(mark, String(over.id)) : chime('stay')
          if (!line) return
          if (!over || line.kind === 'back' || line.kind === 'ready') return chime('stay')
          moveToDay(line.task, String(over.id), line.kind)
        }}>
      <div className={`flex flex-col overflow-hidden rounded-none border bg-border ${bare ? 'min-h-0 flex-1' : ''}`}>
        <div data-cal-names={bare || undefined} className={COLS} aria-hidden>
          <div className="bg-background px-1 py-1 text-center text-control font-medium text-muted-foreground">Wk</div>
          {days.slice(0, 7).map((day) => (
            <div key={day.format('d')} data-month-weekday={day.day() === 0 || day.day() === 6 ? 'weekend' : 'weekday'} className={`bg-background px-2 py-1 text-control font-medium ${day.day() === 0 || day.day() === 6 ? 'text-muted-foreground' : 'text-(--mf-muted-strong)'}`}>{day.format('ddd')}</div>
          ))}
        </div>
        {bare
          // The weeks grow and shrink with a pinch (cal-pinch.ts) inside this frame: the day names over them stay put.
          ? <div className="flex min-h-0 flex-1 flex-col overflow-clip">
              <WeekRun body={body} row={row} held={held ?? month} still={still} bars={bars} lines={linesIn} sign={sign}
                onShown={(to) => (setShown(to), onShown?.(to))} week={week} />
            </div>
          : <div ref={body} data-month-scroll className="relative min-h-0 overflow-hidden" style={{ height: 'max(40.5rem, calc(100vh - 22rem))' }}>{sixWeeks()}</div>}
      </div>
      {/* The one card every carry rides in (carry.tsx), saying the day letting go puts it on; over its own day, nothing. */}
      <Overlay dropAnimation={SETTLE}>
        {carried && carried.kind !== 'back' && <CarriedCard title={carried.kind === 'mark' ? `${carried.one.icon ? `${carried.one.icon} ` : ''}${carried.one.title}` : taskName(carried.task.title).text}
          words={overDay && overDay !== liftedFrom.current ? `Move to ${dayjs(overDay).format('ddd D MMM')}` : null} />}
      </Overlay>
      </DndContext>
      <DotsKey opened={marking} captures={counting} />
      {!onSide && <DaySide ask={mine} onClose={() => setMine(null)} onOpen={onOpen} />}
      {drawn && <AddPopover key={`${leftAdd.turn}|${drawn.day}|${drawn.words ?? ''}`} add={drawn} level={frame} onChange={changeAdd} onClose={() => setAdd(null)} onAgain={openAdd} onGone={leftAdd.gone} leaving={!add} />}
      {own && drawnOpen && drawnTask && <OpenPopover key={`${leftOpen.turn}|${drawnOpen.id}|${drawnOpen.words ?? ''}`} opened={{ kind: 'task', ...drawnOpen }} task={drawnTask} level={frame} onClose={() => setOpenedOwn(null)} onGone={leftOpen.gone} leaving={!openOwn} onAgain={(words) => (setPickedTask(drawnOpen.id), setOpenedOwn({ ...drawnOpen, words }))}
        onPage={() => (chime('open'), setOpenedOwn(null), setMine({ task: drawnOpen.id }))} onKey={() => undefined} />}
      {/* On the Calendar its line is always kept, so the weeks do not change height from month to month. */}
      {(!inMonth || bare) && <p data-month-empty={!inMonth || undefined} aria-hidden={inMonth > 0 || undefined} className={`px-1 text-body text-foreground/85 ${inMonth ? 'invisible' : ''}`}>Nothing planned in {month.format('MMMM')}. Give a task a day, like “call the dentist friday”, or double-click a day to add one.</p>}
    </section>
  )
  // Its own popover's root, so the draft drawn in a day is what the popover is tied to; on the Calendar the page's root is that.
  return own ? <Popover open={!!add || !!(openedOwn && openedTask)} onOpenChange={(open) => void (!open && (setAdd(null), setOpenedOwn(null)))}>{plan}</Popover> : plan
}

/** The run's first week, and how many there are: every week from 1900 to 2200, far past any plan, drawn only near the screen. */
const EPOCH = dayjs('1900-01-01').startOf('week')
const WEEKS = 15_650
const weekAt = (index: number): Dayjs => EPOCH.add(index * 7, 'day')
const indexOf = (day: Dayjs): number => Math.round(day.startOf('week').hour(12).diff(EPOCH.hour(12), 'hour') / (7 * 24))
const RUN_RULES = '[data-month-run] [data-outside] [data-day-number]:not([aria-current]) { color: var(--muted-foreground); font-weight: 400 } [data-month-run] [data-outside] :is([data-plan-more], [data-plan-task]) { --foreground: var(--muted-foreground); color: var(--foreground) } [data-month-run] [data-outside] :is([data-plan-more], [data-plan-task], [data-mark-flag]) :is(svg, img) { opacity: 0.5 }'
/** How long the wheel stays quiet before a gesture counts as over: longer than the gap between a fast wheel's notches. */
const IDLE = 140
/** A trackpad's glide follows the fingers' last step within two frames: the wheel quiet this long after a lift, there is none. */
const NO_GLIDE = 32
/** Sent further than this many weeks, the run sets off from this far short, there at once: the eye follows the last of the way, never a year of weeks streaming past. */
const FAR = 10
/** Weeks drawn past those in sight, above and below, so a fling never shows a row not yet drawn: 2 + 6 + 3, eleven in all. */
const OVER = 2
/** The month a week at the top names: the month of its last day, so a month is named once its first week reaches the top. */
const monthAt = (index: number): Dayjs => weekAt(index).add(6, 'day').startOf('month')
/**
 * One week of the run, drawn again only when what it shows changed (the month's data, the month named, its height),
 * never because the run scrolled: a fling draws just the weeks coming into sight.
 */
const RunWeek = memo(function RunWeek({ index, row, room, bars, week }: { index: number; row: number; room: number; bars: Bar[]; week: WeekDraw; said: unknown[] }): React.JSX.Element {
  const monday = weekAt(index)
  // One pixel of the grid's line under each week, as between days. The month named dims the days outside it by a
  // rule the run writes (WeekRun), so a new month at the top draws no week again.
  return week(monday, room, layBars(bars, dayKey(monday), dayKey(monday.add(6, 'day'))), null, false, { top: index * row, height: row - 1 })
}, (a, b) => a.index === b.index && a.row === b.row && a.room === b.room && a.said.length === b.said.length && a.said.every((one, at) => one === b.said[at]))
type WeekDraw = (monday: Dayjs, room: number, laid: ReturnType<typeof layBars>, shown: Dayjs | null, edge: boolean, place?: React.CSSProperties) => React.JSX.Element
/** The month at the top of the Calendar's run while it scrolls, for its heading alone to follow; null when no run is up. */
const passing = (() => {
  let now: Dayjs | null = null
  const heard = new Set<() => void>()
  return {
    get: (): Dayjs | null => now,
    set: (to: Dayjs | null): void => void (now?.format('YYYY-MM') !== to?.format('YYYY-MM') && ((now = to), heard.forEach((one) => one()))),
    listen: (one: () => void): (() => void) => (heard.add(one), () => void heard.delete(one))
  }
})()
/** The month the run is passing, or `fallback`: what the Calendar's heading says in Month, drawn alone as the run scrolls. */
export function Passing({ fallback, say }: { fallback: Dayjs; say: (month: Dayjs) => string }): string {
  return say(useSyncExternalStore(passing.listen, passing.get) ?? fallback)
}
/** Where the run was, kept for the page opened again on the same month: the week at its top. */
let kept: { month: string; index: number } | null = null

/**
 * The Calendar's weeks as one column that scrolls: the trackpad's own scroll and glide, then a firm spring onto a
 * week as the fingers lift, five weeks to the height of the box. Only the eleven weeks near the screen are drawn; the rest is room. As a new
 * month's first week reaches the top the heading names it (`Passing`) with one firm tap, and nothing else is drawn
 * again; the page above is told the month once the run comes to rest. Asked for another month
 * (the arrows, Today, a key), it glides there, or is there at once by a key or with Motion off or Reduce motion.
 */
function WeekRun({ body, row, held, still, bars, lines, sign, onShown, week }: {
  body: React.RefObject<HTMLDivElement | null>
  row: number
  held: Dayjs
  still: boolean
  bars: Bar[]
  lines: (height: number) => number
  sign: (monday: Dayjs) => unknown[]
  onShown: (month: Dayjs) => void
  week: WeekDraw
}): React.JSX.Element {
  const heldKey = held.format('YYYY-MM')
  const [top, setTop] = useState(() => (kept?.month === heldKey ? kept.index : indexOf(held.startOf('month'))))
  // The month the run names now, read from the scroll; while the run glides where it was sent, it names nothing on the way.
  const named = useRef(heldKey)
  // The month named, for the days outside it to dim: kept here, so naming another draws only this rule again.
  const [dim, setDim] = useState(heldKey)
  const gliding = useRef(false)
  // While the run glides where it was sent, the week it is going to: every week on the way is drawn before it sets
  // off, so none is drawn while it moves (drawn on the way, each cost the glide a frame, and at its fastest the glide
  // outran them and showed bare rows).
  const [toward, setToward] = useState<number | null>(null)
  const placed = useRef(false)
  // The weeks drawn now, and whether a place on the run shows only those.
  const drawn = useRef<[number, number]>([0, -1])
  const inSight = (place: number): boolean => Math.floor(place / row) >= drawn.current[0] && Math.floor(place / row) + SCREEN <= drawn.current[1]
  const where = (el: HTMLElement): number => Math.floor(el.scrollTop / row + 0.02)
  const settle = (el: HTMLElement, tap: boolean): void => {
    const at = where(el)
    const month = monthAt(at)
    kept = { month: month.format('YYYY-MM'), index: at }
    setTop(at)
    if (month.format('YYYY-MM') === named.current) return
    named.current = month.format('YYYY-MM')
    setDim(named.current)
    passing.set(month)
    if (tap) edge()
  }
  // At rest, the page above is told the month: its reads, its arrows and Today follow from there.
  const rest = (): void => void (named.current !== heldKey && onShown(dayjs(`${named.current}-01`)))
  // Gone, the heading goes back to the page's own month.
  useEffect(() => () => passing.set(null), [])
  // Placed before the first paint, and kept on its week when the box changes height.
  useLayoutEffect(() => {
    const el = body.current
    if (!el || !row) return
    el.scrollTop = top * row
    placed.current = true
  }, [row]) // eslint-disable-line react-hooks/exhaustive-deps
  // When the wheel last moved (a trackpad's glide sends wheel events too), and the frame that waits for it to go quiet.
  const wheeled = useRef(-Infinity)
  // Over the weeks while they move, so the days under the pointer do not light up and tip as they pass: one element
  // shown and hidden, nothing under it restyled (pointer-events on the weeks themselves restyled every day drawn).
  const shield = useRef<HTMLDivElement>(null)
  const moved = useRef(-Infinity)
  const quiet = useRef(0)
  const end = useRef<(landed?: boolean, tap?: boolean) => void>(() => {})
  // The spring taking the run onto a week, its speed as the wheel last gave it, whether the fingers are on the pad
  // (the Mac's word), whether the trackpad's glide after a lift may still be running, where a landing begun at the
  // lift set off from (a glide that follows after all turns it from there), and whether the run has moved since it
  // last rested.
  const landing = useRef<Landing | null>(null)
  const pace = useRef(0)
  const touching = useRef(false)
  const glide = useRef(false)
  const early = useRef<number | null>(null)
  const moving = useRef(false)
  const holding = useRef(0)
  useEffect(() => () => (cancelAnimationFrame(quiet.current), cancelAnimationFrame(holding.current), landing.current?.stop(), undefined), [])
  // Sent to another month by the page above: to its first week. By a key, or with Motion off, Reduce motion or
  // “Smooth scrolling” off, it is there at once. By the arrows and “Today” it glides on the app's own spring, the calm
  // one (lib/snap.ts): a second press turns it on its way, a touch or the wheel stops it where it is.
  useEffect(() => {
    const el = body.current
    if (!el || !row || heldKey === named.current) return
    named.current = heldKey
    setDim(heldKey)
    passing.set(held.startOf('month'))
    const to = indexOf(held.startOf('month')) * row
    if (Math.abs(el.scrollTop - to) < 1) return
    const instant = still || byKeys() || glideWay() === 'instant'
    const near = Math.abs(el.scrollTop - to) <= FAR * row
    if (landing.current && gliding.current && !instant && near) return setToward(to / row), landing.current.aim(to)
    cancelAnimationFrame(holding.current)
    el.style.overflowY = ''
    landing.current?.stop()
    landing.current = null
    early.current = null
    gliding.current = false
    // (`void`: scrollTo answers with a promise in this Chromium, and an effect may only hand back a way to undo itself.)
    if (instant) return void el.scrollTo({ top: to, behavior: 'instant' })
    gliding.current = true
    const from = near ? el.scrollTop : to - Math.sign(to - el.scrollTop) * FAR * row
    if (!near) el.scrollTop = from
    setToward(to / row)
    const one = land(from, 0, to, (value) => void (el.scrollTop = value), (landed) => {
      landing.current = null
      setToward(null)
      // At rest it says the month and hides the shield; no tap: nothing was let go of.
      if (landed) end.current(true, false)
    }, CALM)
    if (one.running) landing.current = one
  }, [heldKey]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const el = body.current
    if (!el) return
    // While the weeks move, the shield is up: the days passing under the pointer neither light up nor tip.
    const scrolled = (event: Event): void => {
      moved.current = event.timeStamp
      moving.current = true
      if (shield.current?.hidden) shield.current.hidden = false
      if (!row || !placed.current) return
      if (gliding.current) return setTop(where(el))
      // A landing whose weeks are all drawn draws nothing on its way: a week drawn then (80ms of the development
      // build) held the page while the browser played the trackpad's glide on, past the week. It says where it is at rest.
      if (landing.current && inSight(el.scrollTop) && inSight(landing.current.to)) return
      settle(el, true)
    }
    // Onto a week, firmly (lib/snap.ts): the week the run is heading for, read from its speed, by a spring with no
    // bounce. While the trackpad's own glide is still running the run is held (it cannot scroll), so the glide's
    // last steps do not fight the spring; a new touch, or a mouse wheel's next notch, takes the run back at once.
    const free = (): void => void (cancelAnimationFrame(holding.current), (el.style.overflowY = ''), landing.current?.stop(), (landing.current = null), (early.current = null), (gliding.current = false))
    // Landed while the glide still runs: the run stays held until the glide's steps stop coming. A glide's end is not
    // an event the page is told of, so a frame looks at when the wheel last spoke.
    const letRun = (): void => {
      if (glide.current && performance.now() - wheeled.current <= 100) return void (holding.current = requestAnimationFrame(letRun))
      glide.current = false
      el.style.overflowY = ''
    }
    const within = (to: number): number => Math.max(0, Math.min((WEEKS - SCREEN) * row, to))
    // Never under fingers still on the pad: with the Mac's word that they are down, the run waits for them to lift.
    const snapNow = (speed: number, atLift = false): void => {
      if (!row || landing.current || !moving.current || touching.current) return
      cancelAnimationFrame(quiet.current)
      quiet.current = 0
      gliding.current = false
      const at = el.scrollTop
      const to = within(stopFor(at, speed, row))
      if (glide.current) el.style.overflowY = 'hidden'
      early.current = atLift ? at : null
      // Where the run really is, each frame: the browser plays a trackpad's glide on its own thread, and goes on doing
      // so until it hears the run is held, a frame later or, behind a busy frame, several. Pushed past its week that
      // way, the landing goes on to the next week the same way, from where the run is: never back.
      const real = (): number => {
        const now = el.scrollTop
        const one = landing.current
        // The way it is going now, from where the spring has it to its week (a glide come late may have turned it since it set off).
        const way = one ? Math.sign(one.to - one.at) : 0
        if (one && way && (now - one.to) * way > 0.5) one.aim(within((way > 0 ? Math.ceil(now / row) : Math.floor(now / row)) * row))
        return now
      }
      const one = land(at, speed, to, (value) => void (el.scrollTop = value), (landed) => {
        landing.current = null
        early.current = null
        if (landed) end.current(true, Math.abs(el.scrollTop - at) > 1)
        letRun()
      }, undefined, real)
      if (one.running) landing.current = one
    }
    const wheel = (event: WheelEvent): void => {
      const gap = event.timeStamp - wheeled.current
      wheeled.current = event.timeStamp
      // The run's speed, a second's worth, evened over its last few steps; read from the wheel, never from the page's layout.
      pace.current = gap > 100 ? 0 : pace.current * 0.5 + (event.deltaY / Math.max(4, gap)) * 1000 * 0.5
      // A step long after the last is no glide: a mouse wheel's notch, or fingers the Mac did not announce.
      if (gap > 100) glide.current = false
      if (landing.current && !glide.current) return free()
      // A glide's step after a landing begun at the lift (a busy frame held the step back): the landing turns for the
      // week the glide is heading to, from where it is and with the speed it has, and only ever further the glide's way.
      if (landing.current && early.current !== null) {
        const to = within(stopFor(early.current, pace.current, row))
        if ((to - landing.current.to) * Math.sign(pace.current) > 0) landing.current.aim(to, pace.current)
        return
      }
      // The fingers have lifted and the glide has slowed to under five weeks a second: it lands now, not when the glide dies away.
      if (glide.current && !landing.current && Math.abs(pace.current) < row * 5) snapNow(pace.current)
    }
    // The Mac's word that the fingers touched or lifted (main, as for Back and Forward's swipe; a probe says the same).
    const phase = (kind: string): void => {
      if (kind === 'began') return void ((touching.current = true), (glide.current = false), free())
      if (kind !== 'ended') return
      touching.current = false
      glide.current = true
      // Lifted from a flick, the trackpad's glide follows the fingers' last step within two frames, and the wheel says
      // when it has slowed. Lifted from rest there is no glide, and nothing says so but the wheel staying quiet: two
      // frames of that since its last step (already so when the fingers had stopped before they lifted, and then it
      // lands on this very frame), and the run lands from rest. It never waits to be sure: a glide that comes after
      // all turns the landing on its way (the wheel, above).
      cancelAnimationFrame(holding.current)
      const look = (now: number): void => {
        if (!glide.current || landing.current) return
        if (now - wheeled.current < NO_GLIDE) return void (holding.current = requestAnimationFrame(look))
        pace.current = 0
        snapNow(0, true)
      }
      look(performance.now())
    }
    const probed = (event: Event): void => phase(String((event as CustomEvent).detail))
    window.addEventListener('haligtree:swipe-phase', probed)
    const unhear = window.api.onSwipePhase?.(phase)
    // Come to rest once the whole gesture is over: onto the nearest week. A scroll ends after each notch of a mouse wheel
    // too; settled there, the glide back to a week cancelled the notches still to come and a fast wheel lost most of its
    // way. So without the Mac's word it waits until the wheel has been quiet a moment and the scroll has stopped. Done
    // here rather than by CSS scroll snap, which snaps only to weeks already drawn and so, sent a year away, pulled back
    // to the weeks it left. `tap`: one light tap as a run let go of lands on its week.
    // Nor while something carried holds it at an edge (lib/edge-scroll.ts): it rests once let go of.
    const ended = (landed = false, tap = landed): void => {
      if (!row || landing.current || touching.current || 'edgeHeld' in el.dataset) return
      if (performance.now() - wheeled.current < IDLE && !landed) {
        if (quiet.current) return
        // Read from the events' own times, never the scroll's place: read each frame, that made the page lay itself out again.
        const look = (now: number): void => {
          quiet.current = 0
          if (now - wheeled.current < IDLE || now - moved.current < 50) return void (quiet.current = requestAnimationFrame(look))
          end.current()
        }
        quiet.current = requestAnimationFrame(look)
        return
      }
      const near = Math.round(el.scrollTop / row) * row
      if (Math.abs(el.scrollTop - near) > 0.5) return (pace.current = 0), (glide.current = false), snapNow(0)
      gliding.current = false
      moving.current = false
      if (shield.current) shield.current.hidden = true
      settle(el, false)
      rest()
      // (A month's first week has had its firm tap on the way.)
      if (tap) detent()
    }
    end.current = ended
    const scrollEnded = (): void => ended()
    el.addEventListener('scroll', scrolled, { passive: true })
    el.addEventListener('scrollend', scrollEnded)
    el.addEventListener('wheel', wheel, { passive: true })
    return () => (el.removeEventListener('scroll', scrolled), el.removeEventListener('scrollend', scrollEnded), el.removeEventListener('wheel', wheel),
      window.removeEventListener('haligtree:swipe-phase', probed), unhear?.())
  })
  // Each day drawn is marked when it is outside the month named, straight on the page: naming another month restyles
  // only the days that change, never the window.
  useLayoutEffect(() => {
    for (const cell of body.current?.querySelectorAll<HTMLElement>('[data-day]') ?? []) {
      const out = !cell.dataset.day?.startsWith(`${dim}-`)
      if (out !== cell.hasAttribute('data-outside')) cell.toggleAttribute('data-outside', out)
    }
  })
  const room = lines(row)
  // Drawn in steps of two weeks, so a fling commits a new set of weeks every other week rather than every week.
  const base = top - (top % 2)
  const far = toward === null ? base : toward - (toward % 2)
  const firstDrawn = Math.max(0, Math.min(base, far) - OVER)
  const lastDrawn = Math.min(WEEKS - 1, Math.max(base, far) + SCREEN + OVER)
  useLayoutEffect(() => void (drawn.current = [firstDrawn, lastDrawn]))
  return (
    <div ref={body} data-month-scroll data-month-run={dim} data-cal-body data-unfaded className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain [scrollbar-width:none]">
      {/* The days outside the month named, dimmed as on Home's month. A rule that never changes: rewritten for each month, it made the whole window restyle. */}
      <style>{RUN_RULES}</style>
      <div ref={shield} hidden aria-hidden className="sticky top-0 z-20" style={{ height: row * SCREEN, marginBottom: -row * SCREEN }} />
      <div style={{ height: WEEKS * row }} className="relative">
        {row > 0 && Array.from({ length: lastDrawn - firstDrawn + 1 }, (_, at) => {
          const monday = weekAt(firstDrawn + at)
          const laid = layBars(bars, dayKey(monday), dayKey(monday.add(6, 'day'))).placed.map(({ bar, from, to, lane }) => `${bar.key}:${from}:${to}:${lane}`).join()
          return <RunWeek key={firstDrawn + at} index={firstDrawn + at} row={row} room={room} bars={bars} week={week} said={[laid, ...sign(monday)]} />
        })}
      </div>
    </div>
  )
}

function Cell({ wide, day, lines, today, outside, count, caught, flags, adding, onAdd, onPress, onPick, menu, onDay, onLine, onPickLine, lineMenu, onItem, room, reserve = 0, extra = [] }: {
  /** A press on the day's empty part, which may become a drag across days. */
  onPress?: (event: React.PointerEvent) => void
  /** Room for each thing by name; narrow (a small window), a dot for each and the count. */
  wide: boolean
  day: Dayjs
  /** Lines kept empty under the date for the week's bars. */
  reserve?: number
  extra?: React.ReactNode[]
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
  /** A click on the day's empty part picks it, and a double-click adds; left out, a click adds. */
  onPick?: () => void
  /** The day's own right-click menu, on its empty part. */
  menu?: () => RowItem[]
  onDay: (day: string) => void
  /** A line opened: a click on it, or ↵. `at` is the line itself, for its popover to be tied to. */
  onLine: (line: Line, at?: HTMLElement | null) => void
  /** A line clicked: picked. Left out where the page marks what is picked itself (the Calendar). */
  onPickLine?: (line: Line) => void
  /** A task's own right-click menu, on its line. */
  lineMenu?: (line: Line) => RowItem[]
  /** Where what a marked day points at opens. */
  onItem: (type: string, id: string) => void
}): React.JSX.Element {
  const key = dayKey(day)
  const { setNodeRef, isOver } = useDroppable({ id: key })
  // As many one-line chips as the day has room for (each marked day takes one), events first. All of them when they
  // fit; otherwise one line is kept for "+N more", which opens the rest.
  const roomy = Math.max(1, room - flags.length)
  const total = extra.length + lines.length + flags.length
  const all = extra.length + lines.length <= roomy
  const events = all ? extra : extra.slice(0, Math.max(0, roomy - 1))
  const shown = all ? lines.length : Math.max(0, roomy - 1 - events.length)
  const hiddenCount = extra.length - events.length + lines.length - shown
  const weekend = day.day() === 0 || day.day() === 6
  const gone = key < today
  const late = gone && lines.some((line) => line.kind === 'planned' || line.kind === 'due')
  // The day's empty part: anywhere in it that is not one of its things (each a button of its own) nor the draft being written.
  const empty = (event: React.MouseEvent): boolean => !(event.target as Element).closest('button, a, [role="button"], [data-cal-draft]')
  // Under the pointer a day takes a very faint fill (2 to 3% of the ink over what it rests at), so it is plain which day a click or a double-click is about.
  const rest = weekend && !outside ? 'bg-[color-mix(in_oklab,var(--background)_98%,var(--foreground))] hover:bg-[color-mix(in_oklab,var(--background)_95.5%,var(--foreground))]' : 'bg-background hover:bg-[color-mix(in_oklab,var(--background)_97.5%,var(--foreground))]'
  const cell = (
    <div ref={setNodeRef} data-day={key} data-outside={outside || undefined} data-shown={shown} data-planned={lines.length || undefined} data-opened={count ? openedLevel(count) : undefined} data-captured={caught === undefined ? undefined : caught && caughtLevel(caught)} data-late={late || undefined} data-weekend={weekend || undefined}
      onPointerDown={onPress && ((event) => empty(event) && onPress(event))}
      onClick={(event) => empty(event) && (onPick ? onPick() : (chime('tap'), onAdd()))}
      onDoubleClick={onPick ? (event) => empty(event) && onAdd() : undefined}
      className={`group/day relative flex min-h-0 min-w-0 cursor-pointer flex-col overflow-hidden p-1.5 transition-colors ${onPress ? 'select-none' : ''} ${isOver ? 'bg-accent ring-1 ring-foreground/25 ring-inset' : adding ? 'bg-[color-mix(in_oklab,var(--foreground)_7%,var(--background))]' : rest} ${outside ? '[&_:is([data-plan-more],[data-plan-task])]:[--foreground:var(--muted-foreground)] [&_:is([data-plan-more],[data-plan-task])]:text-foreground [&_:is([data-plan-more],[data-plan-task],[data-mark-flag])_:is(svg,img)]:opacity-50' : ''}`}>
      <div className="flex items-center gap-1.5">
        <button type="button" onClick={() => (chime('open'), onDay(key))} aria-label={`Open ${day.format('dddd D MMMM')}${count ? `. Opened ${APP_NAME}${count > 1 ? ` ${num(count)} times` : ''}` : ''}${caught ? `. ${plural(caught, 'capture')}` : caught === 0 ? '. Nothing captured' : ''}`}
          aria-current={key === today ? 'date' : undefined}
          data-day-number className={`flex h-6 min-w-6 shrink-0 items-center justify-center rounded-md px-1 text-control tabular-nums transition-colors hover:bg-accent ${key === today ? 'bg-[var(--tt-color-text-red)] font-semibold text-white hover:bg-[var(--tt-color-text-red)]' : outside ? 'text-muted-foreground' : day.date() === 1 ? 'font-semibold text-foreground' : 'text-foreground'}`}>
          {day.date() === 1 ? day.format('D MMM') : day.date()}
        </button>
        {/* The dots say what the day held: a click opens the day's page, where it is. */}
        {(count > 0 || caught !== undefined) && (
          <Tip label={`${[count ? `Opened ${APP_NAME}${count > 1 ? ` ${num(count)} times` : ''}` : '', caught ? `${plural(caught, 'capture')}` : caught === 0 ? 'Nothing captured' : ''].filter(Boolean).join(', ')}. Click to open the day`}>
            <button type="button" data-day-dots tabIndex={-1} onClick={() => (chime('open'), onDay(key))} className="flex h-5 items-center rounded-sm px-1 transition-colors hover:bg-accent"><DayDots opened={count} caught={caught} /></button>
          </Tip>
        )}
      </div>
      {/* The bars' lanes; a bar's chip keeps its own 2px under the date, as every tinted chip does. */}
      {reserve > 0 && <span aria-hidden className="shrink-0" style={{ height: reserve * LINE() }} />}
      {/* Wide enough, each thing by name; narrow (a small window), a dot for each and the count, never words cut to a letter. */}
      {wide && <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {flags.map((one) => <MarkLine key={one.id} one={one} onItem={onItem} onDay={onDay} />)}
        {events}
        {lines.slice(0, shown).map((line) => <LineChip key={lineKey(line)} line={line} late={gone} onOpen={onLine} onPick={onPickLine} menu={lineMenu} />)}
      </div>}
      {/* "+N more" sits outside the clipped list, so it is never cut. */}
      {wide && <div className="shrink-0">
        {events.length < extra.length && <button type="button" data-plan-more-events onClick={() => (chime('open'), onDay(key))} className="mf-hit relative h-5 w-full shrink-0 truncate rounded-sm px-1 text-left text-control font-medium text-foreground hover:bg-accent">+{num(hiddenCount)} more</button>}
        {lines.length > shown && events.length === extra.length && <More day={day} lines={lines} hidden={lines.length - shown} gone={gone} onDay={onDay} onLine={onLine} />}
      </div>}
      {total > 0 && !wide && (
        <button type="button" data-month-dots={total} aria-label={`Open ${day.format('dddd D MMMM')}: ${plural(total, 'thing')}`} onClick={() => (chime('open'), onDay(key))}
          className="flex h-5 min-w-0 shrink-0 items-center gap-1 rounded-sm px-1 text-meta text-(--mf-muted-strong) tabular-nums hover:bg-accent">
          <span aria-hidden className="flex gap-0.5">{Array.from({ length: Math.min(3, total) }, (_, at) => <span key={at} className={`size-1.5 rounded-full ${gone && lines.length ? 'bg-[var(--tt-color-text-orange)]' : 'bg-foreground/55'}`} />)}</span>
          {num(total)}
        </button>
      )}
    </div>
  )
  return menu ? <RowMenu items={menu}>{cell}</RowMenu> : cell
}

/** A marked day's line in a day: clicked to open what it belongs to, right-clicked for its menu, dragged to another day. */
function MarkLine({ one, onItem, onDay }: { one: Milestone; onItem: (type: string, id: string) => void; onDay: (day: string) => void }): React.JSX.Element {
  const { setNodeRef, listeners, attributes, isDragging } = useDraggable({ id: `mark:${one.id}`, data: { mark: one } })
  return <MarkChip ref={setNodeRef} one={one} open={onItem} onOpenDay={(day) => (chime('open'), onDay(day))} {...attributes} {...listeners}
    className={`touch-none ${isDragging ? 'mf-carried-place' : ''}`} />
}

/** Something across several days, drawn as one bar per week it touches; `render` gets the first day shown of it in that week. */
export type Bar = { key: string; from: string; to: string; render: (day: string) => React.ReactNode }

/** The bars that touch a week (from Monday to Sunday), each in the first lane where it fits. */
function layBars(bars: Bar[], monday: string, sunday: string): { placed: { bar: Bar; from: number; to: number; lane: number }[]; lanes: number } {
  const index = (key: string): number => Math.round(dayjs(key).hour(12).diff(dayjs(monday).hour(12), 'hour') / 24)
  const ends: number[] = []
  const placed = bars.filter((bar) => bar.from <= sunday && bar.to >= monday).sort((a, b) => a.from.localeCompare(b.from) || b.to.localeCompare(a.to)).map((bar) => {
    const from = Math.max(0, index(bar.from))
    const to = Math.min(6, index(bar.to))
    let lane = ends.findIndex((end) => end < from)
    if (lane < 0) lane = ends.length
    ends[lane] = to
    return { bar, from, to, lane }
  })
  return { placed, lanes: ends.length }
}

/** Where the last press went down, so a click at the end of a carry or a stretch (the pointer far from it) is not a click. */
let pressed = { x: 0, y: 0 }
if (typeof window !== 'undefined') window.addEventListener('pointerdown', (event) => void (pressed = { x: event.clientX, y: event.clientY }), true)

/**
 * A click on a task or an event on the Calendar opens it, as a row of Upcoming does; with ⇧ or ⌘ held it only picks it
 * (ringed, for ↵, ⌫ and ⌘K), and the click that ends a carry or a stretch opens nothing. ↵ and Space always open.
 */
export const clickOpens = (event: React.MouseEvent): boolean =>
  event.detail === 0 || (!event.shiftKey && !event.metaKey && Math.hypot(event.clientX - pressed.x, event.clientY - pressed.y) < 4)

/**
 * A task's or a note's line in a day. A task's is dragged to move it and opened by a click or ↵, as an event's chip is
 * (⇧- or ⌘-click only picks it); in the list "+N more" opens (`drag` off), a click opens it too, as a row of any list
 * does. A note coming back opens on a click: it is a way to its note.
 */
function LineChip({ line, late, onOpen, onPick, menu, drag = true }: { line: Line; late: boolean; onOpen: (line: Line, at?: HTMLElement | null) => void; onPick?: (line: Line) => void; menu?: (line: Line) => RowItem[]; drag?: boolean }): React.JSX.Element {
  const movable = drag && (line.kind === 'planned' || line.kind === 'due')
  const { setNodeRef, listeners, attributes, isDragging } = useDraggable({ id: `${lineKey(line)}${drag ? '' : ':more'}`, data: { line }, disabled: !movable })
  const title = line.kind === 'back' ? line.one.title : taskName(line.task.title).text
  // Due is a deadline: its mark and colour. Late on a day gone by says so; getting ready and coming back say what they are.
  const tone = line.kind === 'due' ? (late ? 'late' : 'deadline') : line.kind === 'planned' && late ? 'late' : undefined
  const said = line.kind === 'due' ? 'Due: ' : line.kind === 'ready' ? 'Get ready: ' : line.kind === 'back' ? 'Back: ' : late ? 'Late: ' : ''
  const Icon = line.kind === 'due' || line.kind === 'ready' ? CalendarClock : line.kind === 'back' ? Telescope : null
  const chip = (
    <Tip label={isDragging ? '' : `${said}${title}`}>
    <button ref={setNodeRef} type="button" data-plan-task={line.kind === 'back' ? '' : line.task.id} data-plan-kind={line.kind} {...(movable ? attributes : {})} {...(movable ? listeners : {})}
      onClick={(event) => line.kind === 'back' || !drag || clickOpens(event) ? onOpen(line, drag ? event.currentTarget : null) : onPick?.(line)}
      // Its own: a double-click on the day around it starts something new there.
      onDoubleClick={(event) => event.stopPropagation()}
      {...loud(tone, `mf-hit relative flex h-5 min-w-0 shrink-0 items-center gap-1 rounded-sm px-1 text-left text-control leading-snug transition-colors hover:bg-accent ${tone ? '' : line.kind === 'planned' ? 'text-foreground' : 'text-foreground/85'} ${isDragging ? 'mf-carried-place' : ''} ${movable ? 'touch-none' : ''}`)}>
      {Icon ? <Icon className="size-3 shrink-0" /> : <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-current opacity-70" />}
      <span dir="auto" className="truncate">{title}</span>
    </button>
    </Tip>
  )
  return menu && line.kind !== 'back' ? <RowMenu items={() => menu(line)}>{chip}</RowMenu> : chip
}

/** "+N more": click it, or rest the pointer on it, to see everything the day holds; its date there opens the day's page. */
function More({ day, lines, hidden, gone, onDay, onLine }: { day: Dayjs; lines: Line[]; hidden: number; gone: boolean; onDay: (day: string) => void; onLine: (line: Line) => void }): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const timer = useRef<number | undefined>(undefined)
  // Opened by resting the pointer on it, it comes quietly: a sound there would be heard as a press.
  const later = (to: boolean, ms: number): void => (window.clearTimeout(timer.current), void (timer.current = window.setTimeout(() => (to && quietFor(150), setOpen(to)), ms)))
  const hover = { onPointerEnter: () => later(true, 250), onPointerLeave: () => later(false, 180) }
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <button type="button" data-plan-more {...hover} onClick={() => (chime('open'), window.clearTimeout(timer.current), setOpen(true))} className="mf-hit relative h-5 shrink-0 rounded-sm px-1 text-left text-control font-medium text-foreground hover:bg-accent">
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
