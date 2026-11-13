import { cloneElement, useEffect, useMemo, useState, type ReactNode } from 'react'

import { Hourglass } from 'lucide-react'
import { chime } from '@/lib/sound'
import { haligtree, unloaded, useLive, type Spent, type Task } from '@/lib/haligtree'
import { useReading } from '@/lib/reads-in'
import { hoursSaid } from '@/lib/day-plan'
import { num } from '../../../../main/dates'
import { Tip } from './ui'

/**
 * A task's time, on its row wherever a list shows it: the dot on the task a
 * focus session is running on, and the time spent on it so far. One read for
 * the whole list (`useTaskTime`), never one a row; the running session's
 * minutes are added here, in the window, so nothing is read again as it runs.
 */

type Running = NonNullable<Spent['running']>
const NONE: Spent = { spent: {}, running: null }
const MINUTE = 60_000

/** Time worked in a running session so far: pauses do not count (session-span.tsx). */
const workedMs = (one: Running, now = Date.now()): number =>
  Math.max(0, now - Date.parse(one.startedAt) - one.pausedMs - (one.pausedAt ? now - Date.parse(one.pausedAt) : 0))

/** What a list knows of the time on its tasks. */
export type TaskTime = {
  /** Not read yet: a page waits for it with its other reads, so no row grows a line after it shows. */
  reading: boolean
  /** The session running on a task now. */
  running: Running | null
  /**
   * The minutes spent on a task and in how many sessions: what its page says under “Focus so far”, with the
   * session running on it counted as if it ended now, so the number is the same before and after it ends. While
   * one runs, nothing before the task's first whole minute.
   */
  of: (id: string) => { minutes: number; sessions: number } | null
}

