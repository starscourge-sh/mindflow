import { InputRule, Node, mergeAttributes } from "@tiptap/core"
import { ReactNodeViewRenderer } from "@tiptap/react"

import { CalloutView } from "@/components/callout/callout-view"
import type { BlockColor } from "@/extensions/block-color"

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    callout: {
      /** Wrap the block at the cursor, or unwrap it if it is already one. */
      toggleCallout: () => ReturnType
    }
  }
}

/** Obsidian's callout types, as an icon and a colour each; any other is a note. */
const TYPES: Record<string, [string, BlockColor]> = {
  note: ["📝", "blue"], info: ["ℹ️", "blue"], abstract: ["📋", "blue"], summary: ["📋", "blue"], tldr: ["📋", "blue"],
  todo: ["☑️", "blue"], tip: ["💡", "green"], hint: ["💡", "green"], important: ["🔥", "orange"], success: ["✅", "green"],
  check: ["✅", "green"], done: ["✅", "green"], question: ["❓", "purple"], help: ["❓", "purple"], faq: ["❓", "purple"],
  warning: ["⚠️", "orange"], caution: ["⚠️", "orange"], attention: ["⚠️", "orange"], failure: ["❌", "red"], fail: ["❌", "red"],
  missing: ["❌", "red"], danger: ["⛔", "red"], error: ["⛔", "red"], bug: ["🐞", "red"], example: ["🧪", "purple"],
  quote: ["💬", "gray"], cite: ["💬", "gray"],
}

/**
 * An aside: a tinted box with an icon, holding whatever you put in it.
 *
 * A container rather than a styled paragraph, so a callout can hold a list, a
 * code block or another paragraph - which is the difference between an aside
 * and a highlighted line.
 *
 * The icon is text, because an emoji is text. Nothing here needs an image, a
 * sprite or a registry of names to look up.
 */
export const Callout = Node.create({
  name: "callout",
  group: "block",
  content: "block+",
  // Pasting into a callout fills it rather than replacing it, the way a
  // blockquote behaves.
  defining: true,

  addAttributes() {
    return {
      icon: {
        default: "💡",
        parseHTML: (element) => element.getAttribute("data-icon"),
        renderHTML: ({ icon }) => ({ "data-icon": icon }),
      },
      // `data-accent`, not `data-color`: block colour already owns that one for
      // a block's text colour, and a callout wearing it had every word inside
      // painted to match its border.
      color: {
        default: "blue" as BlockColor,
        parseHTML: (element) => element.getAttribute("data-accent"),
        renderHTML: ({ color }) => ({ "data-accent": color }),
      },
    }
  },

  parseHTML() {
    return [{ tag: "div[data-callout]" }]
  },

  // Up from the start of a callout that opens the note makes a line above
  // it: otherwise nothing can ever be written before it.
  addKeyboardShortcuts() {
    return {
      ArrowUp: ({ editor }) => {
        const { state } = editor
        const { $from, empty } = state.selection
        const first = state.doc.firstChild
        if (!empty || first?.type.name !== this.name || $from.parentOffset !== 0) return false
        // The caret's block is the callout's first, and the callout is the note's first.
        if ($from.depth < 2 || $from.index(0) !== 0 || $from.index(1) !== 0) return false
        return editor.chain().insertContentAt(0, { type: "paragraph" }).setTextSelection(1).run()
      },
    }
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, { "data-callout": "", class: "tiptap-callout" }),
      0,
    ]
  },

  /**
   * A blockquote, which is the nearest thing markdown has to an aside, with
   * the icon at the front of it. Without this the serializer has no renderer
   * for the node and writes an empty string: the callout and everything
   * inside it left the document silently.
   */
  renderMarkdown(node, { renderChildren }): string {
    const body = `${node.attrs?.icon ?? ""} ${renderChildren(node, "\n\n")}`.trim()
    return body
      .split("\n")
      .map((line) => `> ${line}`.trimEnd())
      .join("\n")
  },

  addNodeView() {
    return ReactNodeViewRenderer(CalloutView)
  },

  /**
   * Obsidian's own way in: `> [!tip] ` at the start of a line, or `[!warning] `
   * on its own, becomes a callout of that type, its icon and colour with it.
   */
  addInputRules() {
    return [
      new InputRule({
        find: /^\[!(\w+)\][+-]?\s$/,
        handler: ({ range, match, chain }) => {
          const [icon, color] = TYPES[match[1].toLowerCase()] ?? TYPES.note
          chain().deleteRange(range).lift("blockquote").wrapIn(this.name, { icon, color }).run()
        },
      }),
    ]
  },

  addCommands() {
    return {
      toggleCallout:
        () =>
        ({ commands }) =>
          commands.toggleWrap(this.name),
    }
  },
})
