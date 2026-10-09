import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { forceCenter, forceCollide, forceLink, forceManyBody, forceSimulation, forceX, forceY, type Simulation, type SimulationLinkDatum, type SimulationNodeDatum } from 'd3-force'
import { CAPTURE_TYPES } from '@/components/capture-kinds/capture-kind-picker'
import type { MapNode, NoteMap } from '@/lib/notes'
import { chime } from '@/lib/sound'
import { cn } from '@/lib/cn'

type Dot = MapNode & SimulationNodeDatum & { r: number; private?: boolean }
type Line = SimulationLinkDatum<Dot> & { source: Dot; target: Dot }
type View = { x: number; y: number; k: number }
/** A dot on the map, with whether its title is kept out of sight. */
export type GraphNode = MapNode & { private?: boolean }
export type Graph = Omit<NoteMap, 'nodes'> & { nodes: GraphNode[] }

/** Bigger the more links touch it, but never so big it hides its neighbours. */
const radius = (links: number, small: boolean): number => (small ? Math.min(7, 2.5 + Math.sqrt(links) * 1.1) : Math.min(16, 3 + Math.sqrt(links) * 2.2))
/** Motion off in Settings, or Reduce motion on the Mac: the map is drawn settled, and nothing fades. */
export const still = (): boolean => document.documentElement.dataset.motion === 'off' || matchMedia('(prefers-reduced-motion: reduce)').matches
export const kindOf = (kind: string): (typeof CAPTURE_TYPES)[number] | undefined => CAPTURE_TYPES.find((type) => type.id === kind)
const ease = (t: number): number => 1 - (1 - t) ** 3

/** A theme colour as the canvas can paint it, worked out by the browser from the token. */
function resolve(css: string): string {
  const probe = document.createElement('i')
  probe.style.color = css
  document.body.append(probe)
  const said = getComputedStyle(probe).color
  probe.remove()
  return said
}

// The note the Map should open on, left here by "Show on the Map" for the Map to pick up.
let asked: string | null = null
/** Open the Map on this note next time it is drawn. */
export const showOnMap = (id: string): void => void (asked = id)
const takeFocus = (): string | null => ((id) => ((asked = null), id))(asked)

/**
 * Notes as dots and links as lines, settled by a force layout. Dots take
 * their kind's colour and grow with their links. Pointed at, a dot names
 * itself and its neighbours light up while the rest fades; clicked, it opens.
 * Drag a dot, drag the space to pan, pinch or ⌘-scroll to zoom. The dots
 * fade in from the middle outwards when they first show.
 *
 * `centre` makes it one note's own map: that note held in the middle, the
 * busiest few and it named all the time, the far ones faded, and a plain
 * scroll left to the page around it. `focus` lights a note up and brings it
 * close once drawn.
 */
