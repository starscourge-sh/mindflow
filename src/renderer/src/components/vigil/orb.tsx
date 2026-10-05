import { ThinkingOrb, type OrbState } from 'thinking-orbs'
import { useAlive, useSurface } from '@/lib/use-alive'

/**
 * A small dotted orb for a real wait: an import, an export, a search, a
 * preview on its way. Only for those: a wait of a blink gets nothing. Held
 * still with Motion off or the window put away, since it draws on a frame
 * loop of its own.
 */
export function Orb({ state = 'working', label, className }: { state?: OrbState; label?: string; className?: string }): React.JSX.Element {
  const alive = useAlive()
  const surface = useSurface()
  return <ThinkingOrb size={20} state={state} theme={surface} paused={!alive} aria-label={label} className={`shrink-0 ${className ?? ''}`} />
}
