/**
 * A card opened by pointing (a tip, a note's preview, a page's peek) goes the
 * moment what it points at scrolls: a box holding the anchor scrolled, or the
 * page did. A scroll inside the card itself does not count. The one rule for
 * every hover card, so none is left floating over the page after a scroll.
 */
export function onScrollAway(anchor: () => Element | null | undefined, close: () => void, inside?: () => Element | null | undefined): () => void {
  const scrolled = (event: Event): void => {
    const at = anchor()
    const target = event.target
    if (!at?.isConnected) return close()
    if (target instanceof Node && inside?.()?.contains(target)) return
    if (target === document || target === window || (target instanceof Node && target.contains(at))) close()
  }
  addEventListener('scroll', scrolled, { capture: true, passive: true })
  return () => removeEventListener('scroll', scrolled, { capture: true })
}
