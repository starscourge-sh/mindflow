import { motion, useMotionValue, useSpring } from 'motion/react'
import type { ReactNode } from 'react'

const still = (): boolean =>
  document.documentElement.dataset.motion === 'off' || matchMedia('(prefers-reduced-motion: reduce)').matches

/**
 * Something you can pick up leans away from the pointer, the way a print
 * tilts when you press near one edge: a few degrees on a soft spring, flat
 * again when the pointer leaves. Still with Motion off, and for a touch.
 */
export function Lean({ children, by = 6, className = '', inner = '' }: { children: ReactNode; by?: number; className?: string; inner?: string }): React.JSX.Element {
  const x = useSpring(useMotionValue(0), { stiffness: 220, damping: 22 })
  const y = useSpring(useMotionValue(0), { stiffness: 220, damping: 22 })
  return (
    <div className={className} style={{ perspective: 900 }}>
      <motion.div
        className={`relative size-full ${inner}`}
        style={{ rotateX: x, rotateY: y }}
        onPointerMove={(event) => {
          if (event.pointerType !== 'mouse' || still()) return
          const box = event.currentTarget.getBoundingClientRect()
          y.set(-((event.clientX - box.left) / box.width - 0.5) * by)
          x.set(((event.clientY - box.top) / box.height - 0.5) * by)
        }}
        onPointerLeave={() => (x.set(0), y.set(0))}
      >
        {children}
      </motion.div>
    </div>
  )
}
