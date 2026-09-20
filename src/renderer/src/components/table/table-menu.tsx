import { BubbleMenu } from '@tiptap/react/menus'
import { CellSelection } from '@tiptap/pm/tables'
import { useEffect, useReducer } from 'react'
import type { Editor } from '@tiptap/react'

import {
  cellAt,
  clearColumn,
  clearRow,
  duplicateColumn,
  duplicateRow,
  isPlain,
  sortByColumn
} from '@/lib/table'

/**
 * Held still at module scope. Rebuilt each render it re-registers the menu's
 * ProseMirror plugin, which is what closed the slash menu mid typing once.
 *
 * `size` is the one that matters here: the window is short, a column offers
 * nine things, and without a cap the last of them sat below the bottom edge
 * where they could not be reached at all.
 */
const POSITION = {
  placement: 'bottom-start',
  flip: true,
  shift: { padding: 8 },
  size: {
    padding: 8,
    apply: ({
      elements,
      availableHeight
    }: {
      elements: { floating: HTMLElement }
      availableHeight: number
    }) => {
      elements.floating.style.maxHeight = `${Math.max(140, availableHeight)}px`
    }
  }
} as const

/** A row of the menu, or a rule between groups. */
type Entry = [label: string, run: () => void] | null

/**
 * What you can do to the row or column you picked.
 *
 * Which entries show depends on what is selected, because the grips select a
 * whole row or column and that is what these act on. Moving is not here: the
 * grip that selected it also drags it, and two ways to do one thing is one too
 * many.
 *
 * Words rather than symbols: every one of these is destructive or structural,
 * and a glyph nobody recognises is worse than a slightly wider menu.
 */
function entries(editor: Editor): Entry[] {
  const chain = (): ReturnType<Editor['chain']> => editor.chain().focus()
  const at = cellAt(editor)
  // Checked, not cast: this runs on every render, including the ones where the
  // selection is ordinary text and there is no menu to show yet.
  const selection = editor.state.selection
  const cells = selection instanceof CellSelection ? selection : null

  // Sorting and duplicating rebuild the table from its cells, and a merged cell
  // covers ground in more than one row, so there is no single answer to where
  // it should land.
  const plain = isPlain(editor)
  const remove: Entry = ['Delete table', () => chain().deleteTable().run()]

  if (at && cells?.isColSelection()) {
    const { column } = at
    return [
      ['Insert column left', () => chain().addColumnBefore().run()],
      ['Insert column right', () => chain().addColumnAfter().run()],
      null,
      ...(plain
        ? ([
            ['Sort column A to Z', () => sortByColumn(editor, column, true)],
            ['Sort column Z to A', () => sortByColumn(editor, column, false)],
            null,
            ['Duplicate column', () => duplicateColumn(editor, column)],
            ['Clear column contents', () => clearColumn(editor, column)]
          ] as Entry[])
        : []),
      ['Delete column', () => chain().deleteColumn().run()],
      null,
      remove
    ]
  }

  if (at && cells?.isRowSelection()) {
    const { row } = at
    return [
      ['Insert row above', () => chain().addRowBefore().run()],
      ['Insert row below', () => chain().addRowAfter().run()],
      null,
      ...(plain
        ? ([
            ['Duplicate row', () => duplicateRow(editor, row)],
            ['Clear row contents', () => clearRow(editor, row)]
          ] as Entry[])
        : []),
      ['Toggle header row', () => chain().toggleHeaderRow().run()],
      ['Delete row', () => chain().deleteRow().run()],
      null,
      remove
    ]
  }

  // Cells picked by dragging across them, which is neither a row nor a column.
  return [['Merge or split cells', () => chain().mergeOrSplit().run()], null, remove]
}

export function TableMenu({ editor }: { editor: Editor | null }): React.JSX.Element | null {
  // The bubble re-renders when it is shown or hidden, not when the selection
  // moves inside it, so picking a different column left the old column's
  // entries on screen. Listening for the selection rather than for every
  // transaction: the wider subscription re-entered its own render and React
  // gave up on the depth.
  const [, recompute] = useReducer((count: number) => count + 1, 0)
  useEffect(() => {
    if (!editor) return
    editor.on('selectionUpdate', recompute)
    return () => {
      editor.off('selectionUpdate', recompute)
    }
  }, [editor])

  if (!editor) return null

  return (
    <BubbleMenu
      editor={editor}
      // Shares the default key with the selection menu otherwise.
      pluginKey="tableMenu"
      // Only once a grip has been used, or cells dragged across. A cursor
      // resting in a cell is someone typing, not someone asking for a menu.
      shouldShow={({ state }) => state.selection instanceof CellSelection}
      options={POSITION}
      className="tiptap-table-menu"
    >
      {entries(editor).map((entry, index) =>
        entry ? (
          <button key={entry[0]} type="button" onClick={entry[1]}>
            {entry[0]}
          </button>
        ) : (
          <hr key={`rule-${index}`} />
        )
      )}
    </BubbleMenu>
  )
}
