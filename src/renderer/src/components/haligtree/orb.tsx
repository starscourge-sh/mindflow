import { ThinkingOrb, type OrbState } from 'thinking-orbs'
import { useAlive, useSurface } from '@/lib/use-alive'

/**
 * A small dotted orb for a real wait: an import, an export, a search, a
 * preview on its way. Only for those: a wait of a blink gets nothing. Held
 * still with Motion off or the window put away, since it draws on a frame
 * loop of its own. Given a label it sits in a chip that says what is
 * happening, the words shimmering while it lasts.
 */
export function Orb({ state = 'working', label, className }: { state?: OrbState; label?: string; className?: string }): React.JSX.Element {
  const alive = useAlive()
  const surface = useSurface()
  const orb = <ThinkingOrb size={20} state={state} theme={surface} paused={!alive} aria-hidden={label ? true : undefined} className={`shrink-0 ${label ? '' : (className ?? '')}`} />
  if (!label) return orb
  return (
    <span role="status" className={`mf-orb-pill ${className ?? ''}`}>
      {orb}
      <span className="mf-shimmer" data-text={label}>{label}</span>
    </span>
  )
}
