/**
 * Where quick capture's hint goes, out of the card (hint-card.tsx, HintRoom): above the card where the screen has
 * room there, or else under it (the room the "/" and "#" menus hang into, which the hint gives up while one is
 * open), or else beside it on the side with room (the left first, as the side panel opens to the right), or
 * nowhere, and then a hint waits. And the room the window keeps round the card for it.
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

/**
 * `oneLine`: "One line to start" keeps the round controls beside the pill's right end, Spotlight's way (main.css),
 * so that side's room is theirs, kept always, and a hint goes above, below or to the left.
 */
export function hintRoom(place: Box, workArea: Box, base: Room, oneLine = false): { side: HintSide; room: Room } {
  const above = place.y - workArea.y - 8
  const under = workArea.y + workArea.height - (place.y + Math.max(place.height, CARD_FULL)) - 8
  const leftFree = place.x - workArea.x - 8
  const rightFree = workArea.x + workArea.width - (place.x + place.width) - 8
  const side: HintSide =
    above >= base.top + HINT_ABOVE ? 'above' : under >= base.bottom + HINT_ABOVE ? 'below' : leftFree >= HINT_SIDE ? 'left' : !oneLine && rightFree >= HINT_SIDE ? 'right' : null
  return {
    side,
    room: {
      ...base,
      top: side === 'above' ? Math.min(base.top + HINT_ROOM, above) : base.top,
      bottom: side === 'below' ? Math.min(base.bottom + HINT_ROOM, under) : base.bottom,
      left: side === 'left' ? HINT_SIDE : base.left,
      right: side === 'right' || (oneLine && rightFree >= HINT_SIDE) ? HINT_SIDE : base.right
    }
  }
}
