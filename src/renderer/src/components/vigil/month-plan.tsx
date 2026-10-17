import { useRef, useState } from 'react'
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
import { addForDay, byDay, moveToDay, type Back, type OnDay } from '@/lib/calendar'
import { useLive, vigil, type Settings, type Stats, type Task } from '@/lib/vigil'
import { dayjs, dayKey, type Dayjs } from '../../../../main/dates'

/** How many lines a day shows before "and N more". */
const SHOWN = 2

/** How strong a day's mark is: 1 for one open, 2 for two or three, 3 for four or more. */
const level = (n: number): 1 | 2 | 3 => (n >= 4 ? 3 : n >= 2 ? 2 : 1)
/** The one green, at three strengths: light for a single open, full for a busy day. */
const SHADE = { 1: 'opacity-60', 2: 'opacity-80', 3: 'opacity-100' } as const

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
export function MonthPlan({ tasks, onDay, onTask, onWeek, onMonth }: {
  tasks: Task[]
  onDay: (day: string) => void
  onTask: (id: string) => void
  onWeek?: (monday: string) => void
  onMonth?: (month: string) => void
}): React.JSX.Element {
  const [month, setMonth] = useState(() => dayjs().startOf('month'))
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
  const on = byDay(tasks, back)
  const inMonth = days.filter((day) => day.month() === month.month()).reduce((sum, day) => sum + linesOf(on.get(dayKey(day))).length, 0)
  const step = (by: number): void => (chime('tap'), setMonth((now) => now.add(by, 'month')))
  // A day being written into, and what is being carried.
  const [adding, setAdding] = useState<string | null>(null)
  const [carried, setCarried] = useState<Line | null>(null)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))
  const open = (line: Line): void => (chime('open'), line.kind === 'back' ? window.api.openInHome(line.one.type, line.one.id) : onTask(line.task.id))
  return (
    <section data-month-plan className="flex flex-col gap-2">
      <div className="flex items-center gap-1">
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
        {!month.isSame(dayjs(), 'month') && <Button variant="ghost" size="sm" onClick={() => (chime('tap'), setMonth(dayjs().startOf('month')))}>This month</Button>}
        <Tip label="The month before"><Button variant="ghost" size="icon-sm" aria-label="The month before" data-month-prev onClick={() => step(-1)}><ChevronLeft /></Button></Tip>
        <Tip label="The month after"><Button variant="ghost" size="icon-sm" aria-label="The month after" data-month-next onClick={() => step(1)}><ChevronRight /></Button></Tip>
      </div>
      <DndContext sensors={sensors} collisionDetection={pointerWithin}
        onDragStart={({ active }) => (chime('lift'), setCarried((active.data.current as { line: Line }).line))}
        onDragCancel={() => setCarried(null)}
        onDragEnd={({ active, over }) => {
          setCarried(null)
          const line = (active.data.current as { line: Line }).line
          if (!over || line.kind === 'back' || line.kind === 'ready') return chime('stay')
          moveToDay(line.task, String(over.id), line.kind)
        }}>
      <div className="grid grid-cols-[2rem_repeat(7,minmax(0,1fr))] gap-px overflow-hidden rounded-xl border bg-border">
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
            <Cell key={key} day={day} lines={lines} today={today} outside={day.month() !== month.month()} count={count} flags={marksOn(marks, key)}
              adding={adding === key} onAdding={(on) => setAdding(on ? key : null)} onDay={onDay} onLine={open} />
          ]
        })}
      </div>
      <Overlay dropAnimation={SETTLE}>
        {carried && carried.kind !== 'back' && <span className="block rounded-sm bg-popover px-1.5 py-0.5 text-control text-foreground shadow-(--mf-panel-shadow) ring-1 ring-foreground/10">{taskName(carried.task.title).text}</span>}
      </Overlay>
      </DndContext>
      {!inMonth && <p data-month-empty className="px-1 text-body text-foreground/85">Nothing planned in {month.format('MMMM')}. Give a task a day, like “call the dentist friday”, or click a day to add one.</p>}
    </section>
  )
}

