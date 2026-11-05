import { Flag, Snowflake, Telescope } from 'lucide-react'

/**
 * The three kinds of goal, each told apart by its own mark wherever a goal
 * shows (Goals, ⌘K, the @ menu, quick capture): one with a day, one for
 * someday (no day: the life list), one on ice. A someday goal on ice stays
 * someday. Small and free of the Goals page, so any window can draw it.
 */
export type GoalKind = 'dated' | 'someday' | 'iced'
export const kindOf = (goal: { goalAt?: string | null; closedHow?: string | null }): GoalKind =>
  !goal.goalAt ? 'someday' : goal.closedHow === 'on ice' ? 'iced' : 'dated'
/** A flag for a day you are aiming at; a telescope for the far-off life list (the star and the compass already mean a rating and what the app can do); a snowflake for paused. */
export const KIND_ICON = { dated: Flag, someday: Telescope, iced: Snowflake } as const
/** On ice: a cool, faded ink, so a paused goal reads paused at a glance. */
export const ICE = 'color-mix(in oklab, var(--tt-color-text-blue) 55%, var(--muted-foreground))'
