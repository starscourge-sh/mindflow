/**
 * Flex Carousel, from React Bits (reactbits.dev/components/flex-carousel, by
 * David Haz, MIT). An endless row of pictures that flows through a pane of
 * glass you cannot see: near the edges each picture bends and its colours
 * split a little, and a fast throw squeezes the row. Click one to bring it
 * close.
 *
 * Trimmed to what Haligtree uses: one bend (the liquid one), one entrance (rise),
 * no autoplay, no keys of its own (the recap's arrows turn its pages), and
 * only a sideways wheel moves it, so a page still scrolls over it. It draws
 * only while it is on screen and the window is shown.
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { click } from '@/lib/sound'
import { detent } from '@/lib/haptics'
import { Tip } from './ui'
import { useByKeys } from '@/lib/motion'
import { num } from '../../../../main/dates'
import type { CSSProperties } from 'react'
import { Renderer, Program, Mesh, Triangle, Plane, Texture, RenderTarget } from 'ogl'

/** Room kept at a fitted row's left edge, for the first card's shadow. */
const FIT_INSET = 4

export interface FlexCarouselItem {
  /** The picture, or a way to fetch it, asked for only as it nears the view. */
  src: string | (() => Promise<string | null | undefined>)
  title?: string
  /** A line under the title in place of the count ("p. 134 of 336"). */
  note?: string
  /** Its shape (width over height) before it loads, so the row does not shift as it does. */
  aspect?: number
  /** Which picture this is, so a new list keeps the ones already drawn. Left out: its title. */
  id?: string
  /** A book's PDF: resting on its cover, then sliding across it, turns its pages, as covers do on the shelf (pdf-peek.tsx). */
  pdf?: { src: string; name: string }
}

/** How far a turn button may sit out beside the row, given the room: 3rem. */
const TURN_ROOM = 48
/** How many new pictures are made ready before they show. */
const READIED = 12
const idOf = (item: FlexCarouselItem): string => item.id ?? item.title ?? ''

interface Slot {
  id: string
  wanted: boolean
  want: () => void
  texture: Texture
  aspect: number
  loaded: boolean
  failed: boolean
  ready: number
  color: number[]
  image: number[]
  dispose: () => void
}

interface Metrics {
  /** The row is long enough to go round endlessly; a short one stops at its ends. */
  ring: boolean
  cardH: number
  widths: number[]
  centers: number[]
  gap: number
  loop: number
}

interface Instance {
  index: number
  x0: number
  x1: number
  y0: number
  y1: number
}

interface Draw {
  i: number
  rel: number
  x: number
  y: number
  cw: number
  ch: number
  alpha: number
}

// The glass: how wide and tall it is (as parts of the width), its tilt in
// degrees, how far the bend reaches in from its edge, and how much the
// colours split there. The liquid preset's numbers, as React Bits ships them.
/** The widest a card may be, as width over height: a wide screenshot is cropped to it (the shader covers the card) rather than filling the row. */
const WIDEST = 1.5
const GLASS = { width: 0.74, height: 1.18, tilt: 62, bend: 0.34, reach: 0.38, dispersion: 0.45 }
const TAPS = 12
// At most this many pixels drawn, however large the window.
const PIXEL_BUDGET = 4.5e6
const RISE = 2.1
/** Room above a top-set row, for the press and the focus ring. */
const TOP = 6
/** What the glass draws past the row, above and below: bent toward an edge, a picture's corners swing out of its height, and a canvas no taller than the row cut them off flat. */
const BLEED = 40
/** The row under the pictures for the picked one's title (two lines at most) and its place: the pictures never share it. */
/** Whether the keys came here by Tab (or ⇧Tab) just now. */
let tabAt = 0
if (typeof window !== 'undefined') window.addEventListener('keydown', (event) => void (event.key === 'Tab' && (tabAt = performance.now())), true)
const tabbedIn = (): boolean => performance.now() - tabAt < 400
export const CAPTION = 60

const wrap = (value: number, size: number): number => ((((value + size / 2) % size) + size) % size) - size / 2
/** A distance along the row: the short way round on an endless one, straight on a short one. */
const around = (m: Metrics, value: number): number => (m.ring ? wrap(value, m.loop) : value)
const clamp01 = (value: number): number => Math.min(Math.max(value, 0), 1)
const easeOutQuint = (value: number): number => 1 - Math.pow(1 - clamp01(value), 5)
const easeInOut = (value: number): number => {
  const t = clamp01(value)
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
}

const cardVertex = `#version 300 es
in vec3 position;
in vec2 uv;
uniform vec4 uRect;
uniform vec2 uResolution;
out vec2 vUv;
out vec2 vLocal;
void main() {
  vUv = uv;
  vLocal = vec2(position.x, -position.y) * uRect.zw;
  vec2 px = uRect.xy + vLocal;
  gl_Position = vec4(px.x / uResolution.x * 2.0 - 1.0, 1.0 - px.y / uResolution.y * 2.0, 0.0, 1.0);
}
`

const cardFragment = `#version 300 es
precision highp float;
uniform sampler2D tMap;
uniform vec2 uSize;
uniform vec2 uImage;
uniform float uRadius;
uniform float uAlpha;
uniform float uReady;
uniform float uShift;
uniform float uDpr;
uniform vec3 uPlaceholder;
in vec2 vUv;
in vec2 vLocal;
out vec4 fragColor;

float roundedBox(vec2 p, vec2 b, float r) {
  vec2 q = abs(p) - b + r;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}

void main() {
  float sd = roundedBox(vLocal, uSize * 0.5, min(uRadius, min(uSize.x, uSize.y) * 0.5));
  float mask = clamp(0.5 - sd * uDpr, 0.0, 1.0);
  vec2 local = vLocal / uSize + 0.5;
  float cardAspect = uSize.x / uSize.y;
  float imageAspect = uImage.x / max(uImage.y, 1.0);
  vec2 scale = imageAspect > cardAspect ? vec2(cardAspect / imageAspect, 1.0) : vec2(1.0, imageAspect / cardAspect);
  scale /= 1.08;
  vec2 uv = vec2(local.x, 1.0 - local.y);
  uv = (uv - 0.5) * scale + 0.5;
  uv.x += uShift * (1.0 - scale.x) * 0.5;
  vec3 image = texture(tMap, uv).rgb;
  vec3 color = mix(uPlaceholder, image, uReady);
  float alpha = mask * uAlpha;
  fragColor = vec4(color * alpha, alpha);
}
`

const lensVertex = `#version 300 es
in vec2 position;
void main() {
  gl_Position = vec4(position, 0.0, 1.0);
}
`

