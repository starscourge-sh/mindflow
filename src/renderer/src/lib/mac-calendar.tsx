import { useEffect, useState } from 'react'
import { unread, useLive, haligtree, type Settings } from './haligtree'
import type { MacEvent, MacCalendar } from '../../../main/mac-calendar'
export type { MacEvent, MacCalendar }

/**
 * Your Mac's calendar, read only (src/main/mac-calendar.ts): the events of a
 * span of days, when Settings has it on. Read again every five minutes.
 */
const NONE: MacCalendar = { status: 'none', events: [] }

export const calendar = {
  events: (from: string, to: string) => window.api.haligtree<MacCalendar>('calendar:events', from, to),
  ask: (from: string, to: string) => window.api.haligtree<MacCalendar>('calendar:ask', from, to)
}

export function useMacEvents(from: Date, to: Date): MacCalendar {
  const settings = useLive(haligtree.settings, null as Settings | null)
  const on = !!settings?.macCalendar
  // Not read yet until the settings say whether it is on, and if on, until it answers (`unloaded` says so).
  // Already known to be off: nothing to wait for, from the first frame.
  const [said, setSaid] = useState<MacCalendar>(() => (settings && !settings.macCalendar ? NONE : unread({ ...NONE })))
  const [a, b] = [from.toISOString(), to.toISOString()]
  useEffect(() => {
    if (!settings) return
    if (!on) return void setSaid(NONE)
    let live = true
    const read = (): void => void calendar.events(a, b).then((got) => live && setSaid(got), () => undefined)
    read()
    const every = setInterval(read, 5 * 60_000)
    return () => ((live = false), clearInterval(every))
  }, [!!settings, on, a, b])
  return said
}
