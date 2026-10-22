import { useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { chime } from '@/lib/sound'
import type { Task } from '@/lib/haligtree'
import type { MacEvent } from '@/lib/mac-calendar'
import { Tags, Tip } from './ui'
import { Struck, Tick } from './marks'
import { taskName } from '@/lib/tasks'
import { RowMenu } from './row-menu'
import { taskMenu, useTaskNow } from './tasks-view'
import { byTime, lengthSaid } from '../../../../main/day-load'
import { TIME_COLUMN, clock } from '@/lib/clock'
import { Check } from '@/components/ui/icons'
import { SessionRow } from './session-span'
import type { SpanSession } from '@/lib/haligtree'
import { num } from '../../../../main/dates'

const RED = 'var(--tt-color-text-red)'

/**
 * Today by the hour: the day's calendar events and its tasks with a time in
 * one line, in order, with a line where now is. An event has its calendar's
 * colour and is read only; a task has its round tick. Tasks with no time stay
 * in the to-dos below.
 */
export function DayTimeline({ events, tasks, sessions = [], now, done, pen, onTick }: {
  events: MacEvent[]
  /** Today's focus sessions, running or done: blocks in the line at the time they began. */
  sessions?: SpanSession[]
  /** Today's tasks with a time, open or ticked today. */
  tasks: Task[]
  now: Date
  done: (task: Task) => boolean
  pen: (task: Task) => boolean
  onTick: (task: Task) => void
}): React.JSX.Element {
  const taskNow = useTaskNow()
  const [everything, setEverything] = useState(false)
  const kept = everything ? events : fewEvents(events, now.getTime())
  const hidden = events.length - kept.length
  const timed = byTime(kept, tasks.map((task) => ({ at: task.dueAt!, task })))
  type One = (typeof timed)[number] | { kind: 'session'; one: SpanSession }
  const startOf = (one: One): number => (one.kind === 'event' ? (one.one.allDay ? -Infinity : Date.parse(one.one.start)) : one.kind === 'session' ? Date.parse(one.one.startedAt) : Date.parse(one.one.at))
  // Each session at the time it began, after whatever starts at the same minute (the sort keeps ties in order).
  const line: One[] = [...timed, ...sessions.map((one) => ({ kind: 'session' as const, one }))].sort((a, b) => startOf(a) - startOf(b))
  // The now line goes before the first thing still to start.
  const next = line.findIndex((one) => startOf(one) > now.getTime())
  const nowAt = next < 0 ? line.length : next
  const nowLine = (
    <li key="now" data-now-line aria-label={`Now, ${clock(now)}`} className="flex items-center gap-3 py-0.5">
      <span className={`${TIME_COLUMN} shrink-0 text-right text-xs font-semibold tabular-nums`} style={{ color: RED }}>Now</span>
      <span aria-hidden className="relative flex h-px flex-1 items-center" style={{ background: RED }}>
        <span className="absolute -left-1 size-2 rounded-full" style={{ background: RED }} />
      </span>
    </li>
  )
  return (
    <section data-day-timeline data-brief-calendar aria-label="Today by the hour" className="mt-5">
      <p className="mb-1.5 text-sm font-semibold text-foreground">Today by the hour</p>
      <ul className="flex flex-col">
        {line.map((one, at) => {
          const row = one.kind === 'session' ? <SessionRow key={`s:${one.one.id}`} one={one.one} now={now.getTime()} /> : one.kind === 'event' ? <EventRow key={`e:${one.one.start}:${one.one.title}:${at}`} event={one.one} past={!one.one.allDay && Date.parse(one.one.end) <= now.getTime()} /> : (() => {
            const task = one.one.task
            const ticked = done(task)
            const name = taskName(task.title)
            return (
              <RowMenu key={`t:${task.id}`} items={taskMenu(task, { open: () => (chime('open'), window.api.openInHome('task', task.id)), complete: () => onTick(task), now: taskNow })}>
                <li data-line-task={task.id} className="flex items-start gap-3 py-1.5">
                  <span className={`${TIME_COLUMN} shrink-0 pt-px text-right text-sm text-muted-foreground tabular-nums`}>{clock(task.dueAt!)}</span>
                  <Tip label={ticked ? 'Not done after all' : 'Done'}>
                    <button type="button" data-task-tick role="checkbox" aria-checked={ticked} aria-label={task.title} onClick={() => onTick(task)}
                      className="mt-[0.1875rem] grid size-[1.125rem] shrink-0 place-items-center rounded-full border-[1.5px] transition-[background-color,border-color,scale] duration-150 ease-out outline-none active:scale-90 focus-visible:ring-2 focus-visible:ring-ring/40"
                      style={{ borderColor: ticked ? 'var(--tt-color-text-green)' : 'color-mix(in oklab, var(--muted-foreground) 70%, transparent)', background: ticked ? 'var(--tt-color-text-green)' : undefined }}>
                      <Check className={`mf-unmarked size-2.5 text-white transition-[opacity,scale] duration-150 ease-out ${ticked ? 'scale-100 opacity-100' : 'scale-50 opacity-0'}`} strokeWidth={3} />
                      {ticked && <Tick seed={task.id} draw={pen(task)} className="size-3 text-white" />}
                    </button>
                  </Tip>
                  <button type="button" onClick={() => (chime('open'), window.api.openInHome('task', task.id))} className="group/row min-w-0 flex-1 text-left">
                    <span className="flex min-w-0 items-center gap-2">
                      <span data-task-title className={`block min-w-0 truncate text-[0.9375rem] font-semibold underline-offset-4 ${ticked ? 'mf-hand-struck text-muted-foreground line-through decoration-foreground/40' : 'text-foreground group-hover/row:underline group-hover/row:decoration-foreground/30'}`}>
                        {ticked ? <Struck seed={task.id} draw={pen(task)}>{name.text}</Struck> : name.text}
                      </span>
                      <Tags tags={name.tags} />
                    </span>
                    <span className="mt-0.5 block truncate text-sm text-muted-foreground">{ticked ? 'Done' : task.estimate ? `A task, about ${lengthSaid(task.estimate)}` : 'A task'}</span>
                  </button>
                </li>
              </RowMenu>
            )
          })()
          return at === nowAt ? [nowLine, row] : row
        })}
        {nowAt === line.length && nowLine}
      </ul>
      {/* A crowded day keeps to the next dozen events, and says how many more there are. */}
      {(hidden > 0 || everything) && events.length > EVENTS_SHOWN && (
        <button type="button" data-more-events onClick={() => (chime(everything ? 'fold' : 'open'), setEverything(!everything))}
          className="mt-0.5 flex w-full items-center gap-3 py-1.5 text-left text-sm font-medium text-muted-foreground hover:text-foreground">
          <span aria-hidden className={`${TIME_COLUMN} shrink-0`} />
          {everything ? 'Show fewer events' : `And ${num(hidden)} more ${hidden === 1 ? 'event' : 'events'}`}
          {everything ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
        </button>
      )}
    </section>
  )
}

const EVENTS_SHOWN = 12
/**
 * The dozen events worth showing on a crowded day: all-day ones, then those
 * not over yet in time order; any room left goes to the latest ones gone by.
 */
export function fewEvents(events: MacEvent[], now: number, room = EVENTS_SHOWN): MacEvent[] {
  if (events.length <= room) return events
  const timed = events.filter((one) => !one.allDay).sort((a, b) => Date.parse(a.start) - Date.parse(b.start))
  const allDay = events.filter((one) => one.allDay).slice(0, room)
  const ahead = timed.filter((one) => Date.parse(one.end) > now).slice(0, room - allDay.length)
  const past = timed.filter((one) => Date.parse(one.end) <= now)
  const spare = room - allDay.length - ahead.length
  return [...allDay, ...(spare > 0 ? past.slice(-spare) : []), ...ahead]
}

/** A calendar event in the line: its calendar's colour down the side, read only; gone by, it steps back. */
function EventRow({ event, past }: { event: MacEvent; past: boolean }): React.JSX.Element {
  const color = event.color ?? 'var(--tt-color-text-blue)'
  return (
    <Tip label={`${event.title}. From your Mac's calendar${event.calendar ? `, ${event.calendar}` : ''}: change it there`}>
      <li data-line-event data-mac-event className={`flex items-start gap-3 py-1.5 transition-opacity ${past ? 'opacity-60' : ''}`}>
        <span className={`${TIME_COLUMN} shrink-0 pt-px text-right text-sm text-muted-foreground tabular-nums`}>{event.allDay ? 'All day' : clock(event.start)}</span>
        <span aria-hidden className="mt-[0.1875rem] flex size-[1.125rem] shrink-0 justify-center">
          <span className="h-full w-[4px] rounded-full" style={{ background: color }} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="line-clamp-2 text-[0.9375rem] font-medium text-foreground [overflow-wrap:anywhere]">{event.title}</span>
          <span className="mt-0.5 block truncate text-sm text-muted-foreground">
            {[event.allDay ? 'All day' : `${clock(event.start)} to ${clock(event.end)}`, event.calendar || 'Calendar'].join(' · ')}
          </span>
        </span>
      </li>
    </Tip>
  )
}
