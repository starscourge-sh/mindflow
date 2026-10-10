import { useEffect, useState } from 'react'

import './box-extras.css'

type Flash = 'sent' | 'warm'

/** One sweep round the box: `sent` when something is kept, `warm` when a lit word is about to act. */
export const boxBeam = (flash: Flash): void => void window.dispatchEvent(new CustomEvent('vigil:box-beam', { detail: flash }))

/**
 * The light round the box's edge (box-extras.css). Slow and faint while
 * `fetching`; a sweep when told; nothing at rest, and nothing at all while
 * the window is put away, which keeps painting otherwise.
 */
export function BoxBeam({ fetching }: { fetching: boolean }): React.JSX.Element | null {
  const [flash, setFlash] = useState<{ kind: Flash; key: number } | null>(null)
  const [shown, setShown] = useState(true)
  useEffect(() => {
    const onFlash = (event: Event): void => setFlash((now) => ({ kind: (event as CustomEvent<Flash>).detail, key: (now?.key ?? 0) + 1 }))
    // The window keeps painting while hidden (and so stays "visible" to the
    // page): told by the app when it goes and comes back instead.
    const away = window.api.onHiding(() => setShown(false))
    const back = window.api.onShown(() => setShown(true))
    window.addEventListener('vigil:box-beam', onFlash)
    return () => (away(), back(), window.removeEventListener('vigil:box-beam', onFlash))
  }, [])
  // Over when its sweep is, by the clock: with motion off there is no animation to end.
  useEffect(() => {
    if (!flash) return
    const done = setTimeout(() => setFlash(null), flash.kind === 'warm' ? 1250 : 950)
    return () => clearTimeout(done)
  }, [flash])
  if (!shown) return null
  // A sweep wins over the wait for the moment it runs; then the wait, if any, comes back.
  const state = flash ? flash.kind : fetching ? 'fetching' : null
  if (!state) return null
  return <div aria-hidden key={flash ? `f${flash.key}` : 'wait'} data-beam={state} className="mf-box-beam" />
}
