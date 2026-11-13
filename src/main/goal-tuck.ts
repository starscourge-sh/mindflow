/**
 * How a goal's card sits on the desktop by the clock: shown in full, peeking
 * (its pill in the desk's stack with its ring of time gone, that opens
 * when pointed at) or tucked out of sight. Only for a card that would
 * otherwise always be up; "now and then" cards keep their own moments.
 *
 * Pure, so the rules can be read and tested apart from any window.
 */
export type Rest = 'show' | 'peek' | 'tuck'
type TuckRules = { on: boolean; showUntil: string; showFrom: string; between: 'peek' | 'tuck'; inFocus: 'tuck' | 'peek' | 'stay'; peekOut: boolean }

/** "HH:MM" as minutes into the day; a value that does not read is null. */
const minutes = (time: string): number | null => {
  const match = /^(\d{1,2}):(\d{2})$/.exec(time)
  return match ? Number(match[1]) * 60 + Number(match[2]) : null
}

/**
 * The card's place now: `clock` is "HH:MM", `focusing` a focus session under
 * way. Shown before `showUntil` and from `showFrom` on; in between, as
 * `between` says. A focus session wins over the clock, unless it says stay.
 * The hours may cross midnight (shown from 22:00 until 06:00 is a night
 * owl's day), and the same hour twice means shown all day.
 */
export function restNow(rules: TuckRules, clock: string, focusing: boolean): Rest {
  if (!rules.on) return 'show'
  if (focusing && rules.inFocus !== 'stay') return rules.inFocus
  const now = minutes(clock)
  const until = minutes(rules.showUntil)
  const from = minutes(rules.showFrom)
  if (now === null || until === null || from === null || until === from) return 'show'
  const between = until < from ? now >= until && now < from : now >= until || now < from
  return between ? rules.between : 'show'
}

/** Two days out of sight is when a card starts peeking out on its own. */
export const OUT_OF_SIGHT_MS = 2 * 86_400_000
/** How long it peeks out for, unless pointed at. */
export const PEEK_OUT_MS = 10 * 60_000

/**
 * Whether a tucked card peeks out by itself now: tucked by the rules, out of
 * sight for two days or more, and not yet today. Once a day, never more.
 */
export function peeksOut(rest: Rest, rules: TuckRules, lastSeen: number | undefined, nudgedOn: string | undefined, now: number, today: string): boolean {
  return rules.on && rules.peekOut && rest === 'tuck' && nudgedOn !== today && lastSeen !== undefined && now - lastSeen >= OUT_OF_SIGHT_MS
}

/**
 * Whether a goal's card that is up comes down when the goals are looked at again (index.ts, beacons: as a goal
 * changes, and every half minute by the menu bar's clock). It stays while its goal asks for a card of its own; and
 * one stuck by hand stays while its goal is open, whatever the goal's “Goal on screen” says: it is the person's own,
 * and taken down here it vanished by itself within half a minute of being stuck, with nothing changed.
 */
export const cardComesDown = (goalAsksForIt: boolean, stuckByHand: boolean, goalOpen: boolean): boolean => !goalAsksForIt && !(stuckByHand && goalOpen)
