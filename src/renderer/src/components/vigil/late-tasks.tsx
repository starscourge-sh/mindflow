import { useEffect, useState } from 'react'
import { chime } from '@/lib/sound'
import { vigil, type Task, type TaskWas } from '@/lib/vigil'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import type { RowItem } from './row-menu'
import { DatePicker } from './date-picker'
import { toast } from './ui'
import { dayjs, dayKey, num } from '../../../../main/dates'

/**
 * Late tasks, all moved at once: the "N late" on the Calendar and Today, and
 * a late day's right click. Today, Tomorrow, Next week, a day picked, or
 * spread over the next three days, each keeping the time it had. One Undo
 * (and ⌘Z) puts every one back where it was.
 */

/** Open tasks planned for a day gone by. */
export const lateOnes = (tasks: Task[], today = dayKey()): Task[] =>
  tasks.filter((task) => task.status === 'open' && !!task.dueAt && dayKey(task.dueAt) < today)

export type Where = 'today' | 'tomorrow' | 'week' | 'spread' | { day: string }
const SAID: Record<Exclude<Where, { day: string }>, string> = { today: 'today', tomorrow: 'tomorrow', week: 'next week', spread: 'the next 3 days' }

/** The day one of them lands on: the nth of the list, for a spread. */
const dayFor = (where: Where, nth: number): dayjs.Dayjs =>
  typeof where === 'object' ? dayjs(where.day) : dayjs().startOf('day').add(where === 'today' ? 0 : where === 'tomorrow' ? 1 : where === 'week' ? 7 : nth % 3, 'day')

export async function rescheduleAll(list: Task[], where: Where): Promise<void> {
  if (!list.length) return chime('nope')
  const was = list.map((task) => ({ id: task.id, due: task.dueAt, plan: task.planFor }))
  const before = await Promise.all(list.map((task, nth) => {
    const time = dayjs(task.dueAt)
    const day = dayFor(where, nth)
    const due = (task.allDay ? day.hour(9).minute(0) : day.hour(time.hour()).minute(time.minute())).startOf('minute').toISOString()
    return vigil.saveTask(task.id, { due }) as Promise<TaskWas | true>
  }))
  chime('move')
  const said = typeof where === 'object' ? dayjs(where.day).format('dddd D MMMM') : SAID[where]
  toast(`Moved ${list.length === 1 ? 'the late task' : `${num(list.length)} late tasks`} to ${said}`, () =>
    void Promise.all(was.map((one, at) => vigil.saveTask(one.id, { due: one.due, plan: one.plan, ...(before[at] === true ? {} : before[at]) }))).then(() => chime('undo')))
}

/** "Pick a date…" asked from a right click: the "N late" button opens its calendar. */
const PICK = 'vigil:late-pick'

/** The same moves as lines of a right-click menu, for a day that holds late ones. */
export function lateItems(list: Task[], all: Task[]): RowItem[] {
  if (!list.length) return []
  const moves = (of: Task[]): RowItem[] => [
    { label: 'Today', run: () => void rescheduleAll(of, 'today') },
    { label: 'Tomorrow', run: () => void rescheduleAll(of, 'tomorrow') },
    { label: 'Next week', run: () => void rescheduleAll(of, 'week') },
    { label: 'Pick a date…', run: () => void window.dispatchEvent(new CustomEvent(PICK, { detail: of.map((task) => task.id) })) },
    { label: 'Spread over the next 3 days', run: () => void rescheduleAll(of, 'spread') }
  ]
  return [
    ...(list.length < all.length ? [{ label: `Reschedule this day's ${num(list.length)} late`, items: moves(list) }] : []),
    { label: `Reschedule all late (${num(all.length)})`, items: moves(all) }
  ]
}

/**
 * "N late · Reschedule all…": said in orange where late tasks are, at a size
 * that is read, with the moves one click away. Nothing when none are late.
 */
export function LateMenu({ tasks, className = '' }: { tasks: Task[]; className?: string }): React.JSX.Element | null {
  const late = lateOnes(tasks)
  // The calendar for "Pick a date…", opened afresh each time it is asked for; and which ones it moves.
  const [picking, setPicking] = useState<{ n: number; ids: string[] | null } | null>(null)
  useEffect(() => {
    const ask = (event: Event): void => setPicking((was) => ({ n: (was?.n ?? 0) + 1, ids: (event as CustomEvent<string[]>).detail }))
    window.addEventListener(PICK, ask)
    return () => window.removeEventListener(PICK, ask)
  }, [])
  if (!late.length && !picking) return null
  const pick = (): void => setPicking((was) => ({ n: (was?.n ?? 0) + 1, ids: null }))
  return (
    <span data-late className={`relative inline-flex items-center ${className}`}>
      <DropdownMenu modal={false} onOpenChange={(open) => open && chime('open')}>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" data-late-all aria-label={`${late.length} late: reschedule all`} className="gap-1.5 font-semibold text-[var(--tt-color-text-orange)] hover:text-[var(--tt-color-text-orange)]">
            <span className="tabular-nums">{num(late.length)} late</span>
            <span aria-hidden className="font-normal text-foreground/60">·</span>
            <span className="font-medium text-foreground">Reschedule all…</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="text-control">
          <DropdownMenuItem data-late-to="today" onSelect={() => void rescheduleAll(late, 'today')}>Today</DropdownMenuItem>
          <DropdownMenuItem data-late-to="tomorrow" onSelect={() => void rescheduleAll(late, 'tomorrow')}>Tomorrow</DropdownMenuItem>
          <DropdownMenuItem data-late-to="week" onSelect={() => void rescheduleAll(late, 'week')}>Next week</DropdownMenuItem>
          <DropdownMenuItem data-late-to="pick" onSelect={pick}>Pick a date…</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem data-late-to="spread" onSelect={() => void rescheduleAll(late, 'spread')}>Spread over the next 3 days</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {picking && (
        <DatePicker key={picking.n} chip startOpen value={null} tip="Reschedule them to"
          onChange={(iso) => {
            const ids = picking.ids
            setPicking(null)
            if (iso) void rescheduleAll(ids ? late.filter((task) => ids.includes(task.id)) : late, { day: dayKey(iso) })
          }}>
          <span aria-hidden className="absolute right-0 bottom-0 block size-0" />
        </DatePicker>
      )}
    </span>
  )
}
