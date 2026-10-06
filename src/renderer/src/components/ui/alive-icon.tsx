import { useEffect, useRef, type ComponentType, type CSSProperties, type RefAttributes } from 'react'

import type { AnimatedIconHandle, AnimatedIconProps } from '@/components/ui/types'

/**
 * One of itshover's animated icons, moving when the button it sits in is
 * pointed at, not only the few pixels of the drawing itself. Still when
 * Motion is off. Kept here rather than with Vigil's views so the editor's own
 * node views can use it too.
 */
export function AliveIcon({ icon: Icon, size = 16, className, style, play = false }: {
  icon: ComponentType<AnimatedIconProps & RefAttributes<AnimatedIconHandle>>
  size?: number
  className?: string
  /** A colour for the drawing, where the colour means something. */
  style?: CSSProperties
  /** Moves once as it arrives too, for news like a toast's mark. */
  play?: boolean
}): React.JSX.Element {
  const handle = useRef<AnimatedIconHandle>(null)
  const box = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    const host = box.current?.closest('button, a, [role="button"]') ?? box.current?.parentElement
    if (!host) return
    const still = (): boolean => document.documentElement.dataset.motion === 'off' || matchMedia('(prefers-reduced-motion: reduce)').matches
    const start = (): void => void (!still() && handle.current?.startAnimation())
    const stop = (): void => handle.current?.stopAnimation()
    if (play) start()
    host.addEventListener('pointerenter', start)
    host.addEventListener('pointerleave', stop)
    return () => {
      host.removeEventListener('pointerenter', start)
      host.removeEventListener('pointerleave', stop)
    }
  }, [])
  return (
    // The drawing takes no pointer of its own, nor any box some wrap it in:
    // its built-in hover would move it with Motion off, and the button around
    // it already starts it.
    <span ref={box} style={style} className={`inline-flex shrink-0 [&_*]:pointer-events-none ${className ?? ''}`}>
      {/* A size class too: a small button's rule shrinks any svg without one. */}
      <Icon ref={handle} size={size} strokeWidth={2} className={size <= 12 ? 'size-3' : size <= 14 ? 'size-3.5' : 'size-4'} />
    </span>
  )
}
