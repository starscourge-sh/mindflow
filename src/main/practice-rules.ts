/**
 * Practices, the rules on their own: what a session's minutes count as, how
 * full the pill is, when one is offered, and the better time to suggest.
 * Kept apart from practices.ts, with no Electron in it, so node's test runner
 * reads it as it is (test/practices.test.ts).
 */

/** The start is always this short: five minutes gets you past the hardest bit. */
export const START_MIN = 5
/** An offer stays up this long after its time, then is simply gone for the day. */
export const OFFER_WINDOW_MIN = 180
/** Untouched this long, a practice pauses itself, so the record stays honest. */
export const IDLE_PAUSE_SEC = 180
/** Declined this many times in a row at one time, a better time is suggested. */
export const DECLINES_TO_MOVE = 5
/** The honest record looks back this many days. */
export const HONEST_DAYS = 14

/** Under 5 minutes it is partial (never a failure); then complete; past the target, met. */
export type Stage = 'partial' | 'complete' | 'met'
export const stageOf = (minutes: number, target: number): Stage =>
  minutes < START_MIN ? 'partial' : minutes < Math.max(START_MIN, target) ? 'complete' : 'met'

/**
 * The pill's bar, as shares of the target: the gold first 5 minutes, the
 * calmer stretch after it, and where the notch sits. Past the target the bar
 * is full and glows; at twice the target it asks once whether you are still going.
 */
export type Fill = { first: number; bonus: number; notch: number; stage: 'start' | 'min' | 'met' | 'long' }
export function fillOf(ms: number, targetMin: number): Fill {
  const target = Math.max(START_MIN, targetMin) * 60_000
  const start = START_MIN * 60_000
  const done = Math.max(0, ms)
  return {
    first: Math.min(done, start) / target,
    bonus: Math.min(Math.max(0, done - start), target - start) / target,
    notch: start / target,
    stage: done < start ? 'start' : done < target ? 'min' : done < target * 2 ? 'met' : 'long'
  }
}

/** "HH:MM" as minutes since midnight. */
export const minutesOf = (hhmm: string): number => {
  const [h, m] = hhmm.split(':').map(Number)
  return (h || 0) * 60 + (m || 0)
}

/**
 * Whether a practice is offered at `now`: one of its days, from its time for a
 * few hours (or from a "in 30 min" asked), and not already done, declined or
 * put off today. Nothing piles up: a day missed is not owed.
 */
export function offerDue(p: { days: number[]; at: string }, now: Date, state: { ranToday: boolean; skippedToday: boolean; laterAt: number | null }): boolean {
  if (state.ranToday || state.skippedToday) return false
  if (state.laterAt !== null) return state.laterAt <= now.getTime() && new Date(state.laterAt).toDateString() === now.toDateString()
  if (!p.days.includes(now.getDay())) return false
  const minute = now.getHours() * 60 + now.getMinutes()
  const from = minutesOf(p.at)
  return minute >= from && minute < Math.min(24 * 60, from + OFFER_WINDOW_MIN)
}

/** Whether two hours of the day are within one of each other, round the clock. */
const near = (a: number, b: number): boolean => Math.min((a - b + 24) % 24, (b - a + 24) % 24) <= 1

/**
 * The hour you are usually about, from when you open and write in the app:
 * the busiest hour that is not the one you keep skipping (nor next to it).
 * Null with too little to go on.
 */
export function bestHour(hours: number[], skipped: number): number | null {
  const counts = new Map<number, number>()
  for (const hour of hours) if (!near(hour, skipped)) counts.set(hour, (counts.get(hour) ?? 0) + 1)
  let best: number | null = null
  for (const [hour, n] of counts) if (n >= 3 && (best === null || n > counts.get(best)! || (n === counts.get(best)! && hour < best))) best = hour
  return best
}

export const partOfDay = (hour: number): string => (hour >= 5 && hour < 12 ? 'Mornings' : hour >= 12 && hour < 17 ? 'Afternoons' : hour >= 17 && hour < 21 ? 'Evenings' : 'Nights')

