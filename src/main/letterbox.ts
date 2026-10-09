/**
 * Black bands baked into a picture, top and bottom, the way YouTube's 4:3
 * thumbnails carry a 16:9 frame: as fractions of its height, or null.
 *
 * Only clear ones count: every row of a band near-black across the whole
 * width, the two bands the same height, 10% to 30% of the picture between
 * them, and the picture starting sharply where they end. A dark photo, even
 * one with a black sky and black ground, fades rather than stops, so it is
 * never cropped.
 */
export function bandsOf(rgba: ArrayLike<number>, width: number, height: number): { top: number; bottom: number } | null {
  if (width < 8 || height < 8) return null
  const brightest = (at: number): number => Math.max(rgba[at], rgba[at + 1], rgba[at + 2])
  // Near-black across the row, a speck or two of compression noise allowed.
  // Clear is not black: a cut-out's empty edges are never bands.
  const black = (y: number): boolean => {
    let off = 0
    for (let x = 0; x < width; x++) {
      const at = (y * width + x) * 4
      if ((brightest(at) > 24 || rgba[at + 3] < 250) && ++off > width * 0.02) return false
    }
    return true
  }
  // Where the picture starts: a fair share of the row clearly lit.
  const lit = (y: number): boolean => {
    let on = 0
    for (let x = 0; x < width; x++) if (brightest((y * width + x) * 4) > 48) on++
    return on >= width * 0.1
  }
  let top = 0
  while (top < height / 2 && black(top)) top++
  let bottom = 0
  while (bottom < height / 2 && black(height - 1 - bottom)) bottom++
  const share = (top + bottom) / height
  if (share < 0.1 || share > 0.3) return null
  if (Math.abs(top - bottom) > Math.max(2, height * 0.02)) return null
  // The row where a band ends may be a blend of the two; the next one in has to be the picture.
  const inTop = Math.min(top + 1, height - 1)
  const inBottom = Math.max(height - 2 - bottom, 0)
  if (!(lit(top) || lit(inTop)) || !(lit(height - 1 - bottom) || lit(inBottom))) return null
  return { top: top / height, bottom: bottom / height }
}
