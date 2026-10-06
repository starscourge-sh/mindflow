/**
 * A panel or menu closing hands focus back to whatever opened it, and after a
 * key (F for Display, Escape to close) Chromium rings that button as if you had
 * tabbed to it. Wraps a close handler: focus goes back to the same place, only
 * without the ring. A caller that sends focus somewhere itself is left alone.
 */
export function quietClose<E extends Event>(own?: (event: E) => void): (event: E) => void {
  return (event) => {
    own?.(event)
    if (event.defaultPrevented) return
    setTimeout(() => {
      const active = document.activeElement as HTMLElement | null
      // Fields and the writing draw no ring anyway; only buttons and rows need this.
      if (!active?.matches(':focus-visible') || active.matches('input, textarea, select, [contenteditable]')) return
      // Focusing what already has focus does nothing, so it lets go first.
      active.blur()
      active.focus({ focusVisible: false, preventScroll: true } as FocusOptions)
    })
  }
}