const lensFragment = `#version 300 es
precision highp float;
uniform sampler2D tScene;
uniform vec2 uResolution;
uniform float uDpr;
uniform vec2 uCenter;
uniform vec2 uHalf;
uniform float uAngle;
uniform float uInner;
uniform float uOuter;
uniform float uFlow;
uniform float uDispersion;
uniform float uStrength;
uniform float uSceneAlpha;
out vec4 fragColor;

void main() {
  vec2 frag = gl_FragCoord.xy / uDpr;
  vec2 uv = frag / uResolution;
  vec2 rel = frag - vec2(uCenter.x, uResolution.y - uCenter.y);
  float ca = cos(uAngle);
  float sa = sin(uAngle);
  vec2 local = vec2(ca * rel.x + sa * rel.y, -sa * rel.x + ca * rel.y);
  vec2 k = max(abs(local) / uHalf, vec2(1e-5));
  float nd = length(k);
  vec2 grad = k * sign(local) / uHalf / nd;
  float glen = max(length(grad), 1e-6);
  float edge = (nd - 1.0) / glen;
  vec2 outward = grad / glen;
  vec2 normal = vec2(ca * outward.x - sa * outward.y, sa * outward.x + ca * outward.y);
  vec2 along = vec2(-normal.y, normal.x);

  float t = clamp((edge + uInner) / (uInner + uOuter), 0.0, 1.0);
  float ramp = t * t * t * (t * (t * 6.0 - 15.0) + 10.0);
  float slope = 16.0 * t * t * (1.0 - t) * (1.0 - t);
  float reachX = rel.x / (uResolution.x * 0.5);
  float side = smoothstep(0.02, 0.3, abs(reachX)) * sign(reachX);
  float lift = ramp * side * uFlow * uStrength;
  vec2 swirl = along * along.y * side * slope * uFlow * uStrength * 0.35;
  vec2 drift = vec2(0.0, -lift) - swirl;
  vec2 shifted = uv + drift / uResolution;

  vec2 texels = uResolution * uDpr;
  vec2 gx = dFdx(shifted);
  vec2 gy = dFdy(shifted);
  gx *= min(1.0, 3.0 / max(length(gx * texels), 1e-4));
  gy *= min(1.0, 3.0 / max(length(gy * texels), 1e-4));

  vec4 color = textureGrad(tScene, shifted, gx, gy);
  vec2 spread = vec2(0.0, side * slope * uFlow * uStrength) / uResolution * uDispersion;
  float spreadPx = length(spread * texels);
  if (color.a > 0.002 && spreadPx > 0.25) {
    vec3 base = color.rgb / color.a;
    vec3 sumColor = vec3(0.0);
    vec3 sumWeight = vec3(0.0);
    for (int i = 0; i < ${TAPS}; i++) {
      float s = (float(i) + 0.5) / float(${TAPS});
      vec4 c = textureGrad(tScene, shifted + spread * (s - 0.5), gx, gy);
      vec3 w = max(1.0 - abs(vec3(s) - vec3(0.15, 0.5, 0.85)) * 2.6, 0.0) * c.a;
      sumColor += c.rgb * (w / max(c.a, 0.002));
      sumWeight += w;
    }
    vec3 split = mix(base, sumColor / max(sumWeight, vec3(1e-4)), clamp(sumWeight * 2.0, 0.0, 1.0));
    color.rgb = mix(color.rgb, clamp(split, 0.0, 1.0) * color.a, smoothstep(0.25, 1.5, spreadPx));
  }

  fragColor = color * uSceneAlpha;
}
`

/**
 * The row itself. `cardHeight` is a part of the box's height; `squeeze` how
 * much a fast throw shrinks the pictures. A click brings a picture to the
 * middle and close; a click on the close one calls `onOpen`.
 */
