import { useEffect, useRef } from 'react'

/** How long the mist takes to lift, in ms: the words start to come through about halfway. */
export const MIST_MS = 6500

type Bank = { x: number; y: number; r: number; drift: number; rise: number; phase: number }

/**
 * The welcome's arrival, once (after Arc's and Dia's): a sea mist over the
 * whole window, banks of it drifting slowly sideways and up, thinning until
 * only a few wisps cross the page and then those go too. The words come
 * through it as it lifts. `onGone` once it has. Under reduced motion the
 * welcome shows it not at all.
 */
export function WelcomeMist({ onGone }: { onGone: () => void }): React.JSX.Element {
  const box = useRef<HTMLCanvasElement>(null)
  const gone = useRef(onGone)
  gone.current = onGone
  useEffect(() => {
    const canvas = box.current
    const context = canvas?.getContext('2d')
    if (!canvas || !context) return
    const fit = (): void => {
      const scale = Math.min(2, window.devicePixelRatio || 1) / 2
      canvas.width = canvas.clientWidth * scale
      canvas.height = canvas.clientHeight * scale
    }
    fit()
    window.addEventListener('resize', fit)
    const dark = document.documentElement.classList.contains('dark')
    // The paper's own light, a little cooler: mist off the sea, not smoke.
    const tone = dark ? [70, 76, 84] : [238, 238, 234]
    let seed = 3
    const random = (): number => ((seed = (seed * 16807) % 2147483647) / 2147483647)
    const banks: Bank[] = Array.from({ length: 16 }, () => ({ x: random(), y: random(), r: 0.25 + random() * 0.35, drift: 0.008 + random() * 0.018, rise: 0.004 + random() * 0.01, phase: random() * Math.PI * 2 }))
    const start = performance.now()
    let frame = 0
    const tick = (now: number): void => {
      const t = (now - start) / MIST_MS
      const w = canvas.width
      const h = canvas.height
      context.clearRect(0, 0, w, h)
      // The veil: whole at first, gone by two thirds of the way, eased so the start lingers.
      const veil = Math.max(0, 1 - t * 1.5)
      context.fillStyle = `rgba(${tone.join(',')},${veil * veil * (3 - 2 * veil)})`
      context.fillRect(0, 0, w, h)
      // The banks: thick while the veil is, then thinning to wisps, the last to go.
      const thick = Math.max(0, 1 - t) ** 1.4
      for (const one of banks) {
        const x = ((one.x + one.drift * (now - start) / 1000 + 1) % 1.4 - 0.2) * w
        const y = (one.y - one.rise * (now - start) / 1000 + Math.sin(now / 3000 + one.phase) * 0.02) * h
        const r = one.r * Math.max(w, h) * (1 + t * 0.25)
        const fog = context.createRadialGradient(x, y, 0, x, y, r)
        fog.addColorStop(0, `rgba(${tone.join(',')},${0.55 * thick})`)
        fog.addColorStop(0.6, `rgba(${tone.join(',')},${0.2 * thick})`)
        fog.addColorStop(1, `rgba(${tone.join(',')},0)`)
        context.fillStyle = fog
        context.fillRect(x - r, y - r, r * 2, r * 2)
      }
      if (t < 1) frame = requestAnimationFrame(tick)
      else gone.current()
    }
    frame = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('resize', fit)
    }
  }, [])
  return <canvas ref={box} aria-hidden data-welcome-mist="" className="pointer-events-none absolute inset-0 z-30 h-full w-full" />
}
