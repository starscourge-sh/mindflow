import { useEffect, useState } from "react"

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

/** Off unless it was turned on: plain keys are what a new user expects. */
export function currentVim(): boolean {
  return localStorage.getItem("vim") === "on"
}

/**
 * Once, when nothing is stored yet: Vim used to be on for everyone, so an
 * install that already has notes typed before today keeps it on. A new one
 * stores off, so it is never asked again.
 */
export async function settleVim(): Promise<void> {
  if (localStorage.getItem("vim") !== null) return
  // The sandbox's notes are someone else's, written long before today: they say nothing
  // about whether you used Vim, so it starts with plain keys, as a new install does.
  if (new URLSearchParams(location.search).has("sandbox")) return setVim(false)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const captures = await window.api.captures.list().catch(() => null)
  if (!captures || localStorage.getItem("vim") !== null) return
  setVim(captures.some((one) => !one.source && new Date(one.capturedAt) < today))
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

// Turned in another window, the box's menu or Settings: this one follows too.
window.addEventListener("storage", (event) => {
  if (event.key === "vim") for (const listener of listeners) listener(event.newValue === "on")
})

/** Whether vim keys are on, kept up to date as they are turned on or off anywhere. */
export function useVim(): boolean {
  const [on, setOn] = useState(currentVim)
  useEffect(() => onVimChange(setOn), [])
  return on
}
