/**
 * Hover cards and menus never overlap: a menu is what is being read, so while
 * one is open no hover card (the PDF preview, a link's address) shows, and
 * one already up goes the moment a menu opens or a right-click asks for one.
 *
 * Every menu in the app is drawn by Radix, which marks it `role="menu"` and
 * puts it in a layer at the foot of the page while it is open.
 */
export const menuShowing = (): boolean => !!document.querySelector('[role="menu"]:not([data-state="closed"]), .tiptap-slash-menu')

/** Marks on the page for what floats over it, each looked for in the body's own children, where Radix, "/" and the viewers put theirs. */
const FLOATS = { 'data-menu-up': '.tiptap-slash-menu, .tiptap-block-menu, [role="menu"]', 'data-look': '.mf-look' }

/**
 * Keeps html[data-menu-up] while a menu is up and html[data-look] while a picture or a file is open in its viewer
 * (image-look.tsx, file-look.tsx), for the styles that give way to one: a note's word count, a menu over the viewer.
 * They were asked as body:has(...), which had Chromium look through every element in the window whenever anything
 * with a role came or went (⌘K's rows, a menu's lines): over the largest note, about 15 ms each time.
 */
export function markFloats(): void {
  const page = document.documentElement
  const mark = (): void => {
    const floats = [...document.body.children].filter((one) => one.id !== 'root')
    for (const [name, look] of Object.entries(FLOATS)) page.toggleAttribute(name, floats.some((one) => one.matches(look) || !!one.querySelector(look)))
  }
  new MutationObserver(mark).observe(document.body, { childList: true })
  mark()
}

/** Calls `hide` on a right-click, a key, and whenever a menu appears. Returns the way to stop listening. */
export function hideForMenus(hide: () => void, { keys = true }: { keys?: boolean } = {}): () => void {
  const asked = (): void => hide()
  // Radix adds its layer straight under the body, so only the body's own children are watched.
  const watch = new MutationObserver(() => void (menuShowing() && hide()))
  watch.observe(document.body, { childList: true })
  addEventListener('contextmenu', asked, true)
  // Nor while anything is dragged, from this page or from another app: no card rides along.
  addEventListener('dragstart', asked, true)
  addEventListener('dragenter', asked, true)
  // A key is typing, not hovering: "/" opening the slash menu under a link's card puts the card away first.
  if (keys) addEventListener('keydown', asked, true)
  return () => {
    watch.disconnect()
    removeEventListener('contextmenu', asked, true)
    removeEventListener('dragstart', asked, true)
    removeEventListener('dragenter', asked, true)
    removeEventListener('keydown', asked, true)
  }
}
