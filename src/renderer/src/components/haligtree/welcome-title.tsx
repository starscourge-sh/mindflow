import { motion } from 'motion/react'
import { ARRIVE_MS } from '@/lib/sound'
import { WelcomeLeaves } from './welcome-leaves'

/** When the window may gather in from the whole screen (main: gatherIn): the title card whole, held a breath. */
export const GATHER_AT = 4400
/** When the title card lifts, clearing the way for the first words on the arrival's beat. */
export const LIFT_AT = ARRIVE_MS - 2000

const ROMAN = (year: number): string => [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']].reduce((out, [n, s]) => { while (year >= (n as number)) (out += s), (year -= n as number); return out }, '')
/** The bunch held low in the middle of its box, sized as the last page's, near enough, so each leaf reads in its squares. */
const BUNCH = { x: 0.5, y: 0.9, scale: 0.62 }

/**
 * The welcome's title card, in the mist before the first words: a book's
 * title page. "A COMMONPLACE BOOK" in small caps over the wordmark, the year
 * (or your name) under it, and above them the Haligtree mark: the same five
 * leaves the last page gathers into a bunch (WelcomeLeaves), flying in and
 * fanning out from one base, stirring if the pointer comes at them. It lifts
 * away before the first words; `hurry` takes it at once.
 */
export function WelcomeTitle({ name, hurry = false }: { name: string; hurry?: boolean }): React.JSX.Element {
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
      <div data-title-mark className="relative mb-[clamp(0.5rem,2vmin,1.5rem)] h-[300px] w-[640px] max-w-full">
        <WelcomeLeaves on={false} open gather motes={false} bunchAt={BUNCH} />
      </div>
      <motion.p {...line(1.6)} className="pl-[0.24em] text-[clamp(0.75rem,1.5vmin,0.9375rem)] font-light uppercase text-(--mf-wl-quiet)">A commonplace book</motion.p>
      <motion.h1 initial={{ opacity: 0, filter: 'blur(14px)', scale: 1.04 }} animate={{ opacity: 1, filter: 'blur(0px)', scale: 1 }} transition={{ delay: 2.3, duration: 1.6, ease: [0.22, 1, 0.36, 1] }}
        className="font-heading text-[clamp(3rem,9vmin,6.5rem)] leading-none font-semibold tracking-[-0.02em]">Haligtree</motion.h1>
      <motion.p {...line(3.1)} className="pl-[0.24em] text-[clamp(0.75rem,1.5vmin,0.9375rem)] font-light uppercase text-(--mf-wl-quiet)">{under}</motion.p>
    </motion.div>
  )
}
