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
 * said for you above it never runs the page under what is below it. `room` is the box that must not run over (its
 * overflow goes down, never up: no centring that is not safe), `picture` the part of it that gives way (the room
 * itself, for a page that is all picture). Zoom keeps the picture's place and draws what is in it smaller, so it
 * gives back as much height as it is short of. Measured at its own size each time either changes size (a window made
 * smaller, fonts come in, words typed into it), so the zoom never feeds on itself.
 */
export function useFitPicture(picture: RefObject<HTMLElement | null>, room: RefObject<HTMLElement | null>, least = 0.7): void {
  useLayoutEffect(() => {
    const pic = picture.current
    const box = room.current
    if (!pic || !box) return
    const fit = (): void => {
      pic.style.zoom = ''
      const over = box.scrollHeight - box.clientHeight
      const need = pic.scrollHeight
      if (over > 0 && need > 0) pic.style.zoom = String(Math.max(least, Math.floor(((need - over) / need) * 1000) / 1000))
    }
    const watch = new ResizeObserver(fit)
    watch.observe(box)
    watch.observe(pic)
    return () => watch.disconnect()
  }, [picture, room, least])
}
