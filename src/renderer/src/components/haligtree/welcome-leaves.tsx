import { useEffect, useRef } from 'react'

import { awakeFrames, still } from '@/lib/motion'
import { quietWind, rustle } from '@/lib/sound'

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
/** How far off the pointer starts to quicken the leaves drawn to a choice, in px. */
const NEAR = 460
/** The most leaves drawn in at once: a stream when the pointer is far, more over the choice. */
const STREAM = 8
/** Their pace with the pointer far, px a second: enough that the way they go reads at a glance. */
const DRIFT = 51

/**
 * The welcome's first screen, once: autumn leaves drawn in letters on little
 * tinted tiles (after stackedlol's ASCII sharks) blowing across the window on
 * an autumn wind, tumbling as they go, behind the words, faint enough that
 * the words read over them. When the welcome moves on (`on`
 * turns false) a gust blows them off the edge, gone in under a second. Not
 * drawn under reduced motion.
 */
export function WelcomeLeaves({ on, open, middle = 0.3, gather = false, lure = null, motes: showMotes = true }: { on: boolean; /** The welcome showing: the small ones keep drifting till it ends. */ open: boolean; /** How much of a leaf shows in the middle of the page: none on a page full to its edges. */ middle?: number; /** The last page: the leaves gather into one bunch at a single base, a florilegium. */ gather?: boolean; /** What the leaves are drawn to (a selector): they drift in from the edges and sink behind it, quicker and with the wind louder as the pointer nears it. */ lure?: string | null; /** The small ones drifting by: none on a page with its own light (the dial). */ motes?: boolean }): React.JSX.Element | null {
  const box = useRef<HTMLCanvasElement>(null)
  const gathering = useRef(gather)
  gathering.current = gather
  const inMiddle = useRef(middle)
  inMiddle.current = middle
  const drawTo = useRef(lure)
  drawTo.current = lure
  const moting = useRef(showMotes)
  moting.current = showMotes
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
    // The last page's bunch, drawn apart so it can stand a little clearer than the leaves blowing by.
    const held = document.createElement('canvas')
    const penHeld = held.getContext('2d', { willReadFrequently: true })
    if (!context || !pen || !penHeld) return
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
      held.width = cols
      held.height = rows
    }
    fit()
    window.addEventListener('resize', fit)
    // Read each frame: the dial changes the theme under them.
    let dark = document.documentElement.classList.contains('dark')
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
    // The bunch on the last page: each gathered leaf, where it came from, where it goes, and how far it has turned to face you.
    type Held = { from: { x: number; y: number; spin: number; size: number }; to: { x: number; y: number; spin: number; size: number }; base: { x: number; y: number }; delay: number; face: number; i: number }
    const bunch = new Map<Leaf, Held>()
    let gatheredAt = 0
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
    // Come back after a page without them (the dial): the ones already out fade in, never there at once.
    if (gust.current !== null) for (const one of motes) born.set(one, performance.now())
    /** How bare the page is there, 0.3 to 1: strongest at the very edge, softer a fifth of the way in. */
    const bare = (x: number, y: number): number => {
      const side = Math.max(0, 1 - Math.min(x, width - x) / (width * 0.18))
      const ends = Math.max(0, 1 - Math.min(y, height - y) / (height * 0.16))
      // Mostly at the edges, never none in the middle: a few drift across it too, fainter.
      return Math.max(inMiddle.current, side, ends)
    }

    /** A leaf's outline, its stem at the origin pointing left and its tip at `length`, by kind. */
    /** Where a leaf is drawn: the blowing leaves' grid, or the bunch's. */
    let ink: CanvasRenderingContext2D = pen
    const outline = (kind: Kind, length: number): void => {
      const w = length * 0.5
      ink.beginPath()
      if (kind === 'maple') {
        // Five pointed lobes from the stem, the middle one longest, each with a tooth either side.
        const lobes = [[-1.25, 0.62], [-0.62, 0.86], [0, 1], [0.62, 0.86], [1.25, 0.62]] as const
        ink.moveTo(0, 0)
        lobes.forEach(([angle, reach], i) => {
          const tipX = Math.cos(angle) * length * reach
          const tipY = Math.sin(angle) * length * reach
          const before = angle - 0.32
          const toothX = Math.cos(before) * length * reach * 0.62
          const toothY = Math.sin(before) * length * reach * 0.62
          ink.lineTo(Math.cos(before - 0.12) * length * reach * 0.42, Math.sin(before - 0.12) * length * reach * 0.42)
          ink.lineTo(toothX, toothY)
          ink.lineTo(tipX, tipY)
          const after = angle + 0.32
          ink.lineTo(Math.cos(after) * length * reach * 0.62, Math.sin(after) * length * reach * 0.62)
          if (i === lobes.length - 1) ink.lineTo(Math.cos(after + 0.12) * length * reach * 0.42, Math.sin(after + 0.12) * length * reach * 0.42)
        })
        ink.closePath()
      } else if (kind === 'oak') {
        // Long, with round lobes in pairs down each side.
        ink.moveTo(0, 0)
        const lobes = 4
        for (let i = 0; i <= lobes; i++) {
          const x = length * (0.15 + (0.8 * i) / lobes)
          const out = w * 0.7 * Math.sin(Math.PI * (0.25 + (0.75 * i) / lobes))
          ink.quadraticCurveTo(x - length * 0.08, -out * 1.25, x, -out * 0.45)
        }
        ink.quadraticCurveTo(length * 1.02, 0, length * 0.95, 0)
        for (let i = lobes; i >= 0; i--) {
          const x = length * (0.15 + (0.8 * i) / lobes)
          const out = w * 0.7 * Math.sin(Math.PI * (0.25 + (0.75 * i) / lobes))
          ink.quadraticCurveTo(x + length * 0.08, out * 1.25, x - length * 0.1, out * 0.45)
        }
        ink.closePath()
      } else {
        // An oval with a fine serrated edge and a drawn-out tip.
        const steps = 14
        ink.moveTo(0, 0)
        for (let side = -1; side <= 1; side += 2) {
          for (let i = 1; i <= steps; i++) {
            const u = side < 0 ? i / steps : 1 - i / steps
            const half = w * 0.62 * Math.sin(Math.PI * Math.min(1, u * 1.08)) ** 0.8
            const tooth = i % 2 ? 1 : 0.86
            ink.lineTo(length * u, side * half * tooth)
          }
        }
        ink.closePath()
      }
    }
    // One leaf, tumbling: turned over on two axes (squashed one way, then the other), its tip
    // bending with the wind, then its veins and a few darker flecks, so it reads as a leaf.
    const draw = (one: Leaf, t: number): void => {
      const length = one.size / CELL
      ink.save()
      ink.translate(one.x / CELL, one.y / CELL)
      ink.rotate(one.spin)
      const face = bunch.get(one)?.face ?? 0
      ink.scale(0.35 + 0.65 * Math.abs(Math.cos(one.flip)) * (1 - face) + face, (0.45 + 0.55 * Math.abs(Math.cos(one.roll + t * 0.25))) * (1 - face) + 0.9 * face)
      // The tip half bends: drawn a second time over the first, turned a little at the middle.
      const bend = Math.sin(t * 1.2 + one.sway) * 0.1
      const colour = (light: number, shift: number): string => `oklch(${dark ? light - 0.04 : light - 0.08} 0.16 ${one.hue + shift})`
      const body = ink.createLinearGradient(0, 0, length, 0)
      body.addColorStop(0, colour(0.66, -12))
      body.addColorStop(1, colour(0.74, 14))
      ink.translate(-length * 0.45, 0)
      ink.fillStyle = body
      outline(one.kind, length)
      ink.fill()
      ink.save()
      ink.translate(length * 0.5, 0)
      ink.rotate(bend)
      ink.translate(-length * 0.5, 0)
      ink.beginPath()
      ink.rect(length * 0.5, -length, length, length * 2)
      ink.clip()
      outline(one.kind, length)
      ink.fill()
      ink.restore()
      // The stem, then the veins: the midrib and a few each side, darker.
      ink.fillStyle = colour(0.45, -8)
      ink.fillRect(-length * 0.16, -0.5, length * 0.18, 1)
      ink.strokeStyle = colour(0.5, -6)
      ink.lineWidth = 0.9
      ink.beginPath()
      if (one.kind === 'maple') {
        for (const angle of [-1.25, -0.62, 0, 0.62, 1.25]) (ink.moveTo(0, 0), ink.lineTo(Math.cos(angle) * length * 0.8, Math.sin(angle) * length * 0.8))
      } else {
        ink.moveTo(0, 0)
        ink.lineTo(length * 0.95, 0)
        for (let i = 1; i <= 4; i++) {
          const x = length * (0.15 + i * 0.17)
          ink.moveTo(x, 0)
          ink.lineTo(x + length * 0.14, -length * 0.17)
          ink.moveTo(x, 0)
          ink.lineTo(x + length * 0.14, length * 0.17)
        }
      }
      ink.stroke()
      ink.restore()
    }

    // The leaves drawn to a choice, and how they go: `pace` 1 (the pointer far) to 3 (over it), eased, and the wind with it.
    const drawn: { one: Leaf; aim: { x: number; y: number }; bend: number; speed: number }[] = []
    let pace = 1
    let loud = 0
    let heard = 0
    let nextAt = 0
    let sunk = 0
    let motesShown = moting.current ? 1 : 0
    const pointer = { x: -1e5, y: -1e5 }
    const point = (event: PointerEvent): void => void ((pointer.x = event.clientX), (pointer.y = event.clientY))
    const away = (): void => void ((pointer.x = -1e5), (pointer.y = -1e5))
    window.addEventListener('pointermove', point)
    document.documentElement.addEventListener('pointerleave', away)
    // A gust: pressed on the choice (held while the dial is dragged), and a small push at each stop the dial turns
    // to, so taking hold of it is felt in the leaves and the wind. `stir` eases back to calm once let go.
    let stir = 0
    let pressed = false
    let burst = 0
    let stop: string | null = null
    const press = (event: PointerEvent): void => {
      const target = drawTo.current ? document.querySelector(drawTo.current) : null
      if (!target || !(event.target instanceof Node) || !target.contains(event.target)) return
      pressed = true
      stir = Math.max(stir, 1)
      burst += 6
    }
    const letGo = (): void => void (pressed = false)
    window.addEventListener('pointerdown', press, true)
    window.addEventListener('pointerup', letGo, true)
    window.addEventListener('pointercancel', letGo, true)
    /** A new leaf for the stream, coming in at a side (or the top), fading in where it starts. */
    const toward = (target: DOMRect): void => {
      const one = make(true, true)
      const side = Math.random()
      if (side < 0.4) (one.x = width * Math.random() * 0.06), (one.y = height * (0.1 + Math.random() * 0.8))
      else if (side < 0.8) (one.x = width * (0.94 + Math.random() * 0.06)), (one.y = height * (0.1 + Math.random() * 0.8))
      else (one.x = width * (0.1 + Math.random() * 0.8)), (one.y = height * Math.random() * 0.06)
      one.size = 70 + Math.random() * 40
      born.set(one, performance.now())
      // Each aims for its own place within the choice, so they sink in across it, never all at one point.
      // And bends in on its own side: wide out at the edge, straight in at the end, so its way reads as toward it.
      drawn.push({ one, aim: { x: (Math.random() - 0.5) * target.width * 0.6, y: (Math.random() - 0.5) * target.height * 0.4 }, bend: (Math.random() < 0.5 ? -1 : 1) * (0.7 + Math.random() * 0.4), speed: 0 })
    }
    let last = performance.now()
    const tick = (now: number): void => {
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      const t = now / 1000
      dark = document.documentElement.classList.contains('dark')
      if (again.current) (again.current = false), fall.splice(0, fall.length, ...Array.from({ length: 8 }, () => make(false)))
      const leaving = gust.current
      const gone = leaving === null ? 0 : Math.min(1, (now - leaving) / GUST_MS)
      // The small ones come in as the gust passes, and stay faint.
      // One wind for all: the small ones are there from the start, farther off, and ride the same gust,
      // then the wind drops to a breeze and they drift on, so what follows is the same fall, thinned.
      const calm = leaving === null ? 0 : Math.min(1, Math.max(0, (now - leaving - GUST_MS) / 1500))
      // The wind: mostly left to right and a little down, with gusts now and then.
      // Blowing by: a steady wind across, swelling now and then, never a wobble in place.
      const blow = 55 + 35 * Math.max(0, Math.sin(t * 0.25)) ** 2
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
        one.y += (10 + Math.sin(t * 0.4 + one.sway) * 9 + one.vy) * dt
        one.spin += one.turn * (0.3 + blow / 500) * dt
        // Turning over as it goes, steadily, faster in the gust.
        one.flip += (0.35 + Math.abs(one.vx) * 0.004) * dt
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
        // A leaf held in the bunch goes where the bunch puts it, nowhere else.
        if (bunch.has(one)) continue
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
      // Drawn to a choice: a few leaves at a time drift in from the edges and sink behind it, under it, gone.
      const target = drawTo.current ? document.querySelector(drawTo.current)?.getBoundingClientRect() : undefined
      const room = canvas.getBoundingClientRect()
      const hole = target && target.width ? { x: target.left - room.left, y: target.top - room.top, w: target.width, h: target.height, round: drawTo.current!.includes('slider') } : null
      if (hole) {
        // The pointer's way from the choice: none over it, the leaves at their quickest and the wind at its loudest.
        const px = pointer.x - room.left
        const py = pointer.y - room.top
        const off = hole.round
          ? Math.max(0, Math.hypot(px - hole.x - hole.w / 2, py - hole.y - hole.h / 2) - hole.w / 2)
          : Math.hypot(Math.max(hole.x - px, 0, px - hole.x - hole.w), Math.max(hole.y - py, 0, py - hole.y - hole.h))
        const near = Math.max(0, 1 - off / NEAR) ** 1.6
        // Eased both ways, so nothing jumps as the pointer moves.
        const ease = 1 - Math.exp(-dt * 1.6)
        // Each stop the dial turns to (by key, wheel or drag): a small push.
        const value = document.querySelector(drawTo.current!)?.getAttribute('aria-valuenow') ?? null
        if (stop !== null && value !== stop) (stir = Math.min(1.6, stir + 0.35)), (burst += 2)
        stop = value
        // Held while pressed; let go, it dies down over a second or two. Quick up, slow down, as a gust does.
        if (pressed) stir = Math.max(stir, 1)
        else stir *= Math.exp(-dt * 0.9)
        const gusting = Math.min(1.6, stir)
        pace += (1 + 2 * near + 1.5 * gusting - pace) * (1 - Math.exp(-dt * (gusting > 0.05 ? 5 : 1.6)))
        loud += (near - loud) * ease
        const level = Math.min(1, 0.8 * loud + 0.6 * gusting)
        if (Math.abs(level - heard) > 0.01 || (heard && level < 0.01)) rustle((heard = level < 0.01 ? 0 : level))
        for (; burst > 0; burst--) toward(target!)
        if (now > nextAt && drawn.length < STREAM + Math.round(3 * near + 6 * gusting)) (toward(target!), (nextAt = now + 1100 / pace))
        const middle = { x: hole.x + hole.w / 2, y: hole.y + hole.h / 2 }
        for (let i = drawn.length - 1; i >= 0; i--) {
          const { one, aim, bend } = drawn[i]
          const dx = middle.x + aim.x - one.x
          const dy = middle.y + aim.y - one.y
          const far = Math.hypot(dx, dy) || 1
          // Along a curve that closes in on it: far off it swings wide on its own side, near it heads straight
          // in, and it quickens as it comes, as if pulled. A little sway on top, as a leaf has.
          const close = 1 - Math.min(1, far / 520)
          const sway = bend * (1 - close) + Math.sin(t * 0.6 + one.sway) * 0.12
          const speed = DRIFT * pace * one.drift * (1 + 1.6 * close * close)
          // Never past its mark in one frame.
          const step = Math.min(far, speed * dt) / (speed * dt || 1)
          one.x += ((dx / far) * speed - (dy / far) * speed * sway) * dt * step
          one.y += ((dy / far) * speed + (dx / far) * speed * sway) * dt * step
          drawn[i].speed = speed
          one.flip += 0.5 * pace * dt
          one.spin += one.turn * 0.8 * pace * dt
          // Sinking: smaller as it slides under, as if drawn down into it.
          const under = hole.round ? Math.hypot(one.x - middle.x, one.y - middle.y) < hole.w / 2 : Math.abs(one.x - middle.x) < hole.w / 2 && Math.abs(one.y - middle.y) < hole.h / 2
          if (under) one.size *= 1 - 0.9 * dt * pace
          if (far < 8 || one.size < 14) (drawn.splice(i, 1), sunk++)
        }
      } else {
        // Its page left: the wind goes with it.
        if (drawn.length || heard) quietWind()
        heard = 0
        loud = 0
        pace = 1
        stir = 0
        burst = 0
        stop = null
        drawn.length = 0
      }
      ;(window as unknown as { haligtreeLure?: unknown }).haligtreeLure = { leaves: drawn.length, sunk, pace, loud, stir, speed: drawn.length ? drawn.reduce((sum, one) => sum + one.speed, 0) / drawn.length : 0, toward: drawn.length && hole ? drawn.reduce((sum, { one }) => sum + Math.hypot(one.x - hole.x - hole.w / 2, one.y - hole.y - hole.h / 2), 0) / drawn.length : 0 }
      // Only the last stretch fades, for any leaf still in sight.
      const fade = Math.max(0, (gone - 0.7) / 0.3)
      motesShown = Math.max(0, Math.min(1, motesShown + (moting.current ? dt : -dt) / 1.2))
      pen.clearRect(0, 0, cols, rows)
      pen.globalAlpha = 1 - fade
      for (const one of fall) draw(one, t)
      // The florilegium: on the last page five leaves fly in from wherever they were and gather at one
      // base, fanned like a bunch held in the hand, each on its own stem; the rest fade back. Away from
      // the last page they let go and drift on.
      if (gathering.current && !gatheredAt) {
        gatheredAt = now
        const base = { x: width * 0.83, y: height * 0.9 }
        const picked = [...motes].sort((a, b) => Math.hypot(a.x - base.x, a.y - base.y) - Math.hypot(b.x - base.x, b.y - base.y)).slice(0, 5)
        while (picked.length < 5) {
          const one = make(false, true)
          one.x = width + 60
          one.y = height * Math.random()
          motes.push(one)
          picked.push(one)
        }
        picked.forEach((one, i) => {
          const angle = -Math.PI / 2 + (i - 2) * 0.34
          const size = (i === 2 ? 155 : 138 - Math.abs(i - 2) * 8) * Math.min(1, width / 1400)
          // Long stems of their own, the middle one tallest, so each leaf reads apart from the next.
          const reach = size * 0.62 + (160 - Math.abs(i - 2) * 30) * Math.min(1, width / 1400)
          bunch.set(one, { from: { x: one.x, y: one.y, spin: one.spin, size: one.size }, to: { x: base.x + Math.cos(angle) * reach, y: base.y + Math.sin(angle) * reach, spin: angle, size }, base, delay: i * 150, face: 0, i })
          one.hue = HUES[i % HUES.length]
          // Slender leaves only: a bunch reads leaf by leaf, not as one shape.
          one.kind = 'birch'
        })
      } else if (!gathering.current && gatheredAt) {
        gatheredAt = 0
        bunch.clear()
      }
      for (const [one, at] of bunch) {
        const k = Math.max(0, Math.min(1, (now - gatheredAt - at.delay) / 2600))
        const e = 1 - (1 - k) ** 3
        // A curve, not a straight line: lifted a little as it comes, as a leaf caught and carried.
        const lift = Math.sin(Math.PI * e) * 70
        one.x = at.from.x + (at.to.x - at.from.x) * e
        one.y = at.from.y + (at.to.y - at.from.y) * e - lift
        let turn = at.to.spin - at.from.spin
        turn = Math.atan2(Math.sin(turn), Math.cos(turn))
        // Settled, each still stirs a little, as cut leaves do in a hand.
        one.spin = at.from.spin + turn * e + Math.sin(t * 0.8 + at.i) * 0.035 * e
        one.size = at.from.size + (at.to.size - at.from.size) * e
        one.vx = 0
        one.vy = 0
        at.face = e
      }
      if (!bunch.size) penHeld.clearRect(0, 0, cols, rows)
      if (bunch.size) {
        // The stems, each from the base to its leaf, in one dark ink, and a band where they are held.
        const settled = Math.min(1, Math.max(0, (now - gatheredAt - 1400) / 1400))
        penHeld.clearRect(0, 0, cols, rows)
        ink = penHeld
        for (const [one, at] of bunch) (ink.globalAlpha = Math.max(0.2, at.face)), draw(one, t)
        ink = pen
        const stems = penHeld
        stems.globalAlpha = 0.9 * settled
        stems.strokeStyle = `oklch(${dark ? 0.55 : 0.45} 0.06 60)`
        stems.lineWidth = 0.9
        stems.lineCap = 'round'
        for (const [one, at] of bunch) {
          const length = one.size / CELL
          const tail = { x: one.x / CELL - Math.cos(one.spin) * length * 0.61, y: one.y / CELL - Math.sin(one.spin) * length * 0.61 }
          stems.beginPath()
          stems.moveTo(at.base.x / CELL, at.base.y / CELL + 6)
          stems.quadraticCurveTo(at.base.x / CELL, at.base.y / CELL - 2, tail.x, tail.y)
          stems.stroke()
        }
        const any = bunch.values().next().value!
        stems.fillStyle = `oklch(${dark ? 0.6 : 0.5} 0.09 30)`
        stems.fillRect(any.base.x / CELL - 2, any.base.y / CELL - 0.5, 4, 1.6)
      }
      for (const one of motes) {
        // After the first screen, faint at the edges and fading to nothing toward the middle, where the words are.
        // Later on, as clear as the first screen's leaves where the page is bare, gone where the words are.
        const fresh = Math.min(1, (now - (born.get(one) ?? 0)) / 2500)
        const held = bunch.get(one)
        if (held) continue
        const fading = gatheredAt ? 1 - 0.7 * Math.min(1, (now - gatheredAt) / 1800) : 1
        pen.globalAlpha = motesShown * fading * fresh * (0.32 * (1 - calm) + calm * 0.7 * bare(one.x, one.y))
        if (pen.globalAlpha > 0.01) draw(one, t)
      }
      // Drawn with the bunch, a little clearer than the leaves blowing by: these are meant to be followed.
      ink = penHeld
      // In a light theme clearer still: there the pale tiles all but vanished into the page.
      for (const { one } of drawn) (penHeld.globalAlpha = (dark ? 0.55 : 0.95) * Math.min(1, (now - (born.get(one) ?? 0)) / 1800)), draw(one, t)
      penHeld.globalAlpha = 1
      ink = pen
      pen.globalAlpha = 1
      const data = pen.getImageData(0, 0, cols, rows).data
      const dataHeld = penHeld.getImageData(0, 0, cols, rows).data
      context.clearRect(0, 0, width, height)
      context.font = `600 ${CELL - 5}px ui-monospace, "SF Mono", Menlo, monospace`
      context.textAlign = 'center'
      context.textBaseline = 'middle'
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          const at = (y * cols + x) * 4
          // A square of the bunch is drawn from its own grid, a little clearer: tile and letter both.
          const inBunch = dataHeld[at + 3] > 12
          const source = inBunch ? dataHeld : data
          const a = source[at + 3] / 255
          if (a < 0.05) continue
          const px = x * CELL
          const py = y * CELL
          // Under the choice the leaves are drawn to, nothing: they pass beneath it.
          if (hole && (hole.round ? Math.hypot(px + CELL / 2 - hole.x - hole.w / 2, py + CELL / 2 - hole.y - hole.h / 2) < hole.w / 2 : px + CELL > hole.x && px < hole.x + hole.w && py + CELL > hole.y && py < hole.y + hole.h)) continue
          // Faint everywhere, so the words read over them with nothing cut out around them.
          const strength = a
          if (strength < 0.04) continue
          const [r, g, b] = [source[at], source[at + 1], source[at + 2]]
          // The tile in the leaf's own colour; its letter darker in light, lighter in dark.
          // Clearer in a light theme, where pale tiles all but vanished into the page.
          context.fillStyle = `rgba(${r},${g},${b},${(inBunch ? (dark ? 2.4 : 3.4) : 1) * (dark ? 0.13 : 0.11) * strength})`
          context.fillRect(px + 1, py + 1, CELL - 2, CELL - 2)
          const shade = dark ? (one: number): number => Math.round(one + (255 - one) * 0.6) : (one: number): number => Math.round(one * 0.38)
          const letter = Math.min(RAMP.length - 1, Math.max(0, Math.floor((1 - a) * RAMP.length + Math.sin(t * 5 + x * 1.7 + y) * 0.8)))
          context.fillStyle = `rgba(${shade(r)},${shade(g)},${shade(b)},${(inBunch ? (dark ? 2.6 : 3.4) : 1) * 0.2 * strength})`
          context.fillText(RAMP[letter], px + CELL / 2, py + CELL / 2 + 0.5)
        }
      }
    }
    // Only while the window is looked at: away, the leaves hold where they are.
    const frames = awakeFrames(tick)
    return () => {
      frames.stop()
      window.removeEventListener('resize', fit)
      window.removeEventListener('pointermove', point)
      document.documentElement.removeEventListener('pointerleave', away)
      window.removeEventListener('pointerdown', press, true)
      window.removeEventListener('pointerup', letGo, true)
      window.removeEventListener('pointercancel', letGo, true)
      quietWind()
    }
  }, [here])
  if (!here) return null
  return <canvas ref={box} aria-hidden data-welcome-leaves={on ? 'blowing' : 'drifting'} className="pointer-events-none absolute inset-0 h-full w-full" />
}
