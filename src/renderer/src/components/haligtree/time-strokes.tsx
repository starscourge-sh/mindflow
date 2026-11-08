/**
 * Time as thin vertical strokes: the Journal's year (a hairline a day across
 * the year) and a book's page strip (book-links.tsx, a thin track with a
 * stroke where you are). Solid ink for what is gone, faint for what is ahead,
 * the one you are on a taller stroke in the accent, a marked one a taller
 * stroke in its own colour with its name above, the months named under, and
 * one plain line saying what a stroke is. Heat maps and day grids draw small
 * squares instead, and the Goals road dots (time-dots.tsx).
 */
import type { ReactNode } from 'react'

/** A stroke's width, the gap between two, and so their step. */
export const STROKE = 1
export const GAP = 1
export const STEP = STROKE + GAP
/** A stroke's height, and the taller one for where you are or a marked one. */
export const LOW = 14
export const TALL = 22

/** The inks: done or gone, ahead or empty, and the one you are on. */
export const STROKE_INK = {
  gone: 'color-mix(in oklab, var(--foreground) 78%, transparent)',
  ahead: 'color-mix(in oklab, var(--foreground) 18%, transparent)',
  here: 'var(--tt-brand-color-400)'
} as const

/** Where a pointer is along a row of strokes: the index under it, or null past either end. */
export const strokeAt = (clientX: number, left: number, count: number, step = STEP): number | null => {
  const at = Math.floor((clientX - left + GAP / 2) / step)
  return at >= 0 && at < count ? at : null
}

/**
 * A row of strokes as one drawing: `ink` colours each, `tall` raises one (to `TALL`, or by a number of px over it,
 * so a marked stroke can reach up to its name), `attrs` tags each for probes and tips. `step` spreads a whole span
 * (the Journal's year) across its card, as the year's hairlines always were; never less than `STEP`.
 */
export function Strokes({ count, ink, tall, attrs, height = TALL, step = STEP, className = '', ...rest }: {
  count: number; ink: (at: number) => string; tall?: (at: number) => boolean | number; attrs?: (at: number) => Record<string, string | number | undefined>; height?: number; step?: number; className?: string
} & Omit<React.SVGProps<SVGSVGElement>, 'height' | 'width'>): React.JSX.Element {
  const width = Math.max(0, count * step - GAP)
  return (
    <svg data-strokes width={width} height={height} className={`block shrink-0 overflow-visible ${className}`} {...rest}>
      {Array.from({ length: count }, (_, at) => {
        const up = tall?.(at) ?? false
        const h = up === false ? LOW : up === true ? TALL : TALL + up
        return <rect key={at} data-stroke x={Math.round(at * step * 2) / 2} y={height - h} width={STROKE} height={h} fill={ink(at)} {...attrs?.(at)} />
      })}
    </svg>
  )
}

/** The width a line of label text takes in the app's own face, measured once per text. */
const widths = new Map<string, number>()
let pen: CanvasRenderingContext2D | null = null
export const textWidth = (text: string, px = 11, weight = 500): number => {
  const key = `${px}/${weight}/${text}`
  const was = widths.get(key)
  if (was !== undefined) return was
  pen ??= document.createElement('canvas').getContext('2d')
  let said = text.length * px * 0.58
  if (pen) {
    pen.font = `${weight} ${px}px ${getComputedStyle(document.body).fontFamily}`
    said = pen.measureText(text).width
  }
  const w = Math.ceil(said) + 1
  widths.set(key, w)
  return w
}

/**
 * Names over marked strokes, none on another and none past either edge: each takes the lowest of `rows` lines with
 * room, starting just right of its stroke, or ending just left of it when the right edge is too near. A name with
 * no room on any line is left out (`row` null) for the chart to name in a line of its own.
 */
export function placeNames<T extends { x: number; w: number }>(marks: T[], width: number, rows = 3, pad = 8): (T & { row: number | null; left: number })[] {
  const lines: [number, number][][] = Array.from({ length: rows }, () => [])
  return [...marks].sort((a, b) => a.x - b.x).map((one) => {
    if (one.w > width) return { ...one, row: null, left: 0 }
    for (let row = 0; row < rows; row++) {
      for (const from of [one.x + 4, one.x - 3 - one.w]) {
        const to = from + one.w
        if (from < 0 || to > width) continue
        if (lines[row].some(([a, b]) => from < b + pad && to > a - pad)) continue
        lines[row].push([from, to])
        return { ...one, row, left: from }
      }
    }
    return { ...one, row: null, left: 0 }
  })
}

/** Words under a row of strokes at their places (months, weeks), each kept inside the row and off the one before. */
export function StrokeAxis({ ticks, width, lit, className = '' }: { ticks: { x: number; text: string }[]; width: number; /** The word of the part pointed at, brightened. */ lit?: string | null; className?: string }): React.JSX.Element {
  let end = -Infinity
  const shown = ticks.flatMap((one) => {
    const w = textWidth(one.text, 11, 400)
    const left = Math.max(0, Math.min(width - w, one.x))
    if (left < end + 6) return []
    end = left + w
    return [{ ...one, left }]
  })
  return (
    <div aria-hidden data-stroke-axis className={`relative mt-1 h-3.5 text-[11px] leading-none text-muted-foreground ${className}`} style={{ width }}>
      {shown.map((one) => <span key={`${one.text}${one.x}`} className={`absolute top-0 whitespace-nowrap ${one.text === lit ? 'text-foreground transition-none' : 'transition-colors duration-[120ms]'}`} style={{ left: one.left }}>{one.text}</span>)}
    </div>
  )
}

/** What a stroke is, in one line over the strokes: "Each stroke is a day, the solid ones gone". */
export function StrokeRule({ children, className = '' }: { children: ReactNode; className?: string }): React.JSX.Element {
  return <p data-stroke-rule className={`text-meta text-foreground/80 ${className}`}>{children}</p>
}
