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
 * Given `stop`, a quiet “Stop” follows the words (Esc on it too), as
 * Transcribe's does: the job is given up and nothing is left half-written.
 */
export function Orb({ state = 'working', label, className, stop }: { state?: OrbState; label?: string; className?: string; stop?: () => void }): React.JSX.Element {
  const alive = useAlive()
  const surface = useSurface()
  useEffect(() => startWorking(), [])
  const orb = <ThinkingOrb size={20} state={state} theme={surface} paused={!alive} aria-hidden={label ? true : undefined} className={`shrink-0 ${label ? '' : (className ?? '')}`} />
  if (!label) return orb
  return (
    <span role="status" className={`mf-orb-pill ${stop ? 'pointer-events-auto' : ''} ${className ?? ''}`}>
      {orb}
      <span className="mf-shimmer" data-text={label}>{label}</span>
      {stop && <StopButton stop={stop} />}
    </span>
  )
}

/** “Stop” beside a wait, in Transcribe's look: a click, or Esc while it has the keys. */
export function StopButton({ stop, data }: { stop: () => void; /** Its own mark for tests, beside data-job-stop. */ data?: Record<string, string> }): React.JSX.Element {
  return (
    <button type="button" {...data} data-job-stop onMouseDown={(event) => event.preventDefault()} onClick={stop}
      onKeyDown={(event) => event.key === 'Escape' && (event.preventDefault(), event.stopPropagation(), stop())}
      // 32px to press, a phone's finger too, with no change to where the word sits.
      className="-mx-1 -my-[9px] cursor-pointer rounded-sm px-1 py-[9px] font-medium text-(--mf-muted-strong) underline-offset-2 transition-colors hover:text-foreground hover:underline active:scale-[0.97]">
      Stop
    </button>
  )
}
