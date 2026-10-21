/**
 * Which way a key moves through a list.
 *
 * The arrows, plus the Ctrl chords cmdk answers to, so every menu here moves
 * the same way whether it is built on cmdk, on a suggestion popup or on a
 * Radix dropdown. Without this the `/` menu and the handle menu were the two
 * places where `Ctrl-j` typed a letter instead.
 */
export function listDirection(event: {
  key: string
  ctrlKey: boolean
  metaKey: boolean
  altKey: boolean
}): "up" | "down" | null {
  if (event.key === "ArrowDown") return "down"
  if (event.key === "ArrowUp") return "up"
  if (!event.ctrlKey || event.metaKey || event.altKey) return null

  // Emacs's Ctrl-N and Ctrl-P alongside vim's Ctrl-J and Ctrl-K.
  const key = event.key.toLowerCase()
  if (key === "n" || key === "j") return "down"
  if (key === "k" || key === "p") return "up"
  return null
}

/** The next index in that direction, wrapping at either end. */
export function step(current: number, direction: "up" | "down", length: number): number {
  if (!length) return 0
  return direction === "down"
    ? (current + 1) % length
    : (current + length - 1) % length
}

/**
 * Whether a menu or an editor's suggestion popup shows over the page now. Not
 * just in it: a suggestion popup stays in the page, empty, after it closes, and
 * keys checked for it then went dead.
 */
export function menuShowing(selector = '[cmdk-root], [role=menu], [role=listbox], .tiptap-suggestion-popup'): boolean {
  return [...document.querySelectorAll(selector)].some((one) => one.checkVisibility() && one.getBoundingClientRect().width > 0)
}

/**
 * Whether something over the page holds the keys: a menu, a dialog, a popover
 * or an editor's suggestions, shown now. A list drawn into the page itself (a
 * task's "Blocked by" picker, a cmdk list in a form) counts only while you are
 * in it, so a page that has one still hears Escape. `also` adds more that always count.
 */
export function layerOpen(also = ''): boolean {
  const shown = (one: Element): boolean => one.checkVisibility() && one.getBoundingClientRect().width > 0
  const always = `[role=menu], [role=dialog], [role=alertdialog], .tiptap-suggestion-popup${also ? `, ${also}` : ''}`
  if ([...document.querySelectorAll(always)].some(shown)) return true
  // A picker that floats (a popover's list) always counts; a tip, though it floats too, never does.
  return [...document.querySelectorAll('[role=listbox], [cmdk-root]')].some((one) => shown(one) && (one.contains(document.activeElement) || !!one.closest('[data-radix-popper-content-wrapper]')))
}
