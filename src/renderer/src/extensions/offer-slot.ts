import { Extension } from "@tiptap/core"
import { Plugin, PluginKey } from "@tiptap/pm/state"
import { Decoration, DecorationSet } from "@tiptap/pm/view"

/**
 * A place just after a note's last line, inside the page's own column, for one
 * quiet offer (note-offers.tsx) to be drawn into: never part of the words,
 * never saved, its clicks its own.
 */
export const OfferSlot = Extension.create<{ box: () => HTMLElement }>({
  name: "offerSlot",
  addOptions() {
    return { box: () => document.createElement("div") }
  },
  addProseMirrorPlugins() {
    const { box } = this.options
    const key = new PluginKey("offerSlot")
    return [
      new Plugin({
        key,
        props: {
          decorations: (state) => DecorationSet.create(state.doc, [Decoration.widget(state.doc.content.size, box, { side: 1, key: "offer-slot", ignoreSelection: true, stopEvent: () => true })]),
        },
      }),
    ]
  },
})
