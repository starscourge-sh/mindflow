import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { PanelLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ChevronLeft, ChevronRight } from '@/components/ui/icons'
import { chime } from '@/lib/sound'
import { taskName } from '@/lib/tasks'
import { moveToBin } from '@/lib/to-bin'
import { useHere } from '@/lib/split'
import { clock, useMinute } from '@/lib/clock'
import { placeTask } from '@/lib/calendar'
import { useLive, vigil, whenInLine, type Task } from '@/lib/vigil'
import { lengthSaid } from '../../../../main/day-load'
import { dayjs, dayKey, type Dayjs } from '../../../../main/dates'
import { Chips } from './display'
import { Tip, typing } from './ui'
import { RowMenu } from './row-menu'
import { MonthPlan } from './month-plan'
import { taskMenu, useTaskNow } from './tasks-view'
import { DaySide, type SideAsk } from './day-side'

type Mode = 'day' | 'week' | 'month'
/** One hour's height on the grid, and the steps a time snaps to. */
const HOUR = 48
const SNAP = 15
/** A timed task with no length of its own is drawn half an hour long. */
const USUAL = 30
const RED = 'var(--tt-color-text-red)'
const ACCENT = 'var(--tt-brand-color-400)'
const MUTED_DAY = 'bg-[color-mix(in_oklab,var(--background)_95%,var(--foreground))]'

const stored = <T extends string>(key: string, fallback: T, allowed: readonly T[]): T => {
  try {
    const got = localStorage.getItem(key) as T | null
    return got && allowed.includes(got) ? got : fallback
  } catch { return fallback }
}
const store = (key: string, value: string): void => { try { localStorage.setItem(key, value) } catch { /* Not kept: fine. */ } }
const weekend = (day: Dayjs): boolean => day.day() === 0 || day.day() === 6
const snap = (minute: number, by = SNAP): number => Math.max(0, Math.min(24 * 60 - by, Math.round(minute / by) * by))
const minuteOf = (iso: string): number => { const at = dayjs(iso); return at.hour() * 60 + at.minute() }
const timed = (task: Task): boolean => task.status === 'open' && !!task.dueAt && !task.allDay
const atMinute = (day: string, minute: number): string => dayjs(day).startOf('day').add(minute, 'minute').toISOString()

/** Where the pointer is over the calendar: a time in a day, a day's untimed line, or a month's day. */
type Spot = { day: string; minute: number | null }
const spotAt = (x: number, y: number): Spot | null => {
  const el = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-cal-col], [data-cal-allday], [data-month-plan] [data-day]')
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
type Draft = { day: string; minute: number | null; length: number }

/**
 * The Calendar, the way Notion Calendar and Google Calendar have it: a day,
 * a week or a month, the timed tasks as blocks at their hour that move and
 * stretch by dragging, a slot clicked or dragged across to write a task
 * there, and beside it a small month and the tasks with no date yet, to drag
 * onto the grid. D, W and M change the view, T comes back to today, ← and →
 * step. Every move and stretch has an Undo, and ⌘Z.
 */
