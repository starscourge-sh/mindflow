import { Node, mergeAttributes } from "@tiptap/core"
import { Plugin, PluginKey } from "@tiptap/pm/state"
import Suggestion, { type SuggestionOptions } from "@tiptap/suggestion"
import { vigil } from "@/lib/vigil"
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
  /** Quiet, at the end of the row: how often a tag is used. */
  hint?: string
  /** The label's own colour, as a tag has. */
  tint?: string
}

export interface NoteLinkOptions {
  /** Which notes match what has been typed after `@`. */
  findNotes: (query: string) => NoteSuggestion[] | Promise<NoteSuggestion[]>
  /** Clicking a link. The editor never navigates; it only reports. */
  onOpenNote?: (id: string) => void
  /** Supplied by the app, which owns the popup rendering. */
  render: NonNullable<SuggestionOptions<NoteSuggestion>["render"]>
  /** The same for the `#` menu, which needs its own, or Escape closes the wrong one. */
  tagRender?: SuggestionOptions<NoteSuggestion>["render"]
}

export const noteLinkPluginKey = new PluginKey("noteLink")
export const tagPluginKey = new PluginKey("tagSuggest")

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

  /**
   * Read back the one form that carries an id: `[[@id|name]]`, which an
   * imported vault's [[links]] are turned into once the page they point at is
   * here. A plain [[name]] stays words, since a name alone points nowhere.
   */
  markdownTokenizer: {
    name: "noteLink",
    level: "inline",
    start: (src: string) => src.indexOf("[[@"),
    tokenize: (src: string) => {
      const match = /^\[\[@([^|\]]+)\|([^\]]+)\]\]/.exec(src)
      return match ? { type: "noteLink", raw: match[0], id: match[1], label: match[2] } : undefined
    },
  },
  parseMarkdown: (token) => ({
    type: "noteLink",
    attrs: { id: String(token.id ?? ""), label: String(token.label ?? ""), key: "" },
  }),

  addProseMirrorPlugins() {
    const { findNotes, onOpenNote, render, tagRender } = this.options
    // The tags are read once as the `#` menu opens, then narrowed as you type.
    let tags: ReturnType<typeof vigil.tags> = Promise.resolve([])

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

      // `#` offers the tags already in use, most used first, so one is reused
      // rather than spelt a new way. It writes plain text: a tag is a word.
      Suggestion<NoteSuggestion>({
        editor: this.editor,
        char: "#",
        pluginKey: tagPluginKey,
        // Only at the end of a tag being typed: with the caret inside one
        // already written, offering to replace half of it splits it in two.
        allow: ({ state, range }) => !/[\w-]/.test(state.doc.textBetween(range.to, Math.min(range.to + 1, state.doc.content.size), "", "")),
        items: async ({ query }) => {
          if (!query) tags = vigil.tags()
          return (await tags)
            .filter(({ tag }) => tag.startsWith(query.toLowerCase()))
            .slice(0, 8)
            .map(({ tag, count, color }) => ({ id: tag, label: `#${tag}`, hint: String(count), tint: color ? `var(--tt-color-text-${color})` : undefined, group: "Tags" }))
        },
        command: ({ editor, range, props }) => {
          editor.chain().focus().insertContentAt(range, `#${props.id} `).run()
        },
        render: tagRender ?? render,
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
