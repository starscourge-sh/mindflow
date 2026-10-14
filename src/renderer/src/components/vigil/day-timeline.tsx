import { alive } from '@/components/ui/alive-icon'
import SimpleCheckedIcon from '@/components/ui/simple-checked-icon'
import { chime } from '@/lib/sound'
import type { Task } from '@/lib/vigil'
import type { MacEvent } from '@/lib/mac-calendar'
import { Tags, Tip } from './ui'
import { Struck, Tick } from './marks'
import { taskName } from '@/lib/tasks'
import { RowMenu } from './row-menu'
import { taskMenu, useTaskNow } from './tasks-view'
import { byTime, lengthSaid } from '../../../../main/day-load'
import { clock } from '../../../../main/dates'

const Check = alive(SimpleCheckedIcon)
const RED = 'var(--tt-color-text-red)'

/**
 * Today by the hour: the day's calendar events and its tasks with a time in
 * one line, in order, with a line where now is. An event has its calendar's
 * colour and is read only; a task has its round tick. Tasks with no time stay
 * in the to-dos below.
 */
export function DayTimeline({ events, tasks, now, done, pen, onTick }: {
  events: MacEvent[]
  /** Today's tasks with a time, open or ticked today. */
  tasks: Task[]
  now: Date
  done: (task: Task) => boolean
  pen: (task: Task) => boolean
  onTick: (task: Task) => void
}): React.JSX.Element {
  const taskNow = useTaskNow()
  const line = byTime(events, tasks.map((task) => ({ at: task.dueAt!, task })))
  const startOf = (one: (typeof line)[number]): number => (one.kind === 'event' ? (one.one.allDay ? -Infinity : Date.parse(one.one.start)) : Date.parse(one.one.at))
  // The now line goes before the first thing still to start.
  const next = line.findIndex((one) => startOf(one) > now.getTime())
  const nowAt = next < 0 ? line.length : next
  const nowLine = (
    <li key="now" data-now-line aria-label={`Now, ${clock(now)}`} className="flex items-center gap-3 py-0.5">
      <span className="w-11 shrink-0 text-right text-xs font-semibold tabular-nums" style={{ color: RED }}>Now</span>
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
          const row = one.kind === 'event' ? <EventRow key={`e:${one.one.start}:${one.one.title}:${at}`} event={one.one} past={!one.one.allDay && Date.parse(one.one.end) <= now.getTime()} /> : (() => {
            const task = one.one.task
            const ticked = done(task)
            const name = taskName(task.title)
            return (
              <RowMenu key={`t:${task.id}`} items={taskMenu(task, { open: () => (chime('open'), window.api.openInHome('task', task.id)), complete: () => onTick(task), now: taskNow })}>
                <li data-line-task={task.id} className="flex items-start gap-3 py-1.5">
                  <span className="w-11 shrink-0 pt-px text-right text-sm text-muted-foreground tabular-nums">{clock(task.dueAt!)}</span>
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
    </section>
  )
}

/** A calendar event in the line: its calendar's colour down the side, read only; gone by, it steps back. */
function EventRow({ event, past }: { event: MacEvent; past: boolean }): React.JSX.Element {
  const color = event.color ?? 'var(--tt-color-text-blue)'
  return (
    <Tip label={`From your Mac's calendar${event.calendar ? `, ${event.calendar}` : ''}: change it there`}>
      <li data-line-event data-mac-event className={`flex items-start gap-3 py-1.5 transition-opacity ${past ? 'opacity-60' : ''}`}>
        <span className="w-11 shrink-0 pt-px text-right text-sm text-muted-foreground tabular-nums">{event.allDay ? 'All day' : clock(event.start)}</span>
        <span aria-hidden className="mt-[0.1875rem] flex size-[1.125rem] shrink-0 justify-center">
          <span className="h-full w-[4px] rounded-full" style={{ background: color }} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[0.9375rem] font-medium text-foreground">{event.title}</span>
          <span className="mt-0.5 block truncate text-sm text-muted-foreground">
            {[event.allDay ? 'All day' : `${clock(event.start)} to ${clock(event.end)}`, event.calendar || 'Calendar'].join(' · ')}
          </span>
        </span>
      </li>
    </Tip>
  )
}
