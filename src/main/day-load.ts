import dayjs from 'dayjs'

/**
 * Does a day fit? Its meetings (calendar events, all-day ones left out and
 * overlaps counted once) and its tasks' lengths, against a working day of
 * about N hours (Settings). A task with no length counts no time: it is
 * counted apart, "2 tasks without a length", never guessed at. And for a day
 * that is over, which tasks to move on: the least pressing first, by the
 * Matrix's order, each to the next weekday with room. Day.js alone, so the
 * tests run it as it is.
 */

export type LoadEvent = { start: string; end: string; allDay: boolean }
export type LoadTask = { id: string; estimate: number | null; priority: number; important: number | boolean; dueAt: string | null; deadline: string | null }
export type DayLoad = {
  day: string
  /** Minutes of meetings, overlaps once. */
  meetings: number
  /** Minutes of tasks with a length. */
  tasks: number
  /** Tasks with no length, which count no time. */
  unsized: number
  /** Every task on the day. */
  count: number
  room: number
  /** Minutes past the room; 0 when it fits. */
  over: number
  /** Minutes left in the room; 0 when over. */
  free: number
}
export type Move = { id: string; from: string; to: string; minutes: number }

const dayKey = (at: dayjs.ConfigType): string => dayjs(at).format('YYYY-MM-DD')

/** The day a task is for: the day it is planned, else the day it is due by. */
export const taskDay = (task: Pick<LoadTask, 'dueAt' | 'deadline'>): string | null => (task.dueAt ? dayKey(task.dueAt) : task.deadline ? dayKey(task.deadline) : null)

/** Minutes the events fill between two moments: all-day ones left out, time two of them share counted once. */
export function busyMinutes(events: LoadEvent[], from: number, to: number): number {
  const spans = events
    .filter((one) => !one.allDay)
    .map((one) => [Math.max(from, Date.parse(one.start)), Math.min(to, Date.parse(one.end))] as const)
    .filter(([a, b]) => b > a)
    .sort((x, y) => x[0] - y[0])
  let total = 0
  let start = -Infinity
  let end = -Infinity
  for (const [a, b] of spans) {
    if (a > end) {
      if (end > start) total += end - start
      ;[start, end] = [a, b]
    } else end = Math.max(end, b)
  }
  if (end > start) total += end - start
  return Math.round(total / 60_000)
}

/** One day's load: its events and the tasks for it, against `room` minutes. */
export function loadOf(day: string, events: LoadEvent[], tasks: Pick<LoadTask, 'estimate'>[], room: number): DayLoad {
  const from = dayjs(day).startOf('day')
  const meetings = busyMinutes(events, from.valueOf(), from.add(1, 'day').valueOf())
  const sized = tasks.reduce((sum, task) => sum + (task.estimate && task.estimate > 0 ? task.estimate : 0), 0)
  const unsized = tasks.filter((task) => !(task.estimate && task.estimate > 0)).length
  const used = meetings + sized
  return { day, meetings, tasks: sized, unsized, count: tasks.length, room, over: Math.max(0, used - room), free: Math.max(0, room - used) }
}

/** "5h", "4h 30m", "45m": a length, short. */
export function lengthSaid(minutes: number): string {
  const m = Math.max(0, Math.round(minutes / 5) * 5)
  const [h, rest] = [Math.floor(m / 60), m % 60]
  if (!h) return `${rest}m`
  return rest ? `${h}h ${rest}m` : `${h}h`
}

/** "5h meetings · 4h tasks": what fills the day; empty for an empty day. */
export function loadSaid(load: Pick<DayLoad, 'meetings' | 'tasks' | 'unsized'>): string {
  const parts = [load.meetings ? `${lengthSaid(load.meetings)} meetings` : '', load.tasks ? `${lengthSaid(load.tasks)} tasks` : ''].filter(Boolean)
  return parts.join(' · ')
}

/** "1 task without a length", "4 tasks without a length". */
export const unsizedSaid = (n: number): string => `${n} ${n === 1 ? 'task' : 'tasks'} without a length`

