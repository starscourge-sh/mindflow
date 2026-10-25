import { useEffect, useRef } from 'react'

import { still } from '@/lib/motion'

/** One square of the grid, in px: each holds a letter on a tinted tile. */
const CELL = 11
/** Fullest to faintest: the letters a leaf is drawn in, by how much of it fills the square. */
const RAMP = ['@', '8', '%', 'S', '$', 'X', 't', ';', ':', '.']
/** How long the leaves take to blow away once Next is pressed. */
const GUST_MS = 1150
/** Autumn: rust, amber, ochre, a red and a late green, as hues for oklch. */
const HUES = [45, 70, 85, 30, 110]

type Kind = 'maple' | 'oak' | 'birch'
type Leaf = { small: boolean; x: number; y: number; vx: number; vy: number; late: number; size: number; hue: number; spin: number; turn: number; flip: number; roll: number; drift: number; sway: number; kind: Kind }
const KINDS: Kind[] = ['maple', 'oak', 'birch']

/**
 * The welcome's first screen, once: autumn leaves drawn in letters on little
 * tinted tiles (after stackedlol's ASCII sharks) blowing across the window on
 * an autumn wind, tumbling as they go, behind the words, faint enough that
 * the words read over them. When the welcome moves on (`on`
 * turns false) a gust blows them off the edge, gone in under a second. Not
 * drawn under reduced motion.
 */
