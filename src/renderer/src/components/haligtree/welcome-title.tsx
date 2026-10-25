import { useEffect, useRef } from 'react'
import { motion } from 'motion/react'
import { ARRIVE_MS } from '@/lib/sound'

/** When the window may gather in from the whole screen (main: gatherIn): the title card whole, held a breath. */
export const GATHER_AT = 4400
/** When the title card lifts, clearing the way for the first words on the arrival's beat. */
export const LIFT_AT = ARRIVE_MS - 2000

const CELL = 11
const RAMP = ['@', '8', '%', 'S', '$', 'X', 't', ';', ':', '.']
const HUES = [45, 70, 85, 30, 110]
const ROMAN = (year: number): string => [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']].reduce((out, [n, s]) => { while (year >= (n as number)) (out += s), (year -= n as number); return out }, '')

/** The mark, as squares: a crown of five leaf clusters over a short trunk, 0 to 1 how full each is. */
function markCells(): { c: number; r: number; fill: number; trunk: boolean }[] {
  const cells: { c: number; r: number; fill: number; trunk: boolean }[] = []
  const crown = [[8, 5, 3.6], [4.6, 7, 3], [11.4, 7, 3], [6, 3.4, 2.6], [10, 3.4, 2.6]] as const
  for (let r = 0; r < 17; r++)
    for (let c = 0; c < 17; c++) {
      const near = Math.max(...crown.map(([x, y, rad]) => 1 - Math.hypot(c - x, r - y) / rad))
      if (near > 0) cells.push({ c, r, fill: Math.min(1, near * 1.6), trunk: false })
      else if (r >= 9 && r <= 15 && Math.abs(c - 8 + (r - 9) * 0.05) < (r > 13 ? 1.6 : 0.8)) cells.push({ c, r, fill: 0.9, trunk: true })
    }
  return cells
}

/**
 * The welcome's title card, in the mist before the first words: a book's
 * title page. "A COMMONPLACE BOOK" in small caps over the wordmark, the year
 * (or your name) under it, and above them the Haligtree mark forming from
 * leaves drawn in letters (the first screen's autumn leaves) drifting in on
 * the wind and gathering into a tree, as the florilegium does on the last
 * page. It lifts away before the first words; `hurry` takes it at once.
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
    const ox = (W - 17 * CELL) / 2
    const oy = H - 17 * CELL
    canvas.width = W * scale
    canvas.height = H * scale
    context.setTransform(scale, 0, 0, scale, 0, 0)
    const dark = document.documentElement.classList.contains('dark')
    let seed = 11
    const random = (): number => ((seed = (seed * 16807) % 2147483647) / 2147483647)
    // Each square starts as a leaf out on the wind, up and to the left, and comes to its place a moment apart.
    const bits = markCells().map((one) => ({ ...one, hue: one.trunk ? 50 : HUES[Math.floor(random() * HUES.length)], x: random() * 200 - 40, y: random() * H - 20, late: random() * 1300, spin: (random() - 0.5) * 6, sway: random() * Math.PI * 2 }))
    const start = performance.now()
    let frame = 0
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
        const light = one.trunk ? (dark ? 0.5 : 0.42) : dark ? 0.62 : 0.6
        context.fillStyle = `oklch(${light} ${one.trunk ? 0.05 : 0.15} ${one.hue} / ${0.18 + one.fill * 0.22})`
        context.fillRect(-CELL / 2 + 0.5, -CELL / 2 + 0.5, CELL - 1, CELL - 1)
        context.fillStyle = `oklch(${light - 0.08} ${one.trunk ? 0.06 : 0.16} ${one.hue})`
        context.fillText(RAMP[Math.min(RAMP.length - 1, Math.floor((1 - one.fill) * RAMP.length))], 0, 0.5)
        context.restore()
      }
      if (t < 4400) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
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
        className="font-heading text-[clamp(3rem,9vmin,6.5rem)] leading-none font-light tracking-[-0.02em]">Haligtree</motion.h1>
      <motion.p {...line(3.1)} className="pl-[0.24em] text-[clamp(0.75rem,1.5vmin,0.9375rem)] font-light uppercase text-(--mf-wl-quiet)">{under}</motion.p>
    </motion.div>
  )
}