export function CalendarView({ focus, onOpen }: { focus?: string; onOpen?: (type: string, id: string) => void }): React.JSX.Element {
  const tasks = useLive(vigil.tasks, [] as Task[])
  const taskNow = useTaskNow()
  const [mode, setModeRaw] = useState<Mode>(() => stored('vigil.calendar.mode', 'week', ['day', 'week', 'month'] as const))
  const [side, setSideRaw] = useState(() => stored('vigil.calendar.side', 'on', ['on', 'off'] as const) === 'on')
  const [anchor, setAnchor] = useState(() => (focus && dayjs(focus).isValid() ? dayjs(focus) : dayjs()).startOf('day'))
  const setMode = (to: Mode): void => (to !== mode && chime('tap'), store('vigil.calendar.mode', to), setModeRaw(to))
  const setSide = (on: boolean): void => (chime(on ? 'on' : 'off'), store('vigil.calendar.side', on ? 'on' : 'off'), setSideRaw(on))
  // The side panel: a new task for a slot or a day, or a task opened from the grid.
  const [panel, setPanel] = useState<SideAsk | null>(null)
  const pick = (id: string): void => (chime('open'), setPanel({ task: id }))
  const days = mode === 'day' ? [anchor] : Array.from({ length: 7 }, (_, at) => anchor.startOf('week').add(at, 'day'))
  const step = (by: -1 | 1): void => (chime('page'), setAnchor((now) => now.add(by, mode)))
  const today = (): void => (chime('tap'), setAnchor(dayjs().startOf('day')))
  const first = days[0]
  const last = days[days.length - 1]
  const title = mode !== 'week' || first.month() === last.month() ? anchor.format('MMMM YYYY')
    : first.year() === last.year() ? `${first.format('MMM')} – ${last.format('MMM YYYY')}` : `${first.format('MMM YYYY')} – ${last.format('MMM YYYY')}`
  const onToday = mode === 'month' ? anchor.isSame(dayjs(), 'month') : days.some((day) => day.isSame(dayjs(), 'day'))

  // D, W and M for the view, T for today, ← and → to step: only with the page in front and nothing being typed.
  const here = useHere()
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (!here() || typing() || event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return
      const key = event.key
      const take = (run: () => void): void => (event.preventDefault(), run())
      if (key === 'd' || key === 'w' || key === 'm') return take(() => setMode(({ d: 'day', w: 'week', m: 'month' } as const)[key]))
      if (key === 't') return take(today)
      if (key === 'ArrowLeft' || key === 'ArrowRight') return take(() => step(key === 'ArrowLeft' ? -1 : 1))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  // What the pointer carries, followed on the window so it keeps up off the grid too.
  const [carry, setCarry] = useState<Carry | null>(null)
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
        return placeTask(task, { due, allDay: 1, estimate: task.estimate }, `Moved to ${whenInLine(due, true)}`)
      }
      const due = atMinute(to.day, to.minute)
      return placeTask(task, { due, allDay: 0, estimate: task.estimate ?? (task.dueAt && !task.allDay ? null : USUAL) }, `Moved to ${whenInLine(due)}`)
    }
    if (now.kind === 'resize')
      return placeTask(now.task, { due: atMinute(now.day, now.start), allDay: 0, estimate: now.length }, `Takes ${lengthSaid(now.length)} now`)
    const [a, b] = [Math.min(now.from, now.to), Math.max(now.from, now.to)]
    chime('tap')
    setDraft({ day: now.day, minute: a, length: Math.max(SNAP, b - a) })
  }

  const unscheduled = tasks.filter((task) => task.status === 'open' && !task.dueAt && !task.deadline)
  const blockProps = { carry, start, onPick: pick, taskNow, draft, setDraft }
  return (
    <section data-cal-mode={mode} className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <header className="flex h-12 shrink-0 items-center gap-1 px-4">
        <Tip label={side ? 'Hide the side panel' : 'Show the side panel'}>
          <Button variant="ghost" size="icon-sm" data-cal-side-toggle aria-label={side ? 'Hide the side panel' : 'Show the side panel'} aria-pressed={side} onClick={() => setSide(!side)}><PanelLeft /></Button>
        </Tip>
        <h1 data-cal-title className="mx-1 min-w-0 truncate font-heading text-heading font-semibold tracking-[-0.01em] text-foreground">{title}</h1>
        <Tip label="Today (T)"><Button variant="outline" size="sm" data-cal-today disabled={onToday} onClick={today}>Today</Button></Tip>
        <Tip label={`The ${mode} before (←)`}><Button variant="ghost" size="icon-sm" data-cal-prev aria-label={`The ${mode} before`} onClick={() => step(-1)}><ChevronLeft /></Button></Tip>
        <Tip label={`The ${mode} after (→)`}><Button variant="ghost" size="icon-sm" data-cal-next aria-label={`The ${mode} after`} onClick={() => step(1)}><ChevronRight /></Button></Tip>
        <span className="flex-1" />
        <Chips className="shrink-0 flex-nowrap" options={[{ id: 'day', label: 'Day', tip: 'Day (D)' }, { id: 'week', label: 'Week', tip: 'Week (W)' }, { id: 'month', label: 'Month', tip: 'Month (M)' }]}
          on={(id) => id === mode} pick={(id) => setMode(id as Mode)} />
      </header>
      <div className="flex min-h-0 flex-1 border-t">
        {side && (
          <aside data-cal-side className="flex w-60 shrink-0 flex-col gap-4 overflow-y-auto border-r px-3 py-3">
            <MiniMonth anchor={anchor} days={mode === 'month' ? [] : days} onPick={(day) => (chime('tap'), setAnchor(day))} />
            <div className="flex min-h-0 flex-col gap-1">
              <h2 className="px-1 text-body font-semibold text-foreground">Unscheduled <span className="font-normal tabular-nums text-foreground/80">{unscheduled.length || ''}</span></h2>
              {!unscheduled.length && <p className="px-1 text-body text-foreground/85">Every open task has a day.</p>}
              <ul data-cal-unscheduled className="flex flex-col">
                {unscheduled.map((task) => (
                  <li key={task.id}>
                    <RowMenu items={taskMenu(task, { open: () => pick(task.id), now: taskNow })}>
                      <button type="button" data-cal-loose={task.id} title={taskName(task.title).text}
                        onPointerDown={(event) => start(event, (x, y) => ({ kind: 'move', task, grab: 0, length: task.estimate ?? USUAL, x, y, to: null }), () => pick(task.id))}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') (event.preventDefault(), pick(task.id))
                          if (event.key === 'Backspace' || event.key === 'Delete') (event.preventDefault(), void moveToBin([{ type: 'task', id: task.id, status: task.status }]))
                        }}
                        className={`flex w-full touch-none items-center gap-2 rounded-md px-1.5 py-1 text-left text-body text-foreground transition-colors duration-150 hover:bg-accent motion-reduce:transition-none ${carry?.kind === 'move' && carry.task.id === task.id ? 'opacity-40' : ''}`}>
                        <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ background: task.priority === 1 ? 'var(--tt-color-text-orange)' : ACCENT }} />
                        <span className="min-w-0 flex-1 truncate">{taskName(task.title).text}</span>
                      </button>
                    </RowMenu>
                  </li>
                ))}
              </ul>
            </div>
          </aside>
        )}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          {mode === 'month' ? (
            <div className="flex min-h-0 flex-1 flex-col p-3">
              <MonthPlan bare month={anchor} tasks={tasks} onSide={setPanel} onOpen={onOpen}
                onDay={(day) => (setAnchor(dayjs(day)), setMode('day'))} onWeek={(monday) => (setAnchor(dayjs(monday)), setMode('week'))} />
            </div>
          ) : (
            <Grid days={days} tasks={tasks} onHead={(day) => (setAnchor(day), setMode('day'))} {...blockProps} />
          )}
        </div>
      </div>
      {carry?.kind === 'move' && (!carry.to || carry.to.minute === null) && createPortal(
        <div data-cal-carried style={{ left: carry.x + 8, top: carry.y + 8 }}
          className="pointer-events-none fixed z-50 flex max-w-56 items-center gap-2 rounded-md border bg-background px-2 py-1 text-control text-foreground shadow-(--mf-shadow-lift)">
          <span aria-hidden className="h-4 w-[3px] shrink-0 rounded-full" style={{ background: ACCENT }} />
          <span className="truncate">{taskName(carry.task.title).text}</span>
        </div>, document.body)}
      <DaySide ask={panel} onClose={() => setPanel(null)} onOpen={onOpen} />
    </section>
  )
}

