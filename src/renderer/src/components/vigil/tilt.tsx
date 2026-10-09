import { AnimatePresence, motion, useMotionTemplate, useMotionValue, useSpring, type MotionValue } from 'motion/react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

const still = (): boolean =>
  document.documentElement.dataset.motion === 'off' || matchMedia('(prefers-reduced-motion: reduce)').matches

// Smaller than this, a picture is an icon, not a thing you could pick up.
const SMALLEST = 56
// The wheel turned this recently: the page is moving under the pointer, so
// nothing tilts, and whatever was tilted lies flat at once.
const SETTLE = 200
let wheeled = 0
const tilted = new Set<() => void>()
addEventListener('wheel', () => {
  wheeled = performance.now()
  tilted.forEach((flat) => flat())
}, { capture: true, passive: true })

const spring = { stiffness: 260, damping: 24 }

/** How a pointer event reads to a tilt: only what it needs, so a plain DOM listener can pass one too. */
type Pointing = { clientX: number; clientY: number; pointerType: string; buttons: number }

/**
 * A picture's lean toward the pointer: its springs, and `lean` to aim them at
 * where the pointer is over `el` (false when it should lie flat instead:
 * a touch, mid-drag, Motion off, the page scrolling, too small to be a thing).
 * `flat` lays it down and is also called when the wheel turns.
 */
export function useTilt(by: number, lift = 1.03): {
  x: MotionValue<number>; y: MotionValue<number>; grow: MotionValue<number>; glow: MotionValue<number>; sheen: MotionValue<string>
  lean: (event: Pointing, el: Element) => boolean; flat: () => void; onFlat: (then: () => void) => void
} {
  const x = useSpring(0, spring)
  const y = useSpring(0, spring)
  const glow = useSpring(0, spring)
  // A touch larger while it tips, so a picture set flush in a card shows no
  // sliver of the card at its far edge.
  const grow = useSpring(1, spring)
  const across = useMotionValue(50)
  const down = useMotionValue(50)
  const sheen = useMotionTemplate`radial-gradient(circle at ${across}% ${down}%, rgb(255 255 255 / 0.3), transparent 60%)`
  const also = useRef<(() => void) | null>(null)
  const [flat] = useState(() => (): void => {
    x.set(0)
    y.set(0)
    glow.set(0)
    grow.set(1)
    tilted.delete(flat)
    also.current?.()
  })
  useEffect(() => flat, [flat])
  const lean = (event: Pointing, el: Element): boolean => {
    if (event.pointerType !== 'mouse' || event.buttons || still() || performance.now() - wheeled < SETTLE) return flat(), false
    const box = el.getBoundingClientRect()
    if (box.width < SMALLEST || box.height < SMALLEST) return false
    const left = (event.clientX - box.left) / box.width
    const top = (event.clientY - box.top) / box.height
    y.set((left - 0.5) * 2 * by)
    x.set(-(top - 0.5) * 2 * by)
    across.set(left * 100)
    down.set(top * 100)
    glow.set(1)
    grow.set(lift)
    tilted.add(flat)
    return true
  }
  return { x, y, grow, glow, sheen, lean, flat, onFlat: (then) => void (also.current = then) }
}

const LABEL = 'pointer-events-none fixed top-0 left-0 z-50 rounded-md border bg-popover px-2 py-1 text-xs text-popover-foreground shadow-md'
// One line cut short for a card's title; up to three whole lines for a caption.
const LINE = 'max-w-60 truncate'
const LINES = 'w-max max-w-[280px] line-clamp-3 break-words leading-snug'
const GAP = { x: 14, y: 16 }

/**
 * A name that rides beside the pointer and swings a little with how fast it
 * moves, then settles, as in reactbits' Tilted Card. `follow` moves it there
 * and shows it, kept inside `within` when given (to the pointer's left near
 * its right edge, above near its foot); `hide` lets it fade; `label` is what
 * to render, anywhere. `wrap` gives a caption up to three lines; `measure`
 * says whether its words fit in them.
 */
