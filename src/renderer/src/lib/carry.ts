/**
 * A floating window carried by Haligtree, not the Mac: a press where the page says so (`--mf-drag: 1`, set on the
 * card and passed down to what is in it) asks main to carry the window (window:grab), and it follows the pointer
 * from where it was picked up until the button comes up (window:let-go), by carryWindow below. Never from a button, link, field, menu
 * line or anything marked `--mf-drag: 0`. Stickies, the meeting card and the focus pill all move this way, so the
 * pointer over them is seen (a system drag region swallows it) and their grabber (grabber.tsx) can show.
 */
export function carryOnPress(): void {
  window.addEventListener('pointerdown', (event) => {
    const at = event.target
    if (event.button !== 0 || !(at instanceof Element) || at.closest('button, a, input, textarea, select, [contenteditable="true"], [role="menuitem"], [data-grabber]')) return
    if (getComputedStyle(at).getPropertyValue('--mf-drag').trim() !== '1') return
    event.preventDefault()
    carryWindow(event, at)
  }, true)
}

/**
 * A window carried by the hand (quick capture's grabber, a sticky's card), the way a page drags anything: the press
 * captures the pointer, so its moves keep coming here past the window's edge and over other apps until the button
 * comes up, and main is told where the pointer now is on the screen (window:carry), which moves the window there.
 *
 * Screen points, never the page's own: the window moves under the pointer, so a point inside the page (clientX) would
 * shift with every move and feed back into the next. One message a frame at most, the newest point: the window moves
 * as often as the screen draws, and only when the pointer has moved.
 */
const ENDS = ['pointerup', 'pointercancel', 'lostpointercapture'] as const

export function carryWindow(press: PointerEvent, by: Element): void {
  const id = press.pointerId
  by.setPointerCapture(id)
  window.api.grab(press.screenX, press.screenY)
  let latest: { x: number; y: number } | null = null
  let frame = 0
  const send = (): void => {
    frame = 0
    if (latest) window.api.carry(latest.x, latest.y)
    latest = null
  }
  const move = (event: Event): void => {
    if (!(event instanceof PointerEvent) || event.pointerId !== id) return
    latest = { x: event.screenX, y: event.screenY }
    frame ||= requestAnimationFrame(send)
  }
  // Let go: the button up, the press cancelled, or the window left for another (⌘Tab while held). The last point
  // still lands, so the window is put down where the pointer was.
  const end = (event: Event): void => {
    if (event instanceof PointerEvent && event.pointerId !== id) return
    cancelAnimationFrame(frame)
    send()
    by.removeEventListener('pointermove', move)
    for (const name of ENDS) by.removeEventListener(name, end)
    window.removeEventListener('blur', end)
    if (by.hasPointerCapture(id)) by.releasePointerCapture(id)
    window.api.letGo()
  }
  by.addEventListener('pointermove', move)
  for (const name of ENDS) by.addEventListener(name, end)
  window.addEventListener('blur', end)
}
