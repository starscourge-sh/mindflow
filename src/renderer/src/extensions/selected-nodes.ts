import { Extension } from "@tiptap/core"
import type { NodeViewProps } from "@tiptap/react"
import { NodeSelection, Plugin, TextSelection } from "@tiptap/pm/state"
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
    // Worked out once per document and selection: the view asks on every
    // update, and a full selection of a long note is thousands of blocks to walk.
    let last: { doc: unknown; from: number; to: number; set: DecorationSet | null } | null = null
    return [
      new Plugin({
        props: {
          /**
           * Typing while a picture (or a card, a file, a drawing) is picked
           * writes on a new line under it, never over it: the picked block
           * is easy to miss, and a letter typed replaced it (the tracker:
           * "my typing replaces it: rather type below the image").
           */
          handleTextInput: (view, _from, _to, text) => {
            const { selection, schema } = view.state
            if (!(selection instanceof NodeSelection) || !selection.node.isBlock || !selection.node.isAtom) return false
            const paragraph = schema.nodes.paragraph
            const $after = view.state.doc.resolve(selection.to)
            if (!paragraph || !$after.parent.canReplaceWith($after.index(), $after.index(), paragraph)) return false
            const tr = view.state.tr.insert(selection.to, paragraph.create(null, schema.text(text)))
            tr.setSelection(TextSelection.create(tr.doc, selection.to + 1 + text.length))
            view.dispatch(tr.scrollIntoView())
            return true
          },
          decorations: (state) => {
            const { from, to, empty } = state.selection
            if (empty) return null
            if (last && last.doc === state.doc && last.from === from && last.to === to) return last.set

            const marked: Decoration[] = []
            // Blocks only: a picture is never inside a line of words, so a line's own words are not walked (⌘A of a
            // long note walked every word of it).
            state.doc.nodesBetween(from, to, (node, pos) => {
              if (node.isTextblock) return false
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

            const set = marked.length ? DecorationSet.create(state.doc, marked) : null
            last = { doc: state.doc, from, to, set }
            return set
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

const inRange = (decorations: readonly { spec?: { inRange?: boolean } }[]): boolean =>
  decorations.some((decoration) => decoration.spec?.inRange === true)

/**
 * A React node view's `update`, for one that asks `isNodeSelected`.
 *
 * Left to itself, TipTap redraws a node view only when its node changes, and
 * keeps new decorations without telling it. So a block swept up in a range
 * kept its picked outline (and its toolbar) long after the caret moved on, or
 * the other block in the range was deleted. This redraws it whenever the node
 * changes or it goes into or out of a range, and not on every other keystroke.
 */
export function redrawOnRange({
  oldNode,
  newNode,
  oldDecorations,
  newDecorations,
  updateProps,
}: {
  oldNode: { type: unknown }
  newNode: { type: unknown }
  oldDecorations: readonly { spec?: { inRange?: boolean } }[]
  newDecorations: readonly { spec?: { inRange?: boolean } }[]
  updateProps: () => void
}): boolean {
  if (newNode.type !== oldNode.type) return false
  if (newNode !== oldNode || inRange(oldDecorations) !== inRange(newDecorations)) updateProps()
  return true
}
