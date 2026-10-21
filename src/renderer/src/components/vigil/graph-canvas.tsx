import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { forceCenter, forceCollide, forceLink, forceManyBody, forceSimulation, forceX, forceY, type Simulation, type SimulationLinkDatum, type SimulationNodeDatum } from 'd3-force'
import { CAPTURE_TYPES } from '@/components/capture-kinds/capture-kind-picker'
import type { MapNode, NoteMap } from '@/lib/notes'
import { notes } from '@/lib/notes'
import { chime } from '@/lib/sound'
import { cn } from '@/lib/cn'
import { spread } from '@/extensions/tokens'
import { withoutTags } from '../../../../main/tag-words'
import { clip } from '../../../../main/clip'
import { still } from '@/lib/motion'
import { wornStyle, type Style } from '@/lib/theme'

/** `px`, `py`: where it is drawn this frame, a breath away from where it sits. `rings`: one per band of links. */
type Dot = MapNode & SimulationNodeDatum & { r: number; rings: number; px: number; py: number; private?: boolean }
type Line = SimulationLinkDatum<Dot> & { source: Dot; target: Dot; weight: number }
type View = { x: number; y: number; k: number }
/** A dot on the map, with whether its title is kept out of sight. */
export type GraphNode = MapNode & { private?: boolean }
export type Graph = Omit<NoteMap, 'nodes'> & { nodes: GraphNode[] }

/** Bigger the more links touch it, but never so big it hides its neighbours. */
const radius = (links: number, small: boolean): number => (small ? Math.min(7, 2.5 + Math.sqrt(links) * 1.1) : Math.min(16, 3 + Math.sqrt(links) * 2.2))
export const kindOf = (kind: string): (typeof CAPTURE_TYPES)[number] | undefined => CAPTURE_TYPES.find((type) => type.id === kind)
const ease = (t: number): number => 1 - (1 - t) ** 3
/** A hub (a note with many links) wears one faint ring, so the places on the map read first. */
const ringsOf = (links: number, small: boolean): number => (links >= (small ? 8 : 12) ? 1 : 0)

/** A dot with no tag: the page's own quiet ink, so it recedes behind the tagged ones. */
export const NOTE_TINT = 'color-mix(in oklab, var(--muted-foreground) 62%, var(--background))'
/**
 * What colour a dot is: its main tag's hue from the theme, pulled toward the
 * page's quiet ink so a map of hundreds stays calm (on Paper, warm and muted;
 * never a loud violet). The kind is told by its icon, close up or pointed at.
 */
export const tintOf = (node: Pick<MapNode, 'tag' | 'tint'>): string =>
  node.tag ? `color-mix(in oklab, var(--tt-color-text-${node.tint ?? spread(node.tag)}) 62%, var(--muted-foreground))` : NOTE_TINT

// Each kind's icon as lines on a 24-square, for drawing inside a dot.
const ICONS: Record<string, string> = {
  note: 'M21 9a2.4 2.4 0 0 0-.706-1.706l-3.588-3.588a2.4 2.4 0 0 0-1.706-.706h-10a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2z M15 3v5a1 1 0 0 0 1 1h5',
  todo: 'M12 12m-9 0a9 9 0 1 0 18 0a9 9 0 1 0-18 0 M9 12l2 2l4-4',
  quote: 'M2.992 16.342a2 2 0 0 1 .094 1.167l-1.065 3.29a1 1 0 0 0 1.236 1.168l3.413-.998a2 2 0 0 1 1.099.092 10 10 0 1 0-4.777-4.719',
  word: 'm19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z',
  link: 'M9 15l6-6 M11 6l.463-.536a5 5 0 0 1 7.071 7.072l-.534.464 M13 18l-.397.534a5.068 5.068 0 0 1-7.127 0a4.972 4.972 0 0 1 0-7.071l.524-.463',
  decision: 'M16 3h5v5 M8 3H3v5 M12 22v-8.3a4 4 0 0 0-1.172-2.872L3 3 m15 9 6-6',
  // A person or a source on the Sources map (lucide's user and book-open).
  person: 'M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2 M12 7m-4 0a4 4 0 1 0 8 0a4 4 0 1 0-8 0',
  source: 'M12 7v14 M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z',
  // A tag on the Inbox's tag graph (lucide's hash).
  tag: 'M4 9h16 M4 15h16 M10 3 8 21 M16 3l-2 18',
  experiment: 'M14 2v6a2 2 0 0 0 .245.96l5.51 10.08A2 2 0 0 1 18 22H6a2 2 0 0 1-1.755-2.96l5.51-10.08A2 2 0 0 0 10 8V2 M6.453 15h11.094 M8.5 2h7'
}
let paths: Record<string, Path2D> | null = null
const iconId = (kind: string): string => (kind === 'person' || kind === 'source' || kind === 'tag' ? kind : kindOf(kind)?.id ?? 'note')
const iconOf = (kind: string): Path2D => (paths ??= Object.fromEntries(Object.entries(ICONS).map(([id, d]) => [id, new Path2D(d)])))[iconId(kind)] ?? paths.note

