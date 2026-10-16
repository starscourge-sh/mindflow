import { useEffect, useState } from 'react'
import type { ConfigType } from 'dayjs'
import { dated, dayjs, short as shortDay, when as whenDay } from '../../../main/dates'

/**
 * Every time of day the windows show, in the clock the Mac uses: "14:05"
 * where the Mac reads 24 hours, "2:05 PM" where it reads 12. The days
 * themselves are said by dates.ts; only the time is said here, so the
 * pill, Today, the week and the start form never disagree.
 */

const twelve = new Intl.DateTimeFormat(undefined, { hour: 'numeric' }).resolvedOptions().hourCycle?.startsWith('h1') ?? false
const twelveHour = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit', hour12: true })

/** A time of day: "15:00" and "9:05", or "3:00 PM" and "9:05 AM" on a 12-hour Mac. */
export const clock = (date: ConfigType): string => (twelve ? twelveHour.format(dayjs(date).toDate()) : dayjs(date).format('H:mm'))

/** "Today", "Tomorrow 15:00", "Monday", "6 Oct": a date the way a list says it, its time in the Mac's clock. */
export const when = (iso: string | null, allDay = true): string => (!iso ? '' : allDay ? whenDay(iso) : `${whenDay(iso)} ${clock(iso)}`)
/** `when` inside a sentence: "moved to tomorrow", but "Saturday" and "6 Oct" keep their capitals. */
export const whenInLine = (iso: string | null, allDay = true): string => when(iso, allDay).replace(/^(Today|Tomorrow|Yesterday)/, (word) => word.toLowerCase())
/** A date the way a chip says it: "Today 15:00", "Tue", "15 Oct". */
export const short = (iso: string, allDay: boolean): string => (allDay ? shortDay(iso, true) : `${shortDay(iso, true)} ${clock(iso)}`)
/** "Mon 5 Oct, 15:00": a moment in a list of moments. */
export const moment = (date: ConfigType, weekday: 'ddd' | 'dddd' = 'ddd'): string => `${dated(date, `${weekday} D MMM`)}, ${clock(date)}`

/** The time now, said again on each new minute, on the minute. */
export function useMinute(): Date {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    let timer = 0
    const next = (): void => {
      timer = window.setTimeout(() => (setNow(new Date()), next()), 60_000 - (Date.now() % 60_000) + 50)
    }
    next()
    return () => clearTimeout(timer)
  }, [])
  return now
}
