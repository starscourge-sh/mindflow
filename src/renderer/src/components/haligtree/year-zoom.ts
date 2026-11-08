/**
 * The Journal's year, felt by hand (milestones.tsx, `YearMarks`): the strokes
 * near the pointer swell like the Dock, and a pinch spreads the year wider
 * inside its card, two fingers sideways moving along it, Esc or a double-click
 * putting the whole year back. Both run on their own frames: the swell writes
 * each stroke's height straight onto it, never through React, and the zoom
 * hands React one view a frame only while it moves.
 */
import { useEffect, useRef, useState, type RefObject } from 'react'
import { awakeFrames, still } from '@/lib/motion'
import { GAP, LOW } from './time-strokes'

/** How far a day may spread at the deepest zoom: room for its own name, "Mon 24 Nov", with air. */
export const DEEP = 84
/** How much taller the stroke under the pointer stands, over the low ones. */
export const SWELL = 14
/** How many days either side of the pointer the swell reaches, counted at the whole year's spacing. */
const REACH = 12

/** Past an edge, less and less follows: the further over, the harder it pulls back. */
const rubber = (over: number, room: number, give = 0.55): number => (over * room * give) / (room + give * Math.abs(over))
const soft = (value: number, low: number, high: number, room: number): number =>
  value < low ? low - rubber(low - value, room) : value > high ? high + rubber(value - high, room) : value

/** One spring step, critically damped: no bounce, settles from wherever it is now, with the speed it has. */
const step = (at: number, speed: number, to: number, dt: number, stiff = 170): [number, number] => {
  const damp = 2 * Math.sqrt(stiff)
  const next = speed + ((to - at) * stiff - damp * speed) * dt
  return [at + next * dt, next]
}

/** How much of a level of detail is in sight at a day's spacing: 0 below `from`, 1 past `full`. */
export const shown = (px: number, from: number, full: number): number => Math.max(0, Math.min(1, (px - from) / (full - from)))

/** A plain frame loop (`tick` returns false to stop until `again()`): the zoom moves only under the fingers or a key, so it never waits on the window being looked at. */
const frameLoop = (tick: (now: number) => boolean): { again: () => void; stop: () => void } => {
  let frame = 0
  const run = (now: number): void => { frame = 0; if (tick(now)) frame = requestAnimationFrame(run) }
  return { again: () => void (frame || (frame = requestAnimationFrame(run))), stop: () => (cancelAnimationFrame(frame), (frame = 0), undefined) }
}

export type Band = { base: number; count: number; clip: number }
export type YearView = { z: number; pans: number[] }

/** How far a band can move along at a zoom: from its start to its end; a year narrower than its card sits centred. */
const room = (band: Band, z: number): [number, number] => {
  const over = band.count * band.base * z - GAP - band.clip
  return over < 0 ? [over / 2, over / 2] : [0, over]
}

/**
 * Pinch to zoom the year's bands, at the pointer; two fingers sideways move along while zoomed; a plain scroll up or
 * down stays the page's. Past the closest or the widest it gives a little, then springs back once the fingers stop.
 */
