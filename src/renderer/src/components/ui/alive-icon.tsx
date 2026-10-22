import { useEffect, useRef, type ComponentType, type CSSProperties, type RefAttributes } from 'react'
import type { LucideIcon, LucideProps } from 'lucide-react'

import type { AnimatedIconHandle, AnimatedIconProps } from '@/components/ui/types'
import { still } from '@/lib/motion'

/**
 * One of itshover's animated icons, moving when the button it sits in is
 * pointed at, not only the few pixels of the drawing itself. Still when
 * Motion is off. Kept here rather than with Haligtree's views so the editor's own
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
    const start = (): void => void (!still() && settle(handle.current?.startAnimation()))
    const stop = (): void => settle(handle.current?.stopAnimation())
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

/**
 * A drawing's move, let finish however it ends: one whose button went away
 * mid-move (a card or menu closing under the pointer) has nothing left to
 * draw on, and that is no error.
 */
const settle = (move: unknown): void => void Promise.resolve(move).catch(() => undefined)

type Drawing = ComponentType<AnimatedIconProps & RefAttributes<AnimatedIconHandle>>

/** Starts a drawing when the control it sits in is pointed at; still with Motion off. */
function useAlive(box: React.RefObject<HTMLElement | null>, handle: React.RefObject<AnimatedIconHandle | null>): void {
  useEffect(() => {
    const host = box.current?.closest('button, a, [role="button"], [role="menuitem"], [role="tab"], label') ?? box.current?.parentElement
    if (!host) return
    const start = (): void => void (!still() && settle(handle.current?.startAnimation()))
    const stop = (): void => settle(handle.current?.stopAnimation())
    host.addEventListener('pointerenter', start)
    host.addEventListener('pointerleave', stop)
    return () => {
      host.removeEventListener('pointerenter', start)
      host.removeEventListener('pointerleave', stop)
    }
  }, [])
}

/**
 * An itshover drawing that stands in for a lucide icon: same props, so a file
 * swaps its import and nothing else. The wrapper takes no box of its own, so
 * the drawing's classes lay out just as lucide's did. `turn` faces it another
 * way, as a left chevron from the right one. Some drawings sit in a box of
 * their own; their svg takes its size, so a size class sizes the drawing.
 */
export function alive(Icon: Drawing, turn = ''): LucideIcon {
  function Alive({ className, size, style, strokeWidth, color, 'aria-label': label }: LucideProps): React.JSX.Element {
    const handle = useRef<AnimatedIconHandle>(null)
    const box = useRef<HTMLSpanElement>(null)
    useAlive(box, handle)
    return (
      // The drawings take no style of their own; a colour set here still reaches them.
      <span ref={box} style={style} className="contents [&_*]:pointer-events-none">
        <Icon ref={handle} size={size ?? 24} strokeWidth={Number(strokeWidth ?? 2)} color={color} className={`shrink-0 align-middle ${turn} ${className ?? ''}`} aria-hidden />
        {label && <span className="sr-only">{label}</span>}
      </span>
    )
  }
  Alive.displayName = `Alive(${Icon.displayName ?? 'Icon'})`
  return Alive as unknown as LucideIcon
}
