import { Extension, type Editor } from "@tiptap/core"
import { Plugin, PluginKey } from "@tiptap/pm/state"
import { Decoration, DecorationSet } from "@tiptap/pm/view"

declare module "@tiptap/core" {
  interface Storage {
    offerSlot: { box: HTMLElement }
  }
}

/** Some words in the note, as document positions. */
export type Words = { from: number; to: number }

const key = new PluginKey<DecorationSet>("offerSlot")

/**
 * The words in the note an offer is about (the name it mentions, the people it names), lit while the offer is pointed
 * at or has the keys, in the light the editor gives a found word (haligtree-editor.scss); none to put the light out.
 * Never an edit: nothing to undo, nothing saved. The words changing puts it out too.
 */
export const lightWords = (editor: Editor, words: Words[]): void => {
  if (editor.isDestroyed || !editor.storage.offerSlot) return
  // Already out, and asked out again (the pointer leaving a line with nothing lit): nothing to draw.
  if (!words.length && !key.getState(editor.state)?.find(undefined, undefined, (spec) => !!spec.lit).length) return
  editor.view.dispatch(editor.state.tr.setMeta(key, words))
}

/**
 * A place just after a note's last line, inside the page's own column, for one
 * quiet offer (note-offers.tsx) to be drawn into: never part of the words,
 * never saved, its clicks its own.
 *
 * The place (`editor.storage.offerSlot.box`) is each editor's own, made with it. It was once one element for every
 * editor a page made, and whichever drew last took it into its own page: React's StrictMode (a run from source,
 * `npm run dev`) makes each page's editor twice and puts the second away, so there the offer was drawn into the
 * put-away editor's page, which is never shown, and no offer was ever seen.
 */
export const OfferSlot = Extension.create<Record<string, never>, { box: HTMLElement }>({
  name: "offerSlot",
  addStorage() {
    return { box: Object.assign(document.createElement("div"), { className: "mf-offer-slot", contentEditable: "false" }) }
  },
  addProseMirrorPlugins() {
    const { box } = this.storage
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
      holder.appendChild(box)
      return holder
    }
    // The widget keeps its key, so lighting words beside it never draws it again.
    const place = (doc: Parameters<typeof DecorationSet.create>[0], lit: Words[] = []): DecorationSet =>
      DecorationSet.create(doc, [
        Decoration.widget(doc.content.size, wrap, { side: 1, key: "offer-slot", ignoreSelection: true, stopEvent: () => true }),
        ...lit.filter((one) => one.from < one.to && one.to <= doc.content.size).map((one) => Decoration.inline(one.from, one.to, { class: "mf-offer-lit" }, { lit: true })),
      ])
    return [
      new Plugin<DecorationSet>({
        key,
        state: {
          init: (_, state) => place(state.doc),
          apply: (tr, was) => {
            const lit = tr.getMeta(key) as Words[] | undefined
            return lit ? place(tr.doc, lit) : tr.docChanged ? place(tr.doc) : was
          },
        },
        props: { decorations: (state) => key.getState(state) },
      }),
    ]
  },
})
