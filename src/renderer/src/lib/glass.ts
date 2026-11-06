import { animatingRound, whileChanging } from './while-changing'

/**
 * Real glass, Raycast's way (main/glass.ts, native/glass.mm): the Mac's blur of the desktop under the shapes this page
 * draws on it, and nowhere else in its window. Each frame anything on the page moves, the shapes `parts` names (their
 * boxes and rounded corners) are measured and told to main, only when they changed. None while `off` says so (Reduce
 * Transparency, a solid look, nothing to show), and every surface is opaque then: the page's CSS reads data-glass
 * ("dark" or "light", by the page's own colour, not a class: a theme like Paper is light whatever the Mac's look).
 */
export function followGlass(parts: () => (Element | null)[], off: () => boolean = () => false): void {
  const root = document.documentElement
  const paint = document.createElement('canvas').getContext('2d', { willReadFrequently: true })
  let darkFor = ''
  let darkWas = false
  const pageIsDark = (): boolean => {
    const colour = getComputedStyle(root).getPropertyValue('--background').trim()
    if (colour === darkFor || !paint) return darkWas
    paint.clearRect(0, 0, 1, 1)
    paint.fillStyle = colour
    paint.fillRect(0, 0, 1, 1)
    const [r, g, b] = paint.getImageData(0, 0, 1, 1).data
    darkFor = colour
    darkWas = 0.2126 * r + 0.7152 * g + 0.0722 * b < 128
    return darkWas
  }
  // Seen: not faded below half, nor hidden, itself or anything round it.
  const shown = (el: Element | null): el is HTMLElement => {
    if (!el) return false
    for (let at: Element | null = el; at && at !== document.body; at = at.parentElement) {
      const style = getComputedStyle(at)
      if (Number(style.opacity) < 0.5 || style.visibility === 'hidden' || style.display === 'none') return false
    }
    return true
  }
  const shapesNow = (): number[][] => {
    if (off() || matchMedia('(prefers-reduced-transparency: reduce)').matches || 'solid' in root.dataset) return []
    return parts().filter(shown).map((el) => {
      const r = el.getBoundingClientRect()
      return [r.left, r.top, r.width, r.height, Math.min(parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0, r.height / 2)].map((n) => Math.round(n * 10) / 10)
    }).filter((one) => one[2] > 1 && one[3] > 1)
  }
  // Measured each frame only while something can move them (lib/while-changing.ts): at rest no frame is asked for.
  let sent = ''
  whileChanging(() => {
    const shapes = shapesNow()
    const dark = pageIsDark()
    // Set only when it changes: setting an attribute is a change to the page even to the same value.
    const look = shapes.length ? (dark ? 'dark' : 'light') : undefined
    if (root.dataset.glass !== look) {
      if (look) root.dataset.glass = look
      else delete root.dataset.glass
    }
    // The window's size too: main draws the glass's mask at the window's size, so a window grown or shrunk round the
    // same shapes (room below for a menu) needs them told again, or the mask is left at the old size.
    const said = JSON.stringify([dark, shapes, innerWidth, innerHeight])
    if (said === sent) return false
    sent = said
    window.api.glass(dark, shapes)
    return true
  }, () => animatingRound(parts()))
}
