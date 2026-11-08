import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { TIP } from '@/lib/float'
import { forceCenter, forceCollide, forceLink, forceManyBody, forceSimulation, forceX, forceY, type ForceLink, type ForceManyBody, type ForceX, type ForceY, type Simulation, type SimulationLinkDatum, type SimulationNodeDatum } from 'd3-force'
import { CAPTURE_TYPES } from '@/components/capture-kinds/capture-kind-picker'
import type { MapNode, NoteMap } from '@/lib/notes'
import { notes } from '@/lib/notes'
import { chime } from '@/lib/sound'
import { cn } from '@/lib/cn'
import { spread } from '@/extensions/tokens'
import { withoutTags } from '../../../../main/tag-words'
import { clip } from '../../../../main/clip'
import { still } from '@/lib/motion'

/** The app's own Motion switch is off: everything is instant (Reduce motion alone still fades). */
const off = (): boolean => document.documentElement.dataset.motion === 'off'
import { emojiIcons } from '@/lib/icon-style'
import { wornStyle, type Style } from '@/lib/theme'
import { hueTint, MAP_LOOK, type MapLook } from '@/lib/map-look'
import { plural } from '../../../../main/dates'

/** `px`, `py`: where it is drawn this frame, a breath away from where it sits. `rings`: one per band of links. */
type Dot = MapNode & SimulationNodeDatum & { r: number; r0: number; rings: number; px: number; py: number; private?: boolean }
/** `way`: which way the link runs (1: source to target, 2: back, 3: both), for arrows. */
type Line = SimulationLinkDatum<Dot> & { source: Dot; target: Dot; weight: number; way: number }
/** What the Map's settings change on a drawn map: its look and its layout. */
export type CanvasLook = Pick<MapLook, 'names' | 'dotSize' | 'lineSize' | 'arrows' | 'centre' | 'push' | 'linkPull' | 'linkLength'>
type View = { x: number; y: number; k: number }
/** A name at rest on the Map, kept from frame to frame (see `sayings`). `side`: which of its four plain spots, -1 for none. */
type Saying = { v: number; want: boolean; misses: number; rel: number[]; goal: number[]; box: number[]; leader: boolean; pill: boolean; side: number; words: string }
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
  node.tag ? hueTint(node.tint ?? spread(node.tag)) : NOTE_TINT

// Each kind's icon as lines on a 24-square, for drawing inside a dot.
const ICONS: Record<string, string> = {
  note: 'M21 9a2.4 2.4 0 0 0-.706-1.706l-3.588-3.588a2.4 2.4 0 0 0-1.706-.706h-10a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2z M15 3v5a1 1 0 0 0 1 1h5',
  todo: 'M12 12m-9 0a9 9 0 1 0 18 0a9 9 0 1 0-18 0 M9 12l2 2l4-4',
  quote: 'M2.992 16.342a2 2 0 0 1 .094 1.167l-1.065 3.29a1 1 0 0 0 1.236 1.168l3.413-.998a2 2 0 0 1 1.099.092 10 10 0 1 0-4.777-4.719',
  word: 'm19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z',
  link: 'M9 15l6-6 M11 6l.463-.536a5 5 0 0 1 7.071 7.072l-.534.464 M13 18l-.397.534a5.068 5.068 0 0 1-7.127 0a4.972 4.972 0 0 1 0-7.071l.524-.463',
  checkback: 'M16 3h5v5 M8 3H3v5 M12 22v-8.3a4 4 0 0 0-1.172-2.872L3 3 m15 9 6-6',
  // A person or a source on the Sources map (lucide's user and book-open).
  person: 'M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2 M12 7m-4 0a4 4 0 1 0 8 0a4 4 0 1 0-8 0',
  source: 'M12 7v14 M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z',
  // A tag on the Inbox's tag graph (lucide's hash).
  tag: 'M4 9h16 M4 15h16 M10 3 8 21 M16 3l-2 18',
}
/** Each kind as an emoji, for "Icons: Emoji" (lib/icon-style.ts); the legend under the Map says the same. */
export const KIND_EMOJI: Record<string, string> = { note: '📄', todo: '✅', quote: '💬', word: '🔖', link: '🔗', checkback: '⏳', person: '👤', source: '📖', tag: '🏷️' }
let paths: Record<string, Path2D> | null = null
const iconId = (kind: string): string => (kind === 'person' || kind === 'source' || kind === 'tag' ? kind : kindOf(kind)?.id ?? 'note')
const iconOf = (kind: string): Path2D => (paths ??= Object.fromEntries(Object.entries(ICONS).map(([id, d]) => [id, new Path2D(d)])))[iconId(kind)] ?? paths.note

// Pictures for the busiest notes that have one, kept across visits: a data address, so the canvas stays readable.
const pictures = new Map<string, HTMLImageElement | null>()
/** How long a map left panned or zoomed away from its dots waits, with no input, before it eases back to fit. */
const HOME_AFTER = 2000
/** How long the glide back to fit takes, by itself or from the Fit button: one motion for both. */
const HOME_GLIDE = 600
/** How long one dot takes to fade in as the map opens, and how long the wave of them takes from the middle out. */
const ARRIVE = 320
const ARRIVE_SPAN = 520
/**
 * The replay's spring, as Apple gives one: it answers in 0.6s, damped to 0.64 of the way to no bounce at all, so a
 * new dot springs out from its first link and overshoots its place by about 7% once, then rests: a soft landing,
 * never a shake. As a stiffness and a damping for a mass of one.
 */
const RESPONSE = 0.6, DAMPING = 0.64
const STIFF = (2 * Math.PI / RESPONSE) ** 2, DAMP = (4 * Math.PI * DAMPING) / RESPONSE
/** How long the camera takes to catch up with a growing map during the replay: most of the way in about half a second. */
const FOLLOW = 450
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

/** The order the Map's replay brings the dots in: as they were caught, the oldest first. */
export const replayOrder = <T extends Pick<MapNode, 'at' | 'id'>>(nodes: T[]): T[] =>
  [...nodes].sort((a, b) => (a.at ?? '').localeCompare(b.at ?? '') || a.id.localeCompare(b.id))
