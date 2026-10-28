import { motion } from 'motion/react'
import { ARRIVE_MS } from '@/lib/sound'
import markGold from '@/assets/mark-gold-leaves.png'

/** When the window may gather in from the whole screen (main: gatherIn): only once the title card is whole and held a breath, so the two never move at once. */
export const GATHER_AT = 11000
/** When the title card lifts, clearing the way for the first words on the arrival's beat. */
export const LIFT_AT = ARRIVE_MS - 2000

const EASE = [0.22, 1, 0.36, 1] as const

/**
 * The welcome's title card, before the first words, as Arc's opening: the
 * gradient blooms first, and only once it is whole (`ready`) do the words
 * come, the wordmark and then the line under it (the year, or your name),
 * with a soft glow of the page's colour behind their letters so they read on any theme. It
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
    <motion.div aria-hidden data-title-card="" data-ready={ready ? '' : undefined} className="pointer-events-none absolute inset-0 z-40 flex flex-col items-center justify-center gap-[clamp(0.6rem,1.6vmin,1rem)] text-foreground [text-shadow:0_0_24px_color-mix(in_oklab,var(--background)_55%,transparent),0_1px_2px_color-mix(in_oklab,var(--background)_40%,transparent)]"
      initial={{ opacity: 1 }} animate={hurry ? { opacity: 0, transition: { duration: 0.4 } } : undefined}>
      <Leave order={0}>
      {/* The logo over the wordmark, rising with it a beat ahead: the book's mark, then its name. */}
      <motion.img data-title-mark src={markGold} alt="" draggable={false} {...rise(0.2)} className="mx-auto mb-[clamp(0.4rem,1.2vmin,0.75rem)] block size-[clamp(3rem,8vmin,5rem)] drop-shadow-[0_2px_10px_color-mix(in_oklab,var(--background)_45%,transparent)]" />
      <motion.h1 {...rise(0.5)} className="font-heading text-[clamp(3rem,9vmin,6.5rem)] leading-none font-semibold tracking-[-0.02em]">Haligtree</motion.h1>
      </Leave>
      <Leave order={1}>
      {name ? (
        // Signed in a pen's hand, as the owner writes their name inside the cover: written on left to right, a little aslant.
        // Its clip runs past the box on every side once written: a hand's loops (the y of "by", the d's tail) go past it.
        <motion.p key="kept" data-title-kept="" className="mt-2 -rotate-3 text-[clamp(1.6rem,3.6vmin,2.4rem)] leading-none text-(--mf-wl-body) [font-family:'Haligtree_Signature',cursive]"
          initial={{ clipPath: 'inset(-50% 100% -50% -15%)', opacity: 0 }} animate={ready ? { clipPath: 'inset(-50% -15% -50% -15%)', opacity: 1 } : undefined}
          transition={{ delay: 1.8, duration: 1.8, ease: [0.45, 0.05, 0.35, 1] }}>{under}</motion.p>
      ) : (
        <motion.p key="year" {...rise(1.6)} className="pl-[0.24em] text-[clamp(0.75rem,1.5vmin,0.9375rem)] tracking-[0.24em] uppercase text-(--mf-wl-body)">{under}</motion.p>
      )}
      </Leave>
    </motion.div>
  )
}

/** One part of the title card lifting away, in the order it came: the wordmark, then the line under it a beat later. */
function Leave({ order, className, children }: { order: number; className?: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <motion.div className={className} initial={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
      animate={{ opacity: 0, y: -18, filter: 'blur(6px)', transition: { delay: LIFT_AT / 1000 + order * 0.18, duration: 1.1, ease: [0.4, 0, 0.2, 1] } }}>
      {children}
    </motion.div>
  )
}
