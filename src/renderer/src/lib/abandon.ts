import { refuse, toast } from '@/components/vigil/ui'
import { abandoned, chime } from '@/lib/sound'
import { isSession, useLive, vigil, type Focus } from '@/lib/vigil'
import type { Choice } from '@/components/search'

/**
 * Abandon the session running now, from ⌘K or anywhere without the pill in
 * reach: it stays in its task's log marked abandoned and counts toward no
 * total, with Undo for a few seconds. A plain timer has nothing to keep, so
 * it simply stops.
 */
export async function abandonNow(focus?: Focus | null): Promise<void> {
  const now = focus ?? (await vigil.focusNow())
  if (!now) return refuse('No session is running')
  // The time it had left, read before it stops, so Undo can start it again from there.
  const ran = Date.now() - new Date(now.startedAt).getTime() - (now.pausedMs ?? 0) - (now.pausedAt ? Date.now() - new Date(now.pausedAt).getTime() : 0)
  const left = now.plannedMs ? now.plannedMs - ran : 0
  const how = await vigil.abandonSession(now.id)
  if (how === 'gone') {
    chime('done')
    const again = left >= 1000 && !now.rounds
      ? () => void (now.kind === 'break' ? vigil.startBreak(null, left) : vigil.startTimer(now.goal || 'Timer', left)).then(() => (chime('back'), window.api.showFocus(true)))
      : undefined
    return void toast(now.kind === 'break' ? 'Break over' : 'Timer stopped', again)
  }
  if (how !== 'abandoned') return void chime('nope')
  abandoned()
  window.api.glow('cancel')
  toast('Session abandoned, not counted', () =>
    void vigil.unabandonSession(now.id).then((back) => (back ? (chime('back'), window.api.showFocus(true)) : chime('nope'))))
}

/**
 * ⌘K's rows for a session: while one runs, Abandon (or Stop the timer) and,
 * with a length, Add 10 minutes (⌃⌥⌘= from anywhere); with nothing running,
 * Go again on the last session kept, same task and length.
 */
type SessionAction = { label: string; hint?: string; keys?: string; cue: null; run: () => void; choices?: () => Choice[]; typedChoice?: (typed: string) => Choice | null; heard?: (typed: string) => SessionAction | null }
export function useAbandonAction(): SessionAction[] {
  const focus = useLive(vigil.focusNow, null as Focus | null)
  const last = useLive(vigil.lastSession, null as Awaited<ReturnType<typeof vigil.lastSession>>)
  if (!focus) {
    const length = last?.plannedMs ? `, ${Math.max(1, Math.round(last.plannedMs / 60_000))} min` : ''
    return [startFocusAction(false), ...(last ? [{ label: `Go again: ${last.goal}${length}`, cue: null, run: () => void vigil.againSession().then((id) => (id ? (chime('anew'), window.api.showFocus(true)) : chime('nope'))) }] : [])]
  }
  return [...sessionLines(focus), startFocusAction(true)]
}

/** ⌘K's “Start focus” row, by its name: ⌃⌥⌘S opens ⌘K on its lengths. */
export const START_FOCUS = 'Start focus…'
/** The lengths “Start focus” offers first; any other is typed (“40”, “1h30”). */
export const FOCUS_LENGTHS = [25, 45, 60]
/** A bare session, no task: as long as asked, with the bubble up. Named while it runs, or after. */
export const startBareFocus = (ms: number): void =>
  void vigil.startFocus(ms).then(() => (chime('slide'), window.api.showFocus(true)))
/** A typed length as minutes: “40”, “40 min”, “1h30”, “1:30”, between 1 minute and 8 hours. */
export const minutesTyped = (typed: string): number | null => {
  const words = typed.trim().toLowerCase().replace(/^(start\s+)?focus\s*(for\s*)?/, '')
  if (!words) return null
  const clock = words.match(/^(\d+):(\d{2})$/)
  const parts = words.match(/^(?:(\d+(?:\.\d+)?)\s*h\w*)?\s*(?:(\d+)\s*m?\w*)?$/)
  const minutes = clock ? Number(clock[1]) * 60 + Number(clock[2]) : parts && (parts[1] || parts[2]) ? Number(parts[1] ?? 0) * 60 + Number(parts[2] ?? 0) : 0
  return minutes >= 1 && minutes <= 480 ? Math.round(minutes) : null
}
const minutesSaid = (minutes: number): string => (minutes % 60 ? (minutes > 60 ? `${Math.floor(minutes / 60)} h ${minutes % 60} min` : `${minutes} min`) : `${minutes / 60} h`)
/**
 * ⌘K's “Start focus”, Raycast's way: no task to make first. Picked, it asks
 * how long (25, 45 or 60 minutes, or one typed), and ↵ starts it. “focus 40”
 * typed straight in starts that long at once. ⌃⌥⌘S opens it from anywhere.
 */
export function startFocusAction(running: boolean): SessionAction {
  const pick = (minutes: number): Choice => ({ label: minutesSaid(minutes), run: () => startBareFocus(minutes * 60_000) })
  return {
    label: START_FOCUS, hint: running ? 'A new focus session with no task; the one running ends, kept' : 'A focus session with no task: pick how long', keys: '⌃⌥⌘S', cue: null, run: () => {},
    choices: () => FOCUS_LENGTHS.map(pick),
    typedChoice: (typed) => {
      const minutes = minutesTyped(typed)
      return minutes && !FOCUS_LENGTHS.includes(minutes) ? { ...pick(minutes), note: 'typed' } : null
    },
    heard: (typed) => {
      if (!/^(start\s+)?focus\b/i.test(typed.trim())) return null
      const minutes = minutesTyped(typed)
      return minutes ? { label: `Start focus, ${minutesSaid(minutes)}`, hint: 'No task needed', cue: null, run: () => startBareFocus(minutes * 60_000) } : null
    }
  }
}

/**
 * What can be done to the session running now, in the pill's own words: ⌘K
 * lists them, and so does a right click on the task it runs on, in place of a
 * second Start.
 */
export function sessionLines(focus: Focus): { label: string; keys?: string; cue: null; run: () => void }[] {
  return [
    ...(focus.plannedMs ? [{ label: focus.kind === 'break' ? 'Add 10 minutes to the break' : isSession(focus) ? 'Add 10 minutes to the session' : 'Add 10 minutes to the timer', keys: '⌃⌥⌘=', cue: null, run: () => void vigil.extendSession(focus.id, 10 * 60_000).then((ok) => ok === false && chime('nope')) }] : []),
    // The pill's Stop asks the same two things, in the same words.
    ...(isSession(focus) ? [{ label: 'End session early, count it', cue: null, run: () => void vigil.endSession(focus.id, '', false).then(() => (chime('resolve'), toast('Session ended early, counted', () => void vigil.unendSession(focus.id).then((back) => (back ? (chime('back'), window.api.showFocus(true)) : chime('nope')))))) }] : []),
    { label: isSession(focus) ? "Abandon session, don't count it" : focus.kind === 'break' ? 'End the break' : 'Stop the timer', cue: null, run: () => void abandonNow(focus) }
  ]
}
