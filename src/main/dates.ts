import dayjs, { type ConfigType, type Dayjs, type OpUnitType } from 'dayjs'
import updateLocale from 'dayjs/plugin/updateLocale.js'

/**
 * Every date the app says or counts, in one place, on Day.js: shared by the
 * main process and the windows, so "4mo", "Today 15:00", "Tue 15:00" and
 * "13 Oct" read the same everywhere. Days are counted on the calendar, never
 * as 24 hours, so a clock change never repeats or skips one. (Reading dates
 * out of typed words is chrono's job, in task-words.ts.)
 */

dayjs.extend(updateLocale)
// Weeks start on Monday, and the months are said the British way the app
// has always shown them ("5 Sept"), whatever the machine's own language.
dayjs.updateLocale('en', { weekStart: 1, monthsShort: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sept', 'Oct', 'Nov', 'Dec'] })

export { dayjs }
export type { Dayjs }

// Times on the Mac's own clock: 12-hour ("9:05 PM") when it is set so. The
// main process asks the Mac (mac-clock.ts) and tells each window through its
// preload (window.api.twelveHour), so every time Vigil writes reads the same.
let twelveHour = (globalThis as { api?: { twelveHour?: boolean } }).api?.twelveHour === true
/** Set once by the main process as it starts, from the Mac's setting. */
export const useTwelveHour = (on: boolean): void => void (twelveHour = on)
/** A time of day: "15:00", "9:05", or "3:00 PM" on a 12-hour Mac. */
export const clock = (date: ConfigType): string => dayjs(date).format(twelveHour ? 'h:mm A' : 'H:mm')
/** "2026-10-05": a day as the database files it, the local calendar's date. */
export const dayKey = (date?: ConfigType): string => dayjs(date).format('YYYY-MM-DD')
/** A "2026-10-05" day as a moment: its noon, safe from any clock change at midnight. */
export const noon = (day: string): Dayjs => dayjs(day).hour(12)
/** Midnight, `offset` days from today (or from `from`), as a number to compare. */
export const startOfDay = (offset = 0, from?: ConfigType): number => dayjs(from).startOf('day').add(offset, 'day').valueOf()
/** Whole calendar days from today to a date: 0 today, 1 tomorrow, -1 yesterday. */
export const daysFromToday = (date: ConfigType): number => dayjs(date).startOf('day').diff(dayjs().startOf('day'), 'day')
const thisYear = (date: Dayjs): boolean => date.year() === dayjs().year()

/** "13 Oct", with the year once it is not this one: "13 Oct 2025". */
export const dayMonth = (date: ConfigType, year: 'auto' | 'never' | 'always' = 'auto'): string => {
  const at = dayjs(date)
  return at.format(year === 'always' || (year === 'auto' && !thisYear(at)) ? 'D MMM YYYY' : 'D MMM')
}
/** "Monday 5 October", and "Monday, 5 October 2025" once it is not this year. */
export const dayName = (date: ConfigType, year: 'auto' | 'never' = 'auto'): string => {
  const at = dayjs(date)
  return at.format(year === 'auto' && !thisYear(at) ? 'dddd, D MMMM YYYY' : 'dddd D MMMM')
}
/**
 * A date in `format`, with the year added once it is not this year: "Mon 5 Oct",
 * but "Mon 5 Oct 2025". The one place a shown date learns it needs its year.
 */
export const dated = (date: ConfigType, format = 'D MMM'): string => {
  const at = dayjs(date)
  return at.format(thisYear(at) ? format : `${format} YYYY`)
}
/** "Mon 5 Oct, 15:00": a moment in a list of moments ("Mon 5 Oct 2025, 15:00" in another year). */
export const moment = (date: ConfigType, weekday: 'ddd' | 'dddd' = 'ddd'): string => `${dated(date, `${weekday} D MMM`)}, ${clock(date)}`
/** A day of the week by its number, 0 for Sunday: "Thursday". */
export const weekdayName = (day: number): string => dayjs().day(day).format('dddd')
/** A month by its number, 0 for January: "October". */
export const monthName = (month: number): string => dayjs().month(month).format('MMMM')

/** "today", "tomorrow", "Monday", "6 Oct", with " 15:00" unless all day: a date the way a list says it. */
export function when(iso: string | null, allDay = true): string {
  if (!iso) return ''
  const days = daysFromToday(iso)
  const time = allDay ? '' : ` ${clock(iso)}`
  if (days === 0) return `Today${time}`
  if (days === 1) return `Tomorrow${time}`
  if (days === -1) return `Yesterday${time}`
  if (days > 1 && days < 7) return `${dayjs(iso).format('dddd')}${time}`
  return `${dated(iso)}${time}`
}
/** `when` inside a sentence: "moved to tomorrow", but "moved to Saturday" and "6 Oct" keep their capitals. */
export const whenInLine = (iso: string | null, allDay = true): string => when(iso, allDay).replace(/^(Today|Tomorrow|Yesterday)/, (word) => word.toLowerCase())
/** A date the way a chip says it, shorter still: "Today 15:00", "Tue", "15 Oct". */
export function short(iso: string, allDay: boolean): string {
  const days = daysFromToday(iso)
  const day = days === 0 ? 'Today' : days === 1 ? 'Tomorrow' : days > 1 && days < 7 ? dayjs(iso).format('ddd') : dated(iso)
  return allDay ? day : `${day} ${clock(iso)}`
}

const UNIT = { year: 'y', month: 'mo', week: 'w', day: 'd', hour: 'h', minute: 'm' } as const
/**
 * How many of a unit lie between two moments. Months and years go by the
 * calendar ("1mo" is the same date a month on, however long the month); days
 * and weeks are time gone by, so a clock change never makes "23h" read "1d".
 */
const span = (from: Dayjs, to: Dayjs, unit: keyof typeof UNIT): number =>
  unit === 'day' || unit === 'week' ? to.diff(from, 'hour', true) / (unit === 'day' ? 24 : 168) : to.diff(from, unit as OpUnitType, true)
/** The biggest of `units` that fits whole between two moments, and how many of it. */
const fits = (from: Dayjs, to: Dayjs, units: (keyof typeof UNIT)[]): [number, keyof typeof UNIT] | null => {
  for (const unit of units) {
    const n = span(from, to, unit)
    if (n >= 1) return [n, unit]
  }
  return null
}
/** How long since: "4mo", "3d", "12m", or "now" inside the first minute. Whole units, rounded down. */
export function age(at: ConfigType): string {
  // Counting months by the calendar is slow, and a list works this out for
  // every row it draws: under 28 days no month can fit, under 365 no year
  // (with a day spare for a clock change).
  const from = dayjs(at)
  const now = dayjs()
  const days = now.diff(from, 'day')
  const found = fits(from, now, [...(days < 364 ? [] : ['year' as const]), ...(days < 27 ? [] : ['month' as const]), 'day', 'hour', 'minute'])
  return found ? `${Math.floor(found[0])}${UNIT[found[1]]}` : 'now'
}
/** How far off a review is: "10m", "1d", "3w". From now, or from another moment. Rounded. */
export function interval(iso: string, from: ConfigType = Date.now()): string {
  const found = fits(dayjs(from), dayjs(iso), ['year', 'month', 'week', 'day', 'hour', 'minute'])
  return found ? `${Math.round(found[0])}${UNIT[found[1]]}` : '1m'
}
/** Days since a moment, with the fraction: for thresholds like "older than a month". */
export const daysSince = (at: ConfigType): number => span(dayjs(at), dayjs(), 'day')
/** Whole calendar days since a moment: 0 today, 1 yesterday, however few hours ago it was. */
export const daysAgo = (at: ConfigType): number => -daysFromToday(at)
/** "3 days", "2 weeks", "6 months", "2 years": how long since, said in words, or null for today. Days go by the calendar. */
function spoken(at: ConfigType): { n: number; unit: string } | null {
  const days = daysAgo(at)
  if (days < 1) return null
  const [n, unit] = dayjs().diff(at, 'year') >= 1 ? [dayjs().diff(at, 'year'), 'year'] : days >= 60 ? [dayjs().diff(at, 'month'), 'month'] : days >= 14 ? [Math.floor(days / 7), 'week'] : [days, 'day']
  return { n, unit: `${unit}${n === 1 ? '' : 's'}` }
}
/** "today", "yesterday", "3 days ago", "6 months ago": how long ago, the way you would say it, by calendar days. */
export function ago(at: ConfigType): string {
  const said = spoken(at)
  if (!said) return 'today'
  if (said.unit === 'day') return 'yesterday'
  return `${said.n} ${said.unit} ago`
}
/** How long a question has been open: "open since today", "open since yesterday", "open since Monday", "open for 2 weeks". */
export function heldFor(at: ConfigType): string {
  const days = daysAgo(at)
  if (days < 1) return 'open since today'
  if (days === 1) return 'open since yesterday'
  if (days < 7) return `open since ${dayjs(at).format('dddd')}`
  const said = spoken(at)!
  return `open for ${said.n} ${said.unit}`
}

const NUMBER = new Intl.NumberFormat('en')
/** A number with its thousands marked: "27,029". Never for a year or an ID like V-560. */
export const num = (n: number): string => NUMBER.format(n)
/** A count with its word: "1 note", "1,204 notes". */
export const plural = (n: number, one: string, many = `${one}s`): string => `${num(n)} ${n === 1 ? one : many}`
