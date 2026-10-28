import { motion } from 'motion/react'
import { ARRIVE_MS } from '@/lib/sound'

/** When the window may gather in from the whole screen (main: gatherIn): only once the title card is whole and held a breath, so the two never move at once. */
export const GATHER_AT = 8400
/** When the title card lifts, clearing the way for the first words on the arrival's beat. */
export const LIFT_AT = ARRIVE_MS - 2000

const EASE = [0.22, 1, 0.36, 1] as const

/**
 * The welcome's title card, before the first words, as Arc's opening: the
 * gradient blooms first, and only once it is whole (`ready`) do the words
 * come, the wordmark and then the line under it (the year, or your name),
 * centred on a soft pool of the page's colour so they read on any theme. It
 * lifts away before the first words; `hurry` takes it at once.
 */
export function WelcomeTitle({ name, hurry = false, ready = true }: { name: string; hurry?: boolean; ready?: boolean }): React.JSX.Element {
  // Each line rises a little into place as it fades in: held back until the gradient is whole.
  const rise = (delay: number): object => ({
    initial: { opacity: 0, y: 14, filter: 'blur(8px)' },
    animate: ready ? { opacity: 1, y: 0, filter: 'blur(0px)' } : undefined,
    transition: { delay, duration: 1.4, ease: EASE }
  })
  // What it is and whose, as a title page says it: "A commonplace book kept by Reed"; with no name to be read, "A commonplace book".
  const under = name ? `A commonplace book kept by ${name}` : 'A commonplace book'
  return (
    <motion.div aria-hidden data-title-card="" data-ready={ready ? '' : undefined} className="pointer-events-none absolute inset-0 z-40 flex flex-col items-center justify-center gap-[clamp(0.6rem,1.6vmin,1rem)] text-foreground"
      initial={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
      animate={hurry ? { opacity: 0, transition: { duration: 0.4 } } : { opacity: 0, y: -18, filter: 'blur(6px)', transition: { delay: LIFT_AT / 1000, duration: 1.2, ease: [0.4, 0, 0.2, 1] } }}>
      {/* A soft pool of the page's colour behind the words, much wider than they are and with no edge: they read on the brightest part of the gradient. */}
      <motion.div className="absolute top-1/2 left-1/2 -z-10 h-[min(70vh,34rem)] w-[min(96vw,64rem)] -translate-x-1/2 -translate-y-1/2 bg-[radial-gradient(closest-side,color-mix(in_oklab,var(--background)_62%,transparent),color-mix(in_oklab,var(--background)_30%,transparent)_55%,transparent)]"
        initial={{ opacity: 0 }} animate={ready ? { opacity: 1 } : undefined} transition={{ duration: 1.6, ease: EASE }} />
      <motion.h1 {...rise(0.2)} className="font-heading text-[clamp(3rem,9vmin,6.5rem)] leading-none font-semibold tracking-[-0.02em]">Haligtree</motion.h1>
      {name ? (
        // Signed in a pen's hand, as the owner writes their name inside the cover: written on left to right, a little aslant.
        // Its clip runs past the box on every side once written: a hand's loops (the y of "by", the d's tail) go past it.
        <motion.p key="kept" data-title-kept="" className="mt-2 -rotate-3 text-[clamp(1.6rem,3.6vmin,2.4rem)] leading-none text-(--mf-wl-body) [font-family:'Haligtree_Signature',cursive]"
          initial={{ clipPath: 'inset(-50% 100% -50% -15%)', opacity: 0 }} animate={ready ? { clipPath: 'inset(-50% -15% -50% -15%)', opacity: 1 } : undefined}
          transition={{ delay: 1.5, duration: 1.8, ease: [0.45, 0.05, 0.35, 1] }}>{under}</motion.p>
      ) : (
        <motion.p key="year" {...rise(1.3)} className="pl-[0.24em] text-[clamp(0.75rem,1.5vmin,0.9375rem)] tracking-[0.24em] uppercase text-(--mf-wl-body)">{under}</motion.p>
      )}
    </motion.div>
  )
}
