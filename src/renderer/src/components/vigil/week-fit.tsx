import { useMemo, useState } from 'react'
import { motion } from 'motion/react'
import { chime } from '@/lib/sound'
import { unloaded, useLive, vigil, type Settings, type Task, type TaskWas } from '@/lib/vigil'
import { calendar, useMacEvents, type MacCalendar, type MacEvent } from '@/lib/mac-calendar'
import { Button } from '@/components/ui/button'
import { Rolling, Tip, toast } from './ui'
import { taskName } from '@/lib/tasks'
import { busyMinutes, lengthSaid, loadOf, loadSaid, onDay, planMoves, taskDay, unsizedSaid, type DayLoad, type Move } from '../../../../main/day-load'
import { dated, dayjs, dayKey } from '../../../../main/dates'

/**
 * Whether a day fits: its meetings (your Mac's calendar) and its tasks'
 * lengths against a working day of about N hours (Settings). Said on each day
 * of the week view, and in Close the week as "Does next week fit?", where an
 * over-full day can move its least pressing tasks on in one click, shown
 * first and undone in one.
 */

const ORANGE = 'var(--tt-color-text-orange)'
const BLUE = 'var(--tt-color-text-blue)'

/** The working day, in minutes: Settings' "A working day is about N hours", 8 until changed. */
export function useWorkRoom(): number {
  const settings = useLive(vigil.settings, null as Settings | null)
  return Math.round((settings?.workHours ?? 8) * 60)
}

/** The events of one day, of a span read at once. */
export const eventsOn = (events: MacEvent[], day: string): MacEvent[] => {
  const from = dayjs(day).startOf('day').valueOf()
  const to = dayjs(day).add(1, 'day').startOf('day').valueOf()
  return events.filter((one) => Date.parse(one.start) < to && Date.parse(one.end) > from).sort((a, b) => Date.parse(a.start) - Date.parse(b.start))
}

/** Said on a day: "4h free", "1h over", or nothing for an empty day. */
const restSaid = (load: DayLoad): string => (load.over ? `${lengthSaid(load.over)} over` : `${lengthSaid(load.free)} free`)

/**
 * One day's load under its date in the week view: "5h meetings · 4h tasks",
 * each part whole so a narrow day wraps rather than cuts it, and "1h over"
 * in amber on its own line when it is. Tasks with no length are said in the
 * tip only: most have none, and seven columns of it would be noise.
 */
export function DayLoadLine({ load }: { load: DayLoad }): React.JSX.Element | null {
  if (!load.meetings && !load.tasks) return null
  const tip = [
    `${loadSaid(load)} against a working day of about ${lengthSaid(load.room)}.`,
    load.over ? `${lengthSaid(load.over)} over your working day (Today counts only what is left of today).` : `${lengthSaid(load.free)} still free.`,
    load.unsized ? `And ${unsizedSaid(load.unsized)}, counted as no time: write ~30m on one to give it a length.` : ''
  ].filter(Boolean).join(' ')
  const parts = [load.meetings ? [lengthSaid(load.meetings), 'meetings'] : null, load.tasks ? [lengthSaid(load.tasks), 'tasks'] : null].filter((one) => one !== null)
  // The length never splits ("9h 30m" stays whole); in a narrow column the
  // word wraps under it rather than being cut.
  return (
    <Tip label={tip}>
      <p data-day-load={load.day} data-over={load.over || undefined} className="mb-1 flex min-w-0 flex-wrap items-baseline gap-x-1.5 px-1 text-xs leading-snug text-foreground/75 tabular-nums">
        {parts.map(([length, word], at) => <span key={at} className="min-w-0"><span className="whitespace-nowrap"><Rolling by="word" text={length} /></span> <Rolling by="word" text={word} />{at < parts.length - 1 && <span aria-hidden className="ml-1.5">·</span>}</span>)}
        {load.over > 0 && <span data-day-over className="min-w-0 basis-full font-semibold" style={{ color: ORANGE }}><span className="whitespace-nowrap"><Rolling by="word" text={lengthSaid(load.over)} /></span> over</span>}
      </p>
    </Tip>
  )
}

/** A day as a bar: meetings, then tasks, against a mark where the working day ends; past it, amber. */
function LoadBar({ load, scale }: { load: DayLoad; scale: number }): React.JSX.Element {
  const part = (minutes: number): string => `${(minutes / scale) * 100}%`
  return (
    <span aria-hidden className="relative block h-1.5 w-full overflow-hidden rounded-full bg-foreground/[0.07]">
      <motion.span className="absolute inset-y-0 left-0 rounded-l-full" style={{ background: BLUE }} initial={false} animate={{ width: part(load.meetings) }} transition={{ type: 'spring', stiffness: 260, damping: 32 }} />
      <motion.span className="absolute inset-y-0 bg-foreground/45" initial={false} animate={{ left: part(load.meetings), width: part(load.tasks) }} transition={{ type: 'spring', stiffness: 260, damping: 32 }} />
      {load.over > 0 && <motion.span className="absolute inset-y-0" style={{ background: ORANGE }} initial={false} animate={{ left: part(load.room), width: part(load.over) }} transition={{ type: 'spring', stiffness: 260, damping: 32 }} />}
      <span className="absolute inset-y-[-2px] w-0.5 rounded-full bg-foreground/60" style={{ left: part(load.room) }} />
    </span>
  )
}

