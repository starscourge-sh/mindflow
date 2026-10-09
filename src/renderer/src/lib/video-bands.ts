import { isBandedThumb } from '../../../main/video-thumbs'

/**
 * A YouTube thumbnail in a note or its list's preview, put there as a plain picture (imports write
 * `![](https://i.ytimg.com/vi/…/hqdefault.jpg)`) or kept with the note as a
 * copy, is 4:3 with black bands baked in over and under its 16:9 picture.
 * Such a picture is marked `data-banded`, and the stylesheet shows only its
 * middle. Known by its address, or for a copy whose address says nothing, by
 * its edges: a 4:3 picture whose top and bottom eighths are solid black.
 *
 * Marking a picture inside the editor is safe: a leaf node's own attributes
 * are not read back into the document.
 */
const FOUR_THREE = (img: HTMLImageElement): boolean => Math.abs(img.naturalWidth / img.naturalHeight - 4 / 3) < 0.02

function blackEdges(img: HTMLImageElement): boolean {
  try {
    const canvas = document.createElement('canvas')
    canvas.width = 48
    canvas.height = 36
    const pen = canvas.getContext('2d', { willReadFrequently: true })
    if (!pen) return false
    pen.drawImage(img, 0, 0, 48, 36)
    // Throws for a picture from another site, which is then left as it is.
    const { data } = pen.getImageData(0, 0, 48, 36)
    const dark = (row: number): boolean => {
      for (let x = 0; x < 48; x++) {
        const at = (row * 48 + x) * 4
        if (Math.max(data[at], data[at + 1], data[at + 2]) > 24) return false
      }
      return true
    }
    for (const row of [0, 1, 2, 3, 32, 33, 34, 35]) if (!dark(row)) return false
    // Not a picture that is simply dark all over.
    return [10, 18, 26].some((row) => !dark(row))
  } catch {
    return false
  }
}

function look(img: HTMLImageElement): void {
  // A link card sorts out its own picture; an emoji is never one.
  if (img.closest('.tiptap-bookmark-frame, [data-type="emoji"]')) return
  const banded = !!img.naturalWidth && FOUR_THREE(img) && (isBandedThumb(img.currentSrc || img.src) || blackEdges(img))
  if (banded) img.setAttribute('data-banded', '')
  else img.removeAttribute('data-banded')
}

/** Watches every picture that loads in this window. */
export function watchBands(): () => void {
  const onLoad = (event: Event): void => void (event.target instanceof HTMLImageElement && look(event.target))
  document.addEventListener('load', onLoad, true)
  document.querySelectorAll<HTMLImageElement>('img').forEach((img) => img.complete && look(img))
  return () => document.removeEventListener('load', onLoad, true)
}
