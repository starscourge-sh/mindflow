import { Extension, type Editor } from "@tiptap/core"
import { vimPluginKey } from "@/extensions/vim-mode"

/** Where Tab has a job of its own: a list item goes in a level, a table moves a cell, a code block takes a tab. */
const OWN_TAB = /^(listItem|taskItem|tableCell|tableHeader|codeBlock)$/

/**
 * Whether Tab has no job of its own where the caret is: not in a list, a table or a code block (their own keys take
 * it), and with Vim on only while writing. Such a Tab stays in the note (TabStays, VimTabStays), unless something on
 * show offers to take it: quick capture's "Helps answer … · Add ⇥" (box-offers.tsx).
 */
export function spareTab(editor: Editor): boolean {
  if (!editor.isEditable) return false
  const vim = vimPluginKey.getState(editor.state)
  if (vim?.enabled && vim.mode !== "insert") return false
  const { $from, $to } = editor.state.selection
  for (const $at of [$from, $to]) for (let depth = $at.depth; depth > 0; depth--) if (OWN_TAB.test($at.node(depth).type.name)) return false
  return true
}

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
    const stay = (): boolean => !vimPluginKey.getState(this.editor.state)?.enabled && spareTab(this.editor)
    return { Tab: stay, "Shift-Tab": stay }
  },
})
