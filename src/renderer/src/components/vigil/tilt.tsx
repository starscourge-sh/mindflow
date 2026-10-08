import { motion, useMotionTemplate, useMotionValue, useSpring } from 'motion/react'
import { useEffect, useState, type ReactNode } from 'react'

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

/**
 * A picture tips toward the pointer while you point at it, the way a print
 * turns when you hold it to the light: a few degrees on a spring, a faint
 * sheen where the pointer is, flat again when it leaves. Only the transform
 * moves, so nothing around it shifts. Still with Motion off, for a touch,
 * mid-drag, while the page scrolls, and for a picture too small to read as
 * a thing of its own. `className` is the picture's frame: Tilt takes its place.
 */
export function Tilt({ children, className = '', by = 8 }: { children: ReactNode; className?: string; by?: number }): React.JSX.Element {
  const x = useSpring(0, spring)
  const y = useSpring(0, spring)
  const glow = useSpring(0, spring)
  // A touch larger while it tips, so a picture set flush in a card shows no
  // sliver of the card at its far edge.
  const grow = useSpring(1, spring)
  const across = useMotionValue(50)
  const down = useMotionValue(50)
  const sheen = useMotionTemplate`radial-gradient(circle at ${across}% ${down}%, rgb(255 255 255 / 0.3), transparent 60%)`
  const [flat] = useState(() => (): void => {
    x.set(0)
    y.set(0)
    glow.set(0)
    grow.set(1)
    tilted.delete(flat)
  })
  useEffect(() => flat, [flat])
  return (
    <motion.span
      className={`relative block ${className}`}
      style={{ rotateX: x, rotateY: y, scale: grow, transformPerspective: 700 }}
      onPointerMove={(event) => {
        if (event.pointerType !== 'mouse' || event.buttons || still() || performance.now() - wheeled < SETTLE) return flat()
        const box = event.currentTarget.getBoundingClientRect()
        if (box.width < SMALLEST || box.height < SMALLEST) return
        const left = (event.clientX - box.left) / box.width
        const top = (event.clientY - box.top) / box.height
        y.set((left - 0.5) * 2 * by)
        x.set(-(top - 0.5) * 2 * by)
        across.set(left * 100)
        down.set(top * 100)
        glow.set(1)
        grow.set(1.03)
        tilted.add(flat)
      }}
      onPointerLeave={flat}
    >
      {children}
      <motion.span aria-hidden className="pointer-events-none absolute inset-0 rounded-[inherit]" style={{ background: sheen, opacity: glow }} />
    </motion.span>
  )
}
