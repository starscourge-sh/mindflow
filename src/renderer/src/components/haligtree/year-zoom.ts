import { detent, edge } from '@/lib/haptics'
/**
 * The Journal's year, felt by hand (milestones.tsx, `YearMarks`), and a book's
 * page strip the same way (book-links.tsx, `PageBar`): the strokes
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

/**
 * The spring over however long the last frame took, in small steps: on a busy machine a frame can take 100ms or more,
 * and a spring held to a frame's worth of time a frame ran in slow motion there, an Esc taking seconds to put the
 * whole back. Over half a second (a window put away and back) it simply lands.
 */
const spring = (at: number, speed: number, to: number, elapsed: number, stiff?: number): [number, number] => {
  if (elapsed > 0.5) return [to, 0]
  const n = Math.max(1, Math.ceil(elapsed * 120))
  for (let i = 0; i < n; i++) [at, speed] = step(at, speed, to, elapsed / n, stiff)
  return [at, speed]
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
 * Each band is a `[data-zoom-band]` (its index) holding a `[data-zoom-clip]`; `deep` is the widest a stroke's spacing
 * may grow to. Pinch to zoom the year's bands, at the pointer; two fingers sideways move along while zoomed; a plain scroll up or
 * down stays the page's. Past the closest or the widest it gives a little, then springs back once the fingers stop.
 */
export function useYearZoom(box: RefObject<HTMLElement | null>, bands: Band[], deep = DEEP): { view: YearView; whole: () => void } {
  const geometry = useRef(bands)
  geometry.current = bands
  const deepAt = useRef(deep)
  deepAt.current = deep
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
    const deepest = (): number => Math.log(Math.max(1, deepAt.current / Math.min(...geometry.current.map((one) => one.base), deepAt.current)))
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
      const dt = then ? (now - then) / 1000 : 1 / 60
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
        ;[raw.lz, speed.lz] = spring(raw.lz, speed.lz, to.lz, dt, stiff)
        to.pans.forEach((pan, b) => { [raw.pans[b], speed.pans[b]] = spring(raw.pans[b] ?? 0, speed.pans[b] ?? 0, pan, dt, stiff) })
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
      const band = (event.target as Element | null)?.closest<HTMLElement>('[data-zoom-band]')
      const b = Number(band?.dataset.zoomBand ?? 0)
      const one = geometry.current[b]
      if (!one) return
      const at = seen()
      if (event.ctrlKey) {
        event.preventDefault()
        const clip = band?.querySelector('[data-zoom-clip]')?.getBoundingClientRect()
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
  // Zoomed, Esc puts the whole back (not while typing, nor when something nearer took the key).
  const zoomed = view.z > 1.001
  useEffect(() => {
    if (!zoomed) return
    const key = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape' || event.defaultPrevented || (event.target as Element | null)?.closest?.('input, textarea, [contenteditable="true"]')) return
      event.preventDefault()
      event.stopPropagation()
      whole.current()
    }
    window.addEventListener('keydown', key, true)
    return () => window.removeEventListener('keydown', key, true)
  }, [zoomed])
  return { view, whole: () => whole.current() }
}

/** The normal curve's share left of `u` (Abramowitz and Stegun 7.1.26, close to a thousandth): the fisheye's sweep. */
const below = (u: number): number => {
  const x = Math.abs(u) / Math.SQRT2
  const t = 1 / (1 + 0.3275911 * x)
  const erf = 1 - t * (0.254829592 + t * (-0.284496736 + t * (1.421413758 + t * (-1.453152027 + t * 1.061405429)))) * Math.exp(-x * x)
  return u < 0 ? (1 - erf) / 2 : (1 + erf) / 2
}
const bell = (u: number): number => Math.exp(-(u * u) / 2)

/**
 * The Dock, on the year: near the pointer the strokes stand taller, grow wider (one pixel to three under it) and
 * brighten, and spread apart, the ones a little further off closing up to make the room, so the row keeps its width
 * and strokes far off never move. Falls off over about ten strokes either side, like Line Sidebar. The stroke under the
 * pointer stays where it is, widest and tallest: the one a click opens. Marked strokes (`data-stroke-mark`, their key) keep their colour
 * and height and move with the spread, their names (`[data-mark-label][data-mark-day]` of that key) with them. Written straight onto each stroke's style a frame at a time (React draws
 * the year once). Nothing moves with Motion off or Reduce motion; the pointed-at stroke still stands up as before.
 */
export function useSwell(box: RefObject<HTMLElement | null>, reach: () => number): void {
  const far = useRef(reach)
  far.current = reach
  useEffect(() => {
    const el = box.current
    if (!el) return
    type One = { a: number; speed: number; x: number; to: number; touched: Set<SVGRectElement | HTMLElement> }
    const states = new Map<SVGSVGElement, One>()
    const plain = (node: SVGRectElement | HTMLElement): void => {
      if (node instanceof HTMLElement) return void node.style.removeProperty('translate')
      for (const one of ['height', 'y', 'x', 'width', 'fill']) node.style.removeProperty(one)
    }
    const draw = (svg: SVGSVGElement, one: One): void => {
      const rects = [...svg.querySelectorAll<SVGRectElement>('rect[data-stroke]')]
      if (rects.length < 2) return
      const tall = svg.height.baseVal.value
      const wide = svg.width.baseVal.value
      const xs = rects.map((rect) => rect.x.baseVal.value)
      const step = (xs[xs.length - 1] - xs[0]) / (xs.length - 1)
      const c = one.x
      const a = one.a
      // The spread: the strokes by the pointer at least 5px apart, paid for by the next few dozen closing up, never
      // below 2px apart (a pixel of gap), so two strokes never merge. Zoomed in, there is room already: no spread.
      const near = 3 * step
      const ring = 8 * near
      const gain = Math.min(Math.max(0, 5 / step - 1), (Math.max(0, step - 2) / step) * (ring / near - 1))
      const amp = (gain * Math.sqrt(2 * Math.PI) * near * ring) / (ring - near)
      const sweep = (x: number): number => amp * (below((x - c) / near) - below((x - c) / ring))
      const slope = (x: number): number => (amp * (bell((x - c) / near) / near - bell((x - c) / ring) / ring)) / Math.sqrt(2 * Math.PI)
      // Pointed near an end, what would pass the edge is taken back over a long run, so nothing leaves the card.
      const edge = 3 * ring
      const atLeft = sweep(0)
      const atRight = sweep(wide)
      const shift = (x: number): number => a * (sweep(x) - atLeft * Math.max(0, 1 - x / edge) - atRight * Math.max(0, 1 - (wide - x) / edge))
      const roomAt = (x: number): number => step * (1 + a * (slope(x) + (x < edge ? atLeft / edge : 0) - (wide - x < edge ? atRight / edge : 0)))
      const hill = Math.max(1, far.current() * REACH) / 2.5
      const ws = xs.map((x) => Math.max(1, Math.min(Math.floor(1 + 2 * a * bell((x - c) / step / 1.5) + 0.25), Math.floor(roomAt(x)) - 1)))
      const lefts = xs.map((x, i) => Math.round(x + shift(x)) - Math.floor((ws[i] - 1) / 2))
      // Whole pixels round some neighbours a pixel too close where the row closes up: from the pointer outward, each
      // keeps a pixel of gap from the one before it, the slack further out taking it back.
      const mid = Math.max(0, xs.findIndex((x) => x >= c))
      for (let i = mid + 1; i < xs.length; i++) lefts[i] = Math.max(lefts[i], lefts[i - 1] + ws[i - 1] + 1)
      for (let i = mid - 1; i >= 0; i--) lefts[i] = Math.min(lefts[i], lefts[i + 1] - ws[i] - 1)
      const moved = new Map<string, number>()
      for (let i = 0; i < rects.length; i++) {
        const rect = rects[i]
        const x = xs[i]
        const lift = a < 0.01 || Math.abs(x - c) > hill * 3 ? 0 : a * bell((x - c) / hill)
        const w = ws[i]
        const left = lefts[i]
        const at = left + Math.floor((w - 1) / 2)
        const marked = rect.hasAttribute('data-stroke-mark')
        if (marked && at !== x) moved.set(rect.getAttribute('data-stroke-mark') ?? '', at - x)
        if (left === x && w === 1 && (marked || lift < 0.02)) {
          if (one.touched.delete(rect)) plain(rect)
          continue
        }
        rect.style.x = `${left}px`
        rect.style.width = `${w}px`
        if (!marked) {
          const h = Math.max(rect.height.baseVal.value, Math.floor(LOW + SWELL * lift + 0.001))
          rect.style.height = `${h}px`
          rect.style.y = `${tall - h}px`
          const ink = rect.getAttribute('fill') ?? ''
          // Only the plain inks brighten toward the text colour; today keeps its accent.
          if (ink.startsWith('color-mix') && lift >= 0.02) rect.style.fill = `color-mix(in oklab, ${ink} ${100 - Math.round(60 * lift)}%, var(--foreground))`
          else rect.style.removeProperty('fill')
        }
        one.touched.add(rect)
      }
      // A marked stroke's name goes where its stroke went.
      for (const name of svg.closest('[data-zoom-band]')?.querySelectorAll<HTMLElement>('[data-mark-label][data-mark-day]') ?? []) {
        const by = moved.get(name.dataset.markDay ?? '')
        if (by) (name.style.translate = `${by}px 0`, one.touched.add(name))
        else if (one.touched.delete(name)) plain(name)
      }
    }
    let then = 0
    const frames = awakeFrames((now) => {
      const dt = then ? (now - then) / 1000 : 1 / 60
      then = now
      let moving = false
      for (const [svg, one] of states) {
        ;[one.a, one.speed] = spring(one.a, one.speed, one.to, dt, one.to > one.a ? 420 : 200)
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
        // Centred on the stroke pointed at (the day the tip names, by where it stands with nothing spread), so that
        // one stays put under the pointer and is the one a click opens.
        const px = event.clientX - svg.getBoundingClientRect().left + GAP / 2
        let x = 0
        let on: SVGRectElement | null = null
        for (const rect of svg.querySelectorAll<SVGRectElement>('rect[data-stroke]')) {
          const rx = rect.x.baseVal.value
          if (rx > px) break
          x = rx
          on = rect
        }
        // Felt as the lens passes each day, as a dial's notches are: a light tick a day, a firmer one on a marked day.
        if (one.x !== x && states.has(svg)) (on?.hasAttribute('data-stroke-mark') ? edge() : detent())
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
    // The strokes moved under a swell (a pinch, a pan, the strokes in view drawn afresh): the swell is laid again at
    // once from their new places. Its styles win over their own positions, so left as they were, the strokes bunched
    // where they had been and left gaps where they now are.
    const redraw = new MutationObserver(() => {
      for (const [svg, one] of states) {
        if (!svg.isConnected) (one.touched.forEach(plain), states.delete(svg))
        else draw(svg, one)
      }
    })
    redraw.observe(el, { subtree: true, childList: true, attributeFilter: ['x', 'width'] })
    return () => {
      redraw.disconnect()
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerleave', leave)
      frames.stop()
      for (const one of states.values()) one.touched.forEach(plain)
    }
  }, [box])
}
