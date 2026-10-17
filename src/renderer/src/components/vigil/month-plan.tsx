import { useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tip } from '@/components/vigil/ui'
import { chime } from '@/lib/sound'
import { taskName } from '@/lib/tasks'
import type { Task } from '@/lib/vigil'
import { dayjs, dayKey } from '../../../../main/dates'

/** How many task names a day shows before "and N more". */
const SHOWN = 2

/**
 * A month on Home: each day with the tasks planned for it or due by it, so
 * what is coming reads at a glance. ‹ and › step a month; a day opens its page,
 * a task its own page.
 */
export function MonthPlan({ tasks, onDay, onTask }: { tasks: Task[]; onDay: (day: string) => void; onTask: (id: string) => void }): React.JSX.Element {
  const [month, setMonth] = useState(() => dayjs().startOf('month'))
  const first = month.startOf('week')
  const weeks = Math.ceil((month.endOf('month').diff(first, 'day') + 1) / 7)
  const days = Array.from({ length: weeks * 7 }, (_, index) => first.add(index, 'day'))
  const today = dayKey()
  // A task on the day it is planned for, and on its due-by day as well when that is another.
  const on = new Map<string, Task[]>()
  for (const task of tasks) {
    if (task.status !== 'open') continue
    for (const day of new Set([task.dueAt, task.deadline].filter((one): one is string => !!one).map((one) => dayKey(one))))
      on.set(day, [...(on.get(day) ?? []), task])
  }
  const inMonth = days.filter((day) => day.month() === month.month()).reduce((sum, day) => sum + (on.get(dayKey(day))?.length ?? 0), 0)
  const step = (by: number): void => (chime('tap'), setMonth((now) => now.add(by, 'month')))
  return (
    <section data-month-plan className="flex flex-col gap-2">
      <div className="flex items-center gap-1">
        <h2 data-month-name className="min-w-0 flex-1 truncate font-heading text-heading font-semibold tracking-[-0.01em] text-foreground">{month.format('MMMM YYYY')}</h2>
        {!month.isSame(dayjs(), 'month') && <Button variant="ghost" size="sm" onClick={() => (chime('tap'), setMonth(dayjs().startOf('month')))}>This month</Button>}
        <Tip label="The month before"><Button variant="ghost" size="icon-sm" aria-label="The month before" data-month-prev onClick={() => step(-1)}><ChevronLeft /></Button></Tip>
        <Tip label="The month after"><Button variant="ghost" size="icon-sm" aria-label="The month after" data-month-next onClick={() => step(1)}><ChevronRight /></Button></Tip>
      </div>
      <div className="grid grid-cols-7 gap-px overflow-hidden rounded-xl border bg-border">
        {days.slice(0, 7).map((day) => (
          <div key={day.format('d')} className="bg-background px-2 py-1 text-control font-medium text-muted-foreground">{day.format('ddd')}</div>
        ))}
        {days.map((day) => {
          const key = dayKey(day)
          const planned = on.get(key) ?? []
          const outside = day.month() !== month.month()
          return (
            <div key={key} data-day={key} data-planned={planned.length || undefined}
              className={`flex min-h-[4.75rem] min-w-0 flex-col gap-0.5 bg-background p-1 ${outside ? 'opacity-55' : ''}`}>
              <button type="button" onClick={() => (chime('open'), onDay(key))} aria-label={`Open ${day.format('dddd D MMMM')}`}
                className={`flex size-6 items-center justify-center self-start rounded-full text-control tabular-nums transition-colors hover:bg-accent ${key === today ? 'bg-foreground font-semibold text-background hover:bg-foreground/85' : 'text-foreground'}`}>
                {day.date()}
              </button>
              {planned.slice(0, SHOWN).map((task) => (
                <button key={task.id} type="button" data-plan-task onClick={() => (chime('open'), onTask(task.id))}
                  className="truncate rounded-sm px-1 text-left text-control leading-snug text-foreground transition-colors hover:bg-accent">
                  {taskName(task.title).text}
                </button>
              ))}
              {planned.length > SHOWN && (
                <button type="button" onClick={() => (chime('open'), onDay(key))} className="rounded-sm px-1 text-left text-control text-foreground/80 hover:bg-accent">
                  and {planned.length - SHOWN} more
                </button>
              )}
            </div>
          )
        })}
      </div>
      {!inMonth && <p data-month-empty className="px-1 text-body text-foreground/85">Nothing planned in {month.format('MMMM')}. Give a task a day, like “call the dentist friday”, and it shows here.</p>}
    </section>
  )
}
