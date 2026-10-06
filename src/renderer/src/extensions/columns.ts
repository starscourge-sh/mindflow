import { Node, type JSONContent } from "@tiptap/core"

/**
 * One column: any blocks at all. `isolating` so Backspace at its start does
 * not pull its words into the column beside it.
 */
export const Column = Node.create({
  name: "column",
  content: "block+",
  isolating: true,

  parseHTML() {
    return [{ tag: "div[data-column]" }]
  },

  renderHTML() {
    return ["div", { "data-column": "", class: "mf-column" }, 0]
  },

  renderMarkdown(node, { renderChildren }) {
    return renderChildren(node, "\n\n")
  },
})

/** The marks Markdown is written with: comments, so anywhere else it reads as sections one after another. */
const OPEN = "<!-- columns -->"
const SPLIT = "<!-- column -->"
const CLOSE = "<!-- /columns -->"

/**
 * Blocks side by side. Markdown has no columns, so a row is written as its
 * sections between comment marks that only Vigil reads. The outer element is
 * what the stylesheet measures, so a narrow pane stacks them.
 */
export const Columns = Node.create({
  name: "columns",
  group: "block",
  content: "column+",
  isolating: true,
  draggable: true,

  parseHTML() {
    return [{ tag: "div[data-columns]", contentElement: ".mf-columns-row" }]
  },

  renderHTML() {
    return ["div", { "data-columns": "", class: "mf-columns" }, ["div", { class: "mf-columns-row" }, 0]]
  },

  markdownTokenizer: {
    name: "columns",
    level: "block",
    start: (src: string) => src.indexOf(OPEN),
    tokenize: (src, _tokens, lexer) => {
      const match = /^ {0,3}<!-- columns -->[ \t]*\n([\s\S]*?)\n[ \t]*<!-- \/columns -->[ \t]*(?:\n|$)/.exec(src)
      if (!match) return undefined
      const columns = match[1].split(/^[ \t]*<!-- column -->[ \t]*$/m).map((part) => ({ tokens: lexer.blockTokens(part.trim()) }))
      return { type: "columns", raw: match[0], columns }
    },
  },

  parseMarkdown: (token, helpers) =>
    helpers.createNode(
      "columns",
      {},
      (token.columns as Array<{ tokens: never[] }>).map((column) => {
        const content = helpers.parseChildren(column.tokens)
        return helpers.createNode("column", {}, content.length ? content : [{ type: "paragraph" }])
      }),
    ),

  renderMarkdown(node, { renderChildren }) {
    const columns = (node.content ?? []).map((column: JSONContent) => renderChildren(column, "\n\n"))
    return [OPEN, columns.join(`\n\n${SPLIT}\n\n`), CLOSE].join("\n\n")
  },
})

/** A row of `count` empty columns, for `/columns`. */
export const emptyColumns = (count: number): JSONContent => ({
  type: "columns",
  content: Array.from({ length: count }, () => ({ type: "column", content: [{ type: "paragraph" }] })),
})
