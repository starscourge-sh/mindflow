import { vigil, type Settings, type Task } from './vigil'
import { chime } from './sound'
import { toast } from '@/components/vigil/ui'
import { dayKey } from '../../../main/dates'

/**
 * The day as a budget: how long today's tasks are planned to take (each one's
 * "~30m"), and how long is left before the day ends (Settings, Day ends at).
 * And the frog: tomorrow's first task, picked when the day was closed, which
 * leads Today and the day brief on its day.
 */

/** "45 min", "3 h", "2 h 30 min": a length said plainly. */
export function hoursSaid(minutes: number): string {
  const m = Math.max(0, Math.round(minutes))
  const [h, rest] = [Math.floor(m / 60), m % 60]
  if (!h) return `${rest} min`
  return rest ? `${h} h ${rest} min` : `${h} h`
}

/** Minutes from now until the day ends, "22:00" by default; none once it has. Rounded to five. */
export function minutesLeft(dayEnd = '22:00', now = new Date()): number {
  const [h, m] = (/^(\d{1,2}):(\d{2})$/.exec(dayEnd) ?? [, '22', '00']).slice(1).map(Number)
  const end = new Date(now)
  end.setHours(h, m, 0, 0)
  return Math.max(0, Math.round((end.getTime() - now.getTime()) / 300_000) * 5)
}

/** The lengths of these tasks added up, in minutes: those with none count nothing. */
export const plannedMinutes = (tasks: Pick<Task, 'estimate'>[]): number => tasks.reduce((sum, task) => sum + (task.estimate ?? 0), 0)

/** "3 h planned, 4 h left today": Today's header line. */
export function budgetSaid(planned: number, left: number): string {
  const rest = left ? `${hoursSaid(left)} left today` : 'the day is over'
  return planned ? `${hoursSaid(planned)} planned, ${rest}` : `${rest[0].toUpperCase()}${rest.slice(1)}`
}

/** The frog for a day: the task picked to lead it, if one was. */
export const frogOn = (settings: Pick<Settings, 'frog'> | null | undefined, day = dayKey()): string | null =>
  settings?.frog && settings.frog.day === day ? settings.frog.id : null

/** The frog first, the rest as they were. */
export const frogFirst = <T extends { id: string }>(list: T[], frog: string | null): T[] =>
  frog && list.some((one) => one.id === frog) ? [list.find((one) => one.id === frog)!, ...list.filter((one) => one.id !== frog)] : list

/** Eat the frog: this task leads Today (and the day brief) for the rest of today, or no task does. */
export async function markFrog(id: string | null, was: string | null): Promise<void> {
  await vigil.setSettings({ frog: id ? { id, day: dayKey() } : null })
  chime(id ? 'pin' : 'unpin')
  toast(id ? 'The frog: it leads Today' : 'No frog today', () => void vigil.setSettings({ frog: was ? { id: was, day: dayKey() } : null }))
}
