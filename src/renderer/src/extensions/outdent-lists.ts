import { Extension } from "@tiptap/core"

/** A bullet, a number, a checkbox. */
const ITEMS = ["listItem", "taskItem"]

/**
 * Shift-Tab on a selection covering more than one level.
 *
 * `liftListItem` resolves its range with `blockRange`, which finds the
 * outermost list the selection touches. Sweep across a parent bullet and its
 * children and that lands on the top-level list, where the lift has no single
 * target and gives up - so a selection that plainly means "bring these
 * children out one level" does nothing at all.
 *
 * The children are what was meant, so the selection is narrowed to the deepest
 * items in it and the ordinary lift runs on those. A selection already at one
 * level falls through untouched: that is what the ordinary lift is for.
 */
export const OutdentLists = Extension.create({
  name: "outdentLists",
  // Ahead of the list extension's own Shift-Tab, which this falls back to.
  priority: 200,

  addKeyboardShortcuts() {
    return {
      "Shift-Tab": () => {
        const { state } = this.editor
        const { from, to } = state.selection

        // `resolve(pos).depth` is the item's parent, which is the same footing
        // for every item here, so it compares exactly as the item's own would.
        const items: { from: number; to: number; name: string; depth: number }[] = []
        state.doc.nodesBetween(from, to, (node, pos) => {
          if (ITEMS.includes(node.type.name)) {
            items.push({
              from: pos + 1,
              to: pos + node.nodeSize - 1,
              name: node.type.name,
              depth: state.doc.resolve(pos).depth,
            })
          }
          return true
        })
        if (!items.length) return false

        const deepest = Math.max(...items.map((item) => item.depth))
        const level = items.filter((item) => item.depth === deepest)
        if (level.length === items.length) return false

        // One chain, so a lift that cannot apply leaves the selection alone
        // rather than quietly moving it and doing nothing else.
        return this.editor
          .chain()
          .setTextSelection({ from: level[0].from, to: level[level.length - 1].to })
          .liftListItem(level[0].name)
          .run()
      },
    }
  },
})
