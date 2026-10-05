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
      // Obsidian's three: its type ("warning"), the title on its first line,
      // and whether it folds: "-" folded, "+" open but foldable, "" neither.
      type: {
        default: "",
        parseHTML: (element) => element.getAttribute("data-callout-type") ?? "",
        renderHTML: ({ type }) => (type ? { "data-callout-type": type } : {}),
      },
      title: {
        default: "",
        parseHTML: (element) => element.getAttribute("data-title") ?? "",
        renderHTML: ({ title }) => (title ? { "data-title": title } : {}),
      },
      fold: {
        default: "",
        parseHTML: (element) => element.getAttribute("data-fold") ?? "",
        renderHTML: ({ fold }) => (fold ? { "data-fold": fold } : {}),
      },
    }
  },

  /**
   * Obsidian's own callout, `> [!warning]- Title` and its `>` lines, read as
   * one of these rather than as a quote with the marker in its words.
   */
  markdownTokenizer: {
    name: "callout",
    level: "block",
    start: (src: string) => src.search(/^ {0,3}> ?\[![\w-]+\]/m),
    tokenize: (src, _tokens, lexer) => {
      const match = /^ {0,3}> ?\[!([\w-]+)\]([+-]?)[ \t]*(.*)(?:\n|$)((?: {0,3}>.*(?:\n|$))*)/.exec(src)
      if (!match) return undefined
      const inside = match[4].replace(/\n$/, "").split("\n").map((line) => line.replace(/^ {0,3}> ?/, "")).join("\n")
      return { type: "callout", raw: match[0], kind: match[1].toLowerCase(), fold: match[2], title: match[3].trim(), tokens: lexer.blockTokens(inside) }
    },
  },
  parseMarkdown: (token, helpers) => {
    const kind = String(token.kind ?? "note")
    const [icon, color] = TYPES[kind] ?? TYPES.note
    const content = helpers.parseChildren(token.tokens ?? [])
    // With no title of its own, Obsidian heads it with its type.
    const title = String(token.title ?? "").replace(/[*_`]/g, "") || kind[0].toUpperCase() + kind.slice(1)
    return helpers.createNode("callout", { icon, color, type: kind, title, fold: token.fold ?? "" }, content.length ? content : [{ type: "paragraph" }])
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
    // One that came from Obsidian goes back the way it came.
    const { type, fold, title } = (node.attrs ?? {}) as Record<string, string>
    const head = type ? `[!${type}]${fold ?? ""}${title ? ` ${title}` : ""}\n` : `${node.attrs?.icon ?? ""} `
    const body = `${head}${renderChildren(node, "\n\n")}`.trim()
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
