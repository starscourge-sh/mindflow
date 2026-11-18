import { Extension } from "@tiptap/core"
import { TextSelection } from "@tiptap/pm/state"
import { indentLines, vimPluginKey } from "@/extensions/vim-mode"

/** A bullet, a number, a checkbox. */
const ITEMS = ["listItem", "taskItem"]
/** A bulleted, numbered or checked list. */
const LISTS = ["bulletList", "orderedList", "taskList"]

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
          // An item counts when the selection reaches its own first line, not
          // when it only holds the line the caret is on: the caret in a child
          // made its parent count too, and the lift threw it out of the list.
          const line = pos + 1 + (node.firstChild?.nodeSize ?? 0)
          if (ITEMS.includes(node.type.name) && from < line && to > pos + 1) {
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
      // Tab on the first item of a list that starts straight after another list (a bullet under "1. jh reported
      // issues:"): there is no item before it in its own list, so the ordinary indent did nothing at all. As in
      // Notion and Obsidian, the whole list goes in under the last item of the list above it.
      Tab: () => {
        const { state, view } = this.editor
        const { $from, empty, from, to, head } = state.selection
        // Picked lines in a list, Vim off: the same as with Vim on (vim-mode.ts indentLines). The picked lines go in
        // alone, the lines under them keep their level, and they stay picked so Tab can go again.
        if (!empty && !vimPluginKey.getState(state)?.enabled) {
          const inItem = (pos: number): boolean => {
            const $at = state.doc.resolve(pos)
            for (let depth = $at.depth; depth > 0; depth--) if (ITEMS.includes($at.node(depth).type.name)) return true
            return false
          }
          if (!inItem(from) && !inItem(to)) return false
          indentLines(view, from, to, false, head, true)
          return true
        }
        if (!empty) return false
        let depth = $from.depth
        while (depth > 0 && !ITEMS.includes($from.node(depth).type.name)) depth--
        if (depth < 2 || $from.index(depth - 1) !== 0) return false
        const list = $from.node(depth - 1)
        const at = $from.before(depth - 1)
        const above = state.doc.resolve(at).nodeBefore
        if (!above || !LISTS.includes(above.type.name) || !LISTS.includes(list.type.name)) return false
        // Inside the last item above, at its end: its close and the list's close are the two positions before `at`.
        const into = at - 2
        const tr = state.tr.delete(at, at + list.nodeSize).insert(into, list)
        tr.setSelection(TextSelection.create(tr.doc, into + ($from.pos - at)))
        view.dispatch(tr.scrollIntoView())
        return true
      },
    }
  },
})
