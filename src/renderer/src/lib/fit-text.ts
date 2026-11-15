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

/**
 * A picture that fits the room it has, as words do above: drawn at its own size wherever its room holds it, and zoomed
 * down (never up, never under `least`) by as much as its room runs over, so a short window, a longer story or a line
 * said for you above it never runs the page under what is below it. `room` is a column (flex, top to bottom) that
 * must not run over, `picture` one of the things in it that gives way. How far the room runs over is read from the
 * boxes that take its room, laid end to end with its gaps and padding: never from what hangs past them (a chart's
 * label placed from the last size, a line still rising in), which would zoom the picture for an overflow zoom cannot
 * take back. Zoom keeps the picture's place and draws what is in it smaller, so it gives back as much height as the
 * room is short of. Measured at its own size each time either changes size (a window made smaller, fonts come in,
 * words typed into it), so the zoom never feeds on itself.
 */
export function useFitPicture(picture: RefObject<HTMLElement | null>, room: RefObject<HTMLElement | null>, least = 0.7): void {
  useLayoutEffect(() => {
    const pic = picture.current
    const box = room.current
    if (!pic || !box) return
    const px = (value: string): number => parseFloat(value) || 0
    const fit = (): void => {
      pic.style.zoom = ''
      const look = getComputedStyle(box)
      const parts = [...box.children].filter((el): el is HTMLElement => el instanceof HTMLElement && getComputedStyle(el).position !== 'absolute')
      const taken = parts.reduce((sum, el) => sum + el.offsetHeight + px(getComputedStyle(el).marginTop) + px(getComputedStyle(el).marginBottom), 0)
      const over = taken + px(look.rowGap) * Math.max(0, parts.length - 1) + px(look.paddingTop) + px(look.paddingBottom) - box.clientHeight
      const need = pic.offsetHeight
      if (over > 0 && need > 0) pic.style.zoom = String(Math.max(least, Math.floor(((need - over) / need) * 1000) / 1000))
    }
    const watch = new ResizeObserver(fit)
    watch.observe(box)
    watch.observe(pic)
    return () => watch.disconnect()
  }, [picture, room, least])
}
