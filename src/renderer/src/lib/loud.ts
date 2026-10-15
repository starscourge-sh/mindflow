import { startOfDay } from '../../../main/dates'

/**
 * What is important enough to read at a glance, never small and grey: a day
 * that has passed, today's, a deadline, a warning. Each is drawn by `.mf-loud`
 * (main.css): the size of a control, medium weight, and its colour pulled
 * toward the ink until it reads at 4.5:1 on every theme.
 */
export type Loud = 'late' | 'today' | 'deadline' | 'warn' | 'soon'

/** Late, today, or nothing to say, for a date. */
export const loudOf = (iso: string | null | undefined): 'late' | 'today' | undefined => {
  if (!iso) return undefined
  const at = new Date(iso).getTime()
  return at < startOfDay() ? 'late' : at < startOfDay(1) ? 'today' : undefined
}

/** A deadline is always worth reading; a passed one says so in red. */
export const deadlineLoud = (iso: string | null | undefined): 'late' | 'deadline' | undefined => (!iso ? undefined : loudOf(iso) === 'late' ? 'late' : 'deadline')

/** A goal's days left: red in the last week, the accent in the last month, quiet before. */
export const leftLoud = (left: number): 'late' | 'soon' | undefined => (left <= 7 ? 'late' : left <= 30 ? 'soon' : undefined)

/** The class and mark for an important bit of text, or nothing for a quiet one. */
export const loud = (kind: Loud | undefined, className = ''): { className: string; 'data-important'?: Loud } =>
  kind ? { className: `mf-loud ${/font-(semibold|bold)/.test(className) ? '' : 'font-medium'} ${className}`.replace(/\s+/g, ' ').trim(), 'data-important': kind } : { className }
