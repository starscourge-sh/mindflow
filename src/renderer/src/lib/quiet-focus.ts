/**
 * A panel or menu closing hands focus back to whatever opened it, and after a
 * key (F for Display, Escape to close) Chromium rings that button as if you had
 * tabbed to it. Wraps a close handler: focus goes back to the same place, only
 * without the ring. A caller that sends focus somewhere itself is left alone.
 */
// Brought into sight by a press that opened no menu (the Details button): the mark goes with the next press.
if (typeof window !== 'undefined') for (const kind of ['pointerdown', 'keydown'] as const)
  window.addEventListener(kind, () => document.querySelectorAll('[data-revealed]').forEach((one) => one.removeAttribute('data-revealed')), true)

export function quietClose<E extends Event>(own?: (event: E) => void): (event: E) => void {
  return (event) => {
    own?.(event)
    // What it ran asks for words (a sheet, a name typed in place): the focus goes to that field, never back to the row.
    // It could not take it as it appeared: the menu held the focus until now.
    const asked = document.querySelector<HTMLElement>('[data-name-in-place], [data-ask] [data-ask-field], [data-sure] [data-sure-yes]')
    if (asked) return void (event.preventDefault(), asked.focus())
    // What it ran brought a column into sight (a note's Details or study questions, ui.tsx Props): the focus goes into
    // it, never back to the button above, whose focus would scroll a narrow window back up to it.
    const revealed = document.querySelector<HTMLElement>('[data-revealed]')
    if (revealed) return void (event.preventDefault(), revealed.removeAttribute('data-revealed'), revealed.focus({ preventScroll: true }))
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
