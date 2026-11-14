import { useLayoutEffect, useRef, type ReactNode } from 'react'
import { motion, useAnimationControls } from 'motion/react'
import { ARRIVE_MS, sayName } from '@/lib/sound'
import markGold from '@/assets/mark-gold-leaves.png'

/** When the window may gather in from the whole screen (main: gatherIn): only once the title card is whole and held a breath, so the two never move at once. */
export const GATHER_AT = 11000
/** When the title card lifts, clearing the way for the first words on the arrival's beat. */
const LIFT_AT = ARRIVE_MS - 2000

const EASE = [0.22, 1, 0.36, 1] as const
const curve = (points: readonly number[]): string => `cubic-bezier(${points.join(',')})`

/**
 * Each line rises a little into place as it comes into focus, on transform and opacity alone, which the browser plays
 * on the compositor as it does the arrival's spark (welcome.tsx IntroSpark): an animated blur is not, and with motion's
 * `y` stepped by the page's own frames, the rise missed frames whenever the page was busy as the title came. The soft
 * focus is kept: under the line, a copy of it blurred once (never animated) fades in and out again as the sharp line
 * fades in over it, the two rising as one.
 */
const UP: Keyframe[] = [{ transform: 'translateY(14px)' }, { transform: 'translateY(0px)' }]
const SHARP: Keyframe[] = [{ opacity: 0 }, { opacity: 0, offset: 0.15 }, { opacity: 1 }]
const SOFT: Keyframe[] = [{ opacity: 0 }, { opacity: 0.55, offset: 0.3 }, { opacity: 0 }]
/** Lifting away, a little up as it fades: an exit, plainer than the rise. */
const LIFT: Keyframe[] = [{ opacity: 1, transform: 'translateY(0px)' }, { opacity: 0, transform: 'translateY(-18px)' }]

/** `frames` played on the element by the browser once `on`, as `timing` says, holding where they end; `onDone` once they have. */
function usePlayed<T extends HTMLElement>(frames: Keyframe[], on: boolean, timing: { delay: number; duration: number; easing: string }, onDone?: () => void): React.RefObject<T | null> {
  const el = useRef<T>(null)
  const done = useRef(onDone)
  done.current = onDone
  useLayoutEffect(() => {
    if (!on) return
    const run = el.current?.animate(frames, { ...timing, fill: 'both' })
    if (run) run.onfinish = () => done.current?.()
    return () => run?.cancel()
  }, [on]) // eslint-disable-line react-hooks/exhaustive-deps
  return el
}

/**
 * One line of the card rising into focus once `ready`, `delay` seconds after: `soft` is the same line, drawn blurred under
 * it; `children` draws the line itself, on the ref it is given, in the grid's one cell (`IN_CELL`), unseen to start (`UNSEEN`).
 */
function Rise({ ready, delay, soft, onDone, children }: { ready: boolean; delay: number; soft: ReactNode; onDone?: () => void; children: (line: (el: HTMLElement | null) => void) => ReactNode }): React.JSX.Element {
  const timing = { delay: delay * 1000, duration: 1400, easing: curve(EASE) }
  const box = usePlayed<HTMLDivElement>(UP, ready, timing)
  const under = usePlayed<HTMLDivElement>(SOFT, ready, timing)
  const line = usePlayed<HTMLElement>(SHARP, ready, timing, onDone)
  // Held where the rise starts until it is played: nothing shows before.
  return (
    <div ref={box} data-title-rise="" className="grid justify-items-center" style={{ transform: 'translateY(14px)' }}>
      <div ref={under} aria-hidden className={`pointer-events-none blur-[8px] ${IN_CELL}`} style={UNSEEN}>{soft}</div>
      {children((el) => void (line.current = el))}
    </div>
  )
}
const IN_CELL = 'col-start-1 row-start-1'
const UNSEEN = { opacity: 0 }

const MARK = 'mx-auto mb-[clamp(0.4rem,1.2vmin,0.75rem)] block size-[clamp(3rem,8vmin,5rem)] drop-shadow-[0_2px_10px_color-mix(in_oklab,var(--background)_45%,transparent)]'
const NAME = 'font-heading text-[clamp(3rem,9vmin,6.5rem)] leading-none font-semibold tracking-[-0.02em] select-none'
const YEAR = 'pl-[0.24em] text-[clamp(0.75rem,1.5vmin,0.9375rem)] tracking-[0.24em] uppercase text-(--mf-wl-body)'

