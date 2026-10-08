import { Extension } from "@tiptap/core"
import { Plugin } from "@tiptap/pm/state"
import type { EditorView } from "@tiptap/pm/view"

/** How far down the view the line being written is held: a little above the middle. */
const HEIGHT = 0.4

/** How soon after a key the change counts as typed, not a paste from a menu or a sync. */
const TYPED_MS = 400

const still = (): boolean =>
  document.documentElement.dataset.motion === "off" || matchMedia("(prefers-reduced-motion: reduce)").matches

/** The nearest box around the editor that scrolls up and down. */
function scrollerOf(dom: HTMLElement): HTMLElement | null {
  for (let at = dom.parentElement; at; at = at.parentElement) {
    const { overflowY } = getComputedStyle(at)
    if ((overflowY === "auto" || overflowY === "scroll") && at.scrollHeight > at.clientHeight) return at
  }
  return null
}

/**
 * Typewriter scrolling: while you type, the line you are on stays at the same
 * height, 40% down the view, and the page moves under it instead of the caret
 * walking down the screen.
 *
 * Only for what you type. Clicking, selecting, scrolling by hand, arrow keys
 * and Vim's normal-mode moves leave the page where it is, so it never fights
 * you for the view; the next letter you type brings the line back. It takes
 * over ProseMirror's own "scroll the caret into view" only for a typed change,
 * so the two never pull against each other. With Motion off it jumps.
 */
export const Typewriter = Extension.create<{ on: () => boolean }>({
  name: "typewriter",

  addOptions() {
    return { on: () => false }
  },

  addProseMirrorPlugins() {
    const { on } = this.options
    let typedAt = 0
    let changed = false
    let scroller: HTMLElement | null = null

    let frame = 0
    let last = 0
    let following: EditorView | null = null

    // Its own glide, a step a frame, rather than the browser's smooth scroll:
    // a letter the browser types in itself, or another part of the editor
    // nudging the scroll, stops one of those dead halfway. Measured again each
    // frame, so keys typed during it are caught up with. With Motion off, one jump.
    const glide = (now: number): void => {
      frame = 0
      const view = following
      if (!scroller || !view || view.isDestroyed) return
      const box = scroller.getBoundingClientRect()
      const caret = view.coordsAtPos(view.state.selection.head)
      const delta = caret.top - (box.top + scroller.clientHeight * HEIGHT)
      const gap = Math.max(0, Math.min(scroller.scrollTop + delta, scroller.scrollHeight - scroller.clientHeight)) - scroller.scrollTop
      if (Math.abs(gap) < 1) return
      const eased = gap * (1 - Math.exp(-(last ? Math.min(now - last, 50) : 16) / 70))
      // At least a pixel a frame, so it never stalls on a fraction the screen cannot show.
      const move = still() || Math.abs(gap) < 2 ? gap : Math.sign(gap) * Math.max(1, Math.abs(eased))
      last = now
      scroller.scrollTo({ top: scroller.scrollTop + move, behavior: "instant" })
      frame = requestAnimationFrame(glide)
    }

    const stop = (): void => {
      cancelAnimationFrame(frame)
      frame = 0
    }

    const follow = (view: EditorView): boolean => {
      if (!view.state.selection.empty) return false
      // Vim's normal mode is for moving around, not typing.
      const mode = view.dom.getAttribute("data-vim-mode")
      if (mode && mode !== "insert") return false
      if (!scroller || !scroller.isConnected || !scroller.contains(view.dom) || scroller.scrollHeight <= scroller.clientHeight) scroller = scrollerOf(view.dom)
      if (!scroller) return false
      following = view
      // Next frame, once the browser has done with the key; one glide however fast the keys come.
      if (!frame) {
        last = 0
        frame = requestAnimationFrame(glide)
      }
      return true
    }

    const typed = (): boolean => {
      typedAt = performance.now()
      return false
    }

    return [
      new Plugin({
        // Plugin views update before ProseMirror scrolls, so whether this
        // update changed the words is known by the time it asks.
        view: () => ({
          update: (view, before) => {
            changed = view.state.doc !== before.doc
          },
          destroy: () => {
            stop()
            following = null
          },
        }),
        props: {
          handleDOMEvents: {
            keydown: typed,
            // Dictation and accented letters arrive without a keydown of their own.
            beforeinput: typed,
            // Your own hand on the page stops the glide where it is.
            pointerdown: () => {
              typedAt = 0
              stop()
              return false
            },
            wheel: () => {
              stop()
              return false
            },
          },
          handleScrollToSelection: (view) => {
            if (!on() || !changed || performance.now() - typedAt > TYPED_MS) return false
            return follow(view)
          },
        },
      }),
    ]
  },
})
