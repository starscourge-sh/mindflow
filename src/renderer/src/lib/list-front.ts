import { useEffect, type RefObject } from 'react'

/**
 * Which list the keys go to when a page shows more than one (the Queue's Up
 * next and Read, the Recent panel beside a page): the one the pointer is
 * over, or else the one last clicked or tabbed into. A list that can share
 * the window marks its box (useListScope); a page's own list, unmarked, takes
 * the keys whenever no marked list is in front.
 */
let over: Element | null = null
let touched: Element | null = null
if (typeof window !== 'undefined') {
  window.addEventListener('pointermove', (event) => void (over = event.target as Element), true)
  window.addEventListener('pointerdown', (event) => void (touched = event.target as Element), true)
  window.addEventListener('focusin', (event) => void (touched = event.target as Element), true)
  // Out of the window, the pointer is over nothing here.
  document.documentElement.addEventListener('pointerleave', () => void (over = null))
}

const scopeOf = (at: Element | null): Element | null => (at?.isConnected ? at.closest('[data-list-scope]') : null)

/**
 * The marked list in front, or null when the keys belong to the page's own
 * list: the pointer over the page's own rows counts as being there.
 */
export const listInFront = (): Element | null => {
  const at = over?.isConnected ? over : null
  if (at) {
    const marked = scopeOf(at)
    if (marked) return marked
    if (at.closest('[data-page]')) return null
  }
  return scopeOf(touched)
}

/** Marks a list's box as one the keys can be sent to on its own. */
export function useListScope(box: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const at = box.current
    at?.setAttribute('data-list-scope', '')
    return () => at?.removeAttribute('data-list-scope')
  })
}
