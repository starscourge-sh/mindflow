import { useEffect, useLayoutEffect, useRef } from 'react'
import { ARRIVE_MS } from '@/lib/sound'

/** How long the mist takes to lift, in ms: whole until just before the first words, wisps a few seconds after. */
const MIST_MS = ARRIVE_MS + 6000
/** Over the desktop: the beat in which nothing is drawn at all, then how long the mist takes to come in, in ms. */
export const CLEAR_MS = 350
export const IN_MS = 2000
/** Over the desktop: how stiff the spring is that draws the mist in to the window (a second or so, no bounce: whole and lifted before the title lifts, welcome-title.tsx), and at once (Esc, a click). */
const DRAW = 7
const DRAW_AT_ONCE = 24

type Bank = { x: number; y: number; r: number; drift: number; rise: number; phase: number }
/** What the arrival probe reads: every frame drawn over the desktop, as [ms, the mist's amount, the window's page, the soft edge in px]. */
type Trace = { frames: [number, number, number, number][]; landed: boolean }

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
 * arrival.ts). Nothing is drawn for a beat; then the same banks come in from
 * nothing over two seconds, soft at the screen's edges so no sheet is seen,
 * the desktop still showing faintly through, and they stay, the light
 * gathered behind the title. When `drawIn` is set the mist draws in to the
 * window on one spring: the window's own page (`plate`) comes up under it as
 * its soft edge hardens out to the window's own, and only once the page is
 * whole does the mist lift off it. What covers the desktop only ever grows.
 * `onStart` once, at its first frame.
 */
