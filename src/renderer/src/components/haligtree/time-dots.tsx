/**
 * The one way Haligtree draws time: round dots, 8px, 3px apart, packed tight
 * and never stretched to fill (memory compact-dots). The Goals road set the
 * look; the year of study, a book's cards, a book's pages and the Journal's
 * year all draw with these same pieces, so every chart reads the same way:
 * solid for what is done or gone, faint for what is ahead or empty, the dot
 * you are on in the accent, and one plain line saying what a dot is.
 */
import type { ReactNode } from 'react'

/** A dot, its gap, and so its step. */
export const DOT = 8
export const GAP = 3
export const STEP = DOT + GAP

/** The inks: done or gone, ahead or empty, and the one you are on. */
export const DOT_INK = {
  gone: 'color-mix(in oklab, var(--foreground) 82%, transparent)',
  ahead: 'color-mix(in oklab, var(--foreground) 13%, transparent)',
  here: 'var(--tt-brand-color-400)'
} as const

/** A ring drawn outside a dot without moving it: a marked one, or the one pointed at. */
export const dotRing = (ink: string): string => `0 0 0 1.5px var(--background), 0 0 0 2.5px ${ink}`

/** What a dot is, in one line over the dots: "Each dot is a week, the solid ones gone". */
export function DotRule({ children, className = '' }: { children: ReactNode; className?: string }): React.JSX.Element {
  return <p data-dot-rule className={`text-meta text-(--mf-muted-strong) ${className}`}>{children}</p>
}

/** The words at the two ends of a row of dots, and between them, when given, where you are. */
export function DotEnds({ left, middle, right }: { left: string; middle?: ReactNode; right: string }): React.JSX.Element {
  return (
    <p data-dot-ends className="mt-1 flex justify-between gap-2 text-[11px] leading-none text-muted-foreground tabular-nums">
      <span>{left}</span>{middle}<span>{right}</span>
    </p>
  )
}

/** How many pages each dot of a book stands for, so a book is never more than `most` dots. */
export const pagesPerDot = (pages: number, most = 60): number => Math.max(1, Math.ceil(pages / most))

/**
 * A heat map's or day grid's cell: a small square with soft corners, 10px, 3px apart (the year of study, the 30 days,
 * the days written, habits, focus, how much of a book has cards). Dots stay for the Goals road; strokes draw the
 * Journal's year and a book's pages (time-strokes.tsx).
 */
export const SQUARE = 10
export const SQUARE_GAP = 3
export const SQUARE_STEP = SQUARE + SQUARE_GAP
