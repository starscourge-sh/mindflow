import { CAPTURE_TYPES } from '../capture-kinds/capture-kind-picker'
import { chime } from '@/lib/sound'
import { useLive } from '@/lib/vigil'
import { notes, type Day, type DayEntry } from '@/lib/notes'
import { taskName } from '@/lib/tasks'
import { TIME_COLUMN, clock } from '@/lib/clock'
import { Brain, CheckCircle2, Gem, Inbox, ListTodo } from '@/components/ui/icons'
import { CalendarClock } from 'lucide-react'

/**
 * A day as a time log, built from what happened in it: every capture, every
 * capture dealt with, every card studied, every task done, and every task
 * dated for it, each at its time and in order. Nothing to fill in. On the
 * day's page, and beside the writing when you close the day.
 */

type What = 'captured' | 'resolved' | 'studied' | 'done' | 'dated'
const SAID: Record<What, { verb: string; icon: typeof Inbox }> = {
  captured: { verb: 'Captured', icon: Inbox },
  resolved: { verb: 'Dealt with', icon: CheckCircle2 },
  studied: { verb: 'Studied', icon: Brain },
  done: { verb: 'Done', icon: ListTodo },
  dated: { verb: 'Planned', icon: CalendarClock }
}

type LogRow = DayEntry & { what: What }

/** Every entry of a day in time order; one with no time (an all-day task) goes first. */
function dayLog(day: Day, only?: What[]): LogRow[] {
  const all: LogRow[] = (['captured', 'resolved', 'studied', 'done', 'dated'] as What[])
    .filter((what) => !only || only.includes(what))
    .flatMap((what) => ((day[what] ?? []) as DayEntry[]).map((entry) => ({ ...entry, what })))
    // A task done that day already shows as done: not again as planned.
    .filter((row, _, rows) => row.what !== 'dated' || !rows.some((other) => other.what === 'done' && other.id === row.id))
  const time = (row: LogRow): number => (row.at && !(row.what === 'dated' && row.allDay) ? Date.parse(row.at) : -Infinity)
  return all.sort((a, b) => time(a) - time(b))
}

export function DayLog({ day, only, onOpen, title = 'The day, hour by hour', empty, className = '' }: {
  day: string
  only?: What[]
  onOpen?: (type: string, id: string) => void
  title?: string
  /** Said when the day has nothing in it; nothing at all is shown without it. */
  empty?: string
  className?: string
}): React.JSX.Element | null {
  const read = useLive(() => notes.day(day), null as Day | null, [day])
  if (!read || read.day !== day) return null
  const rows = dayLog(read, only)
  if (!rows.length && !empty) return null
  return (
    <section data-day-log aria-label={title} className={className}>
      <h3 className="mb-1 text-control font-semibold tracking-[0.01em] text-foreground">{title}</h3>
      {!rows.length ? <p className="text-body text-muted-foreground">{empty}</p> : (
        <ol className="flex flex-col">
          {rows.map((row) => {
            const kind = row.type === 'capture' ? CAPTURE_TYPES.find((type) => type.id === row.kind) : undefined
            const Icon = row.what === 'captured' && kind ? kind.icon : row.type === 'nugget' && row.what === 'studied' ? Gem : SAID[row.what].icon
            const name = row.type === 'task' ? taskName(row.title).text : row.title
            const timed = row.at && !(row.what === 'dated' && row.allDay)
            return (
              <li key={`${row.what}:${row.id}`} data-log-row={row.what} data-private={row.private ? '' : undefined}>
                <button type="button" disabled={!onOpen} onClick={() => onOpen && (chime('open'), onOpen(row.type, row.id))}
                  className="flex w-full items-baseline gap-3 rounded-md px-1 py-1 text-left enabled:hover:bg-accent/50">
                  <span className={`${TIME_COLUMN} shrink-0 text-right text-control text-muted-foreground tabular-nums`}>{timed ? clock(row.at!) : 'All day'}</span>
                  <Icon className="size-3.5 shrink-0 translate-y-0.5" style={kind && row.what === 'captured' ? { color: kind.tint } : { color: 'var(--muted-foreground)' }} />
                  <span className="min-w-0 flex-1 text-body text-foreground">
                    <span className="mr-1.5 text-control font-medium text-foreground/75">{SAID[row.what].verb}</span>
                    <span className="private-text [overflow-wrap:anywhere]">{name || 'Untitled'}</span>
                  </span>
                </button>
              </li>
            )
          })}
        </ol>
      )}
    </section>
  )
}
