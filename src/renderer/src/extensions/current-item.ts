import { Extension } from "@tiptap/core"
import { Plugin } from "@tiptap/pm/state"
import { Decoration, DecorationSet } from "@tiptap/pm/view"

const ITEMS = ["listItem", "taskItem"]

/**
 * Mark the list item the caret is in.
 *
 * CSS cannot do this on its own. A contenteditable keeps focus on the editor
 * root, which is an ancestor of the item rather than a descendant, so
 * `:focus-within` never matches it, and there is no selector for where the
 * caret sits.
 *
 * The innermost item only. Walking up from the caret finds every list item
 * wrapping it, and lighting all of them would trail a nested bullet's marker
 * back up through its parents.
 */
export const CurrentItem = Extension.create({
  name: "currentItem",

  addProseMirrorPlugins() {
    return [
      new Plugin({
        props: {
          decorations: (state) => {
            const { $from, empty } = state.selection
            // A range is a selection, not a place, and the browser already
            // paints it. Only a resting caret has a current item.
            if (!empty) return null

            for (let depth = $from.depth; depth > 0; depth--) {
              const node = $from.node(depth)
              if (!ITEMS.includes(node.type.name)) continue

              const from = $from.before(depth)
              return DecorationSet.create(state.doc, [
                Decoration.node(from, from + node.nodeSize, { class: "is-current" }),
              ])
            }
            return null
          },
        },
      }),
    ]
  },
})
