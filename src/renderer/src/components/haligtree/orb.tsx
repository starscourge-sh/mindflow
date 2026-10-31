import { useEffect } from 'react'
import { ThinkingOrb, type OrbState } from 'thinking-orbs'
import { useAlive, useSurface } from '@/lib/use-alive'
import { startWorking } from './beam'

/**
 * A small dotted orb for a real wait: an import, an export, a search, a
 * preview on its way. Only for those: a wait of a blink gets nothing. Held
 * still with Motion off or the window put away, since it draws on a frame
 * loop of its own. Given a label, the words sit beside it, bare, in place,
 * shimmering while it lasts. While any orb shows, the window's edge pulses
 * too (the beam), so a wait is seen where it happens and at a glance.
 */
export function Orb({ state = 'working', label, className }: { state?: OrbState; label?: string; className?: string }): React.JSX.Element {
  const alive = useAlive()
  const surface = useSurface()
  useEffect(() => startWorking(), [])
  const orb = <ThinkingOrb size={20} state={state} theme={surface} paused={!alive} aria-hidden={label ? true : undefined} className={`shrink-0 ${label ? '' : (className ?? '')}`} />
  if (!label) return orb
  return (
    <span role="status" className={`mf-orb-pill ${className ?? ''}`}>
      {orb}
      <span className="mf-shimmer" data-text={label}>{label}</span>
    </span>
  )
}
