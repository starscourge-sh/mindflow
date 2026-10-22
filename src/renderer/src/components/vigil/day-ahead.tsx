import { useState } from 'react'
import { Plus } from 'lucide-react'
import { CalendarDays } from 'lucide-react'
import { ListTodo, Timer as CalendarClock, Bookmark as Telescope, Inbox } from '@/components/ui/icons'
import { addForDay, byDay, type Back } from '@/lib/calendar'
import { useHere } from '@/lib/split'
import { taskName } from '@/lib/tasks'
import { useLive, vigil, type Task } from '@/lib/vigil'
import { Count, Island, Tags } from './ui'
import { RowMenu, type RowItem } from './row-menu'
import { PICKED_MARK, usePickMixed } from './pick-mixed'

/**
 * A day still to come: what is planned for it, due by it, to get ready for
 * from it and coming back on it, with a line to add a task for it. Nothing
 * that only a day gone by has (looked back, the time log).
 */
export function DayAhead({ day, tasks, onOpen, menuFor }: {
  day: string
  tasks: Task[]
  onOpen?: (type: string, id: string) => void
  menuFor: (task: Task) => RowItem[]
}): React.JSX.Element {
  const back = useLive(vigil.snoozedBack, [] as Back[])
  const held = byDay(tasks, back).get(day)
  const [text, setText] = useState('')
  const here = useHere()
  type Row = { type: 'task' | 'capture'; id: string; title: string; task?: Task }
  const asTask = (task: Task): Row => ({ type: 'task', id: task.id, title: task.title, task })
  const sections: [string, typeof ListTodo, Row[]][] = [
    ['Planned', CalendarDays, (held?.planned ?? []).map(asTask)],
    ['Due by this day', CalendarClock, (held?.due ?? []).map(asTask)],
    ['Get ready from this day', CalendarClock, (held?.ready ?? []).map(asTask)],
    ['Coming back', Telescope, (held?.back ?? []).map((one): Row => ({ type: one.type, id: one.id, title: one.title }))]
  ]
  const shown = sections.flatMap(([, , rows]) => rows)
  const several = usePickMixed(shown.map(({ type, id, title }) => ({ type, id, title })), { here })
  const add = (): void => void addForDay(text, day).then((made) => made && setText(''))
  return (
    <div data-day-ahead className="mt-6 flex flex-col gap-6">
      <label className="flex items-center gap-2 rounded-lg border px-3 py-2 focus-within:border-foreground/30">
        <Plus className="size-4 shrink-0 text-foreground/70" />
        <input data-day-ahead-add value={text} onChange={(event) => setText(event.target.value)} placeholder="Add a task for this day"
          onKeyDown={(event) => event.key === 'Enter' && (event.preventDefault(), add())}
          className="min-w-0 flex-1 bg-transparent text-body text-foreground outline-none placeholder:text-foreground/60" />
      </label>
      {several.bar && <div data-pick-bar className="sticky top-0 z-20 flex min-h-11 items-center border-b bg-background py-1.5">{several.bar}</div>}
      {!shown.length && <p data-day-nothing className="text-body text-foreground/85">Nothing planned for this day yet. Add a task above, or drag one onto it in Home's calendar.</p>}
      {sections.filter(([, , rows]) => rows.length).map(([title, Icon, rows]) => (
        <Island key={title} title={<span className="flex items-center gap-2"><Icon className="size-4 text-foreground/70" /> {title} <Count n={rows.length} className="font-normal" /></span>}>
          {rows.map((row) => (
            <RowMenu key={`${title}-${row.id}`} items={several.menu(row) ?? [...(row.task ? menuFor(row.task) : []), ...several.rowItems(row)]}>
              <button type="button" data-pick={`${row.type}:${row.id}`} data-picked={several.picked(row) || undefined}
                onClick={(event) => several.click(event, row) || onOpen?.(row.type, row.id)}
                className={`flex w-full items-center gap-2 px-4 py-2 text-left text-sm hover:bg-accent/50 ${PICKED_MARK}`}>
                {row.type === 'task' ? <ListTodo className="size-4 shrink-0" /> : <Inbox className="size-4 shrink-0" />}
                <span className="flex min-w-0 flex-1 items-center gap-1.5">
                  <span className="truncate">{(row.type === 'task' ? taskName(row.title).text : row.title) || 'Untitled'}</span>
                  {row.type === 'task' && <Tags tags={taskName(row.title).tags} />}
                </span>
              </button>
            </RowMenu>
          ))}
        </Island>
      ))}
    </div>
  )
}
