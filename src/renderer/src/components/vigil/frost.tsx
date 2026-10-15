import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { contrast } from '@/lib/on-accent'
import type { Frost as FrostState } from '../../../../preload/index.d'

/** How far the blurred picture reaches past the card, so the blur's soft edge and the lean's corners stay out of sight. */
const BLEED = 48

/** The least of the paper over the picture, and the step it rises by until the words read well enough. */
const LEAST = 0.8
const STEP = 0.02

/** A fine paper grain, the same on every card. */
const GRAIN = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='g'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 0.5 0 0 0 0 0.5 0 0 0 0 0.5 0 0 0 1.1 -0.2'/%3E%3C/filter%3E%3Crect width='140' height='140' filter='url(%23g)'/%3E%3C/svg%3E")`

/** No desktop picture to show: a soft wash in the theme's own colours, still not see-through. */
const WASH =
  'radial-gradient(120% 90% at 12% 0%, color-mix(in oklab, var(--primary) 18%, transparent), transparent 70%), radial-gradient(110% 90% at 100% 100%, color-mix(in oklab, var(--foreground) 10%, transparent), transparent 70%), linear-gradient(160deg, var(--popover), var(--background))'

/** Where an element sits in the window as laid out, before any lean or lift. */
const placeOf = (el: HTMLElement): { x: number; y: number } => {
  let x = 0
  let y = 0
  for (let at: HTMLElement | null = el; at; at = at.offsetParent as HTMLElement | null) {
    x += at.offsetLeft + (at === el ? 0 : at.clientLeft)
    y += at.offsetTop + (at === el ? 0 : at.clientTop)
  }
  return { x, y }
}

type RGB = [number, number, number]
/** Colours laid one over another as the card paints them, read back as plain red, green and blue. */
let pen: CanvasRenderingContext2D | null = null
const painted = (layers: string[]): RGB => {
  pen ??= Object.assign(document.createElement('canvas'), { width: 1, height: 1 }).getContext('2d', { willReadFrequently: true })
  if (!pen) return [128, 128, 128]
  pen.clearRect(0, 0, 1, 1)
  for (const fill of layers) (pen.fillStyle = '#000', (pen.fillStyle = fill), pen.fillRect(0, 0, 1, 1))
  const [r, g, b] = pen.getImageData(0, 0, 1, 1).data
  return [r, g, b]
}
/** A theme colour as the page has it now. */
const token = (name: string): string => getComputedStyle(document.documentElement).getPropertyValue(name).trim() || 'transparent'

/**
 * How much paper the card needs over this patch of picture: the least that
 * keeps its words (and its dimmer words) reading nearly as well as on plain
 * paper, and never under 4.5:1 where plain paper manages that.
 */
function paperOver(patch: RGB[], tint?: string): number {
  const paper = painted(['Canvas', token('--background'), token('--mf-paper'), ...(tint ? [tint.startsWith('--') ? token(tint) : tint] : [])])
  const inks = [token('--foreground'), token('--muted-foreground')].map((ink) => painted([`rgb(${paper.join(' ')})`, ink]))
  const need = inks.map((ink, i) => Math.min(i ? 4.5 : 7, contrast(ink, paper) * 0.92))
  for (let amount = LEAST; amount < 1; amount += STEP) {
    const mix = (pixel: RGB): RGB => [0, 1, 2].map((c) => paper[c] * amount + pixel[c] * (1 - amount)) as RGB
    if (patch.every((pixel) => inks.every((ink, i) => contrast(ink, mix(pixel)) >= need[i]))) return Math.min(1, amount + STEP)
  }
  return 1
}

/**
 * Frosted glass, faked: the desktop picture behind the window (sent small and
 * blurred by main, see main/frost.ts), placed so the part showing is the part
 * of the desktop under the card, blurred again here, under a wash of the
 * theme's paper strong enough that the words keep their full contrast:
 * more paper over a bright patch under dark words, or a dark one under light
 * words, worked out from the picture itself as the card moves. It
 * turns against the card's lean (and lift, with `lift`), so it stays lined up
 * with the desktop while the card tilts. Nothing when frosting is off or
 * Reduce transparency is on: the card is its plain paper then.
 *
 * Goes first inside a positioned card that makes its own stacking context
 * (a lean or a transform does); it paints under everything else in it.
 */