export function GraphCanvas({ map, onOpen, centre, fit: fitRef, className, children }: {
  map: Graph
  onOpen: (type: string, id: string) => void
  centre?: string
  fit?: React.RefObject<() => void>
  className?: string
  children?: React.ReactNode
}): React.JSX.Element {
  const small = !!centre
  const box = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  // The dot pointed at, by its middle and size on the screen.
  const [hover, setHover] = useState<{ dot: Dot; x: number; y: number; r: number } | null>(null)
  const blocked = useRef<number[][]>([])
  const card = useRef<HTMLDivElement>(null)
  // The card goes where it covers no lit dot or name: above if it can, else
  // below, beside or at a corner, whichever is clearest and stays in the frame.
  useLayoutEffect(() => {
    const el = card.current, frame = box.current
    if (!hover || !el || !frame) return
    const w = el.offsetWidth, h = el.offsetHeight, gap = 8 + hover.r
    const { clientWidth: fw, clientHeight: fh } = frame
    const spots = [
      [hover.x - w / 2, hover.y - gap - h], [hover.x - w / 2, hover.y + gap],
      [hover.x + gap, hover.y - h / 2], [hover.x - gap - w, hover.y - h / 2],
      [hover.x + gap, hover.y - gap - h], [hover.x - gap - w, hover.y - gap - h],
      [hover.x + gap, hover.y + gap], [hover.x - gap - w, hover.y + gap]
    ]
    const cost = ([x, y]: number[]): number => {
      let covered = 0
      for (const [x0, y0, x1, y1] of blocked.current) covered += Math.max(0, Math.min(x + w, x1) - Math.max(x, x0)) * Math.max(0, Math.min(y + h, y1) - Math.max(y, y0))
      const outside = Math.max(0, 4 - x) + Math.max(0, x + w - fw + 4) + Math.max(0, 4 - y) + Math.max(0, y + h - fh + 4)
      return covered + outside * 1000
    }
    const best = spots.reduce((a, b) => (cost(b) < cost(a) ? b : a))
    el.style.left = `${best[0]}px`
    el.style.top = `${best[1]}px`
    el.style.visibility = 'visible'
  }, [hover])
  const own = useRef<() => void>(() => undefined)
  const fit = fitRef ?? own
  // Kept across reloads of the data, so a new link does not throw every dot back to the start.
  const placed = useRef(new Map<string, { x: number; y: number }>())
  const [asks] = useState(() => (small ? null : takeFocus()))
  const focusOn = useRef(asks)

  useEffect(() => {
    const el = canvas.current
    const frame = box.current
    if (!el || !frame || !map.nodes.length) return
    const context = el.getContext('2d')!
    const dots: Dot[] = map.nodes.map((node) => ({ ...node, r: node.id === centre ? 8 : radius(node.links, small), ...placed.current.get(node.id), ...(node.id === centre ? { fx: 0, fy: 0 } : {}) }))
    const byId = new Map(dots.map((dot) => [dot.id, dot]))
    const lines: Line[] = map.edges.map(([a, b]) => ({ source: byId.get(a)!, target: byId.get(b)! }))
    const near = new Map<string, Set<string>>(dots.map((dot) => [dot.id, new Set()]))
    for (const [a, b] of map.edges) (near.get(a)!.add(b), near.get(b)!.add(a))
    const middle = centre ? byId.get(centre) : undefined
    // Named all the time on a note's own map: it and its busiest few.
    const named = middle ? [middle, ...dots.filter((dot) => dot !== middle).sort((a, b) => b.links - a.links).slice(0, 5)] : []

    // --- colours, read again whenever the theme changes
    let ink: Record<string, string> = {}
    let edge = '', lit = '', ring = '', text = '', quiet = '', brand = '', font = ''
    const colours = (): void => {
      ink = Object.fromEntries(CAPTURE_TYPES.map((type) => [type.id, resolve(type.tint)]))
      edge = resolve('color-mix(in oklab, var(--foreground) 16%, transparent)')
      lit = resolve('color-mix(in oklab, var(--foreground) 55%, transparent)')
      ring = resolve('var(--background)')
      text = resolve('var(--foreground)')
      quiet = resolve('var(--muted-foreground)')
      brand = resolve('var(--tt-brand-color-400)')
      font = getComputedStyle(document.body).fontFamily
    }
    colours()
    const fill = (dot: Dot): string => (dot === middle ? brand : ink[kindOf(dot.kind)?.id ?? 'note'])
    // A private note's title stays hidden on the map unless titles are shown.
    const titleOf = (dot: Dot): string => {
      const words = dot.private && !('reveal' in document.documentElement.dataset) ? 'Private note' : dot.title || 'Untitled'
      const most = small ? 22 : 32
      return words.length > most ? `${words.slice(0, most - 1).trimEnd()}…` : words
    }

    // --- where the map is looked at from, and how close
    const view: View = { x: 0, y: 0, k: 1 }
    let width = 0, height = 0
    const toWorld = (x: number, y: number): [number, number] => [(x - width / 2 - view.x) / view.k, (y - height / 2 - view.y) / view.k]

    // --- what the pointer is on, and how lit the neighbours are (0 to 1)
    let focus: Dot | null = null
    let shown: Dot | null = null
    let amount = 0
    let fading = 0

    // --- fading in: each new dot from a moment set by how far out it sits,
    // so the map grows from its middle (about 600ms in all)
    const arrive = new Map<Dot, number>()
    let arriving = 0
    const seen = (dot: Dot, now: number): number => {
      const at = arrive.get(dot)
      return at === undefined ? 1 : now <= at ? 0 : now >= at + 240 ? 1 : ease((now - at) / 240)
    }
    // On a note's own map the far ones are faded, so the near ones read first.
    let reach = 1
    const far = (dot: Dot): number => (middle && dot !== middle ? 1 - 0.55 * Math.max(0, Math.min(1, (Math.hypot(dot.x!, dot.y!) / reach - 0.45) / 0.55)) : 1)

    const draw = (): void => {
      const now = performance.now()
      const dpr = devicePixelRatio
      const growing = arrive.size > 0
      context.setTransform(dpr, 0, 0, dpr, 0, 0)
      context.clearRect(0, 0, width, height)
      context.translate(width / 2 + view.x, height / 2 + view.y)
      context.scale(view.k, view.k)
      const around = shown ? near.get(shown.id)! : null
      const on = (dot: Dot): boolean => !around || dot === shown || around.has(dot.id)
      const alpha = (dot: Dot): number => (growing ? seen(dot, now) : 1) * (shown ? 1 : far(dot))
      // The rest fades as far as the lit neighbours stand out.
      const faded = 1 - 0.82 * amount
      context.lineWidth = 1 / view.k
      context.strokeStyle = edge
      const quietLines = lines.filter((line) => !shown || (line.source !== shown && line.target !== shown))
      if (growing || middle) {
        // One by one while they fade in, or as far out as they reach.
        for (const line of quietLines) {
          context.globalAlpha = faded * Math.min(alpha(line.source), alpha(line.target))
          if (!context.globalAlpha) continue
          context.beginPath()
          context.moveTo(line.source.x!, line.source.y!)
          context.lineTo(line.target.x!, line.target.y!)
          context.stroke()
        }
      } else {
        context.globalAlpha = faded
        context.beginPath()
        for (const line of quietLines) {
          context.moveTo(line.source.x!, line.source.y!)
          context.lineTo(line.target.x!, line.target.y!)
        }
        context.stroke()
      }
      if (shown) {
        context.strokeStyle = lit
        context.lineWidth = 1.4 / view.k
        context.beginPath()
        for (const line of lines) {
          if (line.source !== shown && line.target !== shown) continue
          context.moveTo(line.source.x!, line.source.y!)
          context.lineTo(line.target.x!, line.target.y!)
        }
        context.globalAlpha = amount * (growing ? seen(shown, now) : 1)
        context.stroke()
      }
      context.lineWidth = 1.5 / view.k
      context.strokeStyle = ring
      // Faded dots first, so the lit ones sit over them; the note itself last of all.
      const order = shown ? [...dots.filter((one) => !on(one)), ...dots.filter(on)] : dots
      for (const dot of middle ? [...order.filter((one) => one !== middle), middle] : order) {
        context.globalAlpha = (on(dot) ? 1 : faded) * alpha(dot)
        if (!context.globalAlpha) continue
        context.beginPath()
        context.arc(dot.x!, dot.y!, dot.r, 0, Math.PI * 2)
        context.fillStyle = fill(dot)
        context.fill()
        context.stroke()
      }
      // Names, the busiest first, each beside its dot on the side away from
      // the middle, else the other side, above or below; one that would run
      // over a lit dot or another name in all four is left out. Pointed at,
      // the neighbours name themselves (the dot itself has its card);
      // otherwise a note's own map names it and its busiest few.
      // Worked out even before the light fades in, so the card knows where the names will be.
      const pad = 4 / view.k, half = 7 / view.k
      const say = shown ? [...around!].map((id) => byId.get(id)!).sort((a, b) => b.links - a.links) : named
      const from = shown ?? middle
      const taken = [...(shown ? [shown] : []), ...say].map((dot) => ({ dot, box: [dot.x! - dot.r, dot.y! - dot.r, dot.x! + dot.r, dot.y! + dot.r] }))
      const overlaps = (a: number[], b: number[]): boolean => !(a[2] < b[0] || a[0] > b[2] || a[3] < b[1] || a[1] > b[3])
      const strength = shown ? amount : 1 - amount
      context.font = `500 ${11 / view.k}px ${font}`
      context.textBaseline = 'middle'
      context.textAlign = 'left'
      context.lineWidth = (small ? 4 : 3) / view.k
      context.strokeStyle = ring
      context.lineJoin = 'round'
      const frame = [-width / 2 - view.x, -height / 2 - view.y, width / 2 - view.x, height / 2 - view.y].map((at) => at / view.k)
      for (const dot of say) {
        const words = titleOf(dot)
        const wide = context.measureText(words).width
        const away = from ? dot.x! < from.x! || (dot === from && dot.x! > 0) : false
        // [left edge, middle line, how it lines up]
        const right = [dot.x! + dot.r + pad, dot.y!], left = [dot.x! - dot.r - pad - wide, dot.y!]
        const above = [dot.x! - wide / 2, dot.y! - dot.r - pad - half], below = [dot.x! - wide / 2, dot.y! + dot.r + pad + half]
        // The note in the middle of its own map is named first, over or under
        // itself, whatever dots are there: the others keep off its name.
        const lead = dot === middle && !shown
        const spots = lead ? [above, below] : [...(away ? [left, right] : [right, left]), above, below]
        const spot = spots.map(([x, y]) => [x, y - half, x + wide, y + half]).find((box) =>
          !taken.some((one) => one.dot !== dot && (!lead || one.dot === shown) && overlaps(box, one.box)) &&
          // A name cut off by the frame's edge is left out on a small map.
          !(small && (box[0] < frame[0] || box[2] > frame[2] || box[1] < frame[1] || box[3] > frame[3])))
        if (!spot) continue
        taken.push({ dot: shown ?? dot, box: spot })
        context.globalAlpha = strength * (growing ? seen(dot, now) : 1)
        if (!context.globalAlpha) continue
        context.fillStyle = dot === middle || shown ? text : quiet
        const y = (spot[1] + spot[3]) / 2
        context.strokeText(words, spot[0], y)
        context.fillText(words, spot[0], y)
      }
      context.textAlign = 'left'
      // The lit dots and their names, on the screen: what the card must not cover.
      const screen = (at: number, middle: number, offset: number): number => middle + offset + at * view.k
      blocked.current = taken.map(({ box }) => [screen(box[0], width / 2, view.x), screen(box[1], height / 2, view.y), screen(box[2], width / 2, view.x), screen(box[3], height / 2, view.y)])
      context.globalAlpha = 1
      if (growing && now >= arriving) arrive.clear()
    }
    let queued = 0
    const redraw = (): void => void (queued ||= requestAnimationFrame(() => ((queued = 0), draw(), arrive.size && redraw())))

    // A short fade in and out, so the light follows the pointer rather than snapping.
    const fade = (to: number): void => {
      cancelAnimationFrame(fading)
      if (still()) {
        amount = to
        if (!to) shown = null
        return draw()
      }
      const from = amount
      const start = performance.now()
      const step = (now: number): void => {
        const t = Math.min(1, (now - start) / 140)
        amount = from + (to - from) * ease(t)
        if (to === 0 && t === 1) shown = null
        draw()
        if (t < 1) fading = requestAnimationFrame(step)
      }
      fading = requestAnimationFrame(step)
    }

    // --- the simulation: settled before it is seen when motion is off
    const sim: Simulation<Dot, Line> = forceSimulation(dots)
      .force('link', forceLink<Dot, Line>(lines).distance((line) => (small ? 10 : 18) + line.source.r + line.target.r).strength((line) => (middle && (line.source === middle || line.target === middle) ? 0.15 : 0.6)))
      .force('charge', forceManyBody<Dot>().strength((dot) => (small ? -18 : -40) - dot.r * 6).distanceMax(small ? 160 : 320))
      .force('collide', forceCollide<Dot>((dot) => dot.r + (small ? 1.5 : 2)))
      // A weak pull to the middle keeps islands of two or three from drifting off.
      .force('x', forceX<Dot>(0).strength(small ? 0.06 : 0.1))
      .force('y', forceY<Dot>(0).strength(small ? 0.06 : 0.1))
      .on('tick', () => ((reach = Math.max(40, ...dots.map((dot) => Math.hypot(dot.x!, dot.y!)))), redraw()))
      .on('end', () => {
        for (const dot of dots) placed.current.set(dot.id, { x: dot.x!, y: dot.y! })
      })
    // A note's own map is held on its note, not on the middle of its dots.
    if (!middle) sim.force('center', forceCenter(0, 0))
    const fresh = dots.filter((dot) => !placed.current.has(dot.id))
    if (still() || !fresh.length) {
      sim.stop()
      if (fresh.length) sim.alpha(1)
      else sim.alpha(0.05)
      while (sim.alpha() > sim.alphaMin()) sim.tick()
      for (const dot of dots) placed.current.set(dot.id, { x: dot.x!, y: dot.y! })
    } else {
      // Most of the settling done out of sight, so what is seen is the last
      // easing into place, not a tangle flying apart.
      sim.tick(Math.min(120, 40 + dots.length / 5))
    }
    reach = Math.max(40, ...dots.map((dot) => Math.hypot(dot.x!, dot.y!)))
    // New dots fade in, the nearest the middle first: the whole map over about
    // 600ms, or a few joining an old map over less.
    if (fresh.length && !still()) {
      const start = performance.now() + 30
      const spread = fresh.length === dots.length ? 360 : 120
      const out = Math.max(...fresh.map((dot) => Math.hypot(dot.x!, dot.y!)), 1)
      for (const dot of fresh) arrive.set(dot, start + spread * Math.sqrt(Math.hypot(dot.x!, dot.y!) / out))
      arriving = start + spread + 240
    }

    // The whole map in view, with a margin.
    fit.current = () => {
      if (!width || !height) return
      const xs = dots.map((dot) => dot.x!), ys = dots.map((dot) => dot.y!)
      const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]
      const margin = small ? 24 : 80
      view.k = Math.min(small ? 1.6 : 2, Math.max(0.2, Math.min((width - margin) / (x1 - x0 + 40), (height - margin) / (y1 - y0 + 40))))
      // A note's own map keeps its note in the middle.
      view.x = middle ? 0 : -((x0 + x1) / 2) * view.k
      view.y = middle ? 0 : -((y0 + y1) / 2) * view.k
      redraw()
    }

    const size = (): void => {
      const rect = frame.getBoundingClientRect()
      width = rect.width
      height = rect.height
      el.width = Math.round(width * devicePixelRatio)
      el.height = Math.round(height * devicePixelRatio)
      el.style.width = `${width}px`
      el.style.height = `${height}px`
      draw()
    }
    size()
    fit.current()
    redraw()
    const resized = new ResizeObserver(size)
    resized.observe(frame)
    const themed = new MutationObserver(() => (colours(), draw()))
    themed.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'style', 'data-theme', 'data-reveal'] })

    // Sent here to one note: brought close and lit, its neighbours named.
    const wanted = focusOn.current ? byId.get(focusOn.current) : undefined
    // Asked once: forgotten after the first frame, so a reload of the data
    // keeps the view (and React's trial unmount in development keeps the ask).
    const asked = requestAnimationFrame(() => (focusOn.current = null))
    if (wanted) {
      view.k = Math.max(view.k, 1.4)
      view.x = -wanted.x! * view.k
      view.y = -wanted.y! * view.k
      focus = wanted
      shown = wanted
      fade(1)
    }

    // --- pointing, dragging, panning and zooming
    const hit = (event: PointerEvent | MouseEvent): Dot | null => {
      const rect = el.getBoundingClientRect()
      const [x, y] = toWorld(event.clientX - rect.left, event.clientY - rect.top)
      const found = sim.find(x, y, 24 / view.k)
      return found && Math.hypot(found.x! - x, found.y! - y) <= found.r + 4 / view.k ? found : null
    }
    const point = (dot: Dot | null, event?: PointerEvent): void => {
      el.style.cursor = drag ? 'grabbing' : dot && dot !== middle ? 'pointer' : 'grab'
      if (dot && event) {
        setHover({ dot, x: width / 2 + view.x + dot.x! * view.k, y: height / 2 + view.y + dot.y! * view.k, r: dot.r * view.k })
      } else setHover(null)
      if (dot === focus) return
      focus = dot
      if (dot) {
        shown = dot
        // Drawn now, so where the names go is known before the card is placed.
        draw()
        fade(1)
      } else fade(0)
    }
    let drag: { dot: Dot | null; x: number; y: number; moved: boolean } | null = null
    const down = (event: PointerEvent): void => {
      if (event.button !== 0) return
      el.setPointerCapture(event.pointerId)
      // The note itself stays put in the middle of its own map: dragging it moves the view.
      const dot = hit(event)
      drag = { dot: dot === middle ? null : dot, x: event.clientX, y: event.clientY, moved: false }
      el.style.cursor = 'grabbing'
    }
    const move = (event: PointerEvent): void => {
      if (!drag) return point(hit(event), event)
      const dx = event.clientX - drag.x, dy = event.clientY - drag.y
      if (!drag.moved && Math.hypot(dx, dy) < 3) return
      drag.moved = true
      if (drag.dot) {
        const rect = el.getBoundingClientRect()
        const [x, y] = toWorld(event.clientX - rect.left, event.clientY - rect.top)
        drag.dot.fx = x
        drag.dot.fy = y
        // With motion off, only the dot moves; with it on, its neighbours follow.
        if (still()) ((drag.dot.x = x), (drag.dot.y = y), redraw())
        else sim.alphaTarget(0.25).restart()
        point(drag.dot, event)
      } else {
        view.x += dx
        view.y += dy
        drag.x = event.clientX
        drag.y = event.clientY
        setHover(null)
        redraw()
      }
    }
    const up = (event: PointerEvent): void => {
      if (!drag) return
      const { dot, moved } = drag
      drag = null
      if (dot) {
        dot.fx = null
        dot.fy = null
        sim.alphaTarget(0)
        if (!moved) {
          chime('open')
          onOpen(dot.type === 'capture' ? 'capture' : dot.type, dot.id)
        }
      }
      point(hit(event), event)
    }
    const leave = (): void => void (drag || point(null))
    const wheel = (event: WheelEvent): void => {
      // On a note's own map a plain scroll is the page's, so the panel still scrolls past it.
      if (small && !event.ctrlKey && !event.metaKey) return
      event.preventDefault()
      // A pinch (or ⌘ with the wheel) zooms at the pointer; two fingers pan.
      if (event.ctrlKey || event.metaKey) {
        const rect = el.getBoundingClientRect()
        const px = event.clientX - rect.left - width / 2, py = event.clientY - rect.top - height / 2
        const k = Math.min(4, Math.max(0.15, view.k * Math.exp(-Math.max(-40, Math.min(40, event.deltaY)) * 0.01)))
        view.x = px - ((px - view.x) / view.k) * k
        view.y = py - ((py - view.y) / view.k) * k
        view.k = k
      } else {
        view.x -= event.deltaX
        view.y -= event.deltaY
      }
      setHover(null)
      focus = null
      shown = null
      amount = 0
      redraw()
    }
    el.addEventListener('pointerdown', down)
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerup', up)
    el.addEventListener('pointerleave', leave)
    el.addEventListener('wheel', wheel, { passive: false })
    el.style.cursor = 'grab'
    return () => {
      // Kept only once shown in full: taken down mid-fade (or straight away,
      // as React's trial run in development does), the next draw fades in again.
      if (!arrive.size) for (const dot of dots) placed.current.set(dot.id, { x: dot.x!, y: dot.y! })
      cancelAnimationFrame(asked)
      sim.stop()
      cancelAnimationFrame(queued)
      cancelAnimationFrame(fading)
      resized.disconnect()
      themed.disconnect()
      el.removeEventListener('pointerdown', down)
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerup', up)
      el.removeEventListener('pointerleave', leave)
      el.removeEventListener('wheel', wheel)
    }
  }, [map, centre]) // eslint-disable-line react-hooks/exhaustive-deps

  const kind = hover && kindOf(hover.dot.kind)
  return (
    <div ref={box} className={cn('relative min-h-0 overflow-hidden select-none', className)}>
      <canvas ref={canvas} className="absolute inset-0 touch-none" />
      {hover && (
        <div ref={card} data-map-tip data-private={hover.dot.private ? '' : undefined} className={cn('pointer-events-none invisible absolute z-10 flex flex-col gap-0.5 rounded-md bg-popover px-2.5 py-1.5 text-xs text-popover-foreground shadow-[0_6px_20px_-6px_rgb(0_0_0/0.5)]', small ? 'max-w-[13rem]' : 'max-w-xs')}>
          <span className="private-text truncate font-medium">{hover.dot.title || 'Untitled'}</span>
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <span className="size-2 rounded-full" style={{ background: hover.dot.id === centre ? 'var(--tt-brand-color-400)' : kind?.tint ?? CAPTURE_TYPES[0].tint }} />
            {hover.dot.id === centre ? 'This note' : kind?.label ?? 'Note'} · {hover.dot.links} {hover.dot.links === 1 ? 'link' : 'links'}
          </span>
        </div>
      )}
      {children}
    </div>
  )
}
