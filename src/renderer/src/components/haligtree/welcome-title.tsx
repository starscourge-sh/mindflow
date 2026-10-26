import { useLayoutEffect, useRef, useState } from 'react'
import { motion } from 'motion/react'
import { ARRIVE_MS } from '@/lib/sound'
import { WelcomeLeaves } from './welcome-leaves'

/** When the window may gather in from the whole screen (main: gatherIn): only once the title card is whole and held a breath, so the two never move at once. */
export const GATHER_AT = 8400
/** When the title card lifts, clearing the way for the first words on the arrival's beat. */
export const LIFT_AT = ARRIVE_MS - 2000

/** The bunch's size, as the last page's near enough, so each leaf reads in its squares. */
const SCALE = 0.62

/**
 * The welcome's title card, in the mist before the first words: a book's
 * title page: the wordmark, the year
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
  // What it is and whose, as a title page says it: "A commonplace book kept by Reed"; with no name to be read, "A commonplace book".
  const under = name ? `A commonplace book kept by ${name}` : 'A commonplace book'
  // The leaves fly across the whole card and gather where the mark sits: its place read off the slot above the words.
  const card = useRef<HTMLDivElement>(null)
  const slot = useRef<HTMLDivElement>(null)
  const [at, setAt] = useState<{ x: number; y: number; scale: number; fromEdge: true } | null>(null)
  useLayoutEffect(() => {
    const whole = card.current?.getBoundingClientRect()
    const mark = slot.current?.getBoundingClientRect()
    if (whole?.width && mark) setAt({ x: (mark.left + mark.width / 2 - whole.left) / whole.width, y: (mark.top + mark.height * 0.74 - whole.top) / whole.height, scale: SCALE, fromEdge: true })
  }, [])
  return (
    <motion.div ref={card} aria-hidden data-title-card="" className="pointer-events-none absolute inset-0 z-40 flex flex-col items-center justify-center gap-[clamp(0.6rem,1.6vmin,1rem)] text-foreground"
      initial={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
      animate={hurry ? { opacity: 0, transition: { duration: 0.4 } } : { opacity: 0, y: -18, filter: 'blur(6px)', transition: { delay: LIFT_AT / 1000, duration: 1.2, ease: [0.4, 0, 0.2, 1] } }}>
      {at && <div className="absolute inset-0 -z-10"><WelcomeLeaves on={false} open gather motes={false} bunchAt={at} /></div>}
      <div ref={slot} data-title-mark className="relative mb-[clamp(0.5rem,2vmin,1.5rem)] h-[300px] w-[640px] max-w-full" />
      <motion.h1 initial={{ opacity: 0, filter: 'blur(14px)', scale: 1.04 }} animate={{ opacity: 1, filter: 'blur(0px)', scale: 1 }} transition={{ delay: 4.9, duration: 1.6, ease: [0.22, 1, 0.36, 1] }}
        className="font-heading text-[clamp(3rem,9vmin,6.5rem)] leading-none font-semibold tracking-[-0.02em]">Haligtree</motion.h1>
      {name ? (
        // Signed in a pen's hand, as the owner writes their name inside the cover: written on left to right, a little aslant.
        // Its clip runs past the box on every side once written: a hand's loops (the y of "by", the d's tail) go past it.
        <motion.p key="kept" data-title-kept="" className="mt-2 -rotate-3 text-[clamp(1.6rem,3.6vmin,2.4rem)] leading-none text-(--mf-wl-quiet) [font-family:'Haligtree_Signature',cursive]"
          initial={{ clipPath: 'inset(-50% 100% -50% -15%)', opacity: 0.4 }} animate={{ clipPath: 'inset(-50% -15% -50% -15%)', opacity: 1 }}
          transition={{ delay: 6.8, duration: 1.8, ease: [0.45, 0.05, 0.35, 1] }}>{under}</motion.p>
      ) : (
        <motion.p key="year" {...line(6.6)} className="pl-[0.24em] text-[clamp(0.75rem,1.5vmin,0.9375rem)] font-light uppercase text-(--mf-wl-quiet)">{under}</motion.p>
      )}
    </motion.div>
  )
}