export function Frost({ tint, lift = false }: { tint?: string; lift?: boolean }): React.JSX.Element | null {
  const [frost, setFrost] = useState<FrostState | null>(null)
  const told = useRef<FrostState | null>(null)
  const at = useRef({ x: 0, y: 0 })
  const glass = useRef<HTMLDivElement>(null)
  const paper = useRef<HTMLDivElement>(null)
  // The picture's pixels, read once per picture, for how much paper each place needs.
  const pixels = useRef<{ url: string; data: ImageData } | null>(null)

  // Enough paper over the patch of picture under the card (and a little round it, which the blur draws in).
  const settle = (): void => {
    const el = glass.current
    const now = told.current
    const layer = paper.current
    if (!layer) return
    if (!el || !now?.image || pixels.current?.url !== now.image) return void (layer.style.opacity = String(now?.image ? 1 : 0.62))
    const { data } = pixels.current
    const card = el.parentElement as HTMLElement
    const box = placeOf(card)
    const [width, height] = [card.offsetWidth, card.offsetHeight]
    const kx = data.width / now.display.width
    const ky = data.height / now.display.height
    const left = Math.max(0, Math.floor((at.current.x + box.x - now.display.x) * kx) - 2)
    const top = Math.max(0, Math.floor((at.current.y + box.y - now.display.y) * ky) - 2)
    const right = Math.min(data.width - 1, Math.ceil((at.current.x + box.x + width - now.display.x) * kx) + 2)
    const bottom = Math.min(data.height - 1, Math.ceil((at.current.y + box.y + height - now.display.y) * ky) + 2)
    const patch: RGB[] = []
    for (let y = top; y <= bottom; y++)
      for (let x = left; x <= right; x++) {
        const i = (y * data.width + x) * 4
        patch.push([data.data[i], data.data[i + 1], data.data[i + 2]])
      }
    layer.style.opacity = String(patch.length ? paperOver(patch, tint) : 1)
  }

  // The picture's offset: the screen's corner, less where this card's glass starts on the screen.
  const place = (): void => {
    const el = glass.current
    const now = told.current
    if (!el || !now?.image) return
    const box = placeOf(el.parentElement as HTMLElement)
    el.style.backgroundPosition = `${now.display.x - (at.current.x + box.x - BLEED)}px ${now.display.y - (at.current.y + box.y - BLEED)}px`
    settle()
  }

  useEffect(() => {
    let live = true
    void window.api.frost().then((first) => live && first && setFrost((was) => was ?? first))
    const off = window.api.onFrost(setFrost)
    // Dragged: placed on the next frame, once per frame however often it is told.
    let frame = 0
    const offAt = window.api.onFrostAt((next) => {
      at.current = next
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(place)
    })
    // Resized from its corner, or the window changed size: the card moved within it.
    const resized = new ResizeObserver(() => place())
    resized.observe(document.body)
    // Another theme: other paper and other words, so another amount of paper.
    const themed = new MutationObserver(() => settle())
    themed.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'style', 'data-light'] })
    return () => {
      themed.disconnect()
      live = false
      off()
      offAt()
      cancelAnimationFrame(frame)
      resized.disconnect()
    }
  }, [])

  useLayoutEffect(() => {
    told.current = frost
    if (frost) at.current = frost.at
    place()
    settle()
  }, [frost])

  // A new picture: its pixels read off a small canvas (a few kilobytes), then the paper worked out.
  useEffect(() => {
    const url = frost?.image
    if (!url || pixels.current?.url === url) return
    const img = new Image()
    img.onload = () => {
      const board = Object.assign(document.createElement('canvas'), { width: img.naturalWidth, height: img.naturalHeight }).getContext('2d', { willReadFrequently: true })
      if (!board) return
      board.drawImage(img, 0, 0)
      pixels.current = { url, data: board.getImageData(0, 0, img.naturalWidth, img.naturalHeight) }
      settle()
    }
    img.src = url
  }, [frost?.image])

  if (!frost?.on) return null
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 -z-10 overflow-hidden rounded-[inherit]"
    >
      {/* A solid floor under everything: whatever happens to the picture (not
          loaded yet, refused, a see-through theme), the app or the note behind
          this window never shows through, so words never sit on other words. */}
      <div className="absolute inset-0" style={{ backgroundColor: `rgb(${painted(['Canvas', token('--background'), token('--mf-paper')]).join(' ')})` }} />
      {frost.image ? (
        // Keyed apart: the picture's place is set straight on its element, which the wash must not inherit.
        <div
          key="glass"
          ref={glass}
          className={`absolute rotate-[calc(var(--tilt,0deg)*-1)] transition-[rotate,scale] duration-500 ease-[cubic-bezier(0.34,1.36,0.64,1)] motion-reduce:transition-none ${lift ? 'group-hover:rotate-0 group-hover:scale-[0.98039]' : ''}`}
          style={{
            inset: -BLEED,
            backgroundImage: `url(${frost.image})`,
            backgroundSize: `${frost.display.width}px ${frost.display.height}px`,
            backgroundRepeat: 'no-repeat',
            // Muted, so the desktop shows as a texture under the paper, never as a colour that makes the card look like another theme.
            filter: 'blur(14px) saturate(0.6)'
          }}
        />
      ) : (
        <div key="wash" className="absolute inset-0" style={{ backgroundImage: WASH }} />
      )}
      {/* The paper over it, the card's own solid colours at most of their strength:
          enough that the words read as on plain paper. */}
      <div
        ref={paper}
        className="absolute inset-0"
        style={{
          opacity: 1,
          backgroundImage: `linear-gradient(rgb(255 255 255 / 0.06), transparent 40%)${tint ? `, linear-gradient(${tint.startsWith('--') ? `var(${tint})` : tint}, ${tint.startsWith('--') ? `var(${tint})` : tint})` : ''}, linear-gradient(var(--mf-paper), var(--mf-paper)), linear-gradient(var(--background), var(--background))`,
          backgroundColor: 'Canvas'
        }}
      />
      <div className="absolute inset-0 opacity-[0.07] mix-blend-overlay" style={{ backgroundImage: GRAIN }} />
      {/* A hairline of light along the top edge and a faint rim, as Apple's materials have. */}
      <div className="absolute inset-0 rounded-[inherit]" style={{ boxShadow: 'inset 0 1px 0 rgb(255 255 255 / 0.16), inset 0 0 0 0.5px rgb(255 255 255 / 0.06)' }} />
    </div>
  )
}
