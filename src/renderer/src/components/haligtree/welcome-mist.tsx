import { useEffect, useRef } from 'react'
import { ARRIVE_MS } from '@/lib/sound'

/** How long the mist takes to lift, in ms: whole until just before the first words, wisps a few seconds after. */
const MIST_MS = ARRIVE_MS + 6000
/** Over the desktop: the beat in which nothing is drawn at all, then how long the fog takes to come in, in ms. */
export const CLEAR_MS = 350
export const IN_MS = 2000
/** Over the desktop: how long the fog takes to lift off the window once the page's own ground has come up under it, in ms. */
const LIFT_MS = 700
/** The one dark shape passing close, as a camera drifts past a tree in the fog: when it crosses, in ms of the fog's own clock. */
const TRUNK = { from: 2600, to: 6000 }

type Bank = { x: number; y: number; r: number; drift: number; rise: number; phase: number; depth: number }
/** What the arrival probe reads: every frame drawn over the desktop, as [ms, the fog's amount, and the drawn window's box: x, y, width, height]. */
type Trace = { frames: [number, number, number, number, number, number][]; landed: boolean }

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
 *
 * `desk`: over the desktop, in a window made see-through for it (main:
 * arrival.ts), as Dia's opening is: a fog, not a veil. Nothing is drawn for a
 * beat; then, over the Mac's own blur of the desktop (main fades it in), a
 * fog comes in from nothing over two seconds, evenly to the window's edges, and
 * whole once in, so nothing of the desktop can be read behind it: lit from
 * the middle, its banks drifting at three depths (the far ones slow and pale,
 * the near ones quicker and darker), a slow band of light passing over them,
 * and once a soft dark trunk passing close by, as a camera drifts past a tree.
 * The fog is the scene the title stands in, and the window's ground after it
 * (welcome.tsx shapes it into the window); `lift` lifts it off the window's
 * own page once that is up under it, then `onGone`. What covers the desktop only ever grows.
 * `onStart` once, at its first frame; `onWhole` once it is whole over the desktop. `onDrawable` once, as its first frame comes, even while a probe holds it.
 */
