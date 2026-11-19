import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type RefObject } from 'react'

/**
 * A row past its room scrolls sideways, never squashed, and the side with more to see fades out (a board's lists,
 * the shelf of books). Read on every draw (something added or renamed changes how far it reaches), on scrolling and
 * on resizing. `style` is the fade to put on the row, or nothing when it all fits.
 */
export function useSideEnds(strip: RefObject<HTMLElement | null>): { ends: { left: boolean; right: boolean }; style: CSSProperties | undefined } {
  const [ends, setEnds] = useState({ left: false, right: false })
  const readEnds = useRef(() => {})
  readEnds.current = () => {
    const box = strip.current
    if (!box) return
    const left = box.scrollLeft > 1
    const right = box.scrollLeft + box.clientWidth < box.scrollWidth - 1
    setEnds((was) => (was.left === left && was.right === right ? was : { left, right }))
  }
  useLayoutEffect(() => readEnds.current())
  useEffect(() => {
    const box = strip.current
    if (!box) return
    const read = (): void => readEnds.current()
    const watch = new ResizeObserver(read)
    watch.observe(box)
    box.addEventListener('scroll', read, { passive: true })
    return () => (watch.disconnect(), box.removeEventListener('scroll', read))
  }, [strip])
  const style = ends.left || ends.right ? { maskImage: `linear-gradient(to right, ${ends.left ? 'transparent, black 2rem' : 'black'}, ${ends.right ? 'black calc(100% - 2rem), transparent' : 'black'})` } : undefined
  return { ends, style }
}
