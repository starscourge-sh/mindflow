/**
 * A note scrolled while something is held near its top or bottom edge: a block dragged or carried (the editor's
 * dragScroll), a box drawn round blocks (extensions/picked-blocks.ts). Without it a block can only travel, and a box
 * reach, as far as one screenful, which on a long note is most of the way to useless.
 *
 * It runs on a frame loop while held rather than on the pointer's moves alone, because the gesture is to hold still at
 * the edge and wait, and an event that only fires on movement stops the moment you do. A wide band, so the edge is easy
 * to find; pixels a second at the very edge, easing to none at the inside of the band. Per second rather than per
 * frame: per frame, a 120Hz screen scrolled twice as fast as a 60Hz one.
 *
 * The Calendar's grids use it too (Month's weeks, Week and Day's hours). While something is held over a box it carries
 * `data-edge-held`, so a box that comes to rest on its own (Month's weeks onto a week, month-plan.tsx) waits; let go
 * after it scrolled, the box hears `scrollend` once, as at the end of any scroll, and comes to rest then.
 *
 * `band`: how far inside the edge it starts. Month's weeks give none: a day there is one large target, and weeks
 * creeping under a pointer aimed at the last row moved the drop a week on; they scroll once the pointer is past the edge.
 */
export function edgeScroll(box: HTMLElement, band = 96): { follow: (y: number) => void; stop: () => void } {
  const SPEED = 100
  let at: number | null = null
  let frame = 0
  let last = 0
  let moved = false

  // `instant`, spelled out: the box may be easing its own scrolls, and a frame loop that asks for an eased step every
  // frame never arrives.
  const by = (delta: number): void => box.scrollBy({ top: delta, behavior: "instant" })

  // Only while something is held: a loop left running would tick every frame for as long as the note is open.
  const step = (now: number): void => {
    if (at === null) return void (frame = 0)
    frame = requestAnimationFrame(step)
    // Capped, so a frame after a stall does not jump a screenful.
    const seconds = Math.min(now - last, 50) / 1000
    last = now
    const { top, bottom } = box.getBoundingClientRect()
    const above = at - top
    const below = bottom - at
    const rate = SPEED * seconds
    // Full speed at the edge and past it, easing to none at the inside of the band.
    const pace = (gap: number): number => (gap >= band ? 0 : band ? 1 - Math.max(0, gap) / band : 1)
    const was = box.scrollTop
    if (above < band) by(-rate * pace(above))
    else if (below < band) by(rate * pace(below))
    if (box.scrollTop !== was) moved = true
  }

  return {
    follow: (y) => {
      at = y
      if (frame) return
      box.dataset.edgeHeld = ""
      last = performance.now()
      frame = requestAnimationFrame(step)
    },
    stop: () => {
      at = null
      cancelAnimationFrame(frame)
      frame = 0
      if (!("edgeHeld" in box.dataset)) return
      delete box.dataset.edgeHeld
      if (moved) box.dispatchEvent(new Event("scrollend"))
      moved = false
    },
  }
}
