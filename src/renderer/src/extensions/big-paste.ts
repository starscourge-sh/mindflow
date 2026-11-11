import { Extension } from "@tiptap/core"
import { Plugin } from "@tiptap/pm/state"

/** Past this many characters (about 8,000 words, some twenty pages) a paste or a drop is a note of its own, not a thought for the box. */
export const BIG_PASTE = 50_000

/** The words of a page given only as HTML: read without drawing it. */
const wordsOf = (html: string): string => new DOMParser().parseFromString(html, "text/html").body.textContent ?? ""

/**
 * A whole long note pasted or dropped into quick capture is handed over as
 * its words, before the editor reads any of it.
 *
 * Read in as any paste is, a 930,000 character note from Obsidian was turned
 * into blocks, drawn in a box three lines tall and written to the draft on
 * every change: the box froze for seconds and then stuttered on each key.
 * Past `BIG_PASTE` characters the words go to `onBig` instead (the box keeps
 * them as a note of their own, a breath at a time), and the box is left as it
 * was, free to type in throughout. Files, and blocks moved inside the note,
 * are never taken.
 */
export const BigPaste = Extension.create<{ onBig: ((text: string) => void) | null }>({
  name: "bigPaste",
  // Before every other reader of a paste or a drop.
  priority: 1000,
  addOptions: () => ({ onBig: null }),
  addProseMirrorPlugins() {
    const take = (data: DataTransfer | null, event: Event): boolean => {
      const onBig = this.options.onBig
      if (!onBig || !data || data.files.length) return false
      const plain = data.getData("text/plain")
      // Markdown as it was written when there is any; a long page that came with no plain words, or only its
      // address, is read for its own (a short one heavy with markup is under the mark once read, and pastes as ever).
      const text = plain.length >= BIG_PASTE ? plain : data.getData("text/html").length >= BIG_PASTE ? wordsOf(data.getData("text/html")) : ""
      if (text.length < BIG_PASTE) return false
      event.preventDefault()
      onBig(text)
      return true
    }
    return [
      new Plugin({
        props: {
          handleDOMEvents: {
            paste: (_view, event) => take(event.clipboardData, event),
            // `dragging` is the editor's own block on the move.
            drop: (view, event) => !view.dragging && take(event.dataTransfer, event),
          },
        },
      }),
    ]
  },
})
