import { Extension } from "@tiptap/core"
import { Plugin, type EditorState } from "@tiptap/pm/state"

/** Past this many positions (about 60,000 words) a document counts as long. */
const LONG = 200_000
const long = (state: EditorState): boolean => state.doc.content.size > LONG

/**
 * A very long document opens quickly.
 *
 * Each code block and callout, as it is first drawn, asks the browser where
 * the selection is, and the browser lays out the whole document to answer.
 * Once per block, on a megabyte note, that was most of a minute. So while
 * those blocks are being drawn the document is taken off the page, where
 * there is nothing to lay out, and put back straight after.
 *
 * It is marked too, so the stylesheet lays out only the blocks near the screen.
 */
export const LongDocument = Extension.create({
  name: "longDocument",

  addProseMirrorPlugins() {
    const editor = this.editor
    return [
      new Plugin({
        props: {
          attributes: (state): Record<string, string> => (long(state) ? { "data-long": "" } : {}),
        },
        view: (view) => {
          let views = view.props.nodeViews
          let away = false
          const aside = (): void => {
            const parent = view.dom.parentNode
            if (away || !parent || !view.dom.isConnected) return
            const next = view.dom.nextSibling
            away = true
            view.dom.remove()
            setTimeout(() => {
              away = false
              if (!view.isDestroyed && !view.dom.parentNode) parent.insertBefore(view.dom, next?.parentNode === parent ? next : null)
              // Asked to take the caret while it was away.
              if (editor.options.autofocus && !view.hasFocus()) editor.commands.focus(editor.options.autofocus)
            })
          }
          return {
            // When its blocks are drawn: on mounting, or when a page read from
            // Markdown arrives after the editor was made.
            update: (_view, previous) => {
              const drawn = view.props.nodeViews !== views
              views = view.props.nodeViews
              if (long(view.state) && (drawn || !long(previous))) aside()
            },
          }
        },
      }),
    ]
  },
})
