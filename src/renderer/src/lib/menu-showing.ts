/**
 * Hover cards and menus never overlap: a menu is what is being read, so while
 * one is open no hover card (the PDF preview, a link's address) shows, and
 * one already up goes the moment a menu opens or a right-click asks for one.
 *
 * Every menu in the app is drawn by Radix, which marks it `role="menu"` and
 * puts it in a layer at the foot of the page while it is open.
 */
export const menuShowing = (): boolean => !!document.querySelector('[role="menu"]:not([data-state="closed"]), .tiptap-slash-menu')

/** Calls `hide` on a right-click, a key, and whenever a menu appears. Returns the way to stop listening. */
export function hideForMenus(hide: () => void, { keys = true }: { keys?: boolean } = {}): () => void {
  const asked = (): void => hide()
  // Radix adds its layer straight under the body, so only the body's own children are watched.
  const watch = new MutationObserver(() => void (menuShowing() && hide()))
  watch.observe(document.body, { childList: true })
  addEventListener('contextmenu', asked, true)
  // A key is typing, not hovering: "/" opening the slash menu under a link's card puts the card away first.
  if (keys) addEventListener('keydown', asked, true)
  return () => {
    watch.disconnect()
    removeEventListener('contextmenu', asked, true)
    removeEventListener('keydown', asked, true)
  }
}