/**
 * When the calendar can't be counted, said plainly, with the way to fix it:
 * off, a click turns it on (macOS asks once); refused, Privacy settings.
 * `off` is said only where counting matters (Close the week).
 */
export function CalendarNote({ said, offToo = false, className = '' }: { said: MacCalendar; offToo?: boolean; className?: string }): React.JSX.Element | null {
  const settings = useLive(vigil.settings, null as Settings | null)
  const [asking, setAsking] = useState(false)
  if (!settings) return null
  const on = !!settings.macCalendar
  const denied = on && said.status === 'denied'
  if (!denied && (on || !offToo)) return null
  const turnOn = (): void => {
    setAsking(true)
    const span: [string, string] = [new Date().toISOString(), new Date(Date.now() + 86400000).toISOString()]
    void vigil.setSettings({ macCalendar: true }).then(() => calendar.ask(...span)).then((got) => {
      setAsking(false)
      chime(got.status === 'on' ? 'on' : 'nope')
      if (got.status !== 'on') toast('macOS has not let Vigil read your calendar', undefined, 'error')
    }, () => setAsking(false))
  }
  return (
    <div data-calendar-note={denied ? 'denied' : 'off'} className={`flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg border px-3 py-2 ${className}`}>
      <p className="min-w-0 flex-1 text-control text-foreground/85">
        <span className="font-semibold text-foreground">{denied ? 'Your calendar is closed to Vigil.' : 'Only tasks are counted.'}</span>{' '}
        {denied ? 'macOS has not let Vigil read it, so only tasks show here.' : 'Use your Mac’s calendar to count meetings too; Vigil only reads it.'}
      </p>
      {denied
        ? <Button size="sm" variant="outline" onClick={() => (chime('open'), void window.api.vigil('calendar:privacy'))}>Open Privacy settings</Button>
        : <Button size="sm" variant="outline" disabled={asking} onClick={turnOn}>{asking ? 'Waiting for macOS…' : 'Use my calendar'}</Button>}
    </div>
  )
}

/** The tasks for each day, open ones only, by the day they are planned (or due by). */
const tasksByDay = (tasks: Task[]): Map<string, Task[]> => {
  const by = new Map<string, Task[]>()
  for (const task of tasks) {
    if (task.status !== 'open') continue
    const day = taskDay(task)
    if (day) by.set(day, [...(by.get(day) ?? []), task])
  }
  return by
}

