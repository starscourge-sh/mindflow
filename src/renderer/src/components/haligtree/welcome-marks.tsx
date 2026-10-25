import { useEffect, useId, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { still as stillNow } from '@/lib/motion'
import { stamp } from '@/lib/sound'
import { ENTER } from './welcome-reel'
import { APP_NAME } from '../../../../main/name'

/** When the seal comes down on the last page: once its headline has risen and the choices are in. */
const PRESS_MS = 1500
/** How long the press takes, and how far into it the stamp meets the paper (the thud). */
const PRESS = { duration: 0.34, contact: 0.62 }

/** A year as a book's title page sets it: MMXXVI. */
function roman(year: number): string {
  const marks: [number, string][] = [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']]
  let out = ''
  for (const [value, mark] of marks) while (year >= value) (out += mark), (year -= value)
  return out
}

/**
 * The welcome's last page, sealed: a round ink stamp, the book's name around
 * its rim and an HT in the middle, pressed once when the page has settled,
 * with a soft thud and the ink spreading a hair into the paper. In the
 * margin's red ink, set a little askew, top right, clear of the words and
 * the choices (gone on a window too narrow to keep it clear). Shown already
 * pressed when the page has been seen, under reduced motion, or after Esc or
 * a click.
 */
export function WelcomeStamp({ still }: { still: boolean }): React.JSX.Element {
  const id = useId().replace(/:/g, '')
  const [pressed, setPressed] = useState(still)
  // Settled by a key or a click before it came down: simply there, without a sound.
  const quick = useRef(still)
  useEffect(() => {
    if (still) return
    let thud: ReturnType<typeof setTimeout> | undefined
    const press = setTimeout(() => {
      setPressed(true)
      thud = setTimeout(stamp, PRESS.duration * PRESS.contact * 1000)
    }, PRESS_MS)
    const settle = (event: Event): void => {
      if (event.type === 'keydown' && (event as KeyboardEvent).key !== 'Escape') return
      if (!event.isTrusted) return
      clearTimeout(press)
      quick.current = true
      setPressed(true)
    }
    window.addEventListener('keydown', settle, true)
    window.addEventListener('pointerdown', settle, true)
    return () => {
      clearTimeout(press)
      clearTimeout(thud)
      window.removeEventListener('keydown', settle, true)
      window.removeEventListener('pointerdown', settle, true)
    }
  }, [still])
  // Settled before it pressed: the listeners above go quiet once it is down.
  const instant = quick.current || stillNow()
  const ink = 'var(--tt-color-text-red)'
  const seal = (
    <svg viewBox="0 0 100 100" className="size-full overflow-visible" style={{ filter: `url(#${id}-rough)` }}>
      <defs>
        {/* A rubber stamp's edge: never a ruler's circle, the ink a little uneven. */}
        <filter id={`${id}-rough`} x="-10%" y="-10%" width="120%" height="120%">
          <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed="7" result="grain" />
          <feDisplacementMap in="SourceGraphic" in2="grain" scale="1.8" />
        </filter>
        <path id={`${id}-rim`} d="M 50 50 m -41 0 a 41 41 0 1 1 82 0 a 41 41 0 1 1 -82 0" />
      </defs>
      <g fill="none" stroke={ink}>
        <circle cx="50" cy="50" r="47" strokeWidth="2.6" />
        <circle cx="50" cy="50" r="35" strokeWidth="1.1" />
      </g>
      <text fill={ink} fontSize="8.4" fontWeight="600" letterSpacing="1.4" style={{ fontFamily: 'var(--font-heading, "Fraunces Variable", Georgia, serif)' }}>
        <textPath href={`#${id}-rim`} textLength="250" lengthAdjust="spacing">{`${APP_NAME.toUpperCase()} · COMMONPLACE BOOK ·`}</textPath>
      </text>
      <text x="50" y="57" textAnchor="middle" fill={ink} fontSize="25" fontWeight="600" letterSpacing="-0.5" style={{ fontFamily: '"Fraunces Variable", Georgia, serif', fontVariationSettings: '"SOFT" 50, "WONK" 1' }}>HT</text>
      <text x="50" y="69" textAnchor="middle" fill={ink} fontSize="6.4" letterSpacing="1.2" style={{ fontFamily: '"Fraunces Variable", Georgia, serif' }}>{roman(new Date().getFullYear())}</text>
    </svg>
  )
  return (
    <div aria-hidden data-welcome-stamp={pressed ? 'pressed' : 'waiting'}
      className="pointer-events-none absolute top-[clamp(0.5rem,5vh,3rem)] right-[clamp(2.5rem,7vw,6rem)] z-10 size-[clamp(5.5rem,12vmin,7.5rem)] [@container(max-width:1023px)]:hidden">
      {/* The ink spreading into the paper, just after it meets it. */}
      <motion.div className="absolute inset-0 blur-[2px]" initial={false}
        animate={pressed ? { opacity: 0.16, scale: 1.04, rotate: -9 } : { opacity: 0, scale: 0.98, rotate: -9 }}
        transition={instant ? { duration: 0 } : { duration: 0.9, ease: ENTER, delay: PRESS.duration * PRESS.contact }}>
        {seal}
      </motion.div>
      <motion.div className="absolute inset-0 mix-blend-multiply dark:mix-blend-screen" initial={false}
        animate={pressed ? { opacity: [0, 0.9, 0.82], scale: [1.32, 0.97, 1], rotate: -9 } : { opacity: 0, scale: 1.32, rotate: -14 }}
        transition={instant ? { duration: 0 } : { duration: PRESS.duration, times: [0, PRESS.contact, 1], ease: ['easeIn', 'easeOut'] }}>
        {seal}
      </motion.div>
    </div>
  )
}

/**
 * A thumb index on the book's fore-edge: a small paper tab at the window's
 * right edge naming the chapter, a seventh of the way further down for each
 * chapter, so it moves to the chapter's place as the pages turn. In the
 * page's gutter, never over the words or a control, and never answering the
 * pointer.
 */
export function WelcomeTab({ chapters, at, hidden, quiet }: { chapters: string[]; /** The chapter, from 1. */ at: number; /** Under the arrival's mist. */ hidden: boolean; quiet: boolean }): React.JSX.Element | null {
  if (at < 1) return null
  return (
    <div aria-hidden data-welcome-tab={chapters[at - 1]}
      className={`pointer-events-none absolute top-11 right-0 bottom-[clamp(4rem,9vmin,5.5rem)] z-20 w-7 transition-opacity duration-1000 [@container(max-width:639px)]:hidden ${hidden ? 'opacity-0' : 'opacity-100'}`}>
      <motion.div className="flex items-center justify-end" style={{ height: `${100 / chapters.length}%` }} initial={false}
        animate={{ transform: `translateY(${(at - 1) * 100}%)` }} transition={{ duration: quiet ? 0 : 0.7, ease: ENTER }}>
        <span className="flex w-full justify-center rounded-l-[7px] border border-r-0 border-foreground/15 bg-[color-mix(in_oklab,var(--foreground)_6%,var(--background))] py-2.5 shadow-[-1px_1px_2px_color-mix(in_oklab,var(--mf-shadow-ink)_8%,transparent)]">
          <span className="relative grid [writing-mode:vertical-rl]">
            <AnimatePresence initial={false}>
              <motion.span key={at} className="text-[0.75rem] leading-none font-semibold tracking-[0.05em] whitespace-nowrap text-foreground/80 [grid-area:1/1]"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: quiet ? 0 : 0.3, ease: ENTER }}>
                {chapters[at - 1]}
              </motion.span>
            </AnimatePresence>
          </span>
        </span>
      </motion.div>
    </div>
  )
}
