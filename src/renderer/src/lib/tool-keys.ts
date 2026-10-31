import { useEffect, useRef } from 'react'

/**
 * Who a key goes to, in one order for the whole window:
 *   1. a text field with the caret gets its letters (each tool checks that itself);
 *   2. then a tool that is up with keys of its own (the reader's bar after a
 *      pick or a snip: C, ⇧C, K, H, L, the colour digits; Review's letters;
 *      a toast's own key);
 *   3. then the page;
 *   4. then the app-wide keys (C for a new capture, G then a letter).
 * The app-wide dispatcher (home.tsx) asks `toolTakes` before its own keys, so
 * C on the reader's bar makes the card and never also opens quick capture.
 * The one exception is the key after G: G then a letter is a place to go,
 * so that letter goes to the tools only when it names no place.
 * Where it does not ask (a dialog held over the page), the key still reaches
 * the tool once it has been through the page. The newest tool is asked first;
 * a tool says whether the key was one of its.
 */
type Take = (event: KeyboardEvent) => boolean
const tools: Take[] = []

export function toolTakes(event: KeyboardEvent): boolean {
  if (event.defaultPrevented) return false
  for (let i = tools.length - 1; i >= 0; i--) {
    if (!tools[i](event)) continue
    event.preventDefault()
    event.stopPropagation()
    return true
  }
  return false
}

/** A handler that says a key was its by preventing its default, as a tool's: asked as one. */
export const byDefault = (on: (event: KeyboardEvent) => void): Take => (event) => (on(event), event.defaultPrevented)

let listening = false

/** A tool's keys while `take` is given: asked by the app-wide dispatcher before its own. */
export function useToolKeys(take: Take | null): void {
  const now = useRef(take)
  now.current = take
  const on = !!take
  useEffect(() => {
    if (!on) return
    if (!listening) (listening = true, window.addEventListener('keydown', toolTakes))
    const one: Take = (event) => !!now.current?.(event)
    tools.push(one)
    return () => void tools.splice(tools.indexOf(one), 1)
  }, [on])
}