// Pictures for the busiest notes that have one, kept across visits: a data address, so the canvas stays readable.
const pictures = new Map<string, HTMLImageElement | null>()
/** How many dots show their picture, and only close up: the busiest few hubs. */
const PICTURED = 5

/**
 * Groups of notes that link mostly among themselves, by passing labels: each
 * note takes the label most of its neighbours have, a few times over.
 */
function groupsOf(dots: Dot[], near: Map<string, Set<string>>): Dot[][] {
  const label = new Map(dots.map((dot, at) => [dot.id, at]))
  for (let round = 0; round < 8; round++) {
    let changed = false
    for (const dot of dots) {
      const votes = new Map<number, number>()
      for (const id of near.get(dot.id)!) votes.set(label.get(id)!, (votes.get(label.get(id)!) ?? 0) + 1)
      let best = label.get(dot.id)!, most = votes.get(best) ?? 0
      for (const [one, count] of votes) if (count > most || (count === most && one < best)) ((best = one), (most = count))
      if (best !== label.get(dot.id)) ((changed = true), label.set(dot.id, best))
    }
    if (!changed) break
  }
  const groups = new Map<number, Dot[]>()
  for (const dot of dots) (groups.get(label.get(dot.id)!) ?? groups.set(label.get(dot.id)!, []).get(label.get(dot.id)!)!).push(dot)
  return [...groups.values()]
}

/** The outline around some points, as a convex hull (Andrew's monotone chain). */
function hullOf(points: [number, number][]): [number, number][] {
  const sorted = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1])
  const cross = (o: number[], a: number[], b: number[]): number => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
  const lower: [number, number][] = [], upper: [number, number][] = []
  for (const p of sorted) {
    while (lower.length >= 2 && cross(lower.at(-2)!, lower.at(-1)!, p) <= 0) lower.pop()
    lower.push(p)
  }
  for (const p of sorted.reverse()) {
    while (upper.length >= 2 && cross(upper.at(-2)!, upper.at(-1)!, p) <= 0) upper.pop()
    upper.push(p)
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)]
}

/**
 * A theme colour as the canvas can paint it, worked out by the browser from
 * the token. One hidden probe, kept: adding and taking away an element for
 * each colour made the browser restyle the whole page every time, hundreds
 * of times as the Map opened (most of a second, frozen).
 */
