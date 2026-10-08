import { useEffect, useRef } from 'react'
import type { MotionValue } from 'motion/react'
import { falloff } from '@/lib/proximity'

/**
 * A faint stream of light round the welcome's theme dial, saying "this turns,
 * and home is up there". Small dots in the colours of the theme being worn
 * drift along the rim toward the notch at the top and fade into it.
 *
 * As the pointer comes near they brighten, quicken a little and lean toward
 * it, like iron filings to a magnet. Over the ring they gather under the
 * pointer and run from there toward the notch, the way a drag would go. In a
 * drag they run with the ring, gather and glow at the notch as a swatch comes
 * home, and a few sparks rise from the swatch that lands when you let go.
 * Once you have turned it the idle stream all but stops: it has done its job.
 *
 * One canvas, drawn only while the window is seen (visible, on screen, and
 * focused or pointed at). Nothing at all with Motion off or Reduce motion:
 * the notch's own glow is enough.
 */

const CAP = 110
type Dot = { kind: 0 | 1; th: number; ro: number; w: number; x: number; y: number; vx: number; vy: number; age: number; life: number; size: number; col: string; a: number; ph: number }

const still = (): boolean => document.documentElement.dataset.motion === 'off' || matchMedia('(prefers-reduced-motion: reduce)').matches
/** -180..180 */
const wrapDeg = (deg: number): number => ((((deg + 180) % 360) + 360) % 360) - 180
const ease = (from: number, to: number, dt: number, rate: number): number => from + (to - from) * (1 - Math.exp(-dt * rate))
const rand = (a: number, b: number): number => a + Math.random() * (b - a)
/** 0..1, how light an `rgb(...)` colour looks. */
const luma = (col: string): number => {
  const [r = 0, g = 0, b = 0] = (col.match(/[\d.]+/g) ?? []).map(Number)
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
}

export type Sparks = { current: ((i: number) => void) | null }