export default function FlexCarousel({
  items: given,
  cardHeight = 0.5,
  gap = 12,
  radius = 10,
  squeeze = 0.2,
  onOpen,
  onUnder,
  direct = false,
  counter = 'of',
  label = 'Pictures',
  className = '',
  style,
  onReady
}: {
  items: FlexCarouselItem[]
  cardHeight?: number
  gap?: number
  radius?: number
  squeeze?: number
  /** Opened: which card, and where it is on the screen when opened by a pointer. */
  onOpen?: (index: number, at?: DOMRect) => void
  /** Told which card the pointer is on (-1 for none), for its right-click menu. */
  onUnder?: (index: number) => void
  /** A click opens the picture at once, rather than first bringing it close; ← → turn it and ↵ opens. */
  direct?: boolean
  /** How the place in the row is said: "3 of 12", or "03 / 12". */
  counter?: 'of' | 'slash'
  /** What the row is, for VoiceOver. */
  label?: string
  className?: string
  style?: CSSProperties
  /** Its pictures in view are drawn. */
  onReady?: () => void
}): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)
  // The list being drawn: a new one arrives once its new pictures are ready, so the canvas and the words under it change together.
  const [items, setItems] = useState(given)
  // New pictures made ready ahead of a change, each taken as its card first wants it, so no card shows empty.
  const readied = useRef(new Map<string, HTMLImageElement>())
  const settingsRef = useRef({ cardHeight, gap, radius, squeeze, direct })
  const itemsRef = useRef(items)
  const openRef = useRef(onOpen)
  const underRef = useRef(onUnder)
  const readyRef = useRef(onReady)
  const [active, setActive] = useState(0)
  // Whether this turn came by a key, read once as it turns (its title is then simply there).
  const keyedTurn = useByKeys(active)
  const [revealed, setRevealed] = useState(false)
  const [focusOpen, setFocusOpen] = useState(false)
  // Whether the row goes round for ever (no ends to stop at), and a turn by the buttons either side.
  const [ring, setRing] = useState(true)
  const turn = useRef<(way: 1 | -1) => void>(() => undefined)
  const take = useRef<(items: FlexCarouselItem[]) => void>(() => undefined)
  const frameRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    openRef.current = onOpen
    underRef.current = onUnder
    readyRef.current = onReady
    settingsRef.current = { cardHeight, gap, radius, squeeze, direct }
  })

  // Built once: a new list of pictures is taken in by `take`, below.
  useEffect(() => {
    const container = containerRef.current
    if (!container) return undefined

    const renderer = new Renderer({
      dpr: Math.min(window.devicePixelRatio || 1, 2),
      alpha: true,
      premultipliedAlpha: true,
      antialias: false,
      depth: false
    })
    const gl = renderer.gl
    if (!renderer.isWebgl2) {
      gl.getExtension('WEBGL_lose_context')?.loseContext()
      // Nothing to wait for: the row shows as it is.
      readyRef.current?.()
      return undefined
    }
    gl.clearColor(0, 0, 0, 0)
    const canvas = gl.canvas
    canvas.style.display = 'block'
    canvas.style.width = '100%'
    canvas.style.height = '100%'
    canvas.setAttribute('aria-hidden', 'true')
    container.prepend(canvas)

    const cardProgram = new Program(gl, {
      vertex: cardVertex,
      fragment: cardFragment,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        tMap: { value: new Texture(gl) },
        uRect: { value: [0, 0, 1, 1] },
        uResolution: { value: [1, 1] },
        uSize: { value: [1, 1] },
        uImage: { value: [1, 1] },
        uRadius: { value: 16 },
        uAlpha: { value: 1 },
        uReady: { value: 0 },
        uShift: { value: 0 },
        uDpr: { value: 1 },
        uPlaceholder: { value: [0.5, 0.5, 0.5] }
      }
    })
    cardProgram.setBlendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)
    const cardMesh = new Mesh(gl, { geometry: new Plane(gl), program: cardProgram })

    // The row is drawn here first, then through the glass onto the screen.
    const target = new RenderTarget(gl, { width: 2, height: 2, depth: false, minFilter: gl.LINEAR_MIPMAP_LINEAR, magFilter: gl.LINEAR })

    const lensUniforms = {
      tScene: { value: target.texture },
      uResolution: { value: [1, 1] },
      uDpr: { value: 1 },
      uCenter: { value: [0, 0] },
      uHalf: { value: [1, 1] },
      uAngle: { value: 0 },
      uInner: { value: 60 },
      uOuter: { value: 80 },
      uFlow: { value: 0 },
      uDispersion: { value: 0 },
      uStrength: { value: 0 },
      uSceneAlpha: { value: 0 }
    }
    const lensMesh = new Mesh(gl, {
      geometry: new Triangle(gl),
      program: new Program(gl, { vertex: lensVertex, fragment: lensFragment, uniforms: lensUniforms, depthTest: false, depthWrite: false })
    })

    const anisotropy = renderer.getExtension('EXT_texture_filter_anisotropic') ? 8 : 0

    let slots: Slot[] = []
    // The card pressed, and how far it has given (0 to 1).
    const press = { index: -1, amount: 0 }
    // In a row that fits whole, the one picked (by a key, or the pointer resting on it).
    let chosen = 0
    let ringNow = true
    let titleX = 0
    let fetched = 0
    let width = 1
    let height = 1
    let pos = 0
    let vel = 0
    let goal = 0
    let mode: 'spring' | 'wheel' = 'spring'
    let wheelAt = 0
    let raf = 0
    let last = performance.now()
    // Drawn only while on screen and while the window is shown.
    let inView = false
    const showing = (): boolean => inView && !document.hidden
    let alive = true
    let dirty = true
    let activeIndex = -1
    // Set while a new list settles into place, until it comes to rest.
    let settling = false
    let layout: Metrics | null = null
    let resnap = false
    let hover = ''
    let underCard = -1
    let lift = 1
    let energy = 0
    let lastPos = 0
    const pointer = { x: 0, y: 0, over: false, down: false, id: -1, startX: 0, startY: 0, startPos: 0, dragging: false, touch: false, samples: [] as { x: number; t: number }[] }
    const rise = { t: 0, running: false, done: false, readyAt: performance.now() }
    const focus = { index: -1, pending: -1, t: 0, v: 0, target: 0 }
    let instances: Instance[] = []

    // A slot is only a place in the row until it nears the view: then its picture is fetched and drawn.
    const loadSlot = (item: FlexCarouselItem): Slot => {
      const texture = new Texture(gl, { generateMipmaps: true, minFilter: gl.LINEAR_MIPMAP_LINEAR, magFilter: gl.LINEAR, anisotropy })
      const slot: Slot = { id: idOf(item), wanted: false, want: () => {}, texture, aspect: item.aspect ?? 0.8, loaded: false, failed: false, ready: 0, color: [0.5, 0.5, 0.5], image: [1, 1], dispose: () => {} }
      slot.want = () => {
        if (slot.wanted) return
        slot.wanted = true
        // How many have been fetched, for the probes: only those near the view.
        container.setAttribute('data-fetched', String(++fetched))
        fetchSlot(item, slot)
      }
      return slot
    }

    const fetchSlot = (item: FlexCarouselItem, slot: Slot): void => {
      const texture = slot.texture
      const ready = readied.current.get(slot.id)
      readied.current.delete(slot.id)
      const image = ready ?? new Image()
      image.crossOrigin = 'anonymous'
      image.decoding = 'async'
      image.onload = () => {
        if (!alive || !slots.includes(slot)) return
        texture.image = image
        texture.update()
        slot.image = [image.naturalWidth || 1, image.naturalHeight || 1]
        slot.aspect = slot.image[0] / slot.image[1]
        // Its average colour, shown in its place while it fades in.
        try {
          const probe = document.createElement('canvas')
          probe.width = 8
          probe.height = 8
          const ctx = probe.getContext('2d', { willReadFrequently: true })
          if (ctx) {
            ctx.drawImage(image, 0, 0, 8, 8)
            const data = ctx.getImageData(0, 0, 8, 8).data
            const avg = [0, 0, 0]
            for (let i = 0; i < data.length; i += 4) {
              avg[0] += data[i]
              avg[1] += data[i + 1]
              avg[2] += data[i + 2]
            }
            slot.color = avg.map((v) => v / 64 / 255)
          }
        } catch {
          slot.color = [0.5, 0.5, 0.5]
        }
        slot.loaded = true
        dirty = true
        start()
      }
      image.onerror = () => {
        if (!alive) return
        slot.failed = true
        dirty = true
        start()
      }
      slot.dispose = () => {
        image.onload = null
        image.onerror = null
        gl.deleteTexture(texture.texture)
      }
      if (ready) image.onload?.(new Event('load'))
      else if (typeof item.src === 'string') image.src = item.src
      else
        void item.src().then(
          (src) => alive && (src ? (image.src = src) : image.onerror?.(new Event('error'))),
          () => alive && image.onerror?.(new Event('error'))
        )
    }

    const metrics = (): Metrics => {
      const s = settingsRef.current
      // As tall a part of the whole row (pictures and the caption row under them) as asked, never past the pictures' box.
      const room = height - BLEED * 2
      const cardH = Math.max(24, Math.min(room - TOP * 2, s.cardHeight * (room + CAPTION)))
      const widths = slots.map((slot) => Math.min(slot.aspect, WIDEST) * cardH)
      const centers: number[] = []
      let cursor = 0
      let widest = 0
      for (let i = 0; i < widths.length; i++) {
        centers.push(cursor + widths[i] / 2)
        cursor += widths[i] + s.gap
        widest = Math.max(widest, widths[i])
      }
      // Endless only when a copy of the row could never show twice at once.
      // Loops as soon as one whole set is wider than the view, so what is in view never repeats a picture,
      // and no gap left of the first picture when the window is wide.
      return { ring: cursor > width, cardH, widths, centers, gap: s.gap, loop: Math.max(cursor, 1) }
    }

    const fits = (m: Metrics): boolean => !m.ring && m.loop - m.gap <= width * 0.92

    const nearest = (m: Metrics, at: number): number => {
      let best = 0
      let bestDist = Infinity
      for (let i = 0; i < m.centers.length; i++) {
        const dist = Math.abs(around(m, m.centers[i] - at))
        if (dist < bestDist) {
          bestDist = dist
          best = i
        }
      }
      return best
    }

    const snapPoint = (m: Metrics, at: number): number => at + around(m, m.centers[nearest(m, at)] - at)

    // Where the row was, kept as the pictures change size (a picture loading, the window resizing).
    const remap = (from: Metrics, to: Metrics, at: number): number => {
      const i = nearest(from, at)
      const offset = around(from, at - from.centers[i])
      const cycles = Math.round((at - offset - from.centers[i]) / from.loop)
      return cycles * to.loop + to.centers[i] + offset * (to.widths[i] / from.widths[i])
    }

    const step = (m: Metrics, delta: number): void => {
      // A row that fits stays put: a step picks the next one along, its title moving under it.
      if (fits(m)) {
        chosen = Math.max(0, Math.min(m.centers.length - 1, chosen + delta))
        dirty = true
        start()
        return
      }
      let at = snapPoint(m, goal)
      let index = nearest(m, at)
      const n = m.centers.length
      for (let k = 0; k < Math.abs(delta); k++) {
        if (!m.ring && (delta > 0 ? index >= n - 1 : index <= 0)) break
        const next = (index + (delta > 0 ? 1 : n - 1)) % n
        at += delta > 0 ? m.widths[index] / 2 + m.gap + m.widths[next] / 2 : -(m.widths[next] / 2 + m.gap + m.widths[index] / 2)
        index = next
      }
      goal = at
      mode = 'spring'
      dirty = true
      start()
    }

    const openFocus = (index: number): void => {
      focus.index = index
      focus.pending = -1
      focus.target = 1
      setFocusOpen(true)
      dirty = true
      start()
    }

    const closeFocus = (): boolean => {
      focus.pending = -1
      if (focus.target === 0) return false
      focus.target = 0
      setFocusOpen(false)
      dirty = true
      start()
      return true
    }

    const skipIntro = (): void => {
      if (rise.running) rise.t = 1
    }

    // The entrance: each picture rises into the row, the middle first, and the glass bends in after.
    const introEffects = (): { sceneAlpha: number; strength: number; card: ((rel: number) => { alpha: number; y: number; scale: number }) | null } => {
      if (!rise.done && !rise.running) return { sceneAlpha: 0, strength: 0, card: null }
      const t = rise.running ? rise.t : 1
      if (t >= 1) return { sceneAlpha: 1, strength: 1, card: null }
      return {
        sceneAlpha: 1,
        strength: easeInOut((t - 0.3) / 0.65),
        card: (rel) => {
          const delay = Math.min(Math.abs(rel) / (width * 0.6), 1) * 0.34
          const local = clamp01((t - delay) / 0.6)
          // A small rise from just below, from 95%: never from far off at half size.
          return { alpha: clamp01(local * 4), y: (1 - easeOutQuint(local)) * 8, scale: 0.95 + 0.05 * easeInOut((local - 0.18) / 0.82) }
        }
      }
    }

    const resize = (): void => {
      width = Math.max(1, container.clientWidth)
      height = Math.max(1, container.clientHeight)
      renderer.dpr = Math.min(window.devicePixelRatio || 1, 2, Math.sqrt(PIXEL_BUDGET / (width * height)))
      renderer.setSize(width, height)
      target.setSize(Math.max(2, Math.round(width * renderer.dpr)), Math.max(2, Math.round(height * renderer.dpr)))
      lensUniforms.tScene.value = target.texture
      dirty = true
      start()
    }

    const frame = (now: number): void => {
      raf = 0
      if (!alive) return
      const s = settingsRef.current
      const dt = Math.min(0.05, Math.max(0.001, (now - last) / 1000))
      last = now
      if (!slots.length) return

      const m = metrics()
      const n = slots.length
      let animating = false

      if (resnap) {
        goal = snapPoint(m, goal)
        pos = goal
        vel = 0
        resnap = false
      } else if (layout && layout.loop !== m.loop) {
        pos = remap(layout, m, pos)
        goal = remap(layout, m, goal)
        pointer.startPos = pos + (pointer.x - pointer.startX)
        animating = true
      }
      layout = m

      // A short row that fits whole is shown whole, from the row's left edge where its heading and the rows under it
      // start, and stays put: centred, one book sat alone in the middle of an empty band.
      // Said on the row, so its frame drops the side fades: nothing is cut off, so nothing needs to fade.
      container.toggleAttribute('data-fits', fits(m))
      if (m.ring !== ringNow) setRing((ringNow = m.ring))
      if (fits(m)) {
        goal = m.centers[0] - m.widths[0] / 2 + width / 2 - FIT_INSET
        if (!rise.done && !rise.running) pos = goal
        chosen = Math.min(chosen, n - 1)
      }

      // Fetched only near the view: the pictures within a width and a half of the middle.
      for (let i = 0; i < n; i++) if (!slots[i].wanted && Math.abs(around(m, m.centers[i] - pos)) - m.widths[i] / 2 < width * 1.5) slots[i].want()

      // The entrance waits for every picture in view, or three and a half seconds.
      if (!rise.running && !rise.done && (slots.every((slot) => !slot.wanted || slot.loaded || slot.failed) || now - rise.readyAt > 3500)) {
        goal = snapPoint(m, goal)
        pos = goal
        rise.running = true
        // Its pictures in view come up with the row, in its one fade (picture-row.tsx), not each again after it.
        for (const slot of slots) if (slot.loaded) slot.ready = 1
        // Where a click opens (rows seen many times a day: Home, Media), no entrance: the row is simply there.
        rise.t = settingsRef.current.direct ? 1 : 0
      }
      if (rise.running) {
        rise.t = Math.min(1, rise.t + dt / RISE)
        if (rise.t >= 1) {
          rise.running = false
          rise.done = true
          setRevealed(true)
          readyRef.current?.()
        }
        animating = true
      }

      if (mode === 'wheel' && now - wheelAt > 150) {
        goal = snapPoint(m, goal)
        mode = 'spring'
      }
      if (!pointer.dragging) {
        const stiffness = mode === 'wheel' ? 80 : 55
        const damping = 2 * Math.sqrt(stiffness)
        const steps = Math.ceil(dt / (1 / 240))
        const h = dt / steps
        for (let i = 0; i < steps; i++) {
          vel += (stiffness * (goal - pos) - damping * vel) * h
          pos += vel * h
        }
        if (Math.abs(goal - pos) < 0.05 && Math.abs(vel) < 0.5) {
          pos = goal
          vel = 0
          settling = false
        } else animating = true
      } else animating = true

      if (m.ring && Math.abs(pos) > m.loop * 8) {
        const back = Math.round(pos / m.loop) * m.loop
        pos -= back
        goal -= back
        pointer.startPos -= back
      }

      const current = fits(m) ? chosen : nearest(m, pos)
      if (current !== activeIndex) {
        // Each picture coming to the middle is heard and felt, as a dial's notches are: once the row is up, never on its way in.
        // A row whose pictures changed (one added, a tab switched) settles in silence: nobody turned it.
        if (activeIndex >= 0 && rise.done && !settling) (click('tick'), detent())
        activeIndex = current
        setActive(current)
      }

      if (focus.pending >= 0 && mode === 'spring' && Math.abs(goal - pos) < 1.5 && Math.abs(vel) < 30) {
        if (current === focus.pending) openFocus(current)
        else focus.pending = -1
      }

      // How fast the row is going, felt as a squeeze.
      const travel = Math.abs(pos - lastPos) / dt
      lastPos = pos
      const energyTarget = Math.min(travel / 2600, 1)
      energy += (energyTarget - energy) * (1 - Math.exp(-dt / (energyTarget > energy ? 0.07 : 0.35)))
      if (energy > 0.001) animating = true

      const focusStiffness = 64
      focus.v += (focusStiffness * (focus.target - focus.t) - 2 * Math.sqrt(focusStiffness) * focus.v) * dt
      focus.t += focus.v * dt
      if (Math.abs(focus.target - focus.t) < 0.0005 && Math.abs(focus.v) < 0.001) {
        focus.t = focus.target
        focus.v = 0
      } else animating = true
      const focusAmount = clamp01(focus.t)
      const focusEase = easeInOut(focusAmount)
      const focusW = focus.index >= 0 && focus.index < n ? m.widths[focus.index] : m.cardH
      const focusScale = Math.max(1, Math.min(1.3, ((height - BLEED * 2) * 0.84) / m.cardH, (width * 0.92) / focusW))
      const nextLift = 1 + (focusScale - 1) * focusEase
      if (Math.abs(nextLift - lift) > 0.0005) {
        lift = nextLift
        container.style.setProperty('--flex-carousel-lift', lift.toFixed(4))
      }

      const effects = introEffects()
      const homeX = width / 2
      // A row where a click opens sits at the top of its box, its titles right under it: no band of nothing above.
      const homeY = s.direct ? BLEED + TOP + m.cardH / 2 : height / 2
      const halfW = (GLASS.width * width) / 2
      const halfH = (GLASS.height * width) / 2

      // The press gives at once and comes back over about 160ms.
      const pressTarget = pointer.down && !pointer.dragging && press.index >= 0 ? 1 : 0
      if (press.amount !== pressTarget) {
        press.amount = pressTarget > press.amount ? Math.min(1, press.amount + dt / 0.08) : Math.max(0, press.amount - dt / 0.16)
        animating = true
      }
      if (!pressTarget && press.amount === 0) press.index = -1

      for (const slot of slots) {
        if (slot.loaded && slot.ready < 1) {
          slot.ready = Math.min(1, slot.ready + dt / 0.45)
          animating = true
        }
      }

      if (dirty || animating) {
        dirty = false
        instances = []
        const dpr = renderer.dpr
        cardProgram.uniforms.uResolution.value = [width, height]
        cardProgram.uniforms.uDpr.value = dpr
        cardProgram.uniforms.uRadius.value = s.radius
        const shrink = 1 - clamp01(s.squeeze) * energy
        const draws: Draw[] = []
        for (let i = 0; i < n; i++) {
          const w = m.widths[i]
          const baseRel = around(m, m.centers[i] - pos)
          for (let k = m.ring ? -3 : 0; k <= (m.ring ? 3 : 0); k++) {
            const rel = baseRel + k * m.loop
            if (Math.abs(rel) - w / 2 > width + 40) continue
            const fx = effects.card ? effects.card(rel) : null
            let x = homeX + rel
            let scale = shrink * (fx ? fx.scale : 1) * (i === press.index ? 1 - 0.03 * press.amount : 1)
            let alpha = fx ? fx.alpha : 1
            // The close one grows; the rest part to the sides and fade.
            if (focusAmount > 0) {
              if (i === focus.index && Math.abs(rel) < w) scale *= 1 + (focusScale - 1) * focusEase
              else {
                const part = easeInOut(focusAmount * 1.25 - Math.min(Math.abs(rel) / width, 1) * 0.25)
                x += Math.sign(rel) * part * width * 0.7
                alpha *= 1 - part
              }
            }
            const cw = w * scale
            if (alpha <= 0.001 || x + cw / 2 < -40 || x - cw / 2 > width + 40) continue
            draws.push({ i, rel, x, y: homeY + (fx ? fx.y : 0), cw, ch: m.cardH * scale, alpha })
          }
        }
        // The far ones first, so the near ones lie over them.
        draws.sort((a, b) => Math.abs(b.rel) - Math.abs(a.rel))
        let first = true
        for (const draw of draws) {
          const slot = slots[draw.i]
          cardProgram.uniforms.tMap.value = slot.texture
          cardProgram.uniforms.uRect.value = [draw.x, draw.y, draw.cw + 2, draw.ch + 2]
          cardProgram.uniforms.uSize.value = [draw.cw, draw.ch]
          cardProgram.uniforms.uImage.value = slot.image
          cardProgram.uniforms.uAlpha.value = draw.alpha
          cardProgram.uniforms.uReady.value = slot.ready
          cardProgram.uniforms.uShift.value = Math.max(-1, Math.min(1, draw.rel / (width * 0.75)))
          cardProgram.uniforms.uPlaceholder.value = slot.color
          renderer.render({ scene: cardMesh, target, clear: first })
          first = false
          instances.push({ index: draw.i, x0: draw.x - draw.cw / 2, x1: draw.x + draw.cw / 2, y0: draw.y - draw.ch / 2, y1: draw.y + draw.ch / 2 })
        }
        if (first) {
          renderer.bindFramebuffer(target)
          gl.viewport(0, 0, target.width, target.height)
          gl.clear(gl.COLOR_BUFFER_BIT)
        }
        renderer.bindFramebuffer()
        target.texture.bind()
        gl.generateMipmap(gl.TEXTURE_2D)

        lensUniforms.uResolution.value = [width, height]
        lensUniforms.uDpr.value = dpr
        lensUniforms.uCenter.value = [homeX, homeY]
        lensUniforms.uHalf.value = [Math.max(halfW, 1), Math.max(halfH, 1)]
        lensUniforms.uAngle.value = (GLASS.tilt * Math.PI) / 180
        const inner = Math.max(4, GLASS.reach * (Math.max(halfW, 1) + Math.max(halfH, 1)) * 0.5)
        lensUniforms.uInner.value = inner
        lensUniforms.uOuter.value = inner * 1.6
        // Never further than the room drawn around the row: wide rows bent past it and were cut off flat.
        lensUniforms.uFlow.value = Math.min(GLASS.bend * (Math.max(halfW, 1) + Math.max(halfH, 1)) * 0.45, BLEED + TOP - 2)
        lensUniforms.uDispersion.value = GLASS.dispersion * 0.12
        // Brought close, a picture is shown straight, without the bend.
        // A row that fits whole lies flat: no bend at its edges to cut into the titles under it.
        lensUniforms.uStrength.value = fits(m) ? 0 : effects.strength * (1 - focusEase)
        lensUniforms.uSceneAlpha.value = effects.sceneAlpha
        renderer.render({ scene: lensMesh })
      }

      // The title sits under the picked one: the middle one, or in a row that fits, wherever it is.
      const under = instances.find((inst) => inst.index === activeIndex)
      const nextX = under && fits(m) ? (under.x0 + under.x1) / 2 - width / 2 : 0
      if (Math.abs(nextX - titleX) > 0.5) {
        titleX = nextX
        frameRef.current?.style.setProperty('--flex-carousel-x', `${titleX.toFixed(1)}px`)
      }

      // The pointer says what a click would do: bring one close, or open the close one.
      let nextHover = ''
      if (pointer.over && !pointer.dragging && rise.done) {
        const hit = instances.find((inst) => pointer.x >= inst.x0 && pointer.x <= inst.x1 && pointer.y >= inst.y0 && pointer.y <= inst.y1)
        if (focus.target > 0) nextHover = hit?.index === focus.index ? 'open' : 'close'
        else if (hit) nextHover = s.direct ? 'open' : 'focus'
        // Resting on one in a row that fits picks it: its title comes under it.
        if (hit && fits(m) && hit.index !== chosen && focus.target === 0) {
          chosen = hit.index
          dirty = true
          animating = true
        }
      }
      // Which card the pointer is on, for its right-click menu (-1: none).
      const nextUnder = pointer.over ? (instances.find((inst) => pointer.x >= inst.x0 && pointer.x <= inst.x1 && pointer.y >= inst.y0 && pointer.y <= inst.y1)?.index ?? -1) : -1
      if (nextUnder !== underCard) {
        underCard = nextUnder
        underRef.current?.(underCard)
      }
      if (nextHover !== hover) {
        hover = nextHover
        if (hover) container.setAttribute('data-hover', hover)
        else container.removeAttribute('data-hover')
      }

      if (showing() && (animating || !rise.done || dirty || pointer.down)) raf = requestAnimationFrame(frame)
    }

    function start(): void {
      if (raf || !showing() || !alive) return
      last = performance.now()
      raf = requestAnimationFrame(frame)
    }
    const stop = (): void => {
      cancelAnimationFrame(raf)
      raf = 0
    }

    const localPoint = (e: PointerEvent): [number, number] => {
      const rect = container.getBoundingClientRect()
      return [e.clientX - rect.left, e.clientY - rect.top]
    }
    // A card's rect on the screen, for what it opens to grow out of (lib/hero.ts).
    const onScreen = (hit: { x0: number; x1: number; y0: number; y1: number }): DOMRect => {
      const rect = container.getBoundingClientRect()
      return new DOMRect(rect.left + hit.x0, rect.top + hit.y0, hit.x1 - hit.x0, hit.y1 - hit.y0)
    }

    const onPointerDown = (e: PointerEvent): void => {
      settling = false
      if (e.button > 0) return
      skipIntro()
      const [x, y] = localPoint(e)
      Object.assign(pointer, { down: true, id: e.pointerId, touch: e.pointerType === 'touch', startX: x, startY: y, x, y, startPos: pos, dragging: false, samples: [{ x, t: performance.now() }] })
      press.index = instances.find((inst) => x >= inst.x0 && x <= inst.x1 && y >= inst.y0 && y <= inst.y1)?.index ?? -1
      if (Math.abs(vel) > 40) {
        goal = pos
        vel = 0
      }
      dirty = true
      start()
    }

    const onPointerMove = (e: PointerEvent): void => {
      const [x, y] = localPoint(e)
      pointer.x = x
      pointer.y = y
      pointer.over = true
      if (pointer.down && e.pointerId === pointer.id) {
        const dx = x - pointer.startX
        const dy = y - pointer.startY
        const slop = pointer.touch ? 10 : 5
        if (!pointer.dragging) {
          if (pointer.touch && Math.abs(dy) > slop && Math.abs(dy) > Math.abs(dx)) {
            pointer.down = false
            return
          }
          if (Math.abs(dx) > slop) {
            pointer.dragging = true
            pointer.startX = x
            pointer.startPos = pos
            closeFocus()
            try {
              container.setPointerCapture(e.pointerId)
            } catch {
              // Still dragging; only the capture is lost.
            }
            container.setAttribute('data-dragging', '')
          }
        }
        if (pointer.dragging) {
          pos = pointer.startPos - (x - pointer.startX)
          // Past the ends of a short row it gives less the further it goes, rather than stopping dead.
          const m = layout
          if (m && !m.ring && m.centers.length) {
            const lo = fits(m) ? (m.centers[0] + m.centers[m.centers.length - 1]) / 2 : m.centers[0]
            const hi = fits(m) ? lo : m.centers[m.centers.length - 1]
            const damp = (over: number): number => (over * 120) / (over + 120)
            if (pos > hi) pos = hi + damp(pos - hi)
            else if (pos < lo) pos = lo - damp(lo - pos)
          }
          goal = pos
          vel = 0
          const now = performance.now()
          pointer.samples.push({ x, t: now })
          while (pointer.samples.length > 2 && now - pointer.samples[0].t > 100) pointer.samples.shift()
        }
      }
      dirty = true
      start()
    }

    const onPointerUp = (e: PointerEvent): void => {
      if (!pointer.down || e.pointerId !== pointer.id) return
      pointer.down = false
      container.removeAttribute('data-dragging')
      const m = metrics()
      if (pointer.dragging) {
        // Let go: it coasts on at the speed it was thrown, and settles on a picture.
        pointer.dragging = false
        const now = performance.now()
        const first = pointer.samples[0]
        const lastSample = pointer.samples[pointer.samples.length - 1]
        let velocity = 0
        if (first && lastSample && lastSample.t > first.t && now - lastSample.t < 70) velocity = -((lastSample.x - first.x) / (lastSample.t - first.t)) * 1000
        vel = velocity
        goal = snapPoint(m, pos + velocity * 0.32)
        if (Math.abs(velocity) > 400 && Math.abs(goal - pos) < 1) step(m, velocity > 0 ? 1 : -1)
        mode = 'spring'
        start()
        return
      }
      const [x, y] = localPoint(e)
      const hit = instances.find((inst) => x >= inst.x0 && x <= inst.x1 && y >= inst.y0 && y <= inst.y1)
      if (focus.target > 0) {
        if (hit?.index === focus.index) openRef.current?.(focus.index, onScreen(hit))
        else closeFocus()
        return
      }
      if (!hit) return
      if (settingsRef.current.direct) return void openRef.current?.(hit.index, onScreen(hit))
      if (hit.index === activeIndex && Math.abs(goal - pos) < 2) openFocus(hit.index)
      else {
        goal = snapPoint(m, pos + (hit.x0 + hit.x1) / 2 - width / 2)
        mode = 'spring'
        focus.pending = hit.index
        start()
      }
    }

    const onPointerLeave = (): void => {
      pointer.over = false
      dirty = true
      start()
    }

    const onPointerCancel = (): void => {
      pointer.down = false
      pointer.dragging = false
      container.removeAttribute('data-dragging')
      goal = snapPoint(metrics(), pos)
      mode = 'spring'
      start()
    }

    // Only a sideways wheel turns it: an up and down one still scrolls the page.
    const onWheel = (e: WheelEvent): void => {
      settling = false
      if (e.ctrlKey) return
      const dx = e.shiftKey && Math.abs(e.deltaX) < Math.abs(e.deltaY) ? e.deltaY : e.deltaX
      const dy = e.shiftKey ? 0 : e.deltaY
      if (Math.abs(dx) <= Math.abs(dy)) return
      e.preventDefault()
      skipIntro()
      if (closeFocus()) return
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? height : 1
      goal += Math.max(-120, Math.min(120, dx * unit)) * 1.25
      mode = 'wheel'
      wheelAt = performance.now()
      start()
    }

    // Its own keys: ← and → turn it (as its buttons do); where a click opens, ↵ or Space opens the one in the middle.
    turn.current = (way) => {
      settling = false
      skipIntro()
      step(metrics(), way)
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        // Its own: the page's arrow keys (which walk Home's rows) never hear it.
        e.preventDefault()
        e.stopPropagation()
        skipIntro()
        step(metrics(), e.key === 'ArrowRight' ? 1 : -1)
      } else if (settingsRef.current.direct && (e.key === 'Enter' || e.key === ' ') && activeIndex >= 0) {
        e.preventDefault()
        e.stopPropagation()
        openRef.current?.(activeIndex)
      }
    }

    // A window put away stops drawing; shown again, it picks up where it was.
    const onVisibility = (): void => (document.hidden ? stop() : start())

    container.addEventListener('pointerdown', onPointerDown)
    container.addEventListener('pointermove', onPointerMove)
    container.addEventListener('pointerup', onPointerUp)
    container.addEventListener('pointerleave', onPointerLeave)
    container.addEventListener('pointercancel', onPointerCancel)
    container.addEventListener('wheel', onWheel, { passive: false })
    container.addEventListener('keydown', onKey)
    document.addEventListener('visibilitychange', onVisibility)

    const resizeObserver = new ResizeObserver(resize)
    resizeObserver.observe(container)
    const intersectionObserver = new IntersectionObserver(([entry]) => {
      inView = entry.isIntersecting
      if (inView) start()
      else stop()
    })
    intersectionObserver.observe(container)

    resize()
    slots = itemsRef.current.map(loadSlot)
    resnap = true
    start()

    // A new list of pictures, with no rebuild: those already drawn keep their pictures, only new ones are fetched,
    // and a picture you turned to stays in the middle wherever it now sits in the list. Gone, its neighbour takes its place.
    take.current = (items) => {
      if (items.length === slots.length && items.every((item, at) => idOf(item) === slots[at].id)) return
      const was = layout ?? metrics()
      const at = slots.length ? nearest(was, pos) : 0
      const held = slots[fits(was) ? chosen : at]?.id
      const offset = slots.length ? around(was, pos - was.centers[at]) : 0
      const aim = slots.length ? around(was, goal - was.centers[at]) : 0
      const kept = new Map(slots.map((slot) => [slot.id, slot]))
      const before = new Set(kept.keys())
      slots = items.map((item) => {
        const slot = kept.get(idOf(item))
        kept.delete(idOf(item))
        return slot ?? loadSlot(item)
      })
      kept.forEach((slot) => slot.dispose())
      press.index = focus.index = focus.pending = underCard = -1
      focus.t = focus.v = focus.target = 0
      setFocusOpen(false)
      if (slots.length) {
        const m = metrics()
        const found = slots.findIndex((slot) => slot.id === held)
        // A row you turned stays on its picture. One still at the front stays at the front, the newest first: the picture there glides aside for it.
        const front = at === 0 && !fits(was)
        // A list with none of the last one's pictures (Pictures to PDFs) is a new row: its first, never the last row's place.
        const shared = slots.some((slot) => before.has(slot.id))
        const to = front || (!shared && before.size) ? 0 : found >= 0 ? found : Math.min(at, slots.length - 1)
        const from = front && found >= 1 && found <= 2 ? found : to
        // Not shown yet (its pictures still coming, a fresher read of the list arriving): it is simply there, on its
        // first, when it shows. A glide now was seen as the row coming up on one book, then swinging to another.
        const shown = rise.done || rise.running
        pos = shown ? m.centers[from] + (found >= 0 ? offset : 0) : m.centers[to]
        goal = m.centers[to] + (shown && found >= 0 && !front ? aim : 0)
        chosen = to
        layout = m
        activeIndex = shown ? from : to
        setActive(activeIndex)
        settling = true
      }
      dirty = true
      start()
    }

    return () => {
      alive = false
      stop()
      resizeObserver.disconnect()
      intersectionObserver.disconnect()
      container.removeEventListener('pointerdown', onPointerDown)
      container.removeEventListener('pointermove', onPointerMove)
      container.removeEventListener('pointerup', onPointerUp)
      container.removeEventListener('pointerleave', onPointerLeave)
      container.removeEventListener('pointercancel', onPointerCancel)
      container.removeEventListener('wheel', onWheel)
      container.removeEventListener('keydown', onKey)
      document.removeEventListener('visibilitychange', onVisibility)
      take.current = () => undefined
      slots.forEach((slot) => slot.dispose())
      slots = []
      gl.getExtension('WEBGL_lose_context')?.loseContext()
      canvas.remove()
    }
  }, [])

  // A few new pictures (an add) are made ready first, so none shows as an empty card. A whole new list goes in at once and fetches as it nears the view.
  useEffect(() => {
    const drawn = new Set(itemsRef.current.map(idOf))
    const fresh = given.filter((item) => !drawn.has(idOf(item)))
    const apply = (): void => {
      itemsRef.current = given
      setItems(given)
      take.current(given)
    }
    if (!fresh.length || fresh.length > READIED) return apply()
    let live = true
    void Promise.all(fresh.map(async (item) => {
      const image = new Image()
      image.crossOrigin = 'anonymous'
      const src = typeof item.src === 'string' ? item.src : await item.src()
      if (!src) return
      image.src = src
      await image.decode()
      readied.current.set(idOf(item), image)
    })).catch(() => undefined).then(() => live && apply())
    return () => void (live = false)
  }, [given])

  const current = items[active] ?? items[0]
  const place = counter === 'slash' ? `${num(active + 1).padStart(2, '0')} / ${num(items.length).padStart(2, '0')}` : `${num(active + 1)} of ${num(items.length)}`
  const said = current?.note ?? place
  // The title it turned from, fading out as the new one fades in over it (a short crossfade); by a key, simply there.
  const was = useRef(active)
  const [from, setFrom] = useState(-1)
  useLayoutEffect(() => {
    if (was.current === active) return
    setFrom(keyedTurn ? -1 : was.current)
    was.current = active
  }, [active, keyedTurn])
  // The room beside the row, each side, to the edge of what scrolls it: the turn buttons sit out in it as far as it
  // goes (up to 3rem), never past it. A page's margins are not always even (the Books shelf has its panel at the
  // right, 1.25rem from the row), and a button out past the edge made the whole page scroll sideways.
  useLayoutEffect(() => {
    const frame = frameRef.current
    if (!frame) return
    let edge = frame.parentElement
    while (edge && edge !== document.body && getComputedStyle(edge).overflowX === 'visible') edge = edge.parentElement
    const room = (): void => {
      const row = frame.getBoundingClientRect()
      const box = edge?.getBoundingClientRect()
      const left = box ? row.left - (box.left + edge!.clientLeft) : TURN_ROOM
      const right = box ? box.left + edge!.clientLeft + edge!.clientWidth - row.right : TURN_ROOM
      const out = (space: number): string => `${Math.round(Math.min(TURN_ROOM, space - 8))}px`
      frame.style.setProperty('--turn-left', out(left))
      frame.style.setProperty('--turn-right', out(right))
    }
    room()
    const watch = new ResizeObserver(room)
    watch.observe(frame)
    if (edge) watch.observe(edge)
    return () => watch.disconnect()
  }, [])
  const n = items.length
  const turnBy = (way: 1 | -1) => (): void => {
    // Heard as the picture lands in the middle (its tick), not twice.
    turn.current(way)
    containerRef.current?.focus({ preventScroll: true })
  }

  return (
    <div ref={frameRef} data-flex-carousel-frame className={`flex h-full w-full flex-col ${className}`} style={style}>
      <div className="relative flex min-h-0 flex-1 items-start">
        <TurnButton way={-1} disabled={!ring && active <= 0} onClick={turnBy(-1)} top={direct ? `${TOP}px + ${cardHeight} * (100% + ${CAPTION}px) / 2` : '50%'} />
        <div
          ref={containerRef}
          data-swipe-own
          className={`group/row pointer-events-none relative min-w-0 flex-1 cursor-grab touch-pan-y outline-none select-none overflow-hidden overscroll-contain [-webkit-tap-highlight-color:transparent] [mask-image:linear-gradient(to_right,transparent,#000_7%,#000_93%,transparent)] data-[fits]:[mask-image:none] data-[hover=focus]:cursor-zoom-in data-[hover=close]:cursor-zoom-out data-[hover=open]:cursor-pointer data-[dragging]:cursor-grabbing`}
          // Taller than the row by the glass's bleed; only the row itself (the box inside) takes the pointer, so the bleed never covers what is above or below.
          style={{ height: `calc(100% + ${BLEED * 2}px)`, marginBlock: -BLEED }}
          role="region"
          aria-roledescription="carousel"
          aria-label={label}
          tabIndex={0}
          data-flex-carousel
          data-active={active}
          // Outlined only when Tab brought the keys here: focus handed back by a closing menu, or a shortcut pressed
          // while it held the keys, drew a box round the whole row for nothing.
          onFocus={(event) => event.currentTarget.toggleAttribute('data-tabbed', tabbedIn())}
          onBlur={(event) => event.currentTarget.removeAttribute('data-tabbed')}
        >
          <div aria-hidden data-flex-carousel-row className="pointer-events-auto absolute inset-x-0 rounded-lg group-data-[tabbed]/row:ring-2 group-data-[tabbed]/row:ring-inset group-data-[tabbed]/row:ring-ring" style={{ inset: `${BLEED}px 0` }} />
        </div>
        <TurnButton way={1} disabled={!ring && active >= n - 1} onClick={turnBy(1)} top={direct ? `${TOP}px + ${cardHeight} * (100% + ${CAPTION}px) / 2` : '50%'} />
      </div>
      {/* Its own row under the pictures, in the editor's caption look: the picked one's title, two lines at most, and
          where it is in the row under it. Never over a picture. */}
      <div data-flex-carousel-caption aria-hidden="true" className="relative grid shrink-0 px-12 pt-1.5 text-center" style={{ height: CAPTION }}>
        {current && revealed && (
          <>
            {from >= 0 && items[from] && (
              <span key={`was-${from}`} className="mf-caption-look mf-caption-out col-start-1 row-start-1 line-clamp-2 translate-x-(--flex-carousel-x) self-start">{items[from].title || 'New note'}</span>
            )}
            <span key={`now-${active}`} data-flex-carousel-title className={`mf-caption-look col-start-1 row-start-1 line-clamp-2 translate-x-(--flex-carousel-x) self-start ${from >= 0 ? 'mf-caption-in' : ''}`}>{current.title || 'New note'}</span>
            <span className="absolute inset-x-0 bottom-0 translate-x-(--flex-carousel-x) text-meta text-muted-foreground tabular-nums">{focusOpen ? 'Click it to open' : said}</span>
          </>
        )}
      </div>
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {current ? `${current.title || 'New note'}, ${current.note ? `${current.note}, ` : ''}${num(active + 1)} of ${num(items.length)}` : ''}
      </div>
    </div>
  )
}

