import { clock } from '@/lib/clock'
import { taskName } from '@/lib/tasks'

/**
 * What the Mac's sleep did to what was running, as Settings (“When the Mac
 * sleeps”) says, naming it: “Draft the essay” was counted up to 21:40, when
 * the Mac slept. Two parts, the lead first: the pill's band sets them on two
 * lines, the nudge card in one sentence.
 */
export const sleptSaid = (away: { endedAt: string; sleptAt?: string; choice?: 'abandon' | 'finish'; timer: boolean; kind: string | null; goal?: string }): [string, string] => {
  const at = clock(away.sleptAt ?? away.endedAt)
  const name = away.goal ? `“${taskName(away.goal).text}”` : 'The session'
  if (away.kind === 'break') return [`Your break ended at ${at}`, 'when the Mac slept']
  if (away.timer) return [`Your timer stopped at ${at}`, 'when the Mac slept']
  if (away.choice === 'abandon') return [`${name} stopped at ${at}, not counted`, 'when the Mac slept']
  // Its time ran out before the Mac slept: counted in full, to its own end.
  if (away.sleptAt && Date.parse(away.endedAt) < Date.parse(away.sleptAt) - 30_000) return [`${name} was counted in full`, `it ended at ${clock(away.endedAt)}, before the Mac slept`]
  return [`${name} was counted up to ${at}`, 'when the Mac slept']
}
