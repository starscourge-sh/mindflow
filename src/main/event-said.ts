import { clock } from './dates'

/** "In 10 minutes", "In 1 hour", "Tomorrow at 13:00", "Now": how a reminder says when. */
export function remindSaid(minutes: number, start: string, allDay = false): string {
  if (minutes <= 0) return allDay ? 'Today' : `Now, ${clock(start)}`
  if (minutes >= 1440 && minutes % 1440 === 0) return minutes === 1440 ? (allDay ? 'Tomorrow' : `Tomorrow at ${clock(start)}`) : `In ${minutes / 1440} days`
  if (minutes >= 60 && minutes % 60 === 0) return `In ${minutes / 60} ${minutes === 60 ? 'hour' : 'hours'}`
  return `In ${minutes} minutes`
}