let probe: HTMLElement | null = null
function resolve(css: string): string {
  if (!probe?.isConnected) {
    probe = document.createElement('i')
    probe.style.display = 'none'
    probe.setAttribute('aria-hidden', 'true')
    document.body.append(probe)
  }
  probe.style.color = ''
  probe.style.color = css
  return getComputedStyle(probe).color
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
export function GraphCanvas({ map, onOpen, centre, fit: fitRef, fly, className, children }: {
  map: Graph
  onOpen: (type: string, id: string) => void
  centre?: string
  fit?: React.RefObject<() => void>
  /** Glide to a note and light it, as a find does; false when it is not on the map. */
  fly?: React.RefObject<(id: string) => boolean>
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
    const dots: Dot[] = map.nodes.map((node) => {
      const r = node.id === centre ? 8 : Math.round(radius(node.links, small) * 2) / 2
      return { ...node, r, rings: ringsOf(node.links, small), px: 0, py: 0, ...placed.current.get(node.id), ...(node.id === centre ? { fx: 0, fy: 0 } : {}) }
    })
    const byId = new Map(dots.map((dot) => [dot.id, dot]))
    const lines: Line[] = map.edges.map(([a, b, weight]) => ({ source: byId.get(a)!, target: byId.get(b)!, weight: weight ?? 1 }))
    const near = new Map<string, Set<string>>(dots.map((dot) => [dot.id, new Set()]))
    for (const [a, b] of map.edges) (near.get(a)!.add(b), near.get(b)!.add(a))
    const middle = centre ? byId.get(centre) : undefined
    // Named all the time: on a note's own map it and its busiest few; on the
    // Map the busiest dozen, so it reads as a place and not just dots.
    const busiest = [...dots].filter((dot) => dot !== middle && dot.links > 1).sort((a, b) => b.links - a.links)
    // The Map tries the busiest score or so and names the first dozen that fit clear of every dot.
    const named = middle ? [middle, ...busiest.slice(0, 5)] : busiest.slice(0, 24)
    // On the Map, any dot may be named once it is big enough on the screen: the busiest first.
    const ranked = [...dots].sort((a, b) => b.links - a.links)
    const ringGap = small ? 2 : 2.5
    // Groups washed faintly in their most common colour: big enough to be a
    // group, never most of the map.
    const groups = groupsOf(dots, near).filter((group) => group.length >= (small ? 4 : 5) && group.length <= dots.length * 0.6)

    // --- colours, read again whenever the theme changes
    type Shades = { base: string; light: string; rim: string; ring: string }
    let shades = new Map<string, Shades>()
    let edge = '', lit = '', ring = '', text = '', quiet = '', font = '', style: Style = 'soft', brutal = false, dark = false
    const colours = (): void => {
      shades = new Map()
      edge = resolve('color-mix(in oklab, var(--foreground) 13%, transparent)')
      lit = resolve('color-mix(in oklab, var(--foreground) 68%, transparent)')
      ring = resolve('var(--background)')
      text = resolve('var(--foreground)')
      quiet = resolve('color-mix(in oklab, var(--foreground) 72%, var(--background))')
      font = getComputedStyle(document.body).fontFamily
      style = wornStyle()
      brutal = style === 'brutal'
      const [r, g, b] = (ring.match(/[\d.]+/g) ?? ['255', '255', '255']).map(Number)
      dark = 0.2126 * r + 0.7152 * g + 0.0722 * b < 128
      sprites.clear()
    }
    const tokenOf = (dot: Dot): string => (dot === middle ? 'var(--tt-brand-color-400)' : tintOf(dot))
    // A colour (with lighter and darker steps kept for whatever wants them).
    const shadesOf = (token: string): Shades => {
      let found = shades.get(token)
      if (!found) shades.set(token, (found = {
        base: resolve(token),
        light: resolve(`color-mix(in oklab, ${token} 78%, white)`),
        rim: resolve(`color-mix(in oklab, ${token} 84%, black)`),
        ring: resolve(`color-mix(in oklab, ${token} ${dark ? 70 : 64}%, black)`)
      }))
      return found
    }
    // A private note's title stays hidden on the map unless titles are shown.
    // Its tags left out: the colour already says them.
    const titleOf = (dot: Dot): string => {
      const words = dot.private && !('reveal' in document.documentElement.dataset) ? 'Private note' : withoutTags(dot.title).replace(/\s+/g, ' ').trim() || dot.title || 'Untitled'
      const most = small ? 22 : 32
      return clip(words, most)
    }

    // --- each dot drawn once into a small canvas of its own, a chip, and
    // stamped from then on: a soft shadow, a lighter top, a darker rim, a fine
    // ring inside and the kind's icon. Made again at another zoom or theme.
    const sprites = new Map<string, { image: HTMLCanvasElement; half: number }>()
    const chipOf = (dot: Dot, scale: number, hot = false): { image: HTMLCanvasElement; half: number } => {
      const token = tokenOf(dot)
      const picture = pictures.get(dot.picture ?? '') ?? null
      const dpr = devicePixelRatio
      // One screen pixel, in the map's own units at this zoom.
      const px = dpr / scale
      const onScreen = dot.r / px
      // One plain disc from far off; the kind's icon once it is big enough to
      // read (or pointed at), and a hub's picture only close up.
      const shows = picture && onScreen >= 24 ? 'picture' : onScreen >= (hot ? 10 : 18) ? 'icon' : 'plain'
      const key = `${token}|${dot.r}|${dot.rings}|${shows === 'picture' ? dot.picture : shows === 'icon' ? iconId(dot.kind) : shows}|${scale}`
      let made = sprites.get(key)
      if (made) return made
      if (sprites.size > 800) sprites.clear()
      const half = dot.r + Math.max(dot.rings * ringGap + px, brutal ? 2 * px : 5 * px)
      const image = document.createElement('canvas')
      image.width = image.height = Math.ceil(half * 2 * scale)
      const c = image.getContext('2d')!
      c.scale(scale, scale)
      c.translate(half, half)
      const tone = shadesOf(token)
      // A hub's one faint ring.
      if (dot.rings) {
        c.beginPath()
        c.arc(0, 0, dot.r + ringGap, 0, Math.PI * 2)
        c.lineWidth = px
        c.strokeStyle = brutal ? text : tone.base
        c.globalAlpha = brutal ? 0.4 : 0.38
        c.stroke()
      }
      c.globalAlpha = 1
      // A flat disc in the tag's muted hue: no gloss, no shadow, so a thousand of them stay calm.
      c.beginPath()
      c.arc(0, 0, dot.r, 0, Math.PI * 2)
      c.fillStyle = tone.base
      c.fill()
      if (shows === 'picture') {
        // Cut to the circle and filled edge to edge, the middle kept.
        c.save()
        c.beginPath()
        c.arc(0, 0, dot.r - px, 0, Math.PI * 2)
        c.clip()
        const side = Math.min(picture!.naturalWidth, picture!.naturalHeight)
        c.drawImage(picture!, (picture!.naturalWidth - side) / 2, (picture!.naturalHeight - side) / 2, side, side, -dot.r, -dot.r, dot.r * 2, dot.r * 2)
        c.restore()
      }
      // An edge of the page's own colour, so touching dots stay apart; Brutal's thick outline
      // instead, Paper's hairline in the ink, and Swiss a hairline gap of the page, flat.
      c.beginPath()
      const line = brutal ? Math.min(2 * px, dot.r * 0.3) : style === 'paper' ? Math.min(px, dot.r * 0.2) : Math.min(1.2 * px, dot.r * 0.25)
      c.arc(0, 0, dot.r - line / 2, 0, Math.PI * 2)
      c.lineWidth = line
      c.strokeStyle = brutal || style === 'paper' ? text : ring
      c.globalAlpha = brutal ? 1 : style === 'paper' ? 0.55 : 0.9
      c.stroke()
      c.globalAlpha = 1
      if (shows === 'icon') {
        const size = dot.r * 1.12
        c.save()
        c.translate(-size / 2, -size / 2)
        c.scale(size / 24, size / 24)
        c.lineWidth = Math.max(2.2, (1.3 * px * 24) / size)
        c.lineCap = 'round'
        c.lineJoin = 'round'
        c.strokeStyle = ring
        c.globalAlpha = 0.92
        c.stroke(iconOf(dot.kind))
        c.restore()
      }
      made = { image, half }
      sprites.set(key, made)
      return made
    }
    colours()

    // --- the busiest notes with a picture show it, once it is loaded
    let gone = false
    for (const dot of dots.filter((one) => one.picture && !pictures.has(one.picture)).sort((a, b) => b.links - a.links).slice(0, PICTURED)) {
      const src = dot.picture!
      pictures.set(src, null)
      void notes.thumb(src, 96).then((data) => {
        if (!data?.startsWith('data:')) return
        const image = new Image()
        image.onload = () => {
          pictures.set(src, image)
          if (!gone) (sprites.clear(), redraw())
        }
        image.src = data
      }).catch(() => undefined)
    }
    // Only the busiest few, so a map of hundreds of pictures stays quick.
    const pictured = new Set(dots.filter((one) => one.picture).sort((a, b) => b.links - a.links).slice(0, PICTURED).map((one) => one.picture))
    for (const dot of dots) if (dot.picture && !pictured.has(dot.picture)) dot.picture = undefined

    // --- where the map is looked at from, and how close; `fitK` is how close the whole map fits
    const view: View = { x: 0, y: 0, k: 1 }
    let fitK = 1
    // Glides from here to there, eased; a new glide starts from wherever the last one had got to.
    let gliding = 0
    let goal: View | null = null
    const glide = (to: View, ms: number): void => {
      cancelAnimationFrame(gliding)
      if (still() || ms <= 0) {
        Object.assign(view, to)
        goal = null
        return redraw()
      }
      const from = { ...view }
      const start = performance.now()
      goal = to
      // Zoomed in log space, so the speed of the zoom feels even all the way.
      const step = (now: number): void => {
        const t = Math.min(1, (now - start) / ms), e = ease(t)
        const k = Math.exp(Math.log(from.k) + (Math.log(to.k) - Math.log(from.k)) * e)
        // The point under the middle moves in a straight line in the map's own units.
        const cx = from.x / from.k + (to.x / to.k - from.x / from.k) * e, cy = from.y / from.k + (to.y / to.k - from.y / from.k) * e
        Object.assign(view, { k, x: cx * k, y: cy * k })
        draw()
        if (t < 1) gliding = requestAnimationFrame(step)
        else goal = null
      }
      gliding = requestAnimationFrame(step)
    }
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
    let arriving = 0, began = 0
    const seen = (dot: Dot, now: number): number => {
      const at = arrive.get(dot)
      return at === undefined ? 1 : now <= at ? 0 : now >= at + 240 ? 1 : ease((now - at) / 240)
    }
    // On a note's own map the far ones are faded, so the near ones read first.
    let reach = 1
    const far = (dot: Dot): number => (middle && dot !== middle ? 1 - 0.55 * Math.max(0, Math.min(1, (Math.hypot(dot.x!, dot.y!) / reach - 0.45) / 0.55)) : 1)

    // --- breathing: each dot drifts a pixel or two on a slow loop of its own,
    // only while the map is in sight and motion is on
    let breathing = false
    const breath = (now: number): void => {
      const amp = breathing ? 1.4 : 0
      for (let at = 0; at < dots.length; at++) {
        const dot = dots[at]
        dot.px = dot.x! + (amp && dot !== middle ? amp * Math.sin(now / 1100 + at * 2.39) : 0)
        dot.py = dot.y! + (amp && dot !== middle ? amp * Math.cos(now / 1370 + at * 1.73) : 0)
      }
    }

    // --- the groups' washes, worked out again only when the dots have moved
    let washes: { path: Path2D; colour: string }[] | null = null
    const washOf = (): { path: Path2D; colour: string }[] =>
      (washes ??= groups.map((group) => {
        // The group's commonest colour.
        const count = new Map<string, number>()
        for (const dot of group) count.set(tokenOf(dot), (count.get(tokenOf(dot)) ?? 0) + 1)
        const token = [...count].sort((a, b) => b[1] - a[1])[0][0]
        // Its outline, padded round each corner, then smoothed through the middles of its sides.
        const outer = hullOf(group.map((dot) => [dot.x!, dot.y!]))
        const points: [number, number][] = []
        for (const at of outer) {
          const dot = group.find((one) => one.x === at[0] && one.y === at[1])!
          const pad = dot.r + dot.rings * ringGap + 14
          for (let turn = 0; turn < 12; turn++) points.push([at[0] + pad * Math.cos((turn * Math.PI) / 6), at[1] + pad * Math.sin((turn * Math.PI) / 6)])
        }
        const round = hullOf(points)
        const path = new Path2D()
        const mid = (a: number[], b: number[]): [number, number] => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]
        path.moveTo(...mid(round.at(-1)!, round[0]))
        round.forEach((at, i) => path.quadraticCurveTo(at[0], at[1], ...mid(at, round[(i + 1) % round.length])))
        path.closePath()
        return { path, colour: shadesOf(token).base }
      }))

    // A link bends gently, always the same way round, so it reads as drawn by hand.
    const curve = (path: CanvasRenderingContext2D | Path2D, line: Line): void => {
      const { px: x0, py: y0 } = line.source, { px: x1, py: y1 } = line.target
      path.moveTo(x0, y0)
      path.quadraticCurveTo((x0 + x1) / 2 - (y1 - y0) * 0.12, (y0 + y1) / 2 + (x1 - x0) * 0.12, x1, y1)
    }
    // Thicker the more often the two link: once, twice, three times or more.
    const thickness = (line: Line): number => [0.75, 1.15, 1.6][Math.min(3, line.weight) - 1]

    const draw = (): void => {
      const now = performance.now()
      const dpr = devicePixelRatio
      const growing = arrive.size > 0
      breath(now)
      context.setTransform(dpr, 0, 0, dpr, 0, 0)
      context.clearRect(0, 0, width, height)
      context.translate(width / 2 + view.x, height / 2 + view.y)
      context.scale(view.k, view.k)
      const around = shown ? near.get(shown.id)! : null
      const on = (dot: Dot): boolean => !around || dot === shown || around.has(dot.id)
      const alpha = (dot: Dot): number => (growing ? seen(dot, now) : 1) * (shown ? 1 : far(dot))
      // The rest fades as far as the lit neighbours stand out.
      const faded = 1 - 0.85 * amount
      // What the frame shows, in the map's own units.
      const frame = [-width / 2 - view.x, -height / 2 - view.y, width / 2 - view.x, height / 2 - view.y].map((at) => at / view.k)
      const inFrame = (dot: Dot, margin = 0): boolean => dot.x! >= frame[0] - margin && dot.x! <= frame[2] + margin && dot.y! >= frame[1] - margin && dot.y! <= frame[3] + margin
      // The groups' washes, faint, under everything.
      const grown = growing ? Math.max(0, Math.min(1, (now - began) / Math.max(1, arriving - began))) : 1
      // Only from far off, where they say where the groups are; close up they fade away.
      const afar = Math.max(0, Math.min(1, (1.4 * fitK - view.k) / (0.7 * fitK)))
      for (const wash of afar ? washOf() : []) {
        context.globalAlpha = (dark ? 0.045 : 0.03) * faded * grown * afar
        context.fillStyle = wash.colour
        context.fill(wash.path)
      }
      context.strokeStyle = edge
      const quietLines = lines.filter((line) => !shown || (line.source !== shown && line.target !== shown))
      if (growing || middle) {
        // One by one while they fade in, or as far out as they reach.
        for (const line of quietLines) {
          context.globalAlpha = faded * Math.min(alpha(line.source), alpha(line.target))
          if (!context.globalAlpha) continue
          context.lineWidth = thickness(line) / view.k
          context.beginPath()
          curve(context, line)
          context.stroke()
        }
      } else {
        // One stroke for each thickness.
        context.globalAlpha = faded
        for (const weight of [1, 2, 3]) {
          context.lineWidth = thickness({ weight } as Line) / view.k
          context.beginPath()
          for (const line of quietLines) if (Math.min(3, line.weight) === weight) curve(context, line)
          context.stroke()
        }
      }
      if (shown) {
        context.strokeStyle = lit
        context.globalAlpha = amount * (growing ? seen(shown, now) : 1)
        for (const line of lines) {
          if (line.source !== shown && line.target !== shown) continue
          context.lineWidth = (thickness(line) + 0.5) / view.k
          context.beginPath()
          curve(context, line)
          context.stroke()
        }
      }
      // Each dot stamped from its chip, made at about this zoom.
      const scale = 2 ** (Math.round(Math.log2(view.k * dpr) * 4) / 4)
      // Faded dots first, so the lit ones sit over them; the note itself last of all.
      const order = shown ? [...dots.filter((one) => !on(one)), ...dots.filter(on)] : dots
      for (const dot of middle ? [...order.filter((one) => one !== middle), middle] : order) {
        context.globalAlpha = (on(dot) ? 1 : faded) * alpha(dot)
        if (!context.globalAlpha) continue
        const { image, half } = chipOf(dot, scale, dot === shown)
        context.drawImage(image, dot.px - half, dot.py - half, half * 2, half * 2)
      }
      // Names, the busiest first, each beside its dot on the side away from
      // the middle, else the other side, above or below; one that would run
      // over a dot or another name in all four is left out, but for the
      // busiest hubs, which are always named. Pointed at,
      // the neighbours name themselves (the dot itself has its card);
      // otherwise the busiest are named all the time.
      // Worked out even before the light fades in, so the card knows where the names will be.
      // Placed by where each dot sits, not where it breathes to, so a name never hops.
      const pad = 4 / view.k, half = 7 / view.k
      // On the Map: the hubs in sight, then any dot big enough on the screen to
      // be worth a name; more of them the closer you are, each kept clear of
      // the dots and names around it.
      const sayFrom = (): Dot[] => {
        const list: Dot[] = []
        for (const dot of ranked) {
          if (list.length >= 80) break
          if (inFrame(dot) && (dot.rings || dot.r * view.k >= 9)) list.push(dot)
        }
        return list
      }
      const say = shown ? [...around!].map((id) => byId.get(id)!).sort((a, b) => b.links - a.links) : middle ? named : sayFrom()
      const most = Math.min(24, Math.round(10 * Math.sqrt(Math.max(1, view.k / fitK))))
      // Only the dots in sight can be in a name's way.
      const nearby = small ? dots : dots.filter((dot) => inFrame(dot, 40 / view.k))
      const from = shown ?? middle
      const reachOf = (dot: Dot): number => dot.r + (shown ? 0 : dot.rings * ringGap)
      // On the Map a name keeps off every dot, not only the named ones, or is left out.
      const clear = !small
      const taken = [...(shown ? [shown] : []), ...(clear && !shown ? [] : say)].map((dot) => ({ dot, box: [dot.x! - reachOf(dot), dot.y! - reachOf(dot), dot.x! + reachOf(dot), dot.y! + reachOf(dot)] }))
      // Names keep a little air between them, so two never read as one line.
      const air = small ? 0 : 6 / view.k
      const overlaps = (a: number[], b: number[]): boolean => !(a[2] + air < b[0] || a[0] - air > b[2] || a[3] + air < b[1] || a[1] - air > b[3])
      const strength = shown ? amount : 1 - amount
      context.font = `500 ${11 / view.k}px ${font}`
      context.textBaseline = 'middle'
      context.textAlign = 'left'
      // A halo of the page's own colour behind each name, so it reads over lines and washes.
      context.lineWidth = (small ? 4 : 3.5) / view.k
      context.strokeStyle = ring
      context.lineJoin = 'round'
      let said = 0
      for (const dot of say) {
        if (clear && !shown && said >= most) break
        const words = titleOf(dot)
        const wide = context.measureText(words).width
        const away = from ? dot.x! < from.x! || (dot === from && dot.x! > 0) : false
        const out = reachOf(dot)
        // [left edge, middle line, how it lines up]
        const right = [dot.x! + out + pad, dot.y!], left = [dot.x! - out - pad - wide, dot.y!]
        const above = [dot.x! - wide / 2, dot.y! - out - pad - half], below = [dot.x! - wide / 2, dot.y! + out + pad + half]
        // The note in the middle of its own map is named first, over or under
        // itself, whatever dots are there: the others keep off its name.
        const lead = dot === middle && !shown
        const spots = lead ? [above, below] : [...(away ? [left, right] : [right, left]), above, below]
        // A dot's circle, ring and all, against a name's box: the nearest point of the box inside it.
        const touches = (box: number[], other: Dot): boolean => {
          const reach = reachOf(other) + 1 / view.k
          return Math.hypot(Math.max(box[0], Math.min(other.x!, box[2])) - other.x!, Math.max(box[1], Math.min(other.y!, box[3])) - other.y!) < reach
        }
        // Free of every other name, and (on the Map) of the dots `blocks` says.
        const free = (blocks: (other: Dot) => boolean) => (box: number[]): boolean =>
          !taken.some((one) => one.dot !== dot && (!lead || one.dot === shown) && overlaps(box, one.box)) &&
          // A name cut off by the frame's edge is left out on a small map.
          !(small && (box[0] < frame[0] || box[2] > frame[2] || box[1] < frame[1] || box[3] > frame[3])) &&
          !(clear && nearby.some((other) => other !== dot && blocks(other) && touches(box, other)))
        const boxesAt = (further: number): number[][] => spots.map(([x, y], at) => {
          // Pushed straight out from the dot: right, left, up or down.
          const [dx, dy] = [[1, 0], [-1, 0], [0, -1], [0, 1]][lead ? at + 2 : at < 2 && away ? 1 - at : at]
          return [x + dx * further, y - half + dy * further, x + wide + dx * further, y + half + dy * further]
        })
        let spot = boxesAt(0).find(free(() => true))
        // The busiest hubs are always named, claiming room before the rest: when
        // all four spots touch a dot, a little further out with a fine line to
        // it, or else on a solid pill that may sit over small dots, never a name.
        let leader = false, pill = false
        if (!spot && clear && !shown && ranked.indexOf(dot) < 6) {
          // The line itself crosses no other dot, so it cannot seem to name that one.
          const crossesNone = (box: number[]): boolean => {
            const tx = Math.max(box[0], Math.min(dot.x!, box[2])) - dot.x!, ty = Math.max(box[1], Math.min(dot.y!, box[3])) - dot.y!
            const long = tx * tx + ty * ty || 1
            return !nearby.some((other) => {
              if (other === dot) return false
              const t = Math.max(0, Math.min(1, ((other.x! - dot.x!) * tx + (other.y! - dot.y!) * ty) / long))
              return Math.hypot(dot.x! + t * tx - other.x!, dot.y! + t * ty - other.y!) < reachOf(other) + 2 / view.k
            })
          }
          for (const further of [14, 28, 44]) if (!spot && (spot = boxesAt(further / view.k).find((box) => free(() => true)(box) && crossesNone(box)))) leader = true
          // A pill keeps off the hubs, near if it can, further out with its line if not.
          const big = (other: Dot): boolean => other.rings > 0 || other.r >= 7
          for (const further of [0, 14, 28, 44]) if (!spot && (spot = boxesAt(further / view.k).find(free(big)))) ((pill = true), (leader = further > 0))
          if (!spot && (spot = boxesAt(0).find(free(() => false)))) pill = true
        }
        if (!spot) continue
        said++
        taken.push({ dot: shown ?? dot, box: pill ? [spot[0] - pad, spot[1] - pad / 2, spot[2] + pad, spot[3] + pad / 2] : spot })
        context.globalAlpha = strength * (growing ? seen(dot, now) : 1)
        if (!context.globalAlpha) continue
        const sx = dot.px - dot.x!, sy = dot.py - dot.y!
        if (leader) {
          // From the dot's edge to the nearest point of its name.
          const tx = Math.max(spot[0], Math.min(dot.x!, spot[2])), ty = Math.max(spot[1], Math.min(dot.y!, spot[3]))
          const far = Math.hypot(tx - dot.x!, ty - dot.y!) || 1, edgeAt = reachOf(dot) / far
          context.save()
          context.strokeStyle = lit
          context.globalAlpha *= 0.6
          context.lineWidth = 1 / view.k
          context.beginPath()
          context.moveTo(dot.x! + (tx - dot.x!) * edgeAt + sx, dot.y! + (ty - dot.y!) * edgeAt + sy)
          context.lineTo(tx + sx, ty + sy)
          context.stroke()
          context.restore()
        }
        if (pill) {
          context.save()
          context.beginPath()
          context.roundRect(spot[0] - pad + sx, spot[1] - pad / 2 + sy, spot[2] - spot[0] + pad * 2, spot[3] - spot[1] + pad, style !== 'soft' ? 0 : half + pad / 2)
          context.fillStyle = ring
          context.fill()
          // Swiss: a flat block of the page, no outline.
          if (style !== 'swiss') {
            context.strokeStyle = brutal ? text : style === 'paper' ? quiet : edge
            context.lineWidth = (brutal ? 1.5 : 1) / view.k
            context.stroke()
          }
          context.restore()
        }
        context.fillStyle = dot === middle || shown ? text : quiet
        const x = spot[0] + sx, y = (spot[1] + spot[3]) / 2 + sy
        context.strokeText(words, x, y)
        context.fillText(words, x, y)
      }
      context.textAlign = 'left'
      // The lit dots and their names, on the screen: what the card must not cover.
      const screen = (at: number, middle: number, offset: number): number => middle + offset + at * view.k
      blocked.current = taken.map(({ box }) => [screen(box[0], width / 2, view.x), screen(box[1], height / 2, view.y), screen(box[2], width / 2, view.x), screen(box[3], height / 2, view.y)])
      context.globalAlpha = 1
      // Which note is lit, for whoever reads the canvas (a probe, a screen reader's label).
      const litNow = shown && amount > 0.5 ? titleOf(shown) : ''
      if (el.dataset.lit !== litNow) el.dataset.lit = litNow
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
      .force('collide', forceCollide<Dot>((dot) => dot.r + dot.rings * ringGap + (small ? 1.5 : 2)))
      // A weak pull to the middle keeps islands of two or three from drifting off.
      .force('x', forceX<Dot>(0).strength(small ? 0.06 : 0.1))
      .force('y', forceY<Dot>(0).strength(small ? 0.06 : 0.1))
      .on('tick', () => ((reach = Math.max(40, ...dots.map((dot) => Math.hypot(dot.x!, dot.y!)))), (washes = null), redraw()))
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
      const span = fresh.length === dots.length ? 360 : 120
      const out = Math.max(...fresh.map((dot) => Math.hypot(dot.x!, dot.y!)), 1)
      for (const dot of fresh) arrive.set(dot, start + span * Math.sqrt(Math.hypot(dot.x!, dot.y!) / out))
      arriving = start + span + 240
      began = start
    }

    // The whole map in view, with a margin.
    const fitted = (): View => {
      const xs = dots.map((dot) => dot.x!), ys = dots.map((dot) => dot.y!)
      const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]
      const margin = small ? 24 : 80
      const k = Math.min(small ? 1.6 : 2, Math.max(0.15, Math.min((width - margin) / (x1 - x0 + 40), (height - margin) / (y1 - y0 + 40))))
      fitK = k
      // A note's own map keeps its note in the middle.
      return { k, x: middle ? 0 : -((x0 + x1) / 2) * k, y: middle ? 0 : -((y0 + y1) / 2) * k }
    }
    // The first time at once; asked again (the Fit button), a glide back.
    let fittedOnce = false
    fit.current = () => {
      if (!width || !height) return
      const to = fitted()
      glide(to, fittedOnce ? 400 : 0)
      fittedOnce = true
      if (shown && !drag) ((focus = null), fade(0))
    }
    if (fly) fly.current = (id: string) => {
      const dot = byId.get(id)
      if (!dot || !width) return false
      const k = Math.max(view.k, fitK * 2.6, 1.1)
      glide({ k, x: -dot.x! * k, y: -dot.y! * k }, 450)
      focus = dot
      shown = dot
      draw()
      fade(1)
      chime('open')
      return true
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
    // Breathing only while the map is in sight, the window is shown and motion is on; about 25 drawings a second.
    let inSight = true, beat = 0
    const wake = (): void => {
      const on = inSight && document.visibilityState === 'visible' && !still()
      if (on === breathing) return
      breathing = on
      clearInterval(beat)
      if (on) beat = window.setInterval(redraw, 40)
      else redraw()
    }
    const sight = new IntersectionObserver(([entry]) => ((inSight = entry.isIntersecting), wake()))
    sight.observe(el)
    const reduced = matchMedia('(prefers-reduced-motion: reduce)')
    reduced.addEventListener('change', wake)
    document.addEventListener('visibilitychange', wake)
    wake()
    const themed = new MutationObserver(() => (colours(), wake(), draw()))
    themed.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'style', 'data-theme', 'data-style', 'data-reveal', 'data-motion'] })

    // Sent here to one note: brought close and lit, its neighbours named.
    const wanted = focusOn.current ? byId.get(focusOn.current) : undefined
    // Asked once: forgotten after the first frame, so a reload of the data
    // keeps the view (and React's trial unmount in development keeps the ask).
    const asked = requestAnimationFrame(() => (focusOn.current = null))
    if (wanted) {
      view.k = Math.max(view.k, 1.4)
      goal = null
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
        if (still()) ((drag.dot.x = x), (drag.dot.y = y), (washes = null), redraw())
        else sim.alphaTarget(0.25).restart()
        point(drag.dot, event)
      } else {
        cancelAnimationFrame(gliding)
        goal = null
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
        // From where the zoom under way is headed, so quick notches add up; a
        // pinch's many small steps follow the fingers, a mouse notch glides.
        const from = goal ?? view
        const k = Math.min(4, Math.max(0.1, from.k * Math.exp(-Math.max(-40, Math.min(40, event.deltaY)) * 0.01)))
        glide({ k, x: px - ((px - from.x) / from.k) * k, y: py - ((py - from.y) / from.k) * k }, Math.abs(event.deltaY) >= 20 ? 200 : 0)
      } else {
        cancelAnimationFrame(gliding)
        goal = null
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
      gone = true
      clearInterval(beat)
      sight.disconnect()
      reduced.removeEventListener('change', wake)
      document.removeEventListener('visibilitychange', wake)
      sim.stop()
      cancelAnimationFrame(queued)
      cancelAnimationFrame(fading)
      cancelAnimationFrame(gliding)
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
            <span className="size-2 rounded-full" style={{ background: hover.dot.id === centre ? 'var(--tt-brand-color-400)' : tintOf(hover.dot) }} />
            {hover.dot.id === centre ? 'This note' : hover.dot.kind === 'person' ? 'Person' : hover.dot.kind === 'source' ? 'Source' : kind?.label ?? 'Note'}{hover.dot.tag ? ` · #${hover.dot.tag}` : ''} · {hover.dot.links} {hover.dot.links === 1 ? 'link' : 'links'}
          </span>
        </div>
      )}
      {children}
    </div>
  )
}
