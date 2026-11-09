import { Extension } from "@tiptap/core"
import { vimPluginKey } from "@/extensions/vim-mode"

/**
 * Tab and ⇧Tab never leave the words. A list, a table, a code block or a
 * picker takes them first (their own keys run before these); with nothing to
 * indent, as in Notion, they do nothing at all, so the caret stays where it is
 * and the next word typed lands in the note, not on a button behind it.
 * With Vim on, VimTabStays decides instead (normal mode still goes to the title).
 */
export const TabStays = Extension.create({
  name: "tabStays",
  // After every other Tab in the editor.
  priority: 0,
  addKeyboardShortcuts() {
    const stay = (): boolean => this.editor.isEditable && !vimPluginKey.getState(this.editor.state)?.enabled
    return { Tab: stay, "Shift-Tab": stay }
  },
})
