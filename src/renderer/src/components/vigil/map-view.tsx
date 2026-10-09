import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { forceCenter, forceCollide, forceLink, forceManyBody, forceSimulation, forceX, forceY, type Simulation, type SimulationLinkDatum, type SimulationNodeDatum } from 'd3-force'
import { alive } from '@/components/ui/alive-icon'
import ExpandIcon from '@/components/ui/expand-icon'
import { Button } from '@/components/ui/button'
import { CAPTURE_TYPES } from '@/components/capture-kinds/capture-kind-picker'
import { notes, type MapNode, type NoteMap } from '@/lib/notes'
import { useLive } from '@/lib/vigil'
import { exampleMap } from '@/lib/examples'
import { Example } from './example'
import { chime } from '@/lib/sound'
import { Empty, Rolling, Tip } from './ui'

const Fit = alive(ExpandIcon)

type Dot = MapNode & SimulationNodeDatum & { r: number }
type Line = SimulationLinkDatum<Dot> & { source: Dot; target: Dot }
type View = { x: number; y: number; k: number }

/** Bigger the more links touch it, but never so big it hides its neighbours. */
const radius = (links: number): number => Math.min(16, 3 + Math.sqrt(links) * 2.2)
const still = (): boolean => document.documentElement.dataset.motion === 'off' || matchMedia('(prefers-reduced-motion: reduce)').matches
const kindOf = (kind: string): (typeof CAPTURE_TYPES)[number] | undefined => CAPTURE_TYPES.find((type) => type.id === kind)

/** A theme colour as the canvas can paint it, worked out by the browser from the token. */
function resolve(css: string): string {
  const probe = document.createElement('i')
  probe.style.color = css
  document.body.append(probe)
  const said = getComputedStyle(probe).color
  probe.remove()
  return said
}

/**
 * Every note that links to another, as a dot, and every link as a line: the
 * shape of what you have joined up. Dots take their kind's colour and grow
 * with their links. Pointed at, a dot names itself and its neighbours light
 * up while the rest fades; clicked, it opens. Drag a dot, drag the space to
 * pan, pinch or ⌘-scroll to zoom. Notes with no links are left off.
 */
