/**
 * How much of the window's foot the "Add a thought…" bar takes, in pixels, with
 * an 8px gap: menus treat its top as the window's edge, so a menu typed low on a
 * page flips up above the line instead of running under the bar. 8 with no bar.
 */
export function dockRoom(): number {
  const tall = window.innerHeight
  let top = tall
  for (const bar of document.querySelectorAll<HTMLElement>("[data-composer]")) {
    const box = bar.getBoundingClientRect()
    // Only one docked at the window's foot and in sight counts, not one inline in a page.
    if (box.height && box.width && box.top > tall / 2 && box.bottom <= tall + 1) top = Math.min(top, box.top)
  }
  return Math.max(8, Math.round(tall - top + 8))
}
