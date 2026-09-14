import { BubbleMenu } from "@tiptap/react/menus"
import { CellSelection } from "@tiptap/pm/tables"
import type { Editor } from "@tiptap/react"

/**
 * Row and column controls, shown only while the cursor is inside a table.
 *
 * Words rather than symbols: every one of these is destructive or structural,
 * and a glyph nobody recognises is worse than a slightly wider menu.
 */
export function TableMenu({ editor }: { editor: Editor | null }) {
  if (!editor) return null

  const actions: [label: string, title: string, run: () => void][] = [
    ["+ Row", "Add a row below", () => editor.chain().focus().addRowAfter().run()],
    ["− Row", "Delete this row", () => editor.chain().focus().deleteRow().run()],
    ["+ Col", "Add a column to the right", () => editor.chain().focus().addColumnAfter().run()],
    ["− Col", "Delete this column", () => editor.chain().focus().deleteColumn().run()],
    ["Header", "Turn the first row into a header", () => editor.chain().focus().toggleHeaderRow().run()],
    ["Merge", "Merge the selected cells, or split a merged one", () => editor.chain().focus().mergeOrSplit().run()],
    ["Delete table", "Remove the whole table", () => editor.chain().focus().deleteTable().run()],
  ]

  return (
    <BubbleMenu
      editor={editor}
      // Shares the default key with the selection menu otherwise.
      pluginKey="tableMenu"
      // Only with the cursor parked in a cell: selecting text inside a table
      // is a request to format it, and the selection menu takes that.
      shouldShow={({ editor: instance, state }) =>
        instance.isActive("table") &&
        (state.selection.empty || state.selection instanceof CellSelection)
      }
      className="tiptap-table-menu"
    >
      {actions.map(([label, title, run]) => (
        <button key={title} type="button" title={title} onClick={run}>
          {label}
        </button>
      ))}
    </BubbleMenu>
  )
}
