/**
 * WCAG contrast between two colours, for the pictures and the frosted glass
 * that pick their words' ink by what is under them. Ink on an accent fill is
 * the stylesheet's own (.mf-on-accent in assets/main.css).
 */

/** A colour's relative luminance (WCAG), 0 for black to 1 for white, from its red, green and blue (0 to 255). */
const luminance = (rgb: ArrayLike<number>): number => {
  const linear = (v: number): number => ((v /= 255) <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
  return 0.2126 * linear(rgb[0]) + 0.7152 * linear(rgb[1]) + 0.0722 * linear(rgb[2])
}

/** How far apart two colours' lightness is (WCAG contrast ratio, 1 to 21), either way round. */
export const contrast = (a: ArrayLike<number>, b: ArrayLike<number>): number => {
  const [x, y] = [luminance(a), luminance(b)]
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)
}
