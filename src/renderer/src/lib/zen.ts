import { useEffect } from 'react'

/** How long after the last key the buttons come back on their own. */
const PAUSE = 1200

/**
 * Quiet while you write, in quick capture. Typing in the note fades its
 * buttons out (the window's pill, the footer, the block handles, the format
 * bar), and they come back as soon as the pointer moves, the typing stops for
 * a moment, or the writing loses the keys. Only how they look changes: every
 * shortcut still works, and nothing faded can be clicked by mistake.
 *
 * `hide` is the "Hide buttons" setting (⌥⌘,): on, they stay away even while
 * you are not typing, and each comes back while the pointer is over its own
 * place. The look is box-extras.css, read from `data-zen` and `data-zen-hide`.
 */
export function useZen(hide: boolean): void {
  useEffect(() => {
    document.documentElement.toggleAttribute('data-zen-hide', hide)
  }, [hide])

  useEffect(() => {
    const root = document.documentElement
    let timer = 0
    let at: { x: number; y: number } | null = null
    // Buttons that came into view while you type (quick capture's pill grown into the box: its footer, what sending
    // it will do) stay in view until the typing pauses once. Faded at once, the box grew as an empty card and its
    // footer came only a second later, which read as the box growing late.
    let arrived = false
    const back = (): void => {
      window.clearTimeout(timer)
      arrived = false
      root.removeAttribute('data-zen')
    }
    const onKey = (event: KeyboardEvent): void => {
      // A shortcut is not typing: it leaves the buttons as they are.
      if (event.metaKey || event.ctrlKey || event.isComposing) return
      if (event.key.length !== 1 && event.key !== 'Backspace' && event.key !== 'Delete' && event.key !== 'Enter') return
      if (!(event.target as Element | null)?.closest?.('.ProseMirror')) return
      if (!arrived) root.setAttribute('data-zen', '')
      window.clearTimeout(timer)
      timer = window.setTimeout(back, PAUSE)
    }
    // The pill grown into the box: its footer shows with it, in the same frame (it is not drawn in the pill, so it
    // has no fade to come in by).
    const grew = new MutationObserver((changes) => {
      if (!changes.some((one) => one.oldValue !== null && !(one.target as Element).hasAttribute('data-pill'))) return
      arrived = true
      // Shown as it is drawn, with no fade in: the page read its look once already while the key that grew it was
      // down (faded, under data-zen), and from there it faded in over 200ms. data-zen-arrived holds the fade off for
      // that first frame only (box-extras.css).
      root.setAttribute('data-zen-arrived', '')
      root.removeAttribute('data-zen')
      requestAnimationFrame(() => requestAnimationFrame(() => root.removeAttribute('data-zen-arrived')))
    })
    grew.observe(document.body, { subtree: true, attributes: true, attributeFilter: ['data-pill'], attributeOldValue: true })
    // Only a hand that moves: Chromium also fires a move at a still pointer
    // when the page changes under it, as it does with every letter typed.
    const onMove = (event: PointerEvent): void => {
      const was = at
      at = { x: event.screenX, y: event.screenY }
      if (was && Math.abs(was.x - at.x) + Math.abs(was.y - at.y) < 3) return
      if (root.hasAttribute('data-zen')) back()
    }
    const onFocusOut = (event: FocusEvent): void => {
      if ((event.target as Element | null)?.closest?.('.ProseMirror') && !(event.relatedTarget as Element | null)?.closest?.('.ProseMirror')) back()
    }
    window.addEventListener('keydown', onKey, true)
    window.addEventListener('pointermove', onMove, true)
    document.addEventListener('focusout', onFocusOut, true)
    window.addEventListener('blur', back)
    return () => {
      back()
      grew.disconnect()
      window.removeEventListener('keydown', onKey, true)
      window.removeEventListener('pointermove', onMove, true)
      document.removeEventListener('focusout', onFocusOut, true)
      window.removeEventListener('blur', back)
    }
  }, [])
}