export function MapView({ onOpen }: { onOpen: (type: string, id: string) => void }): React.JSX.Element {
  const real = useLive(notes.map, null as NoteMap | null)
  // No links yet: a made-up map of a few books shows what it draws, dimmed and out of reach.
  const example = !!real && !real.nodes.length
  const examples = useMemo(exampleMap, [])
  const map = example ? examples : real
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
      const outside = Math.max(0, 8 - x) + Math.max(0, x + w - fw + 8) + Math.max(0, 8 - y) + Math.max(0, y + h - fh + 8)
      return covered + outside * 1000
    }
    const best = spots.reduce((a, b) => (cost(b) < cost(a) ? b : a))
    el.style.left = `${best[0]}px`
    el.style.top = `${best[1]}px`
    el.style.visibility = 'visible'
  }, [hover])
  const fit = useRef<() => void>(() => undefined)

  // Kinds on the map, for the key in the corner.
  const kinds = useMemo(() => {
    const seen = new Map<string, number>()
    for (const node of map?.nodes ?? []) seen.set(kindOf(node.kind)?.id ?? 'note', (seen.get(kindOf(node.kind)?.id ?? 'note') ?? 0) + 1)
    return CAPTURE_TYPES.filter((type) => seen.has(type.id))
  }, [map])

  // Kept across reloads of the data, so a new link does not throw every dot back to the start.
  const placed = useRef(new Map<string, { x: number; y: number }>())

  useEffect(() => {
    const el = canvas.current
    const frame = box.current
    if (!el || !frame || !map?.nodes.length) return
    const context = el.getContext('2d')!
    const dots: Dot[] = map.nodes.map((node) => ({ ...node, r: radius(node.links), ...placed.current.get(node.id) }))
    const byId = new Map(dots.map((dot) => [dot.id, dot]))
    const lines: Line[] = map.edges.map(([a, b]) => ({ source: byId.get(a)!, target: byId.get(b)! }))
    const near = new Map<string, Set<string>>(dots.map((dot) => [dot.id, new Set()]))
    for (const [a, b] of map.edges) (near.get(a)!.add(b), near.get(b)!.add(a))

    // --- colours, read again whenever the theme changes
    let ink: Record<string, string> = {}
    let edge = '', lit = '', ring = '', text = '', font = ''
    const colours = (): void => {
      ink = Object.fromEntries(CAPTURE_TYPES.map((type) => [type.id, resolve(type.tint)]))
      edge = resolve('color-mix(in oklab, var(--foreground) 16%, transparent)')
      lit = resolve('color-mix(in oklab, var(--foreground) 55%, transparent)')
      ring = resolve('var(--background)')
      text = resolve('var(--foreground)')
      font = getComputedStyle(document.body).fontFamily
    }
    colours()
    const fill = (dot: Dot): string => ink[kindOf(dot.kind)?.id ?? 'note']

    // --- where the map is looked at from, and how close
    const view: View = { x: 0, y: 0, k: 1 }
    let width = 0, height = 0
    const toWorld = (x: number, y: number): [number, number] => [(x - width / 2 - view.x) / view.k, (y - height / 2 - view.y) / view.k]

    // --- what the pointer is on, and how lit the neighbours are (0 to 1)
    let focus: Dot | null = null
    let shown: Dot | null = null
    let amount = 0
    let fading = 0

    const draw = (): void => {
      const dpr = devicePixelRatio
      context.setTransform(dpr, 0, 0, dpr, 0, 0)
      context.clearRect(0, 0, width, height)
      context.translate(width / 2 + view.x, height / 2 + view.y)
      context.scale(view.k, view.k)
      const around = shown ? near.get(shown.id)! : null
      const on = (dot: Dot): boolean => !around || dot === shown || around.has(dot.id)
      // The rest fades as far as the lit neighbours stand out.
      const faded = 1 - 0.82 * amount
      context.lineWidth = 1 / view.k
      context.strokeStyle = edge
      context.globalAlpha = faded
      context.beginPath()
      for (const line of lines) {
        if (shown && (line.source === shown || line.target === shown)) continue
        context.moveTo(line.source.x!, line.source.y!)
        context.lineTo(line.target.x!, line.target.y!)
      }
      context.stroke()
      if (shown) {
        context.globalAlpha = 1
        context.strokeStyle = lit
        context.lineWidth = 1.4 / view.k
        context.beginPath()
        for (const line of lines) {
          if (line.source !== shown && line.target !== shown) continue
          context.moveTo(line.source.x!, line.source.y!)
          context.lineTo(line.target.x!, line.target.y!)
        }
        context.globalAlpha = amount
        context.stroke()
      }
      context.lineWidth = 1.5 / view.k
      context.strokeStyle = ring
      // Faded dots first, so the lit ones sit over them.
      for (const dot of shown ? [...dots.filter((one) => !on(one)), ...dots.filter(on)] : dots) {
        context.globalAlpha = on(dot) ? 1 : faded
        context.beginPath()
        context.arc(dot.x!, dot.y!, dot.r, 0, Math.PI * 2)
        context.fillStyle = fill(dot)
        context.fill()
        context.stroke()
      }
      // The neighbours name themselves; the dot pointed at has its own card.
      // Worked out even before the light fades in, so the card knows where the names will be.
      if (shown) {
        context.globalAlpha = amount
        context.font = `500 ${11 / view.k}px ${font}`
        context.fillStyle = text
        context.textBaseline = 'middle'
        context.lineWidth = 3 / view.k
        context.strokeStyle = ring
        context.lineJoin = 'round'
        // Each name on the side away from the dot pointed at, the busiest
        // first; one that would run over a dot or another name is left out.
        const pad = 4 / view.k, half = 7 / view.k
        const lit = [...around!].map((id) => byId.get(id)!).sort((a, b) => b.links - a.links)
        const taken = [shown, ...lit].map((dot) => ({ dot, box: [dot.x! - dot.r, dot.y! - dot.r, dot.x! + dot.r, dot.y! + dot.r] }))
        for (const dot of lit) {
          const words = dot.title.length > 32 ? `${dot.title.slice(0, 31).trimEnd()}…` : dot.title || 'Untitled'
          const wide = context.measureText(words).width
          const left = dot.x! < shown.x!
          const x = left ? dot.x! - dot.r - pad : dot.x! + dot.r + pad
          const box = left ? [x - wide, dot.y! - half, x, dot.y! + half] : [x, dot.y! - half, x + wide, dot.y! + half]
          if (taken.some((one) => one.dot !== dot && !(box[2] < one.box[0] || box[0] > one.box[2] || box[3] < one.box[1] || box[1] > one.box[3]))) continue
          taken.push({ dot: shown, box })
          if (!amount) continue
          context.textAlign = left ? 'right' : 'left'
          context.strokeText(words, x, dot.y!)
          context.fillText(words, x, dot.y!)
        }
        context.textAlign = 'left'
        // The lit dots and their names, on the screen: what the card must not cover.
        const screen = (at: number, middle: number, offset: number): number => middle + offset + at * view.k
        blocked.current = taken.map(({ box }) => [screen(box[0], width / 2, view.x), screen(box[1], height / 2, view.y), screen(box[2], width / 2, view.x), screen(box[3], height / 2, view.y)])
      }
      context.globalAlpha = 1
    }
    let queued = 0
    const redraw = (): void => void (queued ||= requestAnimationFrame(() => ((queued = 0), draw())))

    // A short fade in and out, so the light follows the pointer rather than snapping.
    const fade = (to: number): void => {
      cancelAnimationFrame(fading)
      const from = amount
      const start = performance.now()
      const step = (now: number): void => {
        const t = Math.min(1, (now - start) / 140)
        amount = from + (to - from) * (1 - (1 - t) ** 3)
        if (to === 0 && t === 1) shown = null
        draw()
        if (t < 1) fading = requestAnimationFrame(step)
      }
      fading = requestAnimationFrame(step)
    }

    // --- the simulation: settled before it is seen when motion is off
    const sim: Simulation<Dot, Line> = forceSimulation(dots)
      .force('link', forceLink<Dot, Line>(lines).distance((line) => 18 + line.source.r + line.target.r).strength(0.6))
      .force('charge', forceManyBody<Dot>().strength((dot) => -40 - dot.r * 6).distanceMax(320))
      .force('collide', forceCollide<Dot>((dot) => dot.r + 2))
      // A weak pull to the middle keeps islands of two or three from drifting off.
      .force('x', forceX<Dot>(0).strength(0.1))
      .force('y', forceY<Dot>(0).strength(0.1))
      .force('center', forceCenter(0, 0))
      .on('tick', redraw)
      .on('end', () => {
        for (const dot of dots) placed.current.set(dot.id, { x: dot.x!, y: dot.y! })
      })
    const fresh = dots.some((dot) => dot.x === undefined || !placed.current.has(dot.id))
    if (still() || !fresh) {
      sim.stop()
      if (fresh) sim.alpha(1)
      else sim.alpha(0.05)
      while (sim.alpha() > sim.alphaMin()) sim.tick()
      for (const dot of dots) placed.current.set(dot.id, { x: dot.x!, y: dot.y! })
    } else {
      // Most of the settling done out of sight, so what is seen is the last
      // easing into place, not a tangle flying apart.
      sim.tick(Math.min(120, 40 + dots.length / 5))
    }

    // The whole map in view, with a margin.
    fit.current = () => {
      if (!width || !height) return
      const xs = dots.map((dot) => dot.x!), ys = dots.map((dot) => dot.y!)
      const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]
      view.k = Math.min(2, Math.max(0.2, Math.min((width - 80) / (x1 - x0 + 40), (height - 80) / (y1 - y0 + 40))))
      view.x = -((x0 + x1) / 2) * view.k
      view.y = -((y0 + y1) / 2) * view.k
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
    const resized = new ResizeObserver(size)
    resized.observe(frame)
    const themed = new MutationObserver(() => (colours(), draw()))
    themed.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'style', 'data-theme'] })

    // --- pointing, dragging, panning and zooming
    const hit = (event: PointerEvent | MouseEvent): Dot | null => {
      const rect = el.getBoundingClientRect()
      const [x, y] = toWorld(event.clientX - rect.left, event.clientY - rect.top)
      const found = sim.find(x, y, 24 / view.k)
      return found && Math.hypot(found.x! - x, found.y! - y) <= found.r + 4 / view.k ? found : null
    }
    const point = (dot: Dot | null, event?: PointerEvent): void => {
      el.style.cursor = drag ? 'grabbing' : dot ? 'pointer' : 'grab'
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
      const dot = hit(event)
      drag = { dot, x: event.clientX, y: event.clientY, moved: false }
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
      for (const dot of dots) placed.current.set(dot.id, { x: dot.x!, y: dot.y! })
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
  }, [map]) // eslint-disable-line react-hooks/exhaustive-deps

  const count = map?.nodes.length ?? 0
  const kind = hover && kindOf(hover.dot.kind)
  return (
    <section className="relative flex min-w-0 flex-1 flex-col">
      {/* Like every page, the line goes when it has nothing to count. */}
      {count && !example ? <header className="flex h-10 shrink-0 items-center gap-2 border-b px-5 text-muted-foreground">
        <span className="whitespace-nowrap tabular-nums"><Rolling text={count} /> linked {count === 1 ? 'note' : 'notes'}</span>
        <span className="whitespace-nowrap tabular-nums">· <Rolling text={map!.edges.length} /> {map!.edges.length === 1 ? 'link' : 'links'}</span>
        <div className="ml-auto flex items-center gap-1">
          <Tip label="Fit the map">
            <Button variant="ghost" size="icon-sm" onClick={() => (chime('tap'), fit.current())}><Fit className="size-3.5" /></Button>
          </Tip>
        </div>
      </header> : null}
      {count ? (
        <Example on={example} className="min-h-0 flex-1" tryIt="type [[ in any note and pick another one. The two show up here as dots, joined by a line.">
        <div ref={box} className="relative min-h-0 flex-1 overflow-hidden select-none">
          <canvas ref={canvas} className="absolute inset-0 touch-none" />
          {hover && (
            <div ref={card} data-map-tip className="pointer-events-none invisible absolute z-10 flex max-w-xs flex-col gap-0.5 rounded-md bg-popover px-2.5 py-1.5 text-xs text-popover-foreground shadow-[0_6px_20px_-6px_rgb(0_0_0/0.5)]"
              >
              <span className="truncate font-medium">{hover.dot.title || 'Untitled'}</span>
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <span className="size-2 rounded-full" style={{ background: kind?.tint ?? CAPTURE_TYPES[0].tint }} />
                {kind?.label ?? 'Note'} · {hover.dot.links} {hover.dot.links === 1 ? 'link' : 'links'}
              </span>
            </div>
          )}
          {/* What each colour means, and what was left off. */}
          <div className="pointer-events-none absolute bottom-3 left-4 flex max-w-[calc(100%-2rem)] flex-wrap items-center gap-x-3 gap-y-1 text-meta text-muted-foreground">
            {kinds.map((type) => (
              <span key={type.id} className="flex items-center gap-1.5"><span className="size-2 rounded-full" style={{ background: type.tint }} />{type.label}</span>
            ))}
            {map!.alone ? <span>{map!.alone} {map!.alone === 1 ? 'note has' : 'notes have'} no links and {map!.alone === 1 ? 'is' : 'are'} left off</span> : null}
          </div>
        </div>
        </Example>
      ) : !map ? null : (
        <div className="page-column">
          <Empty shape={['polygon', 2]} title="No links yet">
            Type [[ in a note and pick another to link them. Every note you link shows up here as a dot, joined to the notes it points to.
          </Empty>
        </div>
      )}
    </section>
  )
}
