/**
 * A sticky's window says when the pointer comes onto it and when it goes, from
 * its own pointer events and only as they happen (main's sticky:pointer): a
 * glass card set back down once it rises, a card opened from its tab folded
 * back. Main never asks the Mac where the pointer is to know it.
 */

/** How far a glass card's window rises when pointed at (RISE in main/index.ts). */
const RISE = 6
let on: boolean | null = null
let asked = false
const say = (now: boolean): void => {
  if (now === on) return
  on = now
  // Gone from the window: the next time it comes, it may rise again.
  if (!now) asked = false
  window.api.pointerOn(now)
}

export function watchCardPointer(): void {
  // Anything in the window, the clear room round a card too, is on it; leaving the window is a move out to nothing.
  document.addEventListener('pointerover', () => say(true), true)
  document.addEventListener('pointerout', (event) => event.relatedTarget === null && say(false), true)
}

/**
 * Pointed at, a glass card's window rises a little; main sets it down once the
 * pointer leaves. Asked only from above its foot: a pointer in the last few
 * points would be left below the risen window, and it would fall and rise
 * again under a still pointer.
 */
export function liftCard(event: React.PointerEvent): void {
  if (asked || event.clientY >= innerHeight - RISE - 1) return
  asked = true
  window.api.lift()
}
