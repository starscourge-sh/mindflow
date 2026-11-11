import { useLayoutEffect, type RefObject } from 'react'
import { cn } from '@/lib/cn'

/**
 * The soft blur along a foot (main.css .mf-blur-edge): four layers, each blurring more over less of the band. With
 * `bar` it sits under a bar at a view's foot, as tall as the bar and its fade above it, so what scrolls under the bar
 * blurs out and never runs sharp into it. Only where nothing round it fades, masks or filters for good: there a
 * backdrop blur sees nothing (qa/foot-blur.mjs looks at each one's parents).
 */
export function BlurEdge({ bar, hide, className }: { bar?: boolean; /** Faded out (a bar that comes and goes): its layers fade, never the edge itself. */ hide?: boolean; className?: string }): React.JSX.Element {
  return (
    <span aria-hidden data-hide={hide || undefined} className={cn('mf-blur-edge', bar && 'mf-blur-bar', className)}>
      <span />
      <span />
      <span />
      <span />
    </span>
  )
}

/**
 * A bar floated over its scroller's foot: its height kept on its parent as --mf-dock-h (and the parent marked
 * data-docked), so the bar can lift itself over the words by that much and the scroller keep that much room after
 * its last line, whatever the bar holds (a thought written over several lines grows it). `on` false takes both away.
 */
export function useDockRoom(bar: RefObject<HTMLElement | null>, on = true): void {
  useLayoutEffect(() => {
    const el = bar.current
    const room = el?.parentElement
    if (!on || !el || !room) return
    const set = (): void => room.style.setProperty('--mf-dock-h', `${el.offsetHeight}px`)
    set()
    room.setAttribute('data-docked', '')
    const watch = new ResizeObserver(set)
    watch.observe(el)
    return () => {
      watch.disconnect()
      room.style.removeProperty('--mf-dock-h')
      room.removeAttribute('data-docked')
    }
  }, [bar, on])
}
