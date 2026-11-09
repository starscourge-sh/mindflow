import { Node, mergeAttributes } from "@tiptap/core"
import { ReactNodeViewRenderer } from "@tiptap/react"

import { GraphView } from "@/components/graph/graph-view"
import { captioned } from "@/extensions/caption"
import { graphFromMarkdown, graphToMarkdown, newLine } from "@/lib/graph-math"

const json = (name: string, fallback: unknown) => ({
  default: fallback,
  // By hand: the default renderer would store an object as "[object Object]".
  parseHTML: (element: HTMLElement) => {
    try {
      return JSON.parse(element.getAttribute(name) ?? "") ?? fallback
    } catch {
      return fallback
    }
  },
  renderHTML: (attrs: Record<string, unknown>) => ({ [name]: JSON.stringify(attrs[name.slice(5)]) }),
})

/**
 * A graph of formulas, as on Desmos: lines of math, a slider for every free
 * letter, and the plot drawn under them. All of it rides on the node as plain
 * values, so it travels with the note, works offline, and copies whole.
 */
export const Graph = Node.create({
  name: "graph",
  group: "block",
  atom: true,
  // Not `draggable`: the plot is panned by dragging. The grip in the gutter moves the block.

  addAttributes() {
    return {
      expressions: json("data-expressions", []),
      sliders: json("data-sliders", {}),
      view: json("data-view", null),
      height: {
        default: 320,
        parseHTML: (element) => Number(element.getAttribute("data-height")) || 320,
        renderHTML: ({ height }) => ({ "data-height": String(height) }),
      },
      // The pictures' widths: 35%, 60% or the column's.
      width: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-width"),
        renderHTML: ({ width }) => (width ? { "data-width": width } : {}),
      },
    }
  },

  parseHTML() {
    return [{ tag: "div[data-graph]" }]
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-graph": "" })]
  },

  renderText: ({ node }) => (node.attrs.expressions as Array<{ text: string }>).map((one) => one.text).filter(Boolean).join("\n"),

  renderMarkdown: (node) => captioned(graphToMarkdown(node.attrs?.expressions ?? [], node.attrs?.sliders ?? {}, node.attrs?.view ?? null, { width: node.attrs?.width, height: node.attrs?.height }), node),

  markdownTokenizer: {
    name: "graph",
    level: "block",
    start: (src: string) => src.search(/^ {0,3}```graph[ \t]*$/m),
    tokenize: (src: string) => {
      const match = /^ {0,3}```graph[ \t]*\n([\s\S]*?)\n? {0,3}```[ \t]*(?:\n|$)/.exec(src)
      return match ? { type: "graph", raw: match[0], text: match[1] } : undefined
    },
  },
  parseMarkdown: (token, helpers) => {
    const read = graphFromMarkdown(String(token.text ?? ""))
    return helpers.createNode("graph", { ...read, expressions: read.expressions.length ? read.expressions : [newLine(0)] })
  },

  addNodeView() {
    return ReactNodeViewRenderer(GraphView, {
      // The plot pans and zooms, and the lines are fields: their keys and
      // pointers are theirs. The frame around them still selects the block.
      stopEvent: ({ event }) => (event.target as HTMLElement | null)?.closest?.(".mf-graph-plot, .mf-graph-lines, .mf-graph-tools") != null,
      ignoreMutation: () => true,
    })
  },
})