export function useYearZoom(box: RefObject<HTMLElement | null>, bands: Band[]): { view: YearView; whole: () => void } {
  const geometry = useRef(bands)
  geometry.current = bands
  const [view, setView] = useState<YearView>({ z: 1, pans: [] })
  const whole = useRef<() => void>(() => {})
  useEffect(() => {
    const el = box.current
    if (!el) return
    // What the fingers asked for, which may be past the limits; `seen` is what is drawn.
    const raw = { lz: 0, pans: [] as number[] }
    const speed = { lz: 0, pans: [] as number[] }
    let last = 0
    let home = false
    let settling = false
    const deepest = (): number => Math.log(Math.max(1, DEEP / Math.min(...geometry.current.map((one) => one.base), DEEP)))
    const seen = (): YearView => {
      const z = Math.exp(soft(raw.lz, 0, deepest(), 0.35))
      return { z, pans: geometry.current.map((band, b) => { const [lo, hi] = room(band, z); return soft(raw.pans[b] ?? 0, lo, hi, band.clip) }) }
    }
    const publish = (): void => {
      const next = seen()
      // Whole pixels along, so a stroke never lands between two and blurs.
      setView({ z: next.z, pans: next.pans.map(Math.round) })
    }
    // Where it rests: inside the limits, or the whole year when asked for.
    const rest = (): { lz: number; pans: number[] } => {
      if (home) return { lz: 0, pans: geometry.current.map(() => 0) }
      const lz = Math.max(0, Math.min(deepest(), raw.lz))
      return { lz, pans: geometry.current.map((band, b) => { const [lo, hi] = room(band, Math.exp(lz)); return Math.max(lo, Math.min(hi, raw.pans[b] ?? 0)) }) }
    }
    let then = 0
    const frames = frameLoop((now) => {
      const dt = Math.min(1 / 30, then ? (now - then) / 1000 : 1 / 60)
      then = now
      // The fingers are still on it: what they ask is already drawn.
      if (!home && now - last < 120) return true
      if (!settling) {
        // From what is drawn, never from the far-off ask: the spring back starts where the year is.
        const at = seen()
        raw.lz = Math.log(at.z)
        raw.pans = [...at.pans]
        settling = true
      }
      const to = rest()
      if (still()) {
        raw.lz = to.lz
        raw.pans = to.pans
      } else {
        const stiff = home ? 320 : 170
        ;[raw.lz, speed.lz] = step(raw.lz, speed.lz, to.lz, dt, stiff)
        to.pans.forEach((pan, b) => { [raw.pans[b], speed.pans[b]] = step(raw.pans[b] ?? 0, speed.pans[b] ?? 0, pan, dt, stiff) })
      }
      const done = Math.abs(raw.lz - to.lz) < 0.002 && Math.abs(speed.lz) < 0.01 && to.pans.every((pan, b) => Math.abs((raw.pans[b] ?? 0) - pan) < 0.5 && Math.abs(speed.pans[b] ?? 0) < 5)
      if (done) {
        raw.lz = to.lz
        raw.pans = to.pans
        speed.lz = 0
        speed.pans = []
        home = false
        then = 0
      }
      publish()
      return !done
    })
    const go = (): void => { then = 0; frames.again() }
    const wheel = (event: WheelEvent): void => {
      const band = (event.target as Element | null)?.closest<HTMLElement>('[data-year-band]')
      const b = Number(band?.dataset.yearBand ?? 0)
      const one = geometry.current[b]
      if (!one) return
      const at = seen()
      if (event.ctrlKey) {
        event.preventDefault()
        const clip = band?.querySelector('[data-year-clip]')?.getBoundingClientRect()
        const px = clip ? event.clientX - clip.left : one.clip / 2
        const day = (px + at.pans[b]) / (one.base * at.z)
        raw.lz = Math.log(at.z) - Math.max(-40, Math.min(40, event.deltaY)) * 0.01
        const z = Math.exp(soft(raw.lz, 0, deepest(), 0.35))
        geometry.current.forEach((other, i) => {
          raw.pans[i] = i === b ? day * one.base * z - px : (at.pans[i] + other.clip / 2) * (z / at.z) - other.clip / 2
        })
      } else if (at.z > 1.01 && Math.abs(event.deltaX) > Math.abs(event.deltaY)) {
        // Sideways only while zoomed; up and down is always the page's own scroll.
        event.preventDefault()
        raw.lz = Math.log(at.z)
        raw.pans = [...at.pans]
        raw.pans[b] += event.deltaX
      } else return
      last = performance.now()
      home = false
      settling = false
      speed.lz = 0
      speed.pans = []
      publish()
      go()
    }
    whole.current = () => {
      const at = seen()
      if (at.z <= 1.001 && at.pans.every((pan) => Math.abs(pan) < 0.5)) return
      home = true
      settling = false
      last = 0
      go()
    }
    el.addEventListener('wheel', wheel, { passive: false })
    return () => (el.removeEventListener('wheel', wheel), frames.stop())
  }, [box])
  return { view, whole: () => whole.current() }
}

