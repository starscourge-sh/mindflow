import { useEffect, useRef, useState, type ReactNode, type Ref } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'motion/react'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/cn'
import { EASE, still } from '@/lib/motion'
import { chime, holding } from '@/lib/sound'
import { Tip } from './ui'

/** How long a hold takes to go through. */
const HOLD_MS = 1200
/** How long the "hold it" note stays after a plain click. */
const NOTE_MS = 3000
const keyed = (key: string): boolean => key === ' ' || key === 'Enter'

/**
 * For the few things Haligtree cannot undo: held, never clicked. A red wash
 * sweeps across while you hold; let go early and it runs straight back. Held
 * to the end, its words change to say it is happening, and `onHold` runs.
 * It is heard too: a tone climbs while you hold, settles bright when it goes
 * through, and sinks away if you let go early.
 * Space or Return held on it does the same. With Motion off the wash still
 * sweeps, since it says how long is left, but the words simply change.
 *
 * Its words say so on its face ("Hold to reset"), so the one thing to know
 * is never only in a tip. Clicked rather than held, it gives a quick shake and
 * "Keep holding until it fills" springs in under it for a few seconds, so a
 * click that seemed to do nothing explains itself.
 */
export function HoldButton({ onHold, hint, done, cue = null, variant = 'outline', size = 'sm', className, disabled, ref, children }: {
  onHold: () => void
  /** Said in its tip: what holding it does. */
  hint: string
  /** Its words once held: "Resetting…". */
  done: ReactNode
  /** Heard once held; none when what it starts has a sound of its own. */
  cue?: Parameters<typeof chime>[0] | null
  /** One of the app's button looks, or none for a control styled its own way (the sandbox pill). */
  variant?: 'outline' | 'ghost' | 'destructive' | null
  size?: 'sm' | 'default'
  className?: string
  disabled?: boolean
  ref?: Ref<HTMLButtonElement>
  children: ReactNode
}): React.JSX.Element {
  const fill = useRef<HTMLSpanElement>(null)
  const run = useRef<Animation | null>(null)
  const [held, setHeld] = useState(false)
  const button = useRef<HTMLButtonElement | null>(null)
  const pressed = useRef(0)
  // The rising tone while it is held, and how to end it.
  const tone = useRef<((how: 'done' | 'early') => void) | null>(null)
  const hush = (how: 'done' | 'early'): void => {
    tone.current?.(how)
    tone.current = null
  }
  useEffect(() => () => hush('early'), [])
  // Where to show the note after a plain click, and when it was asked for (a new click starts it again).
  const [note, setNote] = useState<{ x: number; y: number; at: number } | null>(null)
  useEffect(() => {
    if (!note) return
    const done = setTimeout(() => setNote(null), NOTE_MS)
    const away = (): void => setNote(null)
    window.addEventListener('scroll', away, true)
    window.addEventListener('resize', away)
    return () => (clearTimeout(done), window.removeEventListener('scroll', away, true), window.removeEventListener('resize', away))
  }, [note])
  // Let go too soon: shake once and say how it works.
  const nudge = (): void => {
    const el = button.current
    if (!el) return
    const box = el.getBoundingClientRect()
    // Kept inside the window: about 200px wide, centred under the button unless an edge is near; above it near the foot.
    setNote({ x: Math.min(Math.max(box.left + box.width / 2, 108), window.innerWidth - 108), y: box.bottom + 44 > window.innerHeight ? box.top - 38 : box.bottom + 8, at: performance.now() })
    if (!still()) el.animate([0, -4, 4, -3, 3, -1, 0].map((x) => ({ translate: `${x}px 0` })), { duration: 300, easing: 'ease-out' })
  }
  // As far across as the wash is now, mid-sweep or not.
  const at = (): number => (fill.current ? new DOMMatrixReadOnly(getComputedStyle(fill.current).transform).a : 0)
  // Played by the page rather than CSS, so Motion off (which stops every
  // transition) still shows how long is left.
  const sweep = (to: number, ms: number, easing: string): Animation | undefined => {
    // A press shows at once: the wash starts a sliver in, not from nothing.
    const from = to === 1 ? Math.max(at(), 0.06) : at()
    run.current?.cancel()
    run.current = fill.current?.animate([{ transform: `scaleX(${from})` }, { transform: `scaleX(${to})` }], { duration: ms, easing, fill: 'forwards' }) ?? null
    return run.current ?? undefined
  }
  const start = (): void => {
    if (held || disabled) return
    pressed.current = performance.now()
    const left = HOLD_MS * (1 - at())
    hush('early')
    tone.current = holding(left)
    void sweep(1, left, 'linear')?.finished.then(() => {
      setHeld(true)
      hush('done')
      if (cue) chime(cue)
      onHold()
    }, () => undefined)
  }
  // Let go early: back, quickly, so it reads as called off.
  const stop = (): void => {
    if (held || !run.current) return
    hush('early')
    sweep(0, still() ? 0 : 200, 'cubic-bezier(0.23, 1, 0.32, 1)')
  }
  // A release, not a pointer wandering off: too soon is a click, and gets the note.
  const release = (): void => {
    const early = !held && !disabled && pressed.current > 0 && performance.now() - pressed.current < HOLD_MS - 50
    pressed.current = 0
    stop()
    if (early) nudge()
  }
  const swap = still() ? {} : { initial: { opacity: 0, filter: 'blur(3px)' }, animate: { opacity: 1, filter: 'blur(0px)' }, exit: { opacity: 0, filter: 'blur(3px)', transition: { duration: 0.1 } }, transition: { duration: 0.18, ease: EASE } }
  return (
    <>
    <Tip label={hint}>
      <button
        ref={(el) => {
          button.current = el
          if (typeof ref === 'function') ref(el)
          else if (ref) ref.current = el
        }}
        type="button"
        disabled={disabled}
        aria-disabled={held || undefined}
        onPointerDown={(event) => event.button === 0 && start()}
        onPointerUp={release}
        onPointerLeave={stop}
        onPointerCancel={stop}
        onBlur={stop}
        onKeyDown={(event) => {
          if (!keyed(event.key)) return
          // Not a click, and not for the page's own keys: only the hold counts.
          event.preventDefault()
          event.stopPropagation()
          if (!event.repeat) start()
        }}
        onKeyUp={(event) => keyed(event.key) && release()}
        className={cn(variant && buttonVariants({ variant, size }), 'relative overflow-hidden', className)}
      >
        <span ref={fill} aria-hidden style={{ transform: 'scaleX(0)' }} className="pointer-events-none absolute inset-0 origin-left bg-[color-mix(in_srgb,var(--tt-color-text-red)_30%,transparent)]" />
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.span key={held ? 'done' : 'rest'} {...swap} className="relative inline-flex items-center gap-[inherit]">
            {held ? done : children}
          </motion.span>
        </AnimatePresence>
      </button>
    </Tip>
    {createPortal(
      <AnimatePresence>
        {note && (
          <motion.span key={note.at} role="status"
            className="pointer-events-none fixed z-[100] -translate-x-1/2 rounded-md border bg-popover px-2.5 py-1.5 text-xs font-medium whitespace-nowrap text-popover-foreground shadow-md"
            style={{ left: note.x, top: note.y }}
            initial={still() ? { opacity: 0 } : { opacity: 0, y: -10, scale: 0.92 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.15 } }}
            transition={still() ? { duration: 0.12 } : { type: 'spring', stiffness: 520, damping: 26 }}>
            Keep holding until it fills
          </motion.span>
        )}
      </AnimatePresence>,
      document.body
    )}
    </>
  )
}