export function DialParticles({ size, band, per, turn, at, touched, grabbing, light, sparks }: { size: number; band: number; per: number; turn: MotionValue<number>; at: number; touched: boolean; grabbing: boolean; light: boolean; sparks: Sparks }): React.JSX.Element | null {
  const canvas = useRef<HTMLCanvasElement>(null)
  // What a render knows, read by the loop without restarting it.
  const live = useRef({ at, touched, grabbing, light })
  live.current = { at, touched, grabbing, light }
  const pad = Math.round(size * 0.2)
  const full = size + pad * 2

  useEffect(() => {
    const el = canvas.current
    const dial = el?.parentElement
    const ctx = el?.getContext('2d')
    if (!el || !dial || !ctx) return
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    el.width = Math.round(full * dpr)
    el.height = Math.round(full * dpr)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    // A theme's three swatch colours, read from its swatch on the ring.
    const palettes = new Map<number, string[]>()
    const palette = (i: number): string[] => {
      let got = palettes.get(i)
      if (!got) {
        got = [...dial.querySelectorAll<HTMLElement>(`[data-detent="${i}"] .mf-swatch i`)].map((dot) => getComputedStyle(dot).backgroundColor)
        // A near-black grain reads as dust on a pale page and is lost on a dark one: only the lighter of the three.
        const lit = got.filter((col) => luma(col) > 0.28)
        if (lit.length) got = lit
        if (got.length) palettes.set(i, got)
        else got = ['rgb(160,160,160)']
      }
      return got
    }
    // On a pale page, a dark palette's three read as dust: its accent alone, the notch's own colour, reads as light.
    const pick = (i: number): string => {
      const all = palette(i)
      if (live.current.light && all.every((col) => luma(col) < 0.45)) return all[0]
      return all[Math.floor(Math.random() * all.length)]
    }

    // A soft round mote per colour, drawn once: bright in the middle, fading out (softer still on a pale page).
    const motes = new Map<string, HTMLCanvasElement>()
    const mote = (col: string, pale: boolean): HTMLCanvasElement => {
      const name = col + pale
      let got = motes.get(name)
      if (!got) {
        got = document.createElement('canvas')
        got.width = got.height = 32
        const g = got.getContext('2d')!
        const [r = 0, gr = 0, b = 0] = (col.match(/[\d.]+/g) ?? []).map(Number)
        const at = (a: number): string => `rgba(${r},${gr},${b},${a})`
        const fill = g.createRadialGradient(16, 16, 0, 16, 16, 16)
        fill.addColorStop(0, at(1))
        fill.addColorStop(pale ? 0.2 : 0.26, at(pale ? 0.75 : 0.95))
        fill.addColorStop(pale ? 0.45 : 0.36, at(pale ? 0.22 : 0.16))
        fill.addColorStop(1, at(0))
        g.fillStyle = fill
        g.fillRect(0, 0, 32, 32)
        motes.set(name, got)
      }
      return got
    }

    const c = full / 2
    const rim = size / 2 + 4
    const home = size / 2 - band * 0.6
    const dots: Dot[] = []
    const n = Math.round(360 / per)
    let near = 0
    let over = 0
    let grab = 0
    let quiet = live.current.touched ? 0.2 : 1
    let owed = 0
    let pointer: { x: number; y: number } | null = null
    let last = 0
    let frame = 0
    let seen = true
    let focused = document.hasFocus()
    let hovered = false

    sparks.current = (i) => {
      if (still()) return
      const count = 6 + Math.floor(Math.random() * 6)
      for (let k = 0; k < count && dots.length < CAP + 12; k++) {
        const angle = -Math.PI / 2 + rand(-1.25, 1.25)
        const speed = rand(40, 90)
        // From the swatch's edge, not its middle, so none are born hidden under it.
        const from = band * rand(0.38, 0.5)
        dots.push({ kind: 1, th: 0, ro: 0, w: 0, x: c + Math.cos(angle) * from, y: c - home + Math.sin(angle) * from * 0.8, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, age: 0, life: rand(0.7, 1.1), size: rand(1.4, 2.6), col: pick(i), a: rand(0.8, 1), ph: 0 })
      }
      wake()
    }

    const spawn = (velocity: number, pull: number, coming: number, under: number | null): void => {
      const { at: worn } = live.current
      const gather = grab * pull
      const r = Math.random()
      let th: number
      let ro = rand(-2, 4)
      let w = rand(10, 22)
      let col = pick(worn)
      if (r < gather * 0.6) {
        // Drawn in to the notch, in the colours of the swatch coming home.
        th = rand(8, 34) * (Math.random() < 0.5 ? -1 : 1)
        ro = rand(-6, 2)
        w = rand(26, 44)
        col = pick(coming)
      } else if (under !== null && r < 0.75 * over * (1 - grab)) {
        // Gathered under the pointer, to run from there toward the notch.
        th = under + rand(-12, 12)
      } else if (grab > 0.3 && Math.abs(velocity) > 30) {
        // In a turn: fed in from behind, so they stream with it.
        th = rand(-180, 180)
        w = rand(6, 14)
      } else th = rand(36, 178) * (Math.random() < 0.5 ? -1 : 1)
      dots.push({ kind: 0, th, ro, w, x: 0, y: 0, vx: 0, vy: 0, age: 0, life: rand(2.6, 4.4), size: rand(0.9, 1.9), col, a: rand(0.45, 1), ph: rand(0, Math.PI * 2) })
    }

    const draw = (now: number): void => {
      frame = 0
      if (still()) {
        ctx.clearRect(0, 0, full, full)
        dots.length = 0
        return
      }
      const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60
      last = now
      const { touched, grabbing: held, light: pale } = live.current

      // Where the pointer is, against the ring's band.
      const box = el.getBoundingClientRect()
      const scale = box.width / full || 1
      let under: number | null = null
      let closeness = 0
      let onBand = 0
      if (pointer) {
        const px = (pointer.x - box.left) / scale - c
        const py = (pointer.y - box.top) / scale - c
        const from = Math.hypot(px, py)
        const off = Math.max(0, from - size / 2, size / 2 - band - from)
        closeness = falloff(off, size * 0.55)
        onBand = off === 0 ? 1 : 0
        under = (Math.atan2(px, -py) * 180) / Math.PI
      }
      near = ease(near, closeness, dt, 5)
      over = ease(over, onBand, dt, 7)
      grab = ease(grab, held ? 1 : 0, dt, held ? 10 : 3)
      quiet = ease(quiet, touched ? 0.2 : 1, dt, 1.2)

      const deg = turn.get()
      const velocity = held || grab > 0.05 ? turn.getVelocity() : 0
      const pull = falloff(deg - Math.round(deg / per) * per, per / 2)
      const coming = ((Math.round(-deg / per) % n) + n) % n

      // As many as the moment asks for, fed in gently rather than all at once.
      const want = Math.min(CAP, 22 * quiet + 26 * near + 18 * over + grab * (16 + 16 * pull))
      let streams = dots.reduce((sum, dot) => sum + (dot.kind === 0 ? 1 : 0), 0)
      owed = Math.min(owed + dt * (8 + 50 * Math.max(near, grab)), 3)
      while (owed >= 1 && streams < want && dots.length < CAP) {
        spawn(velocity, pull, coming, under)
        streams += 1
        owed -= 1
      }

      ctx.clearRect(0, 0, full, full)
      ctx.globalCompositeOperation = pale ? 'source-over' : 'lighter'

      // The notch's light, in the colours of what is coming home.
      const glow = grab * pull * pull * 0.5 + over * 0.12 + near * 0.05
      if (glow > 0.01) {
        const gy = c - size / 2 + band * 0.25
        const g = ctx.createRadialGradient(c, gy, 0, c, gy, band * 1.1)
        const tint = palette(coming)[0]
        g.addColorStop(0, tint)
        g.addColorStop(1, 'transparent')
        ctx.globalAlpha = Math.min(0.5, glow) * (pale ? 0.5 : 0.7)
        ctx.fillStyle = g
        ctx.fillRect(c - band * 1.2, gy - band * 1.2, band * 2.4, band * 2.4)
      }

      const quick = 1 + 0.7 * near + 0.5 * over
      const bright = (0.2 + 0.2 * quiet + 0.4 * near + 0.25 * over + 0.4 * grab) * (pale ? 1.15 : 1)
      for (let k = dots.length - 1; k >= 0; k--) {
        const dot = dots[k]
        dot.age += dt
        if (dot.age >= dot.life) {
          dots.splice(k, 1)
          continue
        }
        let x: number
        let y: number
        let alpha: number
        const t = dot.age / dot.life
        if (dot.kind === 1) {
          // A spark: out from the landed swatch, slowing, gone.
          const drag = Math.exp(-dt * 3.2)
          dot.vx *= drag
          dot.vy = dot.vy * drag - dt * 6
          dot.x += dot.vx * dt
          dot.y += dot.vy * dt
          x = dot.x
          y = dot.y
          alpha = dot.a * (1 - t) ** 1.6 * (pale ? 0.9 : 1)
        } else {
          // Along the rim toward the notch (or with the ring, in a turn), fading into it.
          const toward = dot.th === 0 ? 0 : -Math.sign(dot.th)
          dot.th = wrapDeg(dot.th + (toward * dot.w * quick * (1 - 0.8 * grab) + velocity * 0.55 * grab) * dt)
          const arrive = falloff(Math.abs(dot.th), 16)
          if (arrive > 0.97 && grab < 0.5) {
            dots.splice(k, 1)
            continue
          }
          const r = rim + dot.ro + Math.sin(dot.age * 1.4 + dot.ph) * 1.4 - arrive * grab * band * 0.35
          const a = (dot.th * Math.PI) / 180
          x = c + Math.sin(a) * r
          y = c - Math.cos(a) * r
          alpha = dot.a * bright * Math.min(1, dot.age / 0.5) * Math.min(1, (1 - t) / 0.3) * (1 - arrive * (1 - grab) * 0.85)
          // Leaning toward the pointer, the nearer the more.
          if (pointer && near > 0.01) {
            const px = (pointer.x - box.left) / scale
            const py = (pointer.y - box.top) / scale
            const dx = px - x
            const dy = py - y
            const d = Math.hypot(dx, dy) || 1
            const lean = near * falloff(d, size * 0.45) * Math.min(d, 7 + 5 * over)
            x += (dx / d) * lean
            y += (dy / d) * lean
          }
        }
        if (alpha <= 0.004) continue
        // A grain of light with a soft halo, from one drawing per colour.
        const r = dot.size * 3
        ctx.globalAlpha = Math.min(1, alpha) * (pale ? 0.8 : 1)
        ctx.drawImage(mote(dot.col, pale), x - r, y - r, r * 2, r * 2)
      }
      ctx.globalAlpha = 1
      ctx.globalCompositeOperation = 'source-over'
      wake()
    }

    const running = (): boolean => seen && document.visibilityState === 'visible' && (focused || hovered) && !still()
    function wake(): void {
      if (frame || !running()) {
        if (!running()) last = 0
        return
      }
      frame = requestAnimationFrame(draw)
    }
    const sleep = (): void => {
      if (frame) cancelAnimationFrame(frame)
      frame = 0
      last = 0
    }
    const check = (): void => (running() ? wake() : sleep())

    const onMove = (event: PointerEvent): void => {
      pointer = { x: event.clientX, y: event.clientY }
      hovered = true
      wake()
    }
    const onLeave = (): void => {
      pointer = null
      hovered = false
      check()
    }
    const onFocus = (): void => ((focused = true), check())
    const onBlur = (): void => ((focused = false), check())
    const sight = new IntersectionObserver(([entry]) => ((seen = entry.isIntersecting), check()))
    sight.observe(el)
    window.addEventListener('pointermove', onMove, { passive: true })
    document.documentElement.addEventListener('pointerleave', onLeave)
    window.addEventListener('focus', onFocus)
    window.addEventListener('blur', onBlur)
    document.addEventListener('visibilitychange', check)
    wake()
    return () => {
      sleep()
      sparks.current = null
      sight.disconnect()
      window.removeEventListener('pointermove', onMove)
      document.documentElement.removeEventListener('pointerleave', onLeave)
      window.removeEventListener('focus', onFocus)
      window.removeEventListener('blur', onBlur)
      document.removeEventListener('visibilitychange', check)
    }
  }, [size, band, per, full, turn, sparks])

  if (still()) return null
  return <canvas ref={canvas} aria-hidden className="pointer-events-none absolute" style={{ left: -pad, top: -pad, width: full, height: full }} />
}
