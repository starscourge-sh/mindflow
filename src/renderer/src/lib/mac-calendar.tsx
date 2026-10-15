import { useEffect, useState } from 'react'
import { useLive, vigil, type Settings } from './vigil'
import { clock } from '../../../main/dates'
import type { MacEvent, MacCalendar } from '../../../main/mac-calendar'
export type { MacEvent, MacCalendar }

/**
 * Your Mac's calendar, read only (src/main/mac-calendar.ts): the events of a
 * span of days, when Settings has it on. Read again every five minutes.
 */
const NONE: MacCalendar = { status: 'none', events: [] }

export const calendar = {
  events: (from: string, to: string) => window.api.vigil<MacCalendar>('calendar:events', from, to),
  ask: (from: string, to: string) => window.api.vigil<MacCalendar>('calendar:ask', from, to)
}

export function useMacEvents(from: Date, to: Date): MacCalendar {
  const settings = useLive(vigil.settings, null as Settings | null)
  const on = !!settings?.macCalendar
  const [said, setSaid] = useState<MacCalendar>(NONE)
  const [a, b] = [from.toISOString(), to.toISOString()]
  useEffect(() => {
    if (!on) return void setSaid(NONE)
    let live = true
    const read = (): void => void calendar.events(a, b).then((got) => live && setSaid(got), () => undefined)
    read()
    const every = setInterval(read, 5 * 60_000)
    return () => ((live = false), clearInterval(every))
  }, [on, a, b])
  return said
}

/** One event as a line: its time (or All day), a dot in its calendar's colour, its name. */
export function EventLine({ event, compact = false }: { event: MacEvent; compact?: boolean }): React.JSX.Element {
  return (
    <span data-mac-event className={`flex min-w-0 items-center gap-2 ${compact ? 'text-xs' : 'text-sm'}`}>
      <span aria-hidden className="size-1.5 shrink-0 rounded-full" style={{ background: event.color ?? 'var(--tt-color-text-blue)' }} />
      <span className="shrink-0 text-muted-foreground tabular-nums">{event.allDay ? 'All day' : clock(event.start)}</span>
      <span className="min-w-0 truncate text-foreground">{event.title}</span>
    </span>
  )
}
