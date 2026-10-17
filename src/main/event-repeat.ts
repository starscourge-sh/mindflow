import dayjs, { type Dayjs } from 'dayjs'

/**
 * How a calendar event repeats, the way Google Calendar and Apple Calendar
 * offer it: every day, on weekdays, weekly on chosen days, every few weeks,
 * monthly on a date or on the nth weekday ("2nd Tuesday", "last Friday"),
 * yearly; ending never, on a day, or after so many times.
 *
 * Tasks repeat differently (task-words.ts `advance`): a routine has one next
 * date that moves on when it is ticked. An event has every date at once, to
 * draw on a week or a month, so its rule is expanded over a span instead.
 * Written with plain Day.js so node's test runner loads it on its own.
 */
export type Repeat = {
  freq: 'daily' | 'weekly' | 'monthly' | 'yearly'
  /** Every this many days, weeks, months or years: 1 unless said. */
  every?: number
  /** Weekly: the days it falls on, 0 Sunday to 6 Saturday. Unset, the start's own day. */
  days?: number[]
  /** Monthly: on the start's date ("on the 14th"), or on its weekday in the month ("the 2nd Tuesday"). */
  by?: 'date' | 'nth'
  /** Monthly by weekday: which one, 1 to 4, or -1 for the last. Unset, the start's own. */
  nth?: number
  /** The last day it may fall on ("2026-12-18"), kept. */
  until?: string | null
  /** Or how many times in all, the first included. */
  count?: number | null
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const ORDINAL = ['', 'first', 'second', 'third', 'fourth']

/** Which of its weekday in the month a day is: 1 for the first Tuesday, up to 5. */
export const nthOf = (day: Dayjs): number => Math.floor((day.date() - 1) / 7) + 1
/** Whether a day is the last of its weekday in its month. */
export const isLast = (day: Dayjs): boolean => day.date() + 7 > day.daysInMonth()

/** The nth (or, -1, the last) given weekday of a month, at the time of day of `time`; null when the month has no fifth. */
function nthWeekday(month: Dayjs, weekday: number, nth: number, time: Dayjs): Dayjs | null {
  const first = month.startOf('month')
  if (nth < 0) {
    const last = first.endOf('month').startOf('day')
    const back = (last.day() - weekday + 7) % 7
    return withTime(last.subtract(back, 'day'), time)
  }
  const ahead = (weekday - first.day() + 7) % 7
  const day = first.add(ahead + (nth - 1) * 7, 'day')
  return day.month() === first.month() ? withTime(day, time) : null
}
const withTime = (day: Dayjs, time: Dayjs): Dayjs => day.hour(time.hour()).minute(time.minute()).second(0).millisecond(0)
/** The Monday of a day's week. */
const mondayOf = (day: Dayjs): Dayjs => day.startOf('day').subtract((day.day() + 6) % 7, 'day')

/**
 * Every start of a repeating event from `start` that falls between `from`
 * and `to` (a start at `from` counted, one at `to` not), at most `most`. The
 * time of day stays the same across a clock change. A month too short for
 * the date takes its last day, as routines do: the 31st falls on the 30th in
 * April. The count, when there is one, counts from the very first time,
 * however far before `from` that was.
 */
export function occurrences(rule: Repeat, start: Date | string, from: Date | string, to: Date | string, most = 1000): Date[] {
  const first = dayjs(start).second(0).millisecond(0)
  const a = dayjs(from).valueOf()
  const b = dayjs(to).valueOf()
  const every = Math.max(1, Math.floor(rule.every ?? 1))
  const until = rule.until ? dayjs(rule.until).endOf('day').valueOf() : Infinity
  const count = rule.count && rule.count > 0 ? rule.count : Infinity
  const out: Date[] = []
  let made = 0
  // Each candidate in order: counted toward `count`, kept if in the span.
  const take = (at: Dayjs): boolean => {
    const ms = at.valueOf()
    if (ms < first.valueOf()) return true
    if (ms > until || made >= count || ms >= b) return false
    made += 1
    if (ms >= a) out.push(at.toDate())
    return out.length < most
  }
  // Far more steps than any span asks for, so a rule that never lands still ends.
  const LIMIT = 20000
  if (rule.freq === 'daily') {
    for (let n = 0; n < LIMIT; n++) if (!take(first.add(n * every, 'day'))) break
  } else if (rule.freq === 'weekly') {
    const days = [...new Set(rule.days?.length ? rule.days : [first.day()])].sort((x, y) => ((x + 6) % 7) - ((y + 6) % 7))
    const monday = mondayOf(first)
    outer: for (let n = 0; n < LIMIT; n++) {
      const week = monday.add(n * every, 'week')
      for (const day of days) if (!take(withTime(week.add((day + 6) % 7, 'day'), first))) break outer
    }
  } else if (rule.freq === 'monthly') {
    const weekday = first.day()
    const nth = rule.nth ?? (isLast(first) && nthOf(first) > 4 ? -1 : nthOf(first))
    for (let n = 0; n < LIMIT; n++) {
      const month = first.startOf('month').add(n * every, 'month')
      const at = rule.by === 'nth' ? nthWeekday(month, weekday, nth, first) : withTime(month.date(Math.min(first.date(), month.daysInMonth())), first)
      if (at && !take(at)) break
      if (!at && month.valueOf() >= b) break
    }
  } else {
    for (let n = 0; n < LIMIT; n++) {
      const year = first.startOf('month').add(n * every, 'year')
      if (!take(withTime(year.date(Math.min(first.date(), year.daysInMonth())), first))) break
    }
  }
  return out
}

/** Which time this is in its series, counting from 0, or -1 when it is not one of them. */
export function indexOf(rule: Repeat, start: Date | string, at: Date | string): number {
  const all = occurrences({ ...rule, until: null, count: null }, start, start, dayjs(at).add(1, 'minute').toDate(), 100000)
  return all.findIndex((one) => one.getTime() === dayjs(at).second(0).millisecond(0).valueOf())
}

/** The rule said in words: "Every 2 weeks on Monday and Wednesday, 5 times", "Monthly on the last Friday". */
export function repeatSaid(rule: Repeat, start: Date | string): string {
  const first = dayjs(start)
  const every = Math.max(1, rule.every ?? 1)
  const list = (names: string[]): string => (names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`)
  let said: string
  if (rule.freq === 'daily') said = every === 1 ? 'Every day' : `Every ${every} days`
  else if (rule.freq === 'weekly') {
    const days = rule.days?.length ? [...rule.days].sort((x, y) => ((x + 6) % 7) - ((y + 6) % 7)) : [first.day()]
    const weekdays = every === 1 && days.length === 5 && [1, 2, 3, 4, 5].every((day) => days.includes(day))
    said = weekdays ? 'Every weekday' : `${every === 1 ? 'Weekly' : `Every ${every} weeks`} on ${list(days.map((day) => WEEKDAYS[day]))}`
  } else if (rule.freq === 'monthly') {
    const head = every === 1 ? 'Monthly' : `Every ${every} months`
    if (rule.by === 'nth') {
      const nth = rule.nth ?? nthOf(first)
      said = `${head} on the ${nth < 0 ? 'last' : ORDINAL[nth] ?? `${nth}th`} ${WEEKDAYS[first.day()]}`
    } else said = `${head} on the ${first.format('D')}${suffix(first.date())}`
  } else said = every === 1 ? `Yearly on ${first.format('D MMMM')}` : `Every ${every} years on ${first.format('D MMMM')}`
  if (rule.count) said += `, ${rule.count} ${rule.count === 1 ? 'time' : 'times'}`
  else if (rule.until) said += `, until ${dayjs(rule.until).format('D MMMM YYYY')}`
  return said
}
const suffix = (n: number): string => (n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th')

/** A rule as stored, read back; anything unreadable is no rule at all. */
export function readRepeat(json: string | null | undefined): Repeat | null {
  if (!json) return null
  try {
    const rule = JSON.parse(json) as Repeat
    return ['daily', 'weekly', 'monthly', 'yearly'].includes(rule?.freq) ? rule : null
  } catch {
    return null
  }
}

/**
 * The rule ended just before one of its times, for "This and following":
 * the old series stops the day before, and the count left over goes on with
 * the new one.
 */
export function splitAt(rule: Repeat, start: Date | string, at: Date | string): { before: Repeat; after: Repeat } {
  const index = Math.max(0, indexOf(rule, start, at))
  const before: Repeat = { ...rule, until: dayjs(at).subtract(1, 'day').format('YYYY-MM-DD'), count: rule.count ? index : null }
  if (!rule.count) delete before.count
  const after: Repeat = { ...rule, ...(rule.count ? { count: Math.max(1, rule.count - index) } : {}) }
  return { before, after }
}
