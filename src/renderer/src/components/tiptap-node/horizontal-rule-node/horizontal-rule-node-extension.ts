import { InputRule, mergeAttributes } from "@tiptap/react"
import TiptapHorizontalRule from "@tiptap/extension-horizontal-rule"

/** The pattern the extension ships with, kept here so the rule can be replaced. */
const DIVIDER = /^(?:---|—-|___\s|\*\*\*\s)$/

/** The bullet and the checkbox: the things a rule has to climb out of. */
const LIST_ITEMS = ["listItem", "taskItem"]

export const HorizontalRule = TiptapHorizontalRule.extend({
  renderHTML() {
    return [
      "div",
      mergeAttributes(this.options.HTMLAttributes, { "data-type": this.name }),
      ["hr"],
    ]
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
   */
  addInputRules() {
    return [
      new InputRule({
        find: DIVIDER,
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
          run.setHorizontalRule().run()
        },
      }),
    ]
  },
})

export default HorizontalRule
