import { refuse, toast } from '@/components/vigil/ui'
import { abandoned, chime } from '@/lib/sound'
import { useLive, vigil, type Focus } from '@/lib/vigil'

/**
 * Abandon the session running now, from ⌘K or anywhere without the pill in
 * reach: it stays in its task's log marked abandoned and counts toward no
 * total, with Undo for a few seconds. A plain timer has nothing to keep, so
 * it simply stops.
 */
export async function abandonNow(focus?: Focus | null): Promise<void> {
  const now = focus ?? (await vigil.focusNow())
  if (!now) return refuse('No session is running')
  const how = await vigil.abandonSession(now.id)
  if (how === 'gone') return void (chime('done'), toast(now.kind === 'break' ? 'Break over' : 'Timer stopped'))
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
export function useAbandonAction(): { label: string; keys?: string; cue: null; run: () => void }[] {
  const focus = useLive(vigil.focusNow, null as Focus | null)
  const last = useLive(vigil.lastSession, null as Awaited<ReturnType<typeof vigil.lastSession>>)
  if (!focus) {
    if (!last) return []
    const length = last.plannedMs ? `, ${Math.max(1, Math.round(last.plannedMs / 60_000))} min` : ''
    return [{ label: `Go again: ${last.goal}${length}`, cue: null, run: () => void vigil.againSession().then((id) => (id ? (chime('anew'), window.api.showFocus(true)) : chime('nope'))) }]
  }
  return [
    ...(focus.plannedMs ? [{ label: focus.kind === 'break' ? 'Add 10 minutes to the break' : focus.taskId ? 'Add 10 minutes to the session' : 'Add 10 minutes to the timer', keys: '⌃⌥⌘=', cue: null, run: () => void vigil.extendSession(focus.id, 10 * 60_000).then((ok) => ok === false && chime('nope')) }] : []),
    // The pill's Stop asks the same two things, in the same words.
    ...(focus.taskId ? [{ label: 'End session early, count it', cue: null, run: () => void vigil.endSession(focus.id, '', false).then(() => (chime('resolve'), toast('Session ended early, counted', () => void vigil.unendSession(focus.id).then((back) => (back ? (chime('back'), window.api.showFocus(true)) : chime('nope')))))) }] : []),
    { label: focus.taskId ? "Abandon session, don't count it" : focus.kind === 'break' ? 'End the break' : 'Stop the timer', cue: null, run: () => void abandonNow(focus) }
  ]
}
