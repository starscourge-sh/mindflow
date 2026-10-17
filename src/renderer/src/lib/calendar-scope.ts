import type { Action } from '@/components/search'
import { toast } from '@/components/vigil/ui'
import { setRepeat } from '@/components/vigil/tasks-view'
import { chime } from './sound'
import { taskName } from './tasks'
import { moveToBin } from './to-bin'
import { addForDay, placeTask } from './calendar'
import { vigil, whenInLine, type Task } from './vigil'
import { commandFor, daySaid, type Command } from '../../../main/task-words'
import { lengthSaid } from '../../../main/day-load'
import { dayjs, dayKey } from '../../../main/dates'

/**
 * ⌘K with the Calendar in front: what it knows (the task picked on it, the
 * day it shows) and what it can do (go to a day, change the view, open a
 * task where it sits). The Calendar says it is here while it is the page in
 * front; ⌘K reads it as it opens.
 */
type Mode = 'day' | 'week' | 'month'
export type CalendarHere = {
  /** The task clicked or focused on the grid, or open in its side panel. */
  chosen: () => Task | null
  /** The day it shows, as YYYY-MM-DD. */
  day: () => string
  mode: () => Mode
  go: (day: string) => void
  setMode: (mode: Mode) => void
  open: (id: string) => void
  /** The task's day on the grid, picked and opened there. */
  reveal: (task: Task) => void
  side: () => boolean
  setSide: (on: boolean) => void
  /** ⌘K opening over the task's panel: the panel put away, the task still picked. */
  aside: () => void
  /** Done with it from ⌘K: its panel shut and the keys back on the grid. */
  settle: (id: string) => void
  /** Calendars it can show or hide, once it has any: each with its switch. */
  calendars?: () => { name: string; on: boolean; flip: () => void }[]
}

let here: { front: () => boolean; calendar: CalendarHere } | null = null
/** The Calendar says it is here (and how to tell it is in front), or that it went. */
export const calendarHere = (front: () => boolean, calendar: CalendarHere): (() => void) => {
  const mine = { front, calendar }
  here = mine
  return () => void (here === mine && (here = null))
}
const front = (): CalendarHere | null => (here && here.front() ? here.calendar : null)

/** "Friday 23 October", the day a Go to names. */
const dayName = (iso: string): string => dayjs(iso).format(dayjs(iso).isSame(dayjs(), 'year') ? 'dddd D MMMM' : 'dddd D MMMM YYYY')
const name = (task: Task): string => taskName(task.title).text || 'Untitled task'

/** ⌘K pressed over the Calendar's task panel: the panel steps aside, the task stays picked. */
export const calendarAside = (): void => front()?.aside()

/** A task found by search opened where it sits on the Calendar, when the Calendar is in front and it has a day. */
export function revealOnCalendar(task: Task | undefined): boolean {
  const calendar = front()
  if (!calendar || !task || !(task.dueAt || task.deadline)) return false
  calendar.reveal(task)
  return true
}

/** One thing done to the picked task, said with an Undo, which ⌘Z also reaches. */
async function apply(task: Task, said: Command, calendar: CalendarHere | null): Promise<void> {
  if (said.kind === 'open') return calendar ? calendar.open(task.id) : window.api.openInHome('task', task.id)
  calendar?.settle(task.id)
  if (said.kind === 'bin') return void moveToBin([{ type: 'task', id: task.id, status: task.status }])
  if (said.kind === 'length') return placeTask(task, { due: task.dueAt, allDay: task.allDay, estimate: said.minutes }, `Takes ${lengthSaid(said.minutes)} now`)
  if (said.kind === 'repeat') {
    if (said.rule && !task.dueAt && said.due) await vigil.saveTask(task.id, { due: said.due })
    return setRepeat(task, said.rule)
  }
  if (said.kind === 'move') {
    // Given a time for the first time, it is drawn half an hour long until it has a length.
    placeTask(task, { due: said.due, allDay: said.allDay ? 1 : 0, estimate: task.estimate ?? (said.allDay ? null : 30) }, `Moved to ${whenInLine(said.due, said.allDay)}`)
    if (calendar) calendar.go(dayKey(said.due))
    return
  }
  // A copy: its day written into the words, so it is never taken for the same task again, then everything as the first.
  const made = await vigil.addTask(`${task.title} on ${dayjs(said.due).format('D MMMM YYYY')}`)
  await vigil.saveTask(made.id, { title: task.title, due: said.due, allDay: said.allDay ? 1 : 0, estimate: task.estimate, priority: task.priority, recurrence: null })
  chime('noted')
  toast(`Copied to ${whenInLine(said.due, said.allDay)}`, () => void vigil.unmakeTask(made.id, false, [], []).then(() => chime('undo')))
  if (calendar) calendar.go(dayKey(said.due))
}

