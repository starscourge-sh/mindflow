import dayjs, { type ConfigType, type Dayjs } from 'dayjs'

/**
 * A goal's dates, worked out the same way in the main process (the menu bar,
 * nudges, milestones) and in the windows (its page, the strip, the beacon).
 * A goal's days are calendar days, "2026-12-14", never stretches of 24
 * hours, so a clock change never adds or loses one. Day.js alone, not
 * dates.ts, so the tests can run it as it is.
 */

const dayKey = (date?: ConfigType): string => dayjs(date).format('YYYY-MM-DD')
/** A day's noon, safe from a clock change at midnight. */
const noon = (day: string): Dayjs => dayjs(day).hour(12)
const num = (n: number): string => n.toLocaleString('en')

/** Whole calendar days from one day to another: 1 from today to tomorrow. */
export const daysBetween = (from: string, to: string): number => Math.round(noon(to).diff(noon(from), 'hour') / 24)

/** Days from today to the target: 0 on the day, -1 the day after. */
export const daysLeft = (target: string, today = dayKey()): number => daysBetween(today, target)

/** How far through a day, week, month or year a moment is, 0 to 1, by the local clock. */
const through = (at: Date, unit: 'day' | 'week' | 'month' | 'year'): number => {
  // A week starts on Monday, whatever the locale says.
  const start = unit === 'week' ? dayjs(at).startOf('day').subtract((dayjs(at).day() + 6) % 7, 'day') : dayjs(at).startOf(unit)
  const end = start.add(1, unit)
  return (at.getTime() - start.valueOf()) / (end.valueOf() - start.valueOf())
}

/**
 * How much of the time from the start to the target has gone by, 0 to 1: the
 * days before today, and the part of today already gone. The target day is
 * the end, so on it this is 1.
 */
export function wayThrough(from: string, target: string, at = new Date()): number {
  const total = daysBetween(from, target)
  if (total <= 0) return 1
  const gone = daysBetween(from, dayKey(at)) + through(at, 'day')
  return Math.min(1, Math.max(0, gone / total))
}

/** Tempus: how far through the day, the week (from Monday), the month and the year, 0 to 1. */
export const tempus = (at = new Date()): { day: number; week: number; month: number; year: number } => ({
  day: through(at, 'day'),
  week: through(at, 'week'),
  month: through(at, 'month'),
  year: through(at, 'year')
})

/** A share as a whole percent, never 100 before it is all gone: "41%". */
export const percent = (share: number): string => `${share >= 1 ? 100 : Math.min(99, Math.floor(share * 100))}%`

/** "68 days left", "1 day left", "Today", "1 day past", "3 days past". */
export function leftSaid(left: number): string {
  if (left === 0) return 'Today'
  if (left > 0) return `${num(left)} ${left === 1 ? 'day' : 'days'} left`
  return `${num(-left)} ${left === -1 ? 'day' : 'days'} past`
}

/** One dot of the journey: a day, or a week when the road is long. */
export type Dot = {
  /** The day it stands for (a week's Monday, or its first day inside the range). */
  day: string
  /** The last day it covers: the same day, or the week's Sunday (or the target). */
  last: string
  col: number
  row: number
  past: boolean
  today: boolean
  target: boolean
}
export type Journey = { by: 'day' | 'week'; dots: Dot[]; cols: number; rows: number; months: { col: number; label: string }[] }

/** Past this many days a dot is a week, so a goal two years off still fits. */
export const LONG = 400

/**
 * The road from the start to the target, a dot a day: a column a week, Monday
 * at the top, and a month's name over the column it starts in. Longer than
 * LONG days, a dot a week instead: a column a month, its weeks down it.
 */
export function journey(from: string, target: string, today = dayKey()): Journey {
  const start = daysBetween(from, target) < 0 ? target : from
  const total = daysBetween(start, target)
  const dots: Dot[] = []
  const months: { col: number; label: string }[] = []
  // The year only where it turns, or on the first label when it is not this year: "Sept 2026" beside "Oct" read as one label.
  const label = (day: string): string => (dayjs(day).month() === 0 || (!months.length && !dayjs(day).isSame(dayjs(), 'year')) ? dayjs(day).format('MMM YYYY') : dayjs(day).format('MMM'))
  if (total <= LONG) {
    // Its column is the week it falls in, counted from the start's Monday.
    const lead = (noon(start).day() + 6) % 7
    for (let n = 0; n <= total; n++) {
      const day = dayKey(noon(start).add(n, 'day'))
      const col = Math.floor((n + lead) / 7)
      if (n === 0 || day.endsWith('-01')) {
        const named = { col: n === 0 || (n + lead) % 7 === 0 ? col : col + 1, label: label(day) }
        // Kept three columns apart, so two names never run into each other.
        if (!months.some((one) => one.col >= named.col - 2)) months.push(named)
      }
      dots.push({ day, last: day, col, row: (n + lead) % 7, past: day < today, today: day === today, target: day === target })
    }
    return { by: 'day', dots, cols: (dots.at(-1)?.col ?? 0) + 1, rows: 7, months }
  }
  // A week a dot: each week from its Monday, the first one from the start.
  let at = noon(start)
  let col = -1
  let month = ''
  let row = 0
  while (dayKey(at) <= target) {
    const day = dayKey(at)
    const sunday = dayKey(at.add((7 - at.day()) % 7, 'day'))
    const last = sunday > target ? target : sunday
    if (day.slice(0, 7) !== month) {
      month = day.slice(0, 7)
      col += 1
      row = 0
      if (!months.length || dayjs(day).month() % 3 === 0) months.push({ col, label: label(day) })
    }
    dots.push({ day, last, col, row: row++, past: last < today, today: day <= today && today <= last, target: last === target })
    at = noon(last).add(1, 'day')
  }
  return { by: 'week', dots, cols: col + 1, rows: Math.max(...dots.map((dot) => dot.row)) + 1, months }
}