/** The log line written as a session ends: "practice:: design patterns, 14 min". */
export function logLine(name: string, minutes: number): string {
  // Sentence case reads as a line ("design patterns"); a name with its own capitals keeps them ("LeetCode").
  const said = /^\p{Lu}\p{Ll}/u.test(name) && !/\p{Lu}/u.test(name.slice(1)) ? name.charAt(0).toLowerCase() + name.slice(1) : name
  return `practice:: ${said.trim()}, ${Math.max(1, Math.round(minutes))} min`
}

/** The real minutes of a session: from start to end, its pauses left out. */
export const minutesRun = (startedAt: string, endedAt: string, pausedMs: number): number =>
  Math.max(0, (Date.parse(endedAt) - Date.parse(startedAt) - (pausedMs || 0)) / 60_000)

type Node = { type?: string; text?: string; attrs?: Record<string, unknown>; content?: Node[] }
/**
 * A saved problem list: a note whose list items are the problems. With
 * checkboxes, the next is the first not ticked; without, the one after the
 * last done (`at`), going round.
 */
export function nextProblem(body: unknown, at: number): { text: string; index: number; total: number } | null {
  const items: { text: string; checked: boolean | null }[] = []
  const words = (node: Node): string => node.text ?? (node.content ?? []).map(words).join(node.type === 'paragraph' ? '' : ' ')
  const walk = (node: Node | null | undefined): void => {
    if (!node || typeof node !== 'object') return
    if (node.type === 'listItem' || node.type === 'taskItem') {
      const first = (node.content ?? []).find((one) => one.type === 'paragraph')
      const text = first ? words(first).trim() : ''
      if (text) items.push({ text, checked: node.type === 'taskItem' ? node.attrs?.checked === true : null })
      // Steps under a problem are its own, not more problems.
      return
    }
    node.content?.forEach(walk)
  }
  if (typeof body === 'string') for (const line of body.split('\n')) {
    const item = /^\s*(?:[-*]|\d+\.)\s+(?:\[( |x)\]\s+)?(.+)/i.exec(line)
    if (item) items.push({ text: item[2].trim(), checked: item[1] === undefined ? null : item[1].toLowerCase() === 'x' })
  }
  else walk(body as Node)
  if (!items.length) return null
  const ticked = items.some((one) => one.checked !== null)
  const index = ticked ? items.findIndex((one) => one.checked === false) : ((at % items.length) + items.length) % items.length
  return index < 0 ? null : { text: items[index].text, index, total: items.length }
}

/**
 * The honest record: the target against the real minutes a day, over the
 * last two weeks (or since it began), counting only the days it was offered
 * or done. Days off its schedule with nothing done are left out; a day it was
 * offered and not done counts as nothing. Null before any session at all.
 */
export function honestOf(
  sessions: { startedAt: string; minutes: number }[],
  practice: { days: number[]; targetMin: number; createdAt: string },
  now: Date = new Date()
): { planned: number; average: number; days: number } | null {
  if (!sessions.length) return null
  const day = (at: Date): string => `${at.getFullYear()}-${at.getMonth()}-${at.getDate()}`
  const first = new Date(Math.min(Date.parse(practice.createdAt) || Infinity, ...sessions.map((one) => Date.parse(one.startedAt))))
  first.setHours(0, 0, 0, 0)
  const byDay = new Map<string, number>()
  for (const one of sessions) byDay.set(day(new Date(one.startedAt)), (byDay.get(day(new Date(one.startedAt))) ?? 0) + one.minutes)
  let counted = 0
  let total = 0
  let span = 0
  for (let back = 0; back < HONEST_DAYS; back++) {
    const at = new Date(now)
    at.setHours(12, 0, 0, 0)
    at.setDate(at.getDate() - back)
    if (at < first) break
    span++
    const done = byDay.get(day(at))
    // Today counts once it is done; not yet done today is not yet missed.
    if (done !== undefined) (counted++, (total += done))
    else if (back > 0 && practice.days.includes(at.getDay())) counted++
  }
  if (!counted) return null
  return { planned: practice.targetMin, average: Math.round(total / counted), days: span }
}
