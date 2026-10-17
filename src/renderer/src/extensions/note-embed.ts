import { InputRule, Node, mergeAttributes } from "@tiptap/core"
import { ReactNodeViewRenderer } from "@tiptap/react"

import { cleanRef } from "../../../main/embeds"
import { NoteEmbedView } from "@/components/note-link/note-embed-view"

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    noteEmbed: {
      /** Another note shown here whole, live and editable where it lives. */
      insertNoteEmbed: (attrs: { id: string; label?: string }) => ReturnType
    }
  }
}

/**
 * One note shown inside another without a copy (transclusion): the block
 * holds only the note's id, and draws that note's own words, editable in
 * place and saved to it, so every place it is shown is the same note. Typed
 * `![[Name]]` (Obsidian's way) for a note, never a file: `![[cat.png]]` stays
 * a picture. "Turn into page" can leave one where the words were.
 */
export const NoteEmbed = Node.create({
  name: "noteEmbed",
  group: "block",
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      id: { default: "", rendered: false, parseHTML: (el) => el.getAttribute("data-note-embed") ?? "" },
      // The name it had when it was shown here: what the block says while the note is out of reach.
      label: { default: "", rendered: false, parseHTML: (el) => el.getAttribute("data-label") ?? "" },
    }
  },

  parseHTML() {
    return [{ tag: "div[data-note-embed]" }]
  },

  renderHTML({ HTMLAttributes, node }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-note-embed": node.attrs.id, "data-label": node.attrs.label || null, class: "note-embed" }), `![[${node.attrs.label || node.attrs.id}]]`]
  },

  renderMarkdown(node): string {
    const { label, id } = (node.attrs ?? {}) as Record<string, string | undefined>
    return `![[${label || id || ""}]]\n\n`
  },

  addCommands() {
    return {
      insertNoteEmbed:
        (attrs) =>
        ({ commands }) =>
          commands.insertContent({ type: this.name, attrs }),
    }
  },

  addInputRules() {
    return [
      new InputRule({
        find: /^!\[\[([^[\]|#]+)\]\]$/,
        handler: ({ state, range, match }) => {
          const label = match[1].trim()
          // A file is a picture or a card (obsidian-embeds.ts), not a note.
          if (!label || cleanRef(label)) return null
          const $from = state.doc.resolve(range.from)
          // A line of its own: nothing before it, nothing after the caret.
          if ($from.parent.type.name !== "paragraph" || $from.parentOffset !== 0 || range.to < $from.end()) return null
          state.tr.replaceWith($from.before(), $from.after(), this.type.create({ id: "", label }))
          return undefined
        },
      }),
    ]
  },

  addNodeView() {
    return ReactNodeViewRenderer(NoteEmbedView, {
      // The note inside owns its keys and clicks: typing there is typing in that note.
      stopEvent: ({ event }) => (event.target as HTMLElement | null)?.closest(".note-embed-body") != null,
    })
  },
})
