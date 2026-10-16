import { clockTime } from '@/components/vigil/session-timeline'

/**
 * What the Mac's sleep did to what was running, as Settings (“When the Mac
 * sleeps”) says, in a few words after "The Mac slept at 21:40,": "so the
 * session was finished there". Said by the pill's band and the nudge card.
 */
export const sleptDid = (away: { endedAt: string; sleptAt?: string; choice?: 'abandon' | 'finish'; timer: boolean; kind: string | null }): string =>
  away.kind === 'break' ? 'so the break was ended there'
    : away.timer ? 'so the timer was stopped there'
    : away.choice === 'abandon' ? 'so it was abandoned there, not counted'
    : away.sleptAt && Date.parse(away.endedAt) < Date.parse(away.sleptAt) - 30_000 ? `so the session was finished at ${clockTime(away.endedAt)}, when its time ran out`
    : 'so the session was finished there'
