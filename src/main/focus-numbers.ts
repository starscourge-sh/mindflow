import dayjs from 'dayjs'

/**
 * How focus sessions went, worked out from the sessions table: for one task
 * (its panel) and for all of them (Stats). Day.js alone, so the tests can
 * run it as it is. A session counts on the local day it started; its time is
 * from start to end less its pauses. An abandoned one is counted as such and
 * in no total of time.
 */

export type FocusRow = {
  id: string
  taskId: string
  title: string
  startedAt: string
  endedAt: string
  pausedMs: number
  plannedMs: number | null
  abandonedAt: string | null
}
/** A break taken between sessions: a "Break" timer, or a pomodoro set's break. */
export type BreakRow = { at: string; ms: number }

/** Ran its full length (or had none set), stopped before its time, or abandoned. */
export type Outcome = 'finished' | 'early' | 'abandoned'

export type TaskFocus = {
  /** Sessions kept, abandoned ones not among them. */
  sessions: number
  minutes: number
  lastAt: string | null
  finished: number
  early: number
  abandoned: number
  /** The last few, oldest first: when, how long, how it ended. */
  recent: { at: string; minutes: number; outcome: Outcome }[]
}

export type FocusStats = {
  /** Every session ever kept, and when the first one was. */
  total: { sessions: number; minutes: number; since: string | null }
  /** The last 28 days, oldest first, ending today. */
  days: { day: string; minutes: number; sessions: number }[]
  /** The last 12 weeks, Monday to Sunday, oldest first, ending this week. */
  weeks: { start: string; minutes: number }[]
  today: number
  /** The last seven days, today among them, and the seven before: a Monday never reads as an empty week. */
  week: number
  weekBefore: number
  /** Days in a row with a session kept: running now (today or up to yesterday), and the longest. */
  streak: { now: number; best: number }
  /** Everything below is over the last 12 weeks. */
  sessions: number
  average: number
  longest: number
  /** Focus minutes by the hour it started in, 0 to 23. */
  hours: number[]
  best: { part: 'morning' | 'afternoon' | 'evening' | 'night'; hour: number } | null
  outcomes: { finished: number; early: number; abandoned: number }
  pauses: { sessions: number; minutes: number }
  breaks: { n: number; minutes: number }
  top: { taskId: string; title: string; minutes: number; sessions: number }[]
  /**
   * How long each task took, over every session ever kept: its minutes, and
   * whether it grew (its last session ran longer than its first). `average`
   * is the minutes a task takes, across every task with a session.
   */
  taskTimes: { average: number; tasks: { taskId: string; title: string; minutes: number; sessions: number; first: number; last: number; grew: boolean }[] }
}

/** A finished session may stop a minute short of its length and still count as run. */
const GRACE = 60_000
const WINDOW = 84

export const focusedMs = (row: Pick<FocusRow, 'startedAt' | 'endedAt' | 'pausedMs'>): number =>
  Math.max(0, new Date(row.endedAt).getTime() - new Date(row.startedAt).getTime() - (row.pausedMs || 0))

export const outcomeOf = (row: FocusRow): Outcome =>
  row.abandonedAt ? 'abandoned' : row.plannedMs && focusedMs(row) < row.plannedMs - GRACE ? 'early' : 'finished'

const minutes = (ms: number): number => Math.round(ms / 60000)
const dayKey = (at: dayjs.ConfigType): string => dayjs(at).format('YYYY-MM-DD')
/** The Monday a day's week starts on. */
const monday = (at: dayjs.ConfigType): dayjs.Dayjs => dayjs(at).startOf('day').subtract((dayjs(at).day() + 6) % 7, 'day')

export function taskFocus(rows: FocusRow[]): TaskFocus {
  const sorted = [...rows].sort((a, b) => a.startedAt.localeCompare(b.startedAt))
  const kept = sorted.filter((row) => !row.abandonedAt)
  const count = (outcome: Outcome): number => sorted.filter((row) => outcomeOf(row) === outcome).length
  return {
    sessions: kept.length,
    minutes: minutes(kept.reduce((sum, row) => sum + focusedMs(row), 0)),
    lastAt: sorted.length ? sorted[sorted.length - 1].endedAt : null,
    finished: count('finished'),
    early: count('early'),
    abandoned: count('abandoned'),
    recent: sorted.slice(-14).map((row) => ({ at: row.startedAt, minutes: minutes(focusedMs(row)), outcome: outcomeOf(row) }))
  }
}

/** Days in a row from a set of day keys: the longest run, and the one reaching today or yesterday. */
export function streaks(days: Set<string>, today = dayKey(new Date())): { now: number; best: number } {
  let best = 0
  for (const day of days) {
    if (days.has(dayKey(dayjs(day).subtract(1, 'day')))) continue
    let run = 1
    while (days.has(dayKey(dayjs(day).add(run, 'day')))) run++
    best = Math.max(best, run)
  }
  // Today not yet worked does not break it: the run up to yesterday still stands.
  let from = days.has(today) ? dayjs(today) : dayjs(today).subtract(1, 'day')
  let now = 0
  while (days.has(dayKey(from))) {
    now++
    from = from.subtract(1, 'day')
  }
  return { now, best }
}

const partOf = (hour: number): 'morning' | 'afternoon' | 'evening' | 'night' =>
  hour >= 5 && hour < 12 ? 'morning' : hour >= 12 && hour < 17 ? 'afternoon' : hour >= 17 && hour < 22 ? 'evening' : 'night'