/** What a command will do, said before it is done. */
function saidAs(task: Task, said: Command): string {
  const it = `“${name(task)}”`
  if (said.kind === 'open') return `Open ${it}`
  if (said.kind === 'bin') return `Move ${it} to the Bin`
  if (said.kind === 'length') return `Make ${it} take ${lengthSaid(said.minutes)}`
  if (said.kind === 'repeat') return said.rule ? `Repeat ${it} ${said.rule}` : `Stop ${it} repeating`
  if (said.kind === 'move') return `Move ${it} to ${whenInLine(said.due, said.allDay)}`
  return `Copy ${it} to ${whenInLine(said.due, said.allDay)}`
}

/**
 * What ⌘K offers for the Calendar. Anywhere: a day typed alone goes there
 * ("fri", "3 nov", "christmas"). With the Calendar in front and a task
 * picked, ⌘K is about that task: its scope, and words that do things to it.
 * With none picked, the Calendar's own: a view, a new task at a time, the
 * side panel, its calendars.
 */
export function calendarPalette(toCalendar: (day: string) => void): { actions: Action[]; scope?: { label: string; actions: Action[] } } {
  const calendar = front()
  const goTo: Action = {
    label: 'Go to a date…', hint: 'Type a day: fri, next tuesday, 3 nov, in 2 weeks, christmas', typed: true, cue: null, run: () => {},
    heard: (typed) => {
      const said = daySaid(typed)
      return said ? { label: `Go to ${dayName(said.due)}`, hint: 'On the Calendar', own: true, cue: 'page', run: () => (calendar ? calendar.go(dayKey(said.due)) : toCalendar(dayKey(said.due))) } : null
    }
  }
  if (!calendar) return { actions: [goTo] }
  const task = calendar.chosen()
  if (task) {
    const examples: [string, string][] = [['Open', 'open'], ['Move to tomorrow', 'tomorrow'], ['An hour later', '+1h'], ['Make it 45 minutes', 'make it 45 minutes'], ['Copy to next week', 'duplicate to next week'], ['Move to the Bin', 'delete']]
    return {
      actions: [goTo],
      scope: {
        label: name(task),
        actions: [
          {
            label: 'Tell it what to do…', hint: 'friday 3pm, +1h, 45 min, every last friday, duplicate to next week, delete', typed: true, cue: null, run: () => {},
            heard: (typed) => {
              const said = commandFor(typed, task)
              return said ? { label: saidAs(task, said), own: true, cue: null, run: () => void apply(task, said, calendar) } : null
            }
          },
          ...examples.map(([label, words]): Action => ({ label, own: true, cue: null, run: () => void apply(task, commandFor(words, task)!, calendar) })),
          goTo
        ]
      }
    }
  }
  const mode = calendar.mode()
  return {
    actions: [
      goTo,
      ...(['day', 'week', 'month'] as const).filter((one) => one !== mode).map((one): Action => ({ label: `${one.charAt(0).toUpperCase()}${one.slice(1)} view`, hint: 'The Calendar', keys: one.charAt(0).toUpperCase(), own: true, run: () => calendar.setMode(one) })),
      { label: 'Go to today', hint: 'The Calendar', keys: 'T', own: true, run: () => calendar.go(dayKey()) },
      {
        label: 'New task at a time…', hint: 'Type: new 3pm call the bank', typed: true, own: true, cue: null, run: () => {},
        heard: (typed) => {
          const words = /^(?:new|add)(?: task)?:? (.+)$/i.exec(typed.trim())?.[1]
          return words ? { label: `New task: ${words}`, hint: `On ${dayName(calendar.day())} unless it names a day`, own: true, cue: null, run: () => void addForDay(words, calendar.day()).then(() => { const day = daySaid(words); if (day) calendar.go(dayKey(day.due)) }) } : null
        }
      },
      { label: calendar.side() ? 'Hide the side panel' : 'Show the side panel', hint: 'The Calendar', own: true, cue: null, run: () => calendar.setSide(!calendar.side()) },
      ...(calendar.calendars?.() ?? []).map((one): Action => ({ label: `${one.on ? 'Hide' : 'Show'} ${one.name}`, hint: 'A calendar', own: true, cue: one.on ? 'off' : 'on', run: one.flip }))
    ]
  }
}
