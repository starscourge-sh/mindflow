import { useEffect, useRef } from 'react'
import { ARRIVE_MS } from '@/lib/sound'

/** How long the mist takes to lift, in ms: whole until just before the first words, wisps a few seconds after. */
export const MIST_MS = ARRIVE_MS + 6000

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
    // When the first line asked to be cleared: the clearing opens from then. Where it is, eased.
    let openedAt = 0
    let held: { cx: number; cy: number; rx: number; ry: number } | null = null
    const start = performance.now()
    const arrive = ARRIVE_MS / MIST_MS
    let frame = 0
    const tick = (now: number): void => {
      const t = (now - start) / MIST_MS
      const s = (now - start) / 1000
      const w = canvas.width
      const h = canvas.height
      // The page's own colour, whatever the theme: lifted a little toward white for the mist, more for its glow.
      const page = getComputedStyle(canvas.parentElement ?? document.body).backgroundColor.match(/[\d.]+/g)?.slice(0, 3).map(Number) ?? [240, 236, 226]
      const dark = page[0] + page[1] + page[2] < 384
      const lift = (by: number): string => page.map((one) => Math.round(one + (255 - one) * by)).join(',')
      tone = lift(dark ? 0.06 : 0.35)
      glow = lift(dark ? 0.16 : 0.7)
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
      // The clearing: one, around every line resolved so far, opening over a second and growing
      // smoothly as each line joins it. One clearing with a bell-shaped falloff, never a stack of
      // ovals: their overlapping rims read as rings, a darker oval on a dark page.
      const here = canvas.getBoundingClientRect()
      const k = w / (here.width || 1)
      let union: { l: number; t: number; r: number; b: number } | null = null
      for (const line of document.querySelectorAll('[data-mist-clear]')) {
        openedAt ||= now
        const rect = line.getBoundingClientRect()
        union = union ? { l: Math.min(union.l, rect.left), t: Math.min(union.t, rect.top), r: Math.max(union.r, rect.right), b: Math.max(union.b, rect.bottom) } : { l: rect.left, t: rect.top, r: rect.right, b: rect.bottom }
      }
      if (union) {
        const goal = { cx: ((union.l + union.r) / 2 - here.left) * k, cy: ((union.t + union.b) / 2 - here.top) * k, rx: (union.r - union.l) / 2 * k, ry: (union.b - union.t) / 2 * k }
        // Eased toward the lines' box a little each frame, so a new line widens it rather than adds to it.
        if (!held) held = { ...goal }
        else for (const key of ['cx', 'cy', 'rx', 'ry'] as const) held[key] += (goal[key] - held[key]) * 0.06
        const open = between(now - openedAt, 0, 1100)
        const reach = Math.max(w, h)
        const rx = (held.rx + reach * 0.45) * (0.75 + 0.25 * open)
        const ry = Math.max(held.ry + reach * 0.34, rx * 0.8) * (0.75 + 0.25 * open)
        context.globalCompositeOperation = 'destination-out'
        context.save()
        context.translate(held.cx, held.cy)
        context.scale(1, ry / rx)
        const clear = context.createRadialGradient(0, 0, 0, 0, 0, rx)
        // A bell's curve, in ten steps: no flat middle and no rim.
        for (let i = 0; i <= 10; i++) clear.addColorStop(i / 10, `rgba(0,0,0,${0.75 * open * Math.exp(-(((i / 10) * 2.6) ** 2))})`)
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
