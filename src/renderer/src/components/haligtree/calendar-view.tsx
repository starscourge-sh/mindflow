import { memo, startTransition, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { CARD, swallowRelease } from './carry'
import { useReading, useReadsIn } from '@/lib/reads-in'
import { createPortal } from 'react-dom'
import { motion } from 'motion/react'
import { CalendarClock, CalendarX2, Check, ChevronDown, PanelLeft, PanelRight, Plus, Repeat as RepeatIcon } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { ChevronLeft, ChevronRight } from '@/components/ui/icons'
import { chime } from '@/lib/sound'
import { detent, slotTicker } from '@/lib/proximity'
import { EASING, byKeys, glideWay, still } from '@/lib/motion'
import { taskName } from '@/lib/tasks'
import { moveToBin } from '@/lib/to-bin'
import { useHere } from '@/lib/split'
import { clock, useMinute } from '@/lib/clock'
import { placeTask } from '@/lib/calendar'
import { CALM, land as landOn, type Landing } from '@/lib/snap'
import { call, unloaded, useLive, haligtree, whenInLine, type Task } from '@/lib/haligtree'
import { lengthSaid } from '../../../../main/day-load'
import { dayjs, dayKey, num, plural, type Dayjs } from '../../../../main/dates'
import { Rolling, Tip, typing } from './ui'
import { MORE_STEP } from './show-more'
import { IslandBox, useFold } from './islands'
import { RowMenu } from './row-menu'
import { MonthPlan, MonthShowMenu, Passing } from './month-plan'
import { crossLevels, crossed, usePinchLevels, type Way } from './cal-pinch'
import { taskMenu, useTaskNow } from './tasks-view'
import { DaySide, type SideAsk } from './day-side'
import { Highlight, useFluidHover, Weighted } from './glide'
import { LateMenu, lateItems, lateOnes } from './late-tasks'
import { PlanDid, PlannedTotal, useFocusOn } from './planned-did'
import { calendarHere } from '@/lib/calendar-scope'
import { useLayers, useEvents, events as eventsApi, zoneShort } from '@/lib/events'
import { CalendarLayers, EventBlock, EventCardLayer, EventChip, HOUR, ZoneHeads, ZoneHours, allDayOn, colorFor, copyEvent, cutEvent, duplicateEvent, eventSpans, gutterOf, holding, hm, macShown, pasteEvent, span as timeSpan, useSecondZone, type Peek, type Shown } from './calendar-events'
import { completeTask } from './tasks-view'
import { AliveIcon } from '@/components/ui/alive-icon'
import DotsHorizontalIcon from '@/components/ui/dots-horizontal-icon'
import { useCaptures, type CaptureMeta } from '../capture-list'
import { CAPTURE_TYPES } from '../capture-kinds/capture-kind-picker'
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { splitTags } from '@/lib/haligtree'
import { quoted } from '../../../../main/clip'
import { studyChips, useStudy, type StudyDay } from './study-days'

type Mode = 'day' | 'week' | 'month'
/** One level of the Calendar: a month, a week or a day, about a day. */
type Level = { mode: Mode; anchor: Dayjs }
/**
 * A second level in the days' pane beside the one in front, unseen: the one a pinch is heading for, drawn ahead of
 * the change (`ahead`), or the one just left, on its way out (`leaving`). `top`: where its hours start from, the
 * place the hours in front are scrolled to, so a week and its day show the same hours through the change.
 */
type Shadow = Level & { role: 'ahead' | 'leaving'; top?: number }
/** Month, week, day, as they sit in the pane: never put in another order, which would lose each one's place. */
const DEPTH: Record<Mode, number> = { month: 0, week: 1, day: 2 }
const sameLevel = (a: Level, b: Level): boolean => a.mode === b.mode && a.anchor.isSame(b.anchor, 'day')
/** The steps a time snaps to (one hour's height on the grid is HOUR, calendar-events.tsx). */
const SNAP = 15
/** A timed task with no length of its own is drawn half an hour long. */
const USUAL = 30
const RED = 'var(--tt-color-text-red)'
/** A day's column in a week, in pixels, at its narrowest beside the panels: room for a block's "09:30 – 10:30" (calendar-events.tsx BlockWords). */
const DAY_ROOM = 112
/** A week's pane narrower than this shows FEW days from the day shown, so each says its blocks' names. */
const FEW_UNDER = 640
const FEW = 3
/**
 * The left panel (the small month, the calendars, Unscheduled), the right one
 * (Upcoming) and the editor in its place: each width in rem, as it starts, and
 * the least and most it can be dragged to.
 */
const LEFT = { key: 'vigil.calendar.left', home: 14, least: 12, most: 22 }
const RIGHT = { key: 'vigil.calendar.right', home: 16, least: 13, most: 26 }
const EDITOR = { key: 'vigil.calendar.editor', home: 24, least: 20, most: 34 }
const ACCENT = 'var(--tt-brand-color-400)'
/** How many Unscheduled tasks show before "Show N more": a working list to drag from, so a few more than an Inbox island. */
const LOOSE_FEW = 8
/** An all-day event over more than one day: a bar across them in Month. */
const manyDays = (one: Shown): boolean => !!one.allDay && dayKey(one.start) !== dayKey(dayjs(one.end).subtract(1, 'minute'))
/** A study chip in a month's line: tinted, so it stands 2px under the line above (the date, or another chip), as a task's words do. */
const MONTH_CHIP: React.CSSProperties = { height: 'calc(1.25rem - 2px)', lineHeight: 'calc(1.25rem - 2px)', marginTop: 2 }
const MUTED_DAY = 'bg-[color-mix(in_oklab,var(--background)_97%,var(--foreground))]'
/** The week's number, Monday to Sunday, the way a Mac's Calendar counts it (ISO 8601). */
const weekOf = (day: Dayjs): number => { const thursday = day.startOf('week').add(3, 'day'); return Math.floor(thursday.diff(thursday.startOf('year'), 'day') / 7) + 1 }
/** A month's weeks, "Weeks 44 – 49", or "Wk 44–49" narrow. */
const weeksSaid = (month: Dayjs, narrow: boolean): string => narrow ? `Wk ${weekOf(month.startOf('month'))}–${weekOf(month.endOf('month'))}` : `Weeks ${weekOf(month.startOf('month'))} – ${weekOf(month.endOf('month'))}`
/** "Oct 12 – 18", or "Sept 28 – Oct 4" across a month's end. */
const rangeSaid = (a: Dayjs, b: Dayjs): string => a.isSame(b, 'month') ? `${a.format('MMM D')} – ${b.date()}` : `${a.format('MMM D')} – ${b.format('MMM D')}`

const stored = <T extends string>(key: string, fallback: T, allowed: readonly T[]): T => {
  try {
    const got = localStorage.getItem(key) as T | null
    return got && allowed.includes(got) ? got : fallback
  } catch { return fallback }
}
const store = (key: string, value: string): void => { try { localStorage.setItem(key, value) } catch { /* Not kept: fine. */ } }
const current = (day: Dayjs): boolean => day.isSame(dayjs(), 'week')
const weekend = (day: Dayjs): boolean => day.day() === 0 || day.day() === 6
const snap = (minute: number, by = SNAP): number => Math.max(0, Math.min(24 * 60 - by, Math.round(minute / by) * by))
const minuteOf = (iso: string): number => { const at = dayjs(iso); return at.hour() * 60 + at.minute() }
const timed = (task: Task): boolean => task.status === 'open' && !!task.dueAt && !task.allDay
/** On the grid: open timed tasks, and the ones done, struck through where they were. */
const onGrid = (task: Task): boolean => (task.status === 'open' || task.status === 'done') && !!task.dueAt && !task.allDay
/** A task's tick, tinted by its priority the way Todoist has it: red, orange, blue, then plain. */
const PRIORITY = ['', 'var(--tt-color-text-red)', 'var(--tt-color-text-orange)', 'var(--tt-color-text-blue)']
const tickOf = (task: Task): string => PRIORITY[task.priority ?? 0] || 'color-mix(in oklab, var(--foreground) 45%, transparent)'
const atMinute = (day: string, minute: number): string => dayjs(day).startOf('day').add(minute, 'minute').toISOString()

/** Where the pointer is over the calendar: a time in a day, a day's untimed line, or a month's day. */
type Spot = { day: string; minute: number | null }
const spotAt = (x: number, y: number): Spot | null => {
  const el = document.elementsFromPoint(x, y).map((one) => one.closest<HTMLElement>('[data-cal-col], [data-cal-allday], [data-month-plan] [data-day]')).find(Boolean)
  if (!el) return null
  if (el.dataset.calCol) return { day: el.dataset.calCol, minute: ((y - el.getBoundingClientRect().top) / HOUR) * 60 }
  return { day: el.dataset.calAllday ?? el.dataset.day!, minute: null }
}

/** Something under the pointer: a task moved or made longer, a slot being drawn, a task carried from Unscheduled. */
type Carry =
  | { kind: 'move'; task: Task; grab: number; length: number; x: number; y: number; to: Spot | null }
  | { kind: 'resize'; task: Task; day: string; start: number; length: number }
  | { kind: 'new'; day: string; from: number; to: number }
/** A slot being written into: a time and a length on the grid, or a day's untimed line. */
type Draft = { day: string; minute: number | null; length: number; drag?: boolean }

/**
 * The Calendar, the way Notion Calendar and Google Calendar have it: a day,
 * a week or a month, the timed tasks as blocks at their hour that move and
 * stretch by dragging, a slot clicked or dragged across to write a task
 * there, and beside it a small month and the tasks with no date yet, to drag
 * onto the grid. D, W and M change the view, T comes back to today, ← and →
 * step. Every move and stretch has an Undo, and ⌘Z.
 */
export function CalendarView({ focus, onOpen }: { focus?: string; onOpen?: (type: string, id: string) => void }): React.JSX.Element {
  const unheld = useLive(haligtree.tasks, [] as Task[])
  // A fresh start's tasks keep their days here, as they keep their places in Tasks: on hold is never out of sight.
  const held = useLive(() => call<Task[]>('tasks:held'), [] as Task[], [], undefined, 'tasks-held')
  const tasks = useMemo(() => (held.length && !unloaded(unheld) ? [...unheld, ...held] : unheld), [unheld, held])
  const taskNow = useTaskNow()
  const [mode, setModeRaw] = useState<Mode>(() => stored('vigil.calendar.mode', 'week', ['day', 'week', 'month'] as const))
  const [side, setSideRaw] = useState(() => stored('vigil.calendar.side', 'on', ['on', 'off'] as const) === 'on')
  // The right panel (Upcoming) has its own switch, on the right of the bar, as the left panel's is on the left.
  const [upSide, setUpSideRaw] = useState(() => stored('vigil.calendar.upcoming', 'on', ['on', 'off'] as const) === 'on')
  const setUpSide = (on: boolean): void => (chime(on ? 'on' : 'off'), store('vigil.calendar.upcoming', on ? 'on' : 'off'), setUpSideRaw(on))
  // Captures as small marks at the minute they were caught, in Day and Week: on unless turned off.
  const [marked, setMarkedRaw] = useState(() => stored('vigil.calendar.captures', 'on', ['on', 'off'] as const) === 'on')
  const setMarked = (on: boolean): void => (chime('tap'), store('vigil.calendar.captures', on ? 'on' : 'off'), setMarkedRaw(on))
  const captures = useCaptures(true)
  const [anchor, setAnchor] = useState(() => (focus && dayjs(focus).isValid() ? dayjs(focus) : dayjs()).startOf('day'))
  const setMode = (to: Mode): void => (to !== mode && chime('tap'), setPeek(null), store('vigil.calendar.mode', to), setModeRaw(to))
  const setSide = (on: boolean): void => (chime(on ? 'on' : 'off'), store('vigil.calendar.side', on ? 'on' : 'off'), setSideRaw(on))
  // A narrow page has no room for the small month beside a month: the month gets the width.
  const box = useRef<HTMLElement>(null)
  // The page's width and the app's text size, measured when the page changes size; what fits is worked out from them
  // as the page is drawn. (Measured again after each change of level, the whole page was drawn a second time in the
  // frames the level was changing in.)
  const [sized, setSized] = useState<{ width: number; rem: number } | null>(null)
  const narrow = !!sized && sized.width < 820
  // Under about 900px the bar has no room for the two panel buttons: they fold into ⋯, so nothing wraps.
  const tight = !!sized && sized.width < 900
  // Whether the right panel fits beside the days: in a week only while every
  // day keeps the room for a block's whole time on one line ("09:30 – 10:30"),
  // so with the app's sidebar open it folds away first; a day has room for it.
  // "Plan" brings it back. (Narrower still, a block puts its time on two lines.)
  const zone = useSecondZone()
  const [leftRem, leftGrip] = usePanelWidth(LEFT, 'left')
  const [rightRem, rightGrip] = usePanelWidth(RIGHT, 'right')
  const [editorRem, editorGrip] = usePanelWidth(EDITOR, 'right')
  useEffect(() => {
    const el = box.current
    if (!el) return
    const measure = (): void => {
      const now = { width: el.clientWidth, rem: parseFloat(getComputedStyle(document.documentElement).fontSize) || 16 }
      setSized((was) => (was && was.width === now.width && was.rem === now.rem ? was : now))
    }
    measure()
    const watch = new ResizeObserver(measure)
    watch.observe(el)
    return () => watch.disconnect()
  }, [])
  const gutter = sized ? parseFloat(gutterOf(zone)) * sized.rem : 0
  const fits = !sized ? { left: true, right: true } : mode === 'week'
    // The left panel too folds away once the days would be squeezed under about 4rem each; "Plan" brings it back.
    ? { left: sized.width >= 7 * 64 + gutter + leftRem * sized.rem, right: sized.width >= 7 * DAY_ROOM + gutter + (leftRem + rightRem) * sized.rem }
    : { left: true, right: sized.width >= 1100 }
  // "Plan" pressed while a panel was folded for room: shown all the same, until it is pressed again.
  const [kept, setKept] = useState(false)
  const [keptRight, setKeptRight] = useState(false)
  // Until the room changes: grown, it is not needed; shrunk again, the panels fold as before.
  useEffect(() => (setKept(false), setKeptRight(false)), [fits.left, fits.right])
  const roomless = narrow && mode === 'month'
  // The side panel: a new task for a slot or a day, or a task opened from the grid.
  const [panel, setPanel] = useState<SideAsk | null>(null)
  const pick = (id: string): void => (chime('open'), setPeek(null), setPanel({ task: id }))
  const pickEvent = (key: string): void => (setPeek(null), setPanel({ event: key }))
  // A click on an event: its small card beside it (calendar-events.tsx), not the whole panel.
  const [peek, setPeek] = useState<Peek | null>(null)
  const onPeek = (one: Shown, at: DOMRect): void => (setPanel(null), setPeek({ one, at }))
  // A week too narrow to read (the days' pane under 640px, a small window): three days from the day shown, as Fantastical and Apple's Calendar do.
  const pane = useRef<HTMLDivElement>(null)
  const [paneWide, setPaneWide] = useState(Infinity)
  useLayoutEffect(() => {
    const el = pane.current
    if (!el) return
    const measure = (): void => setPaneWide(el.clientWidth)
    measure()
    const watch = new ResizeObserver(measure)
    watch.observe(el)
    return () => watch.disconnect()
  }, [])
  const few = mode === 'week' && paneWide < FEW_UNDER
  /** The days a level shows: one, a week's seven, or three from the day shown when the pane is too narrow for seven. */
  const daysOf = (one: Level): Dayjs[] => one.mode === 'day' ? [one.anchor] : one.mode === 'week' && paneWide < FEW_UNDER ? Array.from({ length: FEW }, (_, at) => one.anchor.add(at, 'day')) : Array.from({ length: 7 }, (_, at) => one.anchor.startOf('week').add(at, 'day'))
  // Pinch out over a week in Month to open it, over a day in Week to open that; pinch in to go back up (cal-pinch.ts).
  // As soon as a pinch sets off, the level it is heading for is drawn in the pane, unseen (`shadow`), in the page's
  // spare time; at the change the two levels, both there, cross by transform and opacity alone, so the change draws
  // nothing. The D, W and M keys and the view buttons change the level at once.
  const level = useRef<HTMLDivElement>(null)
  const [shadow, setShadow] = useState<Shadow | null>(null)
  // The level in front as the hand has it, for the frames the page takes to say so itself; the change asked for and
  // waiting for its level to be drawn; and the change now playing.
  const front = useRef<{ at: Level; el: HTMLElement } | null>(null)
  const wanted = useRef<{ to: Level; way: Way; at: { x: number; y: number }; release: () => void } | null>(null)
  const crossing = useRef<{ anims: Animation[]; next: HTMLElement; over: boolean } | null>(null)
  const inFront = (): { at: Level; el: HTMLElement | null } => front.current ?? { at: { mode: live.current.mode, anchor: live.current.anchor }, el: level.current }
  const layerOf = (one: Level): HTMLElement | null => pane.current?.querySelector<HTMLElement>(`:scope > [data-cal-depth="${one.mode}"][data-cal-at="${dayKey(one.anchor)}"]`) ?? null
  const drawAhead = (to: Level | null): void => {
    if (!to) return startTransition(() => setShadow((was) => (was?.role === 'ahead' ? null : was)))
    const top = inFront().el?.querySelector<HTMLElement>('[data-cal-scroll]')?.scrollTop
    startTransition(() => setShadow((was) => (was && sameLevel(was, to) ? was : { ...to, role: 'ahead', top })))
  }
  /** The change over and the page saying the same as the hand: its animations go, and the level left with them. */
  const tidy = (): void => {
    const one = crossing.current
    if (front.current && !front.current.el.isConnected) (front.current = null), (crossing.current = null), one && crossed(one.anims)
    if (!one || !one.over || one.next.dataset.calRole !== 'here') return
    crossing.current = null
    front.current = null
    crossed(one.anims)
    startTransition(() => setShadow((was) => (was?.role === 'leaving' ? null : was)))
  }
  /** The change asked for, made once the level it goes to is drawn: the two cross, and the page is told in its own time. */
  const cross = (): void => {
    const ask = wanted.current
    const now = inFront()
    const next = ask && layerOf(ask.to)
    if (!ask || !next || !now.el || next === now.el) return
    wanted.current = null
    const how = crossLevels(now.el, next, ask.way, ask.at)
    ask.release()
    chime('tap')
    store('vigil.calendar.mode', ask.to.mode)
    box.current?.setAttribute('data-cal-mode', ask.to.mode)
    const said = (): void => (setPeek(null), setAnchor(ask.to.anchor), setModeRaw(ask.to.mode), setShadow(how ? { ...now.at, role: 'leaving' } : null))
    // With Motion off there is nothing to play: the page says it at once.
    if (!how) return said()
    front.current = { at: ask.to, el: next }
    const mine = { ...how, next, over: false }
    crossing.current = mine
    startTransition(said)
    void how.done.then((whole) => void (whole && crossing.current === mine && ((mine.over = true), tidy())))
  }
  useLayoutEffect(() => (cross(), tidy()))
  // A level drawn ahead that the page reached some other way (a key, a view button) is the level in front now.
  useEffect(() => void (shadow && shadow.mode === mode && setShadow(null)), [shadow, mode])
  usePinchLevels<Level>(pane, (el, way) => {
    const { at, el: layer } = inFront()
    const body = layer?.querySelector<HTMLElement>('[data-cal-body]')
    if (!body) return null
    if (way === 'up') return at.mode === 'month' ? null : { body, to: { mode: at.mode === 'day' ? 'week' : 'month', anchor: at.anchor } }
    if (at.mode === 'month') {
      const week = el.closest<HTMLElement>('[data-month-week]')?.dataset.monthWeek
      return week ? { body, to: { mode: 'week', anchor: dayjs(week).startOf('day') } } : null
    }
    if (at.mode !== 'week') return null
    const day = el.closest<HTMLElement>('[data-cal-col], [data-cal-head], [data-cal-allday]')
    const key = day?.dataset.calCol ?? day?.dataset.calHead ?? day?.dataset.calAllday
    return key ? { body, to: { mode: 'day', anchor: dayjs(key).startOf('day') } } : null
  }, drawAhead, (way, to, at, release) => {
    wanted.current = { to, way, at, release }
    // Asked for again: a pinch can reach the line on its first step, before anything was asked.
    drawAhead(to)
    cross()
  })
  const days = mode === 'day' ? [anchor] : few ? Array.from({ length: FEW }, (_, at) => anchor.add(at, 'day')) : Array.from({ length: 7 }, (_, at) => anchor.startOf('week').add(at, 'day'))
  // What a step is, as the arrows say it: a day, a week, a month, or the three days shown.
  const unit = few ? `${FEW} days` : mode
  const step = (by: -1 | 1): void => (chime('page'), setPeek(null), setAnchor((now) => few ? now.add(by * FEW, 'day') : now.add(by, mode)))
  // Today brought into sight: its day shown, and the grid scrolled to the now line, so the step is seen even when today was already in view.
  // A glide for the button; by T, or with Motion off or Reduce motion, there at once.
  // The same glide as Month's (lib/snap.ts, the calm one), set off once the day asked for is drawn: a second press turns
  // it on its way, a touch or the wheel stops it where it is.
  const [nowAsk, setNowAsk] = useState<{ keys: boolean } | null>(null)
  const toNow = (): void => setNowAsk({ keys: byKeys() })
  const nowGlide = useRef<Landing | null>(null)
  useLayoutEffect(() => {
    const hours = level.current?.querySelector<HTMLElement>('[data-cal-scroll]')
    if (!nowAsk || !hours) return
    const instant = nowAsk.keys || glideWay() === 'instant'
    const set = (): void => {
      const now = new Date()
      const to = Math.max(0, Math.min(hours.scrollHeight - hours.clientHeight, ((now.getHours() * 60 + now.getMinutes()) / 60) * HOUR - hours.clientHeight / 2))
      if (nowGlide.current?.running) return nowGlide.current.aim(to)
      if (instant || Math.abs(hours.scrollTop - to) < 0.5) return void (hours.scrollTop = to)
      const one = landOn(hours.scrollTop, 0, to, (value) => void (hours.scrollTop = value), () => void (nowGlide.current = null), CALM)
      if (one.running) nowGlide.current = one
    }
    set()
    // The hours' box changes height as the day's all-day things come in (read as the day is shown): now stays in the
    // middle through that, told by the box itself, until the hours are scrolled by hand.
    const watch = new ResizeObserver(set)
    watch.observe(hours)
    const mine = (): void => (nowGlide.current?.stop(), watch.disconnect())
    hours.addEventListener('wheel', mine, { passive: true })
    hours.addEventListener('pointerdown', mine)
    return () => (watch.disconnect(), hours.removeEventListener('wheel', mine), hours.removeEventListener('pointerdown', mine))
  }, [nowAsk])
  useEffect(() => () => nowGlide.current?.stop(), [])
  const today = (): void => (chime('tap'), setPeek(null), setAnchor(dayjs().startOf('day')), toNow())
  // "+ New event": the panel on Event (or Task), for the next hour on the day being looked at (dayHere).
  const newEvent = (): void => {
    const on = dayjs(dayHere())
    const minute = on.isSame(dayjs(), 'day') ? Math.min(23 * 60, (dayjs().hour() + 1) * 60) : 9 * 60
    chime('open')
    setPeek(null)
    setPanel({ day: dayKey(on), minute, length: 60, drag: true })
  }
  const first = days[0]
  const last = days[days.length - 1]
  const title = mode !== 'week' || first.month() === last.month() ? anchor.format('MMMM YYYY')
    : first.year() === last.year() ? `${first.format('MMM')} – ${last.format('MMM YYYY')}` : `${first.format('MMM YYYY')} – ${last.format('MMM YYYY')}`
  // A narrow header (beside the sidebar on a small window) says the month and day short, so neither is cut.
  const short = mode !== 'week' || first.month() === last.month() ? anchor.format('MMM YYYY') : title
  // Narrow, the days alone: the week's number is the part to spare.
  const said = (narrow: boolean): string => few ? (narrow ? `${FEW} days` : `${FEW} days · ${rangeSaid(first, last)}`) : mode === 'week' ? (narrow ? rangeSaid(first, last) : `Week ${weekOf(first)} · ${rangeSaid(first, last)}`)
    : mode === 'day' ? (narrow ? anchor.format('ddd D') : `${anchor.format('dddd, MMM D')} · Week ${weekOf(anchor)}`)
    // Narrow, beside the late count, "Weeks 44 – 49" was cut to "Weeks 4…", "Mon, Nov 9" to "Mon, No…" and "3 days · Nov 9 – 11"
    // to "3 days · …": the short forms keep their numbers whole (the month is in the title above, the dates on the days' heads).
    : weeksSaid(anchor, narrow)
  // In Month the heading follows the run as it scrolls, drawn on its own (month-plan.tsx, `Passing`): the page is drawn again only once it rests.
  const passing = (say: (month: Dayjs) => string, otherwise: string): React.ReactNode => mode === 'month' ? <Passing fallback={anchor.startOf('month')} say={say} /> : otherwise
  const subtitle = said(false)
  // The day being looked at, for anything new without a day of its own ("+ New event", either tab; ⌘K's "New task"):
  // today while it is in view, otherwise the day picked (the small month, a day's head, "Go to"), never just the grid's first day.
  const dayHere = (): string => {
    const now = dayjs()
    if (mode === 'month' ? anchor.isSame(now, 'month') : days.some((day) => day.isSame(now, 'day'))) return dayKey(now)
    return dayKey(mode === 'month' || days.some((day) => day.isSame(anchor, 'day')) ? anchor : days[0])
  }
  const onToday = mode === 'month' ? anchor.isSame(dayjs(), 'month') : days.some((day) => day.isSame(dayjs(), 'day'))
  // Sent to a day again (⌘K's "Go to Friday"), with the page already open.
  useEffect(() => void (focus && dayjs(focus).isValid() && setAnchor(dayjs(focus).startOf('day'))), [focus])
  // The task picked on the grid (clicked or focused), for ⌘K to be about; marked so it shows.
  const [chosen, setChosen] = useState<string | null>(null)
  const picked = chosen ?? (panel && 'task' in panel ? panel.task : null)
  // The event picked the same way (calendar-events.tsx), for ⌘K to be about instead.
  const [chosenEvent, setChosenEvent] = useState<string | null>(null)
  const pickedEvent = chosenEvent ?? (panel && 'event' in panel ? panel.event : null)
  // Events beside the tasks (calendar-events.tsx): each calendar, the tasks and your Mac's calendars shown or hidden.
  // A month reads its quarter and one either side, so scrolling through the months reads afresh once every three months.
  // A week and a day read the same span as their month: a change of level then reads nothing afresh, and the level a
  // pinch is heading for has its events from its first draw. (Each level reading its own days, the answers came back
  // one by one through the change, and the whole page was drawn again for each.)
  const showing: Level = { mode, anchor }
  const levels: (Level | Shadow)[] = shadow && shadow.mode !== mode ? [showing, shadow] : [showing]
  const quarter = anchor.startOf('month').subtract(anchor.month() % 3, 'month')
  const span = [quarter.subtract(3, 'month'), quarter.add(6, 'month')]
  const monthUp = levels.some((one) => one.mode === 'month')
  const layers = useLayers(span[0].toDate(), span[1].toDate())
  const own = useEvents(span[0].toISOString(), span[1].toISOString())
  const shownEvents: Shown[] = [...own.filter((one) => layers.shown(one.calendarId)).map((one) => ({ ...one, color: colorFor(one, layers.colorOf(one.calendarId)) })), ...macShown(layers.macEvents)]
  const shownTasks = layers.tasks ? tasks : []
  // Month's events by day, sorted once a draw rather than sought again for each day: a fling draws a new week every few frames.
  // A single day's all-day event sits on its day; those over several days are the month's bars.
  const eventsByDay = new Map<string, Shown[]>()
  // What a week's events are drawn from, as one line: a week of the month is drawn again only when it changed.
  const eventsSaid = monthUp ? shownEvents.map((one) => `${one.key}|${one.title}|${one.color}|${one.start}|${one.end}|${one.allDay}`).join('\n') : ''
  if (monthUp) for (const one of shownEvents) if (!manyDays(one)) (eventsByDay.get(dayKey(one.start)) ?? (eventsByDay.set(dayKey(one.start), []), eventsByDay.get(dayKey(one.start))!)).push(one)
  // The study plan for the days shown: cards due and books' finishing days ("Study" in My calendars).
  const study = useStudy(dayKey(span[0]), dayKey(span[1].subtract(1, 'minute')), layers.study)
  // Drawn once every read it is made of has answered: drawn before, the calendars' list comes in above the
  // unscheduled tasks and pushes them down, and the late count and the blocks fill in a beat apart.
  const ready = !unloaded(tasks) && !unloaded(held) && !unloaded(captures) && !unloaded(own) && layers.ready
  const { provide, style: readsStyle } = useReadsIn(!ready)
  // Sent to one event (a note's "From the event"): its day, and it open in the panel.
  useEffect(() => {
    if (!focus?.startsWith('event:')) return
    const key = focus.slice(6)
    void eventsApi.one(key).then(async (one) => {
      if (!one) return
      const next = one.repeat && !key.includes('@') ? (await eventsApi.between(dayjs().startOf('day').toISOString(), dayjs().add(2, 'year').toISOString())).find((time) => time.series === key) : null
      setAnchor(dayjs((next ?? one).start).startOf('day'))
      setPanel({ event: next?.key ?? key })
    })
  }, [focus])

  // D, W and M for the view, T for today, ← and → to step: only with the page in front and nothing being typed.
  const here = useHere()
  // ⌘K, with this page in front, knows the task picked and can move the page.
  const live = useRef({ tasks, picked, anchor, mode, side, layers, shownEvents, pickedEvent, dayHere })
  live.current = { tasks, picked, anchor, mode, side, layers, shownEvents, pickedEvent, dayHere }
  useEffect(() => calendarHere(here, {
    chosenEvent: () => live.current.shownEvents.find((one) => one.key === live.current.pickedEvent && !one.readOnly) ?? null,
    openEvent: (key) => pickEvent(key),
    settleEvent: (key) => {
      setPanel(null)
      setChosen(null)
      setChosenEvent(key)
      setTimeout(() => document.querySelector<HTMLElement>(`[data-cal-event="${CSS.escape(key)}"], [data-cal-event-chip="${CSS.escape(key)}"]`)?.focus({ preventScroll: true }), 200)
    },
    calendars: () => {
      const { layers: now } = live.current
      return [
        ...now.calendars.map((one) => ({ name: one.name, on: now.shown(one.id), flip: () => now.toggle(one.id, !now.shown(one.id)) })),
        { name: 'Tasks', on: now.tasks, flip: () => now.toggle('tasks', !now.tasks) },
        ...now.mac.map((one) => ({ name: `${one.name} (your Mac's calendar)`, on: now.shown(one.id), flip: () => now.toggle(one.id, !now.shown(one.id)) }))
      ]
    },
    chosen: () => live.current.pickedEvent ? null : live.current.tasks.find((task) => task.id === live.current.picked && task.status === 'open') ?? null,
    day: () => live.current.dayHere(),
    mode: () => live.current.mode,
    go: (day) => (chime('page'), setPeek(null), setAnchor(dayjs(day).startOf('day')), dayjs(day).isSame(dayjs(), 'day') && toNow()),
    setMode: (to) => setMode(to),
    open: (id) => pick(id),
    reveal: (task) => {
      setAnchor(dayjs(task.dueAt ?? task.deadline!).startOf('day'))
      setChosen(task.id)
      pick(task.id)
      // Brought into sight once it is drawn there.
      setTimeout(() => document.querySelector(`[data-cal-block="${task.id}"], [data-cal-untimed="${task.id}"], [data-plan-task="${task.id}"]`)?.scrollIntoView({ block: 'center' }), 120)
    },
    side: () => live.current.side,
    setSide: (on) => setSide(on),
    // ⌘K opened over its panel: the panel steps aside so the bar is about it alone, the task still picked.
    aside: () => setPanel((was) => (was && 'task' in was ? (setChosen(was.task), null) : was && 'event' in was ? (setChosenEvent(was.event), null) : was)),
    // A command done to it from ⌘K: its panel goes, and the keys come back to it on the grid, so ⌘Z reaches its Undo.
    settle: (id) => {
      setPanel(null)
      setChosen(id)
      setTimeout(() => document.querySelector<HTMLElement>(`[data-cal-block="${id}"], [data-cal-untimed="${id}"]`)?.focus({ preventScroll: true }), 150)
    }
  }), []) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (!here() || typing() || event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return
      const key = event.key
      const take = (run: () => void): void => (event.preventDefault(), run())
      if (key === 'd' || key === 'w' || key === 'm') return take(() => setMode(({ d: 'day', w: 'week', m: 'month' } as const)[key]))
      if (key === 't') return take(today)
      if (key === 'n') return take(newEvent)
      // Esc lets go of the task or event picked, as on every list, so ⌘K is the Calendar's own again.
      if (key === 'Escape' && !panel && !peek && (chosen || chosenEvent)) return take(() => (chime('away'), setChosen(null), setChosenEvent(null), (document.activeElement as HTMLElement | null)?.blur()))
      if (key === '.') return take(() => (chime('open'), setJump(true)))
      if (key === 'ArrowLeft' || key === 'ArrowRight') return take(() => step(key === 'ArrowLeft' ? -1 : 1))
    }
    // ⌘C, ⌘X and ⌘D on the event picked, ⌘V where the pointer is (or the day shown, at its time), as Notion Calendar has them.
    const onCopy = (event: KeyboardEvent): void => {
      if (!here() || typing() || event.defaultPrevented || !event.metaKey || event.shiftKey || event.altKey || event.ctrlKey || !['c', 'x', 'd', 'v'].includes(event.key)) return
      if (event.key !== 'v' && window.getSelection()?.toString()) return
      const one = live.current.shownEvents.find((ev) => ev.key === live.current.pickedEvent)
      if (event.key === 'v') {
        if (!holding()) return
        event.preventDefault()
        const at = pointed.current
        return void pasteEvent(at?.day ?? dayKey(live.current.anchor), at ? (at.minute === null ? null : snap(at.minute)) : undefined)
      }
      if (!one || one.readOnly) return
      event.preventDefault()
      event.stopPropagation()
      if (event.key === 'c') copyEvent(one)
      else if (event.key === 'x') (setPeek(null), cutEvent(one))
      else void duplicateEvent(one)
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('keydown', onCopy)
    return () => (window.removeEventListener('keydown', onKey), window.removeEventListener('keydown', onCopy))
  })
  // Where the pointer last was over the grid, for ⌘V.
  const pointed = useRef<Spot | null>(null)
  // "October 2026 ⌄": the small month, to go to any date (. too).
  const [jump, setJump] = useState(false)

  // What the pointer carries, followed on the window so it keeps up off the grid too.
  const [carry, setCarry] = useState<Carry | null>(null)
  // The task just set down, and where: it settles in there once it is drawn at its new time.
  const [landed, setLanded] = useState<{ id: string; due: string } | null>(null)
  const settle = (id: string, due: string): void => {
    setLanded({ id, due })
    window.setTimeout(() => setLanded((was) => (was?.id === id && was.due === due ? null : was)), 1500)
  }
  const draft: Draft | null = panel && 'day' in panel ? panel : null
  const setDraft = (to: Draft | null): void => setPanel(to)
  const start = (event: React.PointerEvent, begin: (x: number, y: number) => Carry | null, click?: () => void): void => {
    if (event.button !== 0) return
    event.stopPropagation()
    const [x0, y0] = [event.clientX, event.clientY]
    let now: Carry | null = null
    const moveTo = (e: PointerEvent): void => {
      if (!now && Math.hypot(e.clientX - x0, e.clientY - y0) < 4) return
      if (!now) {
        now = begin(x0, y0)
        if (!now) return
        chime('lift')
      }
      now = follow(now, e.clientX, e.clientY)
      setCarry(now)
    }
    const done = (): void => {
      window.removeEventListener('pointermove', moveTo)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', drop)
      window.removeEventListener('keydown', esc, true)
    }
    const up = (e: PointerEvent): void => {
      done()
      if (!now) return click?.()
      now = follow(now, e.clientX, e.clientY)
      setCarry(null)
      land(now)
    }
    // Esc, or the pointer lost to the system, puts it back where it was.
    const drop = (): void => { done(); if (now) (chime('stay'), setCarry(null)) }
    const esc = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape' || !now) return
      e.preventDefault()
      e.stopPropagation()
      swallowRelease()
      drop()
    }
    window.addEventListener('pointermove', moveTo)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', drop)
    window.addEventListener('keydown', esc, true)
  }
  const follow = (now: Carry, x: number, y: number): Carry => {
    const spot = spotAt(x, y)
    if (now.kind === 'move') return { ...now, x, y, to: spot && spot.minute !== null ? { ...spot, minute: snap(spot.minute - now.grab) } : spot }
    if (now.kind === 'resize') {
      const col = document.querySelector<HTMLElement>(`[data-cal-col="${now.day}"]`)
      const end = col ? snap(((y - col.getBoundingClientRect().top) / HOUR) * 60) : now.start + now.length
      return { ...now, length: Math.max(SNAP, end - now.start) }
    }
    const col = document.querySelector<HTMLElement>(`[data-cal-col="${now.day}"]`)
    return { ...now, to: col ? snap(((y - col.getBoundingClientRect().top) / HOUR) * 60) : now.to }
  }
  const land = (now: Carry): void => {
    if (now.kind === 'move') {
      if (!now.to) return chime('stay')
      const { task, to } = now
      if (to.minute === null) {
        const time = task.dueAt ? dayjs(task.dueAt) : dayjs().hour(9).minute(0)
        const due = dayjs(to.day).hour(time.hour()).minute(time.minute()).startOf('minute').toISOString()
        settle(task.id, due)
        return placeTask(task, { due, allDay: 1, estimate: task.estimate }, `Moved to ${whenInLine(due, true)}`)
      }
      const due = atMinute(to.day, to.minute)
      settle(task.id, due)
      return placeTask(task, { due, allDay: 0, estimate: task.estimate ?? (task.dueAt && !task.allDay ? null : USUAL) }, `Moved to ${whenInLine(due)}`)
    }
    if (now.kind === 'resize')
      return placeTask(now.task, { due: atMinute(now.day, now.start), allDay: 0, estimate: now.length }, `Takes ${lengthSaid(now.length)} now`)
    const [a, b] = [Math.min(now.from, now.to), Math.max(now.from, now.to)]
    chime('tap')
    setDraft({ day: now.day, minute: a, length: Math.max(SNAP, b - a), drag: true })
  }

  // One hover light that glides down the Unscheduled list, as on Today.
  const looseBox = useRef<HTMLUListElement>(null)
  const looseHover = useFluidHover(looseBox, { items: '[data-cal-loose]' })
  const unscheduled = tasks.filter((task) => task.status === 'open' && !task.dueAt && !task.deadline)
  // A long Unscheduled list shows its first few, and the rest a click away: twenty cut-short titles are tiring to read.
  // Eight, then a hundred more a press: a backlog of 1,500 never draws at once.
  const [looseCount, setLooseCount] = useState(LOOSE_FEW)
  const looseShown = unscheduled.slice(0, looseCount)
  const looseIsland = useFold('calendar.unscheduled', {
    total: unscheduled.length, whole: looseCount > LOOSE_FEW && looseShown.length >= unscheduled.length,
    onWhole: () => (chime('open'), setLooseCount(looseCount + MORE_STEP)), onFewer: () => (chime('fold'), setLooseCount(LOOSE_FEW))
  })
  const blockProps = { carry, start, onPick: pick, taskNow, draft, setDraft, events: shownEvents, onEvent: pickEvent, onPeek, onOpen, landed }
  /** The events that touch the days a week or a day shows, picked once a draw from the whole span's. */
  const eventsOn = (shown: Dayjs[]): Shown[] => {
    const [from, to] = [shown[0].startOf('day').valueOf(), shown[shown.length - 1].add(1, 'day').startOf('day').valueOf()]
    return shownEvents.filter((one) => new Date(one.start).getTime() < to && new Date(one.end).getTime() > from)
  }
  const calendarName = (one: Shown): string => one.readOnly ? one.calendarId.replace(/^mac:/, '') : layers.calendars.find((cal) => cal.id === one.calendarId)?.name ?? 'Calendar'
  // The card follows its event as it changes; the time it was opened for stays its anchor.
  const peekNow = peek && { ...peek, one: shownEvents.find((one) => one.key === peek.one.key) ?? peek.one }
  const left = side && !roomless && (fits.left || kept)
  // The right sidebar: Upcoming where there is room, and the event or task being edited, which takes its place.
  const upcoming = upSide && mode !== 'month' && (fits.right || keptRight)
  // Each panel's switch sits on its own side of the bar: on while its panel is up, off hides it; on again shows it, room or not.
  const leftPanel = (): void => {
    if (left) return (setKept(false), setSide(false))
    setKept(!fits.left)
    if (side) chime('on')
    else setSide(true)
  }
  const plan = (): void => {
    if (upcoming) return (setKeptRight(false), setUpSide(false))
    setKeptRight(!fits.right)
    if (upSide) chime('on')
    else setUpSide(true)
  }
  const lateMenu = <LateMenu tasks={tasks} pill className="shrink-0" onTask={(task) => (setAnchor(dayjs(task.dueAt).startOf('day')), setChosen(task.id), pick(task.id))} />
  // The two panels as lines of ⋯, for a bar with no room for their buttons.
  const panelLines = (
    <>
      <DropdownMenuSeparator />
      <DropdownMenuLabel>Panels</DropdownMenuLabel>
      <DropdownMenuCheckboxItem data-cal-left-line checked={left} disabled={roomless} onCheckedChange={leftPanel} onSelect={(event) => event.preventDefault()}>The small month and calendars</DropdownMenuCheckboxItem>
      {mode !== 'month' && <DropdownMenuCheckboxItem data-cal-side-line checked={upcoming} onCheckedChange={plan} onSelect={(event) => event.preventDefault()}>Upcoming</DropdownMenuCheckboxItem>}
    </>
  )
  const goTo = (day: Dayjs): void => void (!days.some((one) => one.isSame(day, 'day')) && setAnchor(day.startOf('day')))
  return provide(
    <section ref={box} data-cal-mode={mode} data-cal-days={mode === 'month' ? undefined : days.length} data-cal-chosen={picked ?? undefined} style={readsStyle} className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
      onFocusCapture={(event) => {
        const one = (event.target as HTMLElement).closest<HTMLElement>('[data-cal-block], [data-cal-untimed], [data-cal-loose]')
        if (one) (setChosen(one.dataset.calBlock ?? one.dataset.calUntimed ?? one.dataset.calLoose ?? null), setChosenEvent(null))
        const ev = (event.target as HTMLElement).closest<HTMLElement>('[data-cal-event], [data-cal-event-chip], [data-cal-pop]')
        if (ev) (setChosenEvent(ev.dataset.calEvent ?? ev.dataset.calEventChip ?? ev.dataset.calPop ?? null), setChosen(null))
      }}
      onPointerDownCapture={(event) => {
        const at = event.target as HTMLElement
        if (!at.closest('[data-cal-block], [data-cal-untimed], [data-cal-loose]')) setChosen(null)
        const ev = at.closest<HTMLElement>('[data-cal-event], [data-cal-event-chip], [data-cal-pop]')
        setChosenEvent(ev ? (ev.dataset.calEvent ?? ev.dataset.calEventChip ?? ev.dataset.calPop ?? null) : null)
      }}>
      {pickedEvent && !panel && !peek && <style>{`[data-cal-event="${CSS.escape(pickedEvent)}"] { outline: 2px solid var(--ring); outline-offset: 1px } [data-cal-event-chip="${CSS.escape(pickedEvent)}"] { outline: 2px solid var(--ring); outline-offset: -2px }`}</style>}
      {/* The ring of the one picked: round a block, inside a chip, so the lane's edge never cuts it. */}
      {picked && <style>{`[data-cal-block="${CSS.escape(picked)}"] { outline: 2px solid var(--ring); outline-offset: 1px } [data-cal-untimed="${CSS.escape(picked)}"] { outline: 2px solid var(--ring); outline-offset: -2px }`}</style>}
      {/* One row at every width: the title gives way first, then the panel buttons fold into ⋯. */}
      <header className={`@container/head flex min-h-16 shrink-0 items-center py-2 ${tight ? 'gap-1.5 px-3' : 'gap-2 px-5'}`}>
        {!tight && <Tip label={roomless ? 'No room for the left panel beside a month here' : left ? 'Hide the left panel' : 'Show the left panel: the small month, your calendars, unscheduled tasks'}>
          <Button variant="outline" size="icon-sm" data-cal-left-toggle disabled={roomless} aria-label={left ? 'Hide the left panel' : 'Show the left panel'} aria-pressed={left} className="size-8 shrink-0 aria-pressed:bg-accent" onClick={leftPanel}><PanelLeft /></Button>
        </Tip>}
        {/* Grows into the room the controls leave, rather than pushing them onto a line of their own. */}
        <div className="@container/title mr-auto flex min-w-0 flex-1 basis-0 flex-col">
          <div className="flex min-w-0 items-center gap-2">
          {/* The month, as a picker: a click (or .) opens the small month, to go to any date. */}
          <Popover open={jump} onOpenChange={(open) => (open && chime('open'), setJump(open))}>
            <PopoverTrigger asChild>
              <button type="button" data-cal-jump aria-label={`${title}: go to a date (.)`} className="-ml-1.5 flex min-h-7 min-w-0 items-center gap-1 self-start rounded-md px-1.5 text-left outline-none transition-colors duration-150 hover:bg-accent/60 focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none">
                <h1 data-cal-title data-unfaded className="truncate font-heading text-heading font-semibold tracking-[-0.01em] text-foreground"><span className="@[48rem]/head:hidden">{passing((month) => month.format('MMM YYYY'), short)}</span><span className="hidden @[48rem]/head:inline">{passing((month) => month.format('MMMM YYYY'), title)}</span></h1>
                <ChevronDown aria-hidden className={`size-4 shrink-0 text-foreground/70 transition-transform duration-150 motion-reduce:transition-none ${jump ? 'rotate-180' : ''}`} />
              </button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-72 p-3" data-cal-jump-month>
              <MiniMonth anchor={anchor} days={mode === 'month' ? [] : days} onPick={(day) => (chime('tap'), setPeek(null), setAnchor(day), setJump(false))} />
            </PopoverContent>
          </Popover>
          {/* What is late, counted calmly beside the title; its menu holds "Reschedule all…" and the late ones. */}
          {!tight && lateMenu}
          </div>
          {/* The week's number and days; then, quietly, how the planning went. */}
          <p data-cal-subtitle className="flex min-w-0 items-center gap-1 overflow-hidden text-control whitespace-nowrap text-foreground/75 tabular-nums [&_[data-late-all]]:h-6 [&_[data-late-all]]:px-1.5 [&_[data-late-all]]:text-control [&_[data-plan-total]]:px-0 [&_[data-plan-total]]:text-control [&_[data-plan-total]]:text-foreground/75">
            {/* Narrow, the late pill waits on this line, so the title is never cut for it. */}
            {tight && lateMenu}
            <span data-unfaded className="min-w-0 truncate"><span className="@[48rem]/head:hidden">{passing((month) => weeksSaid(month, true), said(true))}</span><span className="hidden @[48rem]/head:inline">{passing((month) => weeksSaid(month, false), subtitle)}</span></span>
            {!narrow && mode !== 'month' && <span className="hidden min-w-0 items-center gap-1 @[66rem]/head:inline-flex"><PlannedTotal lead tasks={tasks} from={dayKey(first)} to={dayKey(last)} span={mode === 'day' ? (first.isSame(dayjs(), 'day') ? 'today' : 'this day') : current(first) ? 'this week' : 'that week'} /></span>}
          </p>
        </div>
        {/* ‹ | Today | ›, one control, as Todoist has it. */}
        <div data-cal-step className="flex h-8 shrink-0 items-center rounded-md border bg-background">
          <Tip label={`The ${unit} before (←)`}><Button variant="ghost" size="icon-sm" data-cal-prev aria-label={`The ${unit} before`} className="h-full rounded-r-none" onClick={() => step(-1)}><ChevronLeft /></Button></Tip>
          <span aria-hidden className="h-4 w-px bg-border" />
          <Tip label="Today (T)"><Button variant="ghost" size="sm" data-cal-today disabled={onToday} className="h-full rounded-none px-3" onClick={today}>Today</Button></Tip>
          <span aria-hidden className="h-4 w-px bg-border" />
          <Tip label={`The ${unit} after (→)`}><Button variant="ghost" size="icon-sm" data-cal-next aria-label={`The ${unit} after`} className="h-full rounded-l-none" onClick={() => step(1)}><ChevronRight /></Button></Tip>
        </div>
        <ViewPick mode={mode} onPick={setMode} short={tight} />
        {/* This view's own: what it shows (⌘K searches it), a new event; then the right panel's toggle, at the far end as the left one is at the start. */}
        <div className="flex shrink-0 items-center gap-2">
          {mode === 'month' ? <MonthShowMenu>{tight && panelLines}</MonthShowMenu> : <DayShowMenu on={marked} onChange={setMarked}>{tight && panelLines}</DayShowMenu>}
          <Tip label="A new event"><Button size="sm" data-cal-new-event aria-label="New event" className="h-8" onClick={newEvent}><Plus /><span className="hidden @[46rem]/head:inline">New event</span></Button></Tip>
          {!tight && <Tip label={mode === 'month' ? 'Upcoming shows beside a day or a week' : upcoming ? 'Hide Upcoming, the right panel' : 'Show Upcoming, the right panel'}>
            <Button variant="outline" size="icon-sm" data-cal-side-toggle disabled={mode === 'month'} aria-label={upcoming ? 'Hide Upcoming' : 'Show Upcoming'} aria-pressed={upcoming} className="size-8 aria-pressed:bg-accent" onClick={plan}><PanelRight /></Button>
          </Tip>}
        </div>
      </header>
      {/* Clipped, never scrollable: the floating panel's field takes the keys while it is still off to the right, and a box that
          could scroll would scroll the days aside to show it. */}
      <div className="relative flex min-h-0 flex-1 overflow-clip border-t">
        {left && (
          <aside data-cal-side className="relative flex shrink-0 flex-col border-r" style={{ width: `${leftRem}rem` }}>
            {leftGrip}
            {/* Faded at the edge it goes on past, as every long side list is. */}
            <div className="mf-more flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-3 py-4">
            <MiniMonth anchor={anchor} days={mode === 'month' ? [] : days} onPick={(day) => (chime('tap'), setPeek(null), setAnchor(day))} />
            <CalendarLayers layers={layers} />
            {/* The Inbox's island: what it holds, how many, and a fold. Drag one onto a day or an hour to give it a time. */}
            <IslandBox name="Unscheduled" island={looseIsland} shown={looseShown.length} icon={<CalendarX2 aria-hidden className="size-4 shrink-0 text-muted-foreground" />}>
              {!unscheduled.length && <p className="px-2 py-1.5 text-body text-foreground/85">Every open task has a day.</p>}
              <ul ref={looseBox} {...looseHover.handlers} data-cal-unscheduled className="relative isolate flex flex-col">
                <Highlight light={looseHover.light} className="bg-accent/25" />
                {looseShown.map((task) => (
                  <li key={task.id}>
                    <RowMenu items={() => taskMenu(task, { open: () => pick(task.id), now: taskNow })}>
                      <Tip label={taskName(task.title).text}>
                      <button type="button" data-cal-loose={task.id} data-open={task.id === picked || undefined}
                        onPointerDown={(event) => start(event, (x, y) => ({ kind: 'move', task, grab: 0, length: task.estimate ?? USUAL, x, y, to: null }), () => pick(task.id))}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') (event.preventDefault(), pick(task.id))
                          if (event.key === 'Backspace' || event.key === 'Delete') (event.preventDefault(), void moveToBin([{ type: 'task', id: task.id, status: task.status }]))
                        }}
                        className={`flex h-8 w-full touch-none items-center gap-2.5 rounded-md px-2 text-left text-body text-foreground transition-[scale] duration-150 ease-out active:scale-[0.98] motion-reduce:transition-none ${task.id === picked ? 'bg-accent' : ''} ${carry?.kind === 'move' && carry.task.id === task.id ? 'opacity-40' : ''}`}>
                        <span aria-hidden className="size-3 shrink-0 rounded-full border-[1.5px]" style={{ borderColor: task.priority === 1 ? 'var(--tt-color-text-orange)' : ACCENT }} />
                        <span dir="auto" className="min-w-0 flex-1 truncate">{taskName(task.title).text}</span>
                      </button>
                      </Tip>
                    </RowMenu>
                  </li>
                ))}
              </ul>
            </IslandBox>
            </div>
          </aside>
        )}
        <div ref={pane} className="relative min-h-0 min-w-0 flex-1">
          {/* One level in front; beside it, unseen, the one a pinch is heading for or the one just left. Each keeps its
              own place in the pane, so changing which is in front draws nothing again. */}
          {[...levels].sort((a, b) => DEPTH[a.mode] - DEPTH[b.mode]).map((one) => {
            const top = one === showing
            return (
              <div key={one.mode} ref={top ? level : undefined} data-cal-level={top ? '' : undefined} data-cal-depth={one.mode} data-cal-at={dayKey(one.anchor)} data-cal-role={top ? 'here' : (one as Shadow).role}
                inert={!top} className={`absolute inset-0 flex min-h-0 flex-col ${top ? '' : 'opacity-0 [will-change:opacity] [&_[data-cal-body]]:[will-change:transform] [&_[data-cal-names]]:[will-change:opacity]'}`}>
                <Kept still={!top} of={`${one.mode} ${dayKey(one.anchor)}`}>
                {one.mode === 'month' ? (
                  <div className="flex min-h-0 flex-1 flex-col p-3">
                    <MonthPlan bare month={one.anchor} tasks={shownTasks} onSide={setPanel} onOpen={onOpen} extraSaid={[eventsSaid, study, layers.calendars]}
                      dayExtra={(day) => [
                        ...studyChips(study.get(day), MONTH_CHIP),
                        ...(eventsByDay.get(day) ?? []).map((one) => <EventChip key={one.key} one={one} day={day} month calendars={layers.calendars} onOpen={pickEvent} onPeek={onPeek} onNote={onOpen} />)
                      ]}
                      bars={shownEvents.filter(manyDays).map((one) => ({ key: one.key, from: dayKey(one.start), to: dayKey(dayjs(one.end).subtract(1, 'minute')), render: (day: string) => <EventChip one={one} day={day} month calendars={layers.calendars} onOpen={pickEvent} onPeek={onPeek} onNote={onOpen} /> }))}
                      onShown={(month) => void (top && setAnchor(month.isSame(dayjs(), 'month') ? dayjs().startOf('day') : month))}
                      onDay={(day) => (setAnchor(dayjs(day)), setMode('day'))} onWeek={(monday) => (setAnchor(dayjs(monday)), setMode('week'))} />
                  </div>
                ) : (
                  <Grid days={daysOf(one)} wide={paneWide} startTop={top ? undefined : (one as Shadow).top} tasks={shownTasks} marks={marked ? captures : undefined} study={study} onHead={(day) => (setAnchor(day), setMode('day'))} onPoint={(at) => void (pointed.current = at)} calendars={layers.calendars} {...blockProps} events={eventsOn(daysOf(one))} />
                )}
                </Kept>
              </div>
            )
          })}
        </div>
        {/* The right sidebar, as Notion Calendar's: Upcoming, or in its place the event or task being made or opened; closed,
            Upcoming is back. It floats over the days on the shared frost, so they keep their whole width under it. */}
        <DaySide inline ask={panel} width={`${panel ? editorRem : rightRem}rem`} grip={panel ? editorGrip : rightGrip} onClose={() => setPanel(null)} onOpen={onOpen}
          rest={upcoming ? <Upcoming tasks={shownTasks} name={calendarName} onPeek={(one, at) => (goTo(dayjs(one.start)), onPeek(one, at))} onTask={(task) => (goTo(dayjs(task.dueAt!)), setChosen(task.id), pick(task.id))} /> : null} />
      </div>
      {carry?.kind === 'move' && (!carry.to || carry.to.minute === null) && createPortal(
        <div data-cal-carried style={{ left: carry.x + 8, top: carry.y + 8 }}
          className={`pointer-events-none fixed z-50 flex max-w-56 items-center gap-2 ${CARD}`}>
          <span aria-hidden className="size-2 shrink-0 rounded-[2px]" style={{ background: ACCENT }} />
          <span dir="auto" className="truncate">{taskName(carry.task.title).text}</span>
        </div>, document.body)}
      <EventCardLayer peek={peekNow} calendar={peekNow ? calendarName(peekNow.one) : ''} onEdit={pickEvent} onClose={() => setPeek(null)} onNote={onOpen} />
    </section>
  ) as React.JSX.Element
}

