import { chime } from './sound'
import { toast } from '@/components/vigil/ui'
import { useLive } from './vigil'
import { dayKey, dayMonth, num } from '../../../main/dates'
import { daysBetween } from '../../../main/goal-days'
import type { Milestone } from '../../../main/milestones'
export type { Milestone }

/**
 * Marked days, as the windows see them: any day given a purpose ("Exam",
 * "Launch", "Mum's birthday"), with an emoji and a colour if you like, and a
 * tag's exam date as one of its own. The table is src/main/milestones.ts.
 */

const call = <T>(channel: string, ...args: unknown[]): Promise<T> => window.api.vigil(channel, ...args) as Promise<T>

export const marks = {
  list: (from?: string | null, to?: string | null) => call<Milestone[]>('milestones', from ?? null, to ?? null),
  /** Made or changed; gives back its id and what it was, for an undo. */
  set: (patch: Partial<Milestone> & { day: string; title: string }) => call<{ id: string; was: Milestone | null } | null>('milestone:set', patch),
  drop: (id: string) => call<Milestone | null>('milestone:drop', id)
}

/** The colours a marked day can wear, the same names the tags use. */
export const MARK_COLORS = ['orange', 'red', 'pink', 'purple', 'blue', 'green', 'yellow', 'brown', 'gray'] as const
/** A few emoji to start from; any other can be typed. */
export const MARK_ICONS = ['🎓', '🚀', '🎂', '📚', '✈️', '🏁', '❤️', '⭐'] as const

/** Its colour as ink, the accent when it has none. */
export const inkOf = (one: Pick<Milestone, 'color'>): string => (one.color ? `var(--tt-color-text-${one.color})` : 'var(--tt-brand-color-400)')

/** Every marked day, read again whenever anything is written. */
export function useMilestones(from?: string | null, to?: string | null): Milestone[] {
  return useLive(() => marks.list(from, to), [] as Milestone[], [from, to])
}

/** The marked days on one day. */
export const onDay = (all: Milestone[], day: string): Milestone[] => all.filter((one) => one.day === day)

/** "3 days to Exam", "Exam is tomorrow", "Exam is today". */
export function countdown(one: Milestone, today = dayKey()): string {
  const left = daysBetween(today, one.day)
  if (left === 0) return `${one.title} is today`
  if (left === 1) return `${one.title} is tomorrow`
  if (left < 0) return `${one.title} was ${num(-left)} ${left === -1 ? 'day' : 'days'} ago`
  return `${num(left)} days to ${one.title}`
}

/** The next marked day from today, or null. */
export const nextOf = (all: Milestone[], today = dayKey()): Milestone | null => all.find((one) => one.day >= today) ?? null

/** Mark a day, or change the mark on it: asked over the page (MilestoneAsker), then saved; undoable. */
export async function markDay(day: string, existing?: Milestone | null): Promise<void> {
  // A tag's exam is changed on its tag.
  if (existing?.exam) return void window.api.openInHome('tag', existing.exam)
  const asked = await new Promise<(Partial<Milestone> & { day: string; title: string }) | 'drop' | null>((answer) =>
    window.dispatchEvent(new CustomEvent('vigil:mark-day', { detail: { answer, day, existing: existing ?? null } })))
  if (!asked) return
  if (asked === 'drop') {
    if (!existing) return
    const was = await marks.drop(existing.id)
    chime('away')
    toast(`${existing.title} is no longer marked`, was ? () => void marks.set(was) : undefined)
    return
  }
  const made = await marks.set({ ...asked, id: existing?.id })
  if (!made) return
  chime('mark')
  toast(existing ? `${asked.title}, ${dayMonth(`${asked.day}T12:00`)}` : `${dayMonth(`${asked.day}T12:00`)} is marked: ${asked.title}`, () =>
    void (made.was ? marks.set(made.was) : marks.drop(made.id)))
}

/** "!milestone Exam on 3 Dec", sent from the box: the day marked, said, and undoable (`undo` puts the words back). */
export async function markFromBox(mark: { title: string; day: string }, undo: () => void): Promise<void> {
  chime('mark')
  const made = await marks.set(mark)
  if (!made) return
  toast(`${dayMonth(`${mark.day}T12:00`)} is marked: ${mark.title}`, () => {
    void marks.drop(made.id)
    undo()
  })
}