export function WelcomeLeaves({ on, open }: { on: boolean; /** The welcome showing: the small ones keep drifting till it ends. */ open: boolean }): React.JSX.Element | null {
  const box = useRef<HTMLCanvasElement>(null)
  // When the gust came; long ago if the leaves first show on a later screen, so only the small ones drift.
  const gust = useRef<number | null>(on ? null : -1e9)
  // Back on the first screen: the big leaves blow in again.
  const again = useRef(false)
  useEffect(() => {
    if (on) {
      if (gust.current !== null) again.current = true
      gust.current = null
    } else if (gust.current === null) gust.current = performance.now()
  }, [on])
  const here = open

  useEffect(() => {
    const canvas = box.current
    if (!canvas || !here || still()) return
    const context = canvas.getContext('2d')
    const grid = document.createElement('canvas')
    const pen = grid.getContext('2d', { willReadFrequently: true })
    if (!context || !pen) return
    let width = 0
    let height = 0
    let cols = 0
    let rows = 0
    const fit = (): void => {
      const scale = window.devicePixelRatio || 1
      width = canvas.clientWidth
      height = canvas.clientHeight
      canvas.width = width * scale
      canvas.height = height * scale
      context.setTransform(scale, 0, 0, scale, 0, 0)
      cols = Math.ceil(width / CELL)
      rows = Math.ceil(height / CELL)
      grid.width = cols
      grid.height = rows
    }
    fit()
    window.addEventListener('resize', fit)
    const dark = document.documentElement.classList.contains('dark')
    let seed = 7
    const random = (): number => ((seed = (seed * 16807) % 2147483647) / 2147483647)
    // A leaf, somewhere up and to the left of where it will blow, or anywhere at the start.
    const make = (anywhere: boolean, small = false): Leaf => ({
      x: anywhere ? random() * width : -120 - random() * 200,
      y: anywhere ? random() * height : random() * height * 0.8 - height * 0.1,
      size: small ? 36 + random() * 44 : 190 + random() * 150,
      small,
      vx: 0,
      vy: 0,
      // Each catches the gust a moment apart, the nearest the wind first.
      late: random() * 260,
      kind: KINDS[Math.floor(random() * KINDS.length)],
      roll: random() * Math.PI * 2,
      hue: HUES[Math.floor(random() * HUES.length)],
      spin: random() * Math.PI * 2,
      turn: (random() - 0.5) * 1.4,
      flip: random() * Math.PI * 2,
      drift: 0.8 + random() * 0.5,
      sway: random() * Math.PI * 2
    })
    const fall: Leaf[] = gust.current === null ? Array.from({ length: 8 }, () => make(true)) : []
    // After the gust: a few small leaves and specks, drifting through the rest of the welcome.
    const motes: Leaf[] = Array.from({ length: 10 }, () => make(true, true))
    let settled = false
    /**
     * Mostly where the pages are bare, round the edge (the sides, the top and the bottom alike), a fifth anywhere.
     * Each fades in slowly where it starts (`born`), so none pops into sight.
     */
    const edgeward = (one: Leaf): void => {
      const band = Math.random()
      one.size = 60 + Math.random() * 60
      if (band < 0.2) (one.x = Math.random() * width), (one.y = Math.random() * height)
      else if (band < 0.4) (one.x = width * Math.random() * 0.14), (one.y = Math.random() * height)
      else if (band < 0.65) (one.x = width * (0.86 + Math.random() * 0.14)), (one.y = Math.random() * height)
      else if (band < 0.82) (one.x = Math.random() * width), (one.y = height * Math.random() * 0.1)
      else (one.x = Math.random() * width), (one.y = height * (0.88 + Math.random() * 0.1))
      one.vx = 0
      one.vy = 0
      born.set(one, performance.now())
    }
    const born = new WeakMap<Leaf, number>()
    /** How bare the page is there, 0.3 to 1: strongest at the very edge, softer a fifth of the way in. */
    const bare = (x: number, y: number): number => {
      const side = Math.max(0, 1 - Math.min(x, width - x) / (width * 0.18))
      const ends = Math.max(0, 1 - Math.min(y, height - y) / (height * 0.16))
      // Mostly at the edges, never none in the middle: a few drift across it too, fainter.
      return Math.max(0.3, side, ends)
    }

    /** A leaf's outline, its stem at the origin pointing left and its tip at `length`, by kind. */
    const outline = (kind: Kind, length: number): void => {
      const w = length * 0.5
      pen.beginPath()
      if (kind === 'maple') {
        // Five pointed lobes from the stem, the middle one longest, each with a tooth either side.
        const lobes = [[-1.25, 0.62], [-0.62, 0.86], [0, 1], [0.62, 0.86], [1.25, 0.62]] as const
        pen.moveTo(0, 0)
        lobes.forEach(([angle, reach], i) => {
          const tipX = Math.cos(angle) * length * reach
          const tipY = Math.sin(angle) * length * reach
          const before = angle - 0.32
          const toothX = Math.cos(before) * length * reach * 0.62
          const toothY = Math.sin(before) * length * reach * 0.62
          pen.lineTo(Math.cos(before - 0.12) * length * reach * 0.42, Math.sin(before - 0.12) * length * reach * 0.42)
          pen.lineTo(toothX, toothY)
          pen.lineTo(tipX, tipY)
          const after = angle + 0.32
          pen.lineTo(Math.cos(after) * length * reach * 0.62, Math.sin(after) * length * reach * 0.62)
          if (i === lobes.length - 1) pen.lineTo(Math.cos(after + 0.12) * length * reach * 0.42, Math.sin(after + 0.12) * length * reach * 0.42)
        })
        pen.closePath()
      } else if (kind === 'oak') {
        // Long, with round lobes in pairs down each side.
        pen.moveTo(0, 0)
        const lobes = 4
        for (let i = 0; i <= lobes; i++) {
          const x = length * (0.15 + (0.8 * i) / lobes)
          const out = w * 0.7 * Math.sin(Math.PI * (0.25 + (0.75 * i) / lobes))
          pen.quadraticCurveTo(x - length * 0.08, -out * 1.25, x, -out * 0.45)
        }
        pen.quadraticCurveTo(length * 1.02, 0, length * 0.95, 0)
        for (let i = lobes; i >= 0; i--) {
          const x = length * (0.15 + (0.8 * i) / lobes)
          const out = w * 0.7 * Math.sin(Math.PI * (0.25 + (0.75 * i) / lobes))
          pen.quadraticCurveTo(x + length * 0.08, out * 1.25, x - length * 0.1, out * 0.45)
        }
        pen.closePath()
      } else {
        // An oval with a fine serrated edge and a drawn-out tip.
        const steps = 14
        pen.moveTo(0, 0)
        for (let side = -1; side <= 1; side += 2) {
          for (let i = 1; i <= steps; i++) {
            const u = side < 0 ? i / steps : 1 - i / steps
            const half = w * 0.62 * Math.sin(Math.PI * Math.min(1, u * 1.08)) ** 0.8
            const tooth = i % 2 ? 1 : 0.86
            pen.lineTo(length * u, side * half * tooth)
          }
        }
        pen.closePath()
      }
    }
    // One leaf, tumbling: turned over on two axes (squashed one way, then the other), its tip
    // bending with the wind, then its veins and a few darker flecks, so it reads as a leaf.
    const draw = (one: Leaf, t: number): void => {
      const length = one.size / CELL
      pen.save()
      pen.translate(one.x / CELL, one.y / CELL)
      pen.rotate(one.spin)
      pen.scale(0.35 + 0.65 * Math.abs(Math.cos(one.flip)), 0.45 + 0.55 * Math.abs(Math.cos(one.roll + t * 0.25)))
      // The tip half bends: drawn a second time over the first, turned a little at the middle.
      const bend = Math.sin(t * 1.2 + one.sway) * 0.1
      const colour = (light: number, shift: number): string => `oklch(${dark ? light - 0.04 : light - 0.08} 0.16 ${one.hue + shift})`
      const body = pen.createLinearGradient(0, 0, length, 0)
      body.addColorStop(0, colour(0.66, -12))
      body.addColorStop(1, colour(0.74, 14))
      pen.translate(-length * 0.45, 0)
      pen.fillStyle = body
      outline(one.kind, length)
      pen.fill()
      pen.save()
      pen.translate(length * 0.5, 0)
      pen.rotate(bend)
      pen.translate(-length * 0.5, 0)
      pen.beginPath()
      pen.rect(length * 0.5, -length, length, length * 2)
      pen.clip()
      outline(one.kind, length)
      pen.fill()
      pen.restore()
      // The stem, then the veins: the midrib and a few each side, darker.
      pen.fillStyle = colour(0.45, -8)
      pen.fillRect(-length * 0.16, -0.5, length * 0.18, 1)
      pen.strokeStyle = colour(0.5, -6)
      pen.lineWidth = 0.9
      pen.beginPath()
      if (one.kind === 'maple') {
        for (const angle of [-1.25, -0.62, 0, 0.62, 1.25]) (pen.moveTo(0, 0), pen.lineTo(Math.cos(angle) * length * 0.8, Math.sin(angle) * length * 0.8))
      } else {
        pen.moveTo(0, 0)
        pen.lineTo(length * 0.95, 0)
        for (let i = 1; i <= 4; i++) {
          const x = length * (0.15 + i * 0.17)
          pen.moveTo(x, 0)
          pen.lineTo(x + length * 0.14, -length * 0.17)
          pen.moveTo(x, 0)
          pen.lineTo(x + length * 0.14, length * 0.17)
        }
      }
      pen.stroke()
      pen.restore()
    }

    let frame = 0
    let last = performance.now()
    const tick = (now: number): void => {
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      const t = now / 1000
      if (again.current) (again.current = false), fall.splice(0, fall.length, ...Array.from({ length: 8 }, () => make(false)))
      const leaving = gust.current
      const gone = leaving === null ? 0 : Math.min(1, (now - leaving) / GUST_MS)
      // The small ones come in as the gust passes, and stay faint.
      // One wind for all: the small ones are there from the start, farther off, and ride the same gust,
      // then the wind drops to a breeze and they drift on, so what follows is the same fall, thinned.
      const calm = leaving === null ? 0 : Math.min(1, Math.max(0, (now - leaving - GUST_MS) / 1500))
      // The wind: mostly left to right and a little down, with gusts now and then.
      // Blowing by: a steady wind across, swelling now and then, never a wobble in place.
      const blow = 95 + 60 * Math.max(0, Math.sin(t * 0.3)) ** 2
      for (const one of fall) {
        if (leaving !== null) {
          // The gust: it builds on each leaf in turn, lifting it up and away to the right as
          // a real gust does, spinning faster as it goes. Nothing fades till the very end.
          const caught = Math.max(0, Math.min(1, (now - leaving - one.late) / 450))
          const ease = caught * caught * (3 - 2 * caught)
          one.vx += (2600 * ease * one.drift - one.vx * 0.6) * dt
          one.vy += (-520 * ease - one.vy * 0.8) * dt
          one.turn += (one.turn >= 0 ? 1 : -1) * 6 * ease * dt
        }
        // Drifting on the wind, rocking side to side as a falling leaf does.
        one.x += (blow * one.drift + one.vx) * dt
        one.y += (16 + Math.sin(t * 0.5 + one.sway) * 14 + one.vy) * dt
        one.spin += one.turn * (0.4 + blow / 400) * dt
        // Turning over as it goes, steadily, faster in the gust.
        one.flip += (0.55 + Math.abs(one.vx) * 0.004) * dt
        // Blown out of sight: in again from the left, a new leaf.
        if (leaving === null && (one.x > width + one.size || one.y > height + one.size)) Object.assign(one, make(false))
      }
      if (gone >= 1 && fall.length) fall.length = 0
      // Once the wind has dropped: more of them, all down the bare edges, already falling.
      if (calm > 0.5 && !settled) {
        settled = true
        // New ones fade in round the edge; those already out drift on as they were, never moved.
        motes.push(...Array.from({ length: 14 }, () => { const one = make(true, true); edgeward(one); return one }))
      }
      for (const one of motes) {
        if (leaving !== null) {
          const caught = Math.max(0, Math.min(1, (now - leaving - one.late) / 450))
          // The gust carries them as it does the big ones, then lets them go.
          const push = caught * (1 - calm)
          one.vx += (1400 * push * one.drift - one.vx * 1.4) * dt
          one.vy += (-260 * push - one.vy * 1.4) * dt
        }
        // Once the wind has dropped, a light sideways breeze and a slow fall: they come down the bare edges.
        // Lingering: a breeze so light they stay a while where they are.
        one.x += (blow * (0.5 - 0.46 * calm) * one.drift + one.vx) * dt
        one.y += one.vy * dt
        one.y += (10 - 2 * calm + Math.sin(t * 0.5 + one.sway) * 6) * dt
        one.flip += 0.7 * dt
        one.spin += one.turn * 1.6 * dt
        if (one.x > width + one.size || one.y > height + one.size) {
          Object.assign(one, make(false, true))
          // After the first screen, a new one starts above an edge, where the pages are bare, not across the middle.
          if (calm > 0.5) edgeward(one)
        }
      }
      // Only the last stretch fades, for any leaf still in sight.
      const fade = Math.max(0, (gone - 0.7) / 0.3)
      pen.clearRect(0, 0, cols, rows)
      pen.globalAlpha = 1 - fade
      for (const one of fall) draw(one, t)
      for (const one of motes) {
        // After the first screen, faint at the edges and fading to nothing toward the middle, where the words are.
        // Later on, as clear as the first screen's leaves where the page is bare, gone where the words are.
        const fresh = Math.min(1, (now - (born.get(one) ?? 0)) / 2500)
        pen.globalAlpha = fresh * (0.32 * (1 - calm) + calm * 0.7 * bare(one.x, one.y))
        if (pen.globalAlpha > 0.01) draw(one, t)
      }
      pen.globalAlpha = 1
      const data = pen.getImageData(0, 0, cols, rows).data
      context.clearRect(0, 0, width, height)
      context.font = `600 ${CELL - 5}px ui-monospace, "SF Mono", Menlo, monospace`
      context.textAlign = 'center'
      context.textBaseline = 'middle'
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          const at = (y * cols + x) * 4
          const a = data[at + 3] / 255
          if (a < 0.05) continue
          const px = x * CELL
          const py = y * CELL
          // Faint everywhere, so the words read over them with nothing cut out around them.
          const strength = a
          if (strength < 0.04) continue
          const [r, g, b] = [data[at], data[at + 1], data[at + 2]]
          // The tile in the leaf's own colour; its letter darker in light, lighter in dark.
          context.fillStyle = `rgba(${r},${g},${b},${(dark ? 0.2 : 0.17) * strength})`
          context.fillRect(px + 1, py + 1, CELL - 2, CELL - 2)
          const shade = dark ? (one: number): number => Math.round(one + (255 - one) * 0.6) : (one: number): number => Math.round(one * 0.38)
          const letter = Math.min(RAMP.length - 1, Math.max(0, Math.floor((1 - a) * RAMP.length + Math.sin(t * 5 + x * 1.7 + y) * 0.8)))
          context.fillStyle = `rgba(${shade(r)},${shade(g)},${shade(b)},${0.28 * strength})`
          context.fillText(RAMP[letter], px + CELL / 2, py + CELL / 2 + 0.5)
        }
      }
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('resize', fit)
    }
  }, [here])
  if (!here) return null
  return <canvas ref={box} aria-hidden data-welcome-leaves={on ? 'blowing' : 'drifting'} className="pointer-events-none absolute inset-0 h-full w-full" />
}
