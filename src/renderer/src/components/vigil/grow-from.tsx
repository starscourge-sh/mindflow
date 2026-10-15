import { useEffect, useRef } from 'react'
import { TINT_HUE } from './sticky-note'
import { still } from '@/lib/motion'

type Rect = { x: number; y: number; width: number; height: number }

/** The page the note opened in: the pane showing its title, else the last pane, else the whole content. */
function paneFor(title: string): HTMLElement | null {
  const panes = [...document.querySelectorAll<HTMLElement>('[data-pane]')].filter((one) => one.getBoundingClientRect().width > 0)
  const words = title.trim().toLowerCase()
  return (words && panes.find((one) => (one.innerText || '').toLowerCase().includes(words))) || panes.at(-1) || document.querySelector<HTMLElement>('main')
}

/** The line that names the note in its page: an article's title, else its first line, else the page's heading. */
function titleIn(pane: HTMLElement): HTMLElement | null {
  return pane.querySelector<HTMLElement>('textarea[placeholder="Untitled"], .ProseMirror > :first-child, h1, h2')
}

/** Lit once, softly, so the eye lands on what was opened. */
function flash(pane: HTMLElement | null): void {
  const line = pane && titleIn(pane)
  line?.animate(
    [{ backgroundColor: 'color-mix(in oklab, var(--tt-color-text-yellow) 28%, transparent)', borderRadius: '6px' }, { backgroundColor: 'transparent', borderRadius: '6px' }],
    { duration: 1100, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' }
  )
}

/**
 * In the main window: a note opened from a small window of its own (a sticky
 * now; main/grow.ts says how others can) grows out of where that window sits
 * on the screen, as Little Arc's window becomes a tab in Arc. A card in the
 * small window's own paper and title starts at its place, clamped into this
 * window, and grows to the note's page over 380ms while the page is laid out
 * under it; then it fades, and the page's title is lit once. With Motion off,
 * only the title is lit.
 */
export function GrowFrom(): React.JSX.Element {
  const layer = useRef<HTMLDivElement>(null)
  useEffect(() => window.api.onHomeGrow((grow) => {
    const host = layer.current
    if (!host) return
    const started = performance.now()
    // The page needs a frame or two to open the note: wait for its pane, up to half a second.
    const find = (): void => {
      const pane = paneFor(grow.title)
      const ready = pane && (pane.innerText || '').toLowerCase().includes(grow.title.trim().toLowerCase())
      if (!ready && performance.now() - started < 500) return void requestAnimationFrame(find)
      if (still()) return flash(pane)
      run(host, grow, pane)
    }
    requestAnimationFrame(find)
  }), [])
  return <div ref={layer} aria-hidden className="pointer-events-none fixed inset-0 z-[60]" />
}

function run(host: HTMLDivElement, grow: { from: Rect; title: string; tint?: string; round?: number }, pane: HTMLElement | null): void {
  const view = { width: window.innerWidth, height: window.innerHeight }
  // Its place in this window: the screen's points less the window's own corner, kept inside the window.
  const width = Math.min(grow.from.width, view.width)
  const height = Math.min(grow.from.height, view.height)
  const from = {
    x: Math.max(0, Math.min(grow.from.x - window.screenX, view.width - width)),
    y: Math.max(0, Math.min(grow.from.y - window.screenY, view.height - height)),
    width,
    height
  }
  const to = pane?.getBoundingClientRect() ?? { x: 0, y: 0, width: view.width, height: view.height }
  const card = document.createElement('div')
  const hue = grow.tint && TINT_HUE[grow.tint]
  const light = document.documentElement.hasAttribute('data-light')
  // As sticky-note.scss lays a colour over the paper: a pastel on a light theme, a thin wash on a dark one.
  const tint = hue && (light ? `color-mix(in oklab, color-mix(in oklab, ${hue} 30%, white) 80%, transparent)` : `color-mix(in oklab, ${hue} 16%, transparent)`)
  // The sticky's own paper (sticky-note.scss): the popover's colour, the page's own on a light theme, and its tint over it. Solid.
  const paper = light ? 'var(--background)' : 'var(--popover)'
  Object.assign(card.style, {
    position: 'absolute',
    left: '0px',
    top: '0px',
    width: `${to.width}px`,
    height: `${to.height}px`,
    transformOrigin: '0 0',
    borderRadius: `${grow.round ?? 8}px`,
    backgroundColor: paper,
    backgroundImage: tint ? `linear-gradient(${tint}, ${tint})` : '',
    boxShadow: '0 2px 4px rgb(0 0 0 / 0.12), 0 12px 28px -6px rgb(0 0 0 / 0.28)',
    border: '1px solid var(--border)',
    overflow: 'hidden'
  })
  const title = document.createElement('p')
  title.textContent = grow.title
  title.className = 'truncate px-3 pt-2 text-control font-medium text-foreground'
  card.append(title)
  host.append(card)
  // The card is drawn at the page's size and grows on a transform alone (on the
  // compositor), from the sticky's place and size; its corners are kept round
  // by scaling their radius the other way, and its title is held at its own
  // size while it fades in the first half.
  const [sx, sy] = [from.width / to.width, from.height / to.height]
  const round = grow.round ?? 8
  const grown = card.animate([
    { transform: `translate(${from.x}px, ${from.y}px) scale(${sx}, ${sy})`, borderRadius: `${round / sx}px / ${round / sy}px` },
    { transform: `translate(${to.x}px, ${to.y}px) scale(1, 1)`, borderRadius: '12px' }
  ], { duration: 280, easing: 'cubic-bezier(0.22, 1, 0.36, 1)', fill: 'forwards' })
  title.style.transformOrigin = '0 0'
  title.animate([{ opacity: 1, transform: `scale(${1 / sx}, ${1 / sy})` }, { opacity: 0, offset: 0.5 }, { opacity: 0, transform: 'scale(1, 1)' }], { duration: 280, fill: 'forwards' })
  void grown.finished.then(() => {
    // Grown: it gives way to the page under it, and the page's title is lit once.
    const gone = card.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 160, easing: 'cubic-bezier(0.16, 1, 0.3, 1)', fill: 'forwards' })
    flash(pane)
    void gone.finished.then(() => card.remove())
  }).catch(() => card.remove())
}
