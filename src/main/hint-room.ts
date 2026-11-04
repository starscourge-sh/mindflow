/**
 * Where quick capture's hint goes, out of the card (hint-card.tsx, HintRoom): under the card at its left edge (the
 * room the "/" and "#" menus hang into, which the hint gives up while one is open), or above it only where the
 * screen has no room under it, or nowhere, and then a hint waits. And the room the window keeps round the card for it.
 */
export type Room = { left: number; top: number; right: number; bottom: number }
export type HintSide = 'above' | 'below' | 'left' | 'right' | null
type Box = { x: number; y: number; width: number; height: number }

/** The most kept above the card beyond the controls' own room: a hint's height, which sits there. */
export const HINT_ROOM = 168
/** Less than this above the controls and a hint goes beside the card instead: its usual height with a gloss line. */
export const HINT_ABOVE = 132
/** The room kept on the side a hint sits on: its width (320, main.css), its 12px gap and a 12px margin. */
export const HINT_SIDE = 344
/** The card at its tallest (fit-box.ts, FULL): the room under it is measured from there, so the window that keeps a
 * hint's room below stays on the screen however tall the writing grows the card. */
export const CARD_FULL = 600
/** The pill (PILL), and the box a new line grows it into (fit-box.ts, SHORT). */
export const PILL_HEIGHT = 56
export const CARD_SHORT = 280

/**
 * `oneLine`: "One line to start" keeps the round controls beside the pill's right end, Spotlight's way (main.css),
 * so that side's room is theirs, kept always, and a hint goes above, below or to the left.
 */
export function hintRoom(place: Box, workArea: Box, base: Room, oneLine = false): { side: HintSide; room: Room } {
  const above = place.y - workArea.y - 8
  const under = workArea.y + workArea.height - (place.y + Math.max(place.height, CARD_FULL)) - 8
  // Under the card as it is now (the pill), for the box a new line grows it into.
  const underPill = workArea.y + workArea.height - (place.y + place.height) - 8
  const rightFree = workArea.x + workArea.width - (place.x + place.width) - 8
  // Under the card always, at its left edge (note 277ae401: "would have been better displayed below the prompt not
  // to its left"); above only where the screen has no room under it; never beside it.
  const side: HintSide = under >= base.bottom + HINT_ABOVE ? 'below' : above >= base.top + HINT_ABOVE ? 'above' : null
  return {
    side,
    room: {
      ...base,
      top: side === 'above' ? Math.min(base.top + HINT_ROOM, above) : base.top,
      // The pill keeps room under it for the box a new line grows it into: the page draws the grown card in that
      // first frame, in room the window already has, so no frame shows the card cut off while the window grows round
      // it (the user, 4 Nov: "i should not notice the cutoff second line"). Clicks pass through it as through all room.
      bottom: Math.max(side === 'below' ? Math.min(base.bottom + HINT_ROOM, under) : base.bottom, oneLine ? Math.min(base.bottom + CARD_SHORT - PILL_HEIGHT, Math.max(base.bottom, underPill)) : 0),
      left: base.left,
      right: oneLine && rightFree >= HINT_SIDE ? HINT_SIDE : base.right
    }
  }
}
