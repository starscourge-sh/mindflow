import { useEffect, useState } from 'react'
import { byKeys } from '@/lib/motion'

import './beam.css'

/**
 * The beam: one light that travels round the window's edge, the app's one
 * way of saying "working on it" and "done" without a word.
 *
 * Two things move it. A wait (`working`, `useWorking`, or main's own work
 * told over `work:busy`) turns it slowly, faint, for as long as the work
 * lasts; a wait shorter than a quarter of a second shows nothing, so quick
 * work never flickers it. An answer (`beam`) sends it once round in its
 * colour: green for done, blue for news, amber for careful, a red flicker for
 * not done, warm orange when a timer lights. Nothing at rest, and nothing at
 * all with Motion off or Reduce motion on (beam.css).
 */
export type BeamFlash = 'success' | 'info' | 'warning' | 'error' | 'warm'
/** Kept for the old name: a toast's tone, or nothing. */
export type BeamState = BeamFlash | null

/**
 * One short sweep round the window, in the answer's colour. Done by a key
 * (⌘Enter sending a capture, many times a day), a plain "done" or "news" has
 * no sweep: the sound and the toast say it. Careful and not done still show.
 */
export const beam = (state: BeamState): void => {
  if (!state || (byKeys() && (state === 'success' || state === 'info'))) return
  window.dispatchEvent(new CustomEvent('vigil:beam', { detail: state }))
}

// Waits under way in this window: a count, so two at once end when both have.
let waits = 0
const tell = (): void => void window.dispatchEvent(new CustomEvent('vigil:beam-wait', { detail: waits }))
/** A wait begins; the function it gives back ends it (once, however often it is called). */
export function startWorking(): () => void {
  waits++
  tell()
  let done = false
  return () => {
    if (done) return
    done = true
    waits = Math.max(0, waits - 1)
    tell()
  }
}
/** The beam turns while this work runs. Hands the work back, so it wraps in place. */
export function working<T>(work: Promise<T>): Promise<T> {
  const end = startWorking()
  return work.finally(end)
}
/** The beam turns while `busy` holds: for a wait a component already keeps as state. */
export function useWorking(busy: boolean): void {
  useEffect(() => (busy ? startWorking() : undefined), [busy])
}

/** How long a wait runs before the beam shows it: quick work stays quiet. */
const AFTER = 250

export function Beam(): React.JSX.Element | null {
  const [flash, setFlash] = useState<{ tone: BeamFlash; key: number } | null>(null)
  const [here, setHere] = useState(0)
  const [main, setMain] = useState(0)
  const [late, setLate] = useState(false)
  const [shown, setShown] = useState(true)
  useEffect(() => {
    const onFlash = (event: Event): void => setFlash((now) => ({ tone: (event as CustomEvent<BeamFlash>).detail, key: (now?.key ?? 0) + 1 }))
    const onWait = (event: Event): void => setHere((event as CustomEvent<number>).detail)
    window.addEventListener('vigil:beam', onFlash)
    window.addEventListener('vigil:beam-wait', onWait)
    // Main's own work (an import, a backup, an export) is told to every window.
    const offBusy = window.api?.onBusy?.((count) => setMain(count))
    // The box keeps painting while put away: told by the app when it goes and comes back.
    const away = window.api?.onHiding?.(() => setShown(false))
    const back = window.api?.onShown?.(() => setShown(true))
    const onFocus = (): void => setShown(true)
    window.addEventListener('focus', onFocus)
    return () => {
      window.removeEventListener('vigil:beam', onFlash)
      window.removeEventListener('vigil:beam-wait', onWait)
      window.removeEventListener('focus', onFocus)
      offBusy?.()
      away?.()
      back?.()
    }
  }, [])
  const waiting = here + main > 0
  useEffect(() => {
    if (!waiting) return setLate(false)
    const timer = setTimeout(() => setLate(true), AFTER)
    return () => clearTimeout(timer)
  }, [waiting])
  // Over when its sweep is, by the clock: with Motion off there is no animation to end.
  useEffect(() => {
    if (!flash) return
    const done = setTimeout(() => setFlash(null), flash.tone === 'warm' ? 1250 : 450)
    return () => clearTimeout(done)
  }, [flash])
  if (!shown) return null
  // A sweep wins for the moment it runs; then the wait, if any, comes back.
  const state = flash ? flash.tone : waiting && late ? 'working' : null
  if (!state) return null
  return <div aria-hidden key={flash ? `f${flash.key}` : 'wait'} data-beam={state} className="mf-beam" />
}
