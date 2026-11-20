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

/** Whether a menu (a dropdown or a right-click menu) is open now: the one check every list's Escape asks first. */
export function menuOpen(): boolean {
  return menuShowing('[role=menu]')
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

/**
 * Whether the caret is in a block that spends Escape itself (`data-takes-escape`,
 * such as a diagram's words, where Escape steps out below it): that Escape is
 * the block's, never the note's or the window's.
 */
export function caretTakesEscape(): boolean {
  const at = window.getSelection()?.anchorNode
  const element = at instanceof Element ? at : at?.parentElement
  return !!element?.closest('[data-takes-escape]')
}

/**
 * Bring a menu's chosen row into view as the keys move it, its group's heading with it: moved onto the first row
 * of a group (wrapping from the bottom back to the top, above all), the heading above it shows too, and the very
 * first or last row takes the list right to its top or foot. `scrollIntoView({ block: "nearest" })` alone left the
 * list a heading short of its top after a wrap, so it looked as if it had not scrolled with the row.
 */
export function revealRow(row: Element | null | undefined): void {
  if (!row) return
  let box = row.parentElement
  while (box && !(box.scrollHeight > box.clientHeight + 1 && /auto|scroll/.test(getComputedStyle(box).overflowY))) box = box.parentElement
  if (!box) return void row.scrollIntoView({ block: 'nearest' })
  const rows = [...box.querySelectorAll(row.tagName)].filter((one) => one.getClientRects().length)
  const at = rows.indexOf(row)
  if (at === 0) return void (box.scrollTop = 0)
  if (at === rows.length - 1) return void (box.scrollTop = box.scrollHeight)
  // A heading just above the row (a group's first row): the heading is what must show at the top.
  const before = row.previousElementSibling
  const top = before && before.tagName !== row.tagName ? before : row
  const [area, from, to] = [box.getBoundingClientRect(), top.getBoundingClientRect(), row.getBoundingClientRect()]
  // Clear of the list's edge fades (its scroll-padding, main.css .mf-more): stopped flush with the edge, the row sat
  // in the fade's shadow (the slash menu, 6 Nov).
  const style = getComputedStyle(box)
  const [above, below] = [parseFloat(style.scrollPaddingTop) || 0, parseFloat(style.scrollPaddingBottom) || 0]
  if (from.top < area.top + above) box.scrollTop -= area.top + above - from.top
  else if (to.bottom > area.bottom - below) box.scrollTop += to.bottom - (area.bottom - below)
}

/**
 * Esc in a submenu closes that submenu alone, the keys back on its row, as ← does: Radix closes the whole menu.
 * Handed to every SubContent's onEscapeKeyDown; the menu under it takes the next Esc.
 */
export function escOneLayer(event: KeyboardEvent): void {
  const here = document.activeElement
  if (!(here instanceof HTMLElement) || !here.closest('[data-slot$="sub-content"]')) return
  event.preventDefault()
  here.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true }))
}
