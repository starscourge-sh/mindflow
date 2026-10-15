import { byKeys } from "@/lib/motion"

// Picked with ↑↓ and Enter, the choice lands at once: the blink is for the pointer.
const still = (): boolean =>
  document.documentElement.dataset.motion === "off" || matchMedia("(prefers-reduced-motion: reduce)").matches

/** Items that have blinked and are now being chosen for real. */
const chosen = new WeakSet<HTMLElement>()
/** Items blinking now: a second press meanwhile is the same choice, not another. */
const blinking = new WeakSet<HTMLElement>()

/**
 * macOS's way with a menu: the item you picked blinks twice, then the menu
 * goes, so you know it took. Menus open at once (they are used all day), and
 * this is the only motion they keep besides a short fade out.
 *
 * Radix closes a menu as soon as an item's onSelect returns, so the first
 * select is held (preventDefault), the row blinks, and then it is clicked
 * again for real: that second select runs the item's own handler and closes.
 */
export function blinkThen<E extends Event>(onSelect?: (event: E) => void): (event: E) => void {
  return (event) => {
    const item = event.currentTarget as HTMLElement | null
    if (!item || chosen.has(item) || still() || byKeys()) {
      if (item) chosen.delete(item)
      return onSelect?.(event)
    }
    event.preventDefault()
    if (blinking.has(item)) return
    blinking.add(item)
    // Off, on, off, on: about 150ms, as the Finder's menus do it.
    const steps = [0, 40, 80, 120]
    // The light under the rows is what blinks (main.css, data-blink).
    steps.forEach((at, index) => setTimeout(() => item.toggleAttribute("data-blink", !(index % 2)), at))
    setTimeout(() => {
      blinking.delete(item)
      item.removeAttribute("data-blink")
      // A menu that went away during the blink (a submenu closing as the
      // page under it redraws): the choice still counts.
      if (!item.isConnected) {
        onSelect?.(event)
        // and the menu it came from is put away, as a choice always does.
        document.querySelectorAll('[role="menu"]').forEach((menu) => menu.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })))
        return
      }
      chosen.add(item)
      item.click()
    }, 160)
  }
}
