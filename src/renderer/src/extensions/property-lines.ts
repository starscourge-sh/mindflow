import { Extension } from "@tiptap/core"
import { Plugin, PluginKey, TextSelection } from "@tiptap/pm/state"
import { Decoration, DecorationSet } from "@tiptap/pm/view"
import type { Node as ProseMirrorNode } from "@tiptap/pm/model"

import { propertyLine } from "../../../main/property-words"

export type PropertyLinesOptions = {
  /** Where the note's property strip is drawn: under its first line. Null draws none. */
  strip: () => HTMLElement | null
  /** A `name:: value` line finished with Enter: true once it is kept as a property, and the line goes. */
  onProperty: ((name: string, value: string) => boolean) | null
}

/**
 * The strip's place: right after the first block, the title, drawn with the
 * page in its first frame. Never part of the words: the editor steps over it.
 */
function placed(doc: ProseMirrorNode, strip: HTMLElement | null): DecorationSet {
  if (!strip || !doc.firstChild) return DecorationSet.empty
  return DecorationSet.create(doc, [
    Decoration.widget(doc.firstChild.nodeSize, () => strip, { side: -1, key: "property-strip", ignoreSelection: true, stopEvent: () => true }),
  ])
}

/**
 * A note's properties, in the page: the strip under its title, and a line
 * typed as `Author:: Ursula Le Guin` that becomes a property on Enter (the
 * line empties, ready for the next; ⌘Z brings it back). `question :: answer`,
 * with its space, stays a review card.
 */
export const PropertyLines = Extension.create<PropertyLinesOptions>({
  name: "propertyLines",

  addOptions() {
    return { strip: () => null, onProperty: null }
  },

  addProseMirrorPlugins() {
    const key = new PluginKey<DecorationSet>("propertyLines")
    const options = this.options
    return [
      new Plugin({
        key,
        state: {
          init: (_, state) => placed(state.doc, options.strip()),
          apply: (tr, set) => (tr.docChanged ? placed(tr.doc, options.strip()) : set),
        },
        props: {
          decorations: (state) => key.getState(state),
          handleKeyDown: (view, event) => {
            if (event.key !== "Enter" || event.shiftKey || event.metaKey || event.altKey || event.isComposing || !options.onProperty) return false
            const { $from, empty } = view.state.selection
            // A line of its own, not the title, and the caret at its end.
            if (!empty || $from.depth !== 1 || $from.index(0) === 0 || $from.parent.type.name !== "paragraph" || $from.parentOffset !== $from.parent.content.size) return false
            const found = propertyLine($from.parent.textContent)
            if (!found || !options.onProperty(found.name, found.value)) return false
            // The line goes and a fresh one stands in its place, the caret on it, ready for the next.
            const from = $from.before(1)
            const tr = view.state.tr.replaceWith(from, $from.after(1), view.state.schema.nodes.paragraph.create())
            view.dispatch(tr.setSelection(TextSelection.create(tr.doc, from + 1)).scrollIntoView())
            return true
          },
        },
      }),
    ]
  },
})
