/**
 * A floating window carried by Haligtree, not the Mac: a press where the page says so (`--mf-drag: 1`, set on the
 * card and passed down to what is in it) asks main to carry the window (window:grab), and it follows the pointer
 * from where it was picked up until the button comes up (window:let-go). Never from a button, link, field, menu
 * line or anything marked `--mf-drag: 0`. Stickies, the meeting card and the focus pill all move this way, so the
 * pointer over them is seen (a system drag region swallows it) and their grabber (grabber.tsx) can show.
 */
export function carryOnPress(): void {
  window.addEventListener('pointerdown', (event) => {
    const at = event.target
    if (event.button !== 0 || !(at instanceof Element) || at.closest('button, a, input, textarea, select, [contenteditable="true"], [role="menuitem"]')) return
    if (getComputedStyle(at).getPropertyValue('--mf-drag').trim() !== '1') return
    event.preventDefault()
    window.api.grab()
    const up = (): void => (window.api.letGo(), removeEventListener('pointerup', up, true), removeEventListener('blur', up))
    addEventListener('pointerup', up, true)
    addEventListener('blur', up)
  }, true)
}
