import { useEffect, useRef } from 'react'
import { motion } from 'motion/react'
import { ARRIVE_MS } from '@/lib/sound'
import markUrl from '../../../../../build/logo/mark-leaves.png?url'

/** When the window may gather in from the whole screen (main: gatherIn): the title card whole, held a breath. */
export const GATHER_AT = 4400
/** When the title card lifts, clearing the way for the first words on the arrival's beat. */
export const LIFT_AT = ARRIVE_MS - 2000

const CELL = 8
const RAMP = ['@', '8', '%', 'S', '$', 'X', 't', ';', ':', '.']
const ROMAN = (year: number): string => [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']].reduce((out, [n, s]) => { while (year >= (n as number)) (out += s), (year -= n as number); return out }, '')
/** The mark's grid: so many squares a side. */
const SIDE = 28

/** A square of the mark: where, how full (0 to 1), and its colour, from the logo itself. */
type MarkCell = { c: number; r: number; fill: number; rgb: [number, number, number] }
/**
 * The app's logo (build/logo/mark-leaves.png, the gold leaf fan) as squares:
 * drawn small, a pixel to a square, so each square takes the logo's own gold
 * there, light at the tips and dark at the stem.
 */
function markCells(side = SIDE): Promise<MarkCell[]> {
  return new Promise((resolve) => {
    const image = new Image()
    image.onload = () => {
      const grid = document.createElement('canvas')
      grid.width = grid.height = side
      const pen = grid.getContext('2d', { willReadFrequently: true })
      if (!pen) return resolve([])
      pen.drawImage(image, 0, 0, side, side)
      const data = pen.getImageData(0, 0, side, side).data
      const cells: MarkCell[] = []
      for (let r = 0; r < side; r++)
        for (let c = 0; c < side; c++) {
          const at = (r * side + c) * 4
          // The pale rim round each leaf left out, so the gaps between the leaves read at this size;
          // the gold's depth picks the letter: dense at the dark stem, lighter toward the tips.
          if (data[at + 3] > 115 && data[at + 1] < 182) cells.push({ c, r, fill: Math.min(1, Math.max(0.15, (200 - data[at + 1]) / 70)), rgb: [data[at], data[at + 1], data[at + 2]] })
        }
      resolve(cells)
    }
    image.onerror = () => resolve([])
    image.src = markUrl
  })
}

/**
 * The welcome's title card, in the mist before the first words: a book's
 * title page. "A COMMONPLACE BOOK" in small caps over the wordmark, the year
 * (or your name) under it, and above them the Haligtree mark, the gold leaf
 * fan, forming from squares drawn in letters (the first screen's autumn
 * leaves) drifting in on the wind and gathering into the logo, as the
 * florilegium does on the last page. It lifts away before the first words;
 * `hurry` takes it at once.
 */
export function WelcomeTitle({ name, hurry = false }: { name: string; hurry?: boolean }): React.JSX.Element {
  const box = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = box.current
    const context = canvas?.getContext('2d')
    if (!canvas || !context) return
    const scale = window.devicePixelRatio || 1
    // Wider than the mark, so the leaves can be seen blowing in to it.
    const W = 640
    const H = 240
    const ox = (W - SIDE * CELL) / 2
    const oy = H - SIDE * CELL
    canvas.width = W * scale
    canvas.height = H * scale
    context.setTransform(scale, 0, 0, scale, 0, 0)
    const dark = document.documentElement.classList.contains('dark')
    let seed = 11
    const random = (): number => ((seed = (seed * 16807) % 2147483647) / 2147483647)
    // Each square starts as a leaf out on the wind, up and to the left, and comes to its place a moment apart.
    let bits: (MarkCell & { x: number; y: number; late: number; spin: number; sway: number })[] = []
    let start = performance.now()
    let frame = 0
    let gone = false
    const tick = (now: number): void => {
      const t = now - start
      context.clearRect(0, 0, W, H)
      context.font = `600 ${CELL - 1}px ui-monospace, SFMono-Regular, Menlo, monospace`
      context.textAlign = 'center'
      context.textBaseline = 'middle'
      for (const one of bits) {
        const k = Math.max(0, Math.min(1, (t - 900 - one.late) / 1900))
        if (k <= 0) continue
        // Slowing as it lands, with a last sway, the way a leaf comes to rest.
        const e = 1 - (1 - k) ** 3
        const x = one.x + (ox + one.c * CELL - one.x) * e + Math.sin(t / 420 + one.sway) * 6 * (1 - e)
        const y = one.y + (oy + one.r * CELL - one.y) * e + Math.cos(t / 520 + one.sway) * 4 * (1 - e)
        context.save()
        context.globalAlpha = Math.min(1, k * 2.5)
        context.translate(x + CELL / 2, y + CELL / 2)
        context.rotate(one.spin * (1 - e))
        // The tile in the logo's own gold there; its letter darker in light, lighter in dark, as the last page's leaves.
        const [r, g, b] = one.rgb
        const shade = dark ? (v: number): number => Math.round(v + (255 - v) * 0.35) : (v: number): number => Math.round(v * 0.55)
        context.fillStyle = `rgba(${r},${g},${b},${0.2 + one.fill * 0.25})`
        context.fillRect(-CELL / 2 + 0.5, -CELL / 2 + 0.5, CELL - 1, CELL - 1)
        context.fillStyle = `rgb(${shade(r)},${shade(g)},${shade(b)})`
        context.fillText(RAMP[Math.min(RAMP.length - 1, Math.floor((1 - one.fill) * RAMP.length))], 0, 0.5)
        context.restore()
      }
      if (t < 4400) frame = requestAnimationFrame(tick)
    }
    void markCells().then((cells) => {
      if (gone) return
      bits = cells.map((one) => ({ ...one, x: random() * 200 - 40, y: random() * H - 20, late: random() * 1300, spin: (random() - 0.5) * 6, sway: random() * Math.PI * 2 }))
      start = performance.now()
      frame = requestAnimationFrame(tick)
    })
    return () => ((gone = true), cancelAnimationFrame(frame))
  }, [])
  // Each line condenses out of the mist in turn: soft and wide first, then close and sharp.
  const line = (delay: number): object => ({
    initial: { opacity: 0, filter: 'blur(10px)', letterSpacing: '0.42em' },
    animate: { opacity: 1, filter: 'blur(0px)', letterSpacing: '0.24em' },
    transition: { delay, duration: 1.4, ease: [0.22, 1, 0.36, 1] }
  })
  const under = name ? `for ${name}` : ROMAN(new Date().getFullYear())
  return (
    <motion.div aria-hidden data-title-card="" className="pointer-events-none absolute inset-0 z-40 flex flex-col items-center justify-center gap-[clamp(0.6rem,1.6vmin,1rem)] text-foreground"
      initial={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
      animate={hurry ? { opacity: 0, transition: { duration: 0.4 } } : { opacity: 0, y: -18, filter: 'blur(6px)', transition: { delay: LIFT_AT / 1000, duration: 1.2, ease: [0.4, 0, 0.2, 1] } }}>
      <canvas ref={box} className="mb-[clamp(0.5rem,2vmin,1.5rem)] h-[240px] w-[640px] max-w-full" />
      <motion.p {...line(1.6)} className="pl-[0.24em] text-[clamp(0.75rem,1.5vmin,0.9375rem)] font-light uppercase text-(--mf-wl-quiet)">A commonplace book</motion.p>
      <motion.h1 initial={{ opacity: 0, filter: 'blur(14px)', scale: 1.04 }} animate={{ opacity: 1, filter: 'blur(0px)', scale: 1 }} transition={{ delay: 2.3, duration: 1.6, ease: [0.22, 1, 0.36, 1] }}
        className="font-heading text-[clamp(3rem,9vmin,6.5rem)] leading-none font-semibold tracking-[-0.02em]">Haligtree</motion.h1>
      <motion.p {...line(3.1)} className="pl-[0.24em] text-[clamp(0.75rem,1.5vmin,0.9375rem)] font-light uppercase text-(--mf-wl-quiet)">{under}</motion.p>
    </motion.div>
  )
}
