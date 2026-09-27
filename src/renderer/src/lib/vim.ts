/**
 * Whether vim keys are on, for every editor on the page at once.
 *
 * A page can hold several editors - a title, a body, a comment - and a vim
 * user wants the keys in all of them or none. So the switch is one setting
 * rather than a prop each of them carries, kept the same way the theme is.
 *
 * The `vim` prop still wins where it is passed: a host that wants one field
 * left alone says so.
 */

const listeners = new Set<(on: boolean) => void>()

/** On unless it was turned off, which is the default a vim user wants. */
export function currentVim(): boolean {
  return localStorage.getItem("vim") !== "off"
}

/** Turn it on or off everywhere, and remember it. */
export function setVim(on: boolean): void {
  localStorage.setItem("vim", on ? "on" : "off")
  for (const listener of listeners) listener(on)
}

/** Follow it. Returns the unsubscribe, for an effect to hand back. */
export function onVimChange(listener: (on: boolean) => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