/**
 * A round button either side of the row that turns it one picture, in the look of the swipe-back arrow
 * (swipe-back.tsx): the same round popover disc with its soft shadow and chevron, smaller. Disabled, not hidden, at
 * a row's ends; a row that goes round has none.
 */
function TurnButton({ way, disabled, onClick, top }: { way: 1 | -1; disabled: boolean; onClick: () => void; top: string }): React.JSX.Element {
  const Arrow = way === 1 ? ChevronRight : ChevronLeft
  return (
    // Outside the pictures' width, in the margin beside them (the user: "float outside of the designated width, so the
    // carousel is not squeezed any further"), level with the pictures' middle. It takes no room from the row. Short of
    // margin, it comes in only as far as it must to stay on the page (--turn-left, --turn-right, measured above): past
    // the page's edge it made the page scroll sideways.
    <div className="absolute inset-y-0 w-9" style={{ [way === 1 ? 'right' : 'left']: `calc(-1 * var(${way === 1 ? '--turn-right' : '--turn-left'}, 0px))` }}>
    <Tip label={way === 1 ? 'Next picture  →' : 'Previous picture  ←'}>
    <button type="button" data-flex-carousel-turn={way === 1 ? 'next' : 'previous'} aria-label={way === 1 ? 'Next picture' : 'Previous picture'}
      disabled={disabled} onClick={onClick} style={{ top: `calc(${top} - 18px)` }}
      className="absolute left-0 flex size-9 cursor-pointer items-center justify-center rounded-full shrink-0 border bg-popover text-popover-foreground shadow-(--mf-panel-shadow) outline-none transition-[scale,opacity,background-color] duration-120 ease-(--mf-ease) hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.97] disabled:cursor-default disabled:opacity-40 disabled:shadow-none disabled:hover:bg-popover">
      <Arrow className="size-5" />
    </button>
    </Tip>
    </div>
  )
}
