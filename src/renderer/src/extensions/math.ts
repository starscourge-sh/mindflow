import { mergeAttributes } from "@tiptap/core"
import { BlockMath, InlineMath } from "@tiptap/extension-mathematics"

/**
 * A formula in a line, as `$...$` in Markdown, by pandoc's rule: the opening
 * `$` has a letter or sign right after it, the closing one has one right
 * before it, and no digit follows the close. So "$20 and $500" is money, not
 * a formula that swallows " and " and leaves both amounts out of the note;
 * `$x^2$` and `$20$` are still formulas, because they say so.
 */
const INLINE = /^\$(?![\s$])((?:\\\$|[^$\n])*?[^\s\\$])\$(?!\d)/

/**
 * Formulas whose words are still words: copied, dragged out or counted, a
 * formula gives its own text. The extension's own gave nothing, so copying
 * "defaults to 20" came out as "defaults to ".
 */
export const InlineFormula = InlineMath.extend({
  renderText: ({ node }) => String(node.attrs.latex ?? ""),
  renderHTML: ({ node, HTMLAttributes }) => [
    "span",
    mergeAttributes(HTMLAttributes, { "data-type": "inline-math" }),
    String(node.attrs.latex ?? ""),
  ],
  markdownTokenizer: {
    name: "inlineMath",
    level: "inline",
    start: (src: string) => src.indexOf("$"),
    tokenize: (src: string) => {
      const match = INLINE.exec(src)
      if (!match || match[0].startsWith("$$")) return undefined
      return { type: "inlineMath", raw: match[0], latex: match[1].trim() }
    },
  },
})

export const BlockFormula = BlockMath.extend({
  renderText: ({ node }) => String(node.attrs.latex ?? ""),
  renderHTML: ({ node, HTMLAttributes }) => [
    "div",
    mergeAttributes(HTMLAttributes, { "data-type": "block-math" }),
    String(node.attrs.latex ?? ""),
  ],
})