type BlockProps = {
  carry: Carry | null
  start: (event: React.PointerEvent, begin: (x: number, y: number) => Carry | null, click?: () => void) => void
  onPick: (id: string) => void
  taskNow: ReturnType<typeof useTaskNow>
  draft: Draft | null
  setDraft: (draft: Draft | null) => void
}

/** A small month beside the grid: the days shown are marked, and a day clicked goes there. */
function MiniMonth({ anchor, days, onPick }: { anchor: Dayjs; days: Dayjs[]; onPick: (day: Dayjs) => void }): React.JSX.Element {
  const [month, setMonth] = useState(anchor.startOf('month'))
  useEffect(() => setMonth(anchor.startOf('month')), [anchor])
  const first = month.startOf('week')
  const cells = Array.from({ length: 42 }, (_, at) => first.add(at, 'day'))
  const shown = new Set(days.map(dayKey))
  const now = dayKey()
  return (
    <div data-cal-mini className="flex flex-col gap-1">
      <div className="flex items-center gap-1 px-1">
        <span className="flex-1 text-body font-semibold text-foreground">{month.format('MMMM YYYY')}</span>
        <Button variant="ghost" size="icon-sm" aria-label="The month before" onClick={() => (chime('tap'), setMonth(month.subtract(1, 'month')))}><ChevronLeft /></Button>
        <Button variant="ghost" size="icon-sm" aria-label="The month after" onClick={() => (chime('tap'), setMonth(month.add(1, 'month')))}><ChevronRight /></Button>
      </div>
      <div className="grid grid-cols-7 text-center">
        {cells.slice(0, 7).map((day) => <span key={day.day()} className="py-0.5 text-control font-medium text-foreground/75">{day.format('dd').charAt(0)}</span>)}
        {cells.map((day) => {
          const key = dayKey(day)
          return (
            <button key={key} type="button" data-cal-mini-day={key} aria-label={day.format('dddd D MMMM')} aria-current={key === now ? 'date' : undefined} onClick={() => onPick(day)}
              className={`mx-auto flex size-7 items-center justify-center rounded-full text-control tabular-nums transition-colors duration-150 motion-reduce:transition-none ${key === now ? 'bg-[var(--tt-color-text-red)] font-semibold text-white' : shown.has(key) ? 'bg-accent font-medium text-foreground' : day.month() !== month.month() ? 'text-foreground/50 hover:bg-accent' : 'text-foreground hover:bg-accent'}`}>
              {day.date()}
            </button>
          )
        })}
      </div>
    </div>
  )
}