export function WelcomeMist({ onGone, hurry = false, desk = false, lift = false, onStart, onWhole, onDrawable }: { onGone: () => void; hurry?: boolean; desk?: boolean; lift?: boolean; onStart?: () => void; onWhole?: () => void; onDrawable?: () => void }): React.JSX.Element {
  const box = useRef<HTMLCanvasElement>(null)
  const gone = useRef(onGone)
  gone.current = onGone
  const begun = useRef(onStart)
  begun.current = onStart
  const drawable = useRef(onDrawable)
  drawable.current = onDrawable
  const whole = useRef(onWhole)
  whole.current = onWhole
  const asked = useRef({ lift, hurry })
  asked.current = { lift, hurry }
  useEffect(() => {
    const canvas = box.current
    const context = canvas?.getContext('2d')
    if (!canvas || !context) return
    const fit = (): void => {
      // Mist has no fine detail: over the desktop, where it covers a whole screen, a quarter of the pixels.
      const scale = Math.min(2, window.devicePixelRatio || 1) / (desk ? 4 : 2)
      canvas.width = Math.max(1, Math.round(canvas.clientWidth * scale))
      canvas.height = Math.max(1, Math.round(canvas.clientHeight * scale))
    }
    fit()
    window.addEventListener('resize', fit)
    // The paper's own light, a little cooler: mist off the sea, not smoke. Its glow a little warmer and brighter. Read each frame: the theme can land after the mist does.
    let tone = ''
    let glow = ''
    let seed = 3
    const random = (): number => ((seed = (seed * 16807) % 2147483647) / 2147483647)
    // Over the desktop each bank lies at one of three depths: the far ones (0) slow, small and pale, the near ones (2) quicker, larger and darker.
    const banks: Bank[] = Array.from({ length: 16 }, (_, i) => ({ x: random(), y: random(), r: 0.25 + random() * 0.35, drift: 0.008 + random() * 0.018, rise: 0.004 + random() * 0.01, phase: random() * Math.PI * 2, depth: i % 3 }))
    // When the first line asked to be cleared: the clearing opens from then. Where it is, eased.
    let openedAt = 0
    let held: { cx: number; cy: number; rx: number; ry: number } | null = null
    // Over the desktop the clock starts with the first frame drawn, never before the window can be seen.
    let start = desk ? 0 : performance.now()
    let framed = false
    const arrive = ARRIVE_MS / MIST_MS
    let frame = 0
    // Over the desktop: when the fog began to lift off the window's own page, and whether it has said it is whole.
    let liftAt = 0
    let wholeSaid = false
    // Over the desktop the fog's coming in is the canvas's own opacity, run by the browser off the page's thread: a
    // first run's page is at its busiest in those two seconds, and a fade stepped by the page's frames would stutter with it.
    let fade: Animation | null = null
    let pageRead = -1
    let page = [240, 236, 226]
    let warm = [143, 92, 12]
    const trace: Trace | null = desk ? ((window as unknown as { haligtreeArrival: Trace }).haligtreeArrival = { frames: [], landed: false }) : null
    const scene = desk ? canvas.closest<HTMLElement>('[data-arrival-scene]') : null
    // A theme's colour in any form (hex, rgb, oklch), as the screen's red, green and blue: painted into one pixel and read back.
    const pixel = desk ? document.createElement('canvas').getContext('2d', { willReadFrequently: true }) : null
    const rgbOf = (css: string): number[] => {
      if (!pixel) return page
      pixel.canvas.width = pixel.canvas.height = 1
      pixel.fillStyle = css
      pixel.fillRect(0, 0, 1, 1)
      return [...pixel.getImageData(0, 0, 1, 1).data.slice(0, 3)]
    }
    // Over the desktop, one frame of the fog: whole once in, lit from the middle, its banks at three depths, a slow band of
    // light over them, and once a dark trunk passing close.
    const fog = (now: number, s: number, w: number, h: number, dark: boolean): void => {
      if (asked.current.lift && !liftAt) liftAt = now
      const amount = liftAt ? 1 - between(now - liftAt, 0, LIFT_MS) : 1
      const come = Number(fade?.effect?.getComputedTiming().progress ?? 1)
      const ms = now - start
      const mix = (from: number[], to: number[], by: number): number[] => from.map((one, i) => Math.round(one + (to[i] - one) * by))
      const rgb = (colour: number[], alpha: number): string => `rgba(${colour.join(',')},${alpha})`
      // Warmed by the theme's accent: a deep warm fog with light in it in a dark look, a pale one in a light look.
      const paper = [255, 250, 240]
      const base = mix(mix(page, warm, dark ? 0.14 : 0.08), paper, dark ? 0.07 : 0.42)
      const pale = mix(mix(page, warm, dark ? 0.18 : 0.1), paper, dark ? 0.34 : 0.78)
      const deep = mix(mix(page, warm, dark ? 0.1 : 0.14), [0, 0, 0], dark ? 0.45 : 0.18)
      context.globalAlpha = amount
      // Its ground: whole, so nothing behind it reads.
      context.fillStyle = rgb(base, 1)
      context.fillRect(0, 0, w, h)
      // The light in it, in the middle where the title will stand, gathering as the spark does.
      const light = 0.55 + 0.45 * between(s, 1.2, 5.5)
      const reach = Math.max(w, h) * 0.5
      const sun = context.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, reach)
      sun.addColorStop(0, rgb(pale, 0.85 * light))
      sun.addColorStop(0.5, rgb(pale, 0.38 * light))
      sun.addColorStop(1, rgb(pale, 0))
      context.fillStyle = sun
      context.fillRect(0, 0, w, h)
      // The banks, far to near: the far ones slow, small and pale, the near ones quicker, larger and in deeper shade.
      for (const depth of [0, 1, 2]) {
        const speed = [0.6, 1.2, 2.2][depth]
        const size = [0.8, 1, 1.35][depth]
        const most = [0.42, 0.45, 0.38][depth]
        for (const one of banks) {
          if (one.depth !== depth) continue
          // A bank comes round again only from wholly off the screen.
          const x = ((one.x * 2.2 + one.drift * speed * s) % 2.2 - 0.6) * w
          const y = (one.y - one.rise * speed * s + Math.sin(now / 3000 + one.phase) * 0.02) * h
          const r = one.r * Math.max(w, h) * size
          const ink = depth === 0 ? pale : depth === 2 ? deep : one.phase > Math.PI ? pale : base
          const bank = context.createRadialGradient(x, y, 0, x, y, r)
          bank.addColorStop(0, rgb(ink, most))
          bank.addColorStop(0.6, rgb(ink, most * 0.35))
          bank.addColorStop(1, rgb(ink, 0))
          context.fillStyle = bank
          context.fillRect(x - r, y - r, r * 2, r * 2)
        }
      }
      // A slow band of light passing over the banks, aslant, once every fourteen seconds.
      context.save()
      context.translate(w * (((ms / 14000) % 1) * 2.4 - 0.7), h / 2)
      context.rotate(-0.35)
      const band = context.createLinearGradient(-w * 0.18, 0, w * 0.18, 0)
      band.addColorStop(0, rgb(pale, 0))
      band.addColorStop(0.5, rgb(pale, dark ? 0.24 : 0.28))
      band.addColorStop(1, rgb(pale, 0))
      context.fillStyle = band
      context.fillRect(-w * 0.18, -h * 1.5, w * 0.36, h * 3)
      context.restore()
      // Once, a dark trunk passing close by, right to left, as soft as anything this near the eye is.
      const by = between(ms, TRUNK.from, TRUNK.to)
      if (by > 0 && by < 1) {
        const x = w * (1.2 - 1.4 * by)
        const half = w * 0.09
        const trunk = context.createLinearGradient(x - half, 0, x + half, 0)
        trunk.addColorStop(0, rgb(deep, 0))
        trunk.addColorStop(0.5, rgb(deep, dark ? 0.55 : 0.3))
        trunk.addColorStop(1, rgb(deep, 0))
        context.fillStyle = trunk
        context.fillRect(x - half, 0, half * 2, h)
      }
      context.globalAlpha = 1
      if (!wholeSaid && ms >= CLEAR_MS + IN_MS) (wholeSaid = true), whole.current?.()
      // For the arrival probe: the fog's amount, and where the window drawn round it stands now.
      if (trace && trace.frames.length < 4000) {
        const at = scene?.getBoundingClientRect()
        const [x, y, width, height] = (at ? [at.x, at.y, at.width, at.height] : [0, 0, 0, 0]).map((one) => Number(one.toFixed(2)))
        trace.frames.push([Number(ms.toFixed(1)), Number((come * amount).toFixed(4)), x, y, width, height])
      }
      if (liftAt && amount <= 0) return finish()
      frame = requestAnimationFrame(tick)
    }
    const tick = (now: number): void => {
      // Its first frame due: the page can draw it, so a window made for it may be shown now (welcome.tsx), held or not.
      if (!framed) (framed = true), drawable.current?.()
      // Held by the arrival probe (qa/welcome-arrival.mjs), to read the page before the mist's first step: the clock has not started.
      if (desk && document.documentElement.hasAttribute('data-arrival-hold')) return void (frame = requestAnimationFrame(tick))
      // Its first frame, with the window there to be seen: said once, for what keeps the mist's time (the spark in it, welcome.tsx).
      if (!start) begun.current?.()
      start ||= now
      // Eased at both ends, as everything in the mist is (`between`): slow at first, as if you are not sure anything came.
      if (desk) fade ??= canvas.animate([{ opacity: 0 }, { opacity: 1 }], { delay: CLEAR_MS, duration: IN_MS, fill: 'both', easing: 'ease-in-out' })
      // Looked away from as it lifts (the window behind another, or hidden): it is simply gone, not drawn on unseen.
      if (now - start > 1000 && !document.documentElement.hasAttribute('data-awake')) return finish()
      const t = (now - start) / MIST_MS
      const s = (now - start) / 1000
      const w = canvas.width
      const h = canvas.height
      // The page's own colour, whatever the theme: lifted a little toward white for the mist, more for its glow.
      // Over the desktop the welcome has no page behind it to read, so the theme's own is asked for, twice a second, and
      // its accent with it: the fog is warmed by it, one family with the app.
      if (!desk) page = getComputedStyle(canvas.parentElement ?? document.body).backgroundColor.match(/[\d.]+/g)?.slice(0, 3).map(Number) ?? [240, 236, 226]
      else if (pageRead < 0 || now - pageRead > 500) {
        pageRead = now
        const read = getComputedStyle(canvas)
        page = rgbOf(read.color)
        warm = rgbOf(read.outlineColor)
      }
      const dark = page[0] + page[1] + page[2] < 384
      const lift = (by: number): string => page.map((one) => Math.round(one + (255 - one) * by)).join(',')
      tone = lift(dark ? 0.06 : 0.35)
      glow = lift(dark ? 0.16 : 0.7)
      context.globalCompositeOperation = 'source-over'
      context.clearRect(0, 0, w, h)
      if (desk) return fog(now, s, w, h, dark)
      // The veil: whole through the silence and the chord, thinning from just before the words, gone a few seconds after.
      const veil = 1 - between(t, arrive * 0.75, arrive + 0.3)
      if (veil > 0) {
        context.fillStyle = `rgba(${tone},${veil})`
        context.fillRect(0, 0, w, h)
      }
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
      for (let i = 0; i < banks.length; i++) {
        const one = banks[i]
        const x = ((one.x + one.drift * s + 1) % 1.4 - 0.2) * w
        const y = (one.y - one.rise * s + Math.sin(now / 3000 + one.phase) * 0.02) * h
        const r = one.r * Math.max(w, h) * (1 + t * 0.25)
        const mist = context.createRadialGradient(x, y, 0, x, y, r)
        mist.addColorStop(0, `rgba(${tone},${0.55 * thick})`)
        mist.addColorStop(0.6, `rgba(${tone},${0.2 * thick})`)
        mist.addColorStop(1, `rgba(${tone},0)`)
        context.fillStyle = mist
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
    // Over the desktop the fog goes once lifted off the window's own page, or looked away from.
    const finish = (): void => {
      if (trace) trace.landed = true
      gone.current()
    }
    frame = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(frame)
      fade?.cancel()
      window.removeEventListener('resize', fit)
    }
  }, [desk])
  // Hurried: the whole mist goes in half a second, as a breath clears a pane. Over the desktop it stays, the window's ground (welcome.tsx).
  useEffect(() => {
    if (!hurry || desk) return
    const done = setTimeout(() => gone.current(), 520)
    return () => clearTimeout(done)
  }, [hurry, desk])
  // Over the desktop its colours are the theme's page and accent, carried as the canvas's own ink and outline for the fog to read.
  return <canvas ref={box} aria-hidden data-welcome-mist={desk ? 'desk' : ''} style={desk ? { color: 'var(--background)', outlineColor: 'var(--primary)' } : undefined} className={`pointer-events-none absolute inset-0 h-full w-full ${desk ? '' : `z-30 transition-opacity duration-500 ease-out ${hurry ? 'opacity-0' : ''}`}`} />
}