function Cell({ day, lines, today, outside, count, flags, adding, onAdding, onDay, onLine }: {
  day: Dayjs
  lines: Line[]
  today: string
  outside: boolean
  count: number
  flags: ReturnType<typeof marksOn>
  adding: boolean
  onAdding: (on: boolean) => void
  onDay: (day: string) => void
  onLine: (line: Line) => void
}): React.JSX.Element {
  const key = dayKey(day)
  const { setNodeRef, isOver } = useDroppable({ id: key })
  const weekend = day.day() === 0 || day.day() === 6
  const gone = key < today
  const late = gone && lines.some((line) => line.kind === 'planned' || line.kind === 'due')
  return (
    <div ref={setNodeRef} data-day={key} data-planned={lines.length || undefined} data-opened={count ? level(count) : undefined} data-late={late || undefined} data-weekend={weekend || undefined}
      onClick={(event) => event.target === event.currentTarget && !adding && (chime('tap'), onAdding(true))}
      className={`group/day relative flex min-h-[5.25rem] min-w-0 cursor-text flex-col gap-0.5 p-1 transition-colors ${isOver ? 'bg-accent ring-1 ring-foreground/25 ring-inset' : weekend ? 'bg-[color-mix(in_oklab,var(--background)_95%,var(--foreground))]' : 'bg-background'} ${outside ? 'opacity-55' : ''}`}>
      <div className="flex items-center gap-1.5">
        <button type="button" onClick={() => (chime('open'), onDay(key))} aria-label={`Open ${day.format('dddd D MMMM')}${count ? `. Opened Vigil${count > 1 ? ` ${count} times` : ''}` : ''}`}
          aria-current={key === today ? 'date' : undefined}
          className={`flex size-6 shrink-0 items-center justify-center rounded-full text-control tabular-nums transition-colors hover:bg-accent ${key === today ? 'bg-foreground font-semibold text-background hover:bg-foreground/85' : weekend ? 'text-foreground/70' : 'text-foreground'}`}>
          {day.date()}
        </button>
        {count > 0 && <span aria-hidden data-opened-mark className={`h-1.5 w-3 rounded-full bg-[var(--tt-color-text-green,#3c8a5c)] ${SHADE[level(count)]}`} />}
        <span className="min-w-0 flex-1" onClick={() => !adding && (chime('tap'), onAdding(true))} />
        <Tip label={`Add a task for ${day.format('ddd D MMM')}`}>
          <button type="button" data-day-add aria-label={`Add a task for ${day.format('dddd D MMMM')}`} onClick={() => (chime('tap'), onAdding(true))}
            className="flex size-5 shrink-0 items-center justify-center rounded-sm text-foreground opacity-0 transition-opacity group-hover/day:opacity-100 hover:bg-accent focus-visible:opacity-100">
            <Plus className="size-3.5" />
          </button>
        </Tip>
      </div>
      {flags.length > 0 && <DayFlags marks={flags} named className="max-w-full px-1" />}
      {lines.slice(0, SHOWN).map((line) => <LineChip key={lineKey(line)} line={line} late={gone} onOpen={onLine} />)}
      {lines.length > SHOWN && <More day={day} lines={lines} gone={gone} onDay={onDay} onLine={onLine} />}
      {adding && <AddLine day={key} onDone={() => onAdding(false)} />}
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
    <button ref={setNodeRef} type="button" data-plan-task data-plan-kind={line.kind} {...(movable ? attributes : {})} {...(movable ? listeners : {})}
      onClick={() => onOpen(line)} title={`${said}${title}`}
      {...loud(tone, `flex min-w-0 items-center gap-1 rounded-sm px-1 text-left text-control leading-snug transition-colors hover:bg-accent ${tone ? '' : line.kind === 'planned' ? 'text-foreground' : 'text-foreground/85'} ${isDragging ? 'opacity-40' : ''} ${movable ? 'touch-none' : ''}`)}>
      {Icon ? <Icon className="size-3 shrink-0" /> : <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-current opacity-70" />}
      <span className="truncate">{said && line.kind !== 'planned' ? <span className="font-medium">{said}</span> : said}{title}</span>
    </button>
  )
}

/** "and N more": click for the day's page; rest the pointer on it to see everything the day holds. */
function More({ day, lines, gone, onDay, onLine }: { day: Dayjs; lines: Line[]; gone: boolean; onDay: (day: string) => void; onLine: (line: Line) => void }): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const timer = useRef<number | undefined>(undefined)
  const later = (to: boolean, ms: number): void => (window.clearTimeout(timer.current), void (timer.current = window.setTimeout(() => setOpen(to), ms)))
  const hover = { onPointerEnter: () => later(true, 250), onPointerLeave: () => later(false, 180) }
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <button type="button" data-plan-more {...hover} onClick={() => (chime('open'), onDay(dayKey(day)))} className="rounded-sm px-1 text-left text-control text-foreground/85 hover:bg-accent">
          and {lines.length - SHOWN} more
        </button>
      </PopoverAnchor>
      <PopoverContent data-plan-popover side="right" align="start" className="w-64 gap-1" {...hover} onOpenAutoFocus={(event) => event.preventDefault()}>
        <button type="button" onClick={() => (chime('open'), setOpen(false), onDay(dayKey(day)))} className="rounded-sm px-1 py-0.5 text-left text-body font-semibold text-foreground hover:bg-accent">{day.format('dddd D MMMM')}</button>
        {lines.map((line) => <LineChip key={lineKey(line)} line={line} late={gone} drag={false} onOpen={(one) => (setOpen(false), onLine(one))} />)}
      </PopoverContent>
    </Popover>
  )
}

/** Writing a new task into a day: Enter adds it for that day, Esc or leaving it empty puts it away. */
export function AddLine({ day, onDone }: { day: string; onDone: () => void }): React.JSX.Element {
  const [text, setText] = useState('')
  const done = useRef(false)
  const finish = (keep: boolean): void => {
    if (done.current) return
    done.current = true
    if (keep && text.trim()) void addForDay(text, day)
    onDone()
  }
  return (
    <input data-day-input autoFocus value={text} placeholder="New task" aria-label={`A new task for ${dayjs(day).format('dddd D MMMM')}`}
      onChange={(event) => setText(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === 'Enter') (event.preventDefault(), finish(true))
        else if (event.key === 'Escape') (event.preventDefault(), event.stopPropagation(), finish(false))
      }}
      onBlur={() => finish(true)}
      className="w-full min-w-0 rounded-sm bg-accent/60 px-1 text-control text-foreground outline-none placeholder:text-foreground/60" />
  )
}
