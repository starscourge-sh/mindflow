import type { CSSProperties } from 'react'

/**
 * One shape for every row in a list of notes: a page, a page in a group, a
 * group's heading and a folded group. Its box sits on the list's box edge
 * (the list's own list-edge margin), its tile and words start on the ink edge,
 * and the box is what lights on hover, what the focus ring outlines and, for
 * a group, what its panel is drawn round (qa/row-shape.mjs).
 */
export const ROW_SHAPE = 'group/row relative flex w-full items-center gap-2.5 rounded-md list-ink text-left'
/**
 * A row's padding and its least height: a page's title line (1.25rem), the
 * gap and the quiet line under it (1rem), so a one-line row, a group's
 * heading or a folded group, is as tall as a page's two-line row.
 */
export const ROW_PAD = 'py-1.5 min-h-[calc(1.25rem+0.125rem+1rem+0.75rem)]'
/** The square an icon or picture sits in at a row's start. */
export const ROW_TILE = 'relative flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-md'
export const tileTint = (tint?: string | null): CSSProperties => ({
  background: tint ? `color-mix(in srgb, ${tint} 9%, var(--accent))` : 'var(--accent)'
})
