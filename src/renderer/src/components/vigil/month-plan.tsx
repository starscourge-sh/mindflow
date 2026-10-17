import { useState } from 'react'
import { Switch } from '@/components/ui/switch'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tip } from '@/components/vigil/ui'
import { chime } from '@/lib/sound'
import { taskName } from '@/lib/tasks'
import { useLive, vigil, type Settings, type Stats, type Task } from '@/lib/vigil'
import { dayjs, dayKey } from '../../../../main/dates'

/** How many task names a day shows before "and N more". */
const SHOWN = 2

/** How strong a day's mark is: 1 for one open, 2 for two or three, 3 for four or more. */
const level = (n: number): 1 | 2 | 3 => (n >= 4 ? 3 : n >= 2 ? 2 : 1)
/** The one green, at three strengths: light for a single open, full for a busy day. */
const SHADE = { 1: 'opacity-60', 2: 'opacity-80', 3: 'opacity-100' } as const

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
  // The days you opened Vigil, marked beside the date when the switch is on.
  const settings = useLive(vigil.settings, null as Settings | null)
  const stats = useLive(vigil.stats, null as Stats | null)
  const [shown, setShown] = useState<boolean | null>(null)
  const marking = shown ?? settings?.monthOpened === true
  const toggle = (on: boolean): void => (chime('tap'), setShown(on), void vigil.setSettings({ monthOpened: on }))
  const opens = new Map((stats?.opens ?? []).map((one) => [one.day, one.n]))
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
        <label className="mr-2 flex cursor-pointer items-center gap-2 text-control text-foreground">
          <Switch data-month-opened-switch checked={marking} onCheckedChange={toggle} aria-label="Show the days I opened Vigil" />
          <span>Show the days I opened Vigil</span>
        </label>
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
          const count = marking ? (opens.get(key) ?? 0) : 0
          return (
            <div key={key} data-day={key} data-planned={planned.length || undefined} data-opened={count ? level(count) : undefined}
              className={`flex min-h-[4.75rem] min-w-0 flex-col gap-0.5 bg-background p-1 ${outside ? 'opacity-55' : ''}`}>
              <div className="flex items-center gap-1.5">
              <button type="button" onClick={() => (chime('open'), onDay(key))} aria-label={`Open ${day.format('dddd D MMMM')}${count ? `. Opened Vigil${count > 1 ? ` ${count} times` : ''}` : ''}`}
                className={`flex size-6 shrink-0 items-center justify-center rounded-full text-control tabular-nums transition-colors hover:bg-accent ${key === today ? 'bg-foreground font-semibold text-background hover:bg-foreground/85' : 'text-foreground'}`}>
                {day.date()}
              </button>
              {count > 0 && <span aria-hidden data-opened-mark className={`h-1.5 w-3 rounded-full bg-[var(--tt-color-text-green,#3c8a5c)] ${SHADE[level(count)]}`} />}
              </div>
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
