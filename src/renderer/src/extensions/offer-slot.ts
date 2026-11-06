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
    const key = new PluginKey<DecorationSet>("offerSlot")
    // One widget, kept in the plugin's state and moved only when the words change: nothing redraws on a
    // selection or while a note is read aloud, and the same element stays (its key).
    // Each placing gets a wrapper of its own, and the one box moves into it. Handing ProseMirror the same element for
    // two widgets (the old place and the new) let it take away the old one after drawing the new: the box vanished
    // from where it had just been put, ProseMirror read that as the page changing under it and drew again, for ever
    // (the main window froze: freeze-main-window logs of 6 Nov). Changes inside a widget's own element are ignored.
    const wrap = (): HTMLElement => {
      const holder = document.createElement("div")
      holder.className = "mf-offer-holder"
      holder.contentEditable = "false"
      holder.appendChild(box())
      return holder
    }
    const place = (doc: Parameters<typeof DecorationSet.create>[0]): DecorationSet =>
      DecorationSet.create(doc, [Decoration.widget(doc.content.size, wrap, { side: 1, key: "offer-slot", ignoreSelection: true, stopEvent: () => true })])
    return [
      new Plugin<DecorationSet>({
        key,
        state: { init: (_, state) => place(state.doc), apply: (tr, was) => (tr.docChanged ? place(tr.doc) : was) },
        props: { decorations: (state) => key.getState(state) },
      }),
    ]
  },
})
