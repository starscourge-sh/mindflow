import { useEffect, useState } from 'react'
import { unread, useLive, haligtree, type Settings } from './haligtree'
import { clock } from '@/lib/clock'
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

/** One event as a line: its time (or All day), a dot in its calendar's colour, its name. */
export function EventLine({ event, compact = false }: { event: MacEvent; compact?: boolean }): React.JSX.Element {
  return (
    // In a narrow column the name goes under its time rather than being cut to a letter.
    <span data-mac-event className={`flex min-w-0 items-center ${compact ? 'flex-wrap gap-x-2 text-xs' : 'gap-2 text-sm'}`}>
      <span aria-hidden className="size-1.5 shrink-0 rounded-full" style={{ background: event.color ?? 'var(--tt-color-text-blue)' }} />
      <span className="shrink-0 text-muted-foreground tabular-nums">{event.allDay ? 'All day' : clock(event.start)}</span>
      <span className={`min-w-0 truncate text-foreground ${compact ? 'grow basis-10' : ''}`}>{event.title}</span>
    </span>
  )
}
