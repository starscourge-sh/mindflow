import type { ReactNode } from "react"
import { createRoot, type Root } from "react-dom/client"

/** Sent to a block's `from` element to draw its controls now: it was picked, or the caret came into it (extensions/block-controls.ts). */
export const WAKE = "mf-wake-controls"

/**
 * React drawn into `host` only once the pointer (or the keys, or the caret)
 * first come into `from`. For controls a block shows on hover: a long note's 150 code blocks
 * drew 150 menus nobody had pointed at, and that held the note from showing.
 * `redraw` draws it again with what `draw` returns now, once it is there.
 */
export function lazyRoot(host: HTMLElement, from: HTMLElement, draw: () => ReactNode): { redraw: () => void; destroy: () => void } {
  let root: Root | null = null
  const mount = (): void => {
    stop()
    root = createRoot(host)
    root.render(draw())
  }
  const stop = (): void => {
    from.removeEventListener("pointerenter", mount)
    from.removeEventListener("focusin", mount)
    from.removeEventListener(WAKE, mount)
  }
  from.addEventListener("pointerenter", mount)
  from.addEventListener("focusin", mount)
  from.addEventListener(WAKE, mount)
  return {
    redraw: () => root?.render(draw()),
    destroy: () => {
      stop()
      const gone = root
      root = null
      // Not inside ProseMirror's own update, which may be inside a React render.
      if (gone) setTimeout(() => gone.unmount())
    },
  }
}