/** "“Read chapter 4” (1h) to Wednesday": one move, said. */
const moveSaid = (move: Move, task: Task | undefined): string => `“${taskName(task?.title ?? '').text}” (${lengthSaid(move.minutes)}) to ${dayjs(move.to).format('dddd')}`
const list = (parts: string[]): string => (parts.length < 2 ? parts.join('') : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`)

/**
 * Close the week's "Does next week fit?": next week's seven days, each with
 * its meetings and tasks against the working day; an over-full one lit, with
 * the moves that would make it fit shown and one click to make them.
 */
export function WeekFit({ monday }: { monday: string }): React.JSX.Element {
  const room = useWorkRoom()
  const tasks = useLive(vigil.tasks, [] as Task[])
  // Two weeks read, so a task moved off a full Friday can land on the Monday after.
  const from = dayjs(monday).startOf('day')
  const mac = useMacEvents(from.toDate(), from.add(14, 'day').toDate())
  const [moving, setMoving] = useState<string | null>(null)
  const days = useMemo(() => {
    const by = tasksByDay(tasks)
    return Array.from({ length: 14 }, (_, n) => {
      const day = dayKey(from.add(n, 'day'))
      const mine = by.get(day) ?? []
      return { load: loadOf(day, eventsOn(mac.events, day), mine, room), tasks: mine }
    })
  }, [tasks, mac.events, room, monday]) // eslint-disable-line react-hooks/exhaustive-deps
  const week = days.slice(0, 7)
  const scale = Math.max(room, ...week.map(({ load }) => load.meetings + load.tasks))
  const full = week.filter(({ load }) => load.over > 0)
  const byId = new Map(tasks.map((task) => [task.id, task]))
  // Until tasks are read, each day says nothing rather than "Nothing planned".
  const read = !unloaded(tasks)

  const moveOn = async (day: string, moves: Move[]): Promise<void> => {
    if (moving) return
    setMoving(day)
    const was: [string, string, TaskWas | true][] = []
    for (const move of moves) {
      const task = byId.get(move.id)
      if (!task?.dueAt) continue
      was.push([task.id, task.dueAt, await vigil.saveTask(task.id, { due: onDay(task.dueAt, move.to) })])
    }
    setMoving(null)
    chime('shift')
    const n = was.length
    toast(`Moved ${n} ${n === 1 ? 'task' : 'tasks'} on from ${dayjs(day).format('dddd')}`, () => {
      chime('undo')
      void Promise.all(was.map(([id, due, before]) => vigil.saveTask(id, { due, ...(before === true ? {} : before) })))
    })
  }

  return (
    <section data-week-fit>
      <h3 className="text-control font-semibold tracking-[0.01em] text-foreground">Does next week fit?</h3>
      <p className="mt-0.5 text-control text-muted-foreground">
        Each day’s meetings and tasks against a working day of about <span className="font-medium text-foreground">{lengthSaid(room)}</span>, set in Settings.
      </p>
      <CalendarNote said={mac} offToo className="mt-2" />
      <ul className="mt-2 flex flex-col gap-0.5">
        {week.map(({ load }) => {
          const moves = load.over ? planMoves(load.day, days) : []
          const said = loadSaid(load)
          return (
            <li key={load.day} data-fit-day={load.day} data-over={load.over || undefined}
              className="rounded-lg px-2.5 py-2 transition-colors"
              style={{ background: load.over ? `color-mix(in oklab, ${ORANGE} 9%, transparent)` : undefined }}>
              <div className="flex items-baseline gap-3">
                <span className="w-[5.5rem] shrink-0 text-body font-medium text-foreground">{dated(load.day, 'ddd D MMM')}</span>
                <span data-fit-said className="min-w-0 flex-1 truncate text-control text-foreground/85 tabular-nums">{said ? <Rolling by="word" text={said} /> : read && <span className="text-muted-foreground">Nothing planned</span>}</span>
                <span data-fit-rest className={`shrink-0 text-control tabular-nums ${load.over ? 'font-semibold' : 'text-muted-foreground'}`} style={{ color: load.over ? ORANGE : undefined }}>
                  {read && <Rolling by="word" text={restSaid(load)} />}
                </span>
              </div>
              <div className="mt-1.5 pl-[6.25rem]"><LoadBar load={load} scale={scale} /></div>
              {load.unsized > 0 && (
                <p data-fit-unsized className="mt-1 pl-[6.25rem] text-control text-muted-foreground">
                  And {unsizedSaid(load.unsized)}, counted as no time. Write ~30m on one to give it a length.
                </p>
              )}
              {load.over > 0 && (moves.length ? (
                <div className="mt-2 flex items-start gap-3 pl-[6.25rem]">
                  <p data-fit-moves className="min-w-0 flex-1 text-control text-foreground">
                    <span className="font-semibold">Would move </span>{list(moves.map((move) => moveSaid(move, byId.get(move.id))))}.
                  </p>
                  <Button size="sm" variant="outline" data-fit-move={load.day} disabled={!!moving} onClick={() => void moveOn(load.day, moves)}>
                    Move {moves.length} {moves.length === 1 ? 'task' : 'tasks'} on
                  </Button>
                </div>
              ) : (
                <p className="mt-1.5 pl-[6.25rem] text-control text-foreground">
                  {days[days.findIndex((one) => one.load.day === load.day)].tasks.some((task) => task.dueAt && task.estimate)
                    ? 'No later weekday has room for these. Drop or shorten something here.'
                    : 'Its tasks are only due that day, or have no length, so nothing can be moved for you.'}
                </p>
              ))}
            </li>
          )
        })}
      </ul>
      <p data-fit-summary className="mt-2 min-h-lh text-control font-medium" style={{ color: full.length ? ORANGE : 'var(--tt-color-text-green)' }}>
        {!read ? null : full.length ? `${full.length === 1 ? 'One day is' : `${full.length} days are`} over-full.` : 'Every day fits.'}
      </p>
    </section>
  )
}

/** Settings' preview: a sample day of 3h meetings and 4h of tasks, against the working day being set. */
export function WorkdaySample({ hours }: { hours: number }): React.JSX.Element {
  const load = loadOf('2026-10-20', [{ start: dayjs('2026-10-20T09:00').toISOString(), end: dayjs('2026-10-20T12:00').toISOString(), allDay: false }], [{ estimate: 240 }], Math.round(hours * 60))
  return (
    <span data-workday-sample className="flex w-44 flex-col gap-1">
      <span className="flex items-baseline justify-between gap-2 text-xs tabular-nums">
        <span className="text-foreground/75">3h meetings · 4h tasks</span>
        <span className={load.over ? 'font-semibold' : 'text-muted-foreground'} style={{ color: load.over ? ORANGE : undefined }}><Rolling by="word" text={restSaid(load)} /></span>
      </span>
      <LoadBar load={load} scale={Math.max(load.room, 7 * 60, 12 * 60)} />
    </span>
  )
}

/** Minutes of calendar meetings still to come today before the day ends (Settings, Day ends at): Today's budget takes them off the time left. */
export function useMeetingsLeft(dayEnd = '22:00'): number {
  const from = dayjs().startOf('day')
  const mac = useMacEvents(from.toDate(), from.add(1, 'day').toDate())
  const [h, m] = (/^(\d{1,2}):(\d{2})$/.exec(dayEnd) ?? [, '22', '00']).slice(1).map(Number)
  return busyMinutes(mac.events, Date.now(), from.hour(h).minute(m).valueOf())
}
