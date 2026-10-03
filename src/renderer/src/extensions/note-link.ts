import { Node, mergeAttributes } from "@tiptap/core"
import { Plugin, PluginKey } from "@tiptap/pm/state"
import Suggestion, { type SuggestionOptions } from "@tiptap/suggestion"
import type { ReactNode } from "react"

/** One note the `@` menu can offer. The app decides what is findable. */
export interface NoteSuggestion {
  id: string
  label: string
  /** A short handle shown before the label, like `MF-30`. */
  key?: string
  /** Drawn at the start of the row in the menu, not in the link. */
  icon?: ReactNode
  /** The menu's heading for this row. */
  group?: string
}

export interface NoteLinkOptions {
  /** Which notes match what has been typed after `@`. */
  findNotes: (query: string) => NoteSuggestion[] | Promise<NoteSuggestion[]>
  /** Clicking a link. The editor never navigates; it only reports. */
  onOpenNote?: (id: string) => void
  /** Supplied by the app, which owns the popup rendering. */
  render: NonNullable<SuggestionOptions<NoteSuggestion>["render"]>
}

export const noteLinkPluginKey = new PluginKey("noteLink")

/**
 * A link to another note, typed with `@`.
 *
 * It behaves like a link because that is what it is: click it and you are
 * taken there. The editor does not know what a note is or how to open one, so
 * it holds an id and hands it back. Resolving that id to a title is the app's
 * job too, which is why the label is stored alongside it: a link has to read
 * as something while the note it points at is nowhere in reach.
 */
export const NoteLink = Node.create<NoteLinkOptions>({
  name: "noteLink",
  group: "inline",
  inline: true,
  atom: true,
  selectable: false,

  addOptions() {
    return { findNotes: () => [], onOpenNote: undefined, render: () => ({}) }
  },

  addAttributes() {
    return {
      // `rendered: false` on both: the tag below writes them itself, and the
      // default renderer would otherwise emit each one again under its bare
      // name, so the link carried `id=` beside `data-note=`.
      id: {
        default: "",
        rendered: false,
        parseHTML: (el) => el.getAttribute("data-note") ?? "",
      },
      // The title as it was when the link was made. Stale by design: it keeps
      // a note readable when the note it points at has been renamed or lost.
      label: {
        default: "",
        rendered: false,
        parseHTML: (el) =>
          el.querySelector(".tiptap-note-link-label")?.textContent ??
          (el.textContent ?? "").replace(/^@/, ""),
      },
      key: {
        default: "",
        rendered: false,
        parseHTML: (el) => el.getAttribute("data-key") ?? "",
      },
    }
  },

  parseHTML() {
    return [{ tag: "a[data-note]", priority: 100 }]
  },

  // With a key it reads the way Linear's does, `MF-30 hey jude`. Without one it
  // is the plain `@title` it always was.
  renderHTML({ HTMLAttributes, node }) {
    const { id, key, label } = node.attrs
    const attrs = mergeAttributes(HTMLAttributes, {
      "data-note": id,
      "data-key": key || null,
      class: "tiptap-note-link",
    })
    if (!key) return ["a", attrs, `@${label}`]
    return [
      "a",
      attrs,
      ["span", { class: "tiptap-note-link-key" }, key],
      ["span", { class: "tiptap-note-link-label" }, label],
    ]
  },

  /**
   * A wiki link, which is what another note is called everywhere else. The id
   * means nothing outside this app, so the label is the whole of it. Without
   * this the serializer has no renderer for the node and writes an empty
   * string: the link left a markdown export silently.
   */
  renderMarkdown(node): string {
    const { label, id } = (node.attrs ?? {}) as { label?: string; id?: string }
    return `[[${label || id || ""}]]`
  },

  addProseMirrorPlugins() {
    const { findNotes, onOpenNote, render } = this.options

    return [
      Suggestion<NoteSuggestion>({
        editor: this.editor,
        char: "@",
        pluginKey: noteLinkPluginKey,
        items: ({ query }) => findNotes(query),
        command: ({ editor, range, props }) => {
          editor
            .chain()
            .focus()
            .insertContentAt(range, [
              { type: "noteLink", attrs: { id: props.id, label: props.label, key: props.key ?? "" } },
              { type: "text", text: " " },
            ])
            .run()
        },
        render,
      }),

      // A link is for following, so a plain click follows it rather than
      // putting a caret inside a node with nothing to type in.
      new Plugin({
        props: {
          handleClickOn: (_view, _pos, node) => {
            if (node.type.name !== "noteLink" || !onOpenNote) return false
            onOpenNote(node.attrs.id)
            return true
          },
        },
      }),
    ]
  },
})
