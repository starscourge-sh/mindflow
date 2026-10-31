import { useLayoutEffect, useState } from 'react'

/**
 * The middle of what a floating pill acts on (the note it writes into), in
 * the window's pixels, kept as the page changes size: a pill sits centred on
 * its note, never on the whole window, where a list or a panel beside the
 * note pulled it off to one side. Null without one (the window's middle then).
 */
export function useCentreOn(over: HTMLElement | null | undefined): number | null {
  const [middle, setMiddle] = useState<number | null>(null)
  useLayoutEffect(() => {
    if (!over) return setMiddle(null)
    const place = (): void => {
      const box = over.getBoundingClientRect()
      if (box.width) setMiddle(Math.round(box.left + box.width / 2))
    }
    place()
    const watch = new ResizeObserver(place)
    watch.observe(over)
    window.addEventListener('resize', place)
    return () => (watch.disconnect(), window.removeEventListener('resize', place))
  }, [over])
  return middle
}
