import { useEffect, useState } from 'react'
import { allThemes, isLight } from './theme'
import { still } from '@/lib/motion'

/**
 * Whether a looping effect (a beam, an orb, a goo) should be playing: Motion
 * is on and this window can be seen. Those libraries run their own frame
 * loops that CSS cannot stop, so they are told with their `active`/`paused`
 * props. The box keeps painting while hidden (backgroundThrottling is off),
 * so the page never reads as hidden there; its put-away and shown messages
 * say so instead.
 */
export function useAlive(): boolean {
  const [calm, setCalm] = useState(still)
  const [hidden, setHidden] = useState(() => document.hidden)
  useEffect(() => {
    const watch = new MutationObserver(() => setCalm(still()))
    watch.observe(document.documentElement, { attributes: true, attributeFilter: ['data-motion'] })
    const reduce = matchMedia('(prefers-reduced-motion: reduce)')
    const onReduce = (): void => setCalm(still())
    reduce.addEventListener('change', onReduce)
    const onVisible = (): void => setHidden(document.hidden)
    document.addEventListener('visibilitychange', onVisible)
    const offHiding = window.api?.onHiding?.(() => setHidden(true))
    const offShown = window.api?.onShown?.(() => setHidden(false))
    // The main window is not told it is shown, but it always comes up focused.
    const onFocus = (): void => setHidden(false)
    window.addEventListener('focus', onFocus)
    return () => {
      watch.disconnect()
      reduce.removeEventListener('change', onReduce)
      document.removeEventListener('visibilitychange', onVisible)
      offHiding?.()
      offShown?.()
      window.removeEventListener('focus', onFocus)
    }
  }, [])
  return !calm && !hidden
}

/** The theme worn now: every theme carries `dark`, so it is read from the others. */
const worn = (): 'dark' | 'light' => {
  const { classList } = document.documentElement
  const theme = allThemes().find((one) => one !== 'dark' && classList.contains(one)) ?? 'dark'
  return isLight(theme) ? 'light' : 'dark'
}

/**
 * Light or dark, for the libraries that pick their ink by it. Their own
 * "auto" reads the `dark` class every theme carries, so a light theme got
 * light ink on a light page.
 */
export function useSurface(): 'dark' | 'light' {
  const [surface, setSurface] = useState(worn)
  useEffect(() => {
    const watch = new MutationObserver(() => setSurface(worn()))
    watch.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    return () => watch.disconnect()
  }, [])
  return surface
}
