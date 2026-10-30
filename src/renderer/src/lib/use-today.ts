import { useEffect, useState } from 'react'
import { dayKey } from '../../../main/dates'

/**
 * Today's date, kept current: again at midnight, and each minute when
 * `minutes`. A page left open past midnight draws itself for the new day.
 */
export function useToday(minutes = false): string {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const next = minutes ? 60_000 - (Date.now() % 60_000) : new Date().setHours(24, 0, 0, 50) - Date.now()
    const timer = setTimeout(() => setNow(Date.now()), next)
    return () => clearTimeout(timer)
  }, [now, minutes])
  return dayKey(now)
}