// The Matrix's boxes, the one to move on first leading: neither, then urgent
// only, then important only; urgent and important stays.
// Urgent as the Matrix has it (task-words.ts): planned or due within three days.
const urgent = (task: LoadTask, at: Date): boolean => {
  const soon = dayjs(at).startOf('day').add(3, 'day').valueOf()
  return [task.dueAt, task.deadline].some((one) => !!one && Date.parse(one) < soon)
}
const box = (task: LoadTask, at: Date): number => (task.important ? (urgent(task, at) ? 3 : 2) : urgent(task, at) ? 1 : 0)

/** Tasks, the least pressing first: by the Matrix's box, then priority (none, low, medium, high, urgent), then the longest. */
export function leastFirst<T extends LoadTask>(tasks: T[], at = new Date()): T[] {
  return [...tasks].sort((a, b) => box(a, at) - box(b, at) || (b.priority || 5) - (a.priority || 5) || (b.estimate ?? 0) - (a.estimate ?? 0))
}

const weekend = (day: string): boolean => [0, 6].includes(dayjs(day).day())

/**
 * The moves that make an over-full day fit: its planned tasks with a length,
 * the least pressing first, each to the next weekday after it with room for
 * it (counting what the plan already sends there). A task only due that day
 * stays: a deadline is not moved for you. Short when no later day has room.
 */
export function planMoves<T extends LoadTask>(day: string, days: { load: DayLoad; tasks: T[] }[], at = new Date()): Move[] {
  const index = days.findIndex((one) => one.load.day === day)
  if (index < 0 || !days[index].load.over) return []
  const added = new Map<string, number>()
  const moves: Move[] = []
  let left = days[index].load.over
  for (const task of leastFirst(days[index].tasks.filter((one) => one.dueAt && one.estimate && one.estimate > 0), at)) {
    if (left <= 0) break
    const minutes = task.estimate!
    const target = days.slice(index + 1).find(({ load }) => !weekend(load.day) && load.meetings + load.tasks + (added.get(load.day) ?? 0) + minutes <= load.room)
    if (!target) continue
    added.set(target.load.day, (added.get(target.load.day) ?? 0) + minutes)
    moves.push({ id: task.id, from: day, to: target.load.day, minutes })
    left -= minutes
  }
  return moves
}

/** The same moment, moved to another day: a task keeps its time of day. */
export const onDay = (iso: string, day: string): string => {
  const was = dayjs(iso)
  return was.add(dayjs(day).startOf('day').diff(was.startOf('day'), 'day'), 'day').toISOString()
}

/** Events and timed things in one line by time: each kept with its kind; all-day events first. */
export function byTime<A extends { start: string; allDay?: boolean }, B extends { at: string }>(events: A[], timed: B[]): ({ kind: 'event'; one: A } | { kind: 'task'; one: B })[] {
  const all = [
    ...events.map((one) => ({ kind: 'event' as const, one, at: one.allDay ? -Infinity : Date.parse(one.start) })),
    ...timed.map((one) => ({ kind: 'task' as const, one, at: Date.parse(one.at) }))
  ]
  // Stable: at the same minute, the event (it was set first) leads.
  return all.sort((a, b) => a.at - b.at).map(({ kind, one }) => ({ kind, one }) as { kind: 'event'; one: A } | { kind: 'task'; one: B })
}

/**
 * Where a day's events go among its cards, which keep their own order (you
 * may have dragged them): each timed event just before the first timed card
 * at or after it, else just after the last timed card; all-day events, and
 * every event on a day with no timed card, at the top. Keyed by the card an
 * event goes before, 'top' or 'end'.
 */
export function placeEvents<E extends LoadEvent>(events: E[], cards: { key: string; at: string | null }[]): Map<string, E[]> {
  const placed = new Map<string, E[]>()
  const put = (key: string, one: E): void => void placed.set(key, [...(placed.get(key) ?? []), one])
  const timed = cards.map((card, index) => ({ ...card, index })).filter((card) => card.at)
  const last = timed.length ? timed[timed.length - 1].index : -1
  for (const one of [...events].sort((a, b) => Number(b.allDay) - Number(a.allDay) || Date.parse(a.start) - Date.parse(b.start))) {
    if (one.allDay || last < 0) put('top', one)
    else {
      const next = timed.find((card) => Date.parse(card.at!) >= Date.parse(one.start))
      put(next ? next.key : cards[last + 1]?.key ?? 'end', one)
    }
  }
  return placed
}