/** Each task's whole time, first session and last, from rows in the order they started. */
function taskTimes(kept: FocusRow[]): FocusStats['taskTimes'] {
  const each = new Map<string, { taskId: string; title: string; ms: number; sessions: number; first: number; last: number }>()
  // A bare session (no task) counts in the totals, not as a task of its own.
  for (const row of kept.filter((one) => one.taskId)) {
    const ms = focusedMs(row)
    const was = each.get(row.taskId)
    each.set(row.taskId, was ? { ...was, ms: was.ms + ms, sessions: was.sessions + 1, last: ms } : { taskId: row.taskId, title: row.title, ms, sessions: 1, first: ms, last: ms })
  }
  const all = [...each.values()]
  return {
    average: all.length ? minutes(all.reduce((sum, one) => sum + one.ms, 0) / all.length) : 0,
    tasks: all.sort((a, b) => b.ms - a.ms).slice(0, 8).map((one) => ({
      taskId: one.taskId, title: one.title, minutes: minutes(one.ms), sessions: one.sessions,
      first: minutes(one.first), last: minutes(one.last), grew: one.sessions > 1 && one.last > one.first
    }))
  }
}

export function focusStats(rows: FocusRow[], breaks: BreakRow[] = [], at: Date = new Date()): FocusStats {
  const today = dayKey(at)
  const kept = rows.filter((row) => !row.abandonedAt)
  const since = dayjs(today).subtract(WINDOW - 1, 'day').valueOf()
  const recent = rows.filter((row) => new Date(row.startedAt).getTime() >= since)
  const recentKept = recent.filter((row) => !row.abandonedAt)

  const byDay = new Map<string, { ms: number; n: number }>()
  for (const row of kept) {
    const day = dayKey(row.startedAt)
    const was = byDay.get(day) ?? { ms: 0, n: 0 }
    byDay.set(day, { ms: was.ms + focusedMs(row), n: was.n + 1 })
  }
  const days = Array.from({ length: 28 }, (_, index) => {
    const day = dayKey(dayjs(today).subtract(27 - index, 'day'))
    return { day, minutes: minutes(byDay.get(day)?.ms ?? 0), sessions: byDay.get(day)?.n ?? 0 }
  })
  const weekOf = (start: dayjs.Dayjs): number =>
    minutes(kept.filter((row) => dayKey(monday(row.startedAt)) === dayKey(start)).reduce((sum, row) => sum + focusedMs(row), 0))
  const thisMonday = monday(today)
  const weeks = Array.from({ length: 12 }, (_, index) => {
    const start = thisMonday.subtract(11 - index, 'week')
    return { start: dayKey(start), minutes: weekOf(start) }
  })

  const hours = Array.from({ length: 24 }, () => 0)
  for (const row of recentKept) hours[dayjs(row.startedAt).hour()] += focusedMs(row) / 60000
  const parts = { morning: 0, afternoon: 0, evening: 0, night: 0 }
  hours.forEach((n, hour) => (parts[partOf(hour)] += n))
  const part = (Object.keys(parts) as (keyof typeof parts)[]).sort((a, b) => parts[b] - parts[a])[0]
  const peak = hours.reduce((top, n, hour) => (n > hours[top] ? hour : top), 0)
  // The best hour is the busiest one inside the best part of the day, so the two never disagree.
  const bestHour = hours.reduce((top, n, hour) => (partOf(hour) === part && n > (top < 0 ? -1 : hours[top]) ? hour : top), -1)

  const lengths = recentKept.map(focusedMs)
  const perTask = new Map<string, { taskId: string; title: string; ms: number; sessions: number }>()
  for (const row of recentKept.filter((one) => one.taskId)) {
    const was = perTask.get(row.taskId) ?? { taskId: row.taskId, title: row.title, ms: 0, sessions: 0 }
    perTask.set(row.taskId, { ...was, ms: was.ms + focusedMs(row), sessions: was.sessions + 1 })
  }
  const paused = recent.filter((row) => (row.pausedMs || 0) >= 30_000)
  const breaksHere = breaks.filter((one) => new Date(one.at).getTime() >= since && one.ms >= 30_000)

  return {
    total: {
      sessions: kept.length,
      minutes: minutes(kept.reduce((sum, row) => sum + focusedMs(row), 0)),
      since: rows.length ? rows.reduce((first, row) => (row.startedAt < first ? row.startedAt : first), rows[0].startedAt) : null
    },
    days,
    weeks,
    today: days[days.length - 1].minutes,
    week: days.slice(21).reduce((sum, one) => sum + one.minutes, 0),
    weekBefore: days.slice(14, 21).reduce((sum, one) => sum + one.minutes, 0),
    streak: streaks(new Set(byDay.keys()), today),
    sessions: recentKept.length,
    average: lengths.length ? minutes(lengths.reduce((sum, ms) => sum + ms, 0) / lengths.length) : 0,
    longest: lengths.length ? minutes(Math.max(...lengths)) : 0,
    hours: hours.map((n) => Math.round(n)),
    best: recentKept.length ? { part, hour: bestHour < 0 ? peak : bestHour } : null,
    outcomes: {
      finished: recent.filter((row) => outcomeOf(row) === 'finished').length,
      early: recent.filter((row) => outcomeOf(row) === 'early').length,
      abandoned: recent.filter((row) => outcomeOf(row) === 'abandoned').length
    },
    pauses: { sessions: paused.length, minutes: minutes(paused.reduce((sum, row) => sum + row.pausedMs, 0)) },
    breaks: { n: breaksHere.length, minutes: minutes(breaksHere.reduce((sum, one) => sum + one.ms, 0)) },
    top: [...perTask.values()].sort((a, b) => b.ms - a.ms).slice(0, 5).map((one) => ({ taskId: one.taskId, title: one.title, minutes: minutes(one.ms), sessions: one.sessions })),
    taskTimes: taskTimes(kept)
  }
}