/** Read once by a list, and drawn again as the running session's minute turns: by the minute, never the second (the pill counts those). */
export function useTaskTime(): TaskTime {
  // Sessions change with no note's words: a note being typed in reads nothing here.
  const read = useLive(haligtree.spent, NONE, [], ['item'])
  const reading = unloaded(read)
  useReading(reading)
  const { spent, running } = read
  // The time already on the task the session runs on, in its sessions that have ended.
  const before = running ? (spent[running.taskId]?.[0] ?? 0) : 0
  const [turned, turn] = useState(0)
  useEffect(() => {
    if (!running || running.pausedAt) return
    let timer: ReturnType<typeof setTimeout>
    // A clock, not a poll: asleep until the minutes said next change. They are the task's whole time rounded, as
    // its page rounds it, so they turn at each half minute of that time, and first at its first whole minute.
    const wait = (): void => {
      const total = before + workedMs(running)
      const next = total < MINUTE ? MINUTE : (Math.floor(total / MINUTE + 0.5) + 0.5) * MINUTE
      timer = setTimeout(() => (turn((n) => n + 1), wait()), next - total + 20)
    }
    // A window out of sight sleeps through its minutes: shown again, it says the time as it is.
    const shown = (): void => void (document.hidden || (clearTimeout(timer), turn((n) => n + 1), wait()))
    wait()
    document.addEventListener('visibilitychange', shown)
    return () => (clearTimeout(timer), document.removeEventListener('visibilitychange', shown))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running?.id, running?.startedAt, running?.pausedMs, running?.pausedAt, before])
  // The same thing until a read changes it or the minute turns: a list whose rows are drawn again only when what
  // they are given changes (quick capture's Today) is not drawn again for nothing.
  return useMemo((): TaskTime => ({
    reading,
    running,
    of: (id) => {
      const [ms, sessions] = spent[id] ?? [0, 0]
      const on = running?.taskId === id ? running : null
      const total = ms + (on ? workedMs(on) : 0)
      const minutes = Math.round(total / MINUTE)
      return minutes >= 1 && (!on || total >= MINUTE) ? { minutes, sessions: sessions + (on ? 1 : 0) } : null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [read, reading, turned])
}

/**
 * Where the dot stands. A row with a margin beside it (Tasks, Home, a day's page): in that margin, level with its
 * tick. A row with none (a row in an island, quick capture, the sticky): before its name, in the room the row's own
 * left padding already gives its marks. Each list adds how far down and how tall or how wide; nothing in a row moves.
 */
export const DOT_IN_MARGIN = 'absolute right-full mr-1 flex w-3 items-center justify-end'
export const DOT_IN_ROOM = 'absolute inset-y-0 left-0 flex items-center justify-center'
/** In a card or a one-line row with neither: the first mark in the line its marks already stand in. */
export const DOT_IN_LINE = 'relative inline-flex h-[1em] w-1.5 shrink-0 items-center self-center'

/** Paused by someone: not the hold at its very start while the pill counts it in. */
export const heldStill = (one: { startedAt: string; pausedAt: string | null; pausedMs: number }): boolean =>
  !!one.pausedAt && !(one.pausedAt === one.startedAt && !one.pausedMs)

/** The welcome's own dot (`.mf-listening`, main.css): breathing while a session runs, still and dimmed while it is paused. */
export function LiveDot({ paused = false }: { paused?: boolean }): React.JSX.Element {
  return <span aria-hidden data-live-dot data-paused={paused ? '' : undefined} className="mf-listening shrink-0" />
}

/** “24 min left”, “12 min so far”, “time’s up”: where a running session stands, in whole minutes. */
const standing = (one: Running, now = Date.now()): string => {
  const worked = workedMs(one, now)
  const length = (ms: number): string => (ms < MINUTE ? 'under a minute' : hoursSaid(Math.floor(ms / MINUTE)))
  if (!one.plannedMs) return `${length(worked)} so far`
  return one.plannedMs > worked ? `${length(one.plannedMs - worked)} left` : 'time’s up'
}
/** Held at its very start while the pill counts it in (“Starting in a moment”): begun, not paused by anyone. */
const countingIn = (one: Running): boolean => one.pausedAt === one.startedAt && !one.pausedMs
/** The dot's words, worked out as its tip opens: the minutes are the pill's own at that moment. */
function DotSaid({ running }: { running: Running }): ReactNode {
  if (countingIn(running)) return 'Focus session starting in a moment. Click to show it'
  return `${running.pausedAt ? 'Focus session paused' : 'In a focus session'} · ${standing(running)}. Click to show it`
}

/**
 * The dot on the row of the task a focus session is running on, in the margin
 * the day's three numbers stand in. It is the welcome's own dot (`.mf-listening`
 * in main.css: 6px, the accent, one slow breath of its opacity), not one made
 * to look like it; held still and dimmed while the session is paused, still
 * with Motion off or Reduce motion. A press shows the session, as the row's
 * menu does. Held to itself the way a row's date is (date-picker.tsx), so the
 * row never opens or starts a drag under it, and able to take focus: that is
 * what closes a popover left up elsewhere.
 */
export function SessionDot({ id, time, className = '' }: { id: string; time: TaskTime; className?: string }): React.JSX.Element | null {
  const running = time.running
  if (!running || running.taskId !== id) return null
  const paused = heldStill(running) ? '' : undefined
  const show = (): void => (chime('open'), window.api.showFocus(true))
  return (
    <Tip label={<DotSaid running={running} />}>
      <span role="button" tabIndex={0} data-session-dot data-paused={paused} aria-label={paused === '' ? 'Focus session paused. Show it' : 'In a focus session. Show it'}
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => (event.stopPropagation(), show())}
        onKeyDown={(event) => {
          if (event.key !== 'Enter' && event.key !== ' ') return
          event.preventDefault()
          event.stopPropagation()
          show()
        }}
        className={`cursor-pointer after:absolute after:-inset-x-1.5 after:-inset-y-0.5 ${className}`}>
        <LiveDot paused={paused === ''} />
      </span>
    </Tip>
  )
}

/** “40 min so far”; against its length when it has one, “40 min of 1 h”, said the same past it; “40 min of focus” once it is done. */
export const spentSaid = (task: Pick<Task, 'estimate' | 'status'>, minutes: number): string =>
  task.estimate ? `${hoursSaid(minutes)} of ${hoursSaid(task.estimate)}` : task.status === 'open' ? `${hoursSaid(minutes)} so far` : `${hoursSaid(minutes)} of focus`

/** What the time counts, said where a person would ask: as the task's own page counts it. */
export const spentCounts = (sessions: number): string =>
  `${sessions === 1 ? 'In 1 focus session' : `Across ${num(sessions)} focus sessions`}, pauses left out. A session ended early counts for the time it ran; an abandoned one does not.`

/** The time spent on a task, the last thing in its row's small line. Nothing before the first whole minute. */
export function TaskSpent({ task, time, className = '' }: { task: Pick<Task, 'id' | 'estimate' | 'status'>; time: TaskTime; className?: string }): React.JSX.Element | null {
  const spent = time.of(task.id)
  if (!spent) return null
  return (
    <Tip label={spentCounts(spent.sessions)}>
      <span data-task-spent={spent.minutes} className={`flex shrink-0 items-center gap-1 whitespace-nowrap tabular-nums ${className}`}>
        {/* The hourglass Stats heads “How long each task took” with: the clock in this line already says “Due by”. */}
        <Hourglass className="size-3" />{spentSaid(task, spent.minutes)}
      </span>
    </Tip>
  )
}

/** The same time as words in a line of words (“Today, any time · 40 min so far”): last, after the line's own dot, with the same tip. */
export function TaskSpentWords({ task, time, lead = ' · ' }: { task: Pick<Task, 'id' | 'estimate' | 'status'>; time: TaskTime; /** What parts it from the words before it; nothing when it is the line's only words. */ lead?: string }): React.JSX.Element | null {
  const spent = time.of(task.id)
  if (!spent) return null
  return <>{lead}<Tip label={spentCounts(spent.sessions)}><span data-task-spent={spent.minutes} className="tabular-nums">{spentSaid(task, spent.minutes)}</span></Tip></>
}

/**
 * For a row with no small line: the time said in a tip on its name, with what it counts. With no time on the task
 * the tip has no words and stays shut, and the name keeps the same parents either way.
 */
export function SpentTip({ task, time, children }: { task: Pick<Task, 'id' | 'estimate' | 'status'>; time: TaskTime; children: React.ReactElement<{ 'aria-label'?: string; children?: ReactNode }> }): React.JSX.Element {
  const spent = time.of(task.id)
  return <Tip label={spent ? `${spentSaid(task, spent.minutes)}. ${spentCounts(spent.sessions)}` : ''}>{cloneElement(children, { 'data-task-spent-tip': spent?.minutes } as object)}</Tip>
}
