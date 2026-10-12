/**
 * Text on a filled accent button that can always be read: dark or light,
 * whichever has the higher contrast with the accent as it is here (a pale
 * lime gets dark text, a deep rust white). Read off the element itself, so a
 * break's mint or a theme file's own accent count too.
 */
let paint: CanvasRenderingContext2D | null = null
const DARK = 'oklch(0.2 0.02 100)'

/** The accent's relative luminance, 0 to 1, or null if it cannot be read. */
function luminance(color: string): number | null {
  paint ??= Object.assign(document.createElement('canvas'), { width: 1, height: 1 }).getContext('2d', { willReadFrequently: true })
  if (!paint) return null
  paint.clearRect(0, 0, 1, 1)
  paint.fillStyle = '#000'
  paint.fillStyle = color
  paint.fillRect(0, 0, 1, 1)
  const [r, g, b] = paint.getImageData(0, 0, 1, 1).data
  const linear = (v: number): number => ((v /= 255) <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b)
}

/** Dark or white text for a fill of `color`, by WCAG contrast. */
export function inkOn(color: string): string {
  const lum = luminance(color)
  if (lum === null) return 'white'
  // Against white (1.0) and against the dark ink (about 0.012).
  return 1.05 / (lum + 0.05) >= (lum + 0.05) / 0.062 ? 'white' : DARK
}

/** Sets --pill-on-accent on `element` from the accent it sees. */
export function setOnAccent(element: HTMLElement | null): void {
  if (!element) return
  const probe = document.createElement('span')
  probe.style.color = 'var(--tt-brand-color-400)'
  element.append(probe)
  const accent = getComputedStyle(probe).color
  probe.remove()
  const ink = inkOn(accent)
  if (element.style.getPropertyValue('--pill-on-accent') !== ink) element.style.setProperty('--pill-on-accent', ink)
}
