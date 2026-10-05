import { useEffect, useRef, type ComponentType, type RefAttributes } from 'react'

import type { AnimatedIconHandle, AnimatedIconProps } from '@/components/ui/types'

/**
 * One of itshover's animated icons, moving when the button it sits in is
 * pointed at, not only the few pixels of the drawing itself. Still when
 * Motion is off.
 */
export function AliveIcon({ icon: Icon, size = 16, className }: {
  icon: ComponentType<AnimatedIconProps & RefAttributes<AnimatedIconHandle>>
  size?: number
  className?: string
}): React.JSX.Element {
  const handle = useRef<AnimatedIconHandle>(null)
  const box = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    const host = box.current?.closest('button, a, [role="button"]') ?? box.current?.parentElement
    if (!host) return
    const still = (): boolean => document.documentElement.dataset.motion === 'off' || matchMedia('(prefers-reduced-motion: reduce)').matches
    const start = (): void => void (!still() && handle.current?.startAnimation())
    const stop = (): void => handle.current?.stopAnimation()
    host.addEventListener('pointerenter', start)
    host.addEventListener('pointerleave', stop)
    return () => {
      host.removeEventListener('pointerenter', start)
      host.removeEventListener('pointerleave', stop)
    }
  }, [])
  return (
    <span ref={box} className={`inline-flex shrink-0 [&_svg]:cursor-[inherit] ${className ?? ''}`}>
      {/* A size class too: a small button's rule shrinks any svg without one. */}
      <Icon ref={handle} size={size} strokeWidth={2} className={size <= 12 ? 'size-3' : size <= 14 ? 'size-3.5' : 'size-4'} />
    </span>
  )
}
