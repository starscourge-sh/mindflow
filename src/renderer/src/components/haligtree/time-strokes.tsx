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
import { TIP } from '@/lib/float'

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
export function Strokes({ count, ink, tall, attrs, height = TALL, step = STEP, shift = 0, view, className = '', ...rest }: {
  count: number; ink: (at: number) => string; tall?: (at: number) => boolean | number; attrs?: (at: number) => Record<string, string | number | undefined>; height?: number; step?: number
  /** A row spread wider than its card (the Journal's year, pinched): `view` px of it are drawn, starting `shift` px in. */
  shift?: number; view?: number; className?: string
} & Omit<React.SVGProps<SVGSVGElement>, 'height' | 'width'>): React.JSX.Element {
  const width = view ?? Math.max(0, count * step - GAP)
  // Only the strokes in sight: a year spread to thousands of px is never drawn whole.
  const first = Math.max(0, Math.floor((shift - 2) / step))
  const last = Math.min(count, Math.ceil((shift + width + 2) / step) + 1)
  return (
    <svg data-strokes width={width} height={height} className={`block shrink-0 overflow-visible ${className}`} {...rest}>
      {Array.from({ length: Math.max(0, last - first) }, (_, i) => {
        const at = first + i
        const up = tall?.(at) ?? false
        const h = up === false ? LOW : up === true ? TALL : TALL + up
        // On whole pixels: at half pixels a 1px stroke was drawn as two faint ones, and a year of them beat into bands.
        return <rect key={at} data-stroke x={Math.round(at * step) - Math.round(shift)} y={height - h} width={STROKE} height={h} fill={ink(at)} shapeRendering="crispEdges" {...attrs?.(at)} />
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
 * no room on any line is left out (`row` null) for the chart to name in a line of its own. A marked stroke reaches up
 * to its own name, so no name on a lower line lies across another's stroke, and no stroke runs up through a name.
 */
export function placeNames<T extends { x: number; w: number }>(marks: T[], width: number, rows = 3, pad = 8): (T & { row: number | null; left: number })[] {
  const lines: [number, number][][] = Array.from({ length: rows }, () => [])
  // The strokes standing so far, each from the ground up to its own name's line.
  const poles: { x: number; row: number }[] = []
  const clear = 3
  return [...marks].sort((a, b) => a.x - b.x).map((one) => {
    if (one.w > width) return { ...one, row: null, left: 0 }
    for (let row = 0; row < rows; row++) {
      // This stroke would pass up through every lower line: no name there may lie across it.
      if (lines.slice(0, row).some((line) => line.some(([a, b]) => one.x > a - clear && one.x < b + clear))) continue
      for (const from of [one.x + 4, one.x - 3 - one.w]) {
        const to = from + one.w
        if (from < 0 || to > width) continue
        if (lines[row].some(([a, b]) => from < b + pad && to > a - pad)) continue
        // Nor may this name lie across a taller stroke placed before it.
        if (poles.some((pole) => pole.row > row && pole.x > from - clear && pole.x < to + clear)) continue
        lines[row].push([from, to])
        poles.push({ x: one.x, row })
        return { ...one, row, left: from }
      }
    }
    return { ...one, row: null, left: 0 }
  })
}

/**
 * Words under a row of strokes at their places (months, weeks, days), each kept inside the row and off the others:
 * a lower `rank` is placed first, so the months keep their words when the weeks crowd them. `fade` dims a word (detail
 * fading in as there is room); `from` and `to` keep only the words in sight.
 */
export function StrokeAxis({ ticks, width, lit, from = -Infinity, to = Infinity, className = '', style }: {
  ticks: { x: number; text: string; rank?: number; fade?: number }[]; width: number; /** The word of the part pointed at, brightened. */ lit?: string | null; from?: number; to?: number; className?: string; style?: React.CSSProperties
}): React.JSX.Element {
  const taken: [number, number][] = []
  const shown = [...ticks].sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0) || a.x - b.x).flatMap((one) => {
    if (one.x < from || one.x > to || one.fade === 0) return []
    const w = textWidth(one.text, 11, 400)
    const left = Math.max(0, Math.min(width - w, one.x))
    if (taken.some(([a, b]) => left < b + 6 && left + w > a - 6)) return []
    taken.push([left, left + w])
    return [{ ...one, left }]
  })
  return (
    <div aria-hidden data-stroke-axis className={`relative mt-1 h-3.5 text-[11px] leading-none text-muted-foreground ${className}`} style={{ width, ...style }}>
      {shown.map((one) => <span key={`${one.text}${one.x}`} className={`absolute top-0 whitespace-nowrap ${one.text === lit ? 'text-foreground transition-none' : 'transition-colors duration-[120ms]'}`} style={{ left: one.left, opacity: one.fade }}>{one.text}</span>)}
    </div>
  )
}

/** What a stroke is, in one line over the strokes: "Each stroke is a day, the solid ones gone". */
export function StrokeRule({ children, className = '' }: { children: ReactNode; className?: string }): React.JSX.Element {
  return <p data-stroke-rule className={`text-meta text-(--mf-muted-strong) ${className}`}>{children}</p>
}

/**
 * The line under a row of strokes naming the one pointed at, "10 Nov · click for its page": `x` is that stroke's place
 * in the row, `width` the row's, and the tip stays inside it. Placed in the row's own positioned box.
 */
export function StrokeTip({ x, width, children }: { x: number; width: number; children: ReactNode }): React.JSX.Element {
  return (
    <span data-stroke-tip className={`pointer-events-none absolute z-10 -translate-x-1/2 whitespace-nowrap ${TIP}`}
      style={{ left: Math.max(70, Math.min(Math.max(width, 140) - 70, x)), top: '100%', marginTop: 4 }}>
      {children}
    </span>
  )
}
