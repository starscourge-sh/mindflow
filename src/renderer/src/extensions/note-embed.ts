import { InputRule, Node, mergeAttributes } from "@tiptap/core"
import { ReactNodeViewRenderer } from "@tiptap/react"
import { Plugin } from "@tiptap/pm/state"

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
 * a picture. "Share with a new page" leaves one where the words were.
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
      // One line of it only, by its lasting name (block-ids.ts): a block reference.
      block: { default: "", rendered: false, parseHTML: (el) => el.getAttribute("data-block") ?? "" },
    }
  },

  parseHTML() {
    return [{ tag: "div[data-note-embed]" }]
  },

  renderHTML({ HTMLAttributes, node }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-note-embed": node.attrs.id, "data-label": node.attrs.label || null, "data-block": node.attrs.block || null, class: "note-embed" }), `![[${node.attrs.label || node.attrs.id}${node.attrs.block ? `#^${node.attrs.block}` : ""}]]`]
  },

  renderMarkdown(node): string {
    const { label, id, block } = (node.attrs ?? {}) as Record<string, string | undefined>
    return `![[${label || id || ""}${block ? `#^${block}` : ""}]]\n\n`
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

  // A line copied with "Copy embed of this line" (`![[@id#^line|Name]]`),
  // pasted on its own: the line shown here, live, not the text.
  addProseMirrorPlugins() {
    const type = this.type
    return [
      new Plugin({
        props: {
          handlePaste: (view, event) => {
            const text = event.clipboardData?.getData("text/plain")?.trim() ?? ""
            const found = /^!\[\[@([^#|\]]+)#\^([A-Za-z0-9-]+)(?:\|([^\]]*))?\]\]$/.exec(text)
            if (!found) return false
            const node = type.create({ id: found[1], block: found[2], label: found[3] ?? "" })
            const { $from } = view.state.selection
            // On an empty line, in its place; else after the line the caret is in.
            const tr = $from.parent.type.name === "paragraph" && !$from.parent.content.size && $from.depth > 0
              ? view.state.tr.replaceWith($from.before(), $from.after(), node)
              : view.state.tr.insert($from.depth > 0 ? $from.after(1) : $from.pos, node)
            view.dispatch(tr.scrollIntoView())
            return true
          },
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