/** Timed tasks side by side where they overlap: each its lane and how many lanes its cluster has. */
function lanes(list: { id: string; start: number; end: number }[]): Map<string, { lane: number; of: number }> {
  const out = new Map<string, { lane: number; of: number }>()
  const sorted = [...list].sort((a, b) => a.start - b.start || b.end - a.end)
  let cluster: { id: string; lane: number }[] = []
  let ends: number[] = []
  let reach = -1
  const close = (): void => { for (const one of cluster) out.set(one.id, { lane: one.lane, of: ends.length }) }
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

/** The day or the week by the hour: an untimed line on top, then the hours with the tasks at theirs. */
function Grid({ days, tasks, onHead, ...props }: { days: Dayjs[]; tasks: Task[]; onHead: (day: Dayjs) => void } & BlockProps): React.JSX.Element {
  const { carry, start, draft, setDraft } = props
  const now = useMinute()
  const scroller = useRef<HTMLDivElement>(null)
  // Opened near the working day: an hour before now, or at eight.
  useLayoutEffect(() => {
    const el = scroller.current
    if (el) el.scrollTop = Math.max(0, (dayjs().isSame(days[0], 'week') ? new Date().getHours() - 1 : 8) * HOUR - 8)
  }, [])
  const keys = days.map(dayKey)
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
  const cols = `3.5rem repeat(${days.length}, minmax(0, 1fr))`
  const todayKey = dayKey(now)
  return (
    <div data-cal-grid className="flex min-h-0 flex-1 flex-col">
      {/* The day names and the untimed line stay put while the hours scroll. */}
      <div className="grid shrink-0 border-b" style={{ gridTemplateColumns: cols }}>
        <span />
        {days.map((day) => {
          const key = dayKey(day)
          return (
            <button key={key} type="button" data-cal-head={key} onClick={() => (chime('open'), onHead(day))} aria-label={`Open ${day.format('dddd D MMMM')}`}
              className={`flex items-center justify-center gap-1.5 border-l border-border/60 py-1.5 text-body transition-colors duration-150 hover:bg-accent motion-reduce:transition-none ${weekend(day) ? `${MUTED_DAY} text-foreground/75` : 'text-foreground'}`}>
              <span className="font-medium">{day.format('ddd')}</span>
              <span className={`flex size-7 items-center justify-center rounded-full tabular-nums ${key === todayKey ? 'bg-[var(--tt-color-text-red)] font-semibold text-white' : 'font-semibold'}`}>{day.date()}</span>
            </button>
          )
        })}
        <span className="self-center pr-2 text-right text-control font-medium text-foreground/75">All day</span>
        {keys.map((key, at) => {
          const lane = untimed.get(key) ?? []
          const over = carry?.kind === 'move' && carry.to?.minute === null && carry.to.day === key
          return (
            <div key={key} data-cal-allday={key}
              onClick={(event) => event.target === event.currentTarget && (chime('tap'), setDraft({ day: key, minute: null, length: 0 }))}
              className={`flex max-h-28 min-h-8 cursor-text flex-col gap-0.5 overflow-y-auto border-l border-border/60 p-0.5 ${over ? 'bg-accent' : weekend(days[at]) ? MUTED_DAY : ''}`}>
              {lane.map(({ task, due }) => <Untimed key={`${due ? 'due' : 'on'}:${task.id}`} task={task} due={due} {...props} />)}
              {draft && draft.minute === null && draft.day === key && <span data-cal-new className="rounded-sm bg-accent px-1 text-control text-foreground ring-1 ring-foreground/20">New task</span>}
            </div>
          )
        })}
      </div>
      <div ref={scroller} data-cal-scroll className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto">
        <div className="relative grid" style={{ gridTemplateColumns: cols, height: HOUR * 24 }}>
          <div className="relative">
            {hours.slice(1).map((hour) => (
              <span key={hour} className="absolute right-2 -translate-y-1/2 text-control text-foreground/75 tabular-nums" style={{ top: hour * HOUR }}>
                {clock(dayjs().hour(hour).minute(0).toISOString())}
              </span>
            ))}
          </div>
          {days.map((day) => {
            const key = dayKey(day)
            const mine = tasks.filter((task) => timed(task) && dayKey(task.dueAt!) === key && !(carry && carry.kind !== 'new' && carry.task.id === task.id))
            const spans = mine.map((task) => ({ id: task.id, task, start: minuteOf(task.dueAt!), end: minuteOf(task.dueAt!) + Math.max(SNAP, task.estimate ?? USUAL) }))
            // The one being carried or stretched, drawn where it would land.
            const moving = carry?.kind === 'move' && carry.to?.minute != null && carry.to.day === key ? { task: carry.task, start: carry.to.minute, length: carry.length }
              : carry?.kind === 'resize' && carry.day === key ? { task: carry.task, start: carry.start, length: carry.length } : null
            if (moving) spans.push({ id: moving.task.id, task: moving.task, start: moving.start, end: moving.start + moving.length })
            const placed = lanes(spans)
            const drawing = carry?.kind === 'new' && carry.day === key ? { start: Math.min(carry.from, carry.to), length: Math.max(SNAP, Math.abs(carry.to - carry.from)) } : null
            return (
              <div key={key} data-cal-col={key} data-weekend={weekend(day) || undefined}
                onPointerDown={(event) => {
                  if (event.target !== event.currentTarget) return
                  const from = snap(((event.clientY - event.currentTarget.getBoundingClientRect().top) / HOUR) * 60, SNAP)
                  start(event, () => ({ kind: 'new', day: key, from, to: from + SNAP }),
                    () => (chime('tap'), setDraft({ day: key, minute: Math.floor(from / 30) * 30, length: USUAL })))
                }}
                className={`relative cursor-cell touch-none border-l border-border/60 ${weekend(day) ? MUTED_DAY : ''}`}
                style={{ backgroundImage: `repeating-linear-gradient(to bottom, color-mix(in oklab, var(--border) 70%, transparent) 0 1px, transparent 1px ${HOUR}px)` }}>
                {spans.map((span) => (
                  <Block key={span.id} task={span.task} day={key} at={span.start} length={span.end - span.start} lane={placed.get(span.id)!}
                    lifted={moving?.task.id === span.id} {...props} />
                ))}
                {drawing && <div data-cal-drawing className="pointer-events-none absolute inset-x-1 rounded-md border-2 border-[var(--tt-brand-color-400)] bg-[color-mix(in_oklab,var(--tt-brand-color-400)_18%,transparent)]" style={{ top: (drawing.start / 60) * HOUR, height: (drawing.length / 60) * HOUR }} />}
                {draft && draft.minute !== null && draft.day === key && (
                  <div className="absolute inset-x-1 z-20 flex flex-col rounded-md border-2 border-[var(--tt-brand-color-400)] bg-background p-1 shadow-(--mf-panel-shadow)" style={{ top: (draft.minute / 60) * HOUR, minHeight: Math.max(28, (draft.length / 60) * HOUR) }}>
                    <span className="px-1 text-control font-medium text-foreground tabular-nums">{clock(atMinute(key, draft.minute))} – {clock(atMinute(key, draft.minute + draft.length))}</span>
                    <span className="px-1 text-control text-foreground">New task</span>
                  </div>
                )}
                {key === todayKey && (
                  <div data-cal-now aria-label={`Now, ${clock(now.toISOString())}`} className="pointer-events-none absolute inset-x-0 z-10" style={{ top: ((now.getHours() * 60 + now.getMinutes()) / 60) * HOUR }}>
                    <span className="absolute -top-[5px] -left-[5px] size-2.5 rounded-full" style={{ background: RED }} />
                    <span className="absolute inset-x-0 -top-px h-0.5" style={{ background: RED }} />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

/** A timed task at its hour: dragged to move, its bottom edge dragged to make it longer or shorter. */
function Block({ task, day, at, length, lane, lifted, carry, start, onPick, taskNow }: {
  task: Task; day: string; at: number; length: number; lane: { lane: number; of: number }; lifted: boolean
} & BlockProps): React.JSX.Element {
  const name = taskName(task.title).text
  const short = length < 45
  const urgent = task.priority === 1
  const color = urgent ? 'var(--tt-color-text-orange)' : ACCENT
  const width = 100 / lane.of
  const busy = !!carry && carry.kind !== 'new' && carry.task.id === task.id
  return (
    <RowMenu items={taskMenu(task, { open: () => onPick(task.id), now: taskNow })}>
      <div role="button" tabIndex={0} data-cal-block={task.id} data-cal-start={at} data-cal-length={length} aria-label={`${name}, ${clock(atMinute(day, at))}, ${lengthSaid(length)}`}
        onPointerDown={(event) => {
          const box = event.currentTarget.getBoundingClientRect()
          const grab = ((event.clientY - box.top) / HOUR) * 60
          start(event, (x, y) => ({ kind: 'move', task, grab, length, x, y, to: null }), () => onPick(task.id))
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') (event.preventDefault(), onPick(task.id))
          if (event.key === 'Backspace' || event.key === 'Delete') (event.preventDefault(), void moveToBin([{ type: 'task', id: task.id, status: task.status }]))
        }}
        className={`group/block @container absolute z-[1] flex cursor-grab touch-none overflow-hidden rounded-md border text-left text-control leading-tight text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring ${lifted || busy ? 'z-30 cursor-grabbing shadow-(--mf-shadow-lift)' : 'transition-shadow duration-150 hover:shadow-(--mf-panel-shadow) motion-reduce:transition-none'}`}
        style={{
          top: (at / 60) * HOUR + 1, height: Math.max(18, (length / 60) * HOUR - 2),
          left: `calc(${lane.lane * width}% + 2px)`, width: `calc(${width}% - 4px)`,
          background: `color-mix(in oklab, ${color} 16%, var(--background))`, borderColor: `color-mix(in oklab, ${color} 45%, transparent)`
        }}>
        <span aria-hidden className="w-[3px] shrink-0" style={{ background: color }} />
        <span className={`flex min-w-0 flex-1 px-1.5 py-0.5 ${short ? 'items-center gap-1.5' : 'flex-col'}`}>
          <span className="truncate font-medium">{name}</span>
          <span className={`shrink-0 tabular-nums text-foreground/80 ${short ? 'hidden @[10rem]:inline' : ''}`}>{clock(atMinute(day, at))}{short ? '' : ` – ${clock(atMinute(day, at + length))}`}</span>
        </span>
        <span data-cal-resize aria-hidden
          onPointerDown={(event) => start(event, () => ({ kind: 'resize', task, day, start: at, length }))}
          className="absolute inset-x-0 bottom-0 h-2 cursor-ns-resize after:absolute after:bottom-0.5 after:left-1/2 after:h-0.5 after:w-6 after:-translate-x-1/2 after:rounded-full after:bg-foreground/40 after:opacity-0 after:transition-opacity group-hover/block:after:opacity-100 motion-reduce:after:transition-none" />
      </div>
    </RowMenu>
  )
}

/** A task with a day and no time, or a deadline, on the untimed line. */
function Untimed({ task, due, carry, start, onPick, taskNow }: { task: Task; due: boolean } & BlockProps): React.JSX.Element {
  const name = taskName(task.title).text
  const color = due ? RED : ACCENT
  return (
    <RowMenu items={taskMenu(task, { open: () => onPick(task.id), now: taskNow })}>
      <button type="button" data-cal-untimed={task.id} data-cal-due={due || undefined} title={`${due ? 'Due: ' : ''}${name}`}
        onPointerDown={due ? undefined : (event) => start(event, (x, y) => ({ kind: 'move', task, grab: 0, length: task.estimate ?? USUAL, x, y, to: null }), () => onPick(task.id))}
        onClick={due ? () => onPick(task.id) : undefined}
        className={`flex h-6 min-w-0 shrink-0 touch-none items-center gap-1.5 rounded-sm px-1.5 text-left text-control text-foreground transition-colors duration-150 motion-reduce:transition-none ${carry?.kind === 'move' && carry.task.id === task.id ? 'opacity-40' : ''}`}
        style={{ background: `color-mix(in oklab, ${color} 14%, var(--background))` }}>
        <span aria-hidden className="size-1.5 shrink-0 rounded-full" style={{ background: color }} />
        <span className="truncate">{due && <span className="font-semibold">Due: </span>}{name}</span>
      </button>
    </RowMenu>
  )
}

