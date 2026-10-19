import { InputRule, mergeAttributes } from "@tiptap/react"
import TiptapHorizontalRule from "@tiptap/extension-horizontal-rule"

/** The pattern the extension ships with, kept here so the rule can be replaced. */
const DIVIDER = /^(?:---|—-|___\s|\*\*\*\s)$/

/**
 * `===` on a line of its own: the ribbon, the way `---` is the plain line.
 * Exactly three, alone on the line, so `==highlight==` never meets it. Input
 * rules do not run in code, so a line of `===` in a code block stays text.
 */
const RIBBON = /^===$/

/** How a divider is drawn. No value is the plain line, so every old note is unchanged. */
export type DividerVariant = "ribbon" | null

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    dividerVariant: {
      /** A divider drawn as a strip of the theme's colours. */
      setRibbonRule: () => ReturnType
    }
  }
}

/** The bullet and the checkbox: the things a rule has to climb out of. */
const LIST_ITEMS = ["listItem", "taskItem"]

export const HorizontalRule = TiptapHorizontalRule.extend({
  addAttributes() {
    return {
      variant: {
        default: null,
        parseHTML: (element) => (element.getAttribute("data-variant") === "ribbon" ? "ribbon" : null),
        // A class too, so an HTML export can be styled without knowing the attribute.
        renderHTML: (attributes) =>
          attributes.variant === "ribbon" ? { "data-variant": "ribbon", class: "mf-ribbon" } : {},
      },
    }
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, { "data-type": this.name }),
      ["hr"],
    ]
  },

  addCommands() {
    return {
      ...this.parent?.(),
      // The plain command, then the rule it just put down is given its style:
      // the last rule before the caret, which is where that command leaves it.
      setRibbonRule:
        () =>
        ({ chain }) =>
          chain()
            .setHorizontalRule()
            .command(({ tr }) => {
              let at = -1
              tr.doc.nodesBetween(0, tr.selection.from, (node, pos) => {
                if (node.type.name === this.name && pos + node.nodeSize <= tr.selection.from) at = pos
              })
              if (at >= 0) tr.setNodeMarkup(at, undefined, { variant: "ribbon" })
              return at >= 0
            })
            .run(),
    }
  },

  /**
   * `---` in a bullet turns the whole bullet into a divider.
   *
   * The rule this replaces puts the line *inside* the item, which leaves a
   * marker with a short line beside it - not a shape anyone types three dashes
   * to get. `clearNodes` lifts the block out of the list first.
   *
   * Only for lists. Inside a quote a rule belongs to the quote, which is what
   * `> ---` means in markdown too, so that one is left where it lands.
   *
   * `===` is the same, drawn as the ribbon.
   */
  addInputRules() {
    return [DIVIDER, RIBBON].map(
      (find) =>
        new InputRule({
          find,
          handler: ({ chain, range, state }) => {
            const { $from } = state.selection
            let inList = false
            for (let depth = $from.depth; depth > 0; depth--) {
              if (LIST_ITEMS.includes($from.node(depth).type.name)) {
                inList = true
                break
              }
            }

            const run = chain().deleteRange(range)
            if (inList) run.clearNodes()
            if (find === RIBBON) run.setRibbonRule().run()
            else run.setHorizontalRule().run()
          },
        })
    )
  },
})