/**
 * The strokes near the pointer stand taller and a touch darker, the one under it tallest, falling off over about
 * twelve days either side like the Dock; leaving, they ease back down. Written straight onto each stroke's style a
 * frame at a time (React draws the year once). Nothing swells with Motion off or Reduce motion; the pointed-at stroke
 * still stands up as before.
 */
export function useSwell(box: RefObject<HTMLElement | null>, reach: () => number): void {
  const far = useRef(reach)
  far.current = reach
  useEffect(() => {
    const el = box.current
    if (!el) return
    type One = { a: number; speed: number; x: number; to: number; touched: Set<SVGRectElement> }
    const states = new Map<SVGSVGElement, One>()
    const plain = (rect: SVGRectElement): void => {
      rect.style.removeProperty('height')
      rect.style.removeProperty('y')
      rect.style.removeProperty('fill')
    }
    const draw = (svg: SVGSVGElement, one: One): void => {
      const tall = svg.height.baseVal.value
      const span = Math.max(3, far.current() * REACH)
      const width = span / 2.5
      for (const rect of svg.querySelectorAll<SVGRectElement>('rect[data-stroke]')) {
        const off = Math.abs(rect.x.baseVal.value - one.x)
        const lift = off > span || one.a < 0.01 || rect.hasAttribute('data-year-marked') ? 0 : one.a * Math.exp(-((off / width) ** 2) / 2)
        if (lift < 0.02) {
          if (one.touched.delete(rect)) plain(rect)
          continue
        }
        const base = rect.height.baseVal.value
        const h = Math.max(base, Math.floor(LOW + SWELL * lift + 0.001))
        rect.style.height = `${h}px`
        rect.style.y = `${tall - h}px`
        const ink = rect.getAttribute('fill') ?? ''
        // Only the plain inks darken; today keeps its accent.
        if (ink.startsWith('color-mix')) rect.style.fill = `color-mix(in oklab, ${ink} ${100 - Math.round(35 * lift)}%, var(--foreground))`
        one.touched.add(rect)
      }
    }
    let then = 0
    const frames = awakeFrames((now) => {
      const dt = Math.min(1 / 30, then ? (now - then) / 1000 : 1 / 60)
      then = now
      let moving = false
      for (const [svg, one] of states) {
        ;[one.a, one.speed] = step(one.a, one.speed, one.to, dt, one.to > one.a ? 420 : 200)
        if (Math.abs(one.a - one.to) < 0.004 && Math.abs(one.speed) < 0.05) ((one.a = one.to), (one.speed = 0))
        else moving = true
        draw(svg, one)
        if (one.a === 0 && one.to === 0) (one.touched.forEach(plain), states.delete(svg))
      }
      if (!moving) then = 0
      return moving
    })
    const move = (event: PointerEvent): void => {
      const svg = (event.target as Element | null)?.closest<SVGSVGElement>('svg[data-strokes]') ?? null
      for (const [other, one] of states) if (other !== svg) one.to = 0
      if (svg && !still()) {
        const one = states.get(svg) ?? { a: 0, speed: 0, x: 0, to: 1, touched: new Set() }
        // Centred on the stroke pointed at (the day the tip names), so that one stands tallest.
        const px = event.clientX - svg.getBoundingClientRect().left + GAP / 2
        let x = 0
        for (const rect of svg.querySelectorAll<SVGRectElement>('rect[data-stroke]')) {
          const rx = rect.x.baseVal.value
          if (rx > px) break
          x = rx
        }
        one.x = x
        one.to = 1
        states.set(svg, one)
        // Where the pointer is now, drawn now: the swell never trails it.
        draw(svg, one)
      }
      frames.again()
    }
    const leave = (): void => {
      for (const one of states.values()) one.to = 0
      frames.again()
    }
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerleave', leave)
    return () => {
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerleave', leave)
      frames.stop()
      for (const one of states.values()) one.touched.forEach(plain)
    }
  }, [box])
}