/**
 * A side panel's width, dragged at its inner edge, held between its least and
 * most, its usual width a detent with a tick (double-click puts it back), and
 * kept between visits. ← and → move it a rem at a time once the edge has focus.
 */
function usePanelWidth(at: { key: string; home: number; least: number; most: number }, side: 'left' | 'right'): [number, React.JSX.Element] {
  const [rem, setRem] = useState(() => {
    try {
      const kept = Number(localStorage.getItem(at.key))
      return kept ? Math.min(at.most, Math.max(at.least, kept)) : at.home
    } catch {
      return at.home
    }
  })
  const keep = (next: number): void => {
    const held = Math.min(at.most, Math.max(at.least, next))
    setRem(held)
    store(at.key, String(Math.round(held * 4) / 4))
  }
  const grip = (
    <div role="separator" tabIndex={0} aria-orientation="vertical" aria-valuemin={at.least} aria-valuemax={at.most} aria-valuenow={Math.round(rem)}
      aria-label={`Drag to resize the ${side === 'left' ? 'left' : 'right'} panel`} title="Drag to resize · double-click to reset"
      data-cal-grip={side} data-home={rem === at.home || undefined}
      className={`group/grip absolute inset-y-0 z-20 w-3 cursor-col-resize outline-none ${side === 'left' ? '-right-1.5' : '-left-1.5'}`}
      onDoubleClick={() => (chime('tap'), keep(at.home))}
      onKeyDown={(event) => {
        if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
        event.preventDefault()
        const wider = (event.key === 'ArrowRight') === (side === 'left')
        const next = Math.min(at.most, Math.max(at.least, rem + (wider ? 1 : -1)))
        if (next !== rem) (chime('tap'), keep(next))
      }}
      onPointerDown={(event) => {
        if (event.button !== 0) return
        event.preventDefault()
        const px = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16
        const [x0, from] = [event.clientX, rem]
        const tick = slotTicker()
        tick.start(from === at.home ? 'home' : null)
        const move = (e: PointerEvent): void => {
          const next = detent(from + ((e.clientX - x0) / px) * (side === 'left' ? 1 : -1), at.home, 0.6)
          // The least and the most are heard too, as the edge stops there.
          tick(next === at.home ? 'home' : next <= at.least ? 'least' : next >= at.most ? 'most' : null)
          if (next !== at.home && next > at.least && next < at.most) tick.start(null)
          keep(next)
        }
        const up = (): void => {
          window.removeEventListener('pointermove', move)
          window.removeEventListener('pointerup', up)
          document.body.style.removeProperty('cursor')
        }
        document.body.style.cursor = 'col-resize'
        window.addEventListener('pointermove', move)
        window.addEventListener('pointerup', up)
      }}>
      {/* Quick capture's grabber stood on end: a short rounded bar in muted ink, centred on the edge, never a line
          down a rounded panel's side. Faint at rest, stronger and larger when pointed at or held; the panel's own
          edge lights with it (DaySide). */}
      <span className="absolute top-1/2 left-1/2 h-8 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-foreground/25 opacity-0 transition-[opacity,background-color,scale] duration-150 ease-(--mf-ease) group-hover/grip:scale-y-150 group-hover/grip:bg-foreground/45 group-hover/grip:opacity-100 group-focus-visible/grip:bg-foreground/60 group-focus-visible/grip:opacity-100 group-active/grip:scale-y-150 group-active/grip:bg-foreground/60 group-active/grip:opacity-100 [[data-cal-right]:hover_&]:opacity-100 motion-reduce:transition-none motion-reduce:group-hover/grip:scale-y-100" />
    </div>
  )
  return [rem, grip]
}

