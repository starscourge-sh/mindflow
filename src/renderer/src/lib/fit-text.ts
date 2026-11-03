import { useLayoutEffect, type RefObject } from 'react'

/**
 * Words that shrink to fit their box: the font size stepped down from `most` to `least` pixels, a pixel at a time,
 * until nothing runs past the box (`across` for a one-line field, `down` for lines clamped to a height). Measured again
 * whenever the words change and once the page's fonts have loaded, since a font still loading measures wrong.
 */
export function useFitText(ref: RefObject<HTMLElement | null>, words: string, { most, least, way }: { most: number; least: number; way: 'across' | 'down' }): void {
  useLayoutEffect(() => {
    const fit = (): void => {
      const el = ref.current
      if (!el) return
      const over = (): boolean => (way === 'across' ? el.scrollWidth > el.clientWidth + 1 : el.scrollHeight > el.clientHeight + 3)
      let size = most
      el.style.fontSize = `${size}px`
      while (size > least && over()) el.style.fontSize = `${--size}px`
    }
    fit()
    let live = true
    void document.fonts?.ready.then(() => live && fit())
    return () => void (live = false)
  }, [ref, words, most, least, way])
}