export function WelcomeMist({ onGone, hurry = false, desk = false, drawIn = false, plate, onStart }: { onGone: () => void; hurry?: boolean; desk?: boolean; drawIn?: boolean; plate?: React.RefObject<HTMLElement | null>; onStart?: () => void }): React.JSX.Element {
  const box = useRef<HTMLCanvasElement>(null)
  const gone = useRef(onGone)
  gone.current = onGone
  const begun = useRef(onStart)
  begun.current = onStart
  const asked = useRef({ drawIn, hurry })
  asked.current = { drawIn, hurry }
  // Over the desktop the window's page is not drawn until the mist draws in: set before the first paint, given back after.
  useLayoutEffect(() => {
    const page = desk ? plate?.current : null
    if (!page) return
    page.style.opacity = '0'
    return () => void page.style.removeProperty('opacity')
  }, [desk, plate])
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
    const banks: Bank[] = Array.from({ length: 16 }, () => ({ x: random(), y: random(), r: 0.25 + random() * 0.35, drift: 0.008 + random() * 0.018, rise: 0.004 + random() * 0.01, phase: random() * Math.PI * 2 }))
    // When the first line asked to be cleared: the clearing opens from then. Where it is, eased.
    let openedAt = 0
    let held: { cx: number; cy: number; rx: number; ry: number } | null = null
    // Over the desktop the clock starts with the first frame drawn, never before the window can be seen.
    let start = desk ? 0 : performance.now()
    const arrive = ARRIVE_MS / MIST_MS
    let frame = 0
    // Over the desktop: when the drawing in began, and when the window's page was whole and the mist began to lift off it.
    let inAt = 0
    let wholeAt = 0
    // Over the desktop the mist's coming in is the canvas's own opacity, run by the browser off the page's thread: a
    // first run's page is at its busiest in those two seconds, and a fade stepped by the page's frames would stutter with it.
    let fade: Animation | null = null
    let pageRead = -1
    let page = [240, 236, 226]
    const trace: Trace | null = desk ? ((window as unknown as { haligtreeArrival: Trace }).haligtreeArrival = { frames: [], landed: false }) : null
    const tick = (now: number): void => {
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
      // Over the desktop the welcome has no page behind it to read, so the theme's own is asked for, twice a second.
      if (!desk) page = getComputedStyle(canvas.parentElement ?? document.body).backgroundColor.match(/[\d.]+/g)?.slice(0, 3).map(Number) ?? [240, 236, 226]
      else if (pageRead < 0 || now - pageRead > 500) (pageRead = now), (page = getComputedStyle(canvas).color.match(/[\d.]+/g)?.slice(0, 3).map(Number) ?? page)
      const dark = page[0] + page[1] + page[2] < 384
      const lift = (by: number): string => page.map((one) => Math.round(one + (255 - one) * by)).join(',')
      tone = lift(dark ? 0.06 : 0.35)
      glow = lift(dark ? 0.16 : 0.7)
      // Over the desktop: how much of the mist there is (nothing for a beat, then in over two seconds, and off only once
      // the window's page is whole under it), how much of the window's page, and how soft the mist's edge still is.
      let amount = 1
      let pageUp = 0
      let come = 1
      if (desk) {
        if (asked.current.drawIn && !inAt) inAt = now
        const stiff = asked.current.hurry ? DRAW_AT_ONCE : DRAW
        const u = inAt ? (now - inAt) / 1000 : 0
        // A spring with no bounce, by the clock: it never passes the window's own edge and never comes back from it.
        pageUp = inAt ? 1 - (1 + stiff * u) * Math.exp(-stiff * u) : 0
        if (pageUp > 0.995) (pageUp = 1), (wholeAt ||= now)
        // What is drawn is whole from the start (its coming in is the canvas's opacity, above) and lifts only once the page is whole.
        amount = 1 - (wholeAt ? between(now - wholeAt, 0, asked.current.hurry ? 240 : 600) : 0)
        come = Number(fade?.effect?.getComputedTiming().progress ?? 1)
        if (plate?.current) plate.current.style.opacity = String(pageUp)
      }
      context.globalCompositeOperation = 'source-over'
      context.clearRect(0, 0, w, h)
      // Over the desktop: what is drawn so far thins to nothing over `by` pixels in from each edge of the screen.
      const thinEdges = (by: number): void => {
        if (by < 1) return
        context.globalCompositeOperation = 'destination-out'
        const edge = (x0: number, y0: number, x1: number, y1: number, x: number, y: number, width: number, height: number): void => {
          const ramp = context.createLinearGradient(x0, y0, x1, y1)
          for (let i = 0; i <= 6; i++) ramp.addColorStop(i / 6, `rgba(0,0,0,${1 - between(i / 6, 0, 1)})`)
          context.fillStyle = ramp
          context.fillRect(x, y, width, height)
        }
        edge(0, 0, by, 0, 0, 0, by, h)
        edge(w, 0, w - by, 0, w - by, 0, by, h)
        edge(0, 0, 0, by, 0, 0, w, by)
        edge(0, h, 0, h - by, 0, h - by, w, by)
        context.globalCompositeOperation = 'source-over'
      }
      // Over the desktop the mist has no sheet's outline. Its even veil and its light lie in a round bank in the middle
      // of the screen, whole where the title stands and thinning to nothing before the screen's edges and corners; the
      // drifting banks, drawn after, reach on past it and give out only near the edges (`soft`), so the mist ends in
      // banks, as mist does. As it draws in, the round bank spreads out to the window's corners and the edge hardens
      // out to the window's own.
      const soft = desk ? Math.round(Math.min(w, h) * 0.136 * (1 - pageUp)) : 0
      const roundBank = (): void => {
        const rx = w * 0.56 * (1 + 1.1 * pageUp)
        const ry = h * 0.6 * (1 + 1.1 * pageUp)
        context.globalCompositeOperation = 'destination-in'
        context.save()
        context.translate(w / 2, h / 2)
        context.scale(1, ry / rx)
        const shape = context.createRadialGradient(0, 0, 0, 0, 0, rx)
        for (let i = 0; i <= 8; i++) shape.addColorStop(i / 8, `rgba(0,0,0,${1 - between(i / 8, 0.4, 1)})`)
        context.fillStyle = shape
        context.fillRect(-w * 2, -h * 4, w * 4, h * 8)
        context.restore()
        context.globalCompositeOperation = 'source-over'
      }
      // The veil: whole through the silence and the chord, thinning from just before the words, gone a few seconds after.
      // Over the desktop it is never whole: the desktop's own picture stays, greyed, behind it.
      const veil = desk ? 0.62 * amount : 1 - between(t, arrive * 0.75, arrive + 0.3)
      if (veil > 0) {
        context.fillStyle = `rgba(${tone},${veil})`
        context.fillRect(0, 0, w, h)
      }
      // The light: gathering in the mist where the words will stand while the chord rises, gone once they have.
      // Over the desktop it stays, in the middle, behind the title: the words stand on it, not on the desktop's picture.
      const light = desk ? (0.35 + 0.65 * between(s, 1.2, 5.5)) * amount : between(t, arrive * 0.4, arrive * 0.95) * (1 - between(t, arrive, arrive + 0.2))
      if (light > 0) {
        const x = w * (desk ? 0.5 : 0.3)
        const y = h * (desk ? 0.5 : 0.45)
        const r = Math.max(w, h) * 0.45
        const sun = context.createRadialGradient(x, y, 0, x, y, r)
        sun.addColorStop(0, `rgba(${glow},${(desk ? 0.8 : 0.55) * light})`)
        sun.addColorStop(desk ? 0.45 : 1, `rgba(${glow},${desk ? 0.4 * light : 0})`)
        sun.addColorStop(1, `rgba(${glow},0)`)
        context.fillStyle = sun
        context.fillRect(0, 0, w, h)
      }
      if (desk) roundBank()
      // The banks: thick while the veil is, then thinning to wisps, the last to go.
      // Over the desktop they are what is seen: thinner each, some in the glow's lighter tone, so bands of light and shade drift across.
      const thick = desk ? amount : (1 - between(t, arrive * 0.9, 1)) ** 1.2
      for (let i = 0; i < banks.length; i++) {
        const one = banks[i]
        // Over the desktop a bank comes round again only from wholly off the screen: seen through, a bank that jumped would show.
        const x = desk ? ((one.x * 2.2 + one.drift * 2.4 * s) % 2.2 - 0.6) * w : ((one.x + one.drift * s + 1) % 1.4 - 0.2) * w
        const y = (one.y - one.rise * s + Math.sin(now / 3000 + one.phase) * 0.02) * h
        const r = one.r * Math.max(w, h) * (1 + (desk ? 0 : t * 0.25))
        const ink = desk && i % 3 === 0 ? glow : tone
        const fog = context.createRadialGradient(x, y, 0, x, y, r)
        fog.addColorStop(0, `rgba(${ink},${(desk ? 0.42 : 0.55) * thick})`)
        fog.addColorStop(0.6, `rgba(${ink},${(desk ? 0.15 : 0.2) * thick})`)
        fog.addColorStop(1, `rgba(${ink},0)`)
        context.fillStyle = fog
        context.fillRect(x - r, y - r, r * 2, r * 2)
      }
      if (desk) {
        thinEdges(soft)
        if (trace) {
          if (trace.frames.length < 4000) trace.frames.push([Number((now - start).toFixed(1)), Number((come * amount).toFixed(4)), Number(pageUp.toFixed(4)), soft])
        }
        // Drawn in and lifted: the window stands on the desktop, its page whole.
        if (wholeAt && amount <= 0) return finish()
        frame = requestAnimationFrame(tick)
        return
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
    // Over the desktop the mist never goes without the window's page whole in its place.
    const finish = (): void => {
      if (desk && plate?.current) plate.current.style.opacity = '1'
      if (trace) trace.landed = true
      gone.current()
    }
    frame = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(frame)
      fade?.cancel()
      window.removeEventListener('resize', fit)
    }
  }, [desk, plate])
  // Hurried: the whole mist goes in half a second, as a breath clears a pane. Over the desktop it draws in at once instead (above).
  useEffect(() => {
    if (!hurry || desk) return
    const done = setTimeout(() => gone.current(), 520)
    return () => clearTimeout(done)
  }, [hurry, desk])
  // Over the desktop its colour is the theme's page, carried as the canvas's own ink for the mist to read.
  return <canvas ref={box} aria-hidden data-welcome-mist={desk ? 'desk' : ''} style={desk ? { color: 'var(--background)' } : undefined} className={`pointer-events-none absolute inset-0 z-30 h-full w-full ${desk ? '' : `transition-opacity duration-500 ease-out ${hurry ? 'opacity-0' : ''}`}`} />
}
