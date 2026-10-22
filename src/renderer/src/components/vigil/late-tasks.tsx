import { useEffect, useState } from 'react'
import { chime } from '@/lib/sound'
import { vigil, type Task, type TaskWas } from '@/lib/vigil'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import type { RowItem } from './row-menu'
import { DatePicker } from './date-picker'
import { ask, toast } from './ui'
import { BUCKETS, planKey, taskName } from '@/lib/tasks'
import { PRIORITY_NAMES } from '../../../../main/task-words'
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

/** `noun`: how the notice names them, one and many. */
export async function rescheduleAll(list: Task[], where: Where, noun: [string, string] = ['the late task', 'late tasks']): Promise<void> {
  if (!list.length) return chime('nope')
  const was = list.map((task) => ({ id: task.id, due: task.dueAt, plan: task.planFor }))
  const before = await Promise.all(list.map((task, nth) => {
    const time = dayjs(task.dueAt)
    const day = dayFor(where, nth)
    // One with no day yet (only a deadline, say) has no time to keep: it lands in the morning, as an all-day one does.
    const due = (task.allDay || !task.dueAt ? day.hour(9).minute(0) : day.hour(time.hour()).minute(time.minute())).startOf('minute').toISOString()
    return vigil.saveTask(task.id, { due }) as Promise<TaskWas | true>
  }))
  chime('move')
  const said = typeof where === 'object' ? dayjs(where.day).format('dddd D MMMM') : SAID[where]
  toast(`Moved ${list.length === 1 ? noun[0] : `${num(list.length)} ${noun[1]}`} to ${said}`, () =>
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
          <Button variant="ghost" size="sm" data-late-all aria-label={`${num(late.length)} late: reschedule all`} className="gap-1.5 font-semibold text-[var(--tt-color-text-orange)] hover:text-[var(--tt-color-text-orange)]">
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

/** "Pick a date…" for several picked tasks: the calendar opens where the menu was. */
const PICK_MANY = 'vigil:pick-days'
let lastMenuAt = { x: 0, y: 0 }
addEventListener('contextmenu', (event) => void (lastMenuAt = { x: event.clientX, y: event.clientY }), true)

/** The open ones among these tasks, read fresh, so each undo puts back what it was just now. */
const openOnes = async (ids: string[]): Promise<Task[]> =>
  (await Promise.all(ids.map((id) => vigil.task(id)))).filter((task) => !!task && task.status === 'open') as Task[]

/** Each one changed, one sound and one notice for the lot, and an Undo (⌘Z) that puts each back as it was. */
async function together<T>(ids: string[], work: (task: Task) => Promise<T>, undo: (task: Task, was: T) => unknown, said: (n: number) => string, cue: Parameters<typeof chime>[0]): Promise<void> {
  const tasks = await openOnes(ids)
  if (!tasks.length) return chime('nope')
  const was = await Promise.all(tasks.map(work))
  chime(cue)
  toast(said(tasks.length), () => void Promise.all(tasks.map((task, at) => undo(task, was[at]))).then(() => chime('undo')))
}
const putBack = (task: Task, before: TaskWas | true): Promise<unknown> =>
  vigil.saveTask(task.id, { ...(task.dueAt ? { due: task.dueAt } : { due: null, plan: task.planFor }), ...(before === true ? {} : before) })

/**
 * What a task's own menu does with its day, priority and tags, for several
 * picked at once: Reschedule, Clear the date, Priority, Add a tag, Later. Each
 * acts on every open one with one notice and one ⌘Z. `mixed`: notes are
 * picked too, so each line says it is for the tasks only. `after` lets the
 * picked ones go.
 */
export function manyTaskItems(ids: string[], { mixed = false, after = () => undefined }: { mixed?: boolean; after?: () => void } = {}): RowItem[] {
  if (!ids.length) return []
  const n = `${num(ids.length)} ${ids.length === 1 ? 'task' : 'tasks'}`
  const go = (run: () => Promise<unknown>) => () => void run().then(after)
  const to = (where: Where) => go(async () => rescheduleAll(await openOnes(ids), where, ['the task', 'tasks']))
  return [
    { label: mixed ? `Reschedule ${n}…` : 'Reschedule', items: [
      { label: 'Today', run: to('today') },
      { label: 'Tomorrow', run: to('tomorrow') },
      { label: 'Next week', run: to('week') },
      { label: 'Pick a date…', run: () => (after(), window.dispatchEvent(new CustomEvent(PICK_MANY, { detail: { ids, ...lastMenuAt } }))) }
    ] },
    { label: mixed ? `Clear the date of ${n}` : 'Clear the date', run: go(() => together(ids, (task) => vigil.saveTask(task.id, { due: null }), putBack, (k) => `Cleared the date of ${k === 1 ? 'the task' : `${num(k)} tasks`}`, 'off')) },
    { label: mixed ? `Priority for ${n}` : 'Priority', items: [1, 2, 3, 4, 0].map((level) => ({ label: PRIORITY_NAMES[level], run: go(() => together(ids, (task) => vigil.saveTask(task.id, { priority: level }).then(() => task.priority), (task, was) => vigil.saveTask(task.id, { priority: was }), (k) => `${PRIORITY_NAMES[level]}: ${k === 1 ? 'the task' : `${num(k)} tasks`}`, level ? 'on' : 'off')) })) },
    { label: mixed ? `Add a tag to ${n}…` : 'Add a tag…', run: go(async () => {
      const tag = (await ask(`Tag ${ids.length === 1 ? 'it' : `these ${num(ids.length)}`} with`, 'thesis', 'tag'))?.trim().replace(/^#/, '')
      if (!tag) return
      await together(ids, async (task) => (taskName(task.title).tags.includes(tag) ? null : (await vigil.saveTask(task.id, { title: `${task.title.trimEnd()} #${tag}` }), task.title)),
        (task, was) => was !== null && vigil.saveTask(task.id, { title: was }), (k) => `Tagged ${k === 1 ? 'the task' : `${num(k)} tasks`} with #${tag}`, 'tag')
    }) },
    { label: mixed ? `Move ${n} to Later` : 'Later', items: (Object.keys(BUCKETS) as (keyof typeof BUCKETS)[]).map((which) => ({ label: BUCKETS[which], run: go(() => together(ids, (task) => vigil.saveTask(task.id, { plan: planKey(which) }), putBack, (k) => `Moved ${k === 1 ? 'the task' : `${num(k)} tasks`} to ${BUCKETS[which]}`, 'later')) })) }
  ]
}

/** Where "Pick a date…" for several lands: the calendar, at the spot the right click was. Drawn once in each window. */
export function PickDays(): React.JSX.Element | null {
  const [asked, setAsked] = useState<{ n: number; ids: string[]; x: number; y: number } | null>(null)
  useEffect(() => {
    const onAsk = (event: Event): void => {
      const { ids, x, y } = (event as CustomEvent<{ ids: string[]; x: number; y: number }>).detail
      setAsked((was) => ({ n: (was?.n ?? 0) + 1, ids, x, y }))
    }
    window.addEventListener(PICK_MANY, onAsk)
    return () => window.removeEventListener(PICK_MANY, onAsk)
  }, [])
  if (!asked) return null
  return (
    <span className="fixed z-50" style={{ left: asked.x, top: asked.y }}>
      <DatePicker key={asked.n} chip startOpen value={null} tip="Reschedule them to"
        onChange={(iso) => {
          setAsked(null)
          if (iso) void openOnes(asked.ids).then((tasks) => rescheduleAll(tasks, { day: dayKey(iso) }, ['the task', 'tasks']))
        }}>
        <span aria-hidden className="block size-0" />
      </DatePicker>
    </span>
  )
}
