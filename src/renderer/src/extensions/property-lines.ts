import { Extension } from "@tiptap/core"
import { Plugin, PluginKey, TextSelection } from "@tiptap/pm/state"
import { Decoration, DecorationSet } from "@tiptap/pm/view"
import type { Node as ProseMirrorNode } from "@tiptap/pm/model"

import { propertyLine } from "../../../main/property-words"
import { under } from "./block-room"

declare module "@tiptap/core" {
  interface Storage {
    propertyLines: { strip: HTMLElement }
  }
}

type PropertyLinesOptions = {
  /** Whether the note has a property strip, drawn under its first line (into `editor.storage.propertyLines.strip`). */
  strip: () => boolean
  /** The title is not in the words (an article's own title box): the strip goes before the first line, not after it. */
  top: () => boolean
  /** A `name:: value` line finished with Enter: true once it is kept as a property, and the line goes. */
  onProperty: ((name: string, value: string) => boolean) | null
}

/**
 * The strip's place: right after the first block, the title, drawn with the
 * page in its first frame. Never part of the words: the editor steps over it.
 */
/** Where the strip goes: after the title line, or at the very start when the title is kept apart, or when the note
 * opens with no line of words to be its title (a code block, a picture, a list): under that, it read as a footer. */
// An empty first line is no title either: the strip went under it, an empty line and then Properties.
const spot = (doc: ProseMirrorNode, top: boolean): number =>
  top || !["paragraph", "heading"].includes(doc.firstChild?.type.name ?? "") || (doc.childCount > 1 && !doc.firstChild?.textContent.trim()) ? 0 : doc.firstChild?.nodeSize ?? 0

function placed(doc: ProseMirrorNode, strip: HTMLElement | null, top: boolean): DecorationSet {
  if (!strip || !doc.firstChild) return DecorationSet.empty
  // A fresh holder each time, the one strip moved into it: handed the same
  // element twice, the editor took it out of the page as it put it back in,
  // read that as the note changing, drew again and froze the page doing so.
  const holder = (): HTMLElement => {
    const box = document.createElement("div")
    box.contentEditable = "false"
    box.className = "mf-property-holder"
    box.append(strip)
    return box
  }
  return DecorationSet.create(doc, [
    Decoration.widget(spot(doc, top), holder, { side: -1, key: "property-strip", ignoreSelection: true, stopEvent: () => true }),
  ])
}

/**
 * A note's properties, in the page: the strip under its title, and a line
 * typed as `Author:: Ursula Le Guin` that becomes a property on Enter (the
 * line empties, ready for the next; ⌘Z brings it back). `question :: answer`,
 * with its space, stays a review card.
 */
export const PropertyLines = Extension.create<PropertyLinesOptions, { strip: HTMLElement }>({
  name: "propertyLines",

  addOptions() {
    return { strip: () => false, top: () => false, onProperty: null }
  },

  // The strip's place is each editor's own, made with it, as the offer's is (offer-slot.ts says why): one element for
  // every editor a page made was taken by whichever drew last, and in a run from source (React's StrictMode) that
  // was a second editor put away unseen, so no note showed its properties.
  addStorage() {
    return { strip: Object.assign(document.createElement("div"), { className: "mf-property-strip", contentEditable: "false" }) }
  },

  addProseMirrorPlugins() {
    const key = new PluginKey<DecorationSet>("propertyLines")
    const options = this.options
    const { strip: box } = this.storage
    const strip = (): HTMLElement | null => (options.strip() ? box : null)
    return [
      new Plugin({
        key,
        state: {
          init: (_, state) => placed(state.doc, strip(), options.top()),
          // Kept while the title's end stays put: a new set for every keystroke redrew the strip each time.
          apply: (tr, set) => {
            if (!tr.docChanged) return set
            const kept = set.map(tr.mapping, tr.doc)
            const at = kept.find()[0]?.from
            return at !== undefined && tr.doc.firstChild && at === spot(tr.doc, options.top()) ? kept : placed(tr.doc, strip(), options.top())
          },
        },
        props: {
          decorations: (state) => under(state.doc, key.getState(state)),
          handleKeyDown: (view, event) => {
            if (event.key !== "Enter" || event.shiftKey || event.metaKey || event.altKey || event.isComposing || !options.onProperty) return false
            const { $from, empty } = view.state.selection
            // A line of its own, not the title, and the caret at its end.
            if (!empty || $from.depth !== 1 || (!options.top() && $from.index(0) === 0) || $from.parent.type.name !== "paragraph" || $from.parentOffset !== $from.parent.content.size) return false
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