/** How many dots' worth of the replay one dot takes to fade in: a few overlap, so it flows rather than ticks. */
export const REPLAY_FADE = 3

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
export function GraphCanvas({ map, onOpen, centre, you, about, fit: fitRef, fly, replay, look, paint, calm = false, className, children }: {
  map: Graph
  /** `aside`: ⌥ was held, to open it beside. */
  onOpen: (type: string, id: string, aside?: boolean) => void
  centre?: string
  /** One dot besides the middle drawn as the one you are on: a note on its book's map. */
  you?: string
  /** A line more for a dot's hover card, by its id ("p. 12"). */
  about?: Record<string, string>
  fit?: React.RefObject<() => void>
  /** Glide to a note and light it, as a find does; false when it is not on the map. */
  fly?: React.RefObject<(id: string) => boolean>
  /** Show the map as it grew: `at` counts the dots in, in `replayOrder`, the last one fading in over `REPLAY_FADE`
   * of them; a link shows once both ends are there. Null shows it whole again. */
  replay?: React.RefObject<(at: number | null) => void>
  /** The Map's settings for its look and layout, applied to the drawn map as they change. */
  look?: CanvasLook
  /** A dot's colour from the Map's colour groups, else its tag's. */
  paint?: (node: MapNode) => string | undefined
  /** The Map's own calm motion: names that fade, keep their place and never flicker, and a map that settles out of
   * sight before it fades in. (A note's own map and the Inbox's tag map keep their quicker ways.) */
  calm?: boolean
  className?: string
  children?: React.ReactNode
}): React.JSX.Element {
  const small = !!centre
  const box = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  // The dot pointed at, by its middle and size on the screen.
  const [hover, setHover] = useState<{ dot: Dot; x: number; y: number; r: number } | null>(null)
  const blocked = useRef<number[][]>([])
  const namedAtRest = useRef<string[]>([])
  // For a probe too: each line out to a name that runs through another name, as "its dot's name > the name crossed".
  const crossedAtRest = useRef<string[]>([])
  const refusedAtRest = useRef<string[]>([])
  // For a probe: each name drawn at rest and how strongly (0 to 1).
  const shownNames = useRef<Record<string, number>>({})
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
  // How far the replay has come, kept across reloads of the data: the map built again for a new link carries on
  // from the same moment. (The bar's own effect runs before this one rebuilds, so it cannot be told again.)
  const replayAt = useRef<number | null>(null)
  // The settings, read by the drawing as it goes; told of a change, it retunes the layout or repaints without
  // building the map again.
  const tuned = useRef<CanvasLook>({ ...MAP_LOOK, ...look })
  const painted = useRef(paint)
  const retune = useRef<() => void>(() => undefined)
  const repaint = useRef<() => void>(() => undefined)
  useEffect(() => {
    tuned.current = { ...MAP_LOOK, ...look }
    retune.current()
  }, [look])
  useEffect(() => {
    painted.current = paint
    repaint.current()
  }, [paint])

  useEffect(() => {
    const el = canvas.current
    const frame = box.current
    if (!el || !frame || !map.nodes.length) return
    const context = el.getContext('2d')!
    const dots: Dot[] = map.nodes.map((node) => {
      const r0 = node.id === centre ? 8 : node.id === you ? 6.5 : Math.round(radius(node.links, small) * 2) / 2
      const r = small ? r0 : Math.round(r0 * tuned.current.dotSize * 2) / 2
      return { ...node, r, r0, rings: node.id === you ? 1 : ringsOf(node.links, small), px: 0, py: 0, ...placed.current.get(node.id), ...(node.id === centre ? { fx: 0, fy: 0 } : {}) }
    })
    const byId = new Map(dots.map((dot) => [dot.id, dot]))
    const lines: Line[] = map.edges.map(([a, b, weight, way]) => ({ source: byId.get(a)!, target: byId.get(b)!, weight: weight ?? 1, way: way ?? 0 }))
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
    let edge = '', lit = '', glow = '', arrow = '', ring = '', text = '', quiet = '', font = '', style: Style = 'soft', brutal = false, dark = false
    const colours = (): void => {
      shades = new Map()
      edge = resolve('color-mix(in oklab, var(--foreground) 13%, transparent)')
      lit = resolve('color-mix(in oklab, var(--foreground) 68%, transparent)')
      // A pointed-at dot's lines, in the accent, as Obsidian's graph lights them.
      glow = resolve('color-mix(in oklab, var(--primary) 85%, transparent)')
      arrow = resolve('color-mix(in oklab, var(--foreground) 32%, transparent)')
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
    const tokenOf = (dot: Dot): string => (dot === middle || dot.id === you ? 'var(--tt-brand-color-400)' : painted.current?.(dot) ?? tintOf(dot))
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
    type Chip = { image: HTMLCanvasElement; half: number; picture: boolean }
    const sprites = new Map<string, Chip>()
    // Two layers a dot: its disc (or a hub's picture), and its kind's icon on its own, so the icon can fade in and
    // out as the dot grows on the screen or lights, never popping on or off.
    const chipOf = (dot: Dot, scale: number, layer: 'disc' | 'icon' = 'disc'): Chip => {
      const token = tokenOf(dot)
      const picture = pictures.get(dot.picture ?? '') ?? null
      const dpr = devicePixelRatio
      // One screen pixel, in the map's own units at this zoom.
      const px = dpr / scale
      const onScreen = dot.r / px
      // A plain disc, and a hub's picture only close up; the icon is the other layer (iconShare says how much of it).
      const shows = layer === 'icon' ? 'icon' : picture && onScreen >= 24 ? 'picture' : 'plain'
      const emoji = shows === 'icon' && emojiIcons() ? KIND_EMOJI[iconId(dot.kind)] : undefined
      const key = `${token}|${dot.r}|${dot.rings}|${shows === 'picture' ? dot.picture : shows === 'icon' ? iconId(dot.kind) + (emoji ? '|emoji' : '') : shows}|${scale}`
      let made = sprites.get(key)
      if (made) return made
      if (sprites.size > 800) sprites.clear()
      // Room for the ring and, but on Brutal, the soft shadow under the dot.
      const half = dot.r + Math.max(dot.rings * ringGap + px, brutal ? 2 * px : Math.max(5 * px, dot.r * 0.22 + 2 * px))
      const image = document.createElement('canvas')
      image.width = image.height = Math.ceil(half * 2 * scale)
      const c = image.getContext('2d')!
      c.scale(scale, scale)
      c.translate(half, half)
      const tone = shadesOf(token)
      if (shows !== 'icon') {
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
        // A faint shadow where the dot meets the page, a little below it, so it sits on
        // the map rather than in it. Brutal stays flat: its outline is the whole point.
        if (!brutal) {
          const drop = Math.max(px, dot.r * 0.08)
          const shadow = c.createRadialGradient(0, drop, dot.r * 0.7, 0, drop, dot.r * 1.18)
          shadow.addColorStop(0, `rgba(0,0,0,${dark ? 0.34 : 0.13})`)
          shadow.addColorStop(1, 'rgba(0,0,0,0)')
          c.beginPath()
          c.arc(0, drop, dot.r * 1.18, 0, Math.PI * 2)
          c.fillStyle = shadow
          c.fill()
        }
        // The disc in the tag's muted hue.
        c.beginPath()
        c.arc(0, 0, dot.r, 0, Math.PI * 2)
        c.fillStyle = tone.base
        c.fill()
        if (!brutal && shows !== 'picture') {
          // Quiet depth: light from the top left, a little darker toward the rim.
          const light = c.createRadialGradient(-dot.r * 0.38, -dot.r * 0.42, 0, -dot.r * 0.38, -dot.r * 0.42, dot.r * 1.25)
          light.addColorStop(0, tone.light)
          light.addColorStop(1, 'rgba(255,255,255,0)')
          c.globalAlpha = dark ? 0.32 : style === 'paper' ? 0.4 : 0.55
          c.fillStyle = light
          c.fill()
          const rim = c.createRadialGradient(0, 0, dot.r * 0.62, 0, 0, dot.r)
          rim.addColorStop(0, 'rgba(0,0,0,0)')
          rim.addColorStop(1, tone.rim)
          c.globalAlpha = dark ? 0.6 : 0.45
          c.fillStyle = rim
          c.fill()
          c.globalAlpha = 1
        }
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
        // instead, and Paper's hairline in the ink.
        c.beginPath()
        const line = brutal ? Math.min(2 * px, dot.r * 0.3) : style === 'paper' ? Math.min(px, dot.r * 0.2) : Math.min(1.2 * px, dot.r * 0.25)
        c.arc(0, 0, dot.r - line / 2, 0, Math.PI * 2)
        c.lineWidth = line
        c.strokeStyle = brutal || style === 'paper' ? text : ring
        c.globalAlpha = brutal ? 1 : style === 'paper' ? 0.55 : 0.9
        c.stroke()
        c.globalAlpha = 1
      }
      if (emoji) {
        // "Icons: Emoji": the kind's emoji on the disc, a little quiet; greyed with "Coloured icons" off.
        c.font = `${dot.r * 0.95}px system-ui`
        c.textAlign = 'center'
        c.textBaseline = 'middle'
        c.globalAlpha = 0.9
        if (document.documentElement.dataset.iconColour === 'off') c.filter = 'grayscale(1)'
        c.fillText(emoji, 0, dot.r * 0.06)
        c.filter = 'none'
        c.globalAlpha = 1
      } else if (shows === 'icon') {
        // Small and near the dot's own colour: there to be found, not to be read first.
        const size = dot.r * 0.86
        c.save()
        c.translate(-size / 2, -size / 2)
        c.scale(size / 24, size / 24)
        c.lineWidth = Math.max(1.8, (1.1 * px * 24) / size)
        c.lineCap = 'round'
        c.lineJoin = 'round'
        c.strokeStyle = dark ? tone.light : tone.ring
        c.globalAlpha = dark ? 0.6 : 0.55
        c.stroke(iconOf(dot.kind))
        c.restore()
      }
      made = { image, half, picture: shows === 'picture' }
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
      // Timed from its first frame's own clock: a frame's time is when the frame began, which can be a moment
      // before this was asked, and a time before the start eased below zero.
      let start = -1
      goal = to
      // Zoomed in log space, so the speed of the zoom feels even all the way.
      const step = (now: number): void => {
        if (start < 0) start = now
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

    // A dot or the space being dragged (declared here: the camera's follow reads it from the first drawing on).
    let drag: { dot: Dot | null; x: number; y: number; moved: boolean } | null = null
    // --- what the pointer is on, and how lit the neighbours are (0 to 1)
    let focus: Dot | null = null
    let shown: Dot | null = null
    let amount = 0
    // The links reach out from the dot pointed at, and each neighbour lights as its link arrives (not under reduced motion).
    let reachFor: Dot | null = null
    let reachAt = 0
    let fading = 0

    // --- fading in: each new dot from a moment set by how far out it sits,
    // so the map grows from its middle (about 600ms in all)
    const arrive = new Map<Dot, number>()
    const arrival = calm ? ARRIVE : 240
    let arriving = 0, began = 0
    const seen = (dot: Dot, now: number): number => {
      const at = arrive.get(dot)
      return at === undefined ? 1 : now <= at ? 0 : now >= at + arrival ? 1 : ease((now - at) / arrival)
    }
    // On a note's own map the far ones are faded, so the near ones read first.
    let reach = 1
    // Each name at rest as it is drawn: how far shown (0 to 1) and whether it is wanted, and its box beside its dot
    // in screen pixels, where it is drawn (`rel`) and where it is going (`goal`). Kept from frame to frame, so a
    // name fades in and out and glides, never blinks or hops. `leaving`: the boxes of names on their way out.
    const sayings = new Map<Dot, Saying>()
    let saidAt = 0, namesMoving = false
    let leaving: { dot: Dot; box: number[] }[] = []
    // How far the replay has come, in dots, and each dot's place in it.
    let cut = replayAt.current
    const rank = new Map(replayOrder(dots).map((dot, at) => [dot as Dot, at]))
    /** How much of a dot the replay shows: none before its turn, all of it a few dots after. */
    const got = (dot: Dot): number => (cut === null ? 1 : Math.max(0, Math.min(1, (cut - rank.get(dot)!) / REPLAY_FADE)))
    const far = (dot: Dot): number => (middle && dot !== middle ? 1 - 0.55 * Math.max(0, Math.min(1, (Math.hypot(dot.x!, dot.y!) / reach - 0.45) / 0.55)) : 1)

    // --- breathing: each dot drifts a pixel or two on a slow loop of its own,
    // only while the map is in sight and motion is on
    let breathing = false
    // --- the replay's springs: each new dot drawn away from its place by an offset that springs to nothing (from its
    // first link's dot), and at a size that springs from about a third to whole (from nothing it read as a pop). Stepped every 4ms of the frame's time.
    type Spring = { ox: number; oy: number; vx: number; vy: number; s: number; vs: number }
    const springs = new Map<Dot, Spring>()
    let sprungAt = 0
    const spring = (now: number): void => {
      const dt = Math.min(0.05, Math.max(0, (now - sprungAt) / 1000))
      sprungAt = now
      if (!springs.size || !dt) return
      const steps = Math.ceil(dt / 0.004), h = dt / steps
      for (const [dot, one] of springs) {
        for (let i = 0; i < steps; i++) {
          one.vx += (-STIFF * one.ox - DAMP * one.vx) * h
          one.vy += (-STIFF * one.oy - DAMP * one.vy) * h
          one.vs += (-STIFF * (one.s - 1) - DAMP * one.vs) * h
          one.ox += one.vx * h
          one.oy += one.vy * h
          one.s += one.vs * h
        }
        if (Math.abs(one.ox) + Math.abs(one.oy) < 0.05 && Math.abs(one.vx) + Math.abs(one.vy) < 0.5 && Math.abs(one.s - 1) < 0.002 && Math.abs(one.vs) < 0.01) springs.delete(dot)
      }
    }
    const breath = (now: number): void => {
      spring(now)
      const amp = breathing ? 1.4 : 0
      for (let at = 0; at < dots.length; at++) {
        const dot = dots[at]
        const sprung = springs.get(dot)
        dot.px = dot.x! + (sprung?.ox ?? 0) + (amp && dot !== middle ? amp * Math.sin(now / 1100 + at * 2.39) : 0)
        dot.py = dot.y! + (sprung?.oy ?? 0) + (amp && dot !== middle ? amp * Math.cos(now / 1370 + at * 1.73) : 0)
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
    // An arrow's head on a link's curve, its tip on the edge of the dot it points to.
    const arrowAt = (line: Line, toTarget: boolean, size: number): void => {
      const { px: x0, py: y0 } = line.source, { px: x1, py: y1 } = line.target
      const cx = (x0 + x1) / 2 - (y1 - y0) * 0.12, cy = (y0 + y1) / 2 + (x1 - x0) * 0.12
      const end = toTarget ? line.target : line.source
      const dx = end.px - cx, dy = end.py - cy, long = Math.hypot(dx, dy) || 1
      const ux = dx / long, uy = dy / long
      const tipX = end.px - ux * end.r, tipY = end.py - uy * end.r
      context.moveTo(tipX, tipY)
      context.lineTo(tipX - ux * size - uy * size * 0.55, tipY - uy * size + ux * size * 0.55)
      context.lineTo(tipX - ux * size + uy * size * 0.55, tipY - uy * size - ux * size * 0.55)
      context.closePath()
    }
    // Thicker the more often the two link: once, twice, three times or more.
    const thickness = (line: Line): number => [0.75, 1.15, 1.6][Math.min(3, line.weight) - 1] * (small ? 1 : tuned.current.lineSize)

    // How much of a dot's icon shows: none on a small dot, all once it is 20px across or more on the screen, eased
    // between; a lit dot (pointed at, or a neighbour) shows it from smaller, as the light comes in.
    const ramp = (value: number, from: number, to: number): number => Math.max(0, Math.min(1, (value - from) / (to - from)))
    const iconShare = (dot: Dot, hot: boolean): number => {
      const onScreen = dot.r * view.k
      return Math.max(ramp(onScreen, 14, 20), hot ? amount * ramp(onScreen, 7, 11) : 0)
    }
    const draw = (): void => {
      const now = performance.now()
      const dpr = devicePixelRatio
      const growing = arrive.size > 0
      follow(now)
      breath(now)
      context.setTransform(dpr, 0, 0, dpr, 0, 0)
      context.clearRect(0, 0, width, height)
      context.translate(width / 2 + view.x, height / 2 + view.y)
      context.scale(view.k, view.k)
      const around = shown ? near.get(shown.id)! : null
      const on = (dot: Dot): boolean => !around || dot === shown || around.has(dot.id)
      if (shown !== reachFor) ((reachFor = shown), (reachAt = now))
      const reach = !shown || still() ? 1 : ease(Math.min(1, (now - reachAt) / 240))
      const alpha = (dot: Dot): number => (growing ? seen(dot, now) : 1) * (shown ? 1 : far(dot)) * got(dot)
      // The rest fades as far as the lit neighbours stand out.
      // The rest steps back, never out: still there to see, so the page does not flare when most of it goes.
      const faded = 1 - 0.55 * amount
      // What the frame shows, in the map's own units.
      const frame = [-width / 2 - view.x, -height / 2 - view.y, width / 2 - view.x, height / 2 - view.y].map((at) => at / view.k)
      const inFrame = (dot: Dot, margin = 0): boolean => dot.x! >= frame[0] - margin && dot.x! <= frame[2] + margin && dot.y! >= frame[1] - margin && dot.y! <= frame[3] + margin
      // The groups' washes, faint, under everything.
      const grown = growing ? Math.max(0, Math.min(1, (now - began) / Math.max(1, arriving - began))) : 1
      // Only from far off, where they say where the groups are; close up they fade away.
      const afar = Math.max(0, Math.min(1, (1.4 * fitK - view.k) / (0.7 * fitK)))
      for (const wash of afar && cut === null ? washOf() : []) {
        context.globalAlpha = (dark ? 0.045 : 0.03) * faded * grown * afar
        context.fillStyle = wash.colour
        context.fill(wash.path)
      }
      context.strokeStyle = edge
      const quietLines = lines.filter((line) => !shown || (line.source !== shown && line.target !== shown))
      if (growing || middle || cut !== null) {
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
        context.strokeStyle = glow
        context.globalAlpha = amount * (growing ? seen(shown, now) : 1)
        for (const line of lines) {
          if (line.source !== shown && line.target !== shown) continue
          context.lineWidth = (thickness(line) + 0.5) / view.k
          // Drawn as far as it has reached, from the dot pointed at outward: a dash along the curve, a little longer than its chord.
          const length = Math.hypot(line.target.x! - line.source.x!, line.target.y! - line.source.y!) * 1.25 + 1
          if (reach < 1) {
            context.setLineDash([length * reach, length * 2])
            context.lineDashOffset = line.source === shown ? -length * (1 - reach) : 0
          }
          context.beginPath()
          curve(context, line)
          context.stroke()
        }
        context.setLineDash([])
        context.lineDashOffset = 0
      }
      // "Arrows": a small head where each link lands, so which note points to which shows.
      if (tuned.current.arrows && !small) {
        // In step with the dots, so small dots never wear heads bigger than themselves.
        const size = (5 * Math.sqrt(tuned.current.dotSize)) / view.k
        for (const line of lines) {
          if (!line.way) continue
          const hot = !!shown && (line.source === shown || line.target === shown)
          context.globalAlpha = hot ? amount * (growing ? seen(shown!, now) : 1) : faded * Math.min(alpha(line.source), alpha(line.target))
          if (!context.globalAlpha) continue
          context.fillStyle = hot ? glow : arrow
          context.beginPath()
          if (line.way & 1) arrowAt(line, true, size)
          if (line.way & 2) arrowAt(line, false, size)
          context.fill()
        }
      }
      // Each dot stamped from its chip, made at about this zoom.
      const scale = 2 ** (Math.round(Math.log2(view.k * dpr) * 4) / 4)
      // Faded dots first, so the lit ones sit over them; the note itself last of all. In the replay a dot still
      // springing out is drawn under the rest, so it slides out from behind its first link, never over it.
      const settled = springs.size ? [...dots.filter((one) => springs.has(one)), ...dots.filter((one) => !springs.has(one))] : dots
      const order = shown ? [...settled.filter((one) => !on(one)), ...settled.filter(on)] : settled
      for (const dot of middle ? [...order.filter((one) => one !== middle), middle] : order) {
        // A neighbour lights as its link arrives; the dot pointed at at once.
        const lit = !shown || dot === shown ? 1 : faded + (1 - faded) * Math.max(0, Math.min(1, (reach - 0.55) / 0.45))
        context.globalAlpha = (on(dot) ? lit : faded) * alpha(dot)
        if (!context.globalAlpha) continue
        // Arriving, a dot grows from most of its size as it fades in, so it lands rather than blinks on; in the replay
      // it grows from a third of its size as it springs out from its first link.
        const sprung = springs.get(dot)
        const grow = (growing ? (still() ? 1 : calm ? 0.85 + 0.15 * seen(dot, now) : 0.7 + 0.3 * seen(dot, now)) : 1) * (sprung ? Math.max(0, sprung.s) : 1)
        const chip = chipOf(dot, scale), half = chip.half * grow
        // The page under the dot first, as solid as the dot is there: a faded or tinted dot reads paler, never
        // see-through, so the lines that run to it never show across its face.
        const shade = context.globalAlpha
        context.globalAlpha = Math.min(1, shade * 2)
        context.beginPath()
        context.arc(dot.px, dot.py, dot.r * grow, 0, Math.PI * 2)
        context.fillStyle = ring
        context.fill()
        context.globalAlpha = shade
        context.drawImage(chip.image, dot.px - half, dot.py - half, half * 2, half * 2)
        if (chip.picture) continue
        const share = iconShare(dot, dot === shown || (!!shown && on(dot)))
        if (share <= 0) continue
        context.globalAlpha *= share
        const icon = chipOf(dot, scale, 'icon'), inner = icon.half * grow
        context.drawImage(icon.image, dot.px - inner, dot.py - inner, inner * 2, inner * 2)
      }
      // Names, the busiest first, each beside its dot on the side away from
      // the middle, else the other side, above or below; one that would run
      // over a dot or another name in all four is left out, but for the
      // busiest hubs, which are always named. Pointed at,
      // the neighbours name themselves (the dot itself has its card);
      // otherwise the busiest are named all the time.
      // Worked out even before the light fades in, so the card knows where the names will be.
      // Placed by where each dot sits, not where it breathes to, so a name never hops.
      // padX: a name's pill reaches further either side than above and below, so its words never sit at its rounded ends.
      const pad = 4 / view.k, padX = 8 / view.k, half = 7 / view.k
      namesMoving = false
      // On the Map: the hubs in sight, then any dot big enough on the screen to
      // be worth a name; more of them the closer you are, each kept clear of
      // the dots and names around it.
      const sayFrom = (): Dot[] => {
        const list: Dot[] = []
        for (const dot of ranked) {
          if (list.length >= 80) break
          // A name already shown keeps it until its dot is 15% under the size that brought it: resting near the
          // threshold, it never comes and goes.
          const big = dot.r * view.k >= tuned.current.names * (calm && sayings.get(dot)?.want ? 0.85 : 1)
          if (inFrame(dot, sayings.get(dot)?.want ? 30 / view.k : 0) && (dot.rings || dot.type === 'tag' || big) && got(dot) > 0) list.push(dot)
        }
        // The tags first, each its cluster's name: they claim their room before any other name and its line does
        // (at 50 captures, the lines out to busier captures' names hemmed #health in on every side, and it had none).
        // Then the names already shown, busiest first, so a name on the map keeps its room and a newcomer that would
        // land on it waits rather than pushing it off.
        const had = (dot: Dot): boolean => !!sayings.get(dot)?.want
        return [...list.filter((dot) => dot.type === 'tag'), ...list.filter((dot) => dot.type !== 'tag' && had(dot)), ...list.filter((dot) => dot.type !== 'tag' && !had(dot))]
      }
      // The names, for the dot pointed at (its neighbours) or, with none, the ones named at rest. While the light
      // fades in or out both are drawn, each at its share, so the names at rest step back as the lit ones come
      // instead of all going in one frame.
      const nameAll = (shown: Dot | null, strength: number): { dot: Dot; box: number[] }[] => {
        if (!shown) refusedAtRest.current = []
        // The names placed at rest this frame, drawn after at their own strength.
        const placedNow = new Map<Dot, Omit<Saying, 'v' | 'want' | 'misses' | 'rel' | 'goal'>>()
        const say = shown ? [...near.get(shown.id)!].map((id) => byId.get(id)!).sort((a, b) => b.links - a.links) : middle ? named : sayFrom()
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
        // The fine lines from a dot out to its name: no other name may sit on one, and none may cross another name
        // (at 500 captures a line ran through "number 461"). [x1, y1, x2, y2] in the map's own units, with its dot.
        const lines: { dot: Dot; line: number[] }[] = []
        // Where the names start in `taken` (before them, the dots' own circles kept clear).
        const firstName = taken.length
        /** Whether the line a-b passes through the box, a little air round it (Liang-Barsky). */
        const crosses = ([x1, y1, x2, y2]: number[], box: number[]): boolean => {
          const [l, t, r, b] = [box[0] - air, box[1] - air, box[2] + air, box[3] + air]
          let lo = 0, hi = 1
          const dx = x2 - x1, dy = y2 - y1
          for (const [p, q] of [[-dx, x1 - l], [dx, r - x1], [-dy, y1 - t], [dy, b - y1]]) {
            if (p === 0) { if (q < 0) return false; continue }
            const at = q / p
            if (p < 0) lo = Math.max(lo, at)
            else hi = Math.min(hi, at)
            if (lo > hi) return false
          }
          return true
        }
        context.font = `500 ${11 / view.k}px ${font}`
        context.textBaseline = 'middle'
        context.textAlign = 'left'
        // A halo of the page's own colour behind each name, so it reads over lines and washes.
        context.lineWidth = (small ? 4 : 3.5) / view.k
        context.strokeStyle = ring
        context.lineJoin = 'round'
        let said = 0
        // Named whatever the crowd: the busiest hubs, and every tag (a tag dot is a cluster's name, and with none it
        // is a dot nobody can read; note: one tag near #garden at 500 captures had no name).
        const must = (dot: Dot): boolean => ranked.indexOf(dot) < 6 || dot.type === 'tag'
        for (const dot of say) {
          if (clear && !shown && said >= most + (sayings.get(dot)?.want ? 3 : 0) && !must(dot)) continue
          const words = titleOf(dot)
          const wide = context.measureText(words).width
          const away = from ? dot.x! < from.x! || (dot === from && dot.x! > 0) : false
          const out = reachOf(dot)
          // [left edge, middle line, how it lines up]
          const right = [dot.x! + out + padX, dot.y!], left = [dot.x! - out - padX - wide, dot.y!]
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
          // From the dot's edge to the nearest point of a name's box: the line a name further out is drawn with.
          const lineTo = (box: number[]): number[] => {
            const tx = Math.max(box[0], Math.min(dot.x!, box[2])), ty = Math.max(box[1], Math.min(dot.y!, box[3]))
            const far = Math.hypot(tx - dot.x!, ty - dot.y!) || 1, edgeAt = reachOf(dot) / far
            return [dot.x! + (tx - dot.x!) * edgeAt, dot.y! + (ty - dot.y!) * edgeAt, tx, ty]
          }
          // Its line, for a name further out, crosses no name already placed. Names only: on a small map `taken` starts
          // with every named dot's own circle, and a line from a dot in a crowded cluster ran into a neighbour's circle
          // whichever way it went, so #health at 50 captures was refused all 180 places it tried and had no name.
          const clearLine = (box: number[]): boolean => !taken.slice(firstName).some((one) => one.dot !== dot && one.dot !== shown && crosses(lineTo(box), one.box))
          // Where a name remembers its last place (the Map at rest; never a tag's, a cluster's name placed afresh each
          // time so its lines out are never hemmed in: #health at 50 tags had none).
          const remembered = !shown && calm && dot.type !== 'tag'
          // A name already shown is let off its first 3 pixels of overlap, so one at the edge of fitting never comes and goes
          // as the zoom rests there; a new name must fit clear.
          const slack = remembered && sayings.get(dot)?.want ? 3 / view.k : 0
          const free = (blocks: (other: Dot) => boolean) => (full: number[]): boolean => {
            const box = slack ? [full[0] + slack, full[1] + slack, full[2] - slack, full[3] - slack] : full
            return !taken.some((one) => one.dot !== dot && (!lead || one.dot === shown) && overlaps(box, one.box)) &&
            // A name on its way out still holds its place until it has gone: one coming in waits, never overlaps it.
            (!!shown || lead || dot.type === 'tag' || !leaving.some((one) => one.dot !== dot && overlaps(box, one.box))) &&
            !lines.some((one) => one.dot !== dot && crosses(one.line, box)) &&
            // A name cut off by the frame's edge is left out on a small map.
            !(small && (box[0] < frame[0] || box[2] > frame[2] || box[1] < frame[1] || box[3] > frame[3])) &&
            !(clear && nearby.some((other) => other !== dot && blocks(other) && touches(box, other))) &&
            // Never over a tag's dot, even on its pill: a tag is its cluster's name, and with another name over it, every
            // line out to its own name ran through that one (#money's over #health's at 50 captures: #health had none).
            !nearby.some((other) => other !== dot && other.type === 'tag' && touches(box, other))
          }
          const boxesAt = (further: number): number[][] => spots.map(([x, y], at) => {
            // Pushed straight out from the dot: right, left, up or down.
            const [dx, dy] = [[1, 0], [-1, 0], [0, -1], [0, 1]][lead ? at + 2 : at < 2 && away ? 1 - at : at]
            return [x + dx * further, y - half + dy * further, x + wide + dx * further, y + half + dy * further]
          })
          // The side it had before first, so a name holds still rather than hopping from one side to the other.
          const plain = boxesAt(0), before = remembered ? sayings.get(dot)?.side : undefined
          // A name already shown keeps its spot while no other name, name's line or big dot comes onto it: small dots
          // crowding in as the map zooms out never push it off and back (a hub's name came and went three times in
          // one slow zoom).
          const kept = (box: number[]): boolean => !touches(box, dot) && !nearby.some((other) => other !== dot && (other.rings > 0 || other.r >= 7) && touches(box, other)) && !taken.some((one) => one.dot !== dot && overlaps(box, one.box)) && !lines.some((one) => one.dot !== dot && crosses(one.line, box))
          const had = remembered ? sayings.get(dot) : undefined
          const old = had?.want ? had.goal.map((value, i) => (i % 2 ? dot.y! : dot.x!) + value / view.k) : undefined
          // Its very spot last frame, then the side it had, then the first free side.
          let spot = old && kept(old) ? old : before !== undefined && before >= 0 && kept(plain[before]) ? plain[before] : plain.find(free(() => true))
          // The busiest hubs are always named, claiming room before the rest: when
          // all four spots touch a dot, a little further out with a fine line to
          // it, or else on a solid pill that may sit over small dots, never a name.
          let leader = !!(spot && spot === old && had?.leader), pill = !!(spot && spot === old && had?.pill)
          // A tag, its cluster's name, looks further out even on a small map: there a line out to another name can
          // hem it in where it would sit, and it had no name at all (#health at 50 captures).
          if (!spot && (clear || dot.type === 'tag') && !shown && must(dot)) {
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
            for (const further of [14, 28, 44]) if (!spot && (spot = boxesAt(further / view.k).find((box) => free(() => true)(box) && crossesNone(box) && clearLine(box)))) leader = true
            // A pill keeps off the hubs, near if it can, further out with its line if not.
            const big = (other: Dot): boolean => other.rings > 0 || other.r >= 7
            // A pill is drawn wider than its words by its padding: checked at that size, or it was placed over the
            // dot beside it (#money's over #health's at 50 captures, so every line out from #health ran through it).
            const padded = (box: number[]): number[] => [box[0] - padX, box[1] - pad / 2, box[2] + padX, box[3] + pad / 2]
            for (const further of [0, 14, 28, 44]) if (!spot && (spot = boxesAt(further / view.k).find((box) => free(big)(padded(box)) && (!further || clearLine(box))))) ((pill = true), (leader = further > 0))
            // Still none: on its pill further out with its line, clear of every other name, over small dots if it must.
            // Its line may cross no name, so it may have to go further out than before, and at a slant as well as
            // straight out: hemmed in on all four sides by names and their lines, #health at 50 captures had none.
            const slanted = (further: number): number[][] => boxesAt(further).flatMap((box) => [box, ...[[1, 1], [1, -1], [-1, 1], [-1, -1]].map(([sx, sy]) => [box[0] + sx * further * 0.7, box[1] + sy * further * 0.7, box[2] + sx * further * 0.7, box[3] + sy * further * 0.7])])
            for (const further of [0, 14, 28, 44, 64, 88, 112, 140, 170]) if (!spot && (spot = slanted(further / view.k).find((box) => free(() => false)(padded(box)) && (!further || clearLine(box))))) ((pill = true), (leader = further > 0))
          }
          if (!spot) {
            // For a probe: why each place a name that must show was tried in was refused.
            if (!shown && must(dot)) {
              const tally: Record<string, number> = {}
              const tried = [0, 14, 28, 44, 64, 88, 112, 140, 170].flatMap((further) => boxesAt(further / view.k).flatMap((box) => [box, ...[[1, 1], [1, -1], [-1, 1], [-1, -1]].map(([sx, sy]) => [box[0] + sx * further * 0.7 / view.k, box[1] + sy * further * 0.7 / view.k, box[2] + sx * further * 0.7 / view.k, box[3] + sy * further * 0.7 / view.k])]))
              for (const box of tried) {
                const why = [
                  taken.some((one) => one.dot !== dot && overlaps(box, one.box)) && 'a name or dot there',
                  lines.some((one) => one.dot !== dot && crosses(one.line, box)) && 'a line through it',
                  small && (box[0] < frame[0] || box[2] > frame[2] || box[1] < frame[1] || box[3] > frame[3]) && 'past the frame',
                  !clearLine(box) && `its line through ${taken.slice(firstName).filter((one) => one.dot !== dot && crosses(lineTo(box), one.box)).map((one) => titleOf(one.dot)).slice(0, 2).join('/')}`
                ].filter(Boolean).join(' + ') || 'free'
                tally[why] = (tally[why] ?? 0) + 1
              }
              refusedAtRest.current.push(`${titleOf(dot)}: ${Object.entries(tally).map(([why, n]) => `${why} ${n}`).join(', ')}`)
            }
            continue
          }
          said++
          if (leader) lines.push({ dot, line: lineTo(spot) })
          taken.push({ dot: shown ?? dot, box: pill ? [spot[0] - padX, spot[1] - pad / 2, spot[2] + padX, spot[3] + pad / 2] : spot })
          // At rest on the Map, a name is kept and drawn below at its own strength, fading in and gliding to its place.
          // A note's own map and the Inbox's tag map name a fixed few, drawn as placed.
          if (!shown && calm) {
            placedNow.set(dot, { box: spot, leader, pill, side: leader || pill ? -1 : spot === old ? had!.side : plain.indexOf(spot), words })
            continue
          }
          paintName(dot, spot, words, leader, pill, strength * (growing ? seen(dot, now) : 1) * got(dot), !!shown)
        }
        if (!shown && calm) {
          // Each name at rest eases toward shown or gone: 180ms in, 140ms out, on the app's curve; with Motion off at once.
          const dt = Math.min(50, Math.max(0, now - saidAt))
          saidAt = now
          const instant = off()
          for (const [dot, at] of placedNow) {
            const was = sayings.get(dot)
            const rel = at.box.map((value, i) => (value - (i % 2 ? dot.y! : dot.x!)) * view.k)
            if (!was || was.v <= 0) sayings.set(dot, { v: 0, want: true, misses: 0, rel, goal: rel, ...at })
            else Object.assign(was, { want: true, misses: 0, goal: rel, ...at })
          }
          for (const [dot, one] of sayings) {
            // A name goes only once it has been left out three drawings running: placed one drawing and refused the
            // next (two names each other's way, back and forth) it holds still where it is, rather than shimmering.
            if (!placedNow.has(dot) && ++one.misses >= 3) one.want = false
            const target = one.want ? 1 : 0
            one.v = instant || one.v === target ? target : target > one.v ? Math.min(1, one.v + dt / 180) : Math.max(0, one.v - dt / 140)
            // A name that moves to another spot glides there (about 60ms to cover most of the way), never jumps.
            const follow = instant || still() ? 1 : 1 - Math.exp(-dt / 60)
            one.rel = one.rel.map((value, i) => value + (one.goal[i] - value) * follow)
            if (one.v !== target || one.rel.some((value, i) => Math.abs(value - one.goal[i]) > 0.2)) namesMoving = true
            if (!one.v && !one.want) { sayings.delete(dot); continue }
            // A gentle ease out (quadratic), so even a slow frame never takes a name more than half way at once.
            const shade = 1 - (1 - one.v) ** 2
            // Coming in, it rises the last two pixels into place; going, it sinks them. Not with Reduce motion.
            const drift = still() ? 0 : (1 - shade) * 2
            const box = one.rel.map((value, i) => (i % 2 ? dot.y! : dot.x!) + (value + (i % 2 ? drift : 0)) / view.k)
            paintName(dot, box, one.words, one.leader, one.pill, strength * shade * (growing ? seen(dot, now) : 1) * got(dot), false)
          }
          leaving = [...sayings].filter(([, one]) => !one.want || one.misses > 0).map(([dot, one]) => ({ dot, box: one.rel.map((value, i) => (i % 2 ? dot.y! : dot.x!) + value / view.k) }))
          shownNames.current = Object.fromEntries([...sayings].map(([dot, one]) => [dot.id, Math.round((1 - (1 - one.v) ** 2) * 1000) / 1000]))
        }
        if (!shown) crossedAtRest.current = lines.flatMap((one) => taken.slice(firstName).filter((other) => other.dot !== one.dot && crosses(one.line, other.box)).map((other) => `${titleOf(one.dot)} > ${titleOf(other.dot)}`))
        return taken
      }
      // A name, its fine line out from its dot and its pill, as strong as it is shown.
      function paintName(dot: Dot, spot: number[], words: string, leader: boolean, pill: boolean, strength: number, bright: boolean): void {
          context.globalAlpha = strength
          if (!context.globalAlpha) return
          const sx = dot.px - dot.x!, sy = dot.py - dot.y!
          if (leader) {
            // From the dot's edge to the nearest point of its name.
            const tx = Math.max(spot[0], Math.min(dot.x!, spot[2])), ty = Math.max(spot[1], Math.min(dot.y!, spot[3]))
            const far = Math.hypot(tx - dot.x!, ty - dot.y!) || 1, edgeAt = (dot.r + dot.rings * ringGap) / far
            const x1 = dot.x! + (tx - dot.x!) * edgeAt, y1 = dot.y! + (ty - dot.y!) * edgeAt
            context.save()
            context.strokeStyle = lit
            context.globalAlpha *= 0.6
            context.lineWidth = 1 / view.k
            context.beginPath()
            context.moveTo(x1 + sx, y1 + sy)
            context.lineTo(tx + sx, ty + sy)
            context.stroke()
            context.restore()
          }
          if (pill) {
            context.save()
            context.beginPath()
            context.roundRect(spot[0] - padX + sx, spot[1] - pad / 2 + sy, spot[2] - spot[0] + padX * 2, spot[3] - spot[1] + pad, style !== 'soft' ? 0 : half + pad / 2)
            context.fillStyle = ring
            context.fill()
            context.strokeStyle = brutal ? text : style === 'paper' ? quiet : edge
            context.lineWidth = (brutal ? 1.5 : 1) / view.k
            context.stroke()
            context.restore()
          }
          context.fillStyle = dot === middle || bright ? text : quiet
          const x = spot[0] + sx, y = (spot[1] + spot[3]) / 2 + sy
          context.strokeText(words, x, y)
          context.fillText(words, x, y)
      }
      if (shown && amount < 1) nameAll(null, 1 - amount)
      const taken = nameAll(shown, shown ? amount : 1 - amount)
      // For a probe: which dots carry a name at rest (mapNamed below).
      if (!shown) namedAtRest.current = taken.map(({ dot }) => dot.id)
      context.textAlign = 'left'
      // The lit dots and their names, on the screen: what the card must not cover.
      const screen = (at: number, middle: number, offset: number): number => middle + offset + at * view.k
      blocked.current = taken.map(({ box }) => [screen(box[0], width / 2, view.x), screen(box[1], height / 2, view.y), screen(box[2], width / 2, view.x), screen(box[3], height / 2, view.y)])
      context.globalAlpha = 1
      // Still reaching, or names still fading or gliding: the next frame carries it on, and stops once it has arrived.
      if (reach < 1 || namesMoving) redraw()
      // Which note is lit, for whoever reads the canvas (a probe, a screen reader's label).
      const litNow = shown && amount > 0.5 ? titleOf(shown) : ''
      if (el.dataset.lit !== litNow) el.dataset.lit = litNow
      if (growing && now >= arriving) arrive.clear()
    }
    let queued = 0
    const redraw = (): void => void (queued ||= requestAnimationFrame(() => ((queued = 0), draw(), (arrive.size || springs.size || chasing) && redraw())))

    // A fade in and out, so the light follows the pointer rather than snapping. The whole map dims for it, a big
    // change of light, so it eases out fast, as a hover answers at once (and quicker back).
    const fade = (to: number): void => {
      cancelAnimationFrame(fading)
      if (still()) {
        amount = to
        if (!to) shown = null
        return draw()
      }
      const from = amount
      // From its first frame's own clock, as the glide: a time before the start made the light go below none, and
      // the canvas, refusing that, drew one frame with the last dim it had (a flash of the whole map gone dark).
      let start = -1
      const step = (now: number): void => {
        if (start < 0) start = now
        const t = Math.min(1, (now - start) / (to > from ? 220 : 160))
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
    // The Map's "Layout" settings: how hard dots are pulled to the middle, pushed apart, and held by their links.
    const collide = (): void => void sim.force('collide', forceCollide<Dot>((dot) => dot.r + dot.rings * ringGap + (small ? 1.5 : 2)))
    const forces = (): void => {
      if (small) return
      const t = tuned.current
      ;(sim.force('link') as ForceLink<Dot, Line>).distance((line) => t.linkLength + line.source.r + line.target.r).strength(t.linkPull)
      ;(sim.force('charge') as ForceManyBody<Dot>).strength((dot) => (-40 - dot.r * 6) * t.push)
      ;(sim.force('x') as ForceX<Dot>).strength(t.centre)
      ;(sim.force('y') as ForceY<Dot>).strength(t.centre)
    }
    forces()
    // A little heat, so the dots move to the new settings (or, with motion off, a few steps taken out of sight).
    const settle = (heat: number): void => {
      if (!still()) return void sim.alpha(Math.max(sim.alpha(), heat)).restart()
      sim.alpha(heat)
      const until = performance.now() + 80
      while (sim.alpha() > sim.alphaMin() && performance.now() < until) sim.tick()
      washes = null
      redraw()
    }
    let laid = JSON.stringify([tuned.current.dotSize, tuned.current.centre, tuned.current.push, tuned.current.linkPull, tuned.current.linkLength])
    retune.current = () => {
      const t = tuned.current, now = JSON.stringify([t.dotSize, t.centre, t.push, t.linkPull, t.linkLength])
      if (now !== laid && !small) {
        laid = now
        for (const dot of dots) dot.r = Math.round(dot.r0 * t.dotSize * 2) / 2
        collide()
        forces()
        sim.nodes(sim.nodes())
        settle(0.3)
      }
      redraw()
    }
    repaint.current = () => ((washes = null), redraw())
    const fresh = dots.filter((dot) => !placed.current.has(dot.id))
    if (still() || !fresh.length) {
      sim.stop()
      if (fresh.length) sim.alpha(1)
      else sim.alpha(0.05)
      // A big map settles in fewer, cut-off steps: thousands of dots took seconds to lay out before anything showed.
      if (dots.length > 1000) sim.alphaDecay(0.05)
      const until = performance.now() + 500
      while (sim.alpha() > sim.alphaMin() && performance.now() < until) sim.tick()
      for (const dot of dots) placed.current.set(dot.id, { x: dot.x!, y: dot.y! })
    } else {
      // Most of the settling done out of sight, so what is seen is the last
      // easing into place, not a tangle flying apart. Never more than a blink
      // of it, though: on a map of thousands each step is slow, and the page
      // waited a second and more before it showed.
      // Settled almost all the way out of sight: seen settling, a few hundred dots spread out from a tight knot over
      // a second and a half, names hopping as they went (the user: "a little too abrupt").
      // (The Map only: a note's own map and the Inbox's tag map settle as they did.)
      const most = calm ? Math.min(300, 60 + dots.length) : Math.min(120, 40 + dots.length / 5)
      const until = performance.now() + (calm ? 160 : 120)
      for (let done = 0; done < most && performance.now() < until; done++) sim.tick()
      // And a big map settles in fewer steps, so it is still and quiet sooner.
      if (dots.length > 1000) sim.alphaDecay(0.05)
    }
    reach = Math.max(40, ...dots.map((dot) => Math.hypot(dot.x!, dot.y!)))
    // New dots fade in, the nearest the middle first: the whole map over about
    // 850ms, or a few joining an old map over less.
    if (fresh.length && !still()) {
      const start = performance.now() + 30
      const span = fresh.length === dots.length ? (calm ? ARRIVE_SPAN : 360) : calm ? 160 : 120
      const out = Math.max(...fresh.map((dot) => Math.hypot(dot.x!, dot.y!)), 1)
      for (const dot of fresh) arrive.set(dot, start + span * Math.sqrt(Math.hypot(dot.x!, dot.y!) / out))
      arriving = start + span + arrival
      began = start
    }

    // The whole map in view, with a margin.
    /** `top`: room kept clear at the top of the frame (the replay bar floats there). */
    const fitOf = (some: Dot[], top = 0): View => {
      const xs = some.map((dot) => dot.x!), ys = some.map((dot) => dot.y!)
      const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]
      const margin = small ? 24 : 80
      const k = Math.min(small ? 1.6 : 2, Math.max(0.15, Math.min((width - margin) / (x1 - x0 + 40), (height - margin - top) / (y1 - y0 + 40))))
      // A note's own map keeps its note in the middle.
      return { k, x: middle ? 0 : -((x0 + x1) / 2) * k, y: middle ? 0 : -((y0 + y1) / 2) * k + top / 2 }
    }
    const fitted = (): View => {
      const to = fitOf(dots)
      fitK = to.k
      return to
    }
    // During the replay the camera keeps the dots that are in framed, catching up smoothly (zoom in log space) rather
    // than cutting; a pan or a zoom by hand lets go of it. Not with Reduce motion: there it holds on the whole map.
    let following = false, chasing = false, followAt = 0
    const follow = (now: number): void => {
      const dt = Math.min(50, Math.max(0, now - followAt))
      followAt = now
      chasing = false
      if (cut === null || !following || still() || !width || drag) return
      const held = sim.nodes()
      if (!held.length) return
      // Framed below the replay bar (about 70px with its margin), so no dot grows under it.
      const to = fitOf(held, 70)
      const e = 1 - Math.exp(-dt / FOLLOW)
      const k = Math.exp(Math.log(view.k) + (Math.log(to.k) - Math.log(view.k)) * e)
      const cx = view.x / view.k + (to.x / to.k - view.x / view.k) * e, cy = view.y / view.k + (to.y / to.k - view.y / view.k) * e
      Object.assign(view, { k, x: cx * k, y: cy * k })
      chasing = Math.abs(Math.log(to.k / view.k)) > 0.002 || Math.hypot(to.x / to.k - cx, to.y / to.k - cy) > 0.3
    }
    // The first time at once; asked again (the Fit button), a glide back.
    let fittedOnce = false
    fit.current = () => {
      if (!width || !height) return
      const to = fitted()
      glide(to, fittedOnce ? HOME_GLIDE : 0)
      fittedOnce = true
      if (shown && !drag) ((focus = null), fade(0))
    }
    // Panned or zoomed away from the map and left there, it eases back to fit after a couple of seconds of no input;
    // any input starts the wait again. Away: under half of the map in the frame, or zoomed out to under half the size
    // it fits at. Close up on one part, with the map filling the frame, is reading, not lost: it stays. Not on a note's
    // own map, which scrolls with its page.
    let homing = 0
    const away = (): boolean => {
      if (!width || !height || !dots.length) return false
      const xs = dots.map((dot) => dot.x!), ys = dots.map((dot) => dot.y!)
      const at = (x: number, mid: number, offset: number): number => mid + offset + x * view.k
      const [x0, x1] = [at(Math.min(...xs), width / 2, view.x), at(Math.max(...xs), width / 2, view.x)]
      const [y0, y1] = [at(Math.min(...ys), height / 2, view.y), at(Math.max(...ys), height / 2, view.y)]
      const seenW = Math.max(0, Math.min(x1, width) - Math.max(x0, 0)), seenH = Math.max(0, Math.min(y1, height) - Math.max(y0, 0))
      // A map a single dot wide still counts as in sight when its dot is.
      const share = (Math.max(seenW, 1) * Math.max(seenH, 1)) / (Math.max(x1 - x0, 1) * Math.max(y1 - y0, 1))
      return share < 0.5 || view.k < fitK * 0.5
    }
    const home = (): void => {
      window.clearTimeout(homing)
      if (small || gone) return
      homing = window.setTimeout(() => {
        if (drag || !away()) return
        glide(fitted(), HOME_GLIDE)
        if (shown) ((focus = null), fade(0))
      }, HOME_AFTER)
    }
    // The replay grows the map as Obsidian's "Animate" does: the layout holds only the dots that have arrived, each
    // new one put beside the first of its links already there (or in the middle), and a little heat, so the others
    // make room for it. Back in time, the later ones leave the layout. Every arrival in a frame goes in at once.
    // Calm, as the user asked ("the delightful expansion with a well timed bounce", not "violent"): each new dot is laid
    // a link's length from its first link, where the layout already nearly wants it, so the others barely need to
    // move; it is drawn springing out from that dot to its place. The layout runs cool and heavily damped all through
    // (its heat held at 0.03, three fifths of each step's speed taken away, against 0.18 and two fifths before), so
    // the dots already there ease aside rather than lurch. With Reduce motion nothing is laid out again: each dot
    // fades in where it sits on the whole map.
    const order = replayOrder(dots)
    let count = dots.length
    const grow = (want: number, place: boolean): void => {
      const n = Math.max(0, Math.min(dots.length, want))
      if (n === count) return
      const calm = still()
      if (place && !calm) for (let at = count; at < n; at++) {
        const dot = order[at]
        let by: Dot | undefined
        for (const id of near.get(dot.id)!) if (rank.get(byId.get(id)!)! < at && (by = byId.get(id))) break
        const turn = at * 2.39996, gap = by ? (small ? 10 : tuned.current.linkLength) + by.r + dot.r : 0
        dot.x = (by?.x ?? 0) + Math.cos(turn) * gap
        dot.y = (by?.y ?? 0) + Math.sin(turn) * gap
        dot.vx = dot.vy = 0
        springs.set(dot, { ox: by ? by.x! - dot.x : 0, oy: by ? by.y! - dot.y : 0, vx: 0, vy: 0, s: 0.35, vs: 0 })
      }
      for (let at = n; at < count; at++) springs.delete(order[at])
      count = n
      const inside = n === dots.length ? dots : order.slice(0, n)
      sim.nodes(inside)
      ;(sim.force('link') as ForceLink<Dot, Line>).links(n === dots.length ? lines : lines.filter((line) => rank.get(line.source)! < n && rank.get(line.target)! < n))
      if (calm) return redraw()
      // And a speed limit while it grows: no dot moves more than about one map unit a step (2.5 before the damping
      // takes three fifths of it), so a new link to a far dot draws it over gently instead of yanking it.
      sim.force('calm', cut === null ? null : () => {
        for (const dot of sim.nodes()) {
          const speed = Math.hypot(dot.vx!, dot.vy!)
          if (speed > 2.5) ((dot.vx! *= 2.5 / speed), (dot.vy! *= 2.5 / speed))
        }
      })
      // The centring force moves every dot at once, past any speed limit (a new dot laid far out shifted all the
      // others by 5 units in a frame): gentle while it grows, the camera following instead. Never on a note's own map.
      if (!middle) (sim.force('center') as ReturnType<typeof forceCenter<Dot>>).strength(cut === null ? 0.1 : 0.02)
      sim.velocityDecay(cut === null ? 0.4 : 0.6).alphaTarget(cut === null ? 0 : 0.03)
      sim.alpha(Math.max(sim.alpha(), cut === null ? 0.08 : 0.04)).restart()
    }
    // Built again mid-replay (new data): the dots already in stay where they are.
    if (cut !== null) ((following = true), grow(Math.ceil(cut), false))
    if (replay) replay.current = (at) => {
      // Starting, the camera follows the growing map; stopping, it glides back to the whole of it.
      if (at !== null && cut === null) following = true
      if (at === null && cut !== null) ((following = false), springs.clear(), glide(fitted(), HOME_GLIDE))
      cut = replayAt.current = at
      grow(at === null ? dots.length : Math.ceil(at), at !== null)
      told()
      redraw()
    }
    // How many dots are in, for a probe and a screen reader; said again when the map is built anew mid-replay.
    const told = (): void => void (el.dataset.replayed = cut === null ? '' : String(dots.filter((dot) => got(dot) >= 1).length))
    told()
    // For a probe: every dot, where it sits, its colour, and whether the layout holds it now.
    el.dataset.dots = String(dots.length)
    ;(el as HTMLCanvasElement & { mapDots?: () => unknown[] }).mapDots = () => {
      const held = new Set(sim.nodes())
      // `drawn`: where it is drawn, without its breath; `shown`: how strongly (0 to 1).
      return dots.map((dot) => ({ id: dot.id, title: dot.title, x: dot.x, y: dot.y, drawn: [dot.x! + (springs.get(dot)?.ox ?? 0), dot.y! + (springs.get(dot)?.oy ?? 0)], shown: got(dot), r: dot.r, colour: shadesOf(tokenOf(dot)).base, held: held.has(dot), rank: rank.get(dot) }))
    }
    // And every line, by the ids of its two ends, so a probe can count where lines cross.
    ;(el as HTMLCanvasElement & { mapNamed?: () => string[] }).mapNamed = () => namedAtRest.current
    ;(el as HTMLCanvasElement & { mapNames?: () => Record<string, number> }).mapNames = () => shownNames.current
    ;(el as HTMLCanvasElement & { mapCrossed?: () => string[] }).mapCrossed = () => crossedAtRest.current
    ;(el as HTMLCanvasElement & { mapRefused?: () => string[] }).mapRefused = () => refusedAtRest.current
    ;(el as HTMLCanvasElement & { mapLines?: () => string[][] }).mapLines = () => lines.map((line) => [line.source.id, line.target.id])
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
    themed.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'style', 'data-theme', 'data-style', 'data-reveal', 'data-motion', 'data-menu-icons', 'data-icon-colour'] })

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
      return found && got(found) > 0 && Math.hypot(found.x! - x, found.y! - y) <= found.r + 4 / view.k ? found : null
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
    // How fast the space was being dragged, in pixels a millisecond, so letting go mid-swipe carries on.
    let flick = { vx: 0, vy: 0, at: 0 }
    const down = (event: PointerEvent): void => {
      if (event.button !== 0) return
      window.clearTimeout(homing)
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
        following = false
        view.x += dx
        view.y += dy
        const now = performance.now(), ms = Math.max(1, now - flick.at)
        flick = ms > 80 ? { vx: 0, vy: 0, at: now } : { vx: 0.6 * (dx / ms) + 0.4 * flick.vx, vy: 0.6 * (dy / ms) + 0.4 * flick.vy, at: now }
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
      if (!dot && moved && performance.now() - flick.at < 60 && Math.hypot(flick.vx, flick.vy) > 0.3) {
        // Carried on and slowed, as a map thrown on a trackpad does: an ease out whose first speed is the hand's.
        const ms = 500
        glide({ k: view.k, x: view.x + (flick.vx * ms) / 3, y: view.y + (flick.vy * ms) / 3 }, ms)
      }
      if (dot) {
        dot.fx = null
        dot.fy = null
        // Settles soon after letting go, instead of the neighbours drifting on for seconds.
        sim.alphaTarget(0).alpha(Math.min(sim.alpha(), 0.1))
        if (!moved) {
          chime('open')
          // A PDF or a kept article opens in the reader, in the main window, wherever its dot is.
          if (dot.type === 'pdf' || dot.type === 'web') window.api.openInHome(dot.type, dot.id)
          else onOpen(dot.type === 'capture' ? 'capture' : dot.type, dot.id, event.altKey)
        }
      }
      point(hit(event), event)
      home()
    }
    const leave = (): void => void (drag || point(null))
    const wheel = (event: WheelEvent): void => {
      // On a note's own map a plain scroll is the page's, so the panel still scrolls past it.
      if (small && !event.ctrlKey && !event.metaKey) return
      event.preventDefault()
      following = false
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
      // The light goes out on its usual fade, never all at once mid-fade (the whole map flashed back).
      if (focus) ((focus = null), fade(0))
      redraw()
      home()
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
      window.clearTimeout(homing)
      retune.current = repaint.current = () => undefined
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
  }, [map, centre, you]) // eslint-disable-line react-hooks/exhaustive-deps

  const kind = hover && kindOf(hover.dot.kind)
  return (
    <div ref={box} data-swipe-own className={cn('relative min-h-0 overflow-hidden select-none', className)}>
      <canvas ref={canvas} className="absolute inset-0 touch-none" />
      {hover && (
        <div ref={card} data-map-tip data-private={hover.dot.private ? '' : undefined} className={cn(`pointer-events-none invisible absolute z-10 flex flex-col gap-0.5 ${TIP}`, small ? 'max-w-[13rem]' : 'max-w-xs')}>
          <span className="private-text truncate font-medium">{hover.dot.title || 'Untitled'}</span>
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <span className="size-2 rounded-full" style={{ background: hover.dot.id === centre || hover.dot.id === you ? 'var(--tt-brand-color-400)' : paint?.(hover.dot) ?? tintOf(hover.dot) }} />
            {about?.[hover.dot.id] ? `${about[hover.dot.id]} · ` : ''}
            {hover.dot.id === you ? 'This note' : hover.dot.id === centre ? (hover.dot.type === 'pdf' ? 'This book' : 'This note') : hover.dot.kind === 'person' ? 'Person' : hover.dot.kind === 'source' ? 'Source' : hover.dot.kind === 'pdf' ? 'PDF' : hover.dot.kind === 'web' ? 'Web article' : kind?.label ?? (hover.dot.type === 'nugget' ? 'Gem' : hover.dot.type === 'card' ? 'Card' : hover.dot.type === 'article' ? 'Page' : 'Note')}{hover.dot.tag ? ` · #${hover.dot.tag}` : ''} · {plural(hover.dot.links, "link")}
          </span>
        </div>
      )}
      {children}
    </div>
  )
}
