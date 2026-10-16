import { useEffect, useState } from 'react'

/**
 * Every time of day the windows show, in the clock the Mac uses: "14:05" on
 * a 24-hour Mac, "2:05 PM" on a 12-hour one. One rule for the whole app:
 * dates.ts's, which the main process sets from the Mac (mac-clock.ts) and
 * each window reads from its preload, so a time main wrote and a time a
 * window wrote never disagree. The pill, Today, the week and the start form
 * all import from here.
 */
export { clock, moment, short, when, whenInLine } from '../../../main/dates'

const twelve = (globalThis as { api?: { twelveHour?: boolean } }).api?.twelveHour === true
/** The width of a column of times, wide enough for "12:45 PM" on a 12-hour Mac. */
export const TIME_COLUMN = twelve ? 'w-[4.5rem]' : 'w-11'
/** The same for a timeline laid out as a grid: the time, the thread, the words. */
export const TIME_GRID = twelve ? 'grid-cols-[4rem_auto_minmax(0,1fr)]' : 'grid-cols-[2.75rem_auto_minmax(0,1fr)]'

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
