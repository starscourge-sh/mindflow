import { Extension } from "@tiptap/core"
import type { NodeViewProps } from "@tiptap/react"
import { Plugin } from "@tiptap/pm/state"
import { Decoration, DecorationSet } from "@tiptap/pm/view"

/**
 * Show the selection on pictures caught inside a range.
 *
 * ProseMirror only marks a node as selected when it *is* the whole selection,
 * so a select-all leaves an image looking untouched while the text around it
 * is highlighted. Text is painted by the browser; an atom has nothing inside
 * to paint, so it needs the same class the single-node case already uses.
 */
export const SelectedNodes = Extension.create({
  name: "selectedNodes",

  addProseMirrorPlugins() {
    return [
      new Plugin({
        props: {
          decorations: (state) => {
            const { from, to, empty } = state.selection
            if (empty) return null

            const marked: Decoration[] = []
            state.doc.nodesBetween(from, to, (node, pos) => {
              if (node.isAtom && node.isBlock) {
                marked.push(
                  Decoration.node(
                    pos,
                    pos + node.nodeSize,
                    { class: "ProseMirror-selectednode" },
                    // Read back by `isNodeSelected`, because the class alone
                    // never reaches a React node view.
                    { inRange: true }
                  )
                )
              }
            })

            return marked.length ? DecorationSet.create(state.doc, marked) : null
          },
        },
      }),
    ]
  },
})

/**
 * Is this node view selected, on its own or inside a range?
 *
 * A React node view owns its own DOM, so the class the decoration above carries
 * never lands on it the way it lands on a plain `<img>`. It has to ask instead.
 * `selected` covers being the whole selection; the decoration covers being
 * swept up in a larger one, which is what a select-all does.
 */
export function isNodeSelected({
  selected,
  decorations,
}: Pick<NodeViewProps, "selected" | "decorations">): boolean {
  return selected || decorations.some((decoration) => decoration.spec?.inRange === true)
}
