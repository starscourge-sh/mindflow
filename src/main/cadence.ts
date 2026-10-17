/**
 * One cadence per thing, so nothing is asked about twice: a habit you keep
 * every day (a routine repeating daily or on weekdays) is looked at in the
 * weekly review; everything slower, and every goal, in the monthly one.
 * Shared by the windows and the tests (test/cadence.test.ts).
 */

/** Whether a routine's rule ("every day", "every weekday", "every mon, tue, wed, thu, fri") is kept daily. */
export function isDaily(rule: string | null | undefined): boolean {
  const said = (rule ?? '').trim().toLowerCase()
  if (!said) return false
  if (/^every\s+(?:1\s+)?(?:day|weekday)s?$/.test(said)) return true
  // Named days: most of the week is a daily habit.
  const days = new Set([...said.matchAll(/\b(mon|tue|wed|thu|fri|sat|sun)/g)].map((match) => match[1]))
  return days.size >= 5
}

/** Which review a habit or goal belongs to: the week's for a daily habit, the month's for the rest. */
export const reviewOf = (thing: { recurrence?: string | null }): 'week' | 'month' => (isDaily(thing.recurrence) ? 'week' : 'month')

/** How far past the cap the active habits and goals are; 0 when within it. A cap of 0 or less is no cap. */
export const overCap = (active: number, cap: number | null | undefined): number => (cap && cap > 0 ? Math.max(0, active - cap) : 0)
