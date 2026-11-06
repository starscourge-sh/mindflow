import type { Settings } from './haligtree'
import type { Sun } from '../../../main/sun'
export type { Sun }

/**
 * Your sun (main/sun.ts): today's sunrise and sunset where you are, asked of
 * main as each window opens and again each hour, kept here for what reads it
 * at once (the scenery's mood, the evening offers). Null until known, when the
 * clock's hours stand in.
 */
let kept: Sun | null = null
const ask = (): void => void window.api.haligtree<Sun | null>('sun').then((sun) => (kept = sun), () => undefined)
if (typeof window !== 'undefined' && window.api) {
  ask()
  window.setInterval(ask, 3600_000)
}
export const sunNow = (): Sun | null => kept
/** Asked again now: a city picked in Settings. */
export const sunAgain = (): Promise<Sun | null> => window.api.haligtree<Sun | null>('sun').then((sun) => (kept = sun))

const hhmm = (iso: string): string => {
  const at = new Date(iso)
  return `${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`
}

/** When the evening starts, as "HH:MM": sunset where you are when chosen ("sunset"), else the hour set. */
export function eveningAt(settings: Pick<Settings, 'closeDayAt'> | null | undefined): string {
  const at = settings?.closeDayAt ?? '18:00'
  if (at !== 'sunset') return at
  // A day the sun never sets (or never rises): the evening at 18:00, as before a city was known.
  return kept?.set ? hhmm(kept.set) : '18:00'
}

/** The scenery's moods by the sun: day until an hour before sunset, dusk to an hour after, night till sunrise. */
export function sunMoods(now = new Date()): ('day' | 'dusk' | 'night' | 'interior')[] | null {
  if (!kept?.rise || !kept.set) return kept?.polar === 'day' ? ['day'] : kept?.polar === 'night' ? ['night', 'interior'] : null
  const [rise, set, t] = [new Date(kept.rise).getTime(), new Date(kept.set).getTime(), now.getTime()]
  if (t >= rise && t < set - 3600_000) return ['day']
  if (t >= set - 3600_000 && t < set + 3600_000) return ['dusk']
  return ['night', 'interior']
}
