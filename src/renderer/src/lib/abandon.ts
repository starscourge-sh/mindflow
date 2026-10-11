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
  if (how === 'gone') return void (chime('done'), toast('Timer stopped'))
  if (how !== 'abandoned') return void chime('nope')
  abandoned()
  window.api.glow('cancel')
  toast('Session abandoned: kept in the log, counted nowhere', () =>
    void vigil.unabandonSession(now.id).then((back) => (back ? (chime('back'), window.api.showFocus(true)) : chime('nope'))))
}

/** ⌘K's row for it, only while something is running. */
export function useAbandonAction(): { label: string; cue: null; run: () => void }[] {
  const focus = useLive(vigil.focusNow, null as Focus | null)
  if (!focus) return []
  return [{ label: focus.taskId ? 'Abandon session' : 'Stop the timer', cue: null, run: () => void abandonNow(focus) }]
}