/**
 * The welcome's title card, before the first words, as Arc's opening: the
 * gradient blooms first, and only once it is whole (`ready`) do the words
 * come, the wordmark and then the line under it (the year, or your name),
 * with a soft glow of the page's colour behind their letters so they read on any theme. It
 * lifts away before the first words; `hurry` takes it at once. `onWritten` once the line under the name is whole
 * (written in its hand, or risen): the arrival out of the desktop then shapes its scene into the window (welcome.tsx).
 */
export function WelcomeTitle({ name, hurry = false, ready = true, onWritten }: { name: string; hurry?: boolean; ready?: boolean; onWritten?: () => void }): React.JSX.Element {
  // What it is and whose, as a title page says it: "A commonplace book kept by Reed"; with no name to be read, "A commonplace book".
  const said = useAnimationControls()
  const under = name ? `A commonplace book kept by ${name}` : 'A commonplace book'
  return (
    <motion.div aria-hidden data-title-card="" data-ready={ready ? '' : undefined} className="pointer-events-none absolute inset-0 z-40 flex flex-col items-center justify-center gap-[clamp(0.6rem,1.6vmin,1rem)] text-foreground [text-shadow:0_0_24px_color-mix(in_oklab,var(--background)_55%,transparent),0_1px_2px_color-mix(in_oklab,var(--background)_40%,transparent)]"
      initial={{ opacity: 1 }} animate={hurry ? { opacity: 0, transition: { duration: 0.4 } } : undefined}>
      <Leave order={0}>
      {/* The logo over the wordmark, rising with it a beat ahead: the book's mark, then its name. Each rises out of a soft focus (Rise). */}
      <Rise ready={ready} delay={0.2} soft={<img src={markGold} alt="" draggable={false} className={MARK} />}>
        {(line) => <img ref={line} data-title-mark src={markGold} alt="" draggable={false} style={UNSEEN} className={`${IN_CELL} ${MARK}`} />}
      </Rise>
      {/* An easter egg: clicked, the name is said aloud, with a little bounce. The card is otherwise out of the pointer's way. */}
      <Rise ready={ready} delay={0.5} soft={<div className={NAME}>Haligtree</div>}>
        {(line) => <h1 ref={line} data-title-name style={UNSEEN} onClick={() => (sayName(), void said.start({ scale: [1, 1.06, 0.98, 1], transition: { duration: 0.5, ease: EASE } }))} className={`pointer-events-auto cursor-pointer ${IN_CELL} ${NAME}`}><motion.span className="inline-block" animate={said}>Haligtree</motion.span></h1>}
      </Rise>
      </Leave>
      <Leave order={1}>
      {name ? (
        // Signed in a pen's hand, as the owner writes their name inside the cover: written on left to right, a little aslant.
        // Its clip runs past the box on every side once written: a hand's loops (the y of "by", the d's tail) go past it.
        <motion.p key="kept" data-title-kept="" className="mt-2 -rotate-3 text-[clamp(1.6rem,3.6vmin,2.4rem)] leading-none text-(--mf-wl-body) [font-family:'Haligtree_Signature',cursive]"
          initial={{ clipPath: 'inset(-50% 100% -50% -15%)', opacity: 0 }} animate={ready ? { clipPath: 'inset(-50% -15% -50% -15%)', opacity: 1 } : undefined}
          transition={{ delay: 1.8, duration: 1.8, ease: [0.45, 0.05, 0.35, 1] }} onAnimationComplete={() => ready && onWritten?.()}>{under}</motion.p>
      ) : (
        <Rise key="year" ready={ready} delay={1.6} onDone={onWritten} soft={<div className={YEAR}>{under}</div>}>
          {(line) => <p ref={line} style={UNSEEN} className={`${IN_CELL} ${YEAR}`}>{under}</p>}
        </Rise>
      )}
      </Leave>
    </motion.div>
  )
}

/** One part of the title card lifting away, in the order it came: the wordmark, then the line under it a beat later. */
function Leave({ order, children }: { order: number; children: ReactNode }): React.JSX.Element {
  const el = usePlayed<HTMLDivElement>(LIFT, true, { delay: LIFT_AT + order * 180, duration: 1100, easing: curve([0.4, 0, 0.2, 1]) })
  return <div ref={el}>{children}</div>
}
