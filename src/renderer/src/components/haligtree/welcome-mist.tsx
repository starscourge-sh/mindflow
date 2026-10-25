import { useEffect, useRef } from 'react'
import { ARRIVE_MS } from '@/lib/sound'

/** How long the mist takes to lift, in ms: whole until just before the first words, wisps a few seconds after. */
export const MIST_MS = 11000

type Bank = { x: number; y: number; r: number; drift: number; rise: number; phase: number }

/** 0 to 1, eased at both ends, as `t` goes from `a` to `b`. */
const between = (t: number, a: number, b: number): number => {
  const k = Math.max(0, Math.min(1, (t - a) / (b - a)))
  return k * k * (3 - 2 * k)
}

/**
 * The welcome's arrival, once (after Arc's and Dia's): a sea mist over the
 * whole window, banks of it drifting slowly sideways and up. Light gathers in
 * it where the words will be while the chord rises; then each line, as it
 * resolves, clears the mist around itself (any element marked
 * `data-mist-clear`), so the words come out of the mist rather than sit on
 * it. The rest thins to wisps and goes. `hurry` (Esc or a click) lifts it at
 * once; `onGone` once it has. Under reduced motion the welcome shows none of it.
 */
export function WelcomeMist({ onGone, hurry = false }: { onGone: () => void; hurry?: boolean }): React.JSX.Element {
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
    // The paper's own light, a little cooler: mist off the sea, not smoke. Its glow a little warmer and brighter. Read each frame: the theme can land after the mist does.
    let tone = ''
    let glow = ''
    let seed = 3
    const random = (): number => ((seed = (seed * 16807) % 2147483647) / 2147483647)
    const banks: Bank[] = Array.from({ length: 16 }, () => ({ x: random(), y: random(), r: 0.25 + random() * 0.35, drift: 0.008 + random() * 0.018, rise: 0.004 + random() * 0.01, phase: random() * Math.PI * 2 }))
    // When each line first asked to be cleared: its clearing opens from then.
    const opened = new Map<Element, number>()
    const start = performance.now()
    const arrive = ARRIVE_MS / MIST_MS
    let frame = 0
    const tick = (now: number): void => {
      const t = (now - start) / MIST_MS
      const s = (now - start) / 1000
      const w = canvas.width
      const h = canvas.height
      const dark = document.documentElement.classList.contains('dark')
      tone = dark ? '70,76,84' : '238,238,234'
      glow = dark ? '118,116,108' : '255,252,244'
      context.globalCompositeOperation = 'source-over'
      context.clearRect(0, 0, w, h)
      // The veil: whole through the silence and the chord, thinning from just before the words, gone a few seconds after.
      const veil = 1 - between(t, arrive * 0.75, arrive + 0.3)
      context.fillStyle = `rgba(${tone},${veil})`
      context.fillRect(0, 0, w, h)
      // The light: gathering in the mist where the words will stand while the chord rises, gone once they have.
      const light = between(t, arrive * 0.4, arrive * 0.95) * (1 - between(t, arrive, arrive + 0.2))
      if (light > 0) {
        const x = w * 0.3
        const y = h * 0.45
        const r = Math.max(w, h) * 0.45
        const sun = context.createRadialGradient(x, y, 0, x, y, r)
        sun.addColorStop(0, `rgba(${glow},${0.55 * light})`)
        sun.addColorStop(1, `rgba(${glow},0)`)
        context.fillStyle = sun
        context.fillRect(0, 0, w, h)
      }
      // The banks: thick while the veil is, then thinning to wisps, the last to go.
      const thick = (1 - between(t, arrive * 0.9, 1)) ** 1.2
      for (const one of banks) {
        const x = ((one.x + one.drift * s + 1) % 1.4 - 0.2) * w
        const y = (one.y - one.rise * s + Math.sin(now / 3000 + one.phase) * 0.02) * h
        const r = one.r * Math.max(w, h) * (1 + t * 0.25)
        const fog = context.createRadialGradient(x, y, 0, x, y, r)
        fog.addColorStop(0, `rgba(${tone},${0.55 * thick})`)
        fog.addColorStop(0.6, `rgba(${tone},${0.2 * thick})`)
        fog.addColorStop(1, `rgba(${tone},0)`)
        context.fillStyle = fog
        context.fillRect(x - r, y - r, r * 2, r * 2)
      }
      // The clearings: a soft oval of mist taken away around each line as it resolves, opening over a second.
      const here = canvas.getBoundingClientRect()
      const k = w / (here.width || 1)
      context.globalCompositeOperation = 'destination-out'
      for (const line of document.querySelectorAll('[data-mist-clear]')) {
        if (!opened.has(line)) opened.set(line, now)
        const open = between(now - (opened.get(line) ?? now), 0, 1100)
        const rect = line.getBoundingClientRect()
        const cx = (rect.left + rect.width / 2 - here.left) * k
        const cy = (rect.top + rect.height / 2 - here.top) * k
        // Wide and soft, never a hole with an edge: a long falloff, and never flatter than half as tall as wide.
        const rx = (rect.width / 2 + 260) * k * (0.7 + 0.3 * open)
        const ry = Math.max((rect.height / 2 + 160) * k, rx * 0.5) * (0.7 + 0.3 * open)
        context.save()
        context.translate(cx, cy)
        context.scale(1, ry / rx)
        const clear = context.createRadialGradient(0, 0, 0, 0, 0, rx)
        clear.addColorStop(0, `rgba(0,0,0,${0.85 * open})`)
        clear.addColorStop(0.3, `rgba(0,0,0,${0.72 * open})`)
        clear.addColorStop(0.65, `rgba(0,0,0,${0.28 * open})`)
        clear.addColorStop(1, 'rgba(0,0,0,0)')
        context.fillStyle = clear
        context.fillRect(-rx, -rx, rx * 2, rx * 2)
        context.restore()
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
  // Hurried: the whole mist goes in half a second, as a breath clears a pane.
  useEffect(() => {
    if (!hurry) return
    const done = setTimeout(() => gone.current(), 520)
    return () => clearTimeout(done)
  }, [hurry])
  return <canvas ref={box} aria-hidden data-welcome-mist="" className={`pointer-events-none absolute inset-0 z-30 h-full w-full transition-opacity duration-500 ease-out ${hurry ? 'opacity-0' : ''}`} />
}
