/**
 * Text on a filled accent button that can always be read: dark or light,
 * whichever has the higher contrast with the accent as it is here (a pale
 * lime gets dark text, a deep rust white). Read off the element itself, so a
 * break's mint or a theme file's own accent count too.
 */
let paint: CanvasRenderingContext2D | null = null
const DARK = 'oklch(0.2 0.02 100)'

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

/** The accent's relative luminance, 0 to 1, or null if it cannot be read. */
function luminanceOf(color: string): number | null {
  paint ??= Object.assign(document.createElement('canvas'), { width: 1, height: 1 }).getContext('2d', { willReadFrequently: true })
  if (!paint) return null
  paint.clearRect(0, 0, 1, 1)
  paint.fillStyle = '#000'
  paint.fillStyle = color
  paint.fillRect(0, 0, 1, 1)
  return luminance(paint.getImageData(0, 0, 1, 1).data)
}

/** Dark or white text for a fill of `color`, by WCAG contrast. */
export function inkOn(color: string): string {
  const lum = luminanceOf(color)
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

/**
 * Every filled accent button in the window reads: `--primary-foreground` is
 * set to the dark or white ink that stands out most on `--primary`, and
 * `--on-brand` the same for `--tt-brand-color-400`, worked out again whenever
 * the theme, the style or light and dark change. A theme whose own pairing
 * was too faint (warm paper text on a rust fill) reads either way.
 */
let watching = false
export function watchAccentInk(): void {
  if (watching) return
  watching = true
  const root = document.documentElement
  const read = (name: string): string => {
    const probe = document.createElement('span')
    probe.style.color = `var(${name})`
    probe.style.display = 'none'
    document.body.append(probe)
    const color = getComputedStyle(probe).color
    probe.remove()
    return color
  }
  let busy = false
  const sync = (): void => {
    if (busy || !document.body) return
    busy = true
    // Read with our own values out of the way, so a theme's change is seen.
    const was = [root.style.getPropertyValue('--primary-foreground'), root.style.getPropertyValue('--on-brand')]
    root.style.removeProperty('--primary-foreground')
    const ink = inkOn(read('--primary'))
    const brand = inkOn(read('--tt-brand-color-400'))
    if (was[0] !== ink || root.style.getPropertyValue('--primary-foreground') !== ink) root.style.setProperty('--primary-foreground', ink)
    if (was[1] !== brand) root.style.setProperty('--on-brand', brand)
    queueMicrotask(() => (busy = false))
  }
  sync()
  new MutationObserver(() => requestAnimationFrame(sync)).observe(root, { attributes: true, attributeFilter: ['class', 'data-style', 'data-light'] })
  new MutationObserver(() => requestAnimationFrame(sync)).observe(document.head, { childList: true, subtree: true, characterData: true })
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', sync)
  addEventListener('storage', () => requestAnimationFrame(sync))
}