type BlockProps = {
  carry: Carry | null
  start: (event: React.PointerEvent, begin: (x: number, y: number) => Carry | null, click?: () => void) => void
  onPick: (id: string) => void
  taskNow: ReturnType<typeof useTaskNow>
  draft: Draft | null
  setDraft: (draft: Draft | null) => void
  /** The events shown, and the way one opens in the panel. */
  events: Shown[]
  onEvent: (key: string) => void
  /** An event clicked: its small card beside it. */
  onPeek: (one: Shown, at: DOMRect) => void
  onOpen?: (type: string, id: string) => void
  /** The task just set down, to settle in once it is drawn at its new time. */
  landed: { id: string; due: string } | null
}

/** A small month beside the grid: the days shown are a band, today a filled pill, and a day clicked goes there. */
function MiniMonth({ anchor, days, onPick }: { anchor: Dayjs; days: Dayjs[]; onPick: (day: Dayjs) => void }): React.JSX.Element {
  const [month, setMonth] = useState(anchor.startOf('month'))
  useEffect(() => setMonth(anchor.startOf('month')), [anchor])
  const first = month.startOf('week')
  const weeks = month.endOf('month').diff(first, 'day') >= 35 ? 6 : 5
  const cells = Array.from({ length: weeks * 7 }, (_, at) => first.add(at, 'day'))
  const shown = new Set(days.map(dayKey))
  const now = dayKey()
  return (
    <div data-cal-mini className="flex flex-col gap-1.5">
      <div className="flex h-7 items-center gap-0.5 pl-1">
        <span className="flex-1 text-body font-semibold text-foreground">{month.format('MMMM YYYY')}</span>
        <Tip label="The month before"><Button variant="ghost" size="icon-sm" aria-label="The month before" onClick={() => (chime('tap'), setMonth(month.subtract(1, 'month')))}><ChevronLeft /></Button></Tip>
        <Tip label="The month after"><Button variant="ghost" size="icon-sm" aria-label="The month after" onClick={() => (chime('tap'), setMonth(month.add(1, 'month')))}><ChevronRight /></Button></Tip>
      </div>
      <div className="grid grid-cols-7 gap-y-0.5 text-center">
        {cells.slice(0, 7).map((day) => <span key={day.day()} className="pb-1 text-meta font-medium text-foreground/60">{day.format('dd').charAt(0)}</span>)}
        {cells.map((day, at) => {
          const key = dayKey(day)
          const band = shown.has(key)
          const edge = band && (at % 7 === 0 || !shown.has(dayKey(day.subtract(1, 'day')))) ? 'rounded-l-md' : ''
          const end = band && (at % 7 === 6 || !shown.has(dayKey(day.add(1, 'day')))) ? 'rounded-r-md' : ''
          return (
            <button key={key} type="button" data-cal-mini-day={key} aria-label={day.format('dddd D MMMM')} aria-current={key === now ? 'date' : undefined} onClick={() => onPick(day)}
              className={`group/mini flex h-8 items-center justify-center text-control tabular-nums outline-none ${band ? `bg-accent ${edge} ${end}` : ''}`}>
              <span className={`flex size-7 items-center justify-center rounded-md transition-colors duration-150 group-focus-visible/mini:ring-2 group-focus-visible/mini:ring-ring motion-reduce:transition-none ${key === now ? 'bg-[var(--tt-color-text-red)] font-semibold text-white' : day.month() !== month.month() ? 'text-foreground/40 group-hover/mini:bg-foreground/8' : `text-foreground group-hover/mini:bg-foreground/8 ${band ? 'font-medium' : ''}`}`}>
                {day.date()}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

/** Day, Week and Month as one control, the chosen one a raised pill that slides to the next. */
function ViewPick({ mode, onPick, short = false }: { mode: Mode; onPick: (mode: Mode) => void; /** A narrow bar: each view by its key's letter, its name in the tip. */ short?: boolean }): React.JSX.Element {
  const pill = useId()
  const views: [Mode, string, string][] = [['day', 'Day', 'D'], ['week', 'Week', 'W'], ['month', 'Month', 'M']]
  return (
    <div role="radiogroup" aria-label="The view" data-cal-views className="flex h-8 shrink-0 items-center rounded-lg bg-accent/70 p-0.5">
      {views.map(([id, label, key]) => (
        <Tip key={id} label={`${label} (${key})`}>
          <button type="button" role="radio" aria-checked={mode === id} data-cal-view={id} onClick={() => onPick(id)}
            aria-label={label} className={`relative h-7 rounded-md ${short ? 'w-8' : 'px-3'} text-control outline-none focus-visible:ring-2 focus-visible:ring-ring ${mode === id ? 'text-foreground' : 'text-foreground/75 hover:text-foreground'}`}>
            {mode === id && <motion.span layoutId={pill} aria-hidden className="absolute inset-0 rounded-md bg-background shadow-sm" transition={byKeys() ? { duration: 0 } : { type: 'spring', stiffness: 520, damping: 40 }} />}
            {/* Bolder when picked in the room its bold word already takes, so the three never shift. */}
            <Weighted on={mode === id} className="relative">{short ? key : label}</Weighted>
          </button>
        </Tip>
      ))}
    </div>
  )
}

/**
 * Upcoming, the next seven days under the small month: each day's events and
 * timed tasks, a colour dot, the name, then its time and calendar. Today
 * leaves out what is over, and says so when nothing is left. A row clicked
 * opens it: an event's card beside the row, a task in the panel.
 */
function Upcoming({ tasks, name, onPeek, onTask }: { tasks: Task[]; name: (one: Shown) => string; onPeek: (one: Shown, at: DOMRect) => void; onTask: (task: Task) => void }): React.JSX.Element {
  const now = useMinute()
  const from = dayjs(now).startOf('day')
  const to = from.add(7, 'day')
  const layers = useLayers(from.toDate(), to.toDate())
  const own = useEvents(from.toISOString(), to.toISOString())
  const list: Shown[] = [...own.filter((one) => layers.shown(one.calendarId)).map((one) => ({ ...one, color: colorFor(one, layers.colorOf(one.calendarId)) })), ...macShown(layers.macEvents)]
  type Row = { key: string; start: number; color: string; title: string; said: string; one?: Shown; task?: Task }
  const daysAhead = Array.from({ length: 7 }, (_, n) => from.add(n, 'day')).map((day, n) => {
    const key = dayKey(day)
    const rows: Row[] = [
      ...allDayOn(list, key).map((one) => ({ key: one.key, start: -1, color: one.color, title: one.title || 'New event', said: `All day · ${name(one)}`, one })),
      ...list.filter((one) => !one.allDay && dayKey(one.start) === key && (n > 0 || dayjs(one.end).isAfter(now))).map((one) => ({ key: one.key, start: dayjs(one.start).valueOf(), color: one.color, title: one.title || 'New event', said: `${timeSpan(one.start, one.end)} · ${name(one)}`, one })),
      ...tasks.filter((task) => timed(task) && dayKey(task.dueAt!) === key && (n > 0 || dayjs(task.dueAt!).add(task.estimate ?? USUAL, 'minute').isAfter(now))).map((task) => ({
        key: task.id, start: dayjs(task.dueAt!).valueOf(), color: task.priority === 1 ? 'var(--tt-color-text-orange)' : ACCENT, title: taskName(task.title).text,
        said: `${task.estimate ? timeSpan(task.dueAt!, dayjs(task.dueAt!).add(task.estimate, 'minute').toISOString()) : hm(task.dueAt!)} · Task`, task
      }))
    ].sort((a, b) => a.start - b.start)
    const label = n === 0 ? `Today, ${day.format('ddd D')}` : n === 1 ? `Tomorrow, ${day.format('ddd D')}` : day.format('ddd D')
    return { key, label, rows, n }
  }).filter((day) => day.n === 0 || day.rows.length > 0)
  // What is on now or next, with how long until it starts (or ends).
  const next = list.filter((one) => !one.allDay && !one.cancelled && dayjs(one.end).isAfter(now)).sort((a, b) => dayjs(a.start).valueOf() - dayjs(b.start).valueOf())[0]
  const until = next ? dayjs(next.start).diff(now, 'minute') : 0
  // Its own reads (the week ahead's events, your calendars): its page waits for them, never a day at a time.
  useReading(!layers.ready || unloaded(own))
  const count = daysAhead.reduce((sum, day) => sum + day.rows.length, 0)
  const island = useFold('calendar.upcoming', { total: count })
  return (
    <>
    {/* What is on now or next, when there is one; nothing to say when there is not: Upcoming says it. */}
    {next && (
    <section data-cal-next-up className="flex flex-col gap-1.5">
      {(
        <button type="button" data-cal-next-row={next.key} onClick={(event) => (chime('open'), onPeek(next, event.currentTarget.getBoundingClientRect()))}
          className="flex items-start gap-2.5 rounded-lg border bg-background px-3 py-2.5 text-left outline-none transition-colors duration-150 hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none">
          <span aria-hidden className="mt-[7px] size-2 shrink-0 rounded-[2px]" style={{ background: next.color }} />
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="text-control font-medium" style={{ color: 'var(--tt-color-text-red)' }}>{until <= 0 ? `On now, ${lengthSaid(Math.max(1, dayjs(next.end).diff(now, 'minute')))} left` : `In ${lengthSaid(until)}`}</span>
            <span dir="auto" className="truncate text-body font-semibold text-foreground">{next.title || 'New event'}</span>
            <span className="truncate text-control text-foreground/80 tabular-nums">{dayjs(next.start).isSame(now, 'day') ? '' : `${dayjs(next.start).format('ddd D')} · `}{timeSpan(next.start, next.end)}</span>
          </span>
        </button>
      )}
    </section>
    )}
    {/* The next seven days, as an Inbox island: icon, name, how many, fold. */}
    <section data-cal-upcoming>
    <IslandBox name="Upcoming" island={island} shown={count} icon={<CalendarClock aria-hidden className="size-4 shrink-0 text-muted-foreground" />}>
      <div className="flex flex-col gap-2 py-1">
      {daysAhead.map((day) => (
        <div key={day.key} data-cal-upcoming-day={day.key} className="flex flex-col">
          <h3 className="px-2 py-0.5 text-control font-medium text-foreground/75">{day.label}</h3>
          {!day.rows.length && <p className="px-2 py-1 text-body text-foreground/85">Nothing more today</p>}
          {day.rows.map((row) => (
            <Tip key={row.key} label={`${row.title} ${row.said}`}>
            <button type="button" data-cal-upcoming-row={row.key}
              onClick={(event) => row.one ? (chime('open'), onPeek(row.one, event.currentTarget.getBoundingClientRect())) : row.task && onTask(row.task)}
              className="flex items-start gap-2.5 rounded-md px-2 py-1 text-left outline-none transition-[background-color,scale] duration-150 hover:bg-accent/60 focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.97] motion-reduce:transition-none">
              <span aria-hidden className={`mt-1.5 size-2 shrink-0 ${row.task ? 'rounded-full border-[1.5px]' : 'rounded-[2px]'}`} style={row.task ? { borderColor: row.color } : { background: row.color }} />
              <span className="flex min-w-0 flex-1 flex-col">
                <span dir="auto" className="truncate text-body font-semibold text-foreground">{row.title}</span>
                <span className="truncate text-control text-foreground/80 tabular-nums">{row.said}</span>
              </span>
            </button>
            </Tip>
          ))}
        </div>
      ))}
      </div>
    </IslandBox>
    </section>
    </>
  )
}

/** A block's place across its column: its lane's share, a hair apart from the next. */
const laneBox = (lane: Lane): React.CSSProperties => {
  const width = 100 / lane.of
  return { left: `calc(${lane.lane * width}% + ${lane.lane ? 1 : 3}px)`, width: `calc(${width}% - ${(lane.of === 1 ? 7 : lane.lane ? 3 : 4) + (lane.room ?? 0)}px)` }
}

/** A block's place across its column: its lane, of how many, and the room kept clear on its right for a "+N" beside it. */
export type Lane = { lane: number; of: number; room?: number }
/** The room a "+N" takes beside a block that has its column alone: the chip never lies over the block's name. */
const MORE_ROOM = 30

/**
 * Lanes past the most a column can show readably: the first few keep theirs
 * (a cluster narrowed to `most`), the rest leave the grid and one "+N" stands
 * in the last lane at the first of them. The one being carried always shows.
 */
function crowd(placed: Map<string, { lane: number; of: number; cluster?: number }>, spans: { id: string; start: number }[], most: number, carried?: string): { get: (id: string) => Lane | undefined; more: { start: number; count: number; lane: Lane }[] } {
  const shown = new Map<string, Lane>()
  const more = new Map<number, { start: number; count: number; lane: Lane }>()
  for (const span of spans) {
    const at = placed.get(span.id)!
    if (at.of <= most) shown.set(span.id, at)
    // A column with room for one keeps the first, narrowed so its "+N" sits beside it, never over its name.
    else if (at.lane < Math.max(1, most - 1) || span.id === carried) shown.set(span.id, { lane: Math.min(at.lane, Math.max(0, most - 1)), of: most, ...(most === 1 ? { room: MORE_ROOM } : {}) })
    else {
      const was = more.get(at.cluster!) ?? { start: span.start, count: 0, lane: { lane: most - 1, of: most } }
      more.set(at.cluster!, { ...was, start: Math.min(was.start, span.start), count: was.count + 1 })
    }
  }
  return { get: (id) => shown.get(id), more: [...more.values()] }
}

/** Timed tasks side by side where they overlap: each its lane, how many lanes its cluster has, and which cluster. */
function lanes(list: { id: string; start: number; end: number }[]): Map<string, { lane: number; of: number; cluster: number }> {
  const out = new Map<string, { lane: number; of: number; cluster: number }>()
  const sorted = [...list].sort((a, b) => a.start - b.start || b.end - a.end)
  let cluster: { id: string; lane: number }[] = []
  let ends: number[] = []
  let reach = -1
  let group = 0
  const close = (): void => { for (const one of cluster) out.set(one.id, { lane: one.lane, of: ends.length, cluster: group }); group++ }
  for (const one of sorted) {
    if (one.start >= reach) (close(), (cluster = []), (ends = []))
    let lane = ends.findIndex((end) => end <= one.start)
    if (lane < 0) lane = ends.push(one.end) - 1
    else ends[lane] = one.end
    cluster.push({ id: one.id, lane })
    reach = Math.max(reach, one.end)
  }
  close()
  return out
}

/**
 * A level of the Calendar that is not in front (unseen ahead of a pinch, or on its way out) is drawn once and left as
 * it is: drawn again with every change to the page, it doubled the work in the very frames the level changes in.
 */
const Kept = memo(function Kept({ children }: { still: boolean; /** Which level it is: another one is drawn afresh. */ of: string; children: React.ReactNode }): React.JSX.Element {
  return <>{children}</>
}, (was, now) => now.still && was.of === now.of)

/** Rows a day's all-day lane shows, whole, before the last becomes "+N more" (its height below is these rows exactly). */
const ALLDAY_ROWS = 5

/** The day or the week by the hour: an untimed line on top, then the hours with the tasks at theirs. */
function Grid({ days, wide, startTop, tasks, marks, study, onHead, onPoint, calendars, ...props }: { days: Dayjs[]; /** The pane's width, for the blocks a day fits side by side to be right from the first draw. */ wide: number; /** The hours it opens on, when it comes in beside another level showing them. */ startTop?: number; tasks: Task[]; /** Captures, drawn as marks at the minute each was caught. */ marks?: CaptureMeta[]; /** The study plan, a day's chips in the all-day lane. */ study: Map<string, StudyDay>; onHead: (day: Dayjs) => void; onPoint: (at: Spot | null) => void; calendars: { id: string; name: string; color: string }[] } & BlockProps): React.JSX.Element {
  const { carry, start, draft, setDraft, events, onEvent, onPeek, onOpen, taskNow } = props
  // The all-day lane folds to one line with its chevron, and stays so.
  const [folded, setFolded] = useState(() => stored('vigil.calendar.allday', 'open', ['open', 'folded'] as const) === 'folded')
  const fold = (): void => (chime(folded ? 'on' : 'off'), store('vigil.calendar.allday', folded ? 'open' : 'folded'), setFolded(!folded))
  const zone = useSecondZone()
  const now = useMinute()
  const scroller = useRef<HTMLDivElement>(null)
  // More in the all-day lane than it shows: its foot fades until scrolled to the end, so the rest is never just missing.
  const lane = useRef<HTMLDivElement>(null)
  const [below, setBelow] = useState(false)
  const laneFade = (): void => { const el = lane.current; if (el) setBelow(el.scrollHeight - el.scrollTop - el.clientHeight > 2) }
  useLayoutEffect(() => {
    const el = lane.current
    if (!el) return
    laneFade()
    const watch = new ResizeObserver(laneFade)
    watch.observe(el)
    for (const child of el.children) watch.observe(child)
    return () => watch.disconnect()
  })
  // How many blocks fit side by side in a day and still say their names: one for every 64px of its column, one to six.
  const fitIn = (width: number): number => Math.max(1, Math.min(6, Math.floor((width - 64) / days.length / 64)))
  const [most, setMost] = useState(() => (Number.isFinite(wide) ? fitIn(wide) : 3))
  useLayoutEffect(() => {
    const el = scroller.current
    if (!el) return
    const measure = (): void => setMost(fitIn(el.clientWidth))
    measure()
    const watch = new ResizeObserver(measure)
    watch.observe(el)
    return () => watch.disconnect()
  }, [days.length])
  // Opened near the working day: an hour before now, or at eight.
  useLayoutEffect(() => {
    const el = scroller.current
    if (el) el.scrollTop = startTop ?? Math.max(0, (dayjs().isSame(days[0], 'week') ? new Date().getHours() - 1 : 8) * HOUR - 8)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  const keys = days.map(dayKey)
  // Stepping a week or a day on by a click, the days come in from the side they lie on,
  // so the step reads as going forward or back. Only the fade under Reduce motion; by
  // ← or → (done many times in a row) and with Motion off, the new days are simply there.
  const grid = useRef<HTMLDivElement>(null)
  const shownFirst = useRef(keys[0])
  useLayoutEffect(() => {
    const was = shownFirst.current
    shownFirst.current = keys[0]
    if (was === keys[0] || !grid.current || byKeys() || document.documentElement.dataset.motion === 'off') return
    const way = keys[0] > was ? 1 : -1
    const calm = still()
    for (const el of grid.current.querySelectorAll<HTMLElement>('[data-cal-col], [data-cal-head], [data-cal-allday-lane] > div'))
      el.animate(calm ? [{ opacity: 0.4 }, { opacity: 1 }] : [{ opacity: 0.35, transform: `translateX(${way * 18}px)` }, { opacity: 1, transform: 'none' }], { duration: calm ? 160 : 220, easing: EASING })
  }, [keys[0]]) // eslint-disable-line react-hooks/exhaustive-deps
  const untimed = useMemo(() => {
    const map = new Map<string, { task: Task; due: boolean }[]>()
    for (const task of tasks) {
      if (task.status !== 'open') continue
      if (task.dueAt && task.allDay) map.set(dayKey(task.dueAt), [...(map.get(dayKey(task.dueAt)) ?? []), { task, due: false }])
      if (task.deadline && (!task.dueAt || dayKey(task.deadline) !== dayKey(task.dueAt))) map.set(dayKey(task.deadline), [...(map.get(dayKey(task.deadline)) ?? []), { task, due: true }])
    }
    return map
  }, [tasks])
  const hours = Array.from({ length: 24 }, (_, hour) => hour)
  // Focus time on each task, for its "planned · did"; and what is late, for a late day's right click.
  const did = useFocusOn(keys[0], keys[keys.length - 1])
  const late = lateOnes(tasks)
  const cols = `${gutterOf(zone)} repeat(${days.length}, minmax(0, 1fr))`
  const todayKey = dayKey(now)
  const showsToday = keys.includes(todayKey)
  const nowMinute = now.getHours() * 60 + now.getMinutes()
  return (
    <div ref={grid} data-cal-grid className="flex min-h-0 flex-1 flex-col">
      {/* The day names and the untimed line stay put while the hours scroll, and while a pinch grows them (cal-pinch.ts). */}
      <div data-cal-names className="grid shrink-0 border-b" style={{ gridTemplateColumns: cols }}>
        {zone ? <ZoneHeads zone={zone} day={keys[0]} /> : <span data-cal-zone-here className="self-center pr-2 text-right text-meta font-medium text-foreground/70">{zoneShort(Intl.DateTimeFormat().resolvedOptions().timeZone, dayjs(keys[0]).hour(12).toDate())}</span>}
        {days.map((day) => {
          const key = dayKey(day)
          return (
            <RowMenu key={key} items={() => lateItems(late.filter((task) => dayKey(task.dueAt!) === key))}>
            <button type="button" data-cal-head={key} data-cal-late={late.some((task) => dayKey(task.dueAt!) === key) || undefined} onClick={() => (chime('open'), onHead(day))} aria-label={`Open ${day.format('dddd D MMMM')}`}
              className={`@container/head-day flex h-11 min-w-0 items-center gap-1.5 overflow-hidden border-l border-border/60 px-1 text-body @[4.5rem]/head-day:px-2.5 transition-colors duration-150 hover:bg-accent/60 motion-reduce:transition-none ${days.length === 1 ? 'justify-center' : ''} ${weekend(day) ? MUTED_DAY : ''}`}>
              {/* A narrow column keeps the date whole and says the day in two letters; narrower still, the date alone. */}
              <span className="hidden shrink-0 text-foreground/75 @[4.25rem]/head-day:inline"><span className="@[5.5rem]/head-day:hidden">{day.format('dd')}</span><span className="hidden @[5.5rem]/head-day:inline">{day.format('ddd')}</span></span>
              <span className={`flex h-6 min-w-6 shrink-0 items-center justify-center rounded-md px-1 tabular-nums ${key === todayKey ? 'bg-[var(--tt-color-text-red)] font-semibold text-white' : 'font-semibold text-foreground'}`}>{day.date()}</span>
            </button>
            </RowMenu>
          )
        })}
        {/* The all-day lane: whole-day events across the days they cover, then each day's untimed tasks. */}
        <span className="flex flex-col items-end gap-0.5 border-t border-border/60 pt-1.5 pr-2">
          <span className="text-meta font-medium whitespace-nowrap text-foreground/70">All-day</span>
          <Tip label={folded ? 'Show the whole lane' : 'Fold the lane to one line'}>
            <button type="button" data-cal-allday-fold aria-expanded={!folded} aria-label={folded ? 'Show the whole all-day lane' : 'Fold the all-day lane'} onClick={fold}
              className="flex size-6 items-center justify-center rounded-md text-foreground/70 outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring">
              <ChevronDown className={`size-3.5 transition-transform duration-150 motion-reduce:transition-none ${folded ? '-rotate-90' : ''}`} />
            </button>
          </Tip>
        </span>
        <div data-cal-allday-lane data-folded={folded || undefined} className="relative" style={{ gridColumn: `2 / span ${days.length}` }}>
          <div className="absolute inset-0 grid" style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` }}>
            {keys.map((key, at) => {
              const over = carry?.kind === 'move' && carry.to?.minute === null && carry.to.day === key
              return (
                <div key={key} data-cal-allday={key}
                  onClick={(event) => event.target === event.currentTarget && (chime('tap'), setDraft({ day: key, minute: null, length: 0 }))}
                  className={`cursor-default border-t border-l border-border/60 ${over ? 'bg-accent' : weekend(days[at]) ? MUTED_DAY : ''}`} />
              )
            })}
          </div>
          <div ref={lane} onScroll={laneFade} className={`pointer-events-none relative grid min-h-8 gap-x-1 gap-y-[3px] overflow-y-auto px-[3px] py-[3px] ${folded ? 'max-h-8 overflow-hidden' : days.length === 1 ? 'max-h-[276px]' : 'max-h-[138px]'} ${below && !folded ? '[mask-image:linear-gradient(to_bottom,#000_calc(100%-16px),transparent)]' : ''}`}
            style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))`, gridAutoFlow: 'row dense', gridAutoRows: '24px' }}>
            {/* Bars over more than one day first, so they keep the top rows; a one-day event joins its day's list below. */}
            {events.filter((one) => one.allDay && manyDays(one) && dayKey(one.start) <= keys[keys.length - 1] && dayKey(dayjs(one.end).subtract(1, 'minute')) >= keys[0]).map((one) => {
              const from = Math.max(0, keys.indexOf(dayKey(one.start)) < 0 ? 0 : keys.indexOf(dayKey(one.start)))
              const lastKey = dayKey(dayjs(one.end).subtract(1, 'minute'))
              const to = keys.indexOf(lastKey) < 0 ? keys.length - 1 : keys.indexOf(lastKey)
              return <EventChip key={one.key} one={one} day={keys[from]} calendars={calendars} span={{ gridColumn: `${from + 1} / ${to + 2}`, pointerEvents: 'auto' }} onOpen={onEvent} onPeek={onPeek} onNote={onOpen} />
            })}
            {/* The study plan: each day's reviews and the book you finish then, in the lane before its tasks. */}
            {keys.flatMap((key, at) => studyChips(study.get(key), { gridColumn: at + 1 }, key))}
            {keys.flatMap((key, at) => {
              // A Mac calendar's way with a crowded day: a few rows, then "+N more", which opens the day's own page with its whole
              // list. The day's one-day events count as rows too: 15 of them once ran past the lane, the last cut in half.
              const own = events.filter((one) => one.allDay && !manyDays(one) && dayKey(one.start) === key)
              const all = [...own.map((one) => ({ one })), ...(untimed.get(key) ?? [])]
              // The lane shows ALLDAY_ROWS whole rows; bars over many days and the study chips on this day take theirs first,
              // so "+N more" always lands in sight.
              const taken = events.filter((one) => one.allDay && manyDays(one) && dayKey(one.start) <= key && dayKey(dayjs(one.end).subtract(1, 'minute')) >= key).length + studyChips(study.get(key)).length
              // One day has the room a week shares: up to ten rows before "+N more" (a crowded day opened from a week's "+N more"),
              // in a lane twice as tall (276px), so no row is cut.
              const cap = Math.max(2, (days.length === 1 ? 10 : ALLDAY_ROWS) - taken)
              const shown = all.length > cap ? all.slice(0, cap - 1) : all
              const more = all.length - shown.length
              return [
              ...shown.map((item) => 'one' in item
                ? <EventChip key={item.one.key} one={item.one} day={key} calendars={calendars} span={{ gridColumn: at + 1, pointerEvents: 'auto' }} onOpen={onEvent} onPeek={onPeek} onNote={onOpen} />
                : <div key={`${item.due ? 'due' : 'on'}:${item.task.id}`} className="pointer-events-auto grid min-w-0" style={{ gridColumn: at + 1 }}><Untimed task={item.task} due={item.due} {...props} /></div>
              ),
              ...(more ? [
                <button key={`more:${key}`} type="button" data-cal-allday-more={key} aria-label={`Open ${dayjs(key).format('dddd D MMMM')}: ${plural(all.length, 'thing')} all day`}
                  // Events hidden in a week: the Calendar's own Day view, where they all have room. Already one day, or only
                  // to-dos hidden: the day's own page with its whole list.
                  onClick={() => (chime('open'), days.length > 1 && all.slice(shown.length).some((item) => 'one' in item) ? onHead(dayjs(key)) : onOpen?.('day', key))}
                  className="pointer-events-auto min-w-0 truncate rounded-[5px] px-1.5 text-left text-control leading-6 font-medium whitespace-nowrap text-foreground hover:bg-accent" style={{ gridColumn: at + 1 }}>
                  +{num(more)} more
                </button>
              ] : []),
              ...(draft && draft.minute === null && draft.day === key ? [<span key={`new:${key}`} data-cal-new className="rounded-[5px] bg-accent px-1.5 text-control leading-6 text-foreground ring-1 ring-foreground/20" style={{ gridColumn: at + 1 }}>New</span>] : [])
            ]})}
          </div>
        </div>
      </div>
      {/* The hours grow and shrink with a pinch inside this frame, never over the names above. */}
      <div className="flex min-h-0 flex-1 flex-col overflow-clip">
      <div ref={scroller} data-cal-scroll data-cal-body className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto"
        onPointerMove={(event) => onPoint(spotAt(event.clientX, event.clientY))} onPointerLeave={() => onPoint(null)}>
        <div className="relative grid" style={{ gridTemplateColumns: cols, height: HOUR * 24 }}>
          <div className="relative">
            {zone && <ZoneHours zone={zone} day={keys[0]} />}
            {hours.slice(1).filter((hour) => !showsToday || Math.abs(hour * 60 - nowMinute) > 12).map((hour) => (
              <span key={hour} className="absolute right-2 -translate-y-1/2 text-meta text-foreground/70 tabular-nums" style={{ top: hour * HOUR }}>
                {hm(dayjs().hour(hour).minute(0).toDate())}
              </span>
            ))}
            {/* Now, in a small red pill on the hours. */}
            {showsToday && <span data-cal-now-pill className="absolute right-1 z-10 -translate-y-1/2 rounded-[5px] px-1.5 py-px text-meta font-semibold text-white tabular-nums" style={{ top: (nowMinute / 60) * HOUR, background: RED }}>{hm(now)}</span>}
          </div>
          {/* Now, as a thin line across the week; strong on today's own column. */}
          {showsToday && days.length > 1 && <div aria-hidden className="pointer-events-none absolute right-0 z-[3] h-px opacity-50" style={{ left: gutterOf(zone), top: (nowMinute / 60) * HOUR, background: RED }} />}
          {days.map((day) => {
            const key = dayKey(day)
            const mine = tasks.filter((task) => onGrid(task) && dayKey(task.dueAt!) === key && !(carry && carry.kind !== 'new' && carry.task.id === task.id))
            // Captures, when shown, take a lane of their own like a short block, so a name never sits on another's edge.
            const caught = (marks ?? []).filter((one) => one.status !== 'discarded' && dayKey(one.capturedAt) === key)
            const spans: { id: string; task?: Task; one?: Shown; capture?: CaptureMeta; start: number; end: number }[] = [
              ...mine.map((task) => ({ id: task.id, task, start: minuteOf(task.dueAt!), end: minuteOf(task.dueAt!) + Math.max(SNAP, task.estimate ?? USUAL) })),
              ...eventSpans(events, key),
              ...caught.map((one) => ({ id: `capture:${one.id}`, capture: one, start: minuteOf(one.capturedAt), end: minuteOf(one.capturedAt) + CAUGHT }))
            ]
            // The one being carried or stretched, drawn where it would land.
            const moving = carry?.kind === 'move' && carry.to?.minute != null && carry.to.day === key ? { task: carry.task, start: carry.to.minute, length: carry.length }
              : carry?.kind === 'resize' && carry.day === key ? { task: carry.task, start: carry.start, length: carry.length } : null
            if (moving) spans.push({ id: moving.task.id, task: moving.task, start: moving.start, end: moving.start + moving.length })
            const placed = crowd(lanes(spans), spans, most, moving?.task.id)
            const drawing = carry?.kind === 'new' && carry.day === key ? { start: Math.min(carry.from, carry.to), length: Math.max(SNAP, Math.abs(carry.to - carry.from)) } : null
            return (
              <div key={key} data-cal-col={key} data-weekend={weekend(day) || undefined}
                onPointerDown={(event) => {
                  if (event.target !== event.currentTarget) return
                  const from = snap(((event.clientY - event.currentTarget.getBoundingClientRect().top) / HOUR) * 60, SNAP)
                  start(event, () => ({ kind: 'new', day: key, from, to: from + SNAP }),
                    () => (chime('tap'), setDraft({ day: key, minute: Math.floor(from / 30) * 30, length: USUAL })))
                }}
                // A double-click makes an event there, as a drag across does; one click, a task.
                onDoubleClick={(event) => {
                  if (event.target !== event.currentTarget && !(event.target as Element).closest('[data-cal-draft]')) return
                  const from = Math.floor(((event.clientY - event.currentTarget.getBoundingClientRect().top) / HOUR) * 2) * 30
                  setDraft({ day: key, minute: from, length: USUAL, drag: true })
                }}
                className={`relative cursor-cell touch-none border-l border-border/60 ${weekend(day) ? MUTED_DAY : ''}`}
                style={{ backgroundImage: `repeating-linear-gradient(to bottom, color-mix(in oklab, var(--border) 75%, transparent) 0 1px, transparent 1px ${HOUR}px)` }}>
                {/* A crowded hour: as many side by side as stay readable, then "+N more", which opens the day's own page with its whole list. */}
                {placed.more.map((more) => (
                  <button key={`more:${more.start}`} type="button" data-cal-crowd-more={key} aria-label={`Open ${dayjs(key).format('dddd D MMMM')}: ${num(more.count)} more at ${hm(atMinute(key, more.start))}`}
                    onPointerDown={(event) => event.stopPropagation()} onClick={() => (chime('open'), days.length > 1 ? onHead(dayjs(key)) : onOpen?.('day', key))}
                    className="absolute z-[3] flex h-5 items-center justify-center rounded-[5px] bg-accent px-1 text-meta font-semibold whitespace-nowrap text-foreground tabular-nums outline-none transition-[scale,background-color] duration-150 hover:bg-accent/70 focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.97] motion-reduce:transition-none"
                    style={{ top: (more.start / 60) * HOUR + 1, ...(more.lane.of === 1 ? { right: 2, width: MORE_ROOM - 3 } : laneBox(more.lane)) }}>
                    +{num(more.count)}
                  </button>
                ))}
                {spans.filter((span) => placed.get(span.id)).map((span) => span.capture ? (
                  <CaptureMark key={span.id} one={span.capture} at={span.start} lane={placed.get(span.id)!} onOpen={props.onOpen} />
                ) : span.one ? (
                  <EventBlock key={span.id} one={span.one} day={key} at={span.start} length={span.end - span.start} lane={placed.get(span.id)!} calendars={calendars} onOpen={onEvent} onPeek={onPeek} onNote={onOpen} />
                ) : (
                  <Block key={span.id} task={span.task!} day={key} at={span.start} length={span.end - span.start} lane={placed.get(span.id)!}
                    lifted={moving?.task.id === span.id} did={did.get(span.id)} {...props} />
                ))}
                {/* Where the task carried would land: an outline at the slot, the block lifted a little off it. */}
                {moving && carry?.kind === 'move' && <div data-cal-ghost aria-hidden className="pointer-events-none absolute z-[25] rounded-[6px] outline-2 outline-dashed" style={{ top: (moving.start / 60) * HOUR + 1, height: Math.max(20, (moving.length / 60) * HOUR - 2), ...laneBox(placed.get(moving.task.id)!), outlineColor: ACCENT }} />}
                {drawing && <div data-cal-drawing className="pointer-events-none absolute inset-x-1 rounded-[6px] border-2 border-[var(--tt-brand-color-400)] bg-[color-mix(in_oklab,var(--tt-brand-color-400)_18%,transparent)]" style={{ top: (drawing.start / 60) * HOUR, height: (drawing.length / 60) * HOUR }} />}
                {draft && draft.minute !== null && draft.day === key && (
                  <div data-cal-draft className="absolute inset-x-1 z-20 flex flex-col rounded-[6px] border-2 border-[var(--tt-brand-color-400)] bg-background px-1 py-0.5 shadow-(--mf-panel-shadow)" style={{ top: (draft.minute / 60) * HOUR, minHeight: Math.max(28, (draft.length / 60) * HOUR) }}>
                    <span className="px-1 text-control font-semibold text-foreground">{draft.drag ? 'New event' : 'New task'}</span>
                    <span className="px-1 text-meta text-foreground/80 tabular-nums">{timeSpan(atMinute(key, draft.minute), atMinute(key, draft.minute + draft.length))}</span>
                  </div>
                )}
                {key === todayKey && <SessionGhost focus={taskNow.focus} tasks={tasks} now={now} next={spans.filter((one) => one.id !== taskNow.focus?.taskId).map((one) => ({ start: one.start, name: one.task ? taskName(one.task.title).text : one.one?.title ?? '' }))} />}
                {key === todayKey && (
                  <div data-cal-now aria-label={`Now, ${clock(now.toISOString())}`} className="pointer-events-none absolute inset-x-0 z-10" style={{ top: (nowMinute / 60) * HOUR }}>
                    <span className="absolute -top-1 -left-1 size-2 rounded-full shrink-0" style={{ background: RED }} />
                    <span className="absolute inset-x-0 -top-px h-0.5" style={{ background: RED }} />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
      </div>
    </div>
  )
}

/** How long a capture's pill counts for in its lane: as tall as the shortest block, so its words fit. */
const CAUGHT = 22

/**
 * A capture at the minute it was caught: a small pill in its kind's colour
 * with its words, in a lane of its own beside whatever else is at that time.
 * Clicked, it opens. A private one says so, never its words.
 */
function CaptureMark({ one, at, lane, onOpen }: { one: CaptureMeta; at: number; lane: Lane; onOpen?: (type: string, id: string) => void }): React.JSX.Element {
  const kind = CAPTURE_TYPES.find((type) => type.id === one.kind) ?? CAPTURE_TYPES[0]
  const time = hm(dayjs(one.capturedAt).toDate())
  const words = one.private ? 'A private capture' : splitTags(one.label).text || one.label || 'New note'
  const Icon = kind.icon
  return (
    <Tip label={`${time}  ${words.slice(0, 80)}`}>
    <button type="button" data-cal-capture={one.id} aria-label={`Captured at ${time}: ${words}`}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={() => (chime('open'), onOpen?.('capture', one.id))}
      className="absolute z-[2] flex h-5 min-w-0 items-center gap-1 overflow-hidden rounded-[5px] px-1.5 text-left text-meta outline-none transition-[scale,filter] duration-150 ease-(--mf-ease) hover:brightness-[0.97] focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.97] motion-reduce:transition-none"
      style={{ top: (at / 60) * HOUR + 1, ...laneBox(lane), ...captureTint(kind.tint) }}>
      <Icon aria-hidden className="size-3 shrink-0" />
      <span data-cal-capture-name className="min-w-0 truncate font-medium">{words}</span>
    </button>
    </Tip>
  )
}

/** A capture's pill: its kind's colour as a soft fill and its ink, the same recipe as an event's. */
const captureTint = (color: string): React.CSSProperties => ({
  background: `color-mix(in oklab, ${color} var(--cal-fill), var(--background))`,
  color: `color-mix(in oklab, ${color} var(--cal-ink), var(--foreground))`,
  boxShadow: `inset 0 0 0 1px color-mix(in oklab, ${color} var(--cal-edge), transparent)`
})

/** What Day and Week show besides tasks and events: captures, as marks at their minute. */
function DayShowMenu({ on, onChange, children }: { on: boolean; onChange: (on: boolean) => void; /** The panels, when the bar has no room for their buttons. */ children?: React.ReactNode }): React.JSX.Element {
  return (
    <DropdownMenu modal={false}>
      <Tip label="What the days show">
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" data-day-show aria-label="What the days show"><AliveIcon icon={DotsHorizontalIcon} size={16} /></Button>
        </DropdownMenuTrigger>
      </Tip>
      <DropdownMenuContent align="end" className="w-56 text-control">
        <DropdownMenuLabel>Show</DropdownMenuLabel>
        <DropdownMenuCheckboxItem data-day-captures-switch checked={on} onCheckedChange={onChange} onSelect={(event) => event.preventDefault()}>Captures, when caught</DropdownMenuCheckboxItem>
        {children}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/**
 * While a session runs, a faint copy of its task from now to the session's
 * real end: its length, the pauses and each +10 min added, so you can see
 * what running on pushes into. Its edge turns warm once it runs into the
 * next thing on the day, and says what.
 */
function SessionGhost({ focus, tasks, now, next }: { focus: ReturnType<typeof useTaskNow>['focus']; tasks: Task[]; now: Date; next: { start: number; name: string }[] }): React.JSX.Element | null {
  if (!focus || focus.kind === 'break' || !focus.plannedMs) return null
  const paused = focus.pausedMs + (focus.pausedAt ? now.getTime() - new Date(focus.pausedAt).getTime() : 0)
  const end = new Date(new Date(focus.startedAt).getTime() + focus.plannedMs + paused)
  const from = now.getHours() * 60 + now.getMinutes()
  const to = Math.min(24 * 60, dayjs(end).diff(dayjs(now).startOf('day'), 'minute'))
  if (to <= from) return null
  const task = tasks.find((one) => one.id === focus.taskId)
  const name = task ? taskName(task.title).text : focus.goal
  const into = next.filter((one) => one.start > from && one.start < to).sort((a, b) => a.start - b.start)[0]
  const warm = 'var(--tt-color-text-orange)'
  const height = Math.max(18, ((to - from) / 60) * HOUR - 2)
  const tall = height >= 40
  return (
    <div data-cal-session-ghost data-runs-into={into ? into.name : undefined} aria-label={`${name} runs until ${clock(end.toISOString())}${into ? `, into ${into.name}` : ''}`}
      title={into ? `Runs into ${into.name}` : undefined} className="pointer-events-none absolute inset-x-[3px] z-0 flex flex-col overflow-hidden rounded-[6px] px-1.5 pt-px text-meta transition-[top,height] duration-200 ease-(--mf-ease) motion-reduce:transition-none"
      style={{
        top: (from / 60) * HOUR + 1, height,
        // Warm all round once it runs into something: a line on one side only would bend up at the corners.
        background: `color-mix(in oklab, ${into ? warm : ACCENT} 9%, var(--background))`, border: `1.5px dashed color-mix(in oklab, ${into ? warm : ACCENT} ${into ? 80 : 55}%, transparent)`
      }}>
      {/* One line while it is short; what it runs into once there is room for it, and always in its label. */}
      <span className="flex min-w-0 items-baseline gap-1 whitespace-nowrap">
        <span dir="auto" className="min-w-0 truncate font-medium text-foreground/80">{name}</span>
        <span className="shrink-0 tabular-nums text-foreground/75">until <Rolling text={hm(end)} eager /></span>
      </span>
      {into && tall && <span data-cal-ghost-into className="mt-auto mb-0.5 truncate font-medium" style={{ color: `color-mix(in oklab, ${warm} 75%, var(--foreground))` }}>Runs into {into.name}</span>}
    </div>
  )
}

/** A timed task at its hour: dragged to move, its bottom edge dragged to make it longer or shorter. */
function Block({ task, day, at, length, lane, lifted, did, carry, start, onPick, taskNow, landed }: {
  task: Task; day: string; at: number; length: number; lane: Lane; lifted: boolean; did?: number
} & BlockProps): React.JSX.Element {
  const name = taskName(task.title).text
  const short = length < 45
  const color = PRIORITY[task.priority ?? 0] || ACCENT
  const finished = task.status === 'done'
  const repeats = !!task.recurrence
  const busy = !!carry && carry.kind !== 'new' && carry.task.id === task.id
  // Its length beside the focus it took, once there is some or its day has come.
  const done = Math.round(did ?? 0)
  // Carried or stretched, its times roll as they change, earlier rolling down (no sound; still under reduced motion).
  const was = useRef({ at, end: at + length })
  const up = { at: at >= was.current.at, end: at + length >= was.current.end }
  useEffect(() => void (was.current = { at, end: at + length }), [at, length])
  const time = (minute: number, which: 'at' | 'end' = 'at'): React.ReactNode => lifted ? <Rolling text={hm(atMinute(day, minute))} eager up={up[which]} /> : hm(atMinute(day, minute))
  const plan = task.estimate && (done > 0 || day <= dayKey()) ? <PlanDid planned={task.estimate} did={done} className={short ? 'hidden shrink-0 truncate text-meta @[12rem]:inline' : 'hidden truncate text-meta leading-tight @[5rem]:block'} /> : null
  return (
    <RowMenu items={() => taskMenu(task, { open: () => onPick(task.id), now: taskNow })}>
      <div role="button" tabIndex={0} data-cal-block={task.id} data-landed={(landed?.id === task.id && landed.due === task.dueAt) || undefined} data-cal-start={at} data-cal-length={length} aria-label={`${name}, ${clock(atMinute(day, at))}, ${lengthSaid(length)}`}
        onMouseDown={(event) => event.button === 0 && (event.preventDefault(), event.currentTarget.focus({ preventScroll: true }))}
        onPointerDown={(event) => {
          const box = event.currentTarget.getBoundingClientRect()
          const grab = ((event.clientY - box.top) / HOUR) * 60
          start(event, (x, y) => ({ kind: 'move', task, grab, length, x, y, to: null }), () => onPick(task.id))
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') (event.preventDefault(), onPick(task.id))
          if (event.key === 'Backspace' || event.key === 'Delete') (event.preventDefault(), void moveToBin([{ type: 'task', id: task.id, status: task.status }]))
        }}
        className={`group/block @container absolute z-[1] flex cursor-grab touch-none overflow-hidden rounded-[6px] text-left text-control leading-snug outline-none focus-visible:ring-2 focus-visible:ring-ring ${finished ? 'text-foreground/70' : 'text-foreground'} transition-[translate,box-shadow] duration-150 ease-out motion-reduce:transition-none ${lifted || busy ? 'z-30 translate-x-1.5 -translate-y-1 cursor-grabbing shadow-(--mf-shadow-lift)' : 'hover:shadow-sm'}`}
        style={{
          top: (at / 60) * HOUR + 1, height: Math.max(20, (length / 60) * HOUR - 2), ...laneBox(lane),
          background: 'var(--background)', border: `1.5px ${finished ? 'dashed' : 'solid'} color-mix(in oklab, ${color} ${finished ? 45 : 75}%, transparent)`
        }}>
        {/* A task is an outline with its round tick, tinted by priority, that marks it done; an event is a soft filled block (calendar-events.tsx). */}
        <Tip label={finished ? 'Done' : 'Mark it done (E)'}>
          <button type="button" data-cal-tick aria-label={finished ? 'Done' : `Mark ${quoted(name, 80)} done`} disabled={finished}
            onPointerDown={(event) => event.stopPropagation()} onMouseDown={(event) => event.stopPropagation()}
            onClick={(event) => (event.stopPropagation(), void completeTask(task))}
            className={`group/tick mf-hit relative ml-1.5 hidden size-3.5 @[4.5rem]:flex shrink-0 items-center justify-center rounded-full border-[1.5px] outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none ${length < 30 ? 'self-center' : 'mt-[4px]'}`}
            style={{ borderColor: tickOf(task), background: finished ? tickOf(task) : `color-mix(in oklab, ${tickOf(task)} 10%, transparent)` }}>
            <Check aria-hidden strokeWidth={3.5} className={`size-2.5 ${finished ? 'text-background' : 'opacity-0 group-hover/tick:opacity-100'}`} style={finished ? undefined : { color: tickOf(task) }} />
          </button>
        </Tip>
        <span className={`flex min-w-0 flex-1 px-1.5 ${length < 30 ? 'items-center gap-1.5' : short ? 'items-start gap-1.5 pt-[3px]' : 'flex-col gap-px pt-[3px]'}`}>
          <span className={`flex min-w-0 items-center gap-1 ${short ? '' : 'shrink-0'}`}>
            <span dir="auto" data-cal-block-name className={`truncate font-semibold ${finished ? 'line-through' : ''}`}>{name}</span>
            {repeats && <RepeatIcon role="img" aria-label="Repeats" className="size-3 shrink-0 opacity-75" />}
          </span>
          {/* An hour's block has room for two lines under its name: its planned and done say more than the time it sits at. */}
          {!(plan && !short && length < 75) && <span className={`shrink-0 truncate text-meta tabular-nums text-foreground/80 ${short ? 'hidden @[120px]:inline' : 'hidden @[4rem]:block'}`}>{short ? time(at) : <><span className={`@[104px]:hidden ${length >= 60 ? 'block leading-tight' : ''}`}>{length >= 60 ? <>{time(at)} –<br />{time(at + length, 'end')}</> : time(at)}</span><span className="hidden @[104px]:inline">{lifted ? <>{time(at)} – {time(at + length, 'end')}</> : timeSpan(atMinute(day, at), atMinute(day, at + length))}</span></>}</span>}
          {plan}
        </span>
        <span data-cal-resize aria-hidden
          onPointerDown={(event) => start(event, () => ({ kind: 'resize', task, day, start: at, length }))}
          className="absolute inset-x-0 bottom-0 h-2 cursor-ns-resize after:absolute after:bottom-0.5 after:left-1/2 after:h-0.5 after:w-6 after:-translate-x-1/2 after:rounded-full after:bg-foreground/40 after:opacity-0 after:transition-opacity group-hover/block:after:opacity-100 motion-reduce:after:transition-none" />
      </div>
    </RowMenu>
  )
}

/** A task with a day and no time, or a deadline, on the untimed line. */
function Untimed({ task, due, carry, start, onPick, taskNow, landed }: { task: Task; due: boolean } & BlockProps): React.JSX.Element {
  const name = taskName(task.title).text
  const color = due ? RED : ACCENT
  return (
    <RowMenu items={() => taskMenu(task, { open: () => onPick(task.id), now: taskNow })}>
      <Tip label={`${due ? 'Due: ' : ''}${name}`}>
      <button type="button" data-cal-untimed={task.id} data-landed={(!due && landed?.id === task.id && landed.due === task.dueAt) || undefined} data-cal-due={due || undefined}
        onPointerDown={due ? undefined : (event) => start(event, (x, y) => ({ kind: 'move', task, grab: 0, length: task.estimate ?? USUAL, x, y, to: null }), () => onPick(task.id))}
        onClick={due ? () => onPick(task.id) : undefined}
        className={`flex h-6 min-w-0 shrink-0 touch-none items-center gap-1 rounded-[5px] pr-1 pl-1.5 text-left text-control text-foreground transition-colors duration-150 motion-reduce:transition-none ${carry?.kind === 'move' && carry.task.id === task.id ? 'opacity-40' : ''}`}
        style={{ background: `color-mix(in oklab, ${color} 14%, var(--background))` }}>
        <span aria-hidden className="size-1.5 shrink-0 rounded-full" style={{ background: color }} />
        <span dir="auto" className="truncate">{due && <span className="font-semibold">Due: </span>}{name}</span>
      </button>
      </Tip>
    </RowMenu>
  )
}


