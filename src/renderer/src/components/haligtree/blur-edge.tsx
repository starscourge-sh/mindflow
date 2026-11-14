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
    // Its height as the browser lays it out, told by the observer (once as it starts watching, before the first
    // frame is drawn, and at each change). Read at once instead, as the page was still being made, it had the browser
    // lay the whole page out there and then: 176 ms as the largest note opened, its every block not yet put away.
    const watch = new ResizeObserver(([one]) => room.style.setProperty('--mf-dock-h', `${Math.round(one.borderBoxSize[0]?.blockSize ?? one.contentRect.height)}px`))
    room.setAttribute('data-docked', '')
    watch.observe(el, { box: 'border-box' })
    return () => {
      watch.disconnect()
      room.style.removeProperty('--mf-dock-h')
      room.removeAttribute('data-docked')
    }
  }, [bar, on])
}