export function useFollowLabel({ wrap = false, most = 12 }: { wrap?: boolean; /** The furthest it swings, in degrees. */ most?: number } = {}): {
  follow: (clientX: number, clientY: number, within?: DOMRect) => void
  hide: () => void
  label: (text?: string | null) => ReactNode
  measure: (text: string) => { width: number; height: number; whole: boolean }
} {
  const [showing, setShowing] = useState(false)
  const at = { x: useSpring(0, { stiffness: 500, damping: 40 }), y: useSpring(0, { stiffness: 500, damping: 40 }) }
  const swing = useSpring(0, { stiffness: 350, damping: 30 })
  const lastX = useRef<number | null>(null)
  const settle = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const size = useRef({ width: 0, height: 0 })
  const sizes = useRef(new Map<string, { width: number; height: number; whole: boolean }>())
  const className = `${LABEL} ${wrap ? LINES : LINE}`
  // Read once for each text, off screen: then it can be placed before it is drawn.
  const measure = (text: string): { width: number; height: number; whole: boolean } => {
    let found = sizes.current.get(text)
    if (!found) {
      const probe = document.createElement('span')
      probe.className = className
      probe.style.visibility = 'hidden'
      probe.textContent = text
      document.body.append(probe)
      const box = probe.getBoundingClientRect()
      found = { width: box.width, height: box.height, whole: probe.scrollHeight <= probe.clientHeight + 1 && probe.scrollWidth <= probe.clientWidth + 1 }
      probe.remove()
      sizes.current.set(text, found)
    }
    size.current = found
    return found
  }
  const follow = (clientX: number, clientY: number, within?: DOMRect): void => {
    const { width, height } = size.current
    let x = clientX + GAP.x
    let y = clientY + GAP.y
    if (within) {
      if (x + width > within.right) x = clientX - GAP.x - width
      if (y + height > within.bottom) y = clientY - GAP.y - height
      x = Math.max(within.left, Math.min(x, within.right - width))
      y = Math.max(within.top, Math.min(y, within.bottom - height))
    }
    // Placed at once the first time, so it never flies in from the corner.
    if (lastX.current === null) {
      at.x.jump(x)
      at.y.jump(y)
    }
    at.x.set(x)
    at.y.set(y)
    swing.set(lastX.current === null ? 0 : Math.max(-most, Math.min(most, (clientX - lastX.current) * 0.8 * (most / 12))))
    lastX.current = clientX
    // Upright again once the pointer rests, the way a hanging tag stops swinging.
    clearTimeout(settle.current)
    settle.current = setTimeout(() => swing.set(0), 90)
    setShowing(true)
  }
  const hide = (): void => {
    clearTimeout(settle.current)
    setShowing(false)
    lastX.current = null
  }
  const label = (text?: string | null): ReactNode =>
    text
      ? createPortal(
          <AnimatePresence>
            {showing && (
              <motion.span aria-hidden key="caption"
                className={className}
                style={{ x: at.x, y: at.y, rotate: swing }}
                initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, transition: { duration: 0.08 } }}
                transition={{ duration: 0.16, ease: [0.23, 1, 0.32, 1] }}>
                {text}
              </motion.span>
            )}
          </AnimatePresence>,
          document.body
        )
      : null
  return { follow, hide, label, measure }
}

/**
 * A picture tips toward the pointer while you point at it, the way a print
 * turns when you hold it to the light: a few degrees on a spring, a faint
 * sheen where the pointer is, flat again when it leaves. Only the transform
 * moves, so nothing around it shifts. Still with Motion off, for a touch,
 * mid-drag, while the page scrolls, and for a picture too small to read as
 * a thing of its own. `className` is the picture's frame: Tilt takes its place.
 */
export function Tilt({ children, className = '', by = 8, caption }: { children: ReactNode; className?: string; by?: number; /** Its name, carried beside the pointer while you point at it. */ caption?: string }): React.JSX.Element {
  // The caption rides with the pointer: the picture's name without a label under every tile.
  const tilt = useTilt(by)
  const name = useFollowLabel()
  tilt.onFlat(name.hide)
  return (
    <motion.span
      className={`relative block ${className}`}
      style={{ rotateX: tilt.x, rotateY: tilt.y, scale: tilt.grow, transformPerspective: 700 }}
      onPointerMove={(event) => {
        if (tilt.lean(event, event.currentTarget) && caption) name.follow(event.clientX, event.clientY)
      }}
      onPointerLeave={tilt.flat}
    >
      {children}
      <motion.span aria-hidden className="pointer-events-none absolute inset-0 rounded-[inherit]" style={{ background: tilt.sheen, opacity: tilt.glow }} />
      {name.label(caption)}
    </motion.span>
  )
}
