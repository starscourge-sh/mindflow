import { useRef, useState, type ReactNode, type Ref } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/cn'
import { EASE } from '@/lib/motion'
import { chime } from '@/lib/sound'
import { Tip } from './ui'

/** How long a hold takes to go through. */
const HOLD_MS = 1200
const still = (): boolean => document.documentElement.dataset.motion === 'off' || matchMedia('(prefers-reduced-motion: reduce)').matches
const keyed = (key: string): boolean => key === ' ' || key === 'Enter'

/**
 * For the few things Vigil cannot undo: held, never clicked. A red wash
 * sweeps across while you hold; let go early and it runs straight back. Held
 * to the end, its words change to say it is happening, and `onHold` runs.
 * Space or Return held on it does the same. With Motion off the wash still
 * sweeps, since it says how long is left, but the words simply change.
 */
export function HoldButton({ onHold, hint, done, cue = null, variant = 'outline', size = 'sm', className, disabled, ref, children }: {
  onHold: () => void
  /** Said in its tip, plainly: "Hold to reset". */
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
  // As far across as the wash is now, mid-sweep or not.
  const at = (): number => (fill.current ? new DOMMatrixReadOnly(getComputedStyle(fill.current).transform).a : 0)
  // Played by the page rather than CSS, so Motion off (which stops every
  // transition) still shows how long is left.
  const sweep = (to: number, ms: number, easing: string): Animation | undefined => {
    const from = at()
    run.current?.cancel()
    run.current = fill.current?.animate([{ transform: `scaleX(${from})` }, { transform: `scaleX(${to})` }], { duration: ms, easing, fill: 'forwards' }) ?? null
    return run.current ?? undefined
  }
  const start = (): void => {
    if (held || disabled) return
    void sweep(1, HOLD_MS * (1 - at()), 'linear')?.finished.then(() => {
      setHeld(true)
      if (cue) chime(cue)
      onHold()
    }, () => undefined)
  }
  // Let go early: back, quickly, so it reads as called off.
  const stop = (): void => void (!held && run.current && sweep(0, still() ? 0 : 200, 'cubic-bezier(0.23, 1, 0.32, 1)'))
  const swap = still() ? {} : { initial: { opacity: 0, filter: 'blur(3px)' }, animate: { opacity: 1, filter: 'blur(0px)' }, exit: { opacity: 0, filter: 'blur(3px)', transition: { duration: 0.1 } }, transition: { duration: 0.18, ease: EASE } }
  return (
    <Tip label={hint}>
      <button
        ref={ref}
        type="button"
        disabled={disabled}
        aria-disabled={held || undefined}
        onPointerDown={(event) => event.button === 0 && start()}
        onPointerUp={stop}
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
        onKeyUp={(event) => keyed(event.key) && stop()}
        className={cn(variant && buttonVariants({ variant, size }), 'relative overflow-hidden', className)}
      >
        <span ref={fill} aria-hidden style={{ transform: 'scaleX(0)' }} className="pointer-events-none absolute inset-0 origin-left bg-[color-mix(in_srgb,var(--tt-color-text-red)_24%,transparent)]" />
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.span key={held ? 'done' : 'rest'} {...swap} className="relative inline-flex items-center gap-[inherit]">
            {held ? done : children}
          </motion.span>
        </AnimatePresence>
      </button>
    </Tip>
  )
}
