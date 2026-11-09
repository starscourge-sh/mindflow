import { Extension } from "@tiptap/core"
import { vimPluginKey } from "@/extensions/vim-mode"

/** Where Tab has a job of its own: a list item goes in a level, a table moves a cell, a code block takes a tab. */
const OWN_TAB = /^(listItem|taskItem|tableCell|tableHeader|codeBlock)$/

/**
 * Tab and ⇧Tab never leave the words. In a list, a table or a code block
 * their own keys take them; anywhere else, with nothing to indent, they do
 * nothing at all, as in Notion, so the caret stays where it is and the next
 * word typed lands in the note, not on a button behind it.
 * With Vim on, VimTabStays decides instead (normal mode still goes to the title).
 */
export const TabStays = Extension.create({
  name: "tabStays",
  priority: 0,
  addKeyboardShortcuts() {
    const stay = (): boolean => {
      const { editor } = this
      if (!editor.isEditable || vimPluginKey.getState(editor.state)?.enabled) return false
      const { $from, $to } = editor.state.selection
      for (const $at of [$from, $to]) for (let depth = $at.depth; depth > 0; depth--) if (OWN_TAB.test($at.node(depth).type.name)) return false
      return true
    }
    return { Tab: stay, "Shift-Tab": stay }
  },
})
