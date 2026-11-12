import { useEffect, useState } from 'react'

/** The desk (stickies, goal cards, their tabs) away for a meeting or quiet hours: why, whether hidden now, and what “Step away in meetings” sees. */
export type DeskAway = { why: 'meeting' | 'quiet' | null; hidden: boolean; seen: string }

/** As main says it now, and again on each change (a signal come or gone, “Show anyway”, quiet hours' start and end). */
export function useDeskAway(): DeskAway | null {
  const [said, setSaid] = useState<DeskAway | null>(null)
  useEffect(() => {
    let here = true
    void window.api.deskAway().then((now) => here && setSaid(now))
    const off = window.api.onDeskAway(setSaid)
    return () => {
      here = false
      off()
    }
  }, [])
  return said
}

/**
 * ⌘K's line while the desk is away, beside “Show sticky notes”: why they are hidden and the way to have them out all
 * the same (for this meeting, or these quiet hours, only), or to hide them again. Nothing while the desk is out.
 */
export function deskAwayAction(desk: DeskAway | null): { label: string; hint: string; cue: null; run: () => void }[] {
  if (!desk?.why) return []
  const during = desk.why === 'meeting' ? 'a meeting' : 'quiet hours'
  return desk.hidden
    ? [{ label: 'Show sticky notes anyway', hint: `Hidden for ${during}: out again, this time only`, cue: null, run: () => window.api.showDeskAnyway(true) }]
    : [{ label: 'Hide sticky notes again', hint: `Shown anyway in ${during}: away again until it ends`, cue: null, run: () => window.api.showDeskAnyway(false) }]
}
