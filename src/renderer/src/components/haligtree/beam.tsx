import { useEffect, useState } from 'react'
import { byKeys } from '@/lib/motion'
import { useRecording } from '@/lib/recording'

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
 * all with Motion off or Reduce motion on (beam.css). While a voice note
 * records, the whole edge breathes a soft red, as a camera's light says it is on.
 */
type BeamFlash = 'success' | 'info' | 'warning' | 'error' | 'warm'
/** Kept for the old name: a toast's tone, or nothing. */
type BeamState = BeamFlash | null

/**
 * One short sweep round the window, in the answer's colour. Done by a key
 * (⌘Enter sending a capture, many times a day), a plain "done" or "news" has
 * no sweep: the sound and the toast say it. Careful and not done still show.
 */
export const beam = (state: BeamState): void => {
  if (!state || (byKeys() && (state === 'success' || state === 'info'))) return
  window.dispatchEvent(new CustomEvent('haligtree:beam', { detail: state }))
}

// Waits under way in this window: a count, so two at once end when both have.
let waits = 0
const tell = (): void => void window.dispatchEvent(new CustomEvent('haligtree:beam-wait', { detail: waits }))
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
  const recording = useRecording()
  const card = useCardEdge()
  useEffect(() => {
    const onFlash = (event: Event): void => setFlash((now) => ({ tone: (event as CustomEvent<BeamFlash>).detail, key: (now?.key ?? 0) + 1 }))
    const onWait = (event: Event): void => setHere((event as CustomEvent<number>).detail)
    window.addEventListener('haligtree:beam', onFlash)
    window.addEventListener('haligtree:beam-wait', onWait)
    // Main's own work (an import, a backup, an export) is told to every window.
    const offBusy = window.api?.onBusy?.((count) => setMain(count))
    // The box keeps painting while put away: told by the app when it goes and comes back.
    const away = window.api?.onHiding?.(() => setShown(false))
    const back = window.api?.onShown?.(() => setShown(true))
    const onFocus = (): void => setShown(true)
    window.addEventListener('focus', onFocus)
    return () => {
      window.removeEventListener('haligtree:beam', onFlash)
      window.removeEventListener('haligtree:beam-wait', onWait)
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
  const state = flash ? flash.tone : recording ? 'recording' : waiting && late ? 'working' : null
  if (!state) return null
  return <div aria-hidden key={flash ? `f${flash.key}` : state} data-beam={state} className="mf-beam" style={card ?? undefined} />
}

/**
 * Where the beam goes round: the window's edge, or in a window with clear room round its card (quick capture's
 * overhang) the card's own edge, which moves as the box grows. Without this the light ran round the clear room,
 * a red frame far out on the screen while a voice note recorded.
 */
function useCardEdge(): React.CSSProperties | null {
  const roomy = Object.values(window.api?.room ?? {}).some((one) => one > 0)
  const [edge, setEdge] = useState<React.CSSProperties | null>(null)
  useEffect(() => {
    if (!roomy) return
    const card = document.querySelector<HTMLElement>('.app-container')
    if (!card) return
    const place = (): void => {
      const at = card.getBoundingClientRect()
      setEdge({ inset: 'auto', left: at.left, top: at.top, width: at.width, height: at.height })
    }
    place()
    const sizes = new ResizeObserver(place)
    sizes.observe(card)
    window.addEventListener('resize', place)
    return () => (sizes.disconnect(), window.removeEventListener('resize', place))
  }, [roomy])
  return edge
}
