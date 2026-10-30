/**
 * To-dos written by other apps, read as this app's checklist items, ticked or not. Notion marks a to-do with an
 * empty `<div class="checkbox checkbox-on">` (or `checkbox-off`) and its text with `to-do-children-checked`; web
 * pages, GitHub and Apple Notes with an `<input type="checkbox">` at the start of the item; some apps with
 * `aria-checked` or a `checked` class on the item itself. Anything else stays a bullet.
 */

/** The item's own tick box, not one in a list nested inside it. */
const ownBox = (item: Element): Element | null => {
  for (const box of item.querySelectorAll('input[type="checkbox"], .checkbox, [role="checkbox"]')) if (box.closest("li") === item) return box
  return null
}

/** Whether a list item is a to-do, and if so whether it is ticked: null for a plain item. */
export function toDoState(item: Element): boolean | null {
  if (item.getAttribute("data-type") === "taskItem") return null
  const box = ownBox(item)
  if (box) {
    if (box instanceof HTMLInputElement) return box.checked || box.hasAttribute("checked")
    return box.classList.contains("checkbox-on") || box.getAttribute("aria-checked") === "true"
  }
  const said = item.getAttribute("aria-checked") ?? item.getAttribute("data-checked")
  if (said !== null) return said === "true" || said === ""
  if (/(^|[\s-])(checked|unchecked|done|todo|to-do)($|[\s-])/i.test(item.className)) return /(^|[\s-])(checked|done)($|[\s-])/i.test(item.className) && !/unchecked/i.test(item.className)
  return null
}

/** A list from another app that holds to-dos: every item of its own is one. */
export function isToDoList(list: Element): boolean {
  if (list.getAttribute("data-type") === "taskList") return false
  const items = [...list.children].filter((child) => child.tagName === "LI")
  return list.classList.contains("to-do-list") || (items.length > 0 && items.every((item) => toDoState(item) !== null))
}
